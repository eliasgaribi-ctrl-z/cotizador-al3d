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
import { masDias } from '../nucleo/fechas.js';
import { $, esc, ico, money, toast, avisarResultado, vacio, hoyISO, fmtFecha, fmtFechaDia,
         abrirCapa, cerrarCapa, linkWa, ajustarAltoBarra, rotularPapel, voz, segmento,
         filaTaller, bandaFrescura, medirMarco }
  from '../nucleo/ui.js';

const { ETAPA_NOMBRE, ICO_ETAPA, claseEtapa, ORDEN, puedeMover } = Proy;
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
let _reloj = null;        // el retardo del esqueleto
/* Las acciones del pintado actual. El botón lleva su ÍNDICE en un atributo: un índice no se
   puede escapar mal; un JSON dentro de un atributo dentro de una comilla, sí. Se vacía en
   cada `pintar()`, y eso NO es opcional: sin vaciarlo el arreglo crece sin techo y, peor, un
   toque en un botón del pintado anterior dispararía la acción de otro renglón. */
let _acciones = [];

/* Las estaciones son las etapas que están EN la línea del proceso. `instalado`, `garantia` y
   `cancelado` no son estaciones: no están en ORDEN y `ventanaTaller` las devuelve como
   `estado:'hecho'`, así que quedan fuera por construcción, no por una lista aparte. */
const ESTACIONES = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo'];

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
  if (pase && pase.vista) _vista = pase.vista === 'anidador' ? 'anidador' : 'tablero';
  _origen = (pase && pase.proyecto_id) ? pase : null;

  _cont.addEventListener('click', alClic);
  const capa = $('pf-pide');
  if (capa) capa.addEventListener('click', alClicPide);
  _oyendo = true;

  /* La base cerrada NO se pinta como un taller vacío. La diferencia entre «todavía no
     tienes proyectos» y «la base no abrió» es la diferencia entre estar tranquilo y perder
     una tarde buscando datos que están enteros. */
  if (!DB.estado().ok) {
    _cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo',
      DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    return;
  }

  /* Esqueleto CON RETARDO. Una lectura de IndexedDB suele estar bajo 100 ms, y un esqueleto
     sin retardo es un parpadeo que se ve peor que la espera. Si la lectura llega antes, este
     temporizador se cancela y nadie vio nada. */
  _reloj = setTimeout(() => {
    if (_cont) _cont.innerHTML = esqueleto();
  }, 180);

  await recargar();
}

export function desmontar() {
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_cont && _oyendo) _cont.removeEventListener('click', alClic);
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
       fecha: (instDe.get(id) || {}).fecha || null }],
    mat, hoy);

  /* Quién está dentro de su ventana hoy. Solo los anclados en una instalación: los otros son
     una hipótesis contada desde el día de la venta y no un trabajo con día prometido. */
  const enTaller = V.filter(v => v.ancla === 'instalacion' && v.empezar <= hoy && v.listo >= hoy);

  /* Las cotizaciones autorizadas que nadie decidió. Solo dirección: es la única que puede
     contestar, y es el eslabón sin el cual no hay proyecto, ni agenda, ni material. */
  const pendientes = Prefs.rol() === 'direccion'
    ? Cot.sinDecidir(new Set((todos || []).map(p => p && p.folio_global).filter(Boolean)), 0)
    : [];

  const semanaFin = masDias(hoy, 6);
  const VIVAS_SIN_MARCAR = ['propuesta', 'confirmada', 'reagendada'];

  return {
    hoy, V, vivos, porId, instDe, mat, fres, enTaller, pendientes, semDe,
    carga: Taller.cargaDeDia(hoy, V),
    semana: (insts || []).filter(i => i && i.fecha >= hoy && i.fecha <= semanaFin),
    vencidas: (insts || []).filter(i => i && i.fecha && i.fecha < hoy &&
                                        VIVAS_SIN_MARCAR.includes(i.estado)),
    sinUbicar: vivos.filter(p => !isFinite(Number(p.lat)) || !isFinite(Number(p.lng))).length,
    proxInst: (insts || []).map(i => i && i.fecha).filter(f => f && f >= hoy).sort()[0] || null,
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

  _cont.innerHTML =
    segLente() +
    bandaFrescura(d.fres, Sync.disponible()) +
    cuentas(d, rol, veDinero) +
    '<div class="ag-cuerpo dos tb-cuerpo taller-primero">' +
      '<div>' + izq + '</div>' +
      '<div class="card"><div class="card-b">' + der + '</div></div>' +
    '</div>' +
    pie();

  publicarCuentas(d);
  pintarMbar(d, rol);
}

