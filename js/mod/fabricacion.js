/* ============================================================================
   Calendario. Fue la pantalla que abría la app hasta septiembre de 2026; desde entonces abre
   el Tablero (js/mod/tablero.js) y esta es la segunda pestaña. Tres lentes sobre el mismo
   mes: TALLER, que contesta «¿qué se trabaja hoy y en qué voy tarde?», INSTALACIONES, que es
   la agenda de siempre y la única captura humana del sistema, y TODO, las dos juntas.

   Hasta septiembre de 2026 este archivo se llamaba agenda.js y era la tercera pestaña. La
   ruta sigue siendo «agenda» a propósito: cotizador.html publica `./#/agenda` en producción,
   mod/proyectos.js llama `ir('agenda')` y el manifiesto instalado tiene ese shortcut.
   Cambiar la cadena por estética costaría tocar producción para no ganar nada.

   ----- LO QUE ESTE ARCHIVO YA HACE (la lista de abajo nació como pendientes) -----
   La lente de Taller lee `Taller.ventanaTaller()` —js/datos/taller.js, con pruebas— y pinta
   la fila del taller: un renglón por proyecto ordenado por cuándo tiene que estar listo. Los
   seis puntos siguientes se escribieron como «lo que falta» y hoy están conectados; se dejan
   como mapa de qué hace cada pieza, no como pendientes (auditoría de septiembre de 2026):
     1. Corregir el plazo con un toque: la ficha `.cal-plazo` de cada renglón abre pf-pide
        con los cinco cubos y llama `Proyectos.actualizar(id, {plazo_k})`. Tocar el elegido
        lo suelta (null = manda el propuesto). Con aviso y «Deshacer», como todo lo demás.
     2. El mes de la lente Taller como mapa de VENCIMIENTOS: cada día pinta con `.cal-ev` lo
        que vence ese día —empezar, cortar, armar, listo— a partir de `hitos`. Máximo tres y
        «+N», igual que las instalaciones. La rejilla no se toca: una barra que cruce columnas
        no cabe en celdas de 76 px y en el teléfono son 39.
     3. `Taller.cargaDeDia()` en `Agenda.delMes()`, como `dias[].carga`, con UNA lectura por
        mes: ensanchar `desde` en PLAZO_TOPE_DIAS + 1 para atrapar lo que arrancó el mes
        anterior.
     4. La tarjeta que late —«Se ganó / No se dio», regla A6— sube aquí desde inicio.js, con
        `abrirGanar`/`abrirDescartar` tal cual. Es el eslabón que no existe en ningún otro
        sistema; sin ese toque este calendario está vacío por construcción. Y nada más late.
     5. La lente «Todo»: el calendario de instalaciones con la fila del taller debajo.
     6. La barra fija por rol: dirección «Decidir N cotizaciones» → «Agendar (N sin fecha)»;
        fabricación «Proponer un día»; pagos sin barra.

   Lo que la agenda ya tenía y se conserva entero —el punto de semáforo, el panel del día, la
   hoja de agendar, el .ics— vive en la lente de Instalaciones y no se tocó. Sus tres
   decisiones siguen valiendo:

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
import * as Taller from '../datos/taller.js';
import * as Cot from '../datos/cotizador.js';
import * as Material from '../datos/material.js';
import { masDias, masMeses, iniSemana, ultimoDia, diasEntre, MES_CORTO } from '../nucleo/fechas.js';
import { $, esc, ico, money, toast, voz, avisarResultado, vacio, hoyISO, partesISO, fechaLocal,
         fmtFecha, fmtFechaDia, fmtHora, cuando, diasHasta, segmento, chip, abrirCapa,
         cerrarCapa, compartirArchivo, copiarTexto, linkWa, ajustarAltoBarra, altoBarraAbajo, filaTaller,
         scrollSuave, conservandoFoco, repintarAlrededor }
  from '../nucleo/ui.js';

/* ----- Estado del módulo -----
   Vive aquí y no en el DOM: la rejilla se rehace completa en cada toque, y un estado
   guardado en atributos se iría con el nodo que lo llevaba. */
let _cont = null;
let _ctx = null;
/* La lente: qué parte del calendario se mira. Taller de entrada para dirección y
   fabricación; pagos aterriza en Instalaciones y no ve el segmentado, porque una ventana de
   taller no le dice nada que pueda accionar y un segmentado de una opción es un control mudo. */
let _lente = null;           // taller|instalaciones|todo — se decide en montar() por el rol
let _vista = 'mes';          // mes|semana|lista
let _ancla = hoyISO();       // el mes o la semana que se está viendo
let _dia = null;             // el día abierto debajo de la rejilla
let _d = null;               // lo último que se leyó
let _hoja = null;            // estado del panel de agendar
let _pide = null;            // estado del panel de preguntar
let _soloCobro = false;      // el filtro de PAGOS
let _pasadas = false;        // en la vista de lista, incluir lo que ya pasó
let _oyendo = false;
let _alTocar = null, _alTeclear = null;   // los manejadores envueltos con conservandoFoco()
let _cuentasVistas = false;  // la cinta de cuentas ya se pintó una vez en este montaje (F23)
let _diaRecien = false;      // el día abierto lo abrió un toque, no un repintado (F18)
let _firma = '';             // lo que NO depende del mes en el último pintado completo (F11)
let _gesto = null;           // el arrastre de la rejilla, para soltarlo al salir (F11)
let _nombres = null;         // la ficha de cada día con el ratón, para soltarla al salir (F26)

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
  /* La primera vez se decide por el rol y por la pantalla: en un monitor caben el calendario
     y la fila del taller lado a lado, así que ahí se abre «Todo»; en el teléfono, donde no
     caben, se abre Taller, que es la pregunta de la mañana. Después manda lo que la persona
     haya tocado, aunque cambie de módulo y vuelva. */
  if (!_lente) {
    const ancho = typeof matchMedia === 'function' && matchMedia('(min-width:1100px)').matches;
    _lente = Prefs.rol() === 'pagos' ? 'instalaciones' : (ancho ? 'todo' : 'taller');
  }
  if (Prefs.rol() === 'pagos') _lente = 'instalaciones';
  window.addEventListener('keydown', _alTeclear = conservandoFoco(alTeclear, _cont));

  /* Los atajos, escritos en el encabezado. Existían desde siempre —← → cambian de mes, `t`
     vuelve a hoy— y no estaban dichos en ningún sitio: un atajo que nadie sabe que existe es
     un atajo que nadie usa. Van al hueco de acciones del encabezado, que solo se pinta de
     760 px para arriba, y eso es exactamente lo correcto: es donde hay teclado. */
  if (_ctx && typeof _ctx.acciones === 'function') {
    _ctx.acciones(
      '<span class="pf-teclas">Teclas' +
      '<kbd>←</kbd><kbd>→</kbd><span>mes</span>' +
      '<kbd>t</kbd><span>hoy</span></span>');
  }

  /* Un oyente delegado por contenedor y uno por capa. La rejilla del mes son cuarenta y dos
     botones que se rehacen cada vez que se toca uno: un oyente por celda serían cuarenta y
     dos oyentes tirados a la basura en cada repintado, y los del repintado anterior siguen
     enganchados a nodos que ya nadie ve. */
  _cont.addEventListener('click', _alTocar = conservandoFoco(alTocar));
  const hoja = $('pf-hoja');
  if (hoja) { hoja.addEventListener('click', alTocarHoja); hoja.addEventListener('input', alEscribirHoja); }
  const pide = $('pf-pide');
  if (pide) pide.addEventListener('click', alTocarPide);
  _oyendo = true;
  _gesto = gestoDeLaRejilla(_cont);
  _nombres = fichaDeCadaDia(_cont);

  /* La base cerrada no se pinta como un calendario vacío. «No tienes instalaciones» y «la
     base no abrió» son la misma pantalla en blanco, y la diferencia entre las dos es la
     diferencia entre estar tranquilo y perder una tarde buscando datos que están enteros. */
  if (!DB.estado().ok) {
    _cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo',
      DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    return;
  }

  /* Lo que dejó el módulo anterior, ANTES de leer, para que la lectura ya salga con el mes
     correcto en vez de leer dos veces. */
  const pase = (ctx && ctx.recibir) ? ctx.recibir() : null;
  if (pase) {
    if (pase.lente === 'taller' || pase.lente === 'instalaciones' || pase.lente === 'todo') _lente = pase.lente;
    if (pase.vista === 'mes' || pase.vista === 'semana' || pase.vista === 'lista') _vista = pase.vista;
    if (pase.dia && /^\d{4}-\d{2}-\d{2}$/.test(pase.dia)) { _ancla = pase.dia; _dia = pase.dia; }
  }

  /* Sin «Leyendo el calendario…» aquí. El router quita su esqueleto —que tiene la forma de la
     pantalla— en cuanto la sección recibe un hijo, y este texto centrado lo tapaba al instante:
     se veía un renglón que luego saltaba a la pantalla real. Ahora el esqueleto se queda hasta
     que llega lo de verdad. */
  await recargar();

  /* Y la hoja de agendar CON EL PROYECTO YA ELEGIDO. Va después de `recargar()` porque
     `pintarPaso2` necesita la lista de los que no tienen fecha, que sale de esa lectura.
     Es el segundo salto que se quita: antes había que entrar a agendar y buscar el proyecto
     en una lista donde ya sabías cuál era. */
  if (pase && pase.hoja === 'agendar' && pase.proy) {
    if (!puedeAgendar()) {
      toast('Agendar es de dirección. Si te toca a ti, cambia de rol en Ajustes.', 'err', 4600);
    } else {
      /* Si el proyecto YA tiene instalación viva, esto no es agendar: es moverla, y va por
         «Mover de día», que arranca con la hora que tiene y no toca la ventana ni la
         duración. Es lo que manda el «Mover la fecha» del Tablero. Por la hoja de agendar,
         que arranca en blanco —sin hora, «De día», la duración sugerida—, cambiar solo el día
         borraba las 10:00 «De noche» y los 420 minutos que alguien había escrito, y el .ics
         salía de todo el día y sin la alarma de «sal ya». */
      const [viva] = await Agenda.listar({ proyecto_id: pase.proy, vivas: true });
      if (viva) abrirMover(viva);
      else {
        try { await pintarPaso2(pase.proy); } catch (_) { abrirAgendar(pase.dia || null); }
      }
    }
  }
}

/** El globo de la barra sin montar la pantalla: lo llama app.js al arrancar y después de
 *  cada sincronización, para que los pendientes se vean sin tener que entrar aquí. Solo lee;
 *  no pinta nada. */
export async function contar() {
  const d = await leer();
  return { agenda: d.sinFecha.length + d.vencidas.length };
}

