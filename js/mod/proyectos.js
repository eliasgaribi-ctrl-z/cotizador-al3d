/* ============================================================================
   Proyectos — el tablero por ETAPA.

   Por etapa y nunca por `estatus_notion`. Son dos ejes distintos: la etapa dice en qué va
   la OBRA (ganado, cortado, armado, listo, instalado) y el estatus de Notion dice en qué va
   el DINERO (REPARANDO, COBRANDO, FABRICACION, LIQUIDADO). Mezclarlos es exactamente cómo
   se corrompe una vista que ya funciona: un proyecto instalado y sin cobrar tendría que
   estar en dos columnas a la vez, y quien lo capture va a elegir una. Aquí el estatus de
   Notion se pinta como ESPEJO —una línea de la ficha— y se captura, pero no ordena nada.

   Tres pantallas en un archivo, y es a propósito que sean el mismo archivo: la lista, la
   ficha del proyecto y la ORDEN DE TRABAJO leen los mismos tres objetos —el proyecto, su
   instalación y su requerimiento de material— y separarlas obligaba a cargarlos dos veces
   o a inventar un caché entre módulos.

   La orden de trabajo es la que más se va a usar, y no lleva ni un peso encima. No es por
   el rol: es porque se imprime y se le da al instalador, que no es de la casa. Misma razón
   por la que `Agenda.paraIcs` va sin dinero.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Cot from '../datos/cotizador.js';
import * as Proy from '../datos/proyectos.js';
import * as Material from '../datos/material.js';
import * as Stock from '../datos/stock.js';
import * as Agenda from '../datos/agenda.js';
/* Solo para mandar en el momento el alta de una venta que se vuelve a dar de alta en la hoja
   (ver `decisionHoja`), igual que Control manda la bandeja antes de traer. */
import * as Sync from '../datos/sync.js';
import * as Carpetas from '../datos/carpetas.js';
import * as Ventas from '../datos/ventas.js';
import * as Logo from '../datos/logo.js';
import * as DE from './datos-entrega.js';
import { ENTREGAS, ENTREGA_NOMBRE, ENTREGA_FECHA, TALLER_NOMBRE, DIRECCION_TALLER, entregaDe } from '../datos/entrega.js';
import { matOf, basOf, recOf, cajaOf } from '../datos/catalogo-precios.js';
import { isoDeSello, diasEntre } from '../nucleo/fechas.js';
import { ESTATUS as ESTATUS_NOTION, CUENTAS, ESTATUS_DE_PAGOS } from '../datos/puente.js';
import { laBaseManda } from '../datos/reglas.js';
import { esFiscal } from '../datos/dinero-cuentas.js';
import { ocultoDelTaller } from '../datos/taller.js';
import {
  $, esc, money, cant, ico, toast, voz, avisarResultado, vacio, segmento, chip,
  abrirCapa, cerrarCapa, copiarTexto, linkWa, telWa, fmtFecha, fmtFechaDia, fmtHora, cuando,
  diasHasta, hoyISO, rotularPapel, confirmarPf, repintarEnSitio, hayCapaAbierta, scrollSuave,
} from '../nucleo/ui.js';

/* Las piezas compartidas (js/piezas.js) son un guion clásico y cuelgan de `window.Piezas`:
   esta pantalla las PIDE, no las copia. Se pregunta en cada uso y no una vez al cargar, por lo
   mismo que en ui.js: este módulo también lo importan las pruebas de node, donde no hay
   ventana, y porque el guion puede no haber llegado (una caché a medias). Todo lo que se pinta
   con ellas tiene su camino sin ellas: un riel sin animar, una cifra sin rodar, un tablero sin
   arrastre. La pantalla funciona; lo que se pierde es el adorno. */
const P = () => (typeof window !== 'undefined' ? window.Piezas : null);

/* ============================================================================
   Estado del módulo. Todo aquí y todo se suelta en desmontar().
   ============================================================================ */

let cont = null;
let CTX = null;

let TODOS = [];             // todos los proyectos, incluidos los cancelados
let VISTA = [];             // lo que se está pintando
let SIN_DECIDIR = [];       // entradas del historial autorizadas que nadie decidió
let FECHA = new Map();      // proyecto_id -> instalación viva más próxima
let SEM = new Map();        // proyecto_id -> {estado, palabra, detalle}
let HUELLA = new Map();     // proyecto_id -> 'igual'|'cambio'|'desaparecio'|'sin_huella'
let REQS = new Map();       // proyecto_id -> requerimientos[]
let MATS = new Map();       // material_id -> fila del catálogo
/* Los renglones de la hoja (`ventas_hoja`), indexados como los ata Control (`Ventas.indiceHoja`),
   para los depósitos de la ficha. Solo se leen con dinero a la vista: fabricación no los tiene. */
let IDX_HOJA = null;
/* Lo que el relevo apartó para siempre de cada proyecto (proyecto_id → {motivo, cuando}): un cambio
   de etapa, de cuenta o de estatus que la base (o la hoja) rechazó y que solo se veía en Ajustes,
   con la tarjeta movida aquí y no allá (auditoría 2026-10-25, TP-5). Solo se lee la bandeja. */
let APARTADO = new Map();
/* La imagen de la cotización de cada proyecto, del historial de ESTE aparato (folio_global → data
   URL). Se lee una vez por carga: el historial trae imágenes y parsearlo por tarjeta es caro. */
let IMG_COT = new Map();

let filtro = { etapa: 'todas', texto: '' };
let fichaId = null;         // el proyecto abierto en 'pf-ficha'
/* Si «Más detalles» quedó abierto, y de qué ficha. La ficha se repinta en su sitio con cada
   guardado (P2): sin esto, guardar un estatus de adentro lo volvía a plegar en la cara de quien
   lo estaba tocando. Es de la ficha abierta: otra ficha nace con lo de su rol. */
let _masFicha = { id: null, abierto: false };

/* Quién dijo «déjalo como está» en el aviso de huella. Vive en memoria y se va con la
   recarga a propósito: no hay campo donde anotar «ya lo revisé» y usar `notas` sería
   escribir en un campo que es de otro dueño. Y que el aviso vuelva al recargar es
   correcto: el material calculado sigue sin corresponder a la cotización de hoy. */
const HUELLA_IGNORADA = new Set();

/* ----- Material encendido -----
   Material está en mantenimiento (el interruptor único es `Agenda.MATERIAL_EN_MANTENIMIENTO`,
   js/datos/agenda.js). Esta pantalla seguía enseñando su semáforo —«Material sin calcular» en casi
   cada tarjeta, «Faltan 3 materiales» en rojo—, preguntaba «¿Ya se cortó?» porque «salen del almacén
   los materiales» y tenía botones a la pantalla apagada: «Ver la lista de compra», «Ver almacén»,
   «Recalcular material». Todo eso pregunta aquí, al MISMO interruptor, para que el día que se encienda
   Material vuelva junto (auditoría 2026-10-26, T1-7). Que no salga nada del almacén no lo decide
   esta pantalla: lo decide la capa de datos (`materialEnMantenimiento` en js/datos/proyectos.js). */
const conMaterial = () => !Agenda.MATERIAL_EN_MANTENIMIENTO;

const _oyentes = [];        // [[elemento, tipo, fn]]
let _tBuscar = 0;
let _imprimiendo = false;

/* ----- Lo que sobrevive al desmontaje, y por qué -----
   `desmontar()` pone `_d` en null y vacía los mapas: el valor anterior de una cuenta NO puede
   vivir ahí o el odómetro (P18) rodaría desde cero cada vez que se entra a la pantalla, que es
   justo lo que la ficha prohíbe («nunca al entrar»). Lo mismo el latido de «sin decidir» (P11):
   lo que decide si vuelve a latir es si la cuenta SUBIÓ respecto a la última vez que se vio, y
   eso es memoria de la sesión, no del montaje. Las claves de `rodarCifra` son del módulo
   («pj:…») para no chocar con las del Tablero.

   Hay un caso que se parece a «entrar» y no lo es, y es justo el que pide P18: la
   sincronización baja algo de otro teléfono y app.js REMONTA la pantalla que se está mirando
   (`montar(..., {forzar:true})`: desmontar y montar seguidos). Ahí el número cambió delante de
   quien mira y tiene que rodar. La diferencia con entrar de verdad es el tiempo: un remonte
   vuelve a montar en el mismo aliento que desmontó, y una persona que cambia de pantalla tarda
   más que eso. Por eso `montar()` mira cuánto pasó desde el último `desmontar()`. */
let _primerPintado = true;      // el primer pintado de las cuentas no rueda
let _candN = -1;                // cuántas cotizaciones sin decidir había la última vez
let _desmontadoEn = 0;          // cuándo se desmontó por última vez (ms)
const REMONTE_MS = 4000;        // un remonte de la sincronización monta antes de esto

/* Los cables de las piezas que hay que soltar a mano: no se van con el nodo porque miran el
   scroll o el documento. */
let _bordesTira = null;         // bordes que se desvanecen en la tira de etapas (P23)
let _bordesTablero = null;      // y en el tablero, para el Fold abierto (P23)
let _paginas = null;            // las columnas como páginas del teléfono (P28)
let _rielFicha = null;          // el riel de etapas de la ficha (P7)
let _bordesRiel = null;         // y sus bordes que se desvanecen: siete etapas no caben en 360 px
let _viaje = null;              // el id cuya tarjeta tiene que viajar de columna (P8)
let _obsFicha = null;           // mira cuándo se cierra la ficha, para soltar el viaje

function on(el, tipo, fn, captura = false) {
  if (!el) return;
  el.addEventListener(tipo, fn, captura);
  _oyentes.push([el, tipo, fn, captura]);
}

/* Soltar una pieza sin que un fallo suyo tire el repintado que la estaba reemplazando. */
const soltar = x => { try { if (x && x.destruir) x.destruir(); } catch (_) {} };

/* ============================================================================
   Vocabulario: todo importado, nada propio
   ============================================================================ */

/* Los estatus y las cuentas de la hoja se importan de datos/puente.js, que es donde el
   relevo los valida antes de escribir: esta pantalla tenía su propia copia de las dos
   listas, en otro orden, y una copia que nadie compara es la que un día enseña un botón que
   el puente rechaza. PAGOS mueve el dinero, no la obra: §8.2 le da «→ cobrando/liquidado»,
   y eso es estatus de la hoja, no etapa; por eso su ficha no trae el segmento de etapas. */

/* `ICO_ETAPA` y `claseEtapa` viven en datos/proyectos.js, junto a `ETAPA_NOMBRE`: tres
   pantallas enseñan la etapa y con una copia por pantalla, dos acaban dibujando cosas
   distintas para el mismo hecho. */
const { ICO_ETAPA, claseEtapa } = Proy;

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
/* Las dos fórmulas de Notion arrancan en `null` y en un registro viejo pueden no venir. La
   diferencia importa: `null` es «Notion no ha contestado» y 0 es «no debe nada», y pintar
   $0.00 por un campo que no existe es decirle a alguien que ya cobró. */
const hay = v => v !== null && v !== undefined;

/* ----- ¿Quién manda: la hoja o la base? (docs/BASE-MANDA.md) -----
   Con la base mandando, la hoja es de solo lectura: lo que esta pantalla decía «de la hoja» —el
   estatus, el saldo, la fila que ya no está— lo dice de la base, y lo que pedía hacer EN la hoja
   (borrar una fila, marcar «No se dio» en su columna, copiar la venta) se hace aquí o desaparece
   (auditoría 2026-10-25, TP-3). Con la hoja mandando cada frase es, letra por letra, la de siempre:
   las pruebas de navegador las buscan. La regla es la de js/datos/reglas.js. */
const fuente = () => (laBaseManda() ? 'la base' : 'la hoja');
/** El V-### de la venta, si ya lo tiene (el de la base con la base mandando, el de la fila con la hoja). */
const folioVenta = p => {
  const v = String((p && (p.notion_page_id || p.folio_hoja)) || '').trim();
  return /^V-\d+$/.test(v) ? v : '';
};
/** « · V-123» para poner junto al folio que ya se enseña, o '' si no tiene o si ya es ése (una venta
    que bajó de la base o de la hoja se llama por su V-###: «V-222 · V-222» no dice nada). */
const masFolioVenta = (p, yaSeVe) => {
  const v = folioVenta(p);
  return v && v !== String(yaSeVe || '').trim() ? ' · ' + esc(v) : '';
};

/* ============================================================================
   Montaje
   ============================================================================ */

export async function montar(c, ctx) {
  cont = c;
  CTX = ctx || {};
  /* Entrar no es un cambio: la primera vez que se pintan las cuentas no ruedan. Un remonte de la
     sincronización sí lo es (ver «Lo que sobrevive al desmontaje»). */
  _primerPintado = Date.now() - _desmontadoEn > REMONTE_MS;

  /* La base cerrada NO se pinta como «no hay proyectos». Son dos cosas distintas y la
     diferencia es la que decide si alguien se queda tranquilo o pierde la tarde buscando
     doscientos proyectos que están donde siempre. */
  /* Lo que dejó el módulo anterior. Sin esto, el botón «Abrir» de un renglón del Tablero
     te deja en esta lista y hay que volver a buscar el proyecto que ya estabas mirando: el
     salto que este reacomodo existe para quitar. De un solo uso, así que volver por la barra
     de pestañas SÍ da la lista, que es lo correcto —esa es una llegada nueva. */
  const pase = (CTX && CTX.recibir) ? CTX.recibir() : null;

  const e = DB.estado();
  if (!e.ok) {
    cont.innerHTML =
      '<div class="card"><div class="card-b">' +
      '<p class="hintnote nota-av">' + ico('i-aviso') + ' ' + esc(DB.motivoTexto()) + '</p>' +
      '<p class="vacio-d">Los proyectos no se perdieron: están en la base de este dispositivo y ' +
      'vuelven a aparecer en cuanto abra. Nada de lo que hagas mientras se guarda.</p>' +
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>' +
      '</div></div>';
    on(cont, 'click', ev => { if (ev.target.closest('[data-recargar]')) location.reload(); });
    return;
  }

  cont.innerHTML =
    '<div class="pf-cuentas" id="pj-cuentas"></div>' +
    '<div id="pj-cand"></div>' +
    '<div id="pj-drive" aria-live="polite"></div>' +
    '<div class="card"><div class="card-h"><h2>' + ico('i-proyectos') + ' Proyectos</h2>' +
      interruptorClienteHTML() + '</div>' +
    '<div class="card-b">' +
      '<div class="fld"><label for="pj-q">Buscar por nombre, cliente, folio o dirección</label>' +
      /* Con `value`: el filtro de texto SOBREVIVE al remontaje —los módulos ES se cachean, así
         que `filtro` sigue vivo al volver— pero la caja se repintaba vacía. La lista salía
         filtrada y no había en pantalla nada que dijera por qué; el chip de etapa, que sí se
         restaura en pintarFiltros(), dejaba a las dos mitades del filtro contando cosas
         distintas. O el control enseña el filtro, o el filtro no existe. */
      '<input type="search" id="pj-q" placeholder="Ej. Healthylicious, COT-0007, Tlajomulco" autocomplete="off"' +
      ' value="' + esc(filtro.texto || '') + '"></div>' +
      '<div id="pj-filtros"></div>' +
      '<div id="pj-lista"></div>' +
    '</div></div>';

  /* Un solo oyente por región, delegado. Las listas se repintan completas y un oyente por
     renglón se va con el renglón; a la sexta ida y vuelta quedaban seis. Y por eso no hay
     ni un `onclick="f('${folio}')"` en este archivo: el folio viaja en un data-* escapado
     y se lee del dataset, así que un folio con apóstrofo —del teclado no hay camino, de un
     respaldo restaurado sí— no puede salirse del literal. */
  on(cont, 'click', clicLista);
  on(cont, 'input', ev => {
    if (!ev.target || ev.target.id !== 'pj-q') return;
    /* Con espera: sin ella cada tecla es una consulta a la base y en un celular la lista
       va siempre una letra atrás de lo que se escribió. */
    clearTimeout(_tBuscar);
    const v = ev.target.value;
    _tBuscar = setTimeout(() => { filtro.texto = v; aplicar(); }, 220);
  });
  on($('pf-ficha'), 'click', clicFicha);
  /* Una miniatura de Drive que no carga (sin señal, o el archivo se volvió privado) no deja el
     icono roto del navegador: se cambia por el aviso de siempre. `error` no burbujea; va en captura. */
  on(cont, 'error', logoRoto, true);
  on($('pf-ficha'), 'error', logoRoto, true);
  on($('pf-hoja'), 'click', clicHoja);
  on($('pf-pide'), 'click', clicPide);
  on(window, 'afterprint', trasImprimir);
  /* Cruzar los 760 px cambia el marcado, no solo el estilo: de un lado hay un tablero de
     cinco columnas y del otro una lista de renglones. Sin este oyente, girar un Fold —que es
     cruzar de 344 a 880 px— dejaba la lista de teléfono estirada a lo ancho de la pantalla
     grande. Se apunta con `on()`, que es lo que lo desengancha al desmontar. Se repintan también
     los filtros y se vuelve a filtrar (`aplicar`), no solo el marcado de la lista: los chips del
     tablero llevan «Todas» y los de las páginas no, y la lista de las páginas incluye a los que
     «no se dieron» y la del tablero no. */
  on(ANCHO, 'change', () => { pintarFiltros(); aplicar(); });

  cablearModoCliente();
  cablearArrastre();
  cablearCierreDeFicha();

  await cargar();

  /* Después de `cargar()` y no antes: `abrirFicha` lee el proyecto y necesita la lista ya
     pintada debajo para que cerrar la capa devuelva a algo. */
  if (pase && pase.proyecto_id) {
    try { await abrirFicha(pase.proyecto_id); } catch (_) { /* el proyecto ya no está: la lista sirve igual */ }
  } else if (pase && /^V-\d+$/.test(String(pase.venta || ''))) {
    /* El «Abrir la ficha» del Cotizador (auditoría 2026-10-26, T1-6): la cuenta y el estatus de una venta que ya está en la base no se
       cambian desde «Registrar venta», y para Pagos se cambian aquí, en su ficha. El pase trae el V-### (lo único que el cotizador sabe
       de ella); si este teléfono no la tiene como tarjeta, se queda la lista. */
    const p = TODOS.find(x => x && x.etapa !== 'cancelado' && (x.notion_page_id === pase.venta || x.folio_hoja === pase.venta));
    if (p) { try { await abrirFicha(p.id); } catch (_) { /* la lista sirve igual */ } }
  }
}

export function desmontar() {
  _desmontadoEn = Date.now();
  for (const [el, tipo, fn, captura] of _oyentes) {
    try { el.removeEventListener(tipo, fn, !!captura); } catch (_) {}
  }
  _oyentes.length = 0;
  clearTimeout(_tBuscar);
  _tBuscar = 0;

  /* Las tres capas son del documento, no de este módulo: si se sale de Proyectos con la
     orden de trabajo abierta, el velo se queda encima de la Agenda. Se cierran sin tocar
     el historial de más: `cerrarCapa` ya consume su propia entrada. */
  for (const id of ['pf-pide', 'pf-hoja', 'pf-ficha']) {
    const el = $(id);
    if (el && el.classList.contains('show')) cerrarCapa(id);
    if (el) el.innerHTML = '';
  }
  trasImprimir();

  /* Las piezas que miran el scroll o el documento no se van con el nodo: se sueltan a mano.
     El arrastre en curso también, o el fantasma se queda flotando sobre la Agenda. */
  soltarArrastre();
  soltar(_bordesTira); _bordesTira = null;
  soltar(_bordesTablero); _bordesTablero = null;
  soltar(_paginas); _paginas = null;
  soltar(_rielFicha); _rielFicha = null;
  soltar(_bordesRiel); _bordesRiel = null;
  if (_obsFicha) { try { _obsFicha.disconnect(); } catch (_) {} _obsFicha = null; }
  _imgFicha = { id: null, html: '' };
  _viaje = null;
  clearTimeout(_tViaje); _tViaje = 0;
  clearTimeout(_tYendo); _tYendo = 0; _yendoA = -1;
  /* El modo cliente SÍ se queda: es una decisión de la persona («tengo al cliente enfrente»),
     no un estado de esta pantalla, y su razón de ser es que también tape la cuenta «En el
     taller» del Tablero, que es otra pantalla. Se apaga con su mismo interruptor. */

  TODOS = []; VISTA = []; SIN_DECIDIR = [];
  FECHA = new Map(); SEM = new Map(); REQS = new Map(); MATS = new Map(); HUELLA = new Map();
  IDX_HOJA = null; IMG_COT = new Map(); _logos = { lista: null, mapa: new Map() };
  APARTADO = new Map();
  fichaId = null;
  cont = null; CTX = null;
}

/* ============================================================================
   Cargar
   ============================================================================ */

async function cargar() {
  const lista = $('pj-lista');
  /* Solo si todavía no hay nada: después de cada acción la lista ya está, y vaciarla a un
     renglón para volverla a llenar la hacía parpadear. */
  if (lista && !lista.childElementCount) lista.innerHTML = '<div class="vacio">' + ico('i-reloj') + '<p class="vacio-t">Leyendo proyectos…</p></div>';
  await leerDatos();
  pintarCand();
  pintarAvisoDrive();
  pintarFiltros();
  aplicar();
  publicarCuenta();
}

/** El globo de la barra sin montar la pantalla: lo llama app.js al arrancar y después de
 *  cada sincronización, para que los pendientes se vean sin tener que entrar aquí. Solo lee;
 *  no pinta nada. */
export async function contar() {
  if (CTX) return null;          // montado: la cuenta la publica la pantalla
  await leerDatos();
  return { proyectos: cuantos() };
}

async function leerDatos() {
  /* Cinco lecturas en paralelo y ni una más, sobre todo la del almacén: `listaCompra`
     recorre el libro de movimientos completo y pedirla una vez por renglón es lo que
     vuelve esta pantalla una que tarda. Con `hastaDias` largo porque aquí la pregunta no
     es «qué compro esta semana» sino «a este proyecto le falta algo», y hay proyectos
     ganados con instalación a dos meses. */
  /* Con Material en mantenimiento no se lee el almacén: el semáforo no se pinta (ver `conMaterial`). */
  const mat = conMaterial();
  const [proys, insts, compra, mats, hoja, rech] = await Promise.all([
    Proy.listar({}),
    Agenda.listar({ vivas: true }),
    mat ? Stock.listaCompra({ hastaDias: 3650 }) : Promise.resolve([]),
    mat ? Material.listarMateriales({}) : Promise.resolve([]),
    Prefs.veDinero() ? DB.listar('ventas_hoja').catch(() => []) : Promise.resolve(null),
    Promise.resolve().then(() => Sync.rechazadas()).catch(() => []),
  ]);

  TODOS = Array.isArray(proys) ? proys : [];
  APARTADO = apartadosPorProyecto(rech);
  MATS = new Map((mats || []).map(m => [m.id, m]));
  IDX_HOJA = Array.isArray(hoja) ? Ventas.indiceHoja(hoja) : null;
  IMG_COT = new Map();
  _logos = { lista: null, mapa: new Map() };
  for (const e of Cot.historial()) {
    const img = Logo.imagenDeCotizacion(e);
    if (img && e.folio) IMG_COT.set(Cot.folioGlobal(e.folio, e.disp), img);
  }

  /* La fecha que manda es la instalación viva MÁS PRÓXIMA. Una reagendada a diciembre no
     puede seguir diciendo que se instala el martes. */
  FECHA = new Map();
  for (const i of (insts || [])) {
    if (!i || !i.proyecto_id || !i.fecha) continue;
    const prev = FECHA.get(i.proyecto_id);
    if (!prev || String(i.fecha) < String(prev.fecha)) FECHA.set(i.proyecto_id, i);
  }

  REQS = new Map();
  if (mat) {
    const vivos = TODOS.filter(p => p.etapa !== 'cancelado');
    const reqs = await Promise.all(vivos.map(p => Material.requerimientos(p.id)));
    vivos.forEach((p, k) => REQS.set(p.id, reqs[k] || []));
  }

  /* Sin semáforo, no hay «Material sin calcular», «Faltan N materiales» ni «Material completo» en
     ninguna tarjeta, renglón ni ficha, ni la cuenta «con material faltante» de la cinta, ni el bloque
     «Material» del taller con su «Ver la lista de compra»: todos salen de `SEM` y con el mapa vacío no
     se pintan (auditoría 2026-10-26, T1-7). */
  SEM = mat ? semaforos(compra || []) : new Map();
  HUELLA = huellas();

  /* Las cotizaciones que nadie decidió. El criterio es la AUSENCIA de un proyecto con ese
     folio, y por eso la lápida del descartado importa: sin ella la tarjeta resucitaría
     cada cotización rechazada en cada arranque, y un aviso que vuelve después de que le
     dijiste que no es un aviso que se aprende a ignorar.

     Sin mínimo de días, al revés que la tarjeta de Inicio: allá los 7 días evitan
     molestar con la venta de ayer, aquí decidir ES el trabajo de la pantalla.

     Lo decidido son los proyectos de aquí Y las ventas del libro (auditoría 2026-10-26, T1-1): con la
     base mandando, el historial de la empresa trae cotizaciones que otro teléfono ya vendió, y su venta
     no es tarjeta aquí si ya no está en la línea del taller. */
  SIN_DECIDIR = Prefs.rol() === 'direccion' ? Cot.sinDecidir(await Proy.foliosDecididos(TODOS), 0) : [];
}

/* De la lista de lo apartado de la bandeja (`Sync.rechazadas`), lo último de cada proyecto: sus
   operaciones y las de su instalación, como las cuenta `Sync.delProyecto`. */
function apartadosPorProyecto(lista) {
  const m = new Map();
  for (const o of (Array.isArray(lista) ? lista : [])) {
    if (!o) continue;
    const id = o.almacen === 'proyectos' ? String(o.registro_id || (o.datos && o.datos.id) || '')
      : o.almacen === 'instalaciones' && o.datos ? String(o.datos.proyecto_id || '') : '';
    if (!id) continue;
    const prev = m.get(id);
    if (prev && (prev.ts || 0) > (o.ts || 0)) continue;
    m.set(id, { motivo: String(o.ultimo_error || o.codigo_rechazo || 'la base no lo aceptó'), ts: o.ts || 0 });
  }
  return m;
}
/* La marca de lo apartado solo donde no hay ya un aviso de la hoja: ése nace del mismo rechazo y
   dice más (qué pasó con la fila y qué hacer). */
const apartadoDe = p => (p && !avisoDe(p) && p.etapa !== 'cancelado' ? APARTADO.get(p.id) || null : null);

/* ----- El semáforo de material, de una sola pasada -----
   `Stock.listaCompra` ya trae, por material, qué proyectos lo piden y cuánto falta. Se
   invierte ese mapa: por proyecto, qué le falta. Es la única forma de tener el semáforo de
   doscientos renglones sin preguntarle doscientas veces al almacén, y el cálculo lo hizo
   la capa de datos, que es de quien es. */
function semaforos(compra) {
  const falta = new Map();
  for (const l of compra) {
    if (!l || !(num(l.comprar) > 0 || l.confianza === 'requiere_dato')) continue;
    for (const pr of (l.proyectos || [])) {
      if (!pr || !pr.id) continue;
      if (!falta.has(pr.id)) falta.set(pr.id, []);
      falta.get(pr.id).push(l.nombre || l.material_id);
    }
  }

  const m = new Map();
  for (const p of TODOS) {
    if (p.etapa === 'cancelado') continue;
    const reqs = REQS.get(p.id) || [];
    if (!reqs.length) {
      m.set(p.id, { estado: 'nada', palabra: 'Material sin calcular',
        detalle: 'Nadie ha derivado el material de este proyecto. Ábrelo y dale «Recalcular material».' });
      continue;
    }
    if (reqs.every(r => r.estado === 'consumido')) {
      m.set(p.id, { estado: 'ok', palabra: 'Material entregado',
        detalle: 'El material ya salió del almacén: ' + reqs.length + (reqs.length === 1 ? ' línea' : ' líneas') + '.' });
      continue;
    }
    const f = falta.get(p.id) || [];
    if (!f.length) {
      m.set(p.id, { estado: 'ok', palabra: 'Material completo',
        detalle: 'Lo que pide este proyecto está en el almacén.' });
      continue;
    }
    const inst = FECHA.get(p.id);
    const d = inst ? diasHasta(inst.fecha) : null;
    /* Tres días es el corte de «grave», y es el mismo −P3D de la alarma del .ics: es lo
       que se tarda en conseguir material en Guadalajara. */
    const grave = d !== null && d <= 3;
    m.set(p.id, {
      estado: grave ? 'grave' : 'falta',
      palabra: f.length === 1 ? 'Falta 1 material' : 'Faltan ' + f.length + ' materiales',
      detalle: 'Falta ' + f.slice(0, 3).join(', ') + (f.length > 3 ? ' y ' + (f.length - 3) + ' más' : '') + '.',
    });
  }
  return m;
}

