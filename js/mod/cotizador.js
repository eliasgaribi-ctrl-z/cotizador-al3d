/* ============================================================================
   Cotizador — el apartado, no la app.

   Hasta septiembre de 2026 el cotizador ERA la app y la plataforma era «lo otro»: un `<a>`
   en la barra de arriba que salía de una página y entraba a otra, con su propio arranque,
   su propia barra y su propio encabezado. Cotizar y fabricar son el mismo trabajo en dos
   momentos, y la interfaz decía que eran dos programas.

   Ahora es una pestaña más. Lo que sigue explica por qué es un <iframe> y por qué eso NO es
   una comodidad ni un atajo.

   ----- POR QUÉ NO SE PORTA A MÓDULO ES. NO LO INTENTES. -----

   `cotizador.html` tiene 273 manejadores en línea —189 `onclick`, 39 `oninput`, y el resto
   entre onblur/onchange/onkeydown/onload/onerror/ondrop/ondragover/ontouchstart/onmousedown—
   y CERO asignaciones explícitas a `window.X`. Un manejador en línea se resuelve contra el
   objeto global; en un módulo ES el ámbito superior NO es el global, así que los 273 dejarían
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
   acepta a cambio de que el flujo sea uno, y el marco se destruye al cambiar de pestaña.
   ============================================================================ */

import { $, ico, esc, vacio, toast, ajustarAltoBarra, insetInferior } from '../nucleo/ui.js';

let _cont = null;
let _ctx = null;
let _raf = 0;
let _reloj = null;
let _oyeMensaje = null;

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
  _cont = contenedor;
  _ctx = ctx;

  /* LA GUARDA, y es lo primero que se hace. El oyente de `storage` del router remonta el
     módulo actual cuando llega `al3d_historial` o `al3d_queue`, y eso es correcto para los
     módulos que pintan DOM… y catastrófico para este: `montarDeVerdad` hace
     `cont.innerHTML = ''`, el marco muere y vuelve a cargar 933 KB JUSTO DESPUÉS de que
     alguien apretó Guardar. Y empotrado el evento SÍ llega, porque `storage` dispara en
     todos los documentos del mismo origen menos el que escribió — que es el iframe. */
  if (ctx && ctx.sinRemonte) ctx.sinRemonte(true);

  /* `src` SIN cadena de consulta, y esto es una decisión con evidencia, no estética.
     `esDeLaPlataforma()` no reconoce `cotizador.html`, así que sus peticiones van por la
     estrategia del cotizador, que resuelve el respaldo con `c.match(req)` SIN `ignoreSearch`
     —al contrario que la de la plataforma, que sí lo lleva—. Con `?empotrado=1` la copia
     guardada bajo `./cotizador.html` no casaría, se cachearía una segunda entrada y el
     respaldo sin señal quedaría dependiendo de que el navegador marque la petición del marco
     como navegación. El modo empotrado se detecta DENTRO, con `parent !== window`.

     Y SIN atributo `sandbox`: mataría `window.open`, y por ahí sale el PDF —Blob más
     `URL.createObjectURL` más `window.open`—, WhatsApp y Google Maps. */
  _cont.innerHTML =
    '<div class="pf-marco-caja">' +
      '<iframe class="pf-marco" id="pf-cot-marco" src="cotizador.html" ' +
      'title="Cotizador AL3D — precios, autorización y registro de venta"></iframe>' +
    '</div>';

  const m = $('pf-cot-marco');
  if (!m) return;

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
  const sano = () => {
    try {
      const d = m.contentDocument;
      return !!(d && d.getElementById('pasos'));
    } catch (_) { return false; }
  };
  const vigilar = () => {
    if (!_cont) return;                       // se cambió de pestaña mientras se esperaba
    if (sano()) { _reloj = null; medir(); return; }
    /* 100 intentos de 150 ms = 15 s. Generoso a propósito: son 933 KB, y en un teléfono
       viejo con red mala el primer pintado se ha medido en cientos de milisegundos, no en
       segundos, pero el margen no cuesta nada y la falsa alarma sí. */
    if (++_intentos > 100) { rendirse(); return; }
    _reloj = setTimeout(vigilar, 150);
  };
  _reloj = setTimeout(vigilar, 150);
  /* `load` no decide nada, pero cuando llega es el mejor momento para medir: ya está todo
     colocado. */
  m.addEventListener('load', medir, { once: true });

  medir();
  window.addEventListener('resize', medir);
  /* El teclado del teléfono encoge el visor pero NO la caja del marco: sin este oyente, los
     modales altos del cotizador —que miden con 100dvh— quedan tapados por el teclado. */
  if (window.visualViewport) window.visualViewport.addEventListener('resize', medir);

  _oyeMensaje = ev => alMensaje(ev, m);
  window.addEventListener('message', _oyeMensaje);

  /* Esta pantalla no tiene acción propia: la suya está adentro. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
}

export function desmontar() {
  if (_reloj) { clearTimeout(_reloj); _reloj = null; }
  if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
  window.removeEventListener('resize', medir);
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', medir);
  if (_oyeMensaje) { window.removeEventListener('message', _oyeMensaje); _oyeMensaje = null; }
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  _cont = null; _ctx = null;
  /* El marco se destruye porque el router vacía el contenedor, y ESO ESTÁ BIEN: reparentar un
     iframe recarga su documento de todas formas, y mantenerlo vivo exigiría un contenedor
     paralelo fuera de <main> peleando con la cola de montajes, que existe por un incidente
     concreto. No se pierde nada: el cotizador autoguarda `al3d_q` en cada tecla. */
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
  if (_raf) return;
  _raf = requestAnimationFrame(() => {
    _raf = 0;
    const m = $('pf-cot-marco'); if (!m) return;
    const vv = window.visualViewport;
    const alto = vv ? vv.height : window.innerHeight;
    const arriba = m.getBoundingClientRect().top;
    /* El piso de 360 px es para que un teclado abierto no deje el marco en veinte píxeles
       justo mientras alguien escribe dentro de él. */
    const h = Math.max(360, Math.round(alto - arriba - insetInferior() - 8));
    document.documentElement.style.setProperty('--pf-marco-h', h + 'px');
  });
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
  const d = ev.data;
  if (!d || typeof d !== 'object' || d.al3d !== 'ir' && d.al3d !== 'anidar') return;
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
   Cuando no abre
   ============================================================================ */

function rendirse() {
  if (!_cont) return;
  _cont.innerHTML = vacio('El Cotizador no se pudo abrir aquí',
    'Puede ser que la app se haya actualizado a medias, o que este navegador no deje empotrar la página. El cotizador funciona igual en su propia pestaña, con todo tu historial.',
    '<a class="btn btn-pri" href="cotizador.html">Abrirlo en su propia pestaña</a>');
  toast('El Cotizador no abrió empotrado; se ofrece en su propia pestaña', 'err', 5200);
}
