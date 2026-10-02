/* ============================================================================
   Cotizador · vectorizador.js

   Vectorizador: cuantización, despeckle, contorneo, esquinas y curvas, orquestación, resultados y salidas (SVG, PNG, partidas, anidador).

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   doce archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   156 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
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
                      blanco y negro; para color, siembra por distancia estilo
                      k-means++ y unas vueltas de k-medias — ver vtSembrar).
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
  pendiente:false,                  // H9: se soltó un ajuste mientras corría el trazo anterior
  cifrasQuietas:true,               // H26 #1: la primera vez de cada imagen las cifras no ruedan
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
  vtCablearPiezas();
  // Una entrada de historial, igual que el escalador: en el celular el gesto para
  // regresar es el botón "atrás" del teléfono y sin esto se salía de la cotización.
  if(!VT.hist){ _sellarScrollDePantalla(); try{history.pushState({vt:1},'');VT.hist=true;}catch(_){} }
  vtPintarEscalaSc();
  vtAjustarToast();
  if(VT.img) setTimeout(()=>{vtFit();vtRender();vtAjustarToast();},60);
}
function vtOcultar(){ $('vectormodal').classList.remove('show'); }
function cerrarVector(){
  vtOcultar();
  if(VT.hist){ VT.hist=false; _atrasDesdeElCodigo(); }
}
window.addEventListener('popstate',()=>{
  if(!$('vectormodal').classList.contains('show'))return;
  /* Solo el atrás que es suyo, por lo mismo que el escalador: ver atrasEsDeLaCapa en nucleo.js. */
  if(!atrasEsDeLaCapa('vectormodal'))return;
  VT.hist=false;              // la entrada ya la consumió el "atrás" del navegador
  vtOcultar();
});

/* ---------- Entrada de imagen ---------- */
/* Cuál es la apertura de PDF vigente (H12). Se pide otro archivo mientras el anterior sigue
   bajando el lector o pintando su hoja —es lo que hace quien eligió el equivocado—, y los dos
   terminaban: el más lento pisaba al más nuevo con su imagen y su recuadro. Cada apertura anota
   su número al empezar y, al volver de cada espera, si ya no es el vigente calla y se va. Es el
   mismo mecanismo del escalador (_scPdfSeq), con su propio contador porque los dos modales
   abren archivos por separado. */
let _vtPdfSeq=0;
function vtCargarImagen(input){
  const f=input.files[0]; if(!f)return;
  if(f.type==='application/pdf'){ vtLoadPDF(f); input.value=''; return; }
  vtSoltarPdf();   // una imagen elegida ahora gana a un PDF que todavía se esté abriendo
  const r=new FileReader();
  r.onload=ev=>vtLoadImgSrc(ev.target.result,f.name);
  r.readAsDataURL(f);
  input.value='';
}
function vtOnDrop(e){
  e.preventDefault(); e.currentTarget.style.outline='';
  if(e.dataTransfer.files[0]) vtCargarImagen({files:e.dataTransfer.files,value:''});
}
/* Si lo analizado fue un PDF, se abre como PDF: por el <img> salía «puede estar dañada».
   Ver usarImagenAIEnScaler. */
function vtUsarImagenAI(){
  if(!(Q.aiFile&&Q.aiFile.url)) return;
  if(scEsPdfIA()){
    /* El mismo recuadro del lienzo que el PDF elegido a mano (H12): traer el archivo que analizó
       la IA es un paso más de la misma traza, y el error se queda ahí y no en un aviso que se va
       solo mientras el lienzo sigue invitando a cargar una imagen. */
    const t=vtOverlayPdf(true),mio=_vtPdfSeq;
    if(t)t.paso('traer','Trayendo el plano que analizó la IA','trabaja');
    fetch(Q.aiFile.url).then(r=>r.blob())
      .then(b=>{
        if(mio!==_vtPdfSeq)return;   // se pidió otro archivo mientras este venía
        if(t)t.hecho('traer');
        return vtLoadPDF(new File([b],Q.aiFile.name||'plano.pdf',{type:'application/pdf'}),t,mio);
      })
      .catch(()=>{ if(mio===_vtPdfSeq)vtOverlayPdfFalla(t,'traer','No se pudo traer el PDF analizado — ábrelo de nuevo con «Cargar imagen»'); });
    return;
  }
  vtSoltarPdf();
  vtLoadImgSrc(Q.aiFile.url,'imagen IA');
}
function vtUsarImagenScaler(){ if(SC.img){ vtSoltarPdf(); vtLoadImgSrc(SC.img.src,'imagen del escalador'); } }
/* ----- H12 · el PDF se abre DENTRO del lienzo, con su reloj y su error en su sitio -----
   Abrir un plano en PDF puede tardar: la primera vez se baja el lector de cdnjs y luego se
   renderiza una hoja que puede pesar. Todo eso se anunciaba con un aviso abajo de 8 s —«Cargando
   PDF…»— mientras el recuadro del lienzo seguía diciendo «Carga el logotipo del cliente». Los dos
   síntomas eran del mismo defecto: se veía como que el toque no había hecho nada, así que se
   volvía a tocar; y cuando fallaba, el motivo llegaba en OTRO aviso, lejos de donde se estaba
   mirando y sin decir qué hacer a continuación.

   Es el recuadro del escalador, sin copiarlo: las mismas clases `sp-overlay-*`, la misma traza
   (pieza 8, con reloj de décimas) y las mismas dos salidas. Con una imagen ya cargada hay además
   una forma de dejarla como estaba: el error no puede secuestrar un trazo a medias.
   La rejilla 3×3 que latía por fases, de la muestra, no se hizo: la traza ya dice en qué paso va
   y cuánto lleva, que es lo que la rejilla quería decir, y una segunda animación de espera sería
   una segunda implementación del mismo patrón. */
