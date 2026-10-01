/* ============================================================================
   Tablero — la pantalla que abre la app, y contesta una sola pregunta:
   «¿qué tengo en el taller ahora mismo, y qué se está atrasando?»

   Hasta septiembre de 2026 la app abría en el Calendario, y antes de eso en la lista de
   avisos. Las dos contestaban preguntas buenas y ninguna era ESA. El calendario dice
   cuándo; la lista de avisos dice qué se rompe. El dueño abre la app para ver su taller.

   La ruta se sigue llamando «hoy» aunque este archivo se llame tablero.js. No es descuido:
   `./#/hoy` es la única dirección de la plataforma grabada en cosas que no controlamos —el
   start_url y el atajo del manifiesto YA INSTALADO, el icono de la pantalla de inicio del
   iPhone, el cotizador y el anidador—. Es la misma decisión que ya se tomó con
   «agenda»/«Calendario», y funcionó.

   Cuatro decisiones que se ven en todo el archivo:

   1. CERO ARITMÉTICA NUEVA. La columna vertebral es `Taller.ventanaTaller()`, que ya
      devuelve la etapa esperada, el atraso en días, la holgura, los cinco hitos y un
      `texto` en español listo para pantalla. Si aquí se decidiera cuándo algo va tarde
      habría dos respuestas a la misma pregunta, y la que se ve sería la que nadie probó.

   2. NUNCA `Reglas.refrescar()` EN ESTA PANTALLA. Tiene efecto secundario: llama a
      `emitirSalidasDerivadas` y ESCRIBE movimientos en el almacén. Como pantalla de
      entrada, eso pasaría a correr en cada arranque de cada teléfono. Los avisos son de
      «Qué atender», que es quien los pide.

   3. NINGUNA PETICIÓN DE RED EN EL PRIMER PINTADO. Solo IndexedDB, cinco lecturas en
      paralelo. Esta pantalla abre sin señal, en la calle, y es lo primero que alguien
      espera del día.

   4. EL ÚNICO NÚMERO QUE ESTE TABLERO INVENTA ES NINGUNO. Cada cifra sale de una función
      de la capa de datos que ya tiene prueba. Lo que no se puede saber —si el taller está
      lleno— no se dice: no hay porcentaje de ocupación ni semáforo de carga, porque no
      existe en ningún sistema cuánta gente hay ni cuántos trabajos caben.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Cot from '../datos/cotizador.js';
import * as Proy from '../datos/proyectos.js';
import * as Agenda from '../datos/agenda.js';
import * as Taller from '../datos/taller.js';
import * as Material from '../datos/material.js';
import * as Sync from '../datos/sync.js';
import { masDias, iniSemana } from '../nucleo/fechas.js';
import { $, esc, ico, money, toast, avisarResultado, vacio, hoyISO, fmtFecha, fmtFechaDia,
         abrirCapa, cerrarCapa, linkWa, telWa, ajustarAltoBarra, voz, segmento,
         filaTaller, bandaFrescura, medirMarco, esqueletoMarco, cifraQueCabe, scrollSuave, conservandoFoco }
  from '../nucleo/ui.js';

const { ETAPA_NOMBRE, ICO_ETAPA, claseEtapa, ORDEN, puedeMover } = Proy;
/* `tienePin` aparte y con respaldo, por lo mismo que en js/mod/mapa.js: en la ventana de un
   despliegue este archivo puede llegar nuevo con un js/datos/proyectos.js viejo ya cargado en
   la pestaña, que todavía no exporta esto, y el Tablero —la pantalla de entrada— moría al
   montar. Reproducido abriendo la pestaña en Material con la versión anterior, desplegando la
   nueva y tocando Tablero sin recargar. */
const coordPin = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
const tienePin = Proy.tienePin || (p => {
  if (!p) return false;
  const la = coordPin(p.lat), ln = coordPin(p.lng);
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
});
const { SIGUIENTE } = Taller;

/* ----- Estado del módulo -----
   Vive aquí y no en el DOM: la pantalla se rehace completa en cada toque y un estado
   guardado en atributos se iría con el nodo que lo llevaba. Sobrevive al desmontaje porque
   los módulos ES se cachean, y de eso se aprovecha `_vista` a propósito. */
let _cont = null;
let _ctx = null;
let _d = null;            // lo último que se leyó
let _etapa = null;        // el filtro de la línea de estaciones. null = todo
/* Qué se está viendo del taller: la carga, o la mesa de corte. NO es una ruta y no vive en el
   hash: `rutaPorNombre()` exige igualdad exacta de un solo segmento, así que `#/hoy/anidador`
   no casa con nada, cae al default Y deja la barra de direcciones mintiendo. Es lo único que
   se quiere RECORDAR entre visitas, así que `desmontar()` lo deja en pie a propósito: quien
   estaba en la mesa de corte y fue a ver un proyecto, al volver sigue en la mesa. */
let _vista = 'tablero';
let _origen = null;       // de qué proyecto se viene, cuando se entró con un pase
let _pide = null;         // qué está preguntando el modal, si está abierto
let _oyendo = false;
let _alClic = null;   // alClic envuelto con conservandoFoco()
let _reloj = null;        // el retardo del esqueleto
/* Las acciones del pintado actual. El botón lleva su ÍNDICE en un atributo: un índice no se
   puede escapar mal; un JSON dentro de un atributo dentro de una comilla, sí. Se vacía en
   cada `pintar()`, y eso NO es opcional: sin vaciarlo el arreglo crece sin techo y, peor, un
   toque en un botón del pintado anterior dispararía la acción de otro renglón. */
let _acciones = [];

/* ----- Lo que sobrevive al desmontaje, y por qué -----
   `desmontar()` lo pone todo en null y `pintar()` rehace la pantalla entera con innerHTML en
   cada toque. Tres cosas no pueden vivir en el DOM ni en lo que `desmontar()` borra:

   · `_nDecidir` (P11): cuántas cotizaciones sin decidir había la última vez que la tarjeta se
     pintó. Lo que decide si vuelve a latir es si la cuenta SUBIÓ, y eso es memoria de la
     sesión: si se olvidara al salir, volver a entrar contaría como «subió de 0 a 3» y latiría
     en cada visita. Es la misma regla que ya sigue Proyectos con su `_candN`.
   · `_pend` (P4): los «Ya se armó» que están en su mecha de cinco segundos, por id del
     proyecto. La escritura de verdad todavía no ocurrió; vive en el callback de la pieza 15, y
     un repintado, un cambio de filtro o la sincronización remontando la pantalla le tiran el
     botón que la llevaba. Aquí se recuerda de quién es cada mecha para volver a colgarla del
     botón nuevo (`rearmarMechas()`) con lo que le quedaba.
   · `_filas` (P29): el control de los renglones deslizables. Se cuelga del contenedor de la
     pantalla al montar y se suelta al desmontar. */
let _nDecidir = -1;
const _pend = new Map();
let _filas = null;
let _bordes = null;       // P25: el desvanecido de la tira de estaciones

/* Las piezas compartidas cuelgan de `window.Piezas` (js/piezas.js, guion clásico que index.html
   carga antes que los módulos). Se piden en el momento y no al importar: este archivo también lo
   lee node para la prueba de sintaxis, donde no hay ventana. */
const piezas = () => (typeof window !== 'undefined' && window.Piezas) || null;
/* ----- Una mecha viva NO se queda esperando en segundo plano -----
   La pieza 15 pausa su mecha cuando la app se oculta, para que quien se fue a contestar un
   WhatsApp no pierda su Deshacer. Pero aquí la escritura NO ha ocurrido: está colgada de esa
   mecha, y un teléfono que bloquea la pantalla —o un navegador que descarta la pestaña para
   ahorrar memoria— se llevaría el «Ya se armó» sin que nadie lo notara: el botón decía
   «Deshacer», nada avisó, y el trabajo seguía en «cortado» para siempre. Por eso al ocultarse
   se confirman todas, igual que la pieza hace con `pagehide`: nadie tocó «Deshacer», y escribir
   mientras la página sigue viva (oculta, pero viva) tiene más probabilidad de terminar que
   hacerlo en el último suspiro de un cierre. Se registra una vez, al cargar el módulo: los
   pendientes sobreviven a `desmontar()` y este oyente tiene que sobrevivir con ellos. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const f of Array.from(_pend.values())) { if (f.h) f.h.confirmar(); }
  });
}

/* Si el aparato es de dedo. La pista del gesto de deslizar solo se enseña ahí: con ratón el
   renglón que asoma 28 px por sí solo sería un tic raro sin nadie con la mano encima. */
const alTacto = () => {
  try { return window.matchMedia('(hover:none), (pointer:coarse)').matches; } catch (_) { return false; }
};

/* Las estaciones son las etapas que están EN la línea del proceso. `instalado`, `garantia` y
   `cancelado` no son estaciones: no están en ORDEN y `ventanaTaller` las devuelve como
   `estado:'hecho'`, así que quedan fuera por construcción, no por una lista aparte. */
/* Salen de ETAPAS y no de una lista escrita aquí —la misma decisión que mod/proyectos.js
   tomó para sus columnas—: el día que entre una etapa nueva antes de «listo», el tablero la
   enseña sin que nadie tenga que acordarse de este archivo. */
const ESTACIONES = Proy.ETAPAS.slice(0, Proy.ETAPAS.indexOf('listo') + 1);

/* El verbo de la acción que avanza cada etapa. Dice lo que YA PASÓ, en pasado, porque es lo
   que la persona está confirmando: nadie aprieta «cortar», aprieta «ya se cortó». */
const VERBO_AVANZA = {
  ganado: 'Ponerlo en diseño', en_diseno: 'Ya se cortó', cortado: 'Ya se armó',
  armado: 'Ya está listo', listo: 'Ya se instaló',
};

/* El orden en que se leen los renglones. Lo que no llega primero, y lo que no tiene fecha
   al final con su reloj corriendo. Es un orden ESTABLE: con los mismos datos sale la misma
   lista, porque una lista que se reordena sola entre dos aperturas no se puede aprender. */
const PESO = { no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4 };

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
  _cont = contenedor;
  _ctx = ctx;

  /* El pase que dejó el módulo anterior. De un solo uso: `recibir()` lo borra al leerlo. */
  const pase = (ctx && ctx.recibir) ? ctx.recibir() : null;
  /* ----- El trazo del vectorizador va a la Mesa de corte de la barra, no a esta -----
     El «Acomodar en hoja» del Cotizador empotrado (js/mod/cotizador.js) manda aquí, con
     `vista:'anidador'` y sin proyecto. Y aquí se perdía: este Tablero NO se conserva al
     cambiar de pestaña, así que al volver `pintarAnidador()` escribía el marco desde cero, y
     el anidador ya había borrado `al3d_anidar` al leerlo la primera vez —es una entrega de
     un solo uso a propósito, y pruebas/navegador/anidador.mjs lo exige—. La ruta `anidador`
     sí se conserva: se sigue de largo hacia ella, que lee la misma clave y guarda su marco
     vivo mientras se mira otra cosa. El pase del Calendario trae `proyecto_id` y se queda
     aquí, porque lo que trae es el aviso de origen que solo pinta esta pantalla.

     Debajo se pinta igual la CARGA del taller, sin `return`: ir a la mesa puede pedir
     confirmación (el Cotizador que se poda al abrirla, ver `montarDeVerdad` en app.js), y si
     la respuesta es quedarse, lo que queda en pantalla es esta, que no puede quedarse en
     blanco. La carga y no la mesa de aquí aunque fuera la última que se vio: su marco leería
     `al3d_anidar` —y lo borraría— antes que el de la ruta, que se quedaría vacío. */
  const aLaMesa = !!(pase && pase.vista === 'anidador' && !pase.proyecto_id && conMesa() &&
                     ctx && typeof ctx.ir === 'function');
  if (aLaMesa) { _vista = 'tablero'; ctx.ir('anidador'); }
  /* La mesa de corte solo para quien tiene la ruta `anidador`. El pase que la pide llega de
     dos sitios que no miran el rol —el «Acomodar en hoja» del Cotizador empotrado y el del
     Calendario—, así que la puerta está aquí y no en cada uno: pagos acababa en una mesa de
     corte que su barra no tiene y con las herramientas del pie escondidas. */
  if (pase && pase.vista && !aLaMesa) _vista = (pase.vista === 'anidador' && conMesa()) ? 'anidador' : 'tablero';
  _origen = (pase && pase.proyecto_id) ? pase : null;

  _cont.addEventListener('click', _alClic = conservandoFoco(alClic));
  const capa = $('pf-pide');
  if (capa) capa.addEventListener('click', alClicPide);
  _oyendo = true;

  /* Las dos piezas que se cuelgan UNA vez del contenedor y sobreviven a los repintados
     (escuchan en él, no en sus hijos): los renglones que se deslizan (P29) y el borde
     desvanecido de la tira de estaciones, que en el teléfono se recorre de lado (P25). El
     borde se pide por SELECTOR: la tira se rehace en cada toque y un elemento suelto se
     perdería con el primer repintado. */
  const P = piezas();
  if (P) {
    if (P.filasDeslizables) _filas = P.filasDeslizables(_cont, { pista: 'al3d_pista_tablero' });
    if (P.bordesDesvanecidos) _bordes = P.bordesDesvanecidos('.tb-linea', { eje: 'x' });
  }

  /* La base cerrada NO se pinta como un taller vacío. La diferencia entre «todavía no
     tienes proyectos» y «la base no abrió» es la diferencia entre estar tranquilo y perder
     una tarde buscando datos que están enteros. */
  if (!DB.estado().ok) {
    _cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo',
      DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    return;
  }

  /* El esqueleto con retardo que vivía aquí —180 ms, para que una lectura de IndexedDB que
     llega antes no deje ni un parpadeo— lo pone ahora el router para TODOS los módulos, con
     el mismo umbral y la misma geometría (esqueletoModulo, en nucleo/ui.js), y lo quita en
     cuanto esta sección tiene algo pintado. Ponerlo también aquí era pintarlo dos veces. */
  await recargar();
}

