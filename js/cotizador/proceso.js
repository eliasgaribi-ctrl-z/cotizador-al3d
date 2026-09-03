/* ============================================================================
   Cotizador · proceso.js

   El proceso de cuatro pasos: resumen y autorización, revisión previa, datos obligatorios, el candado, las dos pantallas, la barra de pasos, el flujo de autorizar, la barra fija del teléfono y los campos generales.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Resumen + Autorización ===================== */
function renderSummary(){
  /* Único punto donde se limpia una autorización vencida. Está aquí porque todo lo que
     cambia el trabajo —renderItems, typeItem, toggleIva— pasa por renderSummary antes de
     guardar, y porque no depende de que el usuario apriete ningún botón: recargar la app a
     medio editar también entra por aquí. Suelta una sola vez, porque al soltar borra la
     huella; de ahí que el aviso no se repita en cada repintado. */
  if(soltarAuthSiCambio()){
    toast('Cambiaron las partidas: el precio vuelve al calculado y hay que autorizarlo de nuevo','',6000);
    voz('El precio autorizado se soltó porque cambiaron las partidas');
  }
  aplicarBlurPrecios();
  const t=totals();
  $('s-sub').textContent=money(t.sub);
  $('s-iva').textContent=money(t.iva);
  $('s-neto').textContent=money(t.neto);
  latirTotal();
  $('s-calc').textContent=Q.iva?`${money(t.sub)} × 1.16`:'Sin IVA (= subtotal)';
  $('ivatg').classList.toggle('on',Q.iva); tgAria('ivatg');
  const ivaHint=$('s-iva-hint'); if(ivaHint) ivaHint.style.display=Q.iva?'':'none';
  // El anticipo se calcula sobre lo que realmente se va a cobrar, no sobre el
  // total calculado: si el autorizador dio descuento, el 50% también baja.
  const pf=precioFinal();
  if(!Q.antiManual){ const auto=Math.round(pf*0.5); Q.anti=auto; if(document.activeElement!==$('f-anti')) $('f-anti').value=auto||''; }
  else if(document.activeElement!==$('f-anti')) $('f-anti').value=Q.anti||'';
  const restEl=$('s-anti-rest');
  if(restEl){
    const resta=pf-(Q.anti||0);
    restEl.textContent = pf>0 ? `Resta al entregar: ${money(Math.max(0,resta))}${resta<-0.01?' · el anticipo supera el total':''}` : '';
  }
  // Precio autorizado (descuento o aumento respecto al calculado)
  const authRow=$('s-auth-row');
  if(authRow){
    const aj=ajusteAuth(), neto=netoAjustado();
    if(Q.estado==='autorizada'&&Math.abs(aj)>0.01&&neto>0){
      $('s-auth').textContent=money(pf);
      $('s-auth-desc').textContent= aj>0
        ? `Descuento: ${money(aj)} (${Math.round(aj/neto*100)}%)`
        : `Aumento: ${money(-aj)} (${Math.round(-aj/neto*100)}%)`;
      authRow.classList.toggle('inc',aj<0);
      authRow.style.display='';
    } else { authRow.style.display='none'; }
  }
  renderAuth();
  /* La barra de pasos lee `Q.estado` y los hitos de la entrega, o sea justo lo que cambia por
     aquí. Antes solo la repintaba updProg() —que vive del lado de la captura—, y por eso al
     autorizar la barra seguía marcando el paso 2 hasta el siguiente repintado de partidas. */
  pintarPasos();
  pintarFolio();
  /* Bloqueo de inputs generales. Los datos que solo salen en el PDF no mueven el
     precio, así que siguen editables después de autorizar: la fecha límite y la
     nota para el cliente normalmente se definen justo en ese momento. */
  Object.values(_FM).concat('f-anti').forEach(id=>{ if($(id)) $(id).disabled=locked()&&!_FM_PDF.includes(id); });
  $('addbtn').disabled=locked();
  if($('dupbtn')) $('dupbtn').disabled=locked();
  /* El IVA sí mueve el total, así que se bloquea con las partidas. Se quedaba fuera de
     esta lista y era la puerta abierta por la que el precio autorizado se movía solo. */
  if($('ivabtn')) $('ivabtn').disabled=locked();
  /* Cotizar con IA reemplaza las partidas, así que se bloquea igual que agregarlas. */
  if($('aibtn')) $('aibtn').disabled=locked();
  renderMobileBar();
}

function renderAuth(){
  const box=$('authbox');
  const LABELS={borrador:'Borrador',pendiente:'Pendiente de autorización',autorizada:'Autorizada',rechazada:'Rechazada'};
  const badge=`<span class="badge ${Q.estado}"><span class="dot"></span>${LABELS[Q.estado]}</span>`;
  let body='';
  const hayPartidas=Q.items.length>0&&totals().sub>0;

  if(Q.rol==='autorizador'){
    // --- Cola de pendientes ---
    const pendientes=getQueue().filter(x=>x.estado==='pendiente');
    let qHTML='';
    /* La cola vive en el almacenamiento de ESTE navegador, no en un servidor: aquí solo
       aparece lo que se solicitó en este mismo aparato. Vale la pena decirlo en la
       pantalla, porque una cola vacía se lee como «no hay nada pendiente» cuando en
       realidad puede haber solicitudes hechas en otro teléfono. */
    const qNota=`<p class="mini" style="text-align:left;margin-top:8px">Solo aparecen las solicitudes hechas en <b>este</b> dispositivo — la cola se guarda aquí, no en un servidor.</p>`;
    if(!pendientes.length){
      qHTML=`<div class="queue-list"><div class="queue-empty">Sin cotizaciones pendientes por autorizar.</div></div>${qNota}`;
    } else {
      /* El renglón era un div con onclick y nada más: el autorizador que navega con teclado
         no podía cargar ninguna cotización pendiente, que es lo único que hace esta pantalla.
         aria-current marca la que está abierta, que hasta ahora solo se distinguía por color. */
      const rows=pendientes.map(e=>`<div class="queue-item${e.folio===Q.folio?' active':''}" ${_ABRIBLE} ${e.folio===Q.folio?'aria-current="true"':''} aria-label="Revisar ${esc(e.folio)}${e.proy||e.cliente?', '+esc(e.proy||e.cliente):''}" onclick="loadQueueEntry('${esc(e.folio)}')">
        <span class="qi-dot"></span>
        <div class="qi-body">
          <div class="qi-folio">${esc(e.folio)}</div>
          <div class="qi-name">${esc(e.proy||e.cliente||'Sin nombre')}</div>
          <div class="qi-fecha">${esc(e.fecha_sol||'')}</div>
        </div>
        <div style="text-align:right"><div class="qi-total">${money(e.neto)}</div></div>
      </div>`).join('');
      qHTML=`<div class="queue-list">${rows}</div>${qNota}`;
    }

    // --- Formulario de revisión (solo si la cotización cargada está pendiente) ---
    let formHTML='';
    if(Q.estado==='pendiente') formHTML=authRevisionHTML(false);
    else if(pendientes.length){
      formHTML=`<p class="mini" style="margin-top:2px">Selecciona una cotización de la lista para revisarla.</p>`;
    }
    body=qHTML+formHTML;

  } else {
    // --- Vista vendedor ---
    if(Q.estado==='borrador'){
      /* «Autorizar yo mismo» es la acción principal porque es la que se usa casi
         siempre: la cola de autorización vive en el almacenamiento de ESTE teléfono,
         así que el flujo de dos personas solo funciona si las dos comparten aparato.
         Solicitar a alguien más sigue disponible, un renglón abajo. */
      body=`<button class="btn btn-pri" ${hayPartidas?'':'disabled'} onclick="autorizarYoMismo()"><svg class="svgi" aria-hidden="true"><use href="#i-rayo"/></svg> Autorizar yo mismo</button>
            <button class="btn btn-gho" ${hayPartidas?'':'disabled'} onclick="solicitar()">Solicitar autorización a alguien más</button>
            ${hayPartidas?'':`<p class="mini">${!locked()&&faltanDatosCliente()
              ? 'Falta el paso 1.'
              : 'Agrega partidas con precio para continuar.'}</p>`}
            <button class="btn btn-gho" onclick="pedirConfNueva()"><svg class="svgi" aria-hidden="true"><use href="#i-basura"/></svg> Vaciar y empezar cotización nueva</button>`;
    }
    else if(Q.estado==='pendiente'){
      body=_selfAuth
        ? `<div class="auth-divider">Autorizando tú mismo</div>${authRevisionHTML(true)}`
        : `<div class="authnote">Esperando autorización del precio. Cambia el rol a <b>Autorizador</b> (arriba a la derecha) para aprobar o rechazar.</div>
           <button class="btn btn-pri" onclick="autorizarYoMismo()"><svg class="svgi" aria-hidden="true"><use href="#i-rayo"/></svg> Autorizarla yo mismo</button>
           <button class="btn btn-gho" onclick="reabrir()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Editar (cancela la solicitud)</button>`;
    }
    else if(Q.estado==='autorizada'){
      const neto=netoAjustado();
      const aj=ajusteAuth();
      const descHTML=Math.abs(aj)>0.01&&neto>0
        ? (aj>0
            ? `<div class="authnote" style="border-color:var(--green-ico);background:var(--green-bg);color:var(--green);margin-top:8px">Precio autorizado: <b>${money(precioFinal())}</b> · Ahorro: <b>${money(aj)}</b> (${Math.round(aj/neto*100)}%)</div>`
            /* El aumento se reparte entre las partidas y el cliente no lo ve como renglón (ver
               preciosCliente). Se dice aquí, donde el vendedor lee «Aumento», para que no
               busque en el PDF un «Ajuste» que ya no existe. */
            : `<div class="authnote" style="border-color:var(--amber-ico);background:var(--amber-bg);color:var(--amber);margin-top:8px">Precio autorizado: <b>${money(precioFinal())}</b> · Aumento: <b>${money(-aj)}</b> (${Math.round(-aj/neto*100)}%) · repartido entre las partidas, sin renglón de ajuste en el PDF</div>`)
        : '';
      const authNote=`<div class="authnote">Autorizada por <b>${esc(Q.autorizador)||'—'}</b> el <b>${esc(Q.fechaAuth)}</b>.${Q.nota?'<br>Nota: '+esc(Q.nota):''}</div>`;
      if(Q.editMode){
        body=`${authNote}
              ${descHTML}
              <div class="authnote" style="border-color:var(--amber-ico);background:var(--amber-bg);color:var(--amber);margin-top:8px"><svg class="svgi" aria-hidden="true"><use href="#i-lapiz"/></svg> Modo edición activo — usa <svg class="svgi" aria-hidden="true"><use href="#i-ojo"/></svg> para mostrar u ocultar partidas del PDF.</div>
              <button class="btn btn-ok" onclick="guardarCambiosEdicion()"><svg class="svgi" aria-hidden="true"><use href="#i-guardar"/></svg> Guardar y salir de edición</button>
              <button class="btn btn-gho" onclick="generarPDF()"><svg class="svgi" aria-hidden="true"><use href="#i-doc"/></svg> Generar PDF</button>
              <button class="btn btn-gho" onclick="copiarParaCanva()"><svg class="svgi" aria-hidden="true"><use href="#i-copiar"/></svg> Copiar datos para Canva</button>
              <button class="btn btn-gho" onclick="copiarParaGemini()"><svg class="svgi" aria-hidden="true"><use href="#i-imagen"/></svg> Prompt para imagen (Gemini)</button>`;
      } else {
        body=`${authNote}
              ${descHTML}
              <div id="entrega">${entregaHTML()}</div>
              <button class="btn btn-gho" onclick="toggleEditMode()"><svg class="svgi" aria-hidden="true"><use href="#i-lapiz"/></svg> Editar partidas</button>
              <!-- Canva y el prompt de Gemini son salidas que se usan a veces, no pasos de la
                   entrega: sacadas de la fila de arriba dejan de competir con lo que sí se
                   hace siempre, y siguen a un toque de distancia. -->
              <details class="ai-cfg otras-salidas"${_hayPropuestas()?' open':''}>
                <summary><span class="os-chev" aria-hidden="true">▾</span> Otras salidas de esta cotización</summary>
                <div style="margin-top:2px">
                  <button class="btn btn-gho" onclick="copiarParaCanva()"><svg class="svgi" aria-hidden="true"><use href="#i-copiar"/></svg> Copiar datos para Canva</button>
                  <button class="btn btn-gho" onclick="copiarParaGemini()"><svg class="svgi" aria-hidden="true"><use href="#i-imagen"/></svg> Prompt para imagen (Gemini)</button>
                </div>
              </details>
              <!-- Separada del resto: empezar otra cotización no es entregar ésta, y estaba
                   a un dedo de «Registrar venta». -->
              <div class="auth-cierre"><button class="btn btn-gho" onclick="pedirConfNueva()">Nueva cotización</button></div>`;
      }
    }
    else if(Q.estado==='rechazada'){
      body=`<div class="authnote">Rechazada por <b>${esc(Q.autorizador)||'—'}</b>.${Q.nota?'<br>Motivo: '+esc(Q.nota):''}</div>
            <button class="btn btn-gho" onclick="reabrir()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Editar y volver a enviar</button>
            <button class="btn btn-gho" onclick="pedirConfNueva()"><svg class="svgi" aria-hidden="true"><use href="#i-basura"/></svg> Vaciar y empezar cotización nueva</button>`;
    }
  }

  /* `renderAuth` reconstruye el panel entero desde un string, así que un `<details>` abierto
     se cerraba en cada repintado — y el panel se repinta al teclear el anticipo, que está a un
     renglón de distancia: abrir «otras salidas», bajar a corregir el anticipo y ver el pliegue
     cerrarse solo. Se lee antes y se devuelve después. */
  const _abierto=box.querySelector('details.otras-salidas')?.open;
  box.innerHTML=`<div class="statusrow"><span class="lab">Autorización</span>${badge}</div>${body}`;
  if(_abierto){ const d=box.querySelector('details.otras-salidas'); if(d) d.open=true; }
  // Inicializar display de descuento tras render
  if(Q.estado==='pendiente'&&(Q.rol==='autorizador'||_selfAuth)){
    updPrecioAuth(parseFloat($('a-precio')?.value)||0, totals().neto);
  }
}

