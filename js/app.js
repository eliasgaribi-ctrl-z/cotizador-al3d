/* ============================================================================
   Arranque y router de la plataforma.

   Un solo documento con rutas por hash, no seis HTML. Cuatro razones, y ninguna es de
   gusto: navegar entre módulos sin señal no toca la red; el service worker cachea un solo
   documento de navegación en vez de seis; el registro de capas —Escape, cerco de
   tabulador, botón atrás— vive en un lugar; y GitHub Pages no necesita el truco del
   404.html para que una ruta profunda no dé 404.

   Este archivo no sabe de proyectos, de material ni de fechas. Sabe de arrancar, de qué
   módulo toca y de decir en voz alta cuando algo del dispositivo no está bien.
   ============================================================================ */

import * as DB from './datos/db.js';
import * as Prefs from './datos/prefs.js';
import * as Cot from './datos/cotizador.js';
import * as Sync from './datos/sync.js';
import { $, ico, esc, toast, voz, vigilarCapas, registrarCapa, hayCapaAbierta, cerrarCapa, ajustarAltoBarra, esqueletoModulo }
  from './nucleo/ui.js';
import { planDeMontaje, TOPE_CONSERVADAS } from './nucleo/conservar.js';

/* ----- Los módulos -----
   `rutas` es la única lista: de aquí sale la barra, el router y qué ve cada rol. Añadir un
   módulo es añadir un renglón.

   `roles` no es seguridad —en fase 1 no hay servidor y cualquiera cambia su rol— es modo de
   trabajo: que fabricación no tenga enfrente la pantalla de cobranza y que pagos no mueva
   el almacén sin querer. Y el mapa no le aparece a pagos porque un módulo que un rol no
   necesita no debe estar en su barra: cada pestaña de más es una decisión de más cada vez
   que se abre la app. */
/* El TABLERO va PRIMERO porque es la pantalla que abre: `rutaDelHash()` cae en la primera
   ruta del rol cuando el hash no dice nada, así que el orden de esta lista ES el default, y
   `cambiarRol()` reenvía al mismo sitio.

   La ruta se sigue llamando «hoy» aunque la pestaña diga «Tablero» y el archivo tablero.js.
   No es descuido: `./#/hoy` es la única dirección de la plataforma grabada en cosas que no
   controlamos —el start_url y el atajo del manifiesto YA INSTALADO, el icono de la pantalla
   de inicio del iPhone (que guarda la URL con la que se agregó, no la que diga el manifiesto
   de hoy; ver plataforma.html), cotizador.html y anidador-vectores/index.html—. Renombrarla
   no daría error: abriría otra pantalla, en silencio, y la barra de direcciones seguiría
   diciendo lo que ya no es. Es la misma decisión que ya se tomó con «agenda»/«Calendario».

   La lista de avisos —lo que antes era «Hoy»— sigue existiendo entera como ruta `atender`,
   con el mismo módulo inicio.js. Es un nombre de ruta NUEVO, así que ninguna URL publicada
   depende de él, y va oculta: se entra por la puerta que el Tablero pone al pie.

   `padre` es para las ocultas: `pintarNav()` prende la pestaña de la madre, así que estar en
   «Qué atender» deja «Tablero» encendido en vez de dejar la tira entera apagada.

   `roles` no es seguridad —en fase 1 no hay servidor y cualquiera cambia su rol— es modo de
   trabajo: que fabricación no tenga enfrente la pantalla de cobranza y que pagos no mueva el
   almacén sin querer. El mapa sigue sin aparecerle a pagos. */
/* `sub` es la línea que va al lado del título en el encabezado de escritorio: qué se ve en
   esta pantalla, en cinco palabras. No es decoración —el encabezado antes decía «Obra,
   material y agenda» en las seis— y en el teléfono no se pinta, que es donde no cabe.

   `movil` marca las cinco que entran en la barra de abajo. Material se queda fuera: con seis
   botones en una pantalla de 360 px cada uno mide 60 y el nombre no cabe debajo del icono.
   Se llega a Material desde el Tablero, que es de donde se sale a comprar. */
const RUTAS = [
  { ruta: 'hoy',       mod: 'tablero',     seccion: 'mod-tablero',     icono: 'i-taller',    nombre: 'Tablero',     sub: 'qué hay en el taller y qué se atrasa', movil: true, roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'agenda',    mod: 'fabricacion', seccion: 'mod-fabricacion', icono: 'i-agenda',    nombre: 'Calendario',  sub: 'taller e instalaciones',               movil: true, roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'proyectos', mod: 'proyectos',   seccion: 'mod-proyectos',   icono: 'i-proyectos', nombre: 'Proyectos',   sub: 'por etapa de obra',                    movil: true, roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'material',  mod: 'material',    seccion: 'mod-material',    icono: 'i-material',  nombre: 'Material',    sub: 'lista de compra y almacén',                         roles: ['direccion', 'fabricacion'] },
  /* `conservar` — ver js/nucleo/conservar.js. Esta pantalla NO es DOM que se repinta: es un
     documento entero dentro de un <iframe>. Vaciarle la sección al salir y volver a escribir
     el marco al entrar costaba 795 KB de guiones reinterpretados por visita. Con la marca, el
     router la esconde en vez de tirarla y al volver solo la enseña. */
  { ruta: 'cotizador', mod: 'cotizador',   seccion: 'mod-cotizador',   icono: 'i-venta',     nombre: 'Cotizador',   sub: 'capturar y autorizar una cotización',  movil: true, roles: ['direccion', 'fabricacion', 'pagos'], conservar: true },
  { ruta: 'mapa',      mod: 'mapa',        seccion: 'mod-mapa',        icono: 'i-mapa',      nombre: 'Mapa',        sub: 'obras por instalar e instaladas',      movil: true, roles: ['direccion', 'fabricacion'] },
  /* La mesa de corte. Vivía como pestaña del Tablero —«Carga del taller» / «Mesa de corte»— y
     ahí no la encontraba nadie: es una herramienta de uso diario del taller escondida detrás
     de un segmento de otra pantalla. Sale a la barra, y con los dos roles que la usan. La
     pestaña del Tablero sigue existiendo porque es a donde llegan con un pase
     (`ctx.pasar('hoy', {vista:'anidador'})`) el «Acomodar en hoja» del vectorizador del
     Cotizador empotrado (js/mod/cotizador.js) y el «Acomodar en la lámina» del Calendario,
     que trae el proyecto puesto. NO es por `#/hoy/anidador`: eso no es una ruta
     —`rutaDelHash()` exige un solo segmento, lo reescribe a `#/hoy` y abre la carga— y nada
     apunta ahí. */
  { ruta: 'anidador',  mod: 'herramientas', seccion: 'mod-anidador',   icono: 'i-anidar',    nombre: 'Mesa de corte', sub: 'acomodar las piezas en la lámina',                roles: ['direccion', 'fabricacion'], conservar: true },
  /* El vectorizador, por la misma razón: convertir un logotipo en trazo de corte se hace con
     el archivo en la mano, y estaba detrás del botón «Vectorizar» de una partida. Para usarlo
     había que abrir una cotización que nadie iba a mandar. El botón del cotizador se queda
     donde está: son dos puertas al mismo documento, no dos implementaciones. */
  { ruta: 'vectorizar', mod: 'herramientas', seccion: 'mod-vectorizar', icono: 'i-vector',   nombre: 'Vectorizador',  sub: 'del logotipo al trazo de corte',                  roles: ['direccion', 'fabricacion'], conservar: true },
  /* La pantalla del dinero: ventas por mes, cartera y bitácora. Fabricación no la tiene —es
     el rol que no ve importes— y en el teléfono no entra a la barra de abajo por lo mismo que
     Material: se llega desde el Tablero. */
  { ruta: 'control',   mod: 'control',     seccion: 'mod-control',     icono: 'i-control',   nombre: 'Control',     sub: 'ventas, cobranza y bitácora',                       roles: ['direccion', 'pagos'] },
  { ruta: 'atender',   mod: 'inicio',      seccion: 'mod-atender',     icono: 'i-aviso',     nombre: 'Qué atender', sub: 'avisos ordenados por lo que truena antes',                  roles: ['direccion', 'fabricacion', 'pagos'], oculto: true, padre: 'hoy' },
  { ruta: 'ajustes',   mod: 'ajustes',     seccion: 'mod-ajustes',     icono: 'i-ajustes',   nombre: 'Ajustes',     sub: 'este dispositivo, respaldo y relevo',  roles: ['direccion', 'fabricacion', 'pagos'], oculto: true },
];

