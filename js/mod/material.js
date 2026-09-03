/* ============================================================================
   Material — la segunda pregunta del director: ¿tengo material para esto o no?

   Es el módulo de FABRICACIÓN, y las tres pestañas son tres preguntas distintas que hoy
   nadie puede contestar sin abrir cinco cotizaciones y caminar al estante:

     Por comprar   ¿qué le pido al proveedor, en lo que el proveedor vende?
     En almacén    ¿qué hay, y desde cuándo creo que hay eso?
     Por proyecto  ¿de dónde salió ese número, y en qué me equivoqué?

   Tres decisiones que se ven en todo el archivo:

   1. Aquí NO se calcula material. Ni una multiplicación. Las cantidades salen de
      `Material.derivar` a través de `recalcular`, las existencias de `Stock.existencia` y
      el redondeo de `Stock.listaCompra`, que agrega TODOS los proyectos antes de redondear.
      Si esta pantalla decidiera cuánto falta habría dos respuestas a la misma pregunta y
      la que se pinta sería la que nadie probó.
   2. La fórmula se pinta al lado de cada línea, siempre, y también en papel. Es la mitad
      del valor del módulo: un número que no se puede auditar no se corrige nunca, y estas
      cantidades salen de factores supuestos que HAY que corregir. Por eso el botón
      «Ajustar» está en el mismo renglón que la fórmula y no en un menú.
   3. Para FABRICACIÓN los importes NO SE PINTAN (`Prefs.veDinero()`). No se difuminan: el
      elemento no existe. Y donde no hay costo capturado va un guion, no un $0: «$0.00» se
      lee como «no cuesta nada», que es lo contrario de «no lo sabemos».
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Material from '../datos/material.js';
import * as Stock from '../datos/stock.js';
import * as Proy from '../datos/proyectos.js';
import * as Agenda from '../datos/agenda.js';
import {
  $, esc, money, cant, plural, ico, toast, avisarResultado, vacio, segmento,
  abrirCapa, cerrarCapa, linkWa, fmtFecha, cuando, diasHasta, hoyISO, ajustarAltoBarra, cantHay, rotularPapel } from '../nucleo/ui.js';

/* ============================================================================
   Estado del módulo. Todo aquí, y todo se suelta en desmontar().
   ============================================================================ */

let cont = null;
let CTX = null;

/* La pestaña sobrevive a salir del módulo y volver, a propósito: fabricación entra a
   «En almacén», va al estante, se distrae con un aviso de Inicio y regresa. Volver siempre
   a «Por comprar» le haría buscar dos veces el renglón donde iba. */
let TAB = 'comprar';            // comprar | almacen | proyecto

let COMPRA = [];                // Stock.listaCompra()
let EXIS = [];                  // Stock.existencias()
let PROYS = [];                 // proyectos abiertos
let REQS = new Map();           // proyecto_id -> requerimientos[]
let FECHA = new Map();          // proyecto_id -> instalación viva más próxima
let MATS = new Map();           // material_id -> fila del catálogo
let CTES = [];                  // filas del almacén `constantes`, con su origen escrito
let CALIB = [];                 // Material.calibracion()

let hojaModo = 'catalogo';      // qué está enseñando el modal grande
let pide = null;                // qué está preguntando el modal chico, si está abierto

const _oyentes = [];            // [[elemento, tipo, fn]]
let _imprimiendo = false;

function on(el, tipo, fn) {
  if (!el) return;
  el.addEventListener(tipo, fn);
  _oyentes.push([el, tipo, fn]);
}

/* ============================================================================
   Vocabulario de pantalla

   Lo que vive aquí y no en la capa de datos es lo que es TEXTO: cómo se lee una unidad de
   compra en español y cómo se llama una constante en un renglón. Los números y su
   derivación vienen de la base; estos son rótulos.
   ============================================================================ */

/* `cant()` pluraliza solo, pero el id de la unidad no lleva acento porque viaja en datos:
   «1 lamina» en la pantalla se ve como una falta de ortografía del programa. */
const UC = { unidad: 'unidad', bolsa: 'bolsa', caja: 'caja', lamina: 'lámina',
             litro: 'litro', metro: 'metro' };
const U_CONS = { m2: 'm²', m: 'm', cm: 'cm', pieza: 'pieza', litro: 'litro' };

const uc  = (n, u) => cant(n, UC[u] || u || 'unidad');
const ucn = (n, u) => cant(n, U_CONS[u] || u || '');
const un  = (n, u) => (Number(n) === 1 ? (UC[u] || u) : plural(UC[u] || u));

/* «Estimado» no es un adorno: es la diferencia entre comprar con esto y comprar con esto
   sabiendo qué se supuso. */
const CONF_PALABRA = { exacta: 'Exacto', estimada: 'Estimado', requiere_dato: 'Falta un dato' };
const confPalabra = c => CONF_PALABRA[c] || 'Estimado';

/* El número y su derivación viven en la base; el título del renglón es rótulo de pantalla.
   Se escribe aquí para que la lista se lea como preguntas del taller y no como claves de
   programa: «Profundidad del canto de una letra 3D» y no `PROF_CANTO_CM`. La clave se
   pinta igual, chica, porque es la que aparece en la fórmula. */
const CTE_TITULO = {
  K_ANCHO_CAJA: 'Ancho de una letra respecto a su altura',
  K_PERIM_recta: 'Perímetro de una letra recta',
  K_PERIM_cursiva: 'Perímetro de una letra cursiva',
  K_PERIM_compleja: 'Perímetro de una letra compleja',
  K_AREA_RECORTE: 'Cuánto de su cuadro llena una pieza de recorte',
  APROV_NESTING_simple: 'Aprovechamiento de lámina en corte recto',
  APROV_NESTING_irregular: 'Aprovechamiento en corte irregular',
  APROV_TIRAS: 'Aprovechamiento del fleje',
  PROF_CANTO_CM: 'Profundidad del canto de una letra 3D',
  PROF_CAJA_CM: 'Profundidad de una caja de luz',
  MOD_POR_M2: 'Densidad de LED en letra 3D',
  MOD_POR_M2_CAJA: 'Densidad de LED en caja de luz',
  W_MODULO: 'Consumo de un módulo',
  CAP_FUENTE_W: 'Capacidad nominal de la fuente',
  DERATE_FUENTE: 'Hasta dónde se carga una fuente',
  TRAVESANO_CM: 'Separación entre travesaños del bastidor',
  REMACHE_CM: 'Separación entre remaches',
  SEPARADORES_LETRA: 'Separadores por letra',
  PLAZO_COLCHON_DIAS: 'Días entre «listo» y la instalación',
  PLAZO_PROVEEDOR_DIAS: 'Lo que tarda en llegar el material',
};

const CTE_GRUPO = {
  K_ANCHO_CAJA: 'geometria', K_PERIM_recta: 'geometria', K_PERIM_cursiva: 'geometria',
  K_PERIM_compleja: 'geometria', K_AREA_RECORTE: 'geometria',
  APROV_NESTING_simple: 'aprovechamiento', APROV_NESTING_irregular: 'aprovechamiento',
  APROV_TIRAS: 'aprovechamiento',
  PROF_CANTO_CM: 'taller', PROF_CAJA_CM: 'taller',
  MOD_POR_M2: 'iluminacion', MOD_POR_M2_CAJA: 'iluminacion', W_MODULO: 'iluminacion',
  CAP_FUENTE_W: 'iluminacion', DERATE_FUENTE: 'iluminacion',
  TRAVESANO_CM: 'estructura', REMACHE_CM: 'estructura', SEPARADORES_LETRA: 'estructura',
  PLAZO_COLCHON_DIAS: 'plazo', PLAZO_PROVEEDOR_DIAS: 'plazo',
};
const GRUPOS = [
  ['taller', 'Del taller'],
  ['geometria', 'Geometría de las letras'],
  ['aprovechamiento', 'Cuánto se aprovecha de una lámina'],
  ['iluminacion', 'Iluminación'],
  ['estructura', 'Estructura y herraje'],
  ['plazo', 'Cuánto tarda un trabajo'],
];

/* Las dos constantes que el documento marca con `confirmar:true`. La tercera cosa que
   conviene confirmar no es constante sino fila de catálogo —si la lámina de acrílico es
   1.22 × 2.44 o 1.22 × 1.83—, y se lleva a su renglón del catálogo en vez de inventarle
   una constante que después nadie sabría de dónde salió. */
const CONFIRMAR = ['PROF_CANTO_CM', 'PROF_CAJA_CM'];
const MAT_CONFIRMAR = 'acr-3mm';

const VIEJO_DIAS = 30;

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

/* ============================================================================
   Montaje
   ============================================================================ */