/* ----- Los tres pasos de la entrega -----
   Eran siete botones apilados, todos del mismo ancho y del mismo peso: los tres que se hacen
   siempre, dos salidas que se usan a veces, uno que es volver atrás y uno que cierra la
   cotización y abre otra. Y ninguno decía si ya se había hecho, así que el vendedor generaba
   el PDF, se iba a WhatsApp, volvía, y la pantalla estaba idéntica.

   Ahora son tres renglones en el orden en que se hacen, cada uno con su fecha cuando ya está.
   El único con relleno es el primero que falta —«un solo botón lleva color en cada pantalla»,
   y aquí ese botón es literalmente lo que sigue—; los hechos se quedan neutros con su
   palomita y siguen tocables, porque un PDF se reimprime y un chat se vuelve a abrir. Cuando
   los tres están puestos no queda ninguno con relleno: la cotización está entregada y no hay
   nada que empujar. */
/* ¿Este aparato arma el documento del cliente en Canva? El pliegue de «otras salidas» nace
   abierto si alguna vez se copió una cotización para allá. Es la diferencia entre esconderle
   una función a quien la usa todos los días y no enseñársela a quien no la ha usado nunca: la
   constancia ya se guardaba —`marcarPropuesta` la escribe desde que existe el botón— y hasta
   ahora nadie la leía en ningún sitio. */
function _hayPropuestas(){ try{ return Object.keys(getPropuestas()).length>0; }catch(_){ return false; } }
function entregaHTML(){
  const h=hitosDe(Q.folio);
  const primero=HITOS.find(x=>!h[x.k]);
  return HITOS.map(x=>{
    const ts=h[x.k];
    const toca=primero&&primero.k===x.k;
    /* Tres estados y tres pesos. El que TOCA lleva el relleno de marca, que es el único de la
       pantalla: «un solo botón lleva color, el que hace lo que se vino a hacer», y aquí ese
       botón es literalmente el siguiente paso. Los que todavía no tocan conservan su propia
       tinta —el verde de WhatsApp, el aguamarina de la venta— porque así se encuentran sin
       gritar, que es para lo que se les dio. El que ya está se va a neutro con su palomita.

       El hecho se dice con la palomita y la fecha, no cambiando el nombre del botón: quien
       vuelva a tocarlo tiene que seguir sabiendo qué hace. */
    return `<button class="btn hito ${ts?'btn-gho hito-hecho':(toca?'btn-pri':x.cls)}" onclick="${x.fn}">`
      +(ts?`<svg class="svgi hito-ok" aria-hidden="true"><use href="#i-check"/></svg>`
          :`<svg class="svgi" aria-hidden="true"><use href="#${x.ico}"/></svg>`)
      +` ${x.label}`
      +(ts?`<small class="hito-fecha">${esc(x.hecho)} · ${esc(hitoFecha(ts))}</small>`
          :(toca&&x.pista?`<small class="hito-pista">${esc(x.pista)}</small>`:''))
      +`</button>`;
  }).join('');
}

/* ----- Formulario de revisión del precio -----
   Uno solo, usado por el autorizador desde su cola y por el atajo «Autorizar yo
   mismo» dentro de la vista de vendedor. `soloAutorizar` quita el botón de rechazar:
   rechazarte a ti mismo no significa nada, para eso está volver a editar. */
function authRevisionHTML(soloAutorizar){
  const neto=totals().neto;
  const ia=Q.itemsAuth||{};
  /* Los ajustes por partida son montos SIN IVA (igual que lineTotal), mientras que
     el "precio final autorizado" es lo que paga el cliente CON IVA. Antes se
     comparaban entre sí y eso pintaba un descuento fantasma del 16% que quedaba
     aplicado con solo apretar Autorizar. */
  const authSub=Q.items.reduce((s,it)=>{const v=ia[it.id];return s+(v!==undefined?v:lineTotal(it));},0);
  const authNeto=Q.iva?authSub*1.16:authSub;
  /* Sin redondear. Al redondear el total calculado a pesos enteros, una cotización de
     $17,585.60 abría el formulario proponiendo $17,586 y se anunciaba sola como
     «Aumento: $0.40» antes de que nadie tocara nada. El precio propuesto tiene que ser
     exactamente el calculado; redondear es una decisión del autorizador, no del
     formulario. */
  /* Lo tecleado manda sobre lo calculado: si el autorizador ya escribió un precio, el
     formulario tiene que volver a pintarlo con ése y no con el total. Ver _paDraft. */
  const paTecleado=paBorrador();
  const paCurrent=paTecleado!==null?paTecleado
    :(Q.precioAuth>0&&Math.abs(Q.precioAuth-neto)>0.01)?Q.precioAuth:+authNeto.toFixed(2);
  const itemRows=Q.items.map((it,i)=>{
    const orig=lineTotal(it);
    const authVal=ia[it.id]!==undefined?ia[it.id]:orig;
    /* Abierto porque tiene un ajuste puesto, o porque el autorizador lo abrió a mano para
       comparar. Lo segundo no se recordaba, y el formulario se reconstruye entero en cada
       repintado: abrir tres renglones, teclear el precio final y verlos cerrarse todos. */
    const isOpen=_authAbiertas.has(it.id)||(ia[it.id]!==undefined&&Math.abs(ia[it.id]-orig)>0.01);
    const diff=authVal-orig;
    const diffTxt=Math.abs(diff)<0.01?'':(diff<0?'Descuento: '+money(-diff):'Aumento: '+money(diff));
    const diffCls=diff>0.01?' inc':'';
    return '<div class="ia-row">'+
      '<div class="ia-hdr" '+_ABRIBLE+' aria-expanded="'+(isOpen?'true':'false')+'" aria-controls="ia-body-'+it.id+'" onclick="toggleItemAuth('+it.id+')">'+
      '<div class="ia-num">'+(i+1)+'</div>'+
      '<div class="ia-desc">'+esc(shortDescAuth(it))+'</div>'+
      '<div class="ia-calc">'+money(orig)+'</div>'+
      '<span class="ia-arrow" id="ia-arrow-'+it.id+'" aria-hidden="true">'+(isOpen?'▾':'▸')+'</span>'+
      '</div>'+
      '<div class="ia-body" id="ia-body-'+it.id+'" style="'+(isOpen?'':'display:none')+'">'+
      '<label for="ia-in-'+it.id+'" style="font-size:11px;margin-bottom:4px">Precio autorizado</label>'+
      '<div class="inp-money"><input id="ia-in-'+it.id+'" type="number" inputmode="decimal" min="0" step="50" value="'+authVal+'" oninput="updItemAuth('+it.id+',+this.value)"></div>'+
      '<div class="ia-adj'+diffCls+'" id="ia-adj-'+it.id+'">'+diffTxt+'</div>'+
      '</div>'+
      '</div>';
  }).join('');
  /* El nombre de quien autoriza se recuerda en el dispositivo: es siempre el mismo y
     se estaba tecleando en cada cotización. */
  return `<div class="auth-divider">Revisando · ${esc(Q.folio)}${Q.proy||Q.cliente?' — '+esc(Q.proy||Q.cliente):''}</div>
    <div class="fld">
      <label for="a-precio">Precio final autorizado ${Q.iva?'(con IVA)':'(sin IVA)'}</label>
      <div class="precio-auth-orig" style="font-size:11.5px;color:var(--muted);margin-bottom:4px">Total calculado: <b>${money(neto)}</b></div>
      <div class="inp-money"><input id="a-precio" type="number" inputmode="decimal" min="0" step="100" value="${paCurrent}" oninput="updPrecioAuth(+this.value,${neto})"></div>
      <div class="descuento-info" id="descuento-info"></div>
    </div>
    <div class="auth-divider" style="margin-top:8px">Ajuste por partida ${Q.iva?'· montos sin IVA':''}</div>
    ${itemRows}
    <div class="ia-total"><span>${Q.iva?'Subtotal ajustado':'Total ajustado'}</span><span id="ia-sum">${money(authSub)}</span></div>
    ${Q.iva?`<div class="ia-total soft"><span>Con IVA 16%</span><span id="ia-sum-neto">${money(authNeto)}</span></div>`:''}
    <div class="fld"><label for="a-name">Tu nombre (autorizador)</label><input id="a-name" autocomplete="off" placeholder="Ej. Elías" value="${esc(Q.autorizador||prefGet(PREF_AUTORIZADOR,''))}" oninput="Q.autorizador=this.value"></div>
    <!-- Los dos campos escriben en Q mientras se teclean, como el resto de los inputs
         generales: renderAuth reconstruye este formulario con innerHTML y cualquier
         repintado —plegar una partida, ajustar un precio— borraba lo que se llevaba
         escrito, sin nada que lo insinuara. -->
    <div class="fld"><label for="a-note">Nota (opcional)</label><textarea id="a-note" placeholder="Comentario para el vendedor…" oninput="Q.nota=this.value">${esc(Q.nota||'')}</textarea></div>
    <button class="btn btn-ok" onclick="autorizar()"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg> Autorizar precio</button>
    ${soloAutorizar
      ? '<button class="btn btn-gho" onclick="cancelarAutoAutorizacion()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Volver a editar</button>'
      : '<button class="btn btn-dgr" onclick="rechazar()">Rechazar</button>'}`;
}