/* ----- ¿Sigue siendo la misma cotización? Todas, de una sola pasada -----
   `Cot.estadoOrigen` contesta esto para UN proyecto y es la puerta buena, pero por dentro
   vuelve a leer y a parsear `al3d_historial` completo —que trae las imágenes de las
   cotizaciones dentro— así que llamarla una vez por renglón y en cada repintado es parsear
   megabytes doscientas veces en un celular. Aquí el historial se lee UNA vez y la
   comparación la sigue haciendo `Cot.mismaHuella`, que es la misma función con la que compara
   ella: el veredicto no puede divergir porque la aritmética es la suya.

   `mismaHuella` y no `===` contra `Cot.huellaDe`: las huellas guardadas antes del 15 de
   septiembre de 2026 no están ordenadas y la de hoy sí. Con `===`, un proyecto viejo de dos
   partidas salía «se editó después de ganarse», con su «Recalcular material», y la pestaña lo
   contaba, sin que nadie hubiera tocado la cotización. Por eso el mapa guarda la ENTRADA y no
   su huella. */
function huellas() {
  const hoy = new Map();
  for (const e of Cot.historial()) if (e && e.folio) hoy.set(e.folio, e);
  const m = new Map();
  for (const p of TODOS) {
    const folio = (p.origen && p.origen.folio) || p.folio_local;
    if (!hoy.has(folio)) { m.set(p.id, 'desaparecio'); continue; }
    const antes = (p.origen && p.origen.huellaAuth) || Cot.huellaDe(p.origen || {});
    m.set(p.id, !antes ? 'sin_huella' : (mismaHuella(antes, hoy.get(folio)) ? 'igual' : 'cambio'));
  }
  return m;
}
/* Con respaldo, por lo mismo que `tienePin` más abajo: en la ventana de un
   despliegue este archivo puede llegar nuevo con un js/datos/cotizador.js viejo ya cargado en
   la pestaña, que todavía no exporta `mismaHuella`, y la lista moría al pintar. El respaldo es
   la comparación de antes: peor, pero no una pantalla rota. */
const mismaHuella = (a, e) => (Cot.mismaHuella ? Cot.mismaHuella(a, e) : a === Cot.huellaDe(e));

const cambiada = p => (HUELLA.get(p.id) || Cot.estadoOrigen(p)) === 'cambio' && !HUELLA_IGNORADA.has(p.id);

/** La cuenta de la pestaña: lo que ESTA pantalla tiene que atender, según el rol. */
function publicarCuenta() {
  if (!CTX || typeof CTX.ponerCuenta !== 'function') return;
  CTX.ponerCuenta('proyectos', cuantos());
}

function cuantos() {
  const rol = Prefs.rol();
  let n = 0;
  if (rol === 'direccion') {
    /* Y las que la hoja ya no tiene o que están dos veces: son decisiones de Dirección que
       solo se toman en la ficha. */
    n = SIN_DECIDIR.length + TODOS.filter(p => p.etapa !== 'cancelado' &&
      (cambiada(p) || avisoDe(p) === 'perdida' || avisoDe(p) === 'repetida' || avisoDe(p) === 'doble')).length;
  } else if (rol === 'fabricacion') {
    /* Y la tarjeta importada cuya fila ya no vino: ésa la decide quien tenga el teléfono (ver
       `avisoHoja`), y el del taller es donde viven. */
    n = TODOS.filter(p => (SEM.get(p.id) || {}).estado === 'grave' ||
      (esImportada(p) && avisoDe(p) === 'perdida')).length;
  } else {
    /* Lo que le falta capturar a PAGOS para que la fila de Notion sirva: sin cuenta y sin
       estatus, esas dos celdas se pegan vacías. Y la tarjeta importada cuya fila ya no vino. */
    n = TODOS.filter(p => p.etapa !== 'cancelado' && (!p.cuenta || !p.estatus_notion ||
      (esImportada(p) && avisoDe(p) === 'perdida'))).length;
  }
  return n;
}

/* ============================================================================
   Filtrar y pintar la lista
   ============================================================================ */

async function aplicar() {
  /* El texto lo busca la capa de datos y no este archivo, y no es ceremonia: ahí el
     buscador ya quita acentos y mira nombre, cliente, negocio, folio, teléfono, dirección
     y notas. Una segunda versión aquí encontraría «Paréntesis» en una pantalla y no en la
     otra, y de ahí a bajar la lista con el dedo hay un paso. */
  const base = filtro.texto.trim() ? await Proy.listar({ texto: filtro.texto }) : TODOS;
  /* En el teléfono la lista son PÁGINAS, una por etapa (P28): ahí `filtro.etapa` deja de
     recortar la lista y pasa a decir en qué página se está. Si siguiera recortando, cada
     página tendría una sola columna y deslizar no llevaría a ningún lado. */
  VISTA = (enPaginas() || filtro.etapa === 'todas')
    ? base.filter(p => p.etapa !== 'cancelado' || enPaginas())
    : base.filter(p => p.etapa === filtro.etapa);
  /* Con un viaje esperando a que se cierre la ficha, tampoco las cuentas: rodarían debajo del
     velo, donde nadie las ve, y al cerrar la ficha ya no habría nada que rodar. */
  if (!(_viaje && hayCapaAbierta())) pintarCuentas();
  pintarLista();
}

function pintarCuentas() {
  const el = $('pj-cuentas'); if (!el) return;
  const vivos = TODOS.filter(p => p.etapa !== 'cancelado');
  /* Lo que la cinta cuenta tiene que ser lo que el tablero enseña. «Abiertos» incluía a los
     instalados y a los que están en garantía —que no tienen columna a propósito: una de
     instalados crecería para siempre—, así que la cinta decía «5 proyectos abiertos» encima
     de un tablero con cuatro tarjetas y no había forma de saber dónde estaba el quinto. Ahora
     la primera cuenta es la del tablero y los que ya salieron del camino se cuentan aparte,
     con su nombre. */
  const enObra = vivos.filter(p => COLUMNAS().includes(p.etapa));
  const fuera = vivos.length - enObra.length;
  const sinFecha = vivos.filter(p => !FECHA.get(p.id)).length;
  const faltan = vivos.filter(p => ['falta', 'grave'].includes((SEM.get(p.id) || {}).estado)).length;
  /* `data-cuenta` en el <b> es lo que le da memoria al odómetro (P18): la cinta se repinta
     entera en cada toque, así que el valor anterior no puede vivir en el nodo —se va con él—
     y se recuerda por la clave. El nombre lleva el prefijo del módulo para no chocar con las
     cuentas del Tablero, que ruedan con la misma pieza. */
  el.innerHTML =
    '<div class="pf-cuenta"><b data-cuenta="obra">' + enObra.length + '</b>' + (enObra.length === 1 ? 'proyecto en obra' : 'proyectos en obra') + '</div>' +
    (fuera ? '<div class="pf-cuenta"><b data-cuenta="fuera">' + fuera + '</b>' +
      (fuera === 1 ? 'instalado o en garantía' : 'instalados o en garantía') + '</div>' : '') +
    (sinFecha ? '<div class="pf-cuenta urge"><b data-cuenta="sinfecha">' + sinFecha + '</b>sin fecha de instalación</div>' : '') +
    (faltan ? '<div class="pf-cuenta urge"><b data-cuenta="faltan">' + faltan + '</b>con material faltante</div>' : '');
  rodarCuentas(el);
}

/* ----- P18 · las cuentas ruedan cuando algo cambió, nunca al entrar -----
   La cinta cambia por dos motivos: porque tocaste algo aquí, o porque la sincronización bajó
   un proyecto de otro teléfono. El segundo es el que importa —«Van tarde 2» pasaba a 3 en
   silencio— y el primero también se lee bien. Lo que NO puede pasar es que ruede al montar la
   pantalla: entrar no es un cambio, y cuatro odómetros arrancando a la vez son cuatro cosas
   moviéndose en la primera décima de segundo de la pantalla. De eso se encarga `_primerPintado`,
   que vive fuera de `desmontar()` a propósito (ver el porqué de arriba). */
function rodarCuentas(raiz) {
  const p = P();
  if (!p || !p.rodarCifra) return;
  for (const b of raiz.querySelectorAll('.pf-cuenta b[data-cuenta]')) {
    p.rodarCifra(b, b.textContent, {
      clave: 'pj:' + b.dataset.cuenta,
      animar: !_primerPintado,
      /* El «+1» dice CUÁNTO cambió, que es lo que la cifra sola no puede decir mientras rueda. */
      delta: true,
    });
  }
  _primerPintado = false;
}

/* Las etapas que existen hoy, en el orden del proceso. Ocho botones fijos en un teléfono son
   seis que no filtran nada y que empujan la lista abajo del doblez. La usan la tira y las
   páginas: si cada una hiciera su lista, un día enseñarían columnas distintas. */
function etapasConProyectos() {
  const cuenta = {};
  for (const p of TODOS) cuenta[p.etapa] = (cuenta[p.etapa] || 0) + 1;
  return Proy.ETAPAS.filter(e => cuenta[e]).map(e => ({ v: e, n: cuenta[e] }));
}

function pintarFiltros() {
  const el = $('pj-filtros'); if (!el) return;
  const etapas = etapasConProyectos();

  /* «Todas» solo donde filtra. En el teléfono la tira dejó de ser un filtro y pasó a ser el
     PASADOR de las páginas (P28): ahí «Todas» no tiene a dónde llevar —las páginas ya son
     todas, una por etapa— y un botón que no hace nada es peor que no tenerlo. */
  const ops = enPaginas() ? [] : [{ v: 'todas', t: 'Todas' }];
  for (const e of etapas) ops.push({ v: e.v, t: (Proy.ETAPA_NOMBRE[e.v] || e.v) + ' ' + e.n });
  const elegida = ops.some(o => o.v === filtro.etapa) ? filtro.etapa : (ops[0] ? ops[0].v : 'todas');
  el.innerHTML = '<div class="fld-lab">Etapa de obra</div>' +
    segmento(ops, elegida, 'data-etapa', 'Etapa de obra');

  /* P23 · el borde del lado donde queda tira se desvanece, y se apaga al llegar al final.
     La tira se repinta entera, así que la pieza se vuelve a colgar del carril nuevo; y el chip
     encendido se trae a la vista para que la máscara no lo tape (es el «Cuidado» de la ficha). */
  soltar(_bordesTira); _bordesTira = null;
  const carril = el.querySelector('.tipo-seg');
  const p = P();
  if (carril && p && p.bordesDesvanecidos) {
    _bordesTira = p.bordesDesvanecidos(carril, { eje: 'x' });
    if (_bordesTira && _bordesTira.revelar) _bordesTira.revelar(carril.querySelector('.on'), true);
  }
}

/* ----- P8 · la tarjeta viaja a su nueva columna -----
   Cada cambio rehace el `innerHTML`, así que las transiciones declaradas en el CSS nunca
   corrían: los nodos son nuevos y una transición necesita el mismo nodo. La pieza 22 lo
   resuelve nombrando UNA tarjeta y dejando que el navegador la lleve de su columna vieja a la
   nueva.

   Se dispara al CERRAR la ficha y no al mover la etapa, y es lo que dice el «Cuidado» de la
   ficha: con la capa abierta, el velo y el panel entran en la captura de la transición y lo que
   se ve es la pantalla entera fundiéndose debajo de un vidrio. Así que el viaje se apunta y
   espera; lo suelta `cablearCierreDeFicha()`.

   Y mientras espera, la lista de abajo NO se repinta. La primera versión de esto repintaba la
   lista en el mismo `cargar()` que mueve la etapa —debajo de la ficha, donde no se ve— y al
   cerrar la ficha pedía el viaje: la pieza fotografía «el antes» del DOM de ese momento, que ya
   tenía la tarjeta en su columna nueva, y no había nada que viajar. Se descubrió midiendo dónde
   estaba la tarjeta cuando la pieza se llamó, no mirando que se llamara. */
function pintarLista() {
  const el = $('pj-lista'); if (!el) return;
  const id = _viaje, p = P();
  if (id && hayCapaAbierta()) return;     // el viaje espera a que la ficha se cierre
  if (id) _viaje = null;
  if (id && p && p.transicion) {
    /* Un nombre de transición es un identificador de CSS y el id de un proyecto importado trae
       el folio de la hoja dentro: se limpia antes de usarlo. El elemento se busca con una
       función porque después del repintado es otro nodo. */
    const nombre = 'pj-' + String(id).replace(/[^\w-]/g, '_');
    const donde = () => [...document.querySelectorAll('[data-abrir]')].find(x => x.dataset.abrir === id) || null;
    p.transicion(() => pintarListaYa(el), { nombres: { [nombre]: donde } }).catch(() => {});
    return;
  }
  pintarListaYa(el);
}

function pintarListaYa(el) {
  soltar(_bordesTablero); _bordesTablero = null;
  soltar(_paginas); _paginas = null;

  if (!VISTA.length) {
    if (!TODOS.length) {
      el.innerHTML = vacio(
        'Todavía no has marcado ninguna cotización como ganada',
        'Cuando cierres una venta, abre Registrar Venta en el cotizador y aprieta «Esta cotización se ganó». ' +
        'El proyecto entra aquí con su dirección' + (conMaterial() ? ', su tipo de trabajo y su material ya calculado.' : ' y su tipo de trabajo.'),
        /* Por la ruta y no por `cotizador.html`: el enlace duro abandonaba la plataforma
           entera —se iba la barra, el botón atrás volvía al hash anterior y en la app
           instalada abría fuera del marco—. */
        '<a class="btn btn-pri" href="#/cotizador">' + ico('i-venta') + ' Abrir el Cotizador</a>');
      return;
    }
    if (filtro.texto.trim()) {
      el.innerHTML = vacio('Nada con «' + filtro.texto.trim() + '»',
        'Busca por el nombre del negocio, el del contacto, el folio o una calle. Si lo acabas de ganar en otro teléfono, todavía no está en este.',
        '<button type="button" class="btn btn-gho" data-limpiar>Borrar la búsqueda</button>');
      return;
    }
    el.innerHTML = vacio('Ningún proyecto en «' + (Proy.ETAPA_NOMBRE[filtro.etapa] || filtro.etapa) + '»',
      'Cambia de etapa arriba para ver los demás.',
      '<button type="button" class="btn btn-gho" data-etapa="todas">Ver todas</button>');
    return;
  }

  /* La MISMA tarjeta en las dos vistas. En el teléfono va en una columna y con un lomo de
     4 px del color de su etapa —lo que en el tablero dice la columna, aquí lo dice el lomo—;
     en la computadora, repartida en cinco columnas. Una sola pieza que mantener, y lo que se
     ve en una pantalla se reconoce en la otra.

     `fila()` sigue existiendo: la usan la ficha y el Tablero para el renglón con icono y
     acción, que es otra forma para otra pregunta. */
  el.innerHTML = ANCHO.matches ? tablero() : columnasComoPaginas();

  const p = P();
  if (ANCHO.matches) {
    /* P23 · en el Fold abierto el tablero se corta en la cuarta columna y nada decía que
       hubiera más: el borde del lado con contenido escondido se desvanece. */
    if (p && p.bordesDesvanecidos) _bordesTablero = p.bordesDesvanecidos(el.querySelector('.pj-tablero'), { eje: 'x' });
  } else {
    cablearPaginas(el);
  }
}

/* ============================================================================
   P28 · En el teléfono, las columnas como páginas
   ============================================================================
   Antes había una tira de etapas y una lista, y con eso se perdía la forma: en qué columna se
   está haciendo tapón. En 360 px no cabe un tablero de cinco columnas —serían tiras de 60 px
   donde no entra el nombre de un cliente—, pero sí caben cinco PÁGINAS que se deslizan, y eso
   sí contesta la pregunta: cada página dice su etapa y cuántos hay.

   La decisión que la ficha dejó abierta («¿qué pasa con Todas?»): «Todas» desaparece del
   teléfono. Las páginas YA son todas, una etapa por página, y la tira de arriba pasa de filtrar
   a pasar de página. Es el mismo argumento que ya está escrito en el CSS para el tablero de
   escritorio: dos filtros que contestan la misma pregunta en la misma pantalla acaban diciendo
   cosas distintas. Así nadie pierde nada —los cancelados también tienen su página, cosa que
   antes solo se veía eligiendo «No se dio»— y se gana la forma.

   Con una búsqueda escrita, las páginas se quedan: ver en qué columna cayó lo que buscas es
   exactamente lo que hace útil un tablero. Una página sin coincidencias lo dice y no se vacía
   en silencio. */
const enPaginas = () => typeof window !== 'undefined' && !ANCHO.matches;

function columnasComoPaginas() {
  const etapas = etapasConProyectos();
  if (!etapas.length) return '<div class="pj-lista-movil">' + VISTA.map(tarjeta).join('') + '</div>';
  return '<div class="pj-lista-movil">' + etapas.map(e => {
    const items = VISTA.filter(x => x.etapa === e.v);
    return '<section class="pj-pag" data-col="' + esc(e.v) + '" aria-label="' +
        esc((Proy.ETAPA_NOMBRE[e.v] || e.v) + ', ' + items.length +
            (items.length === 1 ? ' proyecto' : ' proyectos')) + '">' +
      '<h3 class="pj-pag-h ' + claseEtapa(e.v) + '">' +
        '<span class="pj-pag-t">' + esc(Proy.ETAPA_NOMBRE[e.v] || e.v) + '</span>' +
        '<span class="pj-col-n">' + items.length + '</span>' +
      '</h3>' +
      (items.length ? items.map(tarjeta).join('')
        : '<p class="pj-col-vacia">' + (filtro.texto.trim() ? 'Nada de la búsqueda cayó aquí' : 'Nada aquí') + '</p>') +
    '</section>';
  }).join('') + '</div>';
}

function cablearPaginas(el) {
  const p = P();
  const tira = el.querySelector('.pj-lista-movil');
  if (!p || !p.paginas || !tira || !tira.querySelector('.pj-pag')) return;
  const etapas = etapasConProyectos().map(e => e.v);
  /* La página que toca es la del filtro de ANTES del repintado, y se lee antes de crear la
     pieza: al crearse, la pieza lee sus páginas y avisa `alCambiar(0)` de la primera, y sin
     este cuidado eso pisaba `filtro.etapa` con «Ganado» en cada repintado —buscar una letra,
     guardar una cuenta desde la ficha, bajar un cambio de la sincronización— y la lista volvía
     a la primera página delante de quien la estaba mirando. */
  const quiero = Math.max(0, etapas.indexOf(filtro.etapa));
  let arrancando = true;
  _paginas = p.paginas(tira, {
    nombre: 'columna',
    etiqueta: 'Columnas de Proyectos',
    /* Sin puntos: la tira de etapas de arriba YA es la barra de páginas, con el nombre de cada
       una y su cuenta. Dos barras para lo mismo es lo que se acaba de quitar. */
    puntos: false, flechas: false,
    /* Deslizar mueve el chip encendido, y no al revés: cambiar `filtro.etapa` aquí repintaría
       la lista a media inercia y el dedo se quedaría sin página debajo. */
    alCambiar: i => {
      if (arrancando) return;
      /* Si un chip mandó la tira a una página lejana, las de en medio no encienden nada: el chip
         de destino ya está encendido y no tiene que pasar por los otros cuatro. */
      if (_yendoA >= 0 && i !== _yendoA) return;
      _yendoA = -1;
      marcarEtapa(etapas[i]);
    },
  });
  /* A la página de antes, sin recorrido: es un repintado, no un movimiento. Se asigna el scroll
     de la tira (que no es «smooth») en vez de pedirle a la pieza `ir()`, que sí lo es. */
  const pag = tira.children[quiero];
  if (pag && quiero > 0) {
    const c = tira.getBoundingClientRect(), r = pag.getBoundingClientRect();
    tira.scrollLeft += (r.left - c.left) - (tira.clientWidth - r.width) / 2;
  }
  arrancando = false;
}

/* La página a la que va un chip que se tocó. Mientras la tira se desliza hasta allá, pasa por
   las de en medio y la pieza avisa de cada una: sin esto, el chip encendido recorría todas. */
let _yendoA = -1;
let _tYendo = 0;

/* Enciende el chip de una etapa sin repintar nada: es lo que hace deslizar de página. */
function marcarEtapa(etapa) {
  if (!etapa) return;
  filtro.etapa = etapa;
  const carril = $('pj-filtros');
  if (!carril) return;
  for (const b of carril.querySelectorAll('[data-etapa]')) {
    const on = b.dataset.etapa === etapa;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && _bordesTira && _bordesTira.revelar) _bordesTira.revelar(b);
  }
}

/* ============================================================================
   El tablero de columnas — de 760 px para arriba
   ============================================================================
   La lista de renglones contesta «cuáles hay». Lo que no contestaba —y es la pregunta con
   la que se abre esta pantalla— es «cómo va la obra»: cuántos están parados en diseño,
   cuántos ya se pueden instalar, dónde se está haciendo tapón. Eso es una FORMA, no un
   filtro, y por eso el rediseño lo pone en columnas: la cola más alta se ve sin leer un
   número.

   En el teléfono no hay tablero, y no es una renuncia: cinco columnas en 360 px son cinco
   tiras de 60 px donde no cabe el nombre de un cliente. Ahí manda la tira de etapas —que ya
   existía y hace exactamente lo mismo, una etapa a la vez— y la lista de renglones. Las dos
   vistas leen los mismos datos y comparten `data-abrir`, así que el oyente de la lista sirve
   para las dos sin una línea más.

   La media query vive en JS Y en CSS, y eso es a propósito: la de CSS esconde la tira de
   etapas cuando hay tablero —las columnas ya son el filtro— y esta decide qué marcado se
   escribe. Una sola no puede hacer las dos cosas sin pintar el doble de nodos. */
const ANCHO = window.matchMedia('(min-width:760px)');

/* Las cinco columnas del tablero son las etapas VIVAS del proceso, en orden. `instalado`,
   `garantia` y `cancelado` no son pasos del camino sino salidas de él: una columna de
   instalados crecería para siempre y empujaría a las cinco que sí se miran. Salen de ETAPAS
   y no de una lista escrita a mano, para que meter una etapa nueva sea un renglón allá. */
const COLUMNAS = () => Proy.ETAPAS.slice(0, Proy.ETAPAS.indexOf('listo') + 1);

function tablero() {
  /* El tablero enseña TODAS las etapas vivas: el filtro de etapa es de la vista de teléfono
     y aplicarlo aquí dejaría el tablero con una columna. El de texto sí manda —es una
     búsqueda, y buscar en un tablero es ver en qué columna cayó lo que buscas—. */
  const base = filtro.texto.trim()
    ? VISTA
    : TODOS.filter(p => p.etapa !== 'cancelado');

  return '<div class="pj-tablero">' + COLUMNAS().map(e => {
    const items = base.filter(p => p.etapa === e);
    return '<div class="pj-col" data-col="' + esc(e) + '">' +
      '<div class="pj-col-h ' + claseEtapa(e) + '">' +
        '<span class="pj-col-t">' + esc(Proy.ETAPA_NOMBRE[e] || e) + '</span>' +
        '<span class="pj-col-n">' + items.length + '</span>' +
      '</div>' +
      (items.length ? items.map(tarjeta).join('')
        : '<p class="pj-col-vacia">Nada aquí</p>') +
    '</div>';
  }).join('') + '</div>';
}

/* La carpeta de Drive del proyecto, vista desde el tablero: si ya están las órdenes de
   fabricación, si la carpeta está pero sin ellas, o si no hay carpeta. Sale de lo último que se
   supo de Drive (`Carpetas.ultima`), sin esperar a la red; sin nada sabido, no se dice nada. */
function marcaCarpeta(p) {
  const m = Carpetas.MARCA[Carpetas.estadoDe(p, Carpetas.ultima())];
  return m ? '<span class="pf-sem ' + m[0] + '">' + esc(m[1]) + '</span>' : '';
}

/* ----- El logotipo del proyecto (js/datos/logo.js) -----
   De la carpeta de Drive que ya se sabe (`Carpetas.ultima()`, sin red) o de la imagen de la
   cotización en este aparato. Emparejar carpeta y proyecto recorre todas las carpetas, y el
   tablero ya lo hace una vez por tarjeta para su marca: aquí se guarda lo emparejado mientras la
   lista de Drive sea la misma. */
let _logos = { lista: null, mapa: new Map() };
function logoDeProyecto(p, carpetas = Carpetas.ultima()) {
  if (!p) return null;
  if (_logos.lista !== carpetas) _logos = { lista: carpetas, mapa: new Map() };
  if (!_logos.mapa.has(p.id)) {
    const carpeta = Array.isArray(carpetas) ? Carpetas.carpetaDe(p, carpetas) : null;
    _logos.mapa.set(p.id, Logo.logoDe(p, { carpeta, cotizacion: IMG_COT.get(p.folio_global) || '' }));
  }
  return _logos.mapa.get(p.id);
}