const rutasDeRol = () => RUTAS.filter(r => r.roles.includes(Prefs.rol()));
const rutaPorNombre = n => RUTAS.find(r => r.ruta === n) || null;

/* El contexto que reciben los módulos. Es explícito a propósito: un módulo que necesite
   algo que no esté aquí no lo saca de una variable global, se añade a esta lista y se ve
   en el diff quién empezó a depender de qué. */
const ctx = {
  ir,                       // navegar a otro módulo
  /* Si el rol de ahora tiene esa ruta. Para no pintar un botón a una pantalla que el rol no
     tiene: el router lo rebota al Tablero y el toque deja una entrada de historial de más, así
     que el atrás siguiente tampoco hace nada. Lo preguntan el Tablero («Ver la ruta en el
     mapa», que pagos no tiene) y el asistente («Ver la lista de compra»). Sale de RUTAS, que
     es la única lista. */
  tieneRuta: ruta => { const r = rutaPorNombre(ruta); return !!r && r.roles.includes(Prefs.rol()); },
  refrescar: () => montar(_actual, { forzar: true }),
  cuentas: pintarCuentasNav, // un módulo puede pedir que se repinten las cuentas de la barra
  banda: pintarBanda,
  /* Navegar DEJÁNDOLE algo al de allá. `recibir()` devuelve el dato una sola vez y solo si
     el pase era para la ruta que está montando: un pase que quedó suelto porque alguien se
     fue a otro lado no puede aparecer tres pantallas después. */
  pasar: (ruta, dato) => { _pase = { ruta, dato }; ir(ruta); },
  recibir: () => { const p = (_pase && _pase.ruta === _actual) ? _pase.dato : null; _pase = null; return p; },
  sinRemonte: v => { _sinRemonte = !!v; },
  /* Las acciones contextuales del encabezado: hoy las teclas del calendario y el «Bajar CSV»
     de Control, que son los dos módulos que llaman aquí. Se pasa marcado ya escapado y se
     recibe el nodo para colgarle los oyentes. El router las vacía en cada montaje, así que un
     módulo que no llame a esto deja el encabezado limpio sin tener que acordarse. En el
     teléfono el hueco está en `display:none` —no cabe al lado del título— así que lo que se
     ponga aquí tiene que existir también dentro de la pantalla.

     OJO con los oyentes: vaciar el innerHTML no suelta lo que cuelga de ESTE nodo, que es
     compartido y sobrevive a los montajes. Quien enganche aquí tiene que desenganchar en su
     `desmontar()` —lo hace Control— o su manejador se queda escuchando encima del encabezado
     de las demás pantallas. */
  acciones: html => {
    const el = $('pf-cab-acc');
    if (!el) return null;
    el.innerHTML = html || '';
    return el;
  },
};

let _actual = null;      // nombre de ruta

/* ----- Lo que está montado -----
   Era `_vivo`, una sola ranura: el módulo en pantalla, para desmontarlo al salir. Dejó de
   bastar cuando las tres pantallas de marco —Cotizador, Mesa de corte y Vectorizador—
   pasaron a sobrevivir al cambio de pantalla: puede haber una montada y oculta MIENTRAS otra
   cosa está en pantalla, y las dos necesitan que alguien las desmonte algún día.

   El orden del Map importa y es parte del contrato de `planDeMontaje`: de la más vieja a la
   más reciente. Por eso al montar o al volver a enseñar una ruta se borra y se vuelve a
   poner, que en un Map es moverla al final. Lo que se poda es lo primero de la fila.

   `_vivas.get(_actual)` es el antiguo `_vivo`. */
const _vivas = new Map();

/* ----- El buzón de un solo uso -----
   Lo que un módulo le deja al siguiente: «abre la ficha de ESTE proyecto», «abre la hoja de
   agendar con ESTE ya elegido». Va en memoria y NO por el hash, y eso es una decisión con
   evidencia: `rutaDelHash()` corta en '?' y `rutaPorNombre()` exige igualdad exacta de un
   solo segmento, así que `#/proyectos?id=x` no casa con nada, cae al default Y ADEMÁS deja
   la barra de direcciones mintiendo, porque `montarDeVerdad` nunca reescribe location.hash.
   Es el mismo idioma que `al3d_anidar`, que ya funciona entre el cotizador y el anidador:
   se escribe, se lee UNA vez y se borra.

   Es lo que quita los saltos: sin esto, «Abrir» te deja en una lista donde hay que volver a
   buscar lo que ya estabas mirando. */
let _pase = null;

/* ----- Quién entró -----
   Lo que contestó la puerta al arrancar: `{via, correo, rol, nota}`. Lo lee `revisarDispositivo`,
   que es quien enseña la `nota` en la banda de arriba, y la retrollamada de la puerta, que la
   borra si la comprobación que iba por detrás acaba confirmando el acceso.

   No se exporta. Quien quiera saber con qué correo se entró tiene `Ingreso.correo()`, que es
   de donde sale de verdad; una segunda forma de preguntar lo mismo solo sirve para que un día
   las dos contesten cosas distintas. */
let _quien = null;
/* Si ya se puede pintar la banda. Ver la retrollamada de `Puerta.custodiar()`. */
let _bandaLista = false;

/* ----- La guarda del remonte -----
   Un módulo que sostiene un <iframe> vivo pide que no se le remonte por debajo. El oyente de
   'storage' remonta el módulo actual cuando el cotizador guarda, y eso es correcto para los
   módulos que pintan DOM… y catastrófico para uno que pinta un marco: `montarDeVerdad` hace
   `cont.innerHTML = ''`, el iframe muere y vuelve a cargar 933 KB justo después de que
   alguien apretó Guardar. Y con el cotizador empotrado el evento SÍ llega, porque 'storage'
   dispara en todos los documentos del mismo origen menos el que escribió.

   Se apaga en cada montaje, así que no puede quedarse pegada. */
let _sinRemonte = false;

/* ============================================================================
   Router
   ============================================================================ */

