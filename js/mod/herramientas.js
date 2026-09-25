/* ============================================================================
   LAS HERRAMIENTAS DEL TALLER — la mesa de corte y el vectorizador.

   Por qué existe este módulo, que es lo que importa: estas dos herramientas son de
   FABRICACIÓN, no de la venta. Acomodar piezas en la lámina y convertir un logotipo en trazo
   de corte son cosas que se hacen con el archivo en la mano, sin que haya una cotización
   abierta ni tenga que haberla. Y hasta septiembre de 2026 el anidador vivía como una pestaña
   del Tablero —«Mesa de corte», al lado de «Carga del taller»— y el vectorizador vivía DENTRO
   del cotizador, detrás del botón «Vectorizar» de una partida.

   El resultado medible de eso: para vectorizar un logotipo había que abrir una cotización que
   nadie iba a mandar, y para anidar había que saber que la mesa de corte estaba escondida
   detrás de un segmento en otra pantalla. Las dos son de uso diario en el taller. Una
   herramienta diaria que se busca en el menú de otra cosa se deja de usar y el trabajo se va
   a mano.

   ── Por qué es un <iframe> y no un módulo de verdad ─────────────────────────────
   Por lo mismo que el cotizador empotrado, y está escrito con todo detalle en
   js/mod/cotizador.js: estas páginas son documentos completos, con su propio arranque y sus
   propios manejadores en línea. Portarlas a módulos ES las dejaría mudas en silencio. El
   marco es el precio de no reescribir dos motores que funcionan.

   Lo que NO se hace, y es la decisión de fondo: no se copia el marcado de la herramienta a
   una página nueva. Una segunda copia de 153 líneas de marcado se separa de la original en
   tres meses y a partir de ahí hay dos vectorizadores que se parecen. Una implementación, dos
   puertas.

   ── Las dos rutas se CONSERVAN, y eso obliga a una regla ────────────────────────
   Las dos llevan `conservar: true` en RUTAS: salir de la Mesa de corte y volver ya no
   reinterpreta el motor entero. El ciclo de vida se parte en tres —`montar`, `ocultar`,
   `mostrar`, `desmontar`— y la regla es la misma que en js/mod/cotizador.js: `ocultar()`
   suelta todo lo que este módulo escribe FUERA de su sección, y `mostrar()` lo repone.

   Y hay un invariante que este archivo NO puede defender solo: es UN módulo con UN juego de
   estado (`_cont`, `_marcoId`, `_reloj`, `_oyeMensaje`) para DOS rutas. Dos instancias vivas
   a la vez se pisarían las variables, y la segunda dejaría los oyentes de la primera sin
   nadie que los quite. Quien lo impide es `TOPE_CONSERVADAS = 1` en js/nucleo/conservar.js:
   al entrar a una de estas dos, la otra se poda. Subir ese número sin darle estado por
   contenedor a este archivo es romperlo; el `montar()` de abajo lo dice por consola si llega
   a pasar, pero el sitio donde hay que leerlo es allá.
   ============================================================================ */

import { $, esqueletoMarco, medirMarco, alTerminarDeEntrar } from '../nucleo/ui.js';

/* La tabla de herramientas. Cada una dice de qué sección cuelga, qué documento empotra y con
   qué silueta se tapa mientras arranca. Añadir una es un renglón aquí, su sección en
   index.html y su renglón en RUTAS —que es la misma promesa que hace `RUTAS`—. */
const HERRAMIENTAS = {
  'mod-anidador': {
    src: 'anidador-vectores/',
    marco: 'pf-herr-anidador',
    esqueleto: 'anidador',
    cargando: 'Abriendo la mesa de corte…',
    titulo: 'Anidador de vectores — acomodo de piezas en la lámina',
  },
  /* El vectorizador es el MISMO documento del cotizador, abierto con `#vector`. No es una
     página aparte y no debe serlo: duplicar sus 153 líneas de marcado dejaría dos
     vectorizadores que se parecen. El hash enciende `html.solo-vector` allá dentro, que apaga
     lo de cotizar y deja la herramienta sola. Ver js/cotizador/arranque.js. */
  'mod-vectorizar': {
    src: 'cotizador.html#vector',
    marco: 'pf-herr-vector',
    esqueleto: 'cotizador',
    cargando: 'Abriendo el vectorizador…',
    titulo: 'Vectorizador — del logotipo al trazo de corte',
  },
};