/** El globo de la barra sin montar la pantalla: lo llama app.js al arrancar y después de
 *  cada sincronización, para que los pendientes se vean sin tener que entrar aquí. Solo lee;
 *  no pinta nada. */
export async function contar() {
  const d = await leer();
  return { hoy: d.V.filter(v => v.estado === 'no_llega').length };
}

export function desmontar() {
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_relojMarco) { clearTimeout(_relojMarco); _relojMarco = null; }
  if (_cont && _oyendo) _cont.removeEventListener('click', _alClic);
  const capa = $('pf-pide');
  if (capa) capa.removeEventListener('click', alClicPide);
  /* Si el modal quedó abierto —se cambió de rol con la pregunta enfrente— se cierra: la capa
     es del documento, no de este módulo, y dejarla puesta bloquea la pantalla nueva. */
  if (_pide) { _pide = null; cerrarCapa('pf-pide'); }
  /* La barra fija se limpia aquí y no en el que sigue: si el módulo siguiente no tiene
     acción principal, el botón de esta pantalla se quedaría flotando encima de la suya y el
     primer dedo del día lo apretaría creyendo que es de lo que está viendo. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
  /* Se suelta la guarda del remonte: la pide quien sostiene un marco vivo, y este ya no lo
     sostiene. El router también la apaga al montar el siguiente, así que esto es cinturón y
     tirantes, no la única defensa. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  window.removeEventListener('resize', alRedimensionar);
  /* Los oyentes que las piezas colgaron de este contenedor se sueltan con él: la sección se
     reutiliza para el siguiente módulo y un renglón deslizable que siguiera escuchando ahí
     atendería arrastres de una pantalla que ya no es esta. */
  if (_filas) { _filas.destruir(); _filas = null; }
  if (_bordes) { _bordes.destruir(); _bordes = null; }
  _cont = null; _ctx = null; _d = null; _etapa = null; _oyendo = false; _acciones = [];
  /* `_vista` NO se anula: es lo único que se quiere recordar entre visitas. */
}

/* ============================================================================
   Leer — cinco lecturas, todas locales, ninguna a la red
   ============================================================================ */

async function leer() {
  const hoy = hoyISO();                     // UN solo `hoy` para todas las filas del pintado

  const [todos, insts, cts, mat, fres] = await Promise.all([
    /* TODOS, cancelados incluidos: la tarjeta de «sin decidir» necesita sus folios para no
       volver a preguntar por una cotización que alguien ya rechazó. */
    Proy.listar({}),
    Agenda.listar({ vivas: true }),
    Material.constantes(),
    /* Una sola lectura del almacén para las treinta filas. `dictamen()` es puro sobre esto,
       y es EL MISMO juez que pinta el semáforo del Calendario: preguntarle a
       `Stock.listaCompra()` por separado sería tener dos respuestas a la misma pregunta. */
    Agenda.contextoMaterial(),
    Sync.frescura(),
  ]);

  const vivos = (todos || []).filter(p => p && p.etapa !== 'cancelado');

  /* La instalación viva de cada proyecto. La primera que aparezca: `Agenda.listar({vivas})`
     ya excluye las canceladas, y un proyecto con dos vivas es un dato que la agenda no
     produce. */
  const instDe = new Map();
  for (const i of (insts || [])) {
    if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
  }

  const porId = new Map(vivos.map(p => [p.id, p]));

  /* Las ventanas. Se descartan las de lo que ya se instaló y lo cancelado: el taller es lo
     que TODAVÍA está en la mesa. */
  const V = vivos
    .map(p => Taller.ventanaTaller(p, instDe.get(p.id) || null, { hoy, cts }))
    .filter(v => v && v.estado !== 'cancelado' && v.estado !== 'hecho');

  /* El semáforo de material de un proyecto, con el contexto ya leído. */
  const semDe = id => Agenda.dictamen(
    [{ proyecto_id: id, titulo: (porId.get(id) || {}).nombre || '',
       fecha: (instDe.get(id) || {}).fecha || null,
       /* Para que el dictamen no le diga «dale recalcular material» a un trabajo que vino de
          la hoja y no tiene partidas de dónde calcularlo. */
       de_hoja: !!(porId.get(id) || {}).de_hoja }],
    mat, hoy);

  /* Quién está dentro de su ventana hoy. Solo los anclados en una instalación: los otros son
     una hipótesis contada desde el día de la venta y no un trabajo con día prometido. */
  const enTaller = V.filter(v => v.ancla === 'instalacion' && v.empezar <= hoy && v.listo >= hoy);

  /* Las cotizaciones autorizadas que nadie decidió. Solo dirección: es la única que puede
     contestar, y es el eslabón sin el cual no hay proyecto, ni agenda, ni material. */
  const pendientes = Prefs.rol() === 'direccion'
    ? Cot.sinDecidir(new Set((todos || []).map(p => p && p.folio_global).filter(Boolean)), 0)
    : [];

  /* «Esta semana» es la semana del CALENDARIO, de hoy al domingo: la misma que abre «Ver la
     semana en el Calendario», que arranca en lunes (`iniSemana`). Con hoy+6, el jueves la
     tarjeta contaba el miércoles siguiente y el botón de abajo abría una semana donde no
     estaba. Y sin las ya hechas: lo que se instaló el lunes ya no «se instala». */
  const semanaFin = masDias(iniSemana(hoy), 6);
  const VIVAS_SIN_MARCAR = ['propuesta', 'confirmada', 'reagendada'];

  return {
    hoy, V, vivos, porId, instDe, mat, fres, enTaller, pendientes, semDe,
    carga: Taller.cargaDeDia(hoy, V),
    semana: (insts || []).filter(i => i && i.fecha >= hoy && i.fecha <= semanaFin && i.estado !== 'hecha'),
    vencidas: (insts || []).filter(i => i && i.fecha && i.fecha < hoy &&
                                        VIVAS_SIN_MARCAR.includes(i.estado)),
    /* La misma prueba que usa el Mapa. Un proyecto sin ubicar se guarda con `lat: null`, y
       `Number(null)` es 0, que `isFinite` da por bueno: con la prueba de antes esta cuenta
       decía siempre 0 mientras el Mapa, para los mismos datos, decía «3 sin ubicar». */
    sinUbicar: vivos.filter(p => !tienePin(p)).length,
    /* Sin las hechas, igual que `semana`: marcada la última de la semana, el estado vacío
       anunciaba como «la siguiente» la que se acababa de hacer. */
    proxInst: (insts || []).filter(i => i && i.fecha && i.fecha >= hoy && i.estado !== 'hecha')
      .map(i => i.fecha).sort()[0] || null,
  };
}

async function recargar() {
  if (!_cont) return;
  const d = await leer();
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (!_cont) return;          // se cambió de módulo mientras se leía
  _d = d;
  pintar();
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  const d = _d;
  if (!_cont || !d) return;
  const rol = Prefs.rol();
  const veDinero = Prefs.veDinero();

  _acciones = [];

  /* `_vista` sobrevive a los montajes, y el rol puede cambiar entre dos: quien estaba en la
     mesa de corte y pasa a pagos no puede seguir en ella. */
  if (_vista === 'anidador' && !conMesa()) _vista = 'tablero';
  if (_vista === 'anidador') { pintarAnidador(); return; }

  /* Se suelta la guarda del remonte al volver de la mesa de corte: aquí no hay marco que
     proteger, y dejarla puesta significaría que un proyecto ganado en el cotizador ya no
     repinta este tablero. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  window.removeEventListener('resize', alRedimensionar);

  const izq = [
    noLlegan(d),
    decidir(d, rol),
    lineaEstaciones(d),
    listaTaller(d),
  ].filter(Boolean).join('');

  const der = [
    hoyEnElTaller(d),
    seInstalaEstaSemana(d),
    faltaMaterial(d, rol),
  ].filter(Boolean).join('');

  /* La tira de estaciones se recorre de lado en el teléfono (P25) y `innerHTML` la devolvería al
     principio: tocar «Listo para instalar» —la última— la dejaba fuera de la vista apenas se
     filtraba. Se guarda hasta dónde estaba y se devuelve. */
  const tira = _cont.querySelector('.tb-linea');
  const alLado = tira ? tira.scrollLeft : 0;

  _cont.innerHTML =
    segLente() +
    bandaFrescura(d.fres, Sync.disponible()) +
    cuentas(d, rol, veDinero) +
    '<div class="ag-cuerpo dos tb-cuerpo taller-primero">' +
      '<div>' + izq + '</div>' +
      '<div class="card"><div class="card-b">' + der + '</div></div>' +
    '</div>' +
    pie();

  if (alLado) { const t = _cont.querySelector('.tb-linea'); if (t) t.scrollLeft = alLado; }
  publicarCuentas(d);
  pintarMbar(d, rol);
  rodarCuentas(_cont);
  rearmarMechas();
  /* La pista del gesto, DESPUÉS de pintar y una sola vez por aparato (la pieza lo recuerda en
     localStorage): el primer renglón asoma sus acciones y regresa. Sin movimiento reducido. */
  if (_filas && alTacto()) _filas.pista();
}

/* ----- El segmento de sub-vista -----
   Dos lentes sobre el mismo taller: la carga —qué hay y qué se atrasa— y la mesa de corte
   —cómo caen las piezas en la lámina—. Es un segmento y no dos rutas porque son dos formas
   de mirar el mismo momento del trabajo, y porque el Anidador no puede ser una ruta: ver §5. */
/* Si este rol tiene la mesa de corte. Sale de la lista de rutas de app.js —`ctx.tieneRuta`—,
   que es la única que dice qué ve cada rol; la segunda línea es para cuando no hay contexto,
   con la misma regla que tiene hoy esa lista. Sin la mesa, el segmento no se pinta: un
   interruptor con una sola posición es un letrero. */
function conMesa() {
  if (_ctx && typeof _ctx.tieneRuta === 'function') return _ctx.tieneRuta('anidador');
  return Prefs.rol() !== 'pagos';
}

function segLente() {
  if (!conMesa()) return '';
  return segmento([{ v: 'tablero', t: 'Carga del taller' }, { v: 'anidador', t: 'Mesa de corte' }],
    _vista, 'data-vista', 'Qué ves del taller');
}

