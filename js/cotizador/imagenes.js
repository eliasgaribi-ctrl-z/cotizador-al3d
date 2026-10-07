/* ============================================================================
   Cotizador · imagenes.js
   Las imágenes que van en el PDF, como en las cotizaciones de Canva:
     · el PLANO de cada partida —la foto del escalador con sus cotas, o un plano ya acotado—,
     · hasta dos RENDERS que van debajo del plano, lado a lado,
     · y la hoja de PROPUESTA VISUAL, hasta seis renders sin precios.

   Por qué IndexedDB y no localStorage: una cotización de Canva lleva de tres a siete
   imágenes, y el localStorage del cotizador ya vive al borde —saveHistorial() suelta
   imágenes viejas cuando no cabe—. Aquí cada imagen se guarda UNA vez con un id, y Q y el
   historial solo cargan ese id (it.plano, Q.renders, Q.propuesta). Una cotización duplicada
   comparte las mismas imágenes: no se copian, se apuntan.

   generarPDF() es síncrono —abre la hoja en el mismo toque, que es lo que los navegadores
   del teléfono dejan pasar—, así que lee de una caché en memoria. imgPrecargar() la llena
   al arrancar y al abrir una cotización del historial.
   ============================================================================ */
const IMG_DB='al3d_cot_imgs', IMG_ALM='img';
const IMG_MAX_LADO=1800;          // más que esto no se nota en carta y pesa el triple
const IMG_MAX_RENDERS=2, IMG_MAX_PROPUESTA=6;
const _imgCache=new Map();        // id -> dataURL
const _imgDim=new Map();          // id -> {w,h}, para saber si un plano es alto y angosto
let _imgDb=null;

function _imgAbrir(){
  if(_imgDb) return _imgDb;
  _imgDb=new Promise((res,rej)=>{
    try{
      const p=indexedDB.open(IMG_DB,1);
      p.onupgradeneeded=()=>{ if(!p.result.objectStoreNames.contains(IMG_ALM)) p.result.createObjectStore(IMG_ALM,{keyPath:'id'}); };
      p.onsuccess=()=>res(p.result);
      p.onerror=()=>rej(p.error);
    }catch(e){ rej(e); }
  });
  _imgDb.catch(()=>{ _imgDb=null; });
  return _imgDb;
}
function _imgTx(modo,fn){
  return _imgAbrir().then(db=>new Promise((res,rej)=>{
    const tx=db.transaction(IMG_ALM,modo), st=tx.objectStore(IMG_ALM);
    let out; try{ out=fn(st); }catch(e){ rej(e); return; }
    tx.oncomplete=()=>res(out&&'result' in out?out.result:out);
    tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error);
  }));
}
/* Guarda una data URL y devuelve su id. */
async function imgGuardar(url,w,h){
  const id='img-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  await _imgTx('readwrite',st=>st.put({id,url,w:w||0,h:h||0,ts:Date.now()}));
  _imgCache.set(id,url); if(w&&h) _imgDim.set(id,{w,h});
  return id;
}
/* ¿Alto y angosto? Como el letrero vertical de Trevare o el neón de Playtime: ahí los renders
   van a un lado del plano y no debajo, o el plano queda chiquito en medio de una banda ancha. */
function imgEsAlta(id){ const d=_imgDim.get(id); return !!(d&&d.h>d.w*1.15); }
/* La imagen ya cargada, o '' si todavía no está en memoria. */
function imgUrl(id){ return (id&&_imgCache.get(id))||''; }
/* Trae a memoria las que falten. Nunca lanza: una imagen que no se pudo leer se queda fuera. */
async function imgPrecargar(ids){
  const faltan=[...new Set((ids||[]).filter(id=>id&&!_imgCache.has(id)))];
  if(!faltan.length) return;
  try{
    await _imgTx('readonly',st=>{ faltan.forEach(id=>{ const r=st.get(id); r.onsuccess=()=>{ if(r.result){ _imgCache.set(id,r.result.url); if(r.result.w&&r.result.h) _imgDim.set(id,{w:r.result.w,h:r.result.h}); } }; }); });
  }catch(_){}
}
/* Todos los ids que usa la cotización en pantalla. */
const _imgLista=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x):[];
function imgIdsDeQ(q){
  q=q||Q;
  return [].concat((Array.isArray(q.items)?q.items:[]).map(it=>it&&typeof it.plano==='string'?it.plano:'').filter(Boolean), _imgLista(q.renders), _imgLista(q.propuesta));
}
/* Limpieza: lo que no apunta ni la cotización en pantalla ni el historial, y tiene más de una
   semana, se borra. La semana es para no tirar una imagen de un borrador que se está armando
   ni la de una cotización que se vació y todavía se puede deshacer. */