export async function montar(c, ctx) {
  cont = c;
  CTX = ctx || {};

  /* La base cerrada NO se pinta como un almacén vacío. «No tienes material» y «la base no
     abrió» son dos cosas distintas, y la diferencia es la que decide si alguien sale a
     comprar diecinueve cosas que ya están en el estante. */
  const e = DB.estado();
  if (!e.ok) {
    cont.innerHTML =
      '<div class="card"><div class="card-b">' +
      '<p class="hintnote nota-av">' + ico('i-aviso') + ' ' + esc(DB.motivoTexto()) + '</p>' +
      '<p class="vacio-d">El almacén no se perdió: el libro de movimientos vive en la base de ' +
      'este dispositivo y vuelve completo en cuanto abra. No cuentes nada mientras: lo que ' +
      'escribas ahora no se guarda.</p>' +
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>' +
      '</div></div>';
    on(cont, 'click', ev => { if (ev.target.closest('[data-recargar]')) location.reload(); });
    return;
  }

  cont.innerHTML = '<div id="mt-cab"></div><div id="mt-cuerpo"></div><div id="mt-pie"></div>';

  /* Un solo oyente por región, delegado. Las tres listas se repintan completas y un oyente
     por renglón se va con el renglón: seis idas y venidas dejaban seis oyentes vivos
     repintando renglones muertos. Y por eso ningún id de material viaja en un `onclick`
     interpolado: va en un data-* escapado y se lee del dataset. */
  on(cont, 'click', clicCuerpo);
  on($('pf-hoja'), 'click', clicHoja);
  on($('pf-pide'), 'click', clicPide);
  on(window, 'afterprint', trasImprimir);

  await cargar();
}

export function desmontar() {
  for (const [el, tipo, fn] of _oyentes) {
    try { el.removeEventListener(tipo, fn); } catch (_) {}
  }
  _oyentes.length = 0;

  /* La barra fija es del documento, no de este módulo: si se sale con «Recibí lo de la
     lista» puesto, el primer dedo del día lo aprieta creyendo que es de la pantalla que
     está viendo. Se limpia aquí y no en la que sigue. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }

  /* Las capas también son del documento. Salir de Material con el catálogo abierto dejaba
     el velo encima de la Agenda. */
  for (const id of ['pf-pide', 'pf-hoja']) {
    const el = $(id);
    if (el && el.classList.contains('show')) cerrarCapa(id);
    if (el) el.innerHTML = '';
  }
  trasImprimir();

  COMPRA = []; EXIS = []; PROYS = []; CTES = []; CALIB = [];
  REQS = new Map(); FECHA = new Map(); MATS = new Map();
  pide = null;
  cont = null; CTX = null;
}

/* ============================================================================
   Leer
   ============================================================================ */

async function cargar() {
  const cuerpo = $('mt-cuerpo');
  if (cuerpo) {
    cuerpo.innerHTML = '<div class="vacio">' + ico('i-reloj') +
      '<p class="vacio-t">Sumando el libro del almacén…</p></div>';
  }

  /* Todo en paralelo y todo local: esta pantalla se abre en el taller, sin señal, y
     `listaCompra` y `existencias` recorren el libro de movimientos completo cada una. En
     serie se nota en un celular viejo justo cuando alguien está esperando.

     `hastaDias` largo a propósito: la pregunta de esta pantalla no es «¿qué compro esta
     semana?» sino «¿qué me falta?», y hay proyectos ganados con instalación a dos meses
     cuyo acrílico igual hay que pedir. Lo que ordena la lista es la fecha, no el corte. */
  const [compra, exis, proys, insts, mats, ctes, calib] = await Promise.all([
    Stock.listaCompra({ hastaDias: 3650 }),
    Stock.existencias(),
    Proy.listar({ vivos: true }),
    Agenda.listar({ vivas: true }),
    Material.listarMateriales({}),
    /* El origen de cada constante vive en el campo `nota` de su renglón, y §5.5 solo
       expone `constantes()`, que devuelve los valores sin su derivación. Se lee el renglón
       por la capa de datos —db.js es la capa de datos— y solo de lectura: sin la frase de
       dónde salió el número, corregirlo deja de ser leer y cambiar un dígito y se vuelve
       adivinar. */
    DB.listar('constantes'),
    Material.calibracion(),
  ]);

  COMPRA = Array.isArray(compra) ? compra : [];
  EXIS = Array.isArray(exis) ? exis : [];
  MATS = new Map((mats || []).map(m => [m.id, m]));
  CALIB = Array.isArray(calib) ? calib : [];
  CTES = (ctes || []).filter(c => c && c.clave && !String(c.clave).startsWith('_'));

  /* Solo los proyectos que todavía piden material. Un instalado o un cancelado en la
     pestaña «Por proyecto» son doce renglones que nadie va a comprar. */
  PROYS = (proys || []).filter(p => p && !['instalado', 'garantia', 'cancelado'].includes(p.etapa));

  FECHA = new Map();
  for (const i of (insts || [])) {
    if (!i || !i.proyecto_id || !i.fecha) continue;
    const prev = FECHA.get(i.proyecto_id);
    if (!prev || String(i.fecha) < String(prev.fecha)) FECHA.set(i.proyecto_id, i);
  }

  REQS = new Map();
  const reqs = await Promise.all(PROYS.map(p => Material.requerimientos(p.id)));
  PROYS.forEach((p, k) => REQS.set(p.id, reqs[k] || []));

  pintar();
  publicarCuenta();
}

/* ----- Lo que hay que ir a pedir -----
   Una línea con `requiere_dato` cuenta como pendiente aunque su cantidad sea 0: no saber
   cuánto falta no es que no falte. Es el sesgo declarado del sistema —preferimos el falso
   positivo— aplicado a la cuenta de arriba y no solo a los avisos. */
const hayQueComprar = l => num(l.comprar) > 0 || l.confianza === 'requiere_dato';
const porComprar = () => COMPRA.filter(hayQueComprar);
const yaEstan = () => COMPRA.filter(l => !hayQueComprar(l));

function publicarCuenta() {
  if (!CTX || typeof CTX.ponerCuenta !== 'function') return;
  /* Se juntan por material y no se suman: un material bajo mínimo Y pedido por un proyecto
     es UNA cosa que comprar, y contarlo dos veces manda a fabricación a buscar un renglón
     que no existe. Es la misma cuenta que publica Inicio, a propósito: dos números
     distintos en la misma pestaña se leen como que uno de los dos está mal. */
  const ids = new Set();
  for (const l of porComprar()) if (l.material_id) ids.add(l.material_id);
  for (const e of EXIS) {
    if (num(e.min_stock) > 0 && e.cantidad < num(e.min_stock)) ids.add(e.material_id);
  }
  CTX.ponerCuenta('material', ids.size);
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  if (!cont) return;
  const cab = $('mt-cab'), cuerpo = $('mt-cuerpo'), pie = $('mt-pie');
  if (!cab || !cuerpo || !pie) return;

  cab.innerHTML = cuentas() + fila_calibracion() + pestanas();
  cuerpo.innerHTML =
    TAB === 'comprar'  ? tabComprar() :
    TAB === 'almacen'  ? tabAlmacen() :
                         tabProyecto();
  pie.innerHTML = laVerdad();

  pintarMbar();
}

/* ----- Las cuentas -----
   Los tres números que se vienen a leer, arriba y grandes. Para fabricación no aparece
   ninguno de dinero (§8.4): el elemento no existe. */
function cuentas() {
  const pend = porComprar().length;
  const bajos = EXIS.filter(e => num(e.min_stock) > 0 && e.cantidad < num(e.min_stock)).length;
  const viejos = EXIS.filter(esViejo).length;

  const c = [
    unaCuenta(pend, pend === 1 ? 'Material por comprar' : 'Materiales por comprar', pend > 0),
    unaCuenta(bajos, 'Bajo mínimo', bajos > 0),
    unaCuenta(viejos, 'Sin contar en ' + VIEJO_DIAS + ' días', viejos > 0),
  ];

  if (Prefs.veDinero()) {
    const costo = COMPRA.reduce((s, l) => s + num(l.costo), 0);
    /* Sin un solo costo capturado no se pinta «$0.00»: eso se lee como que la compra sale
       gratis. Se pinta el renglón que dice qué falta para que ese número exista. */
    c.push(costo > 0
      ? '<p class="pf-cuenta"><b>' + esc(money(costo)) + '</b>Costo de lo que hay que comprar</p>'
      : '<p class="pf-cuenta"><b>—</b>Sin costos capturados</p>');
  }
  return '<div class="pf-cuentas">' + c.join('') + '</div>';
}

function unaCuenta(n, etiqueta, urge) {
  return '<p class="pf-cuenta' + (urge ? ' urge' : '') + '"><b>' + num(n) + '</b>' +
    esc(etiqueta) + '</p>';
}

function pestanas() {
  const pend = porComprar().length;
  return '<div class="no-papel">' + segmento([
    { v: 'comprar',  t: 'Por comprar' + (pend ? ' · ' + pend : '') },
    { v: 'almacen',  t: 'En almacén' },
    { v: 'proyecto', t: 'Por proyecto' },
  ], TAB, 'data-tab') + '</div>';
}