function rutaDelHash() {
  const h = String(location.hash || '').replace(/^#\/?/, '').split('?')[0].trim();
  const r = rutaPorNombre(h);
  if (r && r.roles.includes(Prefs.rol())) return r.ruta;
  /* Una ruta que este rol no tiene no es un error del usuario: es un enlace viejo o un rol
     que cambió. Se va a la primera que sí tenga, sin regañar. */
  const destino = (rutasDeRol()[0] || RUTAS[0]).ruta;
  /* Y la barra de direcciones dice a dónde se fue. Sin esto quedaba pintado el Tablero con
     `#/control` escrito arriba: recargar repetía la contradicción, compartir el enlace la
     propagaba y el botón atrás tenía dos entradas para la misma pantalla. `replaceState` y no
     `location.hash`, que dispararía otro `hashchange` y montaría dos veces. */
  if (h && h !== destino) { try { history.replaceState(null, '', '#/' + destino); } catch (_) {} }
  return destino;
}

export function ir(ruta) {
  const r = rutaPorNombre(ruta);
  if (!r) return;
  if (location.hash === '#/' + r.ruta) { montar(r.ruta, { forzar: true }); return; }
  location.hash = '#/' + r.ruta;
}

/* ----- Los montajes van en fila -----
   `montar` es async y ninguno de sus llamadores la esperaba: ni el clic de la barra, ni el
   `hashchange`, ni el botón de ajustes. Dos toques seguidos —que en una barra que se
   desliza es lo normal— se solapaban, porque la única guarda que hay arriba deduplica la
   MISMA ruta y no dos rutas distintas.

   Lo que se rompe no son oyentes duplicados: los cuatro manejadores de cada módulo son
   funciones de nivel de módulo, así que `addEventListener` con la misma referencia es un
   no-op y no se acumulan. Lo que se rompe es el registro de lo que está montado. Cuando era
   una sola ranura —`_vivo`— el prefijo síncrono de `montar` la ponía en null antes del
   primer `await`, así que el segundo toque entraba y NO desmontaba a nadie; después ganaba
   la asignación del montaje que acabara último, y quedaba la ranura apuntando a un módulo
   que no está en pantalla y el otro montado para siempre sin nadie que lo desmonte.

   Hoy el registro es `_vivas`, que guarda una entrada por ruta, así que el segundo montaje ya
   no puede pisar la anotación del primero. La fila sigue haciendo falta igual: dos montajes
   solapados sobre la MISMA ruta harían dos `cont.innerHTML = ''` y dos `mod.montar` sobre el
   mismo contenedor, y el que acabara antes dejaría su mitad debajo de la del otro.

   Y eso tiene una cara concreta: `agenda.desmontar()` es lo único que limpia `#pf-mbar`, y
   su propio comentario dice para qué —«el botón de agendar se quedaría flotando encima de
   su pantalla y el primer dedo del día lo apretaría creyendo que es de lo que está
   viendo»—. Con Material de huérfano el botón que se queda pegado es «Recibí lo de la
   lista», que escribe en el libro del almacén. Con Mapa, no corre `destruirMapa()` y queda
   un Leaflet vivo con sus oyentes.

   La fila lo cierra: mientras uno monta, el siguiente espera. Y si mientras esperaba turno
   se pidió otra pantalla, el suyo ya no sirve y se descarta —salvo un refresco forzado, que
   siempre pasa. */
let _cola = Promise.resolve();
let _pedida = null;

/* ============================================================================
   Lo que se ve mientras carga
   ============================================================================
   Tres piezas, y las tres nacen de una medición, no de un gusto:

   · LA BARRA DE PROGRESO (#pf-progreso): tres píxeles arriba que corren mientras un módulo
     carga y se llenan al pintar. El CSS la enciende con 150 ms de retardo, así que en las
     transiciones normales —56 a 87 ms medidos— no llega a verse; en una lenta es lo primero
     que dice «te oí».
   · EL ESQUELETO del módulo: la silueta de lo que viene, en el hueco donde va a aparecer. Se
     inserta al instante pero el CSS lo enseña a los 180 ms —el mismo umbral que ya tenía el
     Tablero para el suyo, y por lo mismo: un esqueleto que parpadea 60 ms se ve peor que la
     espera—. Se quita en cuanto la sección tiene algo pintado, lo vigile quien lo vigile: un
     MutationObserver sobre la sección, para que un módulo que pinta por partes (Material
     escribe su cabecera antes de leer la base) no salga debajo de un esqueleto.
   · EL AVISO DE QUE TARDA: a los seis segundos con el esqueleto todavía puesto, el texto
     cambia a «tarda más de lo normal» y ofrece recargar. Es el caso real de una app
     actualizada a medias, que ya se atiende cuando el import FALLA; aquí se atiende cuando
     el import no falla ni llega, que es peor porque no hay error que enseñar.

   El esqueleto del ARRANQUE es marcado fijo de index.html (#pf-arranque), para que exista
   desde el primer pintado, antes de que corra este archivo; aquí solo se le escribe la fase
   en que va y se quita cuando el primer módulo pintó. */
const MS_LENTO = 6000;
const MS_LENTO_ARRANQUE = 8000;
let _lentoArranque = 0;

const Progreso = {
  _t: 0,
  _desde: 0,
  iniciar() {
    const e = $('pf-progreso'); if (!e) return;
    clearTimeout(this._t);
    this._desde = performance.now();
    e.classList.remove('fin'); e.classList.add('on');
  },
  terminar() {
    const e = $('pf-progreso'); if (!e || !e.classList.contains('on')) return;
    e.classList.remove('on');
    /* Si terminó antes de que el CSS la encendiera (150 ms), no hay nada que rematar: pintar
       el relleno completo sería enseñar una barra que nadie vio empezar. */
    if (performance.now() - this._desde < 150) return;
    e.classList.add('fin');
    this._t = setTimeout(() => e.classList.remove('fin'), 600);
  },
};

function faseArranque(texto) {
  const t = $('pf-arranque-tx');
  if (t) t.textContent = texto;
}

function quitarArranque() {
  const a = $('pf-arranque');
  if (a) a.remove();
  if (_lentoArranque) { clearTimeout(_lentoArranque); _lentoArranque = 0; }
}

/* El aviso de que tarda, escrito en el pie del esqueleto que siga puesto. `role=alert` porque
   a estas alturas sí hay que interrumpir: la persona lleva seis segundos mirando un dibujo. */
function avisarLento(caja, r) {
  const t = caja && caja.querySelector('.pf-esqueleto-t');
  if (!t) return;
  t.innerHTML = ico('i-aviso') + ' <span>' + (r ? '«' + esc(r.nombre) + '»' : 'La plataforma') +
    ' tarda más de lo normal. Si no aparece, recargar suele arreglarlo.</span>' +
    '<button type="button" class="btn btn-gho" data-recargar>Recargar</button>';
  t.setAttribute('role', 'alert');
  const b = t.querySelector('[data-recargar]');
  if (b) b.onclick = () => location.reload();
}

/* Pone el esqueleto de una ruta delante de su sección —fuera de ella, para que el módulo
   reciba el contenedor vacío que espera— y devuelve la función que lo quita. Se quita solo
   en cuanto la sección tiene un hijo, o cuando el montaje termina, lo que pase primero. */
function ponerEsqueleto(cont, r) {
  const main = $('pf-contenido');
  if (!main) return () => {};
  for (const viejo of main.querySelectorAll('.pf-esqueleto')) viejo.remove();
  cont.insertAdjacentHTML('beforebegin', esqueletoModulo(r.mod, r.nombre));
  const esq = cont.previousElementSibling;
  const lento = setTimeout(() => avisarLento(esq, r), MS_LENTO);
  let obs = null;
  const quitar = () => {
    clearTimeout(lento);
    if (obs) { obs.disconnect(); obs = null; }
    if (esq && esq.parentNode) esq.remove();
  };
  try {
    obs = new MutationObserver(() => { if (cont.childNodes.length) quitar(); });
    obs.observe(cont, { childList: true });
  } catch (_) {}
  return quitar;
}

function montar(ruta, opts = {}) {
  _pedida = ruta;
  _cola = _cola
    .then(() => (_pedida !== ruta && !opts.forzar) ? undefined : montarDeVerdad(ruta, opts))
    .catch(e => { console.error('montar falló', e); });
  return _cola;
}

/* Dónde se había quedado cada pestaña. El router desmonta y vuelve a montar entera la que se
   abandona, así que nada del DOM sobrevive —ni el scroll—: volver a Proyectos desde Agenda
   aterrizaba arriba del todo aunque se estuviera mirando el proyecto número doce. Se guarda al
   salir y se repone al volver, por donde se vuelva.

   Aquí decía «SOLO al volver por el botón de atrás o por la barra, no al entrar por un enlace»,
   y eso nunca fue verdad: toda navegación de esta app pasa por `ir()` → `hashchange` → `montar`
   y no hay dos caminos que distinguir, así que la línea de abajo repone siempre. La frase
   describía una intención, no el código, y en este repositorio los comentarios son el contrato:
   se corrige el comentario, no se inventa la distinción. Si algún día hace falta —`ctx.pasar()`
   es lo más parecido a «entrar por un enlace»: el módulo que manda ya sabe a qué lleva— se
   implementa a propósito y se dice aquí. */
const _scrollPorRuta = new Map();

/* ----- Soltar una ruta montada -----
   Desmontar su módulo y olvidarla. `vaciar` es aparte y no siempre: el router NUNCA vació la
   sección que se abandona —la vacía su próximo montaje— y eso se queda igual para las
   normales. Se vacía cuando nadie va a montar encima, que es el caso de una conservada
   podada: mientras el `<iframe>` siga en el árbol, su documento sigue en la memoria del
   teléfono, y podarla sin vaciarla no libera absolutamente nada. */
function soltar(ruta, vaciar) {
  const mod = _vivas.get(ruta);
  _vivas.delete(ruta);
  if (mod && typeof mod.desmontar === 'function') {
    try { mod.desmontar(); } catch (e) { console.warn('desmontar falló', e); }
  }
  if (!vaciar) return;
  const r = rutaPorNombre(ruta);
  const s = r && $(r.seccion);
  if (s) s.innerHTML = '';
}

async function montarDeVerdad(ruta, opts = {}) {
  const r = rutaPorNombre(ruta);
  if (!r) return;
  if (_actual === ruta && !opts.forzar) return;
  if (_actual) _scrollPorRuta.set(_actual, window.scrollY);
  /* En el prefijo síncrono, antes del primer await: la guarda es de quien está montado, y
     el que se va ya no manda. Si se apagara en `desmontar()` y un módulo reventara a mitad,
     se quedaría pegada para siempre. Una pantalla conservada que se vuelve a enseñar tiene
     que volver a pedirla en su `mostrar()`, y lo hace. */
  _sinRemonte = false;

  /* El plan: qué se desmonta, qué se esconde y si lo que hay en la sección del destino
     sirve. Es aritmética sobre nombres de ruta y vive aparte, en js/nucleo/conservar.js, para
     poder probarla en node sin navegador. Aquí solo se ejecuta. */
  const plan = planDeMontaje({
    actual: _actual,
    destino: ruta,
    vivas: [..._vivas.keys()],
    forzar: !!opts.forzar,
    tope: TOPE_CONSERVADAS,
    conservar: n => !!(rutaPorNombre(n) || {}).conservar,
    permitida: n => rutasDeRol().some(x => x.ruta === n),
  });

  /* Desmontar antes de montar. Los módulos que se cuelgan de algo global —el mapa se
     suscribe a resize, la agenda a un temporizador— tienen que soltarlo o se acumulan: seis
     idas y venidas al mapa son seis oyentes de resize repintando seis mapas muertos. */
  const aVaciar = new Set(plan.vaciar);
  for (const x of plan.soltar) soltar(x, aVaciar.has(x));

  /* Y la que se conserva: se le avisa que deja de verse, no se desmonta. `ocultar()` tiene
     que soltar todo lo que su `desmontar()` suelta del DOCUMENTO —la clase
     `pf-marco-lleno` del body, la barra fija del teléfono, los oyentes de `resize` que miden
     geometría— y quedarse solo con lo suyo. Lo de dentro del <iframe> sigue vivo; lo que
     escribe fuera de su sección, no. */
  if (plan.ocultar) {
    const mod = _vivas.get(plan.ocultar);
    if (mod && typeof mod.ocultar === 'function') {
      try { mod.ocultar(); } catch (e) { console.warn('ocultar falló', e); }
    }
  }

  /* Las acciones del encabezado son del módulo que se va: se vacían ANTES de montar el
     siguiente. Sin esto, «COT-0152 · Clientes · Historial» se quedaba puesto encima del
     mapa, y son botones que hacen cosas. */
  const acc = $('pf-cab-acc');
  if (acc) acc.innerHTML = '';

  for (const x of RUTAS) { const s = $(x.seccion); if (s) s.hidden = x.ruta !== ruta; }
  _actual = ruta;
  pintarNav();
  /* El título del encabezado se escribe AQUÍ, antes de cargar, y no al final del montaje:
     con una carga lenta la barra ya marcaba «Mapa» y el encabezado seguía diciendo «Tablero»
     durante seis segundos. Lo que sí se queda para el final es anunciarlo por voz, porque un
     lector de pantalla tiene que oír el nombre cuando la pantalla ya está, no cuando empieza. */
  const sub = $('pf-sub');
  if (sub) sub.textContent = r.nombre;
  const cabsub = $('pf-cab-sub');
  if (cabsub) cabsub.textContent = r.sub || '';

  const cont = $(r.seccion);
  if (!cont) return;

  /* ----- La que ya estaba montada: se enseña, no se rehace -----
     Ni esqueleto ni barra de progreso: no hay nada que esperar, así que enseñarlos sería
     pintar una espera que no existe. `mostrar()` puede tardar si el módulo decide que lo que
     guardaba ya no sirve y se rehace por dentro —el Cotizador lo hace cuando su marco se
     cambió por la tarjeta de «no se pudo abrir»—, así que se espera. */
  if (plan.reutilizar) {
    const mod = _vivas.get(ruta);
    _vivas.delete(ruta); _vivas.set(ruta, mod);   // la más reciente, al final de la fila
    try { if (typeof mod.mostrar === 'function') await mod.mostrar(); }
    catch (e) { console.warn('mostrar falló', e); }
    rematar(r, ruta, opts);
    return;
  }

  /* La sección se vacía y el esqueleto va DELANTE de ella, no dentro: el módulo tiene que
     recibir el contenedor vacío que siempre recibió. Ver «Lo que se ve mientras carga». */
  cont.innerHTML = '';
  const quitarEsqueleto = ponerEsqueleto(cont, r);
  Progreso.iniciar();
  const listo = () => { quitarEsqueleto(); Progreso.terminar(); quitarArranque(); };

  let mod;
  try {
    mod = await import('./mod/' + r.mod + '.js');
  } catch (e) {
    /* Un import que falla con el service worker a medio actualizar es el modo de falla real
       de esto: llega app.js de la red y material.js de la caché vieja. No se deja una
       pantalla en blanco: se dice qué pasó y se ofrece lo único que lo arregla. */
    console.error('no se pudo cargar el módulo ' + r.mod, e);
    listo();
    cont.innerHTML = '<div class="vacio">' + ico('i-aviso') +
      '<p class="vacio-t">No se pudo cargar «' + esc(r.nombre) + '»</p>' +
      '<p class="vacio-d">Puede ser que la app se haya actualizado a medias. Recargar la deja completa.</p>' +
      '<button class="btn btn-pri" id="pf-recargar">Recargar</button></div>';
    const b = $('pf-recargar'); if (b) b.onclick = () => location.reload();
    return;
  }

  try {
    cont.innerHTML = '';
    /* ANTES de montar, no después. Si `mod.montar` revienta a mitad, el módulo ya dejó
       oyentes puestos y su barra escrita; con la anotación después, la ranura se quedaba
       vacía y ese módulo no se desmontaba nunca. Los diez módulos de js/mod/ tienen que
       tolerar que les llamen a `desmontar()` sin haber terminado de montar: los que guardan
       oyentes en una lista la iteran aunque esté vacía, y los demás hacen `$(id)` con guarda
       o sueltan lo que esté puesto sin suponer que se llegó a poner. */
    _vivas.delete(ruta); _vivas.set(ruta, mod);
    await mod.montar(cont, ctx);
  } catch (e) {
    console.error('el módulo ' + r.mod + ' falló al montar', e);
    cont.innerHTML = '<div class="vacio">' + ico('i-aviso') +
      '<p class="vacio-t">«' + esc(r.nombre) + '» no se pudo pintar</p>' +
      '<p class="vacio-d">' + esc(e && e.message ? e.message : 'Error desconocido') + '</p></div>';
  }
  listo();
  rematar(r, ruta, opts);
}

/* Lo que se hace igual tanto si la pantalla se acaba de montar como si solo se volvió a
   enseñar. Está aparte para que no haya dos copias que se separen: el día que una de estas
   cinco líneas cambie, cambia para los dos caminos. */
function rematar(r, ruta, opts) {
  /* Idempotente: en el camino de montaje ya lo llamó `listo()`. Se repite aquí porque el de
     reutilizar no pasa por `listo()`, y dejar el esqueleto de arranque puesto es dejar la app
     tapada para siempre. */
  quitarArranque();
  /* El foco al contenido y no al principio del documento: cambiar de módulo con teclado
     dejaba al usuario recorriendo otra vez las seis pestañas. */
  const main = $('pf-contenido');
  if (main && opts.foco !== false) { try { main.focus({ preventScroll: true }); } catch (_) {} }
  window.scrollTo({ top: _scrollPorRuta.get(ruta) || 0, behavior: 'auto' });
  /* El encabezado ya dice dónde estás desde antes de cargar (arriba). Es lo único que lo dice
     cuando la pestaña de la barra no puede —las rutas ocultas—; las acciones las escribe el
     módulo, y se vaciaron antes de montar para que las del anterior no se queden puestas
     encima del siguiente. Aquí solo se anuncia, ya con la pantalla puesta. */
  voz(r.nombre);
  pintarCuentasNav();
  ajustarAltoBarra();
}

/* ============================================================================
   La barra de módulos y el segmento de rol
   ============================================================================ */

function pintarNav() {
  /* Una ruta oculta prende la pestaña de su madre. Sin esto, estar en «Qué atender» dejaba
     la tira ENTERA apagada: la pantalla no dice dónde estás y la única salida visible es
     adivinar. Es el defecto que Ajustes ya tenía y que aquí se arregla para las dos. */
  const madre = (rutaPorNombre(_actual) || {}).padre || null;
  const activa = r => r.ruta === _actual || r.ruta === madre;
  const visibles = rutasDeRol().filter(r => !r.oculto);

  const nav = $('pf-nav');
  if (nav) nav.innerHTML = visibles.map((r, i) =>
    '<button type="button" class="pf-tab' + (activa(r) ? ' on' : '') + '"' +
    ' data-ruta="' + r.ruta + '" aria-current="' + (activa(r) ? 'page' : 'false') + '"' +
    /* El atajo va en el title, que es lo que lee el ratón en la computadora. En el teléfono
       no hay teclado y el title no molesta. */
    ' title="' + esc(r.nombre) + ' · tecla ' + (i + 1) + '">' +
    ico(r.icono) + '<span class="tx">' + esc(r.nombre) + '</span>' +
    '<span class="cta" data-cta="' + r.ruta + '" hidden></span></button>'
  ).join('');

  /* La barra de abajo. Es la MISMA lista y el mismo `data-ruta`, así que un módulo nuevo
     aparece en los dos sitios con un solo renglón —que es la promesa que hace RUTAS—. Lo
     único suyo es que se queda en cinco y que el nombre va debajo del icono.
     `aria-hidden` no: son botones de verdad y se navegan con el teclado igual que los de la
     barra lateral; lo que hace que solo se anuncie una es que la otra está en `display:none`
     a su ancho, y eso el árbol de accesibilidad ya lo respeta. */
  const ab = $('pf-abajo');
  if (ab) ab.innerHTML = visibles.filter(r => r.movil).map(r =>
    '<button type="button" class="' + (activa(r) ? 'on' : '') + '"' +
    ' data-ruta="' + r.ruta + '" aria-current="' + (activa(r) ? 'page' : 'false') + '">' +
    '<span class="pil">' + ico(r.icono) +
    '<span class="cta" data-cta-movil="' + r.ruta + '" hidden></span></span>' +
    esc(r.nombre) + '</button>'
  ).join('');
}

/** Las cuentas de atención de la barra. Las publica cada módulo en este mapa. */
const _cuentas = new Map();
export function ponerCuenta(ruta, n) {
  _cuentas.set(ruta, Number(n) || 0);
  pintarCuentasNav();
}
function pintarCuentasNav() {
  for (const r of RUTAS) {
    const n = _cuentas.get(r.ruta) || 0;
    /* Las dos barras —la lateral y la de abajo— llevan la misma cuenta. Antes solo existía
       una y el `querySelector` devolvía la primera; con dos, la del teléfono se quedaba
       siempre en blanco porque nadie la escribía. */
    for (const el of document.querySelectorAll('[data-cta="' + r.ruta + '"],[data-cta-movil="' + r.ruta + '"]')) {
      el.hidden = n <= 0;
      el.textContent = n > 99 ? '99+' : String(n);
      if (n > 0) el.setAttribute('aria-label', (n === 1 ? '1 cosa que atender en ' : n + ' cosas que atender en ') + r.nombre);
    }
  }
}
ctx.ponerCuenta = ponerCuenta;

/* ----- Los globos, sin tener que entrar a cada pantalla -----
   Cada módulo publicaba su cuenta al montarse, así que los pendientes de Proyectos o del
   Mapa no aparecían en la barra hasta que alguien entraba ahí. Ahora cada uno sabe contar
   sin pintar (`contar()`), y aquí se les pregunta a todos los de este rol: al arrancar,
   después de cada sincronización que trajo algo y al cambiar de pantalla. La pantalla que
   está montada contesta null y se queda con la cuenta que publicó ella. Uno a la vez y
   después de pintar: son lecturas locales, pero no tienen por qué competir con la pantalla
   que la persona está mirando. */
const MODS_CON_CUENTA = ['tablero', 'fabricacion', 'proyectos', 'material', 'mapa'];
let _contando = null, _contarOtraVez = false;
function contarTodo() {
  if (_contando) { _contarOtraVez = true; return _contando; }
  _contando = (async () => {
    do {
      _contarOtraVez = false;
      for (const r of rutasDeRol()) {
        if (r.oculto || !MODS_CON_CUENTA.includes(r.mod)) continue;
        try {
          const m = await import('./mod/' + r.mod + '.js');
          if (typeof m.contar !== 'function') continue;
          const c = await m.contar();
          if (c) for (const [ruta, n] of Object.entries(c)) ponerCuenta(ruta, n);
        } catch (e) { console.warn('no se pudo contar ' + r.mod, e); }
      }
    } while (_contarOtraVez);
  })().finally(() => { _contando = null; });
  return _contando;
}
ctx.contarTodo = contarTodo;

function pintarRolSeg() {
  const seg = $('pf-rolseg'); if (!seg) return;
  const actual = Prefs.rol();
  /* Cuando el rol viene de la hoja, los otros dos van deshabilitados y el que estás usando
     se queda encendido. La tira no se esconde: sigue diciendo con qué rol trabajas, que es
     información útil aunque ya no sea un mando. El `title` cambia para contestar la pregunta
     obvia —«¿por qué no me deja?»— en el sitio donde se hace. */
  const deLaHoja = Prefs.rolDeLaHoja();
  seg.innerHTML = Prefs.ROLES.map(r =>
    '<button class="' + (r === actual ? 'on' : '') + '" aria-pressed="' + (r === actual) + '"' +
    (deLaHoja && r !== actual ? ' disabled aria-disabled="true"' : '') +
    ' data-rol="' + r + '" title="' +
    esc(deLaHoja && r !== actual ? Prefs.ROL_LO_MANDA_LA_HOJA : Prefs.ROL_DESC[r]) + '">' +
    esc(Prefs.ROL_NOMBRE[r]) + '</button>').join('');
}

function cambiarRol(r) {
  if (r === Prefs.rol()) return;
  /* La guarda de verdad, no la del atributo. `disabled` en el botón es maquetación y
     `aplicarRol()` de Ajustes llega hasta aquí simulando un clic: si la regla viviera solo
     en el HTML, el camino de Ajustes se la saltaría entero. */
  if (Prefs.rolDeLaHoja()) {
    toast(Prefs.ROL_LO_MANDA_LA_HOJA, '', 6000);
    return;
  }
  if (!Prefs.setRol(r)) { toast('No se pudo guardar el rol en este dispositivo', 'err'); return; }
  pintarRolSeg();
  /* Cambiar de rol cambia qué módulos existen. Si el que estaba abierto no le toca al rol
     nuevo, se va al primero que sí; si le toca, se repinta, porque lo que ve adentro
     también cambia —los importes, sobre todo—. */
  const sigue = rutaPorNombre(_actual);
  if (sigue && sigue.roles.includes(r)) montar(_actual, { forzar: true });
  else ir(rutasDeRol()[0].ruta);
  toast('Ahora ves la plataforma como ' + Prefs.ROL_NOMBRE[r], '', 3400);
}

/* ============================================================================
   La banda de degradación
   ============================================================================ */

/* `texto` es TEXTO y se escapa; `html` es marcado y no. Antes había un solo campo,
   `texto`, y se metía crudo en el innerHTML. Hoy no se puede explotar —los cuatro que
   llaman a esto pasan literales de este archivo—, pero `ctx.banda` está en el contexto que
   reciben los seis módulos, y el día que uno pase el nombre de un proyecto o el motivo que
   escribió alguien, la banda lo interpreta como marcado. El camino por defecto tiene que
   ser el seguro; el crudo, el que hay que pedir a propósito.

   @param {{tono?:'av'|'mal', texto?:string, html?:string, accion?:{label:string,fn:Function}}|null} msg */
export function pintarBanda(msg) {
  const b = $('pf-banda'); if (!b) return;
  const cuerpo = msg ? (msg.html != null ? msg.html : (msg.texto != null ? esc(msg.texto) : '')) : '';
  if (!cuerpo) { b.hidden = true; b.innerHTML = ''; return; }
  b.className = 'pf-banda' + (msg.tono === 'mal' ? ' mal' : '');
  b.innerHTML = ico('i-aviso') + '<span>' + cuerpo + '</span>' +
    (msg.accion ? '<button type="button" id="pf-banda-acc">' + esc(msg.accion.label) + '</button>' : '');
  b.hidden = false;
  if (msg.accion) { const x = $('pf-banda-acc'); if (x) x.onclick = msg.accion.fn; }
}

/** Lo que la plataforma tiene que decir de este dispositivo antes de que se le pregunte. */
function revisarDispositivo() {
  const e = DB.estado();
  if (!e.ok) {
    pintarBanda({ tono: 'mal', html: '<b>' + esc(DB.motivoTexto()) + '</b>',
      accion: { label: 'Recargar', fn: () => location.reload() } });
    return;
  }
  /* Lo que la puerta dejó dicho va ANTES que el recordatorio del respaldo. Las tres cosas
     que puede decir —se entró con el token del aparato y no con una cuenta, el pase se está
     acabando, la copia está rota— cambian en qué condiciones estás trabajando ahora mismo;
     «van 11 días sin respaldo» es importante y puede esperar a la siguiente apertura. */
  if (_quien && _quien.nota) {
    pintarBanda({ tono: _quien.via === 'roto' ? 'mal' : '', texto: _quien.nota,
      /* Sin acción para el token de dispositivo: ahí no hay nada que apretar, es el estado
         en el que ese aparato trabaja a propósito. Para los otros dos, recargar es
         literalmente lo que arregla. */
      accion: _quien.via === 'token' ? null : { label: 'Recargar', fn: () => location.reload() } });
    return;
  }

  /* Aquí iba el recordatorio de respaldo («Nunca has respaldado…», «Van N días…»), en cada
     pantalla. Se quitó por decisión de Dirección (septiembre de 2026): ocupaba el lugar más
     visible de la app con algo que no se usa. Respaldar sigue en Ajustes. */
  pintarBanda(null);
}

/* El respaldo baja COMPLETO: la plataforma y el cotizador en un solo archivo. Antes eran dos
   archivos que no se cruzaban, y mover la app a otro aparato —que es la única forma de usarla
   en el teléfono y en la computadora mientras no haya servidor— era bajar dos cosas de dos
   pantallas y restaurarlas en otras dos. Ahora es un archivo: cada lado toma su mitad al
   restaurar, y un respaldo viejo de la plataforma sola sigue entrando igual. */
export async function respaldar() {
  const plataforma = JSON.parse(await DB.exportar());
  const cotizador = Cot.armarRespaldoCotizador();
  const txt = JSON.stringify({ app: 'al3d-completo', formato: 1, fecha: new Date().toISOString(),
    plataforma, cotizador });
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' +
                p(d.getHours()) + p(d.getMinutes());
  const { descargarArchivo } = await import('./nucleo/ui.js');
  if (descargarArchivo(txt, 'al3d-respaldo-completo-' + sello + '.json', 'application/json')) {
    Prefs.marcarExport();
    const n = (() => { try { return JSON.parse(cotizador.datos.al3d_historial || '[]').length; } catch (_) { return 0; } })();
    toast('Respaldo completo descargado: plataforma y cotizador (' + n + (n === 1 ? ' cotización' : ' cotizaciones') + ')', 'ok', 4600);
    revisarDispositivo();
  }
}
ctx.respaldar = respaldar;

/* ============================================================================
   Arranque
   ============================================================================ */

async function arrancar() {
  /* ----- LA PUERTA, antes que nada -----
     Antes que abrir la base, antes que pintar la barra y antes que montar un módulo: no se
     enseña una sola fila de este taller sin saber quién está del otro lado. `custodiar()` no
     contesta hasta que hay derecho a pasar, así que todo lo de abajo espera.

     Va también antes de `pintarNav()` por una razón práctica: el rol sale del pase, y pintar
     la barra antes sería pintarla con el rol de la vez pasada para corregirla medio segundo
     después.

     ── Si el módulo no carga ──────────────────────────────────────────────────
     Se entra, y se dice en la banda de arriba. Parece contradictorio y no lo es: para que
     este `catch` ocurra hace falta un service worker a medias en un aparato QUE YA TENÍA LA
     APP. Quien abre el enlace por primera vez baja los archivos y la puerta funciona; y en
     un aparato que ya la tenía, lo que esta pantalla protege —los datos que ya están en su
     IndexedDB— lo puede leer igual cualquiera que sepa abrir las herramientas del navegador.
     Dejar la plataforma muerta en una azotea por un archivo que no bajó costaría más de lo
     que guarda. Ver la cabecera de js/nucleo/puerta.js. */
  /* EL SERVICE WORKER, ANTES DE LA PUERTA Y NO AL FINAL.
     Vivía en la última línea de este arranque, y eso dejó de funcionar el día que la puerta
     se puso delante: `custodiar()` no resuelve hasta que alguien entra, así que mientras la
     pantalla de entrar está puesta NADA de lo de abajo corre — incluido esto. Comprobado en
     producción: un aparato parado en la puerta tenía cero cachés y cero service workers
     registrados. Consecuencias, las dos malas:

       · La app no se guardaba para trabajar sin señal hasta que alguien entrara.
       · Y al entrar, los ochenta y un archivos empezaban a bajar JUSTO cuando la persona
         quería usarla, compitiendo con lo que estuviera haciendo. Se sentía lenta, y lo era.

     Aquí arriba se registra mientras la persona lee la pantalla de entrar, que es tiempo que
     de otro modo no se usa para nada. No hay nada que proteger retrasándolo: lo que guarda
     son los archivos de la app, que el servidor sirve públicamente a quien los pida; los
     datos del taller no pasan por aquí. */
  registrarSW();

  faseArranque('Comprobando quién entra…');
  try {
    const Puerta = await import('./nucleo/puerta.js');
    /* El callback es para un caso concreto: se entró con un pase al que le quedaban pocos
       días y la banda lo dijo, y un momento después la comprobación que iba por detrás sí
       consiguió confirmarlo y lo renovó a treinta días. Sin esto, la banda se quedaría
       diciendo «te quedan 2 días» toda la sesión, sobre algo que ya dejó de ser verdad. */
    _quien = await Puerta.custodiar(nota => {
      if (!_quien) return;
      _quien.nota = nota || '';
      /* `_bandaLista` no es celo de más: esta retrollamada la dispara una comprobación que
         va por su cuenta contra la hoja, y puede contestar ANTES de que `DB.abrir()` haya
         terminado. `revisarDispositivo()` lo primero que mira es el estado de la base, y una
         base que todavía no abrió contesta «sin_abrir» — o sea que repintar aquí demasiado
         pronto sacaría una banda roja diciendo «La base todavía no abrió» con un botón de
         recargar, sobre una app que está arrancando perfectamente. */
      if (_bandaLista) revisarDispositivo();
    });
  } catch (e) {
    /* Sin puerta no se entra. Hubo un tiempo en que aquí se entraba igual, para no dejar la
       app muerta por un archivo que no bajó; Dirección decidió que la plataforma solo se ve
       con cuenta de Google, y eso incluye este caso. Se avisa y se ofrece recargar. */
    console.error('no se pudo cargar la puerta', e);
    const arr = $('pf-arranque'); if (arr) arr.hidden = true;
    for (const hijo of Array.from(document.body.children)) hijo.setAttribute('inert', '');
    const d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;text-align:center;background:#0b1020;color:#fff;font:16px/1.5 system-ui,sans-serif';
    d.innerHTML = '<div><p>No se pudo cargar la pantalla para entrar con Google, así que la plataforma no se abre.</p>' +
      '<p><button type="button" style="font:inherit;padding:10px 18px;border-radius:8px;border:0;cursor:pointer">Recargar</button></p></div>';
    d.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(d);
    return;
  }

  /* Si a los ocho segundos el esqueleto del arranque sigue en pantalla, algo de lo de abajo
     no llegó —la base que no abre, un import colgado por un service worker a medias— y lo
     único útil es decirlo y ofrecer recargar. `quitarArranque()` lo cancela al pintar.

     El reloj se pone DESPUÉS de la puerta: mientras la puerta está puesta, el arranque no va
     lento, está esperando a una persona, y ocho segundos es poco para leer una pantalla,
     elegir una cuenta de Google y volver. */
  _lentoArranque = setTimeout(() => avisarLento($('pf-arranque'), null), MS_LENTO_ARRANQUE);
  pintarRolSeg();
  pintarNav();
  import('./nucleo/cuenta.js').then(m => m.montar(_quien)).catch(() => {});
  vigilarCapas();
  registrarCapa('pf-ficha', () => cerrarCapa('pf-ficha'));
  registrarCapa('pf-hoja',  () => cerrarCapa('pf-hoja'));
  registrarCapa('pf-pide',  () => cerrarCapa('pf-pide'));
  /* El asistente va ENCIMA de las tres: se abre desde cualquier pantalla, con una ficha
     abierta o sin ella. Se carga aparte y después de pintar, como el puente: quien abre la
     app a ver la agenda no paga la descarga de algo que a lo mejor no toca. */
  registrarCapa('pf-ia', () => { import('./nucleo/asistente.js').then(m => m.cerrar()).catch(() => cerrarCapa('pf-ia')); });

  const seg = $('pf-rolseg');
  if (seg) seg.addEventListener('click', ev => {
    const b = ev.target.closest('[data-rol]'); if (b) cambiarRol(b.dataset.rol);
  });
  /* Las dos barras hablan el mismo idioma —`data-ruta`— así que el oyente es el mismo escrito
     dos veces y no dos manejadores distintos que se puedan desincronizar. */
  for (const id of ['pf-nav', 'pf-abajo']) {
    const nav = $(id);
    if (nav) nav.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ruta]'); if (b) ir(b.dataset.ruta);
    });
  }
  /* Dos puertas a Ajustes: la del pie de la barra lateral y la del encabezado del teléfono,
     donde la barra lateral no existe. */
  for (const id of ['pf-ajustes-btn', 'pf-cab-ajustes']) {
    const aj = $(id);
    if (aj) aj.onclick = () => ir('ajustes');
  }

  /* ----- El teclado, para la computadora -----
     Los números cambian de módulo en el orden de la barra —el mismo que enseña el title de
     cada pestaña—. Solo cuando no se está escribiendo en un campo y no hay un panel abierto:
     un «3» dentro del campo de búsqueda es un tres, no Proyectos. Esc ya lo atiende ui.js. Las
     flechas del calendario viven en su módulo, que es el único que sabe qué es «siguiente». */
  window.addEventListener('keydown', ev => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (document.querySelector('.modal-bg.show')) return;
    if (!/^[1-9]$/.test(ev.key)) return;
    const visibles = rutasDeRol().filter(r => !r.oculto);
    const r = visibles[Number(ev.key) - 1];
    if (!r) return;
    ev.preventDefault();
    ir(r.ruta);
  });

  faseArranque('Abriendo la base de este dispositivo…');
  await DB.abrir();
  _bandaLista = true;
  revisarDispositivo();

  /* Sembrar el catálogo y las constantes. Idempotente: no pisa lo que ya se editó. Va antes
     de montar cualquier módulo porque el de material sin catálogo es una pantalla vacía que
     no dice por qué está vacía. */
  if (DB.estado().ok) {
    try {
      faseArranque('Preparando el catálogo…');
      const Mat = await import('./datos/material.js');
      await Mat.sembrar();
    } catch (e) { console.warn('no se pudo sembrar el catálogo', e); }

    /* Drenar el buzón: lo que index.html marcó como ganado se convierte en proyecto. Va en
       el arranque y en cada evento 'storage', que es cuando el cotizador acaba de escribir
       en otra pestaña. */
    try {
      const r = await Cot.drenarBuzon();
      if (r.creados) toast(r.creados === 1 ? 'Se agregó 1 proyecto ganado' : 'Se agregaron ' + r.creados + ' proyectos ganados', 'ok', 4200);
      /* Y se dice qué hacer, que es lo que faltaba. No se manda a la bitácora: `drenarBuzon`
         no anota ahí sus fallos (ver js/datos/cotizador.js), así que ese destino era una
         puerta a un cuarto vacío. Los dos motivos reales son los que se nombran: la
         cotización se registró en otro teléfono y su folio no está en el historial de este
         —ese renglón ya no se reintenta—, o no hubo espacio y sí se reintenta al abrir. */
      if (r.fallidos) toast((r.fallidos === 1
        ? 'Hay 1 registro de venta que no se pudo convertir en proyecto'
        : 'Hay ' + r.fallidos + ' registros de venta que no se pudieron convertir en proyecto') +
        '. Si se registraron en otro teléfono, hay que ganarlos desde ahí; si no, se vuelve a intentar al abrir la plataforma.',
        'err', 7500);
    } catch (e) { console.warn('no se pudo drenar el buzón', e); }
  }

  window.addEventListener('hashchange', () => montar(rutaDelHash()));
  faseArranque('Abriendo ' + ((rutaPorNombre(rutaDelHash()) || {}).nombre || 'la plataforma') + '…');
  await montar(rutaDelHash());
  quitarArranque();

  /* El cotizador acaba de guardar en otra pestaña. Aquí no se avisa de conflicto como hace
     el cotizador —la plataforma solo LEE su almacenamiento, así que no hay nada que pisar—:
     se recoge lo nuevo y se repinta. */
  window.addEventListener('storage', async ev => {
    if (!ev.key) return;
    if (ev.key === Prefs.CLAVES.GANADAS) {
      const r = await Cot.drenarBuzon();
      if (r.creados) {
        toast('Llegó ' + (r.creados === 1 ? 'un proyecto ganado' : r.creados + ' proyectos ganados') + ' del cotizador', 'ok', 4200);
        /* Drenar el buzón SIEMPRE corre y el aviso siempre sale: lo único que se salta es el
           repintado, porque debajo puede haber un marco vivo. Al salir de esa pantalla el
           módulo monta fresco y el proyecto nuevo ya está ahí. */
        if (!_sinRemonte) montar(_actual, { forzar: true });
      }
      return;
    }
    if (['al3d_historial', 'al3d_queue'].includes(ev.key) && !_sinRemonte) montar(_actual, { forzar: true });
  });

  /* El puente va al final del arranque, después de pintar. Enchufarlo es leer una clave y
     construir un objeto —no toca la red— pero el módulo que lo construye se carga aparte, y
     esperar una descarga antes de la primera pantalla sería pagar en la calle, sin señal,
     por algo que ni siquiera hace falta para trabajar. */
  await enchufarPuente();
  sincronizarCallado();
  contarTodo();
  window.addEventListener('hashchange', () => setTimeout(contarTodo, 800));

  /* El asistente: solo cuelga el oyente del botón; el panel se pinta al abrir. Si el módulo
     no carga —service worker a medias— el botón no hace nada y la plataforma sigue igual. */
  import('./nucleo/asistente.js').then(m => m.montar(ctx)).catch(e => console.warn('sin asistente', e));

  /* Al recuperar señal se manda lo que quedó, sin que nadie apriete nada. Es la mitad que
     le faltaba a la bandeja: guardar sin señal ya funcionaba desde fase 1, y lo que no
     existía era el momento en que eso sale solo. */
  window.addEventListener('online', () => sincronizarCallado());

  /* ----- Traer lo nuevo sin cerrar ni abrir -----
     Lo que otro teléfono o la hoja cambian llega solo: cada 30 segundos mientras la app está
     a la vista, y en cuanto vuelves a ella desde otra pestaña o app. Con la app en segundo
     plano no se pregunta nada, que es batería y cupo del Apps Script gastados en una pantalla
     que nadie mira. 30 s son dos peticiones por minuto; el cupo del puente es de 60. */
  setInterval(() => {
    if (document.visibilityState === 'visible') sincronizarCallado();
  }, MS_SINCRONIZAR);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizarCallado();
  });

  /* ----- El permiso de Google, renovado con tu siguiente clic -----
     Google da el permiso por una hora, y renovarlo abre un instante su ventana. El navegador
     solo deja abrir ventanas cuando la persona acaba de tocar algo, así que un temporizador
     no puede hacerlo: se hace en el primer clic después de que caducó. Con la cuenta ya
     escogida la ventana se abre y se cierra sola. Sin esto, pasada la hora la app dejaba de
     sincronizar hasta la siguiente vez que alguien entraba. */
  document.addEventListener('click', async () => {
    /* Con la pantalla de entrar puesta, el clic es suyo: dos peticiones a Google a la vez se
       pisan la ventana. */
    if (document.documentElement.classList.contains('con-puerta')) return;
    try {
      const Ingreso = await import('./nucleo/ingreso.js');
      if (!Ingreso.configurado() || !Ingreso.correo() || Ingreso.dentro()) return;
      const r = await Ingreso.renovar();
      if (r && r.ok) sincronizarCallado();
    } catch (_) {}
  }, true);

  /* El resize dispara decenas de veces mientras se gira el teléfono o se abre el teclado, y
     `ajustarAltoBarra` lee geometría: leer y escribir el layout en cada evento es el camino
     corto al tirón. Un cuadro de por medio basta y se nota. */
  let _rz = 0;
  window.addEventListener('resize', () => {
    if (_rz) return;
    _rz = requestAnimationFrame(() => { _rz = 0; ajustarAltoBarra(); });
  });
}