/* ============================================================================
   La mesa de corte — el Anidador, empotrado

   ----- POR QUÉ ES UN <iframe> Y NO SE PUEDE PORTAR A MÓDULO. NO LO «OPTIMICES». -----

   las dos llamadas a `p.require`/`p2.require` de `launchWorkers` en `anidador-vectores/js/svgnest.js` arrancan los Web Workers con
   `evalPath: 'js/lib/eval.js'` —un LITERAL RELATIVO— y `js/lib/parallel.js:142/152/167` hace
   `new Worker(this.options.evalPath)`. `new Worker(url)` resuelve contra la URL base del
   DOCUMENTO, no del script:

     · servido desde /anidador-vectores/  →  /anidador-vectores/js/lib/eval.js   ✔
     · servido desde la raíz, donde vive la plataforma  →  /js/lib/eval.js       ✘ no existe

   Y no hay plan B; las tres cosas están verificadas en el código vendorizado:
     1. `evalPath` NO es configurable: `SvgNest.config()` (svgnest.js) solo acepta
        curveTolerance, spacing, rotations, populationSize, mutationRate, useHoles y
        exploreConcave.
     2. La rama de Blob + URL.createObjectURL que salvaría el caso (parallel.js:158-163) está
        MUERTA: el motor siempre llama `p.require(...)` (las dos ramas de `launchWorkers` en svgnest.js), así
        que `requiredScripts.length !== 0` y siempre se toma la rama del evalPath.
     3. EL FALLO ES MUDO. No lanza excepción: deja un cálculo que nunca termina. Está escrito
        como razón de existir de su prueba —pruebas/navegador/anidador.mjs:5-8, «una carpeta
        movida o un archivo que falte no da error en la página: da un cálculo que nunca
        termina»— y el autodiagnóstico «Soporte del navegador» de anidador-vectores/js/app.js cubre file:// y
        la falta de window.Worker, pero NO este caso.

   Editar el código vendorizado tiene precio: anidador-vectores/README.md dice que svgnest.js,
   svgparser.js y js/lib/* son el master de SVGnest salvo dos cambios locales marcados con
   AL3D (la ruta de eval.js y la «corrida»), y portarlo a módulo exigiría un tercero, que ya
   tocaría cómo arrancan los workers. El marco es la forma de embeberlo sin eso.

   Y de paso resuelve cuatro cosas más, gratis: los cinco oyentes a nivel de `document` que su
   app.js instala y nunca quita (dragenter, dragover, dragleave, drop, paste) se quedan
   dentro del marco en vez de secuestrar el arrastre y el Ctrl+V de los demás módulos para
   siempre; las trece colisiones de id (`toast`, `vozStatus` y once símbolos del sprite)
   dejan de existir; `window.SvgNest` sigue siendo un singleton por documento, que es lo que
   se quiere; y destruir el marco MATA sus Web Workers, que es justo lo que `SvgNest.stop()`
   no hace —solo pone `working = false`, sin `terminate()`.
   ============================================================================ */

function pintarAnidador() {
  /* La guarda: sin esto, el oyente de 'storage' del router remonta este módulo cuando el
     cotizador guarda, `montarDeVerdad` hace innerHTML='' y el marco muere y vuelve a cargar
     el motor entero a media faena. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(true);

  /* Con su esqueleto encima, como el marco del cotizador: el anidador carga diez guiones
     —clipper.js solo ya pesa— y el marco se quedaba en blanco entre 700 y 950 ms medidos con
     la red local. `.pf-marco-cargando` deja el iframe en opacidad cero y enseña la silueta
     del paso a paso y de la mesa; `vigilarMarcoAnidador` la quita cuando el motor ya está. */
  _cont.innerHTML =
    segLente() +
    origenHTML() +
    '<div class="pf-marco-caja pf-marco-cargando">' +
      esqueletoMarco('anidador', 'Abriendo la mesa de corte…') +
      '<iframe class="pf-marco" id="pf-anid-marco" src="anidador-vectores/" ' +
      'title="Anidador de vectores — acomodo de piezas en la lámina"></iframe>' +
    '</div>';

  /* Un iframe no tiene alto propio: sin medirlo se queda en los 150 px de la especificación.
     Se mide después de que el navegador colocó la caja, no en el mismo tick. */
  requestAnimationFrame(() => medirMarco('pf-anid-marco'));
  window.addEventListener('resize', alRedimensionar);
  _intentosMarco = 0;
  if (_relojMarco) clearTimeout(_relojMarco);
  _relojMarco = setTimeout(vigilarMarcoAnidador, 150);

  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
  if (_ctx && _ctx.ponerCuenta) _ctx.ponerCuenta('hoy', 0);
}

let _rzMarco = 0;
function alRedimensionar() {
  if (_rzMarco) return;
  _rzMarco = requestAnimationFrame(() => { _rzMarco = 0; medirMarco('pf-anid-marco'); });
}

/* ----- El esqueleto del marco del anidador -----
   Se pregunta al documento de dentro, que es del mismo origen: está vivo cuando su propio
   arranque terminó (se quita `html.arrancando` al final de anidador-vectores/js/app.js) y
   publicó `window.Anidador`, que es lo último que hace. Cien intentos de 150 ms son quince
   segundos; si no llega, el esqueleto se quita igual y se deja ver el marco tal cual: el
   anidador trae su propio diagnóstico de por qué no arranca (sin Workers, file://), y taparlo
   sería esconder justo lo que hay que leer. */
let _relojMarco = null;
let _intentosMarco = 0;
function vigilarMarcoAnidador() {
  _relojMarco = null;
  const m = $('pf-anid-marco');
  if (!m || !_cont) return;
  let vivo = false;
  try {
    const d = m.contentDocument, w = m.contentWindow;
    vivo = !!(d && d.getElementById('an-ir') && !d.documentElement.classList.contains('arrancando') && w && w.Anidador);
  } catch (_) { vivo = false; }
  if (!vivo && ++_intentosMarco <= 100) {
    if (_intentosMarco === 27) {
      const t = _cont.querySelector('.pf-marco-esq-t .tx');
      if (t) t.textContent = 'Sigue cargando el motor de acomodo…';
    }
    _relojMarco = setTimeout(vigilarMarcoAnidador, 150);
    return;
  }
  const caja = m.closest('.pf-marco-caja');
  if (!caja) return;
  caja.classList.remove('pf-marco-cargando');
  caja.classList.add('pf-marco-listo');
  setTimeout(() => { for (const e of caja.querySelectorAll('.pf-marco-esq,.pf-marco-esq-t')) e.remove(); }, 450);
  medirMarco('pf-anid-marco');
}

/* ----- De dónde vienes, y el límite dicho con palabras -----
   El proyecto NO GUARDA VECTOR: `js/datos/proyectos.js` congela `aiFile` a
   `{name, type, url:''}` y no hay campo SVG, porque el vectorizador vive dentro de
   cotizador.html. Así que un pase desde un proyecto NO puede escribir `al3d_anidar`: el
   anidador lo leería, no encontraría `svg` y se quedaría vacío, pareciendo que no recibió
   nada. Se dice de dónde vienes y se ofrece el único camino que de verdad trae el trazo.
   Prometer más sería inventar un dato. */
function origenHTML() {
  /* El aviso se llamaba `enTelefono` y se pintaba SIEMPRE, también en la computadora, donde
     el anidador empotrado de aquí abajo sí calcula: la frase «se calcula en la computadora…
     aquí puedes ver el resultado» se contradecía con la pantalla que la seguía. Ahora dice lo
     mismo sin mentir en ninguno de los dos anchos. */
  /* Dos frases distintas, y cada una una sola vez. La invitación a soltar el SVG solo cuando
     no se sabe de dónde vienes: si vienes de un proyecto, el párrafo de abajo ya la da con su
     nombre, y las dos seguidas decían lo mismo dos veces. El aviso del teléfono va siempre,
     porque dice otra cosa. */
  const enTelefono = '<p class="hintnote">' + ico('i-aviso') +
    ' <span>En el teléfono conviene solo consultar: el archivo que alimenta el láser se ' +
    'exporta desde la computadora.</span></p>';
  if (!_origen) {
    return '<p class="hintnote">' + ico('i-anidar') +
      ' <span>Suelta aquí el SVG o tráelo del vectorizador del Cotizador.</span></p>' + enTelefono;
  }
  return '<p class="hintnote">' + ico('i-anidar') +
    ' <span>Vienes de <b>' + esc(_origen.nombre || 'un proyecto') + '</b>' +
    (_origen.folio ? ' — folio ' + esc(_origen.folio) : '') +
    '. Suelta aquí el SVG, o tráelo del vectorizador del Cotizador: el proyecto guarda el ' +
    'nombre del archivo, no el trazo.</span></p>' +
    '<p class="no-papel">' +
    btn('Vectorizar en el Cotizador', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'cotizador' }) +
    '</p>' + enTelefono;
}

/* ----- La cinta de cuentas -----
   Los números que importan, grandes y arriba. El número SE PINTA SIEMPRE, aunque sea 0, para
   que la cinta no cambie de ancho entre dos aperturas: un renglón que aparece y desaparece
   mueve todo lo de abajo justo cuando alguien va a tocarlo.

   Las dos primeras usan la fórmula LITERAL de la lente de Taller del Calendario, para que el
   número no cambie de valor al navegar. «No llegan» es un subconjunto de «Van tarde» a
   propósito: la primera es apurarse, la segunda es una llamada telefónica hoy.

   ----- P3 · Cada cuenta es una puerta a lo que cuenta -----
   Antes las cifras eran párrafos: para ver cuáles eran los «3 van tarde» había que buscarlos
   en la lista, y la barra fija llevaba a una tarjeta sin decir cuál. Ahora la cuenta con algo
   que contar es un BOTÓN que baja a su tarjeta (o abre la pantalla donde se atiende) y la
   enciende una vez con las esquinas de la pieza 17. Una cuenta en 0 sigue siendo un párrafo
   sin flecha: no lleva a ningún lado, y un botón que no hace nada es peor que ninguno.

   Se distinguen de la línea de estaciones de abajo —que también es `.pf-cuenta`, pero FILTRA y
   lleva `aria-pressed`— por la flechita de «ir» que la hoja de estilos pone tras la etiqueta, y
   por el nombre que oye el lector: «…, ir a Falta material». El destino se dice con palabras:
   el color y la flecha solos no lo cuentan. */
function cuentas(d, rol, veDinero) {
  const tarde = d.V.filter(v => v.atraso_dias > 0).length;
  const noLlega = d.V.filter(v => v.estado === 'no_llega').length;
  const sinFecha = d.V.filter(v => v.ancla !== 'instalacion').length;
  const sinMat = d.enTaller.filter(v => {
    const e = d.semDe(v.proyecto_id).estado;
    return e === 'falta' || e === 'grave';
  }).length;

  /* Los destinos de la pantalla misma son selectores sobre lo que `pintar()` acaba de escribir
     (`data-destino` en cada tarjeta, `data-tarde` en cada renglón con atraso); el de «Ganados
     sin fecha» es un pase al Calendario, en la lente de Taller, que es donde esos proyectos
     tienen su grupo «con el reloj corriendo». Sin la ruta (el rol no la tiene) no hay botón. */
  const aCal = puedeIr('agenda') ? { tipo: 'pasar', ruta: 'agenda', dato: { lente: 'taller' },
    que: 'abrir el Calendario' } : null;

  const c = [];
  c.push(unaCuenta('hoy', d.enTaller.length, 'En el taller hoy', false, false,
    { tipo: 'bajar', sel: '[data-destino="hoy"]', que: 'ir a Hoy en el taller', donde: 'Hoy en el taller' }));
  c.push(unaCuenta('tarde', tarde, tarde === 1 ? 'Va tarde' : 'Van tarde', tarde > 0, false,
    { tipo: 'bajar', sel: '[data-tarde]', que: tarde === 1 ? 'ir al que va tarde' : 'ir al primero que va tarde',
      donde: tarde === 1 ? 'el trabajo que va tarde' : 'el primero de los trabajos que van tarde' }));
  c.push(unaCuenta('nollega', noLlega, noLlega === 1 ? 'No llega a su fecha' : 'No llegan a su fecha',
    false, noLlega > 0, { tipo: 'bajar', sel: '[data-destino="nollegan"]', que: 'ir a No llegan a su fecha', donde: 'No llegan a su fecha' }));
  if (rol === 'direccion' || rol === 'fabricacion') {
    c.push(unaCuenta('sinmat', sinMat, sinMat === 1 ? 'Trabajo sin material' : 'Trabajos sin material', sinMat > 0, false,
      { tipo: 'bajar', sel: '[data-destino="faltamaterial"]', que: 'ir a Falta material', donde: 'Falta material' }));
  }
  c.push(unaCuenta('sinfecha', sinFecha, sinFecha === 1 ? 'Ganado sin fecha' : 'Ganados sin fecha', sinFecha > 0, false, aCal));

  /* El importe NO EXISTE con rol fabricación: `veDinero()` es false y la capa de datos
     devuelve null, no 0. El elemento no se pinta; no se difumina, y nunca se imprime $0. */
  if (veDinero) {
    const suma = d.enTaller.reduce((s, v) => {
      const p = d.porId.get(v.proyecto_id);
      const n = Number(p && p.precio_auth);
      return s + (isFinite(n) ? n : 0);
    }, 0);
    if (suma > 0) {
      c.push('<p class="pf-cuenta dinero">' + cifraQueCabe(money(suma)) + 'En el taller</p>');
    }
  }
  return '<div class="pf-cuentas">' + c.join('') + '</div>';
}

