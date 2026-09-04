/* ============================================================================
   Cotizador · historial.js

   Lo que se guarda: historial de autorizadas, cuadernos de cliente, respaldo y restauración, cola de autorización, persistencia, deshacer/rehacer, plazo de taller y folio.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Historial de cotizaciones autorizadas ===================== */
function getHistorial(){ try{return JSON.parse(localStorage.getItem('al3d_historial')||'[]');}catch(_){return [];} }
function saveHistorial(arr){
  /* El historial es la única fuente de los cuadernos: si cambia, lo que hay en memoria
     dejó de valer. Va aquí arriba y no en el camino del éxito porque incluso cuando la
     escritura falla se puede haber soltado una imagen y reordenado la copia. */
  invalidarCuadernos();
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
function guardarEnHistorial(){
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
    ts:Date.now()
  };
  if(idx>=0) arr[idx]=entry; else arr.unshift(entry);
  const ok=saveHistorial(arr);
  /* El historial es de donde salen las sugerencias de cliente: al crecer, crecen. */
  pintarClientes();
  return ok;
}

let _histData=[];
function openHistImg(folio){
  const e=_histData.find(x=>x.folio===folio);
  if(!e||!e.aiFile||!e.aiFile.url) return;
  $('lightboxBody').innerHTML=`<img class="lightbox-img" src="${urlImagenSegura(e.aiFile.url)}" alt="${esc(e.aiFile.name||'')}" onclick="event.stopPropagation()">`;
  $('lightbox').classList.add('show');
}
function borrarDeHistorial(folio){
  if(!confirm('¿Eliminar '+folio+' del historial?\n\nEsta acción no se puede deshacer.')) return;
  saveHistorial(getHistorial().filter(x=>x.folio!==folio));
  _histData=getHistorial(); indexarHistorial();
  pintarClientes();
  pintarHistorial(); // se conserva lo que el usuario tenía escrito en el buscador
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
  _histData.forEach(e=>{
    e._busca=[e.folio,e.proy,e.cliente,e.tel,e.dirRaw,e.autorizador,e.fechaAuth,
      money(totalFinalHist(e)),(e.items||[]).map(histDsc).join(' '),
      HITOS.filter(x=>hitosDe(e.folio)[x.k]).map(x=>x.hecho).join(' ')]
      .map(v=>String(v||'')).join(' ').toLowerCase();
  });
}
function abrirHistorial(){
  _histData=getHistorial();
  indexarHistorial();
  const s=$('hist-search'); if(s) s.value='';
  pintarPieHistorial();
  pintarHistorial();
  $('histmodal').classList.add('show');
}
/* Lista del historial, filtrada por el buscador. Con decenas de folios encontrar
   uno a mano era imposible. */