function updPrecioAuth(pa, neto){
  /* Antes que nada, quedarse con lo tecleado: es lo que sobrevive al siguiente
     repintado del formulario. Va fuera del early return de abajo porque borrar el
     campo —dejarlo en cero— también es algo que el autorizador acaba de escribir. */
  paBorradorSet(pa);
  const el=$('descuento-info'); if(!el) return;
  const d=neto-pa;
  if(!pa||pa<=0||neto<=0||Math.abs(d)<0.01){ el.textContent=''; el.classList.remove('inc'); return; }
  if(d>0){ el.textContent=`Descuento: ${money(d)} (${Math.round(d/neto*100)}%)`; el.classList.remove('inc'); }
  else   { el.textContent=`Aumento: ${money(-d)} (${Math.round(-d/neto*100)}%)`; el.classList.add('inc'); }
}

/* ===================== Revisión previa: partidas sin terminar =====================
   Una partida de letras sin material vale $0 —el precio se multiplica por el precio
   del material—, y hasta aquí está bien: la partida lo dice en ámbar mientras se
   captura. Lo que faltaba era el momento de decirlo. `solicitar()` solo miraba que el
   total fuera mayor a cero, así que bastaba con que OTRA partida tuviera precio para
   que la incompleta pasara el filtro, se autorizara y saliera en el PDF como un
   renglón normal, con su descripción bien redactada, en $0.00.

   El cálculo de qué falta ya existía: es el mismo `faltantesDe()` del que salen la
   fórmula de la partida —«Faltan: material, altura»— y la ficha ámbar de su cara
   plegada. Aquí solo se usa en el momento en que importa. Si no falta nada, no agrega ni
   un toque al flujo. */
function partidasSinTerminar(){
  return Q.items
    .map((it,i)=>({n:i+1,it,faltan:faltantesDe(it),vacia:itemVacio(it)}))
    .filter(x=>x.faltan.length);
}
let _faltSeguir=null;
/* Corre `accion` salvo que haya partidas sin terminar; si las hay, las enseña primero.
   `etiqueta` es lo que dirá el botón de continuar de todos modos. */
function revisarAntesDe(accion,etiqueta){
  const pend=partidasSinTerminar();
  if(!pend.length){ accion(); return; }
  _faltSeguir=accion;
  $('falt-seguir').textContent=etiqueta;
  pintarFaltantes(pend);
  $('faltmodal').classList.add('show');
}
function pintarFaltantes(pend){
  const n=pend.length;
  $('falt-intro').innerHTML=`${n===1?'Esta partida está':'Estas '+n+' partidas están'} sin terminar y ${n===1?'vale':'valen'} <b>$0</b>. Tal como ${n===1?'está saldría':'están saldrían'} en el PDF como ${n===1?'un renglón':'renglones'} en $0.00. Toca ${n===1?'la partida':'una'} para ir a completarla.`;
  $('falt-list').innerHTML=pend.map(x=>`<div class="falt-row">
      <button class="falt-ir" onclick="irAPartida(${x.it.id})">
        <span class="falt-n">${x.n}</span>
        <span class="falt-b">
          <span class="falt-t">${esc(TIPO_NOMBRE[x.it.tipo]||'Partida')}${x.it.desc?' · '+esc(x.it.desc):''}</span>
          <span class="falt-d">${x.vacia?'Está completamente vacía':'Falta '+esc(x.faltan.join(', '))}</span>
        </span>
      </button>
      ${x.vacia&&puedeQuitarVacia()?`<button class="falt-quitar" onclick="quitarDesdeFaltantes(${x.it.id})">Quitar</button>`:'<span class="falt-go">›</span>'}
    </div>`).join('');
}
function cerrarFaltantes(){ $('faltmodal').classList.remove('show'); _faltSeguir=null; }
function faltSeguir(){
  const f=_faltSeguir;
  $('faltmodal').classList.remove('show'); _faltSeguir=null;
  if(f) f();
}
/* Ir a una partida: se despliega antes de traerla a la vista, porque podría estar
   plegada —en cualquier pantalla— y llevarte a un encabezado no resuelve nada.

   Si el aviso salió al autorizar, la cotización ya está bloqueada: para poder
   corregirla hay que reabrirla, que es exactamente lo que significa volver a tocar las
   partidas. El autorizador es el único que no la reabre —revisar no es editar—; para
   él el aviso solo señala dónde está el hueco. */
function llevarAPartida(id){
  _plegadas.delete(id);
  renderItems();
  requestAnimationFrame(()=>{ irA('p-'+id); enfocarHueco(id); });
}
/* ----- Y al llegar, el cursor en el hueco -----
   Para los tres datos del cliente el aviso abre lo plegado y pone el cursor DENTRO del campo
   (`irACampoProy`); para una partida solo hacía scroll al marco, y el vendedor tenía que
   recorrer los tres grupos otra vez buscando cuál quedó en ámbar. Peor: lo primero que ve al
   llegar es Descripción, que es justo el único campo que no cuenta en lo que falta. Las dos
   cosas salen del mismo aviso, así que la misma barra conducía hasta el campo cuando faltaba
   la dirección y te soltaba en el marco cuando faltaba el material.

   El orden ya lo sabe la app: es el de `resumenPartida`, el mismo que dice la fórmula. Se
   busca primero un grupo de opciones en ámbar y si no hay, el primer campo vacío de los que
   cuentan para ese tipo. La guarda de `disabled` no sobra: esto también corre por el camino
   del autorizador y sobre partidas congeladas, donde los chips salen con `aria-disabled` y
   sin `tabindex` y no hay nada que enfocar; ahí se queda el scroll de siempre. */
const _HUECOS={letras:['h-','n-'],recorte:['h-','n-'],bastidor:['an-','al-'],caja:['an-','al-','ta-'],manual:['pz-','pu-']};
function enfocarHueco(id){
  const caja=$('p-'+id); if(!caja) return;
  const chip=caja.querySelector('.optgrp.falta .chip[tabindex]');
  if(chip){ try{ chip.focus({preventScroll:true}); }catch(_){} return; }
  const it=Q.items.find(x=>x.id===id); if(!it) return;
  for(const pre of (_HUECOS[it.tipo]||[])){
    const el=$(pre+id);
    if(el&&!el.disabled&&!String(el.value||'').trim()){
      try{ el.focus({preventScroll:true}); }catch(_){ el.focus(); }
      return;
    }
  }
}
function irAPartida(id){
  $('faltmodal').classList.remove('show'); _faltSeguir=null;
  if(locked()&&Q.rol!=='autorizador') reabrir();
  llevarAPartida(id);
}
/* ¿Se puede quitar aquí una partida vacía? El aviso sale en dos momentos y en los dos el
   precio todavía NO está autorizado —`solicitar()` con la cotización en borrador y
   `autorizar()` con ella en pendiente—, así que quitar un renglón en blanco es gratis en
   los dos. Lo que sí se respeta es de quién es la cotización: el autorizador revisa la de
   otro, y revisar no es editar; y una cotización sin los datos del cliente se lee, no se
   toca. Antes se preguntaba por `capturaBloqueada()`, que incluye el candado del precio y
   por eso apagaba el botón justo en el camino de «Autorizar yo mismo». */
function puedeQuitarVacia(){ return Q.rol!=='autorizador'&&!faltanDatosCliente()&&Q.estado!=='autorizada'; }
/* Quitar una partida vacía sin salir del aviso: si quedan otras, la lista se repinta;
   si era la última pendiente, se sigue con lo que se iba a hacer. */
function quitarDesdeFaltantes(id){
  const f=_faltSeguir;
  delItem(id,{vacia:true});
  const pend=partidasSinTerminar();
  if(pend.length){ pintarFaltantes(pend); return; }
  $('faltmodal').classList.remove('show'); _faltSeguir=null;
  if(f&&Q.items.length&&totals().sub>0) f();
  else toast('Listo — ya no quedan partidas sin terminar','ok',3000);
}

/* ===================== Datos obligatorios del cliente =====================
   Antes bastaba con el cliente O el proyecto para mandar a autorizar, y el teléfono no
   se pedía nunca. El resultado eran cotizaciones autorizadas con las que después no se
   podía hacer nada: sin nombre no se sabe de quién es, sin proyecto no se distingue de
   las otras tres del mismo cliente y sin teléfono no hay a dónde mandarla por
   WhatsApp —el botón de compartir existe justamente para eso—.

   Los tres se piden ANTES de la primera partida —ver «El candado de las partidas», más
   abajo— y se vuelven a exigir al mandar a autorización, que es el punto donde el precio
   se bloquea. Es el mismo requisito preguntado en el único momento en que sale gratis
   —cuando todavía no hay nada capturado— y confirmado en el último en el que corregirlo
   sigue siendo barato.

   Una sola lista para los tres: la usan el aviso de «qué falta» de la barra de
   progreso, el freno al continuar y el marcado en ámbar de los huecos. */
/* Dos nombres por campo. El largo es el de las frases —«faltan el nombre del cliente y el
   proyecto»—, donde hace falta decir de quién es el nombre y de quién el teléfono. El corto
   es para la barra fija del celular, que mide poco más de 200 px: con el nombre largo, «el
   teléfono completo (10 dígitos)» se cortaba en «Falta el teléfono completo (…» y se comía
   justo la mitad que sirve. El detalle no se pierde, lo dice el aviso al tocarla. */
const OBLIGATORIOS=[
  {campo:'f-cli', caja:'fld-cli', llave:'cliente', nombre:'el nombre del cliente',  corto:'el cliente'},
  {campo:'f-tel', caja:'fld-tel', llave:'tel',     nombre:'el teléfono del cliente',corto:'el teléfono'},
  {campo:'f-proy',caja:'fld-proy',llave:'proy',    nombre:'el proyecto',            corto:'el proyecto'}
];
/* Diez dígitos es un celular mexicano sin lada de país —lo mismo que ya pide
   `telWhatsApp` para armar el enlace—. Se cuentan dígitos y no formato: «33 1234 5678»,
   «3312345678» y «+52 33 1234 5678» son todos válidos. Un «33» a medias no lo es: un
   teléfono incompleto engaña más que un teléfono vacío, porque parece capturado. */
function telIncompleto(t){ return String(t||'').replace(/\D/g,'').length<10; }
function datosFaltantes(){
  return OBLIGATORIOS.filter(c=>c.llave==='tel'?telIncompleto(Q.tel):!(Q[c.llave]||'').trim());
}
/* El teléfono tiene dos huecos distintos y conviene distinguirlos: no es lo mismo
   «falta el teléfono» que «lo que escribiste no alcanza a ser un teléfono». */
