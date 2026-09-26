/* ============================================================================
   Cotizador — el apartado, no la app.

   Hasta septiembre de 2026 el cotizador ERA la app y la plataforma era «lo otro»: un `<a>`
   en la barra de arriba que salía de una página y entraba a otra, con su propio arranque,
   su propia barra y su propio encabezado. Cotizar y fabricar son el mismo trabajo en dos
   momentos, y la interfaz decía que eran dos programas.

   Ahora es una pestaña más. Lo que sigue explica por qué es un <iframe> y por qué eso NO es
   una comodidad ni un atajo.

   ----- POR QUÉ NO SE PORTA A MÓDULO ES. NO LO INTENTES. -----

   `cotizador.html` tiene 161 manejadores en línea —116 `onclick`, 19 `oninput`, y el resto
   repartido entre onchange, los cuatro de arrastrar y soltar, onkeydown, onload y los de
   ratón y dedo— y CERO asignaciones explícitas a `window.X`. Un manejador en línea se
   resuelve contra el objeto global; en un módulo ES el ámbito superior NO es el global, así
   que los 161 dejarían
   de resolver EN SILENCIO: sin error de compilación, sin excepción al cargar, y se
   descubrirían haciendo clic uno por uno sobre 645 KB de JS que no tiene una sola prueba
   unitaria y que guarda `al3d_historial`, el único dato irrecuperable del sistema.

   El archivo depende exactamente de esa semántica, y se puede comprobar desde aquí:
   `typeof w.irAPaso === 'function'` es cierto —una declaración de función sí cuelga de
   `window`— pero `w._pantalla` es `undefined`, porque es un `let` de nivel superior.

   ----- Y POR QUÉ EL <iframe> NO ROMPE LO QUE PARECÍA QUE IBA A ROMPER -----

   `cotizador.html` dejó escrito en su día, con razón, que no se podía empotrar: «este archivo
   tiene declaraciones env(safe-area-inset-*) y dentro de un iframe todas valen 0, así que el
   botón principal quedaría debajo del indicador de inicio del iPhone». Son TREINTA, y la
   objeción sigue siendo verdad. Lo que cambia es dónde se resuelve: NO dentro del documento
   hijo —ahí `env()` ya es 0 y no hay nada que leer— sino en el PADRE, con
   `.pf-marco-caja{padding-bottom:env(safe-area-inset-bottom,0px)}`. Al encoger la caja del
   marco, su visor termina arriba de la franja del gesto, y el `position:fixed` de la barra
   del cotizador queda por encima de ella sola. Cero ediciones de esas treinta declaraciones.

   La segunda objeción —«690 KB duplicados en la memoria de un celular»— se paga: mientras
   esta pestaña está abierta, el documento del cotizador vive junto al de la plataforma. Se
   acepta a cambio de que el flujo sea uno.

   ----- Y EL MARCO YA NO SE DESTRUYE AL CAMBIAR DE PESTAÑA -----

   Aquí decía «y el marco se destruye al cambiar de pestaña». Dejó de ser verdad y dejó de
   ser deseable, en ese orden.

   No era verdad del todo ni entonces: el router solo vacía la sección que va a MONTAR, así
   que al salir de aquí el <iframe> se quedaba en `#mod-cotizador`, escondido y con su
   documento vivo, hasta que alguien volvía — y entonces sí se destruía, para construir otro
   igual. Se pagaba la memoria Y la recarga: 795 KB de guiones reinterpretados por visita,
   medidos aquí dentro con `performance.getEntriesByType('resource')`.

   Ahora esta ruta lleva `conservar: true` en RUTAS y el router la esconde en vez de tirarla.
   Eso parte el ciclo de vida en dos, y este módulo tiene que respetar la diferencia:

     · `desmontar()` es el final. Se suelta todo.
     · `ocultar()` es «deja de verse». Se suelta todo lo que este módulo escribe FUERA de su
       sección —la clase `pf-marco-lleno` del body, los oyentes que miden geometría— y se
       queda lo de dentro del marco. Lo que no se suelta aquí se queda encima de la pantalla
       de otro.
     · `mostrar()` es la vuelta. Repone exactamente lo que `montar()` pone y `ocultar()` quitó.

   Lo que sigue corriendo escondido, dicho en voz alta porque es el coste: el documento del
   cotizador entero —que no tiene bucles propios; sus `requestAnimationFrame` son todos de un
   disparo—, su oyente de 'storage', y el vigilante de arranque de aquí abajo si se salió
   mientras cargaba. Eso último es a propósito: termina de abrir mientras no lo miras.

   El techo de cuántas pantallas así pueden estar vivas a la vez lo pone
   `TOPE_CONSERVADAS` en js/nucleo/conservar.js, que es donde está escrito el cálculo de
   memoria completo.
   ============================================================================ */

