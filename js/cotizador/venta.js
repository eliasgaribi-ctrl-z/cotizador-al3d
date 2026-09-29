/* ============================================================================
   Cotizador · venta.js

   Registrar la venta: la fila en la hoja de finanzas, «esta cotización se ganó» hacia la
   plataforma y la vuelta a ella.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   doce archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   161 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

// ----- Registrar Venta -----
/* ----- La comisión: 10 % fijo del subtotal -----
   Es la regla de AL3D, dicha por Elías, y es la que calcula la hoja de finanzas: la fórmula R
   es ROUND(G*10%,2) y NO lee la columna AD «Porcentaje comision» (puente/hoja-apps-script.gs,
   desde d4623f3). Este modal enseñaba la comisión con el % que se tecleara: con un 15, el
   vendedor veía $2,610.00 de una venta de $17,400 y el libro mayor le pagaba $1,740.00.
   El campo del % se queda en el modal, pero fijo en este valor y de solo lectura: un campo que
   se deja editar y no cambia lo que se paga es una trampa. El mismo 10 es el que viaja a AD y a
   la plataforma, para que los tres lados guarden el mismo dato. Si algún día la comisión se
   pacta por venta, se cambian la fórmula R y esta constante, y el campo vuelve a abrirse. */
const COMISION_PCT=10;
/* Hoy en ISO. El <input type="date"> solo acepta YYYY-MM-DD, y armarlo con toISOString()
   sería un error de un día: eso convierte a UTC y en México, de la tarde en adelante,
   devuelve el día siguiente. Se arma con los campos locales. */
function hoyISO(){ const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }

/* ============================================================================
   LA CUENTA DE COBRO DICE SI LLEVA IVA (C4)

   La cuenta no es un dato administrativo: DECIDE el IVA del renglón. La hoja lo realinea sola
   —`aplicarIva()` en puente/hoja-apps-script.gs mira la columna «Cuenta» y reescribe la de IVA—
   y nadie se entera. Elegir una cuenta sin factura para una cotización CON IVA dejaba registrado
   un neto distinto del que el cliente tiene impreso en la mano; y al revés, una cuenta con
   factura en una cotización sin IVA le suma un 16 % que nadie cobró. Eso salía a la luz en
   cobranza, semanas después, cuando el saldo no cuadraba con el papel.

   La tabla es LA DE LA HOJA y se copia aquí porque el .gs vive en Apps Script y el teléfono no
   lo puede leer: `ivaDeCuenta()` dice que solo `CUENTA_SIN_FACTURA` —Elias BBVA— cobra sin
   factura, y cualquier otra lleva IVA. Si allá cambia, cambia aquí: son dos líneas y están
   nombradas igual a propósito, para que una búsqueda por «CUENTA_SIN_FACTURA» encuentre las dos.

   Y no se toca el IVA en automático, nunca: el IVA es del trato con el cliente y ya está
   impreso en el PDF. Lo que esta pantalla hace es AVISAR, para que se corrija la cuenta —que es
   lo que todavía se puede corregir— antes de registrar. */
const CUENTA_SIN_FACTURA='Elias BBVA';
const RV_CUENTAS=['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT'];
function cuentaLlevaIva(c){ return String(c||'').trim()!==CUENTA_SIN_FACTURA; }
function cuentaElegida(){ const e=document.getElementById('rv-cuenta'); return e?e.value:''; }
/* El orden en que se enseñan las cinco: las que coinciden con el IVA de ESTA cotización primero,
   y dentro de cada grupo el orden de la hoja, que es el que la gente ya se sabe. Va aparte de
   pintarCuentas() para poder probarlo sin pantalla: es la regla, no el pintado. */
