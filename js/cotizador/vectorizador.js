/* ============================================================================
   Cotizador · vectorizador.js

   Vectorizador: cuantización, despeckle, contorneo, esquinas y curvas, orquestación, resultados y salidas (SVG, PNG, partidas, anidador).

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Vectorizador =====================
   Convierte el mapa de bits que manda el cliente —una foto del logotipo, un JPG
   sacado de WhatsApp— en trazo vectorial. Es el eslabón que le faltaba al
   ecosistema: hasta ahora la imagen servía para cotizar (IA) y para medir
   (escalador), pero para FABRICAR hace falta un contorno, no píxeles. Y de paso
   ese contorno responde solo las dos preguntas que mueven el precio de unas
   letras 3D: cuántas letras son y qué alto tienen.

   El proceso son cinco pasos encadenados, los mismos de cualquier vectorizador
   serio, y todos corren aquí en el navegador sin subir nada a ningún lado:

     1. Cuantizar   — reducir la imagen a unos pocos colores planos (Otsu para
                      blanco y negro, corte por la mediana + k-medias para color).
     2. Despeckle   — borrar las motas sueltas del JPG, que si no se vuelven
                      cientos de islas diminutas en el trazo.
     3. Contornear  — seguir la frontera entre píxeles ("cracks") para sacar
                      polígonos cerrados, con sus huecos (el centro de la "O").
     4. Ajustar     — detectar esquinas reales y ajustar curvas de Bézier por
                      mínimos cuadrados (Schneider) al resto, que es lo que
                      convierte una escalera de píxeles en una curva limpia.
     5. Armar SVG   — un trazo por color, con la medida real puesta si se dio,
                      para que abra a escala en Illustrator o en el software de corte.
*/
const VT={
  img:null, imgW:0, imgH:0, objUrl:null, nombre:'',
  wW:0, wH:0, wData:null,          // imagen de trabajo (píxeles a cuantizar)
  pal:[], labels:null, fondoIdx:-1, keep:[],
  layers:[],                        // [{idx,color,loops:[{closed,area,segs}],area}]
  svg:'', hecho:false, sucio:false, corriendo:false,
  formas:0, nodos:0, trazos:0, perimPx:0, ink:null,
  cmPorPx:0, altoCm:0, anchoCm:0,
  vista:'cmp', split:.5, z:1, fitW:0, fitH:0,
  hist:false, ruidoManual:false, ruido:0,
  opts:{modo:'bn', colores:6, detalle:1, despeckle:4, esquinas:1, quitarFondo:true, invertir:false},
};
const VT_MODO_HELP={
  bn:'Una sola silueta en negro: es lo que se manda a cortar el acrílico o el aluminio y de donde salen las letras y su altura.',
  logo:'Colores planos separados, cada uno con su trazo. Para logotipos de dos, tres o cuatro tintas. El número es un tope: si el logotipo trae menos, salen menos.',
  foto:'Muchos colores, sin buscar bordes duros. Sirve para ilustrar la propuesta, no tanto para cortar.',
};
const VT_DETALLE=['Bajo','Medio','Alto'];
const VT_ESQ=['Suaves','Medio','Vivas'];
/* Tolerancias por nivel de detalle: primero cuánto se puede recortar el polígono
   (Douglas-Peucker) y luego cuánto puede desviarse la curva ajustada. Subirlas de
   más redondea las letras; bajarlas de más deja la escalera del píxel. */
const VT_TOL   =[1.7,.95,.5];
const VT_FITERR=[2.3,1.25,.62];
const VT_ANG   =[62,45,30];   // grados a partir de los cuales un vértice es esquina

/* ---------- Apertura y cierre ---------- */
function abrirVector(){
  $('vt-use-ai-btn').style.display=(Q.aiFile&&Q.aiFile.url)?'flex':'none';
  $('vt-use-sc-btn').style.display=SC.img?'flex':'none';
  $('vt-zoom').style.display=VT.img?'flex':'none';
  if(!VT.img) $('vt-overlay').classList.remove('hide');
  $('vectormodal').classList.add('show');
  vtEtiquetarSalida();
  // Una entrada de historial, igual que el escalador: en el celular el gesto para
  // regresar es el botón "atrás" del teléfono y sin esto se salía de la cotización.
  if(!VT.hist){ try{history.pushState({vt:1},'');VT.hist=true;}catch(_){} }
  vtPintarEscalaSc();
  vtAjustarToast();
  if(VT.img) setTimeout(()=>{vtFit();vtRender();vtAjustarToast();},60);
}
function vtOcultar(){ $('vectormodal').classList.remove('show'); }
function cerrarVector(){
  /* ----- Cerrar cuando este documento ES el vectorizador -----
     La Mesa de corte de la plataforma empota cotizador.html con `?abrir=vector`, así que aquí
     el aparato no es un modal encima de la cotización: es TODO lo que se vino a ver. Sin esto,
     la × escondía el modal y dejaba a la vista un cotizador entero dentro de la pestaña de
     Fabricación —una app dentro de otra, sin nada que dijera cómo salir—. Se avisa al padre y
     el padre vuelve a su lente. Si nadie escucha, se cierra como siempre. */
  if(_abiertoComoAparato()){
    try{ parent.postMessage({al3d:'cerrar-vector'},location.origin); return; }catch(_){}
  }
  vtOcultar();
  if(VT.hist){ VT.hist=false; try{history.back();}catch(_){} }
}
function _abiertoComoAparato(){
  try{
    if(parent===window) return false;
    return new URLSearchParams(location.search).get('abrir')==='vector';
  }catch(_){ return false; }
}
/* ----- Lo que este aparato NO es cuando se abre desde el Taller -----
   El escalador es una herramienta de COTIZACIÓN: se usa para sacarle la medida a una foto sin
   cotas y ponerle precio, y no existe en ningún otro sitio de la app. La IA también, y una
   partida —definición— también. Así que las cuatro salidas que el vectorizador comparte con
   la cotización no son de quien corta:

     · «Imagen de IA» y «La del escalador» — traer la imagen de la captura.
     · «Usar la escala calibrada del escalador» — pedirle prestada su calibración.
     · «Agregar como partida de letras 3D» y «Medir el vector en el escalador» — devolverle
       el resultado a la cotización. La primera es la peor de las cuatro: escribiría un
       renglón en la cotización que estuviera abierta, desde la pestaña de Fabricación.

   Abierto desde la Mesa de corte quedan la carga del archivo, los ajustes del trazo, la
   escala escrita a mano, la exportación y «Acomodar en hoja» — que es el camino por el que se
   vino—. Se apagan aquí y no en el HTML porque el MISMO marcado sirve a los dos modos.

   Y los dos botones de salida dicen «Cotizador» porque de ahí se venía siempre; desde aquí se
   vuelve al Taller, y un botón que nombra un destino que no es el suyo es peor que uno sin
   etiqueta: se aprende una vez y se equivoca siempre. */
const VT_SOLO_COTIZANDO = ['vt-use-ai-btn', 'vt-use-sc-btn', 'vt-esc-usar-sc',
                           'vt-btn-partidas', 'vt-btn-scaler'];
function vtEtiquetarSalida(){
  if(!_abiertoComoAparato()) return;
  const l=document.querySelector('#vectormodal .sp-close .lbl');
  if(l) l.textContent='Taller';
  const b=document.querySelector('#vectormodal .sp-back-m');
  if(b) b.innerHTML='<svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Volver al taller';
  document.querySelectorAll('#vectormodal .sp-close').forEach(x=>{
    x.title='Volver al taller'; x.setAttribute('aria-label','Volver al taller');
  });
  /* `hidden` y no `style.display`: son cinco nodos que varias funciones del aparato vuelven a
     encender solas —vtPintarEscalaSc, abrirVector, vtPintarResultado— y escribirles el display
     aquí lo perdería en el siguiente repintado. `[hidden]{display:none!important}` vive al
     principio de css/sistema.css y gana a todas. */
  VT_SOLO_COTIZANDO.forEach(id=>{ const n=$(id); if(n) n.hidden=true; });
}
window.addEventListener('popstate',()=>{
  if(!$('vectormodal').classList.contains('show'))return;
  VT.hist=false;              // la entrada ya la consumió el "atrás" del navegador
  vtOcultar();
});