import { $, ico, esc, vacio, toast, ajustarAltoBarra, insetInferior, altoBarraAbajo, pliegueDelVisor, esqueletoMarco, alTerminarDeEntrar } from '../nucleo/ui.js';
import * as Prefs from '../datos/prefs.js';
import * as Ingreso from '../nucleo/ingreso.js';
import * as Puente from '../datos/puente.js';

let _cont = null;
let _ctx = null;
let _raf = 0;
let _reloj = null;
let _oyeMensaje = null;
let _consultas = [];     // las matchMedia del pliegue, para soltarlas al desmontar
let _ultimoPliegue = '';  // lo último que se le mandó al marco, para no repetirlo
/* ¿Esta pantalla se está viendo? Montado y visible dejaron de ser lo mismo cuando la ruta
   pasó a conservarse: entre `ocultar()` y `mostrar()` el módulo sigue vivo con el marco
   escondido. Todo lo que lee o escribe geometría se pregunta por esto antes. */
let _visible = false;
/* Para cancelar la medición que espera al final de la animación de entrada, si la pantalla
   se va antes de que termine. Ver `alTerminarDeEntrar` en nucleo/ui.js. */
let _finEntrada = null;

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
  _cont = contenedor;
  _ctx = ctx;
  _visible = true;

  /* LA GUARDA, y es lo primero que se hace. El oyente de `storage` del router remonta el
     módulo actual cuando llega `al3d_historial` o `al3d_queue`, y eso es correcto para los
     módulos que pintan DOM… y catastrófico para este: `montarDeVerdad` hace
     `cont.innerHTML = ''`, el marco muere y vuelve a cargar 933 KB JUSTO DESPUÉS de que
     alguien apretó Guardar. Y empotrado el evento SÍ llega, porque `storage` dispara en
     todos los documentos del mismo origen menos el que escribió — que es el iframe.

     El router la apaga en CADA montaje, así que `mostrar()` tiene que volver a pedirla: una
     pantalla conservada que vuelve no pasa por aquí. */
  if (ctx && ctx.sinRemonte) ctx.sinRemonte(true);

  /* `src` SIN cadena de consulta. Desde septiembre de 2026 cotizador.html va con el conjunto
     versionado de la plataforma (caché primero, `ignoreSearch`), así que una consulta ya no
     rompería el respaldo sin señal; se sigue sin ella porque el modo empotrado se detecta
     DENTRO, con `parent !== window`, y porque la página suelta reenvía a `./#/cotizador`
     salvo con `?solo=1`, que es la salida de emergencia de abajo y lo que usan las pruebas.

     Y SIN atributo `sandbox`: mataría `window.open`, y por ahí sale el PDF —Blob más
     `URL.createObjectURL` más `window.open`—, WhatsApp y Google Maps. */
  /* Con su esqueleto encima. El marco tarda entre 240 y 500 ms en pintar sus datos —medido
     con la red local; en un teléfono con señal mala son segundos— y mientras tanto era un
     rectángulo blanco. `.pf-marco-cargando` deja el iframe en opacidad cero y enseña la
     silueta del cotizador en su lugar; `marcoListo()` la quita con transición cuando el
     documento de dentro terminó de arrancar. */
  _cont.innerHTML =
    '<div class="pf-marco-caja pf-marco-cargando">' +
      esqueletoMarco('cotizador', 'Abriendo el cotizador…') +
      '<iframe class="pf-marco" id="pf-cot-marco" src="cotizador.html" ' +
      'title="Cotizador AL3D — precios, autorización y registro de venta"></iframe>' +
    '</div>';

  const m = $('pf-cot-marco');
  if (!m) return;

  /* Con el marco montado, la página de afuera no reserva hueco debajo: el marco ya termina
     encima de la barra de módulos (lo mide `medir`) y el hueco solo daba scroll a una franja
     vacía. css/plataforma.css lee esta clase. */
  document.body.classList.add('pf-marco-lleno');

  /* ----- Salida de emergencia, y por qué NO se espera el evento `load` -----
     El primer intento gateaba la salud del marco en su `load`. Está mal, y falla justo
     donde más duele: `load` NO dispara hasta que terminan TODAS las subpeticiones del
     documento hijo, y el cotizador pide sus tipografías a fonts.googleapis.com. Con esa
     petición colgada —un firewall, una red mala, un país donde Google no responde— `load`
     tarda más que cualquier techo razonable y la salida de emergencia se dispara sobre un
     marco que está PERFECTO, mandando a la gente a otra pestaña sin motivo.

     Es el mismo modo de falla que este repo ya documentó para el arranque de la plataforma
     («una hoja de estilos pendiente bloquea la ejecución de los scripts… y la plataforma se
     queda en blanco, sin un solo error en la consola»). La lección se aplica aquí: no
     depender de UNA señal, y menos de una que espera a la red.

     Se pregunta por el DOM, que es lo que de verdad importa y que se puede leer porque es el
     mismo origen: si la escalera de pasos del cotizador existe, el cotizador está vivo,
     tenga o no tipografías. */
  let _intentos = 0;
  /* «Sano» es que el documento de dentro tenga el riel de pasos Y haya terminado de arrancar:
     cotizador.html lleva `html.arrancando` desde su primer <script> hasta el final de init(),
     y mientras la tenga puesta lo que hay dentro es su propio esqueleto. Esperar a que se
     vaya es lo que hace que la persona vea UNA pantalla de carga —la de aquí— y no esta y
     luego la de adentro. Si init() reventara, ese mismo documento se quita la clase al primer
     error o a los ocho segundos, así que esto nunca se queda esperando por ella. */
  const sano = () => {
    try {
      const d = m.contentDocument;
      return !!(d && d.getElementById('pasos') && d.documentElement && !d.documentElement.classList.contains('arrancando'));
    } catch (_) { return false; }
  };
  /* El vigilante NO se para al cambiar de pestaña, y eso es a propósito desde que esta ruta
     se conserva: si alguien abre el Cotizador y se va mientras carga, el marco termina de
     abrir escondido y al volver ya está puesto. Se para cuando el módulo se desmonta de
     verdad, que es cuando `_cont` se pone en null. `medir()` se ignora sola si no se está
     viendo, y `mostrar()` mide al volver. */
  const vigilar = () => {
    if (!_cont) return;                       // el módulo se desmontó mientras se esperaba
    if (sano()) { _reloj = null; marcoListo(); medir(); return; }
    /* 100 intentos de 150 ms = 15 s. Generoso a propósito: son 933 KB, y en un teléfono
       viejo con red mala el primer pintado se ha medido en cientos de milisegundos, no en
       segundos, pero el margen no cuesta nada y la falsa alarma sí. */
    if (++_intentos > 100) { rendirse(); return; }
    /* A los cuatro segundos el texto del esqueleto cambia: la persona ya sabe que se oyó el
       toque, y ahora hay que decirle que no es ella. */
    if (_intentos === 27) {
      const t = _cont.querySelector('.pf-marco-esq-t .tx');
      if (t) t.textContent = 'Sigue abriendo el cotizador… tu red va lenta, pero va.';
    }
    _reloj = setTimeout(vigilar, 150);
  };
  _reloj = setTimeout(vigilar, 150);
  /* `load` no decide nada, pero cuando llega es el mejor momento para medir: ya está todo
     colocado. */
  m.addEventListener('load', medir, { once: true });

  medir();
  medirCuandoEntre();
  oirGeometria();

  _oyeMensaje = ev => alMensaje(ev, m);
  window.addEventListener('message', _oyeMensaje);
  /* La ventanilla de identidad vive lo que vive el marco: con el montaje y no con la vista. Una
     pantalla conservada y escondida sigue teniendo su marco, y ese marco sigue esperando el sello
     de lo que pidió a dirección (notario.js). */
  exponerIdentidad();

  ponerBarra();
}