/* La miniatura de la lista y del tablero. Sin `alt` que leer: el nombre del proyecto va al lado. */
function logoMini(p, clase) {
  const l = logoDeProyecto(p);
  return l ? '<span class="pj-logo ' + clase + '"><img src="' + esc(l.src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>' : '';
}

/* Una miniatura que no cargó: fuera la imagen. En la lista y el tablero se va el hueco entero; en
   la ficha queda el aviso de cómo poner el logo. */
function logoRoto(ev) {
  const img = ev && ev.target;
  if (!img || img.tagName !== 'IMG') return;
  const caja = img.closest('.pj-logo');
  if (!caja) return;
  if (caja.classList.contains('pj-logo-ficha')) {
    caja.outerHTML = '<p class="hintnote">No se pudo cargar la imagen del logo' +
      (navigator.onLine === false ? ' (sin señal).' : '. Revisa que siga en su carpeta de Drive.') + '</p>';
  } else {
    caja.remove();
  }
}

/* Los pagos del proyecto: su renglón de la hoja, si lo hay, y la cuenta (`Ventas.pagosDe`). */
const pagosDeProyecto = p => Ventas.pagosDe(p, IDX_HOJA ? Ventas.filaDeLaHoja(p, IDX_HOJA) : null);

function tarjeta(p) {
  const inst = FECHA.get(p.id) || null;
  const sem = SEM.get(p.id) || null;
  const tipos = Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo : [];
  const dinero = Prefs.veDinero() ? esc(money(p.precio_auth || p.neto)) : '';
  const resta = Prefs.veDinero() && p.etapa !== 'cancelado' ? pagosDeProyecto(p).restante : 0;

  const apart = apartadoDe(p);
  const vfolio = Prefs.veDinero() ? folioVenta(p) : '';

  /* La tarjeta entera es el botón. En un tablero, el destino de un clic en cualquier parte
     de una tarjeta es abrirla; un botón «Abrir» dentro de una tarjeta de 200 px de ancho
     gasta un renglón para decir lo que el cursor ya dice. Sin `aria-label`: tapaba todo lo de
     adentro y el lector de pantalla solo decía «Abrir …», sin la etapa, la fecha, la falta de
     material ni el saldo (auditoría 2026-10-25, TP-9). El nombre accesible es su texto. */
  return '<button type="button" class="pj-tarj ' + claseEtapa(p.etapa) + '" data-abrir="' + esc(p.id) + '">' +
    '<span class="pj-tarj-cab">' + logoMini(p, 'pj-logo-tarj') +
      '<span class="pj-tarj-t">' + esc(p.nombre || p.folio_local || 'Proyecto sin nombre') + '</span></span>' +
    '<span class="pj-tarj-d">' + (tipos.length ? esc(tipos.join(' · ')) : 'Sin tipo derivado') + '</span>' +
    '<span class="pj-tarj-f">' +
      /* En el teléfono no hay columna que diga en qué etapa está, así que la ficha de etapa
         viaja dentro de la tarjeta. En el tablero sobra —la columna ya lo dice— y el CSS la
         apaga ahí. */
      '<span class="pf-etapa pj-tarj-etapa ' + claseEtapa(p.etapa) + '">' +
        esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span>' +
      (sem ? '<span class="pf-sem ' + sem.estado + '">' + esc(sem.palabra) + '</span>' : '') +
      /* La marca de la hoja también se ve desde el tablero: sin ella, la tarjeta que ya no
         está en la hoja o que repite otra solo se descubría abriéndola. */
      (avisoDe(p) === 'perdida' ? '<span class="pf-sem grave">Ya no está en ' + fuente() + '</span>'
        : avisoDe(p) === 'repetida' ? '<span class="pf-sem grave">Repetida</span>'
        : avisoDe(p) === 'doble' ? '<span class="pf-sem grave">Dos veces en ' + fuente() + '</span>' : '') +
      /* Un cambio que se rechazó para siempre: la tarjeta quedó movida solo en este teléfono. */
      (apart ? '<span class="pf-sem grave">No se guardó</span>' : '') +
      /* Dirección la ocultó del taller (auditoría 2026-10-26, T1-9): aquí sigue, con su marca, para encontrarla y volver a mostrarla. */
      (ocultoDelTaller(p) ? '<span class="pf-sem nada pj-oculto">Oculto del taller</span>' : '') +
      marcaCarpeta(p) +
      (inst
        ? '<span class="pj-tarj-inst">' + ico('i-camion') + esc(fmtFecha(inst.fecha)) + '</span>'
        : '<span class="pj-tarj-inst">' + ico('i-camion') + 'sin fecha</span>') +
    '</span>' +
    '<span class="pj-tarj-pie">' +
      '<span class="pj-tarj-folio">' + esc(Cot.folioVisible(p.folio_global) || p.folio_local || '—') +
        (vfolio ? masFolioVenta(p, Cot.folioVisible(p.folio_global) || p.folio_local) : '') + '</span>' +
      (dinero ? '<span class="pj-tarj-monto">' + dinero +
        (resta > 0 ? '<small class="pj-resta-mini">resta ' + esc(money(resta)) + '</small>' : '') + '</span>' : '') +
    '</span>' +
  '</button>';
}

function fila(p) {
  const inst = FECHA.get(p.id) || null;
  const sem = SEM.get(p.id) || null;
  const cambio = cambiada(p);
  const tipos = Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo : [];

  const fechaTx = inst
    ? '<span class="pf-cuando' + tonoCuando(inst.fecha) + '">' + esc(fmtFecha(inst.fecha)) + ' · ' + esc(cuando(inst.fecha)) + '</span>'
    : '<span class="pf-sem falta">Sin fecha</span>';

  /* El importe es lo único que cambia con el rol, y no se difumina: no se pinta. El
     difuminado del cotizador es una mampara contra el cliente sentado enfrente y encima es
     inerte para una cotización autorizada, que es lo que TODO proyecto ganado es. */
  const resta = Prefs.veDinero() && p.etapa !== 'cancelado' ? pagosDeProyecto(p).restante : 0;
  /* En su propia caja (`pj-fila-dinero`) para que el modo cliente la difumine: con la ficha
     cerrada delante del cliente, la lista enseñaba lo vendido y lo que resta de los demás
     (auditoría 2026-10-25, TP-12). */
  const dinero = Prefs.veDinero()
    ? ' · <span class="pj-fila-dinero">Vendido <b>' + esc(money(p.precio_auth || p.neto)) + '</b>' +
      (resta > 0 ? ' · <span class="pj-resta-mini">Resta <b>' + esc(money(resta)) + '</b></span>' : '') + '</span>'
    : '';
  const logo = logoMini(p, 'pj-logo-fila');
  const apart = apartadoDe(p);
  const vfolio = Prefs.veDinero() ? folioVenta(p) : '';

  return '<div class="pf-fila">' +
    /* El logo va ENCIMA del icono de la etapa: si la miniatura no carga, se quita y queda el icono. */
    '<div class="pf-fila-ico' + (sem && sem.estado === 'grave' ? ' mal' : cambio ? ' urge' : '') + (logo ? ' con-logo' : '') + '">' +
      ico(ICO_ETAPA[p.etapa] || 'i-proyectos') + logo + '</div>' +
    '<div class="pf-fila-tx">' +
      '<div class="pf-fila-t">' + esc(p.nombre || p.folio_local || 'Proyecto sin nombre') + '</div>' +
      '<div class="pf-fila-d">' +
        '<span class="folio">' + esc(Cot.folioVisible(p.folio_global) || p.folio_local || '—') +
          (vfolio ? masFolioVenta(p, Cot.folioVisible(p.folio_global) || p.folio_local) : '') + '</span> ' +
        '<span class="pf-etapa ' + claseEtapa(p.etapa) + '">' + esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span> ' +
        fechaTx + ' ' +
        (sem ? '<span class="pf-sem ' + sem.estado + '" title="' + esc(sem.detalle) + '">' + esc(sem.palabra) + '</span> ' : '') +
        (cambio ? '<span class="pf-sem grave">Se editó después de ganarse</span> ' : '') +
        (apart ? '<span class="pf-sem grave">No se guardó</span> ' : '') +
        (ocultoDelTaller(p) ? '<span class="pf-sem nada pj-oculto">Oculto del taller</span> ' : '') +
        (marcaCarpeta(p) ? marcaCarpeta(p) + ' ' : '') +
      '</div>' +
      '<div class="pf-fila-d">' + (tipos.length ? esc(tipos.join(' · ')) : 'Sin tipo derivado') + dinero + '</div>' +
    '</div>' +
    '<div class="pf-fila-acc">' +
      '<button type="button" class="btn btn-gho" data-abrir="' + esc(p.id) + '" ' +
        'aria-label="Abrir ' + esc(p.nombre || p.folio_local) + '">Abrir</button>' +
    '</div>' +
  '</div>';
}

const tonoCuando = iso => {
  const d = diasHasta(iso);
  if (d === null) return '';
  if (d < 0) return ' tarde';
  if (d <= 1) return ' hoy';
  return d > 14 ? ' lejos' : '';
};

/* ============================================================================
   La tarjeta de las cotizaciones sin decidir. Solo DIRECCIÓN.
   ============================================================================ */

/* ----- Cuando Drive no contesta -----
   Las marcas «Órdenes listas / Sin órdenes / Sin carpeta» del tablero salen de lo último que se
   leyó de Drive, y si nunca se pudo leer, el tablero se quedaba callado: las tarjetas sin marca y
   nada que dijera por qué (octubre de 2026: «los proyectos siguen sin poder tener la carpeta»).
   Ahora lo dice en un renglón, con el motivo que dio la hoja y la liga a «Trabajos Pendientes»,
   que existe aunque la hoja no conteste. Sin puente configurado no hay nada que avisar. */
async function pintarAvisoDrive() {
  const el = $('pj-drive'); if (!el) return;
  let r = null;
  try { r = await Carpetas.listar(); } catch (_) { r = null; }
  const caja = $('pj-drive'); if (!caja) return;
  /* SIN_CONFIG también al arrancar, antes de que el puente se enchufe: no es un error. */
  if (!r || (r.ok && !r.vieja) || r.codigo === 'SIN_CONFIG') { caja.innerHTML = ''; return; }
  const motivo = r && !r.ok ? (r.mensaje || 'No se pudo leer la carpeta de Drive.')
    : 'Ahora mismo no se pudo preguntar a la hoja; las marcas son de la última vez que se vio.';
  /* Con la base mandando se entra sin el permiso de la hoja, y las vueltas de fondo ya no abren la ventana de Google
     (auditoría 2026-10-25, ES-3): Drive lo pide un botón, dentro del toque. */
  const conectar = r && r.codigo === 'SIN_PERMISO_DRIVE'
    ? '<button type="button" class="btn btn-pri pf-btn-corto" data-conectar-drive>Conectar Drive</button>' : '';
  caja.innerHTML = '<div class="pj-drive">' + ico('i-doc') +
    '<span><b>Carpetas de Drive:</b> ' + esc(motivo) + '</span>' + conectar +
    '<a class="btn btn-gho pf-btn-corto" href="' + esc(Carpetas.RAIZ_TRABAJOS) + '" target="_blank" rel="noopener">Abrir Trabajos Pendientes</a></div>';
}

const CLAVE_CAND = 'al3d_pf_cand_abierta';
function leerAbierta() { try { return localStorage.getItem(CLAVE_CAND) === '1'; } catch (_) { return false; } }
function guardarAbierta(si) { try { localStorage.setItem(CLAVE_CAND, si ? '1' : '0'); } catch (_) {} }

function pintarCand() {
  const el = $('pj-cand'); if (!el) return;
  if (!SIN_DECIDIR.length) { el.innerHTML = ''; _candN = 0; return; }

  const n = SIN_DECIDIR.length;
  const hoy = hoyISO();
  const filas = SIN_DECIDIR.map(e => {
    /* Días de CALENDARIO, como el Calendario (`cuando(isoDeSello(e.ts))`). Con tandas de 24
       horas, la autorizada anoche a las 11 decía «hoy» aquí y «ayer» allá. */
    const dias = diasEntre(isoDeSello(e.ts) || hoy, hoy) || 0;
    const importe = Prefs.veDinero() ? Cot.totalVendido(e) : null;
    return '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-venta') + '</div>' +
      '<div class="pf-fila-tx">' +
        '<div class="pf-fila-t">' + esc(e.cliente || 'Sin cliente') + (e.proy ? ' — ' + esc(e.proy) : '') + '</div>' +
        '<div class="pf-fila-d"><span class="folio">' + esc(e.folio || '—') + '</span> ' +
          'autorizada ' + (dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace ' + dias + ' días') +
          (importe !== null ? ' · ' + esc(money(importe)) : '') + '</div>' +
      '</div>' +
      '<div class="pf-fila-acc">' +
        '<button type="button" class="btn btn-ok pf-btn-corto" data-gano="' + esc(e.folio) + '">Se ganó</button>' +
        '<button type="button" class="btn btn-gho pf-btn-corto" data-nodio="' + esc(e.folio) + '">No se dio</button>' +
      '</div>' +
    '</div>';
  }).join('');

  /* La misma tarjeta de A6, con la misma clase y el mismo latido: es el mismo mensaje
     —«esto pide que hagas algo antes de seguir»— y si aquí se viera distinta, parecerían
     dos cosas. `.pf-decidir` es la variante en bloque que Inicio ya dejó puesta, porque son
     N cotizaciones con dos botones cada una y no un renglón que se toca completo. */
  /* Plegada de entrada (Elías, octubre de 2026): se cotiza mucho más de lo que se cierra, y
     nueve renglones de dos botones empujaban el tablero —lo que se trabaja todo el día— una
     pantalla entera hacia abajo. Queda el renglón del aviso con la cuenta; abierta, la lista
     tiene tope y se recorre por dentro. Si alguien la abre, se queda abierta en este aparato. */
  const abierta = leerAbierta();
  el.innerHTML =
    '<details class="cand-partidas pf-decidir pj-cand' + (n > _candN ? '' : ' quieta') + '"' + (abierta ? ' open' : '') + '>' +
      '<summary class="cp-txt">' + ico('i-aviso') + '<span>Tienes <b>' + n + '</b> ' +
      (n === 1 ? 'cotización autorizada sin decidir' : 'cotizaciones autorizadas sin decidir') +
      '<span class="pj-cand-por"> · di si se ganó para que tenga material y fecha</span></span>' +
      '<span class="pj-cand-ver">' + (abierta ? 'Ocultar' : 'Revisar') + '</span></summary>' +
      '<div class="pj-cand-lista">' + filas + '</div>' +
    '</details>';
  const det = el.firstElementChild;
  det.addEventListener('toggle', () => {
    guardarAbierta(det.open);
    const v = det.querySelector('.pj-cand-ver');
    if (v) v.textContent = det.open ? 'Ocultar' : 'Revisar';
  });
  /* P11 · el latido late TRES veces y se calla —eso ya lo dice `.cand-partidas` en
     sistema.css—, pero la tarjeta se repinta con innerHTML en cada recarga y un nodo recién
     nacido arranca la animación otra vez: en la práctica volvía a latir cada vez que se tocaba
     cualquier cosa de la pantalla, que es un bucle escrito de otra manera. Aquí se decide por
     el DATO y no por el nodo: solo late cuando la cuenta SUBIÓ respecto a la última vez que se
     vio. Si baja o se queda igual, nace con `.quieta` y el aro no corre.

     `_candN` vive fuera de `desmontar()` a propósito: si se olvidara al salir de la pantalla,
     volver a entrar contaría como «subió de 0 a 3» y latiría en cada visita. */
  _candN = n;
}

/* ============================================================================
   Clics de la lista
   ============================================================================ */

async function clicLista(ev) {
  const t = ev.target;

  /* «Conectar Drive»: la ventana de Google tiene que salir dentro del toque, así que es lo primero que se llama. */
  if (t.closest('[data-conectar-drive]')) {
    const r = await Carpetas.conectarDrive();
    if (!r.ok) { toast(r.mensaje, 'err'); return; }
    if (CTX && typeof CTX.sincronizar === 'function') CTX.sincronizar();
    pintarAvisoDrive();
    return;
  }

  const seg = t.closest('[data-etapa]');
  if (seg) {
    /* Con páginas, la tira no filtra: pasa de página (P28). Repintar aquí sería quitarle al
       dedo la lista que está mirando para volver a ponerle otra igual. */
    if (enPaginas()) {
      const etapa = seg.dataset.etapa;
      const i = etapasConProyectos().findIndex(e => e.v === etapa);
      marcarEtapa(etapa);
      if (_paginas) {
        if (i >= 0 && i !== _paginas.actual()) {
          _yendoA = i;
          clearTimeout(_tYendo); _tYendo = setTimeout(() => { _yendoA = -1; }, 1200);
          _paginas.ir(i);
        }
      } else {
        /* Sin la pieza las páginas se apilan como secciones, y el chip lleva a la suya. */
        const sec = [...cont.querySelectorAll('.pj-pag')].find(x => x.dataset.col === etapa);
        if (sec) sec.scrollIntoView({ block: 'start', behavior: scrollSuave() });
      }
      return;
    }
    filtro.etapa = seg.dataset.etapa; pintarFiltros(); aplicar(); return;
  }

  if (t.closest('[data-limpiar]')) {
    const q = $('pj-q'); if (q) { q.value = ''; q.focus(); }
    filtro.texto = ''; aplicar(); return;
  }

  /* El interruptor del modo cliente y su alternativa de teclado (P12 + función 31). */
  const sw = t.closest('[data-cliente]');
  if (sw) { ponerModoCliente(sw.getAttribute('aria-checked') !== 'true'); return; }
  const ver = t.closest('[data-ver-importes]');
  if (ver) {
    const a = document.body.classList.toggle(MODO_CLIENTE_VE);
    ver.setAttribute('aria-pressed', a ? 'true' : 'false');
    return;
  }

  const abrir = t.closest('[data-abrir]');
  if (abrir) { await abrirFicha(abrir.dataset.abrir); return; }

  const gano = t.closest('[data-gano]');
  if (gano) { ganar(gano.dataset.gano); return; }

  const nodio = t.closest('[data-nodio]');
  if (nodio) {
    const folio = nodio.dataset.nodio;
    const e = Cot.porFolio(folio);
    /* Se manda el FOLIO y no un id: todavía no hay proyecto, y `descartar` sabe buscar la
       cotización en el historial y dejar la lápida con su nombre y su importe derivados. */
    pedirDescarte(folio, folio, e ? (e.cliente || '') + (e.proy ? ' — ' + e.proy : '') : '');
    return;
  }
}

/* «Se ganó» desde la lista. Hasta octubre de 2026 era un toque y ya: el proyecto nacía sin
   preguntar nada. Ahora abre un panel corto con los datos para la entrega —el mismo bloque que el
   «Se ganó» del Calendario (js/mod/datos-entrega.js)—, porque sin teléfono ni forma de entrega
   la venta no se guarda. La fecha se sigue poniendo en la agenda, como antes. */
function ganar(folio) {
  const e = Cot.porFolio(folio);
  if (!e) {
    toast('La cotización ' + folio + ' ya no está en el historial de este dispositivo', 'err', 4600);
    return;
  }
  const capa = $('pf-pide'); if (!capa) return;
  const quien = [e.cliente, e.proy].filter(Boolean).join(' — ') || 'sin cliente';
  capa.innerHTML =
    '<div class="pf-panel">' +
      '<div class="pf-panel-h"><h2>' + esc(folio) + ' se ganó</h2>' +
        '<button type="button" class="pf-cerrar" data-cerrar-pide aria-label="Cerrar">' + ico('i-cerrar') + '</button></div>' +
      '<div class="pf-panel-b">' +
        '<p class="pf-cuenta">' + esc(quien) + '</p>' +
        DE.html({ tel: e.tel || '', entrega: 'instalacion', dir: e.dirRaw || e.direccion || '', maps: e.maps || '' }, { modo: 'ganar', clave: 'ganar:' + folio }) +
      '</div>' +
      '<div class="pf-panel-f">' +
        '<button type="button" class="btn btn-gho" data-cerrar-pide>Cancelar</button>' +
        '<button type="button" class="btn btn-ok" data-confirma-gano="' + esc(folio) + '">Guardar el proyecto</button>' +
      '</div>' +
    '</div>';
  DE.cablear(capa);
  abrirCapa('pf-pide', { hist: true });
}

async function confirmarGanar(folio, boton) {
  const entrada = Cot.porFolio(folio);
  if (!entrada) {
    toast('La cotización ' + folio + ' ya no está en el historial de este dispositivo', 'err', 4600);
    return;
  }
  const capa = $('pf-pide');
  const d = DE.revisar(capa, { alFallar: m => voz(m, true) });
  if (!d) return;
  const rotulo = boton.textContent;
  boton.disabled = true;
  if (d.maps) boton.textContent = 'Buscando el pin…';
  const u = await DE.ubicar(d.maps);
  if (!u.ok) { DE.avisar(capa, 'maps', u.mensaje); boton.disabled = false; boton.textContent = rotulo; return; }
  const r = await Proy.ganar(entrada, DE.extraParaGanar(d, u));
  boton.disabled = false; boton.textContent = rotulo;
  if (!r.ok) { avisarResultado(r); return; }
  cerrarCapa('pf-pide');

  /* Sin fecha, y se dice en el mismo aviso en vez de dejarlo para que lo descubra la regla
     de las 48 horas. La fecha es la única captura humana real del sistema y vive en la
     agenda: aquí se ofrece el camino, no se inventa el dato. */
  toast('«' + (r.valor.nombre || folio) + '» ya es proyecto. Le falta fecha de instalación.' + (u.aviso ? ' ' + u.aviso : ''), 'ok', 8000,
    { label: 'Ponerle fecha', fn: () => { if (CTX && CTX.ir) CTX.ir('agenda'); } });
  await cargar();
}

/* ----- «No se dio», con su razón -----
   Se pregunta el motivo porque es la única decisión de esta pantalla que no se deshace con
   otro toque, y porque «¿por qué se cayó?» es la pregunta que alguien va a hacer en tres
   meses mirando la lista de lo que no se vendió. */
function pedirDescarte(ref, titulo, quien) {
  const capa = $('pf-pide'); if (!capa) return;
  const folio = titulo || ref;
  capa.innerHTML =
    '<div class="pf-panel">' +
      '<div class="pf-panel-h"><h2>¿' + esc(folio) + ' no se dio?</h2>' +
        '<button type="button" class="pf-cerrar" data-cerrar-pide aria-label="Cerrar">' + ico('i-cerrar') + '</button></div>' +
      '<div class="pf-panel-b">' +
        (quien ? '<p class="pf-cuenta">' + esc(quien) + '</p>' : '') +
        '<p class="pf-nota">Queda la constancia de que la decisión se tomó. Sin ella, la tarjeta de ' +
        'arriba te va a volver a preguntar por esta cotización cada vez que abras la plataforma.</p>' +
        '<div class="fld"><label for="pj-motivo">Por qué no se dio (opcional)</label>' +
        '<input type="text" id="pj-motivo" placeholder="Se fue con otro proveedor, ya no lo hizo, no contestó…" maxlength="140"></div>' +
      '</div>' +
      '<div class="pf-panel-f">' +
        '<button type="button" class="btn btn-gho" data-cerrar-pide>Mejor no</button>' +
        '<button type="button" class="btn btn-dgr" data-confirma-nodio="' + esc(ref) + '">No se dio</button>' +
      '</div>' +
    '</div>';
  abrirCapa('pf-pide', { hist: true });
}

async function clicPide(ev) {
  if (ev.target.closest('[data-cerrar-pide]')) { cerrarCapa('pf-pide'); return; }
  const g = ev.target.closest('[data-confirma-gano]');
  if (g) { await confirmarGanar(g.dataset.confirmaGano, g); return; }
  const b = ev.target.closest('[data-confirma-nodio]');
  if (!b) return;
  const ref = b.dataset.confirmaNodio;
  const campo = $('pj-motivo');
  const motivo = campo ? campo.value.trim() : '';
  b.disabled = true;
  /* Una entrada del historial si la hay, y si no la referencia cruda: `descartar` acepta
     las tres formas —entrada, id de proyecto o folio— y la de en medio es la que hace
     falta cuando el proyecto existe pero su cotización ya no está en este dispositivo. */
  const r = await Proy.descartar(Cot.porFolio(ref) || ref, motivo);
  b.disabled = false;
  cerrarCapa('pf-pide');
  if (!avisarResultado(r, 'Quedó como «No se dio»')) return;
  await cargar();
}

/* ============================================================================
   La ficha del proyecto — 'pf-ficha'
   ============================================================================ */

async function abrirFicha(id) {
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); await cargar(); return; }
  fichaId = id;
  const capa = $('pf-ficha'); if (!capa) return;
  capa.innerHTML = htmlFicha(p);
  cablearFicha();
  /* La hoja del teléfono (P10) sube desde abajo y se cierra deslizando sin una línea más, y no
     hay nada de esta zona que lo haga: `abrirCapa` le pone `.entra` y sistema.css (PR #71) la
     hace nacer en `translateY(100%)`; `P.hojasDeslizables()`, colgado una vez en ui.js, trata a
     `.pf-modal-bg.show>.pf-panel` como hoja y la cierra por la misma función que su ×. Aquí solo
     hay que no estorbar: la ficha se rehace con `repintarEnSitio` y no con la capa cerrada. */
  abrirCapa('pf-ficha', { hist: true });
  /* Un cuadro después: con la capa recién abierta la tira del riel ya tiene medidas. */
  requestAnimationFrame(revelarEtapaActual);
}

/* Lo que hay que volver a colgar cada vez que la ficha se repinta: el riel de etapas mira sus
   propios botones y el nodo es otro. Se llama desde `abrirFicha` y desde `refrescarFicha`. */
function cablearFicha() {
  soltar(_rielFicha); _rielFicha = null;
  soltar(_bordesRiel); _bordesRiel = null;
  /* Los renglones internos nacen de nuevo en cada pintado: hay que volver a decirles si son
     una parada de tabulador (solo lo son con el modo cliente encendido). */
  marcarTapados();
  pintarCarpeta();
  pintarImagenesNube();
  const mas = document.querySelector('#pf-ficha .pj-mas');
  if (mas) mas.addEventListener('toggle', () => { _masFicha = { id: fichaId, abierto: mas.open }; });
  const p = P();
  const ol = $('pj-etapas');
  if (!p || !p.riel || !ol) return;
  _rielFicha = p.riel(ol, {
    alTocar: (i, estado, li) => tocarPaso(estado, li),
  });
  /* Siete etapas de 88 px no caben en 360: la tira se recorre, y con la ficha recién abierta el
     paso de hoy quedaba fuera de la vista —en «Instalado», detrás de cuatro palomitas— que es
     justo lo único que se abre la ficha a mirar delante del cliente. El borde desvanecido dice
     que hay más de un lado, y `revelarEtapaActual()` trae el paso encendido a la vista. */
  if (p.bordesDesvanecidos) _bordesRiel = p.bordesDesvanecidos(ol, { eje: 'x' });
  revelarEtapaActual();
}

/* ----- La carpeta de los diseños (Trabajos Pendientes, en Drive) -----
   Va aparte de `htmlFicha` porque espera a la hoja. Si en lo que contesta ya se abrió otra ficha,
   no pinta nada: el hueco es de la que se abrió después. */