let _cont = null;
let _ctx = null;
let _reloj = null;
let _intentos = 0;
let _marcoId = '';
let _oyeMensaje = null;
/* ¿Esta pantalla se está viendo? Montado y visible dejaron de ser lo mismo desde que las dos
   rutas se conservan. Todo lo que mide geometría se pregunta por esto antes. */
let _visible = false;
/* Para cancelar la medición que espera al final de la animación de entrada, si la pantalla se
   va antes de que termine. Ver `alTerminarDeEntrar` en nucleo/ui.js. */
let _finEntrada = null;

export async function montar(contenedor, ctx) {
  /* El invariante de arriba, dicho en voz alta si se rompe. Con `TOPE_CONSERVADAS = 1` el
     router poda la otra herramienta antes de montar ésta, así que esto no puede pasar; si
     algún día pasa, el síntoma sin este aviso sería un marco con oyentes que nadie quita y
     un `_marcoId` midiendo la caja equivocada — nada que se parezca a su causa. */
  if (_cont && _cont !== contenedor) {
    console.warn('herramientas: se monta «' + (contenedor && contenedor.id) + '» con «' +
                 _cont.id + '» todavía vivo; se suelta el anterior');
    desmontar();
  }
  _cont = contenedor;
  _ctx = ctx;
  _visible = true;

  const h = HERRAMIENTAS[contenedor && contenedor.id];
  if (!h) { contenedor.innerHTML = ''; return; }
  _marcoId = h.marco;

  /* LA GUARDA, primero que nada y por la razón exacta del cotizador empotrado: el oyente de
     `storage` del router remonta el módulo activo cuando llega un cambio de otra pestaña, y
     remontar aquí significa `innerHTML = ''`, el marco muerto y el motor entero recargándose
     a media faena. El anidador tarda entre 700 y 950 ms en arrancar: perder eso porque
     alguien guardó algo en otra pestaña es inaceptable. */
  if (ctx && ctx.sinRemonte) ctx.sinRemonte(true);

  _cont.innerHTML =
    '<div class="pf-marco-caja pf-marco-cargando">' +
      esqueletoMarco(h.esqueleto, h.cargando) +
      '<iframe class="pf-marco" id="' + h.marco + '" src="' + h.src + '" ' +
      'title="' + h.titulo + '"></iframe>' +
    '</div>';

  const m = $(h.marco);
  if (!m) return;

  /* Sin esto la página de afuera reserva hueco debajo del marco y queda una franja vacía con
     scroll propio: el marco ya termina encima de la barra de módulos, que es lo que mide
     `medirMarco`. css/plataforma.css lee esta clase. */
  document.body.classList.add('pf-marco-lleno');

  /* Un iframe no tiene alto propio: sin medirlo se queda en los 150 px de la especificación.
     Después de que el navegador colocó la caja, no en el mismo tick. */
  requestAnimationFrame(() => medir());
  medirCuandoEntre();
  window.addEventListener('resize', alRedimensionar);

  /* Se pregunta por el DOM del documento de dentro y NO por su evento `load`, por la misma
     razón que el cotizador empotrado la dejó escrita: `load` espera a TODAS las subpeticiones
     del hijo, y estas páginas piden sus tipografías a fonts.googleapis.com. Con esa petición
     colgada —red mala, firewall— `load` tarda más que cualquier techo razonable y la pantalla
     de carga se quedaría puesta encima de un marco que está perfecto.

     `html.arrancando` la pone el primer <script> del documento hijo y se la quita al terminar
     su init(); mientras la tenga, lo que hay dentro es su propio esqueleto. Esperar a que se
     vaya es lo que hace que se vea UNA pantalla de carga y no ésta y luego la de adentro. */
  _intentos = 0;
  if (_reloj) clearTimeout(_reloj);
  _reloj = setTimeout(vigilar, 150);

  /* ----- El pase del vectorizador a la mesa de corte -----
     «Acomodar en hoja» deja el trazo en `al3d_anidar` —el canal que lleva funcionando entre
     las dos apps, que no se toca— y le pide al padre que cambie de herramienta. Si nadie
     escucha, el botón se aprieta, el trazo se guarda y no pasa NADA visible: la peor clase
     de falla, porque nadie la reporta. Lo escuchaba js/mod/cotizador.js para el cotizador
     empotrado; aquí hace falta otra vez porque el marco es otro.

     Se validan el origen Y la fuente, igual que allá: `message` lo puede disparar cualquier
     ventana que tenga una referencia a ésta. */
  _oyeMensaje = ev => {
    if (ev.origin !== location.origin) return;
    if (!m || ev.source !== m.contentWindow) return;
    /* Y que esta pantalla se esté viendo: un marco conservado sigue vivo mientras se mira
       otra cosa, y una pantalla que nadie tiene delante no puede mover la navegación. */
    if (!_visible) return;
    const d = ev.data;
    if (!d || typeof d !== 'object' || d.al3d !== 'anidar') return;
    if (_ctx && _ctx.ir) _ctx.ir('anidador');
  };
  window.addEventListener('message', _oyeMensaje);
}

