/* ============================================================================
   Cotizador · venta.js

   Registrar la venta: la fila en la hoja de finanzas, «esta cotización se ganó» hacia la
   plataforma y la vuelta a ella.

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
function abrirRegistrarVenta(){
  // Si el autorizador ajustó el precio, se avisa aquí: la venta se registra por ese
  // precio, no por el calculado.
  const avisoEl=document.getElementById('rv-aviso-auth');
  if(avisoEl){
    /* Sobre el SUBTOTAL, que es la base en la que se decidió el ajuste y la misma en la que
       se calcula la comisión dos campos más abajo. Con la base vieja —el neto— este aviso
       decía «$3,016» de una rebaja que en lo que se queda la casa son $2,600, justo encima
       de una comisión calculada sobre los $17,400. La frase la arma fraseAjuste, que nombra
       la base cuando hay dos —las partidas ajustadas y el calculado—, igual que la columna. */
    const dV=desgloseFinal(), subV=+subAjustado().toFixed(2), subC=+totals().sub.toFixed(2);
    const vigente=authVigente();
    const f=vigente?fraseAjuste(dV.sub,subV,subC):null;
    const dc=+(subC-dV.sub).toFixed(2);
    let txt='';
    if(f) txt='Precio autorizado con '+f.tipo.toLowerCase()+' de '+money(f.importe)+' ('+f.pct+'%) '+f.sobre+f.vsCalc;
    /* Solo ajustes partida por partida, sin precio global encima: también se dice, porque la
       venta se registra por un subtotal distinto del que suman las partidas al catálogo. */
    else if(vigente&&Math.abs(dc)>=0.01) txt='Precio autorizado con '+(dc>0?'descuento':'aumento')+' de '+money(Math.abs(dc))+' partida por partida, sobre el calculado';
    if(txt){
      avisoEl.textContent=txt+' — la venta se registra por '+money(precioFinal())+'.';
      /* Y un aumento no se anuncia en la caja verde del éxito. La misma información, dos
         pantallas antes, ya distingue: en el panel del paso 3 el descuento va en verde y el
         aumento en ámbar, con su comentario. Aquí los dos compartían la única piel que tiene
         este nodo. */
      avisoEl.classList.toggle('inc',f?f.d<0:dc<0);
      avisoEl.style.display='';
    } else { avisoEl.classList.remove('inc'); avisoEl.style.display='none'; }
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
/* ----- El anticipo y la comisión, acotados -----
   Hasta septiembre de 2026 el modal aceptaba cualquier número: un anticipo mayor que el total
   —un cero de más al teclear— dejaba el «pago pendiente» en $0.00 y la venta se registraba
   como liquidada; uno negativo lo inflaba; y una comisión del 1000 % se registraba tal cual.
   Se acota en el mismo campo, con aviso, y el número corregido es el que se guarda. */
