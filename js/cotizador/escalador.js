/* ============================================================================
   Cotizador · escalador.js

   Escalador Pro: medir sobre una foto con cotas, guías, lupa, zoom, y el puente del escalador a la IA y a las partidas.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Escalador Pro ===================== */
const SC={
  img:null, imgW:0, imgH:0, cvsW:0, cvsH:0, scaleFactor:1,
  mode:'idle', mMode:'libre',
  refLine:null, refCm:0, nativePxPerCm:0,
  down:false, sp:null, cp:null, downPt:null, moved:false, isTouch:false,
  tapA:null, building:false, dragH:null, hist:false,
  items:[], sel:null, nid:1, nc:0,
  guides:[], gid:1, draggingGuide:null, _guideRelease:null, previewCollapsed:false,
  snapOn:true, snapH:null, snapV:null, cotas:'todas',
  z:1, tx:0, ty:0, gesture:false,
  vw:0, vh:0, rs:1, rsDpr:1, full:null, fullW:0, tile:null, tileR:null, tileS:0, objUrl:null,
};
/* El azul de la marca, para lo que se pinta en <canvas>.
   Aquí no sirve var(): ctx.strokeStyle='var(--a)' no da error, se IGNORA en silencio y el trazo
   sale negro. Se lee una vez del propio sistema, en perezoso —así no depende de que la hoja esté
   aplicada cuando este módulo arranca— y con el número por si acaso. */
let _azulMarca='';
function azulMarca(){
  if(!_azulMarca){
    try{ _azulMarca=(getComputedStyle(document.documentElement).getPropertyValue('--a')||'').trim(); }catch(_){ }
    if(!_azulMarca) _azulMarca='#4060f8';
  }
  return _azulMarca;
}
const SC_COLORS=[azulMarca(),'#d32f2f','#2e7d32','#e65100','#6a1b9a','#0277bd','#558b2f','#4e342e'];
const SC_GUIDE_COLOR='#00b8d9';
/* Centro y aumento de la vista en coordenadas lógicas. Lo usan por igual el dibujo y
   la detección de toques, para que nunca se desincronicen. */
function scViewCenter(){
  const k=SC.z||1;
  return{cx:SC.cvsW/2-SC.tx/k,cy:SC.cvsH/2-SC.ty/k,k};
}
/* Rectángulo redondeado. No se usa ctx.roundRect: falta en Safari de iOS algo viejo. */
function scRoundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);ctx.lineTo(x+w-rr,y);ctx.arcTo(x+w,y,x+w,y+rr,rr);
  ctx.lineTo(x+w,y+h-rr);ctx.arcTo(x+w,y+h,x+w-rr,y+h,rr);
  ctx.lineTo(x+rr,y+h);ctx.arcTo(x,y+h,x,y+h-rr,rr);
  ctx.lineTo(x,y+rr);ctx.arcTo(x,y,x+rr,y,rr);
  ctx.closePath();
}

function abrirScaler(){
  $('sc-use-ai-btn').style.display=(Q.aiFile&&Q.aiFile.url)?'flex':'none';
  $('sp-zoom').style.display=SC.img?'flex':'none';
  if(!SC.img) $('sp-overlay').classList.remove('hide');
  $('scalermodal').classList.add('show');
  // Una entrada de historial por el escalador: en el celular el gesto natural para
  // regresar es el botón "atrás", y sin esto se salía de la cotización entera.
  if(!SC.hist){ try{history.pushState({sc:1},'');SC.hist=true;}catch(_){} }
  if(SC.img){setTimeout(()=>{scFitCanvas();scRender();},60);}
  scUpdateList();scAjustarToast();
}
function scOcultarScaler(){
  $('scalermodal').classList.remove('show');
  if(SC._guideRelease)SC._guideRelease();
  scHideLoupe();
}
function cerrarScaler(){
  scOcultarScaler();
  if(SC.hist){ SC.hist=false; try{history.back();}catch(_){} }
}
window.addEventListener('popstate',()=>{
  if(!$('scalermodal').classList.contains('show'))return;
  SC.hist=false;            // la entrada ya la consumió el "atrás" del navegador
  scOcultarScaler();
});

function cargarImagenScaler(input){
  const f=input.files[0];if(!f)return;
  if(!scPuedeCambiarImagen()){input.value='';return;}
  if(f.type==='application/pdf'){scLoadPDF(f);input.value='';return;}
  const r=new FileReader();
  r.onload=ev=>scLoadImgSrc(ev.target.result,f.name);
  r.readAsDataURL(f);
  input.value='';
}
function usarImagenAIEnScaler(){
  if(!(Q.aiFile&&Q.aiFile.url)) return;
  if(!scPuedeCambiarImagen()) return;
  scLoadImgSrc(Q.aiFile.url,'imagen IA');
}
function scOnDrop(e){
  e.preventDefault();e.currentTarget.style.outline='';
  if(e.dataTransfer.files[0]) cargarImagenScaler({files:e.dataTransfer.files,value:''});
}
/* Cargar otra imagen vacía SC.items. Los cuatro caminos que llegan aquí —elegir archivo,
   arrastrar, traer la imagen de la IA y traer el vector— borraban sin preguntar las medidas
   que ya había, y una medida se saca calibrando: no se recupera sola. La pregunta vive aquí
   y no en cada llamador, que es lo que hacía que alguno se quedara fuera. */
/* El eje de medición no se hereda: una imagen nueva —o una recalibración— no tiene por qué
   seguir midiendo solo en horizontal porque la anterior lo necesitaba. */
function scResetMMode(){ SC.mMode='libre'; try{ scSetMeasMode&&scSetMeasMode('libre'); }catch(_){} }
/* La foto y las medidas del escalador viven aparte de Q y ninguna de las cuatro rutas que
   reponen la cotización las tocaba: al abrir otra del historial, la foto del cliente
   anterior seguía en la vista previa, junto a las partidas nuevas, y sus medidas seguían
   marcadas como «usadas» —una afirmación sobre una cotización que ya no está en pantalla—,
   así que no se podían volver a agregar. */
function scReset(){
  if(typeof SC==='undefined') return;
  SC.img=null; SC.items=[]; SC.guides=[]; SC.sel=null; SC.nid=1; SC.nc=0;
  SC.building=false; SC.tapA=null; SC.dragH=null; SC.down=false;
  SC.cotas='todas';
  try{ scResetCalib(false); }catch(_){}
  try{ scUpdateCotasUI(); }catch(_){}
  try{ renderScalerPreview(); }catch(_){}
}
/* ----- Respaldo del escalador para las rutas que reponen la cotización -----
   `nueva()` guardaba Q en _vaciada y llamaba a scReset(), que borra la foto, las cotas, las
   guías y la calibración. `deshacerVaciado()` repone Q y no toca SC ni una vez: la
   cotización volvía sin la imagen de la que salieron sus medidas y sin las medidas.

   No es un dato más. Calibrar contra una referencia real y trazar seis cotas sobre una foto
   con el dedo son varios minutos de trabajo fino, y la app lo sabe —scPuedeCambiarImagen(),
   aquí abajo, pregunta antes de dejar cargar otra foto—. Lo que faltaba era que la misma
   guarda existiera en el camino que sí borra: vaciar.

   SC no se persiste en ningún lado, así que sin esto lo borrado no queda en ninguna parte.
   Se guardan también nid, gid y nc: sin ellos las cotas restauradas conservan sus ids y la
   siguiente que se trace nace repetida. */
function scSnapshot(){
  if(typeof SC==='undefined'||!SC.img) return null;
  return {img:SC.img,imgW:SC.imgW,imgH:SC.imgH,objUrl:SC.objUrl,
    items:SC.items.slice(),guides:SC.guides.slice(),
    nid:SC.nid,nc:SC.nc,gid:SC.gid,
    refLine:SC.refLine?Object.assign({},SC.refLine):null,
    refCm:SC.refCm,nativePxPerCm:SC.nativePxPerCm,mMode:SC.mMode,cotas:SC.cotas};
}
function scRestaurar(s){
  if(!s||typeof SC==='undefined') return;
  SC.img=s.img;SC.imgW=s.imgW;SC.imgH=s.imgH;SC.objUrl=s.objUrl;
  SC.items=s.items.slice();SC.guides=s.guides.slice();
  SC.nid=s.nid;SC.nc=s.nc;SC.gid=s.gid;
  SC.refLine=s.refLine;SC.refCm=s.refCm;SC.nativePxPerCm=s.nativePxPerCm;SC.mMode=s.mMode;
  SC.cotas=s.cotas||'todas';
  SC.sel=null;SC.building=false;SC.tapA=null;SC.dragH=null;SC.down=false;
  /* La caché de mosaicos es de la imagen anterior: sin tirarla, el lienzo pinta lo viejo
     encima de lo restaurado. */
  try{ scDropCache(); }catch(_){}
  /* Y la pantalla de calibración vuelve a decir lo que dice cuando hay escala. Son las
     mismas seis líneas que deja scConfirmCalib; si algún día cambian allá, cambian aquí. */
  if(SC.nativePxPerCm>0){
    try{
      $('sc-ref-confirm-row').style.display='none';
      $('sc-calib-done').style.display='';
      $('sc-calib-help').style.display='none';
      $('sc-btn-calib').style.display='none';
      $('sc-calib-badge').className='sp-calib-badge ok';
      $('sc-calib-txt').textContent='Escala calibrada';
    }catch(_){}
  }
  try{ scUpdateList(); }catch(_){}
  try{ scUpdateGuideList(); }catch(_){}
  try{ scUpdateCotasUI(); }catch(_){}
  try{ scRender(); }catch(_){}
  try{ renderScalerPreview(); }catch(_){}
}
function scPuedeCambiarImagen(){
  if(!(SC.img&&SC.items&&SC.items.length)) return true;
  const n=SC.items.length;
  return confirm('El escalador tiene '+n+(n===1?' medida':' medidas')+' de la imagen actual. Al cargar otra se borran. ¿Continuar?');
}
/* ----- Un error que dice qué hacer, no solo qué falló -----
   Los dos <input> aceptan `image/*`, así que un .HEIC que llegó por AirDrop o por correo se
   puede elegir en Android y en escritorio — y ningún navegador de escritorio lo decodifica.
   Lo que salía era «No se pudo cargar la imagen», que es un callejón sin salida: no dice qué
   pasó, no dice qué formato sí funciona y no dice cómo convertirla. En el mismo archivo, a
   veinte renglones, el error del lector de PDF ya está escrito como debe: dice qué hacer.
   Sin inventar la causa: el nombre del archivo ya llega como parámetro, así que se nombra. */
function errImagen(name){
  const n=String(name||'');
  return /\.hei[cf]$/i.test(n)
    ? `No se pudo abrir «${n}» — este navegador no lee ese formato. Ábrela en Fotos y guárdala como JPG, o mándala por WhatsApp, que la convierte`
    : `No se pudo abrir «${n||'la imagen'}» — puede estar dañada o ser demasiado grande. Guárdala como JPG y vuelve a intentar`;
}
function scLoadImgSrc(src,name,alCargar){
  const img=new Image();
  img.onload=()=>{
    SC.img=img;SC.imgW=img.naturalWidth;SC.imgH=img.naturalHeight;scDropCache();
    /* No se revoca un blob: que el vectorizador siga usando. Los dos módulos se pasan
       imágenes entre sí, así que la URL que este cree suya puede ser la que el otro tiene
       cargada: revocarla dejaba su imagen en blanco sin que nada lo explicara. */
    if(SC.objUrl&&SC.objUrl!==src&&SC.objUrl!==VT.objUrl){try{URL.revokeObjectURL(SC.objUrl);}catch(_){}}
    SC.objUrl=/^blob:/.test(src)?src:null;
    scResetCalib(false);
    SC.items=[];SC.sel=null;SC.nid=1;SC.nc=0;_scBorrada=null;
    SC.guides=[];SC.gid=1;SC.draggingGuide=null;SC.dragH=null;
    /* Las cotas vuelven a verse enteras: una foto nueva empieza sin medidas, y heredar
       «ninguna» de la anterior dejaba al que mide trazando líneas que no aparecían. */
    SC.cotas='todas';
    $('sp-overlay').classList.add('hide');
    $('sp-zoom').style.display='flex';
    scEnableTools(true);scFitCanvas();scRender();scUpdateList();scUpdateGuideList();
    scSetMode('ref');
    toast('Imagen cargada · '+(name||''),'ok');
    /* Se avisa DESPUÉS del aviso de "imagen cargada" a propósito: quien llama puede
       dejarla ya calibrada —el vectorizador lo hace— y ese aviso es el que interesa
       que quede en pantalla. */
    if(alCargar){ try{ alCargar(); }catch(_){} }
  };
  img.onerror=()=>toast(errImagen(name),'err',6400);
  img.src=src;
}
async function scLoadPDF(f){
  toast('Cargando PDF…','',8000);
  try{
    if(!window.pdfjsLib){
      /* s.onerror no trae mensaje, así que el catch de abajo imprimía «Error PDF: undefined»
         —el caso más común es simplemente estar sin señal, porque el lector se descarga la
         primera vez— y no había forma de saber qué había pasado ni qué hacer. */
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=res;s.onerror=()=>rej(new Error('se necesita conexión para leer un PDF: el lector se descarga la primera vez. Exporta el plano como JPG o PNG y vuelve a intentar'));document.head.appendChild(s);});
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const ab=await f.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:ab}).promise;
    const page=await pdf.getPage(1);
    // Resolución acorde a la pantalla en vez de un 2.5 fijo: los planos grandes conservan el detalle
    const base=page.getViewport({scale:1});
    const target=Math.min(3400,Math.max(1800,Math.round((window.screen&&window.screen.width||1280)*scDPR()*1.6)));
    let s=Math.max(2,Math.min(5,target/base.width));
    const cap=2.4e7;
    if(base.width*base.height*s*s>cap)s=Math.sqrt(cap/(base.width*base.height));
    const vp=page.getViewport({scale:s});
    const oc=document.createElement('canvas');oc.width=Math.round(vp.width);oc.height=Math.round(vp.height);
    await page.render({canvasContext:oc.getContext('2d'),viewport:vp}).promise;
    // Blob en vez de dataURL: a esta resolución un dataURL ocupa decenas de MB
    const url=await new Promise(res=>{
      try{oc.toBlob(b=>res(b?URL.createObjectURL(b):oc.toDataURL()),'image/png');}
      catch(_){res(oc.toDataURL());}
    });
    scLoadImgSrc(url,f.name);
  }catch(e){toast('No se pudo abrir el PDF: '+((e&&e.message)||'el archivo no se pudo leer'),'err',7000);}
}

