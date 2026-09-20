/* ============================================================================
   LAS HERRAMIENTAS DEL TALLER — el anidador, y mañana el vectorizador.

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
   ============================================================================ */

import { $, esqueletoMarco, medirMarco } from '../nucleo/ui.js';

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
};

let _cont = null;
let _ctx = null;
let _reloj = null;
let _intentos = 0;
let _marcoId = '';

export async function montar(contenedor, ctx) {
  _cont = contenedor;
  _ctx = ctx;

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
  requestAnimationFrame(() => medirMarco(h.marco));
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

function vigilar() {
  if (!_cont) return;                       // se cambió de pestaña mientras se esperaba
  if (sano()) { _reloj = null; marcoListo(); medirMarco(_marcoId); return; }
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
  _rz = requestAnimationFrame(() => { _rz = 0; medirMarco(_marcoId); });
}

export function desmontar() {
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_rz) { cancelAnimationFrame(_rz); _rz = 0; }
  window.removeEventListener('resize', alRedimensionar);
  document.body.classList.remove('pf-marco-lleno');
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  _cont = null; _ctx = null; _marcoId = '';
  /* El marco se destruye porque el router vacía el contenedor, y está bien: reparentar un
     iframe recarga su documento igual. El anidador guarda su hoja y sus retazos en el aparato
     (`al3d_anidador_material`, `al3d_anidador_retazos`), así que volver no empieza de cero. */
}