function vtOverlayPdf(ver){
  const ov=$('vt-overlay'),vacio=$('vt-overlay-vacio'),pdf=$('vt-overlay-pdf');
  if(!ov||!vacio||!pdf)return null;
  pdf.classList.remove('mal');
  if(!ver){
    pdf.hidden=true; vacio.hidden=false;
    $('vt-overlay-mal').hidden=true;
    if(VT.img)ov.classList.add('hide');
    return null;
  }
  _vtPdfSeq++;
  ov.classList.remove('hide');
  vacio.hidden=true; pdf.hidden=false;
  $('vt-overlay-mal').hidden=true;
  $('vt-overlay-seguir').hidden=!VT.img;
  const pasos=$('vt-overlay-pasos');
  const t=(window.Piezas&&Piezas.traza)?Piezas.traza(pasos,{reloj:'ds'}):null;
  /* La traza es la misma de siempre sobre el mismo nodo: sin vaciarla, el segundo PDF del día
     arrancaba con los pasos del primero ya marcados. Sin la pieza (no debería pasar: la carga
     cotizador.html) queda al menos una línea que diga qué está pasando. */
  if(t)t.limpiar(); else pasos.textContent='Abriendo el PDF…';
  return t;
}
/* Otra cosa gana a un PDF que todavía se abre: se anota para que calle y se detiene su reloj.
   Sin detenerlo, el intervalo de décimas de la traza seguía contando escondido hasta que
   alguien abriera otro PDF. */
function vtSoltarPdf(){
  _vtPdfSeq++;
  const pdf=$('vt-overlay-pdf');
  if(pdf&&!pdf.hidden&&window.Piezas&&Piezas.traza){ try{ Piezas.traza('vt-overlay-pasos',{reloj:'ds'}).limpiar(); }catch(_){} }
}
/* La salida cuando el PDF falló y ya había una imagen cargada: se vuelve a lo que había. */
function vtCerrarOverlayPdf(){ vtSoltarPdf(); vtOverlayPdf(false); }
/* El paso que falló lleva solo la ✕ y su nombre; el motivo, completo y con lo que hay que hacer,
   va debajo con las dos salidas. Escrito en las dos partes se leía dos veces seguidas. */