export function desmontar() {
  if (_cont && _oyendo) _cont.removeEventListener('click', _alTocar);
  window.removeEventListener('keydown', _alTeclear);
  const hoja = $('pf-hoja');
  if (hoja) { hoja.removeEventListener('click', alTocarHoja); hoja.removeEventListener('input', alEscribirHoja); }
  const pide = $('pf-pide');
  if (pide) pide.removeEventListener('click', alTocarPide);
  if (_gesto) { _gesto.soltar(); _gesto = null; }
  if (_nombres) { _nombres.destruir(); _nombres = null; }
  /* La barra fija se limpia aquí y no en el módulo que sigue: si el siguiente no tiene
     acción principal, el botón de agendar se quedaría flotando encima de su pantalla y el
     primer dedo del día lo apretaría creyendo que es de lo que está viendo. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; b.classList.remove('cal-mbar'); ajustarAltoBarra(); }
  /* Las capas son del documento, no de este módulo. Si se cambió de rol con el panel de
     agendar enfrente, dejarlo puesto bloquea la pantalla nueva con un velo que nadie sabe
     de dónde salió. */
  if (_hoja) cerrarHoja();
  if (_pide) cerrarPide();
  _cont = null; _ctx = null; _d = null; _dia = null; _oyendo = false;
  _cuentasVistas = false; _diaRecien = false; _firma = '';
  /* Y el filtro de cobro se suelta. Su chip solo se pinta para el rol PAGOS, así que un usuario
     de pagos que lo encendía y cambiaba de rol se encontraba el calendario vacío —en fase 1
     `pago_pendiente` es null en todas las filas— sin ningún control en pantalla para apagarlo.
     Un filtro encendido sin su interruptor es una app rota que parece una app sin datos. */
  _soloCobro = false;
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

/* `masDias`, `masMeses`, `ultimoDia` e `iniSemana` vienen de `nucleo/fechas.js`. La razón por
   la que la semana empieza en LUNES está escrita allá, junto a la función. */

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

  /* Las ventanas de taller, solo cuando la lente las va a pintar. Una lectura de proyectos
     vivos, una de instalaciones vivas y una de constantes; la aritmética es pura y corre
     aquí, en el módulo, con el `hoy` de arriba —el mismo para todas las filas, para que no
     cambie a media pintada si se cruza la medianoche—. */
  d.ventanas = [];
  if (_lente !== 'instalaciones') {
    const [proys, insts, cts] = await Promise.all([
      Proyectos.listar({ vivos: true }),
      Agenda.listar({ vivas: true }),
      Material.constantes(),
    ]);
    const instDe = new Map();
    for (const i of (insts || [])) if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
    d.ventanas = (proys || [])
      .map(p => Taller.ventanaTaller(p, instDe.get(p.id) || null, { hoy, cts }))
      .filter(v => v.estado !== 'cancelado' && v.estado !== 'hecho');
  }

  /* El mes como mapa de VENCIMIENTOS: por cada día, qué le toca a qué proyecto —empezar,
     cortar, armar, dejar listo—. Sale de los hitos de las ventanas ancladas en una
     instalación; las que cuentan desde la venta son una hipótesis y van en la fila, no en la
     rejilla. Y la carga: cuántos trabajos tienen ese día adentro. Todo sobre lo ya leído:
     cero lecturas más. */
  d.vencen = new Map();
  d.carga = new Map();
  if (d.ventanas.length) {
    const QUE = [['en_diseno', 'empezar'], ['cortado', 'cortar'], ['armado', 'armar'], ['listo', 'listo']];
    for (const v of d.ventanas) {
      if (v.ancla !== 'instalacion') continue;
      for (const [h, que] of QUE) {
        const f = v.hitos[h]; if (!f) continue;
        if (!d.vencen.has(f)) d.vencen.set(f, []);
        d.vencen.get(f).push({ id: v.proyecto_id, titulo: v.titulo, que, tarde: v.atraso_dias > 0 && f < hoy });
      }
    }
    const dias = d.mes ? (d.mes.dias || []).map(x => x.fecha) : (d.rango ? [] : []);
    if (d.rango) for (let f = d.rango.ini; f <= d.rango.fin; f = masDias(f, 1)) dias.push(f);
    for (const f of dias) d.carga.set(f, Taller.cargaDeDia(f, d.ventanas));
  }

  /* Las cotizaciones autorizadas que nadie ha decidido —la regla A6—. Es lo que hay que
     contestar antes que nada: sin ese toque no hay proyecto, ni agenda, ni material, y este
     calendario está vacío por construcción. Solo dirección decide. */
  d.pendientes = [];
  if (Prefs.rol() === 'direccion') {
    const todos = await Proyectos.listar({});
    const ganados = new Set((todos || []).map(p => p.folio_global));
    d.pendientes = Cot.sinDecidir(ganados, 0);
  }
  return d;
}

/* `o.viaje` ('adelante' | 'atras') es un cambio de MES o de SEMANA: lo que cambia es el lienzo
   del calendario y viaja de lado (F11). Todo lo demás —un cambio de lente, de vista, una acción
   sobre una instalación— se repinta completo y sin viaje, como siempre. */
async function recargar(o = {}) {
  if (!_cont) return;
  const d = await leer();
  if (!_cont) return;        // se cambió de módulo mientras se leía
  _d = d;
  if (o.viaje) await viajar(o); else pintar();
}

/* ============================================================================
   Cambiar de mes o de semana: con ‹ ›, con el teclado y arrastrando (F11)
   ============================================================================ */

/* Lo que cambia con el periodo y lo que no. El mes nuevo reemplaza SOLO el lienzo (la rejilla, su
   nota y la lista del día) y las dos tarjetas que lo cuentan (las cuentas de arriba y «Bajar el
   mes»): la cabecera —el nombre del mes y sus flechas— se queda donde estaba, y con ella el foco
   de quien tocó ‹ o ›. Antes `pintar()` rehacía TODO con innerHTML, y el botón de mes que se
   acababa de usar dejaba de existir en cada toque; `conservandoFoco` lo devolvía después, pero
   quien navega con teclado veía el anillo irse y volver.

   Eso solo es válido mientras el resto de la pantalla no haya cambiado de verdad (una cuenta,
   una cotización por decidir, la lente). `firmaFija()` resume lo que NO depende del mes; si
   cambió desde el último pintado completo, se repinta todo y no se queda nada viejo. */
function firmaFija(d) {
  const sinTaller = _lente !== 'instalaciones' && !(d.ventanas || []).length
    ? (d.mes && d.mes.total ? 'm1' : 'm0') : '';
  return [d.hoy, d.sinFecha.length, d.vencidas.length, (d.pendientes || []).length,
          (d.ventanas || []).length, _lente, _vista, _soloCobro, _pasadas, sinTaller].join('|');
}

/** La clave de «en qué mes (o semana) estoy», para saber hacia dónde viaja un cambio. */
const clavePeriodo = iso => _vista === 'semana' ? iniSemana(iso) : String(iso).slice(0, 7);
/** La ancla a la que llevan `n` pasos de mes —o de semana, en esa vista— desde la actual. */
const anclaTrasPasos = n => _vista === 'semana' ? masDias(iniSemana(_ancla), n * 7) : masMeses(_ancla, n);

/** Lleva el calendario a otro periodo. La dirección sale de comparar el periodo de antes con el
 *  de después, no de qué control se tocó: ‹ ›, el gesto, RePág/AvPág y «hoy» pasan por aquí y
 *  los cinco enseñan el viaje del lado correcto. `focoDia` es el número del día que tenía el foco
 *  en la rejilla (RePág, ←, →): el mes nuevo lo recibe en el mismo número. */
async function irAlPeriodo(nueva, o = {}) {
  const antes = clavePeriodo(_ancla), despues = clavePeriodo(nueva);
  _ancla = nueva;
  _dia = null;
  await recargar(antes === despues ? {} : { viaje: despues > antes ? 'adelante' : 'atras', focoDia: o.focoDia });
}

function viajar(o) {
  const P = piezas();
  /* Con View Transitions `fn` corre en el cuadro SIGUIENTE, así que lo que depende del DOM nuevo
     —el foco al mismo número de día— va adentro. */
  const hacer = () => {
    if (!_cont) return;
    if (!repintarPeriodo()) pintar();
    if (o.focoDia) {
      const c = _cont.querySelector('.cal-dia[data-dia$="-' + p2(o.focoDia) + '"]');
      if (c) { try { c.focus({ preventScroll: true }); } catch (_) {} }
    }
  };
  if (!P.transicion || _vista === 'lista') { hacer(); return Promise.resolve(); }
  /* 200 ms y no los 320 de la pieza: el mes se cambia varias veces seguidas buscando una fecha, y
     una rejilla que tarda un tercio de segundo en llegar es una rejilla que estorba. Con menos
     movimiento la pieza solo corre `hacer`. */
  return P.transicion(hacer, { contenedor: '.cal-lienzo', direccion: o.viaje, duracion: 200 });
}

/** Repinta solo lo que depende del periodo. Contesta false si no puede hacerlo sin dejar algo
 *  viejo —otra vista, otra lente, una cuenta que cambió, un marcado que no es el esperado— y
 *  quien llama repinta todo. */
function repintarPeriodo() {
  const d = _d;
  const cuerpo = _cont && _cont.querySelector('.cal-card > .card-b');
  const cab = cuerpo && cuerpo.querySelector(':scope > .cal-cab');
  const lienzo = cuerpo && cuerpo.querySelector(':scope > .cal-lienzo');
  const cuentas = _cont && _cont.querySelector(':scope > .pf-cuentas');
  const exportar = _cont && _cont.querySelector(':scope > #cal-exportar');
  if (!d || !cab || !lienzo || !cuentas || !exportar || _vista === 'lista' || firmaFija(d) !== _firma) return false;
  const tmp = document.createElement('div');
  tmp.innerHTML = _vista === 'mes' ? pintarMes(d) : pintarSemana(d);
  const nuevo = tmp.querySelector(':scope > .cal-lienzo');
  const titulo = tmp.querySelector(':scope > .cal-cab .cal-mes');
  const mio = cab.querySelector('.cal-mes');
  if (!nuevo || !titulo || !mio) return false;
  mio.textContent = titulo.textContent;
  lienzo.replaceWith(nuevo);
  cuentas.outerHTML = pintarCuentas(d);
  exportar.outerHTML = pintarExportar(d);
  rodarCuentas();
  /* El nombre del mes nuevo, dicho: con el foco en ‹ no se mueve nada que el lector de pantalla
     vea, y «mes siguiente» sin respuesta es un botón que parece no hacer nada. */
  voz(titulo.textContent);
  return true;
}

/* ----- El gesto: arrastrar la rejilla a los lados -----
   El pulgar ya hace ese gesto en cualquier calendario del teléfono. Tres decisiones que salieron
   de la muestra y se conservan:

     · EL EJE SE DECIDE EN LOS PRIMEROS 8 PX. Más horizontal que vertical es nuestro; lo vertical
       es de la página (touch-action: pan-y en `.cal-lienzo`, que además hace que el navegador no
       se lleve el gesto horizontal). Si el dedo se va de lado, ya no se vuelve a decidir.
     · LA CAPTURA DEL PUNTERO SOLO CUANDO YA ES ARRASTRE. Capturar en pointerdown manda el clic al
       contenedor y tocar un día dejaba de abrirlo; con 8 px de holgura un toque es un toque. El
       clic que llega después de un arrastre se detiene en captura: soltar el dedo sobre un día
       no lo abre.
     · EL UMBRAL ES 48 PX. Menos regresa el lienzo a su sitio en 180 ms y no pasa nada.

   Solo dedo y lápiz. Con el ratón están las flechas, el teclado y el selector de arriba, y un
   arrastre con el botón apretado se parece demasiado a seleccionar texto en la lista del día.
   Y no con una capa abierta: el gesto de una hoja de abajo es otro. Mientras el dedo arrastra, el
   lienzo lo sigue —eso es la mano, no un adorno—, así que con menos movimiento también lo sigue;
   lo que se apaga es el regreso animado y el viaje del mes nuevo. */
