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
import * as Carpetas from './datos/carpetas.js';
import { $, ico, esc, toast, voz, vigilarCapas, registrarCapa, hayCapaAbierta, abrirCapa, cerrarCapa, ajustarAltoBarra, esqueletoModulo,
         confirmarPf, fmtFechaDia }
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

   `movil` marca las que se quedan en la barra de abajo del teléfono cuando el rol tiene más
   rutas de las que caben. La barra son CINCO botones y no seis: con seis, cada uno mide 60 px en
   una pantalla de 360 y el nombre no cabe debajo del icono. Así que si el rol ve más de cinco
   rutas, se quedan las cuatro marcadas y el quinto botón es «Más», que abre una hoja con todas
   las demás —las del rol que NO llevan `movil`—, cada una con su globo de cuenta. Si el rol ve
   cinco o menos (pagos: Tablero, Calendario, Proyectos, Cotizador y Control), no hay «Más» y la
   barra las lleva todas: es lo que hace que pagos tenga a un toque Control, que es SU pantalla.
   Material, Control, la Mesa de corte y el Vectorizador solo se alcanzaban bajando hasta el pie
   del Tablero. Quién se queda a la vista es cuestión de mover una marca aquí, que es la única
   lista (`repartirBarra`, más abajo, es la regla). */
const RUTAS = [
  { ruta: 'hoy',       mod: 'tablero',     seccion: 'mod-tablero',     icono: 'i-taller',    nombre: 'Tablero',     sub: 'qué hay en el taller y qué se atrasa', movil: true, roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'agenda',    mod: 'fabricacion', seccion: 'mod-fabricacion', icono: 'i-agenda',    nombre: 'Calendario',  sub: 'fechas de entrega',               movil: true, roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'proyectos', mod: 'proyectos',   seccion: 'mod-proyectos',   icono: 'i-proyectos', nombre: 'Proyectos',   sub: 'por etapa de obra',                    movil: true, roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'material',  mod: 'material',    seccion: 'mod-material',    icono: 'i-material',  nombre: 'Material',    sub: 'en mantenimiento',                         roles: ['direccion', 'fabricacion'] },
  /* `conservar` — ver js/nucleo/conservar.js. Esta pantalla NO es DOM que se repinta: es un
     documento entero dentro de un <iframe>. Vaciarle la sección al salir y volver a escribir
     el marco al entrar costaba 795 KB de guiones reinterpretados por visita. Con la marca, el
     router la esconde en vez de tirarla y al volver solo la enseña. */
  { ruta: 'cotizador', mod: 'cotizador',   seccion: 'mod-cotizador',   icono: 'i-venta',     nombre: 'Cotizador',   sub: 'capturar y autorizar una cotización',  movil: true, roles: ['direccion', 'fabricacion', 'pagos'], conservar: true },
  { ruta: 'mapa',      mod: 'mapa',        seccion: 'mod-mapa',        icono: 'i-mapa',      nombre: 'Mapa',        sub: 'obras por instalar e instaladas',                   roles: ['direccion', 'fabricacion'] },
  /* La mesa de corte. Vivía como pestaña del Tablero —«Carga del taller» / «Mesa de corte»— y
     ahí no la encontraba nadie: es una herramienta de uso diario del taller escondida detrás
     de un segmento de otra pantalla. Sale a la barra, y con los dos roles que la usan. La
     pestaña del Tablero sigue existiendo porque es a donde llegan con un pase
     (`ctx.pasar('hoy', {vista:'anidador'})`) el «Acomodar en hoja» del vectorizador del
     Cotizador empotrado (js/mod/cotizador.js) y el «Acomodar en la lámina» del Calendario,
     que trae el proyecto puesto. NO es por `#/hoy/anidador`: eso no es una ruta
     —`rutaDelHash()` exige un solo segmento, lo reescribe a `#/hoy` y abre la carga— y nada
     apunta ahí. El del vectorizador, que no trae proyecto, el Tablero lo sigue de largo hasta
     ESTA ruta: el Tablero no se conserva, y el trazo se perdía al cambiar de pestaña y volver
     (ver `montar()` en js/mod/tablero.js). */
  { ruta: 'anidador',  mod: 'herramientas', seccion: 'mod-anidador',   icono: 'i-anidar',    nombre: 'Mesa de corte', sub: 'acomodar las piezas en la lámina',                roles: ['direccion', 'fabricacion'], conservar: true },
  /* El vectorizador, por la misma razón: convertir un logotipo en trazo de corte se hace con
     el archivo en la mano, y estaba detrás del botón «Vectorizar» de una partida. Para usarlo
     había que abrir una cotización que nadie iba a mandar. El botón del cotizador se queda
     donde está: son dos puertas al mismo documento, no dos implementaciones. */
  { ruta: 'vectorizar', mod: 'herramientas', seccion: 'mod-vectorizar', icono: 'i-vector',   nombre: 'Vectorizador',  sub: 'del logotipo al trazo de corte',                  roles: ['direccion', 'fabricacion'], conservar: true },
  /* El editor de publicaciones: las plantillas de marca para redes. Es la tercera herramienta
     de marco —un documento propio, publicaciones/, igual que la mesa de corte— y por eso se
     conserva: cargar las 554 plantillas es un mega de JSON y volver de otra pantalla no debe
     costarlo otra vez ni perder lo que se estaba escribiendo. Solo Dirección: es la voz de la
     marca, no una herramienta del taller ni de la cobranza. */
  { ruta: 'publicaciones', mod: 'herramientas', seccion: 'mod-publicaciones', icono: 'i-publicar', nombre: 'Publicaciones', sub: 'plantillas de marca para redes',              roles: ['direccion'], conservar: true },
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
  /* ¿Este montaje es un remonte en silencio de la pantalla que ya se veía, y no una visita? Para
     las cifras que ruedan (P18): solo tienen sentido cuando algo cambió estando ahí. */
  esRemonte: () => _remontando,
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

/* El montaje en curso es un remonte en silencio de la pantalla que ya estaba (sincronización,
   cambio de rol, otra pestaña que guardó) y no una visita. Ver P18 en `montarDeVerdad`. */
let _remontando = false;

/** Olvida lo que la pieza 1 recuerda de cada cifra: el primer pintado tras entrar no rueda. */
function olvidarCifras() {
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  if (P && P.rodarCifra && P.rodarCifra.olvidar) P.rodarCifra.olvidar();
}

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
    e.classList.remove('fin', 'sale'); e.classList.add('on');
  },
  terminar() {
    const e = $('pf-progreso'); if (!e || !e.classList.contains('on')) return;
    e.classList.remove('on');
    /* Si terminó antes de que el CSS la encendiera (150 ms), no hay nada que rematar: pintar
       el relleno completo sería enseñar una barra que nadie vio empezar. */
    if (performance.now() - this._desde < 150) return;
    e.classList.add('fin');
    /* Lleno un instante, luego se desvanece entero (.sale) y solo entonces se quita. */
    this._t = setTimeout(() => {
      e.classList.add('sale');
      this._t = setTimeout(() => e.classList.remove('fin', 'sale'), 220);
    }, 220);
  },
};

/* ----- P22 · EL ARRANQUE EN PASOS -----
   Era una sola línea que se reescribía cuatro veces. Cuando algo se atoraba, el aviso de los
   ocho segundos decía «tarda más de lo normal» y nada más: con la base que no abre y con un
   import colgado por un service worker a medias se leía EXACTAMENTE igual, y son dos cosas
   distintas de arreglar. Ahora las cuatro fases son cuatro renglones de la traza (pieza 8) que
   se quedan puestos: el que terminó con su palomita y lo que tardó, el que trabaja con su
   reloj corriendo —lo único que se mueve— y los que faltan en gris.

   El marcado es FIJO, en index.html, por lo mismo que el resto del esqueleto: tiene que verse
   desde el primer pintado. Aquí solo se adopta con Piezas.traza(), que lo toma tal como está.

   Las claves son las del marcado y el orden ES el del arranque: al entrar en una fase, la
   anterior que seguía trabajando se da por hecha. Una que se salta —el catálogo cuando la base
   no abrió— se dice a propósito con `saltarArranque()`, y no se hereda del orden: un paso que
   no corrió no es un paso que salió bien. */
const PASOS_ARRANQUE = ['puerta', 'base', 'catalogo', 'pantalla'];
let _traza = null;

function trazaArranque() {
  const caja = $('pf-arranque-traza');
  if (!caja || !caja.isConnected) { _traza = null; return null; }
  if (!_traza) {
    const P = typeof window !== 'undefined' ? window.Piezas : null;
    if (!P || !P.traza) return null;
    _traza = P.traza(caja, { reloj: 's', plegar: false });
  }
  return _traza;
}

/** El estado que tiene un renglón del arranque ahora, leído de su marcado. */
function estadoDeFase(clave) {
  const caja = $('pf-arranque-traza');
  const li = caja && caja.querySelector('[data-clave="' + clave + '"]');
  return li ? li.dataset.estado : '';
}

/** Entra en una fase del arranque. `texto` cambia el rótulo del renglón y `detalle` le añade una
 *  coletilla (la última fase dice a qué pantalla va); sin ellos se queda lo que trae el marcado.
 *
 *  Lo anterior que seguía en espera o trabajando se da por hecho, porque el orden ES el del
 *  arranque. Pero un renglón que ya dijo otra cosa —«se saltó», «falló»— se queda como lo dijo:
 *  sin esto, el catálogo que se saltó porque la base no abrió salía con su palomita al llegar a
 *  la pantalla, que es exactamente la mentira que el renglón ámbar existe para no decir. */
function faseArranque(clave, texto, detalle) {
  const t = trazaArranque();
  if (!t) return;
  for (const k of PASOS_ARRANQUE) {
    if (k === clave) break;
    const e = estadoDeFase(k);
    if (e === 'espera' || e === 'trabaja') t.hecho(k);
  }
  t.paso(clave, texto || null, 'trabaja', detalle);
}

/** Una fase que no corrió. Lleva su motivo al lado, en ámbar, para que el renglón no se quede
 *  girando ni mienta con una palomita. */
function saltarArranque(clave, motivo) {
  const t = trazaArranque();
  if (t) t.salta(clave, motivo || '');
}

/** Una fase que corrió y falló: la cruz roja con su motivo, y se queda así. */
function fallarArranque(clave, motivo) {
  const t = trazaArranque();
  if (t) t.falla(clave, motivo || '');
}

/** En qué paso se quedó, para el aviso de los ocho segundos. */
function pasoDelArranque() {
  const t = trazaArranque();
  const a = t && t.actual();
  return a && a.texto ? a.texto : '';
}

function quitarArranque() {
  const a = $('pf-arranque');
  if (a) a.remove();
  _traza = null;
  if (_lentoArranque) { clearTimeout(_lentoArranque); _lentoArranque = 0; }
}

/* El aviso de que tarda, escrito en el pie del esqueleto que siga puesto. `role=alert` porque
   a estas alturas sí hay que interrumpir: la persona lleva seis segundos mirando un dibujo. */
