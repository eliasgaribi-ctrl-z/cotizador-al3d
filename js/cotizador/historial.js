/* ============================================================================
   Cotizador · historial.js

   Lo que se guarda: historial de autorizadas, cuadernos de cliente, respaldo y restauración, cola de autorización, persistencia, deshacer/rehacer, plazo de taller y folio.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   doce archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   156 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Historial de cotizaciones autorizadas ===================== */
/* Solo entradas que son objetos. Un respaldo editado a mano o truncado puede dejar un null o
   un número en la lista, y con eso el historial, los cuadernos y las sugerencias de cliente
   reventaban en la primera lectura —`e.cliente` de null— antes de pintar nada. */
function getHistorial(){
  try{ const a=JSON.parse(localStorage.getItem('al3d_historial')||'[]'); return Array.isArray(a)?a.filter(e=>e&&typeof e==='object'):[]; }
  catch(_){ return []; }
}
function saveHistorial(arr){
  /* El historial es la única fuente de los cuadernos: si cambia, lo que hay en memoria
     dejó de valer. Va aquí arriba y no en el camino del éxito porque incluso cuando la
     escritura falla se puede haber soltado una imagen y reordenado la copia. */
  invalidarCuadernos();
  invalidarClientes();
  const escribir=a=>{ try{ localStorage.setItem('al3d_historial',JSON.stringify(a)); return true; }catch(_){ return false; } };
  if(escribir(arr)) return true;
  /* No cupo. Antes se vaciaban de golpe las imágenes de TODAS las cotizaciones —incluidas
     las que ya estaban guardadas y cabían de sobra— por autorizar una más: se perdía de
     forma irreversible la referencia visual de todo el historial, que es con lo que el
     vendedor reconoce una cotización vieja. Ahora se sueltan de la más antigua a la más
     reciente y solo hasta que quepa; la que se está guardando es la última en perderla. */
  const copia=arr.map(x=>({...x}));
  const conImagen=[];
  for(let i=copia.length-1;i>=0;i--) if(copia[i].aiFile&&copia[i].aiFile.url) conImagen.push(i);
  let soltadas=0;
  for(const i of conImagen){
    copia[i].aiFile={name:copia[i].aiFile.name,type:copia[i].aiFile.type,url:''};
    soltadas++;
    if(escribir(copia)){
      toast('Faltó espacio: se quitó la imagen de '+soltadas+(soltadas===1?' cotización vieja':' cotizaciones viejas'),'',5200,{label:'Respaldar',fn:()=>respaldar()});
      /* Degradada, pero la cotización SÍ quedó escrita: lo que se soltó son imágenes viejas. */
      return true;
    }
  }
  toast('No hubo espacio para guardar en el historial — respalda y borra cotizaciones viejas','err',6000,{label:'Respaldar',fn:()=>respaldar()});
  /* Nada quedó escrito. Quien llame tiene que enterarse: hay una copia que no se puede soltar. */
  return false;
}
/* ----- Un folio es de UN cliente -----
   El historial se indexa por folio y la escritura de abajo REEMPLAZA la entrada que ya tenga
   ese folio. Mientras el folio y el cliente van juntos eso es justo lo que se quiere: volver a
   guardar corrige la misma cotización. Pero el folio no cambia solo, y los datos del cliente
   sí: se abre una cotización ya autorizada, se teclean encima otro cliente y otro proyecto
   —que es como se empieza «la siguiente» cuando no se encuentra el botón de vaciar—, y la de
   antes desaparece. Con ella se va su trabajo, su precio, quién lo autorizó y su renglón en el
   cuaderno de aquel cliente, sin una sola pregunta y sin manera de devolverla.

   Así que aquí, en el único sitio por el que se escribe el historial, se pregunta antes: si
   ese folio ya está ocupado por OTRO cliente, esta cotización no es esa cotización y se lleva
   un folio nuevo. No hay nada que confirmar —guardar las dos no le cuesta nada a nadie— y la
   que ya estaba no se toca. */
function mismoCliente(a,b){
  const ta=telClave(a&&a.tel), tb=telClave(b&&b.tel);
  const na=normNom(a&&a.cliente), nb=normNom(b&&b.cliente);
  /* Con que coincida UNO de los dos basta para llamarlo corrección: reescribir el nombre de un
     teléfono que no se movió es arreglar cómo se escribe —«Farmacia San Juan» y «farmacia san
     juan suc. centro» son el mismo señor, y así lo agrupan los cuadernos—, y corregir un dígito
     del teléfono sin tocar el nombre es arreglar el número. Lo que no es una corrección es que
     cambien los dos. */
  if(ta&&tb&&ta===tb) return true;
  if(na&&nb&&na===nb) return true;
  /* No hay con qué comparar: a uno de los dos le falta el teléfono y al otro el nombre, o
     están a medio teclear. Afirmar que son distintos partiría en dos algo que solo estaba
     incompleto, y de las dos equivocaciones posibles ésa es la que no tiene vuelta. */
  if(!(ta&&tb)&&!(na&&nb)) return true;
  return false;
}
/* Lo que este folio tiene guardado, esté donde esté: el historial cuando ya se autorizó, la
   cola mientras espera. Se devuelve en una sola forma —quién y qué trabajo— porque las dos
   preguntas que se le hacen son ésas y cada almacén las guarda distinto: el renglón de la cola
   no lleva teléfono, pero su copia de la cotización sí. */
function guardadaDeEsteFolio(){
  const h=getHistorial().find(x=>x.folio===Q.folio);
  if(h) return {cliente:h.cliente||'',tel:h.tel||'',proy:h.proy||''};
  const c=getQueue().find(x=>x.folio===Q.folio);
  if(c) return {cliente:c.cliente||(c.q&&c.q.cliente)||'',tel:(c.q&&c.q.tel)||'',proy:c.proy||(c.q&&c.q.proy)||''};
  return null;
}
/* Devuelve true si hubo que reetiquetar, para que quien guarde sepa que el folio se movió. */
function reFoliarSiEsOtroCliente(){
  const previa=getHistorial().find(x=>x.folio===Q.folio);
  if(!previa||mismoCliente(previa,Q)) return false;
  const antes=Q.folio, deQuien=(previa.cliente||'').trim()||'la cotización que ya estaba';
  Q.folio=nextFolio();
  /* La solicitud que quedara en la cola es del folio viejo, y el viejo ya no es este trabajo. */
  removeFromQueue(antes);
  if(Q.estado==='autorizada') confirmarFolio(Q.folio);
  pintarFolio();
  toast(antes+' sigue siendo de '+deQuien+' — ésta quedó como '+Q.folio,'',7000);
  return true;
}
function guardarEnHistorial(extra){
  reFoliarSiEsOtroCliente();
  const t=totals();
  const arr=getHistorial();
  const idx=arr.findIndex(x=>x.folio===Q.folio);
  /* La imagen con la que se cotizó es lo que el vendedor vuelve a mirar cuando el cliente
     pregunta tres semanas después, y volver a guardar NUNCA debe ser lo que la borre. Si la
     de la pantalla se perdió por el camino —un pendiente que volvió de la cola, una entrada
     guardada por una versión anterior de la app, o la ✕ de la vista previa— se conserva la
     que ya tenía este folio. Para cambiarla hay que traer otra; para quitarla del historial,
     borrar la cotización. */
  const imgPrevia=(idx>=0&&arr[idx].aiFile)?arr[idx].aiFile:null;
  const entry={
    folio:Q.folio, proy:Q.proy, cliente:Q.cliente, tel:Q.tel||'', dirRaw:Q.dirRaw||'',
    // Se guarda todo lo que hace falta para volver a abrirla y regenerar su PDF igual.
    direccion:Q.direccion||'', maps:Q.maps||'', entrecalles:Q.entrecalles||'',
    entrega:Q.entrega||'', notaCliente:Q.notaCliente||'', fecha:Q.fecha||'',
    plazoK:(Q.plazoK>=1&&Q.plazoK<=5)?Q.plazoK:null,
    fechaAuth:Q.fechaAuth, autorizador:Q.autorizador, nota:Q.nota,
    precioAuth:Q.precioAuth, neto:t.neto, sub:t.sub, iva:Q.iva,
    /* La huella viaja con la cotización: sin ella, reabrirla del historial parecería un
       trabajo cambiado y soltaría un precio que nadie había tocado. */
    huellaAuth:Q.huellaAuth||'',
    /* El sello de la hoja viaja con ella: es lo que pone el QR en el PDF al reimprimirla. Las
       entradas de antes no lo traen, y se leen igual que «sin sello». */
    sello:Q.sello||null,
    /* El anticipo se pacta al cerrar y no siempre es el 50%. No se guardaba, así que al
       reabrir la cotización se recalculaba la mitad del total y el WhatsApp le pedía al
       cliente una cifra distinta de la acordada, sobre el mismo folio. */
    anti:Q.anti||0, antiManual:!!Q.antiManual,
    /* El importe calculado de cada partida se congela al guardar. El catálogo de precios
       vive en este mismo archivo y se edita a mano: sin congelarlo, subir el precio del
       aluminio reescribía hacia atrás lo que ya se le había cotizado a un cliente, y el
       historial enseñaba renglones que no sumaban su propio «Total autorizado». */
    items:Q.items.map(it=>Object.assign(JSON.parse(JSON.stringify(it)),{_lt:+lineTotal(it).toFixed(2)})),
    itemsAuth:JSON.parse(JSON.stringify(Q.itemsAuth||{})),
    aiFile:(Q.aiFile&&Q.aiFile.url)?{name:Q.aiFile.name,type:Q.aiFile.type,url:Q.aiFile.url}:imgPrevia,
    /* Qué aparato emitió este folio. Es lo único que desempata dos COT-0042 pegados en el
       mismo Sheet, que es el escenario real del CSV. */
    disp:dispositivo(),
    /* El sello es el de la AUTORIZACIÓN, no el de la última escritura. Se reescribía en cada
       guardado —cambiar el anticipo, ocultar una partida del PDF— y de ahí leen la plataforma
       («autorizada hace 3 días», los días sin decidir) y los cuadernos, que ordenaban una
       cotización de enero como la más nueva y escribían «la primera fue el 5 mar; la última, el
       10 ene». Se conserva mientras la autorización sea la misma; una nueva lo renueva. */
    ts:(idx>=0&&arr[idx].ts&&arr[idx].fechaAuth===Q.fechaAuth&&arr[idx].autorizador===Q.autorizador)
      ? arr[idx].ts : Date.now(),
    /* El día en que se reenvió con fecha nueva (función 33). Es suyo y no de `ts`: `ts` es la
       autorización y la lee la plataforma. Cada guardado lo conserva; solo
       reenviarConFechaNueva() lo mueve, y una autorización más nueva lo deja atrás por sí sola
       (la vigencia cuenta desde el mayor de los dos). */
    reenviada:(extra&&extra.reenviada)||(idx>=0&&arr[idx].reenviada)||0
  };
  if(idx>=0) arr[idx]=entry; else arr.unshift(entry);
  const ok=saveHistorial(arr);
  /* El historial es de donde salen las sugerencias de cliente: al crecer, crecen. */
  pintarClientes();
  return ok;
}

let _histData=[];
/* `origen` es la miniatura que se tocó (la pasa el onclick con `this`): de ella crece el plano y
   a ella regresa. Sin miniatura —se llamó desde la consola, o la lista se repintó— el plano
   simplemente aparece. */
function openHistImg(folio,origen){
  const e=_histData.find(x=>x.folio===folio);
  if(!e||!e.aiFile||!e.aiFile.url) return;
  visorAbrir(e.aiFile.url,e.aiFile.name||'',origen);
}
/* ----- El plano a pantalla completa, con zoom (H14) -----
   Un plano con cotas, ajustado al ancho de un teléfono, no se lee: las cifras miden dos píxeles.
   El visor de antes era una <img> con `max-width` dentro del velo, sin zoom ni arrastre ni
   salida, así que para leer una cota había que salir de la app y abrir la foto en la galería.

   Ahora la imagen crece DESDE la miniatura que se tocó y regresa a ella al cerrar —la misma
   técnica de FLIP que ya usa _volarTotal(): se coloca en su lugar final y se anima desde el
   rectángulo de la miniatura—, y adentro se puede pellizcar, arrastrar y tocar dos veces para
   2×. La cuenta del pellizco es la de scGestureStart/scGestureMove del escalador —lo que estaba
   bajo los dedos se queda bajo los dedos—, pero escrita aquí y no llamada de allá: esas dos
   funciones escriben en SC (el lienzo del escalador, su lupa, sus guías) y el visor no tiene nada
   de eso. Una sola implementación del visor: openAiFile() de partidas.js llama a esta misma, no
   trae la suya.

   `touch-action:none` va SOLO sobre el lienzo del visor (css, «Cotizador · historial»): fuera de
   él la página sigue haciendo scroll. Con Pointer Events y no con touchstart porque el ratón y
   la rueda caen en la misma cuenta: en la computadora la rueda acerca y se arrastra con el botón.
   Teclado: «+», «−» y «0» acercan, alejan y ajustan; con el lienzo enfocado las flechas lo mueven.
   Escape y el «atrás» del teléfono ya cierran la capa (_CAPAS), y los dos llegan a closeLightbox().

   Cierre: el vuelo de regreso tarda unos 260 ms y la capa sigue puesta mientras tanto, así que
   closeLightbox() lo pide a visorCerrar() y NO quita `.show` por su cuenta (lo quita el visor al
   aterrizar). Con menos movimiento no hay vuelo: la capa se va en el acto, como siempre.
   La miniatura recorta (object-fit:cover) y el plano no: el vuelo parte del cuadro más chico que
   cubre la miniatura, centrado en ella, así que no calza al píxel. Se midió que a ojo no se nota
   y se descartó recortar con clip-path, que animaría el área de pintado entera en cada cuadro.
   Se mueve solo `transform` (y `opacity` en el velo). */
const VISOR_MAX=5;
let _visor=null, _visorEsperando=false;
function visorAbrir(url,alt,origen){
  if(_visor||_visorEsperando||!urlImagenSegura(url)) return;
  const img=new Image();
  img.className='visor-img'; img.alt=''; img.draggable=false;
  /* La URL cruda y no la de urlImagenSegura(): esa viene ESCAPADA para escribirse dentro de un
     atributo, y asignarla a `src` como propiedad dejaría un &amp; literal. Aquí no hay HTML de
     por medio, y la guarda de arriba ya dijo que el esquema es data: o blob: de imagen. */
  img.src=String(url);
  _visorEsperando=true;
  const listo=()=>{ _visorEsperando=false; visorMontar(img,alt,origen); };
  /* Se decodifica ANTES de abrir la capa: el vuelo necesita saber la proporción real, y abrir
     un velo vacío para que la imagen salte adentro es justo el parpadeo que esto quita. */
  (img.decode?img.decode():Promise.reject()).then(listo,listo);
}
function visorMontar(img,alt,origen){
  const lb=$('lightbox'), cuerpo=$('lightboxBody'); if(!lb||!cuerpo) return;
  const P=window.Piezas, sinMov=()=>!!(P&&P.sinMovimiento&&P.sinMovimiento());
  const aspecto=(img.naturalWidth>0&&img.naturalHeight>0)?img.naturalWidth/img.naturalHeight:1.5;
  const lienzo=document.createElement('div');
  lienzo.className='visor-lienzo'; lienzo.tabIndex=0; lienzo.setAttribute('role','img');
  lienzo.setAttribute('aria-label',(alt?alt+'. ':'')+'Plano a pantalla completa. Pellizca o toca dos veces para acercar; con teclado, más y menos acercan y las flechas lo mueven.');
  const pie=document.createElement('div'); pie.className='visor-pie'; pie.setAttribute('aria-hidden','true');
  pie.innerHTML='<b>100 %</b><span>Pellizca o toca dos veces</span>';
  const lectura=pie.firstChild;
  lienzo.append(img);
  cuerpo.replaceChildren(lienzo,pie);
  /* `con-visor` oscurece el velo (css): el de siempre, a medio tono, dejaba ver el modal de atrás
     a través del plano, y con cotas de dos píxeles todo lo que distrae es ruido. */
  lb.classList.add('show','con-visor');
  const V={x:0,y:0,s:1}; let base={w:0,h:0};
  const punteros=new Map(); let ges=null, movido=false, toque={t:0,x:0,y:0}, cerrarAlClic=false;
  const ancho=()=>lienzo.clientWidth, alto=()=>lienzo.clientHeight;
  /* El plano se ajusta dejando aire para el botón de cerrar (arriba) y la lectura del zoom (abajo). */
  function ajustar(){
    const mx=16, mv=64;
    let w=ancho()-2*mx, h=w/aspecto;
    if(h>alto()-2*mv){ h=alto()-2*mv; w=h*aspecto; }
    base={w:Math.max(40,w),h:Math.max(40,h)};
    img.style.width=base.w+'px'; img.style.height=base.h+'px';
  }
  /* Si cabe, se centra; si no, no deja ver el vacío de afuera. */
  function limitar(){
    const w=base.w*V.s, h=base.h*V.s;
    V.x=w<=ancho()?(ancho()-w)/2:Math.min(0,Math.max(ancho()-w,V.x));
    V.y=h<=alto()?(alto()-h)/2:Math.min(0,Math.max(alto()-h,V.y));
  }
  function aplicar(){
    img.style.transform='translate('+V.x.toFixed(1)+'px,'+V.y.toFixed(1)+'px) scale('+V.s.toFixed(4)+')';
    lectura.textContent=Math.round(V.s*100)+' %';
    lb.dataset.escala=V.s.toFixed(2);
  }
  /* Acerca o aleja alrededor de (px,py): ese punto de la imagen se queda bajo el dedo. */
  function zoomEn(px,py,s2,suave){
    s2=Math.max(1,Math.min(VISOR_MAX,s2));
    V.x=px-(px-V.x)*(s2/V.s); V.y=py-(py-V.y)*(s2/V.s); V.s=s2;
    limitar();
    if(suave&&!sinMov()){ img.style.transition='transform .22s cubic-bezier(.2,.8,.2,1)'; setTimeout(()=>{ img.style.transition=''; },240); }
    aplicar();
  }
  /* Dónde está la miniatura, como el transform que la imita: el cuadro más chico que la cubre,
     centrado en ella. */
  function enMini(){
    const r=origen&&origen.isConnected?origen.getBoundingClientRect():null;
    if(!r||!r.width||!r.height) return null;
    const k=Math.max(r.width/base.w,r.height/base.h);
    return 'translate('+(r.left+r.width/2-base.w*k/2).toFixed(1)+'px,'+(r.top+r.height/2-base.h*k/2).toFixed(1)+'px) scale('+k.toFixed(4)+')';
  }
  const quitar=[];
  const oir=(x,ev,f,o)=>{ x.addEventListener(ev,f,o); quitar.push(()=>x.removeEventListener(ev,f,o)); };
  ajustar(); limitar(); aplicar();
  const desde=enMini();
  if(origen&&origen.isConnected) origen.style.visibility='hidden';
  if(desde&&!sinMov()&&img.animate) img.animate([{transform:desde},{transform:img.style.transform}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});
  const v=_visor={lb,cuerpo,lienzo,img,origen,cerrando:false,
    soltar(){
      quitar.forEach(f=>f()); quitar.length=0;
      if(origen) origen.style.visibility='';
      lb.classList.remove('con-visor'); delete lb.dataset.escala;
      _visor=null;
    },
    enMini,transformActual:()=>img.style.transform,punteros};
  const empezarGesto=()=>{
    const ps=[...punteros.values()];
    ges={V:{...V},p0:ps[0],d0:ps[1]?Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)||1:0,
      m0:ps[1]?{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2}:null};
  };
  oir(lienzo,'pointerdown',e=>{
    if(v.cerrando) return;
    try{ lienzo.setPointerCapture(e.pointerId); }catch(_){}
    punteros.set(e.pointerId,{x:e.clientX,y:e.clientY});
    movido=punteros.size>1; cerrarAlClic=false;
    empezarGesto();
  });
  oir(lienzo,'pointermove',e=>{
    if(!punteros.has(e.pointerId)||!ges) return;
    punteros.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const ps=[...punteros.values()];
    if(ps.length>=2&&ges.m0){
      /* Pellizco: lo que estaba bajo los dedos se queda bajo los dedos. */
      const dd=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y), m={x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2};
      const s2=Math.max(1,Math.min(VISOR_MAX,ges.V.s*dd/ges.d0)), f=s2/ges.V.s;
      V.s=s2; V.x=m.x-(ges.m0.x-ges.V.x)*f; V.y=m.y-(ges.m0.y-ges.V.y)*f;
    }else{
      const dx=e.clientX-ges.p0.x, dy=e.clientY-ges.p0.y;
      if(Math.hypot(dx,dy)>6) movido=true;
      V.x=ges.V.x+dx; V.y=ges.V.y+dy;
    }
    limitar(); aplicar();
  });
  const soltarPuntero=e=>{
    if(!punteros.has(e.pointerId)) return;
    punteros.delete(e.pointerId);
    if(punteros.size){ empezarGesto(); return; }
    ges=null;
    if(movido||e.type==='pointercancel'||v.cerrando) return;
    /* Un toque, no un gesto. Fuera de la imagen es el velo y cierra, como siempre cerró; sobre la
       imagen, dos toques seguidos la llevan a 2× o la devuelven a su ajuste. El cierre NO se hace
       aquí sino en el clic que sigue a soltar: con menos movimiento la capa se va en el acto, y
       ese clic caía en el historial que está debajo —en su velo, que también cierra— y se llevaba
       los dos de un toque. Con el clic ya consumido por el lienzo, no hay a dónde caiga. */
    const r=img.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){ cerrarAlClic=true; return; }
    const t=performance.now();
    if(t-toque.t<300&&Math.hypot(e.clientX-toque.x,e.clientY-toque.y)<24){
      zoomEn(e.clientX,e.clientY,V.s<1.5?2:1,true); toque.t=0;
    }else toque={t,x:e.clientX,y:e.clientY};
  };
  oir(lienzo,'pointerup',soltarPuntero); oir(lienzo,'pointercancel',soltarPuntero);
  /* Tras un arrastre el navegador manda un clic al lienzo, y el clic subiría al onclick del velo
     (#lightbox) y cerraría el visor a media lectura. Quién cierra lo decide el toque de arriba, y
     lo hace aquí, con el clic ya detenido. */
  oir(lienzo,'click',e=>{ e.stopPropagation(); if(cerrarAlClic){ cerrarAlClic=false; visorCerrar(); } });
  oir(lienzo,'wheel',e=>{ e.preventDefault(); zoomEn(e.clientX,e.clientY,V.s*Math.exp(-e.deltaY*.0015)); },{passive:false});
  oir(lb,'keydown',e=>{
    if(v.cerrando||e.ctrlKey||e.metaKey||e.altKey) return;
    const cx=ancho()/2, cy=alto()/2;
    if(e.key==='+'||e.key==='=') zoomEn(cx,cy,V.s*1.25,true);
    else if(e.key==='-'||e.key==='_') zoomEn(cx,cy,V.s/1.25,true);
    else if(e.key==='0') zoomEn(cx,cy,1,true);
    else if(e.key.indexOf('Arrow')===0&&document.activeElement===lienzo){
      const d={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]}[e.key];
      V.x+=d[0]; V.y+=d[1]; limitar(); aplicar();
    }else return;
    e.preventDefault();
  });
  oir(window,'resize',()=>{ ajustar(); V.x=V.y=0; V.s=1; limitar(); aplicar(); });
}
/* Cierra el visor si hay uno. Devuelve true si lo atendió (aunque ya estuviera cerrándose): así
   closeLightbox() sabe que NO le toca quitar la capa, y un segundo Escape o un segundo toque
   durante el vuelo no hacen nada. */