function faltaTexto(c){
  if(c.llave!=='tel') return c.nombre;
  return (Q.tel||'').trim()?'el teléfono completo (10 dígitos)':c.nombre;
}
/* «a, b y c» — un «a, b, c» seco se lee como un formulario, no como una frase. */
function listaY(arr){
  if(arr.length<2) return arr[0]||'';
  return arr.slice(0,-1).join(', ')+' y '+arr[arr.length-1];
}
/* El ámbar de los huecos aparece solo después de que la falta ya frenó algo: pintar de
   ámbar una cotización recién abierta sería regañar por no haber empezado. Una vez
   encendido se apaga campo por campo conforme se llenan, desde `upd`. */
let _marcarOblig=false;
function pintarObligatorios(){
  const faltan=_marcarOblig?datosFaltantes():[];
  OBLIGATORIOS.forEach(c=>{
    const caja=$(c.caja), inp=$(c.campo);
    const mal=faltan.includes(c);
    if(caja) caja.classList.toggle('falta',mal);
    if(inp){ if(mal) inp.setAttribute('aria-invalid','true'); else inp.removeAttribute('aria-invalid'); }
  });
}
/* Devuelve true si se puede seguir. Si no, dice qué falta, lo marca y deja el cursor en
   el primer hueco: enterarse de que falta algo sin que te lleven ahí es la mitad del
   trabajo.

   El motivo va por parámetro porque ahora hay dos momentos que exigen lo mismo —capturar
   partidas y mandar a autorización— y la frase tiene que decir cuál de los dos frenó: un
   «faltan el teléfono y el proyecto» sin más deja al vendedor buscando qué fue lo que
   tocó. Lo que se exige es idéntico en los dos; lo único distinto es la primera mitad de
   la oración. */
function exigirDatosCliente(motivo,opts){
  const faltan=datosFaltantes();
  _marcarOblig=faltan.length>0;
  pintarObligatorios();
  if(!faltan.length) return true;
  const lista=listaY(faltan.map(faltaTexto));
  toast(`${motivo||'Antes de mandar a autorización'} ${faltan.length===1?'falta':'faltan'} ${lista}.`,'err',4600);
  /* `llevar:false` para los frenos que nacen DENTRO de una partida. irACampoProy no solo
     sube la pantalla: además ESCRIBE la preferencia de plegado en el dispositivo. Cambiar
     una preferencia guardada porque alguien rozó un chip mientras leía es desproporcionado,
     y arrastrarle la pantalla hasta arriba a media lectura es peor que no contestar. Los
     botones que de verdad conducen —agregar, duplicar, la IA— sí llevan. */
  if(!opts||opts.llevar!==false) irACampoProy(faltan[0].campo);
  return false;
}

/* ===================== El candado de las partidas =====================
   Una cotización se captura de arriba abajo, pero nada obligaba a hacerlo: se podía
   llenar la cotización entera —cinco partidas, materiales, medidas— y llegar hasta el
   final sin haber escrito de quién era. El freno estaba solo al mandar a autorización,
   o sea al final, que es donde corregir cuesta más: para entonces el trabajo ya está
   capturado y lo que falta es justo lo que nadie recuerda —el teléfono del cliente— con
   el cliente ya colgado.

   Ahora los tres datos se piden ANTES de la primera partida. Es el mismo requisito de
   siempre, movido al principio: no se agrega un requisito nuevo, se adelanta el que ya
   existía al único momento en que preguntarlo es gratis, que es cuando todavía no se
   ha capturado nada.

   Un solo candado para TODO lo que mete datos en una partida —agregarla, duplicarla,
   la IA, el escalador, el vectorizador y cada campo de una partida ya escrita—, porque
   dejar una sola de esas puertas abierta convierte la restricción en un adorno. Se abre
   solo, en el momento en que se termina de escribir el último de los tres: no hay que
   guardar, ni recargar, ni apretar nada. */
/* «Hay algo capturado del cliente que se perdería.» Es la otra mitad de la guarda que
   protege el trabajo en pantalla al abrir o duplicar del historial: esa guarda solo
   miraba las partidas, y eso era razonable cuando el cliente y las partidas compartían
   pantalla. Ya no. El paso 1 OBLIGA a capturar cliente, teléfono y proyecto antes de que
   pueda existir la primera partida, así que «cliente puesto, cero partidas» dejó de ser
   un caso raro: es el estado normal a mitad de captura, y era justo el hueco. El vendedor
   capturaba al cliente, abría el historial para ver qué le cotizó la vez pasada, y el
   teléfono que acababa de pedir desaparecía sin una palabra. */
function hayDatosCliente(){
  return [Q.cliente,Q.tel,Q.proy,Q.dirRaw,Q.direccion,Q.maps].some(v=>String(v||'').trim());
}
function faltanDatosCliente(){ return datosFaltantes().length>0; }
/* Los dos candados que tiene una partida, en una sola pregunta: el viejo —el precio ya
   está autorizado— y el nuevo —todavía no se sabe de quién es la cotización—. Los dos
   significan lo mismo para un campo de partida: no se toca. Van juntos en una función
   para que no vuelva a haber una lista de sitios donde se preguntó solo por uno. */
function capturaBloqueada(){ return locked()||faltanDatosCliente(); }
/* La versión que habla, para los botones. `locked()` ya trae su propio aviso en cada
   sitio, así que aquí solo se atiende el candado nuevo. */
function exigirDatosParaPartidas(opts){
  if(locked()) return true;
  return exigirDatosCliente('Antes de capturar partidas',opts);
}
/* Lo mismo desde el escalador o el vectorizador, que viven en un modal encima de la
   página: el aviso deja el cursor en el campo que falta, y un campo enfocado detrás de
   un modal no sirve de nada. Se cierra primero y se avisa después. */
function exigirDatosDesdeModal(cerrar){
  if(locked()||!faltanDatosCliente()) return true;
  if(typeof cerrar==='function') cerrar();
  exigirDatosCliente('Antes de capturar partidas');
  return false;
}
/* ===================== Las dos pantallas =====================
   Cliente y partidas dejaron de compartir pantalla. Son dos momentos distintos de la misma
   llamada —de quién es esto, y qué le vamos a hacer— y verlos juntos obligaba a leer el
   doble para atender uno solo.

   Vive fuera de Q a propósito: es cómo se está viendo la app en este momento, no un dato de
   la cotización. No se guarda, no viaja al historial y no sale en el PDF. Al recargar se
   deduce de lo que hay: con los tres datos puestos se abre en partidas —estabas cotizando—,
   sin ellos en cliente, que es donde toca empezar. */
let _pantalla='cliente';
function pantallaSegunDatos(){ return (!faltanDatosCliente()||locked()||Q.rol==='autorizador')?'partidas':'cliente'; }
function irAPantalla(cual,opts){
  /* Ir a partidas pasa por el mismo filtro que capturarlas: la pestaña no es una puerta de
     servicio. Al revés —volver a cliente— nunca se frena: corregir un dato es justo lo que
     se viene a hacer. */
  /* El autorizador no captura: su cola de pendientes vive en el panel de la derecha, que
     solo existe en esta pantalla. Exigirle el cliente de una cotización que no es suya lo
     dejaba encerrado sin puerta. Escribir sigue frenado por capturaBloqueada(). */
  if(cual==='partidas'&&Q.rol!=='autorizador'&&!(opts&&opts.forzar)&&!exigirDatosParaPartidas()) return false;
  /* Cualquier cambio de pantalla que no venga de tocar una pestaña olvida la que se pidió.
     irAPaso fija el pedido DESPUÉS de llamar aquí, así que el orden se respeta solo. */
  _pasoPedido=null;
  _pantalla=cual;
  pintarPantalla();
  /* Arriba de todo: cambiar de pantalla a media página deja al usuario mirando el hueco por
     el que venía bajando, no el principio de lo que acaba de abrir. */
  if(!opts||opts.subir!==false) window.scrollTo({top:(opts&&opts.y!=null)?opts.y:0,behavior:'auto'});
  if(!opts||opts.hist!==false) sincronizarHistorial(!!(opts&&opts.forzar));
  /* Contesta si de verdad se movió. Lo lee `irAPaso`: los pasos 3 y 4 viven en la pantalla
     de partidas, así que si el candado del paso 1 frenó el salto, ahí se acaba el camino y
     el aviso que ya salió es todo lo que hay que decir. */
  return true;
}
/* El ÚNICO sitio que escribe el historial de las pantallas.
   Los pasos 3 y 4 no llevan entrada propia a propósito: no son otra pantalla, son dos sitios de
   la misma columna (index.html lo explica donde se dibuja la barra), y darles escalón obligaría
   a dar tres golpes de atrás para salir de una cotización que solo tuvo una pantalla. */
let _pilaPendiente=false;
function sincronizarHistorial(forzar){
  /* Mientras la entrada de arriba es de una capa —o su history.back() sigue en vuelo, que es lo
     que delata history.state.capa— aquí no se escribe: reescribirla la dejaría sin forma de
     cerrarse, y empujar encima se lo comería ese back(). Se apunta y se termina después. */
  if(_capaDeArriba()||(history.state&&history.state.capa)){ _pilaPendiente=true; return; }
  _pilaPendiente=false;
  const st=history.state;
  try{
    if(forzar||!st||!st.cot){ history.replaceState({cot:1,pantalla:_pantalla,y:0},''); return; }
    if(st.pantalla===_pantalla){ history.replaceState({...st,pantalla:_pantalla},''); return; }
    /* Se sella el scroll de la pantalla que se abandona ANTES de empujar la nueva, para que el
       atrás devuelva a donde se estaba mirando y no al principio. */
    history.replaceState({...st,y:window.scrollY},'');
    history.pushState({cot:1,pantalla:_pantalla,y:0},'');
  }catch(_){}
}
function continuarAPartidas(){ irAPantalla('partidas'); }
/* ===================== Los cuatro pasos del proceso =====================
   Una cotización pasa por cuatro momentos y hasta ahora la app solo nombraba dos.
   `pasoActual()` contesta «en cuál estoy» y `siguientePaso()` contesta «qué sigue»; de esas
   dos salen la barra de pasos, el renglón de «qué falta» del resumen y la barra fija del
   teléfono, así que las tres no pueden contradecirse. Antes cada una lo decidía por su
   cuenta y por eso la barra de completitud se apagaba en el 100 % justo cuando la barra
   fija seguía ofreciendo un paso más. */
const PASOS=[{n:1,nombre:'Cliente'},{n:2,nombre:'Partidas'},{n:3,nombre:'Precio'},{n:4,nombre:'Entrega'}];
function pasoDerivado(){
  if(_pantalla==='cliente') return 1;
  if(Q.estado==='autorizada') return 4;
  /* El autorizador no captura: su trabajo es el precio, con cola cargada o sin ella. */
  if(Q.rol==='autorizador') return 3;
  if(Q.estado==='pendiente'||Q.estado==='rechazada') return 3;
  return 2;
}
/* La barra de pasos contestaba con UNA sola función dos preguntas que no son la misma: «en qué
   punto está la cotización» y «qué pestaña estoy mirando». La primera se deriva del estado, y por
   eso, con la cotización ya autorizada, tocar «2 · Partidas» dejaba la pestaña 4 encendida y la 2
   parpadeando: la barra contestaba la pregunta que nadie le hizo. Medido: pasoActual() devolvía 4
   antes y después de tocar la 2 y la 3.

   Ahora `pasoDerivado()` sigue diciendo dónde está la cotización —de ahí salen las palomitas de
   «hecho» y los ámbares de «todavía no», que no pueden mentir— y `_pasoPedido` guarda la pestaña
   que un dedo tocó. Es cómo se está MIRANDO la pantalla, no un dato de la cotización: no se
   guarda, no viaja al historial y no sale en el PDF, igual que `_pantalla`.

   Caduca sola. Guarda junto al número el paso derivado del instante en que se tocó, así que en
   cuanto la cotización se mueve —se autoriza, se suelta la autorización, se vacía— el pedido deja
   de valer y la barra vuelve a decir la verdad sin que nadie tenga que acordarse de limpiarlo. */