function cuentasOrdenadas(conIva){
  const quiere=!!conIva;
  return RV_CUENTAS.slice().sort((a,b)=>(cuentaLlevaIva(a)===quiere?0:1)-(cuentaLlevaIva(b)===quiere?0:1));
}
function cuentaCoincide(c,conIva){ return cuentaLlevaIva(c)===!!conIva; }
/* Las cinco cuentas como fichas, con la que coincide con esta cotización primero (pieza 18).
   «Primero» es de verdad primero: con el <select> había que abrirlo y leer cinco renglones sin
   ninguna pista de cuál correspondía. Dentro de cada grupo se conserva el orden de la hoja, que
   es el que la gente ya se sabe de memoria.

   La etiqueta de cada ficha va en ámbar cuando esa cuenta NO coincide con el IVA de esta
   cotización. Se probó pintar en ámbar solo la «sin IVA» —como en la muestra—, y con una
   cotización sin IVA quedaba en ámbar justo la cuenta que sí corresponde: un aviso donde no había
   nada que avisar. La palabra («con IVA» / «sin IVA») va siempre; el color solo dice «ésta movería
   el IVA», y lo que dice qué pasaría con el dinero es el aviso de abajo.

   Cuál queda elegida al abrir: la que se recordó en este aparato, si sigue siendo una de las
   cinco; si no, la primera de las que coinciden —antes era la primera de la lista, que es la
   única que cobra sin factura—. NO se conserva la que quedó puesta en la apertura anterior: con
   el <select> pasaba sin querer (el campo se acordaba de lo último), y una cotización nueva
   abría con la cuenta de la anterior, que a veces ni siquiera coincidía con su IVA. Elegir una
   cuenta NO cambia el IVA: se avisa, nada más.

   El valor sigue en un <input type="hidden" id="rv-cuenta">, así que `datosParaLaHoja()` y
   `rvRecordarPreferencias()` leen exactamente lo de antes. Se vuelve a pintar en cada apertura,
   y la pieza anterior se suelta antes: si no, cada apertura dejaba colgado el observador de la
   ficha del grupo que ya no existe. */
let _rvCuentas=null;
function pintarCuentas(){
  const caja=document.getElementById('rv-cuentas-caja'); if(!caja) return;
  const orden=cuentasOrdenadas(Q.iva);
  const pref=prefGet(PREF_RV_CUENTA,'');
  const actual=RV_CUENTAS.indexOf(pref)>=0?pref:orden[0];
  if(_rvCuentas){ try{ _rvCuentas.destruir(); }catch(_){} _rvCuentas=null; }
  caja.innerHTML=Piezas.opcionesDeslizantesHTML({
    etiquetadaPor:'rv-cuenta-l', oculto:'rv-cuenta', valor:actual,
    opciones:orden.map(c=>({v:c, sub:cuentaLlevaIva(c)?'con IVA':'sin IVA',
      tono:cuentaCoincide(c,Q.iva)?'':'av',
      clase:cuentaLlevaIva(c)?'cta-con-iva':'cta-sin-iva'}))
  });
  _rvCuentas=Piezas.opcionesDeslizantes(caja.firstElementChild,{alCambiar:revisarIvaDeLaCuenta});
  revisarIvaDeLaCuenta();
}
/* El aviso ámbar, con la consecuencia dicha en pesos. No dice «IVA no corresponde»: dice qué va
   a pasar con el dinero, que es lo que hace que alguien cambie la cuenta.

   Se dice con `voz()` y el párrafo NO es una región viva: un elemento con `hidden` no está en el
   árbol de accesibilidad, y quitarle el atributo al mismo tiempo que se le pone el texto es la
   manera más segura de que el lector no diga nada. La región de `voz()` ya existe desde que
   carga la página. */
