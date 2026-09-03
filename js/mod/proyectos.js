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
import { matOf, basOf, recOf, cajaOf } from '../datos/catalogo-precios.js';
import {
  $, esc, money, cant, ico, toast, avisarResultado, vacio, segmento, chip,
  abrirCapa, cerrarCapa, copiarTexto, linkWa, fmtFecha, fmtFechaDia, fmtHora, cuando,
  diasHasta, hoyISO, partesISO, rotularPapel,
} from '../nucleo/ui.js';

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

let filtro = { etapa: 'todas', texto: '' };
let fichaId = null;         // el proyecto abierto en 'pf-ficha'

/* Quién dijo «déjalo como está» en el aviso de huella. Vive en memoria y se va con la
   recarga a propósito: no hay campo donde anotar «ya lo revisé» y usar `notas` sería
   escribir en un campo que es de otro dueño. Y que el aviso vuelva al recargar es
   correcto: el material calculado sigue sin corresponder a la cotización de hoy. */
const HUELLA_IGNORADA = new Set();

const _oyentes = [];        // [[elemento, tipo, fn]]
let _tBuscar = 0;
let _imprimiendo = false;

function on(el, tipo, fn) {
  if (!el) return;
  el.addEventListener(tipo, fn);
  _oyentes.push([el, tipo, fn]);
}

/* ============================================================================
   Vocabulario que no vive en la capa de datos
   ============================================================================ */

/* Los cuatro valores REALES de la propiedad *status* de `Ventas - AL3D`. Escritos tal
   cual: pegar en una propiedad de tipo status una opción que no existe LA CREA, así que un
   «Fabricación» con acento no es un error visible, es una quinta opción que ensucia el
   esquema y deja las siete vistas reportando de menos. */
const ESTATUS_NOTION = ['REPARANDO', 'COBRANDO', 'FABRICACION', 'LIQUIDADO'];

/* Las cinco cuentas que existen en Notion. No hay «Otra»: una cuenta que no existe allá se
   pega y se convierte en una cuenta nueva de la que nadie va a cobrar nada. */
const CUENTAS = ['Moni MPago', 'Rul HSBC', 'Tatis BNT', 'Constru BNT', 'Elias BBVA'];

/* PAGOS mueve el dinero, no la obra. §8.2 le da «→ cobrando/liquidado», y eso es estatus
   de Notion, no etapa: por eso su ficha no trae el segmento de etapas. */
const ESTATUS_DE_PAGOS = ['COBRANDO', 'LIQUIDADO'];

/* `ICO_ETAPA` y `claseEtapa` viven en datos/proyectos.js, junto a `ETAPA_NOMBRE`: tres
   pantallas enseñan la etapa y con una copia por pantalla, dos acaban dibujando cosas
   distintas para el mismo hecho. */
const { ICO_ETAPA, claseEtapa } = Proy;

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
/* Las dos fórmulas de Notion arrancan en `null` y en un registro viejo pueden no venir. La
   diferencia importa: `null` es «Notion no ha contestado» y 0 es «no debe nada», y pintar
   $0.00 por un campo que no existe es decirle a alguien que ya cobró. */
const hay = v => v !== null && v !== undefined;

/* ============================================================================
   Montaje
   ============================================================================ */

export async function montar(c, ctx) {
  cont = c;
  CTX = ctx || {};

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
    '<div class="card"><div class="card-h"><h2>' + ico('i-proyectos') + ' Proyectos</h2></div>' +
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
  on($('pf-hoja'), 'click', clicHoja);
  on($('pf-pide'), 'click', clicPide);
  on(window, 'afterprint', trasImprimir);

  await cargar();

  /* Después de `cargar()` y no antes: `abrirFicha` lee el proyecto y necesita la lista ya
     pintada debajo para que cerrar la capa devuelva a algo. */
  if (pase && pase.proyecto_id) {
    try { await abrirFicha(pase.proyecto_id); } catch (_) { /* el proyecto ya no está: la lista sirve igual */ }
  }
}