/* ============================================================================
   El puente — fase 3
   ============================================================================ */

/** Enchufa el relevo de la hoja si este dispositivo ya tiene URL y token en Ajustes. */
export async function enchufarPuente() {
  if (!Prefs.hayPuente()) { Sync.registrar(null); return false; }
  try {
    const Puente = await import('./datos/puente.js');
    Sync.registrar(Puente.desdePrefs());
    return Sync.configurado();
  } catch (e) {
    /* Un relevo que no se pudo cargar no puede llevarse por delante la plataforma: sin él
       todo sigue funcionando en este dispositivo, que es exactamente el estado de fase 1. */
    console.warn('no se pudo enchufar el puente', e);
    return false;
  }
}
ctx.enchufarPuente = enchufarPuente;

/**
 * Manda lo que quedó y trae lo que cambió, sin decir nada.
 *
 * Callado a propósito: esto corre al arrancar y cada vez que vuelve la señal, y un aviso
 * en cada una sería un aviso que se aprende a ignorar. Lo que sí se hace es repintar, y
 * SOLO si algo cambió: repintar por costumbre tira el scroll y el filtro que la persona
 * acababa de poner.
 */
const MS_SINCRONIZAR = 30000;
let _sincronizando = null;
let _repintarDebe = false;

function sincronizarCallado() {
  /* Una a la vez: el reloj de 30 s, volver a la pestaña y recuperar señal caen juntos más
     seguido de lo que parece. Quien llega segundo espera la misma. */
  if (_sincronizando) return _sincronizando;
  _sincronizando = sincronizarDeVerdad().finally(() => { _sincronizando = null; });
  return _sincronizando;
}