let _pasoPedido=null;
function pasoActual(){
  return (_pasoPedido&&_pasoPedido.base===pasoDerivado()) ? _pasoPedido.n : pasoDerivado();
}
/* La caducidad se cobra aparte y no dentro de pasoActual(): el getter se llama en cada tecla de
   los tres campos obligatorios, y un getter que muta es un sitio donde nadie espera un efecto. */
function caducarPedido(){
  if(_pasoPedido&&_pasoPedido.base!==pasoDerivado()) _pasoPedido=null;
}

/* ¿Hay ya un trabajo con precio que se pueda autorizar? Es la misma pregunta que decide los
   dos botones del panel, escrita una sola vez para que la pestaña 3 no pueda decir que sí
   mientras el botón dice que no. */
function hayTrabajoCotizado(){ return Q.items.length>0&&totals().sub>0; }
/* Tocar una pestaña. El 1 y el 2 son pantallas de verdad; el 3 y el 4 son los dos momentos
   que viven en la columna del dinero de la pantalla 2, y llevan ahí. Ninguna se deshabilita:
   la que todavía no toca contesta qué falta, porque un botón gris no explica nada. */
/* Partida en dos porque son dos cosas: llevar, que puede no conseguirlo, y contar a dónde se
   llegó. Devuelve el paso al que de verdad se llegó, o 0 si no se movió — y solo cuando se
   movió se enciende la pestaña, que es lo que hacía que tocar una pestaña frenada la dejara
   parpadeando. */
function _llevarAlPaso(n){
  if(n===1){ irAPantalla('cliente'); return 1; }
  if(!irAPantalla('partidas')) return 0;
  if(n===2) return 2;
  if(!hayTrabajoCotizado()){
    toast('Antes del precio hace falta una partida con precio mayor a cero.','err',3600);
    irA(Q.items.length?'items':'addbtn');
    return 0;
  }
  if(n===4&&Q.estado!=='autorizada'){
    toast(Q.estado==='pendiente'?'La entrega se abre cuando el precio queda autorizado.'
                                :'Primero autoriza el precio.','err',3600);
    /* Y se corrige el destino, que es lo que faltaba: #entrega solo lo pinta renderAuth con la
       cotización autorizada, así que el camino real acababa en la columna del dinero —el paso
       3— mientras la barra seguía diciendo 4. El aviso ya decía que la entrega no toca; ahora
       la pestaña dice dónde se quedó. */
    n=3;
  }
  /* Cada paso a su sitio. Los dos acababan en el mismo scroll al principio de la columna, así
     que tocar «4 · Entrega» sobre una cotización autorizada dejaba mirando el IVA. */
  if(n===4&&$('entrega')) _anclarPaso('entrega');
  else if(n===3&&$('authbox')&&Q.estado!=='borrador') _anclarPaso('authbox');
  else _anclarPaso('sidebox');
  return n;
}
function irAPaso(n){
  caducarPedido();
  const d=_llevarAlPaso(n);
  if(!d) return;
  _pasoPedido={n:d,base:pasoDerivado()};
  pintarPasos();
  renderMobileBar();
  /* Quien no ve la pantalla no se entera de que se movió: el cambio de pestaña no mueve el
     foco, así que sin esto un lector de pantalla se queda anunciando el botón que se tocó.
     La plataforma ya lo hacía en js/app.js:163-168; esto es lo mismo de este lado. */
  voz('Paso '+d+' de 4 · '+PASOS[d-1].nombre);
}
/* El renglón chico de cada pestaña. Lleva solo lo que no se puede leer en otra parte de la
   pantalla: el cliente que se dejó atrás, la cuenta de partidas cuando se está en el paso 1,
   la cola del autorizador y —esto es lo nuevo— qué le falta a la entrega, que no estaba
   escrito en ningún sitio. La pestaña en la que estás no lleva nada: lo que hay que saber
   de ella lo tienes en la pantalla. */
function subPasos(){
  const act=pasoActual();
  const s={1:'',2:'',3:'',4:''};
  /* El nombre del cliente va debajo del paso EN EL QUE ESTÁS, y no debajo del 1. Antes vivía
     fijo en el paso 1 y funcionaba con dos pestañas; con cuatro no cabe en un teléfono, y en
     el corte angosto las pestañas que no son la actual se quedan en su número. Puesto en la
     actual, el dato que hay que no perder de vista —de quién es esto— sigue al vendedor por
     todo el proceso, se ve igual en el teléfono y en el escritorio, y deja de aparecer dos
     veces en la misma barra. En el paso 1 no va: ahí se está tecleando. */
  if(act!==1) s[act]=(Q.cliente||'').trim();
  /* Las demás llevan solo lo que esa pestaña sabe y no dice nada más de la pantalla. */
  if(act===1&&Q.items.length) s[2]=Q.items.length+(Q.items.length===1?' partida':' partidas');
  if(Q.rol==='autorizador'&&act!==3){
    const n=getQueue().filter(x=>x.estado==='pendiente').length;
    if(n) s[3]=n+' por revisar';
  }
  if(Q.estado==='autorizada'&&act!==4){
    const h=hitosDe(Q.folio);
    const f=[!h.pdf&&'PDF',!h.wa&&'WhatsApp',!h.venta&&'la venta'].filter(Boolean);
    s[4]=f.length?'falta '+listaY(f):'entregada';
  }
  return s;
}
/* Qué sigue después de la pantalla del cliente. Vivía dentro de renderMobileBar y por eso solo
   la barra del teléfono decía la verdad: el botón del escritorio (#p1-btn) es marcado estático y
   nada reescribía su texto, así que sobre una cotización ya autorizada seguía ofreciendo
   «Continuar a partidas» —el paso 2— cuando lo que faltaba era la entrega. Dos sitios que
   contestaban la misma pregunta y solo uno se había arreglado. Ahora es una. */
function vueltaDelPaso1(){
  return Q.estado==='autorizada' ? {txt:'Volver a la entrega',paso:4}
    : (Q.estado==='pendiente'||Q.estado==='rechazada') ? {txt:'Volver al precio',paso:3}
    : {txt:'Continuar a partidas',paso:2};
}
function pintarCierrePaso1(){
  const b=$('p1-btn'); if(!b) return;
  const v=vueltaDelPaso1();
  const t=esc(v.txt)+' <span aria-hidden="true">→</span>';
  if(b.innerHTML!==t) b.innerHTML=t;
  b.onclick=()=>irAPaso(v.paso);
}
function pintarPantalla(){
  const enCliente=_pantalla==='cliente';
  const w=$('wrap'); if(w) w.classList.toggle('p-cliente',enCliente);
  const proy=$('card-proy'), part=$('card-partidas'), side=$('sidebox'), cierre=$('p1-cierre');
  if(proy)   proy.hidden=!enCliente;
  if(cierre) cierre.hidden=!enCliente;
  if(part)   part.hidden=enCliente;
  if(side)   side.hidden=enCliente;
  pintarPasos();
  pintarCierrePaso1();
  /* La barra fija del celular cambia de contenido con la pantalla —«Continuar» en la del
     cliente, el total y «Autorizar yo mismo» en la de partidas—, así que se repinta aquí.
     Sin esto se quedaba con la de la pantalla anterior hasta que otra cosa la repintara:
     un «Continuar a partidas» flotando sobre las partidas ya abiertas. */
  renderMobileBar();
}
/* La barra de pasos: en cuál estás, cuáles están hechos y cuál todavía no toca.

   Un paso está HECHO cuando lo que produce ya está —el 1 con los tres datos del cliente, el
   2 con una partida con precio, el 3 con el precio autorizado, el 4 con las tres cosas de la
   entrega puestas—, y entonces cambia su número por la palomita. Está EN ESPERA, en ámbar,
   cuando todavía no le toca. Ninguno se deshabilita: tocar el que no toca dice qué falta,
   que es la mitad del trabajo; un botón gris no explica nada. */
function pintarPasos(){
  caducarPedido();
  const act=pasoActual();
  const faltaCli=faltanDatosCliente()&&!locked();
  const cotizado=hayTrabajoCotizado();
  const autorizada=Q.estado==='autorizada';
  const h=autorizada?hitosDe(Q.folio):null;
  const hecho={1:!faltaCli, 2:cotizado, 3:autorizada, 4:!!(h&&h.pdf&&h.wa&&h.venta)};
  const espera={1:false, 2:faltaCli, 3:!cotizado, 4:!autorizada};
  const sub=subPasos();
  PASOS.forEach(p=>{
    const t=$('tab-'+p.n); if(!t) return;
    const esta=act===p.n, ok=hecho[p.n]&&!esta;
    t.classList.toggle('on',esta);
    t.classList.toggle('hecho',ok);
    t.classList.toggle('espera',!esta&&espera[p.n]);
    t.setAttribute('aria-current',esta?'step':'false');
    /* El nombre accesible, escrito. En el corte angosto las pestañas que no son la actual
       esconden su `.tx` para que las cuatro caigan en 320 px, y su número es `aria-hidden`
       porque es decoración del dibujo: sin esto, tres de las cuatro se anunciaban «botón» y a
       secas. Va también el renglón chico, que es donde vive el nombre del cliente y lo que le
       falta a la entrega — y el estado, que un lector de pantalla no ve en el color. */
    const etiq='Paso '+p.n+' de 4 · '+p.nombre+(sub[p.n]?' · '+sub[p.n]:'')
      +(esta?'':ok?' · hecho':espera[p.n]?' · todavía no':'');
    if(t.getAttribute('aria-label')!==etiq) t.setAttribute('aria-label',etiq);
    const n=$('tab-'+p.n+'-n'); if(n) n.textContent=ok?'':String(p.n);
    /* Solo si cambió: la barra se repinta en cada tecla de los tres obligatorios, y
       reescribir un nodo de texto vivo le repite la misma frase al oído a quien teclea. */
    const sb=$('tab-'+p.n+'-sub');
    if(sb){ const v=sub[p.n]||''; if(sb.textContent!==v) sb.textContent=v; }
  });
}

/* Pintar el candado: la ficha ámbar de la tarjeta de Partidas y el repintado de las
   partidas cuando el candado se abre o se cierra.

   Va colgado de updProg() y no de renderItems() a propósito: updProg corre en CADA
   tecla de los tres campos —es de donde ya viven la barra de completitud y el ámbar de
   los huecos— y renderItems no. Si colgara de renderItems, el candado se abriría al
   siguiente repintado y no al terminar de escribir, que es cuando el vendedor está
   mirando. */
