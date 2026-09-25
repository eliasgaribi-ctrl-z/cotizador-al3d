/* ============================================================================
   Cotizador · arranque.js

   El arranque. Va al FINAL: init() llama a funciones de todos los archivos anteriores, y en un script clásico solo están definidas las que ya se cargaron.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   162 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Init ===================== */
function hoy(){return new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});}
function init(){
  loadLogo();
  aiKeyFallback();
  /* La preferencia de plegado ya no se lee: con los datos del cliente en su propia
     pantalla, plegarlos la deja en blanco, y el botón que los volvía a abrir se fue con
     ella. Quien tuviera guardado un «1» de antes abriría a una tarjeta cerrada y sin
     manera de abrirla. */
  _foldProy=false;
  /* La clave que guardaba esa preferencia dejó de escribirse; la que quedó en los teléfonos
     de antes se limpia aquí para que no viaje para siempre sin que nadie la lea. */
  try{ localStorage.removeItem('al3d_fold_proy'); }catch(_){}
  if(!loadState()){
    Q.folio=nextFolio(); pintarFolio();
    Q.fecha=hoy(); addItem({enfocar:false,heredar:true});
  } else {
    /* El rol se guarda con la cotización: hay que dejar el segmento de arriba
       marcando el mismo rol que está pintando el panel de autorización. */
    setRol(Q.rol==='autorizador'?'autorizador':'vendedor');
    pintarFolio();
    updMaps(Q.maps||'');
    if(Q.dirRaw) updDirRaw(Q.dirRaw);
    sincronizarPlegado();
    renderItems();
  }
  /* Fuera del if/else y siempre: marca la sesión también cuando no había nada que restaurar,
     que es lo que hace que la recarga siguiente se reconozca como la misma sesión. */
  separarDeLaCotizacionAnterior();
  pintarClientes();
  aplicarFoldProy();
  ajustarTopbarMovil();
  ajustarPliegue();
  aplicarBlurPrecios();
  /* En #items y no en cada partida: renderItems reescribe su contenido entero en cada
     repintado, así que un oyente colgado de una partida se iría con ella. */
  const _items=$('items'); if(_items) _items.addEventListener('click',_candTocarPartida);
  /* La pantalla se deduce de lo que hay: con los tres datos puestos se estaba cotizando y se
     abre en partidas; sin ellos, en cliente. Va al final, cuando Q ya está cargado. */
  _pantalla=pantallaSegunDatos(); pintarPantalla();
  /* La semilla del historial de pantallas. Son DOS entradas cuando se arranca en partidas —la
     de cliente debajo— para que el primer atrás lleve a Cliente y no fuera de la app: al
     recargar sobre una cotización empezada, «atrás» tiene que devolver a la pantalla anterior,
     que es lo que hace en cualquier otra app. scrollRestoration en manual porque el scroll de
     cada pantalla lo guardamos nosotros dentro de la entrada. */
  try{ history.scrollRestoration='manual'; }catch(_){}
  try{
    history.replaceState({cot:1,pantalla:'cliente',y:0},'');
    if(_pantalla==='partidas') history.pushState({cot:1,pantalla:'partidas',y:0},'');
  }catch(_){}
  renderMobileBar();
  updProg();
  /* Quién eres decide si hay botón de Autorizador, y lo que se pidió a dirección antes de
     cerrar la app se sigue esperando al volver a abrirla (notario.js). */
  pintarRolDisponible();
  if(_foliosEsperando().length) setTimeout(consultarSolicitudes,1200);
  /* Al final: loadState(), la partida en blanco del arranque y los repintados de arriba
     pasaron por saveState() y habrían dejado pasos en la pila. Nada de eso lo hizo el
     usuario, así que la app abre sin nada que deshacer. */
  undoBarrera();
  registrarSW();
  /* La app ya está pintada con sus datos: se quita el esqueleto del arranque y se enseña lo
     de verdad (la clase la pone el primer <script> del body; css/sistema.css hace el resto).
     Si algo de arriba reventó antes de llegar aquí, el propio error la quitó —el oyente de
     'error' de ese script— y si no, el tope de ocho segundos. Va ANTES de ofrecer la
     restauración pendiente porque pruebas/respaldo.mjs exige que esa oferta sea lo último de
     init(): es la tarjeta que se inserta al principio del contenido, y todo esto es síncrono,
     así que el orden entre las dos no cambia ni un cuadro de lo que se ve. */
  document.documentElement.classList.remove('arrancando');
  const _arr=$('arranque'); if(_arr) _arr.remove();
  ofrecerRestauracionPendiente();
}
/* ----- La cotización de ayer no es la de hoy -----
   Aquí se decide qué pasa con lo que `loadState()` acaba de devolver, y la decisión depende
   de una sola cosa: si esta carga es una RECARGA de la sesión que ya estaba —ahí no se toca
   nada y no se dice nada, que es para lo que existe el autoguardado— o si la app se está
   ABRIENDO, que es cuando empieza un trabajo nuevo. La diferencia la contesta `sesionNueva()`
   (ver su comentario en historial.js, con el porqué de todo esto).

   Al abrir, dos caminos y ni uno más:

   · Lo que hay en pantalla ya está guardado en otro sitio y dice lo mismo —una autorizada
     vive en el historial— : la app empieza EN BLANCO. No se pierde nada y se comprueba antes
     de soltarlo: el aviso nombra dónde quedó y trae «Deshacer», y el historial es donde vive
     lo terminado. Una cotización autorizada ya cumplió; lo que sigue después de ella es otra
     cotización, no más partidas encima de la suya.
   · Es la única copia —un borrador a medias, una rechazada, una pendiente— : no se toca ni
     una letra. Se queda en pantalla con el aviso de `pintarAvisoDeAntes()`, que dice de quién
     es y ofrece empezar una nueva de un toque.

   Y si no hay nada capturado, no hay nada que decir: la app abre como abrió siempre. */
