/* ============================================================================
   Tablero — la pantalla que abre la app, y contesta una sola pregunta:
   «¿qué tengo en el taller ahora mismo, y qué necesita de mí?»

   Hasta septiembre de 2026 la app abría en el Calendario, y antes de eso en la lista de
   avisos. Las dos contestaban preguntas buenas y ninguna era ESA. El calendario dice
   cuándo; la lista de avisos dice qué se rompe. El dueño abre la app para ver su taller.

   La ruta se sigue llamando «hoy» aunque este archivo se llame tablero.js. No es descuido:
   `./#/hoy` es la única dirección de la plataforma grabada en cosas que no controlamos —el
   start_url y el atajo del manifiesto YA INSTALADO, el icono de la pantalla de inicio del
   iPhone, el cotizador y el anidador—. Es la misma decisión que ya se tomó con
   «agenda»/«Calendario», y funcionó.

   ----- OCTUBRE DE 2026: DESPEJADA -----
   El equipo lo pidió en un audio (16/10/2026): «separar muy visualmente todo, para que para
   mi papá sea fácil e intuitivo ver lo necesario… que no dé más información de la que se
   necesita». Con nueve proyectos esta pantalla medía 8.2 pantallas de teléfono, con 83
   botones y 1,203 palabras: seis cuentas, la tubería de estaciones, cada proyecto con tres
   renglones de fechas y hasta cinco botones, cuatro tarjetas más y las herramientas.
   Dirección aprobó el lienzo (claude.ai/artifact/GLZGUSN6TbvPzRAjAndo8v) y quedan cuatro cosas:

     1. El resumen: la fecha, cuántos trabajos hay en el taller y, a quien ve dinero, cuánto
        valen.
     2. «Necesita tu decisión» —«Pendientes» para los otros roles—: un renglón grande por
        asunto, solo si lo hay, y cada uno lleva a donde se atiende. Sin nada, lo dice.
     3. «El taller»: las cinco estaciones, siempre, con el nombre de cada trabajo en una
        ficha. Rojo es «va tarde», ámbar «toca hoy», y las dos llevan su palabra. Tocar el
        nombre abre el proyecto: ahí está lo demás —material, cómo es, dónde se instala— y ahí
        se avanza la etapa.
     4. La próxima instalación, y la puerta a «Qué atender», que no tiene otra.

   Lo que salió de aquí no se perdió. Los botones de cada renglón —avanzar, mover la fecha,
   acomodar en la lámina— viven en la ficha del proyecto, que ya pregunta antes de cortar y
   marca la instalación al poner «Instalado». Las herramientas están en «Más». La lista de
   faltan datos y la de compra, en sus pantallas. Lo que se rompe PRONTO sigue aquí, en (2).

   Cuatro decisiones que siguen valiendo:

   1. CERO ARITMÉTICA NUEVA. La columna vertebral es `Taller.ventanaTaller()`, que ya
      devuelve la etapa esperada, el atraso en días, la holgura y un `texto` en español
      listo para pantalla. Si aquí se decidiera cuándo algo va tarde habría dos respuestas a
      la misma pregunta, y la que se ve sería la que nadie probó.

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
import { laBaseManda } from '../datos/reglas.js';
import { entregaDe } from '../datos/entrega.js';
import * as DD from '../datos/datos-de-entrega.js';
import * as DE from './datos-entrega.js';
import { $, esc, ico, money, toast, voz, vacio, hoyISO, fechaLocal, fmtFecha, fmtFechaDia,
         abrirCapa, cerrarCapa, ajustarAltoBarra, bandaFrescura, medirMarco, esqueletoMarco,
         scrollSuave, conservandoFoco, confirmarPf }
  from '../nucleo/ui.js';

const { ETAPA_NOMBRE } = Proy;

/* ----- Estado del módulo -----
   Vive aquí y no en el DOM: la pantalla se rehace completa en cada toque y un estado
   guardado en atributos se iría con el nodo que lo llevaba. */
let _cont = null;
let _ctx = null;
let _d = null;            // lo último que se leyó
/* Qué se está viendo: el tablero, o la mesa de corte empotrada. A la mesa ya no se llega con
   un segmento de esta pantalla —salió con el despeje—, solo con el pase de «Acomodar en la
   lámina» desde la ficha de un proyecto, así que NO se recuerda entre visitas: quien sale de la
   mesa y vuelve al Tablero quiere ver el Tablero. NO es una ruta y no vive en el hash:
   `rutaPorNombre()` exige igualdad exacta de un solo segmento, así que `#/hoy/anidador` no casa
   con nada, cae al default Y deja la barra de direcciones mintiendo. */
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
/* Lo que el agente de ventas espera de Dirección (supabase, 0023), o null si no se ha leído. */
let _agente = null;

/* Las piezas compartidas cuelgan de `window.Piezas` (js/piezas.js, guion clásico que index.html
   carga antes que los módulos). Se piden en el momento y no al importar: este archivo también lo
   lee node para la prueba de sintaxis, donde no hay ventana. */
const piezas = () => (typeof window !== 'undefined' && window.Piezas) || null;

/* Las estaciones son las etapas que están EN la línea del proceso. `instalado`, `garantia` y
   `cancelado` no son estaciones: no están en ORDEN y `ventanaTaller` las devuelve como
   `estado:'hecho'`, así que quedan fuera por construcción, no por una lista aparte. Salen de
   ETAPAS y no de una lista escrita aquí —la misma decisión que mod/proyectos.js tomó para sus
   columnas—: el día que entre una etapa nueva antes de «listo», el tablero la enseña sin que
   nadie tenga que acordarse de este archivo. */
const ESTACIONES = Proy.ETAPAS.slice(0, Proy.ETAPAS.indexOf('listo') + 1);

/* El orden en que se leen las fichas de cada estación. Lo que no llega primero, y lo que no
   tiene fecha al final con su reloj corriendo. Es un orden ESTABLE: con los mismos datos sale
   la misma fila, porque una fila que se reordena sola entre dos aperturas no se puede aprender. */
const PESO = { no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4 };

/* Si este rol pone fechas. Es la misma regla que `puedeAgendar` de js/mod/fabricacion.js: pagos
   no agenda. */