let _candCerrado=null;   // null = todavía no se ha pintado nunca
let _candPintando=false; // renderItems vuelve a entrar aquí; se pinta, pero no se reacciona dos veces
/* La app siempre ha arrancado con una partida en blanco. Con el candado puesto esa
   siembra no se puede hacer, así que queda pendiente y se hace en cuanto el candado se
   abre —ver Q.sinEstrenar—. Es UNA sola vez, y por eso se pregunta por «nunca ha tenido
   una» y no por «no tiene ninguna ahora»: con la segunda regla, un vendedor que borra a
   propósito la última partida y luego se va a corregir el teléfono se la encontraba de
   vuelta al terminar de escribirlo, sin haber pedido nada. Sembrar lo que nunca nació es
   ayudar; resucitar lo que alguien acaba de borrar es no hacerle caso. */
function pintarCandadoPartidas(){
  const cerrado=!locked()&&faltanDatosCliente();
  /* El paso 2 no existe hasta que el 1 esté completo: ni la fila de herramientas ni los
     botones de agregar. Lo que ya estuviera capturado se queda a la vista —congelado— y
     los repinta renderItems, que vive fuera de este envoltorio. */
  /* La otra manera de llegar al paso 2 sin poder escribir en él: que el precio ya esté
     cerrado. Con la barra de cuatro pasos, la pestaña «2 · Partidas» pasó a ser la puerta
     obvia para volver a mirar el trabajo de una cotización autorizada —y hay que poder
     mirarlo, que leer nunca estuvo prohibido—, pero al llegar quedaban «+ Agregar partida» y
     «Igual que la anterior» apagados y sin nada que dijera por dónde se destraba: «Editar
     partidas» vive en la columna del resumen, que en el teléfono cae debajo de todas las
     partidas. Un botón que se queda a la vista para negarse sigue diciendo «esto ya se
     puede», así que se van, y en su lugar queda una sola cosa tocable con la puerta escrita.
     Escalar y vectorizar SÍ se quedan: medir no es capturar, y eso ya estaba decidido. */
  const congelado=locked()&&!Q.editMode;
  const tools=$('paso2-tools'), addrow=$('paso2-addrow');
  if(tools) tools.hidden=cerrado;
  if(addrow) addrow.hidden=cerrado||congelado;
  pintarPasos();
  const box=$('cand-partidas');
  if(box){
    box.hidden=!cerrado&&!congelado;
    const txt=$('cand-partidas-txt');
    if(congelado&&!cerrado&&txt){
      const frase=Q.estado==='autorizada'?'El precio está autorizado · editar partidas'
        :Q.estado==='rechazada'?'Rechazada · editar y volver a enviar'
        :'Mandada a autorización · volver a editar';
      if(txt.textContent!==frase) txt.textContent=frase;
    }
    else if(cerrado&&txt){
      /* Una línea y nada más. Antes llevaba encima una frase en negritas —«Primero, de quién
         es la cotización»— que decía con palabras lo que ya dice el «2» en ámbar del
         encabezado: que este paso todavía no toca. Y los nombres van en corto: «faltan el
         nombre del cliente, el teléfono del cliente y el proyecto» repite «del cliente» dos
         veces para nombrar tres campos que están a diez centímetros, con su etiqueta puesta.
         Las frases largas se quedan para el aviso de la autorización, que es donde no hay
         una pantalla al lado que las haga obvias. */
      const faltan=datosFaltantes();
      const frase=(faltan.length===1?'Falta ':'Faltan ')+listaY(faltan.map(c=>c.corto));
      /* Solo si cambió: es una región viva, y reescribirla en cada letra del nombre del
         cliente le repite la misma frase al oído a quien está tecleando. */
      if(txt.textContent!==frase) txt.textContent=frase;
    }
  }
  /* La barra fija del celular nombra el hueco que falta, así que se repinta en cada tecla
     y no solo cuando el candado cambia de estado: si no, se quedaría diciendo «Falta el
     teléfono» con el teléfono ya escrito hasta que otra cosa la repintara. */
  if(!_candPintando) renderMobileBar();
  if(_candCerrado===cerrado||_candPintando){ _candCerrado=cerrado; return; }
  /* La primera vez no se reacciona: las partidas se acaban de pintar leyendo el candado
     vivo desde bodyFor, así que ya salieron bien. Repintarlas aquí sería un render de más
     en cada arranque. */
  const primera=_candCerrado===null;
  const abrio=_candCerrado===true&&!cerrado;
  _candCerrado=cerrado;
  if(primera) return;
  _candPintando=true;
  try{
    /* Al abrirse el candado, la cotización se queda con la partida en blanco con la que
       siempre ha arrancado la app: al arrancar bloqueada esa partida no se pudo crear, y
       sin esto el vendedor que acaba de llenar los tres datos se queda mirando una tarjeta
       de Partidas vacía. No se le lleva el foco: se está tecleando en el proyecto. */
    let creada=null;
    if(abrio&&Q.sinEstrenar&&!Q.items.length&&!locked()) creada=addItem({enfocar:false,heredar:true});
    else renderItems();
    /* Sin esto, quien usa lector de pantalla no se entera de que el candado se abrió: la
       ficha ámbar desaparece y una región que se va no anuncia nada. Cortés y no urgente,
       porque se está tecleando el último de los tres datos. */
    /* El `!locked()` no sobra: _candCerrado es de la pantalla, no de la cotización, así que
       al abrir un pendiente de la cola la transición se calcula contra la cotización
       anterior y `abrio` se dispara porque ahora manda el candado del precio. Sin esto, al
       autorizador se le anunciaba «Ya puedes capturar partidas» justo encima de una
       cotización que está congelada precisamente para que no las capture. */
    if(abrio&&!locked()) voz('Ya puedes capturar partidas'+(creada?' — se agregó la partida 1':''));
    /* Y al cerrarse también. La ficha ámbar aparece, pero una región que se enciende con
       `hidden` no anuncia nada al aparecer, así que quien no la ve se encontraba con una
       tarjeta que dejó de responder sin que nada lo dijera. */
    /* `_pantalla!=='cliente'` porque en la pantalla del cliente #card-partidas está en hidden:
       la ficha ámbar que esta frase narra no está a la vista, y los tres campos que faltan sí
       lo están, con su asterisco y ya nombrados por updProg. Corrigiendo un teléfono se cruza
       la frontera de «incompleto» al borrar y otra vez al reteclear, así que este aviso salía
       dos veces por corrección para describir algo invisible. */
    else if(cerrado&&_pantalla!=='cliente') voz('Las partidas quedan bloqueadas: '+
      (datosFaltantes().length===1?'falta ':'faltan ')+listaY(datosFaltantes().map(c=>c.corto)));
  } finally { _candPintando=false; }
}

/* ===================== Flujo ===================== */
function solicitar(){
  if(!exigirDatosCliente()) return;
  if(!Q.items.length||totals().sub<=0){toast('Agrega al menos una partida con precio mayor a cero.','err',3200);return;}
  revisarAntesDe(solicitarConfirmado,'Solicitar de todos modos');
}
function solicitarConfirmado(){
  Q.estado='pendiente'; pushToQueue(); saveState(); renderItems(); toast('Solicitud enviada · precio bloqueado','ok');
}
/* ----- Autorizar sin cambiar de rol -----
   El flujo de vendedor → autorizador está pensado para dos personas y se queda tal
   cual. Lo que sobraba era representarlo cuando eres tú en los dos papeles: solicitar,
   cambiar el rol de arriba, escribir tu nombre, autorizar y volver a cambiar el rol.
   Este atajo abre el MISMO formulario de revisión —precio final y ajuste por partida—
   dentro de la vista de vendedor, sin tocar Q.rol. Como es el mismo formulario, no hay
   dos maneras de autorizar que puedan contradecirse.

   Vive fuera de Q a propósito: es cómo se está viendo la pantalla en este momento, no
   un dato de la cotización, así que no se guarda ni viaja al historial. */
let _selfAuth=false;
/* ----- El precio final que se está tecleando -----
   Vive aquí por la misma razón que `Q.autorizador` y `Q.nota` empezaron a escribirse en
   cada tecla: renderAuth reconstruye el formulario entero con innerHTML, así que
   cualquier repintado —plegar una partida, tocar un chip, que cambie el resumen— borra
   lo que se llevara escrito. Los otros dos campos ya estaban resueltos; éste no, y era
   el único que lleva dinero: el autorizador escribía 45 000, plegaba una partida para
   revisar algo, y el campo volvía al total calculado sin decir nada. Autorizar ahí
   dejaba Q.precioAuth en cero y la venta se cerraba a precio completo.

   No se escribe en Q.precioAuth porque ése es «el precio ya autorizado», y lo leen
   precioFinal(), authVigente() y el resumen: teclear un descuento no puede aplicarlo
   antes de que alguien apriete Autorizar. Va con su folio para que un borrador no se
   pueda colar en otra cotización; se limpia al cerrar la revisión, que es cuando
   Q.precioAuth pasa a ser la verdad. */
let _paDraft=null;   // {folio, val} — nunca es el precio autorizado, solo lo tecleado
/* Los renglones del formulario de revisión que están abiertos, con el mismo patrón que
   `_plegadas` usa para las partidas: es cómo se está viendo la pantalla, no un dato de la
   cotización, así que no se guarda ni viaja al historial. */
const _authAbiertas=new Set();
function paBorrador(){ return (_paDraft&&_paDraft.folio===Q.folio)?_paDraft.val:null; }
function paBorradorSet(v){ _paDraft={folio:Q.folio,val:v}; }
function paBorradorLimpiar(){ _paDraft=null; _authAbiertas.clear(); }
function autorizarYoMismo(){
  if(Q.estado==='borrador'){
    /* El atajo pasa por el mismo filtro que solicitar: autorizarse a uno mismo no es
       una puerta de servicio para saltarse los datos del cliente. */
    if(!exigirDatosCliente()) return;
    if(!Q.items.length||totals().sub<=0){toast('Agrega al menos una partida con precio mayor a cero.','err',3200);return;}
    /* Se pasa por «pendiente» y por la cola igual que el flujo normal: así el estado y
       el registro de la cola nunca dependen de por cuál de los dos caminos se llegó. */
    Q.estado='pendiente'; pushToQueue(); saveState();
  }
  _selfAuth=true;
  renderItems();
  irAResumen();
}
function cancelarAutoAutorizacion(){ _selfAuth=false; reabrir(); }
function reabrir(){
  const eraPendiente=Q.estado==='pendiente';
  const habiaPrecio=paBorrador()!==null||!!(Q.nota||'').trim()||!!(Q.autorizador||'').trim();
  Q.estado='borrador'; Q.autorizador=''; Q.nota=''; _selfAuth=false; paBorradorLimpiar();
  /* El precio autorizado NO se tira aquí. Ya no hace falta: precioFinal() e itemPrecio()
     solo lo usan cuando el estado es 'autorizada', y soltarAuthSiCambio() lo borra en
     cuanto una partida cambia. Tirarlo de entrada convertía cualquier salto a una partida
     —el aviso de «partidas sin terminar» reabre para poder editarla— en la pérdida
     silenciosa de todos los ajustes que el autorizador acababa de capturar. */
  if(eraPendiente) removeFromQueue(Q.folio);
  saveState(); renderItems();
  /* Decir todo lo que hizo. Este mismo `reabrir()` se dispara sin que nadie lo pida cuando
     desde el aviso de partidas sin terminar se toca una partida, y lo que se lleva por el
     camino —la solicitud de la cola, el nombre y la nota de quien iba a autorizar, y el
     precio que llevaba escrito— se anunciaba como «reabierta para editar». */
  toast('Cotización reabierta para editar'
    +(eraPendiente?' — se canceló la solicitud':'')
    +(habiaPrecio?(eraPendiente?' y el precio que llevabas escrito':' — se borró el precio que llevabas escrito'):''));
}
/* Autorizar es el momento en que el precio se vuelve el que se cobra: es aquí donde
   conviene avisar de las partidas sin terminar, sin importar por cuál de los dos
   caminos se llegó. Por eso el atajo «Autorizar yo mismo» no revisa nada al abrirse:
   ahí todavía no se compromete nada. */