/* ---------- Entrada de imagen ---------- */
function vtCargarImagen(input){
  const f=input.files[0]; if(!f)return;
  if(f.type==='application/pdf'){ vtLoadPDF(f); input.value=''; return; }
  const r=new FileReader();
  r.onload=ev=>vtLoadImgSrc(ev.target.result,f.name);
  r.readAsDataURL(f);
  input.value='';
}
function vtOnDrop(e){
  e.preventDefault(); e.currentTarget.style.outline='';
  if(e.dataTransfer.files[0]) vtCargarImagen({files:e.dataTransfer.files,value:''});
}
function vtUsarImagenAI(){ if(Q.aiFile&&Q.aiFile.url) vtLoadImgSrc(Q.aiFile.url,'imagen IA'); }
function vtUsarImagenScaler(){ if(SC.img) vtLoadImgSrc(SC.img.src,'imagen del escalador'); }
async function vtLoadPDF(f){
  toast('Cargando PDF…','',8000);
  try{
    if(!window.pdfjsLib){
      /* s.onerror no trae mensaje, así que el catch de abajo imprimía «Error PDF: undefined»
         —el caso más común es simplemente estar sin señal, porque el lector se descarga la
         primera vez— y no había forma de saber qué había pasado ni qué hacer. */
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=res;s.onerror=()=>rej(new Error('se necesita conexión para leer un PDF: el lector se descarga la primera vez. Exporta el plano como JPG o PNG y vuelve a intentar'));document.head.appendChild(s);});
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
    const page=await pdf.getPage(1);
    const base=page.getViewport({scale:1});
    // Menos resolución que en el escalador: aquí cada píxel se cuantiza y se recorre,
    // y de 2200 px en adelante solo se paga tiempo sin ganar trazo.
    const s=Math.max(1.5,Math.min(4,2200/base.width));
    const vp=page.getViewport({scale:s});
    const oc=document.createElement('canvas'); oc.width=Math.round(vp.width); oc.height=Math.round(vp.height);
    const cx=oc.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,oc.width,oc.height);
    await page.render({canvasContext:cx,viewport:vp}).promise;
    const url=await new Promise(res=>{try{oc.toBlob(b=>res(b?URL.createObjectURL(b):oc.toDataURL()),'image/png');}catch(_){res(oc.toDataURL());}});
    vtLoadImgSrc(url,f.name);
  }catch(e){ toast('No se pudo abrir el PDF: '+((e&&e.message)||'el archivo no se pudo leer'),'err',7000); }
}
function vtLoadImgSrc(src,name){
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{
    if(VT.objUrl&&VT.objUrl!==src&&VT.objUrl!==SC.objUrl){try{URL.revokeObjectURL(VT.objUrl);}catch(_){}}
    VT.objUrl=/^blob:/.test(src)?src:null;
    VT.img=img; VT.imgW=img.naturalWidth; VT.imgH=img.naturalHeight; VT.nombre=name||'logo';
    VT.hecho=false; VT.sucio=false; VT.layers=[]; VT.svg=''; VT.pal=[]; VT.labels=null;
    VT.cmPorPx=0; VT.altoCm=0; VT.anchoCm=0; VT.z=1; VT.split=.5;
    $('vt-alto-cm').value=''; $('vt-ancho-cm').value='';
    $('vt-overlay').classList.add('hide');
    $('vt-stage').style.display='';
    $('vt-zoom').style.display='flex';
    $('vt-go').disabled=false;
    vtSetVista('orig');
    vtBadge('Sin vectorizar','');
    vtPintarResultado(); vtPintarEscala(); vtPintarEscalaSc(); vtHabilitarSalidas();
    vtFit(); vtRender();
    toast('Imagen cargada · '+(name||''),'ok');
  };
  img.onerror=()=>toast(errImagen(name),'err',6400);
  img.src=src;
}

/* ---------- Encuadre, zoom y comparación ---------- */
function vtFit(){
  if(!VT.img)return;
  const area=$('vt-canvas-area'); if(!area)return;
  const aw=Math.max(60,area.clientWidth-34), ah=Math.max(60,area.clientHeight-34);
  const k=Math.min(aw/VT.imgW,ah/VT.imgH,1.6);
  VT.fitW=Math.max(1,Math.round(VT.imgW*k)); VT.fitH=Math.max(1,Math.round(VT.imgH*k));
  const st=$('vt-stage');
  st.style.width=VT.fitW+'px'; st.style.height=VT.fitH+'px';
  st.style.transform='scale('+VT.z+')';
  // Resolución de dibujo: la de la imagen, topada. Es lo que se ve al acercar y lo
  // que se descarga como PNG, así que conviene que no dependa del tamaño de pantalla.
  const cap=2600, kk=Math.min(1,cap/Math.max(VT.imgW,VT.imgH));
  const bw=Math.max(1,Math.round(VT.imgW*kk)), bh=Math.max(1,Math.round(VT.imgH*kk));
  ['vt-cvs-src','vt-cvs-out'].forEach(id=>{const c=$(id); if(c.width!==bw||c.height!==bh){c.width=bw;c.height=bh;}});
  vtColocarSplit();
}
function vtZoomBy(f){ VT.z=Math.max(.25,Math.min(8,VT.z*f)); $('vt-stage').style.transform='scale('+VT.z+')'; vtColocarSplit(); }
function vtZoomReset(){ VT.z=1; $('vt-stage').style.transform='scale(1)'; vtColocarSplit(); }
function vtSetVista(v){
  VT.vista=v;
  ['orig','cmp','vec'].forEach(x=>$('vt-view-'+x).classList.toggle('active',x===v));
  segAria('#vt-view-orig,#vt-view-cmp,#vt-view-vec');
  const out=$('vt-cvs-out'), src=$('vt-cvs-src');
  const hay=VT.hecho;
  out.style.display=(hay&&v!=='orig')?'':'none';
  src.style.visibility=(hay&&v==='vec')?'hidden':'visible';
  $('vt-split').classList.toggle('on',hay&&v==='cmp');
  $('vt-tag-l').classList.toggle('hide',!(hay&&v==='cmp'));
  $('vt-tag-r').classList.toggle('hide',!(hay&&v==='cmp'));
  out.style.clipPath=(hay&&v==='cmp')?'inset(0 0 0 '+(VT.split*100).toFixed(2)+'%)':'inset(0 0 0 0)';
  vtColocarSplit();
}
function vtColocarSplit(){
  const h=$('vt-split'); if(!h||!h.classList.contains('on'))return;
  const st=$('vt-stage').getBoundingClientRect(), ar=$('vt-canvas-area').getBoundingClientRect();
  h.style.left=(st.left-ar.left+st.width*VT.split)+'px';
}
function vtSplitDown(e){
  e.preventDefault();
  const mv=ev=>{
    const p=ev.touches?ev.touches[0]:ev;
    const st=$('vt-stage').getBoundingClientRect();
    VT.split=Math.max(0,Math.min(1,(p.clientX-st.left)/Math.max(1,st.width)));
    $('vt-cvs-out').style.clipPath='inset(0 0 0 '+(VT.split*100).toFixed(2)+'%)';
    vtColocarSplit();
  };
  const up=()=>{
    document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);
    document.removeEventListener('touchmove',mv);document.removeEventListener('touchend',up);
  };
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  document.addEventListener('touchmove',mv,{passive:false});document.addEventListener('touchend',up);
  mv(e);
}
window.addEventListener('resize',()=>{
  if(!$('vectormodal').classList.contains('show'))return;
  vtAjustarToast();
  if(VT.img){vtFit();vtRender();}
});

/* ---------- Ajustes ---------- */
/* Cuánta mota tolera cada modo. En blanco y negro casi ninguna —la silueta es limpia y
   cada píxel de más es borde que alguien va a cortar—; en color hace falta bastante más,
   porque el grano del JPG se reparte entre colores vecinos y cada temblor se vuelve isla. */
const VT_RUIDO_DEF={bn:4,logo:14,foto:26};
function vtSetModo(m){
  VT.opts.modo=m;
  ['bn','logo','foto'].forEach(x=>$('vt-modo-'+x).classList.toggle('on',x===m));
  segAria('.vt-modo button');
  $('vt-fld-colores').style.display=(m==='bn')?'none':'';
  if(m==='logo'&&VT.opts.colores>12) vtOpt('colores',6);
  if(m==='foto'&&VT.opts.colores<8)  vtOpt('colores',16);
  // El valor por omisión sigue al modo, salvo que ya se haya movido el deslizador a mano
  if(!VT.ruidoManual){
    const v=VT_RUIDO_DEF[m];
    VT.opts.despeckle=v;
    $('vt-ruido').value=v;
    $('vt-ruido-v').textContent=v?v+' px':'nada';
    $('vt-ruido').setAttribute('aria-valuetext',v?v+' px':'nada');
  }
  $('vt-modo-help').textContent=VT_MODO_HELP[m];
  vtSucio();
}
function vtOpt(k,v){
  VT.opts[k]=v;
  if(k==='despeckle') VT.ruidoManual=true;
  if(k==='colores')  {$('vt-colores-v').textContent=v; $('vt-colores').value=v;}
  if(k==='detalle')  {$('vt-detalle-v').textContent=VT_DETALLE[v]; $('vt-detalle').setAttribute('aria-valuetext',VT_DETALLE[v]);}
  if(k==='despeckle'){$('vt-ruido-v').textContent=v?v+' px':'nada'; $('vt-ruido').setAttribute('aria-valuetext',v?v+' px':'nada');}
  if(k==='esquinas') {$('vt-esq-v').textContent=VT_ESQ[v]; $('vt-esq').setAttribute('aria-valuetext',VT_ESQ[v]);}
  vtSucio();
}
function vtToggleFondo(e){ if(e)e.preventDefault(); VT.opts.quitarFondo=!VT.opts.quitarFondo; $('vt-fondo-tg').classList.toggle('on',VT.opts.quitarFondo); tgAria('vt-fondo-tg'); vtSucio(); }
function vtToggleInvertir(e){ if(e)e.preventDefault(); VT.opts.invertir=!VT.opts.invertir; $('vt-inv-tg').classList.toggle('on',VT.opts.invertir); tgAria('vt-inv-tg'); vtSucio(); }
/* Un ajuste cambiado deja el trazo de la pantalla desactualizado: se avisa en vez de
   re-vectorizar solo, porque en una imagen grande son segundos de trabajo. */
function vtSucio(){
  if(!VT.hecho)return;
  VT.sucio=true;
  vtBadge('Ajustes cambiados','warn');
  $('vt-go').innerHTML=ico('i-vector')+' Volver a vectorizar';
}
function vtBadge(txt,cls){
  $('vt-badge-txt').textContent=txt;
  $('vt-badge').className='sp-calib-badge'+(cls==='ok'?' ok':'');
}

/* ===================== 1 · Cuantización ===================== */
/* Presupuesto de píxeles a procesar. En el celular una foto de 12 MP tardaría una
   eternidad y no mejora el trazo: lo que manda el detalle es el contorno, no el tamaño. */