/* ----- El segmento de sub-vista -----
   Dos lentes sobre el mismo taller: la carga —qué hay y qué se atrasa— y la mesa de corte
   —cómo caen las piezas en la lámina—. Es un segmento y no dos rutas porque son dos formas
   de mirar el mismo momento del trabajo, y porque el Anidador no puede ser una ruta: ver §5. */
function segLente() {
  return segmento([{ v: 'tablero', t: 'Carga del taller' }, { v: 'anidador', t: 'Mesa de corte' }],
    _vista, 'data-vista', 'Qué ves del taller');
}

/* ============================================================================
   La mesa de corte — el Anidador, empotrado

   ----- POR QUÉ ES UN <iframe> Y NO SE PUEDE PORTAR A MÓDULO. NO LO «OPTIMICES». -----

   `anidador-vectores/js/svgnest.js:338` y `:544` arrancan los Web Workers con
   `evalPath: 'js/lib/eval.js'` —un LITERAL RELATIVO— y `js/lib/parallel.js:142/152/167` hace
   `new Worker(this.options.evalPath)`. `new Worker(url)` resuelve contra la URL base del
   DOCUMENTO, no del script:

     · servido desde /anidador-vectores/  →  /anidador-vectores/js/lib/eval.js   ✔
     · servido desde la raíz, donde vive la plataforma  →  /js/lib/eval.js       ✘ no existe

   Y no hay plan B; las tres cosas están verificadas en el código vendorizado:
     1. `evalPath` NO es configurable: `SvgNest.config()` (svgnest.js:84-118) solo acepta
        curveTolerance, spacing, rotations, populationSize, mutationRate, useHoles y
        exploreConcave.
     2. La rama de Blob + URL.createObjectURL que salvaría el caso (parallel.js:158-163) está
        MUERTA: el motor siempre llama `p.require(...)` (svgnest.js:344-347 y :547-551), así
        que `requiredScripts.length !== 0` y siempre se toma la rama del evalPath.
     3. EL FALLO ES MUDO. No lanza excepción: deja un cálculo que nunca termina. Está escrito
        como razón de existir de su prueba —pruebas/navegador/anidador.mjs:5-8, «una carpeta
        movida o un archivo que falte no da error en la página: da un cálculo que nunca
        termina»— y el autodiagnóstico de anidador-vectores/js/app.js:730-734 cubre file:// y
        la falta de window.Worker, pero NO este caso.

   Editar el código vendorizado tiene precio escrito tres veces —anidador-vectores/README.md
   y sw.js dicen que svgnest.js, svgparser.js y js/lib/* son «byte por byte el master de
   SVGnest»—, así que el marco es la única forma de embeberlo sin tocarlo.

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

  _cont.innerHTML =
    segLente() +
    origenHTML() +
    '<div class="pf-marco-caja">' +
      '<iframe class="pf-marco" id="pf-anid-marco" src="anidador-vectores/" ' +
      'title="Anidador de vectores — acomodo de piezas en la lámina"></iframe>' +
    '</div>';

  /* Un iframe no tiene alto propio: sin medirlo se queda en los 150 px de la especificación.
     Se mide después de que el navegador colocó la caja, no en el mismo tick. */
  requestAnimationFrame(() => medirMarco('pf-anid-marco'));
  window.addEventListener('resize', alRedimensionar);

  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
  if (_ctx && _ctx.ponerCuenta) _ctx.ponerCuenta('hoy', 0);
}

let _rzMarco = 0;
function alRedimensionar() {
  if (_rzMarco) return;
  _rzMarco = requestAnimationFrame(() => { _rzMarco = 0; medirMarco('pf-anid-marco'); });
}

/* ----- De dónde vienes, y el límite dicho con palabras -----
   El proyecto NO GUARDA VECTOR: `js/datos/proyectos.js` congela `aiFile` a
   `{name, type, url:''}` y no hay campo SVG, porque el vectorizador vive dentro de
   cotizador.html. Así que un pase desde un proyecto NO puede escribir `al3d_anidar`: el
   anidador lo leería, no encontraría `svg` y se quedaría vacío, pareciendo que no recibió
   nada. Se dice de dónde vienes y se ofrece el único camino que de verdad trae el trazo.
   Prometer más sería inventar un dato. */