const TIPO_ARCHIVO = { 'application/pdf': 'PDF' };
function etiquetaArchivo(a) {
  const ext = /\.([a-z0-9]{2,4})$/i.exec(String(a.nombre || ''));
  return TIPO_ARCHIVO[a.tipo] || (ext ? ext[1].toUpperCase() : 'Archivo');
}
const linkSeguro = u => (/^https:\/\/(drive|docs)\.google\.com\//i.test(String(u || '')) ? String(u) : '');

async function pintarCarpeta() {
  if (!$('pj-carpeta') || !fichaId) return;
  const id = fichaId;
  const [p, r] = await Promise.all([Proy.obtener(id), Carpetas.listar()]);
  const caja = $('pj-carpeta');
  if (!caja || fichaId !== id || !p) return;
  /* Con la lista fresca, el logo también: pudo subirse uno desde la última vez. Solo si cambió,
     para no recargar la imagen que ya se ve. */
  const logo = $('pj-logo');
  if (logo && r && r.ok) {
    const l = logoDeProyecto(p, r.carpetas);
    if ((l ? l.src : '') !== logo.dataset.src) {
      logo.dataset.src = l ? l.src : '';
      logo.innerHTML = logoFichaHTML(p, r.carpetas);
    }
  }
  const lab = '<div class="fld-lab">Carpeta de Drive</div>';
  const raiz = linkSeguro(r && r.raiz) || Carpetas.RAIZ_TRABAJOS;
  const aRaiz = raiz ? '<div class="btn-fila"><a class="btn btn-gho pj-carpeta-abrir" href="' + esc(raiz) +
    '" target="_blank" rel="noopener">' + ico('i-doc') + ' Abrir Trabajos Pendientes</a></div>' : '';
  if (!r || !r.ok) {
    caja.innerHTML = lab + '<p class="hintnote">' + esc(r && r.mensaje || 'No se pudo leer la carpeta de Drive.') + '</p>' + aRaiz;
    return;
  }
  const c = Carpetas.carpetaDe(p, r.carpetas);
  if (!c) {
    caja.innerHTML = lab + '<p class="hintnote">No encontré su carpeta en «Trabajos Pendientes». ' +
      'Se encuentra sola si se llama como el proyecto («Contacto - Negocio»).</p>' + aRaiz;
    return;
  }
  const { vistos, copias } = Carpetas.ordenarArchivos(c.archivos);
  const filas = vistos.map(a => {
    const u = linkSeguro(a.url);
    return u ? '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + ico('i-doc') + ' ' + esc(a.nombre) +
      '<small>' + esc(etiquetaArchivo(a)) + '</small></a></li>' : '';
  }).join('');
  const url = linkSeguro(c.url);
  /* El botón va primero y a todo lo ancho: abrir la carpeta es la acción de la ficha para
     fabricación. Los archivos, debajo, para ir directo al que se busca. */
  caja.innerHTML = lab +
    (url ? '<a class="btn btn-pri pj-carpeta-abrir" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      ico('i-doc') + ' Abrir la carpeta en Drive</a>' +
      '<p class="pj-carpeta-nombre">' + esc(c.nombre) + '</p>' : '') +
    (filas ? '<ul class="pj-archivos">' + filas + '</ul>' : '<p class="hintnote">La carpeta todavía está vacía: sube ahí el .cdr y el PDF de órdenes.</p>') +
    (copias ? '<p class="hintnote">Y ' + (copias === 1 ? 'una copia de seguridad' : copias + ' copias de seguridad') + ' de Corel, en la carpeta.</p>' : '') +
    (r.vieja ? '<p class="hintnote">Es lo último que se vio: ahora mismo no se pudo preguntar a la hoja.</p>' : '');
}

/* ----- Las imágenes de la cotización, desde la nube (Q-02 bis) -----
   La ventanilla `AL3D_NUBE` la pone js/datos/supa-enchufe.js SOLO con la lectura en vivo encendida;
   `obra` solo para Dirección y Fabricación. Este archivo no habla con Supabase: le pide a la ventanilla
   y pinta. Las imágenes llegan como data URL (la CSP ya deja `data:` en img-src) y no se guardan en el
   teléfono. Una ficha que se repinta (cada chip que se toca) no las vuelve a pedir: se queda lo último
   que se pintó de ESA ficha mientras no falte ninguna. */
let _imgFicha = { id: null, html: '' };
function nubeObra() {
  try { const n = globalThis.AL3D_NUBE; return n && typeof n.obra === 'function' ? n : null; } catch (_) { return null; }
}
const URL_IMAGEN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** El contenido del hueco de las imágenes, según lo que contestó la ventanilla. PURA (la usa la prueba). */
function htmlImagenesNube(r) {
  const lab = '<div class="fld-lab">Imágenes de la cotización</div>';
  const imgs = (r && Array.isArray(r.imagenes) ? r.imagenes : []).filter(x => x && URL_IMAGEN.test(String(x.url || '')));
  const figs = imgs.map(x => '<figure><img src="' + esc(x.url) + '" alt="' + esc(x.que || 'Imagen de la cotización') + '">' +
    '<figcaption>' + esc(x.que || '') + '</figcaption></figure>').join('');
  const faltan = r && Number(r.faltan) > 0 ? Number(r.faltan) : 0;
  const estado = r && r.estado;
  const aviso =
    estado === 'no_ganada' ? 'En la base esta obra no está ganada (o se canceló): sus imágenes no se enseñan.'
    : estado === 'sin_obra' ? 'Esta obra todavía no está en la base: sus imágenes salen cuando llegue.'
    : estado === 'sin_permiso' ? 'Esta cuenta no ve las imágenes de la obra.'
    : estado !== 'ok' ? 'Ahora no se pudo preguntar a la nube. Vuelve a abrir la ficha con señal.'
    : !imgs.length && !faltan ? 'La cotización no traía plano, renders ni propuesta.'
    : faltan ? (faltan === 1 ? 'Una imagen todavía no está en la nube' : faltan + ' imágenes todavía no están en la nube') +
               (r.sin_red ? ' (se cortó la señal).' : ': las sube el teléfono que hizo la cotización.')
    : '';
  return lab + (figs ? '<div class="pj-imgs">' + figs + '</div>' : '') + (aviso ? '<p class="hintnote">' + esc(aviso) + '</p>' : '');
}

async function pintarImagenesNube() {
  const nube = nubeObra();
  if (!$('pj-imagenes') || !nube || !fichaId) return;
  const id = fichaId;
  if (_imgFicha.id === id && _imgFicha.html) { $('pj-imagenes').innerHTML = _imgFicha.html; return; }
  const p = await Proy.obtener(id);
  if (!p || fichaId !== id) return;
  let r;
  try { r = await nube.obra(p.folio_global); } catch (_) { r = null; }
  const caja = $('pj-imagenes');
  if (!caja || fichaId !== id) return;
  const html = htmlImagenesNube(r);
  _imgFicha = r && r.estado === 'ok' && !r.faltan ? { id, html } : { id: null, html: '' };
  caja.innerHTML = html;
}

/* Sin desplazar la ficha: la pieza 10 mueve solo la tira. Con la capa todavía cerrada la tira no
   tiene medidas, por eso `abrirFicha` lo repite un cuadro después de abrirla. */
function revelarEtapaActual() {
  const ol = $('pj-etapas');
  if (!ol || !_bordesRiel) return;
  const actual = ol.querySelector('[aria-current="step"]');
  if (actual) _bordesRiel.revelar(actual, false);
  if (_bordesRiel.medir) _bordesRiel.medir();
}

/* Tocar un paso del riel. Lo que ya pasó regresa la etapa (con la pregunta que ya existía); la
   etapa de hoy no hace nada; el siguiente es lo mismo que su botón; y los de más adelante NO se
   saltan tocándolos: eran siete botones iguales donde un dedo torpe brincaba dos etapas, y de
   eso se trata la fila de pasos —enseñar que hay un orden—. Se dice cuál sigue, en vez de
   quedarse mudo. Con la etapa fuera del riel (un proyecto que «no se dio», o fabricación mirando
   uno ya instalado) no hay «de hoy» ni «siguiente»: cualquier paso vale, como valían antes. */
async function tocarPaso(estado, li) {
  const clave = li && li.dataset.clave;
  if (!clave || !fichaId) return;
  const nombre = Proy.ETAPA_NOMBRE[clave] || clave;
  if (estado === 'actual') { voz('Ya está en ' + nombre); return; }
  if (estado === 'pendiente') {
    const pasos = [...li.parentElement.children].filter(x => x.classList.contains('riel-paso'));
    const hoy = pasos.findIndex(x => x.dataset.estado === 'actual');
    if (hoy >= 0 && pasos.indexOf(li) > hoy + 1) {
      const sig = pasos[hoy + 1].dataset.clave;
      toast('Ese paso todavía no toca. Sigue: ' + (VERBO_ETAPA[sig] || Proy.ETAPA_NOMBRE[sig] || sig), '', 3200);
      return;
    }
  }
  await moverEtapa(fichaId, clave);
}

function htmlFicha(p) {
  const rol = Prefs.rol();
  const ve = Prefs.veDinero();
  const inst = FECHA.get(p.id) || null;
  const sem = SEM.get(p.id) || null;
  const o = p.origen || {};

  const tel = String(p.tel || o.tel || '').trim();
  const dir = String(p.dir_texto || '').trim();
  /* Cómo sale del taller (js/datos/entrega.js). Cambia cómo se rotula la fecha y qué se pide de
     la dirección: un envío o una recolección no necesitan pin ni «Abrir en Maps». */
  const ent = entregaDe(p);

  const datos = [];
  datos.push(dato('Contacto', p.contacto || '—'));
  datos.push(dato('Negocio', p.negocio || '—'));
  /* El teléfono se ENSEÑA siempre que lo haya —es un dato y puede servir para llamar—, pero
     el botón de WhatsApp solo cuando el número puede serlo de verdad: con uno a medias abría
     el chat de otra persona diciendo que era el del cliente. */
  datos.push(dato('Teléfono', tel
    ? esc(tel) + (telWa(tel)
        ? '<br><a class="btn-wa" href="' + esc(linkWa(tel)) + '" target="_blank" rel="noopener">' +
          ico('i-wa') + ' WhatsApp</a>'
        : '<br><span class="pf-nota">Así como quedó capturado no es un número al que WhatsApp pueda escribir.</span>')
    : 'No quedó teléfono en la cotización', !!tel));
  datos.push(dato('Tipo de trabajo', (p.tipo_trabajo || []).join(' · ') || '—'));
  datos.push(dato('Etapa de obra', '<span class="pf-etapa ' + claseEtapa(p.etapa) + '">' +
    esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span>', true));
  datos.push(dato(ENTREGA_FECHA[ent], inst
    ? esc(fmtFechaDia(inst.fecha)) + (inst.hora ? ' · ' + esc(fmtHora(inst.hora)) : ' · sin hora') +
      ' <span class="pf-cuando' + tonoCuando(inst.fecha) + '">' + esc(cuando(inst.fecha)) + '</span>' +
      (inst.estado && inst.estado !== 'confirmada' ? '<br><span class="pf-sem nada">' + esc(Agenda.ESTADO_NOMBRE[inst.estado] || inst.estado) + '</span>' : '')
    : '<span class="pf-sem falta">Sin fecha</span>', true));
  datos.push(dato('Límite de fabricación', p.compromiso_texto ||
    'La cotización no prometió fecha de entrega'));
  datos.push(dato('Ganado el', fmtFecha(p.fecha_ganado) || '—'));
  /* Con Material en mantenimiento ni el renglón: un «Material —» en cada ficha es ruido (T1-7). */
  if (conMaterial()) {
    datos.push(dato('Material', sem
      ? '<span class="pf-sem ' + sem.estado + '">' + esc(sem.palabra) + '</span><br>' + esc(sem.detalle)
      : '—', true));
  }

  /* El espejo de Notion. Se pinta con su nombre y se dice qué es: el estatus de allá es de
     dinero y no de obra, y verlos juntos en la misma ficha es lo que impide que alguien
     empiece a usar uno como si fuera el otro. */
  /* Los dos espejos llevan marca para que guardar un estatus o una cuenta pueda actualizarlos
     EN SU SITIO, sin rehacer la ficha entera (P2). */
  /* El estatus lo lee también Fabricación (Q-03: le dice si la obra ya se cobró), pero sin
     «(dinero)» en la etiqueta: para ella es el estado de la venta, no una cifra. La CUENTA sí es
     dinero —decide el «Disponible» y las Facturas de Control— y va dentro de `ve`, con el resto:
     a Fabricación le salía «Sin capturar» en amarillo, una falsa alarma que no puede arreglar
     (auditoría 2026-10-25, TP-7). */
  const base = laBaseManda();
  datos.push(dato(!ve ? 'Estatus de la venta' : base ? 'Estatus de cobro' : 'Estatus en la hoja (dinero)', p.estatus_notion
    ? '<span class="pf-sem nada">' + esc(p.estatus_notion) + '</span>'
    : '<span class="pf-sem falta">Sin capturar</span>', true, 'estatus'));

  if (ve) {
    datos.push(dato('Cuenta de cobro', p.cuenta || '<span class="pf-sem falta">Sin capturar</span>', !p.cuenta, 'cuenta'));
    /* `money(undefined)` es «$0.00», y un subtotal de cero junto a «Total vendido $40,000.00»
       y «IVA: Sí, incluido» son tres datos que no cuadran a la vista. Cuando la cotización no
       trajo subtotal se dice eso, con la misma marca que el resto de los ausentes de la
       ficha, o se calcula quitando el IVA y se rotula como calculado. */
    /* Y un CERO con total vendido tampoco es un subtotal: la capa de datos guarda `num(undefined)`
       como 0 cuando la venta llega sin subtotal (de la hoja con la celda vacía, o una cotización
       vieja), así que la guarda de arriba nunca se cumplía y la ficha decía «Subtotal $0.00» junto a
       «Total vendido $106,492.00» (auditoría completa 2026-10, proyectos-3). Se decide aquí y no
       en los datos para que también los proyectos ya guardados salgan bien. */
    /* Con `esHtml`: las dos ramas de abajo traen su marca, y sin él la ficha enseñaba el marcado
       literal —«$59,827.59 <span class="pf-sem nada">calculado</span>»—, también al cliente con el
       modo cliente encendido (auditoría 2026-10-25, TP-2). */
    const subReal = p.sub != null && !(Number(p.sub) === 0 && Number(p.precio_auth || p.neto) > 0);
    datos.push(dato('Subtotal', subReal
      ? esc(money(p.sub))
      : (p.iva !== false && (p.precio_auth || p.neto)
          ? esc(money((p.precio_auth || p.neto) / 1.16)) + ' <span class="pf-sem nada">calculado</span>'
          : '<span class="pf-sem falta">Sin capturar</span>'), true));
    /* El total es lo que el cliente viene a ver: con el modo cliente encendido crece (función
       31). Va marcado y no con una clase suelta para que el CSS de esta zona lo encuentre. */
    datos.push(dato('Total vendido', money(p.precio_auth || p.neto), false, 'total'));
    datos.push(dato('Anticipo pactado', p.anti_pactado ? money(p.anti_pactado) : 'No se pactó anticipo'));
    datos.push(dato('IVA', p.iva !== false ? 'Sí, incluido' : 'Sin IVA'));
    /* La comisión se cobra hoy al 10 % fijo: la fórmula R de la hoja no lee el % de la fila.
       Un proyecto viejo con 15 decía «Comisión pactada 15 %» y se leía como lo que se cobra.
       Cuando no es 10 se dice qué es: lo que se pactó ANTES de fijarla. Va dentro de `ve`,
       como todo el dinero de la ficha: fabricación no lo ve. */
    /* `interno` es el dinero que el cliente no tiene por qué leer: se marca aquí y lo tapa el
       modo cliente (P12). NO lleva el total ni el subtotal ni el anticipo: eso es lo que se le
       enseña al cliente para decirle en qué va su anuncio, y taparlo sería tapar la ficha. Es
       la misma decisión escrita en `fila()`: el importe del propio proyecto no se difumina. */
    if (p.pct_comision) {
      datos.push(dato(Number(p.pct_comision) === 10 ? 'Comisión pactada' : 'Comisión pactada (antes de fijarla en 10 %)',
        p.pct_comision + ' %', false, null, true));
    }
    /* Las dos fórmulas de Notion. Se leen, jamás se calculan aquí: dos versiones de la
       misma fórmula empiezan a dar dos respuestas y nadie sabe cuál cobrar. */
    /* El pago pendiente SÍ lo ve el cliente: es lo que él debe, y enseñárselo es media razón
       para abrir la ficha delante de él. La comisión restante no: esa es de la casa. */
    if (hay(p.pago_pendiente)) datos.push(dato(base ? 'Pago pendiente (lo calcula la base)' : 'Pago pendiente (fórmula de la hoja)', money(p.pago_pendiente)));
    if (hay(p.comision_restante)) datos.push(dato(base ? 'Comisión restante (lo calcula la base)' : 'Comisión restante (fórmula de la hoja)', money(p.comision_restante), false, null, true));
  }

  const partes = [];

  /* «Oculto del taller» (auditoría 2026-10-26, T1-9): arriba de todo, porque explica por qué esta
     obra no sale en el Tablero ni en «Lo que viene». Lo lee cualquiera; volver a mostrarla es de
     Dirección y está en «Más detalles», junto a «No se dio». */
  if (ocultoDelTaller(p)) {
    partes.push('<p class="hintnote pj-oculto-aviso">' + ico('i-ojo') + ' <b>Oculto del taller.</b> ' +
      'No sale en «El taller» del Tablero, ni en sus avisos, ni en «Lo que viene» del Calendario. ' +
      'El dinero sigue igual: su estatus, su saldo y sus comisiones no cambian.</p>');
  }

  /* El aviso de huella. Va arriba de todo porque cambia el sentido de lo que está abajo:
     si la cotización se editó después de ganarse, el material y el importe de esta ficha
     son de otra versión del trabajo. */
  const estado = HUELLA.get(p.id) || Cot.estadoOrigen(p);
  if (estado === 'cambio' && !HUELLA_IGNORADA.has(p.id)) {
    /* Con Material en mantenimiento el aviso se queda —recalcular es también lo que trae el nombre y el
       importe de la cotización de hoy— y no habla de material (T1-7; el mismo texto que A12 en reglas.js). */
    partes.push('<p class="hintnote nota-av">' + ico('i-aviso') + ' <b>' +
      esc(p.folio_local || Cot.folioVisible(p.folio_global)) + ' se editó después de ganarse.</b> ' +
      (conMaterial() ? 'El material calculado ya no corresponde.' : 'Esta ficha sigue con las partidas que se ganaron.') + '</p>' +
      '<div class="btn-fila">' +
        '<button type="button" class="btn btn-pri" data-resinc="' + esc(p.id) + '">' +
          (conMaterial() ? 'Recalcular material' : 'Actualizar con la de hoy') + '</button>' +
        '<button type="button" class="btn btn-gho" data-huella-ok="' + esc(p.id) + '">Dejar como está</button>' +
      '</div>');
  } else if (estado === 'desaparecio' && p.origen && p.origen.folio) {
    /* Solo si ganó con una cotización de este aparato: una venta que bajó de la base o de la hoja
       nunca estuvo en este historial, y con la base mandando casi todas son así —el aviso salía en
       cada ficha diciendo que «ya no está» lo que nunca estuvo—. */
    partes.push('<p class="hintnote">' + ico('i-historial') + ' ' +
      esc(p.folio_local || '') + ' ya no está en el historial de este dispositivo. El proyecto está completo: ' +
      'lo que se guardó al ganarlo es una copia congelada, no una referencia.</p>');
  }

  /* El aviso de la hoja, arriba por lo mismo que el de huella: cambia qué quiere decir el resto
     de la ficha —una venta que el libro mayor ya no cuenta, o una tarjeta que repite otra—. */
  const hoja = avisoHoja(p, rol);
  if (hoja) partes.push(hoja);

  /* Lo que se rechazó para siempre: lo de esta ficha se movió aquí y no allá. La lista con el
     detalle y su «Volver a intentar» vive en Ajustes; aquí se dice que pasó y el motivo, para que
     nadie dé por guardado lo que no se guardó (auditoría 2026-10-25, TP-5). */
  const apart = apartadoDe(p);
  if (apart) {
    partes.push('<p class="hintnote nota-av pj-apartado">' + ico('i-aviso') + ' <b>No se guardó un cambio de este proyecto.</b> ' +
      esc(apart.motivo) + (/[.!?]$/.test(apart.motivo) ? ' ' : '. ') +
      'Lo de aquí puede no ser lo que ven los demás teléfonos.</p>' +
      '<div class="btn-fila"><button type="button" class="btn btn-gho" data-ir-ruta="ajustes">Ver lo que no se guardó</button></div>');
  }

  /* ----- Lo de arriba: lo que el taller abre la ficha a buscar (octubre de 2026) -----
     El equipo, en un audio: «que si nos metemos ya al proyecto, podamos ver qué material lleva,
     cómo es, dónde se instala… que no dé más información de la que se necesita». Era una lista de
     catorce datos, con el dinero y la cuenta de cobro antes que la dirección. Ahora arriba va solo
     eso —las imágenes, cómo es, el material, dónde y cuándo, y el paso que sigue— y todo lo demás
     queda en «Más detalles», plegado para Dirección y Fabricación (ver `tallerHTML`). */
  /* Los pagos, a la vista y no plegados: cada depósito con su fecha y su cuenta, y lo que resta.
     Para Pagos van primero —es su trabajo—; para Dirección, después de lo del taller. */
  const pagos = ve ? pagosHTML(p) : '';
  if (rol === 'pagos') partes.push(pagos);
  partes.push(tallerHTML(p, { inst, sem, ent, dir, tel, rol }));
  if (rol !== 'pagos') partes.push(pagos);

  /* La carpeta de Drive con los diseños, justo debajo: es lo otro que fabricación abre la ficha a
     buscar —el .cdr y las órdenes—. Se llena sola después de abrir (`pintarCarpeta`), porque hay
     que preguntarle a la hoja. Sin puente no hay a quién preguntar y ni el hueco sale. */
  if (Sync.configurado()) {
    partes.push('<section class="pj-carpeta" id="pj-carpeta" aria-live="polite">' +
      '<div class="fld-lab">Carpeta de Drive</div><p class="hintnote">Buscando su carpeta en Drive…</p></section>');
  }

  /* ----- «Más detalles» -----
     Los catorce datos, la garantía, cómo se entrega, la dirección completa, las notas y el eje del
     dinero. Nada se quitó: se plegó. Abre plegado para Dirección y Fabricación, que vienen a lo de
     arriba, y abierto para Pagos —su trabajo es justo el dinero— y con el modo cliente, que se
     enciende para enseñar el total. */
  const det = [];

  /* El aviso de que hay algo tapado va ANTES de la lista de datos, no dentro: si viviera dentro
     también se taparía, y un borrón sin explicación se lee como un error de pintado. Solo sale
     con el modo encendido (lo enseña el CSS) y solo si esta ficha tiene algo que tapar. */
  if (datos.some(x => x.includes('pf-interno'))) {
    det.push('<p class="pf-tapado">' + ico('i-ojo') +
      ' Tapado para el cliente · mantén presionado un renglón para verlo</p>');
  }
  det.push('<dl class="pf-2col">' + datos.join('') + '</dl>');

  det.push(garantiaHTML(p, inst, ve));

  /* Cómo se entrega, justo arriba de la dirección: es lo que decide si la dirección importa.
     Dirección y fabricación lo eligen (fabricación es quien empaca o entrega en mostrador);
     pagos solo lo lee. No va en grupo parchado en su sitio (P2): cambia el rótulo de la fecha
     y el bloque de la dirección, y la ficha se repinta entera. */
  det.push('<div class="fld-lab">Cómo se entrega</div>' + (rol === 'pagos'
    ? '<p class="hintnote">' + esc(ENTREGA_NOMBRE[ent]) + '</p>'
    : segmento(ENTREGAS.map(e => ({ v: e, t: ENTREGA_NOMBRE[e] })), ent, 'data-entrega', 'Cómo se entrega')));

  /* La dirección cruda, tal como la escribió quien cotizó. No se normaliza ni se parte en
     campos: es lo que el instalador va a leer en la calle.
     Con paquetería es el DESTINO del envío, y se dice: no hace falta pin ni ruta, solo que la
     guía lleve bien la dirección. Con recolección no se le pide nada al cliente: el trabajo se
     entrega en el taller, y lo que se enseña es la dirección del taller, que es la que el
     cliente necesita. */
  if (ent === 'recoleccion') {
    det.push('<dl class="pf-2col">' +
      dato('Se recoge en', esc(TALLER_NOMBRE) + '<br>' + esc(DIRECCION_TALLER), true) +
      '</dl>' +
      '<p class="hintnote">' + ico('i-taller') + ' El cliente pasa por su trabajo al taller: no hace falta su dirección ni un pin.</p>');
  } else {
    det.push('<dl class="pf-2col">' +
      dato(ent === 'paqueteria' ? 'Destino del envío' : 'Dirección',
        dir ? esc(dir).replace(/\n/g, '<br>') : (ent === 'paqueteria' ? 'Sin destino capturado' : 'La cotización no traía dirección'), true) +
      (ent === 'paqueteria' ? '' : dato('Entre calles', p.entrecalles || 'No se anotó')) +
      '</dl>');
    if (ent === 'paqueteria') {
      det.push('<p class="hintnote">' + ico('i-camion') + ' Se envía por paquetería: no va en la ruta y no necesita pin.</p>');
    }
  }
  /* «Abrir en Maps» ya no va aquí: está arriba, en «Dónde se instala». */

  if (o.notaCliente) {
    det.push('<div class="fld-lab">Nota al cliente, la de la cotización</div>' +
      '<p class="hintnote">' + esc(o.notaCliente) + '</p>');
  }
  if (p.notas) {
    det.push('<div class="fld-lab">Notas del proyecto</div><p class="hintnote">' +
      esc(p.notas).replace(/\n/g, '<br>') + '</p>');
  }

  /* La etapa ya no va aquí: los pasos y el botón de lo que sigue están arriba (`tallerHTML`). */

  if (rol === 'pagos' || rol === 'direccion') {
    const ests = rol === 'pagos' ? ESTATUS_DE_PAGOS : ESTATUS_NOTION;
    det.push('<div class="fld-lab">' + (base ? 'Estatus de cobro — el eje del dinero' : 'Estatus en la hoja — el eje del dinero') + '</div>' +
      '<div data-grupo="estatus">' +
      segmento(ests.map(e => ({ v: e, t: e })), p.estatus_notion || '', 'data-estatus',
        base ? 'Estatus de cobro' : 'Estatus en la hoja') + '</div>' +
      /* Con renglón en la hoja no hay fila que copiar (ver el pie): se dice dónde está lo que
         sí falta, que es este segmento. Con la base mandando no hay fila que pegar en ningún
         lado: se dice que el cambio va a la base, para todos, y que pregunta antes. */
      (base
        ? '<p class="hintnote">' + (folioVenta(p) ? 'Esta venta ya está en la base (' + esc(folioVenta(p)) + '). ' : '') +
          'Cambiar el estatus o la cuenta corrige la venta en la base para todos los teléfonos; antes de guardar, se pregunta.</p>'
        : p.notion_page_id
          ? '<p class="hintnote">Esta venta ya está en la hoja. Lo que cambia es este estatus, y el puente lo sube solo: no copies la fila, pegarla la daría de alta dos veces.</p>'
          : ''));
    det.push('<div class="fld-lab">Cuenta donde se cobra</div><div class="chips pj-cuentas-cobro" data-grupo="cuenta">' +
      CUENTAS.map(c => chipGuardado(c, p.cuenta === c, 'data-cuenta="' + esc(c) + '"')).join('') + '</div>');
  }

  /* Lo raro también se plegó: copiar la fila para la hoja —solo para la venta que NO está en la
     hoja; con `notion_page_id` el renglón ya existe y pegarla la daba de alta dos veces— y «No se
     dio», que es de Dirección. En el pie fijo eran dos botones grandes encima de lo de arriba. */
  const raros = [];
  if ((rol === 'direccion' || rol === 'pagos') && !p.notion_page_id) {
    /* Con la base mandando no hay hoja donde pegar: la venta espera su V-### de la base, que la
       bandeja le trae en cuanto hay señal. Pegarla en la hoja la dejaba donde ya nadie la copia a
       la base, y después llegaba repetida (auditoría 2026-10-25, TR-1). Si el alta se apartó, la
       marca de arriba dice por qué. */
    if (base) {
      det.push('<p class="hintnote pj-espera-folio">' + ico('i-reloj') + ' ' + (apart
        ? 'Esta venta todavía no tiene su folio de la base: el alta no se guardó (arriba dice por qué).'
        : 'Esperando su folio de la base… Sale solo en cuanto este teléfono tenga señal; no hay nada que copiar.') + '</p>');
    } else {
      raros.push('<button type="button" class="btn btn-gho" data-tsv="' + esc(p.id) + '">' +
        ico('i-copiar') + ' Copiar datos para la hoja</button>');
    }
  }
  /* «Ocultar del taller» y su reverso (auditoría 2026-10-26, T1-9). Lo pidió Elías para las obras
     con las que quedó mal con el cliente y que «probablemente nunca me liquiden»: con las obras en
     la tabla del taller hasta LIQUIDADO, ésas se quedarían ahí para siempre. Solo Dirección (la
     misma regla que `Proy.puedeEscribir` y la matriz de la base, 0029) y solo con la base
     mandando: se guarda en la base para todo el equipo, y con la hoja no habría dónde. */
  if (rol === 'direccion' && base && p.etapa !== 'cancelado' && Proy.puedeEscribir(rol, 'oculto_taller')) {
    raros.push(ocultoDelTaller(p)
      ? '<button type="button" class="btn btn-gho" data-mostrar-taller="' + esc(p.id) + '">' + ico('i-ojo') + ' Volver a mostrar en el taller</button>'
      : '<button type="button" class="btn btn-gho" data-ocultar-taller="' + esc(p.id) + '">Ocultar del taller</button>');
  }
  if (rol === 'direccion' && p.etapa !== 'cancelado') {
    raros.push('<button type="button" class="btn btn-dgr" data-cancelar="' + esc(p.id) + '">No se dio</button>');
  }
  if (raros.length) det.push('<div class="btn-fila pj-raros">' + raros.join('') + '</div>');

  const abierto = _masFicha.id === p.id ? _masFicha.abierto : (rol === 'pagos' || enModoCliente());
  partes.push('<details class="aj-bloque pj-mas"' + (abierto ? ' open' : '') + '><summary>' +
    esc(ve ? 'Más detalles: precio, fechas, entrega y cobro' : 'Más detalles: fechas, entrega y notas') +
    '</summary>' + det.join('') + '</details>');

  const pie = [];
  if (rol !== 'pagos') {
    pie.push('<button type="button" class="btn ' + (rol === 'fabricacion' ? 'btn-pri' : 'btn-gho') +
      '" data-hoja="' + esc(p.id) + '">' + ico('i-doc') + ' Orden de trabajo</button>');
  }

  return '<div class="pf-panel">' +
    '<div class="pf-panel-h">' +
      '<h2>' + esc(p.nombre || p.folio_local || 'Proyecto') + '</h2>' +
      /* Con el V-### al lado para quien ve el dinero: es el folio con que la buscan en Control,
         Cobros y abonos y Facturas (auditoría 2026-10-25, TP-6). */
      '<span class="folio">' + esc(p.folio_local || Cot.folioVisible(p.folio_global)) +
        (ve ? masFolioVenta(p, p.folio_local || Cot.folioVisible(p.folio_global)) : '') + '</span>' +
      '<button type="button" class="pf-cerrar" data-cerrar-ficha aria-label="Cerrar la ficha">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' + partes.join('') + '</div>' +
    (pie.length ? '<div class="pf-panel-f">' + pie.join('') + '</div>' : '') +
  '</div>';
}

/* `marca` le pone nombre al renglón para que otro código lo encuentre sin adivinar por el texto
   de su etiqueta: «estatus» y «cuenta» son los espejos que un guardado reescribe en su sitio
   (P2), «total» es el importe que el modo cliente agranda (función 31). `interno` marca el
   dinero que ese mismo modo tapa (P12), y se tapa el renglón ENTERO —la etiqueta también—: que
   el cliente no lea ni la palabra «Comisión». */
const dato = (etiqueta, valorHTML, esHtml, marca, interno) =>
  '<div class="pf-dato' + (interno ? ' pf-interno' : '') + '"' +
    (marca ? ' data-marca="' + marca + '"' : '') +
    (interno ? ' tabindex="-1"' : '') + '>' +
    '<dt>' + esc(etiqueta) + '</dt><dd>' + (esHtml ? valorHTML : esc(valorHTML)) + '</dd></div>';

/* ============================================================================
   Para el taller: lo de arriba de la ficha (octubre de 2026)
   ============================================================================
   Lo que pidió el equipo, en su orden: cómo es, qué material lleva, dónde se instala, y el paso
   que sigue. Arriba de todo las imágenes de la cotización —el plano y los renders—, porque «cómo
   es» se entiende mejor viéndolo que leyéndolo. Sin un peso: esto lo lee quien corta y quien
   instala. Todo sale de lo que la ficha ya leía; aquí no se calcula nada nuevo. */
function tallerHTML(p, x) {
  const { inst, sem, ent, dir, tel, rol } = x;
  const b = [];

  /* El logotipo que se está trabajando, arriba de todo: la referencia visual de qué trabajo es. */
  const logo = logoDeProyecto(p);
  b.push('<section class="pj-t-bloque pj-logo-bloque" id="pj-logo" data-src="' + esc(logo ? logo.src : '') + '">' +
    logoFichaHTML(p) + '</section>');

  /* Las imágenes de la cotización (el plano de cada partida, los renders y la propuesta), desde la
     nube: Q-02 bis, decidido por Elías el 2026-10-16 (Fabricación las ve para fabricar; no llevan
     precios). APAGADO: el hueco sale solo si la lectura en vivo puso la ventanilla con `obra`
     (Dirección y Fabricación) y la obra tiene folio de cotización y no está cancelada; sin ella, no
     se inventa un recuadro vacío. Se llena después de abrir (`pintarImagenesNube`). */
  if (nubeObra() && p.folio_global && p.etapa !== 'cancelado') {
    b.push('<section class="pj-imagenes" id="pj-imagenes" aria-live="polite">' +
      '<div class="fld-lab">Imágenes de la cotización</div><p class="hintnote">Buscando el plano y los renders en la nube…</p></section>');
  }

  /* Cómo es: cada partida con sus palabras de siempre —las de la orden de trabajo—, las primeras
     cuatro. Un proyecto que vino de la hoja no trae partidas: se dice su tipo de trabajo. */
  const items = (p.origen && Array.isArray(p.origen.items)) ? p.origen.items : [];
  const como = items.length
    ? '<ul class="pj-t-lista">' + items.slice(0, 4).map(it => {
        const led = ledDe(it), n = piezasDe(it);
        /* `descPartida` ya dice el material, cuántas y de qué altura en letras («Acero · 8 letras,
           40cm») y las medidas en bastidor y caja: debajo va solo lo que le falta decir, sin
           repetir. Las piezas, solo donde la descripción no las cuenta. */
        const extra = it.tipo === 'letras' ? (it.comp && it.comp !== 'recta' ? 'Letra ' + it.comp : '')
          : it.tipo === 'recorte' ? medidasDe(it)
          : (it.tipo === 'bastidor' || it.tipo === 'caja') ? materialDe(it)
          : medidasDe(it);
        const det = [extra, led ? 'LED ' + led.txt : ''].filter(Boolean).join(' · ');
        const cuenta = it.tipo !== 'letras' && it.tipo !== 'recorte' && n > 1;
        return '<li><span class="pj-t-n">' + esc(Cot.descPartida(it)) +
          (cuenta ? ' <span class="pj-t-cant">× ' + n + '</span>' : '') + '</span>' +
          (det ? '<span class="pj-t-det">' + esc(det) + '</span>' : '') + '</li>';
      }).join('') + '</ul>' +
      (items.length > 4 ? '<p class="pj-t-det">Y ' + (items.length - 4) + ' partidas más en la orden de trabajo.</p>' : '')
    : '<p class="pj-t-det">' + esc((p.tipo_trabajo || []).join(' · ') || 'La cotización no trajo partidas.') + '</p>';
  b.push(bloqueTaller('Cómo es', como));

  /* El material: la palabra del semáforo y qué falta, la misma frase de la lista. Si falta, la
     puerta a la lista de compra para quien tiene Material. */
  if (sem) {
    const falta = sem.estado === 'falta' || sem.estado === 'grave';
    b.push(bloqueTaller('Material',
      '<p class="pj-t-linea"><span class="pf-sem ' + esc(sem.estado) + '">' + esc(sem.palabra) + '</span></p>' +
      '<p class="pj-t-det">' + esc(sem.detalle) + '</p>' +
      (falta && CTX && typeof CTX.tieneRuta === 'function' && CTX.tieneRuta('material')
        ? '<div class="btn-fila"><button type="button" class="btn btn-gho" data-ir-ruta="material">' +
          ico('i-material') + ' Ver la lista de compra</button></div>'
        : '')));
  }

  /* Dónde y cuándo. Con paquetería es el destino del envío; con recolección, el taller. */
  const titulo = ent === 'recoleccion' ? 'Se recoge en el taller' : ent === 'paqueteria' ? 'A dónde se envía' : 'Dónde se instala';
  const cuandoHTML = inst
    ? esc(fmtFechaDia(inst.fecha)) + (inst.hora ? ' · ' + esc(fmtHora(inst.hora)) : '') +
      ' <span class="pf-cuando' + tonoCuando(inst.fecha) + '">' + esc(cuando(inst.fecha)) + '</span>'
    : '<span class="pf-sem falta">Sin fecha</span>';
  const lugar = ent === 'recoleccion'
    ? esc(TALLER_NOMBRE) + '<br>' + esc(DIRECCION_TALLER)
    : (dir ? esc(dir).replace(/\n/g, '<br>')
           : '<span class="pf-sem falta">' + (ent === 'paqueteria' ? 'Sin destino capturado' : 'Sin dirección') + '</span>');
  const botones = [];
  const mapa = ent === 'recoleccion' ? '' : urlMapa(p);
  if (mapa) botones.push('<a class="btn btn-gho" href="' + esc(mapa) + '" target="_blank" rel="noopener">' + ico('i-pin') + ' Abrir en el mapa</a>');
  /* «Llamar» solo con un número que se pueda marcar: siete cifras o más. */
  const marcable = tel.replace(/[^\d+]/g, '');
  if (marcable.replace(/\D/g, '').length >= 7) botones.push('<a class="btn btn-gho" href="tel:' + esc(marcable) + '">' + ico('i-tel') + ' Llamar al cliente</a>');
  if (tel && telWa(tel)) botones.push('<a class="btn-wa" href="' + esc(linkWa(tel)) + '" target="_blank" rel="noopener">' + ico('i-wa') + ' WhatsApp</a>');
  b.push(bloqueTaller(titulo,
    '<p class="pj-t-linea pj-t-fecha">' + cuandoHTML + '</p>' +
    '<p class="pj-t-det">' + lugar + '</p>' +
    (botones.length ? '<div class="btn-fila">' + botones.join('') + '</div>' : '')));

  /* La mesa de corte con este proyecto puesto, junto al paso que sigue. Antes de cortar es cuando se
     acomoda en la lámina —vendido y en diseño—, y solo para quien tiene la mesa en su barra. Solo
     con ratón (tab-3): con el dedo llevaba a una herramienta de computadora. */
  const fino = (() => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (_) { return true; } })();
  const acomodar = (fino && (p.etapa === 'ganado' || p.etapa === 'en_diseno') && CTX && typeof CTX.tieneRuta === 'function' &&
      CTX.tieneRuta('anidador') && typeof CTX.pasar === 'function')
    ? '<button type="button" class="btn btn-gho" data-anidar="' + esc(p.id) + '">' + ico('i-anidar') + ' Acomodar en la lámina</button>'
    : '';
  /* Etapa: los pasos, para los tres roles (Q-05, Elías, 2026-10-16: todos mueven cualquier etapa;
     «No se dio» es de Dirección), con el botón de lo que sigue. Es el mismo avance de siempre
     (`moverEtapa`), que pregunta antes de cruzar «Cortado». */
  b.push('<div class="pj-t-bloque pj-t-etapa">' + pasosDeEtapa(p, rol, acomodar) + '</div>');

  return '<section class="pj-taller" aria-label="Para el taller">' + b.join('') + '</section>';
}

/* El contenido del bloque del logo en la ficha. Se vuelve a pintar cuando llega la lista fresca de
   Drive (`pintarCarpeta`), por si la carpeta cambió desde la última vez. */
function logoFichaHTML(p, carpetas) {
  const l = logoDeProyecto(p, carpetas);
  const lab = '<div class="fld-lab">Logotipo</div>';
  if (!l) {
    return lab + '<p class="hintnote">' + ico('i-imagen') + ' Todavía no hay imagen del logo. Sube una imagen con ' +
      '<b>«logo»</b> en el nombre a la carpeta de Drive de este proyecto y aparece aquí y en el tablero. ' +
      'Mientras, sale la primera hoja de las órdenes de fabricación, cuando ya estén.</p>';
  }
  const abrir = l.abrir ? linkSeguro(l.abrir) : '';
  const fig = '<img src="' + esc(l.src) + '" alt="' + esc('Logotipo de ' + (p.nombre || 'el proyecto')) + '" decoding="async" referrerpolicy="no-referrer">';
  return lab +
    '<figure class="pj-logo pj-logo-ficha">' +
      (abrir ? '<a href="' + esc(abrir) + '" target="_blank" rel="noopener" aria-label="Abrir la imagen en Drive">' + fig + '</a>' : fig) +
      '<figcaption>' + (l.fuente === 'drive'
        ? 'De su carpeta de Drive: ' + esc(l.nombre)
        : 'La imagen de la cotización (solo está en este aparato). Para que la vea todo el equipo, súbela a su carpeta de Drive con «logo» en el nombre.') +
      '</figcaption>' +
    '</figure>';
}

/* ----- Los pagos del proyecto (Ventas.pagosDe) -----
   Lo que la hoja sabe de cada depósito —el anticipo y la liquidación— con la fecha como se lee
   («lun 14 oct 2026») y la cuenta que lo recibió, y lo que resta, grande. */
function pagosHTML(p) {
  const g = pagosDeProyecto(p);
  const cuenta = c => c ? esc(c) : '<span class="pf-sem falta">cuenta sin capturar</span>';
  const deps = g.depositos.map(d =>
    '<li><span class="pj-dep-que">' + esc(d.que) + '</span>' +
      '<b class="pj-dep-monto">' + esc(money(d.monto)) + '</b>' +
      '<span class="pj-dep-meta">' + (d.fecha ? esc(fmtFechaDia(d.fecha)) : '<span class="pf-sem falta">sin fecha</span>') +
        ' · a ' + cuenta(d.cuenta) + '</span></li>').join('');
  const nada = g.pactado > 0
    ? 'Esta venta todavía no está en ' + fuente() + ': no hay depósitos registrados. Se pactó un anticipo de ' + esc(money(g.pactado)) +
      (g.cuenta ? ', a ' + esc(g.cuenta) : '') + '.'
    : 'Todavía no hay depósitos registrados en ' + fuente() + '.';
  const liquidado = g.restante <= 0 && g.total > 0;
  return '<section class="pj-t-bloque pj-pagos" aria-label="Pagos">' +
    '<div class="fld-lab">Pagos</div>' +
    '<div class="pj-resta' + (liquidado ? ' ok' : '') + '">' +
      '<span class="pj-resta-lab">' + (liquidado ? 'Pagado completo' : 'Resta por pagar') + '</span>' +
      '<b class="pj-resta-monto">' + esc(money(g.restante)) + '</b>' +
      '<span class="pj-resta-det">de ' + esc(money(g.total)) + ' · pagado ' + esc(money(g.pagado)) +
        (g.deHoja ? '' : ' · <span class="pf-sem nada">estimado</span>') + '</span>' +
    '</div>' +
    (deps ? '<ul class="pj-depositos">' + deps + '</ul>' : '<p class="hintnote">' + nada + '</p>') +
  '</section>';
}

const bloqueTaller = (titulo, html) =>
  '<div class="pj-t-bloque"><div class="fld-lab">' + esc(titulo) + '</div>' + html + '</div>';
/* ============================================================================
   P7 · La etapa como PASOS, no como siete casillas
   ============================================================================
   Eran siete botones iguales en tres renglones, y de ahí no se sacaba lo único que importa
   mirando una ficha delante del cliente: qué ya pasó, en qué va y qué sigue. Ahora es una
   línea de pasos (pieza 16): las etapas hechas llevan palomita, la actual va encendida con
   `aria-current="step"` y la siguiente tiene su propio botón con el verbo en pasado —«Ya se
   cortó»—, que es como se dice en el taller.

   Los verbos viven aquí y no en datos/proyectos.js porque son de ESTA pantalla: son el rótulo
   de un botón, no el nombre de la etapa. El nombre sigue saliendo de `ETAPA_NOMBRE`, que es de
   todos.

   Retroceder sigue preguntando, y ahora AVANZAR hacia «Cortado» también: el Tablero preguntaba
   («¿Ya se cortó?», porque saca el material del almacén) y la ficha no, y era el mismo hecho
   contestado de dos maneras según por dónde entraras. Lo iguala `moverEtapa`. */
const VERBO_ETAPA = {
  ganado: 'Volver a «Ganado»', en_diseno: 'Ya se diseñó', cortado: 'Ya se cortó',
  armado: 'Ya se armó', listo: 'Ya quedó listo', instalado: 'Ya se instaló',
  garantia: 'Pasa a garantía',
};

/* Los pasos salen de ETAPAS y no de una lista escrita a mano: el día que se meta una etapa entre
   cortado y armado, todos la ven sin que nadie se acuerde de este archivo. Son los mismos para los
   tres roles desde Q-05 (2026-10-16). `cancelado` no está en los pasos: se descarta con su propio
   botón, que pregunta por qué, y es de Dirección. */
function etapasDelRol() {
  return Proy.ETAPAS.filter(e => e !== 'cancelado');
}

function pasosDeEtapa(p, rol, junto) {
  const etapas = etapasDelRol();
  /* Un proyecto que «no se dio» solo lo regresa Dirección: a los demás se les enseñan los pasos, sin
     dejarlos tocar, y se dice por qué. */
  const atado = !Proy.puedeMover(rol, p.etapa, p.etapa);
  const i = etapas.indexOf(p.etapa);
  const pasos = etapas.map((e, k) => ({
    texto: Proy.ETAPA_NOMBRE[e] || e,
    clave: e,
    /* Con la etapa fuera de los pasos (un proyecto que «no se dio»), `i` es −1 y todos quedan
       pendientes: ninguno es «el actual». */
    estado: i < 0 ? 'pendiente' : k < i ? 'hecho' : k === i ? 'actual' : 'pendiente',
  }));
  const sig = i >= 0 && i + 1 < etapas.length ? etapas[i + 1] : null;
  const piezas = P();
  const riel = piezas && piezas.rielHTML
    ? piezas.rielHTML(pasos, { forma: 'horizontal', desliza: true, tocable: !atado,
        numeros: false, etiqueta: 'Etapa de obra', id: 'pj-etapas' })
    /* Sin las piezas (una caché a medias), el segmento de siempre: la pantalla no se queda sin
       forma de mover la etapa por un guion que no llegó. */
    : segmento(etapas.map(e => ({ v: e, t: Proy.ETAPA_NOMBRE[e] || e })), p.etapa, 'data-mover',
        'Etapa de obra');

  /* Un paso sin botón sin decir por qué se lee como una pantalla a medias: con el proyecto en «No se
     dio», para quien no es Dirección, se dice de quién es. */
  return '<div class="fld-lab">Etapa de obra</div>' + riel +
    (sig
      ? '<div class="btn-fila pj-sigue"><button type="button" class="btn btn-pri" data-mover="' +
        esc(sig) + '">' + esc(VERBO_ETAPA[sig] || Proy.ETAPA_NOMBRE[sig] || sig) + '</button>' + (junto || '') + '</div>'
      : (atado
          ? '<p class="hintnote pj-sigue">Se marcó «' + esc(Proy.ETAPA_NOMBRE.cancelado || 'No se dio') +
            '»: regresarlo lo decide Dirección.</p>'
          : '') + (junto ? '<div class="btn-fila">' + junto + '</div>' : '')) +
    /* Con Material en mantenimiento no sale nada del almacén al cortar: decirlo sería prometer un descuento que no
       pasa (T1-7). */
    '<p class="hintnote">' + (conMaterial() ? 'Al llegar a «Cortado» el material sale del almacén, una sola vez y con tu nombre. ' : '') +
    'Tocar un paso de atrás regresa la etapa, y eso sí pregunta.</p>';
}

/* ============================================================================
   Función 53 · Garantía y liquidación con cuenta regresiva
   ============================================================================
   Tres reglas que hasta hoy vivían en la cabeza de quien cobra —el otro 50 % a 2 días hábiles
   de instalar, 1 año de garantía eléctrica, 2 de colorimetría— y que por no estar escritas se
   preguntaban por teléfono. La cuenta es pura y vive en datos/proyectos.js con su prueba de
   node; aquí solo se pinta.

   Dos piezas separadas a propósito: la liquidación es DINERO y va dentro de `ve` —fabricación
   no la ve, igual que el resto del dinero de la ficha—, y la garantía la ve todo el mundo,
   porque quien atiende un reclamo en la calle necesita saber si sigue viva y no tiene por qué
   ver cuánto costó.

   Los medidores de garantía son de la pieza 20: barras QUIETAS, sin transición y sin animación.
   Un año de garantía no es una espera que haya que amenizar. La frase va al lado y dice lo
   mismo que la barra: el color nunca va solo.

   La cuenta se hace desde la instalación de la AGENDA —la instalación viva más próxima, que es
   la que ya lee la ficha— y no desde una fecha inventada. Sin ella no se pinta la cuenta: decir
   «vence hoy» contando desde hoy sería inventar la regla, y se dice qué falta. */
function garantiaHTML(p, inst, ve) {
  if (p.etapa !== 'instalado' && p.etapa !== 'garantia') return '';
  if (!inst || !inst.fecha) {
    return '<div class="fld-lab">Garantía y liquidación</div>' +
      '<p class="hintnote nota-av">' + ico('i-aviso') +
      ' Sin fecha de instalación no hay de dónde contar la garantía ni el plazo para liquidar. ' +
      'Ponle su fecha en el Calendario y vuelve.</p>';
  }
  const g = Proy.garantiaYLiquidacion({
    instalado: inst.fecha,
    total: num(p.precio_auth || p.neto),
    /* La fórmula de la hoja manda; si no vino, el saldo pactado es la mitad. Nunca se calcula
       una segunda versión de una fórmula que ya existe allá. */
    saldo: hay(p.pago_pendiente) ? num(p.pago_pendiente) : null,
    hoy: hoyISO(),
  });
  if (!g) return '';

  const piezas = P();
  const plural = (n, s, pl) => n + ' ' + (n === 1 ? s : pl);
  const partes = [];

  if (ve) {
    const l = g.liquidacion;
    const tono = l.estado === 'vencida' ? 'mal' : l.estado === 'venceHoy' ? 'av'
      : l.estado === 'pagada' ? 'ok' : 'a';
    const titulo =
      l.estado === 'pagada' ? 'Ya está liquidado'
      : l.estado === 'vencida' ? 'Liquidación vencida hace ' + plural(l.dias, 'día hábil', 'días hábiles')
      : l.estado === 'venceHoy' ? 'La liquidación vence hoy'
      : 'La liquidación vence en ' + plural(l.dias, 'día hábil', 'días hábiles');
    const detalle =
      l.estado === 'pagada' ? (laBaseManda() ? 'No queda saldo según la base.' : 'No queda saldo según la fórmula de la hoja.')
      : (l.estado === 'venceHoy' ? 'Último día hábil'
          : l.estado === 'vencida' ? 'Venció el ' + fmtFecha(l.vence) : 'Vence el ' + fmtFecha(l.vence)) +
        ' · saldo por cobrar ' + money(l.saldo);
    /* El glifo de la pieza 24 acompaña a la palabra y nunca la sustituye: el estado se lee. */
    const glifo = piezas && piezas.marcaEstadoHTML
      ? piezas.marcaEstadoHTML(tono === 'mal' ? 'mal' : tono === 'av' ? 'av' : tono === 'ok' ? 'ok' : 'espera', { tam: 20 })
      : '';
    partes.push('<div class="pj-liq" data-tono="' + tono + '" role="status">' + glifo +
      '<span><b>' + esc(titulo) + '</b><small>' + esc(detalle) + '</small></span></div>');
  }

  const filas = g.garantias.map(x => {
    const frase = x.vencida
      ? 'Venció el ' + fmtFecha(x.hasta)
      : Math.round(x.consumido * 100) + ' % consumido · ' +
        (x.quedan === 0 ? 'vence hoy' : 'quedan ' + plural(x.quedan, 'día', 'días'));
    const medidor = piezas && piezas.medidorHTML
      ? piezas.medidorHTML({ valor: x.consumido, max: 1, tono: x.vencida ? 'mal' : '' })
      : '';
    return '<div class="pj-gar-f' + (x.vencida ? ' vencida' : '') + '">' +
      '<div class="pj-gar-t"><span>' + esc(x.nombre) + ' · ' +
        (x.meses === 12 ? '1 año' : (x.meses / 12) + ' años') + '</span>' +
        '<span>' + esc(frase) + '</span></div>' +
      '<div class="pj-gar-h">Hasta el ' + esc(fmtFecha(x.hasta)) + '</div>' + medidor + '</div>';
  }).join('');

  partes.push('<div class="pj-gar">' +
    '<b>Se cuenta desde la instalación, el ' + esc(fmtFecha(g.instalado)) + '</b>' + filas + '</div>');

  return '<div class="fld-lab">Garantía y liquidación</div>' + partes.join('');
}

/* ============================================================================
   P2 · El chip que guarda en su sitio
   ============================================================================
   `chip()` de ui.js es la única implementación del chip y sigue siéndolo: aquí solo se le mete
   dentro la palomita de la pieza 6, con la clase `.ck` que el sistema ya esconde en los chips
   apagados y enseña en el encendido. Nace SIN dibujar —`dibujar:false`— porque la ficha se
   repinta entera y una palomita que se traza en cada pintado deja de significar «acabas de
   guardar esto»; la del chip recién elegido sí se traza, y eso lo hace `parcharGrupo()`. */
function chipGuardado(txt, on, attrs) {
  const piezas = P();
  const palo = piezas && piezas.palomitaHTML
    ? piezas.palomitaHTML({ clase: 'ck', dibujar: false })
    : '';
  return chip(txt, on, attrs).replace('</button>', palo + '</button>');
}

/* ============================================================================
   P12 + función 31 · El modo cliente
   ============================================================================
   La ficha que se le enseña al cliente para decirle en qué va su anuncio llevaba a la vista la
   comisión, y la pantalla de entrada abre con la suma de todo lo que hay en el taller. El
   cotizador ya resolvió esto (`_SEL_PRECIO` y `_espiarPrecios()` en js/cotizador/nucleo.js): una
   clase en el <body> difumina, y mantener el dedo encima destapa mientras dura el toque. Aquí es
   la misma pieza, con el mismo gesto, para que sea el mismo hábito.

   Lo que añade la función 31 sobre P12 es el MODO: un interruptor con nombre («Enseñar al
   cliente») en vez de un difuminado permanente, porque el 90 % del tiempo no hay ningún cliente
   enfrente y trabajar detrás de un borrón es peor que el problema que resuelve. Y con el modo
   encendido el total de la ficha crece: lo que el cliente sí ve se lee desde el otro lado de la
   mesa.

   Qué se tapa y qué no:
     · se tapa la comisión pactada y la comisión restante de la ficha (marcadas `.pf-interno`);
     · se tapa la suma «en el taller» del resumen del Tablero (marcada `.pf-interno` en
       js/mod/tablero.js desde el despeje de octubre de 2026): es todo lo vendido y abre la
       pantalla de entrada;
     · NO se tapa el importe del propio proyecto —total, subtotal, anticipo, pago pendiente—,
       que es la decisión que ya está escrita en `fila()`: es lo que se le enseña al cliente;
     · fabricación no ve ninguna de estas cifras porque no se pintan (el `if (ve)`), así que no
       hay nada que difuminar y el interruptor no sale.

   El modo SOBREVIVE al cambio de pantalla a propósito: se prende para enseñar y se apaga al
   terminar, y si se apagara solo al salir de Proyectos la cuenta del Tablero volvería a
   destaparse justo al llegar a ella. Vive en el <body>, que es de la app entera, y por eso sus
   oyentes también: se cuelgan una vez del documento —como los del cotizador— y no en `montar()`,
   o destapar con el dedo dejaría de funcionar en cuanto se saliera de Proyectos, que es
   exactamente donde hace falta. */
const MODO_CLIENTE = 'pf-cliente';
const MODO_CLIENTE_VE = 'pf-cliente-ve';
const enModoCliente = () => typeof document !== 'undefined' &&
  document.body.classList.contains(MODO_CLIENTE);

function interruptorClienteHTML() {
  /* Fabricación no ve ninguna de estas cifras: sin nada que tapar, el interruptor sería un
     botón que no hace nada. */
  if (!Prefs.veDinero()) return '';
  const on = enModoCliente();
  /* El interruptor del sistema (`.switch` + `.tg`, el del IVA y el de la iluminación del
     cotizador), no uno propio: un solo interruptor en toda la app, con su mismo movimiento. */
  return '<div class="pj-cliente">' +
    '<button type="button" class="switch" data-cliente role="switch" aria-checked="' + (on ? 'true' : 'false') + '">' +
      '<span class="tg' + (on ? ' on' : '') + '" aria-hidden="true"></span>Enseñar al cliente</button>' +
    /* La alternativa de teclado al gesto (regla 10): quien no puede sostener un dedo sobre un
       renglón destapa todo de un toque, y de otro vuelve a taparlo. Solo existe con el modo
       encendido, porque apagado no hay nada tapado que ver. */
    '<button type="button" class="btn btn-gho pj-ver" data-ver-importes aria-pressed="false"' +
      (on ? '' : ' hidden') + '>Ver importes</button>' +
  '</div>';
}

function ponerModoCliente(on) {
  document.body.classList.toggle(MODO_CLIENTE, !!on);
  /* El total que se le enseña al cliente vive en «Más detalles»: encender el modo lo abre. */
  const mas = on && document.querySelector('#pf-ficha .pj-mas');
  if (mas && !mas.open) mas.open = true;
  if (!on) {
    document.body.classList.remove(MODO_CLIENTE_VE);
    for (const el of document.querySelectorAll('.destapado')) el.classList.remove('destapado');
    _espiando = null;
  }
  const sw = cont && cont.querySelector('[data-cliente]');
  if (sw) {
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    const tg = sw.querySelector('.tg'); if (tg) tg.classList.toggle('on', !!on);
  }
  const ver = cont && cont.querySelector('[data-ver-importes]');
  if (ver) { ver.hidden = !on; ver.setAttribute('aria-pressed', 'false'); }
  marcarTapados();
  voz(on ? 'Modo cliente encendido: los importes internos quedan tapados'
         : 'Modo cliente apagado: los importes internos vuelven a verse');
}

/* Un renglón tapado tiene que poder recibir el foco para destaparse con la tecla; uno
   destapado no tiene por qué ser una parada de tabulador de más. Se llama en cada repintado de
   la ficha y al cambiar el modo. */
function marcarTapados() {
  const on = enModoCliente();
  for (const el of document.querySelectorAll('.pf-interno')) {
    el.tabIndex = on ? 0 : -1;
    if (on) el.setAttribute('aria-label', 'Importe interno tapado. Mantén presionado para verlo');
    else el.removeAttribute('aria-label');
  }
}

/* Destapar mientras dura el dedo, y mientras dura la tecla. Delegado en el documento, como el
   del cotizador: los renglones se rehacen en cada repintado y volver a engancharlos en cada
   pintado se olvidaría en algún camino. */
let _espiando = null;         // el renglón que el dedo (o la tecla) tiene destapado
let _cableado = false;
function cablearModoCliente() {
  marcarTapados();
  if (_cableado || typeof document === 'undefined') return;
  _cableado = true;
  const tapado = t => (t && t.closest) ? t.closest('.pf-interno,.pf-cuenta.dinero') : null;
  /* Se destapa EL renglón que se sostiene, no todos: con la comisión pactada bajo el dedo, la
     restante sigue tapada, y de eso se trata —enseñar una cosa sin enseñar la de al lado—. El
     cotizador suelta todos a la vez porque allá son importes de una misma cuenta; aquí son
     cosas distintas. «Ver importes» sí las suelta todas, a propósito, para quien no puede
     sostener nada. */
  const destapar = el => { dejarDeEspiar(); el.classList.add('destapado'); _espiando = el; };
  /* Soltar solo tapa lo que destapó el GESTO: con «Ver importes» a la vista, un toque en
     cualquier otra parte volvía a taparlos y el botón quedaba mintiendo. Es el mismo defecto
     que ya se corrigió en el cotizador. */
  const dejarDeEspiar = () => {
    if (!_espiando) return;
    _espiando.classList.remove('destapado');
    _espiando = null;
  };

  document.addEventListener('pointerdown', ev => {
    const el = enModoCliente() ? tapado(ev.target) : null;
    if (el) destapar(el);
  });
  document.addEventListener('pointerup', dejarDeEspiar);
  document.addEventListener('pointercancel', dejarDeEspiar);
  window.addEventListener('blur', dejarDeEspiar);
  /* Sin el menú de pulsación larga de Android encima de lo que se está destapando. */
  document.addEventListener('contextmenu', ev => {
    if (enModoCliente() && tapado(ev.target)) ev.preventDefault();
  });
  document.addEventListener('keydown', ev => {
    if (!enModoCliente() || ev.repeat) return;
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    const el = tapado(ev.target);
    if (!el) return;
    ev.preventDefault();
    destapar(el);
  });
  document.addEventListener('keyup', ev => { if (ev.key === ' ' || ev.key === 'Enter') dejarDeEspiar(); });
  document.addEventListener('focusout', dejarDeEspiar);
}

/* ============================================================================
   P9 · Arrastrar tarjetas entre columnas del tablero
   ============================================================================
   La tarjeta solo abría la ficha: cambiar de columna pedía abrirla, bajar hasta la etapa y
   tocar. Ahora se levanta manteniéndola 250 ms y se suelta en otra columna, que es el gesto
   que ya tiene aprendido cualquiera que haya usado un tablero.

   Por qué con pulsación larga y no con arrastre inmediato: de 760 a 1023 px —el Fold abierto—
   el tablero se DESLIZA en horizontal (las cinco columnas piden 1 048 px), y un arrastre que
   empieza al primer píxel se come ese deslizamiento. Con los 250 ms, mover el dedo antes
   cancela el levantamiento y lo que pasa es lo de siempre: el tablero se recorre. Y un toque
   corto sigue abriendo la ficha, porque no se toca el clic.

   Con el dedo hay un problema que con el ratón no existe: una vez levantada la tarjeta, el
   navegador sigue creyendo que el dedo quiere DESLIZAR la página, y a los pocos píxeles cancela
   el puntero (`pointercancel`) y suelta la tarjeta a medio camino. `touch-action` no sirve
   —se lee al empezar el toque y aquí la decisión llega 250 ms después—, así que al levantarla
   se cuelga un `touchmove` que no es pasivo y apaga ese deslizamiento. Sin esto la tarjeta se
   arrastraba con ratón y se caía con el dedo, que es justo con lo que se usa.

   Solo de 760 px para arriba. En el teléfono las tarjetas viven en páginas que se deslizan
   (P28) y un arrastre ahí pelearía con el gesto de pasar de página y con el de atrás de
   Android.

   Por teclado: Alt + → y Alt + ← sobre la tarjeta enfocada. Es la alternativa que pide la
   regla 10, y encima es más rápida que el arrastre para quien tiene teclado.

   Los roles se respetan por el mismo camino que la ficha: `Proy.puedeMover` es la regla y las
   columnas a las que este rol no puede mover no se iluminan y soltar ahí no hace nada. Desde Q-05
   (Elías, 2026-10-16) los tres roles mueven obra, así que los tres levantan tarjetas; las columnas son
   etapas vivas y «No se dio» no es una. Y quien decide de verdad es `moverEtapa`, que pregunta lo que
   hay que preguntar —regresar la etapa, y ahora también cruzar «Cortado»— y escribe por
   `Proy.avanzarEtapa`, que vuelve a comprobar el rol. */
const MS_LEVANTAR = 250;
const MOVER_RATON = 8;        // px: con ratón, lo que hay que mover para que ya sea arrastrar
const MOVER_CANCELA = 8;      // px: si el dedo se movió antes de los 250 ms, era deslizar
const BORDE_CORRE = 56;       // px del borde del tablero donde empieza a correr solo
const CORRE_MAX = 18;         // px por cuadro, como mucho

let _arr = null;              // { id, tarjeta, fantasma, col, pid, desde, x, y, raf, tablero, snap, quitar[] }

function puedeMoverA(etapa) {
  /* La regla es la de la capa de datos y no una copia: `etapasDelRol()` solo sirve para pintar los
     pasos de la ficha. Cuando la regla era por rol (hasta Q-05, 2026-10-16), copiarla aquí dejó a
     pagos arrastrar tarjetas por un tablero que entonces no le tocaba. */
  return etapa !== 'cancelado' && Proy.puedeMover(Prefs.rol(), etapa);
}

/* `volver`: soltar donde no vale (la misma columna, fuera del tablero, una que este rol no puede).
   El fantasma regresa a la tarjeta en 200 ms antes de irse; se borraba en el primer cuadro y
   parecía que la tarjeta se había perdido (auditoría de movimiento 2026-10, obra-4). Con Escape no
   se anima: es una tecla. */
function soltarArrastre(op = {}) {
  if (!_arr) return;
  const a = _arr; _arr = null;
  a.quitar.forEach(f => { try { f(); } catch (_) {} });
  if (a.raf) cancelAnimationFrame(a.raf);
  if (a.fantasma) {
    const f = a.fantasma;
    let anim = null;
    if (op.volver && a.tarjeta && !sinMov() && typeof f.animate === 'function') {
      const t = a.tarjeta.getBoundingClientRect(), g = f.getBoundingClientRect();
      const ahora = getComputedStyle(f).transform;
      const x = t.left + t.width / 2 - g.width / 2, y = t.top + t.height / 2 - g.height / 2;
      try {
        anim = f.animate([{ transform: ahora, opacity: 1 }, { transform: 'translate(' + x + 'px,' + y + 'px)', opacity: 0 }],
          { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
      } catch (_) { anim = null; }
    }
    if (anim) { const fuera = () => f.remove(); anim.onfinish = fuera; anim.oncancel = fuera; setTimeout(fuera, 400); }
    else f.remove();
  }
  if (a.tablero) a.tablero.style.scrollSnapType = a.snap || '';
  if (a.tarjeta) {
    a.tarjeta.classList.remove('pj-levantada');
    try { if (a.pid != null) a.tarjeta.releasePointerCapture(a.pid); } catch (_) {}
  }
  document.documentElement.classList.remove('pj-arrastrando');
  for (const c of document.querySelectorAll('.pj-col.sobre')) c.classList.remove('sobre');
}

function cablearArrastre() {
  on(cont, 'pointerdown', ev => {
    if (!ANCHO.matches || !ev.isPrimary || ev.button > 0) return;
    if (enModoCliente()) return;      // con el cliente enfrente no se mueve obra por accidente
    if (!COLUMNAS().some(puedeMoverA)) return;    // un rol que no mueve obra no levanta tarjetas (hoy los tres la mueven)
    const tarjeta = ev.target.closest('.pj-tarj[data-abrir]');
    if (!tarjeta || !tarjeta.closest('.pj-tablero')) return;

    const x0 = ev.clientX, y0 = ev.clientY, pid = ev.pointerId;
    let reloj = 0;
    const quitar = [];
    const oir = (x, t, f) => { x.addEventListener(t, f); quitar.push(() => x.removeEventListener(t, f)); };
    const cancelar = () => { clearTimeout(reloj); quitar.forEach(f => f()); quitar.length = 0; };

    /* Con RATÓN no hay nada que desambiguar: la rueda desliza el tablero y presionar-y-mover es
       arrastrar, como en cualquier tablero de escritorio. Esperar 250 ms quietos ahí era la razón
       de que «no se dejara arrastrar» (Elías, octubre de 2026): el ratón se mueve en cuanto se
       presiona y el gesto se cancelaba como si fuera deslizar. Se levanta al pasar 8 px; un clic
       sin moverse sigue abriendo la ficha. Eran 4 px y además se levantaba a los 250 ms quieto:
       un clic con la mano movida 5 px o sostenido un tercio de segundo levantaba la tarjeta y la
       ficha no se abría (auditoría de la plataforma 2026-10, proyectos-1). Con 8 px el arrastre
       sigue saliendo en cuanto la mano de verdad se mueve. */
    if (ev.pointerType === 'mouse') {
      ev.preventDefault();      // sin esto el arrastre selecciona texto de la tarjeta
      oir(tarjeta, 'pointermove', e => {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) <= MOVER_RATON) return;
        cancelar();
        levantar(tarjeta, pid, e.clientX, e.clientY);
      });
      oir(tarjeta, 'pointerup', cancelar);
      oir(tarjeta, 'pointercancel', cancelar);
      try { tarjeta.setPointerCapture(pid); } catch (_) {}
      /* Mantener presionado ya NO la levanta con ratón: es el gesto del dedo, y con ratón solo
         servía para comerse los clics lentos. */
      return;
    }

    /* Con el dedo, antes de levantar: moverse es deslizar el tablero, no arrastrar la tarjeta. */
    oir(tarjeta, 'pointermove', e => {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > MOVER_CANCELA) cancelar();
    });
    oir(tarjeta, 'pointerup', cancelar);        // toque corto: el clic abre la ficha, como siempre
    oir(tarjeta, 'pointercancel', cancelar);
    /* El menú de «mantener presionado» de Android sale a los ~500 ms y se comería el gesto. */
    oir(tarjeta, 'contextmenu', e => e.preventDefault());

    reloj = setTimeout(() => {
      cancelar();
      levantar(tarjeta, pid, x0, y0);
    }, MS_LEVANTAR);
  });

  /* Teclado: Alt + → / ←. Va en `cont` y no en la tarjeta porque las tarjetas se rehacen. */
  on(cont, 'keydown', ev => {
    if (!ev.altKey || (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft')) return;
    const tarjeta = ev.target.closest && ev.target.closest('.pj-tarj[data-abrir]');
    if (!tarjeta) return;
    const col = tarjeta.closest('.pj-col');
    const cols = COLUMNAS();
    const i = col ? cols.indexOf(col.dataset.col) : -1;
    if (i < 0) return;
    const destino = cols[i + (ev.key === 'ArrowRight' ? 1 : -1)];
    ev.preventDefault();
    if (!destino) { voz(ev.key === 'ArrowRight' ? 'Es la última columna' : 'Es la primera columna'); return; }
    if (!puedeMoverA(destino)) { voz('Con tu rol no se marca ' + (Proy.ETAPA_NOMBRE[destino] || destino)); return; }
    const id = tarjeta.dataset.abrir;
    /* El repintado destruye la tarjeta enfocada y el foco caía al <body>: la segunda Alt+→ ya no
       hacía nada y había que volver a buscarla entre todas con Tab (auditoría completa 2026-10,
       proyectos-2). Se le devuelve el foco a la MISMA tarjeta, ya en su columna nueva, en cuanto
       existe —unos cuadros como mucho—, y solo si nadie lo movió a otra parte (una pregunta). */
    /* Durante 1,5 s: el tablero se repinta más de una vez tras mover (la escritura, la cuenta, la
       sincronización), y cada repintado vuelve a tirar el foco. Solo se recoge del <body>: si la
       persona ya lo llevó a otro lado, o salió una pregunta, se respeta. */
    moverEtapa(id, destino).then(() => {
      const sel = '.pj-tarj[data-abrir="' + CSS.escape(id) + '"]';
      const hasta = performance.now() + 1500;
      const volver = () => {
        const a = document.activeElement;
        if (!a || a === document.body) {
          const t = cont.querySelector(sel);
          if (t) { try { t.focus({ preventScroll: false }); } catch (_) {} }
        } else if (!cont.contains(a) || !a.closest(sel)) return;
        if (performance.now() < hasta) setTimeout(volver, 60);
      };
      volver();
    });
  });
}

function levantar(tarjeta, pid, x, y) {
  soltarArrastre();
  try { tarjeta.setPointerCapture(pid); } catch (_) {}
  tarjeta.classList.add('pj-levantada');
  document.documentElement.classList.add('pj-arrastrando');
  /* Un golpecito para decir que ya se levantó: sin él, en una pantalla táctil no hay forma de
     saber si el dedo agarró la tarjeta o va a deslizar el tablero. Donde no existe, no pasa nada. */
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) {}

  const fantasma = document.createElement('div');
  fantasma.className = 'pj-fantasma';
  fantasma.setAttribute('aria-hidden', 'true');
  fantasma.textContent = tarjeta.querySelector('.pj-tarj-t')
    ? tarjeta.querySelector('.pj-tarj-t').textContent : 'Proyecto';
  document.body.appendChild(fantasma);

  const tablero = tarjeta.closest('.pj-tablero');
  const quitar = [];
  const oir = (el, t, f, opc) => { el.addEventListener(t, f, opc); quitar.push(() => el.removeEventListener(t, f, opc)); };
  _arr = { id: tarjeta.dataset.abrir, tarjeta, fantasma, col: null, pid, desde: columnaDe(tarjeta),
    x, y, raf: 0, tablero, snap: tablero ? tablero.style.scrollSnapType : '', quitar };
  /* El tablero se desliza a saltos de columna (scroll-snap): mientras corre solo por el borde,
     el imán se lo devolvería en cada cuadro. */
  if (tablero) tablero.style.scrollSnapType = 'none';

  oir(tarjeta, 'pointermove', e => { if (e.pointerId === pid) seguir(e.clientX, e.clientY); });
  oir(tarjeta, 'pointerup', e => { if (e.pointerId === pid) soltarEnColumna(); });
  oir(tarjeta, 'pointercancel', e => { if (e.pointerId === pid) soltarArrastre(); });
  oir(tarjeta, 'contextmenu', e => e.preventDefault());
  /* El dedo: sin esto el navegador empieza a desplazar la página y cancela el puntero. */
  oir(document, 'touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  /* Escape suelta sin mover: lo mismo que hace Escape en toda la app. El botón o el dedo siguen
     abajo, y al levantarlos sobre la tarjeta el navegador manda el clic de siempre, que abría la
     ficha del proyecto que se acababa de dejar donde estaba (y la ficha se quedaba con el foco).
     Ese clic se frena igual que el que llega después de soltar en una columna. */
  oir(window, 'keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    soltarArrastre();
    const alSoltar = () => {
      window.removeEventListener('pointerup', alSoltar, true);
      window.removeEventListener('pointercancel', alSoltar, true);
      frenarClicUnaVez();
    };
    window.addEventListener('pointerup', alSoltar, true);
    window.addEventListener('pointercancel', alSoltar, true);
  });

  seguir(x, y);
  _arr.raf = requestAnimationFrame(correrPorElBorde);
  voz('Tarjeta levantada. Suéltala en una columna, o Escape para dejarla donde estaba');
}

const columnaDe = el => { const c = el && el.closest ? el.closest('.pj-col') : null; return c ? c.dataset.col : null; };

/* En el Fold abierto el tablero mide más que la pantalla: para llevar una tarjeta a la quinta
   columna hay que poder arrastrarla hasta el borde y que el tablero corra solo, a la velocidad
   de qué tan cerca esté el dedo. Un bucle de cuadros que vive solo mientras hay una tarjeta en
   el aire. */
function correrPorElBorde() {
  if (!_arr) return;
  const a = _arr, t = a.tablero;
  a.raf = requestAnimationFrame(correrPorElBorde);
  if (!t || t.scrollWidth <= t.clientWidth) return;
  const r = t.getBoundingClientRect();
  let dx = 0;
  if (a.x < r.left + BORDE_CORRE) dx = -(r.left + BORDE_CORRE - a.x) / 3;
  else if (a.x > r.right - BORDE_CORRE) dx = (a.x - (r.right - BORDE_CORRE)) / 3;
  dx = Math.max(-CORRE_MAX, Math.min(CORRE_MAX, dx));
  if (!dx) return;
  const antes = t.scrollLeft;
  t.scrollLeft += dx;
  /* Corrió: la columna que está bajo el dedo cambió aunque el dedo no se haya movido. */
  if (t.scrollLeft !== antes) seguir(a.x, a.y);
}

/* El clic que llega DESPUÉS de soltar abriría la ficha del proyecto que se acaba de mover. Se
   frena una sola vez, en captura sobre el documento, y se levanta solo por si el navegador no
   manda ninguno (soltar fuera de la tarjeta). */
let _frenarClic = false;
function frenarClicUnaVez() {
  _frenarClic = true;
  const f = e => { if (_frenarClic) { e.preventDefault(); e.stopPropagation(); } _frenarClic = false; document.removeEventListener('click', f, true); };
  document.addEventListener('click', f, true);
  setTimeout(() => { _frenarClic = false; document.removeEventListener('click', f, true); }, 400);
}

function seguir(x, y) {
  if (!_arr) return;
  _arr.x = x; _arr.y = y;
  /* Solo `transform`: mover con `left/top` repinta la página entera en cada cuadro, y esto se
     usa en un teléfono de gama media. */
  _arr.fantasma.style.transform = 'translate(' + (x - 70) + 'px,' + (y - 22) + 'px)';
  /* El fantasma no puede taparse a sí mismo del `elementFromPoint`: lleva `pointer-events:none`
     en su hoja, así que basta con preguntar. */
  const bajo = document.elementFromPoint(x, y);
  const col = bajo && bajo.closest ? bajo.closest('.pj-col') : null;
  const vale = !!col && puedeMoverA(col.dataset.col) && col.dataset.col !== _arr.desde;
  for (const c of document.querySelectorAll('.pj-col')) c.classList.toggle('sobre', vale && c === col);
  _arr.col = vale ? col : null;
}

function soltarEnColumna() {
  if (!_arr) return;
  const { id, col, tarjeta, fantasma } = _arr;
  const etapa = col ? col.dataset.col : null;
  frenarClicUnaVez();
  if (!etapa) { soltarArrastre({ volver: true }); return; }
  /* La tarjeta viaja DESDE DONDE SE SOLTÓ (obra-3). El fantasma se borraba y la tarjeta volaba
     desde su hueco de origen: dos saltos. Ahora, antes de quitar el fantasma, la tarjeta se pone
     encima de él con un translate; el viaje de `moverEtapa` toma ESA posición como la de antes y
     la lleva de ahí a la columna nueva. Si el cambio no se hace (se dice que no a la pregunta,
     falla la escritura), la tarjeta regresa a su lugar en 200 ms. */
  let dx = 0, dy = 0;
  if (fantasma && tarjeta && !sinMov()) {
    const g = fantasma.getBoundingClientRect(), t = tarjeta.getBoundingClientRect();
    dx = Math.round(g.left + g.width / 2 - (t.left + t.width / 2));
    dy = Math.round(g.top + g.height / 2 - (t.top + t.height / 2));
  }
  soltarArrastre();
  if (dx || dy) { tarjeta.style.transition = 'none'; tarjeta.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }
  Promise.resolve(moverEtapa(id, etapa)).catch(() => {}).finally(() => {
    if (!tarjeta.isConnected || !tarjeta.style.transform) return;
    tarjeta.style.transition = 'transform .2s cubic-bezier(.23,1,.32,1)';
    tarjeta.style.transform = '';
    setTimeout(() => { tarjeta.style.transition = ''; }, 260);
  });
}

/* ----- P8 · cuándo sale el viaje de la tarjeta -----
   La ficha se cierra por cinco caminos —su ×, Escape, el atrás del teléfono, deslizarla hacia
   abajo y `cerrarCapa()` desde el código— y todos acaban quitándole la clase `.show`. Mirar la
   clase es lo único que los cubre a los cinco sin tocar `registrarCapa()`, que es de app.js. */
function cablearCierreDeFicha() {
  const capa = $('pf-ficha');
  if (!capa || typeof MutationObserver === 'undefined') return;
  let estaba = capa.classList.contains('show');
  _obsFicha = new MutationObserver(() => {
    const ahora = capa.classList.contains('show');
    if (estaba && !ahora && _viaje) {
      /* Después de que la ficha termine de irse (220 ms de salida): si el viaje sale mientras
         la hoja todavía se está bajando, la captura de «antes» trae la ficha a medio irse y lo
         que viaja es una mancha. Con menos movimiento no hay salida que esperar. */
      clearTimeout(_tViaje);
      _tViaje = setTimeout(() => {
        if (!_viaje || hayCapaAbierta()) return;
        pintarCuentas();
        pintarLista();
      }, sinMov() ? 0 : 260);
    }
    estaba = ahora;
  });
  _obsFicha.observe(capa, { attributes: true, attributeFilter: ['class'] });
}
let _tViaje = 0;
const sinMov = () => { const p = P(); return !!(p && p.sinMovimiento && p.sinMovimiento()); };


/* ============================================================================
   LA VENTA Y LA HOJA NO CUADRAN — el aviso de la ficha
   ============================================================================
   Las marcas las pone la capa de datos (ver «LA VENTA QUE LA HOJA YA NO TIENE» en
   js/datos/proyectos.js) y NINGUNA borra nada sola: aquí se dice qué pasó y está el botón que
   hace lo correcto. Quién aprieta cuál es la regla de `soloDireccion` en ese archivo: lo que
   decide la hoja (darla de alta otra vez, dejarla fuera) o cuál de dos proyectos es la venta
   (juntar, separar, quitar la copia repetida) es de Dirección; quitar o dejar una tarjeta
   IMPORTADA cuya fila ya no vino es de quien tenga el teléfono, porque las marcas no viajan y
   lo que Dirección decida en el suyo no llega a éste. A quien no puede decidir se le dice así,
   sin prometerle que alguien lo decide desde otro lado. Ni un peso: lo lee fabricación. */
const esImportada = p => !!p && (p.de_hoja === true || String(p.id || '').startsWith('proy-hoja-'));
const avisoDe = p => (Proy.avisoDeHoja ? Proy.avisoDeHoja(p) : '');
/* El día de una marca, «20 sep 2026», o '' si no lo trae (una marca de un respaldo viejo). */
const diaDe = ms => (ms && isoDeSello(ms) ? fmtFecha(isoDeSello(ms)) : '');
/* Lo que se le dice a quien no puede decidir. «Eso lo decide Dirección», a secas, prometía una
   decisión que desde otro teléfono no llega nunca. */
const LO_DECIDE_DIRECCION = 'Lo decide Dirección entrando con su cuenta en este teléfono: la marca es de este aparato, y lo que se decida en otro no llega aquí.';

function avisoHoja(p, rol) {
  const tipo = avisoDe(p);
  const dir = rol === 'direccion';
  const imp = esImportada(p);
  const boton = (clase, attr, texto) => '<button type="button" class="btn ' + clase + '" ' + attr + '="' + esc(p.id) + '">' + texto + '</button>';
  /* Con la base mandando las marcas salen de comparar contra lo que bajó de la base: lo que «ya no
     está» es un V-### que la base ya no trae, y lo que se pedía hacer en la hoja (borrar una fila,
     marcar su columna) se hace aquí o lo corrige Dirección en la base (auditoría 2026-10-25, TP-3). */
  const base = laBaseManda();
  const F = fuente();
  const FILA = base ? 'folio' : 'fila';
  let txt = '', btns = [];

  if (!tipo) {
    /* La lápida («No se dio») no avisa —ya se decidió—, pero si su fila se había perdido lo
       apartado se quedaba para siempre en Ajustes, y el «No se dio» también rebota: la ficha no
       tenía ni el aviso ni la salida. Una línea callada, sin «Qué atender», con la única salida
       que le sirve: dejarla fuera de la hoja (tira lo apartado a su nota y deja de mandarse; si
       la fila vuelve, se le manda sola con el «No se dio»). Nada se borra. */
    const h = p && p.etapa === 'cancelado' && p.hoja_perdida && typeof p.hoja_perdida === 'object' ? p.hoja_perdida : null;
    if (!h) return '';
    const puede = dir || imp;
    txt = 'Está como «No se dio», y su ' + FILA + ' ' + esc(h.folio || '') + (h.motivo === 'de_otra' ? ' ya es de otra venta' : ' ya no está en ' + F) +
      ': lo que se cambió desde entonces —el «No se dio» incluido— se quedó apartado en este teléfono. ' +
      (puede ? 'Si la ' + FILA + ' se quitó a propósito, déjala fuera de ' + F + ': deja de mandarse, y si su ' + FILA + ' vuelve se le manda sola.'
             : LO_DECIDE_DIRECCION);
    if (puede) btns.push(boton('btn-gho', imp ? 'data-hoja-dejar' : 'data-hoja-fuera', imp ? 'Dejarla' : 'Dejarla fuera de ' + F));
    return '<p class="hintnote">' + ico('i-nube-off') + ' ' + txt + '</p>' +
      (btns.length ? '<div class="btn-fila">' + btns.join('') + '</div>' : '');
  }

  if (tipo === 'doble') {
    /* La venta de aquí en dos filas de la hoja (ver `hoja_doble` en js/datos/proyectos.js). Sin
       botón: cuál sobra se decide en la hoja, que es de Dirección, y este teléfono no borra filas.
       Se dice a cuál manda y de cuál saca el dinero, porque la otra puede ser la de los cobros. */
    const fs = (p.hoja_doble.folios || []).map(String);
    txt = '<b>Esta venta está dos veces en ' + F + '.</b> ' + (base ? 'Los folios ' : 'Las filas ') + esc(fs.join(' y ')) + ' traen la misma venta. ' +
      'Los cambios de este proyecto van a ' + esc(fs[0] || '') + ', y de ella sale su dinero; ' +
      (fs.length > 2 ? 'las otras no reciben' : 'la otra no recibe') + ' nada. No se borró ninguna: ' +
      (base
        ? (dir ? 'cuál sobra se corrige en la base —revisa antes cuál tiene los cobros— y con la siguiente bajada este aviso se va.'
               : 'cuál sobra lo corrige Dirección en la base; con la siguiente bajada este aviso se va.')
        : (dir ? 'en la hoja, borra la que sobra —revisa antes cuál tiene los cobros— y con la siguiente bajada este aviso se va.'
               : 'cuál sobra lo decide Dirección en la hoja; con la siguiente bajada este aviso se va.'));
    return '<p class="hintnote nota-av">' + ico('i-aviso') + ' ' + txt + '</p>';
  }

  if (tipo === 'repetida') {
    const d = p.duplicado_de || {};
    const claves = Array.isArray(d.claves) ? d.claves : [];
    /* 'identidad': la fila solo coincide en el folio de la hoja (ver `mismaVentaQueLaFila`).
       Puede ser la misma venta dos veces, o dos ventas con un folio repartido dos veces; eso
       solo lo sabe quien las conoce, y por eso aquí hay dos botones y no uno. */
    const porConfirmar = claves.includes('identidad');
    const suNombre = d.nombre ? '«' + esc(d.nombre) + '»' : 'otro proyecto de aquí';
    txt = (porConfirmar ? '<b>Esta tarjeta puede repetir una venta de este teléfono.</b>' : '<b>Esta tarjeta repite una venta de este teléfono.</b>') +
      ' Se importó de' + (base ? 'l folio ' : ' la fila ') + esc(d.folio_hoja || p.folio_hoja || '') +
      ' de ' + F + ', que ' + (porConfirmar ? 'parece' : 'es') + ' la misma venta que ' + suNombre +
      (d.folio ? ' (' + esc(Cot.folioVisible(d.folio) || d.folio) + ')' : '') +
      (porConfirmar ? ': o son dos tarjetas para una sola venta, o son dos ventas con el mismo folio de ' + F + '.'
                    : ': dos tarjetas en el tablero para una sola venta.') +
      ' No se juntó sola' + (Array.isArray(d.por) && d.por.length ? ' porque ' + esc(d.por.join('; ')) : '') + '.';
    if (!dir) {
      txt += ' ' + LO_DECIDE_DIRECCION;
    } else if (d.id) {
      if (claves.includes('cancelada') && claves.includes('viva')) {
        /* La de aquí dice «No se dio» y la hoja trae la obra viva. Quitar la copia no es la salida:
           la bajada no ata una fila viva a una lápida, así que la copia volvía sin sus notas, y
           atarla sacaba su saldo del por cobrar de Control (`quitarDelTablero` también se niega).
           Se dice qué dice cada lado y cuáles son las dos salidas de verdad. */
        const est = p.estatus_notion ? ' (estatus ' + esc(p.estatus_notion) +
          (Number(p.pago_pendiente) > 0 ? ', con saldo por cobrar' : '') + ')' : '';
        /* Con la base mandando «márcala en la hoja» ya no se puede (la hoja es de solo lectura): esta
           tarjeta ES la de la base, y su «No se dio» —en «Más detalles»— se guarda allá. */
        txt += (base ? ' La base trae esta obra viva' : ' La hoja trae esta obra viva') + est + ', y ' + suNombre + ' dice que no se dio: hay que decidir cuál de las dos tiene razón. ' +
          (base
            ? 'Si no se dio, márcala «No se dio» aquí (en «Más detalles»): se guarda en la base, y con la siguiente bajada esta copia ya se puede quitar. '
            : 'Si no se dio, márcala «No se dio» también en la hoja (columna «Etapa de obra»); con la siguiente bajada esta copia ya se puede quitar. ') +
          'Si la obra sigue, abre ' + suNombre + ' y regrésala a su etapa: deja de estar como «No se dio» y las dos se pueden juntar.';
      } else if (claves.includes('cancelada')) {
        /* La de aquí es una lápida y la fila también dice «No se dio»: a una venta que no se dio no
           se le pasa una obra, y juntar se niega. La salida es quitar la copia: su fila se queda
           atada a la lápida y la bajada ya no la vuelve a importar (ver `quitarDelTablero`). */
        txt += ' A una venta que no se dio no se le pasa una obra: si esta copia no tiene nada suyo, quítala del tablero. Su ' + FILA + ' se queda con ' +
          suNombre + ' y no se vuelve a importar.';
        btns.push(boton('btn-dgr', 'data-hoja-quitar', 'Quitar esta copia del tablero'));
      } else {
        btns.push(boton('btn-pri', 'data-hoja-juntar', 'Juntar con «' + esc(d.nombre || 'la de aquí') + '»'));
      }
      if (porConfirmar) btns.push(boton('btn-gho', 'data-hoja-noesla', 'No es la misma venta'));
      btns.push('<button type="button" class="btn btn-gho" data-abrir-otro="' + esc(d.id) + '">Abrir «' + esc(d.nombre || 'la de aquí') + '»</button>');
    } else {
      /* Sin botón, y se dice por qué: con dos proyectos de aquí atados a la misma fila no hay
         con cuál juntarla, y quitarla no sirve —su fila la volvería a traer—. */
      txt += ' Mientras haya más de un proyecto de este teléfono atado a ' + (base ? 'ese folio' : 'esa fila') +
        ', no se sabe con cuál juntarla: ' + (base ? 'revisa con Dirección cuál es el bueno.' : 'revisa en la hoja cuál es el bueno.');
    }
  } else if (tipo === 'perdida' && imp) {
    /* Cualquier rol: es una copia de este teléfono, sin cotización ni dinero que decidir. */
    const h = p.hoja_perdida || {};
    const dia = diaDe(h.desde);
    txt = '<b>Esta venta ya no está en ' + F + '.</b> Esta tarjeta se importó de' + (base ? 'l folio ' : ' la fila ') + esc(h.folio || p.folio_hoja || '') +
      ', y ' + F + ' ya no la trae' + (dia ? ' (se vio el ' + esc(dia) + ')' : '') + '. No se quitó sola: ' +
      'si se borró a propósito, quítala del tablero; si la obra sigue, déjala.';
    btns.push(boton('btn-dgr', 'data-hoja-quitar', 'Quitar del tablero'));
    btns.push(boton('btn-gho', 'data-hoja-dejar', 'Dejarla'));
  } else if (tipo === 'perdida') {
    const h = p.hoja_perdida || {};
    const dia = diaDe(h.desde);
    txt = '<b>Esta venta ya no está en ' + F + '.</b> ' + (h.motivo === 'de_otra'
      ? 'Su ' + FILA + ' ' + esc(h.folio || '') + ' ya es de otra venta, y ésta no aparece con su folio.'
      : base ? 'La base ya no trae su folio (' + esc(h.folio || '') + ').' : 'Alguien borró su fila (' + esc(h.folio || '') + ').') +
      (dia ? ' Se vio el ' + esc(dia) + ', y desde entonces' : ' Desde entonces') +
      ' los cambios de este proyecto no llegan a ningún lado: se quedan apartados en este teléfono. ' +
      (dir ? (base ? 'Si la venta sigue viva, vuelve a darla de alta: entra a la base con todos sus datos y un folio nuevo. '
                   : 'Si la venta sigue viva, vuelve a darla de alta: entra a la hoja con todos sus datos en una fila nueva. ') +
             'Si se borró a propósito, déjala fuera: el proyecto se queda aquí y deja de mandarse.'
           : 'Si se vuelve a dar de alta o se queda fuera de ' + F + ' lo decide Dirección, entrando con su cuenta en este teléfono: ' +
             'la marca es de este aparato, y lo que se decida en otro no llega aquí.');
    if (dir) {
      btns.push(boton('btn-pri', 'data-hoja-alta', 'Volver a darla de alta en ' + F));
      btns.push(boton('btn-gho', 'data-hoja-fuera', 'Dejarla fuera de ' + F));
    }
  } else {
    /* 'fuera': ya se decidió. Se dice en voz baja, y con la salida por si cambia la decisión:
       quitar la tarjeta importada (cualquiera) o volver a dar de alta la venta (Dirección). */
    const dia = diaDe(p.fuera_de_hoja);
    const cuando = dia ? ', el ' + esc(dia) : '';
    txt = imp
      ? 'Esta tarjeta se importó de' + (base ? 'l folio ' : ' la fila ') + esc(p.folio_hoja || '') + ', que ya no está en ' + F + '; se decidió dejarla en el tablero' + cuando +
        '. Sus cambios se guardan en este teléfono y se mandan solos si su ' + FILA + ' vuelve a ' + F + '.'
      : 'Esta venta se quedó fuera de ' + F + ' por decisión de Dirección' + cuando +
        '. Sus cambios se guardan en este teléfono y se mandan solos si su ' + FILA + ' vuelve a ' + F + '.';
    if (imp) btns.push(boton('btn-gho', 'data-hoja-quitar', 'Quitar del tablero'));
    else if (dir) btns.push(boton('btn-gho', 'data-hoja-alta', 'Volver a darla de alta en ' + F));
    return '<p class="hintnote">' + ico('i-nube-off') + ' ' + txt + '</p>' +
      (btns.length ? '<div class="btn-fila">' + btns.join('') + '</div>' : '');
  }
  return '<p class="hintnote nota-av">' + ico('i-aviso') + ' ' + txt + '</p>' +
    (btns.length ? '<div class="btn-fila">' + btns.join('') + '</div>' : '');
}

/* Las salidas del aviso. Las que no se deshacen con otro toque —dejarla fuera, dejarla en el
   tablero, quitarla, juntarla, separarlas— preguntan antes y dicen qué va a pasar; la de volver
   a darla de alta no pregunta porque su botón ya dice exactamente eso, y después se manda la
   bandeja para que la persona sepa en el momento si la hoja la recibió. */
async function decisionHoja(que, id, boton) {
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); await cargar(); return; }
  const nombre = p.nombre || p.folio_local || 'este proyecto';
  const d = p.duplicado_de && typeof p.duplicado_de === 'object' ? p.duplicado_de : null;
  /* La pregunta de la app y no el confirm() del navegador: aquel salía gris, sin rojo para lo
     que borra y, en la app instalada del iPhone, con la dirección del sitio encima. Es «el
     momento en que la app deja de parecer una app» (js/cotizador/nucleo.js).

     Cada una con un título corto —la pregunta— y el texto en dos partes que se pueden leer por
     separado: «Qué pasa» y «Qué no se toca». Eran párrafos de seis renglones con las dos cosas
     revueltas, y quien decide con el teléfono en una mano lee el título y el botón. En rojo
     solo lo que borra: quitar la tarjeta y juntar dos (que quita la copia). Dejarla fuera de la
     hoja no borra nada —los cambios que rebotaron se guardan— y en rojo se leía igual de grave. */
  const SI = { fuera: 'Dejarla fuera', dejar: 'Dejarla en el tablero', quitar: 'Quitar del tablero', juntar: 'Juntarlas', noesla: 'Son distintas' };
  const preguntar = (titulo, queOcurre, queNoSeToca) => {
    const promesa = confirmarPf({
      titulo,
      texto: 'Qué pasa: ' + queOcurre + (queNoSeToca ? '\n\nQué no se toca: ' + queNoSeToca : ''),
      si: SI[que] || 'Seguir', no: 'Cancelar', peligro: que === 'quitar' || que === 'juntar' });
    /* P1 · «Quitar del tablero» se confirma manteniendo presionado (pieza 5). De las cinco
       preguntas de aquí es la única que BORRA algo de este teléfono sin más, y con dos botones del
       mismo tamaño se veía igual que «Dejarla». Solo en ésa: poner el gesto en las cinco lo
       convertiría en el trámite de siempre y dejaría de decir nada. */
    return que === 'quitar' ? conMantenerPresionado(promesa) : promesa;
  };
  const otra = (d && d.nombre) || 'la de este teléfono';
  const fila = (d && d.folio_hoja) || p.folio_hoja || '';
  const bitacora = ' Queda anotado en la bitácora.';
  /* Las mismas palabras que el aviso (`avisoHoja`): con la base mandando, «la base» y su folio. */
  const F = fuente();
  const FILA = laBaseManda() ? 'folio' : 'fila';
  /* Lo que nombra una tarjeta la hace imposible de quitar: lo dice `quitarDelTablero`, y se avisa
     aquí para que nadie apriete un botón rojo esperando algo que la capa de datos va a negar. */
  const nombrada = 'Si algo de este teléfono la nombra —una instalación, un movimiento del almacén, material calculado— no se quita.';

  if (que === 'fuera') {
    /* Lo que rebotó no se tira: `dejarFueraDeLaHoja` lo anota en el proyecto (`sin_mandar`) y
       viaja con lo demás si la fila vuelve. Una lápida no tiene «Volver a darla de alta». */
    if (!await preguntar('¿Dejar «' + nombre + '» fuera de ' + F + '?',
      'el proyecto se queda en este teléfono y deja de mandarse a ' + F + '.' +
        (p.etapa === 'cancelado' ? '' : ' Si después cambias de idea, en su ficha está «Volver a darla de alta en ' + F + '».'),
      'los cambios que rebotaron contra su ' + FILA + ' no se tiran: se guardan en este teléfono y, si su ' + FILA + ' vuelve a ' + F + ', se mandan solos, con lo de ese día.')) return;
  } else if (que === 'dejar') {
    /* «Vuelve a mandarse sola» es cierto desde que el relevo anota lo que no manda (`sin_mandar`),
       `dejarFueraDeLaHoja` anota ahí también lo que ya había rebotado, y la bajada lo manda
       cuando la fila vuelve; antes lo cambiado mientras tanto, y lo que rebotó, se perdía. */
    if (!await preguntar('¿Dejar «' + nombre + '» en el tablero aunque ' + F + ' ya no la tenga?',
      'no se vuelve a preguntar por ella, y sus cambios ya no se mandan a ' + F + '.',
      'nada se borra. Si su ' + FILA + ' vuelve a ' + F + ', vuelve a mandarse sola, con lo que hayas cambiado mientras tanto y lo que ya había rebotado.')) return;
  } else if (que === 'quitar') {
    if (!await preguntar(d ? '¿Quitar esta copia de «' + nombre + '» del tablero?' : '¿Quitar «' + nombre + '» del tablero?',
      d ? 'se borra de este teléfono la copia importada de' + (FILA === 'folio' ? 'l folio ' : ' la fila ') + fila + ', que repite «' + otra + '»; la siguiente bajada ya no la vuelve a importar.'
        : 'es una tarjeta importada de ' + F + (FILA === 'folio' ? ' cuyo folio' : ' cuya fila') + ' ya no está, y se borra de este teléfono.',
      (d ? F + ', y su ' + FILA + ' se queda con «' + otra + '». ' : F + '. ') + nombrada + bitacora)) return;
  } else if (que === 'juntar') {
    /* Lo que de verdad hace `juntar`: las notas se suman; el pin, el plazo y los datos de la venta
       (dirección, teléfono, entrecalles…) pasan solo si la de aquí no tiene los suyos. Prometer
       «su ubicación pasa» cuando la de aquí ya tenía una era mentira: se quedaba la de aquí y la
       de la copia se borraba con ella. Cuáles datos son, lo dice el porqué de arriba. */
    const porConfirmar = !!(d && Array.isArray(d.claves) && d.claves.includes('identidad'));
    if (!await preguntar('¿Juntar esta tarjeta con «' + otra + '»?',
      (d && Array.isArray(d.por) && d.por.length ? 'no se juntó sola porque ' + d.por.join('; ') + '. ' : '') +
        'las notas de la copia se suman a las de «' + otra + '». Su ubicación, su plazo y sus datos (dirección, teléfono del cliente, entrecalles, compromiso…) ' +
        'pasan solo si «' + otra + '» no tiene los suyos; si los tiene, se quedan los de «' + otra + '». ' +
        'Sus instalaciones y movimientos del almacén pasan también, y esta copia se quita del tablero.' +
        (porConfirmar ? ' Y ' + (FILA === 'folio' ? 'el folio ' : 'la fila ') + fila + ' queda como de «' + otra + '»: desde la siguiente bajada, su dinero es el de «' + otra + '».' : ''),
      'la etapa —moverla descuenta material, y eso lo haces tú—.' + bitacora)) return;
  } else if (que === 'noesla') {
    if (!await preguntar('¿«' + nombre + '» y «' + otra + '» son dos ventas distintas?',
      'esta tarjeta se queda en el tablero como la de su venta, con su ' + FILA + ' ' + fila + ', y no se vuelve a preguntar. «' + otra +
        '» se queda sin ' + FILA + ' en ' + F + ' —' + (FILA === 'folio' ? 'el ' : 'la ') + fila + ' es de esta otra venta— y deja de mandarle cambios: en su ficha decides si se vuelve a dar de alta o se queda fuera.',
      'ninguna de las dos se borra.' + bitacora)) return;
  }

  if (boton) boton.disabled = true;
  /* Lo que la copia tiene esperando en la bandeja sale antes de juntarla: `juntarConLaDeAqui` no
     junta una copia con cambios sin mandar (se tirarían con ella). Sin señal, se queda y lo dice. */
  if (que === 'juntar' && Sync.configurado()) {
    try { await Sync.bombear(); } catch (_) { /* se queda en la bandeja; la junta explica qué falta */ }
  }
  const r = que === 'alta' ? await Proy.volverADarDeAlta(id)
    : que === 'fuera' || que === 'dejar' ? await Proy.dejarFueraDeLaHoja(id)
    : que === 'quitar' ? await Proy.quitarDelTablero(id)
    : que === 'noesla' ? await Proy.noEsLaMisma(id)
    : await Proy.juntarConLaDeAqui(id);
  if (boton && boton.isConnected) boton.disabled = false;
  if (!r.ok) { avisarResultado(r); return; }

  if (que === 'alta') {
    /* Se manda en el momento, y se dice lo que de verdad pasó: con la fila nueva ya guardada,
       o esperando en la bandeja porque no hubo señal. */
    let enHoja = false;
    if (Sync.configurado()) {
      try { await Sync.bombear(); } catch (_) { /* se queda en la bandeja y sale sola */ }
      const ya = await Proy.obtener(id);
      enHoja = !!(ya && ya.notion_page_id);
    }
    toast(enHoja ? '«' + nombre + '» ya está otra vez en ' + F + ', con todos sus datos.'
                 : '«' + nombre + '» quedó en la bandeja para darse de alta en ' + F + ': sale sola en cuanto se pueda mandar.', 'ok', 5200);
  } else if (que === 'quitar' || que === 'juntar') {
    toast(que === 'quitar' ? '«' + nombre + '» se quitó del tablero' : 'Se juntaron: queda una sola tarjeta de esta venta', 'ok', 4200);
    cerrarCapa('pf-ficha'); fichaId = null;
    await cargar();
    if (que === 'juntar' && d && d.id) await abrirFicha(d.id);
    return;
  } else if (que === 'noesla') {
    toast('«' + nombre + '» se queda como su propia venta; «' + otra + '» quedó sin ' + FILA + ' en ' + F, 'ok', 5200);
  } else {
    toast(que === 'fuera' ? '«' + nombre + '» se queda fuera de ' + F : '«' + nombre + '» se queda en el tablero', 'ok', 4200);
  }
  await cargar();
  await refrescarFicha();
}