function vtPresupuesto(){ return scIsMobile()?820000:1700000; }
function vtPrepararTrabajo(){
  const budget=vtPresupuesto();
  const k=Math.min(1,Math.sqrt(budget/(VT.imgW*VT.imgH)));
  VT.wW=Math.max(1,Math.round(VT.imgW*k)); VT.wH=Math.max(1,Math.round(VT.imgH*k));
  const oc=document.createElement('canvas'); oc.width=VT.wW; oc.height=VT.wH;
  const ctx=oc.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(VT.img,0,0,VT.wW,VT.wH);
  VT.wData=ctx.getImageData(0,0,VT.wW,VT.wH).data;
  VT.ruido=vtRuido();
  // En blanco y negro no se suaviza: Otsu parte por luminancia y el ruido simétrico se le
  // cancela solo. Suavizar ahí solo comería el filo de la silueta, que es justo lo que se
  // va a cortar.
  if(VT.opts.modo!=='bn') vtSuavizar(vtPasadas(VT.ruido));
}
/* Cuánto grano trae la imagen, medido como la mediana de la segunda diferencia entre
   píxeles vecinos. En una zona plana esa cifra ES el ruido; en un borde se dispara, y por
   eso se toma la mediana y no el promedio — los bordes son pocos y quedan en la cola. */
function vtRuido(){
  const d=VT.wData,w=VT.wW,h=VT.wH;
  const paso=Math.max(1,Math.round(Math.sqrt(w*h/24000)));
  const m=[];
  const lum=i=>(d[i]*77+d[i+1]*151+d[i+2]*28)>>8;
  for(let y=paso;y<h-paso;y+=paso)for(let x=1;x<w-1;x+=paso){
    const i=(y*w+x)*4;
    m.push(Math.abs(2*lum(i)-lum(i-4)-lum(i+4)));
  }
  if(!m.length) return 0;
  m.sort((a,b)=>a-b);
  return m[m.length>>1];
}
const vtPasadas=r=>Math.max(1,Math.min(5,Math.round(r/6)+1));
/* Desenfoque separable de tres taps, repetido tantas veces como pida el grano medido.
   Sin esto, el temblor de un JPG de WhatsApp cruza una y otra vez la frontera entre dos
   colores vecinos de la paleta y lo que sale no son formas sino miles de islas de tres
   píxeles: un SVG de megabytes que ningún software de corte abre. Se aplica antes de
   cuantizar, que es donde el daño se produce; la cuantización aplana después los bordes
   que el desenfoque hubiera suavizado. */
/* El promedio no cruza la frontera del alfa. Un píxel transparente trae RGB (0,0,0) —los
   exportadores no se molestan en pintar lo invisible—, así que promediar con él metía negro
   en el borde del dibujo y fabricaba colores de paleta que no existen en el logotipo:
   grises entre la tinta y la nada, que después salían como contornos fantasma. Los vecinos
   transparentes se saltan y el promedio se renormaliza por el peso que de verdad se usó. */
function vtSuavizar(pasadas){
  const d=VT.wData,w=VT.wW,h=VT.wH,tmp=new Uint8ClampedArray(d.length);
  const opaco=i=>d[i+3]>=8;
  for(let p=0;p<pasadas;p++){
    tmp.set(d);
    for(let y=0;y<h;y++){
      const fila=y*w;
      for(let x=0;x<w;x++){
        const i=(fila+x)*4;
        if(!opaco(i)) continue;
        const a=(fila+Math.max(0,x-1))*4, b=(fila+Math.min(w-1,x+1))*4;
        const pa=opaco(a)?1:0, pb=opaco(b)?1:0, peso=pa+2+pb;
        for(let c=0;c<3;c++) tmp[i+c]=(pa*d[a+c]+2*d[i+c]+pb*d[b+c])/peso;
      }
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      if(!opaco(i)) continue;
      const a=(Math.max(0,y-1)*w+x)*4, b=(Math.min(h-1,y+1)*w+x)*4;
      const pa=opaco(a)?1:0, pb=opaco(b)?1:0, peso=pa+2+pb;
      for(let c=0;c<3;c++) d[i+c]=(pa*tmp[a+c]+2*tmp[i+c]+pb*tmp[b+c])/peso;
    }
  }
}
const vtDist=(r,g,b,c)=>{const dr=r-c[0],dg=g-c[1],db=b-c[2];return 2*dr*dr+4*dg*dg+3*db*db;};
/* Siembra estilo k-means++: cada centro nuevo se rifa entre los píxeles, con más
   probabilidad cuanto más lejos estén de los centros ya puestos.

   Antes esto era un corte por la mediana y se equivocaba de una forma muy visible: en un
   logotipo el fondo suele ser el 85% de los píxeles, la mediana cae siempre dentro de ese
   fondo, y con tres colores se gastaban dos centros en dos beiges casi iguales mientras el
   azul del texto y el rojo del emblema terminaban fundidos en un morado que no existe.
   Sembrando por distancia, un color minoritario pero lejano —que es justo lo que es la
   tinta de un logotipo— se lleva un centro propio.

   El sorteo va con una semilla fija a propósito: vectorizar dos veces la misma imagen con
   los mismos ajustes tiene que dar el mismo trazo. */
function vtRnd(){ VT._seed=(VT._seed*1103515245+12345)&0x7fffffff; return VT._seed/0x7fffffff; }
function vtSembrar(pts,n){
  VT._seed=20250607;
  let mx=0,my=0,mz=0;
  for(const p of pts){mx+=p[0];my+=p[1];mz+=p[2];}
  const cent=[[Math.round(mx/pts.length),Math.round(my/pts.length),Math.round(mz/pts.length)]];
  const d2=new Float64Array(pts.length).fill(Infinity);
  while(cent.length<n){
    const c=cent[cent.length-1];
    let sum=0;
    for(let i=0;i<pts.length;i++){
      const dd=vtDist(pts[i][0],pts[i][1],pts[i][2],c);
      if(dd<d2[i]) d2[i]=dd;
      sum+=d2[i];
    }
    if(!(sum>0)) break;
    let r=vtRnd()*sum,k=0;
    for(;k<pts.length-1;k++){ r-=d2[k]; if(r<=0) break; }
    cent.push(pts[k].slice());
  }
  return cent;
}
/* Siembra por distancia y unas vueltas de k-medias para asentar los centros. */
function vtPaleta(n){
  const d=VT.wData,w=VT.wW,h=VT.wH;
  const step=Math.max(1,Math.round(Math.sqrt(w*h/38000)));
  const pts=[];
  for(let y=0;y<h;y+=step) for(let x=0;x<w;x+=step){
    const i=(y*w+x)*4; if(d[i+3]<8) continue;
    pts.push([d[i],d[i+1],d[i+2]]);
  }
  if(!pts.length) return [[0,0,0]];
  let pal=vtSembrar(pts,n);
  for(let it=0;it<10;it++){
    const acc=pal.map(()=>[0,0,0,0]);
    for(const p of pts){
      let bi=0,bd=Infinity;
      for(let c=0;c<pal.length;c++){const dd=vtDist(p[0],p[1],p[2],pal[c]); if(dd<bd){bd=dd;bi=c;}}
      const a=acc[bi]; a[0]+=p[0];a[1]+=p[1];a[2]+=p[2];a[3]++;
    }
    let mov=0;
    pal=pal.map((c,i)=>{
      const a=acc[i]; if(!a[3]) return c;
      const nc=[Math.round(a[0]/a[3]),Math.round(a[1]/a[3]),Math.round(a[2]/a[3])];
      mov+=Math.abs(nc[0]-c[0])+Math.abs(nc[1]-c[1])+Math.abs(nc[2]-c[2]);
      return nc;
    });
    if(mov<3) break;
  }
  /* El deslizador dice CUÁNTOS colores como mucho, no cuántos a fuerza. Si se le piden
     seis a un logotipo que tiene tres, k-medias no deja centros de sobra sin usar: los
     reparte, y termina partiendo un fondo plano en cuatro beiges casi iguales. Lo que se
     ve son manchas, y cada mancha es un trazo más en el SVG. Los centros que quedaron
     prácticamente en el mismo color se funden en uno. */
  const UMBRAL=760;
  for(let hubo=true;hubo&&pal.length>2;){
    hubo=false;
    for(let i=0;i<pal.length&&!hubo;i++)for(let j=i+1;j<pal.length;j++){
      if(vtDist(pal[i][0],pal[i][1],pal[i][2],pal[j])<UMBRAL){
        pal[i]=[0,1,2].map(c=>Math.round((pal[i][c]+pal[j][c])/2));
        pal.splice(j,1); hubo=true; break;
      }
    }
  }
  return pal;
}
/* Otsu: parte el histograma de luminancia en dos por el umbral que más separa las dos
   mitades. Para un logotipo sobre fondo plano acierta prácticamente siempre, y sin
   pedirle al usuario que mueva un deslizador de umbral a ojo. */