/* ----- Los oyentes que MIDEN -----
   Van y vienen con la VISIBILIDAD, no con el montaje, y eso es lo que separa `ocultar()` de
   `desmontar()`. Una pantalla conservada sigue montada mientras está escondida, y estos tres
   oyentes leen geometría: un `scroll` en la Mesa de corte despertaría a este módulo para que
   midiera una caja que no se está viendo. Lo que sí sigue puesto mientras tanto es el
   vigilante del arranque del marco y el oyente de `message`, que son de la vida del módulo. */
function oirGeometria() {
  window.addEventListener('resize', medir);
  /* El teclado del teléfono encoge el visor pero NO la caja del marco: sin este oyente, los
     modales altos del cotizador —que miden con 100dvh— quedan tapados por el teclado. */
  if (window.visualViewport) window.visualViewport.addEventListener('resize', medir);
  /* El Fold a medio doblar: la bisagra se mueve respecto del marco cuando la página de afuera
     se desplaza, y aparece o desaparece cuando cambia la postura sin que cambie el tamaño del
     visor —así que `resize` no basta—. */
  window.addEventListener('scroll', medir, { passive: true });
  _consultas = ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)', '(device-posture: folded)']
    .map(q => { try { const mq = matchMedia(q); mq.addEventListener('change', medir); return mq; } catch (_) { return null; } })
    .filter(Boolean);
}