/* ----- El «Sí» de una pregunta que borra, bajo el dedo -----
   `confirmarPf()` reusa el mismo `#pf-confirma-si` en todas las preguntas de la app, así que la
   pieza 5 se le pone JUSTO para esta pregunta y se le quita al terminar, pase lo que pase: si
   se quedara puesta, la siguiente pregunta —que reescribe el rótulo del botón con
   `textContent`— dejaría el marcado de la pieza a medias y su guardia seguiría comiéndose el
   clic. El botón quedaría muerto, y el síntoma («el diálogo no responde») no se parece en nada
   a la causa.

   Al completarse el gesto se suelta la pieza y se toca el botón: sin `data-mantener` encima, el
   clic llega al oyente delegado de `confirmarPf` y la promesa se resuelve por el camino de
   siempre. Ni una copia de su lógica de cierre. */
function conMantenerPresionado(promesa) {
  const piezas = P();
  const si = $('pf-confirma-si');
  if (!piezas || !piezas.mantener || !si) return promesa;
  piezas.mantener(si, {
    tono: 'mal', ms: 1200,
    pista: 'Mantén presionado para quitarla',
    otraVez: 'Otra vez para quitarla',
    alConfirmar: () => { piezas.mantener.quitar(si); si.click(); },
  });
  const soltarla = () => { try { piezas.mantener.quitar(si); } catch (_) {} };
  return promesa.then(v => { soltarla(); return v; }, e => { soltarla(); throw e; });
}