function vtOtsu(){
  const d=VT.wData, hist=new Float64Array(256); let tot=0;
  for(let i=0;i<d.length;i+=4){
    if(d[i+3]<8) continue;
    hist[(d[i]*77+d[i+1]*151+d[i+2]*28)>>8]++; tot++;
  }
  if(!tot) return 128;
  let sum=0; for(let t=0;t<256;t++) sum+=t*hist[t];
  let sumB=0,wB=0,best=-1,thr=128;
  for(let t=0;t<256;t++){
    wB+=hist[t]; if(!wB) continue;
    const wF=tot-wB; if(!wF) break;
    sumB+=t*hist[t];
    const mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF);
    if(v>best){best=v;thr=t;}
  }
  return thr;
}
function vtCuantizar(){
  const d=VT.wData,w=VT.wW,h=VT.wH,N=w*h;
  const lab=new Int16Array(N);
  if(VT.opts.modo==='bn'){
    const thr=vtOtsu();
    VT.pal=[[20,20,22],[255,255,255]];       // 0 = tinta, 1 = fondo
    for(let p=0,i=0;p<N;p++,i+=4){
      if(d[i+3]<8){lab[p]=-1;continue;}
      const l=(d[i]*77+d[i+1]*151+d[i+2]*28)>>8;
      lab[p]=(l<=thr)?0:1;
    }
  }else{
    const pal=vtPaleta(Math.max(2,Math.min(24,VT.opts.colores)));
    VT.pal=pal;
    // Caché por color recortado a 5 bits: la misma imagen repite muchísimo color y así
    // se pasa de decenas de millones de comparaciones a unas cuantas decenas de miles.
    const cache=new Int16Array(32768).fill(-2);
    for(let p=0,i=0;p<N;p++,i+=4){
      if(d[i+3]<8){lab[p]=-1;continue;}
      const r=d[i],g=d[i+1],b=d[i+2];
      const key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);
      let v=cache[key];
      if(v===-2){
        let bi=0,bd=Infinity;
        for(let c=0;c<pal.length;c++){const dd=vtDist(r,g,b,pal[c]); if(dd<bd){bd=dd;bi=c;}}
        v=cache[key]=bi;
      }
      lab[p]=v;
    }
  }
  VT.labels=lab;
  vtDetectarFondo();
}
/* El fondo es el color que domina el borde de la imagen, no el más abundante: un
   logotipo que llena el lienzo tiene más tinta que fondo y por área saldría al revés. */
function vtDetectarFondo(){
  const lab=VT.labels,w=VT.wW,h=VT.wH;
  const votos=new Array(VT.pal.length).fill(0);
  const voto=p=>{const v=lab[p]; if(v>=0)votos[v]++;};
  for(let x=0;x<w;x++){voto(x);voto((h-1)*w+x);}
  for(let y=0;y<h;y++){voto(y*w);voto(y*w+w-1);}
  /* best empieza en 0, no en -1, para que solo gane un color con AL MENOS un voto. Con un
     PNG de logotipo sobre fondo transparente —el caso de entrada más común— los píxeles del
     borde tienen alfa 0 y quedan con lab=-1, así que nadie votaba: el bucle se quedaba con
     el índice 0 por descarte, que es la TINTA del logotipo, y quitarFondo la borraba. El
     resultado era un SVG completamente vacío, con aviso de éxito y sin nada que explicara
     por qué. Cuando nadie vota no hay fondo que quitar: la transparencia ya es el fondo. */
  let bi=-1,best=0;
  for(let i=0;i<votos.length;i++) if(votos[i]>best){best=votos[i];bi=i;}
  if(bi<0){ VT.fondoIdx=-1; VT.keep=VT.pal.map(()=>true); return; }
  VT.fondoIdx=bi;
  if(VT.opts.modo==='bn'&&VT.opts.invertir) VT.fondoIdx=bi===0?1:0;
  VT.keep=VT.pal.map((_,i)=>!(VT.opts.quitarFondo&&i===VT.fondoIdx));
}

/* ===================== 2 · Despeckle ===================== */
/* Cada mota de compresión JPG se vuelve una isla de dos o tres píxeles, y sin quitarlas
   un logotipo sale con cientos de trazos basura que ensucian el SVG y disparan el conteo
   de letras. Se buscan los grupos conexos chicos y se disuelven en el vecino dominante. */
function vtDespeckle(minPx){
  if(minPx<1)return;
  const lab=VT.labels,w=VT.wW,h=VT.wH,N=w*h;
  const visto=new Uint8Array(N), pila=new Int32Array(N), miembros=new Int32Array(N);
  const cuenta=new Int32Array(VT.pal.length);
  for(let seed=0;seed<N;seed++){
    if(visto[seed])continue;
    const col=lab[seed];
    if(col<0){visto[seed]=1;continue;}
    let sp=0,nm=0;
    pila[sp++]=seed; visto[seed]=1;
    while(sp){
      const p=pila[--sp]; miembros[nm++]=p;
      const x=p%w,y=(p/w)|0;
      if(x>0   &&!visto[p-1]&&lab[p-1]===col){visto[p-1]=1;pila[sp++]=p-1;}
      if(x<w-1 &&!visto[p+1]&&lab[p+1]===col){visto[p+1]=1;pila[sp++]=p+1;}
      if(y>0   &&!visto[p-w]&&lab[p-w]===col){visto[p-w]=1;pila[sp++]=p-w;}
      if(y<h-1 &&!visto[p+w]&&lab[p+w]===col){visto[p+w]=1;pila[sp++]=p+w;}
    }
    if(nm>=minPx) continue;
    cuenta.fill(0);
    for(let i=0;i<nm;i++){
      const p=miembros[i],x=p%w,y=(p/w)|0;
      if(x>0   &&lab[p-1]!==col&&lab[p-1]>=0)cuenta[lab[p-1]]++;
      if(x<w-1 &&lab[p+1]!==col&&lab[p+1]>=0)cuenta[lab[p+1]]++;
      if(y>0   &&lab[p-w]!==col&&lab[p-w]>=0)cuenta[lab[p-w]]++;
      if(y<h-1 &&lab[p+w]!==col&&lab[p+w]>=0)cuenta[lab[p+w]]++;
    }
    let bi=-1,best=0;
    for(let i=0;i<cuenta.length;i++) if(cuenta[i]>best){best=cuenta[i];bi=i;}
    if(bi<0)continue;
    for(let i=0;i<nm;i++) lab[miembros[i]]=bi;
  }
}

/* ===================== 3 · Contorneo ===================== */
/* Se recorre la frontera ENTRE píxeles, no los píxeles. Cada tramo va de esquina a
   esquina de la retícula dejando siempre el relleno a la derecha; encadenándolos salen
   polígonos cerrados exactos, sin los saltos en diagonal que deja seguir píxeles.
   El signo del área dice qué es cada lazo: positivo contorno, negativo hueco —el centro
   de una "O" sale solo, sin tener que emparejar nada a mano. */
const VT_DX=[1,0,-1,0], VT_DY=[0,1,0,-1];
function vtTrazarCapa(idx,minArea){
  const lab=VT.labels,w=VT.wW,h=VT.wH;
  const dentro=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&lab[y*w+x]===idx;
  // píxel a la derecha / a la izquierda del tramo que sale de la esquina (i,j) en dirección d
  const derX=(i,j,d)=>d===0?i:d===1?i-1:d===2?i-1:i;
  const derY=(i,j,d)=>d===0?j:d===1?j  :d===2?j-1:j-1;
  const izqX=(i,j,d)=>d===0?i:d===1?i  :d===2?i-1:i-1;
  const izqY=(i,j,d)=>d===0?j-1:d===1?j:d===2?j  :j-1;
  const valido=(i,j,d)=>dentro(derX(i,j,d),derY(i,j,d))&&!dentro(izqX(i,j,d),izqY(i,j,d));
  const cw=w+1;
  const visto=new Uint8Array(cw*(h+1));
  const loops=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(lab[y*w+x]!==idx) continue;
    if(dentro(x,y-1)) continue;                       // no es el borde de arriba
    if(visto[y*cw+x]&1) continue;                     // ya se recorrió este lazo
    let i=x,j=y,d=0;
    const pts=[];
    let guard=0, lim=w*h*4+64;
    do{
      visto[j*cw+i]|=(1<<d);
      pts.push(i,j);
      i+=VT_DX[d]; j+=VT_DY[d];
      // Preferencia: girar a la derecha, seguir de frente, girar a la izquierda.
      // Ese orden fijo es lo que resuelve el damero (una esquina donde el relleno se
      // toca en diagonal) siempre igual, y sin él el recorrido se puede morder la cola.
      let nd=-1;
      for(const c of [(d+1)&3,d,(d+3)&3,(d+2)&3]) if(valido(i,j,c)){nd=c;break;}
      if(nd<0) break;
      d=nd;
    }while((i!==x||j!==y||d!==0)&&++guard<lim);
    if(pts.length<6) continue;
    let a=0;
    for(let k=0,n=pts.length/2;k<n;k++){
      const k2=(k+1)%n;
      a+=pts[k*2]*pts[k2*2+1]-pts[k2*2]*pts[k*2+1];
    }
    a/=2;
    if(Math.abs(a)<minArea) continue;
    loops.push({pts,area:a});
  }
  return loops;
}
/* Quita los vértices que solo continúan en la misma dirección: de una escalera de miles
   de pasos de un píxel se queda con los quiebres, que es lo único que lleva información. */
function vtColineales(pts){
  const n=pts.length/2, out=[];
  for(let k=0;k<n;k++){
    const p=(k-1+n)%n, q=(k+1)%n;
    const ax=pts[k*2]-pts[p*2], ay=pts[k*2+1]-pts[p*2+1];
    const bx=pts[q*2]-pts[k*2], by=pts[q*2+1]-pts[k*2+1];
    if(ax*by-ay*bx!==0||ax*bx+ay*by<0) out.push({x:pts[k*2],y:pts[k*2+1]});
  }
  return out.length>=3?out:null;
}

/* ===================== 4 · Esquinas y curvas ===================== */
/* En una retícula TODO vértice gira 90°, así que no sirve mirar el ángulo de un vértice
   con sus vecinos inmediatos: saldría que todo son esquinas. Se mira el ángulo contra
   puntos a cierta distancia recorrida; así el zigzag de una diagonal se promedia y solo
   sobreviven los quiebres de verdad —la punta de una "A", el canto de una "L"—. */