function rvAcotar(){
  const t=desgloseFinal();
  const elA=document.getElementById('rv-anticipo'), elP=document.getElementById('rv-pct');
  let anti=parseFloat(elA.value); if(!isFinite(anti)) anti=0;
  let pct=parseFloat(elP.value); if(!isFinite(pct)) pct=0;
  let aviso='';
  if(anti<0){ anti=0; aviso='El anticipo no puede ser negativo: se puso en $0.00.'; }
  if(t.neto>0 && anti>t.neto+0.005){ anti=Math.round(t.neto*100)/100; aviso='El anticipo era mayor que el total de '+money(t.neto)+': se dejó igual al total.'; }
  if(pct<0){ pct=0; aviso=aviso||'La comisión no puede ser negativa: se puso en 0 %.'; }
  if(pct>100){ pct=100; aviso=aviso||'La comisión no puede pasar del 100 %.'; }
  if(Math.abs(anti-(parseFloat(elA.value)||0))>0.005) elA.value=anti;
  if(Math.abs(pct-(parseFloat(elP.value)||0))>0.005) elP.value=pct;
  return {anti,pct,aviso};
}
function rvRecalc(){
  // Se registra lo que realmente se va a cobrar (precio autorizado), no el calculado.
  const t=desgloseFinal();
  const sub=t.sub, neto=t.neto;
  const anti=parseFloat(document.getElementById('rv-anticipo').value)||0;
  const pct=parseFloat(document.getElementById('rv-pct').value)||0;
  const estatus=document.getElementById('rv-estatus').value;
  /* Sin `Math.round`: a la hoja NO se le manda la comisión, se le manda el porcentaje, y la
     columna la calcula allá con la cifra completa. Redondear a pesos aquí hacía que el modal
     enseñara «$1,759.00» y la hoja escribiera $1,758.56, que es justo la discordancia que el
     comentario de esa línea vino a arreglar. `money()` hace el suyo, el mismo que ya hace con
     el subtotal y el neto de esta misma tarjeta. */
  const com=sub*pct/100;
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
  const acotado=rvAcotar();
  if(acotado.aviso){ toast(acotado.aviso,'err',5200); rvRecalc(); }
  const v=acotado.anti;
  if(Math.abs(v-(Q.anti||0))<0.01) return;
  Q.anti=v; Q.antiManual=true;
  saveState(); renderSummary();
  if(Q.estado==='autorizada') guardarEnHistorial();
  toast('Anticipo actualizado a '+money(v)+' — el PDF y el WhatsApp ya lo traen','',4200);
}
/* ============================================================================
   EL PUENTE A LA HOJA DE FINANZAS

   Hasta septiembre de 2026 esto armaba una fila de quince valores con el orden de columnas
   del CSV de Ventas de Notion y la dejaba en el portapapeles. Notion ya no existe: el
   dinero vive en la hoja «Finanzas AL3D — Ventas y Comisiones», y esa fila ya no se puede
   pegar en ninguna parte. No es que quedara fea: la hoja INTERCALA columnas de fórmula
   —Precio neto, Saldo por cobrar, Comisión, Antigüedad— entre las que sí se capturan, y
   pegar valores encima de un ARRAYFORMULA no escribe la venta, rompe la columna para las
   trescientas filas. El camino viejo no estaba desactualizado: estaba roto.

   Así que el camino bueno deja de ser el portapapeles y pasa a ser el puente, el mismo
   Apps Script que ya usa la plataforma y con la MISMA configuración: la clave
   `al3d_pf_puente` del almacenamiento, que Ajustes escribe y este archivo solo lee. Una
   venta registrada aquí aparece en la hoja en ese momento, con su folio, sin que nadie
   abra la plataforma ni pegue nada.

   Se habla el vocabulario del puente —los nombres de propiedad que heredó de Notion, con
   el espacio final de `Cuenta ` incluido—, nunca las letras de columna: el puente es quien
   sabe en qué letra vive cada una y esa tabla existe en un solo lado a propósito.
   ============================================================================ */
const PUENTE_KEY='al3d_pf_puente';
const PUENTE_ESPERA=15000;      // lo mismo que espera la plataforma

/* La configuración tal como la dejó Ajustes, o null. La URL se limpia igual que allá: sin
   cadena de consulta, sin barra final y sin uno de los cinco caminos pegado al final, que
   es el error de copiado de siempre. */