/* ----- La fila de calibración -----
   Lo que hace que ninguna constante sea un campo obligatorio: el sistema arranca con los
   valores del repositorio, se equivoca a la vista, y cada corrección de fabricación le
   enseña cuánto se equivocó. El mensaje lo escribe `Material.calibracion()` con la
   aritmética hecha; si lo reescribiera aquí, la pantalla y el aviso de Inicio dirían lo
   mismo con dos números distintos. */
function fila_calibracion() {
  if (!CALIB.length) return '';
  const filas = CALIB.map((k, i) => {
    const puede = !!k.constante_sugerida && k.valor_sugerido !== null && k.valor_sugerido !== undefined;
    return '<div class="pf-fila">' +
      '<span class="pf-fila-ico urge">' + ico('i-recalibrar') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">' + esc(k.mensaje) + '</p>' +
        '<p class="pf-fila-d">Salió de ' + num(k.muestras) +
          ' correcciones que fabricación hizo a mano. Si no lo tocas, la plataforma sigue ' +
          'calculando con el número de hoy y con su error a la vista.</p>' +
      '</div>' +
      '<div class="pf-fila-acc">' +
        (puede
          ? '<button type="button" class="btn btn-pri" data-calibrar="' + i + '">Actualizar</button>'
          : '<button type="button" class="btn btn-gho" data-hoja="catalogo">Ver el catálogo</button>') +
      '</div></div>';
  }).join('');

  return '<div class="card no-papel"><div class="card-h"><h2>' + ico('i-recalibrar') +
    ' Lo que el sistema aprendió</h2></div><div class="card-b">' + filas + '</div></div>';
}

/* ============================================================================
   A) POR COMPRAR — y esto se imprime
   ============================================================================ */

function tabComprar() {
  const pedir = porComprar();
  const tengo = yaEstan();

  const acciones =
    '<div class="btn-fila no-papel">' +
      (pedir.some(l => num(l.comprar) > 0)
        ? '<button type="button" class="btn btn-ok" data-recibi>' + ico('i-check') + ' ' +
            textoRecibi(pedir) + '</button>'
        : '') +
      '<button type="button" class="btn btn-gho" data-imprimir>' + ico('i-imprimir') +
        ' Imprimir la lista</button>' +
    '</div>';

  const cuerpo = pedir.length
    ? pedir.map(filaCompra).join('')
    : vacio('No hay nada que comprar',
        'Cada material que piden los proyectos abiertos ya está en el almacén. Cuando ganes ' +
        'una cotización nueva, lo que falte aparece aquí con la fecha que lo exige.',
        '<button type="button" class="btn btn-gho" data-tab="proyecto">Ver qué pide cada proyecto</button>');

  /* El sello de quién y cuándo va en la hoja porque la hoja sale del taller: quien la lea
     en la vidriería tiene que poder saber si es la de hoy o la del martes pasado. */
  const sello = '<p class="mat-sello">Lista de compra · ' + esc(fmtFecha(hoyISO())) +
    ' · ' + esc(Prefs.sello()) + '</p>';

  const card = '<div class="card"><div class="card-h"><h2>' + ico('i-material') +
    ' Hay que comprar' + (pedir.length ? ' <span class="folio">' + pedir.length + '</span>' : '') +
    '</h2></div><div class="card-b">' +
    sello +
    (pedir.length ? acciones : '') +
    cuerpo +
    (pedir.length ? notaCompra(pedir) : '') +
    '</div></div>';

  /* Lo que ya está en el taller se pinta —«faltan 0, hay 2.4 láminas, esto usa 0.54» es la
     respuesta a una pregunta que alguien se hizo— pero no se imprime: una hoja de compra
     con renglones que dicen «no compres esto» se lee mal en el mostrador. */
  const cubierto = tengo.length
    ? '<div class="card no-papel"><div class="card-h"><h2>' + ico('i-check') +
      ' Ya está en el taller <span class="folio">' + tengo.length + '</span></h2></div>' +
      '<div class="card-b">' + tengo.map(filaCompra).join('') + '</div></div>'
    : '';

  return card + cubierto;
}

function textoRecibi(pedir) {
  const n = pedir.filter(l => num(l.comprar) > 0).length;
  return n === 1 ? 'Recibí lo de la lista (1 material)' : 'Recibí lo de la lista (' + n + ' materiales)';
}

function notaCompra(pedir) {
  const sinCosto = Prefs.veDinero() && pedir.every(l => l.costo === null || l.costo === undefined);
  return '<p class="pf-nota no-papel">Las cantidades se suman de TODOS los proyectos abiertos antes de ' +
    'redondear: dos proyectos que piden 0.48 y 0.70 láminas con media en el estante son una ' +
    'lámina, no dos. Si algo llegó incompleto, arréglalo en <b>En almacén</b> con «Corregir»: ' +
    'un conteo manda sobre el libro.' +
    (sinCosto
      ? ' Ningún material tiene costo capturado todavía, así que esta lista da cantidades y no pesos: se ponen en el catálogo, uno por uno, cuando haya factura a la mano.'
      : '') +
    '</p>';
}

function filaCompra(l) {
  const mat = MATS.get(l.material_id) || null;
  const comprar = num(l.comprar);
  const faltaDato = l.confianza === 'requiere_dato';
  const veDinero = Prefs.veDinero();

  /* La medida como la dice el proveedor, con su unidad delante: «lámina 1.22 × 2.44 m» es
     lo que se pide en el mostrador; «2.9768» es lo que se calcula con eso. */
  const medida = [UC[l.unidad_compra] || l.unidad_compra, mat && mat.medida ? mat.medida : '']
    .filter(Boolean).join(' ');

  const proyectos = (l.proyectos || []);
  const paraQuien = proyectos.length
    ? 'Para ' + proyectos.slice(0, 3).map(p => p.nombre + (p.fecha ? ' (' + cuando(p.fecha) + ')' : ' (sin fecha)')).join(', ') +
      (proyectos.length > 3 ? ' y ' + (proyectos.length - 3) + ' más' : '')
    : (l.motivo === 'minimo'
        ? 'Reposición de mínimo: no lo pide ningún proyecto, se repone para no quedarse sin.'
        : 'Ningún proyecto abierto lo pide.');

  const grande = faltaDato && comprar <= 0
    ? '<div class="mat-cant falta">?<small>falta un dato</small></div>'
    : '<div class="mat-cant' + (comprar > 0 ? ' falta' : ' cero') + '">' +
        esc(comprar > 0 ? uc(comprar, l.unidad_compra) : '0 ' + un(0, l.unidad_compra)) +
        /* `cantHay` y no `cant`: la existencia puede ser negativa —material consumido que nunca
           se registró como entrada— y «hay -0.31» se lee como un error del programa. */
        /* «no hay nada», no «hay nada»: cantHay devuelve la CANTIDAD y en cero esa cantidad
           es la palabra «nada», que en español pide la negación delante. En la lista de
           compra —que es la pantalla que se lleva impresa a la vidriería— se leía
           «hay nada · piden 0». */
        '<small>' + esc((num(l.disponible) <= 0 ? 'no hay ' : 'hay ') +
          cantHay(l.disponible) + ' · piden ' + cant(l.requerido)) + '</small>' +
      '</div>';

  return '<div class="mat-fila">' +
    '<div>' +
      /* La casilla solo existe en papel: en pantalla un renglón se toca, en la vidriería se
         tacha. La regla vive en el @media print de plataforma.css. */
      '<div class="mat-n"><span class="compra-check" aria-hidden="true"></span>' +
        esc(mat ? mat.nombre : l.nombre || l.material_id) + '</div>' +
      (medida ? '<div class="mat-med">' + esc(medida) + '</div>' : '') +
      '<div class="mat-med">' + esc(paraQuien) + '</div>' +
      '<div>' + chipCuando(l.fecha) +
        ' <span class="mat-conf ' + esc(l.confianza || 'estimada') + '">' +
          esc(confPalabra(l.confianza)) + '</span>' +
        (comprar <= 0 && !faltaDato ? ' <span class="pf-sem ok">Ya lo tienes</span>' : '') +
      '</div>' +
    '</div>' +
    grande +
    (l.requiere ? '<div class="mat-nota">' + esc(l.requiere) + '</div>' : '') +
    (veDinero && comprar > 0
      ? '<div class="mat-nota">Costo: ' + (l.costo === null || l.costo === undefined
          ? '— (no hay costo capturado para este material)'
          : esc(money(l.costo))) + '</div>'
      : '') +
    (l.derivado
      ? '<div class="mat-nota">' + esc(l.sello || 'nunca contado') +
        ': el «hay» sale del libro, no de haber visto el estante.</div>'
      : '') +
    (l.tel_proveedor
      ? '<div class="mat-acc btn-fila no-papel"><a class="btn-wa" href="' +
        esc(linkWa(l.tel_proveedor, textoProveedor(l))) + '" target="_blank" rel="noopener">' +
        ico('i-wa') + 'Pedirlo por WhatsApp</a></div>'
      : '') +
  '</div>';
}