/* ----- Resolución de dibujo -----
   El lienzo cubre el área visible y se dibuja siempre a la densidad real de la pantalla.
   El zoom NO estira un mapa de bits: es una transformación aplicada al dibujar, así que
   la nitidez es la misma acercado que ajustado, y la memoria no crece con el zoom.
   Las coordenadas "lógicas" (la foto ajustada, cvsW × cvsH) no cambian, así que la
   lógica de medición —normalización, escala, calibración— sigue igual. */
function scDPR(){return Math.min(3,Math.max(1,window.devicePixelRatio||1));}
/* «Móvil» aquí quiere decir «se toca con el dedo», no «pantalla angosta»: de eso
   dependen el tamaño de las pestañas de guía y no robarle el foco al campo de cm
   cuando el teclado taparía el botón de confirmar. Con el corte en 760 px el Fold 6
   abierto (832 px) pasaba por escritorio y le tocaban pestañas de 19 px. */
function scIsMobile(){
  return window.matchMedia('(max-width:1000px)').matches
      || window.matchMedia('(pointer:coarse)').matches;
}
function scPixelBudget(){
  // Tope de píxeles del lienzo. Pasado cierto tamaño el navegador deja de acelerarlo
  // por GPU y el redibujo al arrastrar se vuelve lento; además iOS limita el área total.
  return scIsMobile()?5e6:8e6;
}
/* Presupuesto de una copia en caché. Medido: un canvas de ~5 MP se pinta al instante,
   uno de 12 MP tarda decenas de ms porque el navegador deja de acelerarlo. */
function scSrcBudget(){return 7e6;}
/* De dónde se lee la foto para pintar el trozo visible [l,t,r,b] (coords lógicas).
   Devuelve un lienzo y el rectángulo lógico que cubre. Dos casos:
   - Alejado: una copia de la foto completa al tamaño que hace falta.
   - Acercado: un recorte de la zona visible a resolución nativa, con margen para que
     un desplazamiento pequeño no obligue a rehacerlo.
   Leer del <img> original cuesta lo mismo sin importar el recorte, así que nunca se
   hace por cuadro: solo al rehacer la copia. */
function scDropCache(){SC.full=null;SC.fullW=0;SC.tile=null;SC.tileR=null;SC.tileS=0;}
function scLayer(need,l,t,r,b){
  const iw=SC.imgW,ih=SC.imgH,cap=scSrcBudget(),sf=iw/SC.cvsW;
  const capW=Math.sqrt(cap*iw/ih);
  if(need<=capW){
    // Se prefiere una cadena de mitades exactas (cada paso conserva la nitidez) y solo
    // se recorta a una medida arbitraria si la potencia de dos no cabe en el presupuesto.
    let w=iw;while(w/2>=need&&w>2)w=Math.floor(w/2);
    let mitades=true;
    if(w*Math.round(ih*w/iw)>cap){w=Math.floor(capW);mitades=false;}
    const h=Math.max(1,Math.round(ih*w/iw));
    if(!(SC.full&&SC.fullW===w)){
      const f=document.createElement('canvas');f.width=w;f.height=h;
      const g=f.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      if(mitades){
        let src=SC.img,sw=iw,sh=ih;
        while(sw>w*1.6&&sh>2){
          const hw=Math.max(w,Math.floor(sw/2)),hh=Math.max(h,Math.floor(sh/2));
          const c=document.createElement('canvas');c.width=hw;c.height=hh;
          const cg=c.getContext('2d');cg.imageSmoothingEnabled=true;cg.imageSmoothingQuality='high';
          cg.drawImage(src,0,0,sw,sh,0,0,hw,hh);src=c;sw=hw;sh=hh;
        }
        g.drawImage(src,0,0,sw,sh,0,0,w,h);
      }else g.drawImage(SC.img,0,0,iw,ih,0,0,w,h);
      SC.full=f;SC.fullW=w;
    }
    return{c:SC.full,rx0:0,ry0:0,rx1:SC.cvsW,ry1:SC.cvsH};
  }
  const mx=(r-l)*.3,my=(b-t)*.3;
  const x0=Math.max(0,l-mx),y0=Math.max(0,t-my);
  const x1=Math.min(SC.cvsW,r+mx),y1=Math.min(SC.cvsH,b+my);
  let esc=Math.min(need/SC.cvsW,sf);
  let tw=Math.max(1,Math.round((x1-x0)*esc)),th=Math.max(1,Math.round((y1-y0)*esc));
  const exceso=tw*th/cap;
  if(exceso>1){const f=Math.sqrt(exceso);tw=Math.max(1,Math.round(tw/f));th=Math.max(1,Math.round(th/f));}
  const R=SC.tileR;
  if(SC.tile&&R&&l>=R[0]&&t>=R[1]&&r<=R[2]&&b<=R[3]&&SC.tileS>=esc*.7&&SC.tileS<=esc*2)
    return{c:SC.tile,rx0:R[0],ry0:R[1],rx1:R[2],ry1:R[3]};
  const tc=document.createElement('canvas');tc.width=tw;tc.height=th;
  const g=tc.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(SC.img,x0*sf,y0*sf,(x1-x0)*sf,(y1-y0)*sf,0,0,tw,th);
  SC.tile=tc;SC.tileR=[x0,y0,x1,y1];SC.tileS=tw/(x1-x0);
  return{c:tc,rx0:x0,ry0:y0,rx1:x1,ry1:y1};
}
/* Dibuja solo el trozo de foto que se ve: el trabajo por cuadro lo marca el tamaño de
   la pantalla, no el de la foto ni el nivel de acercamiento. */
function scDrawPhoto(ctx,cx,cy,k,dpr,w,h,directo){
  const hw=w/(2*k),hh=h/(2*k);
  const l=Math.max(0,cx-hw),t=Math.max(0,cy-hh);
  const r=Math.min(SC.cvsW,cx+hw),b=Math.min(SC.cvsH,cy+hh);
  if(!(r>l&&b>t))return;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  if(directo){
    // Lupa: el destino es diminuto, así que sale barato leer del original y enseñar
    // el detalle nativo de la foto en vez de píxeles ya escalados.
    const sf=SC.imgW/SC.cvsW;
    ctx.drawImage(SC.img,l*sf,t*sf,(r-l)*sf,(b-t)*sf,l,t,r-l,b-t);
    return;
  }
  const L=scLayer(SC.cvsW*k*dpr,l,t,r,b);
  const ex=L.c.width/(L.rx1-L.rx0),ey=L.c.height/(L.ry1-L.ry0);
  ctx.drawImage(L.c,(l-L.rx0)*ex,(t-L.ry0)*ey,(r-l)*ex,(b-t)*ey,l,t,r-l,b-t);
}
let _scFitIntentos=0;
/* Alto que la barra de pistas le quita al lienzo por abajo. La barra se pinta ENCIMA
   de esa franja (medía 58 px con el texto de dos renglones) y en el iPhone la foto
   llegaba a 6 px del borde: el número de la cota del zócalo quedaba detrás del azul.
   Se mide en vez de suponerse: pasa de un renglón a dos y suma la franja del gesto. */
function scHintReserve(){
  const b=$('sp-hint-bar');
  if(!b||b.classList.contains('hide'))return 0;
  return Math.round(b.offsetHeight)||0;
}
/* preservar: conservar el zoom y el encuadre. Lo piden los reajustes por cambio de
   tamaño del área (plegar la sección de calibración movía la foto ~140 px) y el
   teclado de Chrome Android, que encoge el viewport 300 px al tocar el campo de los cm.
   Al cargar una imagen NO se preserva: ahí se quiere el ajuste completo. */
function scFitCanvas(preservar){
  const area=$('sp-canvas-area'),cvs=$('scalerCanvas');
  const aw=area.clientWidth,ah=area.clientHeight;
  // El lienzo termina donde empieza la barra de pistas, así no hay nada que tapar
  const vw=aw,vh=Math.max(60,ah-scHintReserve());
  const pad=scIsMobile()?12:32;
  const maxW=vw-pad,maxH=vh-pad;
  // El modal puede no tener layout todavía (recién mostrado): reintentar.
  // Acotado: un SVG sin width/height propios da naturalWidth 0 y esto reintentaba cada
  // 80 ms para siempre, con el lienzo en blanco y sin decir nunca qué pasaba.
  if(!SC.img||!(maxW>0)||!(maxH>0)||!(SC.imgW>0)||!(SC.imgH>0)){
    if(SC.img&&++_scFitIntentos<=40){
      setTimeout(()=>{if(SC.img&&$('scalermodal').classList.contains('show')){scFitCanvas();scRender();}},80);
    }else if(SC.img){
      SC.img=null;_scFitIntentos=0;
      $('sp-overlay').classList.remove('hide');
      scEnableTools(false);
      toast('No se pudo leer el tamaño de la imagen — si es un SVG, ábrelo con un ancho y un alto definidos','err',5200);
    }
    return;
  }
  _scFitIntentos=0;
  // Vista actual en proporción de la foto, por si hay que devolverla tras el reajuste
  const oz=SC.z,
        ocx=SC.cvsW?(SC.cvsW/2-SC.tx/SC.z)/SC.cvsW:.5,
        ocy=SC.cvsH?(SC.cvsH/2-SC.ty/SC.z)/SC.cvsH:.5;
  const iA=SC.imgW/SC.imgH;
  let w=maxW,h=maxW/iA;
  if(h>maxH){h=maxH;w=h*iA;}
  const oW=SC.cvsW,oH=SC.cvsH;
  SC.cvsW=Math.max(1,Math.round(w));SC.cvsH=Math.max(1,Math.round(h));
  /* Los puntos a medio trazar viven en coordenadas del lienzo, no normalizados como
     SC.items y SC.refLine. Si el lienzo se reajusta entre los dos toques de una medida —y
     se reajusta solo: la barra de pistas cambia de alto, el teléfono gira, aparece el
     teclado— el primer punto se quedaba anclado donde estaba en el lienzo VIEJO y la medida
     salía corrida sin que nada lo delatara. Se reescalan con el lienzo. */
  if(oW>0&&oH>0&&(oW!==SC.cvsW||oH!==SC.cvsH)){
    const kx=SC.cvsW/oW, ky=SC.cvsH/oH;
    ['tapA','downPt','sp','cp'].forEach(k=>{
      const pt=SC[k];
      if(pt&&typeof pt.x==='number') SC[k]={...pt,x:pt.x*kx,y:pt.y*ky};
    });
  }
  SC.scaleFactor=SC.imgW/SC.cvsW;
  SC.vw=vw;SC.vh=vh;
  SC.rs=Math.min(scDPR(),Math.sqrt(scPixelBudget()/Math.max(1,vw*vh)));
  SC.rsDpr=scDPR();
  cvs.width=Math.max(1,Math.round(vw*SC.rs));cvs.height=Math.max(1,Math.round(vh*SC.rs));
  cvs.style.width=vw+'px';cvs.style.height=vh+'px';
  // Se guarda la medida del ÁREA (no la del lienzo, que va recortado por la barra):
  // es contra ella que el resize y el ResizeObserver deciden si hace falta reajustar.
  SC._lastAW=aw;SC._lastAH=ah;
  // El recorte se guarda en coordenadas lógicas: si cambia el ajuste, deja de valer
  SC.tile=null;SC.tileR=null;
  if(preservar){
    SC.z=Math.max(1,Math.min(8,oz));
    SC.tx=(SC.cvsW/2-ocx*SC.cvsW)*SC.z;SC.ty=(SC.cvsH/2-ocy*SC.cvsH)*SC.z;
    if(SC.z<=1){SC.tx=0;SC.ty=0;}
  }else{SC.z=1;SC.tx=0;SC.ty=0;}
  // Los botones de zoom se apoyan encima de la barra de pistas: con 46 px de alto en el
  // celular y bottom:52px, el de abajo montaba 6 px sobre una barra de 58.
  const abajo=Math.max(52,ah-vh+10)+'px';
  const zb=$('sp-zoom');if(zb)zb.style.bottom=abajo;
  // El ojo de las cotas va en la esquina de enfrente y a la misma altura: si se queda con
  // los 52 px de la hoja, se le mete debajo a la barra de pistas igual que hacía el zoom.
  const cb=$('sc-cotas-fab');if(cb)cb.style.bottom=abajo;
}
/* ----- Zoom y desplazamiento (pan) ----- */
function scApplyTransform(){scRender();}
function scZoomReset(){SC.z=1;SC.tx=0;SC.ty=0;scRender();}
/* El centro de la vista es cx=cvsW/2−tx/z: cambiar z sin tocar tx lo corría hacia el
   centro de la foto, así que después de desplazarse a una esquina con dos dedos el
   botón + sacaba de pantalla justo el detalle que se estaba mirando. tx·z′/z deja cx
   quieto: se acerca sobre lo que se está viendo. */
