/* ============================================================================
   Cotizador · venta.js

   Registrar la venta: la fila para Notion, «esta cotización se ganó» hacia la plataforma y la vuelta a ella.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

// ----- Registrar Venta -----
/* Hoy en ISO. El <input type="date"> solo acepta YYYY-MM-DD, y armarlo con toISOString()
   sería un error de un día: eso convierte a UTC y en México, de la tarde en adelante,
   devuelve el día siguiente. Se arma con los campos locales. */
function hoyISO(){ const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
/* De 'YYYY-MM-DD' a 'DD/MM/YYYY', que es el formato de la columna de Notion. Se parte la
   cadena en vez de pasar por Date por lo mismo de arriba. */
function isoADmy(iso){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
  return m?m[3]+'/'+m[2]+'/'+m[1]:String(iso||''); }
function abrirRegistrarVenta(){
  // Si el autorizador ajustó el precio, se avisa aquí: la venta se registra por ese
  // precio, no por el calculado.
  const aj=ajusteAuth(), avisoEl=document.getElementById('rv-aviso-auth');
  if(avisoEl){
    if(Math.abs(aj)>0.01){
      avisoEl.textContent=(aj>0?'Precio autorizado con descuento de '+money(aj):'Precio autorizado con aumento de '+money(-aj))
        +' — la venta se registra por '+money(precioFinal())+'.';
      avisoEl.style.display='';
    } else avisoEl.style.display='none';
  }
  document.getElementById('rv-proyecto').value=(Q.cliente?Q.cliente+' - ':'')+Q.proy;
  /* En ISO, que es lo que un <input type="date"> entiende. Q.fecha está en es-MX y no se
     toca: es lo que se imprime en el PDF. */
  document.getElementById('rv-fecha').value=hoyISO();
  /* El de instalación NO se precarga: precargarlo con hoy es lo que agendaba cada venta
     para el mismo día. Vacío significa «todavía no se sabe», que es la verdad casi siempre
     en el momento de cobrar el anticipo. */
  document.getElementById('rv-fecha-inst').value='';
  document.getElementById('rv-iva').value=Q.iva?'Sí':'No';
  document.getElementById('rv-anticipo').value=Q.anti||0;
  /* La comisión y la cuenta casi nunca cambian y se volvían a poner en cada venta. */
  document.getElementById('rv-pct').value=prefGet(PREF_RV_PCT,'10');
  const selCuenta=document.getElementById('rv-cuenta');
  const cuentaPref=prefGet(PREF_RV_CUENTA,'');
  if(cuentaPref&&[...selCuenta.options].some(o=>o.value===cuentaPref)) selCuenta.value=cuentaPref;
  document.getElementById('rv-estatus').value='FABRICACION';
  document.getElementById('rv-copied').classList.remove('show');
  pintarPlazo();
  rvRecalc();
  document.getElementById('rv-modal-bg').classList.add('show');
}
function cerrarRegistrarVenta(){
  document.getElementById('rv-modal-bg').classList.remove('show');
}
function rvRecalc(){
  // Se registra lo que realmente se va a cobrar (precio autorizado), no el calculado.
  const t=desgloseFinal();
  const sub=t.sub, neto=t.neto;
  const anti=parseFloat(document.getElementById('rv-anticipo').value)||0;
  const pct=parseFloat(document.getElementById('rv-pct').value)||0;
  const estatus=document.getElementById('rv-estatus').value;
  const com=Math.round(sub*pct/100);
  const pend=estatus==='LIQUIDADO'?0:Math.max(0,neto-anti);
  document.getElementById('rv-sub-disp').textContent=money(sub);
  document.getElementById('rv-neto-disp').textContent=money(neto);
  document.getElementById('rv-com-disp').textContent=money(com);
  document.getElementById('rv-pend-disp').textContent=money(pend);
}
/* ----- Una sola cifra de anticipo -----
   Se capturaba en dos sitios. El de la columna del resumen escribe `Q.anti`, y de ahí salen el
   PDF, su hoja de recibo, el WhatsApp y el texto de Canva. El del modal de registrar venta se
   precargaba con esa misma cifra y NADIE la escribía de vuelta: corregirla ahí —que es cuando
   se pacta de verdad, al cobrar— movía la comisión y el pago pendiente que se registran, y
   dejaba el papel y el mensaje al cliente con el número viejo. Dos cifras para el mismo trato,
   sobre el mismo folio.

   Se escribe en los dos puntos que COMPROMETEN y no en cada tecla: el modal tiene «Cancelar»,
   y un write-through por teclazo convertiría un cierre por accidente en un cambio del papel.
   `antiManual` queda en true porque a partir de ahí la cifra la puso una persona y el 50 %
   automático no debe volver a pisarla. */
function rvComprometerAnticipo(){
  const v=parseFloat(document.getElementById('rv-anticipo').value)||0;
  if(Math.abs(v-(Q.anti||0))<0.01) return;
  Q.anti=v; Q.antiManual=true;
  saveState(); renderSummary();
  if(Q.estado==='autorizada') guardarEnHistorial();
  toast('Anticipo actualizado a '+money(v)+' — el PDF y el WhatsApp ya lo traen','',4200);
}
function copiarFilaVenta(){
  rvComprometerAnticipo();
  const t=desgloseFinal();
  const sub=t.sub, neto=t.neto;
  const proyecto=document.getElementById('rv-proyecto').value.trim();
  /* La columna de Notion es de tipo *date* con formato DD/MM/YYYY. El campo ya guarda ISO. */
  const fecha=isoADmy(document.getElementById('rv-fecha').value.trim());
  const iva=Q.iva?'Yes':'No';
  const anti=parseFloat(document.getElementById('rv-anticipo').value)||0;
  const pct=parseFloat(document.getElementById('rv-pct').value)||0;
  const cuenta=document.getElementById('rv-cuenta').value;
  const estatus=document.getElementById('rv-estatus').value;
  // Se recuerdan al registrar, que es cuando ya son la decisión buena.
  prefSet(PREF_RV_PCT,pct); prefSet(PREF_RV_CUENTA,cuenta);
  const com=Math.round(sub*pct/100);
  const pend=estatus==='LIQUIDADO'?0:Math.max(0,neto-anti);
  const liquidacion=estatus==='LIQUIDADO'?neto:'';
  const abonoComision=estatus==='LIQUIDADO'?com:0;
  const comRestante=estatus==='LIQUIDADO'?0:com;
  const fechaLiq=estatus==='LIQUIDADO'?fecha:'';
  // Orden de columnas idéntico al CSV de Ventas de Notion:
  // Proyecto | Abono Comision | Anticipo | Comision Restante | Comisiones | Cuenta | Estatus
  // Fecha Anticipo e Instalacion | Fecha Comision | Fecha Liquidacion | IVA | Liquidacion | Pago Pendiente | Precio Neto | Precio Subtotal
  const row=[
    proyecto,abonoComision,anti,comRestante,com,cuenta,estatus,
    fecha,'',fechaLiq,iva,liquidacion,pend,neto,sub
  ].join('\t');
  /* Copiar la fila para pegarla en Notion ES registrar la venta cuando no hay plataforma
     montada: el README dice que ese botón no se retira nunca, así que tampoco puede ser el
     único camino que deje la entrega marcada como pendiente para siempre. */
  marcarHito('venta');
  copiarTexto(row,'Fila copiada — pégala en la base Ventas - AL3D de Notion',()=>{ document.getElementById('rv-copied').classList.add('show'); });
}
/* ----- «Esta cotización se ganó» -----
   El evento que no existía en ningún sistema. El modal ya capturaba todo lo que hace falta
   —la fecha, la cuenta, el estatus, el anticipo, la comisión— y todo se iba al portapapeles:
   si alguien no pegaba la fila, no quedaba rastro de que la cotización se hubiera vendido.
   De ahí sale que la base de Notion tenga 199 proyectos sin una sola dirección y sin un
   solo tipo de trabajo: los datos que el cotizador SÍ tiene nunca llegaban.

   Aquí solo se deja constancia en una clave propia, `al3d_pf_ganadas`. La plataforma la
   recoge al abrir y la convierte en proyecto —con su dirección, su tipo derivado de las
   partidas y su material calculado—. Es una clave de localStorage y no una transacción de
   IndexedDB a propósito: este archivo no tiene módulos ni dependencias, y meterle una base
   de datos para escribir un renglón de constancia sería la inserción más frágil de las
   siete que se le hacen.

   El botón de copiar la fila se queda para siempre. Si la plataforma no está, si el
   teléfono es otro, si algo falla: pegar la fila a mano es el camino que ya funciona y no
   se retira. */
function registrarGanada(){
  rvComprometerAnticipo();
  const t=desgloseFinal();
  const g={
    folio:Q.folio,
    disp:dispositivo(),
    /* La huella del trabajo al momento de ganar. La plataforma la compara contra la
       cotización de hoy: si alguien edita las partidas después de vendida, el material
       calculado ya no corresponde y hay que decirlo en vez de comprar de más. */
    huella:Q.huellaAuth||'',
    /* La del campo de instalación, NO la del anticipo. Ver el comentario del modal. */
    fecha_instalacion:(document.getElementById('rv-fecha-inst').value||''),
    /* El plazo de taller si alguien lo eligió; null si no, y la plataforma lo propone igual
       que aquí, desde el tipo de trabajo. Se manda el elegido y no el propuesto para que del
       otro lado se sepa cuál de los dos es. */
    plazo_k:(Q.plazoK>=1&&Q.plazoK<=5)?Q.plazoK:null,
    cuenta:document.getElementById('rv-cuenta').value,
    estatus:document.getElementById('rv-estatus').value,
    pct_comision:parseFloat(document.getElementById('rv-pct').value)||0,
    sub:t.sub, neto:t.neto,
    anti:parseFloat(document.getElementById('rv-anticipo').value)||0,
    ts:Date.now()
  };
  try{
    const arr=JSON.parse(localStorage.getItem('al3d_pf_ganadas')||'[]');
    const lista=Array.isArray(arr)?arr:[];
    /* Apretar dos veces no crea dos proyectos. La plataforma también deduplica por folio,
       pero decirlo aquí evita que el segundo toque parezca que no hizo nada. */
    if(lista.some(x=>x&&x.folio===g.folio&&(x.disp||'')===g.disp)){
      /* Ya estaba registrada: el hito puede faltar si se registró antes de que existieran
         —o si el respaldo trajo las ganadas y no los hitos—, y lo que manda es el hecho. */
      marcarHito('venta');
      toast('Esta cotización ya estaba registrada como proyecto ganado','',3600,
        {label:'Abrir plataforma',fn:()=>{ irAPlataforma('proyectos'); }});
      return;
    }
    lista.push(g);
    localStorage.setItem('al3d_pf_ganadas',JSON.stringify(lista));
  }catch(_){
    /* Sin espacio o almacenamiento bloqueado. Se dice, y se ofrece lo único que sigue
       funcionando: la fila para pegar a mano. */
    toast('No hubo espacio para registrar el proyecto — copia la fila y pégala a mano','err',6000,
      {label:'Copiar fila',fn:copiarFilaVenta});
    return;
  }
  /* La guarda de obligatorios ya corrió para llegar aquí (el modal solo se abre con la
     cotización autorizada), así que si falta la fecha es porque el usuario la borró. No se
     frena por eso: un proyecto sin fecha aparece en la plataforma como «sin fecha», que es
     justo el aviso que hay que ver. */
  marcarHito('venta');
  const sinFecha=!g.fecha_instalacion;
  toast('Registrada como proyecto ganado'+(sinFecha?' — le falta la fecha de instalación':''),
    'ok',5200,{label:'Abrir plataforma',fn:()=>{ irAPlataforma(sinFecha?'agenda':'proyectos'); }});
}

/* ----- La vuelta a la plataforma -----
   Suelto, `location.href` navega la página, que es lo correcto. EMPOTRADO navegaría el
   MARCO: la plataforma acabaría anidada dentro de sí misma, con dos barras y dos routers.
   Así que se le avisa al padre y él navega de verdad. Se manda con `location.origin` como
   destino, no con '*': el mensaje lleva una ruta que mueve la navegación de la app.

   El try/catch es por si `parent` es inalcanzable —no debería, es el mismo origen— y en ese
   caso se cae al comportamiento de siempre, que funciona. */
function irAPlataforma(ruta){
  try{ if(parent!==window){ parent.postMessage({al3d:'ir',ruta:ruta},location.origin); return; } }catch(_){}
  location.href='./#/'+ruta;
}

/* Respaldo de copiado para navegadores sin API de portapapeles (o contextos no seguros) */
function _copiaManual(txt,cb){
  try{
    /* El <textarea> tiene que estar en el documento y enfocado para que execCommand
       copie, y va en document.body porque dentro de un diálogo inerte no recibiría el
       foco. Al quitarlo hay que devolver el foco a mano: si no, se queda en el <body>
       con el diálogo todavía abierto y quien navega con teclado se sale del modal. */
    const volver=document.activeElement;
    const ta=document.createElement('textarea');
    ta.value=txt; ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok=document.execCommand('copy'); document.body.removeChild(ta);
    if(volver&&volver.isConnected&&volver!==document.body){ try{ volver.focus({preventScroll:true}); }catch(_){} }
    if(ok){ cb&&cb(); } else { toast('No se pudo copiar automáticamente','err',3000); }
  }catch(e){ toast('No se pudo copiar en este navegador','err',3000); }
}