const puedeAgendar = () => Prefs.rol() !== 'pagos';

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
     vivo mientras se mira otra cosa. El pase con `proyecto_id` —el «Acomodar en la lámina» de
     la ficha de Proyectos— se queda aquí, porque lo que trae es el aviso de origen que solo
     pinta esta pantalla.

     Debajo se pinta igual el TABLERO, sin `return`: ir a la mesa puede pedir confirmación (el
     Cotizador que se poda al abrirla, ver `montarDeVerdad` en app.js), y si la respuesta es
     quedarse, lo que queda en pantalla es este, que no puede quedarse en blanco. */
  const aLaMesa = !!(pase && pase.vista === 'anidador' && !pase.proyecto_id && conMesa() &&
                     ctx && typeof ctx.ir === 'function');
  if (aLaMesa) { _vista = 'tablero'; ctx.ir('anidador'); }
  /* La mesa de corte solo para quien tiene la ruta `anidador`. El pase que la pide llega de
     sitios que no miran el rol, así que la puerta está aquí y no en cada uno. */
  if (pase && pase.vista && !aLaMesa) _vista = (pase.vista === 'anidador' && conMesa()) ? 'anidador' : 'tablero';
  _origen = (pase && pase.proyecto_id) ? pase : null;

  _cont.addEventListener('click', _alClic = conservandoFoco(alClic));
  const capa = $('pf-pide');
  if (capa) capa.addEventListener('click', alClicPide);
  window.addEventListener('al3d-sin-base', alCambiarSinBase);
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

  /* El esqueleto con retardo lo pone el router para TODOS los módulos (esqueletoModulo, en
     nucleo/ui.js), y lo quita en cuanto esta sección tiene algo pintado. */
  await recargar();
}

/** El globo de la barra sin montar la pantalla: lo llama app.js al arrancar y después de
 *  cada sincronización, para que los pendientes se vean sin tener que entrar aquí. Solo lee;
 *  no pinta nada. */
export async function contar() {
  return { hoy: globo(await leer()) };
}

/* El globo de la pestaña: lo que no espera a mañana. Lo que no llega a su fecha y, desde octubre
   de 2026, los proyectos a los que les faltan datos y se entregan en una semana o menos (o ya se
   les pasó la fecha): sin teléfono ni dirección, la instalación del jueves no sale. Los que faltan
   de datos pero se entregan en un mes no suman aquí: un globo que cuenta todo lo pendiente se
   aprende a ignorar. */
function globo(d) {
  return d.V.filter(v => v.estado === 'no_llega').length + d.faltan.filter(x => x.pronto).length;
}

/* Con la base mandando y este teléfono sin sesión en ella, nada baja: un taller vacío y «Nada urgente hoy» serían una
   afirmación falsa. app.js lo marca con la clase `sin-base` en <html> y el aviso `al3d-sin-base` (auditoría 2026-10-25, ES-4). */
const sinBase = () => { try { return document.documentElement.classList.contains('sin-base'); } catch (_) { return false; } };
function alCambiarSinBase() { if (_cont && _d) pintar(); }

export function desmontar() {
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_relojMarco) { clearTimeout(_relojMarco); _relojMarco = null; }
  /* El marco de la mesa se va al salir. El router NO vacía la sección que se abandona —la vacía el
     próximo montaje—, y con el despeje la salida normal de la mesa es «‹ Volver a <proyecto>», que
     cambia de pantalla: sin esto el anidador seguía vivo y escondido, con sus Web Workers
     calculando, hasta la siguiente visita al Tablero. Quitar el <iframe> los mata. */
  const marco = $('pf-anid-marco');
  if (marco) { const caja = marco.closest('.pf-marco-caja'); (caja || marco).remove(); }
  if (_cont && _oyendo) _cont.removeEventListener('click', _alClic);
  const capa = $('pf-pide');
  if (capa) capa.removeEventListener('click', alClicPide);
  /* Si el modal quedó abierto —se cambió de rol con la pregunta enfrente— se cierra: la capa
     es del documento, no de este módulo, y dejarla puesta bloquea la pantalla nueva. */
  if (_pide) { _pide = null; cerrarCapa('pf-pide'); }
  soltarBarra();
  /* Se suelta la guarda del remonte: la pide quien sostiene un marco vivo, y este ya no lo
     sostiene. El router también la apaga al montar el siguiente. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  window.removeEventListener('resize', alRedimensionar);
  window.removeEventListener('al3d-sin-base', alCambiarSinBase);
  _cont = null; _ctx = null; _d = null; _oyendo = false; _acciones = [];
  _vista = 'tablero'; _origen = null;
}

/* La barra fija del teléfono no lleva nada en esta pantalla: lo que pedía —«Decidir N
   cotizaciones»— es el primer renglón de «Necesita tu decisión», a la vista sin bajar. Se limpia
   aquí y al salir: si el módulo anterior dejó su botón, flotaría encima de esta pantalla y el
   primer dedo del día lo apretaría creyendo que es de lo que está viendo. */
function soltarBarra() {
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
}

/* ============================================================================
   Leer — cinco lecturas, todas locales, ninguna a la red
   ============================================================================ */

async function leer() {
  const hoy = hoyISO();                     // UN solo `hoy` para todo el pintado

  const [todos, insts, cts, mat, fres] = await Promise.all([
    /* TODOS, cancelados incluidos: «sin decidir» necesita sus folios para no volver a
       preguntar por una cotización que alguien ya rechazó. */
    Proy.listar({}),
    Agenda.listar({ vivas: true }),
    Material.constantes(),
    /* Una sola lectura del almacén para todos los trabajos. `dictamen()` es puro sobre esto,
       y es EL MISMO juez que pinta el semáforo del Calendario. */
    Agenda.contextoMaterial(),
    Sync.frescura(),
  ]);

  const vivos = (todos || []).filter(p => p && p.etapa !== 'cancelado');

  /* La instalación viva de cada proyecto. La primera que aparezca: `Agenda.listar({vivas})`
     ya excluye las canceladas. */
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
     una hipótesis contada desde el día de la venta y no un trabajo con día prometido. Es de
     ellos de quien se pregunta si falta material: lo de dentro de un mes todavía no se compra. */
  const enTaller = V.filter(v => v.ancla === 'instalacion' && v.empezar <= hoy && v.listo >= hoy);

  /* Las cotizaciones autorizadas que nadie decidió. Solo dirección: es la única que puede
     contestar, y es el eslabón sin el cual no hay proyecto, ni agenda, ni material. */
  const pendientes = Prefs.rol() === 'direccion'
    ? Cot.sinDecidir(new Set((todos || []).map(p => p && p.folio_global).filter(Boolean)), 0)
    : [];

  const VIVAS_SIN_MARCAR = ['propuesta', 'confirmada', 'reagendada'];

  return {
    hoy, V, vivos, porId, instDe, mat, fres, enTaller, pendientes, semDe,
    /* Las que YA PASARON Y NADIE MARCÓ: dejan el almacén sin descontar y la cobranza sin
       arrancar, y son invisibles en cualquier otra pantalla. */
    /* Sin las de un proyecto que ya está en «Instalado» o «En garantía» (o que no se dio): ahí la
       obra ya se dijo hecha, y pedir otra vez «Ya se instaló» es el aviso que A10 de «Qué
       atender» ya no da (js/datos/reglas.js). Pasaba con las ventas que bajan de la base con su
       etapa y la cita en «confirmada» (auditoría 2026-10-25, TP-10). */
    vencidas: (insts || []).filter(i => {
      if (!(i && i.fecha && i.fecha < hoy && VIVAS_SIN_MARCAR.includes(i.estado))) return false;
      const p = porId.get(i.proyecto_id);
      return !!p && p.etapa !== 'instalado' && p.etapa !== 'garantia';
    })
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
    /* «Faltan datos» (js/datos/datos-de-entrega.js): los del taller sin teléfono, sin forma de
       entrega o, si se instalan, sin dirección o sin pin. Por la fecha de entrega más cercana;
       la fecha es la de su instalación viva, la misma que pinta el Calendario. */
    faltan: DD.faltanDatos(vivos, { hoy, fechaDe: p => (instDe.get(p.id) || {}).fecha || null }),
    /* La próxima instalación, sin las hechas: marcada la de hoy, «la próxima» no puede ser ella. */
    prox: (insts || []).filter(i => i && i.fecha && i.fecha >= hoy && i.estado !== 'hecha')
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))[0] || null,
  };
}