function autorizar(){ revisarAntesDe(autorizarConfirmado,'Autorizar de todos modos'); }
function autorizarConfirmado(){
  const nombre=($('a-name')?.value||'').trim();
  Q.autorizador=nombre||prefGet(PREF_AUTORIZADOR,'');
  if(nombre) prefSet(PREF_AUTORIZADOR,nombre);
  Q.nota=($('a-note')?.value||'').trim();
  _selfAuth=false;
  const neto=totals().neto;
  const pa=parseFloat($('a-precio')?.value)||0;
  Q.precioAuth=(pa>0&&Math.abs(pa-neto)>0.01)?pa:0;
  paBorradorLimpiar();   // a partir de aquí manda Q.precioAuth, no lo que se tecleó
  /* Queda registrado SOBRE QUÉ se autorizó este precio. Es lo que después permite notar
     que el trabajo cambió, sin depender de que nadie apriete «Guardar». */
  sellarAuth();
  Q.estado='autorizada';
  Q.fechaAuth=new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
  confirmarFolio(Q.folio); // el contador de cotizaciones solo avanza al autorizar
  updateQueueEntry(Q.folio,{estado:'autorizada',precioAuth:Q.precioAuth,autorizador:Q.autorizador,nota:Q.nota,fechaAuth:Q.fechaAuth,itemsAuth:Q.itemsAuth,huellaAuth:Q.huellaAuth});
  const guardada=guardarEnHistorial();
  /* Solo si el historial DE VERDAD la recibió. Cuando no cupo, la cola es la única copia que
     queda del folio, el precio autorizado y quién lo autorizó; soltarla ahí los perdía para
     siempre, y encima en el instante irreversible. */
  if(guardada) removeFromQueue(Q.folio);
  saveState(); renderItems();
  /* toast() es UN solo elemento y estas escrituras ocurren en el mismo tick: el último gana.
     Un «✓ guardada en historial» incondicional borraba justo el aviso de que no se guardó
     —con su botón de Respaldar—, que es el único momento en que se podía rescatar. Si algo
     falló, el que se queda es el que lo dice. */
  const _r=respaldoEstado();
  if(guardada&&_saveOk&&_r.vencido) toast('✓ Autorizada · '+(_r.sinRespaldar||_r.total)+' sin respaldar en este teléfono','',6000,{label:'Respaldar',fn:()=>respaldar()});
  else if(guardada&&_saveOk) toast('✓ Cotización autorizada — guardada en historial','ok',3200);
  else if(guardada) toast('Autorizada y guardada, pero la cotización en curso ya no cabe en este teléfono — respalda y borra cotizaciones viejas','err',9000,{label:'Respaldar',fn:()=>respaldar()});
}
function rechazar(){
  const nombre=($('a-name')?.value||'').trim();
  Q.autorizador=nombre||prefGet(PREF_AUTORIZADOR,'');
  if(nombre) prefSet(PREF_AUTORIZADOR,nombre);
  Q.nota=($('a-note')?.value||'').trim();
  Q.estado='rechazada'; _selfAuth=false; paBorradorLimpiar();
  /* Rechazar borra el borrador de precio que el formulario dejó escrito en Q mientras se
     teclaba: si no, un ajuste que se decidió NO aprobar se quedaba guardado y volvía a
     aparecer propuesto la próxima vez que se abriera la cotización. */
  Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth='';
  updateQueueEntry(Q.folio,{estado:'rechazada',autorizador:Q.autorizador,nota:Q.nota,precioAuth:0,itemsAuth:{},huellaAuth:''});
  /* Una rechazada no se lista ni ocupa folio: se va de la cola con todo su snapshot. */
  removeFromQueue(Q.folio);
  saveState(); renderItems(); toast('Cotización rechazada','err');
}
function pedirConfNueva(){
  const box=$('authbox');
  const LABELS={borrador:'Borrador',pendiente:'Pendiente de autorización',autorizada:'Autorizada',rechazada:'Rechazada'};
  const badge=`<span class="badge ${Q.estado}"><span class="dot"></span>${LABELS[Q.estado]}</span>`;
  box.innerHTML=`<div class="statusrow"><span class="lab">Autorización</span>${badge}</div>
    <div style="background:var(--red-bg);border:1.5px solid rgba(216,69,63,.3);border-radius:var(--r-sm);padding:13px">
      <p style="font-size:13px;font-weight:600;color:var(--red);margin-bottom:11px">¿Borrar toda la cotización y empezar de nuevo? Vas a tener unos segundos para deshacerlo.</p>
      <button class="btn btn-dgr" onclick="nueva()"><svg class="svgi" aria-hidden="true"><use href="#i-basura"/></svg> Sí, borrar todo</button>
      <button class="btn btn-gho" style="margin-top:9px" onclick="renderAuth()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Cancelar</button>
    </div>`;
}
/* ----- Vaciar, con vuelta atrás -----
   Borrar UNA partida por accidente ya tenía Deshacer y funciona bien. Borrar la
   cotización completa —que duele mucho más— solo tenía un «¿seguro?», y un «sí» de
   más se llevaba todo lo capturado. Se guarda una copia de lo que había para poder
   devolverla desde el mismo aviso.

   Solo se ofrece cuando de verdad había algo: en una cotización en blanco el botón
   sería ruido, y la partida con el material heredado no cuenta como algo capturado. */
let _vaciada=null;
/* Las OTRAS dos puertas por las que se pierde el borrador en pantalla. `nueva()` protege el
   suyo desde hace tiempo —copia de Q, del contador de partidas y del escalador, y «Deshacer»
   siete segundos—; abrir o duplicar una del historial hacía exactamente lo mismo al borrador
   y solo tenía el `confirm()` del navegador, que es una sola oportunidad de decir no y
   ninguna de arrepentirse. Y como el folio cambia, la pila de Ctrl+Z se corta ahí: no quedaba
   ninguna vía de recuperación.

   El `scSnapshot()` no es opcional: las dos llaman a `scReset()` inmediatamente después, y sin
   él «Deshacer» devolvería la cotización sin la foto ni las cotas de las que salieron sus
   partidas — que es el mismo error que `nueva()` ya arregló una vez. */
function guardarParaDeshacer(){
  const habia=Q.items.some(it=>!itemVacio(it))||hayDatosCliente();
  const scAntes=scSnapshot();
  _vaciada=(habia||scAntes)?{q:JSON.parse(JSON.stringify(Q)),pid,rol:Q.rol,sc:scAntes}:null;
  return !!_vaciada;
}
function nueva(){
  /* La copia la hace `guardarParaDeshacer()`, que es la misma de las otras dos puertas: aquí
     vivía escrita aparte y con una condición más estrecha —solo miraba el cliente y el
     proyecto—, así que un borrador con el teléfono y la dirección puestos y nada más se
     vaciaba sin ofrecer vuelta atrás. Una regla, un sitio. */
  guardarParaDeshacer();
  Q.proy=Q.cliente=Q.tel=Q.direccion=Q.maps=Q.dirRaw='';Q.items=[];Q.iva=true;Q.estado='borrador';Q.autorizador=Q.nota='';Q.aiFile=null;Q.anti=0;Q.antiManual=false;Q.precioAuth=0;Q.itemsAuth={};Q.huellaAuth='';
  Q.entrecalles=Q.entrega=Q.notaCliente=Q.fechaAuth=''; Q.plazoK=null;
  Q.editMode=false; _selfAuth=false; Q.sinEstrenar=true;
  Object.values(_FM).forEach(id=>{if($(id))$(id).value='';});
  // Una cotización en blanco no arranca regañada: el ámbar se apaga con ella.
  _marcarOblig=false;
  $('f-anti').value='';
  updDirRaw('');
  updMaps('');
  Q.folio=nextFolio(); pintarFolio();
  Q.fecha=hoy();
  scReset();
  addItem({enfocar:false,heredar:true}); aplicarFoldProy();
  /* Una cotización en blanco empieza donde empieza: por el cliente. */
  irAPantalla('cliente',{forzar:true});
  if(_vaciada) toast(_vaciada.sc&&_vaciada.sc.items.length
      ? 'Cotización vaciada — y las '+_vaciada.sc.items.length+' medidas del escalador'
      : 'Cotización vaciada','',7000,{label:'Deshacer',fn:deshacerVaciado});
  else toast('Nueva cotización lista');
}
function deshacerVaciado(){
  if(!_vaciada) return;
  /* El rol es de quien está usando la app, no de la cotización: se respeta el actual
     igual que al abrir un pendiente de la cola. */
  const rolActual=Q.rol;
  Object.assign(Q,_vaciada.q);
  Q.rol=rolActual;
  Q.editMode=false; _selfAuth=false;
  pid=Math.max(pid,_vaciada.pid||0);
  const scVuelve=_vaciada.sc;
  _vaciada=null;
  if(scVuelve) scRestaurar(scVuelve);
  Object.entries(_FM).forEach(([k,id])=>{ if($(id)) $(id).value=Q[k]||''; });
  updDirRaw(Q.dirRaw||''); updMaps(Q.maps||'');
  $('f-anti').value=Q.anti||'';
  sincronizarPlegado();
  pintarFolio(); aplicarFoldProy(); saveState(); renderItems();
  irAPantalla(pantallaSegunDatos(),{forzar:true});
  toast('Cotización restaurada','ok');
}

/* ===================== Barra de acción de abajo (móvil) =====================
   Repite en el pie de la pantalla las dos cosas que en el celular quedaban hasta el
   fondo de la página: cuánto va la cotización y cuál es el siguiente paso. El botón
   es el mismo del panel de autorización, así que nunca se contradicen. */
/* ----- El total late cuando cambia -----
   Es el número que se viene a mirar, y un número que se reescribe sin avisar no se nota:
   quien está capturando no sabe si el material que acaba de tocar movió el precio o no. El
   latido dura lo que un parpadeo y solo ocurre cuando el importe cambia de verdad —no en
   cada repintado— porque una pantalla que se mueve sola todo el tiempo cansa. */