export function desmontar() {
  for (const [el, tipo, fn] of _oyentes) {
    try { el.removeEventListener(tipo, fn); } catch (_) {}
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

  TODOS = []; VISTA = []; SIN_DECIDIR = [];
  FECHA = new Map(); SEM = new Map(); REQS = new Map(); MATS = new Map(); HUELLA = new Map();
  fichaId = null;
  cont = null; CTX = null;
}

/* ============================================================================
   Cargar
   ============================================================================ */

async function cargar() {
  const lista = $('pj-lista');
  if (lista) lista.innerHTML = '<div class="vacio">' + ico('i-reloj') + '<p class="vacio-t">Leyendo proyectos…</p></div>';

  /* Cinco lecturas en paralelo y ni una más, sobre todo la del almacén: `listaCompra`
     recorre el libro de movimientos completo y pedirla una vez por renglón es lo que
     vuelve esta pantalla una que tarda. Con `hastaDias` largo porque aquí la pregunta no
     es «qué compro esta semana» sino «a este proyecto le falta algo», y hay proyectos
     ganados con instalación a dos meses. */
  const [proys, insts, compra, mats] = await Promise.all([
    Proy.listar({}),
    Agenda.listar({ vivas: true }),
    Stock.listaCompra({ hastaDias: 3650 }),
    Material.listarMateriales({}),
  ]);

  TODOS = Array.isArray(proys) ? proys : [];
  MATS = new Map((mats || []).map(m => [m.id, m]));

  /* La fecha que manda es la instalación viva MÁS PRÓXIMA. Una reagendada a diciembre no
     puede seguir diciendo que se instala el martes. */
  FECHA = new Map();
  for (const i of (insts || [])) {
    if (!i || !i.proyecto_id || !i.fecha) continue;
    const prev = FECHA.get(i.proyecto_id);
    if (!prev || String(i.fecha) < String(prev.fecha)) FECHA.set(i.proyecto_id, i);
  }

  REQS = new Map();
  const vivos = TODOS.filter(p => p.etapa !== 'cancelado');
  const reqs = await Promise.all(vivos.map(p => Material.requerimientos(p.id)));
  vivos.forEach((p, k) => REQS.set(p.id, reqs[k] || []));

  SEM = semaforos(compra || []);
  HUELLA = huellas();

  /* Las cotizaciones que nadie decidió. El criterio es la AUSENCIA de un proyecto con ese
     folio, y por eso la lápida del descartado importa: sin ella la tarjeta resucitaría
     cada cotización rechazada en cada arranque, y un aviso que vuelve después de que le
     dijiste que no es un aviso que se aprende a ignorar.

     Sin mínimo de días, al revés que la tarjeta de Inicio: allá los 7 días evitan
     molestar con la venta de ayer, aquí decidir ES el trabajo de la pantalla. */
  const decididos = new Set(TODOS.map(p => p.folio_global));
  SIN_DECIDIR = Prefs.rol() === 'direccion' ? Cot.sinDecidir(decididos, 0) : [];

  pintarCand();
  pintarFiltros();
  aplicar();
  publicarCuenta();
}

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
   comparación la sigue haciendo `Cot.huellaDe`, que es la misma función con la que compara
   ella: el veredicto no puede divergir porque la aritmética es la suya. */
function huellas() {
  const hoy = new Map();
  for (const e of Cot.historial()) if (e && e.folio) hoy.set(e.folio, Cot.huellaDe(e));
  const m = new Map();
  for (const p of TODOS) {
    const folio = (p.origen && p.origen.folio) || p.folio_local;
    if (!hoy.has(folio)) { m.set(p.id, 'desaparecio'); continue; }
    const antes = (p.origen && p.origen.huellaAuth) || Cot.huellaDe(p.origen || {});
    m.set(p.id, !antes ? 'sin_huella' : (antes === hoy.get(folio) ? 'igual' : 'cambio'));
  }
  return m;
}

const cambiada = p => (HUELLA.get(p.id) || Cot.estadoOrigen(p)) === 'cambio' && !HUELLA_IGNORADA.has(p.id);

/** La cuenta de la pestaña: lo que ESTA pantalla tiene que atender, según el rol. */
function publicarCuenta() {
  if (!CTX || typeof CTX.ponerCuenta !== 'function') return;
  const rol = Prefs.rol();
  let n = 0;
  if (rol === 'direccion') {
    n = SIN_DECIDIR.length + TODOS.filter(p => p.etapa !== 'cancelado' && cambiada(p)).length;
  } else if (rol === 'fabricacion') {
    n = TODOS.filter(p => (SEM.get(p.id) || {}).estado === 'grave').length;
  } else {
    /* Lo que le falta capturar a PAGOS para que la fila de Notion sirva: sin cuenta y sin
       estatus, esas dos celdas se pegan vacías. */
    n = TODOS.filter(p => p.etapa !== 'cancelado' && (!p.cuenta || !p.estatus_notion)).length;
  }
  CTX.ponerCuenta('proyectos', n);
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
  VISTA = filtro.etapa === 'todas'
    ? base.filter(p => p.etapa !== 'cancelado')
    : base.filter(p => p.etapa === filtro.etapa);
  pintarCuentas();
  pintarLista();
}

function pintarCuentas() {
  const el = $('pj-cuentas'); if (!el) return;
  const vivos = TODOS.filter(p => p.etapa !== 'cancelado');
  const sinFecha = vivos.filter(p => !FECHA.get(p.id)).length;
  const faltan = vivos.filter(p => ['falta', 'grave'].includes((SEM.get(p.id) || {}).estado)).length;
  el.innerHTML =
    '<div class="pf-cuenta"><b>' + vivos.length + '</b>' + (vivos.length === 1 ? 'proyecto abierto' : 'proyectos abiertos') + '</div>' +
    (sinFecha ? '<div class="pf-cuenta urge"><b>' + sinFecha + '</b>sin fecha de instalación</div>' : '') +
    (faltan ? '<div class="pf-cuenta urge"><b>' + faltan + '</b>con material faltante</div>' : '');
}

function pintarFiltros() {
  const el = $('pj-filtros'); if (!el) return;
  const cuenta = {};
  for (const p of TODOS) cuenta[p.etapa] = (cuenta[p.etapa] || 0) + 1;

  /* Solo las etapas que existen hoy. Ocho botones fijos en un teléfono son seis que no
     filtran nada y que empujan la lista abajo del doblez. «Todas» siempre está. */
  const ops = [{ v: 'todas', t: 'Todas' }];
  for (const e of Proy.ETAPAS) {
    if (!cuenta[e]) continue;
    ops.push({ v: e, t: (Proy.ETAPA_NOMBRE[e] || e) + ' ' + cuenta[e] });
  }
  el.innerHTML = '<div class="fld-lab">Etapa de obra</div>' + segmento(ops, filtro.etapa, 'data-etapa');
}

function pintarLista() {
  const el = $('pj-lista'); if (!el) return;

  if (!VISTA.length) {
    if (!TODOS.length) {
      el.innerHTML = vacio(
        'Todavía no has marcado ninguna cotización como ganada',
        'Cuando cierres una venta, abre Registrar Venta en el cotizador y aprieta «Esta cotización se ganó». ' +
        'El proyecto entra aquí con su dirección, su tipo de trabajo y su material ya calculado.',
        '<a class="btn btn-pri" href="cotizador.html">' + ico('i-venta') + ' Abrir el cotizador</a>');
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

  el.innerHTML = VISTA.map(fila).join('');
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
  const dinero = Prefs.veDinero()
    ? ' · Vendido <b>' + esc(money(p.precio_auth || p.neto)) + '</b>'
    : '';

  return '<div class="pf-fila">' +
    '<div class="pf-fila-ico' + (sem && sem.estado === 'grave' ? ' mal' : cambio ? ' urge' : '') + '">' +
      ico(ICO_ETAPA[p.etapa] || 'i-proyectos') + '</div>' +
    '<div class="pf-fila-tx">' +
      '<div class="pf-fila-t">' + esc(p.nombre || p.folio_local || 'Proyecto sin nombre') + '</div>' +
      '<div class="pf-fila-d">' +
        '<span class="folio">' + esc(Cot.folioVisible(p.folio_global) || p.folio_local || '—') + '</span> ' +
        '<span class="pf-etapa ' + claseEtapa(p.etapa) + '">' + esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span> ' +
        fechaTx + ' ' +
        (sem ? '<span class="pf-sem ' + sem.estado + '" title="' + esc(sem.detalle) + '">' + esc(sem.palabra) + '</span> ' : '') +
        (cambio ? '<span class="pf-sem grave">Se editó después de ganarse</span> ' : '') +
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

function pintarCand() {
  const el = $('pj-cand'); if (!el) return;
  if (!SIN_DECIDIR.length) { el.innerHTML = ''; return; }

  const n = SIN_DECIDIR.length;
  const filas = SIN_DECIDIR.map(e => {
    const dias = Math.floor((Date.now() - (num(e.ts) || Date.now())) / 86400000);
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
        '<button type="button" class="btn btn-ok" data-gano="' + esc(e.folio) + '">Se ganó</button>' +
        '<button type="button" class="btn btn-gho" data-nodio="' + esc(e.folio) + '">No se dio</button>' +
      '</div>' +
    '</div>';
  }).join('');

  /* La misma tarjeta de A6, con la misma clase y el mismo latido: es el mismo mensaje
     —«esto pide que hagas algo antes de seguir»— y si aquí se viera distinta, parecerían
     dos cosas. `.pf-decidir` es la variante en bloque que Inicio ya dejó puesta, porque son
     N cotizaciones con dos botones cada una y no un renglón que se toca completo. */
  el.innerHTML =
    '<div class="cand-partidas pf-decidir">' +
      '<p class="cp-txt">' + ico('i-aviso') + ' Tienes <b>' + n + '</b> ' +
      (n === 1 ? 'cotización autorizada sin decidir' : 'cotizaciones autorizadas sin decidir') +
      '. Mientras no digas si se ganó, no tiene material, ni fecha, ni existe en ningún sistema.</p>' +
      filas +
    '</div>';
}

/* ============================================================================
   Clics de la lista
   ============================================================================ */

async function clicLista(ev) {
  const t = ev.target;

  const seg = t.closest('[data-etapa]');
  if (seg) { filtro.etapa = seg.dataset.etapa; pintarFiltros(); aplicar(); return; }

  if (t.closest('[data-limpiar]')) {
    const q = $('pj-q'); if (q) { q.value = ''; q.focus(); }
    filtro.texto = ''; aplicar(); return;
  }

  const abrir = t.closest('[data-abrir]');
  if (abrir) { await abrirFicha(abrir.dataset.abrir); return; }

  const gano = t.closest('[data-gano]');
  if (gano) { await ganar(gano.dataset.gano, gano); return; }

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

async function ganar(folio, boton) {
  const entrada = Cot.porFolio(folio);
  if (!entrada) {
    toast('La cotización ' + folio + ' ya no está en el historial de este dispositivo', 'err', 4600);
    return;
  }
  if (boton) boton.disabled = true;
  const r = await Proy.ganar(entrada, {});
  if (boton) boton.disabled = false;
  if (!r.ok) { avisarResultado(r); return; }

  /* Sin fecha, y se dice en el mismo aviso en vez de dejarlo para que lo descubra la regla
     de las 48 horas. La fecha es la única captura humana real del sistema y vive en la
     agenda: aquí se ofrece el camino, no se inventa el dato. */
  toast('«' + (r.valor.nombre || folio) + '» ya es proyecto. Le falta fecha de instalación.', 'ok', 8000,
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
  abrirCapa('pf-ficha', { hist: true });
}

function htmlFicha(p) {
  const rol = Prefs.rol();
  const ve = Prefs.veDinero();
  const inst = FECHA.get(p.id) || null;
  const sem = SEM.get(p.id) || null;
  const o = p.origen || {};

  const tel = String(p.tel || o.tel || '').trim();
  const dir = String(p.dir_texto || '').trim();

  const datos = [];
  datos.push(dato('Contacto', p.contacto || '—'));
  datos.push(dato('Negocio', p.negocio || '—'));
  datos.push(dato('Teléfono', tel
    ? esc(tel) + '<br><a class="btn-wa" href="' + esc(linkWa(tel)) + '" target="_blank" rel="noopener">' +
      ico('i-wa') + ' WhatsApp</a>'
    : 'No quedó teléfono en la cotización', !!tel));
  datos.push(dato('Tipo de trabajo', (p.tipo_trabajo || []).join(' · ') || '—'));
  datos.push(dato('Etapa de obra', '<span class="pf-etapa ' + claseEtapa(p.etapa) + '">' +
    esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span>', true));
  datos.push(dato('Fecha de instalación', inst
    ? esc(fmtFechaDia(inst.fecha)) + (inst.hora ? ' · ' + esc(fmtHora(inst.hora)) : ' · sin hora') +
      ' <span class="pf-cuando' + tonoCuando(inst.fecha) + '">' + esc(cuando(inst.fecha)) + '</span>' +
      (inst.estado && inst.estado !== 'confirmada' ? '<br><span class="pf-sem nada">' + esc(Agenda.ESTADO_NOMBRE[inst.estado] || inst.estado) + '</span>' : '')
    : '<span class="pf-sem falta">Sin fecha</span>', true));
  datos.push(dato('Límite de fabricación', p.compromiso_texto ||
    'La cotización no prometió fecha de entrega'));
  datos.push(dato('Ganado el', fmtFecha(p.fecha_ganado) || '—'));
  datos.push(dato('Material', sem
    ? '<span class="pf-sem ' + sem.estado + '">' + esc(sem.palabra) + '</span><br>' + esc(sem.detalle)
    : '—', true));

  /* El espejo de Notion. Se pinta con su nombre y se dice qué es: el estatus de allá es de
     dinero y no de obra, y verlos juntos en la misma ficha es lo que impide que alguien
     empiece a usar uno como si fuera el otro. */
  datos.push(dato('Estatus en Notion (dinero)', p.estatus_notion
    ? '<span class="pf-sem nada">' + esc(p.estatus_notion) + '</span>'
    : '<span class="pf-sem falta">Sin capturar</span>', true));
  datos.push(dato('Cuenta de cobro', p.cuenta || '<span class="pf-sem falta">Sin capturar</span>', !p.cuenta));

  if (ve) {
    datos.push(dato('Subtotal', money(p.sub)));
    datos.push(dato('Total vendido', money(p.precio_auth || p.neto)));
    datos.push(dato('Anticipo pactado', p.anti_pactado ? money(p.anti_pactado) : 'No se pactó anticipo'));
    datos.push(dato('IVA', p.iva !== false ? 'Sí, incluido' : 'Sin IVA'));
    if (p.pct_comision) datos.push(dato('Comisión pactada', p.pct_comision + ' %'));
    /* Las dos fórmulas de Notion. Se leen, jamás se calculan aquí: dos versiones de la
       misma fórmula empiezan a dar dos respuestas y nadie sabe cuál cobrar. */
    if (hay(p.pago_pendiente)) datos.push(dato('Pago pendiente (fórmula de Notion)', money(p.pago_pendiente)));
    if (hay(p.comision_restante)) datos.push(dato('Comisión restante (fórmula de Notion)', money(p.comision_restante)));
  }

  const partes = [];

  /* El aviso de huella. Va arriba de todo porque cambia el sentido de lo que está abajo:
     si la cotización se editó después de ganarse, el material y el importe de esta ficha
     son de otra versión del trabajo. */
  const estado = HUELLA.get(p.id) || Cot.estadoOrigen(p);
  if (estado === 'cambio' && !HUELLA_IGNORADA.has(p.id)) {
    partes.push('<p class="hintnote nota-av">' + ico('i-aviso') + ' <b>' +
      esc(p.folio_local || Cot.folioVisible(p.folio_global)) + ' se editó después de ganarse.</b> ' +
      'El material calculado ya no corresponde.</p>' +
      '<div class="btn-fila">' +
        '<button type="button" class="btn btn-pri" data-resinc="' + esc(p.id) + '">Recalcular material</button>' +
        '<button type="button" class="btn btn-gho" data-huella-ok="' + esc(p.id) + '">Dejar como está</button>' +
      '</div>');
  } else if (estado === 'desaparecio') {
    partes.push('<p class="hintnote">' + ico('i-historial') + ' ' +
      esc(p.folio_local || '') + ' ya no está en el historial de este dispositivo. El proyecto está completo: ' +
      'lo que se guardó al ganarlo es una copia congelada, no una referencia.</p>');
  }

  partes.push('<dl class="pf-2col">' + datos.join('') + '</dl>');

  /* La dirección cruda, tal como la escribió quien cotizó. No se normaliza ni se parte en
     campos: es lo que el instalador va a leer en la calle. */
  partes.push('<dl class="pf-2col">' +
    dato('Dirección', dir ? esc(dir).replace(/\n/g, '<br>') : 'La cotización no traía dirección', true) +
    dato('Entre calles', p.entrecalles || 'No se anotó') +
    '</dl>');
  if (dir || p.maps_url || isFinite(p.lat)) {
    partes.push('<div class="btn-fila"><a class="btn btn-gho" href="' + esc(urlMapa(p)) +
      '" target="_blank" rel="noopener">' + ico('i-pin') + ' Abrir en Maps</a></div>');
  }

  if (o.notaCliente) {
    partes.push('<div class="fld-lab">Nota al cliente, la de la cotización</div>' +
      '<p class="hintnote">' + esc(o.notaCliente) + '</p>');
  }
  if (p.notas) {
    partes.push('<div class="fld-lab">Notas del proyecto</div><p class="hintnote">' +
      esc(p.notas).replace(/\n/g, '<br>') + '</p>');
  }

  /* Etapa: el segmento con lo que ESTE rol puede marcar. Fabricación llega a «Listo» y no
     más: «Instalado» lo marca quien estuvo en la obra, y de ahí cuelga la cobranza. */
  if (rol !== 'pagos') {
    /* El tope sale de ETAPAS y no de una lista escrita a mano: el día que se meta una
       etapa entre cortado y armado, fabricación la ve sin que nadie se acuerde de este
       archivo. `cancelado` no está en el segmento: se descarta con su propio botón, que
       pregunta por qué. */
    const tope = rol === 'fabricacion'
      ? Proy.ETAPAS.slice(0, Proy.ETAPAS.indexOf('listo') + 1)
      : Proy.ETAPAS.filter(e => e !== 'cancelado');
    partes.push('<div class="fld-lab">Mover la etapa de obra</div>' +
      segmento(tope.map(e => ({ v: e, t: Proy.ETAPA_NOMBRE[e] || e })), p.etapa, 'data-mover') +
      '<p class="hintnote">Al llegar a «Cortado» el material sale del almacén, una sola vez y con tu nombre.</p>');
  }

  if (rol === 'pagos' || rol === 'direccion') {
    const ests = rol === 'pagos' ? ESTATUS_DE_PAGOS : ESTATUS_NOTION;
    partes.push('<div class="fld-lab">Estatus de Notion — el eje del dinero</div>' +
      segmento(ests.map(e => ({ v: e, t: e })), p.estatus_notion || '', 'data-estatus'));
    partes.push('<div class="fld-lab">Cuenta donde se cobra</div><div class="chips">' +
      CUENTAS.map(c => chip(c, p.cuenta === c, 'data-cuenta="' + esc(c) + '"')).join('') + '</div>');
  }

  const pie = [];
  if (rol !== 'pagos') {
    pie.push('<button type="button" class="btn ' + (rol === 'fabricacion' ? 'btn-pri' : 'btn-gho') +
      '" data-hoja="' + esc(p.id) + '">' + ico('i-doc') + ' Orden de trabajo</button>');
  }
  if (rol === 'direccion' || rol === 'pagos') {
    pie.push('<button type="button" class="btn btn-gho" data-tsv="' + esc(p.id) + '">' +
      ico('i-copiar') + ' Copiar fila para Notion</button>');
  }
  if (rol === 'direccion' && p.etapa !== 'cancelado') {
    pie.push('<button type="button" class="btn btn-dgr" data-cancelar="' + esc(p.id) + '">No se dio</button>');
  }

  return '<div class="pf-panel">' +
    '<div class="pf-panel-h">' +
      '<h2>' + esc(p.nombre || p.folio_local || 'Proyecto') + '</h2>' +
      '<span class="folio">' + esc(p.folio_local || Cot.folioVisible(p.folio_global)) + '</span>' +
      '<button type="button" class="pf-cerrar" data-cerrar-ficha aria-label="Cerrar la ficha">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' + partes.join('') + '</div>' +
    (pie.length ? '<div class="pf-panel-f">' + pie.join('') + '</div>' : '') +
  '</div>';
}

const dato = (etiqueta, valorHTML, esHtml) =>
  '<div class="pf-dato"><dt>' + esc(etiqueta) + '</dt><dd>' + (esHtml ? valorHTML : esc(valorHTML)) + '</dd></div>';

/* El link crudo de Maps primero, y es una decisión: es el que el cliente mandó y trae el
   pin donde el cliente lo puso. Un `search?query=` con el texto de una dirección de
   Tlajomulco cae a media colonia, y ahí es donde la camioneta da vueltas. */
function urlMapa(p) {
  if (p.maps_url) return p.maps_url;
  if (p.lat !== null && p.lng !== null && isFinite(p.lat) && isFinite(p.lng)) {
    return 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng;
  }
  return 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(String(p.dir_texto || '').replace(/\s+/g, ' ').trim());
}

async function clicFicha(ev) {
  const t = ev.target;
  if (t.closest('[data-cerrar-ficha]')) { cerrarCapa('pf-ficha'); fichaId = null; return; }

  const hoja = t.closest('[data-hoja]');
  if (hoja) { await abrirHoja(hoja.dataset.hoja); return; }

  const mover = t.closest('[data-mover]');
  if (mover) { await moverEtapa(fichaId, mover.dataset.mover); return; }

  const est = t.closest('[data-estatus]');
  if (est) { await parchar(fichaId, { estatus_notion: est.dataset.estatus }, 'Estatus de Notion guardado'); return; }

  const cta = t.closest('[data-cuenta]');
  if (cta) { await parchar(fichaId, { cuenta: cta.dataset.cuenta }, 'Cuenta guardada'); return; }

  const tsv = t.closest('[data-tsv]');
  if (tsv) { await copiarFila(tsv.dataset.tsv); return; }

  const re = t.closest('[data-resinc]');
  if (re) { await resincronizar(re.dataset.resinc, re); return; }

  const ok = t.closest('[data-huella-ok]');
  if (ok) {
    HUELLA_IGNORADA.add(ok.dataset.huellaOk);
    toast('Se queda como está. El aviso vuelve si recargas: el material sigue siendo el de la versión anterior.', '', 5200);
    await refrescarFicha();
    pintarLista();
    publicarCuenta();
    return;
  }

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

async function refrescarFicha() {
  if (!fichaId) return;
  const p = await Proy.obtener(fichaId);
  const capa = $('pf-ficha');
  if (!p || !capa) return;
  capa.innerHTML = htmlFicha(p);
}

async function parchar(id, campos, msgOk) {
  if (!id) return;
  const r = await Proy.actualizar(id, campos);
  if (!avisarResultado(r, msgOk)) return;
  await cargar();
  await refrescarFicha();
}

async function moverEtapa(id, etapa) {
  if (!id) return;
  const r = await Proy.avanzarEtapa(id, etapa);
  if (!r.ok) { avisarResultado(r); return; }

  /* Los movimientos de material se dicen en voz alta. Pasar a «Cortado» mueve el almacén,
     y un almacén que cambió sin que nadie se enterara es un almacén al que en tres semanas
     ya nadie le cree. */
  const n = num(r.valor && r.valor.movimientos);
  const nombre = Proy.ETAPA_NOMBRE[etapa] || etapa;
  if (n > 0) {
    toast('Ahora está en «' + nombre + '». Salieron ' + n +
      (n === 1 ? ' material del almacén' : ' materiales del almacén') +
      ', a nombre de ' + Prefs.sello() + '.', 'ok', 6000,
      { label: 'Ver almacén', fn: () => { if (CTX && CTX.ir) CTX.ir('material'); } });
  } else if (etapa === 'cortado' || etapa === 'armado' || etapa === 'listo') {
    toast('Ahora está en «' + nombre + '». No se descontó nada del almacén: o ya había salido, o ' +
      'este proyecto no tiene material calculado.', '', 5200);
  } else {
    toast('Ahora está en «' + nombre + '»', 'ok', 2600);
  }
  await cargar();
  await refrescarFicha();
}

async function resincronizar(id, boton) {
  if (boton) boton.disabled = true;
  const r = await Proy.resincronizar(id);
  if (boton) boton.disabled = false;
  if (!r.ok) { avisarResultado(r); return; }
  const l = num(r.valor && r.valor.lineas);
  toast('Recalculado con la cotización de hoy: ' + l + (l === 1 ? ' línea de material' : ' líneas de material') + '.', 'ok', 5200);
  HUELLA_IGNORADA.delete(id);
  await cargar();
  await refrescarFicha();
}

/* ============================================================================
   La fila TSV para Notion — la misma que copia index.html
   ============================================================================ */

/* De 'YYYY-MM-DD' a 'DD/MM/YYYY', que es lo que la columna *date* de Notion acepta. Se
   parte la cadena en vez de pasar por Date: `new Date('2026-08-23')` se lee como UTC y en
   México devuelve el día anterior. */
function isoADmy(iso) {
  const p = partesISO(iso);
  if (!p) return String(iso || '');
  const dd = String(p.d).padStart(2, '0'), mm = String(p.m).padStart(2, '0');
  return dd + '/' + mm + '/' + p.a;
}

/**
 * Las quince columnas en el orden del CSV de Ventas de Notion. Es una RÉPLICA de
 * `copiarFilaVenta()` de index.html —mismo orden, mismas cinco cuentas derivadas, misma
 * fecha DD/MM/YYYY, mismo `Yes`/`No`— y tiene que seguir siéndolo: si divergieran, el
 * mismo proyecto produciría dos filas distintas según desde dónde se copie, y alguien
 * pegaría las dos.
 *
 * El nombre va como `Contacto - Negocio`, SIN el paréntesis con la pieza. El nombre
 * derivado de la plataforma sí lo lleva —«Ale - Parentesis (Caja Luz)» se reconoce en una
 * lista de doscientos— pero la celda de Notion tiene que quedar igual que la que pega el
 * cotizador, o la misma venta aparece dos veces con dos nombres.
 */
function filaTsv(p) {
  const inst = FECHA.get(p.id) || null;
  /* La columna es «Fecha Anticipo e Instalacion». En el cotizador es el campo `rv-fecha`
     del modal de Registrar Venta; aquí es la fecha real de instalación si ya se capturó, y
     si no, el día en que se ganó, que es exactamente lo que ese campo traía puesto. */
  const dmy = isoADmy(inst ? inst.fecha : p.fecha_ganado);

  const sub = num(p.sub), neto = num(p.neto);
  const anti = num(p.anti_pactado);
  const pct = num(p.pct_comision);
  /* Sin estatus capturado se usa FABRICACION, que es el que el modal del cotizador deja
     puesto. Es la única forma de que las dos filas coincidan cuando nadie tocó el campo. */
  const estatus = String(p.estatus_notion || 'FABRICACION');
  /* La cuenta NO se rellena con una de las cinco: inventar de dónde se va a cobrar es peor
     que dejar la celda vacía, y la celda vacía se ve al pegar. */
  const cuenta = String(p.cuenta || '');

  const com = Math.round(sub * pct / 100);
  const pend = estatus === 'LIQUIDADO' ? 0 : Math.max(0, neto - anti);
  const liquidacion = estatus === 'LIQUIDADO' ? neto : '';
  const abonoComision = estatus === 'LIQUIDADO' ? com : 0;
  const comRestante = estatus === 'LIQUIDADO' ? 0 : com;
  const fechaLiq = estatus === 'LIQUIDADO' ? dmy : '';
  const proyecto = (p.contacto ? p.contacto + ' - ' : '') + String(p.negocio || '');
  const iva = p.iva !== false ? 'Yes' : 'No';

  // Proyecto | Abono Comision | Anticipo | Comision Restante | Comisiones | Cuenta | Estatus
  // Fecha Anticipo e Instalacion | Fecha Comision | Fecha Liquidacion | IVA | Liquidacion
  // Pago Pendiente | Precio Neto | Precio Subtotal
  return [
    proyecto, abonoComision, anti, comRestante, com, cuenta, estatus,
    dmy, '', fechaLiq, iva, liquidacion, pend, neto, sub,
  ].join('\t');
}

async function copiarFila(id) {
  const p = await Proy.obtener(id);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo', 'err'); return; }
  const faltan = [];
  if (!p.cuenta) faltan.push('la cuenta');
  if (!p.estatus_notion) faltan.push('el estatus');
  copiarTexto(filaTsv(p), faltan.length
    ? 'Fila copiada. Ojo: sin ' + faltan.join(' ni ') + ', esa celda va vacía.'
    : 'Fila copiada — pégala en Ventas - AL3D de Notion');
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
  const reqs = await Material.requerimientos(id);
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
    dato('Instalación', inst ? fmtFechaDia(inst.fecha) + (inst.hora ? ' · ' + fmtHora(inst.hora) : ' · sin hora') : 'Sin fecha') +
    dato('Etapa', Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) +
    dato('Dirección', String(p.dir_texto || '').trim() ? esc(p.dir_texto).replace(/\n/g, '<br>') : 'Sin dirección', true) +
    dato('Entre calles', p.entrecalles || 'No se anotó') +
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
      '<div class="fld-lab">Material que pide este proyecto</div>' + material +
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
    const c = cajaOf(it.tarifa);
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