async function recargar() {
  if (!_cont) return;
  const d = await leer();
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (!_cont) return;          // se cambió de módulo mientras se leía
  _d = d;
  pintar();
  cargarAgente();
}

/* ----- El agente de ventas (docs/AGENTE-VENTAS.md) -----
   Lo que el agente no pudo cotizar solo vive en la nube, no en el teléfono. Se pide DESPUÉS del
   primer pintado (decisión 3 de la cabecera: el tablero no espera a la red) y solo si este aparato
   tiene la nube encendida y quien entra es Dirección. Con la nube apagada no hay petición ni
   renglón, y el tablero queda idéntico. supa.js se pide con import() y nunca arriba: con la nube
   apagada no se carga (pruebas/supabase-entrada.mjs). */
const nubeEncendida = () => { try { return /"encendido":true/.test(localStorage.getItem('al3d_pf_supa') || ''); } catch (_) { return false; } };

async function cargarAgente() {
  if (Prefs.rol() !== 'direccion' || !nubeEncendida()) { _agente = null; return; }
  try {
    const Supa = await import('../nucleo/supa.js');
    if (!(await Supa.haySesion())) return;
    const a = await Supa.acceso();
    if (a.estado !== 'activo' || a.area !== 'direccion') return;
    const lista = await Supa.decisionesDelAgente();
    if (!_cont) return;
    const cambio = JSON.stringify(lista) !== JSON.stringify(_agente || []);
    _agente = lista;
    if (cambio && _vista === 'tablero') pintar();
  } catch (_) { /* sin red o sin permiso: el tablero se queda como estaba */ }
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  const d = _d;
  if (!_cont || !d) return;
  const rol = Prefs.rol();

  _acciones = [];

  /* El rol puede cambiar entre dos montajes: quien estaba en la mesa de corte y pasa a pagos no
     puede seguir en ella. */
  if (_vista === 'anidador' && !conMesa()) _vista = 'tablero';
  if (_vista === 'anidador') { pintarAnidador(); return; }

  /* Se suelta la guarda del remonte al volver de la mesa de corte: aquí no hay marco que
     proteger, y dejarla puesta significaría que un proyecto ganado en el cotizador ya no
     repinta este tablero. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  window.removeEventListener('resize', alRedimensionar);

  _cont.innerHTML =
    avisoFrescura(d) +
    '<div class="tb-limpio">' +
      resumen(d, Prefs.veDinero()) +
      necesita(d, rol) +
      elTaller(d) +
      proxima(d) +
      pieAvisos() +
    '</div>';

  publicarCuentas(d);
  soltarBarra();
}

/* ----- La frescura, solo cuando avisa -----
   «Todo lo que ves vive en este dispositivo» y «Al día» eran un renglón fijo arriba de todo que
   no pedía nada a nadie. Se quedan las bandas que sí: hay puente y algo de otro teléfono lleva
   días sin llegar. Las otras dos viven en Ajustes, que es donde se pregunta por eso. */
function avisoFrescura(d) {
  if (!Sync.disponible() || (d.fres && d.fres.al_dia)) return '';
  return bandaFrescura(d.fres, true);
}

/* ----- El resumen -----
   La fecha con todas sus letras, porque es lo primero que se lee en la mañana, y cuánto hay en
   el taller: todo lo que está en una estación, de «Ganado» a «Listo para instalar». El importe
   NO EXISTE para quien no ve dinero: no se difumina, y nunca se imprime $0. Para quien sí lo ve,
   va marcado `pf-interno`: con el modo cliente de Proyectos encendido (P12) la suma de todo lo
   vendido se tapa aquí también, y se destapa con el dedo sostenido o con «Ver importes». */
const DIA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                   'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(iso) {
  const f = fechaLocal(iso);
  return f ? DIA_LARGO[f.getDay()] + ' ' + f.getDate() + ' de ' + MES_LARGO[f.getMonth()] : '';
}

function resumen(d, veDinero) {
  const n = d.V.length;
  let dinero = '';
  if (veDinero) {
    const suma = d.V.reduce((s, v) => {
      const p = d.porId.get(v.proyecto_id);
      const x = Number(p && p.precio_auth);
      return s + (isFinite(x) ? x : 0);
    }, 0);
    if (suma > 0) dinero = '<span class="tb-res-sep" aria-hidden="true"> · </span><b class="tb-res-dinero pf-interno">' + esc(money(suma)) + '</b>';
  }
  return '<div class="tb-resumen">' +
    '<p class="tb-res-fecha">' + esc(fechaLarga(d.hoy)) + '</p>' +
    '<p class="tb-res-total"><b>' + n + '</b> ' + (n === 1 ? 'trabajo' : 'trabajos') + ' en el taller' + dinero + '</p>' +
    atajos() +
    '</div>';
}

/* ----- Los atajos (capa Estudio, 20/10/2026) -----
   Dos o tres pastillas junto al saludo con lo que más se hace al abrir la app: cotizar, buscar un
   proyecto para contestarle a un cliente y, para quien cobra, Control. No son avisos ni cuentas
   —el Tablero sigue despejado—: son puertas, y solo salen las que el rol tiene (`puedeIr`).
   «Buscar» no abre nada propio: aprieta la lupa del encabezado, que es la misma paleta de siempre. */
function atajos() {
  const out = [];
  if (puedeIr('cotizador')) out.push(atajo('Cotizar', 'i-mas', 'tb-atajo pri', { tipo: 'ir', ruta: 'cotizador' }));
  out.push(atajo('Buscar', 'i-buscar', 'tb-atajo', { tipo: 'buscar' }));
  /* Con la base mandando el dinero se mueve en «Cobros y abonos», y en el teléfono de Dirección
     Control vive en «Más», con esa pestaña en la séptima casilla: dos toques y una búsqueda para el
     trabajo de todos los días. Aquí queda a uno (auditoría 2026-10-25, TR-8). Solo con la base:
     con la hoja esa pestaña es la prueba de Supabase y no se cobra ahí. */
  if (puedeIr('control') && laBaseManda()) {
    out.push(atajo('Cobros y abonos', 'i-venta', 'tb-atajo', { tipo: 'pasar', ruta: 'control', dato: { tab: 'asientos' } }));
  }
  if (puedeIr('control')) out.push(atajo('Control', 'i-control', 'tb-atajo', { tipo: 'ir', ruta: 'control' }));
  return '<div class="tb-atajos">' + out.join('') + '</div>';
}