/* `clave` es lo que le da memoria al odómetro (P18): la cinta se rehace entera en cada toque y
   el valor anterior no puede vivir en el nodo, que se va con el repintado. */
function unaCuenta(clave, n, etiqueta, urge, mal, destino) {
  const num = Number(n || 0);
  const clase = 'pf-cuenta' + (mal ? ' mal' : (urge ? ' urge' : ''));
  const cifra = '<b data-cuenta="' + esc(clave) + '">' + num + '</b>';
  if (!destino || !num) {
    return '<p class="' + clase + '">' + cifra + '<span class="pf-cuenta-t">' + esc(etiqueta) + '</span></p>';
  }
  const i = _acciones.push(destino) - 1;
  return '<button type="button" class="' + clase + ' va" data-acc="' + i + '" data-cuenta-va="' + esc(clave) + '">' +
    cifra + '<span class="pf-cuenta-t">' + esc(etiqueta) + '</span>' +
    '<span class="solo-voz">, ' + esc(destino.que) + '</span></button>';
}

/* Si este rol tiene esa ruta. Sale del router —`ctx.tieneRuta`— y no del rol: la regla de quién
   ve qué vive en un solo lugar (RUTAS, en app.js). */
function puedeIr(ruta) {
  return !!(_ctx && typeof _ctx.tieneRuta === 'function' && _ctx.tieneRuta(ruta));
}

/* ----- P18 · las cuentas ruedan cuando algo cambió, nunca al entrar -----
   La pieza 1 recuerda lo último que pintó cada cifra por su `clave` —no por el nodo— y, si
   cambió, la hace rodar del valor viejo al nuevo con un «+1» breve. Lo que decide CUÁNDO tiene
   sentido no está aquí sino en el router: entrar a la pantalla olvida todo (`olvidarCifras()`
   de app.js, y volver al Tablero una hora después y ver «2» rodar hasta «3» diría que algo pasó
   cuando llevaba una hora ahí), y un remonte en silencio —la sincronización trajo algo de otro
   teléfono— NO olvida: la cuenta que cambió rueda desde lo que se estaba viendo. Por eso no se
   pasa `animar:` ni se cuenta aquí «el primer pintado».

   El importe rueda sin «+1»: «+$1,200.00» no cabe junto a una cifra que ya llena su tarjeta
   (`cifraQueCabe()` la achica hasta que quepa) y, en pesos, lo que cambió se lee en la cifra. Se
   le pone clave por su clase porque `cifraQueCabe()` es de ui.js y no lleva `data-cuenta`. */
function rodarCuentas(raiz) {
  const P = piezas();
  if (!P || !P.rodarCifra || !raiz) return;
  for (const b of raiz.querySelectorAll('.pf-cuenta b')) {
    const dinero = !b.dataset.cuenta && !!b.closest('.pf-cuenta.dinero');
    const clave = b.dataset.cuenta || (dinero ? 'dinero' : '');
    if (!clave) continue;
    P.rodarCifra(b, b.textContent, { clave: 'tb:' + clave, delta: !dinero });
  }
}

/* ----- «No llegan a su fecha» -----
   La lista de llamadas del día, y lo único de esta pantalla que va arriba de todo. Si está
   vacía LA TARJETA NO EXISTE: no se pinta «no hay ninguno», porque un hueco que dice que
   todo está bien se aprende a saltar y el día que diga otra cosa nadie lo va a leer. */
function noLlegan(d) {
  const vs = d.V.filter(v => v.estado === 'no_llega');
  if (!vs.length) return '';
  const filas = vs.map(v => filaTaller(v, d.hoy, {
    icono: 'i-aviso',
    plazoEditable: false,
    accionesHTML:
      btn('Mover la fecha', 'btn btn-gho pf-btn-corto', { tipo: 'agendar', id: v.proyecto_id }) +
      btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'abrir', id: v.proyecto_id }),
  })).join('');
  /* `data-destino` en el encabezado y no en la tarjeta: con seis llamadas la tarjeta mide más
     que la pantalla del teléfono y las esquinas de la pieza 17 rodearían un rectángulo de
     cuyas esquinas de abajo no se ve ninguna. El título es lo que dice a dónde llegaste. */
  return '<div class="card"><div class="card-h" data-destino="nollegan"><h2>' + ico('i-aviso') +
    ' No llegan a su fecha <span class="folio">' + vs.length + '</span></h2></div>' +
    '<div class="card-b">' + filas + '</div></div>';
}

/* ----- La tarjeta que late -----
   Es lo único de la plataforma que late y tiene que seguir siendo lo único: dos cosas
   latiendo son cero cosas latiendo. Va aquí porque sin ese toque no hay proyecto, ni
   agenda, ni material, ni tablero: todo lo demás de esta pantalla está vacío por
   construcción.

   El flujo completo —«Se ganó» / «No se dio», una por una— vive en Proyectos y no se duplica:
   aquí es un renglón con la cuenta y la puerta. La puerta es Proyectos y NO «Qué atender»:
   esa lista solo enseña las autorizadas que llevan siete días sin decidir (la regla A6), así
   que la de ayer —que esta tarjeta sí cuenta— no estaba ahí y el botón que late mandaba a una
   lista sin ella. Es lo mismo que ya dice el Calendario en `pintarDecidir`. */
function decidir(d, rol) {
  const n = d.pendientes.length;
  if (rol !== 'direccion' || !n) { if (rol === 'direccion') _nDecidir = n; return ''; }
  /* ----- P11 · el latido se apaga ----- `.cand-partidas` ya late TRES veces y se calla
     (sistema.css), pero esta tarjeta se rehace con innerHTML en cada toque —cambiar el filtro de
     estaciones, la sincronización— y un nodo recién nacido arranca su animación otra vez: en la
     práctica volvía a latir con cualquier cosa que se tocara, que es un bucle escrito de otra
     manera. Se decide por el DATO y no por el nodo: late cuando la cuenta SUBIÓ respecto a la
     última vez que se pintó (o cuando es la primera vez de la sesión); si baja o se queda
     igual nace con `.quieta` y el aro no corre (la regla vive en plataforma.css, junto a la de
     Proyectos). La barra fija «Decidir» sigue siendo la entrada, latiendo o no. */
  const late = n > _nDecidir;
  _nDecidir = n;
  return '<div class="cand-partidas pf-decidir' + (late ? '' : ' quieta') + '">' +
    '<p class="cp-txt">' + ico('i-venta') + ' <b>' +
    (n === 1 ? 'Una cotización autorizada' : n + ' cotizaciones autorizadas') +
    '</b> sin decidir. Sin este toque no hay proyecto, ni agenda, ni material, ni nada en ' +
    'este tablero: es lo único que nadie más puede contestar.</p>' +
    '<div class="pf-fila-acc">' +
      btn(n === 1 ? 'Decidir la cotización' : 'Decidir ' + n + ' cotizaciones',
          'btn btn-ok pf-btn-corto tb-decidir-cuerpo', { tipo: 'ir', ruta: 'proyectos' }) +
    '</div></div>';
}

/* ----- La línea de estaciones -----
   Cinco bloques en el ORDEN DEL PROCESO, nunca ordenados por cantidad: es una tubería, no un
   ranking. Cada bloque filtra la lista de abajo, y el filtro es estado de módulo y NO del
   hash: filtrar no es navegar y no debe ensuciar el historial ni el botón de atrás.

   El `<em>` de «2 atrasados» es EL indicador que hoy no se pinta en ningún lado, y es
   literalmente la pregunta del dueño: qué debería estar cortado y sigue en diseño. Sale
   gratis de la misma ventana, y es una LECTURA: el tablero muestra la discrepancia, no la
   corrige. */
function lineaEstaciones(d) {
  if (!d.V.length) return '';
  const bloques = ESTACIONES.map(e => {
    const dentro = d.V.filter(v => v.etapa_real === e);
    /* Atrasado es lo MISMO que cuenta la cinta de arriba: días de atraso ya cumplidos. Con la
       comparación de etapas, el día del hito el proyecto era «justo» para la cinta («1 va
       tarde») y «atrasado» para la estación («2 atrasados»), en la misma pantalla y para los
       mismos dos trabajos: la etapa esperada avanza EL día del hito y `atraso_dias` solo
       cuenta los días que ya pasaron. Dos definiciones de atraso a diez centímetros una de
       otra hacen que no se crea ninguna. */
    const atras = dentro.filter(v => v.atraso_dias > 0).length;
    /* Una sola vez y para los dos sitios: el rótulo visible decía «1 atrasado» y el title del
       mismo botón «1 atrasados». */
    const atrasTxt = atras + ' atrasado' + (atras === 1 ? '' : 's');
    const on = _etapa === e;
    return '<button type="button" class="pf-cuenta tb-etapa' + (on ? ' on' : '') + '"' +
      ' data-etapa="' + e + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
      ' title="' + esc(ETAPA_NOMBRE[e]) + (atras ? ' · ' + atrasTxt : '') + '">' +
      '<b>' + dentro.length + '</b>' + esc(ETAPA_NOMBRE[e]) +
      (atras ? '<em>' + atrasTxt + '</em>' : '') +
      '</button>';
  }).join('');
  /* ----- P25 · la tubería -----
     El comentario de arriba decía «es una tubería, no un ranking» y nada la dibujaba: eran cinco
     cajas iguales a las cuentas, y en el teléfono se partían en dos renglones. Ahora la hoja de
     estilos pone un tramo de tubo entre una estación y la siguiente —`.tb-etapa::after`— y, en
     el teléfono, la línea es UNA tira que se recorre de lado en vez de dos renglones. El orden
     también se DICE en el nombre del grupo: el tubo es un dibujo, no la única forma de saberlo.
     Siguen siendo filtros, con `aria-pressed`; no llevan la flecha de «ir» de las cuentas. */
  return '<div class="pf-cuentas tb-linea" role="group" aria-label="Filtrar por etapa, en el orden del proceso">' +
    bloques + '</div>';
}

/* ----- La lista del taller -----
   El mismo renglón que pinta la lente de Taller del Calendario, con la acción que aquí sí
   tiene sentido. Tres vacíos, que son tres cosas distintas y no una: no tener nada, no tener
   nada HOY, y no tener fechas. Confundirlos es lo que hace que alguien no sepa si el sistema
   está vacío o roto. */
