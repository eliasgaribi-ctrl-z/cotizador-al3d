/* ============================================================================
   CONTROL — ventas, cobranza y bitácora. La pantalla de la dirección.

   Nació de una auditoría de septiembre de 2026 que encontró esto: la capa de datos ya sabía
   calcular la conversión cotización→venta, el valor del inventario y el libro de
   movimientos, y NINGUNA pantalla lo pintaba. El tablero contesta «qué hay en el taller y
   qué se atrasa»; nadie contestaba «cuánto vendimos este mes, cuánto hay en la calle sin
   cobrar, cuánto dejamos de vender y quién movió esto». Esa es esta pantalla.

   Seis pestañas, y las seis se apoyan en lo que ya existe:
     · RESUMEN (`ventas` por dentro, para no romper `#/control`) — lo que falta cobrar y dónde
       está, las dos listas de lo vivo (en fabricación y cobrando), cinco tarjetas de este mes y
       los doce meses en barras. Ver «El Resumen», abajo: se rehízo en octubre de 2026.
     · VENTAS (`lista`) — el detalle: el mes pasado, el ticket promedio y la conversión; la lista
       de ventas filtrable por periodo, con su buscador y su CSV; y lo vendido por tipo de trabajo.
     · POR COBRAR — la cartera: cada venta con saldo, de mayor a menor, con el mensaje de
       WhatsApp ya armado. El saldo es el de la hoja cuando bajó; si no, ESTIMADO (total
       menos anticipo pactado), y la pantalla dice cuál de los dos es.
     · COMISIONES — con el dinero que haya, cuántas comisiones completas se pueden liquidar
       empezando por las más chicas (la regla del negocio: bajar el número de pendientes).
       «Pagar estas» ARMA LA LISTA para registrarla en la hoja; esta pantalla no marca pagos.
     · GASTOS — lo que sale (octubre de 2026): lo gastado este mes contra el anterior, por
       categoría, y la lista con el mismo filtro de periodo que las ventas. «Registrar gasto» abre
       el formulario en la capa de siempre (`#pf-pide`) y el gasto se guarda aquí y viaja a la
       pestaña «Gastos» de la hoja por el puente, como las ventas; sin señal se queda en la bandeja
       y la fila lo dice. Un gasto no se edita: se ANULA (ver js/datos/gastos.js, que tiene la
       aritmética pura y la captura). El Resumen dice además lo gastado en el mes y la utilidad
       aproximada —vendido menos gastado—, con su letra chica.
     · BITÁCORA — quién hizo qué y cuándo, en toda la plataforma. Se lee, no se edita.
   Y una séptima, «Registrar (Supabase)», que SOLO existe con el interruptor de Supabase encendido
   en este aparato (Ajustes, `al3d_pf_supa`): los formularios de cobro, abono, reparto y
   corrección contra la base. Apagado, Control es exactamente las seis de arriba y
   js/mod/pagos-supa.js ni se descarga. Ver `supaEncendido` y docs/supabase/NOTAS-SEGUNDA-ENTREGA-PAGOS.md.
   Con la BASE mandando (paso 5 de docs/BASE-MANDA.md) esa pestaña es «Cobros y abonos», la de
   Dirección y Pagos, con la venta sin cotización; y lo que esta pantalla decía de «la hoja» (el
   récord, los gastos, dónde se registra el abono de una comisión) lo dice de la base (`enBase`).
   Lo vendido POR TIPO DE TRABAJO —una tarjeta por tipo y la gráfica mes a mes o año por año— va
   al final de la pestaña Ventas. Ver `htmlPorTipo` y js/datos/ventas-por-tipo.js.

   El CSV de ventas (lo que se abre en Excel) solo lo baja la dirección: a pagos no se le pinta. El
   de gastos, con la misma regla (`puedeBajarCSV`).

   De dónde salen los números, desde septiembre de 2026: de la HOJA de finanzas y de este
   teléfono, en una sola lista (`Ventas.unificar`). El puente baja el récord entero de la
   pestaña Ventas al almacén `ventas_hoja` —también lo que se registró desde otro aparato o
   en la propia hoja— y aquí se cruza con los proyectos locales por folio. Arriba del récord
   se dice de cuándo son los datos y hay un botón para traerlos; al entrar, si llevan más de
   diez minutos, se traen solos. Sin puente, la pantalla lo dice y enseña lo de aquí.

   La ven dirección y pagos. Fabricación no la tiene en la barra: es la pantalla del dinero,
   y `veDinero()` es false para ese rol.

   La aritmética vive en js/datos/ventas.js, que es puro y tiene pruebas. Aquí solo se lee
   la base y se pinta.

   Lo que esta pantalla le pide a las piezas compartidas (js/piezas.js, `window.Piezas`) y por
   qué no hay un solo `onclick`: la plataforma no permite guiones en línea, y todo cuelga de la
   delegación de `alClic`.
     · P3  — cada cuenta con algo que contar es un botón que lleva a su tarjeta (pieza 17, las
             esquinas que señalan) o a su pestaña; con 0 sigue siendo un párrafo.
     · P18 — las cuentas ruedan (pieza 1) cuando cambian frente a quien mira, y nunca al entrar.
     · P16 — «Traer la hoja» se vuelve la ficha de lo que pasa (pieza 14): página, reloj y su
             resultado en el propio botón.
     · P27 — las doce barras crecen una vez al verse y cada mes se abre en un globo (pieza 4).
     · P30 — cada saldo por cobrar lleva su medidor quieto (pieza 20), también en las listas
             del Resumen.
     · F54 — comisiones, primero las chicas.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Proy from '../datos/proyectos.js';
import * as Cot from '../datos/cotizador.js';
import * as Agenda from '../datos/agenda.js';
import * as Ventas from '../datos/ventas.js';
import * as PorTipo from '../datos/ventas-por-tipo.js';
import { comisionDe, PCT_COMISION } from '../datos/asistente-contexto.js';
import * as Bitacora from '../datos/bitacora.js';
import * as Sync from '../datos/sync.js';
import * as Gastos from '../datos/gastos.js';
import { CUENTAS, VERSION_DE_LOS_GASTOS } from '../datos/puente.js';
import { $, ico, esc, money, toast, vacio, segmento, chip, fmtFecha, linkWa, telWa, descargarArchivo,
         hoyISO, cifraQueCabe, repintarAlrededor, conservandoFoco, voz, copiarTexto,
         abrirCapa, cerrarCapa, confirmarPf } from '../nucleo/ui.js';
import { masMeses, diasEntre } from '../nucleo/fechas.js';

let cont = null;
let _alClic = null;             // alClic envuelto con conservandoFoco()
let CTX = null;
let TAB = 'ventas';          // ventas (el Resumen) | lista | cobrar | comisiones | gastos | bitacora (| asientos) — sobrevive a salir y volver
let _PS = null;              // js/mod/pagos-supa.js, ya cargado (solo con Supabase encendido)
let PERIODO = '3m';          // mes | 3m | 12m | todo
/* Lo vendido por tipo de trabajo, arriba de todo: el periodo de las tarjetas y la gráfica que
   se ve. Sobreviven a salir y volver, como la pestaña. Por defecto el año: es la pregunta del
   dueño («cuántas letras llevamos»), y el mes a los nueve días casi siempre dice poco. */
let TT_PER = 'anio';         // mes | anio | todo
let TT_VISTA = 'mes';        // mes | anio — la gráfica de abajo de las tarjetas
let _ttScroll = null;        // dónde se dejó la gráfica de meses (null: al final, lo más nuevo)
let _vzTT = null;            // el globo de un mes o un año de la gráfica por tipo
let BUSCA = '';
/* Las finanzas de lo vivo: cada lista enseña sus primeros seis renglones —los que más deben, que
   casi siempre son el grueso del dinero— y «Ver los N» la abre. */
let FIN_TODOS = { fabricacion: false, cobrando: false };
const FIN_TOPE = 6;
let _vzFin = null;           // el globo de una venta que solo está en la hoja (no tiene ficha que abrir)
let ENTIDAD = '';            // filtro de la bitácora
let BUSCA_BIT = '';
/* Los gastos: el periodo de la lista —los mismos cuatro que la de ventas, pero arranca en «Este
   mes», que es la pregunta («¿cuánto se ha ido este mes?»)— y lo que se buscó. Sobreviven a salir
   y volver, como el periodo de ventas. `_gs` es el formulario abierto en `#pf-pide` (o null). */
let GPER = 'mes';            // mes | 3m | 12m | todo
let BUSCA_GAS = '';
let _gs = null;              // { guardando:boolean }
let D = null;                // lo leído
let TRAYENDO = false;        // hay una bajada de la hoja en curso, pedida desde aquí
/* P16. La bajada que arranca sola al entrar (`refrescarSiToca`) NO enciende el botón: un
   botón que se llena y cuenta segundos cada vez que se abre la pantalla es un botón al que se
   deja de hacerle caso. Si alguien lo toca mientras esa va, deja de ser silenciosa (se
   «promueve») y el botón se enciende donde ya iba. `_bajada` es lo que ya se sabe de la que
   corre —página, avance—: tiene que vivir FUERA del botón, porque cualquier repintado de la
   pantalla (una pestaña, el buscador) lo reemplaza por otro y hay que volverle a poner el
   estado donde iba. */
let SILENCIOSA = false;
let _bajada = null;          // { pagina, p } mientras TRAYENDO
/* Lo que dijo el botón al terminar —{ tipo:'ok'|'mal', texto, hasta }— para volver a decirlo si la
   pantalla se repinta o se remonta mientras dura. El router remonta la pantalla cuando una
   sincronización del propio app (la de cada 30 s y la de la entrada) trajo algo, y la bajada que
   se pidió aquí casi siempre coincide con una: sin esto, el «12 cambios» en verde duraba lo que
   tarda ese remonte, es decir, nada. */
let _cierre = null;
let COM_MONTO = '';          // F54: lo que se tecleó en «Monto disponible»
let COM_LISTA = null;        // F54: la lista armada con «Pagar estas» { ids, nueva }
let _vozCom = 0;             // el reloj que anuncia el alcance sin hablar en cada tecla
let _vz = null;              // P27: el globo de los meses
let _io = null;              // P27: el que vigila si ya se ven las barras
/* P27. Las doce barras crecen UNA vez, la primera que se ven en esta visita a la pantalla:
   'espera' (nacen en cero), 'hecho' (nacen con su ancho). Cada innerHTML las recrea, así que el
   estado no puede vivir en ellas: el buscador repinta con cada pausa y volvería a animarlas.
   Arranca en 'hecho' para que nada crezca si no se pidió. */
let _barras = 'hecho';
/* P18. Las claves con las que la pieza 1 recuerda cada cifra, para poder olvidar las de una
   pestaña al entrar a ella: volver a «Ventas» después de que algo cambió en otra pestaña
   haría rodar sus cuentas sin que nadie haya visto el cambio. */
const _claves = new Set();
const piezas = () => (typeof window !== 'undefined' && window.Piezas) || null;
const sinMov = () => {
  const P = piezas();
  if (P && typeof P.sinMovimiento === 'function') return !!P.sinMovimiento();
  try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
};
/* Cuánto puede tener el récord de la hoja antes de que entrar a Control lo vuelva a pedir
   solo. Diez minutos: PAGOS captura un cobro en la hoja y la dirección abre el teléfono a
   ver la cartera; más que eso ya es una cifra vieja pintada como de hoy. */
const MIN_FRESCO_MS = 10 * 60 * 1000;

/* El mismo corte que esconde `.pf-cab-acc` en css/plataforma.css. */
const _mqTelefono = typeof matchMedia === 'function' ? matchMedia('(max-width:759px)') : null;
const enTelefono = () => !!(_mqTelefono && _mqTelefono.matches);
function alCambiarAncho() { pintar(); }

/* ----- ¿Quién manda: la hoja o la base? (docs/BASE-MANDA.md, paso 5) -----
   Con la base mandando, el récord de esta pantalla baja de la base, los gastos se guardan en la base y
   los cobros y abonos se registran en «Cobros y abonos»: lo que aquí decía «la hoja» lo dice de la base.
   Con la hoja mandando cada frase es, letra por letra, la de siempre (las pruebas de navegador las buscan).
   La regla es la de `laBaseManda()` de js/nucleo/supa.js —el interruptor de Supabase encendido aquí Y el
   último modo oído en 'base'—, leída sin cargar supa.js, como en js/app.js (pruebas/supabase-relevo.mjs
   corre todas las copias): con la hoja mandando Control no descarga nada nuevo. */
function laBaseManda() {
  try {
    return /"encendido":true/.test(localStorage.getItem('al3d_pf_supa') || '') &&
           /"modo":"base"/.test(localStorage.getItem('al3d_pf_supa_modo') || '');
  } catch (_) { return false; }
}
const enBase = () => laBaseManda();

export async function montar(contenedor, ctx) {
  cont = contenedor;
  CTX = ctx;
  cont.addEventListener('click', _alClic = conservandoFoco(alClic));
  cont.addEventListener('input', alEscribir);
  cont.addEventListener('focusin', alEntrarAlCampo);
  cont.addEventListener('focusout', alSalirDelCampo);
  if (_mqTelefono && _mqTelefono.addEventListener) _mqTelefono.addEventListener('change', alCambiarAncho);
  /* El formulario de «Registrar gasto» vive en `#pf-pide`, la capa que comparten las pantallas
     (index.html): se escucha mientras Control está montado, por delegación (`data-gs`), y se suelta
     al desmontar. Ningún `onclick`: la política de contenido no deja guiones en línea. */
  const pide = $('pf-pide');
  if (pide) pide.addEventListener('click', alClicPide);
  /* El pase de quien manda aquí —el asistente, el tablero—: «abre en Por cobrar». */
  const pase = (ctx && ctx.recibir) ? ctx.recibir() : null;
  if (pase && tabs().includes(pase.tab)) TAB = pase.tab;
  /* La pestaña también vive en la dirección (`#/control?tab=cobrar`): un enlace directo a
     «Comisiones» y una recarga caen donde se estaba (auditoría completa 2026-10, control-11). El
     pase manda sobre la dirección: es quien acaba de pedir venir aquí. */
  else { const deLaDir = tabDeLaDireccion(); if (deLaDir) TAB = deLaDir; }
  escribirTabEnDireccion();
  /* Entrar a la pantalla es una visita nueva: las barras vuelven a crecer una vez y lo que se
     tecleó en comisiones se olvida. Un remonte en silencio —la sincronización trajo algo, otra
     pestaña guardó— no es una visita: ni vuelve a crecer lo que ya creció ni se borra lo
     tecleado (`esRemonte()` lo dice el router). */
  const remonte = !!(ctx && typeof ctx.esRemonte === 'function' && ctx.esRemonte());
  if (!remonte) {
    _barras = (sinMov() || typeof IntersectionObserver !== 'function') ? 'hecho' : 'espera';
    COM_MONTO = ''; COM_LISTA = null; _cierre = null;
  }
  /* P27. UN globo para los doce meses, colgado del contenedor estable: la gráfica se repinta
     con cada búsqueda y los botones de los meses nacen de nuevo, pero el globo los encuentra
     por su clase. Sin la pieza —node, un despliegue a medias— los meses quedan como filas
     que no abren nada, que es lo que había. */
  const P = piezas();
  if (P && typeof P.vistazo === 'function') {
    _vz = P.vistazo(cont, { delegar: '.ct-mes-ver', titulo: 'Ventas del mes', alinear: 'centro',
      contenido: ancla => vistazoMes(ancla && ancla.dataset ? ancla.dataset.mes : '') });
    /* Y otro para las columnas de la gráfica por tipo: el número exacto de cada tipo en ese mes
       o año, que en una barra apilada no se puede leer a ojo, y que un `title` no enseña en un
       teléfono. */
    _vzTT = P.vistazo(cont, { delegar: '.ct-tt-ver', titulo: 'Por tipo de trabajo', alinear: 'centro',
      contenido: ancla => vistazoTipo(ancla && ancla.dataset ? ancla.dataset.ttSerie : '', ancla && ancla.dataset ? ancla.dataset.ttK : '') });
    /* Y uno para el renglón de una venta que solo está en la hoja: no tiene ficha en Proyectos,
       pero tocarlo tiene que dar algo —sus cifras, su estatus y de dónde sale el saldo—, o el
       renglón con su flechita sería una puerta pintada. */
    _vzFin = P.vistazo(cont, { delegar: '.ct-fin-ver', titulo: 'Venta de la hoja', alinear: 'fin',
      contenido: ancla => vistazoVenta(ancla && ancla.dataset ? ancla.dataset.fin : '') });
  }

  if (!DB.estado().ok) {
    /* Con el botón de recargar que los demás módulos ya ofrecen: sin él, la pantalla era un
       callejón sin salida. */
    cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo', DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    const b = cont.querySelector('[data-recargar]'); if (b) b.onclick = () => location.reload();
    return;
  }
  if (CTX.acciones && puedeBajarCSV()) {
    const acc = CTX.acciones('<button type="button" class="btn btn-gho pf-btn-corto" data-csv>' +
      ico('i-bajar') + ' Bajar CSV de ventas</button>');
    if (acc) acc.addEventListener('click', alClic);
  }
  await recargar();
  /* Sin esperar: la pantalla ya está pintada con lo que hay, y si la hoja trae algo se
     repinta sola. Esperar la red antes de pintar sería una pantalla en blanco sin señal. */
  refrescarSiToca();
}

export function desmontar() {
  if (cont) {
    cont.removeEventListener('click', _alClic); cont.removeEventListener('input', alEscribir);
    cont.removeEventListener('focusin', alEntrarAlCampo); cont.removeEventListener('focusout', alSalirDelCampo);
  }
  if (_mqTelefono && _mqTelefono.removeEventListener) _mqTelefono.removeEventListener('change', alCambiarAncho);
  /* La capa es del documento, no de este módulo: si quedó abierta con el formulario de un gasto
     —se cambió de pantalla con él enfrente— se cierra y se vacía, o taparía la pantalla siguiente. */
  const pide = $('pf-pide');
  if (pide) {
    pide.removeEventListener('click', alClicPide);
    if (_gs) { cerrarCapa('pf-pide'); pide.innerHTML = ''; }
  }
  _gs = null;
  /* El globo de los meses y el vigilante de las barras son de este montaje: el globo cuelga de
     un contenedor que el router reutiliza, y uno que se queda puesto abriría un globo vacío en
     la pantalla siguiente. */
  if (_vz) { try { _vz.destruir(); } catch (_) {} _vz = null; }
  if (_vzTT) { try { _vzTT.destruir(); } catch (_) {} _vzTT = null; }
  if (_vzFin) { try { _vzFin.destruir(); } catch (_) {} _vzFin = null; }
  if (_io) { _io.disconnect(); _io = null; }
  clearTimeout(_vozCom); _vozCom = 0;
  /* El hueco de acciones del encabezado NO es de este módulo: vive en index.html y lo
     comparten todos. El router le vacía el marcado antes de montar el siguiente —«las
     acciones del encabezado son del módulo que se va»— pero vaciar el innerHTML no suelta el
     oyente que cuelga del NODO, así que el de Control se quedaba puesto sobre el encabezado
     de las demás pantallas. Hoy no hace daño —`alClic` sale por la puerta de atrás con `CTX`
     y `D` en null— pero es la única suscripción de la plataforma a un nodo compartido que
     nadie retiraba, y basta con que otro módulo estrene un `data-tab` ahí para que Control
     empiece a cambiarse de pestaña solo desde una pantalla que ya no es la suya. */
  const acc = $('pf-cab-acc');
  if (acc) acc.removeEventListener('click', alClic);
  /* También el temporizador del buscador: dispara 220 ms después de la última tecla y puede
     caer con el módulo ya desmontado. `pintar()` se protege sola, pero un reloj que sobrevive
     a su módulo es exactamente lo que `desmontar` existe para apagar. */
  clearTimeout(_espera); _espera = 0;
  if (_PS) _PS.soltar();
  cont = null; CTX = null; D = null;
}

/* ============================================================================
   Leer — todo local
   ============================================================================ */