/* Repintar tira lo que la persona está escribiendo o el panel que tiene abierto. Ahora que
   esto corre cada 30 segundos, se repinta solo cuando no estorba; si estorba, se apunta y se
   hace en la siguiente vuelta en la que ya no. */
function puedeRepintar() {
  if (_sinRemonte || hayCapaAbierta()) return false;
  const a = document.activeElement;
  return !(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
}

async function sincronizarDeVerdad() {
  if (!Sync.configurado()) return;
  if (navigator.onLine === false) return;
  /* La identidad NO se renueva aquí. Renovarla abre la ventana de Google, y esto corre solo,
     sin clic: el navegador la bloquearía cada 30 segundos. Se renueva en el siguiente clic
     —ver el oyente de `click` en el arranque— y mientras tanto la petición sale con el token
     de dispositivo si lo hay. */
  let movio = 0;
  try { const r = await Sync.bombear(); if (r.ok) movio += Number(r.valor.subidas) || 0; } catch (_) {}
  /* Página por página mientras el Worker diga que hay más, con tope: las 199 filas anteriores
     a la plataforma van primero en el orden por edición y con una sola página por apertura
     hacían falta cuatro aperturas para llegar a las nuevas. */
  try {
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const r = await Sync.jalar();
      if (!r.ok) break;
      movio += (Number(r.valor.nuevos) || 0) + (Number(r.valor.actualizados) || 0);
      if (!r.valor.hay_mas) break;
    }
  } catch (_) {}
  if (movio) { _repintarDebe = true; contarTodo(); }
  if (_repintarDebe && _actual && puedeRepintar()) {
    _repintarDebe = false;
    montar(_actual, { forzar: true });
  }
}
ctx.sincronizar = sincronizarCallado;