function vtOverlayPdfFalla(t,clave,motivo){
  if(t){ t.falla(clave,null); t.terminar({ok:false}); }   // terminar: que ningún paso se quede girando
  const caja=$('vt-overlay-mal'),p=$('vt-overlay-motivo');
  if(p)p.textContent=motivo;
  if(caja)caja.hidden=false;
  const pdf=$('vt-overlay-pdf'); if(pdf)pdf.classList.add('mal');
  $('vt-overlay-seguir').hidden=!VT.img;
  voz('No se pudo abrir el PDF. '+motivo,true);
}
async function vtLoadPDF(f,traza,mio){
  if(mio===undefined){ traza=vtOverlayPdf(true); mio=_vtPdfSeq; }
  const t=traza,vigente=()=>mio===_vtPdfSeq;
  try{
    if(!window.pdfjsLib){
      if(t)t.paso('lector','Bajando el lector de PDF','trabaja');
      /* s.onerror no trae mensaje, así que el catch de abajo imprimía «Error PDF: undefined»
         —el caso más común es simplemente estar sin señal, porque el lector se descarga la
         primera vez— y no había forma de saber qué había pasado ni qué hacer. */
      /* Con la misma huella que el escalador (PDFJS_SRI, escalador.js, que carga antes). */
      await new Promise((res,rej)=>{const s=document.createElement('script');s.integrity=PDFJS_SRI;s.crossOrigin='anonymous';s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=res;s.onerror=()=>rej(new Error('se necesita conexión para leer un PDF: el lector se descarga la primera vez. Exporta el plano como JPG o PNG y vuelve a intentar'));document.head.appendChild(s);});
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      if(!vigente())return;
      if(t)t.hecho('lector');
    }
    if(t)t.paso('hoja','Abriendo la primera hoja','trabaja');
    const ab=await f.arrayBuffer();
    if(!vigente())return;
    /* El documento se destruye al terminar de pintarlo, como en scLoadPDF: cada uno tiene
       su propio Web Worker y sin destroy() se quedaba vivo, uno más por PDF. */
    const oc=document.createElement('canvas');
    let pdf;
    try{
      pdf=await pdfjsLib.getDocument({data:ab,isEvalSupported:false}).promise;
      const page=await pdf.getPage(1);
      const base=page.getViewport({scale:1});
      // Menos resolución que en el escalador: aquí cada píxel se cuantiza y se recorre,
      // y de 2200 px en adelante solo se paga tiempo sin ganar trazo.
      const s=Math.max(1.5,Math.min(4,2200/base.width));
      const vp=page.getViewport({scale:s});
      oc.width=Math.round(vp.width); oc.height=Math.round(vp.height);
      const cx=oc.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,oc.width,oc.height);
      await page.render({canvasContext:cx,viewport:vp}).promise;
    }finally{ try{ pdf&&pdf.destroy(); }catch(_){} }
    const url=await new Promise(res=>{try{oc.toBlob(b=>res(b?URL.createObjectURL(b):oc.toDataURL()),'image/png');}catch(_){res(oc.toDataURL());}});
    if(!vigente())return;
    if(t)t.terminar({ok:true});
    /* vtLoadImgSrc esconde el recuadro en cuanto la imagen carga. Si la hoja se pintó pero el
       navegador no la decodifica, el motivo se queda en el recuadro, con sus salidas. */
    vtLoadImgSrc(url,f.name,m=>{ if(vigente())vtOverlayPdfFalla(t,'hoja',m); });
  }catch(e){
    if(!vigente())return;
    vtOverlayPdfFalla(t,window.pdfjsLib?'hoja':'lector',(e&&e.message)||'el archivo no se pudo leer');
  }
}
/* `alFallar(mensaje)`: quien abre la imagen decide dónde se dice que no se pudo. Sin él, el
   aviso de siempre; el PDF lo usa para dejar el motivo dentro del recuadro (H12). */