async function leer() {
  const hoy = hoyISO();
  const proyectos = await Proy.listar({});
  /* El récord de la hoja, cruzado con los proyectos de aquí. Fabricación no ve dinero y no
     tiene esta pantalla, pero por si llega por una ruta vieja, no se le lee el espejo. */
  const hoja = Prefs.veDinero() ? await DB.listar('ventas_hoja') : [];
  const union = Ventas.unificar(proyectos, hoja);
  const ventas = union.ventas;
  /* Con los folios de la hoja también: una cotización de este teléfono que ya está en la
     hoja —registrada desde el cotizador con el puente— no está «sin decidir». */
  const ganados = new Set(ventas.map(p => p.folio_global).filter(Boolean));
  const sinDecidir = Cot.sinDecidir(ganados);
  const historial = Cot.historial();
  const inst = await Agenda.listar({ vivas: true });
  const fechaInst = new Map();
  for (const i of inst) {
    if (!i || !i.fecha) continue;
    const prev = fechaInst.get(i.proyecto_id);
    if (!prev || i.fecha < prev) fechaInst.set(i.proyecto_id, i.fecha);
  }
  const kpi = Ventas.indicadores(ventas, sinDecidir, { hoy, valorDe: Cot.totalVendido });
  const meses = Ventas.resumenMensual(ventas, { hoy, meses: 12 });
  const conv = Ventas.conversion(historial, ventas, Prefs.dispositivo());
  const cartera = Ventas.porCobrar(ventas);
  const finanzas = Ventas.finanzasVivas(ventas);
  const bajada = await Sync.estadoBajada();

  /* El almacén, solo para dirección: fabricación no entra aquí y pagos no compra. */
  let almacen = null;
  if (Prefs.esDireccion()) {
    try {
      const Stock = await import('../datos/stock.js');
      const [valor, minimo] = await Promise.all([Stock.valorInventario(), Stock.bajoMinimo()]);
      almacen = { valor, bajoMinimo: Array.isArray(minimo) ? minimo.length : 0 };
    } catch (_) { almacen = null; }
  }
  const bitacora = await Bitacora.listar({ limite: 400 });
  const comisiones = comisionesDe(ventas);
  /* Por tipo de trabajo: la misma lista unificada, repartida. Las series no dependen del
     periodo elegido y se sacan una vez; las tarjetas sí, y se sacan al pintar. */
  const porTipo = { mes: PorTipo.seriePorMes(ventas, { hoy }), anio: PorTipo.seriePorAnio(ventas, { hoy }) };
  /* Los gastos, solo a quien ve el dinero (dirección y pagos; fabricación no llega aquí). Antes de
     leerlos se vuelve a encolar el que se haya quedado sin operación en la bandeja —un respaldo
     restaurado, una bandeja vaciada—: si no, se quedaría «por mandar» para siempre. */
  let gastos = [], bandejaGastos = new Map();
  if (Prefs.veDinero()) {
    await Gastos.reencolarSueltos();
    [gastos, bandejaGastos] = await Promise.all([Gastos.listar(), Gastos.bandeja()]);
  }
  const resGastos = Gastos.resumen(gastos, { hoy });
  /* Si la hoja tiene la pestaña «Gastos» (puente-sheets-15): true, false o null mientras no se
     sabe. Con false la pestaña dice «falta actualizar el puente» desde que se abre. */
  const hojaGastos = Sync.sabeLlevar('gastos');
  return { hoy, proyectos, ventas, union, bajada, sinDecidir, historial, fechaInst, kpi, meses, conv,
           cartera, finanzas, almacen, bitacora, comisiones, porTipo, gastos, bandejaGastos, resGastos, hojaGastos };
}

/* F54. Las comisiones de las ventas del récord UNIFICADO —la hoja paga las de todas, también las
   capturadas en otro teléfono—, con la misma cuenta que usa el asistente (`comisionDe`: 10 % del
   subtotal con centavos, o lo que dice la hoja). Solo se puede PAGAR la de una venta ya
   LIQUIDADA (`abonable`); las demás esperan, y se cuentan aparte para no esconder que existen.
   El monto de cada una es lo que FALTA pagarle (`abonable`), no la comisión entera: a una que la
   hoja ya abonó en parte le faltan, digamos, $700 de $1,200, y esos $700 son lo que pesa en
   «¿a cuántas les alcanza?». */
function comisionesDe(ventas) {
  const abonables = [];
  let pendN = 0, pendTotal = 0;
  for (const p of (ventas || [])) {
    if (!p || p.etapa === 'cancelado') continue;
    const c = comisionDe(p);
    if (c.abonable > 0) {
      abonables.push({ id: p.id, nombre: p.nombre || p.folio_local || p.folio_hoja || 'Sin nombre',
        folio: foliosDe(p) || 'sin folio', sub: Number(p.sub) || 0, comision: c.comision, monto: c.abonable });
    } else if (c.restante > 0) { pendN++; pendTotal += c.restante; }
  }
  return { abonables, pend: { n: pendN, total: Math.round(pendTotal * 100) / 100 },
           total: Math.round(abonables.reduce((t, x) => t + x.monto, 0) * 100) / 100 };
}

async function recargar() {
  D = await leer();
  pintar();
}

/* ============================================================================
   Traer la hoja
   ============================================================================ */

/** Al entrar: si el récord de la hoja no está o ya tiene más de diez minutos, se pide. */
function refrescarSiToca() {
  if (!D || !D.bajada || !D.bajada.configurado) return;
  const ultima = Number(D.bajada.completa) || 0;
  if (ultima && Date.now() - ultima < MIN_FRESCO_MS) return;
  traerDeLaHoja(true);
}

/**
 * Manda lo pendiente y baja la hoja entera, página por página, y repinta con lo que llegó.
 * `silencioso` es el refresco automático: sin avisos y sin encender el botón, porque un aviso
 * en cada entrada a la pantalla es un aviso que se aprende a ignorar. El botón sí avisa.
 *
 * P16. Mientras baja, el botón es la ficha de lo que pasa (pieza 14): se va llenando por página
 * traída, dice «Página 3 · 12 s» y termina en verde con «12 cambios» o en rojo con «Reintentar».
 * Durante la bajada SOLO se toca el botón: la pantalla no se repinta hasta que termina, porque
 * eran las cifras que se estaban leyendo las que parpadeaban por un botón. Lo contrario también
 * pasa y se cuida: si alguien repinta la pantalla a media bajada (cambia de pestaña, escribe en
 * el buscador), el botón nuevo nace sin estado y `despuesDePintar` se lo vuelve a poner.
 *
 * El total de páginas no se sabe de antemano —el puente solo dice si hay más—, así que el
 * avance no finge saberlo: se acerca al 90 % con la curva de la pieza (`P.avance`), calibrada
 * a las siete páginas de una hoja de hoy, y solo llega al final cuando la bajada termina.
 */
async function traerDeLaHoja(silencioso) {
  if (!Sync.configurado()) return;
  if (TRAYENDO) {
    /* Ya va una. Si era la silenciosa y ahora la pidieron con el dedo, deja de serlo: el botón se
       enciende donde ya iba, y al terminar avisa. Antes el toque no hacía nada. */
    if (!silencioso && SILENCIOSA) { SILENCIOSA = false; encenderBoton(); }
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!silencioso) toast(enBase() ? 'Sin señal: se enseña lo último que bajó de la base.' : 'Sin señal: se enseña lo último que bajó de la hoja.', '', 3400);
    return;
  }
  TRAYENDO = true;
  SILENCIOSA = !!silencioso;
  _bajada = { pagina: 0, p: 0 };
  _cierre = null;                          // un intento nuevo borra lo que dijo el anterior
  if (!SILENCIOSA) encenderBoton();
  let error = null, cambios = 0, borrados = 0;
  try {
    try { await Sync.bombear(); } catch (_) { /* lo pendiente sale cuando pueda; bajar no depende de eso */ }
    /* Tope de veinte vueltas —mil filas— para que un cursor que no avanza no deje esto
       dando vueltas para siempre. La hoja de hoy son siete páginas. */
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const r = await Sync.jalar();
      if (!r.ok) { error = r.mensaje; break; }
      const v = r.valor || {};
      cambios += (Number(v.nuevos) || 0) + (Number(v.actualizados) || 0);
      borrados += Number(v.borrados) || 0;
      const P = piezas();
      _bajada.pagina = vuelta + 1;
      _bajada.p = P && P.avance ? P.avance(_bajada.pagina, 5) : Math.min(.9, _bajada.pagina / 8);
      if (!SILENCIOSA) encenderBoton();
      if (!v.hay_mas) break;
    }
  } finally { TRAYENDO = false; }
  const avisar = !SILENCIOSA;
  SILENCIOSA = false; _bajada = null;
  if (!cont) return;                      // se salió de la pantalla mientras bajaba
  await recargar();
  if (!avisar) return;
  cerrarBoton(error, cambios, borrados);
}

/* El botón, trabajando, con la página en la que va. Idempotente: se llama en cada página, y otra
   vez cuando un repintado le cambió el botón por uno nuevo. Sin la pieza —node, un despliegue a
   medias— queda lo de siempre: el botón apagado diciendo «Trayendo la hoja…». */
function encenderBoton() {
  const bt = cont && cont.querySelector('[data-act="hoja-traer"]');
  if (!bt) return;
  const P = piezas();
  if (!P || typeof P.estadoBoton !== 'function') {
    bt.disabled = true; bt.innerHTML = ico('i-reloj') + ' ' + esc(enBase() ? 'Trayendo de la base…' : 'Trayendo la hoja…');
    return;
  }
  const h = P.estadoBoton(bt);
  if (!h) return;
  if (h.estado !== 'trabajando') h.trabajando({ verbo: enBase() ? 'Trayendo de la base' : 'Trayendo la hoja', tau: 6000 });
  if (_bajada && _bajada.pagina) h.avance(_bajada.p, 'Página ' + _bajada.pagina);
}

/* Lo que dejó la bajada, dicho en el propio botón (y por voz, que ya no hay aviso aparte). El
   botón que había se fue con el repintado de `recargar()`, así que el resultado se le pone al
   NUEVO: la pieza sabe cerrar un botón que no estaba trabajando. El motivo de un fallo sí va en
   un aviso —«Token desconocido», «Sin señal»—: no cabe en un botón y es lo que hace falta para
   saber qué arreglar. */
function cerrarBoton(error, cambios, borrados) {
  const bt = cont && cont.querySelector('[data-act="hoja-traer"]');
  const P = piezas();
  const partes = [];
  if (cambios) partes.push(cambios + (cambios === 1 ? ' cambio' : ' cambios'));
  if (borrados) partes.push(borrados + (borrados === 1 ? ' quitada' : ' quitadas'));
  const texto = partes.join(' · ') || 'Al día';
  if (error) toast(error, 'err', 5200);
  const La = enBase() ? 'La base' : 'La hoja', la = enBase() ? 'la base' : 'la hoja';
  if (!bt || !P || typeof P.estadoBoton !== 'function') {
    if (!error) toast(cambios || borrados
      ? La + ' trajo ' + cambios + (cambios === 1 ? ' cambio' : ' cambios') +
        (borrados ? ' y quitó ' + borrados + (borrados === 1 ? ' venta que ya no está allá' : ' ventas que ya no están allá') : '')
      : 'El récord ya estaba al día con ' + la, 'ok', 3800);
    return;
  }
  const frase = cambios || borrados ? La + ' trajo ' + texto : 'El récord ya estaba al día con ' + la;
  if (error) _cierre = { tipo: 'mal', texto: 'No contestó', hasta: 0 };
  else _cierre = { tipo: 'ok', texto, hasta: Date.now() + 3500, frase };
  aplicarCierre(true);
  if (!error) voz(frase);
}

/* Vuelve a poner en el botón nuevo lo que el anterior dijo al terminar, mientras siga valiendo: el
   verde por lo que le quede de sus 3,5 s, y el rojo hasta que se vuelva a intentar o se salga de
   la pantalla. El rojo que se REPITE por un repintado no se sacude otra vez: la sacudida es para
   cuando falla, no para cada vez que el buscador repinta. */
function aplicarCierre(primera) {
  if (!_cierre || TRAYENDO) return;
  if (_cierre.tipo === 'ok' && Date.now() >= _cierre.hasta) { _cierre = null; return; }
  const bt = cont && cont.querySelector('[data-act="hoja-traer"]');
  const P = piezas();
  if (!bt || !P || typeof P.estadoBoton !== 'function') return;
  const h = P.estadoBoton(bt);
  if (!h || h.estado === _cierre.tipo) return;
  if (_cierre.tipo === 'ok') {
    h.ok(_cierre.texto, { volver: Math.max(400, _cierre.hasta - Date.now()) });
    /* El router anuncia el nombre de la pantalla («Control») al terminar CADA remonte, encima de lo
       que estuviera diciendo la región que habla: si lo trajo la hoja se dijo antes, se repite una
       vez, ya con la pantalla puesta. */
    if (!primera && !_cierre.repetida) {
      _cierre.repetida = true;
      const f = _cierre.frase;
      setTimeout(() => { if (f && cont) voz(f); }, 450);
    }
  } else { h.mal(_cierre.texto); if (!primera) bt.classList.remove('sacudida'); }
}