function callarGeometria() {
  window.removeEventListener('resize', medir);
  window.removeEventListener('scroll', medir);
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', medir);
  for (const mq of _consultas) { try { mq.removeEventListener('change', medir); } catch (_) {} }
  _consultas = [];
}

/* Esta pantalla no tiene acción propia: la suya está adentro. La pone `montar()` y la repone
   `mostrar()`: el módulo que se va limpia la barra en SU `desmontar()`, así que quien llega
   tiene que dejarla como le toca, llegue montándose o volviendo. */
function ponerBarra() {
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
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

/* ============================================================================
   Esconderse y volver — el ciclo de vida de una ruta `conservar`
   ============================================================================ */

/* Deja de verse, pero sigue montada. La regla, y es la que hay que respetar si algún día se
   conserva otra pantalla: se suelta TODO lo que este módulo escribe fuera de su propia
   sección, porque eso se queda encima de la pantalla de otro. Lo que se queda es el
   <iframe> con su documento, que es el punto entero de conservar. */
export function ocultar() {
  _visible = false;
  if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
  if (_finEntrada) { _finEntrada(); _finEntrada = null; }
  callarGeometria();
  /* La clase del body decide el relleno de la página ENTERA y esconde el botón del
     asistente (css/plataforma.css). Dejarla puesta encima del Tablero le corta el aire de
     abajo y le desaparece un botón que sí tiene. */
  document.body.classList.remove('pf-marco-lleno');
  /* Y la guarda del remonte se suelta: escondido, este módulo ya no tiene por qué impedir
     que el router repinte la pantalla que SÍ se está viendo cuando llega un 'storage'. El
     router la apaga igual en cada montaje; soltarla aquí es lo que hace que el estado no
     dependa de en qué orden pasen las dos cosas. */
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  /* La firma del pliegue se borra: escondido pudo cambiar la postura del aparato sin que
     nadie midiera, y al volver una firma vieja diría que no hay nada que avisarle al marco. */
  _ultimoPliegue = '';
}

/* Vuelve a verse. Repone exactamente lo que `montar()` pone y `ocultar()` quitó. */
export async function mostrar() {
  if (!_cont || !_ctx) return;
  /* Si el marco ya no está, esta sección no sirve para reutilizar: `rendirse()` la cambió por
     su tarjeta de «no se pudo abrir». Sin esto la tarjeta se quedaría para siempre, porque el
     router ya no vuelve a montar una pantalla conservada. Se rehace desde cero, que es
     exactamente lo que pasaba antes de conservar nada. */
  if (!_cont.querySelector('#pf-cot-marco')) {
    const cont = _cont, ctx = _ctx;
    desmontar();
    return montar(cont, ctx);
  }
  _visible = true;
  /* La guarda del remonte, otra vez. El router la apaga en CADA montaje —éste incluido— así
     que una pantalla que vuelve tiene que volver a pedirla o el primer 'storage' que llegue
     le tira el marco, que es justo lo que esa guarda existe para evitar. */
  if (_ctx.sinRemonte) _ctx.sinRemonte(true);
  document.body.classList.add('pf-marco-lleno');
  ponerBarra();
  oirGeometria();
  medir();
  medirCuandoEntre();
}

export function desmontar() {
  /* El final incluye el «deja de verse»: los oyentes de geometría, la clase del body y la
     guarda del remonte se sueltan en un solo sitio, para que no haya dos listas que se
     separen. */
  ocultar();
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_oyeMensaje) { window.removeEventListener('message', _oyeMensaje); _oyeMensaje = null; }
  try { delete window.AL3D; } catch (_) { window.AL3D = undefined; }
  _cont = null; _ctx = null;
  /* Aquí el marco SÍ muere: el router vacía la sección de una conservada podada, y para las
     demás la vacía su próximo montaje. A `desmontar()` se llega por tres caminos —el tope de
     conservadas, un refresco forzado (`ctx.refrescar()`, el cambio de rol, la sincronización
     callada) y el rol que deja de tener esta pantalla— y ninguno es la navegación de todos
     los días, que ahora pasa por `ocultar()`.

     No se pierde nada cuando pasa: el cotizador autoguarda `al3d_q` en cada tecla. */
}