function vtEsquinas(P,win,angMin){
  const n=P.length, acum=new Float64Array(n+1);
  for(let i=0;i<n;i++){const q=P[(i+1)%n]; acum[i+1]=acum[i]+Math.hypot(q.x-P[i].x,q.y-P[i].y);}
  const total=acum[n];
  if(total<win*2.2) return [];
  const en=s=>{
    s=((s%total)+total)%total;
    let lo=0,hi=n;
    while(lo<hi-1){const m=(lo+hi)>>1; if(acum[m]<=s)lo=m;else hi=m;}
    const seg=acum[lo+1]-acum[lo], t=seg>0?(s-acum[lo])/seg:0;
    const a=P[lo],b=P[(lo+1)%n];
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  };
  const cos=Math.cos(angMin*Math.PI/180), esq=[];
  for(let i=0;i<n;i++){
    const a=en(acum[i]-win), b=en(acum[i]+win), p=P[i];
    const ux=p.x-a.x,uy=p.y-a.y,vx=b.x-p.x,vy=b.y-p.y;
    const lu=Math.hypot(ux,uy),lv=Math.hypot(vx,vy);
    if(lu<1e-6||lv<1e-6) continue;
    if((ux*vx+uy*vy)/(lu*lv)<cos) esq.push(i);
  }
  return esq;
}
/* Douglas-Peucker: quita los puntos que ya describe la recta entre sus vecinos. No es
   por estética sino por tiempo — al ajuste de curvas se le pasan cientos de puntos en
   vez de miles y el resultado es el mismo. */
function vtRDP(P,tol){
  if(P.length<3) return P.slice();
  const keep=new Uint8Array(P.length); keep[0]=keep[P.length-1]=1;
  const pila=[[0,P.length-1]];
  const t2=tol*tol;
  while(pila.length){
    const [a,b]=pila.pop();
    if(b<=a+1) continue;
    const A=P[a],B=P[b];
    const dx=B.x-A.x,dy=B.y-A.y,L=dx*dx+dy*dy;
    let bi=-1,bd=-1;
    for(let i=a+1;i<b;i++){
      const px=P[i].x-A.x,py=P[i].y-A.y;
      let t=L>0?(px*dx+py*dy)/L:0; t=t<0?0:t>1?1:t;
      const ex=px-dx*t,ey=py-dy*t,d=ex*ex+ey*ey;
      if(d>bd){bd=d;bi=i;}
    }
    if(bd>t2&&bi>0){keep[bi]=1;pila.push([a,bi],[bi,b]);}
  }
  const out=[]; for(let i=0;i<P.length;i++) if(keep[i]) out.push(P[i]);
  return out;
}
const vtNorm=v=>{const l=Math.hypot(v.x,v.y);return l>1e-12?{x:v.x/l,y:v.y/l}:{x:0,y:0};};
function vtTangente(P,i,dir){
  // Promediada sobre tres puntos: un solo vecino en una retícula da siempre 0°, 45° o 90°
  let sx=0,sy=0,k=0;
  for(let s=1;s<=3;s++){
    const j=i+dir*s; if(j<0||j>=P.length) break;
    sx+=(P[j].x-P[i].x)/s; sy+=(P[j].y-P[i].y)/s; k++;
  }
  return k?vtNorm({x:sx,y:sy}):{x:0,y:0};
}
const vtBez=(b,t)=>{
  const m=1-t,a0=m*m*m,a1=3*t*m*m,a2=3*t*t*m,a3=t*t*t;
  return {x:b[0].x*a0+b[1].x*a1+b[2].x*a2+b[3].x*a3, y:b[0].y*a0+b[1].y*a1+b[2].y*a2+b[3].y*a3};
};
/* Ajuste de Bézier cúbica por mínimos cuadrados (Philip J. Schneider, "An Algorithm for
   Automatically Fitting Digitized Curves", Graphics Gems, 1990). Con las tangentes de
   los extremos fijas, resuelve el sistema 2×2 que da los dos puntos de control; si el
   error se pasa, reparametriza con Newton-Raphson y, si aun así no cierra, parte el
   tramo por el punto de mayor error y repite. Es este paso —y no el contorneo— el que
   convierte la escalera de píxeles en una curva que se puede mandar a cortar. */
function vtGenBez(d,first,last,u,t1,t2){
  const n=last-first+1, p0=d[first], p3=d[last];
  let C00=0,C01=0,C11=0,X0=0,X1=0;
  for(let i=0;i<n;i++){
    const t=u[i],m=1-t;
    const b0=m*m*m,b1=3*t*m*m,b2=3*t*t*m,b3=t*t*t;
    const a0x=t1.x*b1,a0y=t1.y*b1,a1x=t2.x*b2,a1y=t2.y*b2;
    C00+=a0x*a0x+a0y*a0y; C01+=a0x*a1x+a0y*a1y; C11+=a1x*a1x+a1y*a1y;
    const tx=d[first+i].x-(p0.x*(b0+b1)+p3.x*(b2+b3));
    const ty=d[first+i].y-(p0.y*(b0+b1)+p3.y*(b2+b3));
    X0+=a0x*tx+a0y*ty; X1+=a1x*tx+a1y*ty;
  }
  const det=C00*C11-C01*C01;
  let aL=0,aR=0;
  if(Math.abs(det)>1e-12){ aL=(X0*C11-X1*C01)/det; aR=(C00*X1-C01*X0)/det; }
  const seg=Math.hypot(p3.x-p0.x,p3.y-p0.y);
  /* Los mínimos cuadrados no acotan las tangentes: cuando el tramo es casi recto o los
     puntos se agolpan, el sistema queda mal condicionado y devuelve tirantes larguísimos.
     La curva sigue pasando por los extremos, así que el error medido es bajo y el ajuste
     se da por bueno — pero el trazo sale con una púa disparada a media pantalla. Pasado
     vez y media la cuerda se descarta el resultado y se vuelve a la heurística de
     Wu/Barsky; si de verdad hacía falta más curvatura, el error sube y el tramo se parte,
     que es la salida correcta. */
  const maxA=seg*1.5;
  if(!(aL>seg*1e-6)||!(aR>seg*1e-6)||aL>maxA||aR>maxA){ aL=aR=seg/3; }
  return [p0,{x:p0.x+t1.x*aL,y:p0.y+t1.y*aL},{x:p3.x+t2.x*aR,y:p3.y+t2.y*aR},p3];
}
function vtParam(d,first,last){
  const u=[0];
  for(let i=first+1;i<=last;i++) u.push(u[u.length-1]+Math.hypot(d[i].x-d[i-1].x,d[i].y-d[i-1].y));
  const tot=u[u.length-1]||1;
  return u.map(v=>v/tot);
}
function vtReparam(d,first,last,u,b){
  const q1=[],q2=[];
  for(let i=0;i<3;i++) q1.push({x:(b[i+1].x-b[i].x)*3,y:(b[i+1].y-b[i].y)*3});
  for(let i=0;i<2;i++) q2.push({x:(q1[i+1].x-q1[i].x)*2,y:(q1[i+1].y-q1[i].y)*2});
  const ev=(c,t)=>{
    if(c.length===3){const m=1-t;return{x:c[0].x*m*m+c[1].x*2*m*t+c[2].x*t*t,y:c[0].y*m*m+c[1].y*2*m*t+c[2].y*t*t};}
    const m=1-t;return{x:c[0].x*m+c[1].x*t,y:c[0].y*m+c[1].y*t};
  };
  return u.map((t,i)=>{
    const p=vtBez(b,t),d1=ev(q1,t),d2=ev(q2,t),P=d[first+i];
    const num=(p.x-P.x)*d1.x+(p.y-P.y)*d1.y;
    const den=d1.x*d1.x+d1.y*d1.y+(p.x-P.x)*d2.x+(p.y-P.y)*d2.y;
    return Math.abs(den)<1e-12?t:t-num/den;
  });
}
function vtMaxErr(d,first,last,b,u){
  let max=0,split=((last-first+1)/2|0)+first;
  for(let i=1;i<last-first;i++){
    const p=vtBez(b,u[i]);
    const dx=p.x-d[first+i].x,dy=p.y-d[first+i].y,e=dx*dx+dy*dy;
    if(e>=max){max=e;split=first+i;}
  }
  return {max,split};
}
function vtFitCubic(d,first,last,t1,t2,errSq,out,depth){
  if(last-first+1===2||depth>22){
    const dist=Math.hypot(d[last].x-d[first].x,d[last].y-d[first].y)/3;
    out.push([d[first],{x:d[first].x+t1.x*dist,y:d[first].y+t1.y*dist},
              {x:d[last].x+t2.x*dist,y:d[last].y+t2.y*dist},d[last]]);
    return;
  }
  let u=vtParam(d,first,last);
  let b=vtGenBez(d,first,last,u,t1,t2);
  let {max,split}=vtMaxErr(d,first,last,b,u);
  if(max<errSq){ out.push(b); return; }
  // Cerca de la tolerancia no se parte: se reparametriza. Partir de más multiplica los
  // nodos sin mejorar el trazo, y son nodos que después alguien tiene que editar.
  if(max<errSq*4){
    for(let i=0;i<4;i++){
      const up=vtReparam(d,first,last,u,b);
      const nb=vtGenBez(d,first,last,up,t1,t2);
      const r=vtMaxErr(d,first,last,nb,up);
      u=up; b=nb; max=r.max; split=r.split;
      if(max<errSq){ out.push(b); return; }
    }
  }
  if(split<=first||split>=last) split=first+((last-first)>>1);
  const c=vtNorm({x:d[split-1].x-d[split+1].x,y:d[split-1].y-d[split+1].y});
  vtFitCubic(d,first,split,t1,c,errSq,out,depth+1);
  vtFitCubic(d,split,last,{x:-c.x,y:-c.y},t2,errSq,out,depth+1);
}
/* Un lazo se corta en las esquinas y cada tramo se ajusta por separado, así la esquina
   queda viva y no redondeada. Sin esquinas —una gota, un círculo— se ajusta entero
   partiéndolo a la mitad, con la misma tangente a los dos lados de la costura para que
   no se note por dónde empezó. */