function vtLoadImgSrc(src,name,alFallar){
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{
    if(VT.objUrl&&VT.objUrl!==src&&VT.objUrl!==SC.objUrl){try{URL.revokeObjectURL(VT.objUrl);}catch(_){}}
    VT.objUrl=/^blob:/.test(src)?src:null;
    VT.img=img; VT.imgW=img.naturalWidth; VT.imgH=img.naturalHeight; VT.nombre=name||'logo';
    VT.hecho=false; VT.sucio=false; VT.layers=[]; VT.svg=''; VT.pal=[]; VT.labels=null;
    VT.cmPorPx=0; VT.altoCm=0; VT.anchoCm=0; VT.z=1; VT.split=.5;
    /* La tinta y las cuentas son de la imagen ANTERIOR: con ellas puestas, vtEscala calculaba el
       alto tecleado antes de vectorizar contra la otra imagen, y la partida salía de otra altura. */
    VT.ink=null; VT.formas=0; VT.nodos=0; VT.trazos=0; VT.perimPx=0;
    /* Y las cifras que ruedan también: las del trazo nuevo no tienen por qué rodar desde las del
       logotipo anterior —no es «el número cambió», es otra imagen—. Lo pendiente de la imagen
       anterior tampoco se rehace sobre esta. */
    VT.cifrasQuietas=true; VT.pendiente=false;
    $('vt-alto-cm').value=''; $('vt-ancho-cm').value='';
    vtOverlayPdf(false);
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
  img.onerror=()=>{ if(alFallar)alFallar(errImagen(name)); else toast(errImagen(name),'err',6400); };
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
  /* Los tres nacían con `disabled` en el marcado y nada los encendía jamás: quien quería ver solo
     el vector, o solo la imagen, no tenía cómo —el único camino era arrastrar el asa de la
     comparación—. Se encienden aquí, que corre al cargar una imagen y al terminar de trazar:
     «Original» en cuanto hay imagen; «Comparar» y «Vector» cuando hay trazo que enseñar. Y es lo
     que deja que la ficha que viaja (H26 #2) tenga entre qué botones viajar. */
  ['orig','cmp','vec'].forEach(x=>{
    const b=$('vt-view-'+x);
    b.classList.toggle('active',x===v);
    b.disabled=!(VT.img&&(x==='orig'||VT.hecho));
  });
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
/* El asa se coloca con el MODELO y no midiendo el escenario. vtZoomBy() cambia la escala con
   una transición de 120 ms y llama aquí en el mismo instante, cuando getBoundingClientRect()
   todavía devuelve la escala vieja: medido con el asa al 25 %, quedaba 107 px fuera del borde
   real del recorte después de un zoom y 150 px después de otro. El escenario escala desde su
   centro, y el centro no se mueve a mitad de la transición: de ahí y de VT.z sale el ancho final. */
function vtColocarSplit(){
  const h=$('vt-split'); if(!h||!h.classList.contains('on'))return;
  const st=$('vt-stage'), r=st.getBoundingClientRect(), ar=$('vt-canvas-area').getBoundingClientRect();
  const centro=r.left+r.width/2-ar.left, ancho=st.offsetWidth*VT.z;
  h.style.left=(centro-ancho/2+ancho*VT.split)+'px';
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

/* ---------- Las piezas compartidas ----------
   Todo lo que este archivo le suma al modal se engancha AQUÍ, la primera vez que se abre, con
   addEventListener y llamando a js/piezas.js: cotizador.html lleva contados sus manejadores en
   línea y cada `onclick` nuevo movería esa cuenta, que la documentación afirma. Al abrir y no al
   cargar porque el modal está escondido hasta entonces —sin caja, los deslizadores no pueden
   medir su pulgar ni acomodar sus marcas—; las piezas son idempotentes, así que abrirlo otra vez
   no duplica nada. Si js/piezas.js no hubiera cargado, el modal sigue siendo el de siempre. */
let _vtCableado=false;
function vtCablearPiezas(){
  if(_vtCableado) return;
  _vtCableado=true;
  /* H12 · las dos salidas del recuadro cuando el PDF falla. */
  const mal=$('vt-overlay-mal');
  if(mal) mal.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('[data-vt-accion]'); if(!b) return;
    if(b.dataset.vtAccion==='elegir') $('vt-img-input').click();
    else if(b.dataset.vtAccion==='dejar') vtCerrarOverlayPdf();
  });
  const P=window.Piezas;
  if(!P) return;
  /* H9 · marcas, pastilla pegada al pulgar y el trazo que se rehace al SOLTAR. Cada deslizador
     dice cómo se llama su valor: el mismo texto que ya salía en la etiqueta de arriba. El de
     Colores va de 2 a 24 y con una rayita por paso cabe a 360 px: la pieza no pinta los
     rótulos que no caben, y las rayitas sí. «Quitar motas» va de 0 a 40: una marca cada diez. */
  if(P.deslizadorConImanes){
    const alSoltar=()=>vtRetrazarAlSoltar();
    P.deslizadorConImanes('vt-colores',{marcas:true,pastilla:true,alSoltar});
    P.deslizadorConImanes('vt-detalle',{marcas:true,pastilla:true,etiqueta:v=>VT_DETALLE[v],alSoltar});
    P.deslizadorConImanes('vt-ruido',{marcas:[0,10,20,30,40],pastilla:true,etiqueta:v=>v?v+' px':'nada',alSoltar});
    P.deslizadorConImanes('vt-esq',{marcas:true,pastilla:true,etiqueta:v=>VT_ESQ[v],alSoltar});
  }
  /* H26 #2 · la ficha que viaja en los dos selectores de este modal: el modo de vectorizar y la
     vista. Antes el resaltado saltaba de un botón al otro sin que se viera de dónde a dónde. */
  if(P.fichaQueViaja){
    const modo=document.querySelector('#vectormodal .vt-modo');
    if(modo) P.fichaQueViaja(modo);
    const vista=$('vt-view-orig');
    if(vista&&vista.parentElement) P.fichaQueViaja(vista.parentElement);
  }
  /* H26 #3 · arrastrar sobre la etiqueta mueve los centímetros. */
  vtMedidaArrastrable('vt-alto-cm');
  vtMedidaArrastrable('vt-ancho-cm');
}
/* ----- H9 · soltar un ajuste vuelve a trazar ----- */
/* Antes, mover un ajuste solo decía «Ajustes cambiados» y había que ir a tocar «Volver a
   vectorizar» para ver el efecto: justo lo que alguien está probando con el cliente al lado. Al
   SOLTAR —el `change`, no el `input`: vectorizar a cada píxel del arrastre congela el dedo en un
   teléfono de gama media— se vuelve a trazar solo, pero únicamente si ya había trazo: sin él,
   «Vectorizar» sigue siendo del botón, que además se queda por si se prefiere a mano.
   Si todavía corre el trazo anterior, no se pierde el ajuste ni se empalman dos corridas: se anota
   que quedó uno pendiente y, al terminar, se rehace UNA vez con los valores de ese momento (tres
   ajustes seguidos son una sola corrida más, no tres). */
function vtRetrazarAlSoltar(){
  if(!VT.img||!VT.hecho) return;
  if(VT.corriendo){ VT.pendiente=true; return; }
  vtVectorizar();
}
/* ----- H26 #3 · arrastrar sobre la etiqueta mueve los centímetros -----
   Sin abrir el teclado, que en el teléfono tapa medio panel. Se mueve de centímetro en
   centímetro y no de décima en décima —el `step` del campo—: un letrero mide 40, 120 o 300, y a
   0.1 por cada 4 px ir de 40 a 120 eran ocho mil píxeles de dedo. Las décimas siguen
   tecleándose. Es la misma pieza y los mismos números que usa el escalador para la referencia.

   Con el campo VACÍO —que es como queda hasta que se teclea una medida— el gesto arrancaba en 0.1,
   el mínimo del campo. Se le da el punto de partida que el propio campo propone en su
   `placeholder` («Ej. 40»), pero SOLO si el dedo de verdad arrastra: un toque en la etiqueta es
   enfocar el campo, y dejarle escrito un «40» que nadie eligió sería que el teclado abriera sobre
   una cifra ajena. Si al soltar no hubo movimiento, se borra. */
function vtMedidaArrastrable(id){
  const P=window.Piezas, et=document.querySelector('label[for="'+id+'"]'), campo=$(id);
  if(!P||!P.arrastrarMedida||!et||!campo) return;
  P.arrastrarMedida(et,null,{paso:1,px:4});
  const semilla=((/\d+(?:\.\d+)?/.exec(campo.placeholder||'')||['40'])[0]);
  et.addEventListener('pointerdown',e=>{
    if(campo.value!==''||(e.button!=null&&e.button>0)) return;
    let hubo=false;
    const alInput=()=>{ hubo=true; };
    const fin=()=>{
      window.removeEventListener('pointerup',fin,true); window.removeEventListener('pointercancel',fin,true);
      campo.removeEventListener('input',alInput);
      if(!hubo&&campo.value===semilla) campo.value='';
    };
    campo.value=semilla;
    campo.addEventListener('input',alInput);
    window.addEventListener('pointerup',fin,true); window.addEventListener('pointercancel',fin,true);
  });
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
  $('vt-prog-bar').style.transform='scaleX('+Math.max(0,Math.min(100,pct))/100+')';
  if(txt)$('vt-prog-txt').textContent=txt;
}
const vtRespirar=()=>new Promise(r=>setTimeout(r,0));
async function vtVectorizar(){
  if(!VT.img||VT.corriendo) return;
  VT.corriendo=true;
  /* La primera vez de esta imagen no hay nada que mirar todavía, y el velo oscuro es lo que
     corresponde. Pero un re-trazo —sobre todo el que sale solo al soltar un ajuste (H9)— tiene el
     trazo anterior a la vista, y es justo lo que se está comparando con el ajuste nuevo: taparlo
     con un velo es esconder lo que se quería ver. Ahí la espera es una barra fina arriba del
     lienzo (`.fina`) que no cubre nada ni intercepta el dedo. */
  const primera=!VT.hecho;
  const prog=$('vt-prog');
  $('vt-go').disabled=true;
  prog.classList.toggle('fina',!primera);
  prog.classList.add('on');
  $('vt-canvas-area').setAttribute('aria-busy','true');
  if(!primera) vtBadge('Trazando de nuevo…','');
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
    /* La medida real se puede teclear ANTES de vectorizar —los dos campos están a la vista y
       encendidos desde que se carga la imagen—, pero vtEscala la necesita contra la tinta, y
       la tinta no existe hasta aquí: el alto de 40 cm se quedaba escrito en el campo y el SVG
       salía sin medida y sin partidas que agregar. Se aplica ahora, contra la tinta recién
       medida; si están los dos, manda el alto, que es el que da la altura de letra que se
       cotiza. Solo si todavía no hay escala: al VOLVER a vectorizar la escala ya está puesta
       y es de la imagen —cm por píxel—, no de la tinta, así que se conserva; rehacerla contra
       la tinta nueva correría un poco la que se trajo calibrada del escalador. */
    if(!(VT.cmPorPx>0)){
      const aR=parseFloat($('vt-alto-cm').value), wR=parseFloat($('vt-ancho-cm').value);
      if(aR>0) vtEscala('alto',aR); else if(wR>0) vtEscala('ancho',wR);
    }
    vtArmarSVG();
    VT.hecho=true; VT.sucio=false;
    $('vt-go').innerHTML=ico('i-vector')+' Volver a vectorizar';
    vtBadge(VT.formas+(VT.formas===1?' forma':' formas')+' · '+VT.nodos+' nodos','ok');
    /* El velo se quita ANTES del momento del trazo, no en el `finally`: lo que sigue necesita
       que se vea la imagen. El panel de resultados se pinta ya, para que las cifras estén a la
       vista mientras el trazo se dibuja. */
    prog.classList.remove('on'); vtProg(0);
    vtPintarResultado(); vtPintarEscala(); vtHabilitarSalidas();
    /* H10 · SOLO la primera vez de cada imagen: es el «esto es lo que corta la máquina». Con cada
       ajuste soltado sería una espera de casi un segundo antes de ver el resultado de lo que se
       está probando, y ahí lo que se quiere es el cambio, no el espectáculo. */
    const dibujo=primera?vtDibujarCorte():null;
    if(dibujo) await dibujo.fin;
    vtSetVista('cmp');
    vtRender();
    if(dibujo) dibujo.cerrar();
    toast(recortados
      ? 'Vectorizado · '+VT.trazos+' trazos · se dejaron fuera '+recortados+' manchas sueltas de la imagen'
      : 'Vectorizado · '+VT.trazos+' trazos y '+VT.nodos+' nodos','ok',recortados?5200:3600);
  }catch(e){
    /* El letrero «Trazando de nuevo…» no puede quedarse puesto: lo que se ve es el trazo anterior,
       que ya no corresponde a los ajustes. */
    if(VT.hecho) vtBadge('Ajustes cambiados','warn');
    toast('No se pudo vectorizar: '+e.message,'err',4200);
  }finally{
    VT.corriendo=false;
    $('vt-go').disabled=false;
    $('vt-prog').classList.remove('on');
    vtProg(0);
    $('vt-canvas-area').removeAttribute('aria-busy');
    /* Se soltó otro ajuste mientras corría este: se rehace UNA vez, con lo que hay ahora. */
    if(VT.pendiente){ VT.pendiente=false; vtRetrazarAlSoltar(); }
  }
}
/* ----- H10 · el trazo de corte se dibuja al terminar de vectorizar -----
   Hasta ahora se quitaba el velo y el vector aparecía de golpe en la comparación. Este momento
   de menos de un segundo hace ver lo que la máquina va a cortar: el contorno recorre cada forma
   sobre la imagen, luego se rellenan, y entonces se abre la comparación. Es un <svg> encima del
   escenario —dentro de #vt-stage, así que escala con el zoom— con los mismos caminos que el SVG
   que se entrega (vtLazoD): lo que se ve dibujarse es lo que se descarga.

   Un trazo por lazo, no por color. Un color es un solo camino con todos sus lazos, y el patrón de
   guiones se reinicia en cada subtrazo: dibujados juntos, todos los lazos avanzaban a la vez y los
   cortos terminaban en el primer instante mientras el largo seguía. Por lazo, cada uno se recorre
   completo y con un escalón corto respecto del anterior. Los rellenos sí van por color, con
   evenodd, porque el hueco de una «O» tiene que seguir vacío.

   Es un momento que disparó el usuario y se apaga solo. Se salta, sin dibujar nada:
     · con menos movimiento;
     · con más de VT_DIBUJO_NODOS nodos o VT_DIBUJO_LAZOS lazos: getTotalLength() y esa cantidad
       de animaciones cuestan en un teléfono de gama media, y una foto vectorizada no es el caso
       que se quiere enseñar;
     · con la pestaña escondida o el modal cerrado: nadie lo vería;
     · y un toque sobre el lienzo lo termina en el acto.
   El perímetro de corte que se enseña en «Medida real» sigue saliendo de vtMetricas(), que no
   necesita DOM y corre aunque nada se dibuje: el dibujo no es la fuente de ningún número. */
