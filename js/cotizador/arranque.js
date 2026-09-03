/* ============================================================================
   Cotizador · arranque.js

   El arranque. Va al FINAL: init() llama a funciones de todos los archivos anteriores, y en un script clásico solo están definidas las que ya se cargaron.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
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
  pintarClientes();
  aplicarFoldProy();
  ajustarTopbarMovil();
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
  /* Al final: loadState(), la partida en blanco del arranque y los repintados de arriba
     pasaron por saveState() y habrían dejado pasos en la pila. Nada de eso lo hizo el
     usuario, así que la app abre sin nada que deshacer. */
  undoBarrera();
  registrarSW();
  ofrecerRestauracionPendiente();
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