function atajo(label, icono, clase, accion) {
  const clave = ['atajo', accion.tipo, accion.ruta || ''].join(':');
  return '<button type="button" class="' + clase + '" data-acc="' + (_acciones.push(accion) - 1) + '" data-clave="' + esc(clave) + '">' +
    ico(icono) + '<span>' + esc(label) + '</span></button>';
}

/* ----- «Necesita tu decisión» -----
   Un renglón grande por asunto, y SOLO si lo hay: lo que se rompe pronto o lo que nadie más que
   quien mira puede contestar. Cada uno lleva a donde se atiende —con un solo trabajo, a ese
   trabajo—. Para los roles que no deciden ventas se llama «Pendientes», que es lo que son.

   El orden es el de cuánto truena: lo que dirección tiene que contestar primero (sin ese toque
   no hay proyecto, ni agenda, ni material), luego lo que ya se pasó o se va a pasar, luego lo
   que se compra y lo que se agenda. Vacío NO es un hueco: dice «Nada urgente hoy», en una línea,
   y el taller queda debajo a la vista. */
function necesita(d, rol) {
  const filas = [];

  const nd = d.pendientes.length;
  if (rol === 'direccion' && nd) {
    const ahora = Date.now();
    const vieja = Math.max(0, ...d.pendientes.map(e => Math.floor((ahora - (Number(e.ts) || ahora)) / 86400000)));
    filas.push(filaNecesita(nd, 'a', nd === 1 ? 'Cotización por decidir' : 'Cotizaciones por decidir',
      vieja >= 1 ? (nd === 1 ? 'Lleva ' : 'La más vieja lleva ') + vieja + (vieja === 1 ? ' día' : ' días') + ' autorizada'
                 : 'Autorizada hoy',
      { tipo: 'ir', ruta: 'proyectos', que: 'decidir en Proyectos' }));
  }

  /* Lo que el agente de ventas no cotizó solo: un renglón que abre la más vieja; al decidirla sale la siguiente.
     La regla de Elías (2026-10-25): del saludo a la cotización, EL MISMO DÍA. El agente le promete al cliente
     «hoy mismo»; lo que llegó otro día y sigue esperando sale en rojo y lo dice. */
  const ag = rol === 'direccion' && _agente ? _agente : [];
  if (ag.length) {
    const negocio = x => String(x.resumen || '').split(' · ')[0] || 'Sin nombre';
    const razon = x => (Array.isArray(x.razones) && x.razones[0] && x.razones[0].razon) || '';
    const diaMx = x => new Date(x.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const hace = x => {
      const min = Math.max(0, Math.round((Date.now() - Date.parse(x.created_at)) / 60000));
      return min < 60 ? 'hace ' + min + ' min' : min < 1440 ? 'hace ' + Math.floor(min / 60) + ' h' : 'de hace ' + Math.floor(min / 1440) + (min < 2880 ? ' día' : ' días');
    };
    const atrasada = ag.some(x => diaMx(x) < d.hoy);
    filas.push(filaNecesita(ag.length, atrasada ? 'mal' : 'a',
      (atrasada ? 'Cotización del agente que no salió el mismo día' : 'El agente de ventas te pregunta') + (ag.length > 1 ? ' · ' + ag.length : ''),
      ag.length === 1 ? negocio(ag[0]) + ' · ' + hace(ag[0]) + ' · ' + razon(ag[0]) : nombres(ag.map(negocio)) + ' · la primera ' + hace(ag[0]),
      { tipo: 'agente', id: ag[0].id, que: 'decidir lo de ' + negocio(ag[0]) }));
  }

  const nl = d.V.filter(v => v.estado === 'no_llega').sort(ordenar);
  if (nl.length) {
    const v = nl[0];
    filas.push(filaNecesita(nl.length, 'mal', nl.length === 1 ? 'No llega a su fecha' : 'No llegan a su fecha',
      nl.length === 1 ? nombreDe(d, v) + ' · ' + cuandoSeInstala(d, v) : nombres(nl.map(x => nombreDe(d, x))),
      nl.length === 1 ? { tipo: 'abrir', id: v.proyecto_id, que: 'abrir ' + nombreDe(d, v) }
                      : { tipo: 'bajar', sel: '[data-destino="taller"]', donde: 'El taller', que: 'verlos en el taller' }));
  }

  /* La instalación que ya pasó de un trabajo que tampoco llega es el MISMO problema dicho dos
     veces: va una sola vez, en «No llega a su fecha», y su ficha dice lo demás. */
  const yaDichos = new Set(nl.map(v => v.proyecto_id));
  const venc = d.vencidas.filter(i => !yaDichos.has(i.proyecto_id));
  if (venc.length) {
    const n = venc.length, i = venc[0];
    const nom = x => negocioDe(d.porId.get(x.proyecto_id), x.titulo);
    filas.push(filaNecesita(n, 'mal', n === 1 ? 'Instalación pasada sin marcar' : 'Instalaciones pasadas sin marcar',
      n === 1 ? nom(i) + ' · ' + fmtFechaDia(i.fecha) : nombres(venc.map(nom)),
      n === 1 ? { tipo: 'abrir', id: i.proyecto_id, que: 'abrir ' + nom(i) }
              : (puedeIr('agenda') ? { tipo: 'semana', dia: i.fecha, que: 'verlas en el Calendario' } : null)));
  }

  const fp = d.faltan.filter(x => x.pronto);
  if (fp.length) {
    const x = fp[0], nom = negocioDe(x.p);
    filas.push(filaNecesita(fp.length, 'mal', 'Faltan datos para entregar',
      fp.length === 1 ? nom + ': ' + x.falta.map(k => DD.textoDeFalta(x.p, k)).join(' · ') : nombres(fp.map(y => negocioDe(y.p))),
      editablesDe(x.falta, rol).length ? { tipo: 'completar', id: x.p.id, que: 'completar los datos de ' + nom }
                                       : { tipo: 'abrir', id: x.p.id, que: 'abrir ' + nom }));
  }

  /* Pagos no mueve el almacén. Y con Material en mantenimiento nadie: el aviso mandaba a una pantalla apagada (auditoría
     2026-10-25, CM-2). */
  if ((rol === 'direccion' || rol === 'fabricacion') && !Agenda.MATERIAL_EN_MANTENIMIENTO) {
    const sm = d.enTaller.map(v => ({ v, sem: d.semDe(v.proyecto_id) }))
      .filter(x => x.sem.estado === 'falta' || x.sem.estado === 'grave')
      .sort((a, b) => (a.sem.dias === null ? 1e9 : a.sem.dias) - (b.sem.dias === null ? 1e9 : b.sem.dias));
    if (sm.length) {
      const x = sm[0];
      filas.push(filaNecesita(sm.length, sm.some(y => y.sem.estado === 'grave') ? 'mal' : 'av',
        sm.length === 1 ? 'Trabajo sin material' : 'Trabajos sin material',
        (sm.length === 1 ? nombreDe(d, x.v) : 'El primero, ' + nombreDe(d, x.v)) + ', ' + cuandoMaterial(x.sem),
        puedeIr('material') ? { tipo: 'ir', ruta: 'material', que: 'ver la lista de compra' } : null));
    }
  }

  const sf = d.V.filter(v => v.ancla !== 'instalacion').sort(ordenar);
  if (sf.length && puedeAgendar()) {
    filas.push(filaNecesita(sf.length, 'av', sf.length === 1 ? 'Ganado sin fecha de instalación' : 'Ganados sin fecha de instalación',
      nombres(sf.map(v => nombreDe(d, v))),
      puedeIr('agenda') ? { tipo: 'pasar', ruta: 'agenda', dato: { hoja: 'agendar' }, que: 'ponerles fecha en el Calendario' } : null));
  }

  const titulo = rol === 'direccion' ? 'Necesita tu decisión' : 'Pendientes';
  return '<section class="tb-sec tb-a-nec" aria-labelledby="tb-nec-t">' +
    '<h2 class="tb-sec-t" id="tb-nec-t">' + titulo + '</h2>' +
    (filas.length
      ? '<div class="tb-caja tb-necesita">' + filas.join('') + '</div>'
      : (sinBase()
          ? '<p class="tb-caja tb-nada">' + ico('i-aviso') + '<span>Este teléfono no ha entrado a la base: lo que ves puede no estar al día.</span></p>'
          : '<p class="tb-caja tb-nada">' + ico('i-check') + '<span>Nada urgente hoy.</span></p>')) +
    '</section>';
}

/* Un renglón de «Necesita tu decisión»: la cifra grande en su color, lo que es y, debajo, de quién
   se trata. El color nunca va solo: el título ya dice qué es. Sin acción —el rol no tiene la
   pantalla donde se atiende— es un renglón que se lee y no un botón que no hace nada. */
function filaNecesita(n, tono, titulo, detalle, accion) {
  const cuerpo = '<span class="tb-nec-n ' + tono + '">' + n + '</span>' +
    '<span class="tb-nec-tx"><span class="tb-nec-t">' + esc(titulo) + '</span>' +
    (detalle ? '<span class="tb-nec-d">' + esc(detalle) + '</span>' : '') + '</span>';
  if (!accion) return '<div class="tb-nec">' + cuerpo + '</div>';
  const i = _acciones.push(accion) - 1;
  const clave = [accion.tipo, accion.id || accion.ruta || accion.sel || ''].join(':');
  return '<button type="button" class="tb-nec" data-acc="' + i + '" data-clave="' + esc(clave) + '">' + cuerpo +
    '<span class="tb-nec-ir" aria-hidden="true">›</span>' +
    '<span class="solo-voz">, ' + esc(accion.que || '') + '</span></button>';
}

/* «se instala el 21 oct 2026», o «se instalaba…» si ya pasó. Sin instalación, el día en que
   debía estar listo, que es lo que calcula la ventana. */
function cuandoSeInstala(d, v) {
  const f = (d.instDe.get(v.proyecto_id) || {}).fecha;
  if (f) return (f < d.hoy ? 'se instalaba el ' : 'se instala el ') + fmtFecha(f);
  return v.listo ? 'debía estar listo el ' + fmtFecha(v.listo) : 'sin fecha';
}

function cuandoMaterial(sem) {
  if (sem.dias === null || sem.dias === undefined) return 'sin fecha de instalación';
  if (sem.dias < 0) return 'ya se tenía que haber instalado';
  if (sem.dias === 0) return 'se instala hoy';
  if (sem.dias === 1) return 'se instala mañana';
  return 'se instala en ' + sem.dias + ' días';
}

/* «La Perla, Gym Titanio y 2 más»: los dos primeros, que ya vienen en orden de urgencia. */
function nombres(xs) {
  if (xs.length <= 2) return xs.join(' y ');
  return xs.slice(0, 2).join(', ') + ' y ' + (xs.length - 2) + ' más';
}

/* El nombre corto de un trabajo: el negocio. El nombre completo sigue la convención de Notion
   —«Andrey - Healthylicious (Panel Alucobond)», ver `nombreDerivado` en js/datos/proyectos.js—,
   y en una ficha de 360 px eso es una línea entera para decir «Healthylicious». Lo que vino de la
   hoja no siempre trae `negocio`: se le quitan el contacto y el paréntesis al nombre. */
function negocioDe(p, respaldo) {
  const neg = String((p && p.negocio) || '').trim();
  if (neg) return neg;
  let n = String((p && p.nombre) || respaldo || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  const i = n.indexOf(' - ');
  if (i >= 0) n = n.slice(i + 3).trim();
  return n || String((p && p.folio_local) || 'Sin nombre');
}
const nombreDe = (d, v) => negocioDe(d.porId.get(v.proyecto_id), v.titulo);

/* ----- «El taller» -----
   Las cinco estaciones en el orden del proceso, SIEMPRE, aunque alguna esté vacía: es una
   tubería, no un ranking, y una estación que aparece y desaparece mueve todo lo de abajo. Cada
   trabajo es una ficha con su nombre corto. Rojo es que va tarde o no llega, ámbar que algo le
   toca hoy; la leyenda lo dice arriba con palabras y cada ficha lo lleva escrito para el lector
   de pantalla. El `title` es la frase completa de la ventana, para quien pasa el ratón.

   Tocar una ficha abre el proyecto. Ahí se avanza la etapa: esta pantalla ya no escribe nada. */
function elTaller(d) {
  let cuerpo;
  if (!d.vivos.length && sinBase()) {
    cuerpo = vacioTaller('Este teléfono no ha entrado a la base',
      'Lo que ves puede no estar al día. Entra con tu cuenta de Google desde la banda de arriba y el taller aparece aquí.');
  } else if (!d.vivos.length) {
    cuerpo = vacioTaller('Todavía no hay nada en el taller',
      'Cuando una cotización autorizada se marque como ganada, el trabajo aparece aquí en su estación.',
      btn('Abrir el Cotizador', 'btn btn-pri', { tipo: 'ir', ruta: 'cotizador' }));
  } else if (!d.V.length) {
    cuerpo = vacioTaller('Nada en la mesa',
      'Lo que hay ya está instalado o cerrado. En Proyectos lo ves con su etapa.',
      btn('Ver los proyectos', 'btn btn-gho pf-btn-corto', { tipo: 'ir', ruta: 'proyectos' }));
  } else {
    cuerpo = ESTACIONES.map(e => estacion(d, e)).join('');
  }
  const leyenda = d.V.length
    ? '<p class="tb-leyenda"><span class="tb-punto mal" aria-hidden="true"></span>va tarde' +
      '<span class="tb-punto av" aria-hidden="true"></span>toca hoy</p>'
    : '';
  return '<section class="tb-sec tb-a-tal" aria-labelledby="tb-tal-t">' +
    '<div class="tb-sec-h" data-destino="taller"><h2 class="tb-sec-t" id="tb-tal-t">El taller</h2>' + leyenda + '</div>' +
    '<div class="tb-caja tb-taller">' + cuerpo + '</div>' +
    '</section>';
}

function estacion(d, e) {
  const g = d.V.filter(v => v.etapa_real === e).sort(ordenar);
  return '<div class="tb-est" data-etapa="' + esc(e) + '">' +
    '<p class="tb-est-h"><b>' + g.length + '</b>' + esc(ETAPA_NOMBRE[e] || e) + '</p>' +
    (g.length
      ? '<ul class="tb-fichas">' + g.map(v => '<li>' + ficha(d, v) + '</li>').join('') + '</ul>'
      : '<p class="tb-est-vacia">Nada aquí</p>') +
    '</div>';
}

function ficha(d, v) {
  const tarde = v.estado === 'no_llega' || v.atraso_dias > 0;
  const hoy = !tarde && v.holgura_dias === 0;
  const tono = tarde ? ' mal' : (hoy ? ' av' : '');
  const palabra = v.estado === 'no_llega' ? 'no llega a su fecha' : (tarde ? 'va tarde' : (hoy ? 'toca hoy' : ''));
  const i = _acciones.push({ tipo: 'abrir', id: v.proyecto_id }) - 1;
  return '<button type="button" class="tb-ficha' + tono + '" data-acc="' + i + '" data-clave="abrir:' + esc(v.proyecto_id) + '"' +
    (v.texto ? ' title="' + esc(v.texto) + '"' : '') + (tarde ? ' data-tarde' : '') + '>' +
    (tono ? '<span class="tb-punto' + tono + '" aria-hidden="true"></span>' : '') +
    esc(nombreDe(d, v)) +
    (palabra ? '<span class="solo-voz">, ' + palabra + '</span>' : '') +
    '</button>';
}

function ordenar(a, b) {
  return (PESO[a.estado] - PESO[b.estado])
      || (b.atraso_dias - a.atraso_dias)
      || (a.holgura_dias - b.holgura_dias)
      || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es');
}

/* `vacio()` de ui.js clava el icono de carpeta, que aquí diría «archivo» donde queremos
   decir «taller». Se escribe a mano con `i-taller`, igual que ya hace el Calendario. */
function vacioTaller(titulo, detalle, accionHTML) {
  return '<div class="vacio">' + ico('i-taller') +
    '<p class="vacio-t">' + esc(titulo) + '</p>' +
    (detalle ? '<p class="vacio-d">' + esc(detalle) + '</p>' : '') +
    (accionHTML || '') + '</div>';
}

/* ----- La próxima instalación -----
   Una línea, y la puerta al Calendario en la semana de ese día. La lista de la semana, la ruta
   en el mapa y las que no tienen pin viven allá. */
function proxima(d) {
  const x = d.prox;
  const texto = x
    ? fmtFechaDia(x.fecha) + ' · ' + negocioDe(d.porId.get(x.proyecto_id), x.titulo)
    : 'No hay instalaciones con fecha';
  const cal = puedeIr('agenda')
    ? btn('Calendario ›', 'tb-enlace', { tipo: 'semana', dia: x ? x.fecha : null })
    : '';
  return '<section class="tb-caja tb-prox" aria-labelledby="tb-prox-t">' +
    '<div class="tb-prox-tx"><h2 class="tb-sec-t" id="tb-prox-t">Próxima instalación</h2>' +
    '<p class="tb-prox-d">' + esc(texto) + '</p></div>' + cal +
    '</section>';
}

/* «Qué atender» es una ruta oculta (RUTAS en app.js): no tiene botón en ninguna barra y esta es
   su única puerta. Sin número, como siempre: contarlos exigiría `Reglas.evaluar()` con
   existencias y calibración, cuatro lecturas más en la pantalla de entrada. */
function pieAvisos() {
  if (!puedeIr('atender')) return '';
  return '<p class="tb-pie">' + btn('Todos los avisos ›', 'tb-enlace', { tipo: 'ir', ruta: 'atender' }) + '</p>';
}

/* Si este rol tiene esa ruta. Sale del router —`ctx.tieneRuta`— y no del rol: la regla de quién
   ve qué vive en un solo lugar (RUTAS, en app.js). */
function puedeIr(ruta) {
  return !!(_ctx && typeof _ctx.tieneRuta === 'function' && _ctx.tieneRuta(ruta));
}

/* Si este rol tiene la mesa de corte. La segunda línea es para cuando no hay contexto, con la
   misma regla que tiene hoy la lista de rutas. */
function conMesa() {
  if (_ctx && typeof _ctx.tieneRuta === 'function') return _ctx.tieneRuta('anidador');
  return Prefs.rol() !== 'pagos';
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
   svgparser.js y js/lib/* son el master de SVGnest salvo los cambios locales marcados con
   AL3D, y portarlo a módulo exigiría otro, que ya tocaría cómo arrancan los workers. El marco
   es la forma de embeberlo sin eso.

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
    volverHTML() +
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

  soltarBarra();
  if (_ctx && _ctx.ponerCuenta) _ctx.ponerCuenta('hoy', 0);
}

/* La salida de la mesa. Antes era el segmento «Carga del taller / Mesa de corte» de arriba del
   tablero; con el despeje la mesa solo se abre desde la ficha de un proyecto, y la salida
   natural es volver a ESE proyecto. Sin proyecto —un pase viejo—, al tablero. */
function volverHTML() {
  const conProy = !!(_origen && _origen.proyecto_id);
  return '<p class="no-papel tb-volver">' +
    btn(conProy ? '‹ Volver a ' + (_origen.nombre || 'el proyecto') : '‹ Volver al tablero', 'btn btn-gho pf-btn-corto',
        conProy ? { tipo: 'abrir', id: _origen.proyecto_id } : { tipo: 'tablero' }) +
    '</p>';
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
  /* Dos frases distintas, y cada una una sola vez. La invitación a soltar el SVG solo cuando
     no se sabe de dónde vienes: si vienes de un proyecto, el párrafo de abajo ya la da con su
     nombre. El aviso del teléfono va siempre, porque dice otra cosa. */
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

/* ============================================================================
   Completar los datos que faltan
   ============================================================================ */

/* Lo que de esas faltas puede completar este rol. El pin cuenta como uno: se escribe con `lat`,
   `lng`, `geo_fuente` y `maps_url`, y dirección y fabricación tienen los cuatro. */
const CAMPO_DE_FALTA = { tel: 'tel', entrega: 'entrega', dir: 'dir_texto', pin: 'lat' };
function editablesDe(falta, rol) {
  if (typeof Proy.puedeEscribir !== 'function') return [];
  return falta.filter(k => Proy.puedeEscribir(rol, CAMPO_DE_FALTA[k]));
}

/* Quién completa lo que este rol no escribe, en palabras. */
const QUIEN_COMPLETA = {
  tel: 'El teléfono lo completan dirección, fabricación o pagos.',
  entrega: 'Cómo se entrega lo deciden dirección o fabricación.',
  dir: 'La dirección la completan dirección o fabricación.',
  pin: 'La ubicación la ponen dirección o fabricación.',
};

/* El panel corto de «Completar»: solo los campos que le faltan a ESE proyecto y que este rol
   escribe, con el mismo bloque que «Se ganó» (js/mod/datos-entrega.js). Guarda lo que se llenó
   aunque no sea todo; lo demás se queda pendiente. */
function abrirCompletar(id) {
  const capa = $('pf-pide');
  const x = _d && _d.faltan.find(y => y.p.id === id);
  if (!capa || !x) return;
  const pide = editablesDe(x.falta, Prefs.rol());
  if (!pide.length) { hacer({ tipo: 'abrir', id }); return; }
  const noPuede = {};
  for (const k of x.falta) if (!pide.includes(k)) noPuede[k] = QUIEN_COMPLETA[k];
  const p = x.p;
  _pide = { tipo: 'completar', id, pide };
  capa.innerHTML = '<div class="pf-panel">' +
    '<div class="pf-panel-h"><h2>Completar los datos</h2>' +
      '<button type="button" class="pf-cerrar" data-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' +
      '<p class="pf-cuenta">' + esc(p.nombre || p.folio_local || 'Proyecto sin nombre') + '</p>' +
      '<p class="hintnote">Le falta: ' + esc(x.falta.map(k => DD.textoDeFalta(p, k)).join(', ')) +
        '. Llena lo que ya tengas; lo demás se queda pendiente.</p>' +
      /* El link guardado que no se pudo leer va prellenado: guardar otra vez lo vuelve a intentar. */
      DE.html({ maps: String(p.maps_url || '') },
        { modo: 'completar', pide, entregaActual: entregaDe(p), titulo: false, noPuede, clave: 'completar:' + id }) +
      '<p class="hintnote nota-av" id="pf-pide-msg" hidden></p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-cerrar>Cancelar</button>' +
      '<button type="button" class="btn btn-ok" data-completar-ok>Guardar</button>' +
    '</div></div>';
  DE.cablear(capa);
  abrirCapa('pf-pide', { hist: true });
}

async function guardarCompletar(boton) {
  const a = _pide;
  if (!a || a.tipo !== 'completar') return;
  const capa = $('pf-pide');
  const msg = $('pf-pide-msg');
  const decir = t => { if (msg) { msg.hidden = !t; msg.textContent = t || ''; } if (t) voz(t, true); };
  decir('');
  const d = DE.revisar(capa, { alFallar: (t, enSuCampo) => { if (enSuCampo) voz(t, true); else decir(t); } });
  if (!d) return;
  const rotulo = boton.textContent;
  const soltar = () => { if (boton.isConnected) { boton.disabled = false; boton.textContent = rotulo; } };
  boton.disabled = true;
  const parche = DE.parcheDe(d, a.pide);
  let aviso = '';
  /* El pin, solo si el campo se veía: con paquetería o recolección elegidas en este mismo panel,
     `leer` ya lo dejó vacío. */
  if (d.maps) {
    boton.textContent = 'Buscando el pin…';
    const u = await DE.ubicar(d.maps);
    if (!u.ok) { DE.avisar(capa, 'maps', u.mensaje); soltar(); return; }
    Object.assign(parche, u.parche);
    aviso = u.aviso;
  }
  if (!Object.keys(parche).length) { decir('No escribiste nada. Llena lo que ya tengas y guarda.'); soltar(); return; }
  const r = await Proy.actualizar(a.id, parche);
  if (!r.ok) { decir(r.mensaje); soltar(); return; }
  cerrarPide();
  const sigue = DD.queLeFalta(r.valor);
  toast((sigue.length
      ? 'Guardado. Todavía le falta: ' + sigue.map(k => DD.textoDeFalta(r.valor, k)).join(', ') + '.'
      : 'Listo: ya tiene todo para entregarse.') + (aviso ? ' ' + aviso : ''),
    'ok', aviso ? 7000 : 4200);
  await recargar();
}

/* El panel de una decisión del agente: qué pidió el cliente, por qué no lo cotizó solo, la plática
   reciente y dos salidas. «Mandar al cliente» lleva el precio (y el agente se lo da, con el anticipo y
   la cuenta escritos por código) o solo una nota (y el agente la pasa con sus palabras). «No lo
   hacemos» deja la conversación perdida; la nota, si la hay, le llega al cliente. */
const DE_AGENTE = { cliente: 'Cliente', agente: 'Agente', direccion: 'Tú' };

async function abrirAgente(id) {
  const capa = $('pf-pide');
  const x = (_agente || []).find(y => y.id === id);
  if (!capa || !x) return;
  _pide = { tipo: 'agente', id };
  let platica = [];
  try { platica = await (await import('../nucleo/supa.js')).platicaDelAgente(x.conversacion_id); } catch (_) { /* sin plática: se decide con el resumen */ }
  if (!_pide || _pide.id !== id) return;          // se cerró mientras se leía
  const razones = (Array.isArray(x.razones) ? x.razones : []).map(r => '<li>' + esc(r && r.razon || '') + '</li>').join('');
  const msjs = platica.map(m => '<li><b>' + esc(DE_AGENTE[m.de] || m.de) + ':</b> ' + esc(m.texto) + '</li>').join('');
  capa.innerHTML = '<div class="pf-panel">' +
    '<div class="pf-panel-h"><h2>Lo que pregunta el agente</h2>' +
      '<button type="button" class="pf-cerrar" data-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' +
      '<p class="pf-cuenta">' + esc(x.resumen || 'Sin resumen') + '</p>' +
      '<ul class="hintnote">' + razones + '</ul>' +
      (msjs ? '<details class="pliegue"><summary>La plática</summary><ul class="pf-nota">' + msjs + '</ul></details>' : '') +
      '<div class="fld"><label for="pf-ag-precio">Precio para el cliente (total, con IVA si lleva factura)</label>' +
        '<input type="text" id="pf-ag-precio" inputmode="decimal" autocomplete="off" placeholder="$0.00"></div>' +
      '<div class="fld"><label for="pf-ag-nota">Nota para el cliente (opcional)</label>' +
        '<textarea id="pf-ag-nota" rows="3" maxlength="600" placeholder="Ej. El logo va en caja de luz, por eso cambia el precio."></textarea></div>' +
      '<p class="hintnote">Con precio, el agente se lo da al cliente con el anticipo. Con nota, se la pasa con sus palabras.</p>' +
      '<p class="hintnote nota-av" id="pf-pide-msg" hidden></p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-agente="descartar">No lo hacemos</button>' +
      '<button type="button" class="btn btn-ok" data-agente="mandar">Mandar al cliente</button>' +
    '</div></div>';
  abrirCapa('pf-pide', { hist: true });
}

/* «$12,500.50», «12500», «12 500» → 12500.5; lo demás → NaN. */
const leerPrecio = t => Number(String(t || '').replace(/[$\s,]/g, ''));

async function decidirDelAgente(boton) {
  const a = _pide;
  if (!a || a.tipo !== 'agente') return;
  const msg = $('pf-pide-msg');
  const decir = t => { if (msg) { msg.hidden = !t; msg.textContent = t || ''; } if (t) voz(t, true); };
  decir('');
  const tx = ($('pf-ag-precio') || {}).value || '';
  const nota = (($('pf-ag-nota') || {}).value || '').trim();
  const precio = tx.trim() ? leerPrecio(tx) : null;
  if (precio !== null && !(precio > 0 && precio < 10000000)) { decir('Ese precio no se entiende. Escríbelo como 12500 o $12,500.'); return; }
  let accion;
  if (boton.dataset.agente === 'descartar') {
    if (!(await confirmarPf({ titulo: '¿No lo hacemos?', texto: 'La conversación queda como perdida.' + (nota ? ' Tu nota le llega al cliente.' : ' Si quieres que el cliente sepa por qué, escribe una nota antes.'),
      si: 'No lo hacemos', no: 'Volver', peligro: true }))) return;
    accion = 'descartar';
  } else if (precio !== null) accion = 'aprobar';
  else if (nota) accion = 'corregir';
  else { decir('Pon el precio o una nota para el cliente.'); return; }
  boton.disabled = true;
  let Supa = null;
  try {
    Supa = await import('../nucleo/supa.js');
    await Supa.decidirAgente(a.id, accion, accion === 'descartar' ? null : precio, nota);
  } catch (e) {
    decir(Supa ? Supa.mensajeDe(e) : 'No se pudo conectar con la nube.');
    boton.disabled = false;
    return;
  }
  cerrarPide();
  toast(accion === 'descartar' ? 'Listo: no se hace.' : 'Listo: el agente se lo dice al cliente.', 'ok', 4200);
  _agente = (_agente || []).filter(y => y.id !== a.id);
  pintar();
  cargarAgente();
}

function cerrarPide() { _pide = null; cerrarCapa('pf-pide'); }

async function alClicPide(ev) {
  if (!_pide) return;
  if (ev.target.closest('[data-cerrar]')) { cerrarPide(); return; }
  const ok = ev.target.closest('[data-completar-ok]');
  if (ok) { await guardarCompletar(ok); return; }
  const ag = ev.target.closest('[data-agente]');
  if (ag) await decidirDelAgente(ag);
}

/* ============================================================================
   Llevar a un lugar de la pantalla, y los globos
   ============================================================================ */

/* `senalar` con `desplazar` trae el destino a la vista —entre el encabezado fijo y la barra de
   abajo— y se cierra sobre él con las esquinas, una vez. El foco va al destino aunque sea un
   título (`tabindex="-1"`), y `voz()` dice dónde cayó. Sin la pieza queda el `scrollIntoView`. */
function llevarA(el, que) {
  if (!el.matches('button, a[href], input, select, textarea, [tabindex]')) el.tabIndex = -1;
  try { el.focus({ preventScroll: true }); } catch (_) {}
  const P = piezas();
  if (P && P.senalar) P.senalar(el, { desplazar: true });
  else el.scrollIntoView({ block: 'center', behavior: scrollSuave() });
  if (que) voz('Estás en ' + que);
}

function bajarA(a) {
  const el = _cont && _cont.querySelector(a.sel);
  if (el) llevarA(el, a.donde);
}

/** Los globos de la barra de módulos. El del tablero es lo que no llega: es lo único que no
 *  espera a mañana. */
function publicarCuentas(d) {
  if (!_ctx || !_ctx.ponerCuenta) return;
  _ctx.ponerCuenta('hoy', globo(d));
}

/* ============================================================================
   Tocar
   ============================================================================ */

function btn(label, clase, accion) {
  /* data-clave: qué hace el botón, estable entre pintados. conservandoFoco() (ui.js) devuelve
     el foco por ella; por data-acc caía en la acción de otro proyecto. */
  const clave = [accion.tipo, accion.id || accion.ruta || ''].join(':');
  return '<button type="button" class="' + clase + '" data-acc="' + (_acciones.push(accion) - 1) + '" data-clave="' + esc(clave) + '">' +
    esc(label) + '</button>';
}

async function alClic(ev) {
  if (ev.target.closest('[data-recargar]')) { location.reload(); return; }
  const b = ev.target.closest('[data-acc]');
  if (!b) return;
  const a = _acciones[Number(b.dataset.acc)];
  if (a) await hacer(a);
}

async function hacer(a) {
  if (!_ctx) return;
  if (a.tipo === 'bajar') { bajarA(a); return; }
  if (a.tipo === 'pasar') {
    if (_ctx.pasar) _ctx.pasar(a.ruta, a.dato); else _ctx.ir(a.ruta);
    return;
  }
  if (a.tipo === 'ir') { _ctx.ir(a.ruta); return; }
  if (a.tipo === 'buscar') { const lupa = document.getElementById('pf-cab-buscar'); if (lupa) lupa.click(); return; }
  if (a.tipo === 'abrir') {
    /* Con el pase, Proyectos abre la ficha directo. Sin él, «Abrir» te deja en una lista
       donde hay que volver a buscar lo que ya estabas mirando. */
    _vista = 'tablero'; _origen = null;
    if (_ctx.pasar) _ctx.pasar('proyectos', { proyecto_id: a.id });
    else _ctx.ir('proyectos');
    return;
  }
  if (a.tipo === 'semana') {
    if (_ctx.pasar) _ctx.pasar('agenda', { dia: a.dia || (_d ? _d.hoy : hoyISO()), vista: 'semana' });
    else _ctx.ir('agenda');
    return;
  }
  if (a.tipo === 'completar') { abrirCompletar(a.id); return; }
  if (a.tipo === 'agente') { await abrirAgente(a.id); return; }
  if (a.tipo === 'tablero') {
    _vista = 'tablero'; _origen = null;
    pintar();
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) { window.scrollTo(0, 0); }
    voz('Tablero');
  }
}