function listaTaller(d) {
  if (!d.vivos.length) {
    return caja(vacioTaller('Todavía no hay nada en el taller',
      'Cuando una cotización autorizada se marque como ganada, el proyecto aparece aquí con su ventana de taller.',
      btn('Abrir el Cotizador', 'btn btn-pri', { tipo: 'ir', ruta: 'cotizador' })));
  }
  if (!d.V.length) {
    return caja(vacioTaller('Nada en la mesa',
      'Lo que hay ya está instalado o cerrado. En Proyectos lo ves con su etapa.',
      btn('Ver los proyectos', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'proyectos' })));
  }
  if (!d.V.some(v => v.ancla === 'instalacion')) {
    return caja(vacioTaller('Nada tiene fecha de instalación',
      'Sin fecha no hay ventana de taller, no hay alarmas en el calendario y el material no sabe para cuándo.',
      btn('Ponerles fecha', 'btn btn-pri', { tipo: 'ir', ruta: 'agenda' })));
  }

  const lista = d.V.filter(v => !_etapa || v.etapa_real === _etapa).slice().sort(ordenar);

  if (!lista.length) {
    /* Un filtro que no deja nada NO es un taller vacío. Se dice qué filtro es y se ofrece
       soltarlo, porque «o el control enseña el filtro, o el filtro no existe». */
    return caja('<div class="ag-grupo">' + ico(ICO_ETAPA[_etapa] || 'i-taller') +
      esc(ETAPA_NOMBRE[_etapa] || '') + '<span class="n">0</span></div>' +
      vacioTaller('Nada en «' + (ETAPA_NOMBRE[_etapa] || '') + '»',
        'Hay ' + d.V.length + ' trabajo' + (d.V.length === 1 ? '' : 's') + ' en el taller, en otras etapas.',
        btn('Ver todos', 'btn btn-gho pf-btn-corto', { tipo: 'etapa', etapa: '' })));
  }

  /* Sin filtro se agrupa por estación, con el mismo rótulo en versalitas de la agenda: la
     lista de treinta renglones sin cortes es una pared. Con filtro puesto no se agrupa —ya
     son todos de la misma— y la cabecera dice cuál es y cómo soltarlo. */
  let cuerpo;
  if (_etapa) {
    cuerpo = '<div class="ag-grupo">' + ico(ICO_ETAPA[_etapa] || 'i-taller') +
      esc(ETAPA_NOMBRE[_etapa]) + '<span class="n">' + lista.length + '</span></div>' +
      '<p class="pf-nota">Solo se están viendo los de esta etapa. ' +
      btn('Ver todos', 'btn btn-gho pf-btn-corto', { tipo: 'etapa', etapa: '' }) + '</p>' +
      lista.map(v => renglon(v, d)).join('');
  } else {
    cuerpo = ESTACIONES.map(e => {
      const g = lista.filter(v => v.etapa_real === e);
      if (!g.length) return '';
      return '<div class="ag-grupo">' + ico(ICO_ETAPA[e] || 'i-taller') + esc(ETAPA_NOMBRE[e]) +
        '<span class="n">' + g.length + '</span></div>' + g.map(v => renglon(v, d)).join('');
    }).join('');
  }
  return caja(cuerpo);
}

const caja = html => '<div class="card"><div class="card-b">' + html + '</div></div>';

/* `vacio()` de ui.js clava el icono de carpeta, que aquí diría «archivo» donde queremos
   decir «taller». Se escribe a mano con `i-taller`, igual que ya hace el Calendario. */
function vacioTaller(titulo, detalle, accionHTML) {
  return '<div class="vacio">' + ico('i-taller') +
    '<p class="vacio-t">' + esc(titulo) + '</p>' +
    (detalle ? '<p class="vacio-d">' + esc(detalle) + '</p>' : '') +
    (accionHTML || '') + '</div>';
}

function ordenar(a, b) {
  return (PESO[a.estado] - PESO[b.estado])
      || (b.atraso_dias - a.atraso_dias)
      || (a.holgura_dias - b.holgura_dias)
      || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es');
}

/* Un renglón, con la etapa, el semáforo del material y la única escritura de la pantalla.

   ----- P29 · deslizar un renglón para avanzarlo -----
   En el teléfono cada trabajo gastaba un renglón entero en botones: treinta trabajos, treinta
   renglones de «Ya se armó · Abrir». El renglón sigue llevando sus botones —son lo que usa quien
   no desliza, quien teclea y quien tiene un lector de pantalla— y encima se le pone el gesto de
   la pieza 9: a la DERECHA avanza la etapa (pulsa el mismo botón, así que corre el mismo código
   y ofrece el mismo «Deshacer» de la mecha) y a la IZQUIERDA descubre «Abrir» y «Mover la fecha».

   El gesto NO se ofrece donde el botón no tiene Deshacer: el cruce de corte saca material del
   almacén y «Ya se instaló» marca además la instalación, y deslizar con el pulgar mientras se
   camina es justo como se equivoca uno de renglón. Tampoco donde el rol no puede mover esa
   etapa: ahí el renglón dice quién la marca, igual que antes, y solo queda el lado de las
   acciones. */
function renglon(v, d) {
  const sem = d.semDe(v.proyecto_id);
  const extra = '<p class="ag-sem">' +
    '<span class="pf-etapa ' + claseEtapa(v.etapa_real) + '">' +
      esc(ETAPA_NOMBRE[v.etapa_real] || v.etapa_real) + '</span> ' +
    '<span class="pf-sem ' + esc(sem.estado) + '" title="' + esc(sem.texto) + '">' +
      esc(palabraMaterial(sem)) + '</span>' +
    (v.atraso_dias > 0
      ? ' <span class="pf-cuando tarde">+' + v.atraso_dias + ' d</span>'
      : (v.holgura_dias === 0 ? ' <span class="pf-cuando hoy">hoy</span>' : '')) +
    '</p>';
  const ac = accionesRenglon(v);
  const cara = filaTaller(v, d.hoy, {
    icono: ICO_ETAPA[v.etapa_real] || 'i-taller',
    plazoEditable: false,
    extraHTML: extra,
    accionesHTML: ac.html,
  });
  /* `data-tarde` marca el renglón al que baja la cuenta «Van tarde» (P3). */
  const attrs = 'data-renglon="' + esc(v.proyecto_id) + '"' + (v.atraso_dias > 0 ? ' data-tarde' : '');
  const P = piezas();
  if (!P || !P.filaDeslizableHTML) return '<div class="tb-renglon" ' + attrs + '>' + cara + '</div>';
  const iAgendar = _acciones.push({ tipo: 'agendar', id: v.proyecto_id }) - 1;
  return P.filaDeslizableHTML({
    cara, clase: 'tb-renglon', attrs,
    principal: ac.iAvanza >= 0 ? { texto: ac.verbo, attrs: 'data-acc="' + ac.iAvanza + '"' } : null,
    acciones: [
      { texto: 'Abrir', attrs: 'data-acc="' + ac.iAbrir + '"' },
      { texto: 'Mover la fecha', attrs: 'data-acc="' + iAgendar + '"' },
    ],
  });
}

/* La palabra del semáforo. Nunca solo el color: quien no distingue el ámbar del rojo lee
   esta palabra, y el `title` lleva la frase completa que ya escribió el dictamen. */
function palabraMaterial(sem) {
  if (sem.codigo === 'sin_calcular') return 'sin calcular';
  if (sem.estado === 'grave') return 'falta material';
  if (sem.estado === 'falta') return 'falta material';
  if (sem.codigo === 'sin_agenda') return 'sin fecha';
  return 'material listo';
}

/* ----- La acción del renglón, que es la única escritura del tablero -----
   Un solo botón y NUNCA `.btn-pri`: la regla de un botón con relleno de color por pantalla
   ya está escrita en el sistema de diseño, y aquí hay treinta renglones.

   Cuando el rol no puede mover la etapa NO se pinta un botón apagado: se pinta la razón que
   la capa de datos ya escribió. Solo-lectura con motivo visible, no ausencia silenciosa.

   Devuelve también los índices de las acciones que el gesto de deslizar (P29) reutiliza, y
   `iAvanza` en -1 cuando el gesto no se ofrece. El botón de avanzar lleva `data-avanza` con el
   id del proyecto: es por donde `rearmarMechas()` lo encuentra después de un repintado, y el
   botón donde se cuelga el Deshacer cuando el avance viene de deslizar. */
function accionesRenglon(v) {
  const sig = SIGUIENTE[v.etapa_real];
  const iAbrir = _acciones.push({ tipo: 'abrir', id: v.proyecto_id }) - 1;
  const abrir = botonIdx('Abrir', 'btn btn-gho pf-btn-corto', iAbrir);
  if (!sig) return { html: abrir, iAbrir, iAvanza: -1, verbo: '' };
  if (!puedeMover(Prefs.rol(), sig)) {
    return { html: '<p class="pf-nota">' + esc('«' + (VERBO_AVANZA[v.etapa_real] || '') + '» lo marca Dirección.') + '</p>' + abrir,
             iAbrir, iAvanza: -1, verbo: '' };
  }
  const verbo = VERBO_AVANZA[v.etapa_real] || 'Avanzar';
  const iAvanza = _acciones.push({ tipo: 'avanzar', id: v.proyecto_id, etapa: sig, titulo: v.titulo, de: v.etapa_real }) - 1;
  return {
    html: botonIdx(verbo, 'btn btn-gho pf-btn-corto', iAvanza, 'data-avanza="' + esc(v.proyecto_id) + '"') + abrir,
    iAbrir, verbo,
    /* El gesto solo donde el botón ofrece Deshacer: ver `avanzaConDeshacer()`. */
    iAvanza: avanzaConDeshacer(v.etapa_real, sig) ? iAvanza : -1,
  };
}

/* Si el paso de `de` a `a` se puede deshacer en su mecha. NO el que cruza el corte —saca material
   del almacén y no tiene vuelta— ni «Ya se instaló», que además marca la instalación como hecha
   (ver `avanzar()`). Una sola regla para el botón, la mecha y el gesto de deslizar. */
function avanzaConDeshacer(de, a) {
  return a !== 'instalado' && !(ORDEN[a] >= ORDEN.cortado && ORDEN[de] < ORDEN.cortado);
}

/* ----- «Hoy en el taller» -----
   `Taller.cargaDeDia()`, ya probada, cero lecturas más. En el teléfono va PRIMERA de las dos
   columnas —el `order:-1` que la agenda ya usa— porque es la pregunta de la mañana.

   No se dibuja ninguna rejilla semanal aquí: sería un segundo calendario con otro CSS en el
   mismo producto, y el ojo dejaría de reconocer la forma que ya aprendió. La semana es del
   Calendario, y está a un toque. */
function hoyEnElTaller(d) {
  const c = d.carga;
  const h = ['<div class="ag-grupo" data-destino="hoy">' + ico('i-taller') + 'Hoy en el taller' +
    '<span class="n">' + c.total + '</span></div>'];

  /* `carga.texto` es la frase COMPLETA que armó `cargaDeDia`, y ya menciona los ganados sin
     fecha. Se usa cuando no hay nada que agrupar; en cuanto hay grupos se pintan ellos y la
     nota de los sin fecha va UNA vez. Antes se pintaban las dos cosas y la misma frase salía
     dos veces en la misma tarjeta. */
  if (!c.total && !c.sin_fecha) {
    h.push('<p class="pf-fila-d">' + esc(c.texto) + '</p>');
  } else {
    if (c.empiezan.length) {
      h.push('<div class="ag-grupo">' + ico('i-rayo') + 'Arrancan hoy' +
        '<span class="n">' + c.empiezan.length + '</span></div>');
      h.push(c.empiezan.map(q => filaCorta(q, 'i-rayo')).join(''));
    }
    if (c.listos.length) {
      h.push('<div class="ag-grupo">' + ico('i-check') + 'Deben quedar listos hoy' +
        '<span class="n">' + c.listos.length + '</span></div>');
      h.push(c.listos.map(q => filaCorta(q, 'i-check')).join(''));
    }
    if (!c.empiezan.length && !c.listos.length && c.total) {
      h.push('<p class="pf-fila-d">' + c.total +
        (c.total === 1 ? ' trabajo en la mesa' : ' trabajos en la mesa') +
        ', ninguno arranca ni tiene que cerrar hoy.</p>');
    }
    /* Los ganados sin fecha se dicen aparte y NO se suman al total: son una hipótesis
       anclada en el día de la venta, no trabajo con día prometido. */
    if (c.sin_fecha) {
      h.push('<p class="pf-nota">' + c.sin_fecha + ' ganado' + (c.sin_fecha === 1 ? '' : 's') +
        ' sin fecha, con el reloj corriendo. No cuenta' + (c.sin_fecha === 1 ? '' : 'n') +
        ' en el total porque nadie prometió su día.</p>');
    }
  }
  h.push('<p class="no-papel">' +
    btn('Ver la semana en el Calendario', 'btn btn-gho pf-btn-corto',
        { tipo: 'semana' }) + '</p>');
  return h.join('');
}