/** El pedido, ya escrito. Sin precio: se le pregunta a él, no se le dice. */
function textoProveedor(l) {
  const mat = MATS.get(l.material_id) || null;
  return 'Buenas, de AL3D. ¿Tienes ' + uc(l.comprar, l.unidad_compra) + ' de ' +
    (mat ? mat.nombre : l.nombre || l.material_id) +
    (mat && mat.medida ? ' (' + mat.medida + ')' : '') + '? ¿En cuánto sale?';
}

/** La ficha de cuándo, siempre con palabra: un chip ámbar sin texto no le dice nada a quien
 *  no distingue el ámbar del gris, y este renglón se lee para decidir si hay que ir hoy. */
function chipCuando(fecha) {
  if (!fecha) return '<span class="pf-cuando lejos">sin fecha</span>';
  const d = diasHasta(fecha);
  const k = d === null ? 'lejos' : (d < 0 ? 'tarde' : (d <= 3 ? 'hoy' : 'lejos'));
  return '<span class="pf-cuando ' + k + '">se instala ' + esc(cuando(fecha)) + '</span>';
}

/* ============================================================================
   B) EN ALMACÉN
   ============================================================================ */

const esViejo = e => e && (e.frescura_dias === null || num(e.frescura_dias) > VIEJO_DIAS);

function tabAlmacen() {
  if (!EXIS.length) {
    return '<div class="card"><div class="card-b">' +
      vacio('El catálogo de material está vacío',
        'Sin catálogo no hay almacén ni cantidades: la plataforma no sabe qué es una lámina. ' +
        'Siembra las diecinueve filas de arranque recargando, o da de alta la primera a mano.',
        '<button type="button" class="btn btn-pri" data-hoja="catalogo">Abrir el catálogo</button>') +
      '</div></div>';
  }

  /* En el orden del catálogo, no por lo que urge: una lista que se reordena entre dos
     aperturas se lee como si hubiera cambiado, y ésta se recorre con el estante enfrente,
     renglón por renglón, en el mismo orden todos los meses. Lo que urge ya está marcado. */
  const filas = EXIS.map(filaExistencia).join('');

  return '<div class="card"><div class="card-h"><h2>' + ico('i-material') +
    ' En almacén <span class="folio">' + EXIS.length + '</span></h2></div>' +
    '<div class="card-b">' +
    '<p class="hintnote">«Así está» graba el conteo con el número que la plataforma ya tenía, ' +
    'sin teclearlo. Sin ese botón el conteo del mes son diecinueve números capturados a mano ' +
    'en un almacén, y eso se hace una vez y nunca más: teclea solo los que no cuadren.</p>' +
    filas +
    '<p class="pf-nota">Una existencia no es un número guardado: es el último conteo más todo ' +
    'lo que se movió después. Por eso nunca se pierde y por eso siempre trae su fecha.</p>' +
    '</div></div>';
}

function filaExistencia(e) {
  const bajo = num(e.min_stock) > 0 && e.cantidad < num(e.min_stock);
  const viejo = esViejo(e);
  const mat = MATS.get(e.material_id) || null;
  const veDinero = Prefs.veDinero();

  const medida = [UC[e.unidad_compra] || e.unidad_compra, mat && mat.medida ? mat.medida : '']
    .filter(Boolean).join(' ');

  const marcas = [];
  if (bajo) {
    marcas.push('<span class="pf-sem falta">Bajo mínimo · ' +
      esc(uc(e.min_stock, e.unidad_compra)) + '</span>');
  }
  if (viejo) {
    marcas.push('<span class="mat-conf requiere_dato">' +
      (e.frescura_dias === null ? 'Nunca contado' : 'Sin contar en ' + num(e.frescura_dias) + ' días') +
      '</span>');
  }
  if (!e.existe) marcas.push('<span class="mat-conf requiere_dato">Ya no está en el catálogo</span>');

  return '<div class="mat-fila">' +
    '<div>' +
      '<div class="mat-n">' + esc(e.nombre) + '</div>' +
      (medida ? '<div class="mat-med">' + esc(medida) + '</div>' : '') +
      '<div class="mat-sello' + (viejo ? ' viejo' : '') + '">' + esc(e.sello) + '</div>' +
      (marcas.length ? '<div>' + marcas.join(' ') + '</div>' : '') +
    '</div>' +
    '<div class="mat-cant' + (bajo ? ' falta' : (e.cantidad <= 0 ? ' cero' : '')) + '">' +
      esc(uc(e.cantidad, e.unidad_compra)) +
      (num(e.comprometido) > 0
        ? '<small>' + esc(cant(e.comprometido) + ' ya con dueño · libre ' + cant(e.libre)) + '</small>'
        : '') +
    '</div>' +
    (veDinero && e.costo_compra !== null && e.costo_compra !== undefined
      ? '<div class="mat-nota">' + esc(money(e.costo_compra)) + ' por ' +
        esc(UC[e.unidad_compra] || e.unidad_compra) + ' · en el estante ' +
        esc(money(num(e.cantidad) * num(e.costo_compra))) + '</div>'
      : '') +
    '<div class="mat-acc btn-fila no-papel">' +
      '<button type="button" class="btn btn-ok" data-asi="' + esc(e.material_id) + '">' +
        'Así está' + '</button>' +
      '<button type="button" class="btn btn-gho" data-contar="' + esc(e.material_id) + '">' +
        'Corregir' + '</button>' +
      (bajo && e.tel_proveedor
        ? '<a class="btn-wa" href="' + esc(linkWa(e.tel_proveedor,
            'Buenas, de AL3D. ¿Tienes ' + (mat ? mat.nombre : e.nombre) + '? Se nos acabó.')) +
          '" target="_blank" rel="noopener">' + ico('i-wa') + 'Pedirlo</a>'
        : '') +
    '</div>' +
  '</div>';
}

/* ============================================================================
   C) POR PROYECTO — con la fórmula al lado
   ============================================================================ */

function tabProyecto() {
  if (!PROYS.length) {
    return '<div class="card"><div class="card-b">' +
      vacio('No hay proyectos abiertos que pidan material',
        'Cuando marques una cotización como ganada, la plataforma deriva su material de las ' +
        'partidas y aparece aquí, línea por línea y con la cuenta a la vista.',
        '<button type="button" class="btn btn-gho" data-ir="proyectos">Ir a Proyectos</button>') +
      '</div></div>';
  }

  const aviso = '<p class="hintnote nota-av">' + ico('i-recalibrar') +
    ' Cada cantidad que corrijas aquí arregla el sistema, no solo el renglón: la plataforma ' +
    'guarda cuánto se usó de verdad contra cuánto había calculado y, con cinco correcciones ' +
    'que digan lo mismo, propone el factor nuevo. Corregir es el trabajo que hace que los ' +
    'números dejen de estar supuestos.</p>';

  return aviso + PROYS.map(cardProyecto).join('');
}

function cardProyecto(p) {
  const reqs = REQS.get(p.id) || [];
  const inst = FECHA.get(p.id) || null;
  const etapa = Proy.ETAPA_NOMBRE[p.etapa] || p.etapa || 'ganado';

  const cab = '<div class="card-h"><h2>' + ico('i-proyectos') + ' ' +
    esc(p.nombre || p.folio_local || 'Proyecto sin nombre') + '</h2>' +
    '<span class="pf-etapa ' + esc(claseEtapa(p.etapa)) + '">' + esc(etapa) + '</span></div>';

  const sub = '<p class="mat-med">' + esc(p.folio_local || '') +
    (inst && inst.fecha
      ? ' · se instala ' + esc(fmtFecha(inst.fecha)) + ' (' + esc(cuando(inst.fecha)) + ')'
      : ' · sin fecha de instalación') + '</p>';

  const cuerpo = reqs.length
    ? reqs.map(r => filaReq(p, r)).join('')
    : '<p class="hintnote nota-av">' + ico('i-aviso') +
      ' A este proyecto todavía nadie le derivó el material. Se calcula de sus partidas, sin ' +
      'capturar nada.</p>' +
      '<button type="button" class="btn btn-pri no-papel" data-recalcular="' + esc(p.id) + '">' +
      'Calcular el material</button>';

  return '<div class="card">' + cab + '<div class="card-b">' + sub + cuerpo +
    (reqs.length
      ? '<p class="mat-sello">Calculado con las constantes ' +
          esc(reqs[0].constantes_version || 'sin versión') + '. La versión se congela en cada ' +
          'línea: cambiar una constante hoy no reescribe lo que ya se compró.</p>' +
        '<button type="button" class="btn btn-gho no-papel" data-recalcular="' + esc(p.id) +
        '">Recalcular con las partidas de hoy</button>'
      : '') +
    '</div></div>';
}

const claseEtapa = e => (e === 'garantia' || e === 'cancelado') ? 'cerrado' : String(e || 'ganado');