function visorCerrar(){
  const v=_visor; if(!v) return false;
  if(v.cerrando) return true;
  v.cerrando=true; v.punteros.clear();
  const fin=()=>{
    v.soltar();
    $('lightbox').classList.remove('show'); $('lightboxBody').innerHTML='';
    /* El foco a la miniatura, ANTES de que el vigilante de capas (nucleo.js) lo reparta: la
       miniatura vive dentro del historial, que es otra capa, y esa regla no guarda como «foco de
       antes» lo que está dentro de una capa —así que, sin esto, caía en el primer control del
       historial (la ×) y quien navega con teclado perdía el sitio donde iba. */
    if(v.origen&&v.origen.isConnected) try{ v.origen.focus({preventScroll:true}); }catch(_){}
  };
  const P=window.Piezas, hacia=v.enMini();
  if(!hacia||(P&&P.sinMovimiento&&P.sinMovimiento())||!v.img.animate){ fin(); return true; }
  v.lienzo.style.pointerEvents='none';
  const a=v.img.animate([{transform:v.transformActual()},{transform:hacia}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
  const velo=v.lb.animate([{opacity:1},{opacity:0}],{duration:260,fill:'forwards'});
  const aterrizar=()=>{ try{ a.cancel(); velo.cancel(); }catch(_){} fin(); };
  a.finished.then(aterrizar,aterrizar);
  return true;
}
/* ----- Borrar del historial, con Deshacer -----
   Preguntaba con el confirm() del navegador y prometía «no se puede deshacer». Borrar una
   partida, un renglón más arriba, ya se hacía de inmediato con un Deshacer en el aviso
   (delItem en partidas.js), y los dos borrados no tenían por qué sentirse distintos: se borra
   ya, y durante unos segundos se puede devolver, en su mismo lugar. */
/* El buscador repintaba la lista entera —fotos incluidas— en cada tecla. Buscar ya era barato
   (indexarHistorial arma el texto una vez al abrir); pintar no. Se espera a que la persona haga
   una pausa: 140 ms no se notan al escribir y ahorran nueve de cada diez repintados. Abrir el
   modal, borrar y restaurar siguen llamando a pintarHistorial() directo. */
let _histBuscaT=null;
function pintarHistorialPronto(){
  clearTimeout(_histBuscaT);
  /* Una búsqueda nueva empieza arriba: con el scroll donde estaba, el primer resultado quedaba
     escondido bajo el borde de la lista. */
  _histBuscaT=setTimeout(()=>{ pintarHistorial(); const b=$('hist-body'); if(b) b.scrollTop=0; },140);
}
let _histBorrada=null;
function borrarDeHistorial(folio){
  const arr=getHistorial(), idx=arr.findIndex(x=>x.folio===folio);
  if(idx<0) return;
  _histBorrada={entry:arr[idx],idx};
  arr.splice(idx,1);
  saveHistorial(arr);
  _histData=getHistorial(); indexarHistorial();
  pintarClientes();
  pintarFichasHistorial();   // los conteos de las fichas cambian con cada borrado
  pintarHistorial(); // se conserva lo que el usuario tenía escrito en el buscador y la ficha activa
  vibrar([8,40,8]);
  toast(folio+' eliminada del historial','',8000,{label:'Deshacer',fn:deshacerBorradoHistorial});
}
function deshacerBorradoHistorial(){
  const b=_histBorrada; _histBorrada=null; if(!b) return;
  const arr=getHistorial();
  if(arr.some(x=>x.folio===b.entry.folio)) return;   // ya volvió por otro lado
  arr.splice(Math.min(b.idx,arr.length),0,b.entry);
  saveHistorial(arr);
  _histData=getHistorial(); indexarHistorial();
  pintarClientes();
  if($('histmodal').classList.contains('show')){ pintarFichasHistorial(); pintarHistorial(); }
  toast(b.entry.folio+' volvió al historial','ok',2600);
}

const HIST_MAT={'al-paint':'Aluminio Pintado','al-brush':'Aluminio Brush','acr-vol':'Acrílico + Aluminio','acr-vinil':'Acrílico + Vinil','acero':'Acero Inoxidable'};
const HIST_ACAB={'sencillo':'Sencillo','vinil':'Rotulación Vinil','sandwich':'Sándwich c/luz'};
const HIST_BAS={'lamina':'Lámina','alucobond':'Alucobond'};
function histDsc(it){
  if(it.desc) return it.desc;
  if(it.tipo==='letras')    return (HIST_MAT[it.material]||'Letras 3D')+' · '+(it.n||0)+' letras, '+(it.altura||0)+'cm';
  if(it.tipo==='recorte')   return 'Recorte '+(HIST_ACAB[it.acab]||'')+' · '+(it.n||0)+' pzas';
  if(it.tipo==='bastidor')  return 'Bastidor '+(HIST_BAS[it.bas]||'')+' '+(it.ancho||0)+'×'+(it.alto||0)+'cm';
  if(it.tipo==='caja')      return 'Caja de luz '+(it.ancho||0)+'×'+(it.alto||0)+'cm';
  return 'Partida manual';
}
/* ----- El buscador ignoraba la fecha que él mismo imprime -----
   Filtraba sobre seis campos: folio, proyecto, cliente, teléfono, dirección y autorizador. La
   fecha de autorización SÍ se imprime en cada renglón —«✓ Elías · 27 ago 2026»— y no estaba en
   el filtro, así que teclear «ago» no devolvía nada aunque la fecha estuviera a la vista, que
   es lo peor que puede hacer un buscador: ignorar un dato que se ve. Tampoco entraba lo que se
   cotizó, aunque la descripción de cada partida ya se calcula para pintar su tabla, ni el
   total, que es como se busca «la de treinta y cinco mil».

   La cadena se arma UNA vez al abrir el modal y no dentro del filtro: ahí correría sobre todas
   las partidas de todas las entradas en cada tecla. */
function indexarHistorial(){
  const P=window.Piezas;
  _histData.forEach(e=>{
    /* El total y el teléfono también SIN formato. El total entraba como «$35,000.00» y el
       teléfono con sus espacios, así que «la de treinta y cinco mil» buscada como «35000» no
       encontraba nada, y el teléfono tecleado de corrido tampoco — que es justo como se busca
       con el cliente al teléfono. */
    const tot=totalFinalHist(e);
    /* Los hitos se leen UNA vez por entrada y se guardan: de aquí salen el texto que se busca
       y las fichas «Sin PDF / Sin enviar / Sin venta» (H8). Antes se releía el almacenamiento
       completo una vez por cada hito de cada entrada. */
    e._h=hitosDe(e.folio);
    const bruto=[e.folio,e.proy,e.cliente,e.tel,String(e.tel||'').replace(/\D/g,''),e.dirRaw,e.autorizador,e.fechaAuth,
      money(tot),String(+(+tot||0).toFixed(2)),(+tot||0).toFixed(2),(e.items||[]).map(histDsc).join(' '),
      HITOS.filter(x=>e._h[x.k]).map(x=>x.hecho).join(' ')]
      .map(v=>String(v||'')).join(' ');
    /* Sin acentos ni mayúsculas, con la MISMA regla con la que luego se marca lo que coincide
       (P.resaltar, H15): si el filtro dejara pasar «optica» pero la marca no encontrara «Óptica»,
       saldría un resultado sin nada resaltado, que es peor que no marcar. */
    e._busca=P.plegarTexto(bruto).txt;
  });
  _histCuentas=histCuentas(_histData,Date.now());
}
/* ----- Las fichas bajo el buscador (H8) -----
   Solo había un buscador de texto, y «¿cuáles autoricé y no he mandado?» —la pregunta que se
   hace un viernes— no tenía respuesta sin abrir las cotizaciones una por una. Las fichas la
   contestan con un toque: lo que falta entregar, con cuántas son.

   «Sin enviar» mira el hito del chat de WhatsApp, que es lo único que la app puede saber: abre
   wa.me y el PDF se adjunta a mano (ver HITOS en entrega.js), así que «enviado» de verdad no
   existe como dato. Se combinan con la búsqueda —la ficha manda primero y el texto afina— y el
   contador dice «3 de 41». Los conteos se calculan UNA vez al abrir (y al borrar o deshacer): dicen
   cuántas hay de cada tipo, no cuántas quedan tras buscar, que es lo que el contador de arriba
   ya dice. La ficha activa va hundida en --a-suave: no es el botón con relleno de la pantalla. */
const HIST_FILTROS=[
  {id:'todas',   texto:'Todas',     ok:()=>true},
  {id:'sinpdf',  texto:'Sin PDF',   ok:e=>!(e._h&&e._h.pdf),   dice:'Sin PDF generado'},
  {id:'sinenv',  texto:'Sin enviar',ok:e=>!(e._h&&e._h.wa),    dice:'Sin chat de WhatsApp abierto'},
  {id:'sinventa',texto:'Sin venta', ok:e=>!(e._h&&e._h.venta), dice:'Sin venta registrada'},
  {id:'mes',     texto:'Este mes',  ok:(e,ahora)=>enEsteMes(e.ts,ahora),dice:'Autorizadas este mes'},
];
let _histFiltro='todas', _histCuentas={};
/* Del mes de AQUÍ: una autorizada a las 11 de la noche del último día no es «del mes que entra». */
function enEsteMes(ts,ahora){
  if(!(+ts>0)) return false;
  const a=new Date(+ts), b=new Date(ahora==null?Date.now():ahora);
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth();
}
function histCuentas(datos,ahora){
  const c={};
  HIST_FILTROS.forEach(f=>{ c[f.id]=datos.filter(e=>f.ok(e,ahora)).length; });
  return c;
}
function pintarFichasHistorial(){
  const c=$('hist-fichas'); if(!c) return;
  const P=window.Piezas;
  if(!_histData.length){ c.hidden=true; c.innerHTML=''; return; }
  c.innerHTML=P.fichasHTML(HIST_FILTROS.map(f=>({id:f.id,texto:f.texto,n:_histCuentas[f.id]})),
    {activo:_histFiltro,etiqueta:'Filtrar por lo que falta'});
  c.hidden=false;
  HIST_FILTROS.forEach(f=>{
    const b=c.querySelector('[data-ficha="'+f.id+'"]');
    if(b&&f.dice) b.title=f.dice;
  });
  P.fichas(c,{todas:'todas',alElegir:v=>{
    _histFiltro=v||'todas';
    const body=$('hist-body'); if(body) body.scrollTop=0;
    pintarHistorial();
    const n=$('hist-body').querySelectorAll('.hentry').length;
    voz(n===1?'1 cotización':n+' cotizaciones');
  }});
}
function histFiltroActual(){ return HIST_FILTROS.find(f=>f.id===_histFiltro)||HIST_FILTROS[0]; }
function abrirHistorial(){
  _histData=getHistorial();
  indexarHistorial();
  const s=$('hist-search'); if(s) s.value='';
  _histFiltro='todas';
  ocultarRestauracion(true);
  pintarFichasHistorial();
  pintarPieHistorial();
  pintarHistorial();
  $('histmodal').classList.add('show');
}
/* ----- La vigencia de 10 días a la vista (función 33) -----
   «La cotización es válida por 10 días» está escrito en el PDF y en ningún otro sitio: el
   vendedor no sabía cuántos le quedaban a una cotización de hace una semana, ni que la del
   cliente que no contestó ya venció. Cada entrada del historial lo dice ahora, con un anillo que
   se consume y con palabras —«Vigente», «Por vencer», «Vencida»—: el color nunca va solo.

   La cuenta sale de `e.ts`, que es un NÚMERO, y no de `e.fechaAuth`, que es texto es-MX
   («22 sept 2026») y no se resta. Son días NATURALES entre medianoches locales: autorizada el 22,
   vence el 2 —el día 22 quedan 10, el 2 queda 0, el 3 está vencida—. Se redondea la resta porque
   un cambio de horario hace días de 23 o 25 horas, y truncar contaría uno de menos. Más de 3 días,
   verde; 3 o menos, ámbar; vencida, rojo.

   El reloj arranca de `e.ts` —la autorización, que la plataforma también lee— o de
   `e.reenviada` si es más nueva: «Reenviar con fecha nueva» NO toca `e.ts` (diría «autorizada
   hoy» sobre un precio que nadie volvió a autorizar), anota su propio sello. Una entrada sin
   ninguno de los dos —las más viejas del historial— no pinta nada: no se inventa una fecha. */
const VIG_DIAS=10, VIG_AMBAR=3, DIA_MS=864e5;
function medianocheLocal(t){ const d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
function vigenciaDe(e,ahora){
  const base=Math.max(+e.ts||0,+e.reenviada||0);
  if(!(base>0)) return null;
  const hoyT=ahora==null?Date.now():+ahora;
  const pasados=Math.max(0,Math.round((medianocheLocal(hoyT)-medianocheLocal(base))/DIA_MS));
  const quedan=VIG_DIAS-pasados;
  const f=new Date(base); f.setHours(0,0,0,0); f.setDate(f.getDate()+VIG_DIAS);
  return {quedan,estado:quedan>VIG_AMBAR?'ok':quedan>=0?'av':'mal',vence:f.getTime(),base};
}
function vigFecha(ts){
  try{ return new Date(ts).toLocaleDateString('es-MX',{day:'numeric',month:'short'}).replace('.',''); }
  catch(_){ return ''; }
}
function vigenciaTexto(v){
  const f=vigFecha(v.vence), q=v.quedan;
  if(v.estado==='mal') return {titulo:'Vencida',detalle:'Hace '+(-q)+(q===-1?' día':' días')+' · venció el '+f};
  const d=q>1?'Vence en '+q+' días · '+f:q===1?'Vence mañana · '+f:'Vence hoy';
  return {titulo:v.estado==='av'?'Por vencer':'Vigente',detalle:d};
}
function vigenciaHTML(e,ahora,boton){
  const v=vigenciaDe(e,ahora); if(!v) return '';
  const t=vigenciaTexto(v);
  const resto=(1-Math.max(0,Math.min(VIG_DIAS,v.quedan))/VIG_DIAS).toFixed(3);
  return `<div class="hvig" data-estado="${v.estado}" data-quedan="${v.quedan}">
    <span class="hvig-anillo" aria-hidden="true"><svg viewBox="0 0 36 36"><circle class="base" cx="18" cy="18" r="15"/><circle class="resto" cx="18" cy="18" r="15" pathLength="1" style="stroke-dashoffset:${resto}"/></svg><b>${Math.max(0,v.quedan)}</b></span>
    <span class="hvig-d"><b class="hvig-t">${esc(t.titulo)}</b><small>${esc(t.detalle)}</small></span>
    ${boton||''}</div>`;
}
/* ¿Se movió el precio desde que se cotizó? La MISMA pregunta que ya se hace al reabrir una
   cotización (reabrirDeHistorial congela el importe de cada partida cuyo `_lt` ya no coincide
   con el catálogo de hoy): escrita aparte porque aquí hay que saberlo ANTES de abrirla. */
function precioSeMovio(e){
  const hoyIt=normalizarItems(JSON.parse(JSON.stringify(e.items||[])));
  return (e.items||[]).some(it=>{
    if(it._lt===undefined) return false;
    const act=hoyIt.find(x=>x.id===it.id);
    return !!act&&Math.abs(it._lt-lineTotal(act))>0.01;
  });
}
/* «Reenviar con fecha nueva» es un PDF NUEVO: lleva la fecha de hoy y vuelve a tener sus 10
   días. Dos caminos, y la diferencia es el dinero:
     · el precio sigue siendo el que se cotizó: se abre la cotización con la fecha de hoy y se
       anota la renovación; solo falta generar el PDF y mandarlo;
     · el precio del catálogo se movió (el material subió): prometer otros 10 días a un precio
       que ya no es el de hoy es una decisión de Dirección. Se pregunta y se abre «Volver a
       autorizar el precio» (reautorizar), el mismo camino de siempre —el autorizador lo revisa,
       el vendedor lo solicita—, y el reloj NO se renueva hasta que alguien lo autorice: al
       autorizar de nuevo `ts` se renueva solo, y mientras tanto el anillo sigue diciendo la verdad.
   En el camino del precio movido la fecha NO se cambia al abrir: si la revisión se cancela, la
   cotización vuelve como estaba, y un PDF con fecha de hoy y el precio viejo sería justo lo que
   este paso existe para impedir. Cuando Dirección autoriza, las partidas quedan congeladas con
   el precio de hoy, el precio ya no «se movió» y el mismo botón, tocado otra vez, toma el camino
   corto. La renovación se anota al abrir y no al generar el PDF: entrega.js es de otra pantalla y
   esa marca se pierde si nunca se genera; queda dicho en el aviso, que pide generar el PDF. */
async function reenviarConFechaNueva(folio){
  if(selloEnVuelo()) return;
  const e=_histData.find(x=>x.folio===folio); if(!e) return;
  const movido=precioSeMovio(e);
  if(movido&&!await confirmar({titulo:'El precio de hoy no es el que se cotizó',
    texto:'Desde que se autorizó '+folio+' cambió el precio del material. Una cotización con fecha nueva es un PDF nuevo, y con otro precio tiene que volver a pasar por Dirección antes de salir.\n\nSe abre para volver a autorizar el precio; cuando quede autorizado, toca «Reenviar con fecha nueva» otra vez.',
    si:'Abrir y volver a autorizar',no:'Dejarla como está'})) return;
  await reabrirDeHistorial(folio,{fechaNueva:!movido,sinAviso:true});
  /* Si la pregunta de la cotización que estaba en pantalla contestó «no», no se abrió nada. */
  if(Q.folio!==folio||Q.estado!=='autorizada') return;
  if(movido){
    saveState();
    reautorizar();
    return;
  }
  guardarEnHistorial({reenviada:Date.now()});
  saveState();
  const f=new Date(); f.setHours(0,0,0,0); f.setDate(f.getDate()+VIG_DIAS);
  toast(folio+' sale con la fecha de hoy y vence el '+vigFecha(f.getTime())+' — genera su PDF nuevo','ok',6000);
}
/* Lista del historial, filtrada por las fichas y por el buscador. Con decenas de folios
   encontrar uno a mano era imposible. */
function pintarHistorial(){
  const P=window.Piezas, ahora=Date.now();
  const q=($('hist-search')?.value||'').trim();
  const qf=P.plegarTexto(q).txt;
  const filtro=histFiltroActual();
  const filtrando=!!q||filtro.id!=='todas';
  const lista=filtrando
    ? _histData.filter(e=>filtro.ok(e,ahora)&&(!qf||(e._busca||'').includes(qf)))
    : _histData;
  const cnt=$('hist-count');
  if(cnt) cnt.textContent=_histData.length
    ? (filtrando?`${lista.length} de ${_histData.length}`:plCot(_histData.length))
    : '';
  const body=$('hist-body');
  body.innerHTML=!_histData.length ? histVacioHTML()
    : !lista.length ? histSinCoincidenciasHTML(q,filtro)
    : lista.map(e=>histEntradaHTML(e,q,ahora)).join('');
  armarEntradasHistorial(body);   // solo la primera vez: pone el oyente delegado que arma cada bote al tocarlo
}
/* ----- Cada entrada, compacta (H16) -----
   Era una tarjeta con la imagen de 96 px, la tabla de TODAS las partidas, los hitos, el total y
   la nota, siempre abiertas: con 40 cotizaciones, un pergamino. Ahora por omisión se ven lo que
   se busca de un vistazo —folio, nombre, vigencia, hitos y total— y la tabla, la dirección y la
   nota se abren con un toque sobre «3 partidas»: un <details class="pliegue">, que abre y cierra
   con su altura donde el navegador sabe (::details-content) y en seco donde no. «Abrir y
   editar» y «Duplicar» siguen a la vista: son para lo que se viene a hacer.

   Con una búsqueda activa, la entrada se abre sola si lo que coincidió está ADENTRO (una partida
   o la dirección): una marca escondida en un pliegue cerrado no explica por qué salió el
   resultado, que es para lo que existe (H15). Todo lo que viene de datos pasa por esc() o por
   P.resaltar() —que escapa por tramos—, y la marca es lo único que se agrega. */
function histEntradaHTML(e,q,ahora){
  const P=window.Piezas, dsc=histDsc, R=t=>P.resaltar(t,q);
  const isImg=e.aiFile&&e.aiFile.type&&e.aiFile.type.indexOf('image/')===0&&e.aiFile.url;
  const imgHTML=isImg
    ? `<img class="hentry-img" src="${urlImagenSegura(e.aiFile.url)}" loading="lazy" decoding="async" ${_ABRIBLE} onclick="openHistImg(${jsArg(e.folio)},this)" title="Ver imagen completa" alt="Referencia">`
    : `<div class="hentry-img-ph">${e.aiFile?ico('i-doc'):ico('i-imagen')}</div>`;
  const items=e.items||[];
  const rows=items.map((it,i)=>{
    const ia=(e.itemsAuth&&e.itemsAuth[it.id]!==undefined)?e.itemsAuth[it.id]
             :(it._lt!==undefined?it._lt:lineTotal(it));
    return `<tr><td>${i+1}</td><td>${R(dsc(it))}</td><td>${money(ia)}</td></tr>`;
  }).join('');
  const pFin=totalFinalHist(e);
  const ajuste=+(e.neto-pFin).toFixed(2);
  const v=vigenciaDe(e,ahora);
  const reenviar=`<button type="button" class="hentry-reenviar" data-reenviar="${esc(e.folio)}" title="Es un PDF nuevo con la fecha de hoy y sus 10 días otra vez. Si el precio cambió, pasa antes por Dirección.">${ico('i-recalibrar')} Reenviar con fecha nueva</button>`;
  /* Por vencer o vencida, el botón está a la vista junto al anillo; vigente, queda dentro del
     pliegue: nadie reenvía lo que le sobra y cada entrada con su botón era otro renglón de 44 px. */
  const botonAfuera=v&&v.estado!=='ok';
  const dir=e.dirRaw?`<p class="hentry-dir">${ico('i-pin')} ${R(e.dirRaw)}</p>`:'';
  const nota=e.nota?`<p class="hentry-nota">${ico('i-chat')} ${esc(e.nota)}</p>`:'';
  const abre=!!q&&(items.some(it=>P.coincide(dsc(it),q))||P.coincide(e.dirRaw||'',q));
  const dentro=(rows?`<table class="htable">${rows}</table>`:'')+dir+nota+(v&&!botonAfuera?`<div class="hentry-reenvio">${reenviar}</div>`:'');
  const n=items.length;
  const pliegue=dentro?`<details class="pliegue hentry-det"${abre?' open':''}>
        <summary class="hentry-resumen"><span>${n?`${n} ${n===1?'partida':'partidas'}`:'Detalle'}</span><svg class="pliegue-flecha" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M4.5 7l4.5 4.5L13.5 7"/></svg></summary>
        <div class="hentry-det-c">${dentro}</div>
      </details>`:'';
  return `<div class="hentry" data-folio="${esc(e.folio)}">
        <div class="hentry-top">
          ${imgHTML}
          <div class="hentry-meta">
            <div class="hentry-folio">${R(e.folio)}</div>
            <div class="hentry-name">${R(e.proy||e.cliente||'Sin nombre')}</div>
            <div class="hentry-sub">${R(e.cliente||'')+(e.tel?' · '+R(e.tel):'')}</div>
            <div class="hentry-auth"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg> ${R(e.autorizador||'—')} · ${R(e.fechaAuth||'')}</div>
          </div>
          <div class="hentry-acts">
            <button class="hentry-open" onclick="reabrirDeHistorial(${jsArg(e.folio)})" title="Cargarla en el cotizador para reimprimir su PDF, o editarla con «Editar partidas»"><svg class="svgi" aria-hidden="true"><use href="#i-recalibrar"/></svg> Abrir y editar</button>
            <button class="hentry-open" onclick="usarComoBase(${jsArg(e.folio)})" title="Empezar una cotización nueva con estas mismas partidas, para cambiarles el material o la medida sin recapturarlas"><svg class="svgi" aria-hidden="true"><use href="#i-copiar"/></svg> Duplicar</button>
            <button type="button" class="hentry-del" title="Eliminar: mantén presionado" aria-label="Eliminar cotización">${ico('i-basura')}</button>
            <span class="hentry-pista" aria-hidden="true"></span>
          </div>
        </div>
        ${hitosHist(e.folio)}
        ${vigenciaHTML(e,ahora,botonAfuera?reenviar:'')}
        <div class="hentry-total">
          <span>Total autorizado</span>
          <!-- El importe va en la tinta de la app y no en verde. En este historial hay diez
               renglones y cada uno decía su total en verde, que es el color con el que la app
               dice «hecho» en todas partes; aquí no decía nada, porque TODAS las cotizaciones
               del historial están autorizadas. Lo que lo hace el número importante del renglón
               son la cifra y el peso, y el verde queda libre para la insignia de arriba, que sí
               dice un estado. El ahorro y el aumento conservan su color: esos sí comparan. --><span>${R(money(pFin))}${ajuste>0.01?`&nbsp;<small class="hentry-ajuste">(ahorro ${money(ajuste)})</small>`:''}${ajuste<-0.01?`&nbsp;<small class="hentry-ajuste inc">(aumento ${money(-ajuste)})</small>`:''}</span>
        </div>
        ${pliegue}
      </div>`;
}
/* ----- Mantener presionado para eliminar (H26 · #5) -----
   El borrado ya se podía devolver con «Deshacer» (borrarDeHistorial), pero el bote de basura
   está pegado a «Duplicar» y en un teléfono el dedo se equivoca. Sostenerlo 0,9 s lo hace
   deliberado sin pedir otra pregunta; el aviso con Deshacer sigue ahí para el que aun así se
   arrepiente. La acción va en alConfirmar: sin onclick en el marcado, porque mientras el botón
   está bajo la pieza su clic no llega. Se vuelve a armar en cada repintado de la lista: la pieza
   es idempotente y no deja nada colgado fuera del botón. Sin poder sostener (lector de pantalla,
   control por voz) un segundo «activar» dentro de 5 s confirma, y lo dice.

   La pista de un toque corto («Mantén presionado para eliminar») NO sale dentro del botón, que es
   un bote de 44 px: el rótulo temporal de la pieza ensanchaba el botón hasta sacar el renglón de
   acciones de la tarjeta. Va en un globo propio (`.hentry-pista`, encima del botón, sin ocupar
   sitio) que la pieza escribe y que se desvanece solo a los 2 s; al terminar se vacía, para que
   el siguiente toque corto vuelva a encenderlo. Los lectores de pantalla la oyen por la región
   viva de la pieza, no por el globo (aria-hidden).

   La pieza se arma SOLO sobre el bote que se toca, no sobre los de toda la lista. Armar uno cuesta
   unos 2 ms —tres cajas nuevas, doce oyentes y una lectura de estilo— y con 80 cotizaciones, en un
   teléfono de gama media, eran 170 ms más en CADA repintado, o sea en cada pausa al teclear en el
   buscador. Un oyente delegado en la lista (en captura, antes de que el evento llegue al botón)
   la arma en el primer toque, ratón, foco o tecla: los oyentes que la pieza cuelga del botón en
   ese momento sí reciben el mismo evento, así que el primer toque ya cuenta. Quien navega con
   lector llega por foco y la encuentra armada antes de activar. */
function armarBoteDeBasura(b){
  const P=window.Piezas; if(!P||!P.mantener||b.hasAttribute('data-mantener')) return;
  const caja=b.closest('.hentry'); if(!caja) return;
  const folio=caja.dataset.folio, pista=caja.querySelector('.hentry-pista');
  if(pista) pista.addEventListener('animationend',()=>{ pista.textContent=''; });
  P.mantener(b,{ms:900,tono:'mal',aviso:pista||undefined,pista:'mantén presionado para eliminar la cotización',
    otraVez:'Otra vez para eliminar',alConfirmar:()=>borrarDeHistorial(folio)});
}
function armarEntradasHistorial(body){
  if(body._bote) return;
  body._bote=true;
  const alAcercarse=e=>{ const b=e.target.closest&&e.target.closest('.hentry-del'); if(b) armarBoteDeBasura(b); };
  ['pointerdown','focusin','keydown'].forEach(ev=>body.addEventListener(ev,alAcercarse,true));
}
/* ----- Estados vacíos con salida (H17) -----
   «Aún no hay cotizaciones autorizadas» y «Ninguna cotización coincide con «x»» eran texto gris
   y sin nada que tocar. Ahora llevan una carpeta quieta —dos tarjetas desplazadas y el icono del
   historial; no se mueve— y la salida que corresponde:
     · vacío de verdad y un aparato que nunca se ha respaldado: «Restaurar un respaldo», que es
       el caso del teléfono nuevo;
     · sin coincidencias: «Borrar búsqueda» y «Buscar en clientes», o «Ver todas» si lo que no
       encuentra es una ficha.
   Un solo botón con relleno por vacío. Los botones llevan data-vacio y los atiende un oyente
   delegado (vacioAccion), así que ni el marcado ni los guiones en línea crecen. */
function vacioHTML(titulo,texto,botones){
  return `<div class="hist-empty hvacio">
    <div class="hvacio-ilu" aria-hidden="true"><i class="c1"></i><i class="c2"></i><i class="c3">${ico('i-historial')}</i></div>
    <p class="hvacio-t">${titulo}</p>
    ${texto?`<p class="hvacio-d">${texto}</p>`:''}
    ${botones.length?`<div class="hvacio-acts">${botones.map(b=>`<button type="button" class="btn ${b.primario?'btn-pri':'btn-gho'}" data-vacio="${b.que}">${b.texto}</button>`).join('')}</div>`:''}
  </div>`;
}
function nuncaRespaldado(){ return !(parseInt(prefGet(RESP_TS,'0'),10)>0); }
function histVacioHTML(){
  const sinRespaldo=nuncaRespaldado();
  return vacioHTML('Aún no hay cotizaciones autorizadas',
    'Aparecerán aquí automáticamente cuando autorices una cotización.'+(sinRespaldo?' ¿Cambiaste de teléfono? Restaura el respaldo que descargaste.':''),
    sinRespaldo?[{que:'restaurar',texto:'Restaurar un respaldo',primario:true}]:[]);
}
function histSinCoincidenciasHTML(q,filtro){
  const b=[{que:'borrar',texto:q?'Borrar búsqueda':'Ver todas',primario:true}];
  if(q) b.push({que:'clientes',texto:'Buscar en clientes'});
  const titulo=q
    ? 'Ninguna cotización coincide con «'+esc(q)+'»'+(filtro.id!=='todas'?' en «'+esc(filtro.texto)+'»':'')
    : 'Ninguna cotización en «'+esc(filtro.texto)+'»';
  return vacioHTML(titulo,'',b);
}
function cuaVacioHTML(){
  return vacioHTML('Todavía no hay clientes','Cada cotización que autorices abre o alimenta el cuaderno de su cliente.'
    +(nuncaRespaldado()?' ¿Cambiaste de teléfono? Restaura el respaldo que descargaste.':''),
    nuncaRespaldado()?[{que:'restaurar',texto:'Restaurar un respaldo',primario:true}]:[]);
}
function cuaSinCoincidenciasHTML(q){
  return vacioHTML('Ningún cliente coincide con «'+esc(q)+'»','',
    [{que:'cua-borrar',texto:'Borrar búsqueda',primario:true},{que:'cua-historial',texto:'Buscar en el historial'}]);
}
/* Una sola función para los botones de los dos vacíos. «Borrar búsqueda» deja el buscador limpio
   y con el foco, y también suelta la ficha activa: dejarla puesta mostraría una lista vacía por
   un filtro que ya nadie ve. */
function vacioAccion(que){
  if(que==='borrar'){
    const s=$('hist-search'); if(s) s.value='';
    _histFiltro='todas'; pintarFichasHistorial(); pintarHistorial();
    if(s) try{ s.focus(); }catch(_){}
  }else if(que==='clientes'){
    const q=($('hist-search')?.value||'').trim();
    delHistorialALosClientes();
    const s=$('cua-search'); if(s&&q){ s.value=q; pintarCuadernos(); }
  }else if(que==='restaurar'){
    pedirRestaurar();
  }else if(que==='cua-borrar'){
    const s=$('cua-search'); if(s) s.value='';
    pintarCuadernos();
    if(s) try{ s.focus(); }catch(_){}
  }else if(que==='cua-historial'){
    const q=($('cua-search')?.value||'').trim();
    deLosClientesAlHistorial();
    const s=$('hist-search'); if(s&&q){ s.value=q; pintarHistorial(); }
  }
}
['hist-body','cua-body'].forEach(id=>{
  const c=$(id); if(!c) return;
  c.addEventListener('click',e=>{
    const r=e.target.closest&&e.target.closest('[data-reenviar]');
    if(r){ reenviarConFechaNueva(r.getAttribute('data-reenviar')); return; }
    const v=e.target.closest&&e.target.closest('[data-vacio]');
    if(v) vacioAccion(v.getAttribute('data-vacio'));
  });
});
/* ----- Bordes que se desvanecen (H26 · #10) -----
   El historial y los cuadernos son listas largas dentro de una caja con scroll, y la lista se
   cortaba en seco contra el borde: nada decía que había más abajo. `.hist-body` es la clase de
   las dos cajas (#hist-body y #cua-body), así que una sola llamada las cubre y sigue cubriéndolas
   después de cada repintado con innerHTML. El fundido es una máscara quieta que solo aparece del
   lado donde hay contenido escondido; con el dedo y con el ratón el scroll es el nativo. */
if(window.Piezas&&Piezas.bordesDesvanecidos){
  Piezas.bordesDesvanecidos('.hist-body',{eje:'y'});
  /* Y la fila de fichas del historial (H8), que se desplaza de lado en el teléfono. */
  Piezas.bordesDesvanecidos('.hist-fichas .fichas',{eje:'x'});
}
/* ----- Qué se hizo con cada cotización, en el historial -----
   Los hitos se guardaban por folio y no se enseñaban en ninguna lista: solo en la cotización
   que estuviera cargada en pantalla. Así que la pregunta que el propio código dice querer
   contestar —«de las que presentamos, ¿cuántas se ganaron?»— seguía sin respuesta: había que
   abrir las cotizaciones una por una.

   Solo lo que ESTÁ puesto. Un renglón que enumerara los tres huecos de cada cotización vieja
   convertiría el historial en una lista de regaños; lo que hace falta saber de un folio de
   hace tres semanas es qué se le hizo, no qué le falta. Y la propuesta de Canva entra aquí
   también, que era la otra constancia que se escribía y nadie leía. */
/* ----- Los cuatro puntos de cada entrada (H3) -----
   Era una línea de texto: «✓ Propuesta · 27 ago · PDF generado · 28 ago · Chat abierto · 28 ago».
   Se lee entera, y a 360 px se parte en tres renglones dentro de una tarjeta que ya tiene folio,
   cliente, fecha y total. Lo que casi siempre se quiere saber de una cotización vieja no es qué
   día se generó el PDF: es cuáles pasos quedaron a medias.

   Ahora son los mismos cuatro hitos como el riel mini de la pieza 16 —lleno o hueco, con
   palomita y no solo color—, en el mismo orden en que se hacen, y al lado el ÚLTIMO que se hizo
   con su fecha: el dato que de verdad se busca es «¿en qué se quedó?». Los puntos llevan la
   lista completa en su nombre accesible (role="img") y la fecha de cada uno en su title, así que
   con ratón y con lector no se pierde nada de lo que decía la línea larga.

   Igual que antes: una entrada sin nada hecho no pinta nada. */
function hitosHist(folio){
  const h=hitosDe(folio);
  let propuesta=0;
  try{ const pr=getPropuestas()[folio]; if(pr&&pr.primera) propuesta=pr.primera; }catch(_){}
  const pasos=[{t:'Propuesta',ts:propuesta,hecho:'Propuesta'}]
    .concat(HITOS.map(x=>({t:x.paso,ts:h[x.k],hecho:x.hecho})));
  const puestos=pasos.filter(p=>p.ts);
  if(!puestos.length) return '';
  const ultimo=puestos[puestos.length-1];
  const riel=Piezas.rielHTML(pasos.map(p=>({
    texto:p.t, estado:p.ts?'hecho':'pendiente',
    titulo:p.t+(p.ts?' · '+hitoFecha(p.ts):' · pendiente'),
  })),{forma:'mini'});
  return `<div class="hentry-hitos">${riel}<span class="hentry-ultimo">${esc(ultimo.hecho)} · ${esc(hitoFecha(ultimo.ts))}</span></div>`;
}
function cerrarHistorial(){ $('histmodal').classList.remove('show'); }

/* Volver a abrir una cotización ya autorizada: el cliente vuelve a pedir el PDF o
   quiere copiar la venta y antes había que capturarla otra vez desde cero. */
async function reabrirDeHistorial(folio,o){
  /* `o.fechaNueva`: el PDF sale con la fecha de hoy (reenviarConFechaNueva). `o.sinAviso`: quien
     la llamó dice lo suyo y no hace falta «Cotización abierta…». */
  o=o||{};
  /* Mientras la hoja sella no se cambia de cotización: el sello volvería sin dueño y la que se
     estaba sellando se quedaría pendiente en la cola para siempre (ver selloEnVuelo). */
  if(selloEnVuelo()) return;
  guardarAutorizadaYa();   // lo que quedó en la espera de 700 ms se guarda antes de cambiar de cotización
  const e=_histData.find(x=>x.folio===folio); if(!e) return;
  const hayTrabajo=Q.estado!=='autorizada'&&(Q.items.some(it=>!itemVacio(it))||hayDatosCliente());
  if(hayTrabajo&&!await confirmar({titulo:'Tienes una cotización sin autorizar',texto:'Si abres '+folio+', la que está en pantalla se pierde.',si:'Abrir '+folio,no:'Seguir con la mía',peligro:true})) return;
  /* La pregunta pidió su atrás al cerrarse y todavía no llega: cerrar el historial antes deja
     su entrada huérfana (ver trasElAtrasDelCodigo). */
  if(hayTrabajo) await trasElAtrasDelCodigo();
  guardarParaDeshacer();
  scReset();
  Q.folio=e.folio;
  Q.proy=e.proy||''; Q.cliente=e.cliente||''; Q.tel=e.tel||'';
  Q.dirRaw=e.dirRaw||''; Q.direccion=e.direccion||''; Q.maps=e.maps||'';
  Q.entrecalles=e.entrecalles||''; Q.entrega=e.entrega||''; Q.notaCliente=e.notaCliente||'';
  Q.plazoK=(e.plazoK>=1&&e.plazoK<=5)?e.plazoK:null;
  Q.fecha=o.fechaNueva?hoy():(e.fecha||Q.fecha);
  Q.items=normalizarItems(JSON.parse(JSON.stringify(e.items||[])));
  Q.itemsAuth=JSON.parse(JSON.stringify(e.itemsAuth||{}));
  Q.iva=e.iva!==false;
  Q.precioAuth=e.precioAuth||0;
  /* Si la entrada es de antes de que existiera la huella, se sella con el trabajo tal como
     viene: lo que se guardó ES lo que se autorizó. Sin esto, cada cotización vieja del
     historial perdería su precio autorizado la primera vez que se abriera. */
  /* Una huella VACÍA guardada —no ausente, que es lo que traen las entradas de antes de que
     existiera— dice que el precio se soltó al editar y nadie lo volvió a autorizar:
     soltarAuthSiCambio la borra y autorizarConfirmado siempre la sella. Se respeta, porque
     sellarla aquí escondía que el precio de esa cotización es el calculado y que hay que
     volverlo a autorizar (ver autorizacionSuelta). Más abajo se sella de todos modos si hay
     importes congelados que defender. */
  Q.huellaAuth=e.huellaAuth!==undefined?e.huellaAuth:huellaTrabajo();
  Q.sello=e.sello||null; Q.solicitud=null;
  Q.autorizador=e.autorizador||''; Q.nota=e.nota||''; Q.fechaAuth=e.fechaAuth||'';
  Q.estado='autorizada'; Q.editMode=false; _selfAuth=false; _marcarOblig=false;
  /* El anticipo pactado vuelve como se guardó. Solo «Duplicar» lo reinicia, porque ahí
     la cotización es nueva y el anticipo se vuelve a pactar. */
  Q.anti=e.anti||0; Q.antiManual=!!e.antiManual;
  /* La imagen con la que se cotizó vuelve con la cotización. Aquí se ponía en null, y ahí
     estaba la fuga: quien abría un folio viejo para cambiarle una medida se quedaba sin la
     referencia en pantalla y, al volver a autorizar, guardarEnHistorial() escribía ese null
     encima de la imagen guardada. La cotización se conservaba completa y la foto del letrero
     desaparecía para siempre — justo la que hace falta semanas después, que es cuando el
     cliente pregunta por lo que se le cotizó.
     Solo se repone si trae url: saveHistorial() puede haberla soltado por falta de espacio,
     y esas entradas guardan el nombre pero ya no la imagen. */
  Q.aiFile=(e.aiFile&&e.aiFile.url)
    ? {name:e.aiFile.name||'',type:e.aiFile.type||'',url:e.aiFile.url}
    : null;
  /* Si el catálogo cambió desde que se autorizó, manda el importe congelado: el PDF que se
     reimprime tiene que ser idéntico al que el cliente ya tiene en la mano. Solo se
     reponen las partidas que de verdad cambiaron de precio, para no llenar itemsAuth de
     ajustes que nadie hizo. */
  (e.items||[]).forEach(it=>{
    const actual=Q.items.find(x=>x.id===it.id);
    if(!actual||it._lt===undefined) return;
    if(Math.abs(it._lt-lineTotal(actual))>0.01) Q.itemsAuth[it.id]=it._lt;
  });
  if(!Q.precioAuth&&e.neto>0&&Math.abs(e.neto-totals().neto)>0.01) Q.precioAuth=e.neto;
  /* Con algo que defender —un precio autorizado o un importe congelado— la huella tiene que
     estar puesta, venga vacía o de una versión intermedia: sin ella nada de eso se aplica. */
  if(!Q.huellaAuth&&(Q.precioAuth>0||Object.keys(Q.itemsAuth||{}).length)) sellarAuth();
  // Los ids se reutilizan tal cual, así que el contador tiene que quedar por encima
  // del mayor para que las partidas nuevas no choquen con las restauradas.
  pid=Q.items.reduce((m,it)=>Math.max(m,it.id||0),pid);
  Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
  updDirRaw(Q.dirRaw); updMaps(Q.maps);
  sincronizarPlegado();
  pintarFolio(); saveState(); renderItems();
  /* Abrir una cotización guardada es entrar a verla, no a capturarla de nuevo: se abre en
     partidas, que es donde está el trabajo y desde donde se reimprime. */
  irAPantalla(pantallaSegunDatos(),{forzar:true});
  cerrarHistorial();
  if(!o.sinAviso) toast('Cotización '+e.folio+' abierta — reimprime su PDF, o toca «Editar partidas» para cambiarla','ok',
    _vaciada?7000:5200, _vaciada?{label:'Deshacer',fn:deshacerVaciado}:null);
}

/* ----- Recotizar algo parecido -----
   «↻ Abrir» trae la cotización tal cual, autorizada, para reimprimir su PDF. Eso deja
   fuera el caso más común del negocio: el mismo cliente que pide otro letrero, o el
   local de junto que quiere lo mismo con otra medida. Antes eso se capturaba desde
   cero. Aquí se copian los datos del cliente y las partidas a una cotización NUEVA:
   folio nuevo, en borrador, con el precio recalculado y sin arrastrar nada de la
   autorización anterior. Tus plantillas son tus cotizaciones anteriores. */
async function usarComoBase(folio){
  if(selloEnVuelo()) return;   // por lo mismo que reabrirDeHistorial
  guardarAutorizadaYa();   // lo que quedó en la espera de 700 ms se guarda antes de cambiar de cotización
  const e=_histData.find(x=>x.folio===folio); if(!e) return;
  const hayTrabajo=Q.estado!=='autorizada'&&(Q.items.some(it=>!itemVacio(it))||hayDatosCliente());
  if(hayTrabajo&&!await confirmar({titulo:'Tienes una cotización sin autorizar',texto:'Si empiezas una nueva a partir de '+folio+', la que está en pantalla se pierde.',si:'Empezar desde '+folio,no:'Seguir con la mía',peligro:true})) return;
  if(hayTrabajo) await trasElAtrasDelCodigo();
  guardarParaDeshacer();
  scReset();
  /* Lo mismo que suelta nueva() —ver allá—: el folio nuevo puede ser el mismo número
     provisional del borrador que había, y entonces nada «cambia de folio». */
  _deAntes=null; _vaciadoAMano=null; Q.reauth=null; paBorradorLimpiar();
  Q.folio=nextFolio();
  Q.proy=e.proy||''; Q.cliente=e.cliente||''; Q.tel=e.tel||'';
  Q.dirRaw=e.dirRaw||''; Q.direccion=e.direccion||''; Q.maps=e.maps||'';
  Q.entrecalles=e.entrecalles||''; Q.notaCliente=e.notaCliente||'';
  /* El límite de fabricación se pacta en cada trabajo: copiarlo sería prometer una
     fecha del proyecto pasado. Y el plazo elegido a mano tampoco viaja: se vuelve a proponer
     desde las partidas de la cotización nueva. */
  Q.entrega=''; Q.plazoK=null;
  Q.fecha=hoy();
  /* Ids nuevos: los del historial pueden chocar con los de la cotización en pantalla. */
  /* El importe congelado no se copia: la cotización es nueva y su precio se calcula con el
     catálogo de hoy, que es justo para lo que sirve duplicar. */
  Q.items=normalizarItems(e.items).map(it=>{ const c=JSON.parse(JSON.stringify(it)); c.id=++pid; c.showInPdf=true; c.matAuto=false; delete c._lt; return c; });
  Q.iva=e.iva!==false;
  Q.itemsAuth={}; Q.precioAuth=0; Q.huellaAuth=''; Q.sello=null; Q.solicitud=null;
  Q.autorizador=''; Q.nota=''; Q.fechaAuth='';
  Q.estado='borrador'; Q.editMode=false; _selfAuth=false; _marcarOblig=false;
  Q.anti=0; Q.antiManual=false; Q.aiFile=null;
  Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
  updDirRaw(Q.dirRaw); updMaps(Q.maps);
  sincronizarPlegado();
  pintarFolio(); saveState(); renderItems();
  irAPantalla(pantallaSegunDatos(),{forzar:true});
  /* Y la pila de Ctrl+Z arranca aquí, por lo mismo que en nueva(). */
  pintarAvisoDeAntes(); undoBarrera();
  cerrarHistorial();
  const n=Q.items.length;
  /* La cotización que se copia puede venir sin teléfono —el historial guarda entradas de
     cuando no se pedía—, y entonces la copia nace con el candado puesto. Decirle «ajusta
     medidas y autoriza» a alguien que no puede tocar ni una es contradecir la pantalla:
     el aviso nombra el hueco, que es lo que hay que hacer antes. */
  const falta=!locked()&&faltanDatosCliente()
    ? ' — '+(datosFaltantes().length===1?'falta ':'faltan ')+listaY(datosFaltantes().map(c=>c.corto))+' para poder ajustarlas'
    : ' — ajusta medidas y autoriza';
  toast(`${Q.folio} · ${n} ${n===1?'partida copiada':'partidas copiadas'} de ${e.folio}${falta}`,'ok',
    _vaciada?7000:4600, _vaciada?{label:'Deshacer',fn:deshacerVaciado}:null);
}

/* ===================== Cuadernos de cliente =====================
   El historial contesta «¿qué cotizamos?». Esto contesta la otra pregunta, la que se
   hace cuando suena el teléfono: «¿quién es este y qué le hemos hecho?». No hay un alta
   de clientes que llenar —eso sería capturar dos veces lo mismo—: el cuaderno se arma
   solo con lo que ya guarda cada cotización autorizada.

   Quién es quién:
   · Manda el TELÉFONO, en sus últimos 10 dígitos. Es lo único que el cliente no cambia
     de una cotización a otra; el nombre se teclea «Farmacia San Juan» un martes y «farmacia
     san juan suc. centro» el jueves, y son el mismo señor.
   · Sin teléfono manda el NOMBRE normalizado. El historial trae cotizaciones de cuando el
     teléfono no era obligatorio y esas no se pueden quedar fuera.
   · Una cotización sin teléfono cuyo nombre SÍ aparece en un cuaderno con teléfono se une a
     ese cuaderno —es el mismo cliente, capturado antes—, pero solo si ese nombre apunta a un
     único teléfono. Si el mismo nombre aparece con dos teléfonos distintos, adivinar sería
     mezclar dos clientes: se queda en su propio cuaderno, a la vista, para que quien sabe
     decida.
   · Lo que no tiene ni nombre ni teléfono cae en un cuaderno «Sin identificar». Nada se
     esconde: la suma de los cuadernos es siempre el historial completo. */

/* Los últimos 10 dígitos: así «33 1234 5678», «+52 33 1234 5678» y «521 33 1234 5678»
   son el mismo cliente. Con menos de 10 no se agrupa por teléfono —un «33 12» a medias
   juntaría clientes que no tienen nada que ver. */
function telClave(t){
  const d=String(t||'').replace(/\D/g,'');
  return d.length>=10 ? d.slice(-10) : '';
}
/* El precio que de verdad se cobró: el autorizado si difiere del calculado. La misma
   regla que ya usaban el historial y el CSV, en un solo sitio. */
function totalFinalHist(e){
  return (e.precioAuth>0&&Math.abs(e.precioAuth-e.neto)>0.01)?e.precioAuth:(e.neto||0);
}

/* Se arma recorriendo el historial entero, y el historial se recorre en cada tecla del
   campo Cliente para el aviso de abajo. Se guarda el resultado hasta que el historial
   cambie: escribir es lo único que puede moverlo. */
let _cuaCache=null;
function invalidarCuadernos(){ _cuaCache=null; }
function cuadernos(){
  if(_cuaCache) return _cuaCache;
  const hist=getHistorial();
  const grupos=new Map();
  const nomTels=new Map();   // nombre normalizado -> teléfonos con los que se ha visto
  const dame=clave=>{
    let g=grupos.get(clave);
    if(!g){ g={clave,claves:[clave],cots:[]}; grupos.set(clave,g); }
    return g;
  };
  /* Pasada 1: las que traen teléfono. Van primero porque son las que forman los cuadernos
     a los que la pasada 2 puede unirse. */
  hist.forEach(e=>{
    const d=telClave(e.tel); if(!d) return;
    dame('tel:'+d).cots.push(e);
    const n=normNom(e.cliente);
    if(n){ if(!nomTels.has(n)) nomTels.set(n,new Set()); nomTels.get(n).add('tel:'+d); }
  });
  /* Pasada 2: las que no lo traen. */
  hist.forEach(e=>{
    if(telClave(e.tel)) return;
    const n=normNom(e.cliente);
    if(!n){ dame('?').cots.push(e); return; }
    const cand=nomTels.get(n);
    if(cand&&cand.size===1){
      const g=grupos.get([...cand][0]);
      g.cots.push(e);
      /* La clave vieja se recuerda: la nota del cuaderno pudo escribirse cuando este
         cliente todavía no tenía teléfono y vivía bajo «nom:». */
      if(g.claves.indexOf('nom:'+n)<0) g.claves.push('nom:'+n);
      return;
    }
    dame('nom:'+n).cots.push(e);
  });
  const prim=(g,campo)=>{ const e=g.cots.find(x=>String(x[campo]||'').trim()); return e?String(e[campo]).trim():''; };
  grupos.forEach(g=>{
    /* Las dos pasadas rompen el orden del historial dentro del grupo: se rehace, porque
       de «la más reciente manda» dependen el nombre, el teléfono y la dirección. */
    g.cots.sort((a,b)=>(b.ts||0)-(a.ts||0));
    g.nombre=prim(g,'cliente');
    /* El teléfono que se enseña es uno completo; el de 4 dígitos que alguien dejó a medias
       sirve de respaldo pero no manda. */
    const conTel=g.cots.find(x=>telClave(x.tel));
    g.tel=conTel?String(conTel.tel).trim():prim(g,'tel');
    g.dirRaw=prim(g,'dirRaw');
    g.maps=prim(g,'maps');
    /* Los otros nombres con los que se ha capturado a este mismo cliente. Se enseñan
       para que quien lo busque por el nombre viejo lo reconozca. */
    const vistos=new Set([normNom(g.nombre)]);
    g.alias=[];
    g.cots.forEach(e=>{
      const n=normNom(e.cliente);
      if(n&&!vistos.has(n)){ vistos.add(n); g.alias.push(String(e.cliente).trim()); }
    });
    g.vendido=g.cots.reduce((a,e)=>a+totalFinalHist(e),0);
    g.ultima=g.cots.reduce((a,e)=>Math.max(a,e.ts||0),0);
    g.primera=g.cots.reduce((a,e)=>Math.min(a,e.ts||Infinity),Infinity);
    if(!isFinite(g.primera)) g.primera=0;
  });
  /* El cliente con el que se habló hace menos, arriba: es el que se va a buscar. */
  _cuaCache=[...grupos.values()].sort((a,b)=>b.ultima-a.ultima);
  return _cuaCache;
}
function cuadernoDe(clave){ return cuadernos().find(g=>g.clave===clave)||null; }
/* El cuaderno al que pertenecería lo que hay ahora en pantalla, con la misma regla de
   arriba: primero el teléfono, luego el nombre. */
function cuadernoDeQ(){
  const d=telClave(Q.tel);
  const todos=cuadernos();
  if(d){ const g=todos.find(x=>x.clave==='tel:'+d); if(g) return g; }
  const n=normNom(Q.cliente);
  if(!n) return null;
  return todos.find(g=>g.clave==='nom:'+n)
      || todos.find(g=>normNom(g.nombre)===n||g.alias.some(a=>normNom(a)===n))
      || null;
}

/* ----- La nota del cuaderno -----
   Lo único del cliente que no sale de ninguna cotización: cómo paga, con quién se habla,
   qué quedó pendiente. Vive en su propia clave y entra al respaldo. */
const CUA_NOTAS='al3d_cuadernos';
const CUA_NOTA_MAX=1200;
function getCuaNotas(){ try{ const o=JSON.parse(localStorage.getItem(CUA_NOTAS)||'{}'); return (o&&typeof o==='object')?o:{}; }catch(_){ return {}; } }
function notaCuaderno(g){
  const notas=getCuaNotas();
  /* Se busca también bajo las claves viejas: un cliente que empezó sin teléfono tiene su
     nota escrita bajo «nom:» y no se puede perder por haberle capturado el celular. */
  for(const k of g.claves){ const v=notas[k]; if(v&&String(v).trim()) return String(v); }
  return '';
}
function guardarNotaCuaderno(g,txt){
  const notas=getCuaNotas();
  const limpio=String(txt||'').slice(0,CUA_NOTA_MAX);
  /* Se escribe bajo la clave de hoy y se sueltan las viejas: si no, la nota quedaría
     duplicada y la de «nom:» seguiría ganando en cuanto se vaciara la nueva. */
  g.claves.forEach(k=>{ if(k!==g.clave) delete notas[k]; });
  if(limpio.trim()) notas[g.clave]=limpio; else delete notas[g.clave];
  try{ localStorage.setItem(CUA_NOTAS,JSON.stringify(notas)); return true; }
  catch(_){ return false; }
}

/* ----- Pantalla -----
   Dos vistas en la misma caja: la lista de clientes y el cuaderno de uno. */
let _cuaData=[], _cuaAbierto=null, _cuaNotaTimer=null;
function abrirCuadernos(){
  _cuaData=cuadernos();
  _cuaAbierto=null; _cuaScrollLista=0;
  const s=$('cua-search'); if(s) s.value='';
  pintarCuadernos();
  $('cua-body').scrollTop=0;
  $('climodal').classList.add('show');
}
function cerrarCuadernos(){
  /* Si se cierra con la nota a medio escribir, el temporizador todavía no la guardó. */
  cuaGuardarNotaYa();
  $('climodal').classList.remove('show');
}
function cuaFecha(e){
  if(e.fechaAuth) return e.fechaAuth;
  if(!e.ts) return '';
  try{ return new Date(e.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); }catch(_){ return ''; }
}
function cuaIniciales(nom){
  const p=String(nom||'').trim().split(/\s+/).filter(Boolean);
  if(!p.length) return '—';
  return (p[0][0]+(p.length>1?p[1][0]:'')).toUpperCase();
}
function cuaTitulo(g){ return g.clave==='?' ? 'Sin identificar' : (g.nombre||'Sin nombre'); }

/* ----- Lo que coincide, marcado, y sin acentos (H15) -----
   El filtro de aquí buscaba con `includes` sobre el texto en minúsculas: «optica» no encontraba
   «Óptica». Ahora filtra con la misma regla con la que marca (P.plegarTexto / P.resaltar), para
   que lo que sale siempre traiga su marca. El teléfono se sigue buscando por dígitos sueltos. */
function pintarCuadernos(volver){
  const P=window.Piezas;
  _cuaAbierto=null;
  const lv=$('cua-lista-vista'); if(lv) lv.style.display='';
  $('cua-titulo').textContent='Cuadernos de cliente';
  const q=($('cua-search')?.value||'').trim();
  const qf=P.plegarTexto(q).txt;
  const qd=q.replace(/\D/g,'');
  const pl=t=>P.plegarTexto(t).txt;
  const lista=q
    ? _cuaData.filter(g=>{
        if(pl(cuaTitulo(g)).includes(qf)) return true;
        if(g.alias.some(a=>pl(a).includes(qf))) return true;
        /* Buscar por teléfono se hace tecleando dígitos sueltos, sin los espacios con los
           que se capturó: se comparan los dígitos contra los dígitos. */
        return !!qd && telClave(g.tel).includes(qd);
      })
    : _cuaData;
  const cnt=$('cua-count');
  if(cnt) cnt.textContent=_cuaData.length
    ? (q?`${lista.length} de ${_cuaData.length}`:`${_cuaData.length} cliente${_cuaData.length===1?'':'s'}`)
    : '';
  let html='';
  if(!_cuaData.length){
    html=cuaVacioHTML();
  } else if(!lista.length){
    html=cuaSinCoincidenciasHTML(q);
  } else {
    const R=t=>P.resaltar(t,q);
    html=lista.map(g=>{
      const n=g.cots.length;
      /* El alias que se enseña es el que coincidió, si la búsqueda cayó en uno: es lo que
         explica por qué este cliente salió con otro nombre. */
      const alias=g.alias.length?(qf&&g.alias.find(a=>pl(a).includes(qf))||g.alias[0]):'';
      const sub=[g.tel?R(g.tel):'', alias?'también «'+R(alias)+'»':''].filter(Boolean).join(' · ');
      return `<button class="cua-card" onclick="abrirCuaderno(${jsArg(g.clave)})" title="Abrir el cuaderno de ${esc(cuaTitulo(g))}">
        <span class="cua-ini" data-clave="${esc(g.clave)}" aria-hidden="true">${esc(cuaIniciales(cuaTitulo(g)))}</span>
        <span class="cua-card-meta">
          <span class="cua-nombre">${R(cuaTitulo(g))}</span>
          <span class="cua-sub">${sub||'Sin teléfono'}</span>
        </span>
        <span class="cua-card-num">
          <b>${money(g.vendido)}</b>
          <span>${plCot(n)}</span>
        </span>
        <span class="cua-flecha" aria-hidden="true">›</span>
      </button>`;
    }).join('');
  }
  $('cua-body').innerHTML=html;
  $('cua-foot').innerHTML=
    `<button onclick="exportarClientesCSV()" title="Descarga un renglón por cliente para Google Sheets">${ico('i-doc')} CSV de clientes</button>
     <button onclick="deLosClientesAlHistorial()" title="Ver las cotizaciones una por una">${ico('i-historial')} Ver el historial</button>
     <p class="foot-nota">Los cuadernos se arman solos con las cotizaciones autorizadas. Todo vive en este dispositivo: respalda desde el historial.</p>`;
  /* Al volver de un cuaderno, la lista queda donde estaba: sin esto regresaba arriba del todo y
     había que volver a bajar hasta el cliente que se acababa de ver. */
  $('cua-body').scrollTop=volver===true?_cuaScrollLista:0;
}

/* ----- De la lista al cuaderno, deslizando (H27) -----
   El cuaderno reemplazaba el innerHTML de #cua-body de golpe, y «Todos los clientes» lo regresaba
   igual: dos pantallas que se intercambian sin que nada diga cuál es la de adentro. Ahora el
   detalle entra por la derecha y la lista vuelve por la izquierda (P.transicion con
   `contenedor` y `direccion`), y las iniciales de la tarjeta tocada VIAJAN hasta el encabezado
   del cuaderno —el mismo `view-transition-name` en las dos—: es el mismo cliente, y se ve.

   Con View Transitions donde las hay y con FLIP de Web Animations donde no (la pieza elige); con
   menos movimiento solo corre el repintado. Sin retardos encadenados. Ojo con una cosa de las
   View Transitions: `fn` corre en el cuadro siguiente, no en el acto, así que TODO lo que
   depende del DOM nuevo —el scroll, el foco— va dentro de pintarDetalleCuaderno().

   Solo se anima cuando el modal ya está abierto. verCuadernoDe() abre el modal Y el cuaderno a la
   vez desde el formulario del cliente: ahí no hay lista de la que salir y un repintado diferido
   dejaría el modal un cuadro vacío, así que pinta directo. Y pintarCuadernos() desde el buscador
   NUNCA viaja: es teclear, y la pieza se defiende sola de eso pero aquí ni se le pide. */
let _cuaScrollLista=0;
function cuaIniDe(clave){
  const b=$('cua-body'); if(!b) return null;
  const k=(window.CSS&&CSS.escape)?CSS.escape(clave):String(clave).replace(/["\\]/g,'\\$&');
  return b.querySelector('.cua-ini[data-clave="'+k+'"]');
}
function abrirCuaderno(clave){
  const g=cuadernoDe(clave); if(!g) return;
  const P=window.Piezas;
  if(!$('climodal').classList.contains('show')||!P||!P.transicion){ pintarDetalleCuaderno(clave); return; }
  _cuaScrollLista=$('cua-body').scrollTop;
  P.transicion(()=>pintarDetalleCuaderno(clave),
    {contenedor:'#cua-body',direccion:'adelante',nombres:{'cua-ini':()=>cuaIniDe(clave)}});
}
function volverALosClientes(){
  const clave=_cuaAbierto, P=window.Piezas;
  if(!clave||!P||!P.transicion){ pintarCuadernos(true); return; }
  /* Lo escrito en la nota se guarda antes de cambiar de vista: el repintado se llevaría el
     textarea. */
  cuaGuardarNotaYa();
  P.transicion(()=>pintarCuadernos(true),
    {contenedor:'#cua-body',direccion:'atras',nombres:{'cua-ini':()=>cuaIniDe(clave)}});
}
function pintarDetalleCuaderno(clave){
  const g=cuadernoDe(clave); if(!g) return;
  const P=window.Piezas;
  _cuaAbierto=clave;
  const lv=$('cua-lista-vista'); if(lv) lv.style.display='none';
  $('cua-titulo').textContent=cuaTitulo(g);
  const n=g.cots.length;
  const prom=n?g.vendido/n:0;
  const cots=g.cots.map(e=>`<div class="cua-cot">
      <div class="cua-cot-meta">
        <div class="cua-cot-folio">${esc(e.folio)}</div>
        <div class="cua-cot-proy">${esc(e.proy||e.cliente||'Sin nombre')}</div>
        <div class="cua-cot-fecha">${esc(cuaFecha(e))}${e.autorizador?' · '+esc(e.autorizador):''}</div>
      </div>
      <div class="cua-cot-tot">${money(totalFinalHist(e))}</div>
      <div class="cua-cot-acts">
        <button onclick="cuaAbrirCot(${jsArg(e.folio)})" title="Cargarla en el cotizador para reimprimir su PDF">Abrir</button>
        <button onclick="cuaDuplicarCot(${jsArg(e.folio)})" title="Empezar una cotización nueva con estas mismas partidas">Duplicar</button>
      </div>
    </div>`).join('');
  const datos=[
    g.tel?ico('i-chat')+' '+esc(g.tel):'',
    g.dirRaw?ico('i-pin')+' '+esc(g.dirRaw.replace(/\s*\n\s*/g,' ')):''
  ].filter(Boolean).join('<br>');
  $('cua-body').innerHTML=`
    <div class="cua-det-head">
      <button class="cua-volver" onclick="volverALosClientes()">${ico('i-atras')} Todos los clientes</button>
      <div class="cua-det-fila">
        <span class="cua-ini" data-clave="${esc(g.clave)}" aria-hidden="true">${esc(cuaIniciales(cuaTitulo(g)))}</span>
        <div class="cua-det-nom">${esc(cuaTitulo(g))}</div>
      </div>
      ${datos?`<div class="cua-det-datos">${datos}</div>`:''}
      ${g.alias.length?`<div class="cua-alias">También capturado como ${g.alias.map(a=>'«'+esc(a)+'»').join(', ')}</div>`:''}
      <div class="cua-det-acts">
        <button onclick="cuaNuevaCotizacion(${jsArg(g.clave)})" title="Empieza una cotización en blanco con estos datos de cliente ya puestos">${ico('i-lapiz')} Cotizarle algo nuevo</button>
        ${g.tel?`<button onclick="cuaWhatsApp(${jsArg(g.clave)})" title="Abre el chat de WhatsApp con este cliente">${ico('i-chat')} WhatsApp</button>`:''}
        <button onclick="cuaCSV(${jsArg(g.clave)})" title="Descarga las cotizaciones de este cliente">${ico('i-doc')} CSV</button>
      </div>
    </div>
    <div class="cua-cifras">
      <div class="cua-cifra"><b class="rueda-cifra" data-cifra="n">${n}</b><span>${n===1?'Cotización':'Cotizaciones'}</span></div>
      <div class="cua-cifra"><b class="rueda-cifra" data-cifra="autorizado">${money(g.vendido)}</b><span>Autorizado</span></div>
      <div class="cua-cifra"><b class="rueda-cifra" data-cifra="promedio">${money(prom)}</b><span>Promedio</span></div>
    </div>
    <div class="cua-nota-wrap">
      <label for="cua-nota">Nota del cuaderno</label>
      <textarea id="cua-nota" maxlength="${CUA_NOTA_MAX}" placeholder="Lo que no cabe en una cotización — cómo paga, con quién se habla, qué quedó pendiente." oninput="cuaNotaEscrita()">${esc(notaCuaderno(g))}</textarea>
      <div class="cua-nota-estado" id="cua-nota-estado"><span class="cua-nota-txt">Se guarda sola en este dispositivo.</span></div>
    </div>
    <div class="cua-cots-tit">Cotizaciones autorizadas</div>
    ${cots}`;
  /* Las tres cifras ruedan SOLO si cambiaron desde la última vez que se vieron en este cuaderno
     (la memoria es por la clave y sobrevive al innerHTML): abrir el de un cliente al que se le
     acaba de autorizar otra cotización enseña de 3 a 4 en vez de llegar con el número ya
     cambiado y sin que se note. La primera vez que se abre no rueda nada. */
  if(P&&P.rodarCifra) $('cua-body').querySelectorAll('.cua-cifra b[data-cifra]').forEach(b=>
    P.rodarCifra(b,b.textContent,{clave:'cua:'+g.clave+':'+b.getAttribute('data-cifra')}));
  $('cua-foot').innerHTML=
    `<button onclick="volverALosClientes()">${ico('i-atras')} Todos los clientes</button>
     <p class="foot-nota">La primera fue el ${esc(cuaFecha(g.cots[g.cots.length-1]))||'—'}; la última, el ${esc(cuaFecha(g.cots[0]))||'—'}.</p>`;
  $('cua-body').scrollTop=0;
}

/* ----- El estado de la nota, con un glifo (H29) -----
   Era una frase gris que cambiaba entre «Escribiendo…», «Guardada…» y el error, y con el cuaderno
   abierto en el teléfono nadie la miraba. Ahora lleva delante el glifo de estado de la pieza 24,
   de 14 px: anillo punteado mientras se escribe, el arco que gira mientras se guarda, la
   palomita al quedar guardada y la ✕ si no hubo espacio. El color nunca va solo: la frase de al
   lado dice lo mismo, y la ✕ es una forma.

   El giro dura lo que dura el guardado, que en localStorage es un solo cuadro: se pinta
   «Guardando…» y el resultado entra en el cuadro siguiente. No se alarga a propósito para que se
   luzca —un giro de 300 ms sobre algo ya guardado sería decir «guardando» cuando ya se guardó—, y
   por eso casi no se ve girar: lo que sí se ve es la palomita que se dibuja al terminar. La pieza
   no ofrece una ✕ ámbar (es roja, o un «!» ámbar): se usó la ✕ roja, que es la de fallar. El
   marcado de la frase vive en un <span> aparte porque la pieza crea el glifo al principio del
   elemento y escribir su textContent entero se lo llevaría. */
function cuaEstadoNota(estado,txt){
  const est=$('cua-nota-estado'); if(!est) return;
  let t=est.querySelector('.cua-nota-txt');
  if(!t){ t=document.createElement('span'); t.className='cua-nota-txt'; est.appendChild(t); }
  t.textContent=txt;
  const P=window.Piezas;
  if(P&&P.marcaEstado&&estado) P.marcaEstado(est,estado,{tam:14});
}
/* La nota se guarda sola, medio segundo después de dejar de teclear: guardar en cada
   letra escribe en el almacenamiento decenas de veces por frase, y un botón «Guardar»
   es una cosa más que se olvida antes de cerrar. */
function cuaNotaEscrita(){
  cuaEstadoNota('espera','Escribiendo…');
  clearTimeout(_cuaNotaTimer);
  _cuaNotaTimer=setTimeout(cuaGuardarNotaYa,500);
}
function cuaGuardarNotaYa(){
  clearTimeout(_cuaNotaTimer); _cuaNotaTimer=null;
  const ta=$('cua-nota'); if(!ta||!_cuaAbierto) return;
  const g=cuadernoDe(_cuaAbierto); if(!g) return;
  cuaEstadoNota('trabaja','Guardando…');
  const ok=guardarNotaCuaderno(g,ta.value);
  /* El resultado en el cuadro siguiente: el giro alcanza a pintarse una vez. Si el modal se cerró
     mientras tanto el elemento sigue en el documento y la escritura es inofensiva. */
  const dijo=()=>{
    if(ok) cuaEstadoNota('ok','Guardada en este dispositivo.');
    else cuaEstadoNota('mal','No hubo espacio para guardar la nota — respalda y borra cotizaciones viejas.');
  };
  if(window.requestAnimationFrame) requestAnimationFrame(dijo); else dijo();
  if(!ok) toast('No hubo espacio para guardar la nota','err',4200,{label:'Respaldar',fn:()=>respaldar()});
}

/* Desde el cuaderno se llega a las mismas dos acciones del historial: son las mismas
   cotizaciones, así que se llaman las mismas funciones —no hay una segunda manera de
   abrir una cotización que pueda dejar la pantalla distinta. */
/* La guarda del sello va también aquí, antes de cerrar el cuaderno: dentro de las otras dos ya
   lo habría cerrado y el aviso de «espera» saldría sobre una pantalla que se movió. */
function cuaAbrirCot(folio){ if(selloEnVuelo()) return; _histData=getHistorial(); cerrarCuadernos(); reabrirDeHistorial(folio); }
function cuaDuplicarCot(folio){ if(selloEnVuelo()) return; _histData=getHistorial(); cerrarCuadernos(); usarComoBase(folio); }

/* Cotizarle algo nuevo: en blanco, pero sin volver a teclear quién es. No se pregunta
   nada antes porque nueva() ya deja «Deshacer» puesto sobre lo que había. */
function cuaNuevaCotizacion(clave){
  const g=cuadernoDe(clave); if(!g) return;
  if(selloEnVuelo()) return;   // nueva() también se niega; aquí, antes de cerrar el cuaderno
  const habia=Q.items.some(it=>!itemVacio(it))||!!(Q.cliente||'').trim()||!!(Q.proy||'').trim();
  cerrarCuadernos();
  if(nueva()===false) return;
  Q.cliente=(g.clave==='?')?'':(g.nombre||'');
  Q.tel=g.tel||'';
  if($('f-cli')) $('f-cli').value=Q.cliente;
  if($('f-tel')) $('f-tel').value=Q.tel;
  if(g.dirRaw){ if($('f-dir-raw')) $('f-dir-raw').value=g.dirRaw; updDirRaw(g.dirRaw); }
  if(g.maps){ if($('f-maps')) $('f-maps').value=g.maps; updMaps(g.maps); }
  saveState(); updProg(); actualizarAvisoCuaderno();
  irAPantalla('cliente',{forzar:true});
  /* Se le devuelve el foco a lo único que falta: el proyecto. */
  const fp=$('f-proy'); if(fp) try{ fp.focus(); }catch(_){}
  const nom=cuaTitulo(g);
  if(habia) toast('Cotización nueva para '+nom+' — la anterior se vació','',7000,{label:'Deshacer',fn:deshacerVaciado});
  else toast('Cotización nueva para '+nom+' — falta el proyecto','ok',3600);
}

function cuaWhatsApp(clave){
  const g=cuadernoDe(clave); if(!g) return;
  const num=telWhatsApp(g.tel);
  if(!num){ toast('El teléfono guardado de este cliente no parece un número válido','err',3400); return; }
  const w=window.open('https://wa.me/'+num,'_blank');
  if(!w) toast('Permite ventanas emergentes para abrir WhatsApp','err',3400);
}

/* ----- CSV -----
   Un renglón por cotización del cliente, con las mismas columnas del historial para que
   las dos hojas se peguen una debajo de otra. */
function cuaCSV(clave){
  const g=cuadernoDe(clave); if(!g) return;
  const enc=['Folio','Fecha de autorización','Cliente','Teléfono','Proyecto','Autorizador','Partidas','Total autorizado'];
  const filas=g.cots.map(e=>[e.folio,cuaFecha(e),e.cliente||'',e.tel||'',e.proy||'',e.autorizador||'',
    (e.items||[]).length,totalFinalHist(e).toFixed(2)].map(csvCampo).join(','));
  const csv='﻿'+[enc.map(csvCampo).join(',')].concat(filas).join('\r\n');
  /* El nombre del archivo sale del cliente y puede traer lo que sea: se deja en letras,
     números y guiones para que baje igual en Android, en iOS y en Windows. */
  const slug=cuaTitulo(g).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'').toLowerCase().slice(0,40)||'cliente';
  if(descargarArchivo(csv,`cotizador-al3d-${slug}-${selloFecha()}.csv`,'text/csv;charset=utf-8')){
    toast(`${g.cots.length} ${g.cots.length===1?'cotización exportada':'cotizaciones exportadas'} de ${cuaTitulo(g)}`,'ok',3400);
  }
}
/* Un renglón por cliente: la cartera entera, que es lo que se le enseña a alguien más. */
function exportarClientesCSV(){
  const gs=cuadernos();
  if(!gs.length){ toast('Todavía no hay clientes','',2600); return; }
  const enc=['Cliente','Teléfono','Otros nombres','Dirección','Cotizaciones','Total autorizado',
    'Promedio','Primera','Última','Nota del cuaderno'];
  const filas=gs.map(g=>[cuaTitulo(g),g.tel||'',g.alias.join(' / '),(g.dirRaw||'').replace(/\s*\n\s*/g,' '),
    g.cots.length,g.vendido.toFixed(2),(g.cots.length?g.vendido/g.cots.length:0).toFixed(2),
    cuaFecha(g.cots[g.cots.length-1]),cuaFecha(g.cots[0]),
    notaCuaderno(g).replace(/\s*\n\s*/g,' ')].map(csvCampo).join(','));
  const csv='﻿'+[enc.map(csvCampo).join(',')].concat(filas).join('\r\n');
  if(descargarArchivo(csv,`cotizador-al3d-clientes-${selloFecha()}.csv`,'text/csv;charset=utf-8')){
    toast(`${gs.length} ${gs.length===1?'cliente exportado':'clientes exportados'} a CSV`,'ok',3400);
  }
}

/* ----- El aviso bajo el campo Cliente -----
   Que el cliente ya tenga cuaderno es justo lo que hay que saber ANTES de cotizar —es un
   cliente que regresa, no uno nuevo—, y la única pantalla donde eso se decide es esta.
   Se pinta solo cuando cambia, porque cuelga de cada tecla del nombre y del teléfono. */
let _cuaAvisoClave=null;
function actualizarAvisoCuaderno(){
  const el=$('cua-aviso'); if(!el) return;
  const g=cuadernoDeQ();
  /* El cuaderno del cliente al que ya se le está cotizando ESTE folio no es noticia: si
     lo único que tiene es esta misma cotización, ya reabierta, no hay nada que contar. */
  const util=g&&g.cots.length&&!(g.cots.length===1&&g.cots[0].folio===Q.folio);
  const clave=util?g.clave+'|'+g.cots.length:'';
  if(clave===_cuaAvisoClave) return;
  _cuaAvisoClave=clave;
  if(!util){ el.style.display='none'; el.innerHTML=''; return; }
  const n=g.cots.length;
  el.innerHTML=`${ico('i-cuaderno')} <span>Ya tiene cuaderno · ${plCot(n)} · ${money(g.vendido)}</span>`
    +` <button type="button" class="cua-aviso-ver" data-clave="${esc(g.clave)}" aria-haspopup="dialog" aria-expanded="false">Ver cuaderno</button>`;
  el.style.display='flex';
}
/* ----- Un vistazo al cuaderno, sin salir del formulario (H21) -----
   «Ya tiene cuaderno · 3 cotizaciones · $45,000 · Ver cuaderno» abría el modal completo ENCIMA del
   formulario del cliente, y para decir «la vez pasada le cotizamos esto» —que es lo único que se
   quería saber, con el cliente al teléfono— había que cerrarlo y volver a buscar dónde se había
   quedado uno. Ahora el toque abre una tarjeta flotante anclada al aviso (P.vistazo, un popover
   de la capa superior) con las iniciales, las tres cotizaciones más recientes —folio, proyecto,
   total y fecha— y dos acciones: «Duplicar la última» y «Abrir cuaderno», que es lo que antes
   hacía el botón. Lo capturado en el formulario no se toca; en el teléfono sale como hoja de
   abajo.

   Se abre con el toque, no con el cursor encima: en el teléfono no hay cursor, y una tarjeta que
   sale sola al pasar por el aviso estorba más de lo que dice. Entra con el fundido breve de la
   pieza y no se mueve en reposo. Un solo globo para todos los avisos (`delegar`): el aviso se
   repinta con innerHTML cuando cambia el cuaderno, y el oyente vive en #cua-aviso, que es fijo.
   El contenido se arma en CADA apertura, con los datos de ese momento (cuadernoDe), no con los del
   momento de pintar el aviso: el cuaderno puede haber cambiado desde entonces.

   «Duplicar la última» pasa por cuaDuplicarCot() → usarComoBase(), que ya pregunta antes de
   dejar atrás una cotización a medias (y deja «Deshacer»): lo que está capturado en el formulario
   no se pierde en silencio. */
let _cuaVista=null;
function cuaVistazoHTML(g){
  const filas=g.cots.slice(0,3).map(e=>`<li>
      <span class="hvz-folio">${esc(e.folio)}</span>
      <span class="hvz-proy">${esc(e.proy||e.cliente||'Sin nombre')}</span>
      <span class="hvz-tot">${money(totalFinalHist(e))}</span>
      <span class="hvz-fecha">${esc(cuaFecha(e))}</span>
    </li>`).join('');
  return `<div class="hvz-cab">
      <span class="cua-ini" aria-hidden="true">${esc(cuaIniciales(cuaTitulo(g)))}</span>
      <div><b class="hvz-nom">${esc(cuaTitulo(g))}</b><small>${esc(plCot(g.cots.length))} · ${money(g.vendido)}</small></div>
    </div>
    <ul class="hvz-cots" aria-label="Las cotizaciones más recientes">${filas}</ul>
    <div class="vistazo-acciones">
      <button type="button" class="btn btn-gho" data-cua="duplicar">Duplicar la última</button>
      <button type="button" class="btn btn-gho" data-cua="abrir">Abrir cuaderno</button>
    </div>`;
}
function montarVistazoCuaderno(){
  const P=window.Piezas; if(!P||!P.vistazo||!$('cua-aviso')||_cuaVista) return;
  _cuaVista=P.vistazo('cua-aviso',{delegar:'.cua-aviso-ver',titulo:'Cuaderno del cliente',hoja:true,
    contenido:(ancla,pop)=>{
      const g=cuadernoDe(ancla.getAttribute('data-clave'));
      pop.dataset.clave=g?g.clave:'';
      return g?cuaVistazoHTML(g):'<p class="vistazo-texto">Este cuaderno ya no existe.</p>';
    },
    alAbrir:pop=>{
      if(pop._cuaOyente) return;
      pop._cuaOyente=true;
      pop.addEventListener('click',e=>{
        const b=e.target.closest&&e.target.closest('[data-cua]'); if(!b) return;
        const g=cuadernoDe(pop.dataset.clave); if(!g) return;
        const que=b.getAttribute('data-cua');
        _cuaVista.cerrar('codigo');
        if(que==='abrir') verCuadernoDe(g.clave);
        else if(que==='duplicar'&&g.cots.length) cuaDuplicarCot(g.cots[0].folio);
      });
    }});
}
montarVistazoCuaderno();
/* Entrar al cuaderno de un cliente sin pasar por la lista. _cuaData tiene que quedar
   cargado igual: es de donde sale la lista cuando se toca «Todos los clientes». */
function verCuadernoDe(clave){
  _cuaData=cuadernos();
  pintarDetalleCuaderno(clave);   // directo y no abrirCuaderno(): el modal aún no está abierto, no hay de dónde deslizar
  $('climodal').classList.add('show');
}

/* ===================== Respaldo, restauración y CSV =====================
   Todo lo que hace esta app —historial, folios, cotización en curso, logotipo— vive
   en el almacenamiento local de ESTE navegador. Se pierde al borrar los datos del
   navegador, al cambiar de teléfono o cuando iOS limpia los sitios que llevan semanas
   sin abrirse. Hasta ahora no había forma de sacarlo ni de moverlo.

   Las llaves de IA no viajan en el respaldo porque ya no viven en el teléfono: desde
   septiembre de 2026 están en la hoja (ver ia.js). Un respaldo se manda por WhatsApp o
   por correo, y una llave que viajara así dejaría de ser secreta. */
/* Van aquí arriba y no junto a `respaldar()` porque RESPALDO_KEYS es un `const` que se
   inicializa al cargar el archivo y las nombra: declararlas después reventaba el script. */
const RESP_TS='al3d_respaldo_ts', RESP_N='al3d_respaldo_n';
const RESP_DIAS=30, RESP_COTS=10, RESP_PRIMERAS=3;
/* `al3d_pf_ganadas` es la ÚNICA clave `al3d_pf_` que entra, y es a propósito: la escribe el
   cotizador —es su constancia de «esta cotización se vendió»— y de ella sale el hito «venta
   registrada». Sin ella, un teléfono nuevo restauraría el historial completo y no sabría
   cuáles de esas cotizaciones ya se vendieron. La plataforma la drena por folio y descarta
   lo repetido, así que reinstalar una vieja no duplica proyectos.
   js/datos/cotizador.js lleva la MISMA lista para armar el respaldo completo desde la
   plataforma; pruebas/respaldo.mjs comprueba que las dos digan lo mismo. */
const RESPALDO_KEYS=['al3d_historial','al3d_folio','al3d_q','al3d_queue','al3d_logo',CANVA_KEY,HITOS_KEY,'al3d_pf_ganadas',
  CUA_NOTAS,AI_FILE_KEY,PREF_AUTORIZADOR,PREF_MATERIAL,PREF_RV_PCT,PREF_RV_CUENTA,
  RESP_TS,RESP_N];
/* El día de un respaldo, en la hora de aquí. El archivo guarda la fecha en ISO —en UTC, que es
   lo que se lee de vuelta sin ambigüedad— y aquí se enseñaba recortada a sus diez primeros
   caracteres: en Guadalajara, de las seis de la tarde en adelante eso es MAÑANA, y el aviso de
   restaurar decía «el respaldo del 24» de uno que se bajó el 23 — con el nombre del archivo,
   que sí va en hora local, diciendo lo contrario. */
function fechaDeRespaldo(iso){
  const d=new Date(iso||'');
  if(isNaN(d.getTime())) return String(iso||'').slice(0,10);
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function selloFecha(){
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
/* Descarga un archivo generado en el momento. `<a download>` es lo único que funciona
   igual en Android y en iOS moderno; si el navegador no lo soporta, se abre en una
   pestaña para que se guarde desde ahí. */
function descargarArchivo(texto,nombre,tipo){
  try{
    const blob=new Blob([texto],{type:tipo});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    if('download' in a){
      a.href=url; a.download=nombre; a.style.display='none';
      document.body.appendChild(a); a.click(); a.remove();
    } else window.open(url,'_blank');
    setTimeout(()=>{ try{URL.revokeObjectURL(url);}catch(_){} },60000);
    return true;
  }catch(_){ toast('Este navegador no permitió descargar el archivo','err',3400); return false; }
}
function armarRespaldo(){
  const datos={};
  RESPALDO_KEYS.forEach(k=>{ try{ const v=localStorage.getItem(k); if(v!==null) datos[k]=v; }catch(_){} });
  return JSON.stringify({app:'cotizador-al3d',formato:1,fecha:new Date().toISOString(),datos});
}
/* ----- El respaldo no se pedía nunca, y no se sabía cuánto llevaba sin hacerse -----
   Los datos —historial, folios, cotización en curso, notas, logotipo— viven solo en este
   aparato y se pierden al borrar los datos del navegador, al cambiar de teléfono o cuando iOS
   limpia los sitios que llevan semanas sin abrirse. Y el respaldo era manual, en el pie de un
   modal, sin que la app lo mencionara jamás: de los siete sitios que llaman a `respaldar()`,
   seis son avisos de «no hubo espacio», o sea que se ofrecía cuando ya se estaba perdiendo
   algo. Tampoco quedaba rastro de haberlo hecho, así que ni siquiera se podía saber cuánto
   llevaba sin uno.

   Ahora se apunta la fecha y cuántas cotizaciones se llevó, y de ahí salen dos cosas: el pie
   del historial dice cuándo fue el último —donde antes decía por tercera vez que todo se
   guarda en este dispositivo—, y el aviso de «autorizada» lo nombra cuando está vencido. NO es
   un aviso nuevo: es el que ya sale al autorizar, con el botón que `toast()` ya sabe pintar.
   Autorizar es el único momento del día en que se acaba de crear algo que dolería perder. */
function respaldoEstado(){
  const ts=parseInt(prefGet(RESP_TS,'0'),10)||0;
  const n=parseInt(prefGet(RESP_N,'0'),10)||0;
  const total=getHistorial().length;
  const sinRespaldar=Math.max(0,total-n);
  const dias=ts?Math.floor((Date.now()-ts)/86400000):null;
  /* Nunca respaldado también vence, porque el caso peor es el del primer mes de uso, cuando
     nadie ha abierto todavía el pie del historial. Pero no en la primera cotización: ahí lo que
     importa es la confirmación de que se guardó, y avisar de «1 sin respaldar» encima de la
     primera venta de la vida del aparato es cambiar una buena noticia por un regaño. Desde la
     tercera, la app ya se explicó sola y sí hay algo que dolería perder. */
  const vencido=total>0&&((!ts&&total>=RESP_PRIMERAS)||sinRespaldar>=RESP_COTS||dias>=RESP_DIAS);
  return {ts,dias,total,sinRespaldar,vencido};
}
function respaldoTexto(){
  const r=respaldoEstado();
  if(!r.total) return '';
  if(!r.ts) return 'Nunca has respaldado este dispositivo.';
  const cuando=r.dias===0?'hoy':r.dias===1?'ayer':'hace '+r.dias+' días';
  return 'Último respaldo '+cuando+(r.sinRespaldar?' · '+r.sinRespaldar+' sin respaldar':'')+'.';
}
function respaldar(nombre){
  const n=getHistorial().length;
  if(descargarArchivo(armarRespaldo(),nombre||`cotizador-al3d-respaldo-${selloFecha()}.json`,'application/json')){
    prefSet(RESP_TS,Date.now()); prefSet(RESP_N,n);
    pintarPieHistorial();
    toast(`Respaldo descargado · ${n} ${n===1?'cotización':'cotizaciones'}`,'ok',3600);
  }
}
/* El pie del historial es un nodo fijo del HTML, así que se reescribe solo su renglón. */
function pintarPieHistorial(){
  const el=$('hist-nota'); if(!el) return;
  const t=respaldoTexto();
  /* La segunda frase es la misma que trae el HTML: la de antes hablaba de «tus API keys» en el
     teléfono, que ya no existen aquí —viven en la hoja—, y pisaba la correcta en cada repintado. */
  el.innerHTML=(t?esc(t)+' ':'')+'Las llaves de IA no viven en este teléfono: están en la hoja de AL3D.';
}
function pedirRestaurar(){ $('restaurarin').click(); }
/* ----- La forma de un respaldo, revisada en UN solo sitio -----
   Antes solo se miraba la etiqueta 'app' y de ahí se escribía directo en el almacenamiento: un
   respaldo truncado o editado a mano pasaba el filtro, borraba lo que había y anunciaba éxito,
   dejando la app sin arrancar. Se revisa la FORMA de lo que viene antes de tocar nada.
   Y antes de PINTAR nada: la tarjeta de ofrecerRestauracionPendiente leía el mismo paquete sin
   revisarlo y metía su `.length` en un innerHTML. Un `al3d_historial` que fuera el objeto
   {"length":"<img src=x onerror=…>"} corría en cada apertura del cotizador, con los tokens del
   teléfono a mano y la ventanilla de la plataforma (parent.AL3D) al alcance. Devuelve
   {paquete, completo, cuantas} o {error, dur}. */
function revisarRespaldo(texto){
  let paquete;
  try{ paquete=JSON.parse(texto); }
  catch(_){ return {error:'Ese archivo no se pudo leer — ¿es el respaldo?',dur:3600}; }
  /* El respaldo COMPLETO —el que baja la plataforma— trae las dos mitades en un solo archivo.
     Aquí se toma la del cotizador y se sigue igual que siempre; la otra mitad la restaura la
     plataforma desde Ajustes. Un solo archivo para mover TODO de un aparato a otro, que es la
     única forma de usar la app en el teléfono y en la computadora mientras no haya servidor. */
  let completo=false;
  if(paquete&&paquete.app==='al3d-completo'&&paquete.cotizador&&typeof paquete.cotizador==='object'){
    paquete=paquete.cotizador; completo=true;
  }
  if(!paquete||typeof paquete!=='object'||paquete.app!=='cotizador-al3d'||!paquete.datos){
    return {error:'Ese archivo no es un respaldo del cotizador',dur:3600};
  }
  const D=paquete.datos;
  if(typeof D!=='object'||Array.isArray(D)||Object.values(D).some(v=>typeof v!=='string'&&v!==null)){
    return {error:'El respaldo está dañado: sus datos no tienen la forma esperada',dur:4600};
  }
  if(!Object.keys(D).some(k=>RESPALDO_KEYS.includes(k))){
    return {error:'El respaldo no trae ninguno de los datos del cotizador',dur:4600};
  }
  /* Las dos claves que pueden dejar la app inservible se parsean de prueba. */
  let cuantas=0;
  try{
    if(D['al3d_historial']!=null && !Array.isArray(JSON.parse(D['al3d_historial']))) throw 0;
    /* Ya se sabe que es un arreglo: su `length` es un número y no un texto de nadie. */
    if(D['al3d_historial']!=null) cuantas=JSON.parse(D['al3d_historial']).length;
    if(D['al3d_queue']!=null && !Array.isArray(JSON.parse(D['al3d_queue']))) throw 0;
    if(D['al3d_q']!=null){
      const q=JSON.parse(D['al3d_q']);
      if(!q||typeof q!=='object'||!Array.isArray(q.items)) throw 0;
    }
  }catch(_){
    return {error:'El respaldo está dañado: el historial o la cotización en curso no se pueden leer',dur:5200};
  }
  return {paquete,completo,cuantas};
}
/* ----- Restaurar, con los pasos a la vista (H25) -----
   Tras confirmar, salía «Respaldo restaurado — recargando…» y la página se recargaba a los 900 ms
   sin que se viera qué había pasado: si la copia de lo de antes no se descargó, o si algo no
   cupo, lo que quedaba era una pantalla que se reiniciaba sola. Restaurar es lo único de la app
   que reemplaza TODO lo de un teléfono, y es justo donde quien lo hace quiere ver que va bien.

   Ahora es una vista dentro del propio historial —la capa que ya existe, con su Escape, su
   «atrás» y su foco—, con tres renglones de la traza (pieza 8): «Copia de lo que había,
   descargada», «23 cotizaciones escritas» y «Recargando». Cada uno se marca cuando ese paso de
   verdad terminó, y si uno falla se queda en ✕ con su motivo y la frase «No se cambió nada»: los
   dos primeros pasos son las dos guardas de siempre (no se reemplaza nada si la copia no bajó, y
   si no cupo todo se devuelve lo anterior clave por clave). Los pasos son síncronos y duran un
   parpadeo; entre uno y otro se deja un respiro de 450 ms para que se alcance a leer la marca,
   que es lo que se compra con los 700 ms de más antes de recargar.

   La confirmación es de las que no tienen vuelta, así que se sostiene (pieza 5): mantener
   presionado «Restaurar» 1,2 s; con teclado, Enter o Espacio sostenidos, y sin poder sostener
   un segundo «activar» dentro de 5 s. Antes era el confirmar() de siempre, con un toque. La vista
   la abren por igual el botón «Restaurar» del pie, el vacío del historial y la tarjeta que deja
   la plataforma (restaurarPendiente): las tres llegan a restaurarDesde(). */
let _restPaquete=null, _restTraza=null, _restOcupada=false, _restCuantas=0;
function mostrarRestauracion(rv){
  const P=window.Piezas, panel=$('hist-restaurar');
  if(!P||!panel){ toast('No se pudo abrir la vista de restaurar — no se cambió nada','err',4200); return; }
  /* La vista vive en el historial. Si lo que está abierto es Cuadernos, se pasa a él igual que
     con «Ver el historial» (cede la entrada del «atrás»); si no hay nada, se abre. */
  if($('climodal').classList.contains('show')) deLosClientesAlHistorial();
  else if(!$('histmodal').classList.contains('show')) abrirHistorial();
  _restPaquete=rv.paquete; _restCuantas=rv.cuantas; _restOcupada=false;
  const fecha=fechaDeRespaldo(rv.paquete.fecha), n=rv.cuantas;
  $('hist-rest-txt').textContent='Reemplaza el historial, los folios y la cotización en curso de este teléfono por los del respaldo'
    +(fecha?' del '+fecha:'')+' ('+n+' '+(n===1?'cotización':'cotizaciones')+'). Antes se descarga una copia de lo que hay ahora.'
    +(rv.completo?' Es un respaldo completo: aquí se restaura la parte del cotizador; la de la plataforma se restaura en Plataforma → Ajustes.':'');
  const caja=$('hist-rest-pasos');
  caja.innerHTML=P.trazaHTML({etiqueta:'Pasos de la restauración',pasos:[
    {clave:'copia',texto:'Descargar una copia de lo que hay ahora',estado:'espera'},
    {clave:'escribir',texto:'Escribir '+(n===1?'la cotización':'las '+n+' cotizaciones')+' del respaldo',estado:'espera'},
    {clave:'recarga',texto:'Recargar la app',estado:'espera'}]});
  _restTraza=P.traza(caja.firstElementChild,{reloj:false});
  $('hist-rest-fin').textContent='';
  const no=$('hist-rest-no'); no.textContent='Cancelar';
  const si=$('hist-rest-si'); si.hidden=false; si.disabled=false;
  /* La pista de «mantén presionado» sale en la línea de estado de la vista, no en el botón. */
  P.mantener(si,{ms:1200,tono:'mal',aviso:'hist-rest-fin',pista:'mantén presionado para restaurar',
    otraVez:'Otra vez para restaurar',textoHecho:'Restaurando…',alConfirmar:ejecutarRestauracion});
  panel.hidden=false;
  panel.closest('.hist-panel').classList.add('restaurando');
  /* El foco va al título de la vista —el lector la anuncia— y no a «Cancelar»: así ningún botón
     queda enfocado de entrada con su aro, y lo destructivo no queda a un Enter de distancia. */
  const alTitulo=()=>{ if(!panel.hidden) try{ $('hist-rest-t').focus({preventScroll:true}); }catch(_){} };
  alTitulo();
  /* Si el modal se acaba de abrir, el foco del vigilante de capas llega en el cuadro siguiente y
     se llevaba el nuestro: se vuelve a pedir cuando ya pasó. */
  setTimeout(alTitulo,90);
}
/* Se va la vista y vuelve la lista. Con una restauración en marcha no se esconde (la recarga viene
   en camino y los pasos son lo único que dice qué pasa), salvo que se pida a la fuerza: abrir el
   historial de nuevo siempre empieza por la lista. Cerrar el modal NO la esconde: no hace falta,
   porque abrirlo otra vez la esconde (abrirHistorial), y así cerrarHistorial() queda como era. */
function ocultarRestauracion(forzar){
  const panel=$('hist-restaurar'); if(!panel||panel.hidden) return;
  if(_restOcupada&&!forzar) return;
  panel.hidden=true;
  const hp=panel.closest('.hist-panel'); if(hp) hp.classList.remove('restaurando');
  _restPaquete=null; _restTraza=null; _restOcupada=false;
}
async function ejecutarRestauracion(){
  if(_restOcupada||!_restPaquete) return;
  _restOcupada=true;
  const P=window.Piezas, t=_restTraza, paquete=_restPaquete, n=_restCuantas;
  /* Un respiro para que la marca se vea; con menos movimiento, apenas uno. Con setTimeout y no con
     requestAnimationFrame: en una pestaña en segundo plano el segundo no corre nunca. */
  const pausa=ms=>new Promise(r=>setTimeout(r,P.sinMovimiento()?Math.min(ms,120):ms));
  const fin=$('hist-rest-fin'), no=$('hist-rest-no'), si=$('hist-rest-si');
  /* El renglón que falla se reescribe en pasado y con lo que pasó: «Descargando una copia…» con una ✕
     al lado se leía como que todavía estaba en curso. */
  const fallo=(clave,texto,detalle,aviso)=>{
    t.paso(clave,texto,'mal',detalle);
    t.terminar({ok:false});
    fin.textContent='No se cambió nada.';
    voz('No se cambió nada',true);   // la traza dice qué paso falló; esta frase, lo que importa de todo eso
    no.textContent='Volver';
    /* «Restaurar» NO se esconde: el dedo sigue encima cuando esto falla (se sostiene 1,2 s) y, al
       quitarlo, «Volver» se corría a ese mismo lugar y recibía el toque de soltar: la vista se
       cerraba antes de que se pudiera leer «No se cambió nada». Se queda donde estaba, apagado, y
       sin la pieza: es un botón de «Restaurar» que ya no se puede sostener. */
    P.mantener.quitar(si); si.disabled=true;
    _restOcupada=false;
    toast(aviso,'err',5200);
  };
  t.paso('copia','Descargando una copia de lo que hay ahora…','trabaja');
  await pausa(60);
  /* La pregunta acaba de prometer que antes de reemplazar se descarga un respaldo de lo
     que hay ahora. Si la descarga no salió, no se reemplaza nada: en la app instalada
     de iOS descargarArchivo() devuelve false y antes se destruía el historial igual. */
  if(!descargarArchivo(armarRespaldo(),`cotizador-al3d-antes-de-restaurar-${selloFecha()}.json`,'application/json')){
    return fallo('copia','La copia de lo que había no se descargó','','No se pudo descargar el respaldo previo — no se cambió nada');
  }
  t.paso('copia','Copia de lo que había, descargada','ok');
  await pausa(450);
  t.paso('escribir','Escribiendo '+(n===1?'la cotización':'las '+n+' cotizaciones')+'…','trabaja');
  await pausa(60);
  /* Copia de lo que hay, para poder devolverlo. Antes se borraba todo y se reescribía
     con un catch vacío por clave: si una no cabía se quedaba a medias, sin lo viejo y
     sin lo nuevo, y el aviso de éxito salía igual. */
  const previo={};
  RESPALDO_KEYS.forEach(k=>{ try{ previo[k]=localStorage.getItem(k); }catch(_){} });
  const fallaron=[];
  try{
    /* Se limpian primero las claves que maneja la app: si el respaldo no traía alguna
       —por ejemplo no había logotipo—, lo correcto es que tampoco quede la de antes. */
    RESPALDO_KEYS.forEach(k=>{ try{ localStorage.removeItem(k); }catch(_){} });
    Object.entries(paquete.datos).forEach(([k,v])=>{
      if(RESPALDO_KEYS.includes(k)) { try{ localStorage.setItem(k,v); }catch(_){ fallaron.push(k); } }
    });
  }catch(_){ fallaron.push('(escritura)'); }
  if(fallaron.length){
    RESPALDO_KEYS.forEach(k=>{
      try{ localStorage.removeItem(k); if(previo[k]!=null) localStorage.setItem(k,previo[k]); }catch(_){}
    });
    return fallo('escribir','No cupo el respaldo en este dispositivo','('+fallaron.length+' '+(fallaron.length===1?'clave':'claves')+')','No cupo el respaldo en este dispositivo ('+fallaron.length+' '+(fallaron.length===1?'clave':'claves')+') — no se cambió nada');
  }
  try{ localStorage.removeItem(RESTAURAR_PF_KEY); }catch(_){}
  t.paso('escribir',n>0?(n===1?'1 cotización escrita':n+' cotizaciones escritas'):'Datos del respaldo escritos','ok');
  await pausa(450);
  t.paso('recarga','Recargando…','trabaja');
  fin.textContent='Listo: se recarga la app con lo del respaldo.';
  await pausa(600);
  location.reload();
}
function restaurarDesde(texto){
  const rv=revisarRespaldo(texto);
  if(rv.error){ toast(rv.error,'err',rv.dur); return; }
  mostrarRestauracion(rv);
}
$('hist-rest-no').addEventListener('click',()=>{ if(!_restOcupada) ocultarRestauracion(); });
/* ----- La restauración que deja la plataforma -----
   Cuando en Plataforma → Ajustes se restaura un respaldo completo, la plataforma restaura su
   mitad y deja la del cotizador aquí, en una clave suya, porque tiene prohibido escribir las
   claves del cotizador. Al abrir, el cotizador la ofrece con un botón; restaurar sigue
   pasando por restaurarDesde(), con su confirmación y su copia previa: nada se pisa solo. */
const RESTAURAR_PF_KEY='al3d_pf_restaurar';
/* Va como tarjeta fija arriba del contenido y NO como aviso emergente: el aviso es de una sola
   instancia y cualquier otro del arranque —el del service worker, el del respaldo vencido— lo
   tapa en un segundo, y una restauración que se ofreció y desapareció es una que nadie hizo.
   La forma es la de «lo que hay que decidir antes de seguir», que el cotizador ya usa. */
function ofrecerRestauracionPendiente(){
  let t=null; try{ t=localStorage.getItem(RESTAURAR_PF_KEY); }catch(_){}
  if(!t) return;
  /* Se revisa con la misma regla que al restaurar, y ANTES de pintar: un paquete que no pasaría
     restaurarDesde() tampoco se ofrece —el botón solo llevaría a un error—, y lo que se pinta
     sale de lo ya revisado (ver revisarRespaldo). Se queda en la clave: es de la plataforma. */
  const rv=revisarRespaldo(t);
  if(rv.error) return;
  const fecha=fechaDeRespaldo(rv.paquete.fecha), cuantas=Number(rv.cuantas)||0;
  const main=$('contenido'); if(!main||$('pf-restaurar')) return;
  const card=document.createElement('div');
  card.className='cand-partidas'; card.id='pf-restaurar'; card.setAttribute('role','region'); card.setAttribute('aria-label','Respaldo pendiente de restaurar');
  card.innerHTML='<p class="cp-txt"><svg class="svgi" aria-hidden="true"><use href="#i-historial"/></svg> <b>La plataforma dejó un respaldo completo'+(fecha?' del '+esc(fecha):'')+'</b>'
    +(cuantas?' con '+esc(cuantas)+(cuantas===1?' cotización':' cotizaciones'):'')+', esperando la parte del cotizador. Restaurar reemplaza lo que hay aquí; antes se descarga una copia de lo actual.</p>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
    +'<button type="button" class="btn btn-ok" style="width:auto;padding:0 16px" onclick="restaurarPendiente()">Restaurar ahora</button>'
    +'<button type="button" class="btn btn-gho" style="width:auto;padding:0 16px" onclick="ocultarRestauracionPendiente()">Ahora no</button></div>';
  main.insertBefore(card,main.firstChild);
}
function restaurarPendiente(){
  let t=null; try{ t=localStorage.getItem(RESTAURAR_PF_KEY); }catch(_){}
  if(!t){ ocultarRestauracionPendiente(); toast('Ya no hay ningún respaldo esperando','',3200); return; }
  restaurarDesde(t);
}
/* «Ahora no» esconde la tarjeta hasta la próxima vez que se abra la app; la clave se queda,
   porque lo que espera ahí es el historial de otro aparato y tirarlo no es un toque. */
function ocultarRestauracionPendiente(){ const c=$('pf-restaurar'); if(c) c.remove(); }
$('restaurarin').addEventListener('change',e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  const r=new FileReader();
  r.onload=ev=>restaurarDesde(String(ev.target.result||''));
  r.onerror=()=>toast('No se pudo leer el archivo','err',3200);
  r.readAsText(f);
});
/* CSV para Google Sheets. Con BOM al principio para que Sheets y Excel respeten los
   acentos, y con CRLF, que es lo que espera el formato. */
function csvCampo(v){
  const s=String(v===undefined||v===null?'':v);
  /* Excel y Sheets ejecutan como fórmula cualquier celda que empiece con = + - @ o tab. No
     hace falta mala intención: «+52 33 1234 5678» es la forma normal de escribir un celular
     mexicano y llegaba a la hoja como #ERROR!, justo en la columna que sirve para volver a
     llamarle al cliente. Y el cliente y el proyecto los puede escribir la IA, que es un dato
     de fuera. Se antepone un apóstrofo, que Sheets no muestra pero sí desactiva.
     Los números puros se dejan intactos: Subtotal, IVA y Total tienen que seguir siendo
     números, y «Ajuste» puede empezar con un menos legítimo. */
  const esNumero=/^-?\d+(\.\d+)?$/.test(s);
  if(!esNumero && /^[=+\-@\t\r]/.test(s)) return '"\''+s.replace(/"/g,'""')+'"';
  return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function exportarHistorialCSV(){
  const arr=getHistorial();
  if(!arr.length){ toast('Todavía no hay cotizaciones autorizadas','',2600); return; }
  const enc=['Folio','Fecha de autorización','Cliente','Teléfono','Proyecto','Dirección',
    'Autorizador','Partidas','Subtotal','IVA','Total calculado','Precio autorizado','Ajuste','Detalle',
    'Dispositivo'];
  const filas=arr.map(e=>{
    const pFin=totalFinalHist(e);
    const ajuste=+(e.neto-pFin).toFixed(2);
    const detalle=(e.items||[]).map((it,i)=>`${i+1}. ${histDsc(it)}`).join(' · ');
    return [e.folio,e.fechaAuth||'',e.cliente||'',e.tel||'',e.proy||'',(e.dirRaw||'').replace(/\s*\n\s*/g,' '),
      e.autorizador||'',(e.items||[]).length,
      (e.sub||0).toFixed(2),(e.iva?((e.neto||0)-(e.sub||0)):0).toFixed(2),
      (e.neto||0).toFixed(2),pFin.toFixed(2),ajuste.toFixed(2),detalle,
      e.disp||''].map(csvCampo).join(',');
  });
  const csv='﻿'+[enc.map(csvCampo).join(',')].concat(filas).join('\r\n');
  if(descargarArchivo(csv,`cotizador-al3d-historial-${selloFecha()}.csv`,'text/csv;charset=utf-8')){
    toast(`${arr.length} ${arr.length===1?'cotización exportada':'cotizaciones exportadas'} a CSV`,'ok',3400);
  }
}

/* ===================== Cola de autorización ===================== */
/* Con la misma guarda que getHistorial(): un respaldo cuya cola llegó como objeto y no como
   lista pasaba la validación de restaurarDesde() y después `findIndex is not a function`
   tronaba a media autorización. */
function getQueue(){ try{ const a=JSON.parse(localStorage.getItem('al3d_queue')||'[]'); return Array.isArray(a)?a:[]; }catch(_){return [];} }
/* La cola guardaba una copia COMPLETA de cada cotización —partidas incluidas— para
   siempre, también de las ya autorizadas o rechazadas, que no se listan en ningún lado, y
   borrar del historial no la liberaba. Lo que ya cerró su ciclo se queda sin snapshot: de
   lo autorizado ya se encarga el historial. Se conserva el renglón porque de él salen los
   folios ocupados. */
function saveQueue(arr){
  const limpio=arr.map(e=>e.estado==='pendiente'?e:Object.assign({},e,{q:null}));
  try{localStorage.setItem('al3d_queue',JSON.stringify(limpio));}catch(_){}
}
function removeFromQueue(folio){ saveQueue(getQueue().filter(x=>x.folio!==folio)); }

function pushToQueue(){
  const arr=getQueue();
  const neto=totals().neto;
  const snapshot=JSON.parse(JSON.stringify({...Q,aiFile:null}));
  const entry={folio:Q.folio,proy:Q.proy,cliente:Q.cliente,neto,fecha_sol:Q.fecha,estado:'pendiente',precioAuth:0,autorizador:'',nota:'',fechaAuth:'',q:snapshot};
  const idx=arr.findIndex(x=>x.folio===Q.folio);
  if(idx>=0) arr[idx]=entry; else arr.push(entry);
  saveQueue(arr);
}

function updateQueueEntry(folio,changes){
  const arr=getQueue();
  const idx=arr.findIndex(x=>x.folio===folio);
  if(idx>=0){ Object.assign(arr[idx],changes); saveQueue(arr); }
}

async function loadQueueEntry(folio){
  if(folio===Q.folio) return;
  if(selloEnVuelo()) return;
  guardarAutorizadaYa();   // lo que quedó en la espera de 700 ms se guarda antes de cambiar de cotización
  const arr=getQueue();
  const entry=arr.find(x=>x.folio===folio);
  if(!entry||!entry.q) return;
  /* itemVacio es la prueba de «esta partida no tiene nada capturado». Con Q.items.length el
     aviso salía siempre, porque init() y nueva() dejan una partida vacía en pantalla: se
     preguntaba por trabajo que no existía y se enseñaba a ignorar la pregunta. */
  const hayCambiosSinGuardar=Q.estado==='borrador'&&(Q.items.some(it=>!itemVacio(it))||Q.proy.trim()||Q.cliente.trim());
  if(hayCambiosSinGuardar&&!await confirmar({titulo:'Tienes una cotización sin guardar',texto:'Si abres '+folio+', la que está en pantalla se pierde.',si:'Abrir '+folio,no:'Seguir con la mía',peligro:true})) return;
  /* Una revisión a medias también es trabajo que se pierde: el autorizador puede llevar
     media cotización ajustada partida por partida y esa guarda de arriba no la veía,
     porque solo mira los borradores. */
  /* El precio final que se lleva tecleado vive en el borrador del formulario (paBorrador), no
     en Q.precioAuth —ése solo existe cuando la hoja selló—, así que también cuenta. */
  const hayRevisionSinCerrar=Q.estado==='pendiente'&&(Q.precioAuth>0||Object.keys(Q.itemsAuth||{}).length>0||paBorrador()!==null);
  if(hayRevisionSinCerrar&&!await confirmar({titulo:'Llevas ajustes de precio sin autorizar',texto:'Los de '+Q.folio+' se pierden si abres '+folio+'.',si:'Abrir '+folio,no:'Seguir revisando',peligro:true})) return;
  /* El rol es de quien está usando la app, no de la cotización: el snapshot lo
     guardó el vendedor, así que si lo copiáramos el autorizador saldría expulsado
     de su propia vista al abrir un pendiente. */
  scReset();
  const rolActual=Q.rol;
  Object.assign(Q,entry.q);
  Q.items=normalizarItems(Q.items);
  Q.rol=rolActual;
  Q.editMode=false; _selfAuth=false; _marcarOblig=false;
  Q.aiFile=null;
  /* Snapshot de una versión anterior, sin huella: se sella con lo que trae. */
  if(!Q.huellaAuth && (Q.precioAuth>0 || Object.keys(Q.itemsAuth||{}).length>0)) sellarAuth();
  pid=Q.items.reduce((m,it)=>Math.max(m,it.id||0),0);
  Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
  updDirRaw(Q.dirRaw||'');
  pintarFolio();
  updMaps(Q.maps||'');
  sincronizarPlegado();
  saveState(); renderItems();
  /* El autorizador entra a revisar un precio, no a capturar un cliente: la pantalla que le
     toca es la de partidas, con su resumen al lado. */
  irAPantalla('partidas',{forzar:true});
  /* Si Dirección la rechazó mientras esperaba en la cola, la respuesta ya llegó y viene
     guardada en su solicitud: se aplica ahora que está en pantalla (notario.js). */
  aplicarRechazoGuardado();
}

/* ===================== Persistencia ===================== */
/* Si el almacenamiento está lleno, la cotización deja de guardarse. Antes eso pasaba
   detrás de un catch vacío: se seguía capturando delante del cliente creyendo que estaba a
   salvo y al recargar no quedaba nada. Es el peor modo de falla de esta app —falla justo
   cuando el usuario cree que está seguro—, así que ahora se dice, una sola vez, con el
   mismo botón de Respaldar que ya ofrece saveHistorial, y el aviso al salir vuelve. */
let _saveOk=true;
function saveState(){
  /* La cadena se arma FUERA del try y antes de escribir: es la misma que registra deshacer,
     y deshacer vive en memoria. Si el almacenamiento está lleno, la cotización deja de
     guardarse en el disco pero los pasos para atrás tienen que seguir existiendo —es
     justamente cuando más hace falta poder devolver algo—. */
  const {editMode,...rest}=Q;
  const serie=JSON.stringify({...rest,aiFile:null});
  try{
    localStorage.setItem('al3d_q',serie);
    _saveOk=true;
  }catch(_){
    if(_saveOk){
      _saveOk=false;
      toast('No hay espacio para guardar la cotización — respalda y borra cotizaciones viejas','err',9000,{label:'Respaldar',fn:()=>respaldar()});
      /* Un aviso que se va no puede representar una condición que sigue. Salía una vez y
         después la pantalla quedaba idéntica a una que sí está guardando: se seguía capturando
         delante del cliente durante media hora creyendo que estaba a salvo. El único rastro
         posterior era el diálogo del navegador al cerrar la pestaña, que no explica nada.
         Ahora la marca se queda puesta mientras el problema esté puesto. */
      pintarFolio();
    }
  }
  sincronizarAiFile();
  /* A la pila va SIN el rol. El rol es de quien usa la app, no de la cotización —deshacer lo
     respeta, ver _undoAplicar()—, así que cambiar de Vendedor a Autorizador apilaba un paso que
     al deshacerse no cambiaba nada en pantalla y aun así decía «Cambio deshecho». */
  const {rol,...sinRol}=rest;
  undoRegistrar(JSON.stringify({...sinRol,aiFile:null}));
}

/* ===================== Deshacer y rehacer =====================
   Ya había un «Deshacer» por acción, en el aviso: borrar una partida, vaciar la cotización,
   quitar la imagen. Funciona bien y se queda, pero dura lo que dura el aviso y solo cubre
   las tres cosas que alguien se acordó de cubrir. Lo que faltaba era poder retroceder los
   últimos cambios cualesquiera —una altura que se tecleó mal, el material que se tocó por
   error, el orden que se movió arrastrando— y eso pide una pila, no un botón por caso.

   Se cuelga de saveState() porque es el ÚNICO paso por el que van todos los cambios: los 25
   sitios que mueven la cotización terminan ahí, y renderItems() lo llama al final de cada
   repintado. Registrar en un choke point y no en cada llamador es lo que hace que no haya
   cambios que se queden fuera de la pila por olvido —el modo en que las tres funciones
   anteriores se quedaron cortas—.

   Vive en memoria y no se guarda: al recargar la app se empieza sin pasos. Deshacer es para
   el error que se acaba de cometer, y una pila que sobrevive a la recarga invita a retroceder
   sobre una cotización que ya se dio por buena hace días. */
const UNDO_MAX=60;              // pasos guardados; lo viejo se suelta por abajo
const UNDO_JUNTAR=1400;         // ms: teclear seguido en el mismo campo es UN paso
let _undoPila=[], _redoPila=[];
let _undoBase=null;             // la foto del estado que hay en pantalla ahora
let _undoAplicando=false;       // restaurar no se registra a sí mismo
let _undoUltimo={sig:'',ts:0};
/* La imagen analizada NO se copia en cada foto: son cientos de kilobytes y sesenta pasos la
   convertirían en decenas de megabytes en el teléfono. Se guarda la referencia, que basta
   porque el objeto nunca se modifica por dentro: se reemplaza completo o se pone en null. */
function _undoFoto(serie){
  return {serie, aiFile:Q.aiFile, pid, editMode:!!Q.editMode, folio:Q.folio, estado:Q.estado};
}
/* ----- Qué campo se está tecleando -----
   Escribir «Taquería El Güero» son diecisiete cambios y tiene que ser UN paso: una pila con
   un paso por letra no es deshacer, es un cursor. Así que las funciones que escriben letra
   por letra —y solo ésas— dicen en qué campo están antes de mover Q, y undoRegistrar() junta
   los cambios seguidos que traen la misma firma. Todo lo demás llega sin firma, y sin firma
   nunca se junta: un chip, una partida nueva, un borrado o un arrastre son acciones sueltas.

   El primer intento adivinaba la firma mirando el foco, y adivinaba mal. Con el cursor
   todavía dentro del teléfono —basta no haber salido del campo— tocar tres chips de una
   partida heredaba la firma del teléfono, los cuatro cambios se fundían en un solo paso y
   deshacer una vez borraba los cuatro. Declararlo cuesta seis llamadas y no tiene manera de
   equivocarse: lo que no se declara, no se junta. */
let _undoJunta='';
function undoJuntar(clave){ _undoJunta=clave||''; }
function undoRegistrar(serie){
  const foto=_undoFoto(serie);
  /* Restaurar también pasa por saveState(): la foto se adopta como la nueva base —si no, el
     siguiente cambio de verdad se compararía contra el estado de antes de deshacer y
     empujaría un paso que nadie hizo— pero no se apila nada. */
  if(_undoAplicando){ _undoBase=foto; _undoUltimo={sig:'',ts:0}; return; }
  if(!_undoBase){ _undoBase=foto; return; }          // arranque: no hay nada anterior
  if(foto.serie===_undoBase.serie && foto.aiFile===_undoBase.aiFile && foto.editMode===_undoBase.editMode) return;
  /* ----- Las fronteras -----
     La pila es de UNA cotización y de su captura. Cambiar de folio (vaciar, abrir del
     historial, duplicar), mandarla a autorizar, autorizarla, reabrirla o guardar los cambios
     de una edición son puntos sin vuelta atrás con Ctrl+Z, y cada uno tiene su propia puerta:
     «Editar partidas» para volver a tocar una autorizada, el Deshacer del aviso para el
     vaciado. Retroceder POR ENCIMA de una autorización sería fingir que no pasó algo que
     pasó delante del cliente; y por encima de un folio, editar a ciegas una cotización que
     ya no está en pantalla. Se detecta comparando los tres campos y no llamando a una
     función en cada sitio: así no hay frontera que se quede sin marcar. */
  if(foto.folio!==_undoBase.folio||foto.estado!==_undoBase.estado||foto.editMode!==_undoBase.editMode){
    undoBarrera(foto); return;
  }
  /* Se consume: la firma vale para el cambio que viene justo detrás, no para el siguiente que
     pase por aquí. Si una guarda cortó el camino antes de llegar a saveState(), lo que quedó
     puesto se descarta aquí y el próximo cambio arranca como acción suelta. */
  const sig=_undoJunta; _undoJunta='';
  const ahora=Date.now();
  const juntar=!!sig && sig===_undoUltimo.sig && (ahora-_undoUltimo.ts)<UNDO_JUNTAR && _undoPila.length>0;
  if(!juntar){
    _undoPila.push(_undoBase);
    if(_undoPila.length>UNDO_MAX) _undoPila.shift();
  }
  /* Cualquier cambio nuevo mata la rama de rehacer, junte o no: lo que se rehacía ya no es
     la continuación de lo que hay en pantalla. */
  _redoPila=[];
  _undoUltimo={sig,ts:ahora};
  _undoBase=foto;
  pintarUndo();
}
/* Cortar la pila y volver a tomar el estado de referencia. Sin argumento se lee de Q, que es
   lo que necesita el arranque: la partida en blanco que siembra init() no es un cambio del
   usuario y no tiene por qué aparecer como un paso que deshacer. */
function undoBarrera(foto){
  _undoPila=[]; _redoPila=[];
  _undoUltimo={sig:'',ts:0};
  if(foto) _undoBase=foto;
  else { const {editMode,rol,...rest}=Q; _undoBase=_undoFoto(JSON.stringify({...rest,aiFile:null})); }
  pintarUndo();
}
function puedeDeshacer(){ return !locked() && _undoPila.length>0; }
/* ----- Dónde queda el cursor después -----
   Deshacer desde el propio botón y que ése fuera el último paso deja el botón sin razón de
   existir: desaparece, el foco se cae al <body> y «Rehacer» queda a decenas de tabulaciones.
   Es el mismo problema que delItem() ya resuelve a mano con el ▾ de la partida vecina. Se
   busca el control que sí quedó en pie: el botón, si todavía está, o el «Rehacer» del aviso. */
function _undoEsNuestro(){
  const a=document.activeElement;
  return !!(a&&a.closest&&a.closest('#undobtn,.mbar-undo'));
}
function _undoDevolverFoco(eraNuestro){
  if(!eraNuestro) return;
  const sigue=document.querySelector('#undobtn:not(.oculto),.mbar-undo');
  const dest=(sigue&&sigue.getClientRects().length)?sigue:document.querySelector('#toast .toast-act');
  if(dest){ try{ dest.focus({preventScroll:true}); }catch(_){ try{dest.focus();}catch(__){} } }
}
let _undoVis=null;
function pintarUndo(){
  const hay=puedeDeshacer();
  const b=$('undobtn');
  if(b){
    b.classList.toggle('oculto',!hay);
    b.title=hay
      ? 'Deshacer el último cambio (Ctrl+Z) · '+_undoPila.length+(_undoPila.length===1?' paso guardado':' pasos guardados')
      : 'Deshacer el último cambio (Ctrl+Z)';
  }
  /* La barra de abajo se reconstruye entera con innerHTML, así que se toca solo cuando la
     disponibilidad cambió de verdad. Rehacerla en cada tecla sería destruir y volver a crear
     el botón del siguiente paso veinte veces por palabra, con el dedo encima. */
  if(_undoVis!==hay){ _undoVis=hay; renderMobileBar(); }
}
function _undoAplicar(foto){
  _undoAplicando=true;
  try{
    /* El rol es de quien está usando la app, no de la cotización: se respeta el actual, igual
       que al abrir un pendiente de la cola o al deshacer un vaciado. */
    const rolActual=Q.rol;
    Object.assign(Q,JSON.parse(foto.serie));
    Q.rol=rolActual;
    Q.aiFile=foto.aiFile||null;
    Q.editMode=foto.editMode;
    /* Los ids NUNCA vuelven atrás: si el contador retrocediera, una partida nueva podría
       nacer con el id de otra que sigue viva y las dos se pisarían. */
    pid=Math.max(pid,foto.pid||0);
    /* El plegado es de la pantalla, no de la cotización: deshacer una altura no tiene por qué
       recoger las demás partidas. Solo se suelta el de las que ya no existen. Aquí NO se
       llama a sincronizarPlegado() —el que usan abrir del historial y deshacer un vaciado—
       porque ése pliega todas menos la última, y eso ahí es correcto: llega una cotización
       distinta. Deshacer llega a la misma, un paso antes. */
    const vivos=new Set(Q.items.map(it=>it.id));
    [..._plegadas].forEach(id=>{ if(!vivos.has(id)) _plegadas.delete(id); });
    Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
    updDirRaw(Q.dirRaw||''); updMaps(Q.maps||'');
    pintarFolio();
    /* renderItems() repinta las partidas, el resumen, la barra del celular y el «f-anti»
       —renderSummary lo reescribe respetando antiManual y el foco— y termina en saveState(),
       que con la bandera puesta adopta la foto como base sin apilar nada. */
    /* Deshacer es teclado casi siempre (Ctrl+Z): lo que devuelve no «entra», aparece. */
    _idsPintados=null;
    renderItems(); renderAuth(); updProg();
  } finally {
    _undoAplicando=false;
  }
  pintarUndo();
}
/* No se pregunta por locked() solo para tapar el botón: el atajo de teclado llega aquí sin
   pasar por él, y una cotización autorizada no acepta escrituras por ningún otro camino. */
function deshacer(){
  if(locked()){ toast(msgCandadoCaptura('para poder deshacer'),'err',4600); return; }
  if(!_undoPila.length){ toast('No hay cambios que deshacer en esta cotización'); return; }
  const foco=_undoEsNuestro();
  const anterior=_undoPila.pop();
  _redoPila.push(_undoBase);
  _undoAplicar(anterior);
  const q=_undoPila.length;
  toast('Cambio deshecho'+(q?' · '+q+(q===1?' paso más atrás':' pasos más atrás'):' · era el último'),
    '',6000,{label:'Rehacer',fn:rehacer});
  _undoDevolverFoco(foco);
}
function rehacer(){
  if(locked()){ toast(msgCandadoCaptura('para poder rehacer'),'err',4600); return; }
  if(!_redoPila.length){ toast('No hay nada que rehacer'); return; }
  const foco=_undoEsNuestro();
  const siguiente=_redoPila.pop();
  _undoPila.push(_undoBase);
  _undoAplicar(siguiente);
  toast('Cambio rehecho','',6000,{label:'Deshacer',fn:deshacer});
  _undoDevolverFoco(foco);
}
/* ----- Ctrl+Z, Ctrl+Shift+Z y Ctrl+Y -----
   Con el cursor DENTRO de un campo no se toca: ahí manda el deshacer del navegador, que va
   letra por letra sobre lo que se acaba de teclear —más fino que un paso nuestro— y dispara
   su `input`, así que Q lo sigue igual. Robarle el atajo sería cambiar una herramienta buena
   por una más gruesa en el único lugar donde la fina ya funcionaba.
   Con un modal abierto tampoco: la cotización está detrás del velo, el escalador lleva su
   propio deshacer y ninguno de los siete tiene nada que ver con esta pila. */
window.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey) return;
  const k=(e.key||'').toLowerCase();
  if(k!=='z'&&k!=='y') return;
  const a=document.activeElement, t=(a&&a.tagName||'').toLowerCase();
  if(t==='input'||t==='textarea'||(a&&a.isContentEditable)) return;
  if(_capaDeArriba()) return;
  e.preventDefault();
  if(k==='y'||e.shiftKey) rehacer(); else deshacer();
});

/* ----- La imagen analizada sobrevive a la recarga -----
   Era lo único de la cotización que no se guardaba, y por eso la app tenía que
   advertir al salir. La advertencia era correcta pero salía seguido y en el celular
   cualquier cambio de app la dispara; lo que faltaba era guardar la imagen.

   Va en su PROPIA clave, no dentro de al3d_q: una foto son megabytes y si no cabe, el
   error se lo llevaría todo —la cotización entera dejaría de guardarse en silencio—.
   Aparte, si no cabe solo se pierde la imagen. Y se escribe únicamente cuando cambia:
   saveState() corre en cada tecla y reescribir megabytes en cada letra congelaría la
   captura. Si no se pudo guardar, el aviso al salir vuelve a tener sentido y aparece. */
function sincronizarAiFile(){
  const url=Q.aiFile?Q.aiFile.url:null;
  if(url===_aiFileGuardada) return;
  /* Se recuerda CUÁL archivo no cupo. El centinela era null para «no guardada», así que
     un archivo que no cabía volvía a intentarse en cada saveState() —o sea en cada tecla—
     y serializar megabytes por letra congelaba la captura en el celular: exactamente lo
     que el comentario de arriba dice estar evitando. */
  if(url&&url===_aiFileFallo) return;
  try{
    if(!Q.aiFile){ localStorage.removeItem(AI_FILE_KEY); _aiFileGuardada=null; _aiFileFallo=null; return; }
    /* El tamaño se mide sobre la url, que es el 99% del peso, antes de construir la
       cadena completa: no vale la pena armar 11 MB de JSON para descartarlos. */
    /* Los dos cortes por tamaño eran `return` completamente mudos: la foto de la que salieron
       las partidas no se guardaba, y al recargar —o al abrir esa cotización del historial
       semanas después, que es cuando de verdad hace falta— no estaba, sin que nada lo hubiera
       dicho. Se avisa una vez por archivo: `_aiFileFallo` ya garantiza que no se repita en
       cada tecla. Y con lo que se puede hacer, que es volver a tomarla más chica. */
    if(url.length>AI_FILE_MAX){ localStorage.removeItem(AI_FILE_KEY); _aiFileGuardada=null; _aiFileFallo=url; avisoAiFileGrande(url.length); return; }
    const s=JSON.stringify(Q.aiFile);
    if(s.length>AI_FILE_MAX){ localStorage.removeItem(AI_FILE_KEY); _aiFileGuardada=null; _aiFileFallo=url; avisoAiFileGrande(s.length); return; }
    localStorage.setItem(AI_FILE_KEY,s);
    _aiFileGuardada=url; _aiFileFallo=null;
  }catch(_){ _aiFileGuardada=null; _aiFileFallo=url; avisoAiFileGrande(0); }
}
function avisoAiFileGrande(bytes){
  const mb=bytes?(bytes/1048576).toFixed(1)+' MB':'demasiado';
  toast('La imagen del análisis pesa '+mb+' y no se va a guardar con la cotización — vuelve a tomarla más chica si la quieres conservar','',7000);
}
/* ¿La imagen que está en pantalla ya tiene su copia en el historial? Se pregunta al salir de
   la app, no en cada tecla, así que recorrer el historial ahí sale gratis y ahorra llevar una
   bandera sincronizada en los seis lugares que tocan Q.aiFile. */
function aiFileYaEnHistorial(){
  const u=Q.aiFile&&Q.aiFile.url; if(!u) return false;
  try{ return getHistorial().some(e=>e.aiFile&&e.aiFile.url===u); }catch(_){ return false; }
}
function cargarAiFile(){
  try{
    const s=localStorage.getItem(AI_FILE_KEY);
    if(!s) return;
    const f=JSON.parse(s);
    if(f&&f.url){ Q.aiFile=f; _aiFileGuardada=f.url; }
  }catch(_){}
}

/* Campos de texto de la cotización ↔ id de su input. Un solo lugar para cargarlos,
   limpiarlos y bloquearlos: antes cada función traía su propia lista y los campos
   nuevos se quedaban fuera de alguna de ellas. */
const _FM={proy:'f-proy',cliente:'f-cli',tel:'f-tel',maps:'f-maps',dirRaw:'f-dir-raw',
  entrecalles:'f-entrecalles',entrega:'f-entrega',notaCliente:'f-nota-cli'};
/* Estos tres no alteran el total, así que no se bloquean al autorizar. */
/* El anticipo va en esta lista por lo mismo: es lo que el cliente va a dar para arrancar,
   se pacta justo al cerrar y no mueve el total. Bloquearlo obligaba a entrar al modo
   edición —soltando el precio autorizado— para corregir una cifra que no lo afecta. */
const _FM_PDF=['f-entrecalles','f-entrega','f-nota-cli','f-anti'];

/* ===================== El plazo de taller =====================
   Cinco cubos, con las palabras con las que se cotiza. La tabla que MANDA es la de
   js/datos/taller.js —ahí viven los días—; ésta es su eco para que el cotizador, que es un
   solo archivo sin módulos, pueda pintarlos. pruebas/taller.mjs comprueba que las dos
   digan lo mismo, igual que hace con el catálogo de precios en la otra dirección.

   La propuesta sale de las partidas con la misma regla que la plataforma usa sobre el tipo
   de trabajo: el vinil y el recorte se cortan y se pegan; letras y cajas sin luz se cortan,
   se dobla el canto y se pegan; con luz, la conexión es la mitad del tiempo; y de lo que no
   se sabe qué es (manual, bastidor) tampoco se sabe el tiempo. Cada tipo distinto de más
   suma un cubo, y una pieza que no cabe en una lámina de 244 cm suma otro. */
const PLAZOS_COT=[
  {k:1,etiqueta:'1 semana'},
  {k:2,etiqueta:'1.5 semanas'},
  {k:3,etiqueta:'2 semanas'},
  {k:4,etiqueta:'2.5 semanas'},
  {k:5,etiqueta:'3 semanas o más'},
];
const CUBO_POR_TIPO_COT={
  'Rotulacion de vinil':1,'Recorte acrilico':1,
  'Letras 3D sin iluminacion':2,'Caja de luz sin iluminacion':2,
  'Letras 3D con iluminacion':3,'Caja de luz con iluminacion':3,
  'Custome / Proyecto Especial':4,
};
/* El tipo de trabajo de una partida, con los siete valores exactos de Notion (sin acentos y
   con el «Custome» tal cual): es la misma traducción de tiposDerivados() en la plataforma. */
function tipoTrabajoCot(it){
  const luz=it.luz!==false;
  switch(it.tipo){
    case 'letras': return luz?'Letras 3D con iluminacion':'Letras 3D sin iluminacion';
    case 'caja':   return luz?'Caja de luz con iluminacion':'Caja de luz sin iluminacion';
    case 'recorte':return it.acab==='vinil'?'Rotulacion de vinil':'Recorte acrilico';
    default:       return 'Custome / Proyecto Especial';
  }
}
/* ----- La partida en blanco no es un tipo de trabajo -----
   `addItem()` siembra cada partida nueva en `tipo:'letras'` con `luz:true` —hay que empezar
   por algo— y hasta que alguien teclea, eso no describe ningún trabajo: es un renglón vacío
   esperando. Contarla partía el plazo en dos. Medido con una sola partida de vinil ya
   capturada y la partida en blanco recién agregada al lado:

     solo el vinil                → ['Rotulacion de vinil']                        → 1 semana
     + la partida en blanco       → ['Letras 3D con iluminacion','Rotulacion…']    → 2.5 semanas

   —el cubo sube al del tipo más lento (3) y encima suma uno por «hay dos tipos distintos»—.
   Así que tocar «+ Agregar partida» movía el plazo semana y media antes de que nadie
   escribiera nada, y si la cotización se autorizaba con ese renglón en blanco —el aviso de
   partidas sin terminar tiene su «continuar de todos modos»— el plazo inflado se quedaba
   escrito en el proyecto. `itemVacio` es la misma prueba que ya usan el aviso de partidas
   sin terminar y la IA; la plataforma lleva su gemela en `tiposDerivados`. */
/* `razones` es opcional (H19): un arreglo al que se le agregan, en palabras, las cuentas de las que
   salió el plazo —el trabajo más lento, cuántos tipos hay, si alguna pieza no cabe en una lámina—.
   Delante del cliente, eso es lo que sostiene el plazo («Letras 3D con iluminación · 2 tipos de
   trabajo · lado mayor a 2.44 m → 2.5 semanas»). Sin él la función es la de siempre y devuelve solo
   el cubo, que es lo que leen la plataforma y las pruebas. */
function plazoSugeridoCot(items,razones){
  const tipos=new Set(), n=x=>(isFinite(Number(x))&&Number(x)>0)?Number(x):0;
  let mayor=0;
  for(const it of (items||[])){
    if(!it||typeof it!=='object') continue;
    if(itemVacio(it)) continue;
    tipos.add(tipoTrabajoCot(it));
    const lado=(it.tipo==='letras'||it.tipo==='recorte')?n(it.altura):(it.tipo==='caja'||it.tipo==='bastidor')?Math.max(n(it.ancho),n(it.alto)):0;
    if(lado>mayor) mayor=lado;
  }
  const dice=Array.isArray(razones)?razones:null;
  const semanas=c=>(PLAZOS_COT.find(p=>p.k===c)||{etiqueta:''}).etiqueta;
  if(!tipos.size){ if(dice) dice.push('Todavía no hay trabajo capturado: se propone el plazo de un proyecto especial'); return 4; }
  const base=Math.max(...[...tipos].map(t=>CUBO_POR_TIPO_COT[t]||4));
  let k=base;
  if(dice){
    /* Los nombres de Notion van sin acentos a propósito (son los siete valores exactos); aquí se
       leen, y un «iluminacion» sin tilde delante del cliente desentona. */
    const leer={'Rotulacion de vinil':'Rotulación de vinil','Recorte acrilico':'Recorte de acrílico',
      'Letras 3D sin iluminacion':'Letras 3D sin iluminación','Caja de luz sin iluminacion':'Caja de luz sin iluminación',
      'Letras 3D con iluminacion':'Letras 3D con iluminación','Caja de luz con iluminacion':'Caja de luz con iluminación',
      'Custome / Proyecto Especial':'Proyecto especial'};
    const lento=[...tipos].find(t=>(CUBO_POR_TIPO_COT[t]||4)===base);
    dice.push((leer[lento]||lento)+': '+semanas(base));
  }
  if(tipos.size>1){ k+=tipos.size-1; if(dice) dice.push(tipos.size+' tipos de trabajo: suma media semana por cada uno de más'); }
  if(mayor>244){
    k+=1;
    if(dice) dice.push('Una pieza de '+(mayor/100).toFixed(2)+' m no cabe en una lámina de 2.44 m: suma media semana');
  }
  k=Math.min(5,k);
  if(dice) dice.push('Plazo sugerido: '+semanas(k));
  return k;
}
/* Los chips. El marcado es el propuesto salvo que alguien haya elegido; la nota de abajo dice
   cuál de los dos casos es, para que «2 semanas» resaltado no se lea como una decisión que
   nadie tomó. Se repinta desde renderItems, porque la propuesta depende de las partidas. */
function pintarPlazo(){
  const razones=[], sug=plazoSugeridoCot(Q.items,razones);
  const elegido=(Q.plazoK>=1&&Q.plazoK<=5)?Q.plazoK:null;
  /* La propuesta solo se marca «sugerido» y se explica cuando hay trabajo capturado de verdad: con la
     lista vacía, el 2.5 de siempre es un valor por omisión y no el resultado de ninguna cuenta. */
  const hayBase=(Q.items||[]).some(it=>it&&typeof it==='object'&&!itemVacio(it));
  const on=elegido!==null?elegido:sug;
  const nota=elegido!==null
    ?'Elegido a mano. Tócalo otra vez para volver al propuesto.'
    :(Q.items.length?'Propuesto por el tipo de trabajo. Toca otro si sabes que tarda más.':'Se propone en cuanto haya partidas. Toca uno si ya lo sabes.');
  /* Los mismos chips viven en dos sitios: el formulario del cliente y el modal de Registrar
     venta, que es el momento natural de corregirlo —junto a la fecha de instalación—. Una sola
     función los pinta a los dos para que nunca digan cosas distintas. */
  for(const [boxId,hId] of [['f-plazo','f-plazo-h'],['rv-plazo','rv-plazo-h']]){
    const box=$(boxId), h=$(hId); if(!box) continue;
    /* El chip que la app propone lleva «sugerido» en chiquito (H19), esté o no elegido: si alguien
       eligió otro, es la manera de saber cuál era la propuesta y de dónde sale. */
    box.innerHTML=PLAZOS_COT.map(p=>chip(p.k===on,`setPlazo(${p.k})`,esc(p.etiqueta),hayBase&&p.k===sug?'sugerido':'',true)).join('');
    if(h){
      h.classList.add('plazo-nota');
      /* La nota y, al lado, el «?» que abre la razón: un globo y no un tooltip, porque se abre con el
         toque y no con el cursor encima. Cada lugar lleva su propio id: el formulario del cliente y
         el modal de Registrar venta pintan los dos. */
      const porque=hayBase&&window.Piezas&&Piezas.porqueHTML
        ? Piezas.porqueHTML({id:'plazo-porque-'+boxId,etiqueta:'Por qué ese plazo',titulo:'Por qué '+(PLAZOS_COT.find(p=>p.k===sug)||{etiqueta:''}).etiqueta,
            cuerpo:'<span class="vistazo-t">Por qué '+esc((PLAZOS_COT.find(p=>p.k===sug)||{etiqueta:''}).etiqueta)+'</span><ul>'+razones.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>'})
        : '';
      h.innerHTML='<span>'+esc(nota)+'</span>'+porque;
    }
  }
  /* La ficha que viaja de un plazo al otro (C23 #2). Los hijos se reescriben en cada pintado, y la
     pieza lo sabe: sale del rectángulo que midió antes. El modal de Registrar venta lo hace en su
     archivo. */
  if(window.Piezas&&Piezas.fichaQueViaja&&$('f-plazo')) Piezas.fichaQueViaja('f-plazo');
}
/* Tocar el que ya está elegido lo suelta: vuelve a mandar el propuesto. */
function setPlazo(k){
  undoJuntar('q:plazoK');
  Q.plazoK=(Q.plazoK===k)?null:k;
  saveState(); pintarPlazo(); guardarAutorizadaLuego();
}
/* ----- Lo que se sigue pactando después de autorizar -----
   El anticipo, la fecha límite, las entrecalles, la nota al cliente y el plazo se pueden
   cambiar con el precio ya cerrado —no lo mueven—, pero solo iban a al3d_q: el historial se
   quedaba con los de la autorización. Al abrir la app la pantalla se soltaba por estar
   «guardada», y reabrir el folio devolvía el anticipo de $6,380 en vez de los $3,000 que se
   acababan de pactar. Se escribe en el historial un momento después de dejar de teclear, y al
   salir de la app si quedó algo pendiente. */
let _tGuardarAut=0;
function guardarAutorizadaLuego(){
  if(Q.estado!=='autorizada'||Q.editMode) return;
  clearTimeout(_tGuardarAut);
  _tGuardarAut=setTimeout(guardarAutorizadaYa,700);
}
function guardarAutorizadaYa(){
  if(!_tGuardarAut) return;
  clearTimeout(_tGuardarAut); _tGuardarAut=0;
  if(Q.estado==='autorizada'&&!Q.editMode) guardarEnHistorial();
}
window.addEventListener('pagehide',guardarAutorizadaYa);
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') guardarAutorizadaYa(); });
function loadState(){
  try{
    const s=localStorage.getItem('al3d_q');
    if(!s) return false;
    const saved=JSON.parse(s);
    /* Se valida ANTES del Object.assign. Antes se asignaba y luego reventaba el reduce de
       más abajo: Q quedaba ya contaminado con la basura y la app arrancaba a medias, con
       loadState devolviendo false como si no hubiera encontrado nada. */
    if(!saved||typeof saved!=='object'||!Array.isArray(saved.items)) return false;
    /* Y las partidas se normalizan ANTES de asignar: ver normalizarItems() en nucleo.js. */
    saved.items=normalizarItems(saved.items);
    /* Un estado que la app no conoce —un respaldo de otra versión, o editado a mano— dejaba la
       insignia diciendo «undefined» y ningún botón del proceso que tocar. Se lee como borrador,
       que es lo único que se puede seguir trabajando sin prometer nada. */
    if(!['borrador','pendiente','autorizada','rechazada'].includes(saved.estado)) saved.estado='borrador';
    Object.assign(Q,saved);
    /* Una cotización guardada por una versión anterior no trae la bandera, y la que llega
       con partidas evidentemente ya se estrenó: se deduce de lo que hay en vez de confiar
       en un campo que puede no existir. */
    if(Q.items.length) Q.sinEstrenar=false;
    Q.aiFile=null;
    cargarAiFile();   // la imagen analizada se guarda aparte; si cupo, vuelve con la cotización
    Q.editMode=false;
    pid=Q.items.reduce((m,it)=>Math.max(m,it.id||0),0);
    /* Cotización guardada por una versión anterior, sin huella: se sella con lo que hay,
       porque es exactamente el trabajo sobre el que se autorizó. Solo se sella lo que ya
       venía autorizado; una cotización a medio editar se queda sin huella y por lo tanto
       sin precio autorizado que defender, que es lo correcto. */
    if(!Q.huellaAuth && (Q.precioAuth>0 || Object.keys(Q.itemsAuth||{}).length>0)) sellarAuth();
    Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
    return true;
  }catch(_){ return false; }
}

/* ----- Abrir la app no es recargar la página -----
   `al3d_q` se guarda en cada tecla y `loadState()` lo devuelve entero al arrancar. Eso es lo
   que salva la captura cuando se recarga sin querer, cuando el teléfono mata la app mientras
   se adjunta el PDF en WhatsApp, o cuando la plataforma destruye el marco al cambiar de
   pestaña. Es de lo mejor que tiene esta app y no se toca.

   Pero devolverlo TODO, SIEMPRE y en silencio se paga del otro lado: al abrir la app horas
   después, la pantalla vuelve con el cliente y el proyecto del último trabajo. Y el nombre
   del cliente vive en el paso 1 mientras se captura en el paso 2, así que quien empieza «la
   siguiente» no lo tiene delante: las partidas nuevas se terminan guardando a nombre del
   cliente y del proyecto anteriores. Pasó. Y no deja rastro de que pasó, porque en el
   historial queda una cotización perfectamente plausible del cliente equivocado.

   Así que se separan dos cosas que hasta ahora eran una: volver a cargar la página DENTRO de
   la misma sesión —se restaura tal cual y sin decir nada, que es para lo que existe el
   autoguardado— y ABRIR la app otra vez, que es cuando empieza un trabajo nuevo.
   `separarDeLaCotizacionAnterior()`, en arranque.js, es quien decide qué hacer con las dos.

   `sessionStorage` es lo único que sabe la diferencia: se borra al cerrar la pestaña o la app
   y sobrevive a una recarga, que es exactamente la línea que hay que trazar. Si el navegador
   no lo deja usar —modo privado con el almacenamiento capado—, se contesta «la misma sesión»
   y todo se comporta como siempre: antes se apaga este arreglo que quitarle a nadie de la
   pantalla una cotización que creía tener. */
const SESION_KEY='al3d_sesion';
/* Tiene efecto: la primera llamada de la carga deja la marca puesta. Se llama UNA vez, desde
   init(), y por eso no contesta una pregunta que se pueda hacer dos veces. */
function sesionNueva(){
  try{
    if(sessionStorage.getItem(SESION_KEY)) return false;
    sessionStorage.setItem(SESION_KEY,'1');
    return true;
  }catch(_){ return false; }
}

/* De quién es una cotización y qué trabajo lleva, en una cadena. Sirve para una sola
   pregunta —«¿lo que hay en pantalla ya está escrito allá, igualito?»— y por eso es
   estricta: cualquier diferencia cuenta como que NO lo está, y entonces no se suelta nada.

   No se reutiliza huellaTrabajo(): esa describe el trabajo a propósito SIN el cliente —ver su
   comentario, y la razón por la que tiene que seguir siendo así— y aquí el cliente es justo
   la mitad de la pregunta. */
function firmaDeCotizacion(o){
  if(!o) return '';
  return JSON.stringify([
    (o.cliente||'').trim(), (o.tel||'').trim(), (o.proy||'').trim(),
    o.iva!==false, Number(o.precioAuth)||0,
    (o.items||[]).map(it=>_CAMPOS_PRECIO.map(k=>it[k]===undefined?'':String(it[k])).join('~')),
    /* Y lo que se sigue pactando DESPUÉS de autorizar, que no mueve el total pero sí sale en el
       PDF y en el WhatsApp. Faltaba: con el anticipo o la fecha límite cambiados en pantalla, la
       firma decía «el historial tiene esto igualito», al abrir la app se empezaba en blanco y
       reabrir el folio devolvía el anticipo y la fecha de antes. */
    Number(o.anti)||0, (o.entrega||'').trim(), (o.entrecalles||'').trim(), (o.notaCliente||'').trim(),
    (o.plazoK>=1&&o.plazoK<=5)?o.plazoK:null,
  ]);
}
/* ¿Lo que hay en pantalla está guardado en otro sitio, tal cual? Solo entonces se puede
   soltar sin perder nada, y se comprueba ANTES de soltarlo.

   Solo una AUTORIZADA, y solo si el historial tiene su folio diciendo exactamente lo mismo.
   Lo demás no se suelta, cada uno por su razón: un borrador no está escrito en ningún lado;
   una rechazada sale de la cola con todo su snapshot al rechazarla, o sea que la pantalla es
   su única copia; una pendiente sí tiene copia en la cola, pero es una decisión en vuelo —hay
   alguien del otro lado a punto de ponerle precio— y soltarla sería quitarle la revisión de
   enfrente. Y una autorizada que trae en pantalla algo que el historial todavía no tiene —una
   edición a medias, que al recargar se queda sin su modo edición— tampoco: la firma no cuadra
   y se queda. */
function copiaGuardadaDeQ(){
  if(Q.estado!=='autorizada') return null;
  const e=getHistorial().find(x=>x.folio===Q.folio);
  return (e&&firmaDeCotizacion(e)===firmaDeCotizacion(Q))?e:null;
}

/* ----- Folio / contador de cotizaciones -----
   El contador solo avanza con las cotizaciones CONFIRMADAS (autorizadas).
   Mientras la cotización es borrador o está pendiente, el folio es provisional:
   se muestra el siguiente número libre pero no se consume, así los borradores
   que nunca se autorizan no gastan folios del contador. */
const FOLIO_PREFIJO='COT-';
function folioNum(f){ const m=/(\d+)/.exec(String(f||'')); return m?parseInt(m[1],10):0; }
/* Con la letra del teléfono (ver letraFolio en entrega.js). folioNum lee el primer número, así
   que los folios viejos sin letra y los nuevos cuentan en el mismo contador. */
function folioFmt(n){ return FOLIO_PREFIJO+String(n).padStart(4,'0')+'-'+letraFolio(); }
function folioConfirmados(){ try{ return parseInt(localStorage.getItem('al3d_folio')||'0')||0; }catch(_){ return 0; } }
/* Números ya tomados por cotizaciones vivas (pendientes o autorizadas) o del historial:
   no se reutilizan aunque el contador de confirmadas aún no haya avanzado. */
function foliosOcupados(){
  const s=new Set();
  try{ getQueue().forEach(e=>{ if(e.estado!=='rechazada') s.add(folioNum(e.folio)); }); }catch(_){}
  try{ getHistorial().forEach(e=>s.add(folioNum(e.folio))); }catch(_){}
  s.delete(0);
  return s;
}
function nextFolio(){
  try{
    const ocupados=foliosOcupados();
    let n=folioConfirmados()+1;
    while(ocupados.has(n)) n++;
    return folioFmt(n);
  }catch(_){ return folioFmt(Math.floor(Math.random()*9000)+1000); }
}
/* Se llama al autorizar: es ahí cuando la cotización cuenta para el contador. */
function confirmarFolio(folio){
  const n=folioNum(folio);
  if(!n) return;
  try{ if(n>folioConfirmados()) localStorage.setItem('al3d_folio',String(n)); }catch(_){}
}
function folioConfirmado(){ return Q.estado==='autorizada'; }
function pintarFolio(){
  const el=$('folio'); if(!el) return;
  const conf=folioConfirmado();
  /* La píldora del folio ya significa provisional/confirmado, así que «sin guardar» va como
     marca APARTE y no reescribiendo su texto: son dos cosas distintas y confundirlas sería
     peor que no decir nada. */
  /* El número voltea solo si cambió y solo si ya había uno (C24, folioQueVoltea en nucleo.js);
     pintarFolio() corre en cada guardado fallido y al arrancar, y repintar el MISMO folio no
     mueve nada. La marca de «sin guardar» es hermana de las casillas, no una de ellas: no voltea,
     y se pone y se quita sin tocar el folio. */
  folioQueVoltea(el,Q.folio||'');
  const mal=el.querySelector(':scope>.folio-mal');
  if(_saveOk){ if(mal) mal.remove(); }
  else if(!mal){ const b=document.createElement('b'); b.className='folio-mal'; b.textContent='sin guardar'; el.append(b); }
  el.classList.toggle('prov',!conf);
  el.classList.toggle('nosave',!_saveOk);
  el.title=!_saveOk
    ? 'No hay espacio en este teléfono: lo que captures ahora no se está guardando. Respalda desde el historial y borra cotizaciones viejas.'
    : conf
    ? 'Folio confirmado — cuenta en el contador de cotizaciones'
    : 'Folio provisional — el contador solo avanza cuando la cotización se autoriza';
}

