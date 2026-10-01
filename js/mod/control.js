/* ============================================================================
   CONTROL — ventas, cobranza y bitácora. La pantalla de la dirección.

   Nació de una auditoría de septiembre de 2026 que encontró esto: la capa de datos ya sabía
   calcular la conversión cotización→venta, el valor del inventario y el libro de
   movimientos, y NINGUNA pantalla lo pintaba. El tablero contesta «qué hay en el taller y
   qué se atrasa»; nadie contestaba «cuánto vendimos este mes, cuánto hay en la calle sin
   cobrar, cuánto dejamos de vender y quién movió esto». Esa es esta pantalla.

   Cuatro pestañas, y las cuatro se apoyan en lo que ya existe:
     · VENTAS — lo vendido este mes contra el anterior, el pipeline valorizado (autorizadas
       sin decidir), lo perdido, la conversión, el ticket promedio; los últimos doce meses
       en barras; y la lista de ventas filtrable por periodo, con su CSV completo.
     · POR COBRAR — la cartera: cada venta con saldo, de mayor a menor, con el mensaje de
       WhatsApp ya armado. El saldo es el de la hoja cuando bajó; si no, ESTIMADO (total
       menos anticipo pactado), y la pantalla dice cuál de los dos es.
     · COMISIONES — con el dinero que haya, cuántas comisiones completas se pueden liquidar
       empezando por las más chicas (la regla del negocio: bajar el número de pendientes).
       «Pagar estas» ARMA LA LISTA para registrarla en la hoja; esta pantalla no marca pagos.
     · BITÁCORA — quién hizo qué y cuándo, en toda la plataforma. Se lee, no se edita.

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
     · P30 — cada saldo por cobrar lleva su medidor quieto (pieza 20).
     · F54 — comisiones, primero las chicas.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Proy from '../datos/proyectos.js';
import * as Cot from '../datos/cotizador.js';
import * as Agenda from '../datos/agenda.js';
import * as Ventas from '../datos/ventas.js';
import { comisionDe, PCT_COMISION } from '../datos/asistente-contexto.js';
import * as Bitacora from '../datos/bitacora.js';
import * as Sync from '../datos/sync.js';
import { $, ico, esc, money, toast, vacio, segmento, chip, fmtFecha, linkWa, telWa, descargarArchivo,
         hoyISO, cifraQueCabe, repintarAlrededor, conservandoFoco, voz, copiarTexto } from '../nucleo/ui.js';
import { masMeses } from '../nucleo/fechas.js';

let cont = null;
let _alClic = null;             // alClic envuelto con conservandoFoco()
let CTX = null;
let TAB = 'ventas';          // ventas | cobrar | comisiones | bitacora — sobrevive a salir y volver
let PERIODO = '3m';          // mes | 3m | 12m | todo
let BUSCA = '';
let ENTIDAD = '';            // filtro de la bitácora
let BUSCA_BIT = '';
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

export async function montar(contenedor, ctx) {
  cont = contenedor;
  CTX = ctx;
  cont.addEventListener('click', _alClic = conservandoFoco(alClic));
  cont.addEventListener('input', alEscribir);
  cont.addEventListener('focusin', alEntrarAlCampo);
  cont.addEventListener('focusout', alSalirDelCampo);
  if (_mqTelefono && _mqTelefono.addEventListener) _mqTelefono.addEventListener('change', alCambiarAncho);
  /* El pase de quien manda aquí —el asistente, el tablero—: «abre en Por cobrar». */
  const pase = (ctx && ctx.recibir) ? ctx.recibir() : null;
  if (pase && ['ventas', 'cobrar', 'comisiones', 'bitacora'].includes(pase.tab)) TAB = pase.tab;
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
  }

  if (!DB.estado().ok) {
    /* Con el botón de recargar que los demás módulos ya ofrecen: sin él, la pantalla era un
       callejón sin salida. */
    cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo', DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    const b = cont.querySelector('[data-recargar]'); if (b) b.onclick = () => location.reload();
    return;
  }
  if (CTX.acciones) {
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
  /* El globo de los meses y el vigilante de las barras son de este montaje: el globo cuelga de
     un contenedor que el router reutiliza, y uno que se queda puesto abriría un globo vacío en
     la pantalla siguiente. */
  if (_vz) { try { _vz.destruir(); } catch (_) {} _vz = null; }
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
  return { hoy, proyectos, ventas, union, bajada, sinDecidir, historial, fechaInst, kpi, meses, conv,
           cartera, almacen, bitacora, comisiones };
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
    if (!silencioso) toast('Sin señal: se enseña lo último que bajó de la hoja.', '', 3400);
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
    bt.disabled = true; bt.innerHTML = ico('i-reloj') + ' ' + esc('Trayendo la hoja…');
    return;
  }
  const h = P.estadoBoton(bt);
  if (!h) return;
  if (h.estado !== 'trabajando') h.trabajando({ verbo: 'Trayendo la hoja', tau: 6000 });
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
  if (!bt || !P || typeof P.estadoBoton !== 'function') {
    if (!error) toast(cambios || borrados
      ? 'La hoja trajo ' + cambios + (cambios === 1 ? ' cambio' : ' cambios') +
        (borrados ? ' y quitó ' + borrados + (borrados === 1 ? ' venta que ya no está allá' : ' ventas que ya no están allá') : '')
      : 'El récord ya estaba al día con la hoja', 'ok', 3800);
    return;
  }
  const frase = cambios || borrados ? 'La hoja trajo ' + texto : 'El récord ya estaba al día con la hoja';
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
   evita que una cifra de hace tres días se lea como la de hoy. */