/* ============================================================================
   Quién eres, prestado al marco
   ============================================================================ */

/* El cotizador autoriza precios, y desde septiembre de 2026 el precio se sella en la hoja con
   la cuenta de Google de dirección (js/cotizador/notario.js). Esa cuenta vive AQUÍ: el token
   de Google está en la memoria de esta página (js/nucleo/ingreso.js) y el pase que dice qué
   rol tienes lo dejó la puerta. El marco es del mismo origen, así que en vez de inventar un
   protocolo de mensajes se le presta una ventanilla con tres cosas, y solo mientras el marco
   exista:

     · identidad()   — {correo, rol} del pase vigente. Sirve para pintar, NO para decidir: el
                       que decide es la hoja, que verifica el token en cada petición.
     · sesion()      — que haya un token de Google vivo, pidiéndolo si caducó. Abre la
                       ventana de Google, así que el marco la llama dentro de un toque.
     · hablar(r,c,t) — una pregunta a la hoja con las dos puertas (datos/puente.js#hablar).

   No se presta el token. El marco no lo necesita —lo pone `hablar` al salir— y un token que no
   sale de esta página no lo puede copiar nada de lo que corra dentro del marco. */
function exponerIdentidad() {
  window.AL3D = Object.freeze({
    identidad() {
      const p = Prefs.pase();
      return p ? { correo: p.correo, rol: p.rol } : null;
    },
    async sesion() {
      if (Ingreso.dentro()) return { ok: true, correo: Ingreso.correo() };
      const r = await Ingreso.entrar(false);
      return r.ok ? { ok: true, correo: Ingreso.correo() }
                  : { ok: false, codigo: r.codigo, mensaje: r.mensaje };
    },
    hablar(ruta, cuerpo, espera) { return Puente.hablar(ruta, cuerpo, espera); },
  });
}

/* ============================================================================
   El alto, que lo mide el padre
   ============================================================================ */

/* Un iframe no tiene alto propio: sin `height` se queda en los 150 px de la especificación.
   Y el alto lo mide el PADRE porque dentro del marco `100dvh` y `visualViewport` describen el
   iframe, no el visor de verdad.

   Con acelerador de `requestAnimationFrame`, siempre: `resize` dispara decenas de veces al
   girar el teléfono o al abrir el teclado, y esto lee geometría. Leer y escribir el layout en
   cada evento es el camino corto al tirón. */
function medir() {
  /* Escondida no se mide, y no es un ahorro: `--pf-marco-h` es UNA variable de :root que
     comparten los tres marcos, y el rectángulo de un <iframe> en `display:none` es todo
     ceros. Medir desde aquí estando escondido le escribiría a la Mesa de corte —que sí está
     en pantalla— un alto sacado de una caja que no existe. */
  if (!_visible) return;
  if (_raf) return;
  _raf = requestAnimationFrame(() => {
    _raf = 0;
    /* Y otra vez dentro del cuadro: entre pedirlo y que llegue se pudo cambiar de pantalla. */
    if (!_visible) return;
    const m = $('pf-cot-marco'); if (!m) return;
    const vv = window.visualViewport;
    const alto = vv ? vv.height : window.innerHeight;
    const caja = m.getBoundingClientRect();
    const arriba = caja.top;
    /* El marco termina donde EMPIEZA la barra de módulos del teléfono, no donde termina el
       visor. Medido en el Fold cerrado emulado antes de esto: el marco llegaba hasta el borde
       de abajo, y la barra fija del cotizador —el total y «Continuar a partidas» / «Autorizar»—
       quedaba 58 de sus 64 px debajo de la barra de módulos de la plataforma. Solo aparecía
       si se desplazaba la página de afuera hasta el fondo, cosa que nadie sabe que hay que
       hacer. La barra de módulos ya lleva dentro el área segura; donde no hay barra —la
       pantalla grande— se resta el área segura a secas, como antes.

       El piso de 360 px es para que un teclado abierto no deje el marco en veinte píxeles
       justo mientras alguien escribe dentro de él. */
    const abajo = altoBarraAbajo();
    const h = Math.max(360, Math.round(alto - arriba - (abajo || (insetInferior() + 8))));
    document.documentElement.style.setProperty('--pf-marco-h', h + 'px');
    avisarPliegue(m, caja);
  });
}