function filaReq(p, r) {
  const mat = MATS.get(r.material_id) || null;
  const ajustada = r.cantidad_ajustada !== null && r.cantidad_ajustada !== undefined;
  const usa = ajustada ? num(r.cantidad_ajustada) : num(r.cantidad_compra);

  return '<div class="mat-fila">' +
    '<div>' +
      '<div class="mat-n">' + esc(mat ? mat.nombre : r.material_id) + '</div>' +
      '<div class="mat-med">' + esc(mat
        ? [UC[mat.unidad_compra] || mat.unidad_compra, mat.medida].filter(Boolean).join(' ')
        : 'No está en el catálogo de material') + '</div>' +
      '<div>' +
        '<span class="mat-conf ' + esc(r.confianza || 'estimada') + '">' +
          esc(confPalabra(r.confianza)) + '</span>' +
        (ajustada ? ' <span class="mat-conf exacta">Corregido a mano</span>' : '') +
        (r.estado && r.estado !== 'calculado'
          ? ' <span class="pf-sem nada">' + esc(estadoReq(r.estado)) + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="mat-cant">' + esc(uc(usa, r.unidad_compra)) +
      '<small>' + esc(ucn(r.cantidad_consumo, r.unidad_consumo)) + '</small></div>' +
    /* La fórmula, siempre y también en papel. Es lo que convierte «0.29 láminas» en un
       número que alguien puede desarmar el día que el corte salga corto. */
    (r.formula ? '<div class="mat-formula">' + esc(r.formula) + '</div>' : '') +
    (r.requiere ? '<div class="mat-nota">' + esc(r.requiere) + '</div>' : '') +
    (ajustada
      ? '<div class="mat-nota">Corregido de ' + esc(cant(r.cantidad_compra)) + ' a ' +
        esc(cant(r.cantidad_ajustada)) + ' por ' + esc(r.ajustado_por || 'alguien') +
        (r.motivo_ajuste ? ': ' + esc(r.motivo_ajuste) : ' — sin razón escrita') + '</div>'
      : '') +
    '<div class="mat-acc btn-fila no-papel">' +
      '<button type="button" class="btn btn-gho" data-ajustar="' + esc(r.id) + '">' +
        ico('i-ajustar') + ' Ajustar</button>' +
    '</div>' +
  '</div>';
}

const ESTADO_REQ = { apartado: 'Apartado', comprado: 'Ya comprado', consumido: 'Ya salió del almacén' };
const estadoReq = e => ESTADO_REQ[e] || String(e || '');

/* ----- La verdad del final -----
   Va siempre, en letra chica y sin caja. No es un consejo: es cómo funciona el sistema, y
   sin decirlo alguien va a comparar un precio de la plataforma con el ejemplo de su propia
   página de Notion y va a creer que hay un error de $10. */
function laVerdad() {
  return '<p class="pf-nota no-papel">Los dos tarifarios de AL3D cobran por ejes distintos: el ' +
    '<b>catálogo del cotizador</b> cobra por MATERIAL —$30 el aluminio pintado, $55 el acero, ' +
    'más $5 la cursiva o $10 la compleja—, y la página <b>«¿Cómo Cotizar?»</b> de Notion cobra ' +
    'por TIPO DE LETRA —$30 / $35 / $40 / $50, con −20 % sin iluminación—. Manda el catálogo ' +
    'del cotizador, que es más nuevo y es el que está en producción: si un precio no cuadra con ' +
    'el ejemplo de Notion, no es un error, son dos tarifarios. Y el material de esta pantalla ' +
    'no sale de ninguno de los dos: sale de las medidas de las partidas.</p>' +
    '<div class="btn-fila no-papel">' +
      '<button type="button" class="btn btn-gho" data-hoja="catalogo">' +
        ico('i-material') + ' Catálogo de material</button>' +
      '<button type="button" class="btn btn-gho" data-hoja="constantes">' +
        ico('i-regla') + ' Constantes del taller</button>' +
    '</div>';
}

/* ----- La barra fija del teléfono -----
   La acción principal de fabricación en la calle es una sola: acabo de recibir lo de la
   lista. Solo aparece en la pestaña donde significa algo; en las otras dos la barra no
   existe, porque un botón que no lleva a ningún lado ocupa el lugar donde el pulgar espera
   encontrar algo. */
function pintarMbar() {
  const b = $('pf-mbar');
  if (!b) return;
  const pedir = porComprar().filter(l => num(l.comprar) > 0);
  if (TAB !== 'comprar' || !pedir.length) {
    b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); return;
  }
  b.innerHTML = '<button type="button" class="btn btn-ok" data-recibi>' +
    esc(textoRecibi(pedir)) + '</button>';
  b.hidden = false;
  b.onclick = ev => {
    const btn = ev.target.closest('[data-recibi]');
    if (btn) conBoton(btn, recibirTodo);
  };
  ajustarAltoBarra();
}

/* ============================================================================
   Las acciones del cuerpo
   ============================================================================ */

async function clicCuerpo(ev) {
  const t = ev.target;

  const tab = t.closest('[data-tab]');
  if (tab) { TAB = tab.dataset.tab; pintar(); return; }

  const ir = t.closest('[data-ir]');
  if (ir) { if (CTX && CTX.ir) CTX.ir(ir.dataset.ir); return; }

  const hoja = t.closest('[data-hoja]');
  if (hoja) { abrirHoja(hoja.dataset.hoja); return; }

  if (t.closest('[data-imprimir]')) { imprimir(); return; }
  const rb = t.closest('[data-recibi]');
  if (rb) { await conBoton(rb, recibirTodo); return; }

  const asi = t.closest('[data-asi]');
  if (asi) { await conBoton(asi, () => aceptarDerivado(asi.dataset.asi)); return; }

  const contarBtn = t.closest('[data-contar]');
  if (contarBtn) { abrirContar(contarBtn.dataset.contar); return; }

  const aj = t.closest('[data-ajustar]');
  if (aj) { abrirAjustar(aj.dataset.ajustar); return; }

  const rec = t.closest('[data-recalcular]');
  if (rec) { await conBoton(rec, () => recalcular(rec.dataset.recalcular)); return; }

  const cal = t.closest('[data-calibrar]');
  if (cal) { await conBoton(cal, () => aplicarCalibracion(Number(cal.dataset.calibrar))); return; }
}

/** Un botón que dispara una mutación se apaga mientras dura. Sin esto, dos toques nerviosos
 *  en «Recibí lo de la lista» meten el material dos veces, y deshacerlo es un conteo. */
async function conBoton(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } catch (e) {
    /* Una mutación de la capa de datos no lanza nunca; si algo llega aquí es un error de
       programación de esta pantalla y se dice, en vez de dejar el botón muerto. */
    console.error('la acción de material falló', e);
    toast('Algo se rompió al hacer eso. Recarga la plataforma y vuelve a intentarlo.', 'err', 4600);
  }
  if (btn.isConnected) btn.disabled = false;
}

/* ----- «Recibí lo de la lista» -----
   Un toque y entran todas. Es a propósito que no haya casillas en pantalla: la casilla es
   de la hoja de papel, que es donde fabricación va tachando en la vidriería. Y por eso el
   botón dice cuántos materiales va a meter antes de tocarlo, no después: es la única
   advertencia que hace falta, y una pregunta de «¿seguro?» encima de un gesto que ya se
   hizo con la remisión en la mano es la que enseña a darle sí sin leer. Si algo llegó
   incompleto, el arreglo es un conteo en «En almacén», que manda sobre el libro. */
async function recibirTodo() {
  const lineas = porComprar()
    .filter(l => num(l.comprar) > 0)
    .map(l => ({
      material_id: l.material_id,
      cantidad: num(l.comprar),
      /* El costo solo viaja si existe. Un `costo_total:0` en el libro es peor que un hueco:
         se suma al valor del inventario como si el material hubiera sido gratis. */
      costo_total: (l.costo === null || l.costo === undefined) ? undefined : num(l.costo),
      nota: 'Recibido de la lista de compra del ' + fmtFecha(hoyISO()),
    }));

  if (!lineas.length) { toast('No hay nada marcado para comprar en esta lista', 'err', 3600); return; }

  const r = await Stock.recibirCompra(lineas);
  if (!avisarResultado(r)) return;
  const n = r.valor.movimientos;
  toast('Entraron ' + n + (n === 1 ? ' material' : ' materiales') + ' al almacén' +
    (r.valor.costo_total ? ' · ' + money(r.valor.costo_total) : '') +
    '. Si algo llegó incompleto, corrígelo con un conteo.', 'ok', 5200);
  await cargar();
}

async function aceptarDerivado(id) {
  const r = await Stock.aceptarDerivado(id);
  if (!avisarResultado(r)) return;
  toast('Contado: quedó en ' + uc(r.valor.ahora, unidadDe(id)) + ' con la fecha de hoy', 'ok', 4200);
  await cargar();
}