/** «hace un momento», «hace 12 min», «hace 3 h», «ayer», «hace 4 días». */
function haceCuanto(ts) {
  const ms = Date.now() - (Number(ts) || 0);
  if (!(ms >= 0)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : 'hace ' + d + ' días';
}

/* La línea de arriba del récord: de dónde salen los números y de cuándo son. Es lo que
   evita que una cifra de hace tres días se lea como la de hoy. Desde el Resumen de octubre de
   2026 va en UNA línea chica (`.ct-hoja`): ocupaba media pantalla del teléfono con un botón
   del ancho de la pantalla encima de las cifras que se vienen a ver. Lo que dice no cambió. */
function lineaHoja() {
  const b = D.bajada || {};
  const u = D.union || {};
  /* Apagado a mano solo si la pieza 14 no va a tomar el botón (sin ella, o con la bajada
     silenciosa, que no lo enciende): con ella, `despuesDePintar` le devuelve su estado. */
  const P = piezas();
  const ocupado = TRAYENDO && !SILENCIOSA && !(P && typeof P.estadoBoton === 'function');
  const base = enBase();
  const boton = txt => '<button type="button" class="btn btn-gho pf-btn-corto" data-act="hoja-traer"' +
    (ocupado ? ' disabled' : '') + '>' + ico(ocupado ? 'i-reloj' : 'i-bajar') + ' ' +
    esc(ocupado ? (base ? 'Trayendo de la base…' : 'Trayendo la hoja…') : txt) + '</button>';
  if (!b.configurado) {
    return '<p class="pf-frescura ct-hoja ct-hoja-sin">' + ico('i-nube-off') +
      (base ? '<span>Sin conexión a la base: solo se ve lo registrado en este dispositivo.</span>' +
              '<button type="button" class="ct-hoja-ir" data-ir="ajustes">Revisar en Ajustes</button></p>'
            : '<span>Sin conexión a la hoja de finanzas: solo se ve lo registrado en este dispositivo.</span>' +
              '<button type="button" class="ct-hoja-ir" data-ir="ajustes">Conectar la hoja</button></p>');
  }
  if (!b.completa) {
    return '<p class="pf-frescura ct-hoja">' + ico('i-nube') + '<span>' +
      (base ? (b.a_medias ? 'El récord de la base se trajo a medias y falta terminar de bajarlo.' : 'Todavía no se ha traído el récord de ventas de la base.')
            : (b.a_medias ? 'La hoja se trajo a medias y falta terminar de bajarla.' : 'Todavía no se ha traído el récord de ventas de la hoja.')) +
      (b.ultimo_error ? ' ' + esc(b.ultimo_error) : '') + '</span>' + boton(base ? 'Traer de la base' : 'Traer la hoja') + '</p>';
  }
  const n = (Number(u.de_hoja) || 0) + (Number(u.enlazados) || 0);
  return '<p class="pf-frescura ct-hoja">' + ico('i-nube') + '<span><b>' + n +
    (n === 1 ? ' venta' : ' ventas') + '</b> ' + (base ? 'de la base' : 'de la hoja de finanzas') +
    (u.solo_aqui ? ' y ' + u.solo_aqui + (u.solo_aqui === 1 ? ' que solo está' : ' que solo están') + ' en este dispositivo' : '') +
    ' · actualizado ' + esc(haceCuanto(b.completa)) +
    (b.a_medias ? ' · hay una bajada a medias' : '') + '</span>' + boton('Actualizar') + '</p>';
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  if (!cont || !D) return;
  cont.innerHTML = htmlPantalla();
  despuesDePintar();
}

/* Lo que hay que hacer cada vez que la pantalla acaba de escribirse, sea por `pintar()` o porque
   el buscador injertó lo nuevo alrededor de su campo: el HTML solo trae el estado FINAL de todo
   —cifras con su valor nuevo, barras con su ancho— y lo que se mueve se decide aquí, con lo que
   se recuerda fuera del DOM. */
function despuesDePintar() {
  if (TAB === 'asientos') cablearAsientos();
  rodarCuentas(cont);
  vigilarBarras();
  ubicarMesesTipo();
  if (TRAYENDO && !SILENCIOSA) encenderBoton();
  aplicarCierre();
}

function htmlPantalla() {
  const nCom = D.comisiones.abonables.length;
  if (!tabs().includes(TAB)) TAB = 'ventas';            // se apagó Supabase con la pestaña abierta
  const opciones = [
    { v: 'ventas', t: 'Resumen' },
    { v: 'lista', t: 'Ventas' },
    { v: 'cobrar', t: 'Por cobrar' + (D.kpi.porCobrar.n ? ' · ' + D.kpi.porCobrar.n : '') },
    { v: 'comisiones', t: 'Comisiones' + (nCom ? ' · ' + nCom : '') },
    { v: 'gastos', t: 'Gastos' },
    { v: 'bitacora', t: 'Bitácora' },
  ];
  if (tabs().includes('asientos')) opciones.push({ v: 'asientos', t: laBaseManda() ? 'Cobros y abonos' : 'Registrar (Supabase)' });
  const pestanas = segmento(opciones, TAB, 'data-tab', 'Qué ver');

  let cuerpo;
  if (TAB === 'asientos') cuerpo = '<div id="ct-asientos" class="pg-supa">' + (_PS ? _PS.html() : '<p class="pf-nota" role="status">Abriendo…</p>') + '</div>';
  else if (TAB === 'lista') cuerpo = pintarLista();
  else if (TAB === 'cobrar') cuerpo = pintarCobrar();
  else if (TAB === 'comisiones') cuerpo = pintarComisiones();
  else if (TAB === 'gastos') cuerpo = pintarGastos();
  else if (TAB === 'bitacora') cuerpo = pintarBitacora();
  else cuerpo = pintarVentas();

  return '<div class="ag-barra ct-pestanas">' + pestanas + '</div>' + cuerpo;
}

/* «Por cobrar» es de la hoja cuando TODOS los saldos bajaron de allá; «(estimado)» si alguno
   se calculó aquí. Decir «estimado» sobre la fórmula de la hoja era mentir para abajo. */
function etiquetaCobrar() {
  const conSaldo = D.cartera.length;
  const deHoja = D.cartera.filter(x => x.deNotion).length;
  if (!conSaldo || deHoja === conSaldo) return { t: 'Por cobrar', em: conSaldo ? 'según la hoja' : '' };
  if (!deHoja) return { t: 'Por cobrar (estimado)', em: 'total menos anticipo' };
  return { t: 'Por cobrar (parte estimado)', em: deHoja + ' de ' + conSaldo + ' con saldo de la hoja' };
}

/* ============================================================================
   Lo vendido por tipo de trabajo — al final de la pestaña Ventas (octubre de 2026)
   ============================================================================
   La petición del dueño: tener a la vista cuántas letras, cuántas cajas de luz, cuántos
   viniles se han vendido, este mes, este año y desde que se trabaja. Iba arriba de las
   cuatro pestañas; en octubre de 2026 la dirección pidió que lo primero fueran las finanzas de
   lo vivo y los doce meses, y esto bajó al final de la pestaña Ventas.

   La aritmética está en js/datos/ventas-por-tipo.js, que es pura y tiene pruebas; ahí está
   escrito cómo cuenta una venta con dos tipos (en los dos; el total general, una vez).

   Tres piezas:
     · las TARJETAS —una por tipo, más la del total—: cuántos trabajos, de cuánto (solo a quien
       ve dinero) y contra el periodo anterior, con ▲/▼ y la palabra, no solo el color;
     · el selector del PERIODO de las tarjetas: este mes, este año, todo;
     · la GRÁFICA, mes a mes desde la primera venta o año por año: barras apiladas por tipo,
       con el número encima, y cada columna es un botón que abre su desglose exacto (pieza 4).
   Los colores de cada tipo salen de una sola tabla (`PorTipo.claseTipo`) y viven en el bloque
   «Control · por tipo de trabajo» del final de css/plataforma.css. Ningún dato va solo en color:
   cada tarjeta dice su nombre y la gráfica lleva leyenda con texto. */

const nTrab = n => n + (n === 1 ? ' trabajo' : ' trabajos');
const nVentas = n => n + (n === 1 ? ' venta' : ' ventas');

function htmlPorTipo() {
  const dinero = Prefs.veDinero();
  const r = PorTipo.resumenPorTipo(D.ventas, { hoy: D.hoy, periodo: TT_PER });
  const per = segmento([
    { v: 'mes', t: 'Este mes' }, { v: 'anio', t: 'Este año' }, { v: 'todo', t: 'Todo' },
  ], TT_PER, 'data-tt-per', 'Periodo de las tarjetas por tipo');
  const que = TT_PER === 'anio' ? 'en ' + r.rango.etiqueta : r.rango.etiqueta;

  const tarjetas = [tarjetaTotal(r, dinero)].concat(r.tipos.map(x => tarjetaTipo(x, r, dinero))).join('');
  const sinTipo = r.tipos.find(x => x.tipo === PorTipo.SIN_TIPO);
  const avisos = [];
  if (sinTipo && sinTipo.n) {
    avisos.push(nVentas(sinTipo.n) + ' de este periodo no ' + (sinTipo.n === 1 ? 'tiene' : 'tienen') +
      ' tipo de trabajo capturado: se corrige en la columna «Tipo de trabajo» de la hoja.');
  }
  if (r.sinFecha) avisos.push(nVentas(r.sinFecha) + ' sin fecha de anticipo no ' + (r.sinFecha === 1 ? 'cae' : 'caen') + ' en ningún periodo.');

  return '<section class="card ct-tt" id="ct-tt" aria-labelledby="ct-tt-h">' +
    '<div class="card-h"><h2 id="ct-tt-h">' + ico('i-control') + ' Vendido por tipo de trabajo</h2>' +
      '<span class="folio">' + esc(que) + '</span></div>' +
    '<div class="card-b">' +
      '<div class="ag-barra ct-tt-barra">' + per + '</div>' +
      '<div class="ct-tt-cards" role="list" tabindex="0" aria-label="Tarjetas por tipo de trabajo, ' + esc(que) + '">' + tarjetas + '</div>' +
      (avisos.length ? '<p class="pf-nota ct-tt-aviso">' + avisos.map(esc).join(' ') + '</p>' : '') +
      graficaPorTipo(dinero) +
      '<p class="pf-nota">Una venta con varios tipos —letras y bastidor, por ejemplo— cuenta como un trabajo en ' +
        'cada tipo que lleva' + (dinero ? ', y su importe entero aparece en cada uno de esos tipos: la hoja no dice ' +
        'cuánto fue de cada parte. Por eso las tarjetas pueden sumar más que el total, que cuenta cada venta una sola vez.' : '.') +
        ' Son las mismas ventas de la pestaña Ventas: sin las que no se dieron, por la fecha de su anticipo.' +
        (TT_PER === 'anio' ? ' «Este año» se compara con el año anterior hasta el mismo día.' : '') + '</p>' +
    '</div></section>';
}

/* La comparación con el periodo anterior, en palabras y con flecha: ▲ y ▼ no se leen solos. */
function comparacion(ahora, antes, etiqueta) {
  if (antes === null || antes === undefined) return '';
  const d = ahora - antes;
  const cls = d > 0 ? ' sube' : (d < 0 ? ' baja' : '');
  const txt = d > 0 ? '▲ ' + d + ' más que en ' : (d < 0 ? '▼ ' + (-d) + ' menos que en ' : '= igual que en ');
  return '<span class="ct-tt-cmp' + cls + '">' + esc(txt + etiqueta) + ' (' + antes + ')</span>';
}

function tarjetaTotal(r, dinero) {
  const ant = r.rango.anterior;
  return '<div class="ct-tt-card total" role="listitem">' +
    '<span class="ct-tt-nom">Total</span>' +
    '<b class="ct-tt-n">' + r.total.ventas + '</b>' +
    '<span class="ct-tt-u">' + (r.total.ventas === 1 ? 'venta' : 'ventas') + ' · ' + nTrab(r.total.trabajos) + '</span>' +
    (dinero ? '<span class="ct-tt-imp">' + esc(money(r.total.importe)) + '</span>' : '') +
    (ant ? comparacion(r.total.ventas, r.total.ventasAnt, ant.etiqueta) : '') +
  '</div>';
}

function tarjetaTipo(x, r, dinero) {
  const ant = r.rango.anterior;
  return '<div class="ct-tt-card ' + x.clase + (x.n ? '' : ' cero') + '" role="listitem">' +
    '<span class="ct-tt-nom"><i class="ct-tt-pt" aria-hidden="true"></i>' + esc(x.nombre) + '</span>' +
    '<b class="ct-tt-n">' + x.n + '</b>' +
    '<span class="ct-tt-u">' + (x.n === 1 ? 'trabajo' : 'trabajos') + '</span>' +
    (dinero ? '<span class="ct-tt-imp">' + esc(money(x.importe)) + '</span>' : '') +
    (ant ? comparacion(x.n, x.nAnt, ant.etiqueta) : '') +
  '</div>';
}

/* La gráfica. Cuenta TRABAJOS, no dinero: es la pregunta («cuántas cajas»), y apilar importes
   duplicaría el de las ventas con dos tipos. El importe del mes o del año, sin duplicar, está en
   el globo de cada columna y, en la de años, a un lado. */
function graficaPorTipo(dinero) {
  const vista = segmento([{ v: 'mes', t: 'Por mes' }, { v: 'anio', t: 'Por año' }], TT_VISTA, 'data-tt-vista', 'Gráfica por tipo');
  const serie = TT_VISTA === 'anio' ? D.porTipo.anio : D.porTipo.mes;
  if (!serie.length) {
    return '<div class="ct-tt-graf"><div class="ag-barra ct-tt-barra">' + vista + '</div>' +
      '<p class="pf-nota">Todavía no hay ventas con fecha que graficar. Cuando baje el récord de la hoja, o se gane una ' +
      'cotización, aparecen aquí por tipo.</p></div>';
  }
  const tipos = PorTipo.tiposVisibles(D.ventas);
  const tope = Math.max(1, ...serie.map(f => f.trabajos));
  const pila = f => tipos.filter(t => f.porTipo[t]).map(t =>
    '<i class="' + PorTipo.claseTipo(t) + '" style="flex-grow:' + f.porTipo[t] + '"></i>').join('');
  const leyenda = '<ul class="ct-tt-ley" aria-label="Colores de cada tipo">' + tipos.map(t =>
    '<li class="' + PorTipo.claseTipo(t) + '"><i class="ct-tt-pt" aria-hidden="true"></i>' + esc(PorTipo.nombreTipo(t)) + '</li>').join('') + '</ul>';

  let cuerpo;
  if (TT_VISTA === 'anio') {
    cuerpo = '<div class="ct-tt-anios">' + serie.map(f => {
      const interior = '<span class="ct-tt-et">' + esc(f.etiqueta) + '</span>' +
        '<span class="ct-tt-riel">' + (f.trabajos ? '<span class="ct-tt-pila" style="width:' +
          Math.max(2, Math.round(f.trabajos / tope * 100)) + '%">' + pila(f) + '</span>' : '') + '</span>' +
        '<span class="ct-tt-v">' + esc(nTrab(f.trabajos)) + '<small>' + esc(nVentas(f.ventas)) +
          (dinero ? ' · ' + esc(money(f.importe)) : '') + '</small></span>';
      return f.ventas
        ? '<button type="button" class="ct-tt-anio ct-tt-ver" data-tt-serie="anio" data-tt-k="' + esc(f.clave) +
          '" aria-haspopup="dialog" aria-expanded="false">' + interior + '<span class="solo-voz">, ver por tipo</span></button>'
        : '<div class="ct-tt-anio">' + interior + '</div>';
    }).join('') + '</div>';
  } else {
    cuerpo = '<div class="ct-tt-cols" tabindex="0" role="group" aria-label="Trabajos vendidos mes a mes, desde ' +
      esc(serie[0].etiqueta) + '">' + serie.map((f, i) => {
      const [mm, aa] = f.etiqueta.split(' ');
      const conAnio = i === 0 || f.clave.endsWith('-01');
      const interior = '<span class="ct-tt-area">' +
          (f.trabajos ? '<span class="ct-tt-num">' + f.trabajos + '</span><span class="ct-tt-pila" style="height:' +
            Math.max(3, Math.round(f.trabajos / tope * 100)) + '%">' + pila(f) + '</span>' : '') + '</span>' +
        '<span class="ct-tt-et">' + esc(mm) + (conAnio ? '<small>' + esc(aa) + '</small>' : '') + '</span>';
      const actual = f.clave === D.hoy.slice(0, 7) ? ' actual' : '';
      return f.ventas
        ? '<button type="button" class="ct-tt-col ct-tt-ver' + actual + '" data-tt-serie="mes" data-tt-k="' + esc(f.clave) +
          '" aria-haspopup="dialog" aria-expanded="false" aria-label="' + esc(f.etiqueta + ': ' + nTrab(f.trabajos) +
          ' en ' + nVentas(f.ventas) + ', ver por tipo') + '">' + interior + '</button>'
        : '<div class="ct-tt-col vacio' + actual + '" role="img" aria-label="' + esc(f.etiqueta + ': sin ventas') + '">' + interior + '</div>';
    }).join('') + '</div>';
  }
  return '<div class="ct-tt-graf"><div class="ag-barra ct-tt-barra">' + vista +
    '<span class="ct-tt-pista">Toca ' + (TT_VISTA === 'anio' ? 'un año' : 'un mes') + ' para ver el número de cada tipo</span></div>' +
    cuerpo + leyenda + '</div>';
}

/* El globo de un mes o un año: cada tipo con su número exacto (y su importe a quien ve dinero),
   de mayor a menor, y el total sin duplicar. Se calcula al abrir, con lo que haya en `D`. */
function vistazoTipo(serie, k) {
  if (!D || !D.porTipo) return '';
  const f = (serie === 'anio' ? D.porTipo.anio : D.porTipo.mes).find(x => x.clave === k);
  if (!f) return '';
  const dinero = Prefs.veDinero();
  const tipos = Object.keys(f.porTipo).sort((a, b) => f.porTipo[b] - f.porTipo[a] || a.localeCompare(b, 'es'));
  return '<span class="vistazo-t">' + esc(f.etiqueta) + '</span>' +
    '<dl class="ct-vz-tot"><dt class="suma">' + esc(nVentas(f.ventas) + ' · ' + nTrab(f.trabajos)) + '</dt>' +
      '<dd class="suma">' + (dinero ? esc(money(f.importe)) : '') + '</dd></dl>' +
    '<dl class="ct-tt-vz">' + tipos.map(t =>
      '<dt class="' + PorTipo.claseTipo(t) + '"><i class="ct-tt-pt" aria-hidden="true"></i>' + esc(PorTipo.nombreTipo(t)) + '</dt>' +
      '<dd><b>' + f.porTipo[t] + '</b>' + (dinero ? ' · ' + esc(money(f.importeTipo[t])) : '') + '</dd>').join('') + '</dl>' +
    (dinero && tipos.length > 1 ? '<p class="ct-vz-nota">El importe de una venta con varios tipos aparece en cada uno.</p>' : '');
}

/* La gráfica de meses corre de lado cuando no cabe (desde la primera venta pueden ser cuarenta
   meses). Al pintarse se queda donde se dejó y, la primera vez, en el final: lo más nuevo es lo
   que se busca. */
function ubicarMesesTipo() {
  const c = cont && cont.querySelector('.ct-tt-cols');
  if (!c) return;
  c.scrollLeft = _ttScroll === null ? c.scrollWidth : _ttScroll;
  c.addEventListener('scroll', () => { _ttScroll = c.scrollLeft; }, { passive: true });
}

/* ============================================================================
   EL RESUMEN — rehecho en octubre de 2026
   ============================================================================
   Lo que pidió Elías el 23/10/2026: «es muy difícil de entenderle… que en el principio
   claramente se vean los proyectos que tenemos en fabricación y cobrando… se ve muy amontonado».
   La pestaña medía 5,400 px: una frase con tres importes, dos bolsas con tres cifras cada una,
   renglones de cuatro líneas con un botón «Abrir» y «estimado» repetido en cada uno, ocho
   cuentas de ocho colores, la lista de ventas, el almacén y lo vendido por tipo. Ahora contesta
   tres preguntas, en ese orden, y cabe en unas dos pantallas de computadora:
     1. ¿Cuánto falta cobrar y dónde está? (`htmlClave`) — el total, grande; lo que falta de lo
        que está en el taller y de lo que ya se entregó; y UNA barra de cobrado contra lo que falta.
     2. ¿De quién? (`htmlFinanzas`) — dos listas limpias, un renglón de dos líneas por proyecto.
     3. ¿Cómo va el mes y el año? (`htmlEsteMes`, `graficaMeses`) — cinco tarjetas iguales y las
        doce barras de verdad, de pie, con el mejor mes y el promedio.
   El detalle —la lista de ventas con su buscador y su CSV, el ticket, la conversión, el mes
   pasado y lo vendido por tipo de trabajo— se fue a la pestaña Ventas (`pintarLista`).

   Ningún número cambió de cálculo: salen de las mismas funciones puras de js/datos/ventas.js
   (`finanzasVivas`, `indicadores`, `resumenMensual`) y de js/datos/gastos.js. Lo único que se
   decide aquí es el ORDEN de las dos listas (`ordenCobro`) y cómo se dice cada cosa.
   ============================================================================ */

function pintarVentas() {
  const partes = [lineaHoja(), htmlClave(), htmlFinanzas(), htmlEsteMes(), graficaMeses()];
  if (D.almacen) partes.push(filaAlmacen());
  partes.push(comoSeCuenta([
    '«Falta cobrar» suma el saldo de los proyectos en fabricación y de los que ya se entregaron y se están cobrando. ' +
    'Se reparte por el estatus de la hoja: FABRICACION y REPARANDO son trabajo del taller; COBRANDO ya se entregó; ' +
    'LIQUIDADO ya no aparece. «Ya cobrado» es lo vendido menos lo que falta.',
    'Lo que falta es el saldo de la hoja. Si la hoja todavía no lo trae, es el total menos el anticipo pactado: ' +
    'se marca con «≈» y su barra va rayada.',
    'Las dos listas van de lo que más falta cobrar a lo que menos, para que arriba quede el dinero que más pesa. ' +
    'Si dos deben lo mismo, primero la más antigua.',
    '«Vendido» suma el importe de cada venta por la fecha de su anticipo: el de la hoja cuando la venta está allá, y el ' +
    'que se firmó aquí cuando todavía no ha salido de este dispositivo. «Gastado» suma los gastos del mes por el día en ' +
    'que se pagaron, sin los anulados (pestaña Gastos), y la utilidad aproximada es lo vendido menos eso: no es la del ' +
    'contador —lo vendido no es lo cobrado, y solo cuenta lo que alguien capturó—, pero dice hacia dónde va el mes.',
  ]));
  return partes.join('');
}

const red2 = n => Math.round((Number(n) || 0) * 100) / 100;
const nProy = n => n + (n === 1 ? ' proyecto' : ' proyectos');
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
                   'octubre', 'noviembre', 'diciembre'];
/* «octubre de 2026» de un 'YYYY-MM': el título de «Este mes» se lee entero, no «oct 2026». */
const mesLargo = ym => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  return m ? (MES_LARGO[Number(m[2]) - 1] || m[2]) + ' de ' + m[1] : '';
};

/* «$630 mil», «$1.2 M»: el importe corto que va encima de cada barra de los doce meses. El exacto
   está en el globo del mes y en lo que oye el lector; encima de una columna de 60 px no cabe. */
function moneyCorto(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e6) return '$' + (Math.round(v / 1e5) / 10).toLocaleString('es-MX') + ' M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3).toLocaleString('es-MX') + ' mil';
  return '$' + Math.round(v).toLocaleString('es-MX');
}

/* Un plegable con la letra chica: la explicación sigue a un toque, pero ya no es un párrafo gris
   entre las cifras que hay que saltarse para llegar a la siguiente tarjeta. Recibe un texto o una
   lista de párrafos: uno solo de cinco ideas no se lee. */
function comoSeCuenta(texto) {
  const parrafos = Array.isArray(texto) ? texto : [texto];
  return '<details class="ct-como"><summary>¿De dónde salen estos números?</summary>' +
    parrafos.map(t => '<p>' + esc(t) + '</p>').join('') + '</details>';
}

/* ----- 1 · Las cifras clave -----
   Lo primero que se lee: cuánto falta cobrar en total —la cifra más grande de la pantalla— y de
   dónde: de lo que se está fabricando y de lo que ya se entregó. Debajo del total, una frase con
   UNA idea y la barra de cobrado contra lo que falta, con su palabra y su porcentaje al lado: el
   color no va solo. Las tres cifras son puertas (P3): el total abre Por cobrar y las otras dos
   bajan a su lista; y ruedan (P18) cuando la sincronización las cambia delante de quien mira, con
   la misma memoria por clave que las cuentas (`rodarCuentas`). */
function htmlClave() {
  const F = D.finanzas;
  const falta = red2(F.fabricacion.saldo + F.cobrando.saldo);
  const vendido = red2(F.fabricacion.vendido + F.cobrando.vendido);
  const cobrado = red2(F.fabricacion.cobrado + F.cobrando.cobrado);
  const n = F.fabricacion.n + F.cobrando.n;
  const pc = vendido > 0 ? Math.floor(cobrado / vendido * 100) : 0;
  const frase = !n ? 'No hay proyectos en fabricación ni cobrándose.'
    : !(falta > 0) ? 'Todo lo que está en fabricación y en cobranza ya está cobrado.'
    : 'De ' + money(vendido) + ' vendidos en ' + nProy(n) + ', ya entró el ' + pc + ' %.';
  /* «Por cobrar» suma el saldo de TODAS las ventas vivas; aquí, solo el de las que están en
     fabricación o cobrándose. Casi siempre es lo mismo; si una venta con saldo trae otro estatus en
     la hoja, la diferencia se dice, para que la cifra de aquí y la de la pestaña no parezcan
     contradecirse. */
  const otras = red2(D.kpi.porCobrar.total - falta);
  const nOtras = D.kpi.porCobrar.n - F.fabricacion.lista.concat(F.cobrando.lista).filter(x => x.saldo > 0).length;
  const aparte = otras > 0.005 && nOtras > 0
    ? '<p class="ct-clave-aparte">Además hay ' + esc(money(otras)) + ' por cobrar de ' + esc(nVentas(nOtras)) +
      ' con otro estatus en la hoja. Están en Por cobrar.</p>'
    : '';
  const barra = vendido > 0
    ? '<div class="ct-clave-barra" aria-hidden="true">' +
        (cobrado > 0 ? '<i class="cob" style="flex-grow:' + cobrado + '"></i>' : '') +
        (falta > 0 ? '<i class="falta" style="flex-grow:' + falta + '"></i>' : '') + '</div>' +
      '<p class="ct-clave-ley"><span class="cob"><i aria-hidden="true"></i>Ya cobrado · ' + pc + ' %</span>' +
        '<span class="falta"><i aria-hidden="true"></i>Falta · ' + (100 - pc) + ' %</span></p>'
    : '';
  return '<section class="card ct-clave-card" id="ct-clave" aria-labelledby="ct-clave-h">' +
    '<h2 id="ct-clave-h" class="solo-voz">Lo que falta cobrar</h2>' +
    '<div class="ct-clave-rej">' +
      '<div class="ct-clave-pri">' +
        clave('falta', 'Falta cobrar', money(falta), frase,
          D.kpi.porCobrar.n > 0 ? { dest: 'tab:cobrar', que: 'abrir Por cobrar' } : null, 'principal') +
        barra + aparte +
      '</div>' +
      '<div class="ct-clave-sec">' +
        clave('fab', 'En fabricación', money(F.fabricacion.saldo), nProy(F.fabricacion.n) + ' en el taller',
          F.fabricacion.n ? { dest: 'fin:fabricacion', que: 'ir a la lista de En fabricación' } : null, 'fab', 'i-taller') +
        clave('cob', 'Cobrando · ya entregados', money(F.cobrando.saldo), nProy(F.cobrando.n) + ' por terminar de pagar',
          F.cobrando.n ? { dest: 'fin:cobrando', que: 'ir a la lista de Cobrando' } : null, 'cob', 'i-reloj') +
      '</div>' +
    '</div></section>';
}

/* Una cifra clave: botón si lleva a algún lado (P3), párrafo si no. La etiqueta va arriba, en su
   `.pf-cuenta-t` (de ahí cuelga la flechita de «ir»), y la cifra en un `<b>` hijo directo, que es lo
   que `rodarCuentas` hace rodar, con su ancho en `--c` para achicarse a lo que quepa en su caja. */
function clave(k, etiqueta, valor, detalle, va, cls, icono) {
  const cuerpo = '<span class="pf-cuenta-t">' +
      (icono ? '<span class="ct-clave-ico" aria-hidden="true">' + ico(icono) + '</span>' : '') + esc(etiqueta) + '</span>' +
    cifraQueCabe(valor) +
    '<span class="ct-clave-d">' + esc(detalle) + '</span>';
  const c = 'ct-clave ' + cls;
  if (!va) return '<p class="' + c + '" data-cuenta="' + esc(k) + '">' + cuerpo + '</p>';
  return '<button type="button" class="' + c + ' va" data-va="' + esc(va.dest) + '" data-cuenta="' + esc(k) + '">' + cuerpo +
    '<span class="solo-voz">, ' + esc(va.que) + '</span></button>';
}