function vtAjustarLazo(P,tol,errSq,angMin){
  const n=P.length;
  const win=Math.max(2.2,tol*3.2);
  const esq=vtEsquinas(P,win,angMin);
  // Una sola esquina (una gota, una hoja) necesita un segundo corte para poder ajustar
  // dos tramos abiertos; se toma el punto opuesto del recorrido, que al ser liso deja
  // las dos tangentes casi iguales y el empalme no se nota.
  if(esq.length===1) esq.push((esq[0]+(P.length>>1))%P.length);
  const out=[];
  const tramo=(pts,cerrado)=>{
    if(pts.length<2) return;
    let s=vtRDP(pts,tol);
    if(s.length<2) return;
    if(s.length===2){
      const t=vtNorm({x:s[1].x-s[0].x,y:s[1].y-s[0].y});
      vtFitCubic(s,0,1,t,{x:-t.x,y:-t.y},errSq,out,0);
      return;
    }
    const t1=cerrado?cerrado.t1:vtTangente(s,0,1);
    const t2=cerrado?cerrado.t2:vtTangente(s,s.length-1,-1);
    vtFitCubic(s,0,s.length-1,t1,t2,errSq,out,0);
  };
  if(esq.length>=2){
    for(let k=0;k<esq.length;k++){
      const a=esq[k],b=esq[(k+1)%esq.length];
      const pts=[];
      let i=a;
      for(;;){ pts.push(P[i]); if(i===b)break; i=(i+1)%n; if(pts.length>n)break; }
      tramo(pts,null);
    }
  }else{
    // Tangente centrada en la costura, repetida al cerrar: continuidad C1 en el empalme
    const t=vtNorm({x:P[1].x-P[n-1].x,y:P[1].y-P[n-1].y});
    const mid=n>>1;
    const a=[]; for(let i=0;i<=mid;i++) a.push(P[i]);
    const b=[]; for(let i=mid;i<=n;i++) b.push(P[i%n]);
    const tm=vtNorm({x:P[(mid+1)%n].x-P[mid-1].x,y:P[(mid+1)%n].y-P[mid-1].y});
    tramo(a,{t1:t,t2:{x:-tm.x,y:-tm.y}});
    tramo(b,{t1:tm,t2:{x:-t.x,y:-t.y}});
  }
  return out;
}

/* ===================== Orquestación ===================== */
function vtProg(pct,txt){
  $('vt-prog-bar').style.width=Math.max(0,Math.min(100,pct))+'%';
  if(txt)$('vt-prog-txt').textContent=txt;
}
const vtRespirar=()=>new Promise(r=>setTimeout(r,0));
async function vtVectorizar(){
  if(!VT.img||VT.corriendo) return;
  VT.corriendo=true;
  $('vt-go').disabled=true;
  $('vt-prog').classList.add('on');
  vtProg(4,'Preparando la imagen…');
  await vtRespirar();
  try{
    vtPrepararTrabajo();
    vtProg(16,'Separando colores…');
    await vtRespirar();
    vtCuantizar();
    vtProg(32,'Quitando motas…');
    await vtRespirar();
    // El umbral va en píxeles de la imagen de trabajo, que puede venir reducida: si no
    // se ajusta, "4 px" limpiaría muchísimo más en una foto grande que en una chica.
    const kA=(VT.wW*VT.wH)/(VT.imgW*VT.imgH);
    const minPx=Math.max(0,Math.round(VT.opts.despeckle*Math.max(.12,kA)));
    // Dos vueltas: cada mota se disuelve en su vecino dominante, pero ese vecino puede ser
    // otra mota igual de chica. La segunda vuelta recoge lo que quedó encadenado.
    vtDespeckle(minPx); vtDespeckle(minPx);
    const tol=VT_TOL[VT.opts.detalle], errSq=Math.pow(VT_FITERR[VT.opts.detalle],2), ang=VT_ANG[VT.opts.esquinas];
    const minArea=Math.max(1.5,minPx);
    /* Dos fases a propósito. Seguir contornos es barato —décimas de segundo— y ajustar
       curvas es lo caro, así que entre una cosa y la otra se pone un tope: si la imagen
       venía tan sucia que salieron decenas de miles de lazos, se suben el piso de área y
       se ajustan solo los más grandes. Sin esto una foto con grano se lleva minutos y
       escupe un SVG de megabytes que ningún software de corte abre. */
    const crudo=[];
    for(let i=0;i<VT.pal.length;i++){
      vtProg(38+30*(i/VT.pal.length),'Trazando color '+(i+1)+' de '+VT.pal.length+'…');
      await vtRespirar();
      const loops=vtTrazarCapa(i,minArea);
      if(loops.length) crudo.push({idx:i,loops});
    }
    /* Un fondo con degradado —la pared de una foto tomada a contraluz— no se puede
       aplanar en colores sin que salgan bandas, y cada banda es un trazo. No hay filtro
       de área que lo arregle porque las bandas son grandes; lo que sí se puede es no
       dejar que el archivo crezca sin fin. Al modo de corte, que es el que alimenta la
       cotización, esto no le llega nunca: una silueta en blanco y negro no pasa de unas
       decenas de trazos. */
    const TOPE=scIsMobile()?1200:2500;
    let total=0; for(const c of crudo) total+=c.loops.length;
    let piso=minArea, recortados=0;
    if(total>TOPE){
      const areas=[];
      for(const c of crudo) for(const l of c.loops) areas.push(Math.abs(l.area));
      areas.sort((a,b)=>b-a);
      piso=Math.max(minArea,areas[TOPE]+1e-9);
      recortados=total-TOPE;
    }
    const capas=[];
    for(let ci=0;ci<crudo.length;ci++){
      const c=crudo[ci];
      vtProg(68+26*(ci/crudo.length),'Ajustando curvas '+(ci+1)+' de '+crudo.length+'…');
      await vtRespirar();
      const fitted=[];
      let area=0;
      for(const L of c.loops){
        if(Math.abs(L.area)<piso) continue;
        const P=vtColineales(L.pts);
        if(!P) continue;
        const segs=vtAjustarLazo(P,tol,errSq,ang);
        if(!segs.length) continue;
        fitted.push({segs,area:L.area});
        area+=Math.abs(L.area);
      }
      if(fitted.length) capas.push({idx:c.idx,color:VT.pal[c.idx],loops:fitted,area});
    }
    // De mayor a menor superficie: el fondo se pinta primero y los detalles encima, que
    // es lo que evita que un trazo grande tape a uno chico al abrir el SVG.
    capas.sort((a,b)=>b.area-a.area);
    VT.layers=capas;
    vtProg(96,'Armando el SVG…');
    await vtRespirar();
    vtMetricas();
    vtArmarSVG();
    VT.hecho=true; VT.sucio=false;
    $('vt-go').innerHTML=ico('i-vector')+' Volver a vectorizar';
    vtBadge(VT.formas+(VT.formas===1?' forma':' formas')+' · '+VT.nodos+' nodos','ok');
    vtSetVista('cmp');
    vtRender();
    vtPintarResultado(); vtPintarEscala(); vtHabilitarSalidas();
    toast(recortados
      ? 'Vectorizado · '+VT.trazos+' trazos · se dejaron fuera '+recortados+' manchas sueltas de la imagen'
      : 'Vectorizado · '+VT.trazos+' trazos y '+VT.nodos+' nodos','ok',recortados?5200:3600);
  }catch(e){
    toast('No se pudo vectorizar: '+e.message,'err',4200);
  }finally{
    VT.corriendo=false;
    $('vt-go').disabled=false;
    $('vt-prog').classList.remove('on');
    vtProg(0);
  }
}
/* Lo que la cotización necesita saber del trazo. "Formas" cuenta solo los contornos
   exteriores de la tinta: el hueco de una "O" es un lazo de área negativa y no suma, así
   que en un logotipo con letras sueltas el número que sale ES el número de letras. */
function vtMetricas(){
  let formas=0,nodos=0,trazos=0,perim=0;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const L of VT.layers){
    if(!VT.keep[L.idx]) continue;
    for(const lp of L.loops){
      trazos++;
      if(lp.area>0) formas++;
      nodos+=lp.segs.length;
      for(const s of lp.segs){
        let px=s[0].x,py=s[0].y;
        for(let t=1;t<=12;t++){
          const p=vtBez(s,t/12);
          perim+=Math.hypot(p.x-px,p.y-py); px=p.x; py=p.y;
          if(p.x<x0)x0=p.x; if(p.y<y0)y0=p.y; if(p.x>x1)x1=p.x; if(p.y>y1)y1=p.y;
        }
        if(s[0].x<x0)x0=s[0].x; if(s[0].y<y0)y0=s[0].y;
        if(s[0].x>x1)x1=s[0].x; if(s[0].y>y1)y1=s[0].y;
      }
    }
  }
  VT.formas=formas; VT.nodos=nodos; VT.trazos=trazos; VT.perimPx=perim;
  VT.ink=(x1>=x0)?{x0,y0,x1,y1,w:x1-x0,h:y1-y0}:null;
}
const vtHex=c=>'#'+[c[0],c[1],c[2]].map(v=>Math.max(0,Math.min(255,v|0)).toString(16).padStart(2,'0')).join('');
function vtArmarSVG(){
  const k=VT.imgW/VT.wW, r=v=>{const n=Math.round(v*k*100)/100; return Object.is(n,-0)?0:n;};
  const paths=[];
  for(const L of VT.layers){
    if(!VT.keep[L.idx]) continue;
    let d='';
    for(const lp of L.loops){
      const s0=lp.segs[0];
      d+='M'+r(s0[0].x)+' '+r(s0[0].y);
      for(const s of lp.segs) d+='C'+r(s[1].x)+' '+r(s[1].y)+' '+r(s[2].x)+' '+r(s[2].y)+' '+r(s[3].x)+' '+r(s[3].y);
      d+='Z';
    }
    if(d) paths.push('  <path fill="'+vtHex(L.color)+'" fill-rule="evenodd" d="'+d+'"/>');
  }
  // Con medida real el SVG trae width/height en cm y el viewBox en píxeles: así abre
  // a tamaño en Illustrator, CorelDRAW o el software de corte sin reescalar a ojo.
  const dim=VT.cmPorPx>0
    ? ' width="'+(VT.imgW*VT.cmPorPx).toFixed(3)+'cm" height="'+(VT.imgH*VT.cmPorPx).toFixed(3)+'cm"'
    : ' width="'+VT.imgW+'" height="'+VT.imgH+'"';
  VT.svg='<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+VT.imgW+' '+VT.imgH+'"'+dim+'>\n'+
    '  <title>'+esc(VT.nombre||'Vector AL3D')+'</title>\n'+paths.join('\n')+'\n</svg>\n';
}