async function imgLimpiar(){
  try{
    const vivos=new Set(imgIdsDeQ(Q));
    (getHistorial()||[]).forEach(e=>imgIdsDeQ(e).forEach(id=>vivos.add(id)));
    const viejo=Date.now()-7*864e5;
    const todos=await _imgTx('readonly',st=>st.getAll());
    const tirar=(todos||[]).filter(r=>!vivos.has(r.id)&&(r.ts||0)<viejo).map(r=>r.id);
    if(tirar.length) await _imgTx('readwrite',st=>{ tirar.forEach(id=>st.delete(id)); });
  }catch(_){}
}

/* Un archivo elegido -> data URL JPEG, con fondo blanco (un PNG con fondo transparente salía
   negro en JPEG) y con techo de lado. */
function _imgDeArchivo(f){
  return new Promise((res,rej)=>{
    if(!f||!/^image\//.test(f.type||'')){ rej(new Error('No es una imagen')); return; }
    const u=URL.createObjectURL(f), im=new Image();
    im.onload=()=>{
      try{
        const w=im.naturalWidth, h=im.naturalHeight, k=Math.min(1,IMG_MAX_LADO/Math.max(w,h));
        const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
        const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height);
        x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
        x.drawImage(im,0,0,c.width,c.height);
        res({url:c.toDataURL('image/jpeg',0.86),w:c.width,h:c.height});
      }catch(e){ rej(e); } finally{ URL.revokeObjectURL(u); }
    };
    im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('No se pudo leer la imagen')); };
    im.src=u;
  });
}
function _imgElegir(multiple){
  return new Promise(res=>{
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=!!multiple;
    inp.onchange=()=>res([...(inp.files||[])]);
    inp.click();
  });
}
/* Lo que cambia cuando se toca una imagen: se guarda, se repinta y, si ya está autorizada, el
   historial también, para que al reimprimir salgan las mismas. Las imágenes no tocan el precio
   —no están en la huella—, así que no piden candado. */
function _imgCambio(){
  saveState();
  try{ renderItems(); }catch(_){ renderImgsPdf(); }
  if(Q.estado==='autorizada') try{ guardarEnHistorial(); }catch(_){}
}

/* ----- El plano de una partida ----- */
async function planoDelEscalador(id){
  const it=Q.items.find(x=>x.id===id); if(!it) return;
  const u=typeof scPlanoCotado==='function'?scPlanoCotado():'';
  if(!u){ toast('Primero mide en el escalador: el plano sale de la foto con sus cotas','err',4200); return; }
  try{ it.plano=await imgGuardar(u,SC.imgW,SC.imgH); _imgCambio(); toast('Plano con cotas puesto en la partida '+(Q.items.indexOf(it)+1),'ok'); }
  catch(_){ toast('No se pudo guardar la imagen en este dispositivo','err'); }
}
async function planoSubir(id){
  const it=Q.items.find(x=>x.id===id); if(!it) return;
  const [f]=await _imgElegir(false); if(!f) return;
  try{ const r=await _imgDeArchivo(f); it.plano=await imgGuardar(r.url,r.w,r.h); _imgCambio(); toast('Plano puesto en la partida '+(Q.items.indexOf(it)+1),'ok'); }
  catch(e){ toast(e&&e.message||'No se pudo usar esa imagen','err'); }
}
function planoQuitar(id){
  const it=Q.items.find(x=>x.id===id); if(!it||!it.plano) return;
  delete it.plano; _imgCambio(); toast('Plano quitado de la partida','');
}
function planoPartidaHTML(it){
  const u=imgUrl(it.plano);
  const hayEsc=typeof SC!=='undefined'&&SC.img&&SC.items&&SC.items.length;
  return `<div class="plano-p">
    <span class="plano-t">${ico('i-imagen')} Plano en el PDF</span>
    ${u?`<img class="plano-mini" src="${urlImagenSegura(u)}" alt="Plano de la partida">`:`<span class="plano-nota">${!it.plano?'Sin plano':_imgNoHay.has(it.plano)?'No está en este dispositivo':'Cargando…'}</span>`}
    <span class="plano-acc">
      <button type="button" class="plano-b" onclick="planoDelEscalador(${it.id})" ${hayEsc?'':'aria-disabled="true"'} title="${hayEsc?'Usar la foto del escalador con sus cotas':'Mide en el escalador para usar su foto con cotas'}">${ico('i-escalar')} Del escalador</button>
      <button type="button" class="plano-b" onclick="planoSubir(${it.id})" title="Subir un plano ya acotado">Subir</button>
      ${it.plano?`<button type="button" class="plano-b quitar" onclick="planoQuitar(${it.id})" aria-label="Quitar el plano">×</button>`:''}
    </span>
  </div>`;
}