function lineaHoja() {
  const b = D.bajada || {};
  const u = D.union || {};
  /* Apagado a mano solo si la pieza 14 no va a tomar el botón (sin ella, o con la bajada
     silenciosa, que no lo enciende): con ella, `despuesDePintar` le devuelve su estado. */
  const P = piezas();
  const ocupado = TRAYENDO && !SILENCIOSA && !(P && typeof P.estadoBoton === 'function');
  const boton = txt => '<button type="button" class="btn btn-gho pf-btn-corto" data-act="hoja-traer"' +
    (ocupado ? ' disabled' : '') + '>' + ico(ocupado ? 'i-reloj' : 'i-bajar') + ' ' +
    esc(ocupado ? 'Trayendo la hoja…' : txt) + '</button>';
  if (!b.configurado) {
    return '<p class="pf-frescura ct-hoja">' + ico('i-nube-off') +
      '<span>Sin puente a la hoja de finanzas: esto es lo que se registró desde este dispositivo. ' +
      'El récord completo del negocio se conecta en Ajustes → Conectar la hoja.</span>' +
      '<button type="button" class="btn btn-gho pf-btn-corto" data-ir="ajustes">' + ico('i-nube') + ' Conectar la hoja</button></p>';
  }
  if (!b.completa) {
    return '<p class="pf-frescura ct-hoja">' + ico('i-nube') + '<span>' +
      (b.a_medias ? 'La hoja se trajo a medias y falta terminar de bajarla.' : 'Todavía no se ha traído el récord de ventas de la hoja.') +
      (b.ultimo_error ? ' ' + esc(b.ultimo_error) : '') + '</span>' + boton('Traer la hoja') + '</p>';
  }
  const n = (Number(u.de_hoja) || 0) + (Number(u.enlazados) || 0);
  return '<p class="pf-frescura ct-hoja">' + ico('i-nube') + '<span>Con la hoja de finanzas: <b>' + n +
    (n === 1 ? ' venta' : ' ventas') + '</b> de la hoja' +
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
  rodarCuentas(cont);
  vigilarBarras();
  if (TRAYENDO && !SILENCIOSA) encenderBoton();
  aplicarCierre();
}