const unidadDe = id => {
  const e = EXIS.find(x => x.material_id === id);
  return e ? e.unidad_compra : 'unidad';
};

async function recalcular(id) {
  const r = await Material.recalcular(id);
  if (!avisarResultado(r)) return;
  const n = (r.valor && r.valor.lineas ? r.valor.lineas.length : 0);
  const sin = (r.valor && r.valor.sinMaterial ? r.valor.sinMaterial.length : 0);
  toast(n + (n === 1 ? ' línea de material calculada' : ' líneas de material calculadas') +
    (sin ? ' · ' + sin + (sin === 1 ? ' partida sin material calculable' : ' partidas sin material calculable') +
      ', captúrala si la quieres en el almacén' : ''), 'ok', 5200);
  await cargar();
}

async function aplicarCalibracion(i) {
  const k = CALIB[i];
  if (!k || !k.constante_sugerida) return;
  const r = await Material.guardarConstante(k.constante_sugerida, k.valor_sugerido,
    'Calibración: ' + k.muestras + ' correcciones de ' + k.familia + ' dieron una razón media de ' +
    k.razon + ' contra lo calculado.');
  if (!avisarResultado(r)) return;
  toast(k.constante_sugerida + ' quedó en ' + k.valor_sugerido +
    '. Lo que se calcule de aquí en adelante ya la usa; lo ya comprado no se toca.', 'ok', 5200);
  await cargar();
}

/* ============================================================================
   El modal grande: catálogo y constantes — 'pf-hoja'
   ============================================================================ */

function abrirHoja(modo) {
  hojaModo = modo === 'constantes' ? 'constantes' : 'catalogo';
  const capa = $('pf-hoja');
  if (!capa) return;
  capa.innerHTML = htmlHoja();
  abrirCapa('pf-hoja', { hist: true });
}

function repintarHoja() {
  const capa = $('pf-hoja');
  if (!capa || !capa.classList.contains('show')) return;
  capa.innerHTML = htmlHoja();
}

function htmlHoja() {
  const seg = segmento([
    { v: 'catalogo', t: 'Catálogo · ' + MATS.size },
    { v: 'constantes', t: 'Constantes · ' + Object.keys(CTE_TITULO).length },
  ], hojaModo, 'data-hmodo');

  return '<div class="pf-panel">' +
    '<div class="pf-panel-h">' +
      '<h2>' + (hojaModo === 'catalogo' ? 'Catálogo de material' : 'Constantes del taller') + '</h2>' +
      '<button type="button" class="pf-cerrar" data-cerrar-hoja aria-label="Cerrar">' +
        ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b">' + seg +
      (hojaModo === 'catalogo' ? htmlCatalogo() : htmlConstantes()) +
    '</div>' +
    (hojaModo === 'constantes'
      ? '<div class="pf-panel-f">' +
          '<button type="button" class="btn btn-gho" data-cerrar-hoja>Cerrar</button>' +
          '<button type="button" class="btn btn-pri" data-guardar-ctes>Guardar lo que cambiaste</button>' +
        '</div>'
      : '<div class="pf-panel-f">' +
          '<button type="button" class="btn btn-gho" data-cerrar-hoja>Cerrar</button>' +
        '</div>') +
  '</div>';
}

/* ----- El catálogo -----
   Diecinueve filas con su `factor_origen` a la vista. Ese texto es la única defensa
   auditable contra un número inventado que en tres meses nadie puede rastrear, y por eso
   se pinta completo aquí y `Material.guardarMaterial` lo rechaza vacío. */