/* ---------- Dibujo ---------- */
/* El trazo se pinta con Path2D a partir de las mismas Bézier del SVG, no rasterizando el
   SVG: lo que se ve en pantalla, lo que se descarga como PNG y lo que se manda al
   escalador salen todos de la misma fuente, y ningún lienzo se contamina. */
function vtPintarVector(ctx,cw,ch){
  const k=cw/VT.wW;
  ctx.clearRect(0,0,cw,ch);
  for(const L of VT.layers){
    if(!VT.keep[L.idx]) continue;
    const p=new Path2D();
    for(const lp of L.loops){
      p.moveTo(lp.segs[0][0].x*k,lp.segs[0][0].y*k);
      for(const s of lp.segs) p.bezierCurveTo(s[1].x*k,s[1].y*k,s[2].x*k,s[2].y*k,s[3].x*k,s[3].y*k);
      p.closePath();
    }
    ctx.fillStyle=vtHex(L.color);
    ctx.fill(p,'evenodd');
  }
}
function vtRender(){
  if(!VT.img)return;
  const src=$('vt-cvs-src'), out=$('vt-cvs-out');
  const sc=src.getContext('2d');
  sc.clearRect(0,0,src.width,src.height);
  sc.imageSmoothingEnabled=true; sc.imageSmoothingQuality='high';
  sc.drawImage(VT.img,0,0,src.width,src.height);
  if(VT.hecho) vtPintarVector(out.getContext('2d'),out.width,out.height);
}

/* ---------- Panel de resultados ---------- */
function vtPintarResultado(){
  const hay=VT.hecho;
  $('vt-res-empty').style.display=hay?'none':'';
  $('vt-res').style.display=hay?'':'none';
  if(!hay)return;
  $('vt-st-formas').textContent=VT.formas;
  $('vt-st-nodos').textContent=VT.nodos;
  $('vt-st-trazos').textContent=VT.trazos;
  $('vt-st-colores').textContent=VT.keep.filter(Boolean).length;
  const cont=$('vt-swatches');
  cont.innerHTML=VT.layers.map((L,i)=>
    '<button class="vt-sw'+(VT.keep[L.idx]?'':' off')+'" style="background:'+vtHex(L.color)+'" '+
    'onclick="vtToggleColor('+L.idx+')" aria-pressed="'+(VT.keep[L.idx]?'true':'false')+'" '+
    'aria-label="Color '+(i+1)+' '+vtHex(L.color)+(L.idx===VT.fondoIdx?' (el fondo)':'')+
    (VT.keep[L.idx]?' — incluido, toca para quitarlo':' — quitado, toca para incluirlo')+'" '+
    'title="'+vtHex(L.color)+(L.idx===VT.fondoIdx?' — fondo':'')+'"></button>').join('');
  $('vt-sw-note').style.display=VT.layers.length>1?'':'none';
}
function vtToggleColor(idx){
  VT.keep[idx]=!VT.keep[idx];
  vtMetricas(); vtArmarSVG(); vtRender(); vtPintarResultado(); vtPintarEscala();
  vtBadge(VT.formas+(VT.formas===1?' forma':' formas')+' · '+VT.nodos+' nodos','ok');
}

/* ---------- Medida real ---------- */
/* Con un solo dato —el alto o el ancho de verdad— queda fijada la escala de todo:
   el SVG sale a tamaño, la altura de letra se calcula sola y el perímetro de corte
   deja de ser un número de píxeles para ser centímetros. */
function vtEscala(campo,val){
  const v=parseFloat(val);
  if(!VT.ink||!(v>0)){ if(!(v>0)){VT.cmPorPx=0; vtPintarEscala(); if(VT.hecho)vtArmarSVG();} return; }
  // La medida que se teclea es la del DISEÑO —la tinta—, no la de la foto completa:
  // es lo que una persona tiene a la mano ("el letrero mide 40 cm de alto").
  const k=VT.imgW/VT.wW;
  const inkW=VT.ink.w*k, inkH=VT.ink.h*k;
  if(campo==='alto'){
    if(inkH<=0)return;
    VT.cmPorPx=v/inkH;
    $('vt-ancho-cm').value=(inkW*VT.cmPorPx).toFixed(1);
  }else{
    if(inkW<=0)return;
    VT.cmPorPx=v/inkW;
    $('vt-alto-cm').value=(inkH*VT.cmPorPx).toFixed(1);
  }
  VT.altoCm=inkH*VT.cmPorPx; VT.anchoCm=inkW*VT.cmPorPx;
  vtArmarSVG(); vtPintarEscala();
}
function vtPintarEscala(){
  const hay=VT.hecho&&VT.cmPorPx>0&&VT.ink;
  $('vt-esc-res').style.display=hay?'':'none';
  $('vt-esc-usar-sc').style.display=(VT.hecho&&SC.nativePxPerCm>0&&vtMismaImagen())?'':'none';
  if(!hay){ vtHabilitarSalidas(); return; }
  const k=VT.imgW/VT.wW;
  VT.altoCm=VT.ink.h*k*VT.cmPorPx; VT.anchoCm=VT.ink.w*k*VT.cmPorPx;
  const perimCm=VT.perimPx*k*VT.cmPorPx;
  $('vt-st-alto').innerHTML=VT.altoCm.toFixed(1)+'<small>cm</small>';
  $('vt-st-perim').innerHTML=(perimCm>=100?(perimCm/100).toFixed(2):perimCm.toFixed(0))+'<small>'+(perimCm>=100?'m':'cm')+'</small>';
  $('vt-st-perim-note').textContent='Es el recorrido total de la cuchilla o el láser: '+
    VT.trazos+' trazos, '+VT.anchoCm.toFixed(1)+' cm de ancho por '+VT.altoCm.toFixed(1)+' cm de alto.';
  vtHabilitarSalidas();
}
/* ¿El escalador está midiendo esta misma imagen? Si sí, su calibración vale tal cual y
   no hay que volver a teclear una medida que ya se tomó. */
function vtMismaImagen(){
  return !!(SC.img&&VT.img&&SC.img.src===VT.img.src);
}
function vtPintarEscalaSc(){
  const ok=SC.nativePxPerCm>0&&vtMismaImagen();
  $('vt-esc-sc').style.display=ok?'':'none';
  if(ok) $('vt-esc-sc-txt').textContent='El escalador ya tiene esta misma imagen calibrada. Puedes traer esa escala en vez de teclear la medida.';
  $('vt-esc-usar-sc').style.display=(VT.hecho&&ok)?'':'none';
}
function vtUsarEscalaScaler(){
  if(!(SC.nativePxPerCm>0)||!vtMismaImagen()){ toast('El escalador no tiene calibrada esta imagen','err',3000); return; }
  if(!VT.ink){ toast('Vectoriza primero','err'); return; }
  VT.cmPorPx=1/SC.nativePxPerCm;
  const k=VT.imgW/VT.wW;
  $('vt-alto-cm').value=(VT.ink.h*k*VT.cmPorPx).toFixed(1);
  $('vt-ancho-cm').value=(VT.ink.w*k*VT.cmPorPx).toFixed(1);
  vtArmarSVG(); vtPintarEscala();
  toast('Escala traída del escalador','ok');
}

/* ---------- Salidas ---------- */
/* Por encima de esto, lo que el trazo tiene no son letras: es una foto vectorizada. Cotizar
   «312 letras» a $30 el centímetro sale en cientos de miles de pesos y nadie lo captura a
   mano por error, así que el número no se lleva a una partida sin que alguien lo mire. */