const GESTO_PX = 8, GESTO_UMBRAL = 48;
function gestoDeLaRejilla(cont) {
  let id = null, x0 = 0, y0 = 0, dx = 0, arrastra = false, lienzo = null, suprimir = false, reloj = 0;
  const limpiar = l => { if (l) { l.style.transform = ''; l.style.opacity = ''; } };
  function alBajar(ev) {
    if (ev.pointerType === 'mouse' || ev.isPrimary === false || ev.button > 0) return;
    if (_vista === 'lista' || document.querySelector('.pf-modal-bg.show')) return;
    const en = ev.target.closest && ev.target.closest(_vista === 'mes' ? '.cal-rej' : '.cal-lienzo');
    const l = en && en.closest('.cal-lienzo');
    if (!l) return;
    lienzo = l; id = ev.pointerId; x0 = ev.clientX; y0 = ev.clientY; dx = 0; arrastra = false;
  }
  function alMover(ev) {
    if (ev.pointerId !== id) return;
    const mx = ev.clientX - x0, my = ev.clientY - y0;
    if (!arrastra) {
      if (Math.abs(mx) > GESTO_PX && Math.abs(mx) > Math.abs(my)) {
        arrastra = true;
        try { lienzo.setPointerCapture(id); } catch (_) {}
      } else {
        if (Math.abs(my) > GESTO_PX) id = null;       // lo vertical es de la página
        return;
      }
    }
    dx = mx;
    lienzo.style.transform = 'translateX(' + dx + 'px)';
    lienzo.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / 400));
  }
  function alSoltar(ev) {
    if (ev.pointerId !== id) return;
    id = null;
    if (!arrastra) return;
    arrastra = false;
    suprimir = true;
    clearTimeout(reloj);
    reloj = setTimeout(() => { suprimir = false; }, 60);
    const l = lienzo, de = dx;
    lienzo = null;
    if (ev.type !== 'pointercancel' && Math.abs(de) >= GESTO_UMBRAL) {
      limpiar(l);
      irAlPeriodo(anclaTrasPasos(de < 0 ? 1 : -1));
      return;
    }
    limpiar(l);
    const P = piezas();
    if (!l.isConnected || (P.sinMovimiento && P.sinMovimiento())) return;
    l.animate([{ transform: 'translateX(' + de + 'px)' }, { transform: 'none' }],
      { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  const alClic = ev => { if (suprimir) { ev.stopPropagation(); ev.preventDefault(); } };
  cont.addEventListener('pointerdown', alBajar);
  cont.addEventListener('pointermove', alMover);
  cont.addEventListener('pointerup', alSoltar);
  cont.addEventListener('pointercancel', alSoltar);
  cont.addEventListener('click', alClic, true);
  return {
    soltar() {
      clearTimeout(reloj);
      cont.removeEventListener('pointerdown', alBajar);
      cont.removeEventListener('pointermove', alMover);
      cont.removeEventListener('pointerup', alSoltar);
      cont.removeEventListener('pointercancel', alSoltar);
      cont.removeEventListener('click', alClic, true);
    },
  };
}

/* ----- Qué hay en un día sin abrirlo, con el ratón (F26) -----
   La respuesta completa de la celda —cuántas instalaciones, qué vence en el taller, el semáforo—
   vive en su `aria-label`, y con ratón la única manera de leerla era tocar la celda, lo que
   repinta la pantalla. La pieza `nombres` enseña ese mismo texto en una ficha sobre la celda: la
   primera espera 400 ms y, mientras el cursor siga por la rejilla, las siguientes salen sin espera
   (WarmTooltip). Es una pieza que ya existía y que ya sabe quedarse en el puntero fino: con el dedo
   no hace nada —el dedo tiene la lista del día— y con el teclado sale al enfocar una celda.
   La ficha no sustituye al toque: no recibe el puntero, y el clic sigue abriendo el día. Los puntos
   del `aria-label` se vuelven « · » y no saltos de línea: la pieza junta todo el espacio en blanco
   del nombre en uno solo (es un nombre de icono, de una línea), y un salto no sobreviviría; la hoja
   de estilos deja que el texto baje de renglón en vez de cortarlo. */
function fichaDeCadaDia(cont) {
  const P = piezas();
  if (!P.nombres) return null;
  return P.nombres(cont, { selector: '.cal-dia[data-dia]', siempre: true, toque: false,
    texto: el => String(el.getAttribute('aria-label') || '').replace(/\.\s+/g, ' · ') });
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
  /* La guarda del rol va aquí y no solo en desmontar: el reset arregla el caso de hoy, esto
     impide que el filtro pueda volver a existir sin el chip que lo apaga. */
  if (!_soloCobro || Prefs.rol() !== 'pagos') return l;
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

  /* La lente, el segmento de vista y los filtros, en UNA sola tira.
     Eran tres renglones apilados —«Taller · Instalaciones · Todo» a todo lo ancho, debajo
     «Mes · Semana · Lista», debajo los chips— y esos tres renglones medían 130 px de alto
     antes de que empezara el calendario: en un teléfono, media pantalla para llegar al mes.
     Y peor: apilados, cada uno se lee como si filtrara al de abajo, cuando son la misma
     pregunta hecha tres veces —qué parte de la agenda estoy mirando—.

     En una tira caben porque la lente y la vista son segmentos compactos, no barras. El
     `margin-left:auto` del CSS manda la vista a la derecha, que es donde la pone la maqueta. */
  const barra =
    '<div class="ag-barra">' +
      pintarLente() +
      '<div class="ag-barra-der">' +
        segmento([{ v: 'mes', t: 'Mes' }, { v: 'semana', t: 'Semana' }, { v: 'lista', t: 'Lista' }],
                 _vista, 'data-vista', 'Cómo ves las instalaciones') +
      '</div>' +
      pintarFiltros() +
    '</div>';

  const calendario =
    '<div class="card cal-card"><div class="card-b">' +
      (_vista === 'mes' ? pintarMes(d) : _vista === 'semana' ? pintarSemana(d) : pintarLista(d)) +
    '</div></div>';

  /* Tres lentes sobre el MISMO calendario. Instalaciones: la agenda de siempre. Taller: la
     rejilla con lo que vence cada día y la fila del taller —en el teléfono la fila primero,
     que es la pregunta de la mañana—. Todo: las dos clases de chips en la rejilla y la fila
     al lado. De 1 100 px para arriba, Taller y Todo van en dos columnas; abajo, uno debajo
     del otro. Mismo marcado en el monitor y en el teléfono: solo cambia dónde cae cada cosa. */
  _cont.innerHTML =
    pintarCuentas(d) +
    (d.pendientes.length ? pintarDecidir(d) : '') +
    barra +
    (_lente === 'instalaciones'
      ? calendario
      : '<div class="ag-cuerpo dos' + (_lente === 'taller' ? ' taller-primero' : '') + '">' +
          '<div class="ag-col">' + calendario + '</div>' + pintarTaller(d) + '</div>') +
    pintarExportar(d);

  _firma = firmaFija(d);
  pintarMbar(d);
  publicarCuentas(d);
  rodarCuentas();
}

/* ----- La tarjeta que late: «Se ganó / No se dio» -----
   Es el eslabón que no existe en ningún otro sistema —una cotización autorizada no dice en
   ninguna parte si se vendió— y sin ese toque este calendario está vacío por construcción.
   Por eso va arriba de todo y por eso es lo único de la plataforma que late (`.cand-partidas`,
   la forma que el cotizador usa para lo que pide una decisión antes de seguir). Nada más
   late: dos cosas latiendo son cero cosas latiendo. Vive también en «Hoy», con la misma
   forma; aquí está porque es donde su consecuencia se ve. */
function pintarDecidir(d) {
  const lista = d.pendientes || [];
  const n = lista.length;
  const veDinero = Prefs.veDinero();
  return '<div class="cand-partidas pf-decidir" id="ag-decidir">' +
    '<p class="cp-txt">' + ico('i-venta') + ' <b>' +
    (n === 1 ? 'Una cotización autorizada' : n + ' cotizaciones autorizadas') +
    '</b> sin decidir. Sin este toque no hay proyecto, ni ventana de taller, ni fecha: es lo único de esta pantalla que nadie más puede contestar.</p>' +
    lista.slice(0, 6).map(e => {
      const quien = [e.cliente, e.proy].filter(Boolean).join(' — ') || 'sin cliente';
      const total = veDinero ? Cot.totalVendido(e) : 0;
      return '<div class="pf-fila">' +
        '<span class="pf-fila-ico">' + ico('i-doc') + '</span>' +
        '<div class="pf-fila-tx">' +
          '<p class="pf-fila-t">' + esc(String(e.folio)) + ' · ' + esc(quien) + '</p>' +
          '<p class="pf-fila-d">' + (total > 0 ? esc(money(total)) + ' · ' : '') + 'autorizada ' + esc(cuando(isoDeSello(e.ts))) +
            (e.entrega ? ' · prometido: ' + esc(e.entrega) : '') + '</p>' +
        '</div>' +
        '<div class="pf-fila-acc">' +
          '<button type="button" class="btn btn-gho btn-ganar" data-decidir="ganar" data-folio="' + esc(String(e.folio)) + '">Se ganó</button>' +
          '<button type="button" class="btn btn-gho" data-decidir="descartar" data-folio="' + esc(String(e.folio)) + '">No se dio</button>' +
        '</div>' +
      '</div>';
    }).join('') +
    /* «Proyectos» y no «Hoy»: no hay ninguna pantalla que se llame así —la ruta `hoy` se
       pinta como «Tablero»— y, sobre todo, las que faltan sí están completas en Proyectos.
       «Qué atender» solo enseña las que llevan siete días sin decidir, así que mandar ahí a
       quien busca la séptima de hoy es mandarlo a una lista donde no está. */
    (n > 6 ? '<p class="pf-nota">Y ' + (n - 6) + ' más en Proyectos.</p>' : '') +
  '</div>';
}

/** Sello epoch → 'YYYY-MM-DD' local, para decir «hace 3 días» sin pasar por UTC. */
function isoDeSello(ts) {
  const n = Number(ts); if (!isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

/* ----- La lente -----
   Devuelve el segmento pelado, sin contenedor: lo coloca `.ag-barra`, que lo pone a la
   IZQUIERDA de la tira y manda el de vista a la derecha. Antes iba en su propio renglón y a
   ancho completo arriba del de vista, con el argumento de que son dos preguntas distintas
   —«qué miro» y «cómo lo miro»— y que apiladas la de arriba se lee como si filtrara a la de
   abajo. Apiladas pasaba justo eso, y encima costaban tres renglones de alto antes del
   calendario. En una tira, separadas por el hueco y con la de vista pegada al otro extremo,
   se leen como dos controles y no como uno dentro del otro.
   Pagos no la ve: con una sola lente no hay nada que elegir. */
function pintarLente() {
  if (Prefs.rol() === 'pagos') return '';
  return segmento([{ v: 'taller', t: 'Taller' }, { v: 'instalaciones', t: 'Instalaciones' }, { v: 'todo', t: 'Todo' }],
                  _lente, 'data-lente', 'Qué parte del calendario ves');
}

/* ----- La fila del taller -----
   Un renglón por proyecto, ordenado por cuándo tiene que estar listo. La barra de una a tres
   semanas NO se dibuja sobre la rejilla del mes: en celdas de 76 px —39 en el teléfono— no
   cabe, y partir la rejilla para meterle una capa es el cambio más caro y frágil del plan.
   Aquí cabe entera, con su pista, y se lee en un teléfono, que es donde se va a leer. Es la
   misma decisión que la vista de semana ya tomó: «siete columnas de 45 px, y ahí no cabe una
   hora ni un nombre». */
/* `VERBO_TALLER`, `TONO_TALLER`, `corta()` y `filaTaller()` viven en nucleo/ui.js: el mismo
   renglón lo pinta el Tablero, y con una copia aquí los dos habrían divergido. */

function pintarTaller(d) {
  const vs = (d.ventanas || []).slice().sort((a, b) => {
    /* Lo que ya va tarde primero; después por el día en que tiene que estar listo; lo que
       no tiene fecha, al final, con su reloj corriendo. */
    const ta = a.atraso_dias > 0 ? 0 : 1, tb = b.atraso_dias > 0 ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return String(a.listo || '9999') < String(b.listo || '9999') ? -1 : 1;
  });

  if (!vs.length) {
    if (!d.sinFecha.length && !vs.length && !(d.mes && d.mes.total)) {
      return vacio('Todavía no hay nada que fabricar',
        'Cuando marques una cotización como ganada en el cotizador, el proyecto aparece aquí con su ventana de taller y su día de instalación. Es el único toque que la plataforma te pide.',
        '<a class="btn btn-pri" href="#/cotizador">Abrir el Cotizador</a>');
    }
    return vacio('Nada en el taller',
      'Lo que hay este mes ya está listo o instalado. En «Instalaciones» lo ves con su día.',
      '<button type="button" class="btn btn-gho pf-btn-corto" data-lente="instalaciones">Ver las instalaciones</button>');
  }

  const conFecha = vs.filter(v => v.ancla === 'instalacion');
  const sinFecha = vs.filter(v => v.ancla !== 'instalacion');
  let html = '<div class="card"><div class="card-b">';
  if (conFecha.length) {
    html += '<div class="ag-grupo">' + ico('i-taller') + 'En el taller <span class="n">' + conFecha.length + '</span></div>' +
            conFecha.map(v => filaTaller(v, d.hoy, { plazoEditable: puedeCorregirPlazo(),
              accionesHTML: accionAnidar(v) })).join('');
  }
  if (sinFecha.length) {
    html += '<div class="ag-grupo">' + ico('i-reloj') +
      (sinFecha.length === 1 ? 'Ganado sin fecha, con el reloj corriendo' : 'Ganados sin fecha, con el reloj corriendo') +
      ' <span class="n">' + sinFecha.length + '</span></div>' +
            sinFecha.map(v => filaTaller(v, d.hoy, { plazoEditable: puedeCorregirPlazo(),
              accionesHTML: accionAnidar(v) })).join('');
  }
  return html + '</div></div>';
}

/* De aquí a la mesa de corte, con el proyecto puesto. Es el paso que el taller da de verdad
   —lo que hay que cortar se acomoda en la lámina antes de cortarlo— y hasta ahora era una
   pestaña nueva del navegador. Solo en las etapas en que tiene sentido: acomodar piezas de
   algo que ya se armó no es un paso, es una distracción. */
function accionAnidar(v) {
  if (v.etapa_real !== 'ganado' && v.etapa_real !== 'en_diseno') return '';
  return '<button type="button" class="btn btn-gho pf-btn-corto" data-anidar="' +
    esc(v.proyecto_id || '') + '">Acomodar en la lámina</button>';
}

/* ----- Las cuentas de arriba -----
   Lo primero que se lee al entrar: «6 por instalar · 2 sin fecha» contesta la pantalla
   entera antes de mirar la rejilla. */
function pintarCuentas(d) {
  const hoy = d.hoy;
  const todas = d.mes ? (d.mes.dias || []).flatMap(x => x.instalaciones || []) : d.filas;
  /* «Por instalar» es lo que falta instalar: ni las canceladas ni las ya hechas. Con las
     hechas dentro, marcar «Ya se instaló» en una de hoy no bajaba la cuenta. */
  const porVenir = visibles(todas).filter(i => i.fecha >= hoy && i.estado !== 'cancelada' && i.estado !== 'hecha').length;

  const c = [];
  if (_lente !== 'instalaciones' && d.ventanas) {
    const enTaller = d.ventanas.filter(v => v.ancla === 'instalacion' && v.empezar <= hoy && v.listo >= hoy).length;
    const tarde = d.ventanas.filter(v => v.atraso_dias > 0).length;
    c.push(unaCuenta(enTaller, 'En el taller hoy', false, 'taller'));
    if (tarde) c.push(unaCuenta(tarde, tarde === 1 ? 'Va tarde' : 'Van tarde', true, 'tarde'));
  }
  c.push(unaCuenta(porVenir, _vista === 'mes' ? 'Por instalar este mes' : 'Por instalar', false, 'instalar'));
  c.push(unaCuenta(d.sinFecha.length,
    d.sinFecha.length === 1 ? 'Ganado sin fecha' : 'Ganados sin fecha', d.sinFecha.length > 0, 'sinfecha'));
  if (d.vencidas.length) c.push(unaCuenta(d.vencidas.length,
    d.vencidas.length === 1 ? 'Ya pasó y nadie la marcó' : 'Ya pasaron y nadie las marcó', true, 'vencidas'));
  return '<div class="pf-cuentas">' + c.join('') + '</div>';
}

/* `data-cuenta` es la CLAVE de la cifra y no su rótulo: «Ganado sin fecha» y «Ganados sin fecha»
   son la misma cuenta, y la rueda tiene que seguirla a través del cambio de número. */
const unaCuenta = (n, txt, urge, clave) =>
  '<p class="pf-cuenta' + (urge ? ' urge' : '') + '"><b' + (clave ? ' data-cuenta="' + clave + '"' : '') + '>' + n + '</b>' + esc(txt) + '</p>';

/* ----- Las cuentas ruedan cuando cambian (F23) -----
   Después de agendar, «Ganados sin fecha 3 → 2» cambiaba de golpe en medio de un repintado
   completo y se pasaba por alto, justo la cifra que se vino a leer. La pieza `rodarCifra` recuerda
   el último valor de cada cifra por su `clave` —que sobrevive al innerHTML, y esta cinta se rehace
   en cada toque— y hace rodar solo la que cambió; la que no cambió no se toca. Dos cuidados que
   son de aquí:

     · NUNCA en el primer pintado del montaje (`animar` es falso hasta que la cinta se pintó una
       vez): entrar al Calendario no es un cambio, y cuatro cifras girando al abrir son ruido. La
       pieza igual recuerda lo pintado, así que lo que cambie después sí rueda desde ahí.
     · el elemento es el `<b>` de siempre, solo con su número: la pieza deja el texto final desde
       el primer cuadro (el lector de pantalla y las pruebas leen la cifra de verdad) y no cambia
       el tamaño de la caja. */
function rodarCuentas() {
  const P = piezas();
  const animar = _cuentasVistas;
  _cuentasVistas = true;
  if (!P.rodarCifra || !_cont) return;
  for (const b of _cont.querySelectorAll('.pf-cuentas b[data-cuenta]')) {
    P.rodarCifra(b, b.textContent, { clave: 'calendario:' + b.dataset.cuenta, animar });
  }
}

/* La pieza se pide en el momento: es un guion clásico que index.html carga antes que este módulo,
   pero una prueba de node que importe esta pantalla no tiene `window`. */
const piezas = () => (typeof window !== 'undefined' && window.Piezas) || {};

function pintarFiltros() {
  const c = [];
  /* El filtro de cobro solo existe para PAGOS, y arranca APAGADO. `pago_pendiente` es una
     fórmula de Notion y en fase 1 está en null en todas las filas: encendido por default,
     pagos abriría la agenda, vería un calendario en blanco y sacaría la conclusión obvia
     —«no hay nada agendado»— que además es falsa. */
  if (Prefs.rol() === 'pagos') c.push(chip('Solo los días con cobro', _soloCobro, 'data-cobro="1"'));
  if (_vista === 'lista') c.push(chip('Incluir lo que ya pasó', _pasadas, 'data-pasadas="1"'));
  return c.join('');
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
      nav(-1, 'Mes anterior') + nav(1, 'Mes siguiente') +
    '</div>' +
    /* Todo lo que cambia con el mes va dentro del lienzo, y la cabecera se queda fuera: el
       lienzo es lo que se arrastra con el dedo y lo que viaja de lado al cambiar de mes (F11),
       y `.cal-cab` —el nombre del mes y sus flechas— se queda quieta, con el foco donde
       estaba. */
    '<div class="cal-lienzo">' +
      '<div class="cal-rej">' +
        DOW.map(x => '<div class="cal-dow" aria-hidden="true">' + x + '</div>').join('') +
        celdas.join('') +
      '</div>' +
      /* La invitación a agendar solo para quien puede: con el rol de Pagos, tocar un día no
         abre nada —la capa de datos contesta «Agendar es de dirección»—, y el resto de la
         rejilla ya lo respeta. */
      (mes.total ? '' : '<p class="pf-nota">No hay nada agendado en ' +
        esc(etiquetaMes(primero)) + '.' + (puedeAgendar() ? ' Toca un día para agendar en él.' : '') + '</p>') +
      pintarDiaAbierto(d) +
    '</div>';
}

/* Adelante y atrás con chevrones de texto y no con iconos. El sprite trae `i-atras` pero no
   su espejo, y la flecha de dos puntas de `i-horiz` no dice hacia dónde: apuntando a los dos
   lados en el botón de «mes siguiente» es peor que no tener icono. Añadir un símbolo nuevo
   sería tocar plataforma.html, que no es de este módulo. El nombre del botón va en su
   aria-label, que es donde de todas formas tenía que estar. */
const nav = (n, etiqueta) =>
  '<button type="button" class="cal-nav" data-mueve="' + n + '" aria-label="' + esc(etiqueta) +
  '"><span aria-hidden="true">' + (n < 0 ? '\u2039' : '\u203A') + '</span></button>';

const celdaFuera = n =>
  '<button type="button" class="cal-dia fuera" disabled aria-hidden="true">' +
  '<span class="cal-n">' + n + '</span></button>';

function celdaDia(dia, d) {
  const insts = visibles(dia.instalaciones);
  const vivas = insts.filter(i => i.estado !== 'cancelada');
  const sem = veSemaforo() && vivas.length ? dia.semaforo : null;
  const abierto = _dia === dia.fecha;
  const libre = !insts.length && puedeAgendar() && dia.fecha >= d.hoy;

  /* Lo que la celda pinta depende de la lente. Instalaciones: sus chips de siempre. Taller:
     lo que VENCE ese día en el taller —empezar, cortar, armar, listo—, con el nombre corto y
     el verbo. Todo: las dos, dos y dos. Máximo tres renglones y «+N», que es lo que cabe en
     76 px sin que el número del día se vaya abajo. */
  const vencen = (_lente !== 'instalaciones' && d.vencen && d.vencen.get(dia.fecha)) || [];
  const topeInst = _lente === 'taller' ? 0 : _lente === 'todo' ? 2 : 3;
  const topeTal = _lente === 'instalaciones' ? 0 : _lente === 'todo' ? 2 : 3;
  const chipsInst = insts.slice(0, topeInst).map(i =>
    '<span class="cal-ev ' + claseEv(i) + '"><span class="tx">' +
      esc((i.hora ? i.hora + ' ' : '') + (i.titulo || '')) + '</span></span>');
  const chipsTal = vencen.slice(0, topeTal).map(x =>
    '<span class="cal-ev tal ' + esc(x.que) + (x.tarde ? ' tarde' : '') + '"><span class="tx">' +
      esc(nombreCorto(x.titulo) + ' · ' + x.que) + '</span></span>');
  const evs = chipsInst.concat(chipsTal).join('');
  const sobran = Math.max(0, insts.length - topeInst) + Math.max(0, vencen.length - topeTal);
  const mas = sobran ? '<span class="cal-mas">+' + sobran + '</span>' : '';
  const carga = d.carga && d.carga.get(dia.fecha);

  /* El aria-label lleva la respuesta completa: la fecha, cuántas instalaciones y qué dice el
     semáforo. El punto de color es un refuerzo, nunca la única manera de saberlo: uno de
     cada doce hombres no distingue el verde del ámbar, y esto se lee para decidir si hay que
     ir a la vidriería hoy. */
  const etiqueta = [fmtFechaDia(dia.fecha),
    insts.length ? (vivas.length === 1 ? '1 instalación' : vivas.length + ' instalaciones')
                 : (_lente === 'instalaciones' ? 'sin nada agendado' : ''),
    _lente !== 'instalaciones' && carga ? carga.texto.replace(/\.$/, '') : '',
    vencen.length ? vencen.slice(0, 3).map(x => x.titulo + ': ' + x.que).join(', ') + (vencen.length > 3 ? ' y ' + (vencen.length - 3) + ' más' : '') : '',
    sem ? sem.texto : '',
    libre ? 'Tocar para agendar' : '',
  ].filter(Boolean).join('. ');

  return '<button type="button" class="cal-dia' + (dia.hoy ? ' hoy' : '') + '"' +
      ' data-dia="' + dia.fecha + '" aria-label="' + esc(etiqueta) + '"' +
      (abierto ? ' aria-current="date"' : '') + '>' +
      /* Sin `title`: la ficha de la pieza `nombres` ya enseña el texto del semáforo dentro del
         `aria-label` de la celda (F26), y con el `title` del punto salía una segunda ficha, la nativa,
         encima. En el teléfono un `title` nunca se vio. */
      (sem ? '<span class="cal-sem ' + sem.estado + '" aria-hidden="true"></span>' : '') +
      '<span class="cal-n">' + dia.dia + '</span>' + evs + mas +
    '</button>';
}

/** El nombre del proyecto es «Contacto - Negocio (tipo)», y en un chip de 39 px caben tres
 *  palabras: se queda con el negocio, que es lo que se reconoce de un vistazo. */
function nombreCorto(nombre) {
  const t = String(nombre || '');
  const m = /^[^-]+ - ([^(]+)/.exec(t);
  return (m ? m[1] : t.replace(/\s*\([^)]*\)\s*$/, '')).trim() || t;
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

  /* `data-recien` solo cuando lo abrió un TOQUE (F18): es lo que le da su subida corta y lo que
     deja a `llevarElDiaALaVista` saber que hay algo que traer. Un repintado con el día ya abierto
     —agendar en él, marcarlo como hecho— no lo lleva, y entonces nada se mueve ni se anima. El
     encabezado es enfocable (tabindex -1) para que el foco llegue a lo que se acaba de abrir en
     vez de quedarse en una celda que el repintado ya reemplazó. */
  const recien = _diaRecien;
  _diaRecien = false;
  let html = '<div class="dia-lista"' + (recien ? ' data-recien' : '') + '><h3 class="dia-t" tabindex="-1">' + esc(fmtFechaDia(_dia)) +
    ' <span class="pf-cuando' + toneCuando(_dia) + '">' + esc(cuando(_dia)) + '</span></h3>';

  if (veSemaforo() && sem && insts.length) html += renglonSem(sem);

  /* Lo del taller ese día, cuando la lente lo mira: qué le toca a quién, y cuántos trabajos
     tienen el día adentro. Va antes de las instalaciones porque es lo que se hace en el
     taller antes de salir. */
  const vencen = (_lente !== 'instalaciones' && d.vencen && d.vencen.get(_dia)) || [];
  const carga = _lente !== 'instalaciones' && d.carga ? d.carga.get(_dia) : null;
  if (vencen.length || (carga && carga.total)) {
    html += '<div class="ag-grupo">' + ico('i-taller') + 'En el taller' +
      (carga ? ' <span class="n">' + carga.total + '</span>' : '') + '</div>';
    if (vencen.length) {
      html += vencen.map(x =>
        '<div class="pf-fila tal-fila-dia"><span class="pf-fila-ico' + (x.tarde ? ' mal' : '') + '">' + ico('i-taller') + '</span>' +
        '<div class="pf-fila-tx"><p class="pf-fila-t">' + esc(x.titulo) + '</p>' +
        '<p class="pf-fila-d">' + esc(VERBO_DIA[x.que] || x.que) + (x.tarde ? ' · ya pasó y no se marcó' : '') + '</p></div></div>').join('');
    } else if (carga) {
      html += '<p class="pf-cuenta">' + esc(carga.texto) + '</p>';
    }
  }

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

const VERBO_DIA = { empezar: 'Hay que empezarlo: entra al taller', cortar: 'Hay que cortar', armar: 'Hay que armar', listo: 'Tiene que quedar listo' };

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
      nav(-1, 'Semana anterior') + nav(1, 'Semana siguiente') +
    '</div><div class="cal-lienzo">' + cuerpo + '</div>';
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

  /* «Al calendario del teléfono» y no «Calendario»: el botón baja el .ics para el calendario
     del celular, y desde que esta pantalla se llama Calendario, un botón «Calendario» dentro
     de ella no se entiende sin tocarlo. El rótulo entero y no un «Al teléfono» corto: es el
     mismo botón que la ficha ya llama así a un toque de distancia, y el mismo nombre para la
     misma acción vale más que dos palabras de ancho. El renglón lo acomoda solo: sus botones
     miden lo que mide su rótulo y la fila envuelve. */
  const acc = ['<button type="button" class="btn btn-gho" data-acc="ics" data-id="' +
    esc(i.id) + '">Al calendario del teléfono</button>'];
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
  /* Solo http y https. `maps_url` viene de `origen.maps`, que es un campo que el usuario
     pega a mano en el cotizador y que además puede llegar de un respaldo restaurado: un
     `javascript:` ahí se convertiría en código al tocar «Ver en Maps», y `esc()` no lo
     detiene porque un href es un contexto de URL, no de HTML. Del teclado nadie lo escribe
     a propósito; de un archivo que viajó por WhatsApp, sí. */
  if (/^https?:\/\//i.test(String(p.maps_url || ''))) return String(p.maps_url);
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
  /* Se habilita con la MISMA cuenta que usa `bajarVarias`, canceladas fuera. Con
     `d.mes.total`, un mes cuya única instalación se canceló dejaba el botón activo y al
     apretarlo salía «no hay nada que bajar»: un botón que se enciende para decir que no. */
  const hay = paraBajar(d).length > 0;
  const titulo = _vista === 'mes' && d.mes ? 'Todo ' + etiquetaMes(d.mes.desde)
               : _vista === 'semana' ? 'Toda la semana'
               : _pasadas ? 'Toda la agenda' : 'Todo lo que viene';

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

  return '<div class="card" id="cal-exportar"><div class="card-h"><h2>' + ico('i-bajar') +
      'Al calendario del teléfono</h2></div><div class="card-b">' +
    '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-agenda') + '</div>' +
      '<div class="pf-fila-tx"><div class="pf-fila-t">' + esc(titulo) + '</div>' +
      '<div class="pf-fila-d">' + (hay
        ? 'Un solo archivo con todas las instalaciones y sus alarmas. Se importa una vez.'
        : 'Aquí no hay nada agendado todavía, así que no hay archivo que bajar.') +
      '</div></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho" data-acc="ics-mes"' +
        (hay ? '' : ' disabled') + '>Bajar</button></div>' +
    '</div>' +
    '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-recalibrar') + '</div>' +
      '<div class="pf-fila-tx"><div class="pf-fila-t">El ritmo, que se repite solo</div>' +
      '<div class="pf-fila-d">«Comparte el día» de lunes a viernes a las 6 de la tarde, y el conteo del almacén el día 1 de cada mes. Se importa una vez y sigue sonando en 2029.</div></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho" data-acc="ics-ritmo">Bajar</button></div>' +
    '</div>' +
    gcalHtml +
    '<p class="pf-nota">Las alarmas —3 días antes para revisar el material, 1 día antes para confirmar con el cliente y media hora antes de salir, 2 horas si la instalación es de noche o de madrugada— las dispara el calendario de tu teléfono, no esta plataforma. Por eso suenan aunque nadie la abra y aunque no haya señal.</p>' +
    '</div></div>';
}

/* ----- La barra fija del teléfono -----
   Una sola acción, la de esta pantalla: agendar. Cuando el rol no agenda, la barra no
   existe: un botón que no lleva a ningún lado ocupa el lugar donde el pulgar espera
   encontrar algo. */
/* Una sola acción por pantalla, y por rol, en el orden de lo que se rompe primero. Dirección:
   si hay cotizaciones sin decidir, decidir; si no, agendar. Fabricación: proponer un día, que
   es lo que su rol puede. Pagos: sin barra. Nunca dos botones: cuando la tarjeta de decidir
   está en pantalla con sus verdes, el de la barra es el mismo verde y APUNTA a ella. */
function pintarMbar(d) {
  const b = $('pf-mbar');
  if (!b) return;
  if (!puedeAgendar()) { b.hidden = true; b.innerHTML = ''; b.onclick = null; b.classList.remove('cal-mbar'); ajustarAltoBarra(); return; }
  const n = d.sinFecha.length, dec = (d.pendientes || []).length;
  let texto, clase, atributo;
  if (dec && Prefs.rol() === 'direccion') {
    texto = dec === 1 ? 'Decidir la cotización pendiente' : 'Decidir ' + dec + ' cotizaciones';
    clase = 'btn btn-ok'; atributo = 'data-ir-decidir';
  } else {
    const propone = soloPropone();
    texto = propone
      ? (n ? 'Proponer un día (' + n + ' sin fecha)' : 'Proponer un día')
      : (n ? (n === 1 ? 'Agendar el proyecto sin fecha' : 'Agendar (' + n + ' sin fecha)') : 'Agendar una instalación');
    clase = 'btn btn-pri'; atributo = 'data-abrir-agendar';
  }
  /* La barra ya está a la vista con su botón (se repinta en cada toque de la pantalla y casi siempre
     dice lo mismo): el botón NO se reescribe (F29). Si cambió de acción —de «Decidir 2
     cotizaciones» a «Agendar (3 sin fecha)»— o de cuenta, el rótulo nuevo se cruza con el viejo en
     su sitio con la pieza 23, que compara antes de tocar y no hace nada si es el mismo; antes el
     cambio ni se notaba. Lo que cambia con la acción —el color y qué hace el toque— se cambia en el
     mismo botón. Reescribir con innerHTML era también lo que dejaba a un dedo con el botón cayéndose
     de debajo. */
  const P = piezas();
  const btn = b.hidden ? null : b.querySelector('button');
  if (btn) {
    btn.className = clase;
    btn.removeAttribute('data-ir-decidir'); btn.removeAttribute('data-abrir-agendar');
    btn.setAttribute(atributo, '');
    if (P.cambiarRotulo) P.cambiarRotulo(btn, texto); else btn.textContent = texto;
  } else {
    b.innerHTML = '<button type="button" class="' + clase + '" ' + atributo + '>' + esc(texto) + '</button>';
  }
  b.hidden = false;
  /* La entrada (sube 12 px con un fundido de 180 ms) es CSS de esta pantalla y se cuelga de esta
     clase y no de `.pf-mbar` a secas: la barra es de todo el documento y la usan otros módulos
     con sus propias acciones. */
  b.classList.add('cal-mbar');
  b.onclick = ev => {
    if (ev.target.closest('[data-abrir-agendar]')) { abrirAgendar(null); return; }
    if (ev.target.closest('[data-ir-decidir]')) {
      const card = _cont && _cont.querySelector('#ag-decidir');
      if (!card) return;
      card.scrollIntoView({ block: 'center', behavior: scrollSuave() });
      const primero = card.querySelector('[data-decidir]');
      if (primero) { try { primero.focus({ preventScroll: true }); } catch (_) {} }
    }
  };
  /* Mide el alto de la barra ya puesta y publica `--mbar-h`. Medir con la entrada a medias no
     engaña: la barra solo se TRASLADA (translateY) mientras entra, y un traslado no cambia su alto
     —a diferencia de escalarla—. Es el mismo problema que ya resolvió `alTerminarDeEntrar` para el
     marco del cotizador, y aquí se evita por construcción en vez de esperar al final. */
  ajustarAltoBarra();
}

/** La cuenta de la pestaña: los mismos dos números que publica Inicio, escritos igual, para
 *  que el globito no cambie de valor solo porque se cambió de módulo. */
function publicarCuentas(d) {
  if (!_ctx || typeof _ctx.ponerCuenta !== 'function') return;
  /* Los mismos dos sumandos que publica «Qué atender», sin las cotizaciones pendientes: con
     ellas, el globito de la pestaña decía 5 al venir de aquí y 2 al venir de allá para los
     mismos datos, que es justo lo que el comentario de arriba promete evitar. */
  _ctx.ponerCuenta('agenda', d.sinFecha.length + d.vencidas.length);
}

/* ============================================================================
   Los toques de la pantalla
   ============================================================================ */

async function alTocar(ev) {
  if (ev.target.closest('[data-recargar]')) { location.reload(); return; }

  const lente = ev.target.closest('[data-lente]');
  if (lente) { _lente = lente.dataset.lente; _dia = null; await recargar(); return; }

  const plazo = ev.target.closest('[data-plazo]');
  if (plazo) { abrirPlazo(plazo.dataset.plazo); return; }

  const dec = ev.target.closest('[data-decidir]');
  if (dec) { (dec.dataset.decidir === 'ganar' ? abrirGanar : abrirDescartar)(dec.dataset.folio); return; }

  const anid = ev.target.closest('[data-anidar]');
  if (anid) {
    const id = anid.dataset.anidar;
    const v = ((_d && _d.ventanas) || []).find(x => x && x.proyecto_id === id);
    if (_ctx && _ctx.pasar) {
      _ctx.pasar('hoy', { vista: 'anidador', proyecto_id: id,
        nombre: (v && v.titulo) || '', folio: '' });
    }
    return;
  }

  const vista = ev.target.closest('[data-vista]');
  if (vista) { _vista = vista.dataset.vista; _dia = null; await recargar(); return; }

  const mueve = ev.target.closest('[data-mueve]');
  if (mueve) { await irAlPeriodo(anclaTrasPasos(Number(mueve.dataset.mueve) || 0)); return; }
  if (ev.target.closest('[data-hoy]')) { await irAlPeriodo(hoyISO()); return; }
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
    _diaRecien = !!_dia;
    await recargar();
    llevarElDiaALaVista();
    return;
  }

  await despachar(ev);
}

/* ----- Al tocar un día, su lista aparece a la vista (F18) -----
   En el teléfono la lista del día se pinta DEBAJO de la rejilla, y el toque cambiaba algo que no se
   veía. Antes se acercaba solo si el encabezado quedaba más abajo del 70 % de la pantalla; eso
   dejaba fuera dos casos: la lista que empieza a la vista pero termina detrás de las barras de
   abajo, y el foco, que seguía en una celda que el repintado ya había reemplazado.

   Ahora: el encabezado es lo que tiene que quedar a la vista, entre el borde de arriba y donde
   empiezan las barras de abajo (el dock de módulos y la barra de acción, que se miden y no se
   suponen); si ya lo está, la página NO se mueve; si no, baja lo justo (`block:'nearest'`, con el
   margen de las barras puesto en la hoja de estilos). Y el foco va al título del día, que es lo que
   se acaba de abrir. Solo cuando abrió un toque: un repintado con el día ya abierto no trae
   `data-recien`, y nada se mueve. */
function llevarElDiaALaVista() {
  const l = _dia && _cont && _cont.querySelector('.dia-lista[data-recien]');
  if (!l) return;
  const t = l.querySelector('.dia-t');
  const r = (t || l).getBoundingClientRect();
  const barra = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h') || '0', 10) || 0;
  const fondo = innerHeight - (altoBarraAbajo() || 0) - barra;
  if (r.top < 0 || r.bottom > fondo) l.scrollIntoView({ block: 'nearest', behavior: scrollSuave() });
  if (t) { try { t.focus({ preventScroll: true }); } catch (_) {} }
}

/** Los `data-acc` son los mismos en el renglón y en la ficha, así que se despachan por el
 *  mismo camino: una sola tabla de acciones, no dos que se desincronizan al mes. */
async function despachar(ev) {
  const b = ev.target.closest('[data-acc]');
  if (!b) return;
  ev.preventDefault();
  /* Las órdenes a Google Calendar no se apagan con `disabled`: tardan segundos y el botón mismo
     dice qué está haciendo (`ordenACalendar`). Un `disabled` le quita además el foco a quien
     navega con teclado justo cuando espera una respuesta. */
  if (b.dataset.acc === 'gcal' || b.dataset.acc === 'gcal-borrar') {
    try { await ejecutar(b.dataset.acc, b.dataset.id || '', b); }
    catch (e) {
      console.error('la orden a Calendar falló', e);
      toast('Algo se rompió al hacer eso. Recarga la plataforma y vuelve a intentarlo.', 'err', 4600);
    }
    return;
  }
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

/* ----- El botón que habla con Google Calendar dice qué hace (F7) -----
   Crear o poner al día un evento es una llamada de red que tarda de uno a varios segundos, y hasta
   ahora el botón solo se ponía `disabled`: ni decía qué hacía, ni cuánto llevaba, ni —al final—
   cómo había terminado; el resultado llegaba en un aviso abajo, lejos del dedo. Con la pieza 14 el
   botón cambia su rótulo por lo que está haciendo («Creándola en Calendar · 4 s»), se va llenando
   de izquierda a derecha, y termina en «Creada» en verde un momento o en «No contestó · Reintentar»
   con una sacudida corta. Sus hermanos de la ficha pasan a `aria-disabled`.

   El resultado se sigue diciendo con el aviso de siempre (con la explicación larga que la capa de
   datos ya escribió), así que la pieza no repite la voz: `voz:false`. Con menos movimiento no hay
   relleno ni sacudida; solo cambia el texto. Si la pieza no está —una prueba de node—, queda lo de
   antes. `trabajo` devuelve el `Resultado` de la capa de datos, que nunca se rechaza: aquí se
   vuelve un fallo del botón cuando `ok` es falso.
   @returns {Promise<Object|null>} el Resultado, o null si el botón ya estaba trabajando */
const MAL_DE_CALENDAR = { SIN_RED: 'No contestó', ROL_SIN_PERMISO: 'Google no dejó', DATO_INVALIDO: 'Falta un dato' };
async function ordenACalendar(boton, trabajo, { verbo, ok, tau }) {
  const P = piezas();
  if (!P.trabajando || !boton) return trabajo();
  const caja = boton.closest('.pf-acciones') || boton.parentElement;
  const hermanos = caja ? [...caja.querySelectorAll('[data-acc]')].filter(x => x !== boton) : [];
  let resultado = null;
  const r = await P.trabajando(boton, async () => {
    resultado = await trabajo();
    if (!resultado || !resultado.ok) {
      const e = new Error((resultado && resultado.mensaje) || 'No se pudo');
      e.codigo = resultado && resultado.codigo;
      throw e;
    }
    return resultado;
  }, { verbo, tau: tau || 4000, ok, mal: e => MAL_DE_CALENDAR[e && e.codigo] || 'No se pudo', hermanos, voz: false });
  if (r.ocupado) return null;
  return resultado;
}

async function ejecutar(acc, id, boton) {
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
      /* `marcar` también pasa el proyecto a «Instalado» cuando el rol puede marcarlo (ver
         `instalarProyecto` en js/datos/agenda.js). El aviso dice cuál de las dos pasó: con el
         rol de fabricación el proyecto se queda en «Listo», y eso se dice aquí. */
      const r = await Agenda.marcar(i.id, 'hecha');
      avisarResultado(r, Proyectos.puedeMover(Prefs.rol(), 'instalado')
        ? 'Marcada como hecha, y el proyecto queda en «Instalado»'
        : 'Marcada como hecha. «Instalado» en el proyecto lo marca Dirección.');
      if (r.ok) { cerrarPide(); await recargar(); }
      return;
    }

    case 'gcal': {
      const evento = Agenda.paraIcs(i, p);
      const r = await ordenACalendar(boton, () => Gcal.crearEvento(evento), {
        verbo: Number(i.movida) > 0 ? 'Poniéndola al día' : 'Creándola en Calendar',
        ok: res => { const v = (res && res.valor) || {}; return v.actualizado ? 'Puesta al día' : v.yaEstaba ? 'Ya estaba' : 'Creada'; },
      });
      if (!r) return;
      /* No se guarda el `gcal_event_id`. El id que Calendar recibe es determinista sobre el
         UID de la instalación, así que volver a darle al botón no duplica nada; escribirlo
         desde aquí sería inventarle a §5.7 una mutación que no tiene. Y volver a darle es
         también como se lleva un cambio de día a Calendar: `crearEvento` reescribe el evento
         que ya estaba si no dice lo mismo que esta instalación.
         A cuántos les llega se cuenta: la frase decía «a los tres» con uno o con ningún
         invitado en Ajustes. */
      const v = (r.ok && r.valor) || {};
      const n = Number(v.invitados) || 0;
      const quienes = n === 1 ? 'a la persona invitada' : 'a las ' + n + ' personas invitadas';
      avisarResultado(r, v.actualizado
        ? 'Se puso al día en Google Calendar con lo de aquí.' + (n ? ' El cambio les llega ' + quienes + '.' : '')
        : v.yaEstaba
          ? 'Ese evento ya estaba en el calendario, igual que aquí.'
          : 'Evento creado.' + (n ? ' La invitación ya le llegó ' + quienes + '.'
                                  : ' No hay invitados en Ajustes: solo está en tu calendario.'));
      return;
    }

    /* Una instalación cancelada se QUITA de Calendar: la cancelación la tacha en el teléfono
       de cada invitado. Sin este botón, cancelarla aquí dejaba el evento vivo allá y el
       instalador salía a una cita que ya no existía. */
    case 'gcal-borrar': {
      const uid = Agenda.paraIcs(i, p).uid;
      const r = await ordenACalendar(boton, () => Gcal.borrarEvento(uid), { verbo: 'Quitándola de Calendar', ok: 'Quitada' });
      if (!r) return;
      avisarResultado(r, 'Ya no está en Google Calendar. Si los invitados lo tenían, les llega la cancelación.');
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

/** Lo que entra en el .ics de «todo»: exactamente lo que se está viendo, sin las canceladas.
 *  Una cancelada en el archivo reviviría el evento en el teléfono de quien lo importe. */
function paraBajar(d) {
  const todas = _vista === 'mes' && d.mes
    ? (d.mes.dias || []).flatMap(x => x.instalaciones || [])
    : (d.filas || []);
  return visibles(todas).filter(i => i.estado !== 'cancelada');
}

async function bajarVarias() {
  if (!_d) return;
  const vivas = paraBajar(_d);
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
function ponerEnCapa(id, html, o = {}) {
  const capa = $(id);
  if (!capa) return;
  const todo = '<div class="pf-panel">' + html + '</div>';
  /* Mientras se escribe en el buscador de «Agendar», se repinta ALREDEDOR del campo: rehacer el
     panel entero en cada tecla reemplazaba el <input> —en iPhone se cierra el teclado— y
     devolvía el scroll del panel arriba. */
  const vivo = document.activeElement;
  if (capa.classList.contains('show') && vivo && vivo.matches && vivo.matches('input,textarea') &&
      capa.contains(vivo) && repintarAlrededor(capa, todo, vivo)) return;
  if (!capa.classList.contains('show')) { capa.innerHTML = todo; abrirCapa(id, { hist: true }); return; }
  /* `o.dir` es un cambio de PASO dentro de la misma capa (F19): el cuerpo nuevo entra por la derecha
     al avanzar y por la izquierda al volver. Es la pieza 22 alrededor del innerHTML, y la capa NO se
     abre otra vez —cada capa lleva una sola entrada de historial—. El foco, que depende del cuerpo
     nuevo, va dentro: con View Transitions el repintado corre un cuadro después. `o.foco` es el
     selector de lo que debe recibirlo en vez del primer control (un chip que se acaba de elegir y
     que el repintado rehízo). */
  const poner = () => {
    capa.innerHTML = todo;
    const f = (o.foco && capa.querySelector(o.foco)) || capa.querySelector('button:not([disabled]),input,textarea,a[href]');
    if (f) requestAnimationFrame(() => { try { f.focus(); } catch (_) {} });
  };
  const P = piezas();
  if (o.dir && P.transicion) {
    P.transicion(poner, { contenedor: '#' + id + ' .pf-panel-b', direccion: o.dir, duracion: 220 });
    return;
  }
  poner();
}

/* ----- Los tres pasos de agendar (F19) -----
   Proyecto → Día → Al teléfono eran tres contenidos que se reemplazaban en la misma capa sin
   decir en cuál iba uno ni cuántos faltaban. Un riel de tres puntos con la pieza 16: los pasos de
   antes con su palomita, el actual con su anillo y `aria-current="step"`, los que faltan huecos.
   No se toca (no es un botón): volver se hace con «‹ Otro proyecto», que dice a dónde lleva. */
const PASOS_AGENDAR = ['Proyecto', 'Día', 'Al teléfono'];
function pasosAgendar(actual) {
  const P = piezas();
  if (!P.rielHTML) return '';
  return '<div class="pf-pasos">' +
    P.rielHTML(PASOS_AGENDAR, { forma: 'horizontal', actual, etiqueta: 'Pasos para agendar' }) + '</div>';
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

function pintarPaso1(dir) {
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
        '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-h="elige" data-pid="' +
          esc(p.id) + '">Elegir</button></div></div>').join('')
    : '<p class="pf-cuenta">Ningún proyecto sin fecha coincide con eso.</p>';

  ponerEnCapa('pf-hoja',
    cabeza(_hoja.fecha ? 'Agendar el ' + fmtFecha(_hoja.fecha) : 'Agendar una instalación',
           'data-h="cerrar"') +
    '<div class="pf-panel-b">' +
      pasosAgendar(0) +
      '<p class="pf-cuenta">Estos son los proyectos ganados que todavía no tienen día.</p>' +
      buscador + filas +
    '</div><div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-h="cerrar">Cancelar</button>' +
    '</div>', { dir });
}

/** Paso 2: el día. Es lo único que se pide de verdad; todo lo demás viene puesto. */
async function pintarPaso2(pid, o = {}) {
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

  /* `volver` guarda lo del paso 1 —el día que se tocó en la rejilla y lo que se había escrito en el
     buscador— para que «‹ Otro proyecto» regrese a la misma lista, no a una en blanco. Solo existe
     si se pasó por el paso 1: quien llega directo a este paso (el «Mover la fecha» del Tablero ya
     trae el proyecto) no tiene a dónde volver, y el botón no se pinta. */
  _hoja = { paso: 'fecha', pid, ventana: 'dia', proyecto: p, volver: o.volver || null };

  ponerEnCapa('pf-hoja',
    cabeza('¿Qué día se instala?', 'data-h="cerrar"') +
    '<div class="pf-panel-b">' +
      pasosAgendar(1) +
      (_hoja.volver
        ? '<p class="pf-volver"><button type="button" class="btn btn-gho pf-btn-corto" data-h="otro">‹ Otro proyecto</button></p>'
        : '') +
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
      /* Lo que implica la ventana elegida, escrito DEBAJO de los chips (F17). Vivía solo en el
         `title` de cada chip, que en el teléfono nunca se ve, y «De noche» y «Madrugada» cambian la
         alarma de salida a 2 horas antes: una consecuencia que se descubría al sonar. El texto sale
         de `Agenda.VENTANA_DESC` y no se copia aquí. `aria-live` para quien oye: el cambio de
         ventana tiene que decirse. */
      '<p class="hintnote pf-vent-desc" id="pf-ag-vent-desc" aria-live="polite">' +
        esc(Agenda.VENTANA_DESC.dia || '') + '</p>' +

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
      pasosAgendar(2) +
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
    '</div>', { dir: 'adelante' });

  await recargar();
}

async function alTocarHoja(ev) {
  const b = ev.target.closest('[data-h]');
  if (!b) return;
  const q = b.dataset.h;
  ev.preventDefault();

  if (q === 'cerrar') { cerrarHoja(); return; }

  if (q === 'elige') {
    const h = _hoja || {};
    await pintarPaso2(b.dataset.pid, { dir: 'adelante', volver: { fecha: h.fecha || null, filtro: h.filtro || '' } });
    return;
  }

  if (q === 'otro') { volverAlPaso1(); return; }

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
    /* La línea de abajo cambia con un cruce corto (pieza 23): lo viejo sale y lo nuevo entra en el
       mismo sitio, sin que nada de abajo se mueva. Con menos movimiento, el cambio es directo. */
    const desc = $('pf-ag-vent-desc');
    const texto = Agenda.VENTANA_DESC[_hoja.ventana] || '';
    if (desc) { const P = piezas(); if (P.cambiarRotulo) P.cambiarRotulo(desc, texto); else desc.textContent = texto; }
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

/** «‹ Otro proyecto»: del paso 2 al 1, con la lista como se había dejado. */
function volverAlPaso1() {
  const v = (_hoja && _hoja.volver) || {};
  _hoja = { paso: 'elegir', fecha: v.fecha || null, filtro: v.filtro || '' };
  pintarPaso1('atras');
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
  if (Gcal.disponible() && Prefs.rol() === 'direccion') {
    acc.push(cancelada
      ? '<button type="button" class="btn btn-gho" data-acc="gcal-borrar" data-id="' + esc(i.id) +
        '">Quitarla de Google Calendar</button>'
      : '<button type="button" class="btn btn-gho" data-acc="gcal" data-id="' + esc(i.id) +
        '">' + (Number(i.movida) > 0 ? 'Ponerla al día en Google Calendar' : 'Crearla en Google Calendar') + '</button>');
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

/* ----- Copiar la orden de trabajo, confirmado en el botón (F31) -----
   `copiarTexto` ya confirma en el botón tocado, pero con su rótulo de siempre, «Copiado»; la orden
   es femenina y el aviso de abajo dice «Orden copiada». La pieza `copiar` deja elegir el rótulo, y
   por 1.8 s el botón es una palomita que se dibuja y «Copiada» —sin cambiar su ancho—. El aviso y
   la voz se quedan: el aviso trae la instrucción (pégala en el chat del instalador) y es lo que
   oye quien no ve el botón. */
function copiarOrden(boton) {
  const texto = (_pide && _pide.texto) || '';
  const P = piezas();
  const MSG = 'Orden copiada. Pégala en el chat del instalador.';
  if (!P.copiar) { copiarTexto(texto, MSG); return; }
  P.copiar(texto, { boton, ok: 'Copiada' }).then(bien =>
    bien ? toast(MSG, 'ok', 3400) : toast('Este navegador no dejó copiar — selecciona el texto a mano', 'err', 4200));
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
      /* Google Calendar no se entera solo: mover aquí no llama a Google —el permiso sale de un
         toque, no de una escritura en la base—, así que se dice cuál es el toque. */
      (Gcal.disponible() && Prefs.rol() === 'direccion'
        ? '<p class="hintnote">Si ya estaba en Google Calendar, ábrela y dale a «Ponerla al día en Google Calendar»: así les llega el día nuevo a los invitados.</p>'
        : '') +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-pide="mover">Mover</button>' +
    '</div>');
}

/* ----- El plazo, con un toque -----
   Es el número que más se va a equivocar —sale de una tabla, y una tabla se equivoca con el
   proyecto que la contradice— y por eso leerlo y corregirlo son el mismo gesto: la ficha del
   renglón es el botón. Lo corrigen dirección y fabricación; cuánto tarda un trabajo lo sabe
   quien lo hace, no quien lo vendió. Pagos no. */
const puedeCorregirPlazo = () => Prefs.rol() !== 'pagos';

/* ----- Probar el plazo antes de fijarlo (F24) -----
   Los cinco cubos, de «1 semana» a «3 semanas o más», no decían qué fecha resulta; se sabía hasta el
   aviso de DESPUÉS de tocar. Ahora, al pasar el cursor, al enfocar con el teclado o al apoyar el
   dedo y deslizarlo, una ficha sobre los chips dice «Entra al taller el lun 8 oct · listo el vie 19
   oct». Tocar confirma, como hoy: con el dedo, soltar sobre un chip lo toca, y soltar fuera no
   hace nada, así que el plazo se puede PROBAR sin fijarlo.

   La fecha no se calcula aquí: sale de `Taller.ventanaTaller()` llamada con el proyecto y el plazo
   candidato, la misma función que pinta la fila. Esta pantalla solo la pide y la escribe. Y el
   plazo es de CALENDARIO, como en datos/taller.js (a propósito: es lo que dice la tabla de
   plazos); la ficha lo dice con palabras. */
const diaCorto = iso => {
  const f = fechaLocal(iso), q = partesISO(iso);
  return f && q ? DOW[(f.getDay() + 6) % 7] + ' ' + q.d + ' ' + MES_CORTO[q.m - 1] : '';
};

/** El texto de la ficha para una ventana ya calculada. */
function fichaDeVentana(k, v) {
  if (!v || !partesISO(v.empezar) || !partesISO(v.listo)) {
    return { texto: 'Sin fecha de instalación ni de venta no hay de dónde contar', sub: '' };
  }
  const pl = Taller.plazo(k);
  return { texto: 'Entra al taller el ' + diaCorto(v.empezar) + ' · listo el ' + diaCorto(v.listo),
           sub: pl.etiqueta + ' · ' + pl.dias + ' días de calendario' +
                (v.ancla === 'ganado' ? ' · cuenta desde que se ganó, sin fecha de instalación' : '') };
}

/** La ficha de un proyecto que ya existe. Lee el proyecto, su instalación viva y las constantes UNA
 *  vez, al abrir el panel, para que la primera ficha no espere. */
function fichaDePlazoDe(id) {
  const base = Promise.all([Proyectos.obtener(id), Agenda.listar({ proyecto_id: id, vivas: true }), Material.constantes()])
    .then(([p, vivas, cts]) => ({ p, inst: (vivas && vivas[0]) || null, cts }), () => ({ p: null }));
  return async k => {
    const b = await base;
    if (!b.p) return null;
    return fichaDeVentana(k, Taller.ventanaTaller({ ...b.p, plazo_k: k }, b.inst,
      { hoy: (_d && _d.hoy) || hoyISO(), cts: b.cts }));
  };
}

/** La ficha de una cotización que todavía no es proyecto («Se ganó»): el proyecto candidato es
 *  `ganado` hoy, con el plazo candidato y el día de instalación que HAYA en el campo en ese
 *  momento; sin día, la ventana cuenta desde hoy y la ficha lo dice. */
function fichaDePlazoNuevo(e, tipos) {
  const cts = Material.constantes().catch(() => ({}));
  return async k => {
    const campo = $('ag-ganar-fecha');
    const dia = campo ? String(campo.value || '') : '';
    const hoy = (_d && _d.hoy) || hoyISO();
    const cand = { id: null, nombre: '', etapa: 'ganado', tipo_trabajo: tipos, fecha_ganado: hoy, plazo_k: k,
                   origen: { items: e.items } };
    return fichaDeVentana(k, Taller.ventanaTaller(cand, partesISO(dia) ? { fecha: dia, estado: 'confirmada' } : null,
      { hoy, cts: await cts }));
  };
}

/** Cablea la ficha sobre un grupo de chips con `data-k`. `fichaDe(k)` devuelve una promesa de
 *  {texto, sub} o null. Un solo nodo `role="tooltip"` dentro del grupo. El nodo y los oyentes viven
 *  en el panel: cuando la pantalla repinta el panel, se van con él. */
function probarPlazos(grupo, fichaDe) {
  if (!grupo) return;
  const peek = document.createElement('div');
  peek.className = 'pf-peek';
  peek.id = 'pf-peek';
  peek.setAttribute('role', 'tooltip');
  const t = document.createElement('span'); t.className = 'pf-peek-t';
  const sub = document.createElement('small'); sub.className = 'pf-peek-s';
  peek.append(t, sub);
  grupo.classList.add('pf-peek-caja');
  grupo.appendChild(peek);

  let probando = null, n = 0, presion = null, empezo = null, movio = false;
  const ocultar = () => {
    n++;
    peek.classList.remove('ve');
    if (probando) { probando.removeAttribute('aria-describedby'); probando.classList.remove('probando'); }
    probando = null;
  };
  async function mostrar(chip) {
    if (!chip || chip === probando) return;
    if (probando) { probando.removeAttribute('aria-describedby'); probando.classList.remove('probando'); }
    probando = chip;
    const mio = ++n;
    const f = await fichaDe(Number(chip.dataset.k));
    if (mio !== n || probando !== chip || !chip.isConnected) return;
    if (!f) { peek.classList.remove('ve'); return; }
    t.textContent = f.texto;
    sub.textContent = f.sub || '';
    sub.hidden = !f.sub;
    /* Sobre el chip y sin salirse del grupo; la flechita apunta al centro del chip. El nodo ocupa
       sitio aunque no se vea (visibility), así que se puede medir antes de enseñarlo. */
    const g = grupo.getBoundingClientRect(), c = chip.getBoundingClientRect(), w = peek.offsetWidth;
    const centro = c.left - g.left + c.width / 2;
    const x = Math.max(0, Math.min(g.width - w, centro - w / 2));
    peek.style.setProperty('--x', Math.round(x) + 'px');
    peek.style.setProperty('--flecha', Math.round(Math.max(12, Math.min(w - 12, centro - x))) + 'px');
    /* Arriba si cabe dentro del cuerpo del panel, que es lo que recorta; si no, debajo. */
    const cuerpo = grupo.closest('.pf-panel-b');
    const sitio = c.top - (cuerpo ? cuerpo.getBoundingClientRect().top : 0);
    peek.dataset.lado = sitio >= peek.offsetHeight + 14 ? 'arriba' : 'abajo';
    peek.classList.add('ve');
    chip.classList.add('probando');
    chip.setAttribute('aria-describedby', 'pf-peek');
  }
  const bajo = ev => {
    const e = document.elementFromPoint(ev.clientX, ev.clientY);
    const c = e && e.closest ? e.closest('[data-k]') : null;
    return c && grupo.contains(c) ? c : null;
  };

  /* Ratón: al pasar. */
  grupo.addEventListener('pointerover', ev => {
    if (ev.pointerType !== 'mouse') return;
    const c = ev.target.closest('[data-k]');
    if (c) mostrar(c);
  });
  grupo.addEventListener('pointerout', ev => {
    if (ev.pointerType !== 'mouse') return;
    if (!ev.relatedTarget || !grupo.contains(ev.relatedTarget)) ocultar();
  });
  /* Dedo: apoyar enseña, deslizar cambia de chip, soltar sobre uno lo toca, soltar fuera lo deja.
     El navegador no manda el clic si el dedo se deslizó a otro chip, así que se manda aquí. */
  grupo.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' || ev.button > 0) return;
    const c = ev.target.closest('[data-k]');
    if (!c) return;
    presion = ev.pointerId; empezo = c; movio = false;
    mostrar(c);
  });
  grupo.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'mouse' || ev.pointerId !== presion) return;
    const c = bajo(ev);
    if (c !== empezo) movio = true;
    if (c) mostrar(c); else ocultar();
  });
  const soltar = ev => {
    if (ev.pointerId !== presion) return;
    presion = null;
    const c = bajo(ev);
    if (ev.type === 'pointerup' && movio && c && c !== empezo) c.click();
    movio = false;
    if (ev.type === 'pointercancel' || !c) { ocultar(); return; }
    /* Un toque normal confirma y el panel se rehace; si no se rehízo, la ficha se va sola. */
    setTimeout(() => { if (presion === null && probando) ocultar(); }, 1400);
  };
  grupo.addEventListener('pointerup', soltar);
  grupo.addEventListener('pointercancel', soltar);
  /* Teclado: al enfocar con Tab (o con las flechas), al momento. Solo con :focus-visible: un toque
     o un clic también enfocan el botón, y eso no es «mirar» un plazo. */
  grupo.addEventListener('focusin', ev => {
    const c = ev.target.closest('[data-k]');
    if (!c) return;
    let visible = false;
    try { visible = c.matches(':focus-visible'); } catch (_) {}
    if (visible) mostrar(c);
  });
  grupo.addEventListener('focusout', ev => {
    if (!ev.relatedTarget || !grupo.contains(ev.relatedTarget)) ocultar();
  });
}

function abrirPlazo(id) {
  if (!puedeCorregirPlazo()) { toast('El plazo lo cambian dirección y fabricación.', 'err', 4200); return; }
  const v = ((_d && _d.ventanas) || []).find(x => x.proyecto_id === id);
  if (!v) return;
  const elegido = v.plazo_fuente === 'elegido' ? v.plazo_k : null;
  _pide = { modo: 'plazo', id, k: elegido };
  const chips = Taller.PLAZOS.map(p =>
    chip(p.etiqueta, p.k === v.plazo_k, 'data-pide="plazo" data-k="' + p.k + '"')).join('');
  ponerEnCapa('pf-pide',
    cabeza('¿Cuánto tarda en el taller?', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      '<p class="pf-cuenta">' + esc(v.titulo || 'Proyecto sin nombre') +
        (v.instalacion ? ' · se instala el ' + esc(fmtFecha(v.instalacion)) : ' · sin fecha de instalación') + '</p>' +
      '<div class="chips" role="group" aria-label="Plazo de taller">' + chips + '</div>' +
      '<p class="hintnote">' + (elegido !== null
        ? 'Puesto a mano. Toca el marcado para volver al propuesto.'
        : 'Propuesto por el tipo de trabajo: ' + esc(v.plazo_razon) + '. Toca otro si sabes que tarda más.') + '</p>' +
      '<p class="hintnote">El plazo se cuenta hacia atrás desde el día de la instalación: si mueves la fecha, la ventana se mueve con ella. Lo que elijas aquí manda sobre lo calculado y se queda.</p>' +
    '</div>' +
    '<div class="pf-panel-f"><button type="button" class="btn btn-gho" data-pide="cerrar">Cerrar</button></div>');
  const capa = $('pf-pide');
  probarPlazos(capa && capa.querySelector('.chips[aria-label="Plazo de taller"]'), fichaDePlazoDe(id));
}

/* ----- «Se ganó», con la fecha y el plazo en el mismo panel -----
   Pide UNA fecha, prellenada y borrable —el proyecto es el dato irrecuperable; si no hay día
   todavía, A7 lo nombra a las 48 horas—, y ofrece el plazo ya propuesto desde las partidas,
   por si quien gana ya sabe que son tres semanas. Cero toques lo aceptan. */
function abrirGanar(folio, estado, focoK) {
  const e = Cot.porFolio(folio);
  if (!e) { toast('«' + folio + '» ya no está en el historial de este dispositivo. Ábrelo en el cotizador para ver qué pasó.', 'err', 5200); return; }
  const tipos = Proyectos.tiposDerivados(e.items);
  const sug = Taller.plazoSugerido(tipos, e.items);
  const prev = estado || {};
  _pide = { modo: 'ganar', folio: String(folio), k: prev.k !== undefined ? prev.k : (e.plazoK >= 1 && e.plazoK <= 5 ? e.plazoK : null),
            fecha: prev.fecha !== undefined ? prev.fecha : hoyISO() };
  /* El campo solo se relee cuando es el MISMO panel repintándose —elegir un plazo lo rehace y
     no puede perder la fecha que ya se escribió—. En un panel nuevo, no: Escape y el atrás
     cierran sin vaciar la capa, y el campo que quedaba ahí era el del folio anterior, así que
     el siguiente «Se ganó» salía con la fecha de instalación de otro proyecto. */
  const fechaVal = (estado && $('ag-ganar-fecha')) ? $('ag-ganar-fecha').value : _pide.fecha;
  const marcado = _pide.k !== null ? _pide.k : sug.k;
  const quien = [e.cliente, e.proy].filter(Boolean).join(' — ') || 'sin cliente';
  const total = Prefs.veDinero() ? Cot.totalVendido(e) : 0;
  ponerEnCapa('pf-pide',
    cabeza(String(folio) + ' se ganó', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>De quién</dt><dd>' + esc(quien) + '</dd></dl>' +
      (total > 0 ? '<dl class="pf-dato"><dt>Lo autorizado</dt><dd>' + esc(money(total)) + '</dd></dl>' : '') +
      (e.entrega ? '<dl class="pf-dato"><dt>Lo que se le prometió</dt><dd>' + esc(e.entrega) + '</dd></dl>' : '') +
      /* Fechas rápidas (P14): «Hoy · Mañana · sáb 3 · lun 5 · Sin fecha» escriben en el campo de
         fecha, que se queda para cualquier otro día. Con el dedo y el cliente enfrente eran varios
         toques por el selector nativo, y era fácil dejar «hoy» por inercia: ahora hay que ver que
         «Hoy» es lo que está marcado. «Sin fecha» vacía el campo, que ya estaba permitido. */
      '<div class="fld"><span class="fld-lab" id="ag-ganar-fecha-l">¿Qué día se instala?</span>' +
        htmlFechasRapidas(fechaVal || '', 'ag-ganar-fecha-l') + '</div>' +
      '<div class="fld"><label for="ag-ganar-fecha">Otro día de instalación</label>' +
        '<input type="date" id="ag-ganar-fecha" value="' + esc(fechaVal || '') + '"></div>' +
      '<p class="hintnote">Es la única fecha que la plataforma te pide. Si todavía no hay día, toca «Sin fecha»: el proyecto se guarda igual y te lo recuerda a las 48 horas.</p>' +
      '<div class="fld"><label id="ag-ganar-plazo-l">¿Cuánto tarda en el taller?</label>' +
        '<div class="chips" role="group" aria-labelledby="ag-ganar-plazo-l">' +
          Taller.PLAZOS.map(p => chip(p.etiqueta, p.k === marcado, 'data-pide="ganar-plazo" data-k="' + p.k + '"')).join('') +
        '</div></div>' +
      '<p class="hintnote">' + (_pide.k !== null ? 'Elegido a mano. Toca el marcado para volver al propuesto.'
                                                : 'Propuesto por el tipo de trabajo: ' + esc(sug.razon) + '.') + '</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-ok" data-pide="ganar">Guardar el proyecto</button>' +
    '</div>',
    /* Elegir un plazo rehace el panel; el foco vuelve al chip tocado y no al primer control. */
    focoK ? { foco: '[data-pide="ganar-plazo"][data-k="' + focoK + '"]' } : {});
  const capa = $('pf-pide');
  if (!capa) return;
  cablearFechasRapidas(capa.querySelector('#ag-ganar-rapidas'), $('ag-ganar-fecha'));
  probarPlazos(capa.querySelector('.chips[aria-labelledby="ag-ganar-plazo-l"]'), fichaDePlazoNuevo(e, tipos));
}

/* ----- Fechas rápidas (P14) -----
   Radios con el `.chip` de siempre, que escriben en el `<input type="date">`. Las fechas se calculan
   con `nucleo/fechas.js` y nunca con `new Date(iso)`, que en México devuelve el día anterior. Las
   dos del medio son el próximo sábado y el próximo lunes DESPUÉS de mañana, en orden de fecha: son
   los días que de verdad se agendan, y no repiten a «Mañana». */
function opcionesDeFecha() {
  const hoy = hoyISO(), man = masDias(hoy, 1);
  const sigue = dow => { let f = masDias(man, 1); while (fechaLocal(f).getDay() !== dow) f = masDias(f, 1); return f; };
  const numero = iso => DOW[(fechaLocal(iso).getDay() + 6) % 7] + ' ' + partesISO(iso).d;
  return [
    { t: 'Hoy', iso: hoy, dice: 'Hoy, ' + diaCorto(hoy) },
    { t: 'Mañana', iso: man, dice: 'Mañana, ' + diaCorto(man) },
    ...[sigue(6), sigue(1)].sort().map(iso => ({ t: numero(iso), iso, dice: diaCorto(iso) })),
    { t: 'Sin fecha', iso: '', dice: 'Sin fecha por ahora' },
  ];
}

function htmlFechasRapidas(actual, etiquetadaPor) {
  const ops = opcionesDeFecha();
  const alguna = ops.some(o => o.iso === actual);
  return '<div class="chips pf-fechas-rapidas" role="radiogroup" aria-labelledby="' + etiquetadaPor + '" id="ag-ganar-rapidas">' +
    ops.map((o, i) => {
      const si = o.iso === actual;
      return '<button type="button" role="radio" class="chip' + (si ? ' on' : '') + '" data-fecha-rapida="' + esc(o.iso) + '"' +
        ' aria-checked="' + (si ? 'true' : 'false') + '" tabindex="' + (si || (!alguna && i === 0) ? '0' : '-1') + '"' +
        ' aria-label="' + esc(o.dice) + '">' + esc(o.t) + '</button>';
    }).join('') + '</div>';
}

/** Radios de verdad con teclado: las flechas mueven el foco Y eligen, solo el elegido está en el
 *  tabulador. El campo manda: si se escribe o se elige otro día a mano, las fichas se ponen al día. */
function cablearFechasRapidas(grupo, campo) {
  if (!grupo || !campo) return;
  const radios = () => [...grupo.querySelectorAll('[role="radio"]')];
  const sincronizar = () => {
    let alguno = false;
    for (const b of radios()) {
      const si = b.dataset.fechaRapida === campo.value;
      b.classList.toggle('on', si);
      b.setAttribute('aria-checked', si ? 'true' : 'false');
      b.tabIndex = si ? 0 : -1;
      alguno = alguno || si;
    }
    if (!alguno && radios()[0]) radios()[0].tabIndex = 0;
  };
  const elegir = b => { campo.value = b.dataset.fechaRapida; sincronizar(); };
  grupo.addEventListener('click', ev => { const b = ev.target.closest('[role="radio"]'); if (b) elegir(b); });
  grupo.addEventListener('keydown', ev => {
    const d = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ? -1 : 0;
    if (!d) return;
    const rs = radios(), i = rs.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const b = rs[(i + d + rs.length) % rs.length];
    b.focus();
    elegir(b);
  });
  campo.addEventListener('input', sincronizar);
  campo.addEventListener('change', sincronizar);
}

/* ----- «No se dio» -----
   Pregunta una vez porque cierra una venta: un dedo que resbala dejaría la cotización marcada
   como perdida, y volver de ahí no es un botón. El motivo es opcional y sirve para lo que hoy
   no se puede leer en ningún lado: cuánto se dejó de vender y por qué. */
function abrirDescartar(folio) {
  _pide = { modo: 'descartar', folio: String(folio) };
  ponerEnCapa('pf-pide',
    cabeza('¿' + String(folio) + ' no se dio?', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      '<p class="pf-fila-d">Queda la constancia con su importe y sus partidas, y la plataforma deja de preguntarte por ella. No desaparece del cotizador.</p>' +
      '<div class="fld"><label for="ag-desc-motivo">¿Por qué? (opcional)</label>' +
        '<textarea id="ag-desc-motivo" rows="2" placeholder="Se fue con otro proveedor, ya no lo va a hacer, no contestó…"></textarea></div>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Mejor no</button>' +
      '<button type="button" class="btn btn-dgr" data-pide="descartar">Sí, no se dio</button>' +
    '</div>');
}

/* ----- El teclado, para la computadora -----
   Flechas para moverse de mes o de semana y «t» para volver a hoy. Solo cuando no se está
   escribiendo en un campo y no hay un panel abierto: dentro de un <input type="date"> las
   flechas ya hacen otra cosa. Los números cambian de módulo y viven en app.js.
   En las TRES lentes: aquí había un «si la lente es Taller, nada», de cuando esa lente no
   pintaba la rejilla. Hoy la pinta —con lo que vence cada día—, es la que abre de 760 a
   1 099 px, y el encabezado anunciaba «← → mes · t hoy» encima de unas teclas muertas. */
function alTeclear(ev) {
  if (!_cont || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const t = ev.target;
  if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (document.querySelector('.modal-bg.show')) return;
  /* RePág y AvPág son lo mismo que ← y →, pero SOLO con el foco dentro de la rejilla: en cualquier
     otro lado son del scroll de la página y quitárselas sería peor que no tenerlas. En la rejilla,
     el foco se queda en el mismo número de día del mes nuevo. */
  const enRejilla = t && t.closest && t.closest('.cal-rej');
  const pagina = enRejilla && (ev.key === 'PageUp' || ev.key === 'PageDown');
  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || pagina) {
    const n = (ev.key === 'ArrowLeft' || ev.key === 'PageUp') ? -1 : 1;
    const celda = enRejilla && t.closest('.cal-dia[data-dia]');
    const focoDia = celda ? Number(celda.dataset.dia.slice(8)) : 0;
    ev.preventDefault();
    return irAlPeriodo(anclaTrasPasos(n), { focoDia });   // se espera: el foco vuelve después del repintado
  } else if (ev.key === 't' || ev.key === 'T') {
    ev.preventDefault();
    return irAlPeriodo(hoyISO());
  }
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
      (Gcal.disponible() && Prefs.rol() === 'direccion'
        ? '<p class="hintnote">Si estaba en Google Calendar, después ábrela y dale a «Quitarla de Google Calendar»: es lo que la tacha en el teléfono de los invitados.</p>'
        : '') +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">No, déjala</button>' +
      '<button type="button" class="btn btn-dgr" data-pide="cancelar">Cancelarla</button>' +
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

  if (q === 'ganar-plazo') {
    /* Dentro de «se ganó», elegir el cubo solo cambia el estado del panel: se guarda con el
       proyecto al apretar «Guardar». */
    const k = Number(b.dataset.k);
    _pide.k = _pide.k === k ? null : k;
    abrirGanar(_pide.folio, _pide, k);
    return;
  }

  if (q === 'ganar') {
    const folio = _pide.folio;
    const e = Cot.porFolio(folio);
    if (!e) { toast('Esa cotización ya no está en el historial de este dispositivo', 'err', 4600); return; }
    const f = $('ag-ganar-fecha');
    const fecha = f ? String(f.value || '').trim() : '';
    b.disabled = true;
    const extra = {};
    if (fecha) extra.fecha_instalacion = fecha;
    if (_pide.k) extra.plazo_k = _pide.k;
    const r = await Proyectos.ganar(e, extra);
    if (!avisarResultado(r)) { if (b.isConnected) b.disabled = false; return; }
    cerrarPide();
    toast(fecha ? 'Ya es proyecto, con material calculado y con fecha del ' + fmtFecha(fecha)
                : 'Ya es proyecto, con su material calculado. Falta la fecha.', 'ok', 4600);
    if (fecha) { _ancla = fecha; _dia = fecha; }
    await recargar();
    if (_ctx && _ctx.cuentas) _ctx.cuentas();
    return;
  }

  if (q === 'descartar') {
    const folio = _pide.folio;
    const t = $('ag-desc-motivo');
    b.disabled = true;
    const r = await Proyectos.descartar(folio, t ? String(t.value || '').trim() : '');
    if (!avisarResultado(r)) { if (b.isConnected) b.disabled = false; return; }
    cerrarPide();
    toast(folio + ': queda la constancia y no vuelve a preguntar', 'ok', 4200);
    await recargar();
    return;
  }

  if (q === 'plazo') {
    /* El chip commitea: no hay botón de guardar, hay «Deshacer» en el aviso, que es el patrón
       del sistema. Tocar el que ya está elegido lo suelta y vuelve a mandar el propuesto. */
    const id = _pide.id, anterior = _pide.k;
    const k = Number(b.dataset.k);
    const nuevo = anterior === k ? null : k;
    b.disabled = true;
    const r = await Proyectos.actualizar(id, { plazo_k: nuevo });
    if (!r.ok) { avisarResultado(r); if (b.isConnected) b.disabled = false; return; }
    cerrarPide();
    await recargar();
    const v = ((_d && _d.ventanas) || []).find(x => x.proyecto_id === id);
    toast(nuevo === null ? 'Vuelve a mandar el propuesto' + (v ? ': ' + v.plazo_etiqueta : '')
                         : 'Ahora son ' + Taller.plazo(nuevo).etiqueta + (v && v.empezar ? ' · entra al taller el ' + fmtFecha(v.empezar) : ''),
      'ok', 8000, { label: 'Deshacer', fn: async () => { await Proyectos.actualizar(id, { plazo_k: anterior }); await recargar(); } });
    return;
  }

  if (q === 'copiar') { copiarOrden(b); return; }

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