/* ----- Renders y propuesta visual ----- */
async function imgAgregar(lista){
  const max=lista==='renders'?IMG_MAX_RENDERS:IMG_MAX_PROPUESTA;
  const arr=Q[lista]=_imgLista(Q[lista]);
  if(arr.length>=max){ toast('Caben '+max+(lista==='renders'?' renders debajo del plano':' imágenes en la propuesta visual'),'err'); return; }
  const fs=(await _imgElegir(true)).slice(0,max-arr.length); if(!fs.length) return;
  let malas=0;
  for(const f of fs){ try{ const r=await _imgDeArchivo(f); arr.push(await imgGuardar(r.url,r.w,r.h)); }catch(_){ malas++; } }
  _imgCambio();
  if(malas) toast(malas+(malas===1?' imagen no se pudo usar':' imágenes no se pudieron usar'),'err');
}
function imgQuitar(lista,i){
  if(!Array.isArray(Q[lista])) return;
  Q[lista].splice(i,1); _imgCambio();
}
function renderImgsPdf(){
  const el=$('imgsPdf'); if(!el) return;
  if(!Q.items.length){ el.innerHTML=''; return; }
  const fila=(lista,max,titulo,ayuda)=>{
    const arr=Q[lista]=_imgLista(Q[lista]);
    return `<div class="imgs-sec">
      <div class="imgs-h"><span class="imgs-t">${titulo}</span><span class="imgs-n">${arr.length}/${max}</span></div>
      <p class="imgs-ayuda">${ayuda}</p>
      <div class="imgs-g">${arr.map((id,i)=>{ const u=imgUrl(id); return `<div class="imgs-c">${u?`<img src="${urlImagenSegura(u)}" alt="">`:'<span class="plano-nota">Cargando…</span>'}<button type="button" class="imgs-x" onclick="imgQuitar('${lista}',${i})" aria-label="Quitar imagen">×</button></div>`; }).join('')}
        ${arr.length<max?`<button type="button" class="imgs-add" onclick="imgAgregar('${lista}')">+ Agregar</button>`:''}
      </div>
    </div>`;
  };
  el.innerHTML=`<div class="imgs-pdf">
    <div class="imgs-cab">${ico('i-imagen')} Imágenes del PDF</div>
    ${fila('renders',IMG_MAX_RENDERS,'Renders debajo del plano','Van lado a lado debajo del plano, en la hoja de la cotización.')}
    ${fila('propuesta',IMG_MAX_PROPUESTA,'Hoja de propuesta visual','Una hoja aparte, solo con imágenes y sin precios.')}
  </div>`;
}
/* Antes de armar el PDF: ¿falta traer a memoria alguna imagen? Si falta, la trae y vuelve a
   llamar a `luego`. Devuelve true si hubo que esperar. */
function imgFaltanParaPdf(luego){
  const faltan=imgIdsDeQ(Q).filter(id=>!_imgCache.has(id)&&!_imgNoHay.has(id));
  if(!faltan.length) return false;
  toast('Cargando las imágenes del PDF…','',1600);
  imgPrecargar(faltan).then(()=>{ faltan.forEach(id=>{ if(!_imgCache.has(id)) _imgNoHay.add(id); }); luego(); });
  return true;
}
/* La llama renderItems() al final: pinta el panel y, si la cotización apunta a imágenes que
   todavía no están en memoria —al arrancar, al abrir una del historial, al deshacer—, las trae y
   repinta una vez. Las que no existen en este dispositivo (llegaron en un respaldo sin ellas) se
   recuerdan para no pedirlas en cada repintado. */
const _imgNoHay=new Set(); let _imgPidiendo=false;
function imgAsegurar(){
  renderImgsPdf();
  const faltan=imgIdsDeQ(Q).filter(id=>!_imgCache.has(id)&&!_imgNoHay.has(id));
  if(!faltan.length||_imgPidiendo) return;
  _imgPidiendo=true;
  imgPrecargar(faltan).then(()=>{
    faltan.forEach(id=>{ if(!_imgCache.has(id)) _imgNoHay.add(id); });
    _imgPidiendo=false;
    try{ renderItems(); }catch(_){}
  });
}