/* ----- 2 · Las dos listas: en fabricación y cobrando -----
   Una tarjeta por bolsa de `Ventas.finanzasVivas`, lado a lado en la computadora y una sobre otra en
   el teléfono. Cada renglón tiene dos líneas y nada más (`filaRenglon`):
     · el nombre del CLIENTE, una vez (`nombreCliente`), y debajo el folio, la etapa en su ficha de
       color y cuánto lleva;
     · a la derecha, lo que falta cobrar y su medidor quieto con el porcentaje (pieza 20, P30).
   El renglón entero se toca: abre la ficha del proyecto o, si la venta solo está en la hoja y no
   tiene ficha, un globo con sus cifras (`vistazoVenta`). «Estimado» ya no se repite en cada
   renglón: lo dice UN aviso arriba de la lista, y el renglón lleva «≈» y su barra rayada. */
function htmlFinanzas() {
  const F = D.finanzas;
  return '<div class="ct-fin" id="ct-fin">' +
    listaFinanzas('fabricacion', 'En fabricación', 'i-taller', F.fabricacion,
      'Nada en fabricación', 'Cuando una venta tenga estatus FABRICACION o REPARANDO en la hoja, aparece aquí.') +
    listaFinanzas('cobrando', 'Cobrando', 'i-reloj', F.cobrando,
      'Nada cobrándose', 'Cuando una venta pase a COBRANDO en la hoja, aparece aquí con lo que le falta.') +
  '</div>';
}

/* El orden de las dos listas: de lo que más falta cobrar a lo que menos y, si dos deben lo mismo, la
   más antigua primero. Se eligió sobre «lo más antiguo arriba» porque la pantalla es para COBRAR:
   arriba queda el dinero que más pesa, los seis primeros renglones suelen ser casi todo lo que
   falta y «Ver los N» esconde lo chico, no lo grande. La antigüedad no se pierde: cada renglón la
   dice («hace 8 meses»). Es solo el orden en que se pinta: `finanzasVivas` sigue entregando las
   suyas por fecha, y sus pruebas no cambian. */
function ordenCobro(a, b) {
  const fa = String(a.proyecto.fecha_ganado || '9999'), fb = String(b.proyecto.fecha_ganado || '9999');
  return (b.saldo - a.saldo) || (fa < fb ? -1 : fa > fb ? 1 : 0);
}

function listaFinanzas(g, titulo, icono, b, vacioT, vacioD) {
  const orden = b.lista.slice().sort(ordenCobro);
  const todos = FIN_TODOS[g] || orden.length <= FIN_TOPE;
  const vis = todos ? orden : orden.slice(0, FIN_TOPE);
  const est = b.estimados;
  const nota = orden.length > 1 || est
    ? '<p class="ct-fin-nota">' + (orden.length > 1 ? 'De lo que más falta cobrar a lo que menos.' : '') +
      (est ? ' <span class="ct-fin-est"><b aria-hidden="true">≈</b> ' + esc(est === 1
        ? 'Un saldo es estimado: la hoja todavía no lo trae.'
        : est + ' saldos son estimados: la hoja todavía no los trae.') + '</span>' : '') + '</p>'
    : '';
  const mas = orden.length > FIN_TOPE
    ? '<button type="button" class="ct-fin-mas" data-fin-todos="' + g + '" aria-expanded="' + (todos ? 'true' : 'false') +
      '" aria-controls="ct-fin-l-' + g + '">' + (todos ? 'Ver menos' : 'Ver los ' + orden.length + ' proyectos') + '</button>'
    : '';
  return '<section class="card ct-fin-bolsa ' + g + '" id="ct-fin-' + g + '" aria-labelledby="ct-fin-' + g + '-h">' +
    '<div class="card-h"><h2 id="ct-fin-' + g + '-h">' + ico(icono) + ' ' + esc(titulo) +
      ' <span class="folio">' + b.n + '</span></h2>' +
      (b.n ? '<span class="ct-fin-tot">' + esc(money(b.saldo)) + '<small>por cobrar</small></span>' : '') + '</div>' +
    '<div class="card-b">' +
      (orden.length
        ? nota + '<ul class="ct-fin-lista" id="ct-fin-l-' + g + '">' + vis.map(x => '<li>' + filaFinanza(x) + '</li>').join('') + '</ul>' + mas
        : vacio(vacioT, vacioD)) +
    '</div></section>';
}

/* El renglón de una lista del Resumen. A la derecha, lo que falta cobrar —«≈» si es estimado— y el
   medidor quieto de la pieza 20 con lo cobrado en verde, lo que falta punteado y, si el saldo no es
   el de la hoja, rayado (P30); el porcentaje va escrito, redondeado hacia abajo como en Por cobrar. */
function filaFinanza(x) {
  const pct = x.vendido > 0 ? Math.floor(x.cobrado / x.vendido * 100) : 100;
  const est = !x.deNotion && x.saldo > 0;
  const P = piezas();
  const medidor = P && typeof P.medidorHTML === 'function'
    ? P.medidorHTML({ valor: x.cobrado, max: x.vendido, meta: x.vendido, tono: 'ok', estimado: est }) : '';
  const der = '<span class="ct-fin-der">' +
      '<span class="ct-fin-monto' + (x.saldo > 0 ? '' : ' cobrado') + '">' +
        (est ? '<span class="ct-aprox" aria-hidden="true">≈</span>' : '') + esc(money(x.saldo > 0 ? x.saldo : x.vendido)) +
        '<span class="solo-voz">' + (x.saldo > 0 ? ' por cobrar' + (est ? ', estimado' : '') : ' cobrado') + '</span></span>' +
      '<span class="ct-fin-cob">' + medidor + '<span class="ct-fin-pct">' + pct + ' %<span class="solo-voz"> cobrado</span></span></span>' +
    '</span>';
  return filaRenglon(x.proyecto, der, { cls: 'ct-fin-fila' });
}

/* El renglón que se toca entero, el de las listas del Resumen y el de la pestaña Ventas. Dos líneas
   a la izquierda —el cliente; el folio, la etapa y cuándo entró— y a la derecha lo que se pide
   (`der`). Un proyecto de aquí abre su ficha en Proyectos; una venta que solo está en la hoja abre
   su globo. Ninguno lleva su propio botón «Abrir»: la flechita del final dice que el renglón se
   abre, y el lector oye a dónde. El nombre completo («Ale - Paréntesis (Vinil)») queda en el
   `title`. Lo único que se marca del origen es «solo aquí» —lo que todavía no sale hacia la hoja—,
   porque es un aviso; «hoja» en cada renglón era ruido, y su globo ya lo dice. */
function filaRenglon(p, der, o = {}) {
  const nombre = nombreCliente(p);
  /* Cada pedazo de la segunda línea va entero (`.nw`): en el teléfono la línea se parte entre
     pedazos, no a media frase («entró / hoy»). */
  const meta = ['<span class="nw">' + esc(foliosDe(p) || 'sin folio') + '</span>'];
  const et = chipEtapa(p);
  if (et) meta.push(et);
  if (o.fecha === 'exacta') meta.push('<span class="nw">' + esc(fmtFecha(p.fecha_ganado) || 'sin fecha') + '</span>');
  else {
    const cuando = antiguedad(p.fecha_ganado);
    if (cuando) meta.push('<span class="nw" title="' + esc('Entró el ' + fmtFecha(p.fecha_ganado)) + '">' + esc(cuando) + '</span>');
  }
  if (o.extra) meta.push('<span class="nw">' + o.extra + '</span>');
  const soloAqui = !p.de_hoja && origenDe(p);
  const interior = '<span class="ct-fin-tx"><span class="ct-fin-nom">' + esc(nombre) + (soloAqui || '') + '</span>' +
      '<span class="ct-fin-meta">' + meta.join(' · ') + '</span></span>' + der +
    '<span class="ct-chev" aria-hidden="true"></span>';
  const titulo = p.nombre && p.nombre !== nombre ? ' title="' + esc(p.nombre) + '"' : '';
  const cls = 'ct-fila ct-renglon ' + (o.cls || '');
  if (p.de_hoja) {
    return '<button type="button" class="' + cls + ' ct-fin-ver" data-fin="' + esc(p.id) + '" aria-haspopup="dialog" aria-expanded="false"' +
      titulo + '>' + interior + '<span class="solo-voz">, ver el detalle</span></button>';
  }
  return '<button type="button" class="' + cls + '" data-abrir="' + esc(p.id) + '"' + titulo + '>' +
    interior + '<span class="solo-voz">, abrir la ficha</span></button>';
}

/* El nombre que se lee en un renglón: el del CLIENTE, una sola vez. El nombre del proyecto es
   «Contacto - Negocio — qué se hace (Tipo)» (`nombreDerivado` en js/datos/proyectos.js), y en una
   lista de cobro se leía «Óptica Visión - Óptica Visión — anuncio (Letras Luz)»: tres veces el
   cliente y dos cosas que ya dice la ficha. Se queda el NEGOCIO, que es lo que se reconoce de un
   vistazo (lo mismo que hace el Calendario con sus fichas):
     · sin el «(Tipo)» del final;
     · sin lo que va después de una raya larga («Farmacia San Juan – Letrero fachada»: el campo
       Proyecto del cotizador lleva el negocio y lo que se hace);
     · y de una fila de la hoja, que trae el nombre entero sin partir, la mitad de después del
       « - », como la parte proyectos.js al importarla (`partirNombreDeHoja`).
   Sin negocio, el contacto; sin nada, el folio. No cambia ningún dato: es lo que se pinta. */