function filaCorta(q, icono) {
  return '<div class="pf-fila"><span class="pf-fila-ico">' + ico(icono) + '</span>' +
    '<div class="pf-fila-tx"><p class="pf-fila-t">' + esc(q.titulo || 'Uno sin nombre') + '</p></div>' +
    '<div class="pf-fila-acc">' +
      btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'abrir', id: q.id }) +
    '</div></div>';
}

/* ----- «Se instala esta semana» -----
   Arriba, en tono malo, las que YA PASARON Y NADIE MARCÓ: dejan el almacén sin descontar y
   la cobranza sin arrancar, y son invisibles en cualquier otra pantalla. */
function seInstalaEstaSemana(d) {
  const h = ['<div class="ag-grupo">' + ico('i-camion') + 'Se instala esta semana' +
    '<span class="n">' + d.semana.length + '</span></div>'];

  if (d.vencidas.length) {
    h.push('<div class="ag-grupo">' + ico('i-aviso') + 'Ya pasaron y nadie las marcó' +
      '<span class="n">' + d.vencidas.length + '</span></div>');
    h.push(d.vencidas.map(i => filaInst(i, d, true)).join(''));
  }

  if (!d.semana.length) {
    h.push(vacio('Nada agendado esta semana', d.proxInst
      ? 'La siguiente instalación es el ' + fmtFecha(d.proxInst) + '.'
      : 'No hay ninguna instalación con fecha.'));
  } else {
    h.push(d.semana.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map(i => filaInst(i, d, false)).join(''));
  }

  /* La ruta solo para quien tiene el Mapa: pagos no lo tiene (app.js, RUTAS), el router lo
     rebotaba de vuelta al Tablero y el botón dejaba una entrada de historial de más, así que
     el atrás siguiente tampoco hacía nada. Se le pregunta al router y no al rol, para que la
     regla siga viviendo en un solo lugar. */
  const hayMapa = _ctx && typeof _ctx.tieneRuta === 'function' ? _ctx.tieneRuta('mapa') : Prefs.rol() !== 'pagos';
  h.push('<p class="no-papel">' +
    (!hayMapa ? '' :
      btn('Ver la ruta en el mapa' + (d.sinUbicar ? ' · ' + d.sinUbicar + ' sin ubicar' : ''),
          'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'mapa' })) +
    btn('Ver el calendario', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'agenda' }) +
    '</p>');
  return h.join('');
}

function filaInst(i, d, vencida) {
  const p = d.porId.get(i.proyecto_id);
  const sem = d.semDe(i.proyecto_id);
  /* La ventana solo se dice cuando NO es de día: una instalación de madrugada es otra
     logística, y decir «de día» en todas es ruido en el 90 % de los renglones. */
  const vent = i.ventana && i.ventana !== 'dia'
    ? ' · ' + (Agenda.VENTANA_NOMBRE[i.ventana] || i.ventana) : '';
  return '<div class="pf-fila">' +
    '<span class="pf-fila-ico' + (vencida ? ' mal' : '') + '">' + ico('i-camion') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc((p && p.nombre) || i.titulo || 'Proyecto sin nombre') + '</p>' +
      '<p class="pf-fila-d">' + esc(fmtFechaDia(i.fecha)) + esc(vent) +
        (vencida ? ' · ' + esc(Agenda.ESTADO_NOMBRE[i.estado] || i.estado) + ', sin marcar' : '') +
        ' <span class="pf-sem ' + esc(sem.estado) + '" title="' + esc(sem.texto) + '">' +
        esc(palabraMaterial(sem)) + '</span></p>' +
    '</div>' +
    '<div class="pf-fila-acc">' +
      btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'abrir', id: i.proyecto_id }) +
    '</div></div>';
}

/* ----- «Falta material» -----
   Los que están en la mesa a los que les falta algo, ordenados por cuántos días quedan. El
   texto ya viene escrito por el dictamen. Se dicen aparte los dos casos que NO son «falta
   genérica», porque «no se ha calculado» y «ya está todo» son la misma cara verde si se
   confunden, y la diferencia se descubre a las siete de la mañana. */
function faltaMaterial(d, rol) {
  if (rol === 'pagos') return '';        // pagos no mueve el almacén
  const filas = d.enTaller
    .map(v => ({ v, sem: d.semDe(v.proyecto_id) }))
    .filter(x => x.sem.estado === 'falta' || x.sem.estado === 'grave')
    .sort((a, b) => (a.sem.dias === null ? 1e9 : a.sem.dias) - (b.sem.dias === null ? 1e9 : b.sem.dias));
  if (!filas.length) return '';

  const h = ['<div class="ag-grupo" data-destino="faltamaterial">' + ico('i-material') + 'Falta material' +
    '<span class="n">' + filas.length + '</span></div>'];

  if (!d.mat.leido) {
    h.push('<p class="pf-nota">No se pudo leer el almacén, así que no se sabe si está el material. Lo que sigue es lo que se pudo ver.</p>');
  }

  for (const { v, sem } of filas) {
    const f = sem.faltantes && sem.faltantes[0];
    const acc = [];
    /* El único verde de la plataforma, y está justificado: es el mensaje ya armado al
       proveedor. Es un <a> real y no `window.open` desde un manejador: en el celular abre
       la app instalada, y el bloqueador de emergentes de iOS tira lo segundo. */
    /* La guarda es `telWa` y no `f.tel_proveedor`: `linkWa` SIEMPRE devuelve una cadena
       —con número o sin él—, así que el `if (wa)` que había aquí no filtraba nada y un
       teléfono de proveedor a medias pintaba un botón que abría otro chat. */
    if (f && telWa(f.tel_proveedor)) {
      const wa = linkWa(f.tel_proveedor,
        'Buenos días. ¿Tiene ' + (f.nombre || 'material') + '? Lo necesito para un trabajo de esta semana. AL3D.');
      acc.push('<a class="btn-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' +
        ico('i-wa') + 'Pedir por WhatsApp</a>');
    }
    acc.push(btn('Ver la lista de compra', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'material' }));
    h.push('<div class="pf-fila">' +
      '<span class="pf-fila-ico ' + (sem.estado === 'grave' ? 'mal' : 'urge') + '">' +
        ico('i-material') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">' + esc(v.titulo || 'Proyecto sin nombre') + '</p>' +
        '<p class="pf-fila-d">' + esc(sem.texto) + '</p>' +
      '</div>' +
      '<div class="pf-fila-acc">' + acc.join('') + '</div></div>');
  }
  return h.join('');
}

/* ----- El pie -----
   La puerta a los avisos, SIN NÚMERO: contarlos exigiría `Reglas.evaluar()` con existencias
   y calibración, cuatro lecturas más en la pantalla de entrada para un número que la
   pantalla de al lado ya sabe dar bien. Un contador aproximado es peor que ninguno.

   Y la verdad del final, que es lo que hace que se le crea al tablero. */
function pie() {
  /* La puerta a Control, para quien ve dinero. En el teléfono Control no está en la barra de
     abajo —por lo mismo que Material— y esta es su entrada. */
  const control = Prefs.veDinero()
    ? '<div class="pf-fila">' +
        '<span class="pf-fila-ico">' + ico('i-control') + '</span>' +
        '<div class="pf-fila-tx">' +
          '<p class="pf-fila-t">Control</p>' +
          '<p class="pf-fila-d">Cuánto se vendió este mes, qué hay en la calle sin cobrar, y quién movió qué.</p>' +
        '</div>' +
        '<div class="pf-fila-acc">' +
          btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'control' }) +
        '</div>' +
      '</div>'
    : '';
  /* Las puertas a las herramientas del taller. En el teléfono la barra de abajo solo lleva
     cinco rutas —con seis en 360 px el nombre ya no cabe debajo del icono— y la mesa de corte
     y el vectorizador se quedan fuera. Sin esto quedarían INALCANZABLES en el celular, que es
     justo donde trabaja fabricación: el rol para el que se sacaron a la barra. En pantalla
     grande estas dos filas son redundantes con el riel, y se quedan igual: es la misma
     redundancia que ya tienen Control y Qué atender, y cuesta dos renglones.

     Pagos no las ve porque no las tiene: son de obra, no de cobranza. */
  const herramientas = Prefs.rol() === 'pagos' ? '' :
    '<div class="pf-fila">' +
      '<span class="pf-fila-ico">' + ico('i-anidar') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">Mesa de corte</p>' +
        '<p class="pf-fila-d">Acomoda las piezas del SVG en la lámina para gastar lo menos posible antes de cortar.</p>' +
      '</div>' +
      '<div class="pf-fila-acc">' +
        btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'anidador' }) +
      '</div>' +
    '</div>' +
    '<div class="pf-fila">' +
      '<span class="pf-fila-ico">' + ico('i-vector') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">Vectorizador</p>' +
        '<p class="pf-fila-d">Convierte el logotipo del cliente en trazo de corte. No hace falta abrir una cotización.</p>' +
      '</div>' +
      '<div class="pf-fila-acc">' +
        btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'vectorizar' }) +
      '</div>' +
    '</div>';

  return '<div class="card"><div class="card-b">' +
    control +
    herramientas +
    '<div class="pf-fila">' +
      '<span class="pf-fila-ico">' + ico('i-aviso') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">Qué atender</p>' +
        '<p class="pf-fila-d">Avisos de material, fechas, cobranza y respaldo, ordenados por lo que truena antes.</p>' +
      '</div>' +
      '<div class="pf-fila-acc">' +
        btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'atender' }) +
      '</div>' +
    '</div>' +
    '<p class="pf-nota">La ventana de cada trabajo se cuenta hacia atrás desde el día de ' +
    'instalación, con el plazo que dice el tipo de trabajo —o el que se puso a mano, que ' +
    'siempre manda—. El plazo se reparte parejo entre diseño, corte y armado porque hoy la ' +
    'etapa no guarda fecha: nadie ha medido cuánto tarda cortar. La primera vez que corrijas ' +
    'un plazo, esto empieza a saber la verdad.</p>' +
    '</div></div>';
}

/* ----- La barra fija del teléfono -----
   Una sola acción, y solo cuando hay una. El protocolo es obligatorio y en este orden:
   innerHTML, luego `hidden`, luego `onclick` por asignación —no `addEventListener`, que se
   acumularía en cada repintado— y al final `ajustarAltoBarra()`.

   Antes hacía `scrollIntoView` y ya: llegaba a una tarjeta sin decir cuál era, y con «Ver los 3
   que no llegan» el destino era «el primer `.card`», que solo era la correcta por casualidad del
   orden. Ahora cada destino es un `data-destino` con nombre y se llega igual que desde las
   cuentas (P3): con las esquinas de la pieza 17 y el foco puesto. */
function pintarMbar(d, rol) {
  const b = $('pf-mbar');
  if (!b) return;
  const noLlega = d.V.filter(v => v.estado === 'no_llega').length;
  const n = d.pendientes.length;

  let html = '', destino = '', quien = '';
  if (rol === 'direccion' && n) {
    html = '<button type="button" class="btn btn-ok mbar-btn">' + ico('i-venta') +
      (n === 1 ? ' Decidir la cotización' : ' Decidir ' + n + ' cotizaciones') + '</button>';
    destino = '.pf-decidir'; quien = 'Cotizaciones por decidir';
  } else if (noLlega) {
    html = '<button type="button" class="btn btn-pri mbar-btn">' + ico('i-aviso') +
      ' Ver ' + (noLlega === 1 ? 'el que no llega' : 'los ' + noLlega + ' que no llegan') + '</button>';
    destino = '[data-destino="nollegan"]'; quien = 'No llegan a su fecha';
  } else {
    b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra();
    return;
  }
  b.innerHTML = html;
  b.hidden = false;
  b.onclick = () => {
    const el = _cont && _cont.querySelector(destino);
    if (!el) return;
    /* Las esquinas rodean el título de la tarjeta de «sin decidir» y no la tarjeta entera, que
       con varias cotizaciones es más alta que la pantalla; el foco, en su primer botón. */
    const titulo = el.querySelector('.cp-txt') || el;
    llevarA(titulo, quien, el.querySelector('button, a'));
  };
  ajustarAltoBarra();
}