function htmlCatalogo() {
  const mats = [...MATS.values()];
  if (!mats.length) {
    return vacio('El catálogo está vacío',
      'La plataforma siembra diecinueve filas al abrir. Si no hay ninguna, recarga: la siembra ' +
      'corre en el arranque y no pisa nada que ya hayas editado.');
  }
  const veDinero = Prefs.veDinero();
  const filas = mats.map(m => {
    const e = EXIS.find(x => x.material_id === m.id) || null;
    return '<div class="mat-fila">' +
      '<div>' +
        '<div class="mat-n">' + esc(m.nombre) + ' <span class="folio">' + esc(m.id) + '</span></div>' +
        '<div class="mat-med">' + esc([UC[m.unidad_compra] || m.unidad_compra, m.medida]
          .filter(Boolean).join(' ')) + ' · familia ' + esc(m.familia || 'sin familia') + '</div>' +
        '<div class="mat-med">Merma ' + esc(String(Math.round(num(m.merma_pct) * 100))) + ' % · ' +
          'mínimo de compra ' + esc(uc(m.min_compra, m.unidad_compra)) +
          (num(m.min_stock) > 0 ? ' · avisa bajo ' + esc(uc(m.min_stock, m.unidad_compra)) : ' · sin mínimo de almacén') +
          (m.fraccionable ? ' · un retazo sirve' : ' · no se parte') + '</div>' +
        (veDinero
          ? '<div class="mat-med">Costo: ' + (m.costo_compra === null || m.costo_compra === undefined
              ? '— (sin capturar)'
              : esc(money(m.costo_compra)) + ' por ' + esc(UC[m.unidad_compra] || m.unidad_compra)) + '</div>'
          : '') +
        (m.proveedor ? '<div class="mat-med">Proveedor: ' + esc(m.proveedor) + '</div>' : '') +
      '</div>' +
      '<div class="mat-cant">' + esc(cant(m.factor)) +
        '<small>' + esc((U_CONS[m.unidad_consumo] || m.unidad_consumo) + ' por ' +
          (UC[m.unidad_compra] || m.unidad_compra)) + '</small></div>' +
      '<div class="mat-formula">' + esc(m.factor_origen || 'Sin origen escrito') + '</div>' +
      (e ? '<div class="mat-nota">En el estante: ' + esc(uc(e.cantidad, e.unidad_compra)) +
        ' · ' + esc(e.sello) + '</div>' : '') +
      '<div class="mat-acc btn-fila">' +
        '<button type="button" class="btn btn-gho" data-editmat="' + esc(m.id) + '">' +
          ico('i-lapiz') + ' Editar</button>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<p class="hintnote">Cada factor dice cuánto rinde UNA unidad de compra, y debajo está ' +
    'de dónde salió. Ninguno de estos números existía en Notion ni en Drive: son un punto de ' +
    'partida razonado. Verifica el que toques con tu proveedor en la primera compra.</p>' +
    (veDinero
      ? '<p class="hintnote">Los costos son opcionales y arrancan vacíos. Sin costos la ' +
        'plataforma da CANTIDADES, que es el 80 % del valor: nada se bloquea por no tener precio.</p>'
      : '') +
    filas;
}

/* ----- Las constantes -----
   Se editan una vez y ninguna se captura por proyecto. Cada una lleva su derivación escrita
   para que corregirla sea leer una frase y cambiar un dígito: un número sin su cuenta no se
   corrige, se hereda. */
function htmlConstantes() {
  const porClave = new Map(CTES.map(c => [c.clave, c]));
  const claves = Object.keys(CTE_TITULO);

  const pendientes =
    '<div class="card"><div class="card-h"><h2>' + ico('i-regla') +
    ' Los tres números que conviene que confirmes</h2></div><div class="card-b">' +
    '<p class="hintnote nota-av">' + ico('i-aviso') +
    ' Son los tres que más cambian de taller a taller. La plataforma funciona sin tocarlos y ' +
    'marca cada línea como «Estimado»; confirmarlos son tres toques, una vez en la vida.</p>' +
    CONFIRMAR.map(k => filaConstante(k, porClave.get(k), true)).join('') +
    /* El tercero no es constante: es la medida de la lámina de acrílico, que vive en su fila
       del catálogo con su factor. Inventarle una constante propia habría creado dos lugares
       donde dice de qué tamaño es la lámina, y el día que difieran nadie sabría cuál gana. */
    '<div class="mat-fila">' +
      '<div>' +
        '<div class="mat-n">¿Tu lámina de acrílico es 1.22 × 2.44 m o 1.22 × 1.83 m?</div>' +
        '<div class="mat-med">No es constante de taller: es la medida de la fila ' +
          '«' + esc(MAT_CONFIRMAR) + '» del catálogo, y de ahí sale su factor.</div>' +
      '</div>' +
      '<div class="mat-cant">' + esc(cant(factorDe(MAT_CONFIRMAR))) +
        '<small>m² por lámina</small></div>' +
      '<div class="mat-acc btn-fila">' +
        '<button type="button" class="btn btn-gho" data-editmat="' + esc(MAT_CONFIRMAR) + '">' +
          ico('i-lapiz') + ' Ver y corregir la lámina</button>' +
      '</div>' +
    '</div>' +
    '</div></div>';

  const grupos = GRUPOS.map(([g, titulo]) => {
    const ks = claves.filter(k => CTE_GRUPO[k] === g && !CONFIRMAR.includes(k));
    if (!ks.length) return '';
    return '<div class="card"><div class="card-h"><h2>' + esc(titulo) + '</h2></div>' +
      '<div class="card-b">' + ks.map(k => filaConstante(k, porClave.get(k), false)).join('') +
      '</div></div>';
  }).join('');

  return pendientes + grupos +
    '<p class="pf-nota">Cada requerimiento congela con qué versión de constantes se calculó, ' +
    'por la misma razón por la que el cotizador congela el importe de una partida: para poder ' +
    'contestar «¿con qué números salió esto?». Cambiar una constante no reescribe lo ya ' +
    'comprado ni lo ya consumido.</p>';
}

const factorDe = id => { const m = MATS.get(id); return m ? num(m.factor) : 0; };

function filaConstante(clave, fila, destacada) {
  const valor = fila && isFinite(Number(fila.valor)) ? Number(fila.valor) : null;
  const confirmada = !!(fila && String(fila.actualizado_por || '').trim());
  const origen = (fila && fila.nota) ? fila.nota : 'Sin derivación escrita en este dispositivo.';

  return '<div class="mat-fila">' +
    '<div>' +
      '<div class="mat-n">' + esc(CTE_TITULO[clave] || clave) +
        ' <span class="folio">' + esc(clave) + '</span></div>' +
      (fila && fila.unidad ? '<div class="mat-med">' + esc(fila.unidad) + '</div>' : '') +
      '<div>' + (confirmada
        ? '<span class="mat-conf exacta">Confirmada por ' + esc(fila.actualizado_por) + '</span>'
        : '<span class="mat-conf ' + (destacada ? 'requiere_dato' : 'estimada') + '">' +
          (destacada ? 'Sin confirmar' : 'Valor del repositorio') + '</span>') + '</div>' +
    '</div>' +
    '<div class="fld">' +
      '<label for="cte-' + esc(clave) + '">Valor</label>' +
      '<input type="number" step="any" id="cte-' + esc(clave) + '" data-cte="' + esc(clave) + '"' +
        ' value="' + esc(valor === null ? '' : String(valor)) + '"' +
        ' data-antes="' + esc(valor === null ? '' : String(valor)) + '"></div>' +
    '<div class="mat-formula">' + esc(origen) + '</div>' +
  '</div>';
}

async function clicHoja(ev) {
  const t = ev.target;
  if (t.closest('[data-cerrar-hoja]')) { cerrarCapa('pf-hoja'); return; }

  const m = t.closest('[data-hmodo]');
  if (m) { hojaModo = m.dataset.hmodo; repintarHoja(); return; }

  const ed = t.closest('[data-editmat]');
  if (ed) { abrirEditarMaterial(ed.dataset.editmat); return; }

  const g = t.closest('[data-guardar-ctes]');
  if (g) { await conBoton(g, guardarConstantes); return; }
}

/** Se guardan SOLO las que cambiaron. Guardar las dieciocho en cada toque escribiría
 *  «cambiada por Beto» en diecisiete constantes que nadie tocó, y el rastro de quién movió
 *  qué —que es para lo que existe la nota— dejaría de servir para nada. */
async function guardarConstantes() {
  const capa = $('pf-hoja');
  if (!capa) return;
  const campos = [...capa.querySelectorAll('[data-cte]')];
  const cambios = campos.filter(i => String(i.value).trim() !== String(i.dataset.antes).trim());

  if (!cambios.length) {
    toast('No cambiaste ningún número. Escribe el valor nuevo encima del que está.', '', 3600);
    return;
  }

  let bien = 0;
  const malas = [];
  for (const i of cambios) {
    const r = await Material.guardarConstante(i.dataset.cte, i.value);
    if (r.ok) bien++;
    else malas.push(r.mensaje);
  }

  /* Se recarga la pantalla de abajo aunque alguna haya fallado: las que sí entraron ya
     cambian los cálculos, y dejar la lista vieja enseñando el número anterior es la forma
     más rápida de que alguien lo escriba dos veces. */
  await cargar();
  repintarHoja();

  if (malas.length) {
    toast(malas[0], 'err', 5600);
    return;
  }
  toast(bien === 1 ? 'Constante guardada — lo que se calcule de aquí en adelante ya la usa'
                   : bien + ' constantes guardadas — lo que se calcule de aquí en adelante ya las usa',
    'ok', 4600);
}

/* ============================================================================
   El modal chico: contar, ajustar y editar un material — 'pf-pide'
   ============================================================================ */

function abrirPide(html, estado) {
  const capa = $('pf-pide');
  if (!capa) return;
  capa.innerHTML = '<div class="pf-panel">' + html + '</div>';
  pide = estado;
  abrirCapa('pf-pide', { hist: true });
}

function cerrarPide() {
  pide = null;
  cerrarCapa('pf-pide');
  const capa = $('pf-pide');
  if (capa) capa.innerHTML = '';
}

function cabeza(titulo) {
  return '<div class="pf-panel-h"><h2>' + esc(titulo) + '</h2>' +
    '<button type="button" class="pf-cerrar" data-pide="cerrar" aria-label="Cerrar">' +
    ico('i-cerrar') + '</button></div>';
}

/* ----- Corregir una existencia -----
   Un conteo es la única aserción absoluta del almacén: reinicia la suma. Por eso se pide el
   número y se enseña contra qué se va a comparar, en vez de un campo vacío: la mitad de las
   veces el número derivado ya es el bueno y el trabajo es confirmarlo. */
function abrirContar(id) {
  const e = EXIS.find(x => x.material_id === id);
  if (!e) { toast('Ese material ya no está en el catálogo de este dispositivo', 'err', 4200); return; }

  abrirPide(
    cabeza('¿Cuántas ' + un(2, e.unidad_compra) + ' hay de ' + e.nombre + '?') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>El libro dice</dt><dd>' + esc(uc(e.cantidad, e.unidad_compra)) +
        '</dd></dl>' +
      '<dl class="pf-dato"><dt>Desde cuándo</dt><dd>' + esc(e.sello) + '</dd></dl>' +
      '<div class="fld"><label for="mt-contar">Cuántas hay de verdad</label>' +
        '<input type="number" step="any" min="0" id="mt-contar" value="' +
        esc(String(e.cantidad)) + '" inputmode="decimal"></div>' +
      '<div class="fld"><label for="mt-contar-nota">¿Algo que anotar? (opcional)</label>' +
        '<input type="text" id="mt-contar-nota" placeholder="Se mojaron dos, salió una para la muestra…"></div>' +
      '<p class="hintnote">Puede llevar decimales: media lámina es 0.5. Este número gana sobre ' +
      'todo lo anterior, y lo que se mueva después se le suma.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-pide="contar">Guardar el conteo</button>' +
    '</div>',
    { modo: 'contar', id });
}

/* ----- Ajustar una línea -----
   La corrección humana SIEMPRE gana sobre la fórmula, y además es la única medición real
   que el sistema tiene de cuánto rinde el material: de aquí sale la calibración. Por eso se
   pide el motivo, aunque no sea obligatorio: sin él la cifra sirve y la razón se pierde. */
function abrirAjustar(reqId) {
  let req = null, proy = null;
  for (const p of PROYS) {
    const r = (REQS.get(p.id) || []).find(x => x.id === reqId);
    if (r) { req = r; proy = p; break; }
  }
  if (!req) { toast('Esa línea ya no existe. Recalcula el material del proyecto.', 'err', 4200); return; }

  const mat = MATS.get(req.material_id) || null;
  const ajustada = req.cantidad_ajustada !== null && req.cantidad_ajustada !== undefined;
  const usa = ajustada ? num(req.cantidad_ajustada) : num(req.cantidad_compra);

  abrirPide(
    cabeza('¿Cuánto se usó de verdad?') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>Material</dt><dd>' + esc(mat ? mat.nombre : req.material_id) + '</dd></dl>' +
      '<dl class="pf-dato"><dt>Proyecto</dt><dd>' + esc(proy.nombre || proy.folio_local || '') + '</dd></dl>' +
      '<dl class="pf-dato"><dt>La plataforma calculó</dt><dd>' +
        esc(uc(req.cantidad_compra, req.unidad_compra)) + '</dd></dl>' +
      (req.formula ? '<div class="mat-formula">' + esc(req.formula) + '</div>' : '') +
      '<div class="fld"><label for="mt-real">Lo que se usó, en ' + esc(un(2, req.unidad_compra)) + '</label>' +
        '<input type="number" step="any" min="0" id="mt-real" value="' + esc(String(usa)) +
        '" inputmode="decimal"></div>' +
      '<div class="fld"><label for="mt-motivo">¿Por qué salió distinto?</label>' +
        '<input type="text" id="mt-motivo" placeholder="El nesting no cerró, se rompió una cara, el ancho real era mayor…" value="' +
        esc(req.motivo_ajuste || '') + '"></div>' +
      '<p class="hintnote nota-av">' + ico('i-recalibrar') + ' Esta corrección no arregla solo ' +
      'este renglón: con cinco que digan lo mismo, la plataforma propone el factor nuevo y ' +
      'deja de equivocarse en los proyectos que siguen.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-pide="ajustar">Guardar la corrección</button>' +
    '</div>',
    { modo: 'ajustar', id: reqId });
}

/* ----- Editar una fila del catálogo -----
   El factor y su origen van juntos en la misma pantalla y el origen es obligatorio: cambiar
   el número sin decir de dónde salió es lo que produce un catálogo que nadie se atreve a
   corregir tres meses después. Los costos son opcionales y para fabricación no existen. */
function abrirEditarMaterial(id) {
  const m = MATS.get(id);
  if (!m) { toast('Ese material ya no está en el catálogo', 'err', 4200); return; }
  const veDinero = Prefs.veDinero();

  abrirPide(
    cabeza(m.nombre) +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>Clave</dt><dd>' + esc(m.id) + '</dd></dl>' +
      '<dl class="pf-dato"><dt>Se compra por</dt><dd>' + esc(UC[m.unidad_compra] || m.unidad_compra) +
        ' · se consume en ' + esc(U_CONS[m.unidad_consumo] || m.unidad_consumo) + '</dd></dl>' +
      '<div class="fld"><label for="mt-m-medida">Medida, como la dice el proveedor</label>' +
        '<input type="text" id="mt-m-medida" value="' + esc(m.medida || '') +
        '" placeholder="1.22 × 2.44 m"></div>' +
      '<div class="grid2">' +
        '<div class="fld"><label for="mt-m-factor">Cuánto rinde una ' +
          esc(UC[m.unidad_compra] || m.unidad_compra) + ', en ' +
          esc(U_CONS[m.unidad_consumo] || m.unidad_consumo) + '</label>' +
          '<input type="number" step="any" id="mt-m-factor" value="' + esc(String(num(m.factor))) +
          '" inputmode="decimal"></div>' +
        '<div class="fld"><label for="mt-m-merma">Merma, en por ciento</label>' +
          '<input type="number" step="any" min="0" max="99" id="mt-m-merma" value="' +
          esc(String(Math.round(num(m.merma_pct) * 1000) / 10)) + '" inputmode="decimal"></div>' +
      '</div>' +
      '<div class="fld"><label for="mt-m-origen">De dónde salió ese número</label>' +
        '<textarea id="mt-m-origen" rows="3">' + esc(m.factor_origen || '') + '</textarea></div>' +
      '<div class="grid2">' +
        '<div class="fld"><label for="mt-m-mincompra">Mínimo que vende el proveedor</label>' +
          '<input type="number" step="any" min="0" id="mt-m-mincompra" value="' +
          esc(String(num(m.min_compra))) + '" inputmode="decimal"></div>' +
        '<div class="fld"><label for="mt-m-minstock">Avísame cuando baje de (0 = nunca)</label>' +
          '<input type="number" step="any" min="0" id="mt-m-minstock" value="' +
          esc(String(num(m.min_stock))) + '" inputmode="decimal"></div>' +
      '</div>' +
      (veDinero
        ? '<div class="fld"><label for="mt-m-costo">Costo por ' +
          esc(UC[m.unidad_compra] || m.unidad_compra) + ' (se puede dejar vacío)</label>' +
          '<input type="number" step="any" min="0" id="mt-m-costo" value="' +
          esc(m.costo_compra === null || m.costo_compra === undefined ? '' : String(m.costo_compra)) +
          '" inputmode="decimal"></div>'
        : '') +
      '<div class="grid2">' +
        '<div class="fld"><label for="mt-m-prov">Proveedor</label>' +
          '<input type="text" id="mt-m-prov" value="' + esc(m.proveedor || '') + '"></div>' +
        '<div class="fld"><label for="mt-m-tel">Su WhatsApp</label>' +
          '<input type="tel" id="mt-m-tel" value="' + esc(m.tel_proveedor || '') +
          '" placeholder="33 1234 5678"></div>' +
      '</div>' +
      '<p class="hintnote">Cambiar el factor no reescribe lo ya comprado ni lo ya consumido. Lo ' +
      'que se calcule de aquí en adelante usa el número nuevo.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-pide="material">Guardar el material</button>' +
    '</div>',
    { modo: 'material', id });
}

async function clicPide(ev) {
  const b = ev.target.closest('[data-pide]');
  if (!b || !pide) return;
  ev.preventDefault();
  const que = b.dataset.pide;
  if (que === 'cerrar') { cerrarPide(); return; }
  await conBoton(b, async () => {
    if (que === 'contar') await hacerContar();
    else if (que === 'ajustar') await hacerAjustar();
    else if (que === 'material') await hacerMaterial();
  });
}

async function hacerContar() {
  const i = $('mt-contar'), n = $('mt-contar-nota');
  const v = i ? String(i.value).trim() : '';
  if (v === '') { toast('Falta el número. Si no queda nada, escribe 0.', 'err', 4200); return; }

  const r = await Stock.contar(pide.id, Number(v), n ? n.value : '');
  if (!avisarResultado(r)) return;

  const d = num(r.valor.diferencia);
  cerrarPide();
  toast(d === 0
    ? 'Contado: era lo que decía el libro. Ya quedó con la fecha de hoy.'
    : 'Contado: ' + (d > 0 ? 'había ' + cant(d) + ' más' : 'faltaban ' + cant(-d)) +
      ' de lo que decía el libro. Desde aquí la cuenta arranca de tu número.',
    'ok', 4800);
  if (r.valor.movimientos_posteriores) {
    toast('Ojo: hay ' + r.valor.movimientos_posteriores +
      ' movimientos con fecha posterior a este conteo, y se le suman.', '', 5600);
  }
  await cargar();
}

async function hacerAjustar() {
  const i = $('mt-real'), m = $('mt-motivo');
  const v = i ? String(i.value).trim() : '';
  if (v === '') { toast('Falta cuánto se usó de verdad.', 'err', 4200); return; }

  const r = await Material.ajustar(pide.id, Number(v), m ? m.value : '');
  if (!avisarResultado(r)) return;

  cerrarPide();
  const razon = r.valor.razon;
  toast('Corregido' + (r.valor.movimiento ? ' y el almacén se movió por la diferencia' : '') +
    (razon ? '. Se usó ' + Math.round(razon * 100) + ' % de lo calculado: eso alimenta la calibración.' : '.'),
    'ok', 5200);
  await cargar();
}

async function hacerMaterial() {
  const m = MATS.get(pide.id);
  if (!m) { toast('Ese material ya no está en el catálogo', 'err', 4200); return; }
  const val = id => { const e = $(id); return e ? String(e.value).trim() : ''; };

  const merma = Number(val('mt-m-merma'));
  const costoTxt = val('mt-m-costo');

  /* Se parte de la fila entera y se pisan solo los campos del formulario. Para fabricación
     el costo no se pinta, así que tampoco se manda: si se armara la fila desde cero, abrir
     y guardar un material con el rol de fabricación borraría el costo que dirección
     capturó, y nadie sabría por qué. */
  const r = await Material.guardarMaterial({
    ...m,
    medida: val('mt-m-medida'),
    factor: Number(val('mt-m-factor')),
    merma_pct: isFinite(merma) ? merma / 100 : m.merma_pct,
    factor_origen: val('mt-m-origen'),
    min_compra: Number(val('mt-m-mincompra')),
    min_stock: Number(val('mt-m-minstock')),
    costo_compra: Prefs.veDinero() ? (costoTxt === '' ? null : Number(costoTxt)) : m.costo_compra,
    proveedor: val('mt-m-prov'),
    tel_proveedor: val('mt-m-tel'),
  });
  if (!avisarResultado(r)) return;

  cerrarPide();
  toast(r.valor.nombre + ' quedó guardado. Los cálculos que siguen ya usan sus números.', 'ok', 4600);
  await cargar();
  repintarHoja();
}

/* ============================================================================
   Imprimir la lista de compra

   El @media print de plataforma.css esconde la barra, la banda y los modales, y saca las
   casillas `.compra-check`, que en pantalla no existen. Lo único que hace falta aquí es
   asegurarse de que lo que se imprime sea la pestaña de comprar: fabricación apretaba
   imprimir con «En almacén» abierto y se llevaba a la vidriería la lista de lo que ya tiene.
   ============================================================================ */

function imprimir() {
  if (_imprimiendo) return;
  /* Quién es esta hoja y de cuándo es. El encabezado del papel vive en plataforma.html y solo se
     enciende al imprimir; aquí se le pone el rótulo, que es lo único que cambia entre los dos
     caminos de impresión de la plataforma. */
  rotularPapel('Lista de compra');
  if (TAB !== 'comprar') { TAB = 'comprar'; pintar(); }
  _imprimiendo = true;
  /* También por reloj: Safari de iOS no siempre dispara 'afterprint', y un candado que se
     queda puesto deja el botón muerto hasta recargar. */
  setTimeout(trasImprimir, 8000);
  try { window.print(); } catch (_) { trasImprimir(); }
}

function trasImprimir() { _imprimiendo = false; }