function revisarIvaDeLaCuenta(){
  const av=document.getElementById('rv-cuenta-av'); if(!av) return;
  const c=cuentaElegida();
  if(!c||cuentaCoincide(c,Q.iva)){ av.hidden=true; av.textContent=''; return; }
  const neto=money(precioFinal());
  const t=Q.iva
    ? 'La cotización lleva IVA y '+c+' cobra sin factura: la hoja le quita el IVA y el neto registrado no será el del PDF ('+neto+').'
    : 'La cotización va sin IVA y '+c+' cobra con factura: la hoja le suma el 16 % y el neto registrado no será el del PDF ('+neto+').';
  if(av.textContent!==t){ av.textContent=t; voz(t); }
  av.hidden=false;
}
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
  /* La comisión no se elige: ver COMISION_PCT. Antes se precargaba con el % recordado en el
     aparato, así que un teléfono que alguna vez registró un 15 lo seguía enseñando. */
  const elPct=document.getElementById('rv-pct');
  elPct.value=COMISION_PCT; elPct.readOnly=true;
  elPct.title='La comisión es '+COMISION_PCT+' % fijo del subtotal, sin IVA: la misma que calcula la hoja de finanzas';
  document.getElementById('rv-estatus').value='FABRICACION';
  /* La cuenta casi nunca cambia y se volvía a poner en cada venta: la preferencia guardada la
     elige, y pintarCuentas() ordena las cinco con la que corresponde al IVA de esta cotización
     por delante. */
  pintarCuentas();
  rvListo(null);
  pintarPlazo();
  /* Los cubos del plazo son un grupo de opciones como cualquier otro: la ficha viaja del que
     estaba al que se toca (pieza 2, C23 #2). Es idempotente, así que llamarla en cada apertura
     no cuelga oyentes de más; y va DESPUÉS de pintarPlazo(), que reescribe los hijos. */
  Piezas.fichaQueViaja('rv-plazo');
  /* `true` = pinta sin rodar. Abrir el modal no es un cambio de cifra: las de la venta anterior
     no tienen nada que ver con éstas, y verlas rodar de unas a otras invita a leer mal. */
  rvRecalc(true);
  /* Y si el intento anterior se quedó en «No se registró · Reintentar», el botón vuelve a su
     rótulo: el modal se abre limpio, no a medio camino de una venta de hace media hora. */
  try{ Piezas.estadoBoton('rv-registrar').reiniciar(); }catch(_){}
  document.getElementById('rv-modal-bg').classList.add('show');
}
/* ----- El recibo verde del pie del modal -----
   `texto` null lo apaga (al abrir); con texto lo enciende y dibuja la palomita en ese momento
   (pieza 6, C23 #6). Se dibuja al aparecer y no antes: una palomita ya trazada dentro de una
   caja escondida se ve «vieja» al descubrirla, y lo que se está diciendo es que ACABA de pasar.
   `html` es para el respaldo de copiar, que nombra dos columnas en negritas. */
function rvListo(texto,html){
  const el=document.getElementById('rv-copied'); if(!el) return;
  if(texto==null&&html==null){
    el.classList.remove('show');
    const ico=el.querySelector('.rv-copied-ico'); if(ico) ico.innerHTML='';
    return;
  }
  const t=el.querySelector('span:not(.rv-copied-ico)');
  if(t){ if(html!=null) t.innerHTML=html; else t.textContent=texto; }
  const ico=el.querySelector('.rv-copied-ico');
  if(ico) ico.innerHTML=Piezas.palomitaHTML({circulo:true});
  el.classList.add('show');
}
function cerrarRegistrarVenta(){
  document.getElementById('rv-modal-bg').classList.remove('show');
}
/* ----- El anticipo, acotado -----
   Hasta septiembre de 2026 el modal aceptaba cualquier número: un anticipo mayor que el total
   —un cero de más al teclear— dejaba el «pago pendiente» en $0.00 y la venta se registraba
   como liquidada; uno negativo lo inflaba; y una comisión del 1000 % se registraba tal cual.
   Se acota en el mismo campo, con aviso, y el número corregido es el que se guarda. La
   comisión ya no se teclea —es COMISION_PCT—, así que ya no hay nada que acotarle. */
function rvAcotar(){
  const t=desgloseFinal();
  const elA=document.getElementById('rv-anticipo');
  let anti=parseFloat(elA.value); if(!isFinite(anti)) anti=0;
  let aviso='';
  if(anti<0){ anti=0; aviso='El anticipo no puede ser negativo: se puso en $0.00.'; }
  if(t.neto>0 && anti>t.neto+0.005){ anti=Math.round(t.neto*100)/100; aviso='El anticipo era mayor que el total de '+money(t.neto)+': se dejó igual al total.'; }
  if(Math.abs(anti-(parseFloat(elA.value)||0))>0.005) elA.value=anti;
  return {anti,aviso};
}
/* `alAbrir` pinta sin rodar: ver rvRecalc más abajo. Lo pasa abrirRegistrarVenta() y nadie más;
   los dos manejadores del marcado (`oninput` del anticipo, `onchange` del estatus) llaman sin
   argumentos, que es cuando sí hay un cambio que enseñar. */