const VT_MAX_PIEZAS=60;
function vtHabilitarSalidas(){
  const hay=VT.hecho;
  ['vt-dl-svg','vt-dl-png','vt-copy-svg','vt-btn-scaler','vt-anidar'].forEach(id=>{const e=$(id); if(e)e.disabled=!hay;});
  const bp=$('vt-btn-partidas');
  if(bp){
    /* VT.ink es el recuadro de lo que quedó dibujado: apagando todos los colores el trazo se
       queda vacío pero VT.hecho seguía en true, así que el botón ofrecía crear una partida
       de 1 pieza con un alto que ya no correspondía a nada. */
    const conTrazo=hay&&!!VT.ink&&VT.formas>0;
    const demasiadas=VT.formas>VT_MAX_PIEZAS;
    bp.disabled=!(conTrazo&&VT.cmPorPx>0)||demasiadas||locked();
    bp.textContent=!hay?'→ Agregar como partida de letras 3D'
      :!conTrazo?'→ El trazo está vacío: enciende al menos un color'
      :demasiadas?'→ '+VT.formas+' formas: eso no son letras, revisa el modo'
      :VT.cmPorPx>0?'→ Agregar como partida · '+VT.altoCm.toFixed(0)+' cm × '+VT.formas+(VT.formas===1?' letra':' letras')
      :'→ Pon la medida real para poder agregarla';
  }
  vtAjustarToast();
  const nt=$('vt-acc-note');
  if(nt) nt.textContent=hay&&VT.cmPorPx<=0
    ? 'Falta la medida real: sin ella el SVG sale sin escala y la partida no sabría qué altura cobrar.'
    : 'El trazo limpio se manda al escalador para sacar de ahí cada medida, o entra directo como partida con su altura y su número de letras.';
}
/* Publica el alto real del pie de acciones para que el aviso emergente se pose encima
   y no sobre los botones. Se mide después de pintar, que es cuando el texto ya ocupa los
   renglones que va a ocupar. */
/* Alto real del pie del escalador, para que el aviso emergente se pose encima y no
   dentro. Igual que vtAjustarToast() en el vectorizador. */
function scAjustarToast(){
  const acc=document.querySelector('#scalermodal .sp-actions');
  if(!acc) return;
  requestAnimationFrame(()=>{
    const h=Math.round(acc.getBoundingClientRect().height);
    if(h>0) document.documentElement.style.setProperty('--sc-acc-h',h+'px');
  });
}
function vtAjustarToast(){
  const acc=document.querySelector('#vectormodal .sp-actions');
  if(!acc) return;
  requestAnimationFrame(()=>{
    const h=Math.round(acc.getBoundingClientRect().height);
    if(h>0) document.documentElement.style.setProperty('--vt-acc-h',h+'px');
  });
}
function vtNombreArchivo(ext){
  const base=(Q.cliente||Q.proy||VT.nombre||'vector').toString().trim()
    .replace(/\.[a-z0-9]+$/i,'').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g,'').replace(/\s+/g,'-').slice(0,40)||'vector';
  return 'al3d-'+base.toLowerCase()+'.'+ext;
}
function vtDescargarSVG(){
  if(!VT.svg)return;
  const b=new Blob([VT.svg],{type:'image/svg+xml'});
  const u=URL.createObjectURL(b), a=document.createElement('a');
  a.href=u; a.download=vtNombreArchivo('svg'); a.click();
  setTimeout(()=>URL.revokeObjectURL(u),4000);
  toast(VT.cmPorPx>0?'SVG descargado a escala real':'SVG descargado — sin medida real, hay que escalarlo al abrirlo','ok',3600);
}
function vtDescargarPNG(){
  if(!VT.hecho)return;
  const oc=document.createElement('canvas');
  oc.width=VT.imgW; oc.height=VT.imgH;
  vtPintarVector(oc.getContext('2d'),oc.width,oc.height);
  const a=document.createElement('a'); a.href=oc.toDataURL('image/png'); a.download=vtNombreArchivo('png'); a.click();
  toast('PNG descargado','ok');
}
function vtCopiarSVG(){
  if(!VT.svg)return;
  copiarTexto(VT.svg,'Código SVG copiado — pégalo en Illustrator, Inkscape o CorelDRAW');
}
/* Al anidador, con el trazo puesto. Se entrega por localStorage —una clave que el anidador
   lee al abrir y borra— y no por la URL, porque un SVG de una foto vectorizada pesa cientos
   de KB y una URL de ese tamaño el navegador la corta sin avisar. Va en otra pestaña: la
   cotización se queda en esta. Si no hubo espacio para dejarlo —el teléfono lleno, que aquí
   ya tiene su aviso—, se descarga el SVG y se dice qué hacer con él, en vez de abrir un
   anidador vacío que parezca que no recibió nada. */
function vtAnidar(){
  if(!VT.svg)return;
  const url='anidador-vectores/';
  let dejado=false;
  try{
    localStorage.setItem('al3d_anidar',JSON.stringify({svg:VT.svg,nombre:vtNombreArchivo('svg'),
      folio:(Q&&Q.folio)||'',cliente:(Q&&Q.cliente)||'',proyecto:(Q&&Q.proy)||'',ts:Date.now()}));
    dejado=true;
  }catch(_){ dejado=false; }
  if(dejado){
    /* Empotrado no se abre una pestaña: el trazo ya quedó en `al3d_anidar` —el canal que
       lleva funcionando entre las dos apps y que no se toca— y se le pide al padre que
       cambie a la mesa de corte, que la tiene ahí mismo. Suelto, sigue abriendo pestaña
       como siempre. */
    let empotrado=false;
    try{ if(parent!==window){ parent.postMessage({al3d:'anidar'},location.origin); empotrado=true; } }catch(_){}
    if(!empotrado) window.open(url,'_blank','noopener');
    toast(VT.cmPorPx>0?'El anidador abrió con el trazo a escala real':'El anidador abrió con el trazo — ahí te pide la medida real','ok',3600);
  }else{
    vtDescargarSVG();
    window.open(url,'_blank','noopener');
    toast('No hubo espacio para pasarle el trazo al anidador: se descargó el SVG, arrástralo ahí','err',5200);
  }
}
/* Al escalador con la escala ya puesta: se le pasa el trazo limpio y, si aquí ya se dio
   la medida real, se le arma la línea de referencia sobre el ancho del diseño para que
   entre calibrado. Medir sobre el vector es más exacto que sobre la foto: los bordes
   están donde de verdad se va a cortar, no donde el JPG los difuminó. */
function vtEnviarAEscalador(){
  if(!VT.hecho)return;
  if(!scPuedeCambiarImagen()) return;
  const oc=document.createElement('canvas');
  oc.width=VT.imgW; oc.height=VT.imgH;
  const ctx=oc.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,oc.width,oc.height);   // el escalador mide sobre fondo, no sobre transparencia
  vtPintarVector(ctx,oc.width,oc.height);
  const cmPorPx=VT.cmPorPx, ink=VT.ink, k=VT.imgW/VT.wW;
  const seguir=()=>{
    if(!(cmPorPx>0)||!ink) return;
    try{
      const cm=ink.w*k*cmPorPx;
      if(!(cm>0)) return;
      // Referencia horizontal a lo ancho del diseño, en coordenadas normalizadas del
      // lienzo lógico, que es como el escalador guarda la suya.
      const y=((ink.y0+ink.y1)/2*k)/VT.imgH;
      SC.refLine={nx1:(ink.x0*k)/VT.imgW,ny1:y,nx2:(ink.x1*k)/VT.imgW,ny2:y};
      $('sc-ref-cm-input').value=cm.toFixed(1);
      scConfirmCalib();
    }catch(_){ /* si algo no cuadra se queda sin calibrar, que es el estado normal */ }
  };
  oc.toBlob(b=>{
    const url=b?URL.createObjectURL(b):oc.toDataURL();
    // La entrada de historial se CEDE al escalador en vez de cerrarla y volver a abrirla:
    // history.back() es asíncrono y abrir el escalador enseguida se cruzaría con él, con
    // el resultado de que el "atrás" del teléfono cerraría el modal recién abierto.
    vtOcultar();
    if(VT.hist){ VT.hist=false; SC.hist=true; }
    abrirScaler();
    // El escalador tiene que estar visible ANTES de cargar: scFitCanvas mide el área en
    // pantalla y de ella sale la escala con la que se calibra enseguida.
    setTimeout(()=>scLoadImgSrc(url,'vector de '+(VT.nombre||'logo'),seguir),80);
  },'image/png');
}
/* Del trazo a la cotización. Son justo los dos datos que mueven el precio de unas letras
   3D —cuántas son y qué alto tienen— y hasta ahora se contaban a mano sobre la foto. */
function vtUsarComoPartidas(){
  if(locked()){ toast('La cotización está bloqueada','err'); return; }
  if(!exigirDatosDesdeModal(cerrarVector))return;
  if(!VT.hecho||!(VT.cmPorPx>0)){ toast('Pon la medida real del diseño para poder cotizarlo','err',3400); return; }
  /* Las mismas dos guardas que el botón, porque a esta función también se llega por teclado
     y porque el estado puede haber cambiado desde el último repintado. */
  if(!VT.ink||!VT.formas){ toast('El trazo no tiene ninguna forma — enciende al menos un color','err',4200); return; }
  if(VT.formas>VT_MAX_PIEZAS){ toast('El trazo tiene '+VT.formas+' formas: eso no son letras. Prueba el modo Corte o Logotipo antes de cotizarlo.','err',6000); return; }
  const alto=Math.max(1,Math.round(VT.altoCm));
  const n=Math.max(1,VT.formas);
  const it=addItem({enfocar:false});
  if(!it) return;
  /* Se llenan la altura y el número de piezas y NADA más. Material y complejidad los
     elige la persona, aunque el trazo dé pistas de los dos: son campos que mueven el
     precio —la complejidad son $5 o $10 por cm, que en cinco letras de 40 cm son mil o
     dos mil pesos— y ponerlos de oficio significaría meter dinero en una cotización a
     partir de una corazonada del programa. La altura y el conteo no son corazonada: se
     midieron contra una referencia real y se ven en pantalla. */
  it.tipo='letras'; it.altura=alto; it.n=n;
  it.desc='Vectorizado del logotipo — '+VT.anchoCm.toFixed(0)+' × '+alto+' cm, '+n+(n===1?' pieza':' piezas');
  renderItems();
  toast('Partida agregada · '+alto+' cm × '+n+(n===1?' letra':' letras')+
        ' — falta elegir material y complejidad','ok',6000,{label:'Ir al cotizador',fn:cerrarVector});
}