function puenteCfg(){
  try{
    const c=JSON.parse(localStorage.getItem(PUENTE_KEY)||'null');
    if(!c||!c.url||!c.token) return null;
    let u=String(c.url).trim();
    try{ const x=new URL(u); x.search=''; x.hash=''; u=x.href; }catch(_){}
    u=u.replace(/\/+(salud|esquema|jalar|empujar|expandir)\/*$/i,'').replace(/\/+$/,'');
    return u?{url:u,token:String(c.token)}:null;
  }catch(_){ return null; }
}

/* Una petición al puente. Todo por POST y el token en el cuerpo, con `text/plain` para no
   disparar el preflight que Apps Script no sabe contestar: un Web App solo expone doGet y
   doPost, no hay dónde atender un OPTIONS. El camino viaja como un campo más del cuerpo
   porque `pathInfo` solo funciona en los GET. Es la misma forma que usa la plataforma. */
function puentePost(cfg,ruta,extra){
  const ctrl=(typeof AbortController==='function')?new AbortController():null;
  const t=ctrl?setTimeout(()=>ctrl.abort(),PUENTE_ESPERA):0;
  const cuerpo=Object.assign({token:cfg.token,ruta:ruta},extra||{});
  return fetch(cfg.url,{
    method:'POST',
    signal:ctrl?ctrl.signal:undefined,
    body:JSON.stringify(cuerpo),
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    redirect:'follow'
  }).then(r=>r.json().catch(()=>null).then(j=>{
    /* Un 2xx sin JSON no es el puente: casi siempre es la pantalla de inicio de sesión de
       Google, que aparece cuando la implementación quedó en «Solo yo». */
    if(r.status<400&&j===null) throw new Error('Esa liga contestó pero no es el puente. Revisa que la implementación esté en «Cualquier usuario».');
    if(j&&j.ok===false) throw new Error(j.mensaje||'El puente rechazó la operación.');
    if(!j) throw new Error('El puente contestó '+r.status+' sin decir por qué.');
    return j;
  })).catch(e=>{
    if(e&&e.name==='AbortError') throw new Error('El puente no contestó en 15 segundos. Vuelve a intentarlo o copia los datos.');
    throw e;
  }).finally(()=>{ if(t) clearTimeout(t); });
}

/* ----- Lo que viaja a la hoja -----
   Solo lo que se CAPTURA. El neto, el saldo, la comisión y lo que queda de ella son
   fórmulas de la hoja y el puente las rechaza con su razón: se calculan allá, y dos
   implementaciones de la misma fórmula divergen en semanas.

   Las dos fechas son dos de verdad: la columna L es «Fecha anticipo» —de ella cuelgan los
   días de cobro y la antigüedad de la cobranza— y la M es «Fecha instalación». Meter la de
   instalación en la del anticipo, que es lo que significaba la columna combinada de Notion,
   le movería la antigüedad a toda la cartera.

   `Tipo de trabajo` NO se manda a propósito: derivarlo de las partidas ya lo hace la
   plataforma, y la hoja lo clasifica sola desde el nombre del proyecto. Escribirlo aquí
   sería una tercera versión de la misma regla. */
function datosParaLaHoja(){
  const t=desgloseFinal();
  const estatus=document.getElementById('rv-estatus').value;
  const fecha=document.getElementById('rv-fecha').value.trim();
  const fechaInst=document.getElementById('rv-fecha-inst').value.trim();
  const anti=parseFloat(document.getElementById('rv-anticipo').value)||0;
  const pct=parseFloat(document.getElementById('rv-pct').value)||0;
  const esISO=v=>/^\d{4}-\d{2}-\d{2}$/.test(v);
  const d={
    'Proyecto':         document.getElementById('rv-proyecto').value.trim(),
    'Precio Subtotal':  t.sub,
    'IVA':              !!Q.iva,
    'Anticipo':         anti,
    'Estatus':          estatus,
    'Cuenta ':          document.getElementById('rv-cuenta').value,
    /* La llave que ata la fila a esta cotización. Va con el aparato pegado: `al3d_folio` es
       un contador local y dos teléfonos emiten COT-0042 el mismo día sin ser el mismo
       trabajo. Es también lo que hace que apretar dos veces NO cree dos ventas: el puente
       busca por este folio antes de crear. */
    'Folio cotizacion': String(Q.folio||'')+'@'+dispositivo(),
    'Etapa de obra':    'Ganado',
    'Direccion':        direccionPdf()
  };
  if(esISO(fecha))     d['Fecha Anticipo e Instalacion']=fecha;   // columna L, el anticipo
  if(esISO(fechaInst)) d['Fecha instalacion']=fechaInst;          // columna M, la instalación
  /* El % pactado con quien trajo el trabajo (columna AD). La hoja calculaba 10 % fijo y este
     modal enseñaba la comisión con el % tecleado: dos cifras para la misma venta. Con cero
     no se manda —vacío en la hoja significa «el de siempre»—; el 10 sí viaja, para que quede
     escrito que se dijo. */
  if(pct>0) d['Porcentaje comision']=pct;
  /* LIQUIDADO en la hoja es anticipo + liquidación = neto, y el saldo sale de restar los
     dos. La liquidación es el RESTO, no el total: ponerle el neto dejaría el saldo en
     negativo por el valor del anticipo. */
  if(estatus==='LIQUIDADO'){
    const resto=Math.max(0,+(t.neto-anti).toFixed(2));
    if(resto>0) d['Liquidacion']=resto;
    d['Fecha Liquidacion']=esISO(fecha)?fecha:hoyISO();
  }
  return d;
}

/* ----- Registrar la venta en la hoja -----
   Devuelve una promesa que nunca se rechaza: los caminos que fallan avisan y ofrecen el
   respaldo, porque este botón se aprieta con el cliente enfrente. */
function mandarALaHoja(cierre){
  const cfg=puenteCfg();
  if(!cfg){
    toast('Este dispositivo todavía no tiene el puente a la hoja — se copian los datos para pegarlos','err',6000,
      {label:'Copiar datos',fn:copiarDatosVenta});
    return Promise.resolve(false);
  }
  rvComprometerAnticipo();
  const datos=datosParaLaHoja();
  if(!datos['Proyecto']){ toast('Ponle nombre al proyecto antes de registrarlo','err',4000); return Promise.resolve(false); }
  rvRecordarPreferencias();
  toast('Mandando la venta a la hoja…','',PUENTE_ESPERA);
  return puentePost(cfg,'empujar',{ops:[{id:datos['Folio cotizacion'],datos:datos}]})
    .then(j=>{
      const r=(j&&j.resultados&&j.resultados[0])||null;
      if(!r||r.ok!==true) throw new Error((r&&r.mensaje)||'El puente no pudo escribir la venta.');
      marcarHito('venta');
      /* El folio interno de la hoja (V-042) viene como `id_notion`, el nombre que heredó
         del relevo; aplanarFila no devuelve ninguna clave «Folio». */
      const folio=(r.remoto&&r.remoto.id_notion)||'';
      const rech=(r.rechazadas||[]).map(x=>x&&x.nombre).filter(Boolean);
      const el=document.getElementById('rv-copied');
      if(el){
        el.querySelector('span').textContent=(r.creada?'Venta registrada en la hoja':'Venta actualizada en la hoja')+
          (folio?' — '+folio:'');
        el.classList.add('show');
      }
      toast((r.creada?'Venta registrada en la hoja':'Se actualizó la venta en la hoja')+(folio?' — '+folio:'')+
        ((cierre&&cierre.sufijo)||''),'ok',5600,(cierre&&cierre.accion)||null);
      /* Lo rechazado se dice con nombre. Un campo que no se escribió y nadie nombró es la
         forma más cara de descubrir que este teléfono tiene el token de fabricación. */
      if(rech.length) toast('No se escribió: '+rech.join(', ')+' — este teléfono no tiene permiso para esos campos','err',7000);
      return true;
    })
    .catch(e=>{
      toast((e&&e.message)||'No se pudo mandar la venta a la hoja','err',7000,
        {label:'Copiar datos',fn:copiarDatosVenta});
      return false;
    });
}

/* ----- El respaldo, cuando no hay puente o falló -----
   Las seis columnas que la hoja captura SEGUIDAS: Proyecto, Cuenta, Estatus, Tipo de
   trabajo, IVA y Subtotal (B a G). Es todo lo que se puede pegar de un tirón sin tocar una
   fórmula. El anticipo y la fecha van dos columnas más allá, con «Precio neto» en medio,
   así que se capturan a mano — o se usa ⚡ AL3D → Registrar nueva venta en la hoja, que es
   un formulario y no pide pegar nada. */
function copiarDatosVenta(){
  rvComprometerAnticipo();
  const t=desgloseFinal();
  const row=[
    document.getElementById('rv-proyecto').value.trim(),
    document.getElementById('rv-cuenta').value,
    document.getElementById('rv-estatus').value,
    '',                       // Tipo de trabajo: lo clasifica la hoja
    Q.iva?'Sí':'No',
    t.sub
  ].join('\t');
  marcarHito('venta');
  const anti=parseFloat(document.getElementById('rv-anticipo').value)||0;
  copiarTexto(row,'Datos copiados — pégalos en la columna Proyecto del primer renglón vacío de Ventas',()=>{
    const el=document.getElementById('rv-copied');
    if(el){
      el.querySelector('span').innerHTML='Pégalos en la columna <b>Proyecto</b> del primer renglón vacío de <b>Ventas</b>. Falta capturar a mano el anticipo ('+money(anti)+') y la fecha.';
      el.classList.add('show');
    }
  });
}
/* ----- «Esta cotización se ganó» -----
   El evento que no existía en ningún sistema. El modal ya capturaba todo lo que hace falta
   —la fecha, la cuenta, el estatus, el anticipo, la comisión— y todo se iba al portapapeles:
   si alguien no pegaba la fila, no quedaba rastro de que la cotización se hubiera vendido.
   De ahí salen los 199 proyectos que la hoja heredó sin una sola dirección y sin un solo
   tipo de trabajo: los datos que el cotizador SÍ tiene nunca llegaban.

   Aquí solo se deja constancia en una clave propia, `al3d_pf_ganadas`. La plataforma la
   recoge al abrir y la convierte en proyecto —con su dirección, su tipo derivado de las
   partidas y su material calculado—. Es una clave de localStorage y no una transacción de
   IndexedDB a propósito: este archivo no tiene módulos ni dependencias, y meterle una base
   de datos para escribir un renglón de constancia sería la inserción más frágil de las
   siete que se le hacen.

   El botón de copiar la fila se queda para siempre. Si la plataforma no está, si el
   teléfono es otro, si algo falla: pegar la fila a mano es el camino que ya funciona y no
   se retira. */
/* La comisión y la cuenta «casi nunca cambian y se volvían a poner en cada venta»: eso decía
   el modal, y solo las recordaba el camino con puente. En un teléfono sin puente el registro
   sale por el otro camino y las dos se volvían a elegir cada vez. Se recuerdan aquí, en un
   solo sitio, y las llaman los dos caminos. */
function rvRecordarPreferencias(){
  prefSet(PREF_RV_PCT,parseFloat(document.getElementById('rv-pct').value)||0);
  prefSet(PREF_RV_CUENTA,document.getElementById('rv-cuenta').value);
}
function registrarGanada(){
  rvComprometerAnticipo();
  rvRecordarPreferencias();
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
    /* Y la del anticipo, que es otra columna de la hoja y otra cuenta: de ella cuelgan los
       días de cobro y la antigüedad de la cartera. Sin esto la plataforma ponía el día en
       que ALGUIEN LA ABRIÓ, que puede ser una semana después de cobrar. */
    fecha_anticipo:(document.getElementById('rv-fecha').value||''),
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
      /* Se reintenta la hoja aunque la constancia ya existiera: el puente busca por folio
         antes de crear, así que no puede duplicar, y este es justo el camino de «se
         registró pero ese día no había señal». */
      if(puenteCfg()){
        mandarALaHoja({sufijo:' — ya estaba registrada como proyecto ganado',
          accion:{label:'Abrir plataforma',fn:()=>{ irAPlataforma('proyectos'); }}});
        return;
      }
      toast('Esta cotización ya estaba registrada como proyecto ganado','',3600,
        {label:'Abrir plataforma',fn:()=>{ irAPlataforma('proyectos'); }});
      return;
    }
    lista.push(g);
    localStorage.setItem('al3d_pf_ganadas',JSON.stringify(lista));
  }catch(_){
    /* Sin espacio o almacenamiento bloqueado. Se dice, y se ofrece lo único que sigue
       funcionando: la fila para pegar a mano. */
    toast('No hubo espacio para registrar el proyecto — copia los datos y captúralos a mano','err',6000,
      {label:'Copiar datos',fn:copiarDatosVenta});
    return;
  }
  /* La guarda de obligatorios ya corrió para llegar aquí (el modal solo se abre con la
     cotización autorizada), así que si falta la fecha es porque el usuario la borró. No se
     frena por eso: un proyecto sin fecha aparece en la plataforma como «sin fecha», que es
     justo el aviso que hay que ver. */
  marcarHito('venta');
  const sinFecha=!g.fecha_instalacion;
  const abrir={label:'Abrir plataforma',fn:()=>{ irAPlataforma(sinFecha?'agenda':'proyectos'); }};
  /* Un solo botón hace las dos cosas que tiene que hacer una venta: dejar constancia para
     la plataforma —de ahí salen el material, la agenda y el mapa— y escribir el renglón en
     la hoja, que es el libro mayor del dinero. Se avisa UNA vez: dos avisos seguidos se
     pisan y el segundo borra al primero antes de que nadie lo lea. */
  if(puenteCfg()){
    mandarALaHoja({sufijo:' · registrada como proyecto ganado'+(sinFecha?', le falta la fecha de instalación':''),
      accion:abrir});
    return;
  }
  toast('Registrada como proyecto ganado'+(sinFecha?' — le falta la fecha de instalación':''),
    'ok',5200,abrir);
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