const VT_DIBUJO_NODOS=3000, VT_DIBUJO_LAZOS=150;
function vtDibujarCorte(){
  let svg=null;
  try{
    const P=window.Piezas;
    const quieto=(P&&P.sinMovimiento)?P.sinMovimiento():matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st=$('vt-stage'), area=$('vt-canvas-area');
    if(quieto||document.visibilityState==='hidden'||!$('vectormodal').classList.contains('show')) return null;
    if(!st||!area||st.style.display==='none'||typeof st.animate!=='function') return null;
    if(!(VT.nodos>0)||VT.nodos>VT_DIBUJO_NODOS||VT.trazos>VT_DIBUJO_LAZOS) return null;
    const NS='http://www.w3.org/2000/svg', r=vtRedondeo();
    const crea=(n,c)=>{ const e=document.createElementNS(NS,n); if(c) e.setAttribute('class',c); return e; };
    svg=crea('svg','vt-corte');
    svg.setAttribute('viewBox','0 0 '+VT.imgW+' '+VT.imgH);
    svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false');
    const gRel=crea('g'), gTra=crea('g'), trazos=[], rellenos=[];
    for(const L of VT.layers){
      if(!VT.keep[L.idx]) continue;
      let d='';
      for(const lp of L.loops){
        const ld=vtLazoD(lp,r); d+=ld;
        const t=crea('path','vt-corte-trazo'); t.setAttribute('d',ld); gTra.appendChild(t); trazos.push(t);
      }
      const f=crea('path','vt-corte-relleno'); f.setAttribute('d',d); f.setAttribute('fill',vtHex(L.color)); gRel.appendChild(f); rellenos.push(f);
    }
    if(!trazos.length){ return null; }
    svg.append(gRel,gTra);
    /* El grosor está en unidades de la imagen: ~2 px de pantalla, con el zoom que haya. */
    svg.style.setProperty('--vt-sw',(2*VT.imgW/Math.max(1,(VT.fitW||VT.imgW)*VT.z)).toFixed(3));
    st.appendChild(svg);
    const DUR=420, RELL=180, esc=trazos.length>1?Math.min(50,200/(trazos.length-1)):0;
    const anims=[];
    trazos.forEach((t,i)=>{
      const L=t.getTotalLength();
      t.style.strokeDasharray=L+' '+L;
      anims.push(t.animate([{strokeDashoffset:L+'px'},{strokeDashoffset:'0px'}],{duration:DUR,delay:i*esc,easing:'cubic-bezier(.45,.05,.3,1)',fill:'both'}));
    });
    const finTrazos=DUR+(trazos.length-1)*esc;
    rellenos.forEach(f=>anims.push(f.animate([{fillOpacity:0},{fillOpacity:1}],{duration:RELL,delay:finTrazos,fill:'both'})));
    const saltar=()=>anims.forEach(a=>{ try{ a.finish(); }catch(_){} });
    area.addEventListener('pointerdown',saltar,{once:true});
    /* El respaldo existe para que `await dibujo.fin` no pueda colgar la corrida si el navegador
       no entrega nunca el cuadro final de una animación. */
    const fin=new Promise(res=>{
      Promise.all(anims.map(a=>a.finished)).then(res,res);
      setTimeout(res,finTrazos+RELL+700);
    });
    let cerrado=false;
    const cerrar=()=>{
      area.removeEventListener('pointerdown',saltar);
      if(cerrado) return;
      cerrado=true;
      /* La comparación ya está abierta debajo: la mitad derecha es el mismo vector, así que el
         trazo se desvanece y lo que cambia a la vista es la izquierda, que vuelve a la imagen. */
      const quita=()=>svg.remove();
      try{ svg.animate([{opacity:1},{opacity:0}],{duration:160,easing:'ease-out',fill:'forwards'}).finished.then(quita,quita); }catch(_){ quita(); }
      setTimeout(quita,500);
    };
    return {fin,cerrar};
  }catch(_){
    if(svg&&svg.parentNode) svg.remove();
    return null;
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
/* El camino de un lazo, en coordenadas de la imagen y con dos decimales. Lo usan el SVG que se
   entrega (vtArmarSVG) y el trazo que se dibuja al terminar (vtDibujarCorte, H10): es el mismo
   dato, y que sean la misma función es lo que garantiza que lo que se ve dibujarse es lo que se
   descarga. */
function vtRedondeo(){
  const k=VT.imgW/VT.wW;
  return v=>{const n=Math.round(v*k*100)/100; return Object.is(n,-0)?0:n;};
}
function vtLazoD(lp,r){
  const s0=lp.segs[0];
  let d='M'+r(s0[0].x)+' '+r(s0[0].y);
  for(const s of lp.segs) d+='C'+r(s[1].x)+' '+r(s[1].y)+' '+r(s[2].x)+' '+r(s[2].y)+' '+r(s[3].x)+' '+r(s[3].y);
  return d+'Z';
}
function vtArmarSVG(){
  const r=vtRedondeo();
  const paths=[];
  for(const L of VT.layers){
    if(!VT.keep[L.idx]) continue;
    let d='';
    for(const lp of L.loops) d+=vtLazoD(lp,r);
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
  /* H26 #1 · las cuatro cifras ruedan al cambiar: quitar un color o re-trazar con otro detalle
     cambia cuántas formas, nodos y trazos quedan, y el número que salta no dice cuánto. La
     primera vez de cada imagen no rueda (no es «el número cambió», es otra imagen). */
  const quieta=VT.cifrasQuietas; VT.cifrasQuietas=false;
  vtCifra('formas',VT.formas,quieta);
  vtCifra('nodos',VT.nodos,quieta);
  vtCifra('trazos',VT.trazos,quieta);
  vtCifra('colores',VT.keep.filter(Boolean).length,quieta);
  vtPintarMuestras();
  $('vt-sw-note').style.display=VT.layers.length>1?'':'none';
}
function vtCifra(k,n,quieta){
  const el=$('vt-st-'+k), t=String(n), P=window.Piezas;
  if(!P||!P.rodarCifra){ if(el.textContent!==t) el.textContent=t; return; }
  P.rodarCifra(el,t,{clave:'vt-st-'+k,animar:!quieta});
}
/* ----- H22 · las muestras de color dicen su estado -----
   Eran cuadritos de 24 px que, quitados, se ponían al 25 % de opacidad con una raya: el estado
   se decía con la opacidad —lo que §4.3 prohíbe, y de noche un cuadro apagado no se distinguía de
   uno encendido sobre fondo oscuro— y cuál era el fondo solo se sabía por el `title`, que en el
   teléfono no existe. Ahora cada color es una ficha de 44 px con su muestra, su nombre («Color 2»
   o «Fondo») y un ✓ que se vuelve ✕ al quitarlo, con el nombre tachado: el estado lo dicen el
   icono y la palabra, y la muestra se queda del color de verdad.

   Las fichas se rehacen solo cuando cambian los colores del trazo; quitar o poner uno cambia el
   estado EN SU SITIO. Con innerHTML cada toque soltaba el foco —quien recorre con el teclado
   perdía su lugar— y el ✓ no tenía de dónde cambiar a ✕. Con muchos colores (el modo Foto llega
   a 24) los nombres se abrevian al número, para que no sean ocho renglones de fichas. */
function vtPintarMuestras(){
  const cont=$('vt-swatches');
  const firma=VT.layers.map(L=>L.idx+':'+vtHex(L.color)).join(',')+'|'+VT.fondoIdx;
  const nombre=(L,i)=>L.idx===VT.fondoIdx?'Fondo':(VT.layers.length>8?String(i+1):'Color '+(i+1));
  if(cont.dataset.firma!==firma){
    cont.dataset.firma=firma;
    cont.innerHTML=VT.layers.map((L,i)=>{
      const hex=vtHex(L.color);
      return '<button type="button" class="vt-sw" data-idx="'+L.idx+'" onclick="vtToggleColor('+L.idx+')" '+
        'title="'+hex+(L.idx===VT.fondoIdx?' — fondo':'')+'">'+
        '<span class="vt-sw-m" style="background:'+hex+'" aria-hidden="true"></span>'+
        '<span class="vt-sw-e" aria-hidden="true">'+ico('i-check','vt-sw-si')+ico('i-cerrar','vt-sw-no')+'</span>'+
        '<span class="vt-sw-n">'+nombre(L,i)+'</span></button>';
    }).join('');
  }
  cont.classList.toggle('denso',VT.layers.length>8);
  VT.layers.forEach((L,i)=>{
    const b=cont.querySelector('[data-idx="'+L.idx+'"]');
    if(!b) return;
    const on=!!VT.keep[L.idx];
    b.classList.toggle('off',!on);
    b.setAttribute('aria-pressed',on?'true':'false');
    b.setAttribute('aria-label','Color '+(i+1)+' '+vtHex(L.color)+(L.idx===VT.fondoIdx?' (el fondo)':'')+
      (on?' — incluido, toca para quitarlo':' — quitado, toca para incluirlo'));
  });
}
function vtToggleColor(idx){
  VT.keep[idx]=!VT.keep[idx];
  vtMetricas(); vtArmarSVG(); vtRender(); vtPintarResultado(); vtPintarEscala();
  vtBadge(VT.formas+(VT.formas===1?' forma':' formas')+' · '+VT.nodos+' nodos','ok');
  const i=VT.layers.findIndex(L=>L.idx===idx);
  if(i>=0) voz((VT.layers[i].idx===VT.fondoIdx?'Fondo':'Color '+(i+1))+(VT.keep[idx]?' incluido en el trazo':' quitado del trazo'));
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
      :VT.cmPorPx>0?'→ Agregar como partida · '+vtAltoPartida().toFixed(1)+' cm × '+VT.formas+(VT.formas===1?' letra':' letras')
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
/* ----- El alto que se le entrega a la partida -----
   A MEDIO CENTÍMETRO, que es la precisión que declara el campo de altura (step="0.5"), la
   que enseña este mismo panel (`toFixed(1)`) y la que el escalador ya redondea con su
   razón escrita al lado. Aquí se redondeaba a CENTÍMETRO ENTERO, y es el mismo dinero que
   el escalador nombra: el alto de letras multiplica el precio —factor × altura × piezas—,
   así que medio centímetro por letra en acero inoxidable ($55/cm) son casi $28 por letra.
   Un trazo que el panel anunciaba como «40.4 cm» entraba a la cotización como 40.

   Y la usan los DOS sitios —el rótulo del botón y la partida— para que el botón prometa
   exactamente la medida que va a crear. */
function vtAltoPartida(){ return Math.max(0.5,Math.round((VT.altoCm||0)*2)/2); }
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
async function vtEnviarAEscalador(){
  if(!VT.hecho)return;
  if(!await scPuedeCambiarImagen()) return;
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
  const alto=vtAltoPartida();
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
  /* Un trazo de menos de 10 cm no son letras 3D: el taller lo corta plano en acrílico. La
     medida salió del propio vector, calibrada, así que aquí la regla no supone nada — solo
     nombra bien lo que se acaba de medir. Ver ALTURA_MIN_LETRAS en catalogo.js. */
  const recorte=forzarRecortePorAltura(it);
  it.desc='Vectorizado del logotipo — '+VT.anchoCm.toFixed(1)+' × '+alto+' cm, '+n+(n===1?' pieza':' piezas');
  renderItems();
  toast(recorte
        ? 'Recorte de acrílico agregado · '+alto+' cm × '+n+(n===1?' pieza':' piezas')+
          ' — por debajo de '+ALTURA_MIN_LETRAS+' cm no se fabrica en 3D. Falta elegir el acabado.'
        : 'Partida agregada · '+alto+' cm × '+n+(n===1?' letra':' letras')+
          ' — falta elegir material y complejidad',
        'ok',6000,{label:'Ir al cotizador',fn:cerrarVector});
}