function origenHTML() {
  const enTelefono = '<p class="hintnote">' + ico('i-aviso') +
    ' <span>El acomodo se calcula en la computadora, que es donde se exporta el SVG y se ' +
    'alimenta el láser. Aquí puedes ver el resultado y los retazos guardados.</span></p>';
  if (!_origen) return enTelefono;
  return '<p class="hintnote">' + ico('i-anidar') +
    ' <span>Vienes de <b>' + esc(_origen.nombre || 'un proyecto') + '</b>' +
    (_origen.folio ? ' — folio ' + esc(_origen.folio) : '') +
    '. Suelta aquí el SVG, o tráelo del vectorizador del Cotizador: el proyecto guarda el ' +
    'nombre del archivo, no el trazo.</span></p>' +
    '<p class="no-papel">' +
    btn('Vectorizar en el Cotizador', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'cotizador' }) +
    '</p>' + enTelefono;
}

/* El esqueleto tiene la GEOMETRÍA de lo que va a llegar —la cinta de cuentas, la línea de
   estaciones y tres renglones— para que al llegar los datos el layout no salte. */
function esqueleto() {
  const fila = '<div class="pf-fila"><div class="pf-fila-ico"></div>' +
    '<div class="pf-fila-tx"><div class="pf-fila-t">&nbsp;</div>' +
    '<div class="pf-fila-d">&nbsp;</div></div></div>';
  return '<div class="pf-cuentas" aria-hidden="true">' +
    '<p class="pf-cuenta"><b>&nbsp;</b>&nbsp;</p>'.repeat(4) + '</div>' +
    '<div class="card"><div class="card-b">' + fila.repeat(3) + '</div></div>' +
    '<p class="solo-voz" role="status">Leyendo el taller…</p>';
}

/* ----- La cinta de cuentas -----
   Los números que importan, grandes y arriba. El número SE PINTA SIEMPRE, aunque sea 0, para
   que la cinta no cambie de ancho entre dos aperturas: un renglón que aparece y desaparece
   mueve todo lo de abajo justo cuando alguien va a tocarlo.

   Las dos primeras usan la fórmula LITERAL de la lente de Taller del Calendario, para que el
   número no cambie de valor al navegar. «No llegan» es un subconjunto de «Van tarde» a
   propósito: la primera es apurarse, la segunda es una llamada telefónica hoy. */
function cuentas(d, rol, veDinero) {
  const tarde = d.V.filter(v => v.atraso_dias > 0).length;
  const noLlega = d.V.filter(v => v.estado === 'no_llega').length;
  const sinFecha = d.V.filter(v => v.ancla !== 'instalacion').length;
  const sinMat = d.enTaller.filter(v => {
    const e = d.semDe(v.proyecto_id).estado;
    return e === 'falta' || e === 'grave';
  }).length;

  const c = [];
  c.push(unaCuenta(d.enTaller.length, 'En el taller hoy', false));
  c.push(unaCuenta(tarde, tarde === 1 ? 'Va tarde' : 'Van tarde', tarde > 0));
  c.push(unaCuenta(noLlega, noLlega === 1 ? 'No llega a su fecha' : 'No llegan a su fecha',
                   false, noLlega > 0));
  if (rol === 'direccion' || rol === 'fabricacion') {
    c.push(unaCuenta(sinMat, 'Trabajos sin material', sinMat > 0));
  }
  c.push(unaCuenta(sinFecha, 'Ganados sin fecha', sinFecha > 0));

  /* El importe NO EXISTE con rol fabricación: `veDinero()` es false y la capa de datos
     devuelve null, no 0. El elemento no se pinta; no se difumina, y nunca se imprime $0. */
  if (veDinero) {
    const suma = d.enTaller.reduce((s, v) => {
      const p = d.porId.get(v.proyecto_id);
      const n = Number(p && p.precio_auth);
      return s + (isFinite(n) ? n : 0);
    }, 0);
    if (suma > 0) {
      c.push('<p class="pf-cuenta dinero"><b>' + esc(money(suma)) + '</b>En el taller</p>');
    }
  }
  return '<div class="pf-cuentas">' + c.join('') + '</div>';
}

function unaCuenta(n, etiqueta, urge, mal) {
  return '<p class="pf-cuenta' + (mal ? ' mal' : (urge ? ' urge' : '')) + '"><b>' +
    Number(n || 0) + '</b>' + esc(etiqueta) + '</p>';
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
  return '<div class="card"><div class="card-h"><h2>' + ico('i-aviso') +
    ' No llegan a su fecha <span class="folio">' + vs.length + '</span></h2></div>' +
    '<div class="card-b">' + filas + '</div></div>';
}