function separarDeLaCotizacionAnterior(){
  if(!sesionNueva()) return;
  /* Una partida en blanco es la que siembra el propio arranque: no es trabajo capturado. */
  if(!hayDatosCliente()&&!Q.items.some(it=>!itemVacio(it))) return;
  const folio=Q.folio, quien=(Q.cliente||'').trim();
  if(copiaGuardadaDeQ()){
    /* `nueva()` deja su copia para deshacer y su propio aviso; el de aquí lo reemplaza
       porque «Cotización vaciada» no dice lo único que hay que saber: dónde quedó la que
       estaba. El botón es el mismo. */
    nueva();
    toast(folio+(quien?' · '+quien:'')+' ya estaba guardada en el historial — ésta empieza en blanco como '+Q.folio,
      '',9000,_vaciada?{label:'Deshacer',fn:deshacerVaciado}:null);
    return;
  }
  marcarComoDeAntes({folio,cliente:quien,proy:(Q.proy||'').trim(),fecha:Q.fecha||''});
}

/* El service worker guarda una copia de la app para que abra sin señal. Va al final del
   arranque y en su propio try: si el navegador no lo soporta —o el sitio se abrió como
   file:// para probarlo— no puede estorbar a nada de lo de arriba. */
function registrarSW(){
  if(!('serviceWorker' in navigator)) return;
  if(location.protocol!=='http:'&&location.protocol!=='https:') return;
  try{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch(_){}
}

/* ----- Dos pestañas sobre el mismo almacenamiento -----
   No había nada que lo notara: cada pestaña guarda en cada tecla, así que la última en
   escribir se llevaba lo de la otra y ninguna se enteraba. Fusionar dos cotizaciones
   distintas no es cosa que la app pueda resolver sola, pero dejar de hacerlo en silencio
   sí. El evento 'storage' solo llega a las OTRAS pestañas, que es justo a quienes hay que
   avisar; se avisa una vez por sesión para no convertirlo en ruido. */
let _avisoOtraPestana=false;
window.addEventListener('storage',ev=>{
  /* Lo escribió la otra pestaña: los cuadernos que hay en memoria son de antes. */
  if(ev.key==='al3d_historial') invalidarCuadernos();
  if(!ev.key||['al3d_q','al3d_historial','al3d_queue'].indexOf(ev.key)<0) return;
  if(_avisoOtraPestana) return;
  _avisoOtraPestana=true;
  toast('El cotizador está abierto en otra ventana y acabó de guardar ahí. Para no pisar ese trabajo, usa una sola.','err',10000,
    {label:'Recargar',fn:()=>location.reload()});
});

window.addEventListener('beforeunload',e=>{
  // La cotización se guarda sola y se restaura al reabrir, y ahora la imagen analizada
  // también. Solo queda algo que perder cuando esa imagen NO alcanzó a guardarse —por
  // tamaño o por falta de espacio—, así que el aviso aparece nada más en ese caso.
  /* También hay que avisar cuando la cotización dejó de guardarse por falta de espacio, y
     cuando hay medidas del escalador sin usar: SC vive solo en memoria y no se persiste,
     así que una recarga se las llevaba sin preguntar. */
  const hayMedidas=(typeof SC!=='undefined')&&SC.img&&SC.items&&SC.items.length>0;
  /* Que no haya cabido en su clave aparte no quiere decir que se vaya a perder: una
     cotización ya autorizada tiene su copia en el historial —y las que vuelven del historial
     entran por ahí—. Avisar en ese caso es espantar por una pérdida que no existe, y un
     aviso que salta de más deja de leerse justo cuando sí importa. */
  const imgEnRiesgo=Q.aiFile&&_aiFileGuardada===null&&!aiFileYaEnHistorial();
  if(imgEnRiesgo||!_saveOk||hayMedidas){e.preventDefault();return e.returnValue='';}
});



/* Al final de todo, con los once archivos cargados. Aquí y no donde estaba —a mitad del
   antiguo script en línea— porque init() llama a registrar la venta y al vectorizador, que
   viven en archivos que se cargan antes que este, y a nada que se cargue después. */
init();

/* ----- MODO SOLO VECTORIZADOR -----
   El vectorizador es una herramienta de FABRICACIÓN: convertir el logotipo de un cliente en
   trazo de corte se hace con el archivo en la mano, sin que haya una cotización abierta ni
   tenga que haberla. Pero vivía detrás del botón «Vectorizar» de una partida, así que para
   usarlo había que abrir una cotización que nadie iba a mandar.

   Esto le abre su propia puerta desde la plataforma SIN copiar el marcado a otra página. Ese
   era el otro camino —una página suelta como la del anidador— y se descartó: son 153 líneas
   de marcado más los iconos, y una segunda copia se separa de la original en tres meses. Este
   repositorio tiene UNA duplicación a propósito, documentada y con una prueba que la vigila;
   no le tocaba una segunda por mover un botón.

   Se dispara con el hash y no con una cadena de consulta: `?solo=1` ya significa otra cosa
   —la salida de emergencia de la página suelta— y, sobre todo, el service worker sirve este
   documento con `ignoreSearch`, así que una consulta nueva no crearía una entrada de caché
   distinta pero sí ensuciaría la única dirección que tiene. El hash no viaja al servidor y no
   lo ve la caché.

   Va DESPUÉS de init() a propósito: `abrirVector()` lee estado que init() deja puesto. */
(function () {
  try {
    if (!/(^|[#&])vector($|[&])/.test(location.hash)) return;
    document.documentElement.classList.add('solo-vector');
    abrirVector();
  } catch (_) { /* si el vectorizador no abre, queda el cotizador entero: no se tapa nada */ }
})();