function scZoomBy(f){
  const z=Math.max(1,Math.min(8,SC.z*f)),r=z/SC.z;
  SC.tx*=r;SC.ty*=r;SC.z=z;
  if(SC.z<=1){SC.tx=0;SC.ty=0;}
  scRender();
}
function scGestureStart(e){
  // En iOS el pellizco sobre el lienzo puede acabar ampliando la interfaz entera si no
  // se detiene el evento aquí.
  if(e&&e.cancelable)try{e.preventDefault();}catch(_){}
  // Si se estaba moviendo un extremo o una guía, se cierra esa acción: al soltar el
  // pellizco ya no debe seguir pegada al dedo.
  if(SC.dragH)scEndHandle();
  // Se quitan los listeners del arrastre de guía, no solo la marca: seguían escribiendo
  // g.pos en cada touchmove del pellizco y la guía se iba al borde de la foto.
  if(SC._guideRelease)SC._guideRelease();
  SC.draggingGuide=null;
  SC.gesture=true;SC.down=false;SC.sp=null;SC.cp=null;scHideLoupe();scRender();
  const t=scTT(e);if(!t||t.length<2)return;
  SC._gd=Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY)||1;
  SC._gm={x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2};
  SC._gz=SC.z;SC._gtx=SC.tx;SC._gty=SC.ty;
}
function scGestureMove(e){
  const t=scTT(e);if(!t||t.length<2)return;
  e.preventDefault();
  const d=Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const m={x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2};
  const z=Math.max(1,Math.min(8,SC._gz*(d/SC._gd))),f=z/SC._gz;
  SC.z=z;
  // El ancla se mide sobre el LIENZO y en cada movimiento, no sobre .sp-canvas-area al
  // empezar el gesto: ese es el centro que usan el dibujo (scScene) y la lectura de
  // toques (scGetXY). Cuando el panel se plega el área deja de medir lo mismo que el
  // lienzo, y con el centro del área cada pellizco corría la foto (f−1)·Δh/2 en vez de
  // dejarla bajo los dedos: repitiendo el gesto se iba caminando fuera del cuadro.
  const r=$('scalerCanvas').getBoundingClientRect(),S0={x:r.left+SC.vw/2,y:r.top+SC.vh/2};
  // Ancla el zoom/pan al punto entre los dedos (lo que estaba bajo los dedos se queda ahí)
  SC.tx=m.x-S0.x-f*(SC._gm.x-SC._gtx-S0.x);
  SC.ty=m.y-S0.y-f*(SC._gm.y-SC._gty-S0.y);
  if(SC.z<=1){SC.tx=0;SC.ty=0;}
  scApplyTransform();
}
/* ----- Lupa (para ver bajo el dedo al trazar) ----- */
const SC_LOUPE=132;
/* Dónde se centra la lupa: en el punto que va a quedar —el extremo que se está
   moviendo, o el punto ya ajustado al eje— y no en el dedo, que es lo que tapa. */