/* El link crudo de Maps primero, y es una decisión: es el que el cliente mandó y trae el
   pin donde el cliente lo puso. Un `search?query=` con el texto de una dirección de
   Tlajomulco cae a media colonia, y ahí es donde la camioneta da vueltas. */
/* Solo http y https, como `linkMapa` de js/mod/fabricacion.js para el mismo campo: `maps_url`
   es lo que alguien pegó a mano en el cotizador, o lo que trajo un respaldo que viajó por
   WhatsApp, y un `javascript:` ahí se ejecuta al tocar «Abrir en Maps» —`esc()` no lo para,
   un href es un contexto de URL y no de HTML—. Devuelve '' cuando no hay con qué armar una
   liga, y entonces el botón no se pinta. */
function urlMapa(p) {
  if (/^https?:\/\//i.test(String(p.maps_url || ''))) return String(p.maps_url);
  if (tienePin(p)) {
    return 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng;
  }
  const dir = String(p.dir_texto || '').replace(/\s+/g, ' ').trim();
  return dir ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(dir) : '';
}
/* Con respaldo, como en js/mod/mapa.js: un js/datos/proyectos.js viejo ya cargado en la pestaña
   puede no exportarla todavía. Es la misma prueba. */
const tienePin = Proy.tienePin || (p => {
  const c = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
  const la = c(p && p.lat), ln = c(p && p.lng);
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
});

async function clicFicha(ev) {
  const t = ev.target;
  if (t.closest('[data-cerrar-ficha]')) { cerrarCapa('pf-ficha'); fichaId = null; return; }

  const hoja = t.closest('[data-hoja]');
  if (hoja) { await abrirHoja(hoja.dataset.hoja); return; }

  const mover = t.closest('[data-mover]');
  if (mover) { await moverEtapa(fichaId, mover.dataset.mover); return; }

  const est = t.closest('[data-estatus]');
  if (est) { await cambiarDinero(fichaId, 'estatus_notion', est.dataset.estatus, est); return; }

  const cta = t.closest('[data-cuenta]');
  if (cta) { await cambiarDinero(fichaId, 'cuenta', cta.dataset.cuenta, cta); return; }

  /* La entrega: sin grupo, así que `parchar` repinta la ficha entera (cambia el rótulo de la
     fecha y el bloque de la dirección). */
  const ent = t.closest('[data-entrega]');
  if (ent) {
    if (ent.getAttribute('aria-pressed') === 'true') return;
    await parchar(fichaId, { entrega: ent.dataset.entrega }, 'Entrega: ' + (ENTREGA_NOMBRE[ent.dataset.entrega] || ent.dataset.entrega));
    return;
  }


  const ir = t.closest('[data-ir-ruta]');
  if (ir) {
    const ruta = ir.dataset.irRuta;
    cerrarCapa('pf-ficha'); fichaId = null;
    /* El mismo cuidado que «Acomodar en la lámina», abajo: cerrar la ficha consume su entrada de
       historial con un `history.back()` ASÍNCRONO, y navegar en el mismo tick se pierde. */
    await new Promise(res => {
      const fin = () => { clearTimeout(t); window.removeEventListener('popstate', fin); res(); };
      const t = setTimeout(fin, 400);
      window.addEventListener('popstate', fin);
    });
    if (CTX && CTX.ir) CTX.ir(ruta);
    return;
  }

  const anid = t.closest('[data-anidar]');
  if (anid) {
    const p = await Proy.obtener(anid.dataset.anidar);
    cerrarCapa('pf-ficha'); fichaId = null;
    /* Cerrar la ficha consume su entrada de historial con un `history.back()` ASÍNCRONO: navegar
       en el mismo tick aterriza en la entrada de abajo y el atrás lo devuelve a Proyectos. Se
       espera a su `popstate`, con techo, como «Ver almacén» del Tablero y `montarDeVerdad`. */
    await new Promise(res => {
      const fin = () => { clearTimeout(t); window.removeEventListener('popstate', fin); res(); };
      const t = setTimeout(fin, 400);
      window.addEventListener('popstate', fin);
    });
    /* El Tablero recibe el pase, abre su mesa de corte y dice de qué proyecto se viene. */
    if (p && CTX && CTX.pasar) CTX.pasar('hoy', { vista: 'anidador', proyecto_id: p.id,
      nombre: p.nombre || '', folio: p.folio_local || '' });
    return;
  }

  const tsv = t.closest('[data-tsv]');
  if (tsv) { await copiarFila(tsv.dataset.tsv); return; }

  const re = t.closest('[data-resinc]');
  if (re) { await resincronizar(re.dataset.resinc, re); return; }

  const ok = t.closest('[data-huella-ok]');
  if (ok) {
    HUELLA_IGNORADA.add(ok.dataset.huellaOk);
    toast('Se queda como está. El aviso vuelve si recargas: ' +
      (conMaterial() ? 'el material sigue siendo el de la versión anterior.' : 'la ficha sigue siendo la de la versión anterior.'), '', 5200);
    await refrescarFicha();
    pintarLista();
    publicarCuenta();
    return;
  }

  /* «Ocultar del taller» y «Volver a mostrar en el taller» (T1-9). */
  const oc = t.closest('[data-ocultar-taller],[data-mostrar-taller]');
  if (oc) {
    const ocultar = oc.hasAttribute('data-ocultar-taller');
    await ocultarDelTaller(ocultar ? oc.dataset.ocultarTaller : oc.dataset.mostrarTaller, ocultar);
    return;
  }

  /* Las salidas del aviso de la hoja (ver `avisoHoja`). */
  const hj = t.closest('[data-hoja-alta],[data-hoja-fuera],[data-hoja-quitar],[data-hoja-dejar],[data-hoja-juntar],[data-hoja-noesla]');
  if (hj) {
    const que = ['alta', 'fuera', 'quitar', 'dejar', 'juntar', 'noesla'].find(q => hj.hasAttribute('data-hoja-' + q));
    await decisionHoja(que, hj.getAttribute('data-hoja-' + que), hj);
    return;
  }
  const otro = t.closest('[data-abrir-otro]');
  if (otro) { cerrarCapa('pf-ficha'); fichaId = null; await abrirFicha(otro.dataset.abrirOtro); return; }

  const canc = t.closest('[data-cancelar]');
  if (canc) {
    const p = await Proy.obtener(canc.dataset.cancelar);
    cerrarCapa('pf-ficha'); fichaId = null;
    /* Por id, no por folio: el proyecto ya existe y su cotización pudo desaparecer del
       historial —un respaldo viejo restaurado— y entonces el folio no encuentra nada. */
    if (p) pedirDescarte(p.id, p.folio_local || '', p.nombre || '');
    return;
  }
}

/* ----- «Ocultar del taller» (auditoría 2026-10-26, T1-9) -----
   Una pregunta de un paso que dice qué pasa y qué NO pasa —el dinero—, porque ocultar es para todo
   el equipo y no solo para este teléfono: se guarda en el proyecto (`oculto_taller`, con su sello)
   y la bandeja lo sube a la base (`proyecto_actualizar`), que deja la línea en la bitácora. Volver a
   mostrarla es el mismo camino al revés, con su propia pregunta. Las dos guardas se repiten aquí
   aunque el botón ya no salga sin ellas: un toque viejo de una ficha pintada antes de un cambio de
   rol no debe escribir. */
async function ocultarDelTaller(id, ocultar) {
  if (!id) return;
  if (Prefs.rol() !== 'direccion' || !laBaseManda()) {
    toast('Ocultar del taller es de Dirección, con la base mandando.', 'err', 4200);
    return;
  }
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); return; }
  if (ocultoDelTaller(p) === ocultar) { await refrescarFicha(); return; }   // otro teléfono ya lo hizo
  const nombre = p.nombre || p.folio_local || 'este proyecto';
  const ok = await confirmarPf(ocultar
    ? { titulo: '¿Ocultar «' + nombre + '» del taller?',
        texto: 'Deja de salir en «El taller» del Tablero —en su estación o en «Instalado, por cobrar»—, en la cuenta de arriba, en los avisos y en «Lo que viene» del Calendario. Es para todo el equipo, no solo para este teléfono.\n\n' +
          'El dinero no cambia: su estatus de cobro, su saldo y sus comisiones siguen igual, y Control la sigue contando.\n\n' +
          'Aquí en Proyectos sigue, con la marca «Oculto del taller», para volver a mostrarla cuando quieras.',
        si: 'Ocultar del taller', no: 'Cancelar' }
    : { titulo: '¿Volver a mostrar «' + nombre + '» en el taller?',
        texto: 'Vuelve a salir en «El taller» del Tablero, en sus avisos y en «Lo que viene» del Calendario, para todo el equipo. El dinero no cambia.',
        si: 'Volver a mostrar', no: 'Cancelar' });
  if (!ok) return;
  await parchar(id, { oculto_taller: ocultar },
    ocultar ? '«' + nombre + '» se ocultó del taller' : '«' + nombre + '» vuelve a salir en el taller');
}