/* ----- La tarjeta que late -----
   Es lo único de la plataforma que late y tiene que seguir siendo lo único: dos cosas
   latiendo son cero cosas latiendo. Va aquí porque sin ese toque no hay proyecto, ni
   agenda, ni material, ni tablero: todo lo demás de esta pantalla está vacío por
   construcción.

   El flujo completo —el modal con «Se ganó» / «No se dio»— vive en «Qué atender» y no se
   duplica: aquí es un renglón con la cuenta y la puerta. */
function decidir(d, rol) {
  const n = d.pendientes.length;
  if (rol !== 'direccion' || !n) return '';
  return '<div class="cand-partidas pf-decidir">' +
    '<p class="cp-txt">' + ico('i-venta') + ' <b>' +
    (n === 1 ? 'Una cotización autorizada' : n + ' cotizaciones autorizadas') +
    '</b> sin decidir. Sin este toque no hay proyecto, ni agenda, ni material, ni nada en ' +
    'este tablero: es lo único que nadie más puede contestar.</p>' +
    '<div class="pf-fila-acc">' +
      btn(n === 1 ? 'Decidir la cotización' : 'Decidir ' + n + ' cotizaciones',
          'btn btn-ok pf-btn-corto', { tipo: 'ir', ruta: 'atender' }) +
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
    const atras = dentro.filter(v => v.etapa_esperada &&
      ORDEN[v.etapa_real] !== undefined && ORDEN[v.etapa_esperada] !== undefined &&
      ORDEN[v.etapa_real] < ORDEN[v.etapa_esperada]).length;
    const on = _etapa === e;
    return '<button type="button" class="pf-cuenta tb-etapa' + (on ? ' on' : '') + '"' +
      ' data-etapa="' + e + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
      ' title="' + esc(ETAPA_NOMBRE[e]) + (atras ? ' · ' + atras + ' atrasados' : '') + '">' +
      '<b>' + dentro.length + '</b>' + esc(ETAPA_NOMBRE[e]) +
      (atras ? '<em>' + atras + ' atrasado' + (atras === 1 ? '' : 's') + '</em>' : '') +
      '</button>';
  }).join('');
  return '<div class="pf-cuentas tb-linea" role="group" aria-label="Filtrar por etapa">' +
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