function pintarHistorial(){
  const dsc=histDsc;
  const q=($('hist-search')?.value||'').trim().toLowerCase();
  const lista=q ? _histData.filter(e=>(e._busca||'').includes(q)) : _histData;
  const cnt=$('hist-count');
  if(cnt) cnt.textContent=_histData.length
    ? (q?`${lista.length} de ${_histData.length}`:plCot(_histData.length))
    : '';
  let html='';
  if(!_histData.length){
    html='<div class="hist-empty">Aún no hay cotizaciones autorizadas.<br><span style="font-size:12px">Aparecerán aquí automáticamente cuando autorices una cotización.</span></div>';
  } else if(!lista.length){
    html=`<div class="hist-empty">Ninguna cotización coincide con «${esc(q)}».</div>`;
  } else {
    html=lista.map(e=>{
      const isImg=e.aiFile&&e.aiFile.type&&e.aiFile.type.indexOf('image/')===0&&e.aiFile.url;
      const imgHTML=isImg
        ? `<img class="hentry-img" src="${urlImagenSegura(e.aiFile.url)}" ${_ABRIBLE} onclick="openHistImg('${esc(e.folio)}')" title="Ver imagen completa" alt="Referencia">`
        : `<div class="hentry-img-ph">${e.aiFile?ico('i-doc'):ico('i-imagen')}</div>`;
      const rows=e.items.map((it,i)=>{
        const ia=(e.itemsAuth&&e.itemsAuth[it.id]!==undefined)?e.itemsAuth[it.id]
                 :(it._lt!==undefined?it._lt:lineTotal(it));
        return `<tr><td>${i+1}</td><td>${esc(dsc(it))}</td><td>${money(ia)}</td></tr>`;
      }).join('');
      const pFin=totalFinalHist(e);
      const ajuste=+(e.neto-pFin).toFixed(2);
      return `<div class="hentry">
        <div class="hentry-top">
          ${imgHTML}
          <div class="hentry-meta">
            <div class="hentry-folio">${esc(e.folio)}</div>
            <div class="hentry-name">${esc(e.proy||e.cliente||'Sin nombre')}</div>
            <div class="hentry-sub">${esc(e.cliente||'')+(e.tel?' · '+esc(e.tel):'')+(e.dirRaw?'<br>'+ico('i-pin')+' '+esc(e.dirRaw):'')}</div>
            <div class="hentry-auth"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg> ${esc(e.autorizador||'—')} · ${esc(e.fechaAuth||'')}</div>
          </div>
          <div class="hentry-acts">
            <button class="hentry-open" onclick="reabrirDeHistorial('${esc(e.folio)}')" title="Cargarla en el cotizador para reimprimir su PDF, o editarla con «Editar partidas»"><svg class="svgi" aria-hidden="true"><use href="#i-recalibrar"/></svg> Abrir y editar</button>
            <button class="hentry-open" onclick="usarComoBase('${esc(e.folio)}')" title="Empezar una cotización nueva con estas mismas partidas, para cambiarles el material o la medida sin recapturarlas"><svg class="svgi" aria-hidden="true"><use href="#i-copiar"/></svg> Duplicar</button>
            <button class="hentry-del" onclick="borrarDeHistorial('${esc(e.folio)}')" title="Eliminar" aria-label="Eliminar cotización">${ico('i-basura')}</button>
          </div>
        </div>
        <table class="htable">${rows}</table>
        ${hitosHist(e.folio)}
        <div class="hentry-total">
          <span>Total autorizado</span>
          <!-- El importe va en la tinta de la app y no en verde. En este historial hay diez
               renglones y cada uno decía su total en verde, que es el color con el que la app
               dice «hecho» en todas partes; aquí no decía nada, porque TODAS las cotizaciones
               del historial están autorizadas. Lo que lo hace el número importante del renglón
               son la cifra y el peso, y el verde queda libre para la insignia de arriba, que sí
               dice un estado. El ahorro y el aumento conservan su color: esos sí comparan. --><span>${money(pFin)}${ajuste>0.01?`&nbsp;<small class="hentry-ajuste">(ahorro ${money(ajuste)})</small>`:''}${ajuste<-0.01?`&nbsp;<small class="hentry-ajuste inc">(aumento ${money(-ajuste)})</small>`:''}</span>
        </div>
        ${e.nota?`<div style="font-size:11.5px;color:var(--muted);margin-top:7px;padding-top:7px;border-top:1px solid var(--line)">${ico('i-chat')} ${esc(e.nota)}</div>`:''}
      </div>`;
    }).join('');
  }
  $('hist-body').innerHTML=html;
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
function hitosHist(folio){
  const h=hitosDe(folio);
  const marcas=HITOS.filter(x=>h[x.k]).map(x=>x.hecho+' · '+hitoFecha(h[x.k]));
  try{
    const pr=getPropuestas()[folio];
    if(pr&&pr.primera) marcas.unshift('Propuesta · '+hitoFecha(pr.primera));
  }catch(_){}
  if(!marcas.length) return '';
  return `<div class="hentry-hitos">${ico('i-check')} ${esc(marcas.join('  ·  '))}</div>`;
}
function cerrarHistorial(){ $('histmodal').classList.remove('show'); }

/* Volver a abrir una cotización ya autorizada: el cliente vuelve a pedir el PDF o
   quiere copiar la venta y antes había que capturarla otra vez desde cero. */
function reabrirDeHistorial(folio){
  const e=_histData.find(x=>x.folio===folio); if(!e) return;
  const hayTrabajo=Q.estado!=='autorizada'&&(Q.items.some(it=>!itemVacio(it))||hayDatosCliente());
  if(hayTrabajo&&!confirm('Tienes una cotización sin autorizar en pantalla. Si abres '+folio+', se perderá. ¿Continuar?')) return;
  guardarParaDeshacer();
  scReset();
  Q.folio=e.folio;
  Q.proy=e.proy||''; Q.cliente=e.cliente||''; Q.tel=e.tel||'';
  Q.dirRaw=e.dirRaw||''; Q.direccion=e.direccion||''; Q.maps=e.maps||'';
  Q.entrecalles=e.entrecalles||''; Q.entrega=e.entrega||''; Q.notaCliente=e.notaCliente||'';
  Q.plazoK=(e.plazoK>=1&&e.plazoK<=5)?e.plazoK:null;
  Q.fecha=e.fecha||Q.fecha;
  Q.items=JSON.parse(JSON.stringify(e.items||[]));
  Q.itemsAuth=JSON.parse(JSON.stringify(e.itemsAuth||{}));
  Q.iva=e.iva!==false;
  Q.precioAuth=e.precioAuth||0;
  /* Si la entrada es de antes de que existiera la huella, se sella con el trabajo tal como
     viene: lo que se guardó ES lo que se autorizó. Sin esto, cada cotización vieja del
     historial perdería su precio autorizado la primera vez que se abriera. */
  Q.huellaAuth=e.huellaAuth||huellaTrabajo();
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
  toast('Cotización '+e.folio+' abierta — reimprime su PDF, o toca «Editar partidas» para cambiarla','ok',
    _vaciada?7000:5200, _vaciada?{label:'Deshacer',fn:deshacerVaciado}:null);
}

/* ----- Recotizar algo parecido -----
   «↻ Abrir» trae la cotización tal cual, autorizada, para reimprimir su PDF. Eso deja
   fuera el caso más común del negocio: el mismo cliente que pide otro letrero, o el
   local de junto que quiere lo mismo con otra medida. Antes eso se capturaba desde
   cero. Aquí se copian los datos del cliente y las partidas a una cotización NUEVA:
   folio nuevo, en borrador, con el precio recalculado y sin arrastrar nada de la
   autorización anterior. Tus plantillas son tus cotizaciones anteriores. */
function usarComoBase(folio){
  const e=_histData.find(x=>x.folio===folio); if(!e) return;
  const hayTrabajo=Q.estado!=='autorizada'&&(Q.items.some(it=>!itemVacio(it))||hayDatosCliente());
  if(hayTrabajo&&!confirm('Tienes una cotización sin autorizar en pantalla. Si empiezas una nueva a partir de '+folio+', se perderá. ¿Continuar?')) return;
  guardarParaDeshacer();
  scReset();
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
  Q.items=(e.items||[]).map(it=>{ const c=JSON.parse(JSON.stringify(it)); c.id=++pid; c.showInPdf=true; c.matAuto=false; delete c._lt; return c; });
  Q.iva=e.iva!==false;
  Q.itemsAuth={}; Q.precioAuth=0; Q.huellaAuth='';
  Q.autorizador=''; Q.nota=''; Q.fechaAuth='';
  Q.estado='borrador'; Q.editMode=false; _selfAuth=false; _marcarOblig=false;
  Q.anti=0; Q.antiManual=false; Q.aiFile=null;
  Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
  updDirRaw(Q.dirRaw); updMaps(Q.maps);
  sincronizarPlegado();
  pintarFolio(); saveState(); renderItems();
  irAPantalla(pantallaSegunDatos(),{forzar:true});
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
  _cuaAbierto=null;
  const s=$('cua-search'); if(s) s.value='';
  pintarCuadernos();
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

function pintarCuadernos(){
  _cuaAbierto=null;
  const lv=$('cua-lista-vista'); if(lv) lv.style.display='';
  $('cua-titulo').textContent='Cuadernos de cliente';
  const q=($('cua-search')?.value||'').trim().toLowerCase();
  const qd=q.replace(/\D/g,'');
  const lista=q
    ? _cuaData.filter(g=>{
        if(cuaTitulo(g).toLowerCase().includes(q)) return true;
        if(g.alias.some(a=>a.toLowerCase().includes(q))) return true;
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
    html='<div class="hist-empty">Todavía no hay clientes.<br><span style="font-size:12px">Cada cotización que autorices abre o alimenta el cuaderno de su cliente.</span></div>';
  } else if(!lista.length){
    html=`<div class="hist-empty">Ningún cliente coincide con «${esc(q)}».</div>`;
  } else {
    html=lista.map(g=>{
      const n=g.cots.length;
      const sub=[g.tel||'', g.alias.length?('también «'+g.alias[0]+'»'):''].filter(Boolean).join(' · ');
      return `<button class="cua-card" onclick="abrirCuaderno('${esc(g.clave)}')" title="Abrir el cuaderno de ${esc(cuaTitulo(g))}">
        <span class="cua-ini" aria-hidden="true">${esc(cuaIniciales(cuaTitulo(g)))}</span>
        <span class="cua-card-meta">
          <span class="cua-nombre">${esc(cuaTitulo(g))}</span>
          <span class="cua-sub">${esc(sub||'Sin teléfono')}</span>
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
}

function abrirCuaderno(clave){
  const g=cuadernoDe(clave); if(!g) return;
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
        <button onclick="cuaAbrirCot('${esc(e.folio)}')" title="Cargarla en el cotizador para reimprimir su PDF">Abrir</button>
        <button onclick="cuaDuplicarCot('${esc(e.folio)}')" title="Empezar una cotización nueva con estas mismas partidas">Duplicar</button>
      </div>
    </div>`).join('');
  const datos=[
    g.tel?ico('i-chat')+' '+esc(g.tel):'',
    g.dirRaw?ico('i-pin')+' '+esc(g.dirRaw.replace(/\s*\n\s*/g,' ')):''
  ].filter(Boolean).join('<br>');
  $('cua-body').innerHTML=`
    <div class="cua-det-head">
      <button class="cua-volver" onclick="pintarCuadernos()">${ico('i-atras')} Todos los clientes</button>
      <div class="cua-det-nom">${esc(cuaTitulo(g))}</div>
      ${datos?`<div class="cua-det-datos">${datos}</div>`:''}
      ${g.alias.length?`<div class="cua-alias">También capturado como ${g.alias.map(a=>'«'+esc(a)+'»').join(', ')}</div>`:''}
      <div class="cua-det-acts">
        <button onclick="cuaNuevaCotizacion('${esc(g.clave)}')" title="Empieza una cotización en blanco con estos datos de cliente ya puestos">${ico('i-lapiz')} Cotizarle algo nuevo</button>
        ${g.tel?`<button onclick="cuaWhatsApp('${esc(g.clave)}')" title="Abre el chat de WhatsApp con este cliente">${ico('i-chat')} WhatsApp</button>`:''}
        <button onclick="cuaCSV('${esc(g.clave)}')" title="Descarga las cotizaciones de este cliente">${ico('i-doc')} CSV</button>
      </div>
    </div>
    <div class="cua-cifras">
      <div class="cua-cifra"><b>${n}</b><span>${n===1?'Cotización':'Cotizaciones'}</span></div>
      <div class="cua-cifra"><b>${money(g.vendido)}</b><span>Autorizado</span></div>
      <div class="cua-cifra"><b>${money(prom)}</b><span>Promedio</span></div>
    </div>
    <div class="cua-nota-wrap">
      <label for="cua-nota">Nota del cuaderno</label>
      <textarea id="cua-nota" maxlength="${CUA_NOTA_MAX}" placeholder="Lo que no cabe en una cotización — cómo paga, con quién se habla, qué quedó pendiente." oninput="cuaNotaEscrita()">${esc(notaCuaderno(g))}</textarea>
      <div class="cua-nota-estado" id="cua-nota-estado">Se guarda sola en este dispositivo.</div>
    </div>
    <div class="cua-cots-tit">Cotizaciones autorizadas</div>
    ${cots}`;
  $('cua-foot').innerHTML=
    `<button onclick="pintarCuadernos()">${ico('i-atras')} Todos los clientes</button>
     <p class="foot-nota">La primera fue el ${esc(cuaFecha(g.cots[g.cots.length-1]))||'—'}; la última, el ${esc(cuaFecha(g.cots[0]))||'—'}.</p>`;
  $('cua-body').scrollTop=0;
}

/* La nota se guarda sola, medio segundo después de dejar de teclear: guardar en cada
   letra escribe en el almacenamiento decenas de veces por frase, y un botón «Guardar»
   es una cosa más que se olvida antes de cerrar. */
function cuaNotaEscrita(){
  const est=$('cua-nota-estado'); if(est) est.textContent='Escribiendo…';
  clearTimeout(_cuaNotaTimer);
  _cuaNotaTimer=setTimeout(cuaGuardarNotaYa,500);
}
function cuaGuardarNotaYa(){
  clearTimeout(_cuaNotaTimer); _cuaNotaTimer=null;
  const ta=$('cua-nota'); if(!ta||!_cuaAbierto) return;
  const g=cuadernoDe(_cuaAbierto); if(!g) return;
  const ok=guardarNotaCuaderno(g,ta.value);
  const est=$('cua-nota-estado');
  if(est) est.textContent=ok?'Guardada en este dispositivo.':'No hubo espacio para guardar la nota — respalda y borra cotizaciones viejas.';
  if(!ok) toast('No hubo espacio para guardar la nota','err',4200,{label:'Respaldar',fn:()=>respaldar()});
}

/* Desde el cuaderno se llega a las mismas dos acciones del historial: son las mismas
   cotizaciones, así que se llaman las mismas funciones —no hay una segunda manera de
   abrir una cotización que pueda dejar la pantalla distinta. */
function cuaAbrirCot(folio){ _histData=getHistorial(); cerrarCuadernos(); reabrirDeHistorial(folio); }
function cuaDuplicarCot(folio){ _histData=getHistorial(); cerrarCuadernos(); usarComoBase(folio); }

/* Cotizarle algo nuevo: en blanco, pero sin volver a teclear quién es. No se pregunta
   nada antes porque nueva() ya deja «Deshacer» puesto sobre lo que había. */
function cuaNuevaCotizacion(clave){
  const g=cuadernoDe(clave); if(!g) return;
  const habia=Q.items.some(it=>!itemVacio(it))||!!(Q.cliente||'').trim()||!!(Q.proy||'').trim();
  cerrarCuadernos();
  nueva();
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
    +` <button type="button" onclick="verCuadernoDe('${esc(g.clave)}')">Ver cuaderno</button>`;
  el.style.display='flex';
}
/* Entrar al cuaderno de un cliente sin pasar por la lista. _cuaData tiene que quedar
   cargado igual: es de donde sale la lista cuando se toca «Todos los clientes». */
function verCuadernoDe(clave){
  _cuaData=cuadernos();
  abrirCuaderno(clave);
  $('climodal').classList.add('show');
}

/* ===================== Respaldo, restauración y CSV =====================
   Todo lo que hace esta app —historial, folios, cotización en curso, logotipo— vive
   en el almacenamiento local de ESTE navegador. Se pierde al borrar los datos del
   navegador, al cambiar de teléfono o cuando iOS limpia los sitios que llevan semanas
   sin abrirse. Hasta ahora no había forma de sacarlo ni de moverlo.

   La API key se queda fuera del respaldo a propósito: un respaldo se manda por
   WhatsApp o por correo, y una key que viaja así deja de ser secreta. Se vuelve a
   pegar en el teléfono nuevo, que es un minuto. */
/* Van aquí arriba y no junto a `respaldar()` porque RESPALDO_KEYS es un `const` que se
   inicializa al cargar el archivo y las nombra: declararlas después reventaba el script. */
const RESP_TS='al3d_respaldo_ts', RESP_N='al3d_respaldo_n';
const RESP_DIAS=30, RESP_COTS=10, RESP_PRIMERAS=3;
const RESPALDO_KEYS=['al3d_historial','al3d_folio','al3d_q','al3d_queue','al3d_logo',CANVA_KEY,HITOS_KEY,'al3d_pf_ganadas',
  'al3d_fold_proy',CUA_NOTAS,AI_FILE_KEY,PREF_AUTORIZADOR,PREF_MATERIAL,PREF_RV_PCT,PREF_RV_CUENTA,
  RESP_TS,RESP_N];
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
  el.innerHTML=(t?esc(t)+' ':'')+'El respaldo <b>no</b> incluye tus API keys.';
}
function pedirRestaurar(){ $('restaurarin').click(); }
function restaurarDesde(texto){
  let paquete;
  try{ paquete=JSON.parse(texto); }
  catch(_){ toast('Ese archivo no se pudo leer — ¿es el respaldo?','err',3600); return; }
  /* El respaldo COMPLETO —el que baja la plataforma— trae las dos mitades en un solo archivo.
     Aquí se toma la del cotizador y se sigue igual que siempre; la otra mitad la restaura la
     plataforma desde Ajustes. Un solo archivo para mover TODO de un aparato a otro, que es la
     única forma de usar la app en el teléfono y en la computadora mientras no haya servidor. */
  let completo=false;
  if(paquete&&paquete.app==='al3d-completo'&&paquete.cotizador&&typeof paquete.cotizador==='object'){
    paquete=paquete.cotizador; completo=true;
  }
  if(!paquete||paquete.app!=='cotizador-al3d'||!paquete.datos){
    toast('Ese archivo no es un respaldo del cotizador','err',3600); return;
  }
  if(completo) toast('Es un respaldo completo: aquí se restaura la parte del cotizador. La de la plataforma se restaura en Plataforma → Ajustes.','',6000);
  /* Antes solo se miraba la etiqueta 'app' y de ahí se escribía directo en el
     almacenamiento: un respaldo truncado o editado a mano pasaba el filtro, borraba lo que
     había y anunciaba éxito, dejando la app sin arrancar. Se revisa la FORMA de lo que
     viene antes de tocar nada. */
  const D=paquete.datos;
  if(typeof D!=='object'||Array.isArray(D)||Object.values(D).some(v=>typeof v!=='string'&&v!==null)){
    toast('El respaldo está dañado: sus datos no tienen la forma esperada','err',4600); return;
  }
  if(!Object.keys(D).some(k=>RESPALDO_KEYS.includes(k))){
    toast('El respaldo no trae ninguno de los datos del cotizador','err',4600); return;
  }
  /* Las dos claves que pueden dejar la app inservible se parsean de prueba. */
  try{
    if(D['al3d_historial']!=null && !Array.isArray(JSON.parse(D['al3d_historial']))) throw 0;
    if(D['al3d_q']!=null){
      const q=JSON.parse(D['al3d_q']);
      if(!q||typeof q!=='object'||!Array.isArray(q.items)) throw 0;
    }
  }catch(_){
    toast('El respaldo está dañado: el historial o la cotización en curso no se pueden leer','err',5200); return;
  }
  let cuantas=0;
  try{ cuantas=(JSON.parse(paquete.datos['al3d_historial']||'[]')||[]).length; }catch(_){}
  const fecha=(paquete.fecha||'').slice(0,10);
  if(!confirm(`Restaurar reemplaza el historial, los folios y la cotización en curso de este teléfono por los del respaldo`
    +(fecha?` del ${fecha}`:'')+` (${cuantas} ${cuantas===1?'cotización':'cotizaciones'}).\n\n`
    +`Antes de reemplazar se descarga un respaldo de lo que hay ahora.\n\n¿Continuar?`)) return;
  /* El confirm acaba de prometer que antes de reemplazar se descarga un respaldo de lo
     que hay ahora. Si la descarga no salió, no se reemplaza nada: en la app instalada
     de iOS descargarArchivo() devuelve false y antes se destruía el historial igual. */
  if(!descargarArchivo(armarRespaldo(),`cotizador-al3d-antes-de-restaurar-${selloFecha()}.json`,'application/json')){
    toast('No se pudo descargar el respaldo previo — no se cambió nada','err',5200); return;
  }
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
    toast('No cupo el respaldo en este dispositivo ('+fallaron.length+' '+(fallaron.length===1?'clave':'claves')+') — no se cambió nada','err',6000);
    return;
  }
  try{ localStorage.removeItem(RESTAURAR_PF_KEY); }catch(_){}
  toast('Respaldo restaurado — recargando…','ok',2000);
  setTimeout(()=>location.reload(),900);
}
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
  let fecha='', cuantas=0;
  try{ const pq=JSON.parse(t); fecha=(pq.fecha||'').slice(0,10); cuantas=(JSON.parse((pq.datos||{}).al3d_historial||'[]')||[]).length; }catch(_){}
  const main=$('contenido'); if(!main||$('pf-restaurar')) return;
  const card=document.createElement('div');
  card.className='cand-partidas'; card.id='pf-restaurar'; card.setAttribute('role','region'); card.setAttribute('aria-label','Respaldo pendiente de restaurar');
  card.innerHTML='<p class="cp-txt"><svg class="svgi" aria-hidden="true"><use href="#i-historial"/></svg> <b>La plataforma dejó un respaldo completo'+(fecha?' del '+esc(fecha):'')+'</b>'
    +(cuantas?' con '+cuantas+(cuantas===1?' cotización':' cotizaciones'):'')+', esperando la parte del cotizador. Restaurar reemplaza lo que hay aquí; antes se descarga una copia de lo actual.</p>'
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
function getQueue(){ try{return JSON.parse(localStorage.getItem('al3d_queue')||'[]');}catch(_){return [];} }
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

function loadQueueEntry(folio){
  if(folio===Q.folio) return;
  const arr=getQueue();
  const entry=arr.find(x=>x.folio===folio);
  if(!entry||!entry.q) return;
  /* itemVacio es la prueba de «esta partida no tiene nada capturado». Con Q.items.length el
     aviso salía siempre, porque init() y nueva() dejan una partida vacía en pantalla: se
     preguntaba por trabajo que no existía y se enseñaba a ignorar la pregunta. */
  const hayCambiosSinGuardar=Q.estado==='borrador'&&(Q.items.some(it=>!itemVacio(it))||Q.proy.trim()||Q.cliente.trim());
  if(hayCambiosSinGuardar&&!confirm('Tienes una cotización sin guardar en pantalla. Si continúas, se perderá. ¿Cambiar de todos modos?')) return;
  /* Una revisión a medias también es trabajo que se pierde: el autorizador puede llevar
     media cotización ajustada partida por partida y esa guarda de arriba no la veía,
     porque solo mira los borradores. */
  const hayRevisionSinCerrar=Q.estado==='pendiente'&&(Q.precioAuth>0||Object.keys(Q.itemsAuth||{}).length>0);
  if(hayRevisionSinCerrar&&!confirm('Llevas ajustes de precio sin autorizar en '+Q.folio+'. Si abres '+folio+', se pierden. ¿Continuar?')) return;
  /* El rol es de quien está usando la app, no de la cotización: el snapshot lo
     guardó el vendedor, así que si lo copiáramos el autorizador saldría expulsado
     de su propia vista al abrir un pendiente. */
  scReset();
  const rolActual=Q.rol;
  Object.assign(Q,entry.q);
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
  undoRegistrar(serie);
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
  else { const {editMode,...rest}=Q; _undoBase=_undoFoto(JSON.stringify({...rest,aiFile:null})); }
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
    renderItems(); renderAuth(); updProg();
  } finally {
    _undoAplicando=false;
  }
  pintarUndo();
}
/* No se pregunta por locked() solo para tapar el botón: el atajo de teclado llega aquí sin
   pasar por él, y una cotización autorizada no acepta escrituras por ningún otro camino. */
function deshacer(){
  if(locked()){ toast('La cotización está autorizada — usa «Editar partidas» para poder deshacer','err',4600); return; }
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
  if(locked()){ toast('La cotización está autorizada — usa «Editar partidas» para poder rehacer','err',4600); return; }
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
function plazoSugeridoCot(items){
  const tipos=new Set(), n=x=>(isFinite(Number(x))&&Number(x)>0)?Number(x):0;
  let mayor=0;
  for(const it of (items||[])){
    if(!it||typeof it!=='object') continue;
    tipos.add(tipoTrabajoCot(it));
    const lado=(it.tipo==='letras'||it.tipo==='recorte')?n(it.altura):(it.tipo==='caja'||it.tipo==='bastidor')?Math.max(n(it.ancho),n(it.alto)):0;
    if(lado>mayor) mayor=lado;
  }
  if(!tipos.size) return 4;
  let k=Math.max(...[...tipos].map(t=>CUBO_POR_TIPO_COT[t]||4));
  k+=tipos.size-1;
  if(mayor>244) k+=1;
  return Math.min(5,k);
}
/* Los chips. El marcado es el propuesto salvo que alguien haya elegido; la nota de abajo dice
   cuál de los dos casos es, para que «2 semanas» resaltado no se lea como una decisión que
   nadie tomó. Se repinta desde renderItems, porque la propuesta depende de las partidas. */
function pintarPlazo(){
  const sug=plazoSugeridoCot(Q.items);
  const elegido=(Q.plazoK>=1&&Q.plazoK<=5)?Q.plazoK:null;
  const on=elegido!==null?elegido:sug;
  const nota=elegido!==null
    ?'Elegido a mano. Tócalo otra vez para volver al propuesto.'
    :(Q.items.length?'Propuesto por el tipo de trabajo. Toca otro si sabes que tarda más.':'Se propone en cuanto haya partidas. Toca uno si ya lo sabes.');
  /* Los mismos chips viven en dos sitios: el formulario del cliente y el modal de Registrar
     venta, que es el momento natural de corregirlo —junto a la fecha de instalación—. Una sola
     función los pinta a los dos para que nunca digan cosas distintas. */
  for(const [boxId,hId] of [['f-plazo','f-plazo-h'],['rv-plazo','rv-plazo-h']]){
    const box=$(boxId), h=$(hId); if(!box) continue;
    box.innerHTML=PLAZOS_COT.map(p=>chip(p.k===on,`setPlazo(${p.k})`,esc(p.etiqueta),'',true)).join('');
    if(h) h.textContent=nota;
  }
}
/* Tocar el que ya está elegido lo suelta: vuelve a mandar el propuesto. */
function setPlazo(k){
  undoJuntar('q:plazoK');
  Q.plazoK=(Q.plazoK===k)?null:k;
  saveState(); pintarPlazo();
}
function loadState(){
  try{
    const s=localStorage.getItem('al3d_q');
    if(!s) return false;
    const saved=JSON.parse(s);
    /* Se valida ANTES del Object.assign. Antes se asignaba y luego reventaba el reduce de
       más abajo: Q quedaba ya contaminado con la basura y la app arrancaba a medias, con
       loadState devolviendo false como si no hubiera encontrado nada. */
    if(!saved||typeof saved!=='object'||!Array.isArray(saved.items)) return false;
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

/* ----- Folio / contador de cotizaciones -----
   El contador solo avanza con las cotizaciones CONFIRMADAS (autorizadas).
   Mientras la cotización es borrador o está pendiente, el folio es provisional:
   se muestra el siguiente número libre pero no se consume, así los borradores
   que nunca se autorizan no gastan folios del contador. */
const FOLIO_PREFIJO='COT-';
function folioNum(f){ const m=/(\d+)/.exec(String(f||'')); return m?parseInt(m[1],10):0; }
function folioFmt(n){ return FOLIO_PREFIJO+String(n).padStart(4,'0'); }
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
  }catch(_){ return FOLIO_PREFIJO+String(Math.floor(Math.random()*9000)+1000); }
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
  el.innerHTML=esc(Q.folio||'')+(_saveOk?'':' <b class="folio-mal">sin guardar</b>');
  el.classList.toggle('prov',!conf);
  el.classList.toggle('nosave',!_saveOk);
  el.title=!_saveOk
    ? 'No hay espacio en este teléfono: lo que captures ahora no se está guardando. Respalda desde el historial y borra cotizaciones viejas.'
    : conf
    ? 'Folio confirmado — cuenta en el contador de cotizaciones'
    : 'Folio provisional — el contador solo avanza cuando la cotización se autoriza';
}