async function refrescarFicha() {
  if (!fichaId) return;
  const p = await Proy.obtener(fichaId);
  const capa = $('pf-ficha');
  if (!p || !capa) return;
  repintarEnSitio(capa, htmlFicha(p));   // sin volver arriba ni perder el foco en cada toque
  cablearFicha();
}

/* ============================================================================
   P2 · La ficha guarda EN SU SITIO
   ============================================================================
   Tocar una cuenta de cobro o un estatus reescribía el panel completo: `.pf-panel-b` volvía
   arriba del todo, el foco se caía al <body> y la única confirmación era un aviso que sale
   fuera de la ficha, arriba, donde no estaba mirando el dedo. En una ficha larga —la de un
   proyecto importado con su aviso de hoja— eso era perder el sitio por marcar un chip.

   Ahora el toque parcha SOLO su grupo: se apaga el que estaba, se enciende el tocado, se
   dibuja su palomita (pieza 6) y se reescribe el renglón espejo de arriba («Estatus en la hoja
   (dinero)», «Cuenta de cobro»), que es el único otro sitio de la ficha donde vive ese dato.
   La lista de atrás SÍ se recarga —el semáforo y las cuentas dependen de esto— y eso no se ve,
   porque está debajo de la capa abierta.

   Si `Proy.actualizar` falla, el chip vuelve a donde estaba: `avisarResultado` ya dice por qué,
   y un chip encendido sobre un guardado que no ocurrió es la peor de las dos mentiras. */