/* El alto del marco, con la guarda de visibilidad. `medirMarco` escribe `--pf-marco-h`, que
   es UNA variable de :root compartida por los tres marcos, y el rectángulo de un <iframe> en
   `display:none` es todo ceros: medir desde una pantalla escondida le escribiría al marco que
   SÍ se está viendo un alto sacado de una caja que no existe. */
function medir() {
  if (!_visible || !_marcoId) return;
  medirMarco(_marcoId);
}

/* La sección entra desde diez píxeles abajo (`.pf-mod{animation:entra}`), así que la medida
   que se toma nada más enseñarla sale diez píxeles corta. Se vuelve a medir cuando acabe de
   entrar; el porqué completo está en `alTerminarDeEntrar`, en nucleo/ui.js. Hace falta en los
   dos caminos: al volver a enseñar una pantalla conservada no hay nada que esperar, y en un
   montaje con el documento ya en caché el vigilante remide dentro de esos mismos .32 s. */
function medirCuandoEntre() {
  if (_finEntrada) { _finEntrada(); _finEntrada = null; }
  _finEntrada = alTerminarDeEntrar(_cont, () => { _finEntrada = null; medir(); });
}

function sano() {
  const m = $(_marcoId);
  if (!m) return false;
  try {
    const d = m.contentDocument;
    return !!(d && d.body && d.documentElement && !d.documentElement.classList.contains('arrancando'));
  } catch (_) {
    /* Mismo origen: esto no debería lanzar. Si lanza, el marco todavía no tiene documento. */
    return false;
  }
}

/* El vigilante NO se para al cambiar de pestaña, y es a propósito desde que estas rutas se
   conservan: quien abre la Mesa de corte y se va mientras carga se la encuentra puesta al
   volver, en vez de empezar otra vez los 700–950 ms de arranque. Se para cuando el módulo se
   desmonta de verdad, que es cuando `_cont` se pone en null. */
function vigilar() {
  if (!_cont) return;                       // el módulo se desmontó mientras se esperaba
  if (sano()) { _reloj = null; marcoListo(); medir(); return; }
  /* 100 intentos de 150 ms = 15 s. Generoso a propósito: el anidador carga diez guiones
     —clipper.js solo ya pesa— y en un teléfono viejo con red mala el primer pintado se mide
     en segundos. Al agotarse se quita la silueta de todas formas: taparle a alguien un
     diagnóstico que la propia herramienta sabe dar —sin Workers, abierta con file://— es
     peor que enseñar un marco que quizá falló. */
  if (++_intentos > 100) { _reloj = null; marcoListo(); return; }
  _reloj = setTimeout(vigilar, 150);
}