function nombreCliente(p) {
  const sinTipo = s => String(s || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  let t = sinTipo(p && p.negocio);
  if (t && p.de_hoja && !p.contacto) {
    const i = t.indexOf(' - ');
    if (i > 0 && t.slice(i + 3).trim()) t = t.slice(i + 3).trim();
  }
  t = t.split(/\s+[–—]\s+/)[0].trim();
  return t || sinTipo(p && p.contacto) || sinTipo(p && p.nombre) || (p && (p.folio_local || p.folio_hoja)) || 'Sin nombre';
}

/* La etapa en su ficha de color, solo si es una que la plataforma conoce: la columna «Etapa de
   obra» de la hoja puede traer otro texto, y pintado tal cual («en_fabricacion») parecía un error.
   Una venta REPARANDO lo dice: en la lista de fabricación es lo que la distingue. */
function chipEtapa(p) {
  if (p.etapa === 'cancelado') return '<span class="pf-etapa cerrado">No se dio</span>';
  const n = p.etapa && Proy.ETAPA_NOMBRE[p.etapa];
  if (n) return '<span class="pf-etapa ' + ETAPA_CLASE(p.etapa) + '">' + esc(n) + '</span>';
  if (String(p.estatus_notion || '').trim().toUpperCase() === 'REPARANDO') return '<span class="pf-etapa armado">Reparando</span>';
  return '';
}

/* Cuánto lleva una venta desde que entró (la fecha de su anticipo), dicho como se dice: «hace 3
   días», «hace 8 meses». En una lista de cobro la antigüedad pesa más que el día exacto, que queda
   en el `title` y en la ficha. */
function antiguedad(iso) {
  const d = D && iso ? diasEntre(iso, D.hoy) : null;
  if (d === null || d < 0) return '';
  if (d === 0) return 'entró hoy';
  if (d === 1) return 'entró ayer';
  if (d < 45) return 'hace ' + d + ' días';
  const m = Math.round(d / 30.44);
  if (m < 24) return 'hace ' + m + ' meses';
  return 'hace ' + Math.floor(d / 365) + ' años';
}

/* El globo de una venta que solo está en la hoja: sus cifras, de dónde sale el saldo y por qué no
   abre una ficha. Se calcula al abrir, con lo que hay en `D` en ese momento. */
function vistazoVenta(id) {
  if (!D || !id) return '';
  const p = D.ventas.find(x => String(x.id) === String(id));
  if (!p) return '';
  const vendido = Ventas.vendidoDe(p), saldo = Ventas.saldoDe(p);
  const cobrado = Math.max(0, Math.min(vendido, red2(vendido - saldo)));
  const pct = vendido > 0 ? Math.floor(cobrado / vendido * 100) : 0;
  const cancelado = p.etapa === 'cancelado';
  const fila = (t, v) => '<dt>' + esc(t) + '</dt><dd>' + esc(v) + '</dd>';
  const suma = cancelado ? ['No se dio', money(vendido)] : saldo > 0 ? ['Falta cobrar', money(saldo)] : ['Cobrado', money(vendido)];
  return '<span class="vistazo-t">' + esc(nombreCliente(p)) + '</span>' +
    '<dl class="ct-vz-tot"><dt class="suma">' + esc(suma[0]) + '</dt><dd class="suma">' + esc(suma[1]) + '</dd></dl>' +
    '<dl class="ct-vz-det">' +
      (cancelado ? '' : fila('Vendido', money(vendido)) + fila('Ya cobrado', money(cobrado) + ' · ' + pct + ' %')) +
      (p.anti_pactado ? fila('Anticipo pactado', money(p.anti_pactado)) : '') +
      fila('Folio', foliosDe(p) || 'sin folio') +
      (p.fecha_ganado ? fila('Entró', fmtFecha(p.fecha_ganado)) : '') +
      (p.estatus_notion ? fila('Estatus en la hoja', p.estatus_notion) : '') +
      (p.cuenta ? fila('Cuenta', p.cuenta) : '') +
    '</dl>' +
    (p.nombre && p.nombre !== nombreCliente(p) ? '<p class="ct-vz-nota">' + esc(p.nombre) + '</p>' : '') +
    '<p class="ct-vz-nota">' + (!cancelado && saldo > 0
      ? (Ventas.saldoEsDeHoja(p) ? 'El saldo es el de la hoja. ' : 'Saldo estimado: el total menos el anticipo pactado; la hoja todavía no lo trae. ')
      : '') + 'Esta venta solo está en la hoja de finanzas: no tiene ficha en la plataforma.</p>';
}

/* ----- 3 · Este mes -----
   Cinco tarjetas iguales —mismo tamaño, misma letra, mismo blanco— en vez de las ocho de ocho
   colores que había: lo vendido (con el cambio contra el mes pasado en su ficha, con flecha Y
   palabra), las cotizaciones por cerrar, lo gastado, la utilidad aproximada y lo perdido. Siguen
   siendo las cuentas de siempre (`cuenta`, P3 y P18): las que llevan a algo son botones con su
   flechita, y ruedan cuando cambian frente a quien mira. Las cifras van todas al mismo tamaño
   (`filaCuentas`), sin tinte de fondo; el único color que queda es el de una utilidad negativa y el
   de la ficha del cambio, que además lo dicen con palabras. El mes pasado, el ticket y la
   conversión son de consulta y están en la pestaña Ventas. */
function htmlEsteMes() {
  const k = D.kpi, G = D.resGastos;
  const ymHoy = D.meses[D.meses.length - 1].mes;
  const aProyectos = Prefs.esDireccion() && CTX && typeof CTX.tieneRuta === 'function' && CTX.tieneRuta('proyectos');
  const util = Gastos.utilidad(k.mes.total, G.mes.total);
  const c = [
    [money(k.mes.total), 'Vendido', { clave: 'mes',
      va: k.mes.n > 0 ? { dest: 'lista:mes', que: 'ver las ventas de ' + k.mes.etiqueta } : null,
      em: nVentas(k.mes.n), chip: chipCambio(k.variacion, k.mesAnterior, true) }],
    [money(k.pipeline.total), 'Cotizaciones por cerrar', { clave: 'pipe',
      va: k.pipeline.n > 0 && aProyectos ? { dest: 'ir:proyectos', que: 'abrir Proyectos para decidirlas' } : null,
      em: k.pipeline.n + (k.pipeline.n === 1 ? ' autorizada, sin respuesta' : ' autorizadas, sin respuesta') }],
    [money(G.mes.total), 'Gastado', { clave: 'gastado',
      va: G.mes.n > 0 ? { dest: 'tab:gastos', que: 'abrir Gastos' } : null,
      em: nGastos(G.mes.n), chip: chipCambio(G.variacion, G.anterior, false) }],
    [money(util), 'Utilidad aproximada', { clave: 'utilidad', neg: util < 0, em: 'vendido menos gastado' }],
    [money(k.perdidoMes.total), 'Perdido', { clave: 'perdido',
      va: k.perdidoMes.n > 0 ? { dest: 'mes:' + ymHoy, que: 'ir a ' + k.mes.etiqueta + ' en las doce barras' } : null,
      em: k.perdidoMes.n + (k.perdidoMes.n === 1 ? ' cotización no se dio' : ' cotizaciones no se dieron') }],
  ];
  return '<section class="ct-sec" id="ct-este-mes" aria-labelledby="ct-este-mes-h">' +
    '<h2 class="ct-sec-t" id="ct-este-mes-h">Este mes <span>' + esc(mesLargo(ymHoy)) + '</span></h2>' +
    filaCuentas(c, 'ct-cinco') + '</section>';
}

/* El cambio contra el mes pasado, en su ficha: flecha Y palabra, nunca solo color. En lo vendido,
   subir es bueno (verde) y bajar es malo (rojo); en lo gastado la ficha va neutra, porque gastar
   más puede ser comprar el material de una venta grande. Sin mes pasado (en cero) no hay
   porcentaje que dar —«+∞ %» no le dice nada a nadie— y no se pinta. */
function chipCambio(v, ant, alza) {
  if (v === null || v === undefined || !ant) return '';
  const mes = String(ant.etiqueta || '').split(' ')[0].toLowerCase();
  const cls = !alza || v === 0 ? '' : (v > 0 ? ' sube' : ' baja');
  const t = v > 0 ? '▲ ' + v.toLocaleString('es-MX') + ' % vs ' + mes
    : v < 0 ? '▼ ' + (-v).toLocaleString('es-MX') + ' % vs ' + mes : '= igual que ' + mes;
  return '<span class="ct-cambio' + cls + '">' + esc(t) + '</span>';
}

/* Una fila de cuentas, con la cifra al MISMO tamaño en todas: el que pida la más larga. Cada
   una a su tamaño cabía, pero «$0.00» salía a 28 px junto a un importe de siete cifras a 14, y
   el número más grande de la fila parecía el más chico. Ver `cifraQueCabe()` en ui.js.
   El mismo `--c` es la mitad de la promesa: la hoja saca el tamaño del ancho de CADA tarjeta,
   así que la otra mitad es que todas midan lo mismo. Por eso en esta fila la del dinero no se
   lleva el renglón entero en el teléfono angosto (`.pf-cuenta.dinero` en css/plataforma.css).
   `cls` es la forma de la fila: `ct-cinco` (Este mes) y `ct-tres` (la pestaña Ventas) van con la
   etiqueta arriba y sin tinte, como tarjetas de tablero. */
function filaCuentas(c, cls) {
  const largo = Math.max(1, ...c.map(x => String(x[0]).length));
  return '<div class="pf-cuentas' + (cls ? ' ' + cls : '') + '">' + c.map(x => cuenta(x[0], x[1], x[2], largo)).join('') + '</div>';
}

/* P3 + P18. La cuenta es un `<p>` o, si lleva a algún lado (`o.va`), un `<button class="va">` con
   la flechita de «ir» que pone la hoja de estilos del Tablero tras la etiqueta y el destino dicho
   con palabras para el lector («…, abrir Por cobrar»): el color y la flecha solos no lo cuentan.
   `o.clave` es la memoria del odómetro (la cifra se repinta con cada toque y el valor anterior
   no puede vivir en el nodo). La etiqueta va en su `<span class="pf-cuenta-t">` porque ahí cuelga
   la flecha. `o.chip` es la ficha del cambio contra el mes pasado y `o.neg` pinta la cifra de una
   resta que quedó abajo de cero. */
function cuenta(valor, etiqueta, o = {}, largo) {
  const tono = o.dinero ? ' dinero' : (o.mal ? ' mal' : (o.urge ? ' urge' : ''));
  const cls = tono + (o.neg ? ' neg' : '');
  const clave = o.clave ? ' data-cuenta="' + esc(o.clave) + '"' : '';
  const cuerpo = cifraQueCabe(valor, largo) + '<span class="pf-cuenta-t">' + esc(etiqueta) + '</span>' +
    (o.em ? '<em>' + esc(o.em) + '</em>' : '') + (o.chip || '');
  if (!o.va) return '<p class="pf-cuenta ct-cuenta' + cls + '"' + clave + '>' + cuerpo + '</p>';
  return '<button type="button" class="pf-cuenta ct-cuenta va' + cls + '" data-va="' + esc(o.va.dest) + '"' + clave + '>' +
    cuerpo + '<span class="solo-voz">, ' + esc(o.va.que) + '</span></button>';
}

/* ----- 4 · Los doce meses -----
   En barras DE PIE —como se leen las ventas por mes en cualquier tablero—, en HTML y CSS y nada
   más: cada mes es una columna con su barra (`height` en porcentaje del mejor mes) y su nombre
   abajo. Sin librería ni lienzo, y se imprime igual que se ve. Antes eran doce renglones con la
   barra acostada y el importe a la derecha: se leían como una lista, no como una forma, y lo que
   se busca aquí es la forma (¿va subiendo?, ¿qué mes fue bueno?). De un vistazo:
     · el MEJOR mes, en el azul lleno de la marca y con su importe encima; los demás, en lavanda;
     · el PROMEDIO, una raya punteada de lado a lado (su cifra, arriba, en «Promedio por mes»);
     · el mes en curso, con su nombre en azul;
     · y en la computadora, el importe corto de cada mes encima de su barra («$630 mil»). En el
       teléfono no caben doce: queda el del mejor mes, y el de cada uno está en su globo.
   Lo perdido ya no lleva su barra gris: la cifra del mes está en la tarjeta «Perdido» y la de
   cada mes, en su globo («No se dio · 1 cotización»). Dos barras por mes en 25 px no se leían.

   P27 · Lo mismo que antes, y nada de esto cambia lo que dice la gráfica. Un mes con algo que
   contar (una venta o una que no se dio) es un BOTÓN que abre un globo con sus ventas y su total
   (pieza 4, `vistazoMes`); un mes en cero sigue siendo una columna sin botón. Cada botón lleva su
   `id` para que el globo, si la pantalla se repinta con él abierto, encuentre a su gemelo y se
   quede. El importe exacto y sus ventas van en `.ct-mes-v`, escritos para el lector. Y las barras
   crecen UNA vez, la primera que se ven (`_barras`, `vigilarBarras`): nacen en `scaleY(0)` con la
   clase `espera` solo mientras está pendiente; después nacen terminadas, y por eso un repintado
   no las vuelve a mover. */
function graficaMeses() {
  const M = D.meses;
  const tope = Math.max(1, ...M.map(m => m.vendido));
  const total = M.reduce((s, m) => s + m.vendido, 0);
  const prom = red2(total / M.length);
  const mejor = M.reduce((a, m) => (m.vendido > 0 && (!a || m.vendido > a.vendido) ? m : a), null);
  const ymHoy = D.hoy.slice(0, 7);
  const cols = M.map((m, i) => {
    const abre = m.ganados > 0 || m.perdidos > 0;
    const pv = m.vendido > 0 ? Math.max(1.5, Math.round(m.vendido / tope * 1000) / 10) : 0;
    const [mm, aa] = String(m.etiqueta).split(' ');
    const conAnio = i === 0 || m.mes.endsWith('-01');
    const esMejor = !!mejor && m.mes === mejor.mes;
    const interior =
      '<span class="ct-mes-zona" aria-hidden="true">' +
        (m.vendido > 0 ? '<i class="ct-b vendido" style="height:' + pv + '%"></i>' +
          '<span class="ct-mes-cifra" style="bottom:' + pv + '%">' + esc(moneyCorto(m.vendido)) + '</span>' : '') +
      '</span>' +
      '<span class="ct-mes-t">' + esc(mm) + (conAnio ? ' <small>' + esc(aa) + '</small>' : '') + '</span>' +
      (abre
        ? '<span class="ct-mes-v solo-voz">' + esc(money(m.vendido)) + ' <small>' + nVentas(m.ganados) +
          (m.perdidos ? ' · ' + m.perdidos + ' no se ' + (m.perdidos === 1 ? 'dio' : 'dieron') : '') +
          (esMejor ? ' · el mejor mes' : '') + '</small></span><span class="solo-voz">, ver sus ventas</span>'
        : '<span class="ct-mes-v cero solo-voz"> sin ventas</span>');
    const clase = 'ct-mes' + (m.mes === ymHoy ? ' actual' : '') + (esMejor ? ' mejor' : '') + (abre ? '' : ' vacio') +
      (i === 0 ? ' pri' : '') + (i === M.length - 1 ? ' ult' : '');
    return abre
      ? '<button type="button" class="' + clase + ' ct-mes-ver" id="ct-mes-' + esc(m.mes) + '" data-mes="' + esc(m.mes) +
        '" aria-haspopup="dialog" aria-expanded="false">' + interior + '</button>'
      : '<div class="' + clase + '">' + interior + '</div>';
  }).join('');
  /* La raya del promedio, a la altura que le toca contra el mejor mes. Va primero en el marcado
     para quedar DETRÁS de las barras y de sus importes (que llevan el fondo de la tarjeta), como
     una raya de referencia, y no recibe toques. */
  const pProm = prom > 0 ? Math.round(prom / tope * 1000) / 10 : 0;
  const capa = pProm > 0
    ? '<span class="ct-prom-capa" aria-hidden="true"><i class="ct-prom" style="bottom:' + pProm + '%"></i></span>' : '';
  /* Las tres respuestas que se buscan en esta gráfica, dichas arriba para no tener que sumar a ojo;
     la del promedio y la del mejor mes llevan la muestra de cómo se ven abajo. */
  const resumen = '<dl class="ct-meses-res">' +
    '<div><dt>Vendido en 12 meses</dt><dd>' + esc(money(total)) + '</dd></div>' +
    '<div><dt><i class="ct-ley-prom" aria-hidden="true"></i>Promedio por mes</dt><dd>' + esc(money(prom)) + '</dd></div>' +
    (mejor ? '<div><dt><i class="ct-ley-mejor" aria-hidden="true"></i>Mejor mes</dt><dd>' + esc(mejor.etiqueta) +
      ' <small>' + esc(money(mejor.vendido)) + '</small></dd></div>' : '') +
  '</dl>';
  return '<section class="card ct-meses" id="ct-meses" aria-labelledby="ct-meses-h">' +
    '<div class="card-h"><h2 id="ct-meses-h">' + ico('i-control') + ' Últimos doce meses</h2></div>' +
    '<div class="card-b">' + resumen +
      '<div class="ct-grafica' + (_barras === 'espera' ? ' espera' : '') + '" role="group" aria-label="' +
        esc('Lo vendido mes a mes, de ' + M[0].etiqueta + ' a ' + M[M.length - 1].etiqueta) + '">' + capa + cols + '</div>' +
      '<p class="pf-nota ct-leyenda">Toca un mes para ver sus ventas.</p>' +
    '</div></section>';
}

/* P27 · El globo de un mes: lo vendido, de mayor a menor, con su total arriba (el mismo que
   dice la barra, sale de `resumenMensual`) y, aparte, lo que no se dio. Se calcula AL ABRIR,
   con lo que hay en `D` en ese momento: una sincronización a media pantalla no deja un globo
   con la cifra vieja. La lista corta en quince renglones y dice cuántos más hay: con treinta
   ventas el globo no puede ser más alto que la pantalla. */
function vistazoMes(ym) {
  if (!D) return '';
  const m = D.meses.find(x => x.mes === ym);
  if (!m) return '';
  const delMes = D.ventas.filter(p => Ventas.mesDe(p.fecha_ganado) === ym);
  const vivas = delMes.filter(p => p.etapa !== 'cancelado')
    .sort((a, b) => Ventas.vendidoDe(b) - Ventas.vendidoDe(a));
  const perdidas = delMes.filter(p => p.etapa === 'cancelado');
  const TOPE = 15;
  const renglon = p => '<dt>' + esc(p.nombre || p.folio_local || p.folio_hoja || 'Sin nombre') +
    '<small>' + esc(foliosDe(p) || 'sin folio') + '</small></dt><dd>' + esc(money(Ventas.vendidoDe(p))) + '</dd>';
  let h = '<span class="vistazo-t">' + esc(m.etiqueta) + '</span>';
  if (vivas.length) {
    h += '<dl class="ct-vz-tot"><dt class="suma">Vendido · ' + vivas.length + (vivas.length === 1 ? ' venta' : ' ventas') +
      '</dt><dd class="suma">' + esc(money(m.vendido)) + '</dd></dl>' +
      '<div class="ct-vz-lista" tabindex="0" role="group" aria-label="Ventas de ' + esc(m.etiqueta) + '"><dl>' +
      vivas.slice(0, TOPE).map(renglon).join('') + '</dl>' +
      (vivas.length > TOPE ? '<p class="ct-vz-mas">y ' + (vivas.length - TOPE) + ' más en la lista de Ventas</p>' : '') + '</div>' +
      '<p class="ct-vz-nota">Ticket promedio ' + esc(money(m.vendido / vivas.length)) + '</p>';
  } else {
    h += '<p class="ct-vz-nota">Sin ventas este mes.</p>';
  }
  if (perdidas.length) {
    h += '<dl class="ct-vz-perd"><dt>No se ' + (perdidas.length === 1 ? 'dio' : 'dieron') + ' · ' + perdidas.length +
      (perdidas.length === 1 ? ' cotización' : ' cotizaciones') + '</dt><dd>' + esc(money(m.perdido)) + '</dd></dl>';
  }
  return h;
}

/* El almacén, en un renglón chico al pie del Resumen y solo para la dirección: no es dinero de
   ventas, pero es dinero parado, y Material no dice cuánto vale. Era una tarjeta entera con su
   párrafo; ahora es una línea, y la línea entera lleva a Material. */
function filaAlmacen() {
  const a = D.almacen;
  const v = a.valor || {};
  const conCosto = Number(v.con_costo) || 0, sinCosto = Number(v.sin_costo) || 0;
  const texto = conCosto
    ? 'vale ' + money(v.total) + (sinCosto ? ' · ' + sinCosto + (sinCosto === 1 ? ' material sin costo no suma' : ' materiales sin costo no suman') : '')
    : 'sin costos capturados, su valor no se puede sumar';
  return '<button type="button" class="ct-almacen" data-ir="material">' +
    '<span class="ct-almacen-ico' + (a.bajoMinimo ? ' urge' : '') + '" aria-hidden="true">' + ico('i-material') + '</span>' +
    '<span class="ct-almacen-tx"><b>Almacén</b> · ' + esc(texto) + '</span>' +
    (a.bajoMinimo ? '<span class="pf-sem falta">' + a.bajoMinimo + ' bajo mínimo</span>' : '') +
    '<span class="ct-chev" aria-hidden="true"></span><span class="solo-voz">, ver Material</span></button>';
}

/* ============================================================================
   LA PESTAÑA VENTAS — el detalle que salió del Resumen (octubre de 2026)
   ============================================================================
   Tres cifras de consulta —el mes pasado, el ticket promedio y la conversión—, la lista de ventas
   con su periodo, su buscador y su CSV, y lo vendido por tipo de trabajo. La lista y sus filtros
   son los de siempre; cambió el renglón (`filaProyecto`), que ahora es el de las listas del
   Resumen: se toca entero, y abre la ficha o el globo de la venta. */
function pintarLista() {
  const k = D.kpi;
  const ymAnt = (D.meses[D.meses.length - 2] || {}).mes;
  const decididas = D.conv.ganadas + D.conv.perdidas;
  const c = [
    [money(k.mesAnterior.total), 'Vendido en ' + k.mesAnterior.etiqueta, { clave: 'ant',
      va: k.mesAnterior.n > 0 && ymAnt ? { dest: 'mes:' + ymAnt, que: 'ir a ' + k.mesAnterior.etiqueta + ' en las doce barras del Resumen' } : null,
      em: nVentas(k.mesAnterior.n) }],
    [money(k.ticket), 'Ticket promedio', { clave: 'ticket',
      em: k.ultimos12.n ? 'de ' + nVentas(k.ultimos12.n) + ' en 12 meses' : 'sin ventas en 12 meses' }],
    [D.conv.tasa === null ? '—' : D.conv.tasa + ' %', 'Cotizaciones ganadas', { clave: 'conv',
      em: D.conv.ganadas + (D.conv.ganadas === 1 ? ' ganada de ' : ' ganadas de ') + decididas +
          (decididas === 1 ? ' decidida' : ' decididas') }],
  ];
  return lineaHoja() + filaCuentas(c, 'ct-tres') + listaProyectos() + htmlPorTipo() +
    comoSeCuenta([
      '«Vendido» suma el importe de cada venta por la fecha de su anticipo: el de la hoja cuando la venta está allá, y el ' +
      'que se firmó aquí cuando todavía no ha salido de este dispositivo. El ticket promedio es lo vendido en los últimos ' +
      'doce meses entre el número de ventas.',
      '«Cotizaciones ganadas» cuenta las cotizaciones de este dispositivo que ya se decidieron: las ganadas entre las ganadas ' +
      'y las perdidas. Las que nadie ha contestado todavía no cuentan.',
      'Un renglón de la hoja abre su detalle; uno de aquí abre la ficha del proyecto. «Solo aquí» es una venta que todavía ' +
      'no sale de este dispositivo hacia la hoja.',
    ]);
}
function proyectosDelPeriodo() {
  const hoy = D.hoy;
  let desde = null;
  if (PERIODO === 'mes') desde = hoy.slice(0, 7) + '-01';
  else if (PERIODO === '3m') desde = masMeses(hoy.slice(0, 7) + '-01', -2);
  else if (PERIODO === '12m') desde = masMeses(hoy.slice(0, 7) + '-01', -11);
  const q = plano(BUSCA);
  return D.ventas.filter(p => {
    if (desde && String(p.fecha_ganado || '') < desde) return false;
    if (!q) return true;
    return plano([p.nombre, p.contacto, p.negocio, p.folio_local, p.folio_hoja, p.cuenta, p.estatus_notion,
      (p.tipo_trabajo || []).join(' ')].join(' ')).includes(q);
  });
}

function listaProyectos() {
  const lista = proyectosDelPeriodo();
  const vivos = lista.filter(p => p.etapa !== 'cancelado');
  const total = vivos.reduce((s, p) => s + Ventas.vendidoDe(p), 0);
  const filtros = segmento([
    { v: 'mes', t: 'Este mes' }, { v: '3m', t: '3 meses' }, { v: '12m', t: '12 meses' }, { v: 'todo', t: 'Todo' },
  ], PERIODO, 'data-periodo', 'Periodo');
  const filas = lista.length
    ? '<ul class="ct-fin-lista">' + lista.map(p => '<li>' + filaProyecto(p) + '</li>').join('') + '</ul>'
    : vacio('Nada en este periodo', 'Cuando una cotización se marque como ganada, o cuando baje una venta de la hoja, aparece aquí con su importe.');
  /* En el teléfono el «Bajar CSV de ventas» del encabezado no existe —el hueco de acciones va
     en `display:none` abajo de 760 px, y app.js pide que lo que va ahí exista también dentro de
     la pantalla—: sin esto, desde el celular no había cómo bajarlo. Va en esta tarjeta, que es
     lo que baja, en la tira de su periodo y su buscador y no en la cabecera: la cabecera no
     envuelve, y en 360 px el botón encimaba la cuenta de ventas sobre el total. Se decide al
     pintar con el mismo corte del CSS, y un giro que lo cruza se repinta (`alCambiarAncho`). */
  const csvAqui = enTelefono() && puedeBajarCSV()
    ? '<button type="button" class="btn btn-gho pf-btn-corto" data-csv>' +
      ico('i-bajar') + ' Bajar CSV de ventas</button>'
    : '';
  return '<div class="card" id="ct-lista"><div class="card-h"><h2>' + ico('i-venta') + ' Ventas' +
      ' <span class="folio">' + vivos.length + '</span></h2>' +
      '<span class="ct-total">' + esc(money(total)) + '</span></div>' +
    '<div class="card-b">' +
      '<div class="ag-barra">' + filtros +
        '<input type="search" class="ct-busca" placeholder="Buscar por nombre, folio, cuenta o estatus" value="' + esc(BUSCA) + '" data-busca aria-label="Buscar ventas">' +
        csvAqui + '</div>' +
      filas +
    '</div></div>';
}

const ETAPA_CLASE = e => Proy.claseEtapa(e);

/* Los folios de una venta: el de cotización si lo hay y el de la hoja (V-042) si está allá.
   Una fila de la hoja anterior a la plataforma solo tiene el segundo. */
function foliosDe(p) {
  const partes = [];
  if (p.folio_local && p.folio_local !== p.folio_hoja) partes.push(p.folio_local);
  if (p.folio_hoja) partes.push(p.folio_hoja);
  return partes.join(' · ');
}

/* De dónde es el renglón. Se dice en una etiqueta chica y solo cuando aporta: «hoja» para lo
   que solo está allá —no tiene proyecto y no se puede abrir—, y «solo aquí» para lo que
   todavía no ha salido de este dispositivo hacia la hoja. Lo que está en los dos lados no
   lleva etiqueta: es el caso normal. */
function origenDe(p) {
  if (p.de_hoja) return ' <span class="pf-sem nada ct-origen">hoja</span>';
  if (D.bajada && D.bajada.configurado && D.bajada.completa && !p.en_hoja && p.etapa !== 'cancelado') {
    return ' <span class="pf-sem falta ct-origen">solo aquí</span>';
  }
  return '';
}

/* El renglón de la lista de ventas: el de las listas del Resumen (`filaRenglon`), con el importe
   vendido a la derecha y, debajo, lo que le falta o «cobrado». Aquí la fecha va exacta —es un
   récord, no una lista de cobro— y la cuenta a la que entró, al final de la segunda línea. */
function filaProyecto(p) {
  const saldo = Ventas.saldoDe(p);
  const cancelado = p.etapa === 'cancelado';
  const der = '<span class="ct-fin-der">' +
      '<span class="ct-fin-monto vendido' + (cancelado ? ' cancelado' : '') + '">' + esc(money(Ventas.vendidoDe(p))) + '</span>' +
      '<span class="ct-fin-sub' + (!cancelado && saldo > 0 ? ' saldo' : '') + '">' +
        esc(cancelado ? 'no se dio' : saldo > 0 ? 'falta ' + money(saldo) : 'cobrado') + '</span>' +
    '</span>';
  return filaRenglon(p, der, { cls: 'ct-venta-fila', fecha: 'exacta', extra: p.cuenta ? esc(p.cuenta) : '' });
}

/* ----- Por cobrar ----- */
function pintarCobrar() {
  const k = D.kpi;
  const entregados = D.cartera.filter(x => x.entregado);
  const cob = etiquetaCobrar();
  /* P3. Las dos primeras llevan a la cartera —la segunda, a su primer renglón instalado, que es
     donde la cartera empieza—; los anticipos pactados son una suma y no llevan a nada. */
  const c = [
    [money(k.porCobrar.total), cob.t, { dinero: true, clave: 'total',
      va: k.porCobrar.n > 0 ? { dest: 'cartera', que: 'ir a la cartera' } : null,
      em: k.porCobrar.n + (k.porCobrar.n === 1 ? ' venta' : ' ventas') + (cob.em ? ' · ' + cob.em : '') }],
    [money(entregados.reduce((s, x) => s + x.saldo, 0)), 'Ya instalado y sin liquidar', { urge: entregados.length > 0, clave: 'instalado',
      va: entregados.length > 0 ? { dest: 'instalado', que: entregados.length === 1 ? 'ir al proyecto instalado' : 'ir al primero de los instalados' } : null,
      em: entregados.length + (entregados.length === 1 ? ' proyecto' : ' proyectos') }],
    [money(k.porCobrar.anticipos), 'Anticipos pactados', { clave: 'anticipos', em: 'de las ventas vivas' }],
  ];
  const filas = D.cartera.length
    ? D.cartera.map(filaCobro).join('')
    : vacio('No hay saldos pendientes', 'Cada venta viva tiene su anticipo igual al total, o la hoja ya la marcó como liquidada.');
  return lineaHoja() + filaCuentas(c) +
    '<div class="card" id="ct-cartera"><div class="card-h"><h2>' + ico('i-venta') + ' Cartera' +
      ' <span class="folio">' + D.cartera.length + '</span></h2></div>' +
    '<div class="card-b">' + filas + '</div></div>' +
    comoSeCuenta('Primero lo instalado: ese trabajo ya se entregó y ese dinero ya debía estar cobrado. El saldo es el ' +
    'que calcula la hoja cuando la venta está allá y bajó («saldo de la hoja»); si no, el total vendido menos el anticipo ' +
    'pactado. Marcar LIQUIDADO —en la hoja o en la ficha del proyecto— lo saca de esta lista.');
}

/* P30 · Cuánto va cobrado de lo vendido, en una barra fina debajo del texto (pieza 20, el medidor
   quieto: sin transición ni animación). Lo cobrado va lleno y en verde; el saldo, el hueco
   punteado en ámbar hasta el total; y el porcentaje escrito, porque ni el color ni la barra
   bastan solos. Antes había que hacer la resta de «vendido $X · anticipo $Y» para comparar cuánto
   falta de cada una.

   Cuando el saldo NO es el de la hoja sino el estimado aquí (`!x.deNotion`, total menos anticipo),
   la barra va RAYADA y el texto dice «estimado»: lo cobrado es una suposición y la barra no tiene
   que parecer una medida. (Ojo: la ficha de la API escribe `estimado: !!x.deNotion`, al revés de
   lo que dice su propio «Cuidado»; `deNotion` es «el saldo viene de la hoja».)
   Se redondea hacia abajo: una venta a la que le faltan $10 de $100 mil no es «100 % cobrada». */
function medidorCobro(x) {
  const P = piezas();
  const vendido = Ventas.vendidoDe(x.proyecto);
  if (!(vendido > 0)) return '';
  const cobrado = Math.max(0, Math.min(vendido, vendido - x.saldo));
  const pct = Math.floor(cobrado / vendido * 100);
  const barra = P && typeof P.medidorHTML === 'function'
    ? P.medidorHTML({ valor: cobrado, max: vendido, meta: vendido, tono: 'ok', estimado: !x.deNotion }) : '';
  return '<div class="ct-cobro">' + barra + '<span class="ct-cobro-t">' + pct + ' % cobrado' +
    (x.deNotion ? '' : ' · estimado') + '</span></div>';
}

function filaCobro(x) {
  const p = x.proyecto;
  const texto = 'Hola' + (p.contacto ? ' ' + p.contacto : '') + ', le escribimos de AL3D.\n' +
    'Le comparto el saldo de ' + (p.negocio || p.nombre || 'su trabajo') + ': ' + money(x.saldo) + '.\n' +
    '¿Le mando los datos de la cuenta o prefiere efectivo?\n— AL3D';
  const acciones =
    /* `telWa` y no `p.tel`: un teléfono a medias —el historial trae cotizaciones de cuando
       no era obligatorio— pintaba un «Cobrar» que abría el chat de otro número. */
    (telWa(p.tel) ? '<a class="btn-wa" href="' + esc(linkWa(p.tel, texto)) + '" target="_blank" rel="noopener">' + ico('i-wa') + ' Cobrar</a>' : '') +
    (p.de_hoja ? '' : '<button type="button" class="btn btn-gho pf-btn-corto" data-abrir="' + esc(p.id) + '">Abrir</button>');
  return '<div class="pf-fila ct-fila"' + (x.entregado ? ' data-instalado' : '') + '>' +
    '<span class="pf-fila-ico' + (x.entregado ? ' mal' : ' urge') + '">' + ico(x.entregado ? 'i-check' : 'i-reloj') + '</span>' +
    '<div class="pf-fila-tx">' +
      /* El cliente una vez, como en el Resumen (`nombreCliente`); el nombre entero, en el `title`. */
      '<p class="pf-fila-t"' + (p.nombre && p.nombre !== nombreCliente(p) ? ' title="' + esc(p.nombre) + '"' : '') + '>' +
        esc(nombreCliente(p)) + origenDe(p) + '</p>' +
      '<p class="pf-fila-d">' + esc(foliosDe(p) || 'sin folio') +
        (p.etapa ? ' · <span class="pf-etapa ' + ETAPA_CLASE(p.etapa) + '">' + esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span>' : '') +
        ' · vendido ' + esc(money(Ventas.vendidoDe(p))) + ' · anticipo ' + esc(money(p.anti_pactado)) +
        (p.cuenta ? ' · ' + esc(p.cuenta) : '') + (p.estatus_notion ? ' · ' + esc(p.estatus_notion) : '') +
        (x.deNotion ? ' · saldo de la hoja' : ' · saldo estimado') +
      '</p>' +
      medidorCobro(x) +
    '</div>' +
    '<div class="ct-monto saldo">' + esc(money(x.saldo)) + '<small>por cobrar</small></div>' +
    (acciones ? '<div class="pf-fila-acc">' + acciones + '</div>' : '') +
  '</div>';
}

/* ----- Comisiones: pagar primero las chicas (F54) -----
   La regla del negocio: con un monto en la mano, se pagan primero las comisiones de los
   proyectos más chicos, para bajar el número de pendientes. La pregunta que contesta esta
   pestaña es «con esto, ¿a cuántas les alcanza?»: ordenadas de menor a mayor, las que alcanzan
   son un PREFIJO de la lista (si una no cabe, las que siguen tampoco), así que se marcan las
   primeras `k`, se dice cuántas son y cuánto falta para la siguiente. La cuenta es de
   `Ventas.alcanceDeComisiones` (pura, en centavos, con su prueba de node).

   Lo que NO hace, y por qué es la decisión que importa: «Pagar estas» no marca nada como
   pagado. En este repo el abono de una comisión se registra en la hoja «Finanzas AL3D — Ventas
   y Comisiones», que es el libro mayor (`asistente-contexto.js`: el asistente dice lo mismo, y
   solo se puede abonar la comisión de una venta ya LIQUIDADA). Aquí «Pagar estas» ARMA LA LISTA,
   con folio, nombre y monto, para copiarla o mandarla por WhatsApp y registrarla allá. Cuando
   el abono baja de la hoja, esas comisiones dejan de aparecer solas. Un botón que marcara
   «Pagada» aquí le mentiría al siguiente que abra la pantalla: la hoja seguiría debiendo.

   Solo entran las comisiones de ventas LIQUIDADAS (`comisionDe(p).abonable`), y su monto es lo
   que FALTA pagarles —a una que la hoja ya abonó en parte le faltan $700 de $1,200—. Las demás
   se cuentan en la segunda cuenta para no esconder que existen.

   El campo se repinta APARTE (`#ct-com-vivo`): cada tecla cambia la cuenta, y repintar la
   pantalla entera le quitaría el foco al campo en el que se está escribiendo. */
const COM_TOPE = 100;      // renglones que se pintan; la cuenta sigue contando todas
const PCT = PCT_COMISION + ' %';   // «10 %», de donde lo dice la regla y no escrito a mano aquí

function pintarComisiones() {
  const C = D.comisiones;
  const n = C.abonables.length;
  const c = [
    [money(C.total), 'Por pagar ya', { dinero: true, clave: 'ya',
      em: n + (n === 1 ? ' comisión · de una venta liquidada' : ' comisiones · de ventas liquidadas') }],
    [money(C.pend.total), 'Falta liquidar la venta', { urge: C.pend.n > 0, clave: 'falta',
      em: C.pend.n + (C.pend.n === 1 ? ' comisión · todavía no se paga' : ' comisiones · todavía no se pagan') }],
  ];
  const cuerpo = n
    ? '<div class="card" id="ct-com"><div class="card-h"><h2>' + ico('i-venta') + ' Pagar primero las chicas' +
        ' <span class="folio">' + n + '</span></h2></div>' +
      '<div class="card-b">' +
        '<p class="pf-nota ct-com-nota">Escribe cuánto hay para pagar: se marcan las comisiones que se pueden liquidar completas, ' +
        'empezando por las más chicas, para que los pendientes bajen lo más rápido posible. Cada una es el ' + PCT +
        ' del subtotal de una venta ya liquidada.</p>' +
        '<div class="fld ct-com-campo"><label for="ct-com-disp">Monto disponible</label>' +
          '<input type="text" id="ct-com-disp" data-com-monto inputmode="decimal" autocomplete="off" placeholder="$0.00" value="' + esc(COM_MONTO) + '"></div>' +
        '<div id="ct-com-vivo">' + htmlComisionesVivas() + '</div>' +
      '</div></div>'
    : vacio('No hay comisiones por pagar',
        C.pend.n
          ? 'Hay ' + C.pend.n + (C.pend.n === 1 ? ' comisión que se podrá pagar' : ' comisiones que se podrán pagar') +
            ' cuando su venta quede LIQUIDADA' + (enBase() ? '.' : ' en la hoja.')
          : 'Una comisión se puede pagar cuando su venta queda LIQUIDADA' + (enBase() ? '.' : ' en la hoja.'));
  /* Con la base mandando, el abono se registra aquí mismo, en «Cobros y abonos»: la hoja ya no manda. */
  return filaCuentas(c) + cuerpo + (enBase()
    ? '<p class="pf-nota">La comisión es fija: ' + PCT + ' del subtotal, sin IVA, con centavos, como la calcula la base. Aquí no se marca ningún pago: ' +
      'el abono de cada comisión se registra en «Cobros y abonos» (aquí, en Control) y, en cuanto la base lo tiene, la comisión sale de esta lista.</p>'
    : '<p class="pf-nota">La comisión es fija: ' + PCT + ' del subtotal, sin IVA, con centavos, como la calcula la hoja. Aquí no se marca ningún pago: ' +
      'el abono de cada comisión se registra en la hoja «Finanzas AL3D — Ventas y Comisiones» y, cuando baja de allá, la comisión sale de esta lista.</p>');
}

/* Lo que se repinta con cada tecla: el medidor, la frase, el botón, la lista armada si la hay y
   los renglones. Es una función de `COM_MONTO`, `COM_LISTA` y `D`, y nada más. */
function htmlComisionesVivas() {
  const P = piezas();
  const r = Ventas.alcanceDeComisiones(D.comisiones.abonables, Ventas.montoDeTexto(COM_MONTO));
  const hay = r.disponible > 0;
  /* Una lista armada solo vale para el monto con el que se armó: si cambió el monto, o la
     sincronización trajo una comisión que cambia cuáles alcanzan, se descarta. Una lista de
     ayer pegada en la hoja de hoy es un abono equivocado. */
  const ids = r.orden.slice(0, r.k).map(x => String(x.id)).join('|');
  if (COM_LISTA && (!r.k || COM_LISTA.ids !== ids)) COM_LISTA = null;
  const armada = COM_LISTA;

  let res;
  if (!hay) {
    res = '<b>Escribe cuánto hay para pagar</b>' + r.orden.length + (r.orden.length === 1 ? ' comisión pendiente' : ' comisiones pendientes') +
      ' · ' + money(r.total);
  } else {
    const quedan = r.orden.length - r.k;
    res = '<b>Alcanzan ' + r.k + ' de ' + r.orden.length + (quedan ? ' · quedan ' + quedan + (quedan === 1 ? ' pendiente' : ' pendientes') : ' · no queda ninguna pendiente') + '</b>' +
      (r.k ? money(r.suma) + ' de ' + money(r.disponible) : 'Hay ' + money(r.disponible)) +
      (r.siguiente ? ' · para la siguiente (' + esc(r.siguiente.nombre) + ', ' + money(r.siguiente.monto) + ') faltan ' + money(r.falta)
                   : ' · sobran ' + money(r.sobra));
  }

  const medidor = P && typeof P.medidorHTML === 'function'
    ? P.medidorHTML({ valor: r.suma, max: r.total, muesca: hay ? Math.min(r.disponible, r.total) : undefined, tono: 'ok' }) : '';

  const boton = '<button type="button" class="btn btn-pri ct-com-pagar" data-com-pagar' + (r.k ? '' : ' disabled') + '>' +
    (r.k ? 'Pagar estas ' + r.k + ' · ' + money(r.suma) : (hay ? 'No alcanza para ninguna' : 'Pagar estas')) + '</button>';

  const filas = r.orden.slice(0, COM_TOPE).map((x, i) => {
    const estado = i < r.k ? (armada ? 'lista' : 'alcanza') : 'pend';
    const palabra = estado === 'lista' ? 'En la lista' : (estado === 'alcanza' ? 'Alcanza' : 'Pendiente');
    /* Solo la que acaba de entrar a la lista dibuja su palomita; las que ya estaban nacen dibujadas. */
    const ck = estado === 'lista' && P && typeof P.palomitaHTML === 'function'
      ? P.palomitaHTML({ circulo: true, dibujar: !!(armada && armada.nueva) }) : '';
    const parte = x.monto < x.comision ? 'faltan ' + money(x.monto) + ' de ' + money(x.comision)
      : (x.sub > 0 ? PCT + ' de ' + money(x.sub) : (enBase() ? 'comisión de la base' : 'comisión de la hoja'));
    return '<li class="ct-com-fila ' + estado + '" data-id="' + esc(x.id) + '">' +
      '<span class="ct-com-ck" aria-hidden="true">' + ck + '</span>' +
      '<span class="ct-com-nom">' + esc(x.nombre) + '<small>' + palabra + ' · <span class="nw">' + esc(x.folio) + '</span></small></span>' +
      '<span class="ct-com-monto">' + esc(money(x.monto)) + '<small>' + esc(parte) + '</small></span></li>';
  }).join('');
  if (armada) armada.nueva = false;

  const texto = armada ? textoLista(r) : '';
  /* Con la base mandando la lista se registra en «Cobros y abonos», una por una: el «Repartir un depósito» de allá
     paga de la más ANTIGUA a la más nueva, y esta lista va de la más chica a la más grande. */
  const base = enBase();
  const irACobrar = base && tabs().includes('asientos')
    ? '<button type="button" class="btn btn-gho pf-btn-corto" data-tab="asientos">Ir a Cobros y abonos</button>' : '';
  const panel = armada
    ? '<div class="ct-com-armada" id="ct-com-armada"><p class="pf-fila-t">' + (base ? 'Lista para registrar' : 'Lista para registrar en la hoja') +
        ' <span class="folio">' + r.k + '</span></p>' +
      '<pre class="ct-com-texto" tabindex="0" aria-label="Lista armada">' + esc(texto) + '</pre>' +
      '<div class="ct-com-acc"><button type="button" class="btn btn-pri pf-btn-corto" data-com-copiar>' + ico('i-copiar') + ' Copiar la lista</button>' +
        '<a class="btn-wa" href="' + esc(linkWa('', texto)) + '" target="_blank" rel="noopener">' + ico('i-wa') + ' Mandarla por WhatsApp</a>' + irACobrar + '</div>' +
      (base
        ? '<p class="pf-nota">Aquí no se marca nada como pagado: cada una se registra en «Cobros y abonos» → «Abono de comisión», una por una ' +
          '(«Repartir un depósito» paga de la venta más antigua a la más nueva, no de la más chica). Cuando la base las tiene, dejan de aparecer.</p></div>'
        : '<p class="pf-nota">Aquí no se marca nada como pagado: el abono de cada una se registra en la hoja «Finanzas AL3D». ' +
          'Cuando baje de allá, estas dejan de aparecer.</p></div>')
    : '';

  return '<div class="ct-com-med">' + medidor + '</div>' +
    '<p class="ct-com-res">' + res + '</p>' +
    boton + panel +
    '<ol class="ct-com-lista" aria-label="Comisiones, de la más chica a la más grande">' + filas + '</ol>' +
    (r.orden.length > COM_TOPE ? '<p class="pf-nota">y ' + (r.orden.length - COM_TOPE) + ' más, todas más grandes que estas</p>' : '');
}

/* La lista que se copia: una comisión por renglón, con folio, nombre y monto, y el total abajo. */
function textoLista(r) {
  const lin = r.orden.slice(0, r.k).map(x => x.folio + ' · ' + x.nombre + ' — ' + money(x.monto));
  return [enBase() ? 'Comisiones para registrar como abonos en la base (Control → Cobros y abonos)'
    : 'Comisiones para registrar en la hoja «Finanzas AL3D — Ventas y Comisiones»',
    r.k + (r.k === 1 ? ' comisión' : ' comisiones') + ' de ventas ya liquidadas, de la más chica a la más grande', '']
    .concat(lin, ['', 'Total: ' + money(r.suma), 'Disponible: ' + money(r.disponible) + ' · sobran ' + money(r.sobra)]).join('\n');
}

/* «Pagar estas»: arma la lista y la deja a la vista. No escribe nada. */
function armarLista() {
  const r = Ventas.alcanceDeComisiones(D.comisiones.abonables, Ventas.montoDeTexto(COM_MONTO));
  if (!r.k) return;
  COM_LISTA = { ids: r.orden.slice(0, r.k).map(x => String(x.id)).join('|'), nueva: true };
  const vivo = $('ct-com-vivo');
  if (vivo) vivo.innerHTML = htmlComisionesVivas();
  const copiar = cont && cont.querySelector('[data-com-copiar]');
  if (copiar) { try { copiar.focus({ preventScroll: false }); } catch (_) {} }
  voz('Lista armada: ' + r.k + (r.k === 1 ? ' comisión' : ' comisiones') + ' por ' + money(r.suma) +
    (enBase() ? '. Regístralas en Cobros y abonos.' : '. Cópiala para registrarla en la hoja.'));
}

/* ----- Gastos: lo que sale (octubre de 2026) -----
   La pregunta de esta pestaña es la de enfrente de la de Ventas: «¿cuánto se ha ido este mes, y
   en qué?». Tres piezas, de arriba abajo:
     · las CUENTAS —gastado este mes, el mes anterior y la utilidad aproximada—, con la misma fila
       de cifras del mismo tamaño que el resto de Control (`filaCuentas`);
     · POR CATEGORÍA, el mes en curso: una barra por categoría contra la más grande, con su importe
       y cuántos gastos, y lo del mes anterior escrito al lado (la barra no va sola: su cifra y su
       nombre están escritos);
     · la LISTA con el mismo filtro de periodo que la de ventas, su buscador, «Registrar gasto» y,
       para la dirección, su CSV.
   La aritmética es de js/datos/gastos.js (pura, con su prueba); aquí se pinta. Cada renglón dice
   si el gasto ya está en la hoja o todavía no salió de este teléfono —y por qué, si la hoja lo
   rechazó—, porque «lo capturé y no aparece en la hoja» es la pregunta que va a llegar el día que
   no haya señal. */
const PER_OPCIONES = [{ v: 'mes', t: 'Este mes' }, { v: '3m', t: '3 meses' }, { v: '12m', t: '12 meses' }, { v: 'todo', t: 'Todo' }];
const nGastos = n => n + (n === 1 ? ' gasto' : ' gastos');

function pintarGastos() {
  const G = D.resGastos;
  const util = Gastos.utilidad(D.kpi.mes.total, G.mes.total);
  const c = [
    [money(G.mes.total), 'Gastado en ' + G.mes.etiqueta, { dinero: true, clave: 'mes',
      va: G.mes.n > 0 ? { dest: 'gastos:mes', que: 'ver los gastos de ' + G.mes.etiqueta } : null,
      em: nGastos(G.mes.n) + (G.variacion === null ? '' : ' · ' + (G.variacion >= 0 ? '+' : '') + G.variacion + ' % vs ' + G.anterior.etiqueta) }],
    [money(G.anterior.total), 'Gastado en ' + G.anterior.etiqueta, { clave: 'ant', em: nGastos(G.anterior.n) }],
    [money(util), 'Utilidad aproximada', { mal: util < 0, clave: 'utilidad',
      em: 'vendido ' + money(D.kpi.mes.total) + ' menos gastado' }],
  ];
  return lineaHoja() + avisoGastosPorMandar() + filaCuentas(c) + htmlPorCategoria(G) + listaGastos() +
    comoSeCuenta(enBase()
      ? 'Cada gasto cuenta en el mes del día en que se pagó, no del día en que se capturó. Los anulados no suman: ' +
        'se quedan en la lista tachados, y en la base anulados, con quién y cuándo. Los gastos viven en la base: lo que se captura ' +
        'aquí se guarda allá y llega solo a los teléfonos de Dirección y Pagos. La utilidad aproximada es lo vendido en el mes ' +
        '—lo firmado, por la fecha de su anticipo— menos lo gastado; no es la del contador, pero dice hacia dónde va el mes. ' +
        'Un gasto no se corrige: se anula y se vuelve a capturar.'
      : 'Cada gasto cuenta en el mes del día en que se pagó, no del día en que se capturó. Los anulados no suman: ' +
      'se quedan en la lista tachados, y en la hoja con «Anulado: Sí». Los gastos viven en la pestaña «Gastos» de la hoja ' +
      '«Finanzas AL3D»: lo que se captura aquí se manda allá por el puente, y lo que se escribe allá a mano baja aquí con ' +
      '«Actualizar». La utilidad aproximada es lo vendido en el mes —lo firmado, por la fecha de su anticipo— menos lo gastado; ' +
      'no es la del contador, pero dice hacia dónde va el mes. Un gasto no se corrige: se anula y se vuelve a capturar.');
}

/* Si algún gasto de este teléfono todavía no llegó a la hoja, se dice arriba, con la razón cuando
   la hay: «esperando señal» no es lo mismo que «falta actualizar el puente» ni que «la hoja dijo
   que no». Sin puente, ni se menciona la hoja: la línea de arriba ya lo dice.
   «Falta actualizar el puente» va en su propio aviso y sale aunque no haya ningún gasto: con la
   hoja en la 14 (lo dice `/salud`, o un camino de gastos que contestó «Camino desconocido») la
   pestaña sirve igual —se captura, se suma, se guarda aquí— y lo único que no pasa es que llegue a
   la hoja. Que lo diga ANTES de capturar es lo que evita el «lo registré y no está en la hoja». */
function avisoGastosPorMandar() {
  if (!D.bajada || !D.bajada.configurado) return '';
  let pend = 0, apart = 0, rech = 0, razon = '';
  for (const g of D.gastos) {
    const e = Gastos.estadoDeEnvio(g, D.bandejaGastos);
    if (e.estado === 'pendiente' || e.estado === 'local') pend++;
    else if (e.estado === 'sin_destino') apart++;
    else if (e.estado === 'rechazada') { rech++; razon = e.error || razon; }
  }
  let html = '';
  /* Con la base mandando no hay versión de la hoja que esperar: lo que se quedó apartado de antes sale solo en el
     siguiente bombeo (paso 3), y se cuenta como lo que espera señal. */
  const base = enBase();
  if (base) { pend += apart; apart = 0; }
  if (!base && (D.hojaGastos === false || apart)) {
    html += '<p class="hintnote nota-av ct-gas-aviso" role="status" data-gastos-sin-puente>' + ico('i-nube-off') +
      '<span><b>Falta actualizar el puente.</b> La hoja corre un Apps Script anterior a puente-sheets-' +
      VERSION_DE_LOS_GASTOS + ' y todavía no tiene la pestaña «Gastos». ' +
      (apart ? esc(nGastos(apart)) + (apart === 1 ? ' se queda' : ' se quedan') + ' guardados en este teléfono y se mandan solos '
             : 'Los gastos se capturan y se suman igual, se guardan en este teléfono y se mandan solos ') +
      'en cuanto Dirección publique la versión nueva. <small>Los pasos están en puente/DESPLIEGUE.md, «Al pasar a puente-sheets-' +
      VERSION_DE_LOS_GASTOS + '».</small></span></p>';
  }
  if (!pend && !rech) return html;
  const partes = [];
  const a = base ? ' a la base' : ' a la hoja';
  if (pend) partes.push(nGastos(pend) + (pend === 1 ? ' espera' : ' esperan') + ' para mandarse' + a + ': ' + (pend === 1 ? 'sale' : 'salen') + ' solos en cuanto haya señal');
  if (rech) partes.push(nGastos(rech) + ' no ' + (rech === 1 ? 'entró' : 'entraron') + a);
  return html + '<p class="hintnote ' + (rech ? 'nota-mal' : 'nota-av') + ' ct-gas-aviso" role="status">' + ico(rech ? 'i-aviso' : 'i-reloj') +
    '<span>' + esc(partes.join('; ') + '.') + (razon ? ' <small>' + esc(razon) + '</small>' : '') +
    ' No se pierde ninguno: están guardados en este teléfono.</span></p>';
}

/* Por categoría, el mes en curso. La barra se mide contra la categoría más grande del mes (no
   contra el total): así la segunda se compara a ojo con la primera. Las categorías en cero este
   mes y el anterior no se pintan; las que tuvieron algo el mes anterior sí, con su «antes». */
function htmlPorCategoria(G) {
  const filas = G.porCategoria.filter(x => x.total > 0 || x.totalAnt > 0);
  const tope = Math.max(1, ...filas.map(x => x.total));
  const cuerpo = filas.length
    ? '<ul class="ct-gas-cats" aria-label="Gastado por categoría en ' + esc(G.mes.etiqueta) + '">' + filas.map(x => {
        const pc = x.total > 0 ? Math.max(2, Math.round(x.total / tope * 100)) : 0;
        return '<li class="ct-gas-cat' + (x.total > 0 ? '' : ' cero') + '">' +
          '<span class="ct-gas-cat-ico" aria-hidden="true">' + ico(Gastos.ICONO_CATEGORIA[x.categoria] || 'i-puntos') + '</span>' +
          '<span class="ct-gas-cat-t">' + esc(x.categoria) + '<small>' + esc(nGastos(x.n)) +
            (x.totalAnt > 0 || x.nAnt ? ' · ' + esc(G.anterior.etiqueta) + ': ' + esc(money(x.totalAnt)) : '') + '</small></span>' +
          '<span class="ct-gas-cat-riel" aria-hidden="true">' + (pc ? '<i style="width:' + pc + '%"></i>' : '') + '</span>' +
          '<span class="ct-gas-cat-v">' + esc(money(x.total)) + '</span></li>';
      }).join('') + '</ul>'
    : vacio('Sin gastos en ' + G.mes.etiqueta, enBase() ? 'Cuando se capture el primero —aquí o en otro teléfono— aparece por categoría.'
      : 'Cuando se capture el primero —aquí o en la pestaña «Gastos» de la hoja— aparece por categoría.');
  return '<section class="card" id="ct-gastos-mes" aria-labelledby="ct-gastos-mes-h"><div class="card-h"><h2 id="ct-gastos-mes-h">' +
      ico('i-control') + ' Por categoría</h2><span class="folio">' + esc(G.mes.etiqueta) + '</span></div>' +
    '<div class="card-b">' + cuerpo +
      (G.anulados ? '<p class="pf-nota">' + esc(nGastos(G.anulados)) + ' de este mes ' + (G.anulados === 1 ? 'está anulado y no suma' : 'están anulados y no suman') + '.</p>' : '') +
      (G.sinFecha ? '<p class="pf-nota">' + esc(nGastos(G.sinFecha)) + (enBase() ? ' no ' : ' de la hoja no ') + (G.sinFecha === 1 ? 'tiene' : 'tienen') + ' fecha y no ' + (G.sinFecha === 1 ? 'cae' : 'caen') + ' en ningún mes' +
        (enBase() ? ': se anula y se vuelve a capturar con su día.</p>' : ': se corrige en la columna «Fecha» de la pestaña Gastos.</p>') : '') +
    '</div></section>';
}

function listaGastos() {
  const lista = Gastos.delPeriodo(D.gastos, GPER, D.hoy, BUSCA_GAS);
  const vivos = lista.filter(g => !g.anulado);
  const total = vivos.reduce((t, g) => t + (Number(g.monto) || 0), 0);
  const filtros = segmento(PER_OPCIONES, GPER, 'data-gper', 'Periodo de los gastos');
  const csvAqui = puedeBajarCSV()
    ? '<button type="button" class="btn btn-gho pf-btn-corto" data-csv-gastos>' + ico('i-bajar') + ' Bajar CSV de gastos</button>'
    : '';
  const filas = lista.length
    ? lista.map(filaGasto).join('')
    : vacio(D.gastos.length ? 'Nada en este periodo' : 'Todavía no hay gastos',
        D.gastos.length ? 'Prueba con otro periodo u otra palabra.'
          : 'Registra el primero con el botón de arriba: el material, la renta, la gasolina… Se guarda aquí y se manda ' +
            (enBase() ? 'a la base.' : 'a la hoja.'));
  return '<div class="card" id="ct-gastos"><div class="card-h"><h2>' + ico('i-venta') + ' Gastos' +
      ' <span class="folio">' + vivos.length + '</span></h2>' +
      '<span class="ct-total">' + esc(money(total)) + '</span></div>' +
    '<div class="card-b">' +
      '<div class="ct-gas-acc"><button type="button" class="btn btn-pri pf-btn-corto" data-act="gasto-nuevo">' + ico('i-mas') + ' Registrar gasto</button>' +
        csvAqui + '</div>' +
      '<div class="ag-barra">' + filtros +
        '<input type="search" class="ct-busca" placeholder="Buscar por concepto, categoría, cuenta o folio" value="' + esc(BUSCA_GAS) +
        '" data-busca-gas aria-label="Buscar gastos"></div>' +
      filas +
    '</div></div>';
}

/* El renglón de un gasto. El estado de envío va en una etiqueta chica y solo cuando aporta, como
   el «solo aquí» de las ventas: lo que ya está en la hoja es el caso normal y no lleva nada. */
function filaGasto(g) {
  const e = Gastos.estadoDeEnvio(g, D.bandejaGastos);
  const conPuente = !!(D.bajada && D.bajada.configurado);
  let etiqueta = '';
  if (g.anulado) etiqueta = ' <span class="pf-sem nada ct-origen">anulado</span>';
  else if (e.estado === 'rechazada') etiqueta = ' <span class="pf-sem grave ct-origen">' + (enBase() ? 'la base no lo aceptó' : 'la hoja no lo aceptó') + '</span>';
  else if (e.estado === 'sin_destino') etiqueta = ' <span class="pf-sem falta ct-origen">espera la pestaña</span>';
  else if (conPuente && (e.estado === 'pendiente' || e.estado === 'local')) etiqueta = ' <span class="pf-sem falta ct-origen">por mandar</span>';
  const det = [fmtFecha(g.fecha) || 'sin fecha', g.categoria, g.cuenta || 'sin cuenta'].concat(g.folio ? [g.folio] : []);
  return '<div class="pf-fila ct-fila ct-gas-fila' + (g.anulado ? ' anulado' : '') + '">' +
    '<span class="pf-fila-ico">' + ico(Gastos.ICONO_CATEGORIA[g.categoria] || 'i-puntos') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(g.concepto || 'Sin concepto') + etiqueta + '</p>' +
      '<p class="pf-fila-d">' + det.map(esc).join(' · ') + '</p>' +
      '<p class="pf-fila-d ct-quien">' + (g.registro_por ? 'Registró <b>' + esc(g.registro_por) + '</b>' : 'Escrito en la hoja') +
        (g.anulado ? ' · anuló <b>' + esc(g.anulo || 'alguien') + '</b>' + (g.anulado_en ? ' el ' + esc(fmtFecha(isoDeMs(g.anulado_en))) : '') : '') + '</p>' +
      (e.estado === 'rechazada' && e.error ? '<p class="pf-fila-d ct-gas-error">' + esc(e.error) + '</p>' : '') +
    '</div>' +
    '<div class="ct-monto' + (g.anulado ? ' cancelado' : '') + '">' + esc(money(g.monto)) +
      (g.anulado ? '<small>anulado</small>' : '') + '</div>' +
    (g.anulado ? '' :
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-gasto-anular="' + esc(g.id) + '"' +
      ' aria-label="' + esc('Anular el gasto de ' + money(g.monto) + ': ' + (g.concepto || '')) + '">Anular</button></div>') +
  '</div>';
}

const isoDeMs = ms => {
  const d = new Date(Number(ms) || 0), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/* ----- «Registrar gasto»: el formulario en `#pf-pide` -----
   La misma capa y las mismas piezas que el «Se ganó» de Inicio: `.pf-panel` con cabeza, cuerpo y
   pie, campos `.fld` con su etiqueta, y los botones de abajo. La capa se registró una vez en app.js
   (Escape, el cerco del tabulador y el atrás del teléfono la cierran). Lo tecleado se lee al
   guardar, de los campos; si algo falta, se dice JUNTO al campo (`aria-invalid` y el aviso con
   `role="alert"`) y el foco va a él, sin cerrar nada. */
function abrirGasto() {
  if (!Prefs.veDinero()) return;
  const capa = $('pf-pide');
  if (!capa) return;
  const hoy = D ? D.hoy : hoyISO();
  /* Los folios de las ventas de los últimos doce meses, para el autocompletado del navegador:
     el de la hoja (V-042) y el de cotización. Escribir otro también vale. */
  const desde = (D.meses[0] || {}).mes || '';
  const folios = [];
  for (const p of D.ventas) {
    if (!p || p.etapa === 'cancelado' || String(p.fecha_ganado || '') < desde) continue;
    const nombre = p.nombre || '';
    if (p.folio_hoja) folios.push([p.folio_hoja, nombre]);
    else if (p.folio_local) folios.push([p.folio_local, nombre]);
  }
  capa.innerHTML = '<div class="pf-panel ct-gas-panel" aria-labelledby="ct-gas-titulo">' +
    '<div class="pf-panel-h"><h2 id="ct-gas-titulo">Registrar gasto</h2>' +
      '<button type="button" class="pf-cerrar" data-gs="cerrar" aria-label="Cerrar">' + ico('i-cerrar') + '</button></div>' +
    '<div class="pf-panel-b">' +
      '<p class="pf-fila-d">' + (enBase() ? 'Se guarda en este teléfono y se manda a la base, que lo lleva a los demás teléfonos.'
        : 'Se guarda en este teléfono y se manda a la pestaña «Gastos» de la hoja de finanzas.') + ' Sin señal, sale solo cuando vuelva.</p>' +
      '<div class="fld"><label for="ct-gas-fecha">¿Qué día se pagó?</label>' +
        '<input type="date" id="ct-gas-fecha" value="' + esc(hoy) + '" max="' + esc(hoy) + '" required></div>' +
      '<div class="fld"><label for="ct-gas-concepto">Concepto</label>' +
        '<input type="text" id="ct-gas-concepto" maxlength="' + Gastos.CONCEPTO_MAX + '" autocomplete="off" required ' +
        'placeholder="Lámina de acrílico 3 mm, gasolina de la camioneta…"></div>' +
      '<div class="fld"><label for="ct-gas-cat">Categoría</label><select id="ct-gas-cat" required>' +
        '<option value="">Elige una</option>' + Gastos.CATEGORIAS.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="ct-gas-dos">' +
        '<div class="fld"><label for="ct-gas-monto">Monto</label>' +
          '<input type="text" id="ct-gas-monto" inputmode="decimal" autocomplete="off" placeholder="$0.00" required></div>' +
        '<div class="fld"><label for="ct-gas-cuenta">Cuenta de la que salió</label><select id="ct-gas-cuenta">' +
          '<option value="">Efectivo u otra</option>' + CUENTAS.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="fld"><label for="ct-gas-folio">Folio del proyecto <small>(opcional)</small></label>' +
        '<input type="text" id="ct-gas-folio" maxlength="' + Gastos.FOLIO_MAX + '" autocomplete="off" list="ct-gas-folios" placeholder="V-042 o COT-0042"></div>' +
      '<datalist id="ct-gas-folios">' + folios.map(([f, n]) => '<option value="' + esc(f) + '">' + esc(n) + '</option>').join('') + '</datalist>' +
      '<p class="hintnote nota-mal ct-gas-error-f" id="ct-gas-error" role="alert" hidden></p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-gs="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-gs="guardar">Guardar el gasto</button>' +
    '</div></div>';
  _gs = { guardando: false };
  abrirCapa('pf-pide', { hist: true });
}

function cerrarGasto() {
  _gs = null;
  cerrarCapa('pf-pide');
  const capa = $('pf-pide');
  if (capa) capa.innerHTML = '';
}

/* Los clics de la capa. Solo los de este formulario (`data-gs`): la capa la comparten otras
   pantallas, pero cada una escucha mientras está montada, y Control solo mientras lo está. */
async function alClicPide(ev) {
  const b = ev.target.closest('[data-gs]');
  if (!b || !_gs) return;
  ev.preventDefault();
  if (b.dataset.gs === 'cerrar') { cerrarGasto(); return; }
  if (b.dataset.gs !== 'guardar' || _gs.guardando) return;
  _gs.guardando = true;
  b.disabled = true;
  try { await guardarGasto(); }
  catch (e) {
    console.error('el gasto no se guardó', e);
    toast('Algo se rompió al guardar el gasto. Recarga la plataforma y vuelve a intentarlo.', 'err', 4600);
  }
  if (_gs) _gs.guardando = false;
  if (b.isConnected) b.disabled = false;
}

const CAMPO_GASTO = { fecha: 'ct-gas-fecha', concepto: 'ct-gas-concepto', categoria: 'ct-gas-cat', monto: 'ct-gas-monto',
                      cuenta: 'ct-gas-cuenta', folio: 'ct-gas-folio' };

function avisarCampo(campo, mensaje) {
  const capa = $('pf-pide');
  if (!capa) return;
  capa.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
  capa.querySelectorAll('.fld.falta').forEach(x => x.classList.remove('falta'));
  const err = $('ct-gas-error');
  const el = campo ? $(CAMPO_GASTO[campo]) : null;
  if (el) {
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', 'ct-gas-error');
    const f = el.closest('.fld'); if (f) f.classList.add('falta');
    try { el.focus(); } catch (_) {}
  }
  if (err) { err.textContent = mensaje; err.hidden = false; }
}

async function guardarGasto() {
  const val = id => { const e = $(id); return e ? String(e.value || '').trim() : ''; };
  const datos = {
    fecha: val('ct-gas-fecha'), concepto: val('ct-gas-concepto'), categoria: val('ct-gas-cat'),
    monto: Gastos.montoDe(val('ct-gas-monto')), cuenta: val('ct-gas-cuenta'), folio: val('ct-gas-folio'),
  };
  /* Primero aquí, para decirlo junto al campo sin pasar por la base. `registrar` vuelve a validar. */
  const malo = Gastos.validar(datos);
  if (malo) { avisarCampo(malo.campo, malo.mensaje); voz(malo.mensaje, true); return; }
  const r = await Gastos.registrar(datos);
  if (!r.ok) { avisarCampo(r.campo || '', r.mensaje || 'No se pudo guardar el gasto.'); return; }
  cerrarGasto();
  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
  toast('Gasto de ' + money(r.valor.monto) + ' guardado' + (Sync.configurado()
    ? (enBase() ? (sinRed ? '. Sin señal: se manda a la base en cuanto vuelva.' : ' y en camino a la base.')
      : (sinRed ? '. Sin señal: se manda a la hoja en cuanto vuelva.' : ' y en camino a la hoja.')) : ' en este teléfono.'), 'ok', 4200);
  /* El mes del gasto a la vista: si se capturó uno de otro mes con el periodo en «Este mes», no
     aparecería en la lista y parecería que no se guardó. */
  if (GPER === 'mes' && Ventas.mesDe(datos.fecha) !== D.hoy.slice(0, 7)) {
    const ini = D.hoy.slice(0, 7) + '-01';
    GPER = datos.fecha >= masMeses(ini, -2) ? '3m' : (datos.fecha >= masMeses(ini, -11) ? '12m' : 'todo');
  }
  await recargar();
  mandarYa();
}

/* Se manda en el momento, si hay a dónde y hay señal, y la pantalla se vuelve a leer al terminar:
   sin esto, la etiqueta «por mandar» se quedaba puesta hasta la siguiente vez que algo repintara
   Control, aunque el gasto ya estuviera en la hoja. */
function mandarYa() {
  if (!Sync.configurado() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  Sync.bombear().catch(() => null).then(() => { if (cont && D) recargar(); });
}

/* «Anular» pregunta una vez —es dinero, y un dedo que resbala en la lista no puede quitar un gasto
   del mes— con la pregunta de la app (`confirmarPf`), no el confirm() del navegador. */
async function anularGasto(id) {
  const g = D && D.gastos.find(x => x.id === id);
  if (!g || g.anulado) return;
  const si = await confirmarPf({
    titulo: '¿Anular este gasto?',
    texto: money(g.monto) + ' · ' + (g.concepto || 'sin concepto') + ' · ' + (fmtFecha(g.fecha) || 'sin fecha') +
      (enBase() ? '. Deja de sumar, pero no se borra: en la base queda anulado, con quién y cuándo. Si estuvo mal, captúralo otra vez.'
        : '. Deja de sumar, pero no se borra: en la hoja queda con «Anulado: Sí», quién y cuándo. Si estuvo mal, captúralo otra vez.'),
    si: 'Sí, anular', no: 'Mejor no', peligro: true,
  });
  if (!si || !cont) return;
  const r = await Gastos.anular(id);
  if (!r.ok) { toast(r.mensaje || 'No se pudo anular el gasto.', 'err', 4200); return; }
  toast('Gasto anulado: ya no suma', 'ok', 3200);
  await recargar();
  mandarYa();
}

function bajarCSVGastos() {
  if (!D || !puedeBajarCSV()) return;
  const lista = Gastos.delPeriodo(D.gastos, 'todo', D.hoy, '');
  if (!lista.length) { toast('Todavía no hay gastos que exportar', '', 2600); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  if (descargarArchivo(Gastos.csv(lista), 'al3d-gastos-' + sello + '.csv', 'text/csv;charset=utf-8')) {
    toast(lista.length + (lista.length === 1 ? ' gasto exportado' : ' gastos exportados') + ' a CSV, con los anulados marcados', 'ok', 3600);
  }
}

/* ----- Bitácora ----- */
function pintarBitacora() {
  const q = plano(BUSCA_BIT);
  const lista = D.bitacora.filter(b => (!ENTIDAD || b.entidad === ENTIDAD) &&
    (!q || plano([b.titulo, b.detalle, b.sello, b.usuario].join(' ')).includes(q)));
  const chips = '<div class="chips">' +
    chip('Todo', !ENTIDAD, 'data-entidad=""') +
    Bitacora.ENTIDADES.filter(e => D.bitacora.some(b => b.entidad === e))
      .map(e => chip(Bitacora.ENTIDAD_NOMBRE[e] || e, ENTIDAD === e, 'data-entidad="' + esc(e) + '"')).join('') +
    '</div>';
  const filas = lista.length
    ? agruparPorDia(lista).map(g => '<p class="ag-grupo">' + esc(g.dia) + '<span class="n">' + g.filas.length + '</span></p>' +
        g.filas.map(filaBitacora).join('')).join('')
    : vacio(D.bitacora.length ? 'Nada con ese filtro' : 'La bitácora empieza hoy',
        D.bitacora.length ? 'Prueba con otra palabra o quita el filtro.'
          : 'Desde esta versión, cada cambio en un proyecto, la agenda, el catálogo o el almacén se anota aquí con quién lo hizo y a qué hora. Lo de antes no se puede reconstruir.');
  return '<div class="card"><div class="card-h"><h2>' + ico('i-historial') + ' Bitácora' +
      ' <span class="folio">' + D.bitacora.length + '</span></h2></div>' +
    '<div class="card-b">' +
      '<div class="ag-barra">' + chips +
        '<input type="search" class="ct-busca" placeholder="Buscar por nombre, quién o qué" value="' + esc(BUSCA_BIT) + '" data-busca-bit aria-label="Buscar en la bitácora"></div>' +
      filas +
    '</div></div>' +
    '<p class="pf-nota">La bitácora es memoria, no candado: en esta fase cualquiera cambia su nombre y su rol en Ajustes. ' +
    'Lo que sí garantiza es que un cambio no pasa sin dejar renglón. Entra al respaldo con lo demás; se enseñan los últimos 400.</p>';
}

function agruparPorDia(lista) {
  const grupos = [];
  let ult = null;
  for (const b of lista) {
    const d = new Date(Number(b.ts) || 0);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dia = iso === D.hoy ? 'Hoy' : (iso === masDia(D.hoy, -1) ? 'Ayer' : fmtFecha(iso));
    if (!ult || ult.dia !== dia) { ult = { dia, filas: [] }; grupos.push(ult); }
    ult.filas.push(b);
  }
  return grupos;
}

function masDia(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const ICONO_ACCION = {
  gano: 'i-venta', descarto: 'i-cerrar', etapa: 'i-taller', cambio: 'i-lapiz', agendo: 'i-agenda',
  reagendo: 'i-agenda', marco: 'i-check', cancelo: 'i-cerrar', guardo: 'i-guardar', conteo: 'i-material',
  compra: 'i-camion', restauro: 'i-subir', registro: 'i-venta', anulo: 'i-cerrar',
};

function filaBitacora(b) {
  const d = new Date(Number(b.ts) || 0);
  const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const tono = b.accion === 'descarto' || b.accion === 'cancelo' || b.accion === 'anulo' ? ' mal' : (b.accion === 'gano' || b.accion === 'marco' ? ' bien' : '');
  return '<div class="pf-fila ct-bit">' +
    '<span class="pf-fila-ico' + tono + '">' + ico(ICONO_ACCION[b.accion] || 'i-lapiz') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(b.titulo) + '</p>' +
      (b.detalle ? '<p class="pf-fila-d">' + esc(b.detalle) + '</p>' : '') +
      '<p class="pf-fila-d ct-quien"><b>' + esc(b.sello || b.usuario || 'Sin nombre') + '</b> · ' + hora +
        ' · ' + esc(Bitacora.ENTIDAD_NOMBRE[b.entidad] || b.entidad) + '</p>' +
    '</div>' +
    (b.entidad === 'proyecto' && b.entidad_id
      ? '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-abrir="' + esc(b.entidad_id) + '">Abrir</button></div>'
      : '') +
  '</div>';
}

/* ============================================================================
   Eventos
   ============================================================================ */

function alClic(ev) {
  const t = ev.target;
  const tab = t.closest('[data-tab]');
  if (tab) { cambiarTab(tab.dataset.tab); return; }
  const va = t.closest('[data-va]');
  if (va) { irA(va.dataset.va); return; }
  if (t.closest('[data-com-pagar]')) { armarLista(); return; }
  const copiar = t.closest('[data-com-copiar]');
  if (copiar) {
    const r = Ventas.alcanceDeComisiones(D.comisiones.abonables, Ventas.montoDeTexto(COM_MONTO));
    if (r.k) copiarTexto(textoLista(r), 'Lista copiada: pégala donde registras los abonos');
    return;
  }
  const fin = t.closest('[data-fin-todos]');
  if (fin) { const g = fin.dataset.finTodos; FIN_TODOS[g] = !FIN_TODOS[g]; pintar(); return; }
  const ttp = t.closest('[data-tt-per]');
  if (ttp) { TT_PER = ttp.dataset.ttPer; pintar(); return; }
  const ttv = t.closest('[data-tt-vista]');
  if (ttv) { TT_VISTA = ttv.dataset.ttVista; pintar(); return; }
  const per = t.closest('[data-periodo]');
  if (per) { PERIODO = per.dataset.periodo; pintar(); return; }
  const gper = t.closest('[data-gper]');
  if (gper) { GPER = gper.dataset.gper; pintar(); return; }
  if (t.closest('[data-act="gasto-nuevo"]')) { abrirGasto(); return; }
  const anu = t.closest('[data-gasto-anular]');
  if (anu) { anularGasto(anu.dataset.gastoAnular); return; }
  if (t.closest('[data-csv-gastos]')) { bajarCSVGastos(); return; }
  const ent = t.closest('[data-entidad]');
  if (ent) { ENTIDAD = ent.dataset.entidad || ''; pintar(); return; }
  const ir = t.closest('[data-ir]');
  if (ir && CTX && CTX.ir) { CTX.ir(ir.dataset.ir); return; }
  const abrir = t.closest('[data-abrir]');
  if (abrir && CTX && CTX.pasar) { CTX.pasar('proyectos', { proyecto_id: abrir.dataset.abrir }); return; }
  if (t.closest('[data-act="hoja-traer"]')) { traerDeLaHoja(false); return; }
  if (t.closest('[data-csv]')) { bajarCSV(); }
}

/* Cambiar de pestaña. Entrar a una pestaña es verla de nuevo: sus cuentas olvidan lo último que
   se pintó para no rodar por un cambio que pasó mientras estaba en otra. */
function cambiarTab(tab) {
  olvidarCuentas(tab);
  TAB = tab;
  escribirTabEnDireccion();
  pintar();
}

const TABS = ['ventas', 'lista', 'cobrar', 'comisiones', 'gastos', 'bitacora'];
/* La séptima pestaña solo con Supabase encendido en ESTE aparato. Se lee la clave como la lee
   app.js —sin importar js/nucleo/supa.js—: apagado no se carga nada. Fabricación no tiene Control,
   y aun así no se le ofrece.
   Con la BASE mandando (paso 5 de docs/BASE-MANDA.md) la decide el modo de la empresa: es «Cobros y
   abonos», donde se cobra, y la tienen Dirección y Pagos sin encender nada más que lo que ya pide la
   base para mandar en este aparato (`laBaseManda`, arriba). Con la hoja mandando es la prueba de siempre. */
function supaEncendido() {
  try { return /"encendido":true/.test(localStorage.getItem('al3d_pf_supa') || ''); } catch (_) { return false; }
}
const AREAS_DE_COBRO = ['direccion', 'pagos'];
function tabs() {
  if (laBaseManda()) return AREAS_DE_COBRO.includes(Prefs.rol()) ? TABS.concat('asientos') : TABS;
  return supaEncendido() && Prefs.rol() !== 'fabricacion' ? TABS.concat('asientos') : TABS;
}
/* La pestaña de Supabase se carga la primera vez que se abre y después se pinta sin esperar: sus
   borradores viven en ese módulo, así que un repintado de Control no tira lo escrito. Se le pasa la
   sincronización de la app: una venta sin cotización recién dada de alta baja a este teléfono en el acto. */
function cablearAsientos() {
  const el = $('ct-asientos');
  if (!el) return;
  const o = { sincronizar: CTX && typeof CTX.sincronizar === 'function' ? CTX.sincronizar : null };
  if (_PS) { _PS.cablear(el, o); return; }
  import('./pagos-supa.js').then(m => {
    _PS = m;
    const ahora = $('ct-asientos');
    if (!ahora || !cont || !cont.contains(ahora)) return;
    ahora.innerHTML = m.html();
    m.cablear(ahora, o);
  }).catch(() => { const x = $('ct-asientos'); if (x) x.innerHTML = '<p class="hintnote nota-mal" role="alert">No se pudo abrir esta pestaña. Revisa la señal y vuelve a entrar.</p>'; });
}
function tabDeLaDireccion() {
  try {
    const t = new URLSearchParams(String(location.hash || '').split('?')[1] || '').get('tab');
    return tabs().includes(t) ? t : null;
  } catch (_) { return null; }
}
/* `replaceState` y no una entrada nueva: cambiar de pestaña no es cambiar de pantalla, y llenar
   el historial con cuatro pestañas haría que Atrás tardara cuatro toques en salir de Control. El
   router lee la ruta sin lo que va después del «?» (`rutaDelHash` en app.js). */
function escribirTabEnDireccion() {
  if (!/^#\/control(\?|$)/.test(String(location.hash || ''))) return;
  const destino = '#/control' + (TAB === 'ventas' ? '' : '?tab=' + TAB);
  if (location.hash === destino) return;
  try { history.replaceState(history.state, '', destino); } catch (_) {}
}

let _espera = 0;
function alEscribir(ev) {
  const t = ev.target;
  if (!t) return;
  /* F54. El monto repinta SOLO lo que depende de él, y la frase se dice por voz una vez que se
     deja de teclear: una región `aria-live` sobre el texto la repetiría con cada dígito. */
  if (t.matches && t.matches('[data-com-monto]')) {
    COM_MONTO = t.value; COM_LISTA = null;
    const vivo = $('ct-com-vivo');
    if (vivo && D) vivo.innerHTML = htmlComisionesVivas();
    clearTimeout(_vozCom);
    _vozCom = setTimeout(() => {
      const f = cont && cont.querySelector('.ct-com-res');
      if (f) voz(f.innerText.replace(/\s*\n\s*/g, '. '));
    }, 700);
    return;
  }
  const esProy = t.matches('[data-busca]'), esBit = t.matches('[data-busca-bit]'), esGas = t.matches('[data-busca-gas]');
  if (!esProy && !esBit && !esGas) return;
  if (esProy) BUSCA = t.value; else if (esGas) BUSCA_GAS = t.value; else BUSCA_BIT = t.value;
  const sel = esProy ? '[data-busca]' : (esGas ? '[data-busca-gas]' : '[data-busca-bit]');
  clearTimeout(_espera);
  /* Se repinta con un respiro, y ALREDEDOR del campo: el <input> en el que se escribe no se
     reemplaza, así que ni pierde el foco ni se le cierra el teclado al iPhone en cada pausa.
     Solo si la forma de la pantalla cambió se repinta entera y se le devuelve el foco. */
  _espera = setTimeout(() => {
    if (!cont || !D) return;
    if (repintarAlrededor(cont, htmlPantalla(), t)) { despuesDePintar(); return; }
    pintar();
    const campo = cont && cont.querySelector(sel);
    if (campo) { campo.focus(); try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch (_) {} }
  }, 220);
}

/* El CSV de ventas (el «Excel») es de la dirección: pagos ve la pantalla y cobra, pero no se lleva
   el récord entero de ventas en un archivo. El botón no se pinta y, si llegara un clic, no baja. */
const puedeBajarCSV = () => Prefs.esDireccion();

function bajarCSV() {
  if (!D || !puedeBajarCSV()) return;
  const lista = D.ventas;
  if (!lista.length) { toast('Todavía no hay ventas que exportar', '', 2600); return; }
  const csv = Ventas.csvProyectos(lista, D.fechaInst);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  if (descargarArchivo(csv, 'al3d-ventas-' + sello + '.csv', 'text/csv;charset=utf-8')) {
    toast(lista.length + (lista.length === 1 ? ' venta exportada' : ' ventas exportadas') + ' a CSV, con saldo, cuenta, estatus y origen', 'ok', 3600);
  }
}

const plano = s => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* El monto, al tocarlo, se selecciona entero: al salir se escribe con su formato de dinero
   («$4,000.00»), y teclear encima de eso sin borrar daba «$4,000.00500». */
function alEntrarAlCampo(ev) {
  const t = ev.target;
  if (t && t.matches && t.matches('[data-com-monto]')) { try { t.select(); } catch (_) {} }
}
function alSalirDelCampo(ev) {
  const t = ev.target;
  if (!t || !t.matches || !t.matches('[data-com-monto]')) return;
  const n = Ventas.montoDeTexto(t.value);
  t.value = n > 0 ? money(n) : '';
  COM_MONTO = t.value;
}

/* ============================================================================
   P3 · Las cuentas llevan a lo que cuentan
   ============================================================================
   `data-va` dice a dónde: `tab:cobrar` (otra pestaña), `lista:mes` (la pestaña Ventas con el
   periodo en «Este mes»), `mes:2026-08` (su columna en las doce barras del Resumen),
   `fin:cobrando` (una de las dos listas del Resumen), `cartera`, `instalado` (el primer renglón
   ya instalado) e `ir:proyectos` (otra pantalla). Es un texto y no un índice a una lista de
   acciones: lo que está pintado se explica solo, y no hay lista que se desincronice cuando el
   buscador repinta. */
function irA(dest) {
  const i = String(dest).indexOf(':');
  const tipo = i < 0 ? dest : dest.slice(0, i), arg = i < 0 ? '' : dest.slice(i + 1);
  if (tipo === 'ir') { if (CTX && typeof CTX.ir === 'function') CTX.ir(arg); return; }
  if (tipo === 'fin') {
    llevarA(cont && cont.querySelector('#ct-fin-' + CSS.escape(arg) + ' > .card-h'),
      arg === 'cobrando' ? 'la lista de Cobrando' : 'la lista de En fabricación');
    return;
  }
  if (tipo === 'tab') {
    cambiarTab(arg);
    if (arg === 'gastos') llevarA(cont && cont.querySelector('#ct-gastos-mes > .card-h'), 'Gastos por categoría');
    else llevarA(cont && cont.querySelector('#ct-cartera > .card-h'), 'Cartera');
    return;
  }
  if (tipo === 'gastos') {
    /* Como «lista:mes» de ventas: la lista con el periodo en «Este mes», que es lo que cuenta la cifra. */
    if (GPER !== 'mes') { GPER = 'mes'; pintar(); }
    llevarA(cont && cont.querySelector('#ct-gastos > .card-h'), 'Gastos de este mes');
    return;
  }
  if (tipo === 'lista') {
    /* La lista vive en la pestaña Ventas desde octubre de 2026. El periodo se pone en «Este mes»
       para que la lista a la que se llega sea la que cuenta la cifra; con otro periodo, la cifra y
       la lista no cuadraban y la cuenta mentía por omisión. */
    const otra = TAB !== 'lista';
    if (otra) { olvidarCuentas('lista'); TAB = 'lista'; escribirTabEnDireccion(); }
    if (otra || PERIODO !== 'mes') { PERIODO = 'mes'; pintar(); }
    llevarA(cont && cont.querySelector('#ct-lista > .card-h'), 'Ventas de este mes');
    return;
  }
  if (tipo === 'mes') {
    /* Las barras son del Resumen: desde la pestaña Ventas («Vendido el mes pasado») se vuelve a él. */
    if (TAB !== 'ventas') cambiarTab('ventas');
    llevarA(cont && cont.querySelector('#ct-mes-' + CSS.escape(arg)), 'su mes en las doce barras');
    return;
  }
  if (tipo === 'cartera') { llevarA(cont && cont.querySelector('#ct-cartera > .card-h'), 'Cartera'); return; }
  if (tipo === 'instalado') { llevarA(cont && cont.querySelector('[data-instalado]'), 'el primer proyecto ya instalado'); }
}

/* Llevar a un lugar de la pantalla, diciendo que se llegó: la pieza 17 lo trae a la vista y lo
   enciende UNA vez con las esquinas (con menos movimiento, un aro fijo de un segundo), y el
   foco va al destino aunque sea un título —se le da `tabindex="-1"`: no entra al tabulador pero
   recibe el foco—, para que quien navega con teclado o lector de pantalla no se quede en la
   cuenta de arriba, ya fuera de su vista. Sin la pieza queda el `scrollIntoView` de siempre. */
function llevarA(el, que) {
  if (!el) return;
  if (!el.matches('button, a[href], input, select, textarea, [tabindex]')) el.tabIndex = -1;
  try { el.focus({ preventScroll: true }); } catch (_) {}
  const P = piezas();
  if (P && typeof P.senalar === 'function') P.senalar(el, { desplazar: true });
  else el.scrollIntoView({ block: 'center', behavior: sinMov() ? 'auto' : 'smooth' });
  if (que) voz('Estás en ' + que);
}

/* ============================================================================
   P18 · Las cuentas ruedan cuando cambian, y nunca al entrar
   ============================================================================
   La pieza 1 recuerda lo último que pintó cada cifra por su CLAVE —no por el nodo, que se va con
   cada innerHTML— y, si cambió, la rueda del valor viejo al nuevo. Cuándo tiene sentido no se
   decide aquí sino en el router: entrar a la pantalla olvida todo (`olvidarCifras()` de app.js),
   y un remonte en silencio no olvida nada. Dentro de la pantalla cambiar de pestaña es una
   entrada a ella (`olvidarCuentas`). Lo que sí rueda: la hoja trajo ventas nuevas y «Vendido en
   septiembre» pasa de un importe a otro frente a quien mira.

   Sin «+1»: casi todas las cuentas de aquí son importes, y «+$1,200.00» no cabe junto a una cifra
   que ya llena su tarjeta (`cifraQueCabe()` la achica hasta que quepa). Los centavos se quedan:
   el texto lo formatea quien llama, la pieza solo lo mueve. */
function rodarCuentas(raiz) {
  const P = piezas();
  if (!P || typeof P.rodarCifra !== 'function' || !raiz) return;
  /* Las cuentas y las tres cifras clave del Resumen (`clave`): las dos llevan su cifra en un `<b>` hijo. */
  for (const c of raiz.querySelectorAll('.pf-cuenta[data-cuenta], .ct-clave[data-cuenta]')) {
    const b = c.querySelector(':scope > b');
    if (!b) continue;
    const clave = 'ct:' + TAB + ':' + c.dataset.cuenta;
    _claves.add(clave);
    P.rodarCifra(b, b.textContent, { clave });
  }
}

function olvidarCuentas(tab) {
  const P = piezas();
  if (!P || !P.rodarCifra || typeof P.rodarCifra.olvidar !== 'function') return;
  for (const c of _claves) if (c.startsWith('ct:' + tab + ':')) P.rodarCifra.olvidar(c);
}

/* ============================================================================
   P27 · Las doce barras crecen una vez, al verse
   ============================================================================
   Mientras `_barras` es 'espera', la gráfica nace con la clase `espera` (las barras en
   `scaleY(0)`, desde su base) y un IntersectionObserver espera a que se vea: la gráfica queda
   abajo de las listas, y crecer donde nadie mira es gastar el movimiento. «Se ve» es que su borde
   de arriba ya entró 96 px a la pantalla, no un porcentaje de su área. Al verse, `_barras` pasa a
   'hecho' —para siempre en esta visita— y cada barra crece de 0 a su alto con un escalón de 35 ms
   entre columnas (casi un segundo en total, que es lo máximo que aguanta un adorno); el importe
   corto de encima aparece cuando su barra ya casi llegó. Solo `transform` y `opacity`: nada de
   animar `height`. Se vuelve a llamar después de cada pintado, porque la columna que se
   observaba pudo haberse ido con un innerHTML. */
function vigilarBarras() {
  if (_io) { _io.disconnect(); _io = null; }
  if (_barras !== 'espera' || !cont) return;
  const g = cont.querySelector('.ct-grafica.espera');
  if (!g) return;
  if (typeof IntersectionObserver !== 'function') { crecerBarras(); return; }
  _io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) { _io.disconnect(); _io = null; crecerBarras(); }
  }, { threshold: 0, rootMargin: '0px 0px -96px 0px' });
  _io.observe(g);
}

function crecerBarras() {
  _barras = 'hecho';
  const g = cont && cont.querySelector('.ct-grafica');
  if (!g) return;
  g.classList.remove('espera');
  if (sinMov()) return;
  g.querySelectorAll('.ct-mes').forEach((col, i) => {
    const espera = Math.min(i, 12) * 35;
    col.querySelectorAll('.ct-b').forEach(b => {
      if (!b.animate) return;
      b.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
        { duration: 650, delay: espera, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
    col.querySelectorAll('.ct-mes-cifra').forEach(c => {
      if (!c.animate) return;
      c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: espera + 420, easing: 'ease-out', fill: 'backwards' });
    });
  });
}