function htmlPantalla() {
  const nCom = D.comisiones.abonables.length;
  const tabs = segmento([
    { v: 'ventas', t: 'Ventas' },
    { v: 'cobrar', t: 'Por cobrar' + (D.kpi.porCobrar.n ? ' · ' + D.kpi.porCobrar.n : '') },
    { v: 'comisiones', t: 'Comisiones' + (nCom ? ' · ' + nCom : '') },
    { v: 'bitacora', t: 'Bitácora' },
  ], TAB, 'data-tab', 'Qué ver');

  let cuerpo;
  if (TAB === 'cobrar') cuerpo = pintarCobrar();
  else if (TAB === 'comisiones') cuerpo = pintarComisiones();
  else if (TAB === 'bitacora') cuerpo = pintarBitacora();
  else cuerpo = pintarVentas();

  return '<div class="ag-barra ct-pestanas">' + tabs + '</div>' + cuerpo;
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

/* ----- Ventas ----- */
function pintarVentas() {
  const k = D.kpi;
  const c = [];
  const cob = etiquetaCobrar();
  /* P3. Los destinos. Una cuenta es puerta solo si hay algo detrás: con 0 ventas, 0 cotizaciones
     o 0 saldos NO lleva a ningún lado (un botón que no hace nada es peor que ninguno), y la
     conversión, que es un porcentaje y no una lista, tampoco. Las del mes llevan a donde se ven
     esas ventas: la lista de abajo con el periodo en «Este mes», o su renglón en las doce barras.
     «Sin decidir» se decide en Proyectos y solo la dirección tiene esa tarjeta. */
  const ymHoy = D.meses[D.meses.length - 1].mes;
  const ymAnt = (D.meses[D.meses.length - 2] || {}).mes;
  const aProyectos = Prefs.esDireccion() && CTX && typeof CTX.tieneRuta === 'function' && CTX.tieneRuta('proyectos');
  c.push([money(k.mes.total), 'Vendido en ' + k.mes.etiqueta, { dinero: true, clave: 'mes',
    va: k.mes.n > 0 ? { dest: 'lista:mes', que: 'ver las ventas de ' + k.mes.etiqueta } : null,
    em: k.mes.n + (k.mes.n === 1 ? ' venta' : ' ventas') +
        (k.variacion === null ? '' : ' · ' + (k.variacion >= 0 ? '+' : '') + k.variacion + ' % vs ' + k.mesAnterior.etiqueta) }]);
  c.push([money(k.mesAnterior.total), 'Vendido en ' + k.mesAnterior.etiqueta, { clave: 'ant',
    va: k.mesAnterior.n > 0 && ymAnt ? { dest: 'mes:' + ymAnt, que: 'ir a ' + k.mesAnterior.etiqueta + ' en las doce barras' } : null,
    em: k.mesAnterior.n + (k.mesAnterior.n === 1 ? ' venta' : ' ventas') }]);
  c.push([money(k.pipeline.total), 'Autorizado sin decidir', { urge: k.pipeline.n > 0, clave: 'pipe',
    va: k.pipeline.n > 0 && aProyectos ? { dest: 'ir:proyectos', que: 'abrir Proyectos para decidirlas' } : null,
    em: k.pipeline.n + (k.pipeline.n === 1 ? ' cotización' : ' cotizaciones') }]);
  c.push([money(k.porCobrar.total), cob.t, { urge: k.porCobrar.n > 0, clave: 'cobrar',
    va: k.porCobrar.n > 0 ? { dest: 'tab:cobrar', que: 'abrir Por cobrar' } : null,
    em: k.porCobrar.n + (k.porCobrar.n === 1 ? ' venta con saldo' : ' ventas con saldo') + (cob.em ? ' · ' + cob.em : '') }]);
  c.push([D.conv.tasa === null ? '—' : D.conv.tasa + ' %', 'Conversión', { clave: 'conv',
    em: D.conv.ganadas + (D.conv.ganadas === 1 ? ' ganada de ' : ' ganadas de ') +
          (D.conv.ganadas + D.conv.perdidas) +
          (D.conv.ganadas + D.conv.perdidas === 1 ? ' decidida' : ' decididas') }]);
  c.push([money(k.perdidoMes.total), 'No se dio en ' + k.mes.etiqueta, { mal: k.perdidoMes.n > 0, clave: 'perdido',
    va: k.perdidoMes.n > 0 ? { dest: 'mes:' + ymHoy, que: 'ir a ' + k.mes.etiqueta + ' en las doce barras' } : null,
    em: k.perdidoMes.n + (k.perdidoMes.n === 1 ? ' cotización' : ' cotizaciones') }]);

  const partes = [lineaHoja(), filaCuentas(c)];

  partes.push(graficaMeses());

  if (D.almacen) partes.push(filaAlmacen());

  partes.push(listaProyectos());

  partes.push('<p class="pf-nota">«Vendido» suma el importe de cada venta por la fecha de su anticipo: el de la hoja cuando la ' +
    'venta está allá, y el que se firmó aquí cuando todavía no ha salido de este dispositivo. «Por cobrar» es el saldo que calcula ' +
    'la hoja cuando bajó; si no, el total menos el anticipo pactado, y cero si el estatus ya dice LIQUIDADO. ' +
    'El ticket promedio de los últimos doce meses es ' + esc(money(k.ticket)) +
    (k.ultimos12.n ? ' sobre ' + k.ultimos12.n + (k.ultimos12.n === 1 ? ' venta' : ' ventas') : '') + '.</p>');
  return partes.join('');
}

/* Una fila de cuentas, con la cifra al MISMO tamaño en todas: el que pida la más larga. Cada
   una a su tamaño cabía, pero «$0.00» salía a 28 px junto a un importe de siete cifras a 14, y
   el número más grande de la fila parecía el más chico. Ver `cifraQueCabe()` en ui.js.
   El mismo `--c` es la mitad de la promesa: la hoja saca el tamaño del ancho de CADA tarjeta,
   así que la otra mitad es que todas midan lo mismo. Por eso en esta fila la del dinero no se
   lleva el renglón entero en el teléfono angosto (`.pf-cuenta.dinero` en css/plataforma.css). */
function filaCuentas(c) {
  const largo = Math.max(1, ...c.map(x => String(x[0]).length));
  return '<div class="pf-cuentas">' + c.map(x => cuenta(x[0], x[1], x[2], largo)).join('') + '</div>';
}

/* P3 + P18. La cuenta es un `<p>` o, si lleva a algún lado (`o.va`), un `<button class="va">` con
   la flechita de «ir» que pone la hoja de estilos del Tablero tras la etiqueta y el destino dicho
   con palabras para el lector («…, abrir Por cobrar»): el color y la flecha solos no lo cuentan.
   `o.clave` es la memoria del odómetro (la cifra se repinta con cada toque y el valor anterior
   no puede vivir en el nodo). La etiqueta va en su `<span class="pf-cuenta-t">` porque ahí cuelga
   la flecha. */
function cuenta(valor, etiqueta, o = {}, largo) {
  const cls = o.dinero ? ' dinero' : (o.mal ? ' mal' : (o.urge ? ' urge' : ''));
  const clave = o.clave ? ' data-cuenta="' + esc(o.clave) + '"' : '';
  const cuerpo = cifraQueCabe(valor, largo) + '<span class="pf-cuenta-t">' + esc(etiqueta) + '</span>' +
    (o.em ? '<em>' + esc(o.em) + '</em>' : '');
  if (!o.va) return '<p class="pf-cuenta ct-cuenta' + cls + '"' + clave + '>' + cuerpo + '</p>';
  return '<button type="button" class="pf-cuenta ct-cuenta va' + cls + '" data-va="' + esc(o.va.dest) + '"' + clave + '>' +
    cuerpo + '<span class="solo-voz">, ' + esc(o.va.que) + '</span></button>';
}

/* Las barras de doce meses, en HTML y CSS y nada más: un `<i>` con su ancho en porcentaje del
   mes más alto. Sin librería, sin lienzo, y se imprime igual que se ve. Debajo de cada barra,
   el mes; a la derecha, el importe. Lo perdido va como una segunda barra más tenue.

   P27 · Dos cosas nuevas, y ninguna cambia lo que dice la gráfica.
   Un mes con algo que contar (una venta o una que no se dio) es un BOTÓN que abre un globo con
   sus ventas y su total (pieza 4, `vistazoMes`): para saber qué se vendió en agosto había que
   filtrar la lista a mano. Un mes en cero sigue siendo un renglón sin botón: no hay nada que
   abrir. Cada botón lleva su `id` para que el globo, si la pantalla se repinta con él abierto,
   encuentre a su gemelo y se quede.
   Y las barras crecen UNA vez, la primera que se ven (`_barras`, `vigilarBarras`): la
   `transition:width` que había nunca corría, porque cada innerHTML las recrea con su ancho
   puesto. Aquí nacen en `scaleX(0)` con la clase `espera` solo mientras está pendiente; después
   nacen terminadas, y por eso una búsqueda que repinta no las vuelve a mover. */
function graficaMeses() {
  const M = D.meses;
  const tope = Math.max(1, ...M.map(m => Math.max(m.vendido, m.perdido)));
  const filas = M.map(m => {
    const pv = Math.round(m.vendido / tope * 100), pp = Math.round(m.perdido / tope * 100);
    const abre = m.ganados > 0 || m.perdidos > 0;
    const interior =
      '<span class="ct-mes-t">' + esc(m.etiqueta) + '</span>' +
      '<span class="ct-barras" aria-hidden="true">' +
        /* Un mes en CERO no lleva barra. La barra tiene 2 px de mínimo para que una venta chica
           junto a un mes de 200 mil se siga viendo, y con eso los once meses vacíos salían cada
           uno con su rayita azul: se leían como once ventas pequeñas. Igual que la de perdido. */
        (m.vendido > 0 ? '<i class="ct-b vendido" style="width:' + pv + '%"></i>' : '') +
        (m.perdido > 0 ? '<i class="ct-b perdido" style="width:' + pp + '%"></i>' : '') +
      '</span>' +
      '<span class="ct-mes-v">' + esc(money(m.vendido)) +
        '<small>' + m.ganados + (m.ganados === 1 ? ' venta' : ' ventas') +
        (m.perdidos ? ' · ' + m.perdidos + ' no se ' + (m.perdidos === 1 ? 'dio' : 'dieron') : '') + '</small></span>' +
      (abre ? '<span class="solo-voz">, ver sus ventas</span>' : '');
    const clase = 'ct-mes' + (m.mes === D.hoy.slice(0, 7) ? ' actual' : '');
    return abre
      ? '<button type="button" class="' + clase + ' ct-mes-ver" id="ct-mes-' + esc(m.mes) + '" data-mes="' + esc(m.mes) +
        '" aria-haspopup="dialog" aria-expanded="false">' + interior + '</button>'
      : '<div class="' + clase + '">' + interior + '</div>';
  }).join('');
  const total = M.reduce((s, m) => s + m.vendido, 0);
  return '<div class="card" id="ct-meses"><div class="card-h"><h2>' + ico('i-control') + ' Últimos doce meses</h2>' +
    '<span class="folio">' + esc(money(total)) + '</span></div>' +
    '<div class="card-b"><div class="ct-grafica' + (_barras === 'espera' ? ' espera' : '') + '">' + filas + '</div>' +
    '<p class="pf-nota ct-leyenda"><i class="ct-b vendido"></i> vendido &nbsp; <i class="ct-b perdido"></i> no se dio</p>' +
    '</div></div>';
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

function filaAlmacen() {
  const a = D.almacen;
  const v = a.valor || {};
  const conCosto = Number(v.con_costo) || 0, sinCosto = Number(v.sin_costo) || 0;
  const texto = conCosto
    ? 'Vale ' + money(v.total) + ' con el costo de ' + conCosto + (conCosto === 1 ? ' material' : ' materiales') +
      (sinCosto ? '; ' + sinCosto + ' no tienen costo capturado y no suman.' : '.')
    : 'Ningún material tiene costo capturado, así que el valor del almacén no se puede sumar. Se pone en el catálogo, uno por uno.';
  return '<div class="card"><div class="card-b">' +
    '<div class="pf-fila">' +
      '<span class="pf-fila-ico' + (a.bajoMinimo ? ' urge' : '') + '">' + ico('i-material') + '</span>' +
      '<div class="pf-fila-tx"><p class="pf-fila-t">El almacén' +
        (a.bajoMinimo ? ' <span class="pf-sem falta">' + a.bajoMinimo + ' bajo mínimo</span>' : '') + '</p>' +
      '<p class="pf-fila-d">' + esc(texto) + '</p></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-ir="material">Ver material</button></div>' +
    '</div></div></div>';
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
    ? lista.map(filaProyecto).join('')
    : vacio('Nada en este periodo', 'Cuando una cotización se marque como ganada, o cuando baje una venta de la hoja, aparece aquí con su importe.');
  /* En el teléfono el «Bajar CSV de ventas» del encabezado no existe —el hueco de acciones va
     en `display:none` abajo de 760 px, y app.js pide que lo que va ahí exista también dentro de
     la pantalla—: sin esto, desde el celular no había cómo bajarlo. Va en esta tarjeta, que es
     lo que baja, en la tira de su periodo y su buscador y no en la cabecera: la cabecera no
     envuelve, y en 360 px el botón encimaba la cuenta de ventas sobre el total. Se decide al
     pintar con el mismo corte del CSS, y un giro que lo cruza se repinta (`alCambiarAncho`). */
  const csvAqui = enTelefono()
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

function filaProyecto(p) {
  const saldo = Ventas.saldoDe(p);
  const cancelado = p.etapa === 'cancelado';
  const etapa = cancelado ? 'No se dio' : (p.etapa ? (Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) : '');
  return '<div class="pf-fila ct-fila">' +
    '<span class="pf-fila-ico' + (cancelado ? '' : (saldo > 0 ? ' urge' : ' bien')) + '">' +
      ico(p.etapa ? (Proy.ICO_ETAPA[p.etapa] || 'i-proyectos') : 'i-venta') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(p.nombre || p.folio_local || p.folio_hoja) + origenDe(p) + '</p>' +
      '<p class="pf-fila-d">' + esc(foliosDe(p) || 'sin folio') + ' · ' + esc(fmtFecha(p.fecha_ganado) || 'sin fecha') +
        (etapa ? ' · <span class="pf-etapa ' + ETAPA_CLASE(p.etapa) + '">' + esc(etapa) + '</span>' : '') +
        (p.cuenta ? ' · ' + esc(p.cuenta) : '') + (p.estatus_notion ? ' · ' + esc(p.estatus_notion) : '') +
      '</p>' +
    '</div>' +
    '<div class="ct-monto' + (cancelado ? ' cancelado' : '') + '">' + esc(money(Ventas.vendidoDe(p))) +
      (!cancelado && saldo > 0 ? '<small>saldo ' + esc(money(saldo)) + '</small>' : '') +
      (!cancelado && saldo <= 0 ? '<small>cobrado</small>' : '') +
    '</div>' +
    (p.de_hoja ? '' :
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-abrir="' + esc(p.id) + '">Abrir</button></div>') +
  '</div>';
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
    '<p class="pf-nota">Primero lo instalado: ese trabajo ya se entregó y ese dinero ya debía estar cobrado. El saldo es el ' +
    'que calcula la hoja cuando la venta está allá y bajó («saldo de la hoja»); si no, el total vendido menos el anticipo ' +
    'pactado. Marcar LIQUIDADO —en la hoja o en la ficha del proyecto— lo saca de esta lista.</p>';
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
      '<p class="pf-fila-t">' + esc(p.nombre || p.folio_local || p.folio_hoja) + origenDe(p) + '</p>' +
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
            ' cuando su venta quede LIQUIDADA en la hoja.'
          : 'Una comisión se puede pagar cuando su venta queda LIQUIDADA en la hoja.');
  return filaCuentas(c) + cuerpo +
    '<p class="pf-nota">La comisión es fija: ' + PCT + ' del subtotal, sin IVA, con centavos, como la calcula la hoja. Aquí no se marca ningún pago: ' +
    'el abono de cada comisión se registra en la hoja «Finanzas AL3D — Ventas y Comisiones» y, cuando baja de allá, la comisión sale de esta lista.</p>';
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
      : (x.sub > 0 ? PCT + ' de ' + money(x.sub) : 'comisión de la hoja');
    return '<li class="ct-com-fila ' + estado + '" data-id="' + esc(x.id) + '">' +
      '<span class="ct-com-ck" aria-hidden="true">' + ck + '</span>' +
      '<span class="ct-com-nom">' + esc(x.nombre) + '<small>' + palabra + ' · <span class="nw">' + esc(x.folio) + '</span></small></span>' +
      '<span class="ct-com-monto">' + esc(money(x.monto)) + '<small>' + esc(parte) + '</small></span></li>';
  }).join('');
  if (armada) armada.nueva = false;

  const texto = armada ? textoLista(r) : '';
  const panel = armada
    ? '<div class="ct-com-armada" id="ct-com-armada"><p class="pf-fila-t">Lista para registrar en la hoja <span class="folio">' + r.k + '</span></p>' +
      '<pre class="ct-com-texto" tabindex="0" aria-label="Lista armada">' + esc(texto) + '</pre>' +
      '<div class="ct-com-acc"><button type="button" class="btn btn-pri pf-btn-corto" data-com-copiar>' + ico('i-copiar') + ' Copiar la lista</button>' +
        '<a class="btn-wa" href="' + esc(linkWa('', texto)) + '" target="_blank" rel="noopener">' + ico('i-wa') + ' Mandarla por WhatsApp</a></div>' +
      '<p class="pf-nota">Aquí no se marca nada como pagado: el abono de cada una se registra en la hoja «Finanzas AL3D». ' +
      'Cuando baje de allá, estas dejan de aparecer.</p></div>'
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
  return ['Comisiones para registrar en la hoja «Finanzas AL3D — Ventas y Comisiones»',
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
  voz('Lista armada: ' + r.k + (r.k === 1 ? ' comisión' : ' comisiones') + ' por ' + money(r.suma) + '. Cópiala para registrarla en la hoja.');
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
  compra: 'i-camion', restauro: 'i-subir',
};

function filaBitacora(b) {
  const d = new Date(Number(b.ts) || 0);
  const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const tono = b.accion === 'descarto' || b.accion === 'cancelo' ? ' mal' : (b.accion === 'gano' || b.accion === 'marco' ? ' bien' : '');
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
  const per = t.closest('[data-periodo]');
  if (per) { PERIODO = per.dataset.periodo; pintar(); return; }
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
  pintar();
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
  const esProy = t.matches('[data-busca]'), esBit = t.matches('[data-busca-bit]');
  if (!esProy && !esBit) return;
  if (esProy) BUSCA = t.value; else BUSCA_BIT = t.value;
  clearTimeout(_espera);
  /* Se repinta con un respiro, y ALREDEDOR del campo: el <input> en el que se escribe no se
     reemplaza, así que ni pierde el foco ni se le cierra el teclado al iPhone en cada pausa.
     Solo si la forma de la pantalla cambió se repinta entera y se le devuelve el foco. */
  _espera = setTimeout(() => {
    if (!cont || !D) return;
    if (repintarAlrededor(cont, htmlPantalla(), t)) { despuesDePintar(); return; }
    pintar();
    const campo = cont && cont.querySelector(esProy ? '[data-busca]' : '[data-busca-bit]');
    if (campo) { campo.focus(); try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch (_) {} }
  }, 220);
}

function bajarCSV() {
  if (!D) return;
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
   `data-va` dice a dónde: `tab:cobrar` (otra pestaña), `lista:mes` (la lista de ventas con el
   periodo en «Este mes»), `mes:2026-08` (su renglón en las doce barras), `cartera`, `instalado`
   (el primer renglón ya instalado) e `ir:proyectos` (otra pantalla). Es un texto y no un índice
   a una lista de acciones: lo que está pintado se explica solo, y no hay lista que se
   desincronice cuando el buscador repinta. */
function irA(dest) {
  const i = String(dest).indexOf(':');
  const tipo = i < 0 ? dest : dest.slice(0, i), arg = i < 0 ? '' : dest.slice(i + 1);
  if (tipo === 'ir') { if (CTX && typeof CTX.ir === 'function') CTX.ir(arg); return; }
  if (tipo === 'tab') {
    cambiarTab(arg);
    llevarA(cont && cont.querySelector('#ct-cartera > .card-h'), 'Cartera');
    return;
  }
  if (tipo === 'lista') {
    /* El periodo se pone en «Este mes» para que la lista a la que se llega sea la que cuenta la
       cifra; con otro periodo, la cifra y la lista no cuadraban y la cuenta mentía por omisión. */
    if (PERIODO !== 'mes') { PERIODO = 'mes'; pintar(); }
    llevarA(cont && cont.querySelector('#ct-lista > .card-h'), 'Ventas de este mes');
    return;
  }
  if (tipo === 'mes') { llevarA(cont && cont.querySelector('#ct-mes-' + CSS.escape(arg)), 'su mes en las doce barras'); return; }
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
  for (const c of raiz.querySelectorAll('.pf-cuenta[data-cuenta]')) {
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
   `scaleX(0)`) y un IntersectionObserver espera a que se vea: en el teléfono la gráfica queda
   bajo las cuentas, y crecer donde nadie mira es gastar el movimiento. «Se ve» es que su borde de
   arriba ya entró 96 px a la pantalla, no un porcentaje de su área: la gráfica mide más de 700 px
   en un teléfono y con `threshold` por área tenía que entrar casi un tercio para empezar. Al verse, `_barras` pasa a
   'hecho' —para siempre en esta visita— y cada barra crece de 0 a su ancho con un escalón de 35 ms
   entre renglones (casi un segundo en total, que es lo máximo que aguanta un adorno). Solo
   `transform`: nada de animar `width`. Se vuelve a llamar después de cada pintado, porque el
   renglón que se observaba pudo haberse ido con un innerHTML. */
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
  g.querySelectorAll('.ct-mes').forEach((fila, i) => {
    fila.querySelectorAll('.ct-b').forEach(b => {
      if (!b.animate) return;
      b.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        { duration: 650, delay: Math.min(i, 12) * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  });
}