async function parchar(id, campos, msgOk, boton) {
  if (!id) return false;
  const grupo = boton && boton.closest ? boton.closest('[data-grupo]') : null;
  const antes = grupo ? grupo.querySelector('.on') : null;
  if (grupo) parcharGrupo(grupo, boton, campos);

  const r = await Proy.actualizar(id, campos);
  if (!avisarResultado(r, msgOk)) {
    if (grupo) parcharGrupo(grupo, antes, null);
    return false;
  }
  await cargar();
  /* Sin `refrescarFicha()`: el parche ya dejó la ficha diciendo la verdad, y repintarla entera
     es justo lo que esta ficha viene a quitar. */
  if (!grupo) await refrescarFicha();
  return true;
}

/* ----- La cuenta y el estatus con la base mandando (auditoría 2026-10-25, TP-1) -----
   Con la hoja, un chip de la ficha guardaba en este teléfono y el puente lo subía: lo de siempre,
   sin pregunta. Con la base mandando ese mismo toque CORRIGE LA VENTA en la base para todos los
   teléfonos (la bandeja lo manda a `corregir_venta`), y la cuenta decide el «Disponible» de Control,
   si la venta sale en Facturas y —hasta que se liquida— si lleva IVA (la regla de la base:
   `interno.normalizar_iva`, IVA salvo en Elias BBVA). «Datos de la venta» pregunta eso en rojo y
   diciendo de cuánto a cuánto; aquí eran cinco chips pegados dentro de una hoja que se desliza,
   y un roce cambiaba la cuenta. Ahora pregunta lo mismo, y el aviso trae «Deshacer». */
async function cambiarDinero(id, campo, valor, boton) {
  if (!id) return;
  const msgHoja = campo === 'cuenta' ? 'Cuenta guardada' : 'Estatus de la hoja guardado';
  if (!laBaseManda()) { await parchar(id, { [campo]: valor }, msgHoja, boton); return; }

  if (boton && boton.getAttribute('aria-pressed') === 'true') return;   // ya es ése: nada que corregir
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); return; }
  const antes = String(p[campo] || '');
  const nombre = p.nombre || p.folio_local || 'este proyecto';
  const v = folioVenta(p);
  const que = campo === 'cuenta' ? 'la cuenta' : 'el estatus de cobro';

  let texto = 'Pasa de ' + (antes || 'sin capturar') + ' a ' + valor + '.';
  let peligro = false;
  if (campo === 'cuenta') {
    texto += '\n\nLa cuenta dice a dónde entró el dinero de esta venta: cambia el «Disponible» de Control' +
      (esFiscal(antes) !== esFiscal(valor) ? (esFiscal(valor) ? ' y la venta pasa a Facturas' : ' y la venta sale de Facturas') : '') + '.';
    /* El IVA lo pone la cuenta mientras la venta no esté liquidada (la regla de la base). */
    const liquidada = String(p.estatus_notion || '').toUpperCase() === 'LIQUIDADO';
    const conIva = valor !== 'Elias BBVA', teniaIva = p.iva !== false;
    const total = num(p.precio_auth || p.neto);
    if (!liquidada && antes && conIva !== teniaIva && total > 0) {
      const sub = teniaIva ? total / 1.16 : total;
      texto += '\n\nCon ' + valor + ' la venta ' + (conIva ? 'lleva' : 'ya no lleva') + ' IVA: el total pasa de ' +
        money(total) + ' a ' + money(conIva ? sub * 1.16 : sub) + '.';
      peligro = true;
    }
  } else if (String(valor).toUpperCase() === 'LIQUIDADO' || String(antes).toUpperCase() === 'LIQUIDADO') {
    texto += '\n\nLIQUIDADO es lo que dice que la venta ya se cobró completa: cambia lo que Control cuenta por cobrar y las comisiones que se pueden pagar.';
    peligro = true;
  }
  texto += '\n\nSe corrige en la base' + (v ? ' (' + v + ')' : '') + ' para todos los teléfonos y queda en la bitácora.';

  const ok = await confirmarPf({
    titulo: '¿Cambiar ' + que + ' de «' + nombre + '»?',
    texto, si: campo === 'cuenta' ? 'Cambiar la cuenta' : 'Cambiar el estatus', no: 'Dejarla como está', peligro });
  if (!ok) return;

  const msg = (campo === 'cuenta' ? 'Cuenta: ' : 'Estatus de cobro: ') + valor + ' · sube a la base';
  const guardado = await parchar(id, { [campo]: valor }, null, boton);
  if (!guardado) return;
  /* «Deshacer» vuelve a lo de antes por el mismo camino (otra corrección, sin pregunta: es la que
     se acaba de hacer al revés). Sin valor de antes no hay chip al que volver. */
  toast(msg, 'ok', 8000, antes ? { label: 'Deshacer', fn: async () => {
    const capa = $('pf-ficha');
    const chip = capa && fichaId === id
      ? [...capa.querySelectorAll(campo === 'cuenta' ? '[data-cuenta]' : '[data-estatus]')]
          .find(b => (campo === 'cuenta' ? b.dataset.cuenta : b.dataset.estatus) === antes) || null
      : null;
    await parchar(id, { [campo]: antes }, 'Se regresó a ' + antes, chip);
  } } : null);
}

function parcharGrupo(grupo, elegido, campos) {
  for (const b of grupo.querySelectorAll('button')) {
    const on = b === elegido;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const piezas = P();
  /* La palomita se DIBUJA solo en el que se acaba de elegir: las demás nacieron pintadas con el
     resto de la ficha y volver a trazarlas todas en cada toque le quitaría el significado. */
  if (elegido && piezas && piezas.dibujar) piezas.dibujar(elegido);
  if (!campos) return;

  /* El espejo de arriba. Se reescribe con el mismo marcado que `htmlFicha` para que la ficha
     repintada y la parchada se vean iguales; si no existiera el renglón (otro rol), no pasa
     nada. */
  const capa = $('pf-ficha'); if (!capa) return;
  const valor = campos.estatus_notion !== undefined ? campos.estatus_notion : campos.cuenta;
  const cual = campos.estatus_notion !== undefined ? 'estatus' : 'cuenta';
  const dd = capa.querySelector('[data-marca="' + cual + '"] dd');
  if (!dd) return;
  dd.innerHTML = valor
    ? (cual === 'estatus' ? '<span class="pf-sem nada">' + esc(valor) + '</span>' : esc(valor))
    : '<span class="pf-sem falta">Sin capturar</span>';
}

async function moverEtapa(id, etapa) {
  if (!id) return;
  /* Regresar una etapa no es lo mismo que avanzarla, y el segmento las ofrece igual: de
     «instalado» a «ganado» era un toque sin pregunta. Y si vuelve a cruzar «cortado», el
     material NO sale otra vez —los requerimientos ya están consumidos— así que el almacén se
     queda como estaba y nadie lo dice. Aquí se dice, y se pregunta. */
  const actual = await Proy.obtener(id);
  const de = actual ? Proy.ORDEN[actual.etapa] : undefined, a = Proy.ORDEN[etapa];
  if (actual && de !== undefined && a !== undefined && a < de) {
    /* Lo del almacén, solo con Material encendido: en mantenimiento no salió nada al cortar (T1-7). */
    const cruzaCorte = conMaterial() && de >= Proy.ORDEN.cortado && a < Proy.ORDEN.cortado;
    const ok = await confirmarPf({
      titulo: '¿Regresar «' + (actual.nombre || actual.folio_local) + '» a ' + (Proy.ETAPA_NOMBRE[etapa] || etapa) + '?',
      texto: 'Está en ' + (Proy.ETAPA_NOMBRE[actual.etapa] || actual.etapa) + '.' +
        (cruzaCorte ? '\n\nEl material que salió al cortar NO regresa al almacén, y al volver a cortar no se descuenta otra vez. Si de verdad no se cortó, corrige el almacén con un conteo.' : '') +
        '\n\nQueda anotado en la bitácora con tu nombre.',
      si: 'Regresar la etapa', no: 'Dejarla como está', peligro: true });
    if (!ok) return;
  } else if (conMaterial() && actual && de !== undefined && a !== undefined &&
             a >= Proy.ORDEN.cortado && de < Proy.ORDEN.cortado) {
    /* Con Material en mantenimiento no se pregunta: lo que la pregunta protegía —sacar el material del
       almacén, lo único que no se deshace solo— no pasa (la capa de datos no saca nada), y avanzar una
       etapa sin almacén es como cualquier otro avance (auditoría 2026-10-26, T1-7). */
    /* AVANZAR hasta cruzar «Cortado» también pregunta, y esto es nuevo: el Tablero ya lo hacía
       («¿Ya se cortó?», en `abrirPide()`) y la ficha no, así que el mismo hecho —sacar el
       material del almacén, la única escritura de esta pantalla que no se deshace sola— se
       contestaba de dos maneras según por dónde entraras. Y con el arrastre del tablero (P9)
       cruzarlo pasó a ser un gesto de un segundo: sin pregunta, de más. */
    const ok = await confirmarPf({
      titulo: '¿Ya se cortó «' + (actual.nombre || actual.folio_local) + '»?',
      texto: 'Al marcar «' + (Proy.ETAPA_NOMBRE[etapa] || etapa) + '» salen del almacén los ' +
        'materiales de este proyecto, una sola vez y a nombre de ' + Prefs.sello() + '.' +
        '\n\nEs lo único de esta pantalla que no se deshace solo.',
      si: 'Sí, ya se cortó', no: 'Todavía no' });
    if (!ok) return;
  }
  const r = await Proy.avanzarEtapa(id, etapa);
  if (!r.ok) { avisarResultado(r); return; }
  /* «Instalado» es el mismo hecho que la instalación «hecha», y se apunta entero, igual que
     el «Ya se instaló» del Tablero: con la instalación en «confirmada», el Tablero seguía
     contándola en «Ya pasaron y nadie las marcó». */
  if (etapa === 'instalado') {
    const [viva] = await Agenda.listar({ proyecto_id: id, vivas: true });
    if (viva && viva.estado !== 'hecha') await Agenda.marcar(viva.id, 'hecha');
  }

  /* Los movimientos de material se dicen en voz alta. Pasar a «Cortado» mueve el almacén,
     y un almacén que cambió sin que nadie se enterara es un almacén al que en tres semanas
     ya nadie le cree. */
  const n = num(r.valor && r.valor.movimientos);
  const nombre = Proy.ETAPA_NOMBRE[etapa] || etapa;
  /* Con Material en mantenimiento no sale nada (n es 0) y tampoco se dice «no se descontó nada del
     almacén»: sería hablar de un almacén apagado. Ni «Ver almacén», que llevaba a esa pantalla (T1-7). */
  if (n > 0) {
    toast('Ahora está en «' + nombre + '». ' +
      (n === 1 ? 'Salió 1 material del almacén' : 'Salieron ' + n + ' materiales del almacén') +
      ', a nombre de ' + Prefs.sello() + '.', 'ok', 6000,
      conMaterial() ? { label: 'Ver almacén', fn: () => { if (CTX && CTX.ir) CTX.ir('material'); } } : null);
  } else if (conMaterial() && (etapa === 'cortado' || etapa === 'armado' || etapa === 'listo')) {
    toast('Ahora está en «' + nombre + '». No se descontó nada del almacén: o ya había salido, o ' +
      'este proyecto no tiene material calculado.', '', 5200);
  } else {
    toast('Ahora está en «' + nombre + '»', 'ok', 2600);
  }
  /* La tarjeta tiene que viajar a su columna nueva (P8). Se apunta y se cobra al cerrar la
     ficha: con la capa abierta, el velo entra en la captura de la transición. Si la etapa se
     movió arrastrando en el tablero, no hay capa y el viaje sale en este mismo `cargar()`. */
  _viaje = id;
  /* En el teléfono cada etapa es una página: la tarjeta que se movió ya no está en la que se
     estaba mirando, y quedarse ahí era ver desaparecer un proyecto. La lista se repinta en la
     página de su etapa nueva. */
  if (enPaginas()) filtro.etapa = etapa;
  await cargar();
  await refrescarFicha();
}

async function resincronizar(id, boton) {
  if (boton) boton.disabled = true;
  const r = await Proy.resincronizar(id);
  if (boton) boton.disabled = false;
  if (!r.ok) { avisarResultado(r); return; }
  const l = num(r.valor && r.valor.lineas);
  /* Sin contar líneas de material con Material en mantenimiento (T1-7). */
  toast(conMaterial()
    ? 'Recalculado con la cotización de hoy: ' + l + (l === 1 ? ' línea de material' : ' líneas de material') + '.'
    : 'Quedó con la cotización de hoy.', 'ok', 5200);
  HUELLA_IGNORADA.delete(id);
  await cargar();
  await refrescarFicha();
}

/* ============================================================================
   LOS DATOS PARA LA HOJA — el mismo respaldo que copia el cotizador

   Esto armaba quince valores en el orden del CSV de Ventas de Notion. Notion ya no existe y
   esa fila no se puede pegar en la hoja: entre las columnas que se capturan hay columnas de
   FÓRMULA —Precio neto, Saldo por cobrar, Comisión, Antigüedad— y pegar encima de un
   ARRAYFORMULA no escribe la venta, rompe la columna para las trescientas filas.

   Lo que sí se puede pegar de un tirón son las seis seguidas que la hoja captura: Proyecto,
   Cuenta, Estatus, Tipo de trabajo, IVA y Subtotal (B a G). El anticipo y la fecha viven dos
   columnas más allá, con «Precio neto» en medio, así que se capturan a mano — o se usa el
   puente, que es el camino bueno y no pide pegar nada.

   Sigue siendo una RÉPLICA de `copiarDatosVenta()` del cotizador, y tiene que seguir
   siéndolo: si divergieran, el mismo proyecto produciría dos renglones distintos según
   desde dónde se copie, y alguien pegaría los dos.
   ============================================================================ */

/**
 * Las seis columnas seguidas que la pestaña Ventas captura, en su orden (B a G).
 *
 * El nombre va como `Contacto - Negocio`, SIN el paréntesis con la pieza. El nombre
 * derivado de la plataforma sí lo lleva —«Ale - Parentesis (Caja Luz)» se reconoce en una
 * lista de doscientos— pero la celda de la hoja tiene que quedar igual que la que pega el
 * cotizador, o la misma venta aparece dos veces con dos nombres.
 */
function filaTsv(p) {
  /* Sin estatus capturado se usa FABRICACION, que es el que el modal del cotizador deja
     puesto. Es la única forma de que los dos renglones coincidan cuando nadie tocó el campo. */
  const estatus = String(p.estatus_notion || 'FABRICACION');
  /* La cuenta NO se rellena con una de las cinco: inventar de dónde se va a cobrar es peor
     que dejar la celda vacía, y la celda vacía se ve al pegar. */
  const cuenta = String(p.cuenta || '');
  const proyecto = (p.contacto ? p.contacto + ' - ' : '') + String(p.negocio || '');
  /* El tipo de trabajo se deja vacío a propósito: la hoja lo clasifica sola desde el nombre
     del proyecto, y el puente tampoco lo manda. Tres versiones de la misma regla es como se
     consigue que los tres digan cosas distintas. */
  return [proyecto, cuenta, estatus, '', p.iva !== false ? 'Sí' : 'No', num(p.sub)].join('\t');
}

async function copiarFila(id) {
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); return; }
  /* Con la base mandando se niega aunque el botón haya llegado a pintarse (una ficha abierta antes
     de que el teléfono se enterara del modo): la venta va a la base sola, y pegarla en la hoja la
     daría de alta donde nadie la lee (auditoría 2026-10-25, TR-1). */
  if (laBaseManda()) {
    toast('La venta va a la base sola y ahí recibe su folio: no se copia a la hoja.', '', 6000);
    return;
  }
  /* La misma guarda que el pie de la ficha, aquí también: si el botón llegó a pintarse —una
     ficha abierta antes de que bajara el renglón— copiar seguiría mandando a duplicarla. */
  if (p.notion_page_id) {
    toast('Esta venta ya está en la hoja: no hay que pegarla otra vez. Cambia su estatus en la ficha y el puente lo sube.', '', 6000);
    return;
  }
  const faltan = [];
  if (!p.cuenta) faltan.push('la cuenta');
  if (!p.estatus_notion) faltan.push('el estatus');
  copiarTexto(filaTsv(p), faltan.length
    ? 'Datos copiados. Ojo: sin ' + faltan.join(' ni ') + ', esa celda va vacía.'
    : 'Datos copiados — pégalos en la columna Proyecto del primer renglón vacío de Ventas');
}

/* ============================================================================
   LA ORDEN DE TRABAJO — 'pf-hoja'
   ============================================================================ */

async function abrirHoja(id) {
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); return; }
  /* Se relee el requerimiento en vez de usar el del mapa: entre que se pintó la lista y
     que fabricación abre la orden pudo entrar un recálculo, y la hoja que se imprime no
     puede ser la vieja. */
  const reqs = conMaterial() ? await Material.requerimientos(id) : [];
  REQS.set(id, reqs);
  const capa = $('pf-hoja'); if (!capa) return;
  capa.innerHTML = htmlHoja(p, reqs);
  abrirCapa('pf-hoja', { hist: true });
}

function htmlHoja(p, reqs) {
  const inst = FECHA.get(p.id) || null;
  const items = (p.origen && Array.isArray(p.origen.items)) ? p.origen.items : [];

  const cab = '<dl class="pf-2col">' +
    dato('Cliente', (p.contacto || '') + (p.negocio ? ' — ' + p.negocio : '') || '—') +
    dato('Folio', p.folio_local || Cot.folioVisible(p.folio_global)) +
    dato(ENTREGA_FECHA[entregaDe(p)].replace(/^Fecha de /, '').replace(/^./, c => c.toUpperCase()),
      inst ? fmtFechaDia(inst.fecha) + (inst.hora ? ' · ' + fmtHora(inst.hora) : ' · sin hora') : 'Sin fecha') +
    dato('Etapa', Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) +
    /* En la orden de trabajo, lo mismo que en la ficha: el destino del envío, o el taller. */
    (entregaDe(p) === 'recoleccion'
      ? dato('Entrega', 'Recolección en taller')
      : dato(entregaDe(p) === 'paqueteria' ? 'Destino del envío (paquetería)' : 'Dirección',
          String(p.dir_texto || '').trim() ? esc(p.dir_texto).replace(/\n/g, '<br>') : 'Sin dirección', true) +
        (entregaDe(p) === 'paqueteria' ? '' : dato('Entre calles', p.entrecalles || 'No se anotó'))) +
    '</dl>';

  const partidas = items.length ? items.map(it => {
    const led = ledDe(it);
    return '<div class="mat-fila">' +
      '<div>' +
        '<div class="mat-n">' + esc(Cot.descPartida(it)) + '</div>' +
        '<div class="mat-med">' + esc(materialDe(it)) + '</div>' +
        (medidasDe(it) ? '<div class="mat-med">' + esc(medidasDe(it)) + '</div>' : '') +
        /* La temperatura del LED, dicha en la hoja y no dentro de la caja: hoy nadie la
           sabe hasta que la abre, y meter el rollo frío en un anuncio que se vendió cálido
           es rehacer el trabajo con el cliente esperando. Va en gris y no en color: la
           temperatura no es «bien» ni «mal», es un dato, y la cálida en ámbar parecería un
           problema. La palabra basta. */
        (led ? '<div><span class="pf-sem nada">LED ' + esc(led.txt) + '</span></div>' : '') +
      '</div>' +
      '<div class="mat-cant">' + esc(String(piezasDe(it))) + '<small>' + esc(piezasDe(it) === 1 ? 'pieza' : 'piezas') + '</small></div>' +
    '</div>';
  }).join('') : '<p class="hintnote nota-av">' + ico('i-aviso') +
    ' Este proyecto no trae partidas copiadas, así que no hay nada que cortar. Ábrelo en el cotizador y vuelve a autorizarlo.</p>';

  const material = (reqs && reqs.length) ? reqs.map(r => {
    const mat = MATS.get(r.material_id) || null;
    const usa = (r.cantidad_ajustada === null || r.cantidad_ajustada === undefined)
      ? num(r.cantidad_compra) : num(r.cantidad_ajustada);
    return '<div class="mat-fila">' +
      '<div>' +
        '<div class="mat-n">' + esc(mat ? mat.nombre : r.material_id) + '</div>' +
        '<div class="mat-med">' + esc(mat ? (mat.medida || '') + (mat.espesor ? ' · ' + mat.espesor : '') : 'No está en el catálogo de material') + '</div>' +
        '<span class="mat-conf ' + esc(r.confianza || 'estimada') + '">' + esc(palabraConfianza(r)) + '</span>' +
        (r.cantidad_ajustada !== null && r.cantidad_ajustada !== undefined
          ? ' <span class="mat-conf exacta">Corregido a mano</span>' : '') +
      '</div>' +
      '<div class="mat-cant">' + esc(cant(usa, r.unidad_compra)) +
        '<small>' + esc(cant(r.cantidad_consumo, r.unidad_consumo === 'm2' ? 'm²' : r.unidad_consumo)) + '</small></div>' +
      /* La fórmula se imprime. Es la mitad del valor del módulo: un número que no se puede
         auditar no se corrige nunca, y estas cantidades salen de factores supuestos que
         HAY que corregir cuando el corte salga corto. */
      (r.formula ? '<div class="mat-formula">' + esc(r.formula) + '</div>' : '') +
      (r.requiere ? '<div class="mat-nota">' + esc(r.requiere) + '</div>' : '') +
    '</div>';
  }).join('') : '<p class="hintnote nota-av">' + ico('i-aviso') +
    ' Nadie ha derivado el material de este proyecto todavía.</p>';

  return '<div class="pf-panel">' +
    '<div class="pf-panel-h">' +
      '<h2>Orden de trabajo — ' + esc(p.nombre || p.folio_local) + '</h2>' +
      '<button type="button" class="pf-cerrar" data-cerrar-hoja aria-label="Cerrar la orden de trabajo">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' +
      cab +
      '<div class="fld-lab">Qué se fabrica</div>' + partidas +
      /* Las cantidades de material salen del cálculo que está en mantenimiento: impresas en la orden de
         trabajo, con su fórmula, se leen como algo en que confiar. Vuelven con el interruptor (T1-7). */
      (conMaterial() ? '<div class="fld-lab">Material que pide este proyecto</div>' + material : '') +
      (p.compromiso_texto ? '<p class="hintnote nota-av">' + ico('i-reloj') + ' Se prometió: ' + esc(p.compromiso_texto) + '</p>' : '') +
      (p.notas ? '<p class="hintnote">' + esc(p.notas).replace(/\n/g, '<br>') + '</p>' : '') +
      '<p class="mat-sello">Hoja generada el ' + esc(fmtFecha(hoyISO())) + ' · ' + esc(Prefs.sello()) + '</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-cerrar-hoja>Cerrar</button>' +
      '<button type="button" class="btn btn-pri" data-imprimir>' + ico('i-imprimir') + ' Imprimir</button>' +
    '</div>' +
  '</div>';
}

/* ----- La temperatura del LED -----
   `it.ilumTipo || 'fria'`: la partida que crea la IA no lo trae y sin el default saldría
   una hoja que no dice qué rollo usar. El recorte tipo sándwich es fría siempre —así lo
   dice el texto que firmó el cliente— y el bastidor no lleva luz.

   La caja de luz merece su nota: el PDF dice «LED Fría» siempre, pero la derivación de
   material lee `ilumTipo`. Se pinta el de la derivación, que es el rollo que se compró. */
function ledDe(it) {
  if (!it) return null;
  if (it.tipo === 'letras' || it.tipo === 'caja') {
    if (it.luz === false) return null;
    const calida = it.ilumTipo === 'calida';
    return { calida, txt: calida ? 'cálida 3000K' : 'fría 6500K' };
  }
  if (it.tipo === 'recorte' && it.acab === 'sandwich') return { calida: false, txt: 'fría 6500K' };
  return null;
}

/* De qué está hecha la partida. Etiquetas del catálogo de precios, que es para lo que la
   plataforma lo lee: etiquetas y derivación. Con esto no se recalcula un peso. */
function materialDe(it) {
  if (!it) return '';
  if (it.tipo === 'letras') {
    const m = matOf(it.material);
    return (m ? m.label : 'Aluminio') + (it.comp && it.comp !== 'recta' ? ' · letra ' + it.comp : '');
  }
  if (it.tipo === 'recorte') {
    const r = recOf(it.acab);
    return 'Acrílico' + (r ? ' · ' + r.label : '');
  }
  if (it.tipo === 'bastidor') {
    const b = basOf(it.bas);
    return 'Estructura tubular de 1" forrada de ' + (b ? b.label : 'lámina');
  }
  if (it.tipo === 'caja') {
    const c = cajaOf(it.tarifa, it.caja);
    return 'Caras de acrílico' + (c ? ' · ' + c.label : '');
  }
  return 'Partida manual';
}

/* Mismas medidas que enseña el cotizador, con las mismas palabras: la altura es lo que se
   corta en letras y recortes, y el ancho×alto lo que se arma en bastidor y caja. */
function medidasDe(it) {
  if (!it) return '';
  if (it.tipo === 'letras') return num(it.altura) + ' cm de altura';
  if (it.tipo === 'recorte') return num(it.altura) + ' cm de altura por pieza';
  if (it.tipo === 'bastidor' || it.tipo === 'caja') return num(it.ancho) + ' × ' + num(it.alto) + ' cm';
  return it.desc ? '' : 'Sin medidas capturadas';
}

function piezasDe(it) {
  if (!it) return 0;
  if (it.tipo === 'letras' || it.tipo === 'recorte') return num(it.n);
  if (it.tipo === 'bastidor' || it.tipo === 'caja') return 1;
  return num(it.pz) || 1;
}

const palabraConfianza = r => {
  if (r.confianza === 'exacta') return 'Cantidad exacta';
  if (r.confianza === 'requiere_dato') return 'Falta un dato';
  return 'Estimado';
};

function clicHoja(ev) {
  if (ev.target.closest('[data-cerrar-hoja]')) { cerrarCapa('pf-hoja'); return; }
  if (ev.target.closest('[data-imprimir]')) imprimir();
}

/* ----- Imprimir la orden -----
   El @media print de plataforma.css esconde `.pf-modal-bg`, y con razón: imprimir la app
   con un velo azul encima no es imprimir nada. Pero la orden de trabajo VIVE en un modal,
   así que sin esto fabricación imprimía una hoja en blanco. La clase en <body> invierte la
   regla para esta impresión y solo para esta: sale el panel, sin velo, sin botones. */
function imprimir() {
  if (_imprimiendo) return;
  /* Quién es esta hoja y de cuándo es. El encabezado del papel vive en plataforma.html y solo se
     enciende al imprimir; aquí se le pone el rótulo, que es lo único que cambia entre los dos
     caminos de impresión de la plataforma. */
  rotularPapel('Orden de trabajo');
  _imprimiendo = true;
  document.body.classList.add('pf-print-hoja');
  /* Se quita en 'afterprint', y también por reloj: Safari de iOS no siempre dispara
     'afterprint', y una clase que se queda pegada deja la app entera oculta. */
  setTimeout(trasImprimir, 8000);
  try { window.print(); } catch (_) { trasImprimir(); }
}

function trasImprimir() {
  _imprimiendo = false;
  document.body.classList.remove('pf-print-hoja');
}