function avisarLento(caja, r) {
  const t = caja && caja.querySelector('.pf-esqueleto-t');
  if (!t) return;
  /* Y en QUÉ se atoró, cuando se sabe (P22): con la traza del arranque puesta, el renglón que
     sigue girando es la respuesta, y repetirla aquí es lo que hace que el aviso sirva para
     algo más que recargar a ciegas. En el esqueleto de un módulo no hay traza y la frase se
     queda como estaba. */
  const en = caja && caja.id === 'pf-arranque' ? pasoDelArranque() : '';
  t.innerHTML = ico('i-aviso') + ' <span>' + (r ? '«' + esc(r.nombre) + '»' : 'La plataforma') +
    ' tarda más de lo normal' + (en ? ' en «' + esc(en) + '»' : '') + '. Si no aparece, recargar suele arreglarlo.</span>' +
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
  /* Con el esqueleto del ARRANQUE todavía puesto no se pone otro encima: en un primer montaje
     lento (más de 180 ms) se veían dos siluetas apiladas. */
  const arr = $('pf-arranque');
  if (arr && !arr.hidden) return () => {};
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

/* ----- ¿Este marco tiene algo que se perdería? -----
   Se le pregunta a su propio `beforeunload`, que es donde el cotizador ya escribió la
   condición (js/cotizador/arranque.js): se le manda un `beforeunload` de mentira y, si su
   oyente lo cancela, hay algo en riesgo. Así la regla vive en UN sitio —el día que el
   cotizador proteja una cosa más, esto la ve sin tocarse— y la plataforma no tiene que leer
   variables de otro documento. Un evento sintético no abre el diálogo del navegador ni
   descarga nada: solo corre los oyentes. Si no se puede preguntar —marco sin documento
   todavía, u otro origen— la respuesta es «no»: no hay nada que ver. */
function marcoConPendiente(ruta) {
  const r = rutaPorNombre(ruta);
  if (!r || !r.conservar) return false;
  const s = $(r.seccion);
  const f = s && s.querySelector('iframe');
  if (!f) return false;
  try {
    const w = f.contentWindow;
    if (!w || !w.document) return false;
    const ev = new w.Event('beforeunload', { cancelable: true });
    w.dispatchEvent(ev);
    return ev.defaultPrevented;
  } catch (_) { return false; }
}

/* Espera a que llegue el `history.back()` con el que `cerrarCapa` consume la entrada de una
   capa recién cerrada, con techo: si la capa se cerró con el atrás del teléfono, ese atrás ya
   pasó y no va a llegar otro. */
function trasElAtrasDeUnaCapa() {
  return new Promise(res => {
    const fin = () => { clearTimeout(t); window.removeEventListener('popstate', fin); res(); };
    const t = setTimeout(fin, 400);
    window.addEventListener('popstate', fin);
  });
}

async function montarDeVerdad(ruta, opts = {}) {
  const r = rutaPorNombre(ruta);
  if (!r) return;
  if (_actual === ruta && !opts.forzar) return;
  if (_actual) _scrollPorRuta.set(_actual, window.scrollY);
  /* Un remonte que nadie pidió —la sincronización, un 'storage', el cambio de rol— sobre la
     pantalla que se está mirando va EN SILENCIO: sin esqueleto, sin barra de progreso y con el
     alto de la sección reservado mientras se rehace. Antes la sección se vaciaba, el documento
     se encogía, el navegador recortaba el scroll y todo volvía a aparecer: cada 30 s, si otro
     teléfono había movido algo. */
  const enSilencio = !!opts.forzar && _actual === ruta;
  /* ----- P18 · LAS CUENTAS RUEDAN CUANDO CAMBIAN, Y NUNCA AL ENTRAR -----
     Cuando llega algo de otro teléfono, «Van tarde 2» pasaba a 3 en seco y nadie se daba cuenta.
     La pieza 1 recuerda lo último que pintó cada cifra por su `clave` —no por el nodo, que el
     remonte tira— y la hace rodar del valor viejo al nuevo, con su «+1». Lo que decide aquí
     es CUÁNDO tiene sentido, y son dos casos distintos:

       · Un remonte en silencio de la pantalla que se está mirando —la sincronización trajo
         algo, otra pestaña guardó, se cambió el rol— NO olvida nada: la cuenta que cambió rueda
         desde lo que la persona estaba viendo.
       · Entrar a una pantalla SÍ olvida todo. Contar desde el valor de la última visita sería
         movimiento sin acción, y peor, con un número que se verá mal un segundo: volver al
         Tablero una hora después y ver «2» rodar hasta «3» dice que algo acaba de pasar cuando
         llevaba una hora ahí. El brief lo descarta con todas sus letras (CountUp al montar).

     Cada módulo pinta sus cuentas con `Piezas.rodarCifra(b, texto, {clave, delta:true})` y no
     tiene que saber nada de esto; `ctx.esRemonte()` está por si prefiere decidir él con
     `animar:`. Vale mientras dura ESTE montaje: `rematar()` lo apaga. */
  _remontando = enSilencio;
  if (!enSilencio) olvidarCifras();

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

  /* ----- Antes de tirar un marco, se le pregunta si tiene algo en riesgo -----
     Con TOPE_CONSERVADAS en uno, saltar del Cotizador a la Mesa de corte o al Vectorizador
     poda el Cotizador: se le vacía la sección y el <iframe> sale del árbol. Eso NO dispara el
     `beforeunload` del cotizador (js/cotizador/arranque.js), que es lo que protege lo único
     que ahí no se guarda solo —las medidas del escalador, la imagen de la IA que no cupo, la
     cotización que dejó de guardarse por falta de espacio—, así que el salto se lo llevaba
     sin preguntar. Se le pregunta a su propio oyente (`marcoConPendiente`) y, si dice que sí,
     se pide confirmación. Quedarse deja la dirección como estaba, sin montar nada. */
  const enRiesgo = plan.vaciar.filter(marcoConPendiente);
  if (enRiesgo.length) {
    const quien = rutaPorNombre(enRiesgo[0]) || {};
    const si = await confirmarPf({
      titulo: '¿Cerrar «' + (quien.nombre || 'esta pantalla') + '»?',
      texto: 'Para abrir «' + r.nombre + '» se cierra «' + (quien.nombre || 'la otra pantalla') + '», que quedó abierto ' +
        'con algo que todavía no está guardado: medidas del escalador sin usar, la imagen de la IA que no cupo en el ' +
        'teléfono o una cotización que no se pudo guardar. Si lo cierras, eso se pierde.',
      si: 'Cerrar y seguir', no: 'Quedarme', peligro: true,
    });
    if (!si) {
      /* La pregunta es una capa con entrada de historial, y cerrarla hace `history.back()`,
         que llega después. Reescribir la dirección antes de que llegue sería reescribir la
         entrada de la PREGUNTA, y al llegar el atrás la barra volvería a decir el destino —y
         montaría, y volvería a preguntar—. */
      await trasElAtrasDeUnaCapa();
      if (_actual) { try { history.replaceState(null, '', '#/' + _actual); } catch (_) {} }
      return;
    }
  }

  /* Antes del primer await del montaje: la guarda es de quien está montado, y el que se va ya
     no manda. Si se apagara en `desmontar()` y un módulo reventara a mitad, se quedaría pegada
     para siempre. Una pantalla conservada que se vuelve a enseñar tiene que volver a pedirla
     en su `mostrar()`, y lo hace. Va DESPUÉS de la pregunta de arriba y no antes: mientras se
     pregunta, el marco sigue en pantalla, y un 'storage' que llegara con la guarda apagada lo
     remontaría por debajo —justo lo que se estaba preguntando si se podía tirar—. */
  _sinRemonte = false;

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

  /* ----- P24 · LA PANTALLA ENTRA POR DONDE ESTÁ EN LA BARRA -----
     Las ocho entraban igual, así que ir y volver entre dos pantallas se veía idéntico y la
     barra no decía nada de dónde estabas. Con la dirección, la barra se lee como un mapa: lo
     que está más abajo en ella llega desde la derecha; lo que está más arriba, desde la
     izquierda. Las ocultas —Qué atender, Ajustes— no tienen lugar en la barra y se quedan con
     el fundido de siempre, porque son «de adentro» y no un sitio al que ir de lado.

     Se apoya en los `entra-der`/`entra-izq` que css/sistema.css ya tiene para el cotizador: 12
     píxeles, no 24. La auditoría de movimiento de PR #71 dejó `.pf-mod` en un fundido de 120 ms
     a propósito —«una entrada dice esto es nuevo; repetida en la navegación se lee como que la
     app va lenta»— y esto no lo deshace: el desplazamiento es corto, dura 200 ms, solo se pone
     cuando las DOS pantallas tienen sitio en la barra, y con las teclas 1-9 y con movimiento
     reducido no hay nada.

     No es `Piezas.transicion()` con `contenedor` y `direccion`, que es lo que sugería la
     pieza: con View Transitions el navegador FOTOGRAFÍA la pantalla de antes y la de después
     en cuanto se quita el `hidden`, y aquí la de después todavía está vacía —el módulo llega
     por un `import()` y pinta más tarde—, así que la foto sería un hueco. Y mientras dura el
     viaje Chrome le manda todo toque al <html>: en una barra que se toca de seguido, cada
     segundo toque se perdía. Una animación de CSS sobre la sección que aparece no fotografía
     nada y no bloquea nada.

     Va ANTES de quitar el `hidden`, que es lo que rearranca la animación de la sección. */
  /* La de antes SALE en vez de esfumarse, y lo de dentro de la nueva llega en cascada. Ver
     `despedir()`. Nada de eso en un remonte en silencio: ahí la pantalla no cambió. Va ANTES de
     `ponerDireccion()`: la clase `va-*` que pone le arranca la animación de entrada también a la
     sección que se va, y el clon se fotografiaría ya corrido 36 px. */
  if (!enSilencio && _actual && _actual !== ruta) {
    despedir(rutaPorNombre(_actual), direccionDeEntrada(lugarEnLaBarra(_actual), lugarEnLaBarra(ruta)));
    marcarLlegada();
  }
  ponerDireccion(_actual, ruta, $(r.seccion));

  for (const x of RUTAS) { const s = $(x.seccion); if (s) s.hidden = x.ruta !== ruta; }
  _actual = ruta;
  pintarNav();
  /* El título del encabezado se escribe AQUÍ, antes de cargar, y no al final del montaje:
     con una carga lenta la barra ya marcaba «Mapa» y el encabezado seguía diciendo «Tablero»
     durante seis segundos. Lo que sí se queda para el final es anunciarlo por voz, porque un
     lector de pantalla tiene que oír el nombre cuando la pantalla ya está, no cuando empieza. */
  const sub = $('pf-sub');
  if (sub && sub.textContent !== r.nombre) {
    sub.textContent = r.nombre;
    /* El título también cambia de lugar, no de letras: sube y aparece (plataforma.css). */
    if (!enSilencio) { sub.classList.remove('cambia'); void sub.offsetWidth; sub.classList.add('cambia'); }
  }
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
  if (enSilencio) cont.style.minHeight = cont.offsetHeight + 'px';
  cont.innerHTML = '';
  const quitarEsqueleto = enSilencio ? () => {} : ponerEsqueleto(cont, r);
  if (!enSilencio) Progreso.iniciar();
  const listo = () => {
    quitarEsqueleto(); if (!enSilencio) Progreso.terminar(); quitarArranque();
    if (enSilencio) requestAnimationFrame(() => { cont.style.minHeight = ''; });
  };

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
  _remontando = false;
  terminarLlegada();
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

/* ----- P5 · LA BARRA DEL TELÉFONO SE QUEDA EN CINCO, Y LA QUINTA ES «MÁS» -----
   Material, Control, la Mesa de corte y el Vectorizador solo se alcanzaban bajando hasta el pie
   del Tablero, y pagos tenía cuatro botones abajo y aun así no tenía Control, que es SU
   pantalla. La barra se llena hasta cinco con las rutas del rol y, si sobran, el quinto botón
   abre una hoja con las demás.

   Cinco y no seis está medido y escrito desde antes en css/plataforma.css: con seis, cada botón
   mide 60 px en una pantalla de 360 y el nombre no cabe debajo del icono. Con cinco, 72.

   La regla, y no hay otra: se toman las rutas visibles del rol con las marcadas `movil` primero
   y las demás detrás, en el orden de RUTAS. Si son cinco o menos, todas van en la barra y no hay
   «Más» —pagos: Tablero, Calendario, Proyectos, Cotizador y Control—. Si son más, se quedan las
   primeras cuatro y el quinto botón abre la hoja con lo que sobró —dirección: Mapa, Material,
   Mesa de corte, Vectorizador y Control—. Los nombres, los iconos y las líneas de la hoja son
   los de RUTAS: no hay una segunda lista que se pueda desincronizar, y un módulo nuevo aparece en
   la barra lateral, en la de abajo o en «Más» con el mismo renglón. */
const TOPE_BARRA = 5;

/** El reparto, sin tocar nada: las rutas visibles de un rol entran, y salen las que van en la
 *  barra y las que van dentro de «Más». Es la única regla de esta zona que se puede probar sin
 *  pintar, y por eso es una función con nombre y no un `if` metido en `pintarNav()`. */
export function repartirBarra(visibles, tope = TOPE_BARRA) {
  const orden = visibles.filter(r => r.movil).concat(visibles.filter(r => !r.movil));
  if (orden.length <= tope) return { barra: orden, mas: [] };
  return { barra: orden.slice(0, tope - 1), mas: orden.slice(tope - 1) };
}

/** Lo mismo, ya aplicado al rol de ahora. */
function rutasDeLaBarra() {
  return repartirBarra(rutasDeRol().filter(r => !r.oculto));
}

/* ----- P19 · LAS BARRAS SE PINTAN UNA VEZ -----
   `pintarNav()` reescribía las dos barras enteras en CADA montaje, así que las transiciones que
   `.pil` y `.pf-tab` declaran desde siempre no corrían nunca: el botón nuevo nacía ya encendido
   y la píldora aparecía de golpe en el destino. Ahora el marcado se escribe solo cuando cambia
   lo que tiene que haber —el rol cambió, o la lista de rutas del rol— y lo demás es mover `.on`
   y `aria-current`. Encima de eso, la pieza 2 desliza UNA marca del elegido anterior al nuevo:
   el filete en la barra lateral y la píldora del icono en la de abajo.

   `_navFirma` es lo que decide si hay que reescribir. Incluye el rol, las rutas visibles y las
   que caben en la barra: si una de las tres cambia, los botones son otros. */
let _navFirma = null;
let _fichaLat = null, _fichaAbajo = null;

function pintarNav() {
  /* Una ruta oculta prende la pestaña de su madre. Sin esto, estar en «Qué atender» dejaba
     la tira ENTERA apagada: la pantalla no dice dónde estás y la única salida visible es
     adivinar. Es el defecto que Ajustes ya tenía y que aquí se arregla para las dos. */
  const madre = (rutaPorNombre(_actual) || {}).padre || null;
  const activa = r => r.ruta === _actual || r.ruta === madre;
  const visibles = rutasDeRol().filter(r => !r.oculto);
  const { barra, mas } = rutasDeLaBarra();

  const firma = Prefs.rol() + '|' + visibles.map(r => r.ruta).join(',') + '|' + barra.map(r => r.ruta).join(',');
  if (firma !== _navFirma) { _navFirma = firma; escribirNav(visibles, barra, mas); }
  marcarNav(activa, mas);
}

function escribirNav(visibles, barra, mas) {
  /* Una barra nueva son globos nuevos y vacíos: lo que se recordaba de cada cuenta ya no es de
     nadie, y sin olvidarlo el primer llenado parecería una subida. `pintarCuentasNav()` corre
     justo después de montar, así que se vuelven a escribir sin saltar. */
  _cuentaAntes.clear();
  const nav = $('pf-nav');
  /* La tecla de cada pestaña es su lugar: solo hay atajo del 1 al 9, así que una décima ruta
     —hoy no hay— saldría con un «tecla 10» que no existe. */
  if (nav) nav.innerHTML = visibles.map((r, i) =>
    '<button type="button" class="pf-tab"' +
    ' data-ruta="' + r.ruta + '" aria-current="false"' +
    /* El nombre y el atajo los enseña la pieza 4 con su propio globo (P31); el `title` se
       queda como respaldo para quien navegue sin las piezas. La pieza lo aparta mientras el
       ratón está encima, para que los dos no se encimen. */
    (i < 9 ? ' data-nombre="' + esc(r.nombre) + '" data-tecla="' + (i + 1) + '" aria-keyshortcuts="' + (i + 1) + '"' +
             ' title="' + esc(r.nombre) + ' · tecla ' + (i + 1) + '">'
           : ' title="' + esc(r.nombre) + '">') +
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
  if (ab) {
    ab.innerHTML = barra.map(r =>
      '<button type="button"' +
      ' data-ruta="' + r.ruta + '" aria-current="false">' +
      '<span class="pil">' + ico(r.icono) +
      '<span class="cta" data-cta-movil="' + r.ruta + '" hidden></span></span>' +
      esc(r.nombre) + '</button>'
    ).join('') + (mas.length
      /* «Más» lleva su palabra debajo, como los otros cuatro: un icono de tres puntos solo no
         dice a dónde lleva, y a 360 px la palabra cabe (cada botón mide 72). Lo suyo es el globo,
         que SUMA los de las rutas que esconde —si Material tiene tres por comprar, esconderlo
         no puede esconder el tres— y el `aria-label`, que dice la suma porque el globo es
         `aria-hidden` (lo escribe `pintarCuentasNav`). */
      ? '<button type="button" class="pf-mas-btn" data-mas aria-haspopup="dialog" aria-expanded="false"' +
        ' aria-controls="pf-mas" aria-label="Más módulos" aria-current="false">' +
        '<span class="pil">' + ico('i-puntos') +
        '<span class="cta" data-cta-mas hidden aria-hidden="true"></span></span>Más</button>'
      : '');
  }

  /* La marca que se desliza (pieza 2). Se engancha una vez por barra: su observador ve el
     cambio de `aria-current`/`.on` que hace `marcarNav()` y una sola ficha viaja del botón que
     se apaga al que se enciende. En la de abajo lo que lleva el relleno no es el botón sino su
     `.pil`, y por eso se mide ésa. En reposo pintan las reglas de siempre, así que el filete
     de la barra lateral y la píldora azul siguen siendo los del CSS de este repo. */
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  if (P && P.fichaQueViaja) {
    if (!_fichaLat && nav) _fichaLat = P.fichaQueViaja(nav);
    if (!_fichaAbajo && ab) _fichaAbajo = P.fichaQueViaja(ab, { medir: b => b.querySelector('.pil') });
  }
  /* Los nombres con su tecla, en la barra lateral (P31). Delegada y una sola vez: los botones
     se reescriben debajo y la pieza los sigue. El nombre ya está escrito en cada pestaña —no
     es un icono solo—: lo que el globo añade es la TECLA, que hasta hoy vivía en un `title`
     nativo que tarda un segundo en salir, no tiene estilo y no existe con el dedo. Por eso
     `toque:false`: en un teléfono no hay teclado que enseñar. */
  if (P && P.nombres && nav && !_nombresLat) {
    _nombresLat = P.nombres(nav, {
      selector: '.pf-tab[data-tecla]', siempre: true, toque: false,
      texto: el => ({ nombre: el.dataset.nombre, tecla: el.dataset.tecla }),
    });
  }
}

/* ----- P5 · LA HOJA DE «MÁS» -----
   Una capa de las de siempre —`registrarCapa()`— y no un invento aparte: así Escape, el cerco
   del tabulador, el botón atrás del teléfono y el deslizar hacia abajo para cerrarla salen del
   mismo sitio que en la ficha de un proyecto, sin escribir aquí ni un oyente de `document`.

   La rejilla se arma en cada apertura y no una vez: las cuentas cambian solas, y una hoja que
   enseña «Material · 3 por comprar» tiene que decir la verdad en el momento en que se abre. */
function abrirMas() {
  const capa = $('pf-mas');
  const { mas } = rutasDeLaBarra();
  if (!capa || !mas.length) return;
  const fila = r => {
    const n = _cuentas.get(r.ruta) || 0;
    return '<li><button type="button" class="pf-mas-op" data-ruta="' + r.ruta + '"' +
      ' aria-label="' + esc(r.nombre) + (n ? ', ' + n + (n === 1 ? ' cosa que atender' : ' cosas que atender') : '') + '"' +
      (r.ruta === _actual ? ' aria-current="page"' : '') + '>' +
      ico(r.icono) +
      '<span class="pf-mas-n">' + esc(r.nombre) + '</span>' +
      '<small class="pf-mas-d">' + esc(r.sub || '') + '</small>' +
      (n ? '<span class="cta" aria-hidden="true">' + (n > 99 ? '99+' : n) + '</span>' : '') +
      '</button></li>';
  };
  capa.innerHTML = '<div class="pf-panel pf-mas-panel">' +
    '<div class="pf-panel-h"><h2 id="pf-mas-t">Más módulos</h2>' +
    '<button type="button" class="pf-cerrar" data-mas-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button></div>' +
    '<div class="pf-panel-b"><ul class="pf-mas-rej">' + mas.map(fila).join('') + '</ul></div></div>';
  capa.setAttribute('aria-labelledby', 'pf-mas-t');
  const btn = document.querySelector('#pf-abajo [data-mas]');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  abrirCapa('pf-mas', { hist: true });
}

function cerrarMas() {
  cerrarCapa('pf-mas');
  const btn = document.querySelector('#pf-abajo [data-mas]');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/** Mueve el encendido. Es lo único que corre en un cambio de pantalla. */
function marcarNav(activa, mas) {
  const enMas = mas.some(activa);
  for (const b of document.querySelectorAll('#pf-nav [data-ruta],#pf-abajo [data-ruta]')) {
    const r = rutaPorNombre(b.dataset.ruta);
    const on = !!r && activa(r);
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  }
  /* Estando en una pantalla que vive dentro de «Más», el que se enciende es «Más»: si no, la
     barra de abajo se queda entera apagada y no dice dónde estás. */
  const bm = document.querySelector('#pf-abajo [data-mas]');
  /* `true` y no `page`: «Más» no es la página, es el sitio donde está. */
  if (bm) { bm.classList.toggle('on', enMas); bm.setAttribute('aria-current', enMas ? 'true' : 'false'); }
}

/* El globo con los nombres y las teclas de la barra lateral (pieza 4, variante «nombres»). */
let _nombresLat = null;

/** En qué lugar de la barra está una ruta. −1 = no tiene sitio (las ocultas: «Qué atender» y
 *  Ajustes, que son de adentro y no un lugar al que ir de lado). */
function lugarEnLaBarra(ruta) {
  return rutasDeRol().filter(r => !r.oculto).findIndex(r => r.ruta === ruta);
}

/** De qué lado entra la pantalla, o '' si no tiene lado: sale de comparar los LUGARES en la
 *  barra, no de la historia —de Mapa a Tablero siempre es «hacia atrás», aunque se haya llegado
 *  a Mapa desde Proyectos—. Es aritmética pura: se puede probar sin pantalla. */
export function direccionDeEntrada(desde, hacia) {
  /* `Number.isInteger` y no `>= 0`: `null >= 0` es verdadero en JavaScript, y una ruta sin lugar
     entraría «hacia atrás» desde ninguna parte. */
  if (!Number.isInteger(desde) || !Number.isInteger(hacia) || desde < 0 || hacia < 0 || desde === hacia) return '';
  return hacia > desde ? 'adelante' : 'atras';
}

/** Pone `html.va-adelante` o `html.va-atras` y lo quita cuando la sección terminó de entrar. Si
 *  se quedara puesto, el siguiente montaje silencioso —la sincronización, cada 30 segundos—
 *  heredaría una dirección que nadie pidió.
 *
 *  CLASE y no `data-va`: `Piezas.transicion()` (pieza 22) ya escribe `html[data-va]` mientras
 *  dura el viaje de un mes del calendario o de una tarjeta, y una regla de `.pf-mod` colgada de
 *  ese atributo habría deslizado la pantalla ENTERA cada vez que alguien cambia de mes. Las
 *  clases `va-adelante` y `va-atras` ya existían en css/sistema.css para el cotizador, atadas a
 *  ids que este documento no tiene, así que aquí solo sirven a `.pf-mod`. */
function ponerDireccion(desde, hacia, seccion) {
  const h = document.documentElement;
  h.classList.remove('va-adelante', 'va-atras');
  const dir = direccionDeEntrada(lugarEnLaBarra(desde), lugarEnLaBarra(hacia));
  /* Con las teclas 1-9 no hay lado: lo que dispara el teclado se repite cien veces y no se anima
     (mismo criterio que el fundido de `.pf-mod`, ver `data-nav` en plataforma.css). */
  if (!dir || !seccion || h.dataset.nav === 'teclado') return;
  const clase = 'va-' + dir;
  h.classList.add(clase);
  const limpiar = () => {
    clearTimeout(reloj);
    seccion.removeEventListener('animationend', alFin);
    h.classList.remove(clase);
  };
  function alFin(ev) { if (ev.target === seccion) limpiar(); }
  seccion.addEventListener('animationend', alFin);
  /* Con movimiento reducido no hay animación y `animationend` no llega nunca: el respaldo lo
     quita igual. */
  const reloj = setTimeout(limpiar, 800);
}

/* ----- EL FLUJO ENTRE PANTALLAS -----
   Elías (octubre de 2026): «no se nota que haya un flujo entre pantallas». Y era cierto: la de
   antes se apagaba con `hidden` en el acto y la nueva se asomaba 12 px. Cambiar de pantalla se
   leía como un parpadeo, no como ir a otro lugar. Esto deshace a propósito el corte que dejó la
   auditoría de PR #71: lo pidió quien usa la app.

   Lo de antes SALE: se fotografía como un clon fijo en su sitio —la sección real se esconde
   como siempre, así que el router no cambia en nada— y se va hacia el lado contrario al que
   entra la nueva mientras se desvanece. El clon no lleva ids ni recibe toques, y se quita solo.
   Las pantallas con <iframe> (Cotizador, herramientas) no se clonan: clonar un marco lo vuelve a
   cargar entero. Con movimiento reducido o con las teclas 1-9, nada. */
const MS_SALE = 170;
function despedir(rAntes, dir) {
  const h = document.documentElement;
  if (!rAntes || h.dataset.nav === 'teclado') return;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (_) {}
  const s = $(rAntes.seccion);
  if (!s || s.hidden || !s.childNodes.length || s.querySelector('iframe')) return;
  const caja = s.getBoundingClientRect();
  if (!caja.width || caja.bottom < 0) return;
  const c = s.cloneNode(true);
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  c.setAttribute('aria-hidden', 'true');
  c.setAttribute('inert', '');
  c.className = 'pf-sale';
  c.style.cssText = 'top:' + caja.top + 'px;left:' + caja.left + 'px;width:' + caja.width + 'px;' +
    'height:' + Math.min(caja.height, window.innerHeight - caja.top) + 'px';
  /* Junto a la original y no al final del <body>: las reglas que dependen de dónde vive la
     sección (#pf-contenido, .pf-wrap) siguen alcanzando al clon, y no se corre de sitio. */
  s.after(c);
  const dx = dir === 'adelante' ? -36 : dir === 'atras' ? 36 : 0;
  const fin = 'translate(' + dx + 'px,' + (dx ? 0 : -8) + 'px)';
  let a = null;
  try {
    a = c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: fin }],
      { duration: MS_SALE, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  } catch (_) {}
  const quitar = () => c.remove();
  if (a && a.finished) a.finished.then(quitar, quitar); else setTimeout(quitar, MS_SALE);
  setTimeout(quitar, MS_SALE + 400);   // por si `finished` no llega nunca
}

/* `pf-llega` enciende la cascada de lo de dentro de la pantalla nueva (plataforma.css). Vive
   solo lo que dura la llegada: un remonte en silencio de 30 s después no debe volver a
   escalonar nada. Se quita en `rematar()`, con tiempo para que la cascada termine. */
let _llegaReloj = 0;
function marcarLlegada() {
  clearTimeout(_llegaReloj);
  document.documentElement.classList.add('pf-llega');
}
function terminarLlegada() {
  clearTimeout(_llegaReloj);
  _llegaReloj = setTimeout(() => document.documentElement.classList.remove('pf-llega'), 900);
}

/** Las cuentas de atención de la barra. Las publica cada módulo en este mapa. */
const _cuentas = new Map();
export function ponerCuenta(ruta, n) {
  _cuentas.set(ruta, Number(n) || 0);
  pintarCuentasNav();
}
/* Lo que valía cada cuenta la última vez que se pintó. Sirve para dos cosas y las dos importan:
   no saltar la PRIMERA —al arrancar, el globo pasa de vacío a «3» porque acaba de contar, no
   porque haya llegado algo, y un globo que salta sin que nadie haya hecho nada es movimiento
   sin acción— y saber si SUBIÓ, que es lo único que hace saltar el globo.

   Va en un mapa por ruta y no en el nodo: la barra se reescribe entera al cambiar de rol, y con
   el valor guardado en el `data-` de un botón que acaba de nacer, todas las cuentas parecerían
   haber subido de cero. */
const _cuentaAntes = new Map();

/* ----- P20 · el globo salta cuando la cuenta SUBE -----
   Una sola vez, y solo hacia arriba: cuando baja es porque alguien atendió algo y ya lo sabe.
   El salto es de 380 ms (`pf-globo-sube` en plataforma.css) y la clase se va sola al terminar,
   para que el siguiente aumento vuelva a dispararlo sobre el mismo nodo. Un cuadro de más
   —el `offsetWidth`— es lo que hace que el navegador lo vea como una animación nueva si el
   aumento llega antes de que acabara la anterior (dos avisos seguidos de otro teléfono).

   No rueda la cifra dentro del globo, y es a propósito: el globo mide 16 px y lleva uno o dos
   dígitos; un odómetro ahí no se lee y competiría con el salto por el mismo `transform`. Las
   cuentas que sí ruedan son las de dentro de cada pantalla (P18, más abajo). */
function globoSube(el) {
  clearTimeout(el._tSube);
  el.classList.remove('sube');
  void el.offsetWidth;
  el.classList.add('sube');
  /* `animationend` no llega si el aparato pide menos movimiento (no hay animación) ni si la
     pestaña está escondida: el reloj de 500 ms es el respaldo, y la clase no se queda pegada. */
  const quitar = () => { clearTimeout(el._tSube); el.classList.remove('sube'); };
  el.addEventListener('animationend', quitar, { once: true });
  el._tSube = setTimeout(quitar, 500);
}

function pintarCuentasNav() {
  const { mas } = rutasDeLaBarra();
  /* «Más» esconde módulos, no pendientes: su globo es la suma de los que esconde. */
  const filas = RUTAS.map(r => ({ ruta: r.ruta, nombre: r.nombre, n: _cuentas.get(r.ruta) || 0 }));
  const sumaMas = mas.reduce((t, r) => t + (_cuentas.get(r.ruta) || 0), 0);
  filas.push({ ruta: '__mas', nombre: 'lo que está en «Más»', n: sumaMas });

  for (const f of filas) {
    const sel = f.ruta === '__mas'
      ? '[data-cta-mas]'
      : '[data-cta="' + f.ruta + '"],[data-cta-movil="' + f.ruta + '"]';
    const primera = !_cuentaAntes.has(f.ruta);
    const antes = _cuentaAntes.get(f.ruta) || 0;
    const texto = f.n > 99 ? '99+' : String(f.n);
    for (const el of document.querySelectorAll(sel)) {
      /* Con el mismo número no se toca nada: reescribir el texto de un nodo que un lector de
         pantalla vigila lo vuelve a anunciar, y esto corre en cada `ponerCuenta`. */
      if (el.textContent !== texto) el.textContent = texto;
      el.hidden = f.n <= 0;
      if (f.ruta !== '__mas') {
        if (f.n > 0) el.setAttribute('aria-label', (f.n === 1 ? '1 cosa que atender en ' : f.n + ' cosas que atender en ') + f.nombre);
        else el.removeAttribute('aria-label');
      }
      if (!primera && f.n > antes && f.n > 0) globoSube(el);
    }
    _cuentaAntes.set(f.ruta, f.n);
  }
  /* El botón «Más» dice la suma con palabras: su globo es `aria-hidden` y sin esto un lector de
     pantalla oiría «Más módulos» sin saber que dentro espera algo. */
  const bm = document.querySelector('#pf-abajo [data-mas]');
  if (bm) bm.setAttribute('aria-label', 'Más módulos' + (sumaMas ? ', ' + sumaMas + (sumaMas === 1 ? ' cosa que atender' : ' cosas que atender') : ''));
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
  /* Otro rol es otra cuenta de todo —importes, pendientes—: rodar del número del rol anterior
     al del nuevo diría que algo cambió en el taller, y lo que cambió fue quién mira. */
  olvidarCifras();
  if (sigue && sigue.roles.includes(r)) montar(_actual, { forzar: true });
  else ir(rutasDeRol()[0].ruta);
  toast('Ahora ves la plataforma como ' + Prefs.ROL_NOMBRE[r], '', 3400);
}

/* ============================================================================
   P6 · Buscar un proyecto desde cualquier pantalla
   ============================================================================
   Para contestarle al cliente «¿cómo va mi letrero?» había que ir a Proyectos, escribir en su
   buscador y abrir la tarjeta: tres pasos y perder lo que estabas haciendo. La lupa del
   encabezado —y la tecla «/» en la computadora, al lado de los números 1-9 que ya cambian de
   módulo— abre una paleta que filtra en vivo y lleva a la ficha.

   Tres decisiones que no son de gusto:

   · LA BÚSQUEDA LA HACE `Proy.listar({texto})`, no un segundo buscador escrito aquí. Está
     prohibido a propósito (el comentario de js/datos/proyectos.js lo dice donde se filtra): dos
     implementaciones de «qué cuenta como coincidencia» empiezan el mismo día a dar dos
     respuestas, y la que está mal es siempre la que no se probó. Aquí solo se RESALTA lo que
     coincide, con Piezas.resaltar(), que es dibujo y no criterio.
   · NINGÚN IMPORTE en los resultados. Fabricación no ve dinero en toda la app y esta paleta se
     abre desde cualquier pantalla, también las suyas. El renglón lleva nombre, folio, etapa y
     fecha, que es lo que hace falta para contestar el teléfono.
   · ES UNA CAPA de las de siempre (`registrarCapa`), no un `<dialog>`: Escape, el cerco del
     tabulador, el botón atrás del teléfono y el deslizar hacia abajo salen del mismo registro
     que la ficha de un proyecto, sin un solo oyente de `document` escrito aquí.

   La espera de 220 ms es la misma que el buscador de Proyectos: se eligió midiendo cuánto
   tarda en escribirse un folio, y tener dos esperas distintas para la misma búsqueda se nota. */
const MS_BUSCA = 220;
const TOPE_BUSCA = 12;

let _bus = null;   // { reloj, activo, filas, q, insts }

function cerrarBuscador() {
  if (_bus) { clearTimeout(_bus.reloj); _bus = null; }
  cerrarCapa('pf-buscar');
}

function abrirBuscador() {
  const capa = $('pf-buscar');
  if (!capa || hayCapaAbierta()) return;
  /* El campo va ARRIBA, en la cabeza de la hoja, y la cuenta y la lista en su cuerpo: es la
     misma forma que las demás hojas (`.pf-panel-h` / `.pf-panel-b`), y por eso se baja con el
     dedo desde su asa como ellas y la lista solo se lleva el gesto cuando está arriba del todo.
     Sin cabecera de texto encima del campo: con el teclado abierto en un teléfono, cada renglón
     que se gasta antes del campo es un resultado menos a la vista. */
  capa.innerHTML =
    '<div class="pf-panel pf-buscar-panel">' +
      '<div class="pf-panel-h pf-buscar-cab">' +
        ico('i-buscar', 'pf-buscar-lupa') +
        '<input type="search" id="pf-buscar-q" class="pf-buscar-q" autocomplete="off" autocapitalize="off"' +
          ' spellcheck="false" enterkeyhint="go" placeholder="Cliente, folio o teléfono" aria-label="Buscar un proyecto"' +
          ' role="combobox" aria-expanded="true" aria-controls="pf-buscar-lista" aria-autocomplete="list">' +
        '<button type="button" class="pf-cerrar" data-buscar-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button>' +
      '</div>' +
      '<div class="pf-panel-b pf-buscar-cuerpo">' +
        '<p class="pf-buscar-cuenta" id="pf-buscar-cuenta" role="status" aria-live="polite">Escribe para buscar</p>' +
        '<ul class="pf-buscar-lista" id="pf-buscar-lista" role="listbox" aria-label="Proyectos"></ul>' +
      '</div>' +
    '</div>';
  /* Las fechas de instalación se leen UNA vez al abrir, en paralelo con lo que la persona tarde
     en teclear, y no en cada pausa: son las mismas para toda la sesión de búsqueda. */
  _bus = { reloj: 0, activo: -1, filas: [], q: null,
    insts: import('./datos/agenda.js').then(A => A.listar({ vivas: true })).catch(() => []) };
  abrirCapa('pf-buscar', { hist: true });
  const campo = $('pf-buscar-q');
  if (campo) {
    /* `abrirCapa` enfoca el primer control tocable en el siguiente cuadro; el primero de esta
       hoja es el campo, así que no hay que pelearse con él. */
    campo.addEventListener('input', () => {
      if (!_bus) return;
      clearTimeout(_bus.reloj);
      _bus.reloj = setTimeout(pintarBusqueda, MS_BUSCA);
    });
    campo.addEventListener('keydown', alTeclearBuscador);
  }
  pintarBusqueda();
}

/* Escape no se atiende aquí a propósito: lo cierra `vigilarCapas()` como a las demás capas, con
   su cierre sin animación para el teclado, y como corre después de este campo, su
   `preventDefault()` es el que evita que el navegador se coma el primer Escape vaciando el
   `type=search`. */
function alTeclearBuscador(ev) {
  if (!_bus) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    /* Las flechas no esperan los 220 ms: si se teclea y se baja enseguida, la lista que se
       recorre tiene que ser la de lo que ya se escribió. */
    if (_bus.reloj) { clearTimeout(_bus.reloj); _bus.reloj = 0; pintarBusqueda().then(() => moverActivo(ev.key === 'ArrowDown' ? 1 : -1)); }
    else moverActivo(ev.key === 'ArrowDown' ? 1 : -1);
    ev.preventDefault();
    return;
  }
  if (ev.key === 'Enter') {
    ev.preventDefault();
    if (_bus.reloj) { clearTimeout(_bus.reloj); _bus.reloj = 0; pintarBusqueda().then(() => abrirResultado(Math.max(0, _bus ? _bus.activo : 0))); }
    else abrirResultado(Math.max(0, _bus.activo));
  }
}

/** Mueve el resaltado de la lista con las flechas, dando la vuelta en los extremos. La primera
 *  flecha hacia abajo baja del que ya venía elegido (el primero) al segundo. */
function moverActivo(paso) {
  if (!_bus || !_bus.filas.length) return;
  _bus.activo = (_bus.activo + paso + _bus.filas.length) % _bus.filas.length;
  marcarBusqueda();
}

async function pintarBusqueda() {
  if (!_bus) return;
  _bus.reloj = 0;
  const campo = $('pf-buscar-q'), lista = $('pf-buscar-lista'), cuenta = $('pf-buscar-cuenta');
  if (!campo || !lista || !cuenta) return;
  const q = campo.value.trim();
  _bus.q = q;
  let filas = [], Proy = null;
  try {
    Proy = await import('./datos/proyectos.js');
    /* `vivos` deja fuera los cancelados: quien busca para contestarle a un cliente busca una
       obra que existe. La lápida se sigue viendo en Proyectos, que es donde significa algo. */
    filas = await Proy.listar(q ? { texto: q, vivos: true } : { vivos: true });
  } catch (e) {
    console.warn('no se pudo buscar', e);
    if (_bus && _bus.q === q) { cuenta.textContent = 'No se pudo leer la lista de proyectos'; lista.innerHTML = ''; }
    return;
  }
  const insts = await _bus.insts;
  /* Una carrera perdida: mientras se leía la base, la persona siguió tecleando y ya hay otra
     búsqueda en curso, o cerró la paleta. Lo que llega tarde no pinta. */
  if (!_bus || _bus.q !== q || !$('pf-buscar-lista')) return;
  filas = filas.slice(0, TOPE_BUSCA);
  _bus.filas = filas;
  _bus.activo = filas.length ? 0 : -1;
  /* La instalación viva más próxima de cada uno: la misma regla que la lista de Proyectos. */
  const cuando = new Map();
  for (const i of (insts || [])) {
    if (!i || !i.proyecto_id || !i.fecha) continue;
    const prev = cuando.get(i.proyecto_id);
    if (!prev || String(i.fecha) < String(prev)) cuando.set(i.proyecto_id, i.fecha);
  }
  cuenta.textContent = !q
    ? (filas.length ? 'Los últimos que se ganaron' : 'Todavía no hay proyectos')
    : filas.length
      ? filas.length + (filas.length === 1 ? ' proyecto' : ' proyectos')
      : 'Nada con «' + q + '». Prueba con el folio o con parte del teléfono.';
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  const marcar = t => (P && P.resaltar && q) ? P.resaltar(t || '', q) : esc(t || '');
  lista.innerHTML = filas.map((p, i) => {
    const etapa = Proy.ETAPA_NOMBRE[p.etapa] || p.etapa || '';
    const inst = cuando.get(p.id);
    const fecha = inst
      ? (p.etapa === 'instalado' || p.etapa === 'garantia' ? 'instalado ' : 'instala ') + fmtFechaDia(inst)
      : (p.fecha_ganado ? 'ganado ' + fmtFechaDia(p.fecha_ganado) : '');
    return '<li class="pf-buscar-op" id="pf-buscar-o' + i + '" role="option" aria-selected="false" data-i="' + i + '">' +
      '<span class="pf-buscar-n">' + marcar(p.nombre) + '</span>' +
      '<span class="pf-buscar-m">' +
        '<span class="pf-buscar-folio">' + marcar(p.folio_local || p.folio_global) + '</span>' +
        /* La misma píldora de etapa que la lista de Proyectos y la ficha: el ojo ya aprendió
           qué color es «armado» y aquí tiene que decir lo mismo. */
        (etapa ? '<span class="pf-etapa ' + esc(Proy.claseEtapa(p.etapa)) + '">' + esc(etapa) + '</span>' : '') +
        (fecha ? '<span class="pf-buscar-fecha">' + esc(fecha) + '</span>' : '') +
      '</span></li>';
  }).join('');
  marcarBusqueda();
}

function marcarBusqueda() {
  const lista = $('pf-buscar-lista'), campo = $('pf-buscar-q');
  if (!lista || !campo || !_bus) return;
  const ops = lista.querySelectorAll('[role="option"]');
  ops.forEach((li, i) => li.setAttribute('aria-selected', String(i === _bus.activo)));
  if (_bus.activo >= 0 && ops[_bus.activo]) {
    campo.setAttribute('aria-activedescendant', 'pf-buscar-o' + _bus.activo);
    ops[_bus.activo].scrollIntoView({ block: 'nearest' });
  } else campo.removeAttribute('aria-activedescendant');
}

async function abrirResultado(i) {
  if (!_bus) return;
  const p = _bus.filas[i];
  if (!p) return;
  cerrarBuscador();
  /* Y se ESPERA al atrás que la capa acaba de disparar para consumir su entrada de historial.
     `history.back()` es asíncrono, y escribir `location.hash` en el mismo tick aterriza en la
     entrada de abajo: la navegación se pierde entera y tocar un resultado no hace nada. Es el
     mismo cuidado que ya tiene `montarDeVerdad` cuando cancela una pregunta. */
  await trasElAtrasDeUnaCapa();
  /* El buzón de un solo uso, como desde cualquier otro módulo: Proyectos abre esa ficha al
     montar. Así no hay un segundo camino para abrir una ficha que se pueda desincronizar. */
  ctx.pasar('proyectos', { proyecto_id: p.id });
}

/* ============================================================================
   La banda de degradación
   ============================================================================ */

/* ----- P26 · LA BANDA ENTRA SIN EMPUJAR LA PANTALLA -----
   A mitad de sesión la banda aparecía de golpe —«Hay una versión nueva…»— y bajaba todo lo que
   había debajo justo cuando alguien iba a tocar un renglón. Dos cosas la arreglan:

     · Se despliega en 200 ms en vez de aparecer. No con `hidden`, que es `display:none` y de
       ahí no hay transición posible: la caja de fuera pasa de 0fr a 1fr y la banda de dentro
       queda recortada mientras tanto (ver index.html).
     · Y si la persona ya había bajado en la pantalla, se compensa el scroll con lo que mide la
       banda, así que lo que estaba leyendo se queda debajo del mismo dedo. Arriba del todo no
       hace falta: ahí el contenido crece hacia abajo y nada se mueve. Al recogerse pasa lo
       mismo al revés, y se compensa igual.

   La región viva NO se esconde ni se apaga mientras está recogida: sigue en el árbol de
   accesibilidad, vacía, y lo único que cambia es su texto. Un lector de pantalla anuncia con
   fiabilidad el texto que llega a una región que ya estaba; con `hidden` o `inert` que se
   quitan en el mismo cuadro en que se escribe, no siempre lo dice. El texto se vacía DESPUÉS de
   recogerse y no antes: vaciarlo antes deja media banda en blanco encogiéndose. */
let _bandaTimer = 0;
const MS_BANDA = 200;

/** Despliega o recoge la banda (`abre` true o false) y mueve el scroll lo que mide, en el MISMO
 *  paso. Con movimiento reducido, de un salto. Ella misma pone o quita la clase `abierta`:
 *  quien la llama ya no puede hacerlo en el orden equivocado (ver abajo).
 *
 *  El paso no lo pone un reloj sino la propia caja: en cada cuadro se lee cuánto mide YA la
 *  banda y el scroll se lleva esa misma fracción. Con un reloj de 200 ms lineal contra una
 *  transición que arranca rápido y frena (la curva `--ease-out`), la pantalla se adelantaba a
 *  media entrada —la banda a 75 % y el scroll a 25 %— y el contenido daba un salto hacia abajo
 *  justo antes de volver a su sitio: el tirón que esto viene a quitar. Leyendo la caja, las dos
 *  cosas van juntas con la curva que sea.
 *
 *  Y siempre con un scroll ABSOLUTO puesto DESPUÉS de haber forzado la maquetación, nunca con
 *  `scrollBy` antes de que la caja crezca. Chrome ya ancla el scroll por su cuenta —«scroll
 *  anchoring»: si crece algo arriba de lo que estás mirando, te baja el scroll lo mismo— y
 *  cuando el contenido de la pantalla tiene un ancla a la vista, la primera versión de esto
 *  (`scrollBy` y luego cambiar la clase) sumaba SU compensación a la del navegador: al abrir
 *  en movimiento reducido el contenido saltaba la altura de la banda hacia arriba, y al recogerla
 *  hacia abajo. Leer la maquetación primero deja que el ancla haga lo suyo, y poner después
 *  el valor final por encima de lo que haya hecho la deja sin efecto: gane quien gane, el
 *  resultado es el mismo. */
function moverBanda(caja, b, abre) {
  const y0 = window.scrollY;
  let alto = b.offsetHeight;
  try { alto += parseFloat(getComputedStyle(b).marginBottom) || 0; } catch (_) {}
  const cambiar = () => caja.classList.toggle('abierta', abre);
  /* Arriba del todo no hay nada que compensar: el contenido crece hacia abajo. */
  if (y0 <= 0 || alto <= 0) { cambiar(); return; }
  const sinMov = (window.Piezas && window.Piezas.sinMovimiento && window.Piezas.sinMovimiento()) ||
    (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* Recogerla no puede pedir más scroll hacia arriba del que hay. */
  const delta = abre ? alto : -Math.min(alto, y0);
  cambiar();
  if (sinMov) {
    void caja.offsetHeight;
    window.scrollTo(0, y0 + delta);
    return;
  }
  const t0 = performance.now();
  const paso = t => {
    const h = caja.getBoundingClientRect().height;
    const fraccion = Math.max(0, Math.min(1, abre ? h / alto : 1 - h / alto));
    window.scrollTo(0, y0 + delta * fraccion);
    /* Termina cuando la caja llegó, o al pasarse del tiempo por si la pestaña se escondió. */
    if (fraccion < 1 && t - t0 < MS_BANDA + 150) requestAnimationFrame(paso);
    else window.scrollTo(0, y0 + delta);
  };
  requestAnimationFrame(paso);
}

/* `texto` es TEXTO y se escapa; `html` es marcado y no. Antes había un solo campo,
   `texto`, y se metía crudo en el innerHTML. Hoy no se puede explotar —los cuatro que
   llaman a esto pasan literales de este archivo—, pero `ctx.banda` está en el contexto que
   reciben los seis módulos, y el día que uno pase el nombre de un proyecto o el motivo que
   escribió alguien, la banda lo interpreta como marcado. El camino por defecto tiene que
   ser el seguro; el crudo, el que hay que pedir a propósito.

   @param {{tono?:'av'|'mal', texto?:string, html?:string, accion?:{label:string,fn:Function}}|null} msg */
export function pintarBanda(msg) {
  const caja = $('pf-banda-caja'), b = $('pf-banda');
  if (!caja || !b) return;
  const cuerpo = msg ? (msg.html != null ? msg.html : (msg.texto != null ? esc(msg.texto) : '')) : '';
  clearTimeout(_bandaTimer);
  if (!cuerpo) {
    if (!caja.classList.contains('abierta')) { b.innerHTML = ''; return; }
    moverBanda(caja, b, false);
    _bandaTimer = setTimeout(() => { b.innerHTML = ''; }, MS_BANDA + 60);
    return;
  }
  const yaEstaba = caja.classList.contains('abierta');
  b.className = 'pf-banda' + (msg.tono === 'mal' ? ' mal' : '');
  b.innerHTML = ico('i-aviso') + '<span>' + cuerpo + '</span>' +
    (msg.accion ? '<button type="button" id="pf-banda-acc">' + esc(msg.accion.label) + '</button>' : '');
  if (msg.accion) { const x = $('pf-banda-acc'); if (x) x.onclick = msg.accion.fn; }
  /* Cambiar el texto de una banda que ya estaba puesta no la vuelve a desplegar ni mueve el
     scroll: no está entrando, está diciendo otra cosa. */
  if (yaEstaba) return;
  moverBanda(caja, b, true);
}

/** Lo que la plataforma tiene que decir de este dispositivo antes de que se le pregunte. */
function revisarDispositivo() {
  const e = DB.estado();
  if (!e.ok) {
    pintarBanda({ tono: 'mal', html: '<b>' + esc(DB.motivoTexto()) + '</b>',
      accion: { label: 'Recargar', fn: () => location.reload() } });
    return;
  }
  /* Una versión nueva que no se pudo poner sola porque había trabajo en medio (ver
     `registrarSW`). Va antes que la nota de la puerta porque recargar también resuelve esa, y
     porque mientras no se recargue, cada pantalla que se abra por primera vez llega de la
     versión nueva encima de la vieja. */
  if (_versionNueva) {
    pintarBanda({ texto: 'Hay una versión nueva de la app. Se pone sola en cuanto cambies de pantalla, o ahora:',
      accion: { label: 'Recargar', fn: recargarPorVersion } });
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
       · Y al entrar, los ochenta y tantos archivos empezaban a bajar JUSTO cuando la persona
         quería usarla, compitiendo con lo que estuviera haciendo. Se sentía lenta, y lo era.

     Aquí arriba se registra mientras la persona lee la pantalla de entrar, que es tiempo que
     de otro modo no se usa para nada. No hay nada que proteger retrasándolo: lo que guarda
     son los archivos de la app, que el servidor sirve públicamente a quien los pida; los
     datos del taller no pasan por aquí. */
  registrarSW();

  faseArranque('puerta');
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
    /* Ya hay derecho a pasar: fuera la antepuerta que js/tema.js puso antes del primer pintado. */
    document.documentElement.classList.remove('antepuerta');
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
  /* Las tres de este esqueleto van encima de las cinco de arriba, y entre ellas el orden da
     igual: se abren desde el encabezado o desde la barra de abajo, que quedan inertes en
     cuanto hay una capa puesta, así que nunca pueden apilarse una sobre otra. */
  registrarCapa('pf-buscar', () => cerrarBuscador());
  registrarCapa('pf-mas', () => cerrarMas());
  registrarCapa('pf-ios', () => cerrarCapa('pf-ios'));

  const seg = $('pf-rolseg');
  if (seg) seg.addEventListener('click', ev => {
    const b = ev.target.closest('[data-rol]'); if (b) cambiarRol(b.dataset.rol);
  });
  /* Las dos barras hablan el mismo idioma —`data-ruta`— así que el oyente es el mismo escrito
     dos veces y no dos manejadores distintos que se puedan desincronizar. */
  for (const id of ['pf-nav', 'pf-abajo']) {
    const nav = $(id);
    if (nav) nav.addEventListener('click', ev => {
      /* «Más» va primero: no lleva `data-ruta` porque no ES una ruta, es la puerta a las que no
         cupieron. */
      if (ev.target.closest('[data-mas]')) { abrirMas(); return; }
      const b = ev.target.closest('[data-ruta]'); if (b) ir(b.dataset.ruta);
    });
  }
  /* La hoja de «Más»: elegir una pantalla la cierra y navega. El cierre va ANTES de navegar
     —para que la entrada de historial de la capa se consuma antes de empujar la del módulo— y
     se ESPERA a que su `history.back()` aterrice: hecho en el mismo tick, el `location.hash`
     cae en la entrada de abajo y la navegación se pierde entera. */
  const mas = $('pf-mas');
  if (mas) mas.addEventListener('click', async ev => {
    if (ev.target === mas || ev.target.closest('[data-mas-cerrar]')) { cerrarMas(); return; }
    const b = ev.target.closest('[data-ruta]');
    if (!b) return;
    const destino = b.dataset.ruta;
    cerrarMas();
    /* Elegir la pantalla en la que ya se está —el Mapa desde el Mapa— solo cierra la hoja.
       `ir` sobre la ruta actual la vuelve a montar de cero (`forzar`), y eso aquí sería tirar
       lo que se estaba viendo y el scroll solo por haber abierto «Más» a mirar qué había. */
    if (destino === _actual) return;
    await trasElAtrasDeUnaCapa();
    ir(destino);
  });
  /* Dos puertas a Ajustes: la del pie de la barra lateral y la del encabezado del teléfono,
     donde la barra lateral no existe. */
  for (const id of ['pf-ajustes-btn', 'pf-cab-ajustes']) {
    const aj = $(id);
    if (aj) aj.onclick = () => ir('ajustes');
  }
  /* La lupa del encabezado (P6). */
  const lupa = $('pf-cab-buscar');
  if (lupa) lupa.onclick = () => abrirBuscador();
  const bus = $('pf-buscar');
  if (bus) bus.addEventListener('click', ev => {
    if (ev.target === bus || ev.target.closest('[data-buscar-cerrar]')) { cerrarBuscador(); return; }
    const li = ev.target.closest('[role="option"]');
    if (li) abrirResultado(Number(li.dataset.i));
  });
  /* El ratón elige lo que señala, como en cualquier paleta: así Enter siempre abre lo que está
     debajo del cursor y no lo que dejaron las flechas hace tres movimientos. */
  if (bus) bus.addEventListener('pointermove', ev => {
    const li = ev.target.closest('[role="option"]');
    if (!li || !_bus) return;
    const i = Number(li.dataset.i);
    if (i !== _bus.activo) { _bus.activo = i; marcarBusqueda(); }
  });
  for (const id of BOTONES_INSTALAR) { const ins = $(id); if (ins) ins.onclick = instalarApp; }
  const ios = $('pf-ios');
  if (ios) ios.addEventListener('click', ev => {
    if (ev.target === ios || ev.target.closest('[data-ios-cerrar]')) cerrarCapa('pf-ios');
  });
  pintarInstalar();

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
    /* «/» abre la búsqueda, con la misma guarda que los números: dentro de un campo una
       diagonal es una diagonal. Va aquí y no en su propio oyente para que la guarda sea
       literalmente la misma y no una copia que un día se separe. */
    if (ev.key === '/') { ev.preventDefault(); abrirBuscador(); return; }
    if (!/^[1-9]$/.test(ev.key)) return;
    const visibles = rutasDeRol().filter(r => !r.oculto);
    const r = visibles[Number(ev.key) - 1];
    if (!r) return;
    ev.preventDefault();
    /* Lo que dispara el teclado no se anima: ni el fundido de la pantalla. La marca se quita en
       cuanto vuelve el puntero (ver .pf-mod en plataforma.css). */
    document.documentElement.dataset.nav = 'teclado';
    ir(r.ruta);
  });
  window.addEventListener('pointerdown', () => { delete document.documentElement.dataset.nav; }, { passive: true, capture: true });

  faseArranque('base');
  await DB.abrir();
  /* La base que no abrió es un renglón rojo y no una palomita: la banda de arriba explica el
     porqué y aquí queda dicho DÓNDE se rompió el arranque. */
  if (!DB.estado().ok) fallarArranque('base', 'no abrió');
  _bandaLista = true;
  revisarDispositivo();

  /* Sembrar el catálogo y las constantes. Idempotente: no pisa lo que ya se editó. Va antes
     de montar cualquier módulo porque el de material sin catálogo es una pantalla vacía que
     no dice por qué está vacía. */
  if (DB.estado().ok) {
    try {
      faseArranque('catalogo');
      const Mat = await import('./datos/material.js');
      await Mat.sembrar();
    } catch (e) { console.warn('no se pudo sembrar el catálogo', e); }

    /* Drenar el buzón: lo que index.html marcó como ganado se convierte en proyecto. Va en
       el arranque y en cada evento 'storage', que es cuando el cotizador acaba de escribir
       en otra pestaña. */
    try {
      const r = await Cot.drenarBuzon();
      /* Un solo aviso: los dos salían en el mismo tick y el segundo tapaba al primero antes de
         que se pudiera leer. Si hubo de los dos, se dicen juntos. */
      const creados = r.creados ? (r.creados === 1 ? 'Se agregó 1 proyecto ganado' : 'Se agregaron ' + r.creados + ' proyectos ganados') : '';
      if (r.creados && !r.fallidos) toast(creados, 'ok', 4200);
      /* Y se dice qué hacer, que es lo que faltaba. No se manda a la bitácora: `drenarBuzon`
         no anota ahí sus fallos (ver js/datos/cotizador.js), así que ese destino era una
         puerta a un cuarto vacío. Los dos motivos reales son los que se nombran: la
         cotización se registró en otro teléfono y su folio no está en el historial de este
         —ese renglón ya no se reintenta—, o no hubo espacio y sí se reintenta al abrir. */
      if (r.fallidos) toast((creados ? creados + '. ' : '') + (r.fallidos === 1
        ? 'Hay 1 registro de venta que no se pudo convertir en proyecto'
        : 'Hay ' + r.fallidos + ' registros de venta que no se pudieron convertir en proyecto') +
        '. Si se registraron en otro teléfono, hay que ganarlos desde ahí; si no, se vuelve a intentar al abrir la plataforma.',
        'err', 7500);
    } catch (e) { console.warn('no se pudo drenar el buzón', e); }
  } else {
    /* Sin base no hay catálogo que sembrar ni buzón que drenar. El renglón lo dice en vez de
       quedarse girando: la banda roja de arriba ya explica el resto. */
    saltarArranque('catalogo', 'la base no abrió');
  }

  window.addEventListener('hashchange', () => montar(rutaDelHash()));
  faseArranque('pantalla', null, (rutaPorNombre(rutaDelHash()) || {}).nombre || '');
  await montar(rutaDelHash());
  quitarArranque();
  avisarActualizada();

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
  /* Con dos frenos, que faltaban. Sin ellos, con el token vencido y la sesión de Google
     muerta, CADA toque en cualquier botón abría otra ventana de Google: diez toques, diez
     ventanas. Uno por minuto como mucho —el mismo tope que js/datos/puente.js ya se pone— y,
     si la persona cerró la ventana o Google dijo que no, un buen rato sin volver a intentarlo:
     cerrarla ES la respuesta, y reabrírsela en el siguiente toque es no escucharla.

     Y al renovar, la vuelta a la hoja que el arranque no pudo dar (`reconfirmar`, en
     js/nucleo/puerta.js): sin ella el token se renovaba pero el pase no, y quien abre la app
     una vez al día veía a los 23 días «Llevas días sin señal…» teniendo señal. Va suelta: no
     se espera, no bloquea el clic. */
  document.addEventListener('click', async () => {
    /* Con la pantalla de entrar puesta, el clic es suyo: dos peticiones a Google a la vez se
       pisan la ventana. */
    if (document.documentElement.classList.contains('con-puerta')) return;
    const ahora = Date.now();
    if (ahora - _renovadoEn < MS_ENTRE_RENOVACIONES || ahora < _renovarDesde) return;
    try {
      const Ingreso = await import('./nucleo/ingreso.js');
      if (!Ingreso.configurado() || !Ingreso.correo() || Ingreso.dentro()) return;
      _renovadoEn = Date.now();
      const r = await Ingreso.renovar();
      if (r && r.ok) {
        sincronizarCallado();
        import('./nucleo/puerta.js').then(P => P.reconfirmar()).catch(() => {});
      } else if (r && r.codigo === 'DATO_INVALIDO') {
        /* Ventana cerrada, permiso negado u origen que Google no acepta: nada que un toque
           más vaya a arreglar. */
        _renovarDesde = Date.now() + MS_TRAS_NEGARSE;
      }
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
  if (!Prefs.hayPuente()) { Sync.registrar(null); pintarSync('quieto'); return false; }
  try {
    const Puente = await import('./datos/puente.js');
    Sync.registrar(Puente.desdePrefs());
    pintarSync('quieto');
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
/* Los frenos de la renovación por clic. Ver el oyente de `click` en el arranque. */
const MS_ENTRE_RENOVACIONES = 60000;
const MS_TRAS_NEGARSE = 10 * 60000;
let _renovadoEn = 0;
let _renovarDesde = 0;
let _sincronizando = null;
let _repintarDebe = false;

/* ----- P15 · EL INDICADOR DE SINCRONIZACIÓN -----
   La sincronización es muda a propósito —un aviso cada 30 segundos se aprende a ignorar— y por
   eso nadie sabía si el teléfono estaba al día antes de contestarle algo al cliente. Un glifo
   de 20 px en el encabezado lo dice, con una regla dura: NADA se mueve en reposo ni en las
   vueltas cortas.

     · quieto    — una nube, dibujada, sin animación. Es el estado normal.
     · trabaja   — el arco que gira, y SOLO si la vuelta pasa de un segundo. Las vueltas
                   normales tardan menos y no llegan a encenderlo, que es justo lo que se
                   quiere: una segunda pieza girando cada medio minuto sería otra cosa
                   moviéndose sola.
     · ok        — la palomita, unos segundos, y solo cuando BAJÓ algo. Si no bajó nada no hay
                   nada que decir.
     · sin señal — la nube tachada, quieta, en su tono de siempre. No es una falla —en una
                   azotea es lo normal y lo que se hace se guarda aquí— pero sí es la respuesta
                   a «¿esto que veo está al día?», que es para lo que existe el glifo: no lo
                   está. Tampoco se anuncia por voz: no es algo que haya que hacer.
     · mal       — la cruz, con el motivo en el `title`, y se queda hasta la siguiente vuelta
                   buena. Es lo único que se anuncia por voz, y solo al cambiar de estado: que
                   falle diez veces seguidas no son diez avisos.

   Sin puente configurado el glifo no existe: no hay nada con qué estar al día.

   El contenedor es la imagen —`role="img"` con la frase entera en su `aria-label`, que cambia
   con el estado— y las marcas de dentro son adorno: el color nunca va solo, y el lector de
   pantalla no recorre un glifo de 20 px. */
const MS_SYNC_LENTO = 1000;
const MS_SYNC_OK = 2600;
let _syncEstado = 'quieto', _syncOkReloj = 0;

/* Cuándo bajó la hoja por última vez en ESTE aparato, completa y sin error. «Al día» solo se
   dice si fue hace poco: en octubre de 2026 un aparato llevaba cinco días sin bajar —nadie había
   entrado con Google— y el glifo seguía diciendo «al día». */
const K_ULTIMA_BAJADA = 'al3d_pf_ultima_bajada';
let _ultimaBajada = (() => { try { return Number(localStorage.getItem(K_ULTIMA_BAJADA)) || 0; } catch (_) { return 0; } })();
let _driveOk = null;        // la última vez, ¿contestó Drive? (ver la vuelta de carpetas)

/** La frase de cada estado. Pura: de aquí salen el `title`, el `aria-label` y la voz. `ultima` es
 *  cuándo bajó la hoja por última vez (ms) y `ahora`, el reloj; sin `ultima` no se juzga. */
export function fraseDeSync(estado, motivo, ultima, ahora) {
  switch (estado) {
    case 'trabaja': return 'Sincronización: buscando lo que cambió';
    case 'ok': return 'Sincronización: llegó lo nuevo';
    case 'sin-senal': return 'Sin señal: lo que hagas se guarda aquí y se manda cuando vuelva';
    case 'mal': {
      /* El motivo puede llegar escrito como oración («No hay señal…», «La hoja no contestó»):
         pegado detrás de dos puntos va en minúscula, salvo una sigla («HTTP 500»). */
      const m = String(motivo || 'no se pudo');
      return 'Sincronización: ' + (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(m) ? m.charAt(0).toLowerCase() + m.slice(1) : m);
    }
    default: {
      const u = Number(ultima) || 0, t = Number(ahora) || 0;
      if (u && t && t - u > 10 * 60 * 1000) {
        return 'Sincronización: lo último de la hoja llegó el ' + new Date(u).toLocaleString('es-MX',
          { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      }
      return 'Sincronización: al día';
    }
  }
}

function pintarSync(estado, motivo) {
  const el = $('pf-sync');
  if (!el) return;
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  el.hidden = !Sync.configurado();
  clearTimeout(_syncOkReloj);
  const antes = _syncEstado;
  _syncEstado = estado;
  el.dataset.sync = estado;
  const frase = fraseDeSync(estado, motivo, _ultimaBajada, Date.now());
  el.title = frase;
  el.setAttribute('aria-label', frase);
  /* La marca solo existe cuando hay algo que decir con ella; en reposo y sin señal se ve la nube
     y la marca se queda en el DOM apagada por CSS. Quitarla y volver a crearla en cada vuelta
     sería redibujar un SVG dos veces por minuto para que nadie lo vea. */
  if (estado === 'trabaja' || estado === 'ok' || estado === 'mal') {
    if (P && P.marcaEstado) P.marcaEstado(el, estado, { tam: 20 });
  }
  if (estado === 'mal' && antes !== 'mal') voz(frase, true);
  if (estado === 'ok') _syncOkReloj = setTimeout(() => pintarSync('quieto'), MS_SYNC_OK);
}

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
  if (!Sync.configurado()) { pintarSync('quieto'); return; }
  if (navigator.onLine === false) { pintarSync('sin-senal'); return; }
  /* El arco solo si la vuelta se pasa del segundo. Con el reloj puesto aquí y no al empezar a
     pintar, una vuelta de 200 ms no lo enciende nunca. */
  const lento = setTimeout(() => pintarSync('trabaja'), MS_SYNC_LENTO);
  let falla = '', sinRed = false;
  /* La identidad NO se renueva aquí. Renovarla abre la ventana de Google, y esto corre solo,
     sin clic: el navegador la bloquearía cada 30 segundos. Se renueva en el siguiente clic
     —ver el oyente de `click` en el arranque— y mientras tanto la petición sale con el token
     de dispositivo si lo hay. */
  /* Lo que este teléfono SUBIÓ no cuenta como cambio. Contaba, y casi cualquier cosa que
     alguien hacía —marcar una etapa, apuntar un cobro— volvía en menos de 30 s como un
     remonte forzado de su propia pantalla: `desmontar()` le tiraba el filtro de etapa del
     Tablero, el día y «solo cobro» del Calendario, la ruta y el acomodo del Mapa. Lo subido ya
     está pintado —se pintó al escribirlo aquí—; lo único que puede cambiar la pantalla es lo
     que BAJA. */
  let movio = 0;
  try {
    /* `bombear()` no lanza: contesta un Resultado, y lo que falló va en `fallidas`. De ellas,
       las `rechazadas` son las que el otro lado dijo que no para siempre: ya están apartadas
       con su propio aviso en Ajustes, y una cruz en el encabezado cada 30 s por algo que no se
       va a arreglar solo es un aviso que se aprende a ignorar. Lo que sí es un fallo del
       indicador son las que se van a reintentar y todavía no salieron. */
    const b = await Sync.bombear();
    if (b && b.ok === false) falla = b.mensaje || 'no se pudo mandar lo que quedó';
    else if (b && b.valor && (b.valor.fallidas || 0) > (b.valor.rechazadas || 0)) {
      const n = b.valor.fallidas - (b.valor.rechazadas || 0);
      falla = 'no se pudo mandar ' + (n === 1 ? '1 cambio' : n + ' cambios');
    }
  } catch (e) { falla = (e && e.message) || 'no se pudo mandar lo que quedó'; }
  /* Página por página mientras el Worker diga que hay más, con tope: las 199 filas anteriores
     a la plataforma van primero en el orden por edición y con una sola página por apertura
     hacían falta cuatro aperturas para llegar a las nuevas. */
  try {
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const r = await Sync.jalar();
      if (!r.ok) {
        /* `SIN_RED` es el código con que `jalar()` dice «no llegué a la hoja», con señal del
           teléfono o sin ella: es el mismo caso que apagar los datos, y se pinta igual. Los
           demás códigos —el puente contestó que no, el pase venció— sí son una cruz. */
        if (r.codigo === 'SIN_RED') sinRed = true; else falla = r.mensaje || 'la hoja no contestó';
        break;
      }
      movio += (Number(r.valor.nuevos) || 0) + (Number(r.valor.actualizados) || 0);
      if (!r.valor.hay_mas) break;
    }
  } catch (e) { falla = (e && e.message) || 'la hoja no contestó'; }
  if (!falla && !sinRed) {
    _ultimaBajada = Date.now();
    try { localStorage.setItem(K_ULTIMA_BAJADA, String(_ultimaBajada)); } catch (_) {}
  }
  /* La carpeta de los diseños, después de la hoja: con los proyectos ya al día. Casi siempre
     contesta de su caché; en el teléfono de Dirección abre la carpeta que le falte a un proyecto
     del taller. Va en su propio try: Drive no le pone una cruz a la sincronización de la hoja. */
  if (!sinRed) {
    try {
      const c = await Carpetas.alDia(await DB.listar('proyectos'), Prefs.rol());
      if (c.cambio) _repintarDebe = true;
      /* Que Drive deje de contestar —o vuelva— también se repinta: Proyectos lo dice en un
         renglón (`pintarAvisoDrive`), y en el arranque esa pantalla se pintó antes de que hubiera
         puente, así que sin esto el aviso no salía nunca. */
      if (c.ok !== _driveOk) { _driveOk = c.ok; _repintarDebe = true; }
      if (c.creadas.length) {
        toast(c.creadas.length === 1 ? 'Se abrió en Drive la carpeta «' + c.creadas[0] + '»'
          : 'Se abrieron en Drive ' + c.creadas.length + ' carpetas de proyectos en fabricación', 'ok', 4200);
      }
    } catch (e) { console.warn('carpetas', e); }
    /* Los links cortos de Maps que se guardaron sin señal («Se ganó», «Completar», el panel del
       Mapa): con la hoja ya contestando, se le pide que los siga y el proyecto recibe su pin.
       Idempotente —lo que ya tiene pin no entra— y con tope por vuelta (ver
       `resolverLinksPendientes`). En su propio try, como Drive. */
    try {
      const Proy = await import('./datos/proyectos.js');
      const r = await Proy.resolverLinksPendientes(Sync.expandir);
      if (r && r.ok && r.valor.resueltos) {
        _repintarDebe = true;
        toast(r.valor.resueltos === 1 ? 'Se leyó un link de Maps que estaba pendiente: el proyecto ya tiene su pin'
          : 'Se leyeron ' + r.valor.resueltos + ' links de Maps pendientes: esos proyectos ya tienen pin', 'ok', 4200);
      }
    } catch (e) { console.warn('links de Maps', e); }
  }
  clearTimeout(lento);
  /* La palomita solo cuando BAJÓ algo. Una vuelta que no trajo nada terminó bien y no tiene
     nada que decir: volver a la nube ES decirlo. */
  pintarSync(sinRed ? 'sin-senal' : falla ? 'mal' : (movio ? 'ok' : 'quieto'), falla);
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
/* La versión nueva ya controla la página y está esperando a que se recargue. Lo lee
   `revisarDispositivo`, que es quien lo dice en la banda. */
let _versionNueva = false;

/* ----- A22 · Y AL VOLVER, DECIRLO -----
   La versión nueva recarga la página sola, y quien la estaba usando ve un parpadeo entero sin
   explicación —puede ser delante del cliente—. La página que se va no puede avisar de nada: se
   va. Así que deja una marca y el arranque de la que llega la lee, la borra y lo dice en un
   aviso breve, de los que se despiden deslizando (pieza 12).

   `sessionStorage` y no `localStorage`: es de ESTA pestaña y de este momento, y una marca que
   sobreviviera a cerrar la app diría «se actualizó» un día después. Y lleva la HORA y no un
   «sí»: si la recarga se cancela —un `beforeunload` que pregunta si de verdad quieres salir—
   la marca se queda escrita, y sin caducidad el aviso saldría en la siguiente recarga, que
   quizá ni es de versión. Pasado un minuto ya no vale.

   El número de versión no se pone: esta página no conoce APP_VERSION, y un número inventado en
   un aviso es peor que ningún número. Tampoco sale en la primera instalación: ahí el `claim()`
   del worker recién instalado no recarga nada (`ignorarUno` en `registrarSW`), así que la marca
   ni se escribe. */
const MARCA_ACTUALIZADA = 'al3d_pf_actualizada';
const MS_MARCA_ACTUALIZADA = 60000;

/** Recarga la página dejando dicho que fue por una versión nueva. La usan las dos puertas:
 *  la recarga sola de `registrarSW` y el botón «Recargar» de la banda. */
function recargarPorVersion() {
  try { sessionStorage.setItem(MARCA_ACTUALIZADA, String(Date.now())); } catch (_) {}
  location.reload();
}

/** Lo dice una vez y borra la marca. Se llama con la primera pantalla ya pintada: un aviso
 *  encima del esqueleto del arranque se lo lleva por delante el primer repintado. */
function avisarActualizada() {
  let hubo = false;
  try {
    const marca = sessionStorage.getItem(MARCA_ACTUALIZADA);
    if (marca == null) return;
    sessionStorage.removeItem(MARCA_ACTUALIZADA);
    hubo = Date.now() - Number(marca) < MS_MARCA_ACTUALIZADA;
  } catch (_) { return; }
  if (hubo) toast('Se puso la versión nueva de la app', 'ok', 5000);
}

/* ¿Recargar ahora tiraría algo? Una capa abierta —una ficha a medio llenar, una pregunta—, un
   campo con el foco, el foco DENTRO de un marco —ahí `activeElement` es el <iframe>, no el
   campo, y por eso se escapaba: se trabajaba en el Cotizador y la página se recargaba en
   seco— o un marco vivo que diga tener algo sin guardar. */
function estorbaRecargar() {
  if (hayCapaAbierta()) return true;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(a.tagName))) return true;
  return [..._vivas.keys()].some(marcoConPendiente);
}

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  /* ----- La versión nueva se pone sola -----
     El service worker nuevo se instala por detrás y toma el control (skipWaiting + claim),
     pero la página que ya estaba abierta sigue corriendo el código viejo hasta que alguien
     recarga. En la práctica eso era «subí los cambios y sigo viendo lo de antes». Así que
     cuando el control cambia de manos se recarga UNA vez.

     Menos el PRIMER cambio de una página que abrió sin controlador —la primera visita, o una
     recarga forzada—: ése es el `claim()` del worker que se acaba de instalar, y lo que hay en
     memoria vino de la red, así que no hay nada viejo. Aquí se calculaba `habia` una vez al
     arrancar y con él se ignoraban TODOS los cambios de esa vida de la página, también los
     de las versiones que se publicaran después: la app seguía con los módulos viejos en
     memoria y cada import() dinámico llegaba de la versión nueva. Se ignora uno, no todos. */
  let ignorarUno = !navigator.serviceWorker.controller;
  let recargado = false, aplazada = false;
  const recargar = () => { if (recargado) return; recargado = true; recargarPorVersion(); };
  /* En la siguiente pausa natural: al cambiar de pantalla —que desmonta lo que había de
     todos modos— o al irse la app a segundo plano. Y solo si en ese momento ya no estorba. */
  const enLaPausa = () => { if (!recargado && !estorbaRecargar()) recargar(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (ignorarUno) { ignorarUno = false; return; }
    if (recargado) return;
    /* Si alguien está trabajando, no se le tira. Pero tampoco se olvida: aquí decía «entra en
       la siguiente apertura», y mientras tanto el worker nuevo ya controla la página y la
       siguiente pestaña que se abre importa su módulo de la caché NUEVA contra los viejos que
       siguen en memoria — la mezcla de versiones que la cabecera de sw.js existe para evitar.
       Una pantalla de marco en pantalla también espera aunque nada diga estar en riesgo: se
       está trabajando ahí dentro, y la pausa natural llega enseguida. */
    const deMarco = !!(rutaPorNombre(_actual) || {}).conservar;
    if (!deMarco && !estorbaRecargar()) { recargar(); return; }
    if (aplazada) return;
    aplazada = true;
    /* Mientras tanto se dice, con el botón para no esperar. */
    _versionNueva = true;
    if (_bandaLista) revisarDispositivo();
    window.addEventListener('hashchange', enLaPausa);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') enLaPausa();
    });
  });
  try {
    navigator.serviceWorker.register('sw.js').then(reg => {
      /* La recarga forzada también abre sin controlador, pero con un worker YA activo: ése no
         va a hacer `claim()` otra vez, así que el primer cambio que llegue será de una versión
         publicada después, y ése no se ignora. En la primera visita todavía no hay ninguno
         activo cuando esto contesta. Equivocarse aquí cuesta como mucho una recarga de más. */
      if (reg && reg.active && !navigator.serviceWorker.controller) ignorarUno = false;
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

/* ----- Instalar la app -----
   El manifiesto ya la hacía instalable, pero el único camino era el menú del navegador, que
   nadie abre. Chrome avisa que se puede con `beforeinstallprompt`; se guarda el aviso y un
   botón lo usa. iPhone no tiene ese evento: ahí el botón explica los dos toques de Safari. Ya
   instalada —pantalla completa—, el botón no aparece.

   Son DOS botones, uno por ancho, como Ajustes. Había uno solo, al pie de la barra lateral, y
   la barra lateral no existe por debajo de 760 px: en el teléfono —que es donde se usa la
   app— no había forma de instalarla. Y peor: el `preventDefault()` de abajo, que es lo que
   guarda el aviso para el botón, en Chrome de Android apaga TAMBIÉN la mini-barra propia del
   navegador, así que se quitaba el único camino que quedaba para ofrecer uno que no se veía.
   Ahora el del teléfono va en el encabezado, junto a Ajustes, y el aviso solo se aparta si
   hay un botón a la vista que lo vaya a usar. */
let _instalar = null;
const instalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const BOTONES_INSTALAR = ['pf-instalar', 'pf-cab-instalar'];
/* El botón que se ve a este ancho: el del encabezado en el teléfono, el de la barra lateral
   en la computadora. El corte es el mismo 760 de css/plataforma.css. */
function botonDeInstalar() {
  const movil = !!(window.matchMedia && matchMedia('(max-width: 759px)').matches);
  return $(movil ? 'pf-cab-instalar' : 'pf-instalar');
}
function pintarInstalar() {
  const ocultar = instalada() || !(_instalar || esIOS());
  for (const id of BOTONES_INSTALAR) { const b = $(id); if (b) b.hidden = ocultar; }
}
window.addEventListener('beforeinstallprompt', ev => {
  /* Sin botón que lo use, el navegador se queda con su propio aviso. */
  if (!botonDeInstalar()) return;
  ev.preventDefault(); _instalar = ev; pintarInstalar();
});
window.addEventListener('appinstalled', () => { _instalar = null; pintarInstalar(); toast('La app quedó instalada', 'ok', 3000); });
/* ----- A18 · LOS DOS PASOS DE SAFARI, DIBUJADOS -----
   En iPhone no existe `beforeinstallprompt` y lo único que se puede hacer es enseñar el gesto.
   Se explicaba con un aviso de nueve segundos que se iba solo mientras la persona buscaba el
   botón de Compartir en la barra de Safari — o sea que el texto desaparecía justo cuando hacía
   falta. Ahora es una hoja que se queda hasta que se cierra, con los dos pasos como riel
   (pieza 16) y el icono de cada uno dibujado: el cuadrado con la flecha de Compartir y el
   cuadrado con el más de «Agregar a inicio».

   Los dos SVG van en línea y no en el sprite de arriba: son dibujos de la interfaz de OTRA app
   —Safari— y no iconos de ésta; mezclarlos con los 31 del repo invitaría a usarlos en un botón.

   La flecha que dice DÓNDE está el botón depende del aparato, y por eso no es una imagen fija:
   en el iPhone Compartir vive en la barra de abajo, y allí apunta la flecha; en el iPad vive
   arriba, junto a la dirección, y ahí no se dibuja flecha hacia abajo —sería señalar un sitio
   equivocado— sino que la nota lo dice con palabras. En las versiones de iOS con la barra
   compacta, Compartir cuelga del menú «•••»: la nota lo dice también, porque es lo primero que
   la persona no encuentra.

   Los dos pasos son «pendiente» y no «actual/hecho»: esto es una instrucción, no un progreso, y
   pintar el primero como el paso en que se va sería afirmar algo que la app no puede saber. */
const G_COMPARTIR = '<svg class="pf-ios-g" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 3v11"/><path d="M8.4 6.6 12 3l3.6 3.6"/><path d="M7 10.5H5.6A1.6 1.6 0 0 0 4 12.1v7.3A1.6 1.6 0 0 0 5.6 21h12.8a1.6 1.6 0 0 0 1.6-1.6v-7.3a1.6 1.6 0 0 0-1.6-1.6H17"/></svg>';
const G_AGREGAR = '<svg class="pf-ios-g" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3.5" y="3.5" width="17" height="17" rx="4.2"/><path d="M12 8.2v7.6M8.2 12h7.6"/></svg>';
const G_ABAJO = '<svg class="pf-ios-g" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 4v14"/><path d="M6.5 12.8 12 18.4l5.5-5.6"/></svg>';
const esIPad = () => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function abrirPasosIOS() {
  const capa = $('pf-ios');
  if (!capa) {
    toast('En iPhone: toca Compartir y luego «Agregar a inicio». Queda como app, a pantalla completa.', '', 9000);
    return;
  }
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  const ipad = esIPad();
  const pasos = [
    { texto: 'Toca Compartir',
      nota: ipad ? 'El cuadro con la flecha hacia arriba, arriba en Safari, junto a la dirección.'
                 : 'El cuadro con la flecha hacia arriba, en la barra de abajo de Safari. Si no lo ves, toca ••• primero.',
      estado: 'pendiente',
      extra: '<span class="pf-ios-ico">' + G_COMPARTIR + '</span>' + (ipad ? '' : '<span class="pf-ios-abajo">' + G_ABAJO + '</span>') },
    { texto: 'Toca «Agregar a inicio»', nota: 'Está en la lista que sale, más abajo. Puede decir «Añadir a pantalla de inicio».',
      estado: 'pendiente', extra: '<span class="pf-ios-ico">' + G_AGREGAR + '</span>' },
  ];
  const riel = (P && P.rielHTML)
    ? P.rielHTML(pasos, { etiqueta: 'Instalar en ' + (ipad ? 'este iPad' : 'este iPhone') })
    : '<ol class="pf-ios-simple">' + pasos.map(x => '<li><b>' + esc(x.texto) + '</b><span>' + esc(x.nota) + '</span></li>').join('') + '</ol>';
  capa.innerHTML = '<div class="pf-panel pf-ios-panel">' +
    '<div class="pf-panel-h"><h2 id="pf-ios-t">Dejar la app en la pantalla de inicio</h2>' +
    '<button type="button" class="pf-cerrar" data-ios-cerrar aria-label="Cerrar">' + ico('i-cerrar') + '</button></div>' +
    '<div class="pf-panel-b">' + riel +
    '<p class="pf-nota">Queda con su icono y se abre a pantalla completa, sin la barra del navegador. ' +
    'Es la misma app: no se descarga nada.</p></div>' +
    '<div class="pf-panel-f"><button type="button" class="btn btn-pri" data-ios-cerrar>Entendido</button></div></div>';
  capa.setAttribute('aria-labelledby', 'pf-ios-t');
  abrirCapa('pf-ios', { hist: true });
}

async function instalarApp() {
  if (_instalar) {
    const ev = _instalar; _instalar = null;
    try { ev.prompt(); await ev.userChoice; } catch (_) {}
    pintarInstalar();
    return;
  }
  abrirPasosIOS();
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