/* ----- El Fold a medio doblar, visto desde el marco -----
   Dentro de un <iframe> los segmentos del visor describen el iframe, no la pantalla, así que
   la bisagra la mide el padre y se la manda al cotizador ya en SUS coordenadas: restada la
   posición del marco. El cotizador la publica en <html> (ajustarPliegue, nucleo.js) y el CSS
   acomoda el escalador y el vectorizador para que la bisagra no parta la foto. Se manda solo
   cuando cambia: `medir` corre en cada scroll. */
function avisarPliegue(m, caja) {
  let p = null;
  try {
    const v = pliegueDelVisor();
    if (v) {
      const off = v.tipo === 'v' ? caja.left : caja.top;
      p = { tipo: v.tipo, a: Math.round(v.a - off), b: Math.round(v.b - off) };
    }
  } catch (_) { p = null; }
  const firma = JSON.stringify(p);
  if (firma === _ultimoPliegue) return;
  _ultimoPliegue = firma;
  try { if (m.contentWindow) m.contentWindow.postMessage({ al3d: 'pliegue', pliegue: p }, location.origin); } catch (_) {}
}

/* ============================================================================
   La vuelta a la plataforma
   ============================================================================ */

/* El cotizador tiene tres puntos que navegan a la plataforma. Dentro del marco, un
   `location.href` navegaría EL MARCO y acabaría con la plataforma anidada dentro de sí misma.
   Así que manda un mensaje y el padre navega de verdad.

   Se valida el origen Y la fuente: `message` lo puede disparar cualquier ventana que tenga
   una referencia a esta. Sin las dos comprobaciones, cualquier página abierta con
   `window.open` desde aquí podría mover la navegación de la app. */
function alMensaje(ev, m) {
  if (ev.origin !== location.origin) return;
  if (!m || ev.source !== m.contentWindow) return;
  /* Y que esta pantalla se esté viendo. Un marco conservado sigue vivo mientras se mira otra
     cosa: una pantalla que nadie tiene delante no puede mover la navegación de la app, y la
     bisagra que se le mande ahora estaría medida sobre una caja invisible. Nada se pierde por
     ignorarlo —`mostrar()` vuelve a medir y a avisar del pliegue al volver. */
  if (!_visible) return;
  const d = ev.data;
  if (!d || typeof d !== 'object') return;
  /* El cotizador acaba de arrancar y pide la bisagra: se le contesta con una medición nueva. */
  if (d.al3d === 'pliegue?') { _ultimoPliegue = ''; medir(); return; }
  if (d.al3d !== 'ir' && d.al3d !== 'anidar') return;
  if (!_ctx) return;
  if (d.al3d === 'anidar') {
    /* «Acomodar en hoja» desde el vectorizador. El trazo ya quedó en `al3d_anidar`, que es el
       canal que lleva funcionando entre las dos apps: no se inventa protocolo nuevo. Lo único
       que cambia es que ya no abre una pestaña del navegador. */
    if (_ctx.pasar) _ctx.pasar('hoy', { vista: 'anidador' });
    else _ctx.ir('hoy');
    return;
  }
  const ruta = String(d.ruta || '').replace(/^#?\/?/, '').trim();
  if (ruta) _ctx.ir(ruta);
}

/* ============================================================================
   Cuando ya abrió, y cuando no abre
   ============================================================================ */

/* El marco ya está vivo: el esqueleto se va con transición (css/plataforma.css) y se saca del
   árbol al terminar, para que no quede un dibujo inerte debajo de un iframe que ya responde. */
function marcoListo() {
  const caja = _cont && _cont.querySelector('.pf-marco-caja');
  if (!caja) return;
  caja.classList.remove('pf-marco-cargando');
  caja.classList.add('pf-marco-listo');
  setTimeout(() => { for (const e of caja.querySelectorAll('.pf-marco-esq,.pf-marco-esq-t')) e.remove(); }, 450);
}

function rendirse() {
  if (!_cont) return;
  _cont.innerHTML = vacio('El Cotizador no se pudo abrir aquí',
    'Puede ser que la app se haya actualizado a medias, o que este navegador no deje empotrar la página. El cotizador funciona igual en su propia pestaña, con todo tu historial.',
    '<a class="btn btn-pri" href="cotizador.html?solo=1">Abrirlo en su propia pestaña</a>');
  toast('El Cotizador no abrió empotrado; se ofrece en su propia pestaña', 'err', 5200);
}