/* El service worker guarda una copia de la app para que abra sin señal. Se registra al
   PRINCIPIO del arranque, antes de la puerta —el porqué está escrito en `arrancar()`—, y en su
   propio try: si el navegador no lo soporta —o el sitio se abrió como file:// para probarlo—
   no puede estorbar a nada de lo que sigue. */
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  /* ----- La versión nueva se pone sola -----
     El service worker nuevo se instala por detrás y toma el control (skipWaiting + claim),
     pero la página que ya estaba abierta sigue corriendo el código viejo hasta que alguien
     recarga. En la práctica eso era «subí los cambios y sigo viendo lo de antes». Así que
     cuando el control cambia de manos se recarga UNA vez. Solo si ya había un service worker
     antes: en la primera instalación también cambia el control, y ahí no hay nada viejo. */
  const habia = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habia || recargado) return;
    /* Si alguien está escribiendo, no se le tira: la versión nueva entra en la siguiente
       apertura, como antes. */
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    recargado = true;
    location.reload();
  });
  try {
    navigator.serviceWorker.register('sw.js').then(reg => {
      /* Y se pregunta por una versión nueva cada vez que se vuelve a la app, no solo al
         abrirla: con la app abierta todo el día en el taller, «al abrirla» era nunca. Una
         vez cada diez minutos como mucho. */
      let ultima = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - ultima < 600000) return;
        ultima = Date.now();
        reg.update().catch(() => {});
      });
    }).catch(() => {});
  } catch (_) {}
}

/* ----- Arrancar, y arrancar de todas formas -----
   Un <script type="module"> es diferido, así que normalmente esto corre con el documento ya
   parseado y `arrancar()` se llama de inmediato. Pero el arranque llegó a no ocurrir NUNCA
   por una razón que no se ve: una hoja de estilos pendiente bloquea la ejecución de los
   scripts, y con la petición de las fuentes de Google colgada el módulo no se evaluaba y la
   plataforma se quedaba en blanco, sin un solo error en la consola.

   Eso ya se arregló donde tocaba —en index.html, que es donde vive la plataforma desde que
   plataforma.html solo reenvía, las fuentes se cargan sin bloquear—,
   pero la lección se queda escrita en código: arrancar no depende de UNA señal. Se intenta
   en la que llegue primero y `_arranco` garantiza que solo pase una vez. */
let _arranco = false;
function arrancarUnaVez() {
  if (_arranco) return;
  _arranco = true;
  arrancar();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancarUnaVez, { once: true });
  /* Y si por lo que sea DOMContentLoaded ya pasó de largo, `load` lo recoge. */
  window.addEventListener('load', arrancarUnaVez, { once: true });
} else {
  arrancarUnaVez();
}