function marcoListo() {
  const caja = _cont && _cont.querySelector('.pf-marco-caja');
  if (!caja) return;
  caja.classList.remove('pf-marco-cargando');
  caja.classList.add('pf-marco-listo');
  setTimeout(() => { for (const e of caja.querySelectorAll('.pf-marco-esq,.pf-marco-esq-t')) e.remove(); }, 450);
}

let _rz = 0;
function alRedimensionar() {
  if (_rz) return;
  _rz = requestAnimationFrame(() => { _rz = 0; medir(); });
}

/* ============================================================================
   Esconderse y volver — el ciclo de vida de una ruta `conservar`
   ============================================================================ */

/* Deja de verse, pero sigue montada. Se suelta todo lo que este módulo escribe fuera de su
   propia sección, que es lo que si no se queda encima de la pantalla de otro; se queda el
   <iframe> con su motor arrancado, que es el punto entero de conservar.

   El oyente de `resize` se va con la visibilidad y no con el montaje: leer geometría de una
   caja que está en `display:none` no sirve para nada y encima escribe en una variable que
   comparten los tres marcos. */
export function ocultar() {
  _visible = false;
  if (_rz) { cancelAnimationFrame(_rz); _rz = 0; }
  if (_finEntrada) { _finEntrada(); _finEntrada = null; }
  window.removeEventListener('resize', alRedimensionar);
  /* La clase del body decide el relleno de la página ENTERA y esconde el botón del asistente
     (css/plataforma.css). Puesta encima del Tablero le corta el aire de abajo y le
     desaparece un botón que sí tiene. */
  document.body.classList.remove('pf-marco-lleno');
  /* Y la guarda del remonte: escondida, esta pantalla ya no tiene por qué impedir que el
     router repinte la que SÍ se está viendo cuando llega un 'storage'. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
}

/* Vuelve a verse. Repone exactamente lo que `montar()` pone y `ocultar()` quitó. */
export async function mostrar() {
  if (!_cont || !_ctx) return;
  /* Si el marco ya no está en la sección, no hay nada que reutilizar y se rehace desde cero:
     el router ya no vuelve a montar una pantalla conservada, así que sin esto una sección
     vacía se quedaría vacía para siempre. */
  if (!_marcoId || !_cont.querySelector('#' + _marcoId)) {
    const cont = _cont, ctx = _ctx;
    desmontar();
    return montar(cont, ctx);
  }
  _visible = true;
  /* El router apaga la guarda del remonte en CADA montaje —éste incluido—, así que una
     pantalla que vuelve tiene que volver a pedirla o el primer 'storage' que llegue le tira
     el marco a media faena, que es justo lo que esa guarda existe para evitar. */
  if (_ctx.sinRemonte) _ctx.sinRemonte(true);
  document.body.classList.add('pf-marco-lleno');
  window.addEventListener('resize', alRedimensionar);
  /* Después de que el navegador colocó la caja, no en el mismo tick: la sección acaba de
     dejar de estar en `display:none` y su rectángulo todavía es el de antes. */
  requestAnimationFrame(() => medir());
  medirCuandoEntre();
}

export function desmontar() {
  /* El final incluye el «deja de verse»: el oyente de `resize`, la clase del body y la guarda
     del remonte se sueltan en un solo sitio, para que no haya dos listas que se separen. */
  ocultar();
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_oyeMensaje) { window.removeEventListener('message', _oyeMensaje); _oyeMensaje = null; }
  _cont = null; _ctx = null; _marcoId = '';
  /* Aquí el marco SÍ muere: el router vacía la sección de una conservada podada, y para las
     demás la vacía su próximo montaje. A `desmontar()` se llega cuando se salta a la OTRA
     pantalla de marco —el tope es una—, por un refresco forzado o porque el rol dejó de tener
     esta pantalla; ya no por la navegación de todos los días.

     Cuando pasa no se empieza de cero: el anidador guarda su hoja y sus retazos en el aparato
     (`al3d_anidador_material`, `al3d_anidador_retazos`). */
}