let _netoPrev=null;
function latirTotal(){
  const el=$('s-neto'); if(!el) return;
  const ahora=el.textContent;
  if(_netoPrev!==null&&_netoPrev!==ahora){
    el.classList.remove('cambio');
    void el.offsetWidth;          // reinicia la animación: sin esto solo late la primera vez
    el.classList.add('cambio');
  }
  _netoPrev=ahora;
}
function renderMobileBar(){
  const bar=$('mbar'); if(!bar) return;
  /* En el teléfono éste es el único deshacer que hay —el de la barra de arriba se esconde a
     partir de 920 px justo para no partir esa fila—, y va primero por lo mismo que un
     «atrás»: es a la izquierda donde se busca. */
  const undo=puedeDeshacer()
    ? `<button class="mbar-undo" onclick="deshacer()" title="Deshacer el último cambio" aria-label="Deshacer el último cambio">${ico('i-deshacer')}</button>`
    : '';
  /* En la pantalla del cliente la barra fija es el botón de continuar: ahí no hay total que
     mirar todavía, y el «Autorizar yo mismo» de más abajo es de la otra pantalla. */
  if(_pantalla==='cliente'){
    /* Siempre «Continuar», nunca «Falta el cliente»: en esta pantalla los tres campos están
       a la vista con su asterisco, así que nombrar el hueco aquí es decir lo que ya se ve.
       La acción es una sola, y si falta algo lo dice al tocarla, con el cursor puesto.

       Lo que sí cambia es a dónde se vuelve. Esta rama no miraba el estado, así que quien
       abría una cotización autorizada del historial y tocaba el paso 1 para corregir el
       teléfono antes de mandarla se quedaba con «Continuar a partidas» como único siguiente
       paso, sobre unas partidas congeladas: la pieza que este proyecto encarga de nombrar el
       paso real en el teléfono volvía a decir algo que no era. */
    const vuelta=vueltaDelPaso1();
    bar.innerHTML=undo+`<button class="mbar-btn" style="width:100%" onclick="irAPaso(${vuelta.paso})">${esc(vuelta.txt)} <span aria-hidden="true">→</span></button>`;
    return;
  }
  const pf=precioFinal(), aj=ajusteAuth(), hayAjuste=Q.estado==='autorizada'&&Math.abs(aj)>0.01;
  const lab=hayAjuste?'Precio autorizado':(Q.iva?'Total neto':'Total');
  let btn;
  if(Q.rol==='autorizador'){
    btn=Q.estado==='pendiente'
      ? `<button class="mbar-btn ok" onclick="irAResumen()">Revisar precio</button>`
      : `<button class="mbar-btn gho" onclick="irAResumen()">Ver cola</button>`;
  } else if(Q.estado==='pendiente'){
    /* Autorizándote a ti mismo, el siguiente paso es cerrar el precio; si la solicitud
       va para alguien más, el único paso propio es volver a editarla. */
    btn=_selfAuth
      ? `<button class="mbar-btn ok" onclick="autorizar()"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg> Autorizar</button>`
      : `<button class="mbar-btn gho" onclick="reabrir()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Editar</button>`;
  } else if(Q.estado==='autorizada'){
    if(Q.editMode){
      btn=`<button class="mbar-btn ok" onclick="guardarCambiosEdicion()"><svg class="svgi" aria-hidden="true"><use href="#i-guardar"/></svg> Guardar</button>`;
    } else {
      /* Decía «Generar PDF» para siempre, así que después de generarlo seguía ofreciendo lo
         que ya se hizo y nunca nombraba los dos pasos que faltaban. Ahora avanza con la
         entrega, y cuando los tres están puestos deja de empujar: lleva al resumen, que es
         lo que se viene a mirar de una cotización ya cerrada. */
      const h=hitosDe(Q.folio), falta=HITOS.find(x=>!h[x.k]);
      btn=falta
        ? `<button class="mbar-btn" onclick="${falta.fn}"><svg class="svgi" aria-hidden="true"><use href="#${falta.ico}"/></svg> ${esc(falta.label)}</button>`
        : `<button class="mbar-btn gho" onclick="irAResumen()"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg> Entregada</button>`;
    }
  } else if(Q.estado==='rechazada'){
    btn=`<button class="mbar-btn gho" onclick="reabrir()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Editar</button>`;
  } else if(!locked()&&faltanDatosCliente()){
    /* Mientras el candado está puesto, esta barra pintaba «Autorizar yo mismo» gris y
       muerto, que es lo contrario de conducir. En el celular la columna del resumen —con la
       barra de completitud, que es la que dice qué falta— se va debajo de las partidas, así
       que esta barra fija es lo único que puede nombrar el siguiente paso mientras se mira
       la tarjeta de Partidas. */
    const f=datosFaltantes()[0];
    btn=`<button class="mbar-btn" onclick="irAlCandado()">${esc('Falta '+f.corto)} ›</button>`;
  } else {
    const listo=Q.items.length>0&&totals().sub>0;
    btn=`<button class="mbar-btn" ${listo?'':'disabled'} onclick="autorizarYoMismo()"><svg class="svgi" aria-hidden="true"><use href="#i-rayo"/></svg> Autorizar yo mismo</button>`;
  }
  bar.innerHTML=undo+`<button class="mbar-tot" onclick="irAResumen()" title="Ir al resumen">
      <span class="mbar-lab">${lab}<span class="chev">▾</span></span>
      <span class="mbar-amt${hayAjuste&&aj>0?' desc':''}">${money(pf)}</span>
    </button>${btn}`;
}

/* ===================== Datos del proyecto plegables (móvil) =====================
   Los datos del proyecto se capturan al principio y después solo estorban: plegados
   dejan las partidas hasta arriba, que es donde se trabaja el resto de la cotización.
   La preferencia se recuerda en el dispositivo. */
let _foldProy=false;
function toggleFoldProy(){
  _foldProy=!_foldProy;
  aplicarFoldProy();
  try{ localStorage.setItem('al3d_fold_proy',_foldProy?'1':'0'); }catch(_){}
  if(_foldProy) irA('card-proy');
}
function aplicarFoldProy(){
  const card=$('card-proy'); if(!card) return;
  card.classList.toggle('folded',_foldProy);
  const btn=$('fold-proy-btn'), txt=$('fold-proy-txt');
  if(btn) btn.setAttribute('aria-expanded',_foldProy?'false':'true');
  if(txt){
    const resumen=[Q.cliente,Q.proy].map(s=>(s||'').trim()).filter(Boolean).join(' · ');
    txt.textContent=_foldProy?(resumen||'Sin capturar'):'Ocultar';
  }
}

/* ===================== Inputs generales ===================== */
function upd(k,v){
  undoJuntar('q:'+k);
  Q[k]=v; saveState(); updProg();   // updProg ya repinta el encabezado plegado
  if(k==='cliente') autocompletarCliente(v);
  /* Los dos campos que dicen de quién es esto son los dos que pueden destapar un cuaderno. */
  if(k==='cliente'||k==='tel') actualizarAvisoCuaderno();
}
/* El saveState() faltaba: era el único campo de la cotización que se escribía en Q y no se
   guardaba. Se pegaba el link, se recargaba —o iOS descartaba la pestaña— y el link no
   estaba; volvía solo si algo más disparaba un guardado después. Y sin él, deshacer tampoco
   veía el cambio: lo que se registra pasa por aquí. */
function updMaps(v){ undoJuntar('q:maps'); Q.maps=(v||'').trim(); saveState(); const ok=/^https?:\/\//i.test(Q.maps); const b=$('mapsbtn'); b.disabled=!ok;
  /* Un botón que se niega sin decir por qué manda a adivinar, y el motivo es casi siempre
     el mismo: se pegó el link sin «https://». El hermano de arriba ya tenía su nota. */
  b.title=(!ok&&Q.maps)?'Pega el link completo, empezando con https://':'';
  const h=$('maps-hint'); if(h) h.style.display=(!ok&&Q.maps)?'':'none'; }
function abrirMaps(){ if(/^https?:\/\//i.test(Q.maps)) window.open(Q.maps,'_blank','noopener'); }
function dirRawMapsUrl(){ return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((Q.dirRaw||'').trim()); }
function updDirRaw(v){
  undoJuntar('q:dirRaw');
  Q.dirRaw=(v||'').trim(); saveState();
  const show=!!Q.dirRaw;
  $('dir-raw-actions').style.display=show?'flex':'none';
  $('dir-raw-hint').style.display=show?'':'none';
}
function abrirDirRaw(){ if(Q.dirRaw) window.open(dirRawMapsUrl(),'_blank','noopener'); }
function copiarLinkDirRaw(){
  if(!Q.dirRaw) return;
  copiarTexto(dirRawMapsUrl(),'Link de Maps copiado · listo para compartir');
}
/* El IVA mueve el total un 16%, así que va bajo el mismo candado que las partidas. Era la
   única función que movía el precio sin pedir permiso: en una cotización ya autorizada, un
   toque en este interruptor —que está justo encima del subtotal— le cambiaba el total al
   PDF, al WhatsApp, al anticipo y a la comisión, sin tocar el sello de «Autorizada por…». */
function toggleIva(e){
  if(e)e.preventDefault();
  if(locked()){ toast('La cotización está bloqueada — usa «Editar partidas» para cambiar el IVA','err',4200); return; }
  /* renderItems repinta los totales por partida, suelta la autorización si dejó de
     corresponder (en renderSummary) y guarda al final; renderAuth refresca el panel. */
  Q.iva=!Q.iva; renderItems(); renderAuth();
}
function setRol(r){
  Q.rol=r;
  document.querySelectorAll('#roleseg button').forEach(b=>b.classList.toggle('on',b.dataset.rol===r));
  segAria('#roleseg button');
  aplicarBlurPrecios();
  renderAuth(); renderMobileBar();
  /* La barra de pasos también: el «N por revisar» que va debajo del paso 3 es de la cola del
     autorizador, así que al cambiar de rol se quedaba con la cuenta del rol anterior. */
  pintarPasos();
  /* Y se guarda. `Q.rol` sí se serializa —entra en el `...rest` de saveState— pero nada
     escribía al cambiarlo, así que el autorizador que elegía su rol y no tecleaba nada más
     volvía al día siguiente como vendedor, sin su cola. */
  saveState();
}
/* ----- Cambiar de rol lleva a la pantalla de ese rol -----
   `setRol` repintaba el panel y la barra fija y nada más. Si la app estaba en la pantalla del
   cliente —lo normal en un aparato en blanco, y lo que deja `nueva()`— `#sidebox` está en
   `hidden`, así que la cola del autorizador se pintaba dentro de un elemento invisible: el
   jefe elegía «Autorizador» y lo único que veía era una barra fija que decía «Continuar a
   partidas», con toda su cola detrás de una pestaña que se llama Partidas y que él no captura
   nunca.

   El salto va en el camino del CLIC y no dentro de `setRol`, y eso importa: `init` llama a
   `setRol` dieciséis líneas antes de fijar `_pantalla`, así que metérselo dentro haría un
   `window.scrollTo` y un repintado de más en cada arranque, sobre una pantalla que todavía no
   está decidida. `{forzar:true}` sí hace falta: sin él, un autorizador en un aparato con una
   cotización sin los tres datos se topa con el freno que es del vendedor. */
function cambiarRol(r){
  setRol(r);
  irAPantalla(pantallaSegunDatos(),{forzar:true,subir:false});
}
/* renderSummary reescribe «Resta al entregar», que si no se queda con el número del
   anticipo anterior mientras se teclea el nuevo. Respeta el foco, así que no pisa lo que
   se está escribiendo. */
/* Los tres campos que autocompletar puede rellenar apuntan cuándo los vació un dedo. */
[['f-tel','tel'],['f-dir-raw','dirRaw'],['f-maps','maps']].forEach(([id,k])=>{
  const el=$(id); if(el) el.addEventListener('input',()=>marcarVaciado(k,el.value));
});
$('f-anti').addEventListener('input',function(){undoJuntar('q:anti');Q.anti=parseFloat(this.value)||0;Q.antiManual=this.value.trim()!=='';saveState();renderSummary();});