function scLoupePt(){
  const h=SC.dragH;
  if(h){
    if(h.kind==='ref'&&SC.refLine)
      return h.end===1?{x:SC.refLine.nx1*SC.cvsW,y:SC.refLine.ny1*SC.cvsH}:{x:SC.refLine.nx2*SC.cvsW,y:SC.refLine.ny2*SC.cvsH};
    if(h.item)
      return h.end===1?{x:h.item.nx1*SC.cvsW,y:h.item.ny1*SC.cvsH}:{x:h.item.nx2*SC.cvsW,y:h.item.ny2*SC.cvsH};
  }
  if(SC.down&&SC.sp&&SC.cp)return scSnap(SC.sp,SC.cp);
  return SC.cp||SC.sp;
}
function scLoupe(e){
  const tt=scTT(e);if(!tt)return;
  const src=scLoupePt();if(!src)return;
  const lp=$('sc-loupe'),size=SC_LOUPE,mag=2.8,t=tt[0];
  let lx=t.clientX-size/2,ly=t.clientY-size-30;
  if(ly<8)ly=t.clientY+34;
  lx=Math.max(8,Math.min(window.innerWidth-size-8,lx));
  lp.style.left=lx+'px';lp.style.top=ly+'px';lp.style.display='block';
  const lc=$('sc-loupe-cvs'),dpr=scDPR(),px=Math.round(size*dpr);
  if(lc.width!==px){lc.width=lc.height=px;lc.style.width=lc.style.height=size+'px';}
  const lctx=lc.getContext('2d');
  // La lupa redibuja la escena centrada en el punto y con más aumento, en vez de
  // ampliar el lienzo ya dibujado: así enseña detalle real de la foto, no píxeles estirados.
  scScene(lctx,size,size,src.x,src.y,(SC.z||1)*mag,dpr,false,true);
  lctx.setTransform(dpr,0,0,dpr,0,0);
  lctx.strokeStyle='rgba(var(--a-rgb),.95)';lctx.lineWidth=1.5;
  lctx.beginPath();lctx.moveTo(size/2-16,size/2);lctx.lineTo(size/2+16,size/2);
  lctx.moveTo(size/2,size/2-16);lctx.lineTo(size/2,size/2+16);lctx.stroke();
}
function scHideLoupe(){const lp=$('sc-loupe');if(lp)lp.style.display='none';}
window.addEventListener('resize',()=>{
  if(!(SC.img&&$('scalermodal').classList.contains('show')))return;
  // Teclado en pantalla: en Chrome Android encoge el viewport ~300 px, así que tocar el
  // campo de los cm o la etiqueta de una medida disparaba un resize y con él el
  // reajuste, perdiendo el acercamiento con el que se estaba colocando el punto —y otra
  // vez al cerrar el teclado—. Con el foco en un campo del escalador no se toca la vista.
  const ae=document.activeElement;
  if(ae&&ae!==document.body&&$('scalermodal').contains(ae)&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return;
  const area=$('sp-canvas-area'),w=area.clientWidth,h=area.clientHeight;
  // El pie del panel cambia de alto con la maqueta y de ahí sale la altura del aviso:
  // se vuelve a medir en todo resize, tenga o no que reajustarse el lienzo.
  scAjustarToast();
  // Cambió la densidad de pantalla (otro monitor, zoom del navegador): rehacer a esa resolución
  if(scDPR()!==SC.rsDpr){scFitCanvas(true);scRender();return;}
  // Ignorar el temblor de altura por la barra de direcciones de Safari (no rehacer el ajuste ni perder el zoom)
  if(w===SC._lastAW && Math.abs(h-(SC._lastAH||0))<130)return;
  scFitCanvas(true);scRender();
});
/* El área del lienzo cambia de alto sin que haya ningún resize: scConfirmCalib plega la
   sección de calibración y abrir la de guías la vuelve a crecer —en la maqueta de
   teléfono son ~140 px de .sp-side—. El lienzo se quedaba del tamaño viejo (conserva el
   style.width/height del último ajuste, que gana sobre inset:0 por sobredeterminación),
   la foto se veía corrida y recortada justo después de calibrar. Se observa el ÁREA, no
   el lienzo —que es absolute—, y la comparación con _lastAW/_lastAH corta cualquier bucle. */
if(window.ResizeObserver){
  try{
    new ResizeObserver(()=>{
      if(!(SC.img&&$('scalermodal').classList.contains('show')))return;
      const a=$('sp-canvas-area');
      if(a.clientWidth!==SC._lastAW||a.clientHeight!==SC._lastAH){scFitCanvas(true);scRender();scAjustarToast();}
    }).observe($('sp-canvas-area'));
  }catch(_){}
}

/* Dibuja la escena en un lienzo de w×h px CSS, con el punto lógico (cx,cy) al centro y
   k px de pantalla por px lógico. Lo usan tanto el lienzo principal como la lupa: la
   lupa es simplemente la misma escena con más aumento, por eso muestra detalle real. */
/* Trazos de la lupa: mismas líneas, grosor constante en pantalla y sin etiquetas */
function scSceneLite(ctx,k){
  const px=v=>v/k; // para que el grosor no crezca con el aumento
  const linea=(a,b,col,dash)=>{
    ctx.save();ctx.strokeStyle=col;ctx.lineWidth=px(2);
    if(dash)ctx.setLineDash([px(7),px(5)]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
  };
  // Las guías también en la lupa: sirven para pegar el punto al borde ya marcado
  // sin tener que alejar la foto para verlo.
  SC.guides.forEach(g=>{
    if(g.type==='h'){const y=g.pos*SC.cvsH;linea({x:-SC.cvsW,y},{x:SC.cvsW*2,y},SC_GUIDE_COLOR,true);}
    else{const x=g.pos*SC.cvsW;linea({x,y:-SC.cvsH},{x,y:SC.cvsH*2},SC_GUIDE_COLOR,true);}
  });
  if(SC.refLine)linea({x:SC.refLine.nx1*SC.cvsW,y:SC.refLine.ny1*SC.cvsH},
                      {x:SC.refLine.nx2*SC.cvsW,y:SC.refLine.ny2*SC.cvsH},'#f59e0b',true);
  // Las medidas apagadas tampoco vuelven por la lupa: si la foto se dejó limpia, se ve
  // limpia también bajo el dedo.
  if(scCotasVisibles())
    SC.items.forEach(m=>linea({x:m.nx1*SC.cvsW,y:m.ny1*SC.cvsH},{x:m.nx2*SC.cvsW,y:m.ny2*SC.cvsH},m.color,false));
  const punto=(p,col)=>{ctx.save();ctx.fillStyle=col;ctx.strokeStyle='#fff';ctx.lineWidth=px(1.5);
    ctx.beginPath();ctx.arc(p.x,p.y,px(4),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();};
  if(SC.down&&SC.sp&&SC.cp){
    const ep=scSnap(SC.sp,SC.cp),ref=(SC.mode==='ref'||SC.mode==='ref-drawn');
    linea(SC.sp,ep,ref?'#f59e0b':azulMarca(),true);
    punto(SC.sp,ref?'#f59e0b':azulMarca());
  }
  if(SC.tapA&&SC.building)punto(SC.tapA,SC.mode==='measure'?azulMarca():'#f59e0b');
}
function scScene(ctx,w,h,cx,cy,k,dpr,shadow,lupa){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,Math.ceil(w*dpr),Math.ceil(h*dpr));
  if(!SC.img)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.translate(w/2,h/2);ctx.scale(k,k);ctx.translate(-cx,-cy);
  // Sombra de la foto (antes era box-shadow del elemento). Solo en reposo y cerca del
  // ajuste: acercado los bordes quedan fuera de cuadro, y un desenfoque grande por
  // cuadro encarecería el arrastre justo cuando importa la fluidez.
  if(shadow&&k<=2&&!SC.down&&!SC.gesture){
    ctx.save();ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=48;ctx.shadowOffsetY=12;
    ctx.fillStyle='#0d1022';ctx.fillRect(0,0,SC.cvsW,SC.cvsH);ctx.restore();
  }
  scDrawPhoto(ctx,cx,cy,k,dpr,w,h,lupa);
  // En la lupa las cotas irían aumentadas igual que la foto y taparían justo lo que se
  // quiere ver: ahí se trazan finas y sin etiqueta, para no estorbar al colocar el punto.
  if(lupa){scSceneLite(ctx,k);ctx.setTransform(1,0,0,1,0,0);return;}
  scDrawGuides(ctx,cx,cy,k,w,h);
  if(SC.refLine){
    const a={x:SC.refLine.nx1*SC.cvsW,y:SC.refLine.ny1*SC.cvsH};
    const b={x:SC.refLine.nx2*SC.cvsW,y:SC.refLine.ny2*SC.cvsH};
    scDrawRef(ctx,a,b,k);
  }
  /* En el teléfono la anotación entera va un 25 % más grande: el factor s escala el
     texto, los huecos, las puntas y el grosor a la vez, así que la etiqueta sigue
     cabiendo dentro de la línea igual que en escritorio. El tamaño base se queda en
     10.5: es una decisión tomada a propósito para que varias cotas en la misma
     fachada no se encimen, y la cota además crece sola al acercar la foto. */
  scDrawDims(ctx,SC.cvsW,SC.cvsH,{selId:SC.sel,s:scIsMobile()?1.25:1,vista:SC.cotas});
  // Agarraderas: los extremos de cada medida se ven como puntos para que se note que
  // se pueden mover. Van a tamaño de pantalla (÷k) para no crecer con el acercamiento.
  // Con las cotas apagadas no se pintan: un punto suelto sobre la foto, sin su línea ni
  // su número, no se lee como el extremo de nada.
  if(!SC.down&&scCotasVisibles()){
    SC.items.forEach(m=>{
      const sel=m.id===SC.sel, fantasma=(SC.cotas==='foco'&&!sel), r=(sel?6:fantasma?3.4:4.5)/k;
      ctx.save();
      if(fantasma)ctx.globalAlpha=.5;
      [[m.nx1,m.ny1],[m.nx2,m.ny2]].forEach(([nx,ny])=>{
        const arr=SC.dragH&&SC.dragH.kind==='item'&&SC.dragH.item===m;
        scPunto(ctx,{x:nx*SC.cvsW,y:ny*SC.cvsH},m.color,r,k,arr||sel);
      });
      ctx.restore();
    });
  }
  if(SC.down&&SC.cp){
    const anchor=SC.sp;
    const ep=anchor?scSnap(anchor,SC.cp):SC.cp;
    if(anchor){
      if(SC.mode==='ref'||SC.mode==='ref-drawn'){scDrawRef(ctx,anchor,ep,k);}
      else if(SC.mode==='measure'){
        const pxD=scDist(anchor,ep);
        const cm=SC.nativePxPerCm>0?(pxD*SC.scaleFactor)/SC.nativePxPerCm:0;
        scDimAnnot(ctx,anchor.x,anchor.y,ep.x,ep.y,{text:cm>0?scFmtCm(cm)+' cm':'…',color:SC_COLORS[SC.nc%SC_COLORS.length],sel:false,offset:scDimOffset(SC.cvsW,SC.cvsH),dashed:true,s:scIsMobile()?1.25:1});
      }
      [anchor,ep].forEach(p=>scPunto(ctx,p,azulMarca(),4.5/k,k,false));
    }else{
      // Colocando el primer punto con el dedo: solo el punto, sin línea — todavía no
      // hay medida, y así se ve que deslizar afina el punto en vez de trazar.
      scPunto(ctx,ep,SC.mode==='measure'?azulMarca():'#f59e0b',6.5/k,k,true);
    }
  }
  if(SC.dragH&&SC.cp){
    const h=SC.dragH,p=h.kind==='ref'
      ?(h.end===1?{x:SC.refLine.nx1*SC.cvsW,y:SC.refLine.ny1*SC.cvsH}:{x:SC.refLine.nx2*SC.cvsW,y:SC.refLine.ny2*SC.cvsH})
      :(h.end===1?{x:h.item.nx1*SC.cvsW,y:h.item.ny1*SC.cvsH}:{x:h.item.nx2*SC.cvsW,y:h.item.ny2*SC.cvsH});
    scPunto(ctx,p,h.kind==='ref'?'#f59e0b':(h.item.color||azulMarca()),6.5/k,k,true);
  }
  // Marcador del primer punto colocado (modo tocar-por-toque), visible entre un toque y otro
  if(SC.building&&SC.tapA&&!SC.down){
    const p=SC.tapA;ctx.save();
    ctx.fillStyle=SC.mode==='measure'?azulMarca():'#f59e0b';ctx.strokeStyle='#fff';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(p.x,p.y,6.5,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1.5;ctx.globalAlpha=.5;
    ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }
  scDrawGuideHandles(ctx,w,h,cx,cy,k,dpr);
  ctx.setTransform(1,0,0,1,0,0);
}
function scRender(){
  if(!(SC.vw>0&&SC.vh>0))return;
  // El centro de la vista en coordenadas lógicas, a partir del zoom y el desplazamiento
  const cx=SC.cvsW/2-SC.tx/SC.z,cy=SC.cvsH/2-SC.ty/SC.z;
  scScene($('scalerCanvas').getContext('2d'),SC.vw,SC.vh,cx,cy,SC.z,SC.rs,true);
}
/* Guías: líneas de referencia que el usuario coloca a mano para ubicar dónde termina
   un diseño y empieza otro. Cruzan todo lo visible (no solo la foto) y no se cuentan
   como medida ni salen en la imagen exportada — son un apoyo mientras se mide.
   Se agarran únicamente por su pestaña del borde (scDrawGuideHandles): si se pudieran
   arrastrar desde la línea, cada guía dejaría una franja de toda la pantalla donde ya
   no se puede medir, justo sobre el borde del diseño que es donde más se mide. */
function scDrawGuides(ctx,cx,cy,k,w,h){
  if(!SC.guides.length)return;
  const hw=w/(2*k),hh=h/(2*k);
  const x0=cx-hw,x1=cx+hw,y0=cy-hh,y1=cy+hh;
  ctx.save();
  SC.guides.forEach(g=>{
    const active=g===SC.draggingGuide;
    // Guía a la que se está pegando el punto que se traza: sólida y marcada, para que
    // se vea de dónde va a salir la medida antes de soltar.
    const pegada=(SC.down||SC.dragH)&&(g===SC.snapH||g===SC.snapV);
    ctx.setLineDash(pegada?[]:[7/k,5/k]);
    ctx.strokeStyle=(active||pegada)?'#0e7490':SC_GUIDE_COLOR;
    ctx.globalAlpha=(active||pegada)?1:.85;
    ctx.lineWidth=(pegada?2.6:active?2.2:1.4)/k;
    ctx.beginPath();
    if(g.type==='h'){const y=g.pos*SC.cvsH;ctx.moveTo(x0,y);ctx.lineTo(x1,y);}
    else{const x=g.pos*SC.cvsW;ctx.moveTo(x,y0);ctx.lineTo(x,y1);}
    ctx.stroke();
  });
  ctx.restore();
}
/* Lado de la pestaña de arrastre, en px de pantalla: no crece con el zoom y en el
   celular es más grande para que se pueda tomar con el dedo. */
function scGuideHandleSize(){return scIsMobile()?26:19;}
/* Posición de la guía en píxeles de pantalla (eje perpendicular a la línea) */
function scGuideScreen(g,v,w,h){
  return g.type==='h'?(g.pos*SC.cvsH-v.cy)*v.k+h/2:(g.pos*SC.cvsW-v.cx)*v.k+w/2;
}
/* Esquina de la pestaña en píxeles de pantalla. Un solo cálculo para el dibujo y para el
   golpe: cuando iban por separado, el cuadro de 26×26 de la esquina superior izquierda
   caía en las dos zonas y con una guía horizontal arriba y una vertical a la izquierda
   solo respondía una de las dos. El corrimiento saca las pestañas de esa esquina: son
   size (el cuadro) + 10, que es lo que hace falta para que ni las zonas de golpe —con
   sus 4 px de holgura por lado— se toquen. */
function scGuideTab(g,c,size){
  return g.type==='h'?{x:0,y:Math.max(size+10,c-size/2)}:{x:Math.max(size+10,c-size/2),y:0};
}
/* Pestañas pegadas al borde (izquierdo si es horizontal, superior si es vertical).
   Se dibujan en coordenadas de pantalla, después de deshacer el zoom: así conservan
   su tamaño y siguen alcanzables por más que se acerque la foto. */
function scDrawGuideHandles(ctx,w,h,cx,cy,k,dpr){
  if(!SC.guides.length)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const size=scGuideHandleSize(),v={cx,cy,k};
  SC.guides.forEach(g=>{
    const c=scGuideScreen(g,v,w,h),lim=g.type==='h'?h:w;
    if(c<-size||c>lim+size)return; // fuera de cuadro
    const active=g===SC.draggingGuide;
    const t=scGuideTab(g,c,size),x=t.x,y=t.y;
    ctx.save();
    ctx.fillStyle=active?'#0e7490':SC_GUIDE_COLOR;
    ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=5;ctx.shadowOffsetY=1;
    scRoundRect(ctx,x,y,size,size,5);ctx.fill();
    ctx.shadowColor='transparent';
    // Dos rayitas: se lee como "esto se arrastra"
    ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=1.5;ctx.lineCap='round';
    const mx=x+size/2,my=y+size/2,r=size*.22;
    ctx.beginPath();
    if(g.type==='h'){
      ctx.moveTo(mx-r,my-2.5);ctx.lineTo(mx+r,my-2.5);
      ctx.moveTo(mx-r,my+2.5);ctx.lineTo(mx+r,my+2.5);
    }else{
      ctx.moveTo(mx-2.5,my-r);ctx.lineTo(mx-2.5,my+r);
      ctx.moveTo(mx+2.5,my-r);ctx.lineTo(mx+2.5,my+r);
    }
    ctx.stroke();
    ctx.restore();
  });
}
/* Punto de un extremo. El radio llega ya dividido entre k, así que se ve del mismo
   tamaño esté la foto ajustada o acercada; el aro marca el que se está moviendo. */
function scPunto(ctx,p,color,r,k,aro){
  ctx.save();
  ctx.fillStyle='#fff';ctx.strokeStyle=color;ctx.lineWidth=2/k;
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(p.x,p.y,Math.max(r*.42,.8/k),0,Math.PI*2);ctx.fill();
  if(aro){
    ctx.globalAlpha=.55;ctx.strokeStyle=color;ctx.lineWidth=1.5/k;
    ctx.beginPath();ctx.arc(p.x,p.y,r+7/k,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function scDrawRef(ctx,a,b,k=1){
  ctx.save();ctx.strokeStyle='#f59e0b';ctx.lineWidth=2.5/k;ctx.setLineDash([8/k,5/k]);
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  ctx.restore();
  [a,b].forEach(p=>scPunto(ctx,p,'#f59e0b',5/k,k,false));
}
/* ----- Cuánto se enseña de las cotas ya trazadas -----
   Medir tres o cuatro elementos de la misma fachada llena la foto de cotas, y a partir de
   la tercera estorban justo donde hay que trazar la siguiente: el número de una queda
   encima del borde que se está apuntando y sus líneas de extensión cruzan el elemento de
   al lado. Antes no había manera de bajarles el volumen — o estaban todas o había que
   borrar medidas que costaron su trabajo—. Aquí se elige cuánto se ENSEÑA, sin tocar nada:

     todas   — como siempre; si hay una elegida, las demás bajan de intensidad
     foco    — solo la elegida lleva número y flechas; las demás quedan de rayita
     ninguna — la foto limpia; las medidas siguen enteras en la lista del panel

   Dos cosas quedan fuera a propósito. La línea de calibración: es una sola, es naranja y
   la sección de calibrar habla de ella, así que esconderla confundiría más de lo que
   despeja. Y lo que sale del escalador —la imagen que se descarga y la que se le manda a
   la IA— lleva SIEMPRE todas las cotas: esto es cómo se ve mientras se mide, no lo que se
   entrega. */
const SC_COTAS=['todas','foco','ninguna'];
const SC_COTAS_TXT={todas:'Cotas: todas',foco:'Cotas: solo la elegida',ninguna:'Cotas: ninguna — la foto queda limpia'};
function scCotasVisibles(){return SC.cotas!=='ninguna';}
function scSetCotas(modo,avisar){
  if(SC_COTAS.indexOf(modo)<0)modo='todas';
  SC.cotas=modo;
  /* Un extremo que no se ve no se puede seguir moviendo: si se estaban apagando las cotas
     con uno agarrado, se suelta donde va en vez de quedarse pegado a un dedo a ciegas. */
  if(modo==='ninguna'&&SC.dragH&&SC.dragH.kind==='item')scEndHandle();
  scUpdateCotasUI();
  scRender();
  if(avisar!==false&&SC.img)scSetHint(SC_COTAS_TXT[modo],null,2600);
}
function scCotasCiclo(){scSetCotas(SC_COTAS[(SC_COTAS.indexOf(SC.cotas)+1)%SC_COTAS.length]);}
/* El botón del lienzo y el selector del panel son el mismo interruptor visto desde dos
   sitios: el del lienzo está donde están las manos mientras se mide, el del panel es el
   que NOMBRA los tres modos y por lo tanto el que los enseña. */
function scUpdateCotasUI(){
  /* Con una sola medida no hay nada que estorbe, así que el mando no aparece: sería un
     botón más en la esquina y tres renglones menos de lista en el celular. Vuelve en
     cuanto hay dos —o si quedó en un modo distinto de «todas», para poder regresar—. */
  const util=SC.items.length>1||SC.cotas!=='todas';
  const fab=$('sc-cotas-fab');
  if(fab)fab.style.display=(SC.img&&util)?'flex':'none';
  const b=$('sc-btn-cotas');
  if(b){
    b.classList.toggle('foco',SC.cotas==='foco');
    b.classList.toggle('off',SC.cotas==='ninguna');
    b.innerHTML=ico(SC.cotas==='ninguna'?'i-ojo-off':'i-ojo');
    const t=SC_COTAS_TXT[SC.cotas]+' — toca para cambiar';
    b.title=t;b.setAttribute('aria-label',t);
  }
  const fila=$('sc-cotas-fila');
  if(fila)fila.style.display=util?'':'none';
  const ids={todas:'sc-cotas-todas',foco:'sc-cotas-foco',ninguna:'sc-cotas-ninguna'};
  Object.keys(ids).forEach(k=>{const el=$(ids[k]);if(el)el.classList.toggle('active',SC.cotas===k);});
  segAria('#sc-cotas-todas,#sc-cotas-foco,#sc-cotas-ninguna');
  // Por clase y no por style: en el celular la nota no va nunca, y eso lo decide una
  // regla de la hoja. Con un display en línea, la regla no podría ganarle.
  const nota=$('sc-cotas-nota');
  if(nota)nota.classList.toggle('hide',SC.cotas==='todas');
}
/* Separación entre lo medido y su línea de cota. Antes era .045 del lado menor: con
   varias medidas en la misma foto las cotas se iban lejos del elemento y se encimaban
   entre ellas. */
function scDimOffset(w,h){return Math.min(w,h)*.026;}
/* Cota de dibujo técnico: líneas de extensión, línea de cota con flechas y la medida
   escrita DENTRO de la línea, en el hueco del centro, en vez de una caja por encima.
   Ocupa bastante menos y deja leer varias medidas juntas sin que se tapen.
   s: escala de trazos y texto (>1 al exportar a la resolución nativa de la foto). */
function scDimAnnot(ctx,x1,y1,x2,y2,opts){
  const{offset=50,color=azulMarca(),sel=false,text='',dashed=false,s=1}=opts;
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<4)return;
  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
  const col=sel?'#e03060':color;
  const gap=4*s,over=4*s,aSize=Math.max(5*s,Math.min(9*s,len*.055));
  const ax=x1+nx*offset,ay=y1+ny*offset,bx=x2+nx*offset,by=y2+ny*offset;
  ctx.save();
  ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=(sel?1.7:1.2)*s;ctx.lineJoin='round';
  const ln=(X1,Y1,X2,Y2)=>{ctx.beginPath();ctx.moveTo(X1,Y1);ctx.lineTo(X2,Y2);ctx.stroke();};
  if(dashed)ctx.setLineDash([4*s,3*s]);else ctx.setLineDash([]);
  ln(x1+nx*gap,y1+ny*gap,ax+nx*over,ay+ny*over);
  ln(x2+nx*gap,y2+ny*gap,bx+nx*over,by+ny*over);
  ctx.setLineDash([]);
  // El texto va dentro: se mide primero para saber cuánto hueco dejarle a la línea
  const fs=10.5*s,fuente='700 '+fs+'px Inter,Arial,sans-serif';
  ctx.font=fuente;
  const hueco=text?ctx.measureText(text).width/2+3.5*s:0;
  const dentro=!!text&&hueco<len/2-aSize-2*s;
  const mx=(ax+bx)/2,my=(ay+by)/2;
  if(dentro){
    ln(ax+ux*aSize,ay+uy*aSize,mx-ux*hueco,my-uy*hueco);
    ln(mx+ux*hueco,my+uy*hueco,bx-ux*aSize,by-uy*aSize);
  }else ln(ax+ux*aSize,ay+uy*aSize,bx-ux*aSize,by-uy*aSize);
  const arr=(tx,ty,vx,vy)=>{const hw=aSize*.34;ctx.beginPath();ctx.moveTo(tx,ty);
    ctx.lineTo(tx-vx*aSize+nx*hw,ty-vy*aSize+ny*hw);ctx.lineTo(tx-vx*aSize-nx*hw,ty-vy*aSize-ny*hw);
    ctx.closePath();ctx.fill();};
  arr(ax,ay,ux,uy);arr(bx,by,-ux,-uy);
  if(text){
    let ang=Math.atan2(uy,ux);if(ang>Math.PI/2||ang<-Math.PI/2)ang+=Math.PI;
    ctx.save();ctx.translate(mx,my);ctx.rotate(ang);
    ctx.font=fuente;ctx.textAlign='center';ctx.textBaseline='middle';
    // Halo blanco en lugar de caja: se lee sobre cualquier fondo y tapa mucho menos el
    // diseño. Si la medida es tan corta que el texto no cabe en la línea, va justo arriba.
    const ty=dentro?0:-(fs*.72+2*s);
    ctx.lineWidth=3*s;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineJoin='round';ctx.miterLimit=2;
    ctx.strokeText(text,0,ty);
    ctx.fillStyle=col;ctx.fillText(text,0,ty);
    ctx.restore();
  }
  ctx.restore();
}
/* Cotas de todas las medidas sobre un lienzo de w×h. La comparten la vista del
   escalador, la miniatura del cotizador y la imagen que se descarga, para que las
   tres se vean igual y haya un solo lugar que ajustar. */
/* La cota dice la medida y nada más. La etiqueta que el vendedor le pone a cada línea
   sirve para identificarla en la lista del panel, pero encima de la imagen solo
   estorba: alarga el texto sobre el propio dibujo y tapa lo que se está midiendo. */
/* vista: cuánto se enseña (ver SC_COTAS). Solo la manda el lienzo del escalador; la
   imagen que se descarga, la miniatura y la que va a la IA no la pasan, así que siempre
   salen con todas las cotas puestas. */
function scDrawDims(ctx,w,h,opt){
  const{s=1,selId=null,vista='todas'}=opt||{};
  if(vista==='ninguna')return;
  const off=scDimOffset(w,h);
  const elegidaHay=selId!=null&&SC.items.some(m=>m.id===selId);
  /* La elegida se pinta al final. Pintada en su turno, la cota de una medida trazada
     después le cruzaba el número por encima justo a la que se estaba mirando. */
  const orden=elegidaHay
    ? SC.items.filter(m=>m.id!==selId).concat(SC.items.filter(m=>m.id===selId))
    : SC.items;
  orden.forEach(m=>{
    const esta=m.id===selId;
    if(vista==='foco'&&!esta){scDimRaya(ctx,m,w,h,s);return;}
    ctx.save();
    /* Con una elegida, las demás bajan de intensidad: se siguen leyendo —a veces es justo
       lo que se quiere, comparar dos medidas— pero la que se está trabajando salta primero. */
    if(elegidaHay&&!esta)ctx.globalAlpha=.5;
    scDimAnnot(ctx,m.nx1*w,m.ny1*h,m.nx2*w,m.ny2*h,{
      text:scFmtCm(m.cm)+' cm',
      color:m.color,sel:esta,offset:off,s});
    ctx.restore();
  });
}
/* La medida «de rayita»: el segmento medido y nada más, sin número, sin flechas y sin
   líneas de extensión. Dice DÓNDE ya se midió —que es lo que hace falta para no repetir
   una medida ni cruzarse con ella— sin competir con lo que se está midiendo ahora. */
function scDimRaya(ctx,m,w,h,s){
  ctx.save();
  ctx.globalAlpha=.42;ctx.strokeStyle=m.color;ctx.lineWidth=1.1*s;
  ctx.setLineDash([5*s,4*s]);ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(m.nx1*w,m.ny1*h);ctx.lineTo(m.nx2*w,m.ny2*h);ctx.stroke();
  ctx.restore();
}

/* Cuántos dedos hay SOBRE EL LIENZO. `e.touches` cuenta los de toda la pantalla, así
   que un pulgar o la palma apoyados en el borde —lo normal al sostener un teléfono
   grande, y casi inevitable en el Fold abierto— convertían cada toque del lienzo en un
   pellizco: dejaba de colocar puntos y la foto se movía sola. `targetTouches` solo
   cuenta los del elemento que recibe el evento, que es el lienzo. */
function scNT(e){return (e&&e.targetTouches)?e.targetTouches.length:0;}
function scTT(e){return (e&&e.targetTouches&&e.targetTouches.length)?e.targetTouches:null;}
/* Punto del evento en píxeles de pantalla, relativo al lienzo */
function scGetScreenXY(e){
  const rect=$('scalerCanvas').getBoundingClientRect();
  const t=scTT(e)||((e.changedTouches&&e.changedTouches.length)?e.changedTouches:null);
  let cx,cy;
  if(t){cx=t[0].clientX;cy=t[0].clientY;}
  else{cx=e.clientX;cy=e.clientY;}
  return{x:cx-rect.left,y:cy-rect.top};
}
function scGetXY(e){
  // Inversa de la transformación de la vista: pantalla → coordenadas lógicas
  const p=scGetScreenXY(e),z=SC.z||1;
  return{x:(p.x-SC.vw/2-SC.tx)/z+SC.cvsW/2,
         y:(p.y-SC.vh/2-SC.ty)/z+SC.cvsH/2};
}
const SC_SNAP_PX=13; // a esta distancia de una guía (px de pantalla) el punto se le pega
/* Pega el punto a las guías que tenga cerca: la horizontal le fija la Y, la vertical la
   X, y si hay una de cada una el punto cae justo en el cruce. Es lo que hace útiles a
   las guías para medir: se marca una vez dónde termina un diseño y desde ese borde
   salen todas las medidas, sin tener que atinarle a pulso cada vez. */
function scSnapGuides(pt){
  SC.snapH=null;SC.snapV=null;
  if(!SC.snapOn||!SC.guides.length)return pt;
  const thr=SC_SNAP_PX/(SC.z||1);
  let dh=thr,dv=thr;
  const out={x:pt.x,y:pt.y};
  SC.guides.forEach(g=>{
    if(g.type==='h'){
      const y=g.pos*SC.cvsH,d=Math.abs(pt.y-y);
      if(d<dh){dh=d;out.y=y;SC.snapH=g;}
    }else{
      const x=g.pos*SC.cvsW,d=Math.abs(pt.x-x);
      if(d<dv){dv=d;out.x=x;SC.snapV=g;}
    }
  });
  return out;
}
/* Punto del evento ya pegado a las guías. Lo usan todos los puntos que se colocan
   (medidas y referencia); el arrastre de una guía sigue leyendo la posición cruda. */
/* Acotado a la foto: el lienzo cubre toda el área y la foto solo el rectángulo
   cvsW×cvsH del centro, así que un toque en la banda oscura daba nx<0 o nx>1. La cota
   se dibujaba fuera de la imagen y en el PNG exportado —que mide imgW×imgH— salía
   cortada. scMoveHandle ya acotaba igual; lo que faltaba era el camino de creación.
   El arrastre de una guía sigue leyendo scGetXY sin acotar: pueden salir del cuadro. */
function scGetXYSnap(e){
  const p=scSnapGuides(scGetXY(e));
  return{x:Math.max(0,Math.min(SC.cvsW,p.x)),y:Math.max(0,Math.min(SC.cvsH,p.y))};
}
function toggleSnapGuias(e){
  if(e)e.preventDefault();
  SC.snapOn=!SC.snapOn;
  $('sc-snap-tg').className='tg'+(SC.snapOn?' on':''); tgAria('sc-snap-tg');
  scRender();
}
function scSnap(a,b){
  if(SC.mMode==='h')return{x:b.x,y:a.y};
  if(SC.mMode==='v')return{x:a.x,y:b.y};
  return b;
}
const SC_TAPTHR=11; // px: distinguir un toque de un arrastre
const SC_HANDLE_HITPX=14; // radio de toque del extremo de una línea, constante en pantalla
/* Guía cuya pestaña del borde contiene el punto (en píxeles de pantalla). Solo la
   pestaña responde: la línea en sí se ignora, para dejar toda la foto libre para medir. */
function scGuideHandleHit(sp){
  if(!SC.guides.length)return null;
  const v=scViewCenter(),size=scGuideHandleSize();
  // De la última a la primera: gana la que se dibujó encima. Se prueba el MISMO
  // rectángulo que se dibuja (con 4 px de holgura), no una franja de todo el borde.
  for(let i=SC.guides.length-1;i>=0;i--){
    const g=SC.guides[i],c=scGuideScreen(g,v,SC.vw,SC.vh),t=scGuideTab(g,c,size);
    if(sp.x>=t.x-4&&sp.x<=t.x+size+4&&sp.y>=t.y-4&&sp.y<=t.y+size+4)return g;
  }
  return null;
}
/* ----- Corregir una línea ya trazada -----
   Un punto puesto con el dedo casi nunca queda exacto al primer intento. En vez de
   obligar a borrar la medida y volver a empezar, los extremos de la referencia y de
   cada medida se pueden agarrar y mover: se guarda el desfase entre el dedo y el
   extremo para que el punto no salte al tocarlo. */
function scHandleHit(pt){
  if(!SC.img)return null;
  // 22 px con el dedo: 14 son unos 4 mm y el toque se iba de largo al camino de trazado,
  // que empieza una medida NUEVA — el resultado habitual de intentar corregir un extremo
  // era una medida a medias en la lista. scIsMobile ya significa «se toca con el dedo».
  const thr=(scIsMobile()?22:SC_HANDLE_HITPX)/(SC.z||1);
  let best=null,bestD=thr;
  const probar=(x,y,h)=>{const d=Math.hypot(pt.x-x,pt.y-y);if(d<bestD){bestD=d;best={...h,dx:x-pt.x,dy:y-pt.y};}};
  // La seleccionada se prueba al final: con dos extremos encimados gana la que ya se
  // estaba trabajando solo si queda igual de cerca.
  // Con las cotas apagadas no se prueba ninguna: lo que no se ve no se agarra, y si no,
  // el toque para empezar una medida nueva se lo comía el extremo invisible de otra.
  if(scCotasVisibles()){
    SC.items.forEach(m=>{
      if(m.id===SC.sel)return;
      probar(m.nx1*SC.cvsW,m.ny1*SC.cvsH,{kind:'item',item:m,end:1});
      probar(m.nx2*SC.cvsW,m.ny2*SC.cvsH,{kind:'item',item:m,end:2});
    });
    const sel=SC.items.find(m=>m.id===SC.sel);
    if(sel){
      probar(sel.nx1*SC.cvsW,sel.ny1*SC.cvsH,{kind:'item',item:sel,end:1});
      probar(sel.nx2*SC.cvsW,sel.ny2*SC.cvsH,{kind:'item',item:sel,end:2});
    }
  }
  if(SC.refLine){
    probar(SC.refLine.nx1*SC.cvsW,SC.refLine.ny1*SC.cvsH,{kind:'ref',end:1});
    probar(SC.refLine.nx2*SC.cvsW,SC.refLine.ny2*SC.cvsH,{kind:'ref',end:2});
  }
  return best;
}
function scMoveHandle(h,pt){
  let x=pt.x+h.dx,y=pt.y+h.dy;
  // El extremo corregido también se pega a las guías, igual que al colocarlo por
  // primera vez: se pega la posición final del punto, no la del dedo, para que el
  // desfase con el que se agarró no lo desalinee del borde marcado.
  const s=scSnapGuides({x,y});x=s.x;y=s.y;
  x=Math.max(0,Math.min(SC.cvsW,x));y=Math.max(0,Math.min(SC.cvsH,y));
  if(h.kind==='ref'){
    if(h.end===1){SC.refLine.nx1=x/SC.cvsW;SC.refLine.ny1=y/SC.cvsH;}
    else{SC.refLine.nx2=x/SC.cvsW;SC.refLine.ny2=y/SC.cvsH;}
    return;
  }
  const m=h.item;
  // Una medida horizontal o vertical conserva su eje al corregirle un extremo
  const otro=h.end===1?{x:m.nx2*SC.cvsW,y:m.ny2*SC.cvsH}:{x:m.nx1*SC.cvsW,y:m.ny1*SC.cvsH};
  if(m.type==='h')y=otro.y; else if(m.type==='v')x=otro.x;
  if(h.end===1){m.nx1=x/SC.cvsW;m.ny1=y/SC.cvsH;}else{m.nx2=x/SC.cvsW;m.ny2=y/SC.cvsH;}
  if(SC.nativePxPerCm>0)m.cm=(scDist({x,y},otro)*SC.scaleFactor)/SC.nativePxPerCm;
}
/* Al mover la referencia cambia la escala y con ella TODAS las medidas: se recalculan
   para que la lista nunca muestre centímetros de una escala vieja. */
function scRecalcTodas(){
  if(SC.nativePxPerCm<=0)return;
  SC.items.forEach(m=>{
    m.cm=(scDist({x:m.nx1*SC.cvsW,y:m.ny1*SC.cvsH},{x:m.nx2*SC.cvsW,y:m.ny2*SC.cvsH})*SC.scaleFactor)/SC.nativePxPerCm;
  });
}
function scEndHandle(){
  const h=SC.dragH;SC.dragH=null;if(!h)return;
  if(h.kind==='ref'){
    if(SC.refCm>0){
      const d=scDist({x:SC.refLine.nx1*SC.cvsW,y:SC.refLine.ny1*SC.cvsH},{x:SC.refLine.nx2*SC.cvsW,y:SC.refLine.ny2*SC.cvsH});
      if(d>=6){
        /* Mismo umbral y mismo aviso que scConfirmCalib: mover un extremo recalculaba la
           escala con una línea de 6 px y avisaba en verde de «Escala ajustada», con TODAS
           las medidas rehechas sobre una referencia que ya no es confiable. Y ahora se
           puede deshacer, porque el radio de agarre son 22 px con el dedo y agarrar la
           referencia sin querer es fácil. */
        const antes=SC.nativePxPerCm, refAntes=JSON.parse(JSON.stringify(SC.refLine));
        SC.nativePxPerCm=(d*SC.scaleFactor)/SC.refCm;
        scRecalcTodas();
        const volver=()=>{ SC.nativePxPerCm=antes; SC.refLine=refAntes; scRecalcTodas(); scUpdateList(); scRender(); toast('Escala restaurada','ok',2200); };
        if(d<20) toast('La referencia quedó muy corta ('+Math.round(d)+' px): la escala dejó de ser confiable','err',6000,{label:'Deshacer',fn:volver});
        else toast('Escala ajustada'+(SC.items.length?' — medidas actualizadas':''),'ok',3800,{label:'Deshacer',fn:volver});
      }
    }
  }
  scSetHint(scModeHint());
  scUpdateGuideList();scUpdateList();scRender();
}
function scDefaultCursor(){
  return(SC.mode==='ref'||SC.mode==='ref-drawn'||SC.mode==='measure')?'crosshair':'default';
}
/* Arrastre de una guía. Escucha en la ventana y no en el lienzo: si se suelta el dedo
   fuera del lienzo (sobre los botones de zoom o el panel) el arrastre termina igual y
   la guía no se queda pegada al puntero. */
function scGuideDragStart(g,e){
  SC.draggingGuide=g;
  // Distancia entre el punto agarrado y la guía: se conserva durante todo el arrastre,
  // así la guía no pega un salto cuando la pestaña se toma por la orilla.
  const p0=scGetXY(e);
  const d0=g.type==='h'?g.pos*SC.cvsH-p0.y:g.pos*SC.cvsW-p0.x;
  const mover=ev=>{
    // Un pellizco —o un toque de la otra mano— cancela el arrastre poniendo
    // draggingGuide en null; sin esta guarda el touchmove del zoom seguía escribiendo
    // g.pos con la guía capturada en la clausura y la mandaba al borde de la foto.
    if(SC.draggingGuide!==g){soltar();return;}
    if(ev.cancelable)ev.preventDefault();
    const pt=scGetXY(ev);
    const v=g.type==='h'?(pt.y+d0)/SC.cvsH:(pt.x+d0)/SC.cvsW;
    g.pos=Math.min(1,Math.max(0,v));
    scRender();
  };
  const soltar=()=>{
    window.removeEventListener('mousemove',mover);
    window.removeEventListener('mouseup',soltar);
    window.removeEventListener('touchmove',mover);
    window.removeEventListener('touchend',soltar);
    window.removeEventListener('touchcancel',soltar);
    SC.draggingGuide=null;SC._guideRelease=null;scRender();
  };
  window.addEventListener('mousemove',mover);
  window.addEventListener('mouseup',soltar);
  window.addEventListener('touchmove',mover,{passive:false});
  window.addEventListener('touchend',soltar);
  window.addEventListener('touchcancel',soltar);
  // Expuesto para poder cortar el arrastre desde fuera (pellizco, cerrar el escalador)
  SC._guideRelease=soltar;
  scRender();
}
function scDown(e){
  if(scNT(e)>=2){scGestureStart(e);return;}
  if(SC.gesture)return;
  const pt=scGetXY(e),touch=!!(e.touches&&e.touches.length);
  // La pestaña de una guía gana al resto: es un objetivo pequeño y del borde, no estorba
  if(SC.img){
    const g=scGuideHandleHit(scGetScreenXY(e));
    if(g){e.preventDefault();scGuideDragStart(g,e);return;}
  }
  // Corregir un extremo ya puesto gana sobre empezar una línea nueva: es lo que se
  // busca al tocar justo encima de un punto que quedó mal. Se busca con la posición
  // cruda del dedo: lo que se apunta es el extremo, no la guía que tenga cerca.
  if(SC.img&&!SC.building){
    const h=scHandleHit(pt);
    if(h){
      e.preventDefault();
      SC.dragH=h;SC.isTouch=touch;
      if(h.kind==='item')SC.sel=h.item.id;
      SC.cp={...pt};
      scSetHint(h.kind==='ref'
        ?'Ajustando la referencia — suelta donde va'
        :'Ajustando la medida '+(SC.items.indexOf(h.item)+1)+' — suelta donde va');
      scUpdateList();scRender();scLoupe(e);
      return;
    }
  }
  if(SC.mode!=='ref'&&SC.mode!=='ref-drawn'&&SC.mode!=='measure')return;
  e.preventDefault();
  // Pegado a guías desde el primer punto. Los dos extremos se leen igual, así el
  // desplazamiento del pegado no se confunde con un arrastre y el toque simple sigue
  // colocando un punto en vez de trazar una línea.
  const sp=scGetXYSnap(e);
  SC.down=true;SC.downPt=sp;SC.moved=false;SC.isTouch=touch;
  // Con el ratón, soltar fuera del lienzo (sobre el panel) no manda mouseup al canvas y
  // la línea punteada se quedaba clavada —y las agarraderas escondidas— hasta el
  // siguiente clic. Se cierra en la ventana, igual que ya hacía el arrastre de guías; si
  // se suelta sobre el lienzo el handler del canvas corre primero y aquí ya no hay nada.
  if(!touch){const fin=ev=>{window.removeEventListener('mouseup',fin);if(SC.down)scUp(ev);};window.addEventListener('mouseup',fin);}
  // Ancla de la previsualización. Con el dedo, mientras se coloca el PRIMER punto no
  // hay ancla: deslizar afina ese punto en vez de trazar una línea de una vez.
  SC.sp=SC.building?SC.tapA:(touch?null:SC.downPt);
  SC.cp={...sp};
  scRender();scLoupe(e);
}
function scMove(e){
  if(SC.gesture){scGestureMove(e);return;}
  if(SC.dragH){
    e.preventDefault();
    const pt=scGetXY(e);
    SC.cp={...pt};
    scMoveHandle(SC.dragH,pt);
    scRender();scLoupe(e);
    return;
  }
  if(SC.draggingGuide)return; // lo lleva el arrastre registrado en la ventana
  if(!SC.down){
    // Sin botón/dedo abajo: el cursor avisa cuándo el ratón queda sobre algo agarrable
    if(!e.touches&&SC.img){
      const g=scGuideHandleHit(scGetScreenXY(e));
      const h=!g&&!SC.building?scHandleHit(scGetXY(e)):null;
      $('scalerCanvas').style.cursor=g?(g.type==='h'?'row-resize':'col-resize'):(h?'grab':scDefaultCursor());
    }
    return;
  }
  e.preventDefault();
  SC.cp=scGetXYSnap(e);
  if(scDist(SC.downPt,SC.cp)>SC_TAPTHR)SC.moved=true;
  scRender();scLoupe(e);
}
function scUp(e){
  // Toque cancelado por el sistema (una notificación, el gesto de "atrás"): no se
  // coloca ningún punto, solo se suelta lo que se estuviera moviendo.
  if(e&&e.type==='touchcancel'){
    if(scNT(e)===0)SC.gesture=false;
    if(SC.dragH)scEndHandle();
    SC.draggingGuide=null;SC.down=false;SC.sp=null;SC.cp=null;SC.downPt=null;SC.moved=false;
    scHideLoupe();scRender();return;
  }
  // Al soltar el pellizco se rehace el lienzo con la resolución que toca al nuevo zoom
  if(SC.gesture){if(scNT(e)===0){SC.gesture=false;scRender();}scHideLoupe();return;}
  if(SC.dragH){scHideLoupe();SC.cp=null;scEndHandle();return;}
  if(SC.draggingGuide)return; // lo lleva el arrastre registrado en la ventana
  scHideLoupe();
  if(!SC.down){return;}
  e.preventDefault();SC.down=false;
  const raw=(e.changedTouches&&e.changedTouches.length)?scGetXYSnap(e):(SC.cp||SC.downPt);
  // Con el ratón, arrastrar traza la línea completa de un tirón. Con el dedo NO: se
  // deslizaba sin querer al acomodar el punto y la línea se guardaba sola —cada toque
  // coloca un punto y el segundo cierra la medida.
  if(SC.moved&&!SC.isTouch){
    const anchor=SC.building?SC.tapA:SC.downPt;
    if(scCommitLine(anchor,raw)){SC.building=false;SC.tapA=null;}
  }else if(SC.building&&SC.tapA){
    if(scCommitLine(SC.tapA,raw)){SC.building=false;SC.tapA=null;}
  }else{
    // Primer punto: queda donde se levantó el dedo, no donde se posó
    SC.tapA={...raw};SC.building=true;
    // Corto porque comparte renglón con el botón de quitar el punto
    scSetHint('✓ Primer punto — toca el otro extremo',{label:'↺ Quitar punto',fn:scCancelarPunto});
  }
  SC.sp=null;SC.cp=null;SC.downPt=null;SC.moved=false;scRender();
}
function scLeave(e){
  if(SC.dragH){scHideLoupe();SC.cp=null;scEndHandle();return;}
  if(SC.draggingGuide)return; // el arrastre sigue vivo aunque el puntero salga del lienzo
  if(SC.down){SC.cp=scGetXYSnap(e);if(scDist(SC.downPt,SC.cp)>SC_TAPTHR)SC.moved=true;scRender();}
  scHideLoupe();
}
/* Quita el punto que quedó a medias, sin tener que cambiar de herramienta */
function scCancelarPunto(){
  SC.building=false;SC.tapA=null;SC.down=false;SC.sp=null;SC.cp=null;SC.downPt=null;SC.moved=false;
  scSetHint(scModeHint());
  scRender();
}
function scCommitLine(a,b){
  if(!a||!b)return false;
  /* El eje forzado (horizontal/vertical) es del modo de MEDICIÓN y no tiene por qué
     enderezar la línea de referencia: un objeto conocido puesto en diagonal —el canto de
     una puerta, una regla apoyada— quedaba recortado a su proyección horizontal, y la
     escala salía más grande de lo real, con todas las medidas mal a la vez. */
  const esRef=(SC.mode==='ref'||SC.mode==='ref-drawn');
  const ep=esRef?b:scSnap(a,b), d=scDist(a,ep);
  if(d<6){scSetHint('Quedaron muy juntos — toca más lejos',{label:'↺ Quitar punto',fn:scCancelarPunto});return false;}
  if(SC.mode==='ref'||SC.mode==='ref-drawn'){
    const n01=v=>Math.max(0,Math.min(1,v));
    SC.refLine={nx1:n01(a.x/SC.cvsW),ny1:n01(a.y/SC.cvsH),nx2:n01(ep.x/SC.cvsW),ny2:n01(ep.y/SC.cvsH)};
    SC.mode='ref-drawn';
    $('sc-ref-confirm-row').style.display='';
    $('sc-ref-cm-input').value='';
    // En el celular no se le roba el foco al campo: el teclado tapa el panel entero
    // (con él, el botón de confirmar quedaba debajo del teclado). Se acerca y se resalta.
    if(scIsMobile()){
      const row=$('sc-ref-confirm-row');
      try{row.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){}
      row.classList.remove('sc-flash');void row.offsetWidth;row.classList.add('sc-flash');
    }else{
      try{$('sc-ref-cm-input').focus({preventScroll:true});}catch(_){$('sc-ref-cm-input').focus();}
    }
    scSetHint('¿Cuánto mide en cm? Escríbelo en el panel');
  }else if(SC.mode==='measure'){
    const pxD=scDist(a,ep),cm=(pxD*SC.scaleFactor)/SC.nativePxPerCm;
    const c01=v=>Math.max(0,Math.min(1,v));
    SC.items.push({id:SC.nid++,nx1:c01(a.x/SC.cvsW),ny1:c01(a.y/SC.cvsH),nx2:c01(ep.x/SC.cvsW),ny2:c01(ep.y/SC.cvsH),cm,label:'',color:SC_COLORS[SC.nc++%SC_COLORS.length],type:SC.mMode});
    SC.sel=SC.items[SC.items.length-1].id;scUpdateList();
    /* Con las cotas apagadas la medida se guarda igual pero no aparece, y lo que se ve es
       una foto que no reacciona: se dice, y se deja el camino de vuelta a un toque. */
    if(SC.cotas==='ninguna')
      toast('Medida guardada — las cotas están ocultas','',4200,{label:'Mostrar cotas',fn:()=>scSetCotas('todas')});
    // Que los extremos se corrigen arrastrándolos se avisa una vez, de paso: como pista
    // fija no cabía en un renglón y la barra crecía a 58 px sobre las cotas de abajo.
    if(SC.items.length===1)scSetHint('Puedes arrastrar un extremo para corregirlo',null,4200);
    /* Y a la tercera es cuando la foto empieza a llenarse: es el momento en que el mando
       de las cotas sirve para algo, así que es cuando se nombra. Una sola vez. */
    else if(SC.items.length===3&&SC.cotas==='todas')
      scSetHint('¿Estorban las cotas? El ojo de la esquina deja solo la elegida',null,5200);
    else scSetHint(scModeHint());
  }
  return true;
}

function scConfirmCalib(){
  const v=parseFloat($('sc-ref-cm-input').value);
  if(!v||v<=0){toast('Ingresa una medida válida en cm','err');return;}
  if(!SC.refLine){toast('Traza primero la línea de referencia','err');return;}
  SC.refCm=v;
  const p1={x:SC.refLine.nx1*SC.cvsW,y:SC.refLine.ny1*SC.cvsH};
  const p2={x:SC.refLine.nx2*SC.cvsW,y:SC.refLine.ny2*SC.cvsH};
  SC.nativePxPerCm=(scDist(p1,p2)*SC.scaleFactor)/v;
  // 20 px de lienzo: por debajo de eso, un píxel de error al poner el punto ya mueve la
  // escala varios por ciento y todas las medidas salen mal a la vez.
  const largoRef=scDist(p1,p2);
  // Recalibrar con medidas ya trazadas: se recalculan todas, si no quedaban con los
  // centímetros de la escala anterior.
  scRecalcTodas();
  $('sc-ref-confirm-row').style.display='none';
  $('sc-calib-done').style.display='';
  // Calibrado: sobran las instrucciones y el botón de marcar referencia. En el celular
  // son 140 px que le hacen falta a la lista de medidas.
  $('sc-calib-help').style.display='none';
  $('sc-btn-calib').style.display='none';
  $('sc-calib-badge').className='sp-calib-badge ok';
  $('sc-calib-txt').textContent='Escala calibrada';
  // Con la escala puesta, la sección de calibración ya no es el trabajo: se plega para
  // que la lista de medidas —que es a lo que se viene— quede arriba y a la vista.
  const secC=$('sc-sec-calib'); if(secC) secC.open=false;
  scSetMode('measure');
  scUpdateList();scUpdateGuideList();
  if(largoRef<20){toast('La línea de referencia quedó muy corta — vuelve a trazarla más larga para que la escala sea confiable','err',4600);}
  toast(SC.items.length?'Escala calibrada — medidas actualizadas':'Escala calibrada — traza líneas para medir','ok');
  scRender();
}
function scResetCalib(full=true){
  SC.refLine=null;SC.refCm=0;SC.nativePxPerCm=0;SC.building=false;SC.tapA=null;SC.dragH=null;
  SC.mMode='libre';
  $('sc-ref-confirm-row').style.display='none';
  $('sc-calib-done').style.display='none';
  $('sc-calib-help').style.display='';
  $('sc-btn-calib').style.display='';
  $('sc-ref-cm-input').value='';
  $('sc-calib-badge').className='sp-calib-badge';
  $('sc-calib-txt').textContent='Sin calibrar';
  const secC=$('sc-sec-calib'); if(secC) secC.open=true;
  if(full){scSetMode('ref');scRender();}
}
/* Texto de ayuda del modo actual, para volver a él al terminar o cancelar una línea */
function scModeHint(){
  /* Textos de un solo renglón. Los de antes pasaban de 100 caracteres y a 430 px de
     ancho ocupaban dos: la barra crecía a 58 px y con ella la franja que le quita al
     lienzo. Los ejemplos de medida conocida viven en la ayuda del panel. */
  if(SC.mode==='ref'||SC.mode==='ref-drawn')
    return 'Toca los dos extremos de algo de medida conocida';
  if(SC.mode==='measure'){
    const mn={'libre':'Libre · cualquier ángulo','h':'Horizontal','v':'Vertical'};
    /* Que las cotas estén apagadas se dice mientras dure: si no, la pista invita a medir
       y lo medido no aparece, y eso se lee como que la app dejó de funcionar. */
    return 'Modo: '+mn[SC.mMode]+' — toca los dos extremos'+(SC.cotas==='ninguna'?' · cotas ocultas':'');
  }
  return '';
}
function scSetMode(m){
  SC.mode=m;SC.down=false;SC.sp=null;SC.cp=null;SC.downPt=null;SC.moved=false;SC.building=false;SC.tapA=null;SC.dragH=null;
  ['sc-btn-ref','sc-btn-libre','sc-btn-h','sc-btn-v'].forEach(id=>$(id).classList.remove('active'));
  const cvs=$('scalerCanvas');
  if(m==='ref'||m==='ref-drawn'){
    $('sc-btn-ref').classList.add('active');
  }else if(m==='measure'){
    const mm={'libre':'sc-btn-libre','h':'sc-btn-h','v':'sc-btn-v'};
    $(mm[SC.mMode]||'sc-btn-libre').classList.add('active');
  }
  segAria('#sc-btn-ref,#sc-btn-libre,#sc-btn-h,#sc-btn-v');
  scSetHint(scModeHint());
  cvs.style.cursor=scDefaultCursor();
}
function scSetMeasMode(m){
  if(!SC.img)return;
  if(SC.nativePxPerCm<=0){toast('Calibra la escala primero','err',2500);return;}
  SC.mMode=m;scSetMode('measure');
}
function scEnableTools(v){
  ['sc-btn-ref','sc-btn-libre','sc-btn-h','sc-btn-v','sc-btn-calib','sc-btn-guide-h','sc-btn-guide-v'].forEach(id=>$(id).disabled=!v);
}
let _scHintT=null;
/* Barra de ayuda del lienzo. Acepta un botón —por ejemplo para quitar el punto que
   quedó a medias—, que en el celular es la salida cuando el primer toque cayó mal.
   tempMs: aviso pasajero; al terminar vuelve la indicación de la herramienta activa,
   sin tocar el estado (a media medición no se pierde el primer punto ya colocado). */
function scSetHint(txt,accion,tempMs){
  const bar=$('sp-hint-bar');
  clearTimeout(_scHintT);
  bar.innerHTML='';
  if(!txt){bar.classList.add('hide');return;}
  const sp=document.createElement('span');sp.textContent=txt;bar.appendChild(sp);
  if(accion&&accion.label&&typeof accion.fn==='function'){
    const b=document.createElement('button');
    b.type='button';b.className='sp-hint-act';b.textContent=accion.label;
    b.onclick=ev=>{ev.stopPropagation();accion.fn();};
    bar.appendChild(b);
  }
  bar.classList.remove('hide');
  if(tempMs)_scHintT=setTimeout(()=>scSetHint(scModeHint()),tempMs);
  scAjustarPorPista();
}
/* Si la barra apareció, se fue o pasó de un renglón a dos, el lienzo tiene que volver a
   terminar donde ella empieza: si no, la foto se dibuja debajo y el número de la cota
   queda detrás del azul. Conserva zoom y encuadre, y no rehace nada si nada cambió. */
function scAjustarPorPista(){
  if(!(SC.img&&$('scalermodal').classList.contains('show')))return;
  const ah=$('sp-canvas-area').clientHeight;
  if(!(ah>0)||Math.abs((ah-scHintReserve())-SC.vh)<=1)return;
  scFitCanvas(true);scRender();
}
/* ----- Guías ----- */
/* Posiciones candidatas para una guía nueva, del centro hacia afuera. Se elige la
   primera libre en vez de escalonar a ciegas: así una guía nueva nunca nace encima de
   otra, ni siquiera después de haber movido las anteriores. */
const SC_GUIDE_SLOTS=[.5,.35,.65,.25,.75,.15,.85,.42,.58,.3,.7,.2,.8,.1,.9];
function scAddGuide(type){
  if(!SC.img)return;
  const usadas=SC.guides.filter(g=>g.type===type).map(g=>g.pos);
  const pos=SC_GUIDE_SLOTS.find(p=>usadas.every(u=>Math.abs(u-p)>.05));
  SC.guides.push({id:SC.gid++,type,pos:pos===undefined?.5:pos});
  scUpdateGuideList();scRender();
  scSetHint('Guía '+(type==='h'?'horizontal':'vertical')+' — arrástrala por su pestaña',null,4000);
}
function scDelGuide(id){
  SC.guides=SC.guides.filter(g=>g.id!==id);
  if(SC.draggingGuide&&SC.draggingGuide.id===id)SC.draggingGuide=null;
  scUpdateGuideList();scRender();
}
function scClearGuides(){
  if(!SC.guides.length)return;
  SC.guides=[];SC.draggingGuide=null;
  scUpdateGuideList();scRender();
}
function scUpdateGuideList(){
  const list=$('sc-guides-list');if(!list)return;
  const clear=$('sc-guides-clear');
  if(clear)clear.style.display=SC.guides.length>1?'':'none';
  const n=$('sc-guides-n');
  if(n)n.textContent=SC.guides.length?SC.guides.length:'';
  // Sin medida: la guía solo marca dónde parte el diseño, las cotas son las que miden
  let h=0,v=0;
  list.innerHTML=SC.guides.map(g=>{
    const n=g.type==='h'?++h:++v;
    return `<div class="sp-gitem">
      <span class="ico" aria-hidden="true">${g.type==='h'?ico('i-horiz'):ico('i-vert')}</span>
      <span class="lbl">${g.type==='h'?'Horizontal':'Vertical'} ${n}</span>
      <button class="sp-ibtn" onclick="scDelGuide(${g.id})" title="Quitar guía" aria-label="Quitar la guía ${g.type==='h'?'horizontal':'vertical'} ${n}"><span aria-hidden="true">×</span></button>
    </div>`;
  }).join('');
}
function scUpdateList(){
  const list=$('sc-medidas-list');
  $('sc-mcount').textContent=SC.items.length;
  list.innerHTML='';
  scUpdateAddAll();
  // El mando de las cotas aparece con la segunda medida y se va con ella: depende de
  // cuántas hay, así que se recalcula aquí, que es por donde pasa todo cambio de la lista.
  scUpdateCotasUI();
  renderScalerPreview();
  if(!SC.items.length){
    list.innerHTML='<div class="sp-mlist-empty">'+(SC.nativePxPerCm>0?'Traza líneas sobre los elementos<br>para registrar sus medidas.':'Calibra la escala primero,<br>luego traza líneas para medir.')+'</div>';
    $('sc-btn-export').disabled=true;return;
  }
  SC.items.forEach((m,i)=>{
    const el=document.createElement('div');
    el.className='sp-mitem'+(m.id===SC.sel?' sel':'');
    el.style.borderLeftColor=m.color;
    el.onclick=()=>{SC.sel=SC.sel===m.id?null:m.id;scUpdateList();scRender();};
    el.innerHTML=`
      <div style="flex:1;min-width:0">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:var(--brand-grd);color:#fff;font-size:9px;font-weight:800;margin-bottom:4px;box-shadow:0 2px 6px rgba(var(--a-rgb),.25)">${i+1}</div>
        <div class="sp-mitem-cm">${scFmtCm(m.cm)}<small> cm</small></div>
        <input class="sp-mitem-label" placeholder="Letras, logo, fachada…" value="${scEsc(m.label)}" aria-label="Nombre de la medida ${i+1}"
          onclick="event.stopPropagation()" oninput="scSetLabel(${m.id},this.value)">
        <button class="sp-mitem-add${m.usada?' done':''}"
          onclick="event.stopPropagation();scUsarMedida(${m.id})" aria-label="${m.usada?'Agregada · agregar otra vez':'Agregar como partida'} — medida ${i+1} de ${scFmtCm(m.cm)} cm">${m.usada?'<svg class=\'svgi\' aria-hidden=\'true\'><use href=\'#i-check\'/></svg> Agregada · agregar otra vez':'→ Agregar como partida'}</button>
      </div>
      <div class="sp-mitem-actions">
        <button class="sp-ibtn" onclick="event.stopPropagation();scDelMedida(${m.id})" title="Eliminar medida ${i+1}" aria-label="Eliminar medida ${i+1}">×</button>
      </div>`;
    list.appendChild(el);
  });
  $('sc-btn-export').disabled=false;
  scAjustarToast();
}
function scSetLabel(id,v){const m=SC.items.find(x=>x.id===id);if(m)m.label=v;}
/* Última medida borrada, para poder deshacer: en el celular la × queda a un dedo de
   distancia de todo lo demás y perder una medida obliga a volver a trazarla. */
let _scBorrada=null;
function scDelMedida(id){
  const idx=SC.items.findIndex(x=>x.id===id);if(idx<0)return;
  _scBorrada={m:SC.items[idx],idx};
  SC.items.splice(idx,1);
  if(SC.sel===id)SC.sel=null;
  scUpdateList();scRender();
  toast('Medida '+(idx+1)+' eliminada','',6000,{label:'Deshacer',fn:scDeshacerMedida});
}
function scDeshacerMedida(){
  if(!_scBorrada)return;
  SC.items.splice(Math.min(_scBorrada.idx,SC.items.length),0,_scBorrada.m);
  SC.sel=_scBorrada.m.id;_scBorrada=null;
  scUpdateList();scRender();
  toast('Medida restaurada','ok');
}
/* Crea la partida de una medida. No cierra el escalador: de una misma imagen
   salen varias medidas y por lo tanto varias partidas. */
function scAgregarPartida(m){
  /* Medio centímetro es la precisión que declara el propio campo de altura (step="0.5") y
     la que enseña la lista de medidas (scFmtCm, un decimal). Redondear a entero tiraba
     hasta 5 mm por partida: en letras de acero a $55/cm son casi $28 por letra, y en la
     cotización eso ya no es redondeo. */
  const h=Math.max(0.5,Math.round(m.cm*2)/2);
  // el escalador está encima: mover la página de atrás no sirve de nada
  const it=addItem({enfocar:false});
  if(!it) return 0;   // no creó: escribir aquí le pisaría la altura a la partida anterior
  it.altura=h;
  /* El escalador ya sabe si la medida se trazó en horizontal o en vertical —lo guarda en
     m.type desde que se dibujó la cota— y hasta hoy lo tiraba a la basura. Para el PRECIO
     da igual: la regla del negocio es $/cm × altura × piezas, y el propio PROMPT_IA manda
     usar el número del corchete tal cual, sea horizontal o vertical. Para el MATERIAL no da
     igual: sin el ancho hay que suponerlo con un factor, y un ancho supuesto se equivoca en
     el acrílico de la cara, que es el renglón más caro de la lista de compra.

     La altura NO se toca: sigue recibiendo m.cm como siempre. El modo se guarda APARTE, y
     ninguno de los dos campos está en _CAMPOS_PRECIO, así que huellaTrabajo() no cambia y
     no se suelta ninguna autorización. Desviar una medida horizontal a otro campo en vez de
     a la altura dejaría la partida en $0. */
  it.medidaTipo=m.type||'';
  if(m.type==='h') it.anchoMedido=m.cm;
  if(m.label){ it.desc=m.label; }
  m.usada=true;
  return h;
}
function scUsarMedida(id){
  const m=SC.items.find(x=>x.id===id);if(!m)return;
  if(locked()){toast('La cotización está bloqueada','err');return;}
  if(!exigirDatosDesdeModal(cerrarScaler))return;
  const h=scAgregarPartida(m);
  /* Un 0 significa que no se creó la partida —la única razón que queda aquí es que el
     candado se cerrara entre el aviso y este renglón—: sin este corte, el aviso de abajo
     anunciaría en verde una partida que no existe. */
  if(!h) return;
  // scAgregarPartida modifica la partida DESPUÉS de que addItem la pintó, así que
  // sin este re-render la última medida se veía con la altura vacía en el cotizador.
  renderItems();
  scUpdateList();
  // El aviso lleva la salida al cotizador: es justo lo que se quiere hacer después de
  // agregar y en el celular ahorra buscar el botón.
  if(m.cm<0.5){toast('Esa medida da menos de medio centímetro — se agregó con 0.5 cm, revisa la calibración de escala','err',5000);}
  /* «Falta el material» y no «sigue midiendo»: la partida que acaba de nacer trae su altura y
     nada más, y el material es el dato que multiplica el precio. El aviso lo dice con el mismo
     criterio con el que la partida se pinta en ámbar por dentro. */
  else toast(`Partida con altura ${h} cm agregada — falta elegir el material`,'ok',4200,{label:'Ir al cotizador',fn:cerrarScaler});
}
function scUsarTodas(){
  if(locked()){toast('La cotización está bloqueada','err');return;}
  if(!exigirDatosDesdeModal(cerrarScaler))return;
  const pend=SC.items.filter(m=>!m.usada);
  if(!pend.length){toast('Todas las medidas ya están agregadas','',2200);return;}
  const cortas=pend.filter(m=>m.cm<0.5).length;
  pend.forEach(scAgregarPartida);
  renderItems();
  scUpdateList();
  /* El número decía 1 cm y el código escribe 0.5: el filtro de arriba es `m.cm<0.5` y la
     altura se clava en `Math.max(0.5,…)`. Es un número equivocado sobre el campo que
     multiplica el precio y sobre la calibración, así que quien lo leyera se iba a buscar una
     altura de 1 cm que no existe. La frase buena ya estaba escrita dos renglones arriba, en
     el camino de una sola medida. */
  if(cortas){toast(`${cortas} ${cortas===1?'medida da':'medidas dan'} menos de medio centímetro — se ${cortas===1?'agregó':'agregaron'} con 0.5 cm, revisa la calibración de escala`,'err',5600);}
  else toast(`${pend.length} ${pend.length===1?'partida agregada':'partidas agregadas'} — falta elegir el material en ${pend.length===1?'ella':'ellas'}`,'ok',4200,{label:'Ir al cotizador',fn:cerrarScaler});
}
/* ===================== Del escalador a la IA =====================
   Eran dos caminos sueltos que resolvían mitades distintas del mismo problema: el
   escalador sabe CUÁNTO mide cada elemento —lo midió sobre la foto, calibrado contra
   una referencia real— pero de ahí solo salen partidas con la altura puesta, y hay
   que completarles material, tipo y número de letras a mano. La IA sabe QUÉ es cada
   elemento —lee el texto, el material, la tipografía— pero de los tamaños tiene que
   adivinar comparando contra puertas y ladrillos.

   Unidos se cubren: se le manda a la misma IA la foto CON las cotas dibujadas encima
   más la lista de medidas en texto, y devuelve las partidas ya clasificadas y con las
   medidas exactas. Es la misma IA, la misma key y el mismo modal de siempre; lo único
   que cambia es de dónde sale la imagen. */
function scImagenParaIA(){
  /* Se manda la foto con las cotas ya pintadas: es justo el material con el que mejor
     trabaja el prompt, que sabe leer un corchete con su número al lado. */
  const k=Math.min(1,1600/Math.max(SC.imgW,SC.imgH)); // más de 1600 px no aporta y encarece la subida
  const oc=document.createElement('canvas');
  oc.width=Math.max(1,Math.round(SC.imgW*k));
  oc.height=Math.max(1,Math.round(SC.imgH*k));
  const ctx=oc.getContext('2d');
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(SC.img,0,0,oc.width,oc.height);
  const s=Math.max(1,Math.min(6,Math.min(oc.width,oc.height)/620));
  scDrawDims(ctx,oc.width,oc.height,{s});
  return oc.toDataURL('image/jpeg',0.9);
}
function scCotizarConIA(){
  if(locked()){ toast('La cotización está bloqueada','err'); return; }
  /* Antes que nada: de aquí se sale a la IA, que crea partidas. Se pregunta ANTES de
     armar la imagen y de cerrar el escalador para no cerrarlo en balde. */
  if(!exigirDatosDesdeModal(cerrarScaler))return;
  if(!SC.img||!SC.items.length){ toast('Traza al menos una medida para cotizarla con IA','err',3200); return; }
  const fuente={
    origen:'escalador',
    mime:'image/jpeg',
    url:scImagenParaIA(),
    medidas:SC.items.map(m=>({cm:m.cm,label:(m.label||'').trim()})),
  };
  // El mismo botón vive en el escalador y en la vista previa del cotizador: solo hay
  // que cerrar el modal —y devolver su entrada de historial— si está abierto.
  if($('scalermodal').classList.contains('show')) cerrarScaler();
  aiOpen(fuente);
}
/* Las medidas que la IA acaba de convertir en partidas quedan marcadas, para que el
   pie del escalador no invite a agregarlas otra vez. */
function scMarcarMedidasUsadas(){
  SC.items.forEach(m=>{ m.usada=true; });
  scUpdateList();
}
/* Cuenta de partidas ya creadas desde el escalador, para el pie del panel */
function scUsadas(){ return SC.items.filter(m=>m.usada).length; }
function scUpdateAddAll(){
  const btn=$('sc-btn-addall'),note=$('sc-addall-note');
  if(!btn) return;
  const pend=SC.items.filter(m=>!m.usada).length, usadas=scUsadas();
  btn.disabled=!pend||locked();
  const restantes=pend<SC.items.length;
  btn.textContent=!pend ? '→ Agregar todas las medidas como partidas'
    : pend===1 ? `→ Agregar la medida ${restantes?'restante ':''}como partida`
    : `→ Agregar las ${pend} medidas ${restantes?'restantes ':''}como partidas`;
  if(note){
    note.style.display=usadas?'':'none';
    note.textContent=usadas?`✓ ${usadas} ${usadas===1?'partida agregada':'partidas agregadas'} a la cotización`:'';
  }
  const ia=$('sc-btn-ia'), iaNote=$('sc-ia-note');
  if(ia){
    const n=SC.items.length;
    ia.disabled=!n||locked();
    ia.innerHTML=ico('i-ia')+(n>1 ? ` Cotizar estas ${n} medidas con IA` : ' Cotizar esta medida con IA');
    if(iaNote) iaNote.style.display=n?'':'none';
  }
}
/* ===================== Vista previa de la imagen escalada, junto a las partidas =====================
   Sin esto, al volver del escalador al cotizador no quedaba rastro de la foto que se
   estaba midiendo, y comparar las partidas contra lo escalado obligaba a reabrir el
   modal una y otra vez. Es solo de la sesión (como Q.aiFile): no se guarda con la cotización. */
function toggleScalerPreview(){
  SC.previewCollapsed=!SC.previewCollapsed;
  renderScalerPreview();
}
function renderScalerPreview(){
  const el=$('scPreviewBox');if(!el)return;
  if(!SC.img){el.innerHTML='';return;}
  const n=SC.items.length,collapsed=!!SC.previewCollapsed;
  el.innerHTML=`<div class="sc-prev-box">
    <div class="sc-prev-head" onclick="toggleScalerPreview()" role="button" tabindex="0" aria-expanded="${!collapsed}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
      <span class="ttl">${ico('i-escalar')} Imagen del escalador · ${n} ${n===1?'medida':'medidas'}</span>
      <span class="chev">${collapsed?'▾ ver':'▴ ocultar'}</span>
    </div>
    ${collapsed?'':`<canvas id="sc-mini-cvs" class="sc-prev-img" onclick="abrirScaler()" title="Clic para volver al escalador y seguir midiendo"></canvas>
    <div class="sub">Compárala con tus partidas · clic en la imagen para volver al escalador</div>`}
    ${n&&!locked()?`<button class="sc-prev-ia" onclick="scCotizarConIA()">${ico('i-ia')} Cotizar ${n===1?'esta medida':`estas ${n} medidas`} con IA</button>`:''}
  </div>`;
  if(!collapsed)scPaintMiniPreview();
}
function scPaintMiniPreview(){
  const cvs=$('sc-mini-cvs');if(!cvs||!SC.img)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.round(Math.min(700,SC.imgW)*dpr),h=Math.round(w*SC.imgH/SC.imgW);
  cvs.width=w;cvs.height=h;
  const ctx=cvs.getContext('2d');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(SC.img,0,0,w,h);
  scDrawDims(ctx,w,h,{s:Math.max(1,dpr*1.15)});
}
function scExportImg(){
  if(!SC.img||!SC.items.length)return;
  /* Techo de 3000 px por lado. El iPhone 15 Pro Max toma 5712×4284 por omisión: pasa del
     tope de área de lienzo de WebKit (~16.7 Mpx), donde el lienzo se queda transparente
     SIN lanzar error, y su PNG en base64 son decenas de MB. Salía un archivo vacío y el
     aviso decía «Imagen descargada». Se mantiene síncrono a propósito: toBlob es
     asíncrono y el click caería fuera del gesto del usuario, que es lo que iOS bloquea. */
  const k=Math.min(1,3000/Math.max(SC.imgW,SC.imgH));
  const W=Math.max(1,Math.round(SC.imgW*k)),H=Math.max(1,Math.round(SC.imgH*k));
  const oc=document.createElement('canvas');oc.width=W;oc.height=H;
  const octx=oc.getContext('2d');
  octx.imageSmoothingEnabled=true;octx.imageSmoothingQuality='high';
  octx.drawImage(SC.img,0,0,W,H);
  // Las cotas se dibujan a escala de la foto exportada, si no quedan diminutas
  scDrawDims(octx,W,H,{s:Math.max(1,Math.min(6,Math.min(W,H)/620))});
  let u='';try{u=oc.toDataURL('image/png');}catch(_){}
  // «data:,» o una cadena de nada: el lienzo no se pudo leer. Antes se avisaba igual.
  if(!u||u.length<2000){toast('No se pudo generar la imagen — prueba con una foto más chica','err',3800);return;}
  const a=document.createElement('a');a.href=u;a.download='medidas-al3d.png';
  document.body.appendChild(a);a.click();a.remove();
  toast('Imagen descargada','ok');
}
function scFmtCm(cm){return Number(cm).toFixed(1).replace(/\.0$/,'');}
function scEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function scDist(a,b){return Math.hypot(b.x-a.x,b.y-a.y);}