/* ----- Llevar a un lugar de la pantalla, diciendo que se llegó -----
   La comparten las cuentas (P3) y la barra fija. `senalar` con `desplazar` trae el destino a la
   vista —entre el encabezado fijo y la barra de abajo, respetando `scroll-padding-top`— espera a
   que deje de moverse y se cierra sobre él con las esquinas, una vez. Con menos movimiento
   queda un aro fijo de un segundo y sin vuelo.

   El foco va al destino aunque sea un título: se le da `tabindex="-1"` (no entra al tabulador,
   pero recibe el foco) para que quien navega con teclado o con lector de pantalla no se quede
   en el botón de arriba, ya fuera de su vista, y `voz()` dice dónde cayó. Sin la pieza —node, o
   un despliegue a medias— queda el `scrollIntoView` de siempre. */
function llevarA(el, que, enfocar) {
  const f = enfocar || el;
  if (f && !f.matches('button, a[href], input, select, textarea, [tabindex]')) f.tabIndex = -1;
  try { f.focus({ preventScroll: true }); } catch (_) {}
  const P = piezas();
  if (P && P.senalar) P.senalar(el, { desplazar: true });
  else el.scrollIntoView({ block: 'center', behavior: scrollSuave() });
  if (que) voz('Estás en ' + que);
}

/* La cuenta que baja a su tarjeta (P3). Si hay un filtro de estación puesto y lo que se busca
   no está en la lista filtrada —«Van tarde» con el filtro en «Armado»—, se suelta el filtro:
   la cuenta cuenta TODO el taller, y que el toque no hiciera nada porque el renglón está
   escondido sería peor que no ser botón. */
function bajarA(a) {
  if (!_cont) return;
  let el = _cont.querySelector(a.sel);
  if (!el && _etapa) { _etapa = null; pintar(); el = _cont && _cont.querySelector(a.sel); }
  if (!el) return;
  llevarA(el, a.donde);
}

/** Los globos de la barra de módulos. El del tablero es lo que no llega: es lo único que no
 *  espera a mañana. */
function publicarCuentas(d) {
  if (!_ctx || !_ctx.ponerCuenta) return;
  _ctx.ponerCuenta('hoy', d.V.filter(v => v.estado === 'no_llega').length);
}

/* ============================================================================
   Tocar
   ============================================================================ */

function btn(label, clase, accion) {
  return botonIdx(label, clase, _acciones.push(accion) - 1);
}

/* El mismo botón cuando la acción ya está registrada (el gesto de deslizar comparte índice con
   el botón visible, para que corran exactamente el mismo código) y con atributos de más. */
function botonIdx(label, clase, i, attrs) {
  return '<button type="button" class="' + clase + '" data-acc="' + i + '"' + (attrs ? ' ' + attrs : '') + '>' +
    esc(label) + '</button>';
}

async function alClic(ev) {
  const rec = ev.target.closest('[data-recargar]');
  if (rec) { location.reload(); return; }

  const lente = ev.target.closest('[data-vista]');
  if (lente) {
    const v = (lente.dataset.vista === 'anidador' && conMesa()) ? 'anidador' : 'tablero';
    if (v === _vista) return;
    _vista = v;
    /* Al salir de la mesa de corte se olvida de dónde se venía: el aviso de origen es de esa
       visita, y dejarlo puesto haría que tres pantallas después siguiera diciendo que vienes
       de un proyecto que ya nadie está mirando. */
    if (v === 'tablero') _origen = null;
    pintar();
    voz(v === 'anidador' ? 'Mesa de corte' : 'Carga del taller');
    return;
  }

  const et = ev.target.closest('[data-etapa]');
  if (et) {
    const e = et.dataset.etapa || '';
    _etapa = (!e || _etapa === e) ? null : e;
    pintar();
    /* Repintar una lista sin decirlo no lo nota quien no la ve. */
    const n = _d ? _d.V.filter(v => !_etapa || v.etapa_real === _etapa).length : 0;
    const tr = n === 1 ? ' trabajo' : ' trabajos';
    voz(_etapa ? n + tr + ' en ' + (ETAPA_NOMBRE[_etapa] || '') : 'Todo el taller, ' + n + tr);
    return;
  }

  const b = ev.target.closest('[data-acc]');
  if (!b) return;
  const a = _acciones[Number(b.dataset.acc)];
  if (!a) return;
  /* El botón donde se cuelga el Deshacer es el VISIBLE del renglón. Cuando el avance viene de
     deslizar (P29), el clic lo pulsa la pieza 9 sobre su botón principal, que vive debajo de la
     cara del renglón y se esconde en cuanto esta regresa: un «Deshacer» ahí no lo vería nadie. */
  let host = b;
  if (a.tipo === 'avanzar' && b.classList.contains('desliza-acc')) {
    const fila = b.closest('.desliza');
    host = fila && fila.querySelector('.desliza-cara [data-avanza]');
  }
  await hacer(a, host);
}

async function hacer(a, boton) {
  if (!_ctx) return;
  /* ----- P3 · una cuenta que baja o abre otra pantalla ----- */
  if (a.tipo === 'bajar') { bajarA(a); return; }
  if (a.tipo === 'pasar') {
    if (_ctx.pasar) _ctx.pasar(a.ruta, a.dato); else _ctx.ir(a.ruta);
    return;
  }
  if (a.tipo === 'ir') { _ctx.ir(a.ruta); return; }
  if (a.tipo === 'abrir') {
    /* Con el pase, Proyectos abre la ficha directo. Sin él, «Abrir» te deja en una lista
       donde hay que volver a buscar lo que ya estabas mirando. */
    if (_ctx.pasar) _ctx.pasar('proyectos', { proyecto_id: a.id });
    else _ctx.ir('proyectos');
    return;
  }
  if (a.tipo === 'agendar') {
    if (_ctx.pasar) _ctx.pasar('agenda', { proy: a.id, hoja: 'agendar' });
    else _ctx.ir('agenda');
    return;
  }
  if (a.tipo === 'semana') {
    if (_ctx.pasar) _ctx.pasar('agenda', { dia: _d ? _d.hoy : hoyISO(), vista: 'semana' });
    else _ctx.ir('agenda');
    return;
  }
  if (a.tipo === 'etapa') { _etapa = a.etapa || null; pintar(); return; }
  if (a.tipo === 'avanzar') {
    /* La confirmación es SOLO cuando el paso cruza corte, que es la única escritura
       irreversible: al llegar a «cortado» salen del almacén los materiales del proyecto.
       Preguntar en todos los pasos enseñaría a apretar «sí» sin leer. */
    const cruza = ORDEN[a.etapa] >= ORDEN.cortado && ORDEN[a.de] < ORDEN.cortado;
    if (cruza) { abrirPide(a); return; }
    /* «Ya se instaló» tampoco se ofrece a deshacer: es un solo hecho que mueve el proyecto Y
       marca su instalación (ver `aplicarAvance()`), y una mecha de cinco segundos con dos
       escrituras colgando de ella es justo lo que no se puede explicar en un botón. */
    if (!avanzaConDeshacer(a.de, a.etapa)) { await avanzar(a); return; }
    ofrecerDeshacer(a, boton);
    return;
  }
}

/* ----- P4 · «Ya se armó» con deshacer en el mismo botón -----
   Antes el botón escribía al instante, el repintado mandaba el renglón a otro grupo de estación
   y no había vuelta: el aviso de 3,2 s solo decía «avanzó». Ahora el botón que se tocó cruza su
   rótulo a «Deshacer» y una mecha se consume durante cinco segundos (la pieza 15). LA ESCRITURA
   NO OCURRE AL TOCAR: ocurre cuando la mecha se apaga. Mientras corre no hay nada que deshacer
   en la capa de datos —deshacer es no escribir—, así que no queda renglón de más en la
   bitácora, y el trabajo se queda en su grupo porque su etapa de verdad no ha cambiado.

   Los pendientes viven en `_pend`, por id de proyecto, y no en el botón: un cambio de filtro, la
   sincronización remontando la pantalla o la escritura de OTRO renglón rehacen el DOM y se
   llevan el botón que cargaba la mecha. `rearmarMechas()`, al final de cada `pintar()`, la
   vuelve a colgar del botón nuevo con lo que le quedaba. Si el renglón ya no está en pantalla
   (otro filtro), la mecha sigue sola y la escritura ocurre igual a su hora: tocar «Ya se
   armó» y cambiar de filtro no cancela nada. */
function ofrecerDeshacer(a, boton) {
  const P = piezas();
  /* Un segundo toque —o un segundo latigazo— sobre un renglón que ya está en su mecha no escribe
     dos veces ni reinicia la cuenta. */
  if (_pend.has(a.id)) return;
  /* Sin la pieza, o sin un botón donde colgarla, se escribe como antes: perder el avance es
     peor que perder el deshacer. */
  if (!P || !P.deshacerEnBoton || !boton) { avanzar(a); return; }
  armarMecha({ a, h: null, btn: null }, boton, 5000, true);
}

/* Cuelga la mecha de `boton` y deja a `ficha` como la vigente de su proyecto. Una ficha vieja
   —la de un botón que el repintado se llevó— ya no manda: sus callbacks se ignoran. */
function armarMecha(ficha, boton, ms, hablar) {
  const P = piezas();
  const nombre = ETAPA_NOMBRE[ficha.a.etapa] || ficha.a.etapa;
  ficha.btn = boton;
  _pend.set(ficha.a.id, ficha);
  ficha.h = P.deshacerEnBoton(boton, {
    ms, rotulo: 'Deshacer',
    voz: hablar ? (ficha.a.titulo || 'El proyecto') + ' pasa a ' + nombre + '. Deshacer disponible por ' +
      P.reloj(ms, { falta: true }) : false,
    alConfirmar: () => alApagarseLaMecha(ficha),
    alDeshacer: () => alDeshacerLaMecha(ficha),
  });
}

async function alApagarseLaMecha(ficha) {
  if (_pend.get(ficha.a.id) !== ficha) return;
  _pend.delete(ficha.a.id);
  /* Quien navega con teclado tenía el foco en este botón; el repintado del avance lo rehace y el
     foco caería al <body>, de vuelta al principio de la página. Se le devuelve al botón del mismo
     trabajo, que ahora ofrece el paso que sigue. (`conservandoFoco` no alcanza: solo cubre el
     tiempo de un clic, y esto ocurre cinco segundos después.) */
  const teniaFoco = !!(ficha.btn && ficha.btn.isConnected && document.activeElement === ficha.btn);
  await avanzar(ficha.a);
  if (!teniaFoco || !_cont) return;
  const b = _cont.querySelector('[data-avanza="' + CSS.escape(ficha.a.id) + '"]');
  if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} }
}

function alDeshacerLaMecha(ficha) {
  if (_pend.get(ficha.a.id) !== ficha) return;
  _pend.delete(ficha.a.id);
  /* El botón ya regresó a su rótulo —la pieza lo hace—; esto es para quien no lo ve. */
  voz('Se quedó en ' + (ETAPA_NOMBRE[ficha.a.de] || ficha.a.de) + '. No se movió.');
}

/* Después de cada pintado: cada mecha viva vuelve a colgarse del botón nuevo de su renglón, con
   el tiempo que le quedaba (la pieza no deja menos de 1,5 s al volver de una pausa, y aquí
   tampoco: un botón que reaparece con 0,2 s no da tiempo de leerlo) y sin hablar otra vez. La
   ficha vieja se suelta con `deshacer()` para que su mecha y sus oyentes se vayan con el nodo
   que dejó el documento; su callback ya no es el de `_pend` y se ignora. */