/* Un renglón, con la etapa, el semáforo del material y la única escritura de la pantalla. */
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
  return filaTaller(v, d.hoy, {
    icono: ICO_ETAPA[v.etapa_real] || 'i-taller',
    plazoEditable: false,
    extraHTML: extra,
    accionesHTML: accionesRenglon(v),
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
   la capa de datos ya escribió. Solo-lectura con motivo visible, no ausencia silenciosa. */
function accionesRenglon(v) {
  const sig = SIGUIENTE[v.etapa_real];
  const abrir = btn('Abrir', 'btn btn-gho pf-btn-corto', { tipo: 'abrir', id: v.proyecto_id });
  if (!sig) return abrir;
  if (!puedeMover(Prefs.rol(), sig)) {
    return '<p class="pf-nota">' + esc('«' + (VERBO_AVANZA[v.etapa_real] || '') + '» lo marca Dirección.') + '</p>' + abrir;
  }
  return btn(VERBO_AVANZA[v.etapa_real] || 'Avanzar', 'btn btn-gho pf-btn-corto',
             { tipo: 'avanzar', id: v.proyecto_id, etapa: sig, titulo: v.titulo, de: v.etapa_real }) + abrir;
}

/* ----- «Hoy en el taller» -----
   `Taller.cargaDeDia()`, ya probada, cero lecturas más. En el teléfono va PRIMERA de las dos
   columnas —el `order:-1` que la agenda ya usa— porque es la pregunta de la mañana.

   No se dibuja ninguna rejilla semanal aquí: sería un segundo calendario con otro CSS en el
   mismo producto, y el ojo dejaría de reconocer la forma que ya aprendió. La semana es del
   Calendario, y está a un toque. */
function hoyEnElTaller(d) {
  const c = d.carga;
  const h = ['<div class="ag-grupo">' + ico('i-taller') + 'Hoy en el taller' +
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

  h.push('<p class="no-papel">' +
    btn('Ver la ruta en el mapa' + (d.sinUbicar ? ' · ' + d.sinUbicar + ' sin ubicar' : ''),
        'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'mapa' }) +
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

  const h = ['<div class="ag-grupo">' + ico('i-material') + 'Falta material' +
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
    if (f && f.tel_proveedor) {
      const wa = linkWa(f.tel_proveedor,
        'Buenos días. ¿Tiene ' + (f.nombre || 'material') + '? Lo necesito para un trabajo de esta semana. AL3D.');
      if (wa) acc.push('<a class="btn-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' +
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
  return '<div class="card"><div class="card-b">' +
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
   acumularía en cada repintado— y al final `ajustarAltoBarra()`. */
function pintarMbar(d, rol) {
  const b = $('pf-mbar');
  if (!b) return;
  const noLlega = d.V.filter(v => v.estado === 'no_llega').length;
  const n = d.pendientes.length;

  let html = '', destino = '';
  if (rol === 'direccion' && n) {
    html = '<button type="button" class="btn btn-ok mbar-btn">' + ico('i-venta') +
      (n === 1 ? ' Decidir la cotización' : ' Decidir ' + n + ' cotizaciones') + '</button>';
    destino = '.pf-decidir';
  } else if (noLlega) {
    html = '<button type="button" class="btn btn-pri mbar-btn">' + ico('i-aviso') +
      ' Ver ' + (noLlega === 1 ? 'el que no llega' : 'los ' + noLlega + ' que no llegan') + '</button>';
    destino = '.card';
  } else {
    b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra();
    return;
  }
  b.innerHTML = html;
  b.hidden = false;
  b.onclick = () => {
    const el = _cont && _cont.querySelector(destino);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const foco = el.querySelector('button, a');
    if (foco) { try { foco.focus({ preventScroll: true }); } catch (_) {} }
  };
  ajustarAltoBarra();
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
  const i = _acciones.push(accion) - 1;
  return '<button type="button" class="' + clase + '" data-acc="' + i + '">' +
    esc(label) + '</button>';
}

async function alClic(ev) {
  const rec = ev.target.closest('[data-recargar]');
  if (rec) { location.reload(); return; }

  const lente = ev.target.closest('[data-vista]');
  if (lente) {
    const v = lente.dataset.vista === 'anidador' ? 'anidador' : 'tablero';
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
    voz(_etapa ? n + ' trabajos en ' + (ETAPA_NOMBRE[_etapa] || '') : 'Todo el taller, ' + n + ' trabajos');
    return;
  }

  const b = ev.target.closest('[data-acc]');
  if (!b) return;
  const a = _acciones[Number(b.dataset.acc)];
  if (!a) return;
  await hacer(a);
}

async function hacer(a) {
  if (!_ctx) return;
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
    await avanzar(a);
    return;
  }
}

async function avanzar(a) {
  const r = await Proy.avanzarEtapa(a.id, a.etapa);
  if (!r.ok) { avisarResultado(r); return; }
  const movs = Number(r.valor && r.valor.movimientos) || 0;
  const nombre = ETAPA_NOMBRE[a.etapa] || a.etapa;
  if (movs > 0) {
    toast(nombre + ' · salieron ' + movs + (movs === 1 ? ' material' : ' materiales') + ' del almacén',
      'ok', 5200, { label: 'Ver almacén', fn: () => _ctx && _ctx.ir('material') });
  } else {
    toast(nombre + ' · ' + (a.titulo || 'el proyecto') + ' avanzó', 'ok', 3200);
  }
  await recargar();
}

/* ----- El modal de confirmar -----
   Se usa la capa del documento, no una propia: el registro de capas de ui.js —Escape, cerco
   de tabulador, botón atrás del teléfono— ya está dado de alta al arrancar. */
function abrirPide(a) {
  const capa = $('pf-pide');
  if (!capa) { avanzar(a); return; }
  _pide = a;
  capa.innerHTML = '<div class="pf-panel">' +
    '<div class="pf-panel-h"><h2>¿Ya se cortó?</h2>' +
      '<button type="button" class="pf-cerrar" data-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' +
      '<p class="pf-fila-d">Al marcar <b>Cortado</b> salen del almacén los materiales de ' +
      esc(a.titulo || 'este proyecto') + '. Es lo único de esta pantalla que no se puede deshacer solo.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-cerrar>Todavía no</button>' +
      '<button type="button" class="btn btn-pri" data-si>Sí, ya se cortó</button>' +
    '</div></div>';
  abrirCapa('pf-pide', { hist: true });
}

function cerrarPide() { _pide = null; cerrarCapa('pf-pide'); }

async function alClicPide(ev) {
  if (!_pide) return;
  if (ev.target.closest('[data-cerrar]')) { cerrarPide(); return; }
  if (ev.target.closest('[data-si]')) {
    const a = _pide;
    cerrarPide();
    await avanzar(a);
  }
}

/* ----- Imprimir -----
   La carga del taller en papel es lo que se pega en la pared del taller. El encabezado con
   logotipo, filete y pie vive en index.html y se enciende solo en @media print. */
export function imprimir() {
  rotularPapel('Carga del taller · ' + fmtFecha(_d ? _d.hoy : hoyISO()));
  window.print();
}