function rvRecalc(alAbrir){
  // Se registra lo que realmente se va a cobrar (precio autorizado), no el calculado.
  const t=desgloseFinal();
  const sub=t.sub, neto=t.neto;
  const anti=parseFloat(document.getElementById('rv-anticipo').value)||0;
  const estatus=document.getElementById('rv-estatus').value;
  /* La MISMA cuenta que la columna R de la hoja: 10 % fijo del subtotal, sin leer el % de AD
     (ver COMISION_PCT). A la hoja no se le manda la comisión, se calcula allá; aquí se enseña
     la que allá va a salir. Decía que la hoja la calculaba «con el porcentaje» que se le
     mandaba, y desde d4623f3 no es así: con un 15 tecleado el modal enseñaba el 15 y el libro
     mayor pagaba el 10.
     Sin `Math.round` a pesos: eso hacía que el modal enseñara «$1,759.00» y la hoja escribiera
     $1,758.56. `money()` redondea a centavos, igual que el ROUND(…,2) de allá. */
  const com=sub*COMISION_PCT/100;
  const pend=estatus==='LIQUIDADO'?0:Math.max(0,neto-anti);
  /* Las cuatro cifras ruedan dígito a dígito cuando cambian (pieza 1, C23 #1). Es el reemplazo
     directo de `textContent=`: el texto final está puesto desde el primer cuadro —la rueda es una
     capa aparte— así que el lector de pantalla lee el número una vez, y la caja no cambia de
     tamaño. Aquí sirve de verdad: se teclea el anticipo con el cliente enfrente y el pago
     pendiente es el número que se le dice en voz alta; verlo moverse es ver que la cuenta
     respondió a lo que se acaba de escribir. Con menos movimiento cambia sin rodar. */
  const rodar=(id,t)=>Piezas.rodarCifra(id,t,{animar:!alAbrir});
  rodar('rv-sub-disp',money(sub));
  rodar('rv-neto-disp',money(neto));
  rodar('rv-com-disp',money(com));
  rodar('rv-pend-disp',money(pend));
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
  /* La columna AD. La hoja NO la lee —la fórmula R es 10 % fijo del subtotal—, pero el puente
     la lleva y la plataforma la guarda, así que viaja el mismo % que se paga: con el tecleado
     viajaba un 15 que ninguna fórmula cobraba y que la plataforma repetía como «comisión
     pactada». Ver COMISION_PCT. */
  d['Porcentaje comision']=COMISION_PCT;
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
  /* Ya no sale «Mandando la venta a la hoja…» como aviso de quince segundos. Eso lo dice ahora el
     propio botón, con su relleno y su cronómetro (pieza 14, C5): la espera pertenece al botón que
     se apretó, no al pie de la pantalla, y un aviso de quince segundos ocupaba la pila entera —los
     avisos de verdad, los que dicen que algo salió mal, le llegaban por detrás—.

     Lo que sí se conserva es lo que ese aviso le decía a quien no ve la pantalla: el aviso lo
     leía el lector de pantalla, y el botón cambia su rótulo en silencio. Por eso el comienzo de la
     espera se dice aquí, en la región de siempre; el resultado ya lo dicen el aviso de éxito o de
     error y el recibo verde, así que el botón no lo repite (`voz:false` en registrarEnLaHoja). */
  voz('Mandando la venta a la hoja…');
  return puentePost(cfg,'empujar',{ops:[{id:datos['Folio cotizacion'],datos:datos}]})
    .then(j=>{
      const r=(j&&j.resultados&&j.resultados[0])||null;
      if(!r||r.ok!==true) throw new Error((r&&r.mensaje)||'El puente no pudo escribir la venta.');
      marcarHito('venta');
      /* El folio interno de la hoja (V-042) viene como `id_notion`, el nombre que heredó
         del relevo; aplanarFila no devuelve ninguna clave «Folio». */
      const folio=(r.remoto&&r.remoto.id_notion)||'';
      const rech=(r.rechazadas||[]).map(x=>x&&x.nombre).filter(Boolean);
      rvListo((r.creada?'Venta registrada en la hoja':'Venta actualizada en la hoja')+(folio?' — '+folio:''));
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
    rvListo(null,'Pégalos en la columna <b>Proyecto</b> del primer renglón vacío de <b>Ventas</b>. Falta capturar a mano el anticipo ('+money(anti)+') y la fecha.');
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
/* La cuenta «casi nunca cambia y se volvía a poner en cada venta»: eso decía el modal, y solo
   la recordaba el camino con puente. En un teléfono sin puente el registro sale por el otro
   camino y se volvía a elegir cada vez. Se recuerda aquí, en un solo sitio, y la llaman los
   dos caminos. La comisión ya no se recuerda: no se elige (ver COMISION_PCT). */
function rvRecordarPreferencias(){
  prefSet(PREF_RV_CUENTA,cuentaElegida());
}
/* ----- El botón que está trabajando lo dice (pieza 14, C5) -----
   «Registrar venta» habla con la hoja y eso tarda: el puente espera hasta quince segundos, y en
   una tienda con dos rayas de señal los tarda. El botón no cambiaba EN ABSOLUTO —salía un aviso
   abajo y ahí se quedaba—, así que se podía volver a tocar, y con el cliente enfrente se toca:
   no pasa nada visible, luego algo se rompió, luego otra vez. (No duplicaba la venta, porque el
   puente busca por folio antes de crear, pero eso el vendedor no lo sabe.)

   Ahora la espera vive en el botón: relleno que avanza, cronómetro («Registrando · 6 s»), y al
   llegar la respuesta se lava en verde con su palomita o se pone en rojo con «Reintentar». Y
   mientras trabaja, la pieza se come los toques: el segundo dedazo ya no hace nada.

   `tau` es 9 s y no los 15 del tope: es lo que tarda una respuesta normal, y el relleno se acerca
   al 90 % con esa curva pero SOLO llega al final con la respuesta de verdad. Una barra que llega
   al 100 % y se queda ahí esperando es peor que ninguna.

   El reintento sale del propio marcado: en «mal» el botón vuelve a aceptar toques y su
   `onclick="registrarGanada()"` corre otra vez, que es el camino correcto —vuelve a pasar por la
   constancia local y por la deduplicación por folio—.

   «Copiar datos para la hoja» espera con él (`hermanos`): es el respaldo para cuando el puente
   falla, y darle un toque en mitad de la espera copiaba la fila y marcaba «venta» mientras el
   puente todavía podía escribirla, o sea dos caminos a la vez para la misma venta. En cuanto la
   hoja contesta —bien o mal— vuelve a aceptar toques, que es cuando hace falta. «Cancelar» no
   espera: cerrar el modal no cancela la petición, y el resultado sigue llegando por el aviso.

   Cada intento empieza con el recibo verde apagado. Si el de una venta ya registrada seguía
   encendido y el reintento fallaba, el pie del modal decía a la vez «Venta registrada en la hoja»
   y «No se registró · Reintentar»: dos verdades contrarias sobre la misma venta, una encima de la
   otra. */
function registrarEnLaHoja(cierre){
  rvListo(null);
  return Piezas.trabajando('rv-registrar',
    ()=>mandarALaHoja(cierre).then(ok=>{ if(!ok) throw new Error('la hoja no la escribió'); }),
    {verbo:'Registrando', tau:9000, ok:'Registrada', mal:'No se registró',
     hermanos:[document.getElementById('rv-copiar')].filter(Boolean), voz:false});
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
    pct_comision:COMISION_PCT,   // el que se paga; ver COMISION_PCT
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
        registrarEnLaHoja({sufijo:' — ya estaba registrada como proyecto ganado',
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
    registrarEnLaHoja({sufijo:' · registrada como proyecto ganado'+(sinFecha?', le falta la fecha de instalación':''),
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