function rearmarMechas() {
  const P = piezas();
  if (!_cont || !P || !P.deshacerEnBoton || !_pend.size) return;
  for (const [id, vieja] of Array.from(_pend)) {
    const b = _cont.querySelector('[data-avanza="' + CSS.escape(id) + '"]');
    if (!b || b === vieja.btn) continue;
    const resto = Math.max(1500, vieja.h ? vieja.h.resta() : 1500);
    const nueva = { a: vieja.a, h: null, btn: null };
    _pend.set(id, nueva);
    if (vieja.h) vieja.h.deshacer();
    armarMecha(nueva, b, resto, false);
  }
}

/* La escritura, sin tocar la pantalla: la comparten el botón con su mecha, el «Sí» deslizado del
   corte y el «Ya se instaló». Devuelve `{ok, movs, aviso}`; `aviso` es lo que quedó a medias.

   «Ya se instaló» es un solo hecho y se apunta entero: el proyecto a «Instalado» Y su
   instalación a «hecha». Antes solo se movía el proyecto, la instalación se quedaba
   «confirmada» y este mismo tablero seguía diciendo «Ya pasaron y nadie las marcó: 1»
   sobre algo que alguien acababa de marcar. El otro «Ya se instaló», el del Calendario, hace
   lo mismo desde el otro lado (ver `instalarProyecto` en js/datos/agenda.js). */
async function aplicarAvance(a) {
  const r = await Proy.avanzarEtapa(a.id, a.etapa);
  if (!r.ok) return { ok: false, mensaje: r.mensaje || 'No se pudo completar', r };
  let aviso = '';
  if (a.etapa === 'instalado') {
    const inst = _d && _d.instDe.get(a.id);
    if (inst && inst.estado !== 'hecha') {
      const m = await Agenda.marcar(inst.id, 'hecha');
      if (!m.ok) aviso = 'Quedó en «Instalado», pero su instalación no se pudo marcar como hecha: ' + m.mensaje;
    }
  }
  return { ok: true, movs: Number(r.valor && r.valor.movimientos) || 0, aviso };
}

/* Lo que se dice cuando el avance ocurrió y la pantalla no tiene otra forma de contarlo. */
function decirAvance(a, movs) {
  const nombre = ETAPA_NOMBRE[a.etapa] || a.etapa;
  if (movs > 0) {
    toast(nombre + (movs === 1 ? ' · salió 1 material' : ' · salieron ' + movs + ' materiales') + ' del almacén',
      'ok', 5200, { label: 'Ver almacén', fn: () => _ctx && _ctx.ir('material') });
  } else {
    toast(nombre + ' · ' + (a.titulo || 'el proyecto') + ' avanzó', 'ok', 3200);
  }
}

async function avanzar(a) {
  const r = await aplicarAvance(a);
  if (!r.ok) { avisarResultado(r.r); return; }
  if (r.aviso) { toast(r.aviso, 'err', 6000); await recargar(); return; }
  decirAvance(a, r.movs);
  await recargar();
}

/* ----- El modal de confirmar el corte -----
   Se usa la capa del documento, no una propia: el registro de capas de ui.js —Escape, cerco
   de tabulador, botón atrás del teléfono— ya está dado de alta al arrancar.

   ----- P21 · «Sí, ya se cortó» es un deslizador que enseña el resultado -----
   Marcar «Cortado» saca del almacén los materiales del proyecto, y es la ÚNICA escritura
   irreversible del Tablero. Dos botones iguales —«Todavía no» / «Sí»— se aprietan con el mismo
   pulgar y a la misma velocidad; un deslizador pide un gesto que no se hace sin querer. Se
   arrastra el pulgar hasta el final (90 %), gira mientras corre `avanzarEtapa` y la pista se
   abre en una píldora con lo que pasó: «Salieron 4 materiales · Ver almacén», que antes llegaba
   en un aviso aparte. Si falla, regresa con una sacudida y dice por qué.

   Alternativa de teclado y de lector de pantalla: Enter o Espacio sobre el pulgar confirman
   directo. El pulgar es un <button>, y una activación que no viene de un puntero llega como
   `click` con `detail === 0`: es la misma señal que usa la pieza 5 («mantener»), y es la que
   separa el Enter del clic que el navegador manda al soltar un arrastre con el ratón. Un toque
   corto sin arrastre no confirma: dice cómo se usa. */
function abrirPide(a) {
  const capa = $('pf-pide');
  if (!capa) { avanzar(a); return; }
  _pide = a;
  const P = piezas();
  capa.innerHTML = '<div class="pf-panel">' +
    '<div class="pf-panel-h"><h2>¿Ya se cortó?</h2>' +
      '<button type="button" class="pf-cerrar" data-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' +
      '<p class="pf-fila-d">Al marcar <b>Cortado</b> salen del almacén los materiales de ' +
      esc(a.titulo || 'este proyecto') + '. Es lo único de esta pantalla que no se puede deshacer solo.</p>' +
      '<p class="pf-pide-msg hintnote" id="pf-pide-msg" hidden></p>' +
    '</div>' +
    '<div class="pf-panel-f pf-pide-f">' +
      '<div class="pf-desliza-ok" id="pf-pide-riel" role="group" aria-label="Confirmar que ya se cortó" data-estado="quieto">' +
        '<span class="pf-desliza-rastro" aria-hidden="true"></span>' +
        '<span class="pf-desliza-txt" id="pf-pide-txt">Desliza: sí, ya se cortó</span>' +
        '<button type="button" class="pf-desliza-pulgar" data-si aria-describedby="pf-pide-txt" ' +
          'aria-label="Sí, ya se cortó. Desliza hasta el final, o presiona Enter para confirmar">' +
          '<span aria-hidden="true">›</span></button>' +
      '</div>' +
      '<button type="button" class="btn btn-gho" data-cerrar>Todavía no</button>' +
    '</div></div>';
  abrirCapa('pf-pide', { hist: true });
  armarRielPide(capa, a, P);
}

function cerrarPide() { _pide = null; cerrarCapa('pf-pide'); }

function armarRielPide(capa, a, P) {
  const riel = capa.querySelector('#pf-pide-riel');
  const pul = riel && riel.querySelector('.pf-desliza-pulgar');
  const txt = riel && riel.querySelector('#pf-pide-txt');
  const msg = capa.querySelector('#pf-pide-msg');
  if (!riel || !pul) return;
  let x0 = 0, dx = 0, id = null, ocupado = false, tPista = 0;
  /* Hasta donde llega el pulgar: el ancho de la pista menos el pulgar y sus 3 px de cada lado. */
  const tope = () => Math.max(1, riel.clientWidth - pul.offsetWidth - 6);
  /* `--x` mueve el pulgar y rellena la pista; `--p` (0 a 1) apaga el texto a medida que se llega. */
  const poner = x => {
    riel.style.setProperty('--x', x + 'px');
    riel.style.setProperty('--p', (x / tope()).toFixed(3));
  };
  const decir = (t, mal) => {
    if (!msg) return;
    clearTimeout(tPista);
    msg.hidden = !t; msg.textContent = t || '';
    msg.classList.toggle('nota-av', !!mal);
  };
  const volver = () => { riel.classList.add('suelta'); dx = 0; poner(0); };

  pul.addEventListener('pointerdown', e => {
    if (ocupado || e.button > 0) return;
    id = e.pointerId;
    try { pul.setPointerCapture(id); } catch (_) {}
    x0 = e.clientX - dx;
    riel.classList.remove('suelta');
  });
  pul.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    dx = Math.max(0, Math.min(tope(), e.clientX - x0));
    poner(dx);
  });
  pul.addEventListener('pointerup', e => {
    if (e.pointerId !== id) return;
    id = null;
    if (dx >= tope() * 0.9) { poner(tope()); confirmar(); return; }
    /* Un toque de menos de unos píxeles no es un intento de confirmar, es alguien que no sabía
       cómo se usa: se le dice, sin sacudir nada. */
    const toque = dx < 8;
    volver();
    if (toque) {
      decir('Desliza el círculo hasta el final para confirmar, o usa Enter.');
      tPista = setTimeout(() => decir(''), 3200);
    }
  });
  pul.addEventListener('pointercancel', e => { if (e.pointerId === id) { id = null; volver(); } });
  pul.addEventListener('click', e => {
    if (e.detail !== 0 || ocupado) return;
    e.preventDefault();
    riel.classList.add('suelta'); dx = tope(); poner(dx);
    confirmar();
  });

  async function confirmar() {
    if (ocupado) return;
    ocupado = true;
    decir('');
    riel.classList.add('suelta');
    riel.dataset.estado = 'trabaja';
    riel.style.setProperty('--p', '0');      // el texto de la espera tiene que leerse
    pul.setAttribute('aria-busy', 'true');
    txt.textContent = 'Sacando el material del almacén…';
    voz('Marcando el corte');
    let r;
    try { r = await aplicarAvance(a); }
    catch (e) {
      console.error('el corte falló', e);
      r = { ok: false, mensaje: 'Algo se rompió al marcarlo. Recarga la plataforma y vuelve a intentarlo.' };
    }
    /* Si la capa se cerró mientras corría —Escape, el atrás del teléfono—, la escritura ya
       ocurrió y no hay pista donde enseñarla: se dice por el aviso de siempre. */
    if (_pide !== a) {
      if (r.ok) { decirAvance(a, r.movs); await recargar(); } else avisarResultado(r.r || { ok: false, mensaje: r.mensaje });
      return;
    }
    if (!r.ok) {
      ocupado = false;
      riel.dataset.estado = 'quieto';
      pul.removeAttribute('aria-busy');
      txt.textContent = 'Desliza: sí, ya se cortó';
      volver();
      if (P && P.sacudir) P.sacudir(riel);
      decir(r.mensaje, true);
      voz(r.mensaje, true);
      return;
    }
    terminarPide(riel, capa, r.movs, P);
    await recargar();
  }
}

/* La pista se abre en una píldora con el resultado. «Ver almacén» solo si salió material y el rol
   tiene Material; sin material por sacar se dice que quedó en «Cortado» y ya. El botón de abajo
   deja de ser «Todavía no»: ya no hay nada que dejar para después. */
function terminarPide(riel, capa, movs, P) {
  /* Corta en pantalla —«Salieron 7 materiales» cabe junto a «Ver almacén» en 360 px; con «del
     almacén» el botón se bajaba a un segundo renglón— y completa en la voz. */
  const frase = movs > 0
    ? (movs === 1 ? 'Salió 1 material' : 'Salieron ' + movs + ' materiales')
    : 'Quedó en «Cortado». No había material por sacar';
  const ver = movs > 0 && puedeIr('material');
  riel.dataset.estado = 'ok';
  riel.removeAttribute('role');
  riel.innerHTML = '<span class="pf-desliza-listo">' +
    (P && P.palomitaHTML ? P.palomitaHTML({ circulo: true }) : '') +
    '<span class="pf-desliza-frase">' + esc(frase) + '</span></span>' +
    (ver ? '<button type="button" class="pf-desliza-ver" data-ver-almacen>Ver almacén</button>' : '');
  const cerrar = capa.querySelector('.pf-pide-f .btn[data-cerrar]');
  if (cerrar) cerrar.textContent = 'Listo';
  const msg = capa.querySelector('#pf-pide-msg');
  if (msg) { msg.hidden = true; msg.textContent = ''; }
  voz(movs > 0 ? frase + ' del almacén' : frase);
}

async function alClicPide(ev) {
  if (!_pide) return;
  if (ev.target.closest('[data-cerrar]')) { cerrarPide(); return; }
  if (ev.target.closest('[data-ver-almacen]')) {
    cerrarPide();
    /* Cerrar la capa consume su entrada de historial con `history.back()`, que es ASÍNCRONO:
       escribir el hash de Material en el mismo tick aterriza en la entrada de abajo y la
       navegación se pierde entera (tocar «Ver almacén» cerraba la pregunta y no abría nada).
       Se espera al `popstate` de ese atrás, con techo por si la capa no tenía entrada. Es el
       mismo cuidado que ya tiene `montarDeVerdad` en app.js (`trasElAtrasDeUnaCapa`), que no está
       en el contexto de los módulos y por eso aquí se escribe otra vez, chica. */
    await new Promise(res => {
      const fin = () => { clearTimeout(t); window.removeEventListener('popstate', fin); res(); };
      const t = setTimeout(fin, 400);
      window.addEventListener('popstate', fin);
    });
    if (_ctx) _ctx.ir('material');
  }
}
