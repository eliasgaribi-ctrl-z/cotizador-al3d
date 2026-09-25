/* ============================================================================
   Cotizador · notario.js

   El precio autorizado se sella en la hoja. Este archivo es el lado del teléfono de eso: quién
   eres, qué se manda, qué se hace con el sello que regresa, y la solicitud que viaja al
   teléfono de dirección cuando quien cotiza no puede autorizar.

   Hasta septiembre de 2026 autorizar era un asunto de este teléfono: el rol «Autorizador» se
   escogía en el segmentado de arriba, el nombre de quien autorizaba se tecleaba y el precio
   salía del catálogo de catalogo.js. Cualquiera de las tres cosas se cambiaba desde las
   herramientas del navegador, y el PDF resultante era idéntico a uno de verdad. Ahora:

     · Autoriza quien la hoja dice que es dirección. La identidad la pone la plataforma —que
       es la que entró con Google— a través de `window.AL3D` (js/mod/cotizador.js). Suelto,
       con ?solo=1, no hay identidad y no se autoriza: se solicita.
     · El nombre del autorizador es el correo de esa cuenta, y lo firma la hoja.
     · La hoja recalcula el precio con su copia del catálogo antes de sellar. Un catálogo
       alterado aquí no pasa de allá.
     · Sin señal no se autoriza. Lo tecleado se queda; el sello se pide cuando vuelva.

   Lo que este archivo NO hace es volver seguro al teléfono: quien lo controla puede escribir
   cualquier cosa en `al3d_q`, incluido un sello. Lo que ya no puede es que ese sello pase por
   bueno: el QR del PDF lo comprueba contra la hoja (verificar.html), y ahí sí no hay nada que
   tocar. Ver la cabecera del notario en puente/hoja-apps-script.gs.

   Es un script CLÁSICO, como los otros once, y comparte su ámbito global.
   ============================================================================ */

/* ----- El puente de la plataforma -----
   Empotrado, la plataforma deja `AL3D` en SU ventana. Se busca también en la propia: es lo que
   deja a las pruebas de navegador —que abren cotizador.html?solo=1— poner una hoja de mentiras
   sin montar la plataforma entera. Alguien que haga lo mismo desde la consola solo consigue
   hablar con la hoja que él mismo inventó: la de verdad sigue verificando del otro lado. */
function _al3d(){
  try{ if(window.AL3D&&typeof window.AL3D.hablar==='function') return window.AL3D; }catch(_){}
  try{ if(parent!==window&&parent.AL3D&&typeof parent.AL3D.hablar==='function') return parent.AL3D; }catch(_){}
  return null;
}
/* {correo, rol} de quien entró, según el último pase que dio la hoja; o null. */
function identidadVerificada(){
  const b=_al3d(); if(!b||typeof b.identidad!=='function') return null;
  try{ const i=b.identidad(); return i&&i.correo?i:null; }catch(_){ return null; }
}
function puedeAutorizar(){ const i=identidadVerificada(); return !!(i&&i.rol==='direccion'); }

/* El botón «Autorizador» del segmentado se queda a la vista —es donde la gente lo busca—, pero
   apagado y diciendo por qué para quien no es dirección. */
function pintarRolDisponible(){
  const b=document.querySelector('#roleseg [data-rol="autorizador"]'); if(!b) return;
  const si=puedeAutorizar(), i=identidadVerificada();
  b.classList.toggle('apagado',!si);
  b.setAttribute('aria-disabled',si?'false':'true');
  b.title=si?'Revisar y autorizar precios como '+i.correo:'Solo una cuenta de Dirección autoriza precios';
}

/* Una pregunta a la hoja. Empotrado va por la plataforma, que pone la identidad de Google; suelto,
   por el token de dispositivo de venta.js, que basta para solicitar pero nunca para sellar.
   Devuelve lo que la hoja contestó y lanza con un mensaje legible si no contestó. */
async function hablarHoja(ruta,cuerpo,espera){
  const b=_al3d();
  if(b) return await b.hablar(ruta,cuerpo||{},espera);
  const cfg=puenteCfg();
  if(!cfg){ const e=new Error('Este teléfono no tiene el puente a la hoja. Abre el cotizador desde la plataforma.'); e.codigo='SIN_PUENTE'; throw e; }
  return await _postHoja(cfg,ruta,cuerpo||{},espera||PUENTE_ESPERA);
}
/* El mismo envío que puentePost() de venta.js —POST, text/plain, el token en el cuerpo— pero
   devolviendo la respuesta de la hoja ENTERA aunque diga que no: el notario y la IA necesitan
   su `codigo` (sin llave, cupo agotado, catálogo que no cuadra) y puentePost lo vuelve un
   mensaje suelto. Solo lanza cuando no hubo respuesta. */
async function _postHoja(cfg,ruta,cuerpo,espera){
  const ctrl=(typeof AbortController==='function')?new AbortController():null;
  const t=ctrl?setTimeout(()=>ctrl.abort(),espera):0;
  try{
    const r=await fetch(cfg.url,{method:'POST',signal:ctrl?ctrl.signal:undefined,redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},cuerpo,{token:cfg.token,ruta}))});
    const j=await r.json().catch(()=>null);
    if(!j){ const e=new Error('Esa liga contestó pero no es el puente. Revisa que la implementación esté en «Cualquier usuario».'); e.codigo='DESCONOCIDO'; throw e; }
    return j;
  }catch(e){
    if(!e.codigo){ e.codigo='SIN_RED'; if(e.name==='AbortError') e.message='La hoja no contestó a tiempo.'; }
    throw e;
  }finally{ if(t) clearTimeout(t); }
}

/* El folio que la hoja conoce: el del papel y el aparato que lo emitió. El corto se repite
   entre teléfonos —cada uno cuenta desde COT-0001— y dos sellos no pueden caer en el mismo. */
function folioGlobal(folio){ return String(folio||Q.folio||'')+'@'+dispositivo(); }

/* Lo que la hoja necesita para recalcular el precio y para que dirección revise: las partidas
   con sus campos de precio y su descripción, y nada más. Ni teléfono, ni dirección, ni imagen. */
function cotParaHoja(){
  return {
    proyecto:(Q.proy||'').trim(), cliente:(Q.cliente||'').trim(), iva:!!Q.iva, subtotal:totals().sub,
    items:Q.items.map(it=>{
      const o={id:it.id,desc:descParaHoja(it)};
      _CAMPOS_PRECIO.forEach(k=>{ if(it[k]!==undefined) o[k]=it[k]; });
      return o;
    })
  };
}
function descParaHoja(it){ try{ return String(shortDescAuth(it)||it.desc||''); }catch(_){ return String(it.desc||''); } }

/* ----- Asegurar la sesión antes de sellar -----
   El token de Google vive en la memoria de la plataforma y dura una hora. Si ya caducó, se pide
   otra vez: `sesion()` abre la ventana de Google, y por eso esto tiene que correr dentro del
   toque de «Autorizar» —una ventana que no sale de un toque el navegador la bloquea—. */
async function asegurarSesion(){
  const b=_al3d();
  if(!b) return {ok:false,mensaje:'Para autorizar, abre el cotizador desde la plataforma y entra con la cuenta de Google de Dirección.'};
  if(typeof b.sesion!=='function') return {ok:true};
  try{ return await b.sesion(); }catch(_){ return {ok:false,mensaje:'No se pudo confirmar tu cuenta de Google.'}; }
}

/* ===================== Sellar =====================
   La única puerta por la que un precio pasa a «autorizado». La usan el formulario de revisión
   de este teléfono y la revisión de una solicitud que llegó de otro. */
async function sellarEnLaHoja(folio,cot,precioAuth,itemsAuth,nota){
  if(navigator.onLine===false) throw new Error('Sin señal no se puede sellar el precio. Lo que tecleaste se queda aquí: autoriza cuando vuelva la señal.');
  const s=await asegurarSesion();
  if(!s.ok) throw new Error(s.mensaje||'No se pudo confirmar tu cuenta de Google.');
  let r;
  try{ r=await hablarHoja('autorizar',{folio,cotizacion:cot,precioAuth:precioAuth||0,itemsAuth:itemsAuth||{},nota:nota||''},30000); }
  catch(e){ throw new Error((e&&e.message)||'No se pudo llegar a la hoja. Vuelve a intentarlo con señal.'); }
  if(!r||r.ok!==true||!r.sello){
    const e=new Error((r&&r.mensaje)||'La hoja no selló el precio.'); e.codigo=r&&r.codigo; throw e;
  }
  return r.sello;
}

/* Lo que un sello le hace a la cotización en pantalla. Es la cola de escrituras que antes vivía
   dentro de autorizarConfirmado(), sacada aquí porque ahora hay DOS maneras de recibir un sello
   —autorizar en este teléfono, o que llegue el que se pidió a dirección— y no pueden dejar la
   cotización en dos estados distintos. */
function aplicarSello(sello){
  Q.precioAuth=Number(sello.precioAuth)||0;
  Q.itemsAuth=JSON.parse(JSON.stringify(sello.itemsAuth||{}));
  sellarAuth();
  Q.estado='autorizada';
  Q.autorizador=String(sello.correo||'');
  Q.nota=String(sello.nota||'');
  const d=new Date(sello.ts);
  Q.fechaAuth=(isNaN(d)?new Date():d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
  Q.sello={codigo:String(sello.codigo),correo:Q.autorizador,ts:String(sello.ts),total:Number(sello.total)||0,folio:folioGlobal()};
  Q.solicitud=null;
  _selfAuth=false; _reautorizando=null;
  paBorradorLimpiar();
  confirmarFolio(Q.folio);
  updateQueueEntry(Q.folio,{estado:'autorizada',precioAuth:Q.precioAuth,autorizador:Q.autorizador,nota:Q.nota,fechaAuth:Q.fechaAuth,itemsAuth:Q.itemsAuth,huellaAuth:Q.huellaAuth});
  const guardada=guardarEnHistorial();
  /* Solo si el historial DE VERDAD la recibió. Cuando no cupo, la cola es la única copia que
     queda del folio, el precio autorizado y quién lo autorizó. */
  if(guardada) removeFromQueue(Q.folio);
  saveState(); renderItems();
  vibrar(14);
  /* El total del sello es el que la hoja calculó. Si el de aquí no le da lo mismo, algo en este
     teléfono no es lo que la hoja firmó —una versión vieja del cálculo del total— y hay que
     decirlo antes de que salga un PDF con un número y un QR con otro. */
  if(Math.abs(desgloseFinal().neto-Q.sello.total)>0.01){
    toast('El total de este teléfono ('+money(desgloseFinal().neto)+') no es el que selló la hoja ('+money(Q.sello.total)+'). Actualiza la app antes de mandar el PDF.','err',12000);
    return guardada;
  }
  const _r=respaldoEstado();
  if(guardada&&_saveOk&&_r.vencido) toast('✓ Autorizada y sellada · '+(_r.sinRespaldar||_r.total)+' sin respaldar en este teléfono','',6000,{label:'Respaldar',fn:()=>respaldar()});
  else if(guardada&&_saveOk) toast('✓ Autorizada y sellada en la hoja · '+Q.sello.codigo,'ok',4200);
  else if(guardada) toast('Autorizada y guardada, pero la cotización en curso ya no cabe en este teléfono — respalda y borra cotizaciones viejas','err',9000,{label:'Respaldar',fn:()=>respaldar()});
  return guardada;
}

/* ===================== Solicitar =====================
   Quien cotiza sin ser dirección no autoriza: pide. La solicitud se queda en la cola de este
   teléfono —así el precio se bloquea aunque no haya señal— y además sube a la hoja, que es de
   donde la ve dirección en el suyo. Si no sube, se reintenta sola. */
async function enviarSolicitud(){
  if(Q.estado!=='pendiente'||!Q.solicitud) return;
  const folio=Q.folio;
  try{
    const r=await hablarHoja('solicitar',{folio:folioGlobal(folio),cotizacion:cotParaHoja(),nota:''});
    if(Q.folio!==folio||!Q.solicitud) return;
    if(r&&r.ok){
      const nueva=!Q.solicitud.enviada;
      Q.solicitud.enviada=true; Q.solicitud.error='';
      saveState(); renderAuth();
      if(nueva) toast('Solicitud enviada a Dirección · te aviso cuando la autoricen','ok',4200);
    } else {
      /* Un catálogo que no cuadra no se arregla reintentando: se dice y se para. */
      Q.solicitud.error=(r&&r.mensaje)||'La hoja no aceptó la solicitud.';
      Q.solicitud.definitivo=r&&r.codigo==='CATALOGO_DESINCRONIZADO';
      saveState(); renderAuth();
      toast(Q.solicitud.error,'err',8000);
    }
  }catch(e){
    if(Q.folio!==folio||!Q.solicitud) return;
    const primera=!Q.solicitud.error;
    Q.solicitud.error=e.codigo==='SIN_PUENTE'?e.message:'Sin señal: la solicitud se manda sola cuando vuelva.';
    saveState(); renderAuth();
    if(primera) toast(Q.solicitud.error,'err',6000);
  }
  vigilarSolicitudes();
}
/* La solicitud ya no corresponde —se reabrió para editar—: se retira de la cola de dirección
   para que nadie autorice un trabajo que ya no es éste. Si no hay señal, la hoja se entera por
   el lado de la huella: autorizar lo viejo no se aplicaría aquí. */
function retirarSolicitud(folio){
  hablarHoja('cancelar',{folio:folioGlobal(folio)}).catch(()=>{});
}

/* ===================== Esperar la respuesta =====================
   Cada quince segundos mientras la pantalla está a la vista, y en cuanto se vuelve a ella —de
   WhatsApp, de otra app—, que es cuando de verdad se mira. Con la pantalla apagada no se
   pregunta nada: no hay nadie para leer la respuesta. */
const VIGILA_MS=15000;
let _vigilaT=null, _vigilaEnVuelo=false;
const _yaAvisadas=new Set();
function _foliosEsperando(){
  const fs=new Set();
  if(Q.estado==='pendiente'&&Q.solicitud) fs.add(Q.folio);
  getQueue().forEach(e=>{ if(e.estado==='pendiente'&&e.q&&e.q.solicitud) fs.add(e.folio); });
  return [...fs].slice(0,20);
}
function vigilarSolicitudes(){
  clearTimeout(_vigilaT); _vigilaT=null;
  if(!_foliosEsperando().length&&!_veoColaRemota()) return;
  _vigilaT=setTimeout(()=>{ if(document.visibilityState!=='hidden') consultarSolicitudes(); else vigilarSolicitudes(); },VIGILA_MS);
}
async function consultarSolicitudes(){
  if(_vigilaEnVuelo) return;
  _vigilaEnVuelo=true;
  try{
    /* Lo que no subió, se vuelve a mandar antes de preguntar por ello. */
    if(Q.estado==='pendiente'&&Q.solicitud&&!Q.solicitud.enviada&&!Q.solicitud.definitivo) await enviarSolicitud();
    const folios=_foliosEsperando();
    if(folios.length){
      const r=await hablarHoja('estado',{folios:folios.map(f=>folioGlobal(f))});
      if(r&&r.ok&&r.folios) folios.forEach(f=>atenderRespuesta(f,r.folios[folioGlobal(f)]));
    }
    if(_veoColaRemota()) await cargarPendientesRemotas();
  }catch(_){ /* sin señal: se vuelve a preguntar en la siguiente vuelta */ }
  finally{ _vigilaEnVuelo=false; vigilarSolicitudes(); }
}
function atenderRespuesta(folio,x){
  if(!x||!x.estado||x.estado==='pendiente') return;
  const enPantalla=folio===Q.folio&&Q.estado==='pendiente';
  if(x.estado==='autorizada'&&x.sello){
    if(!enPantalla){
      /* Es de una cotización que está en la cola, no en pantalla: se avisa y se abre con un toque.
         Al abrirla, la siguiente vuelta la encuentra en pantalla y le aplica el sello. */
      if(_yaAvisadas.has(folio)) return;
      _yaAvisadas.add(folio);
      toast(folio+' ya está autorizada por '+x.sello.correo,'ok',9000,{label:'Abrir',fn:()=>loadQueueEntry(folio)});
      return;
    }
    /* El sello es del trabajo que se pidió. Si en este teléfono las partidas ya son otras, esa
       autorización no es de esto: se dice y no se aplica. */
    if(x.sello.huella!==huellaTrabajo()){
      if(!_yaAvisadas.has(folio+'#h')){ _yaAvisadas.add(folio+'#h'); toast('Dirección autorizó '+folio+', pero las partidas cambiaron aquí después de pedirla. Vuelve a solicitarla.','err',9000); }
      return;
    }
    aplicarSello(x.sello);
    toast('✓ '+x.sello.correo+' autorizó '+folio+' · '+money(Q.sello.total),'ok',6000);
    return;
  }
  if(x.estado==='rechazada'&&enPantalla){
    Q.estado='rechazada'; Q.autorizador=x.resolvio||''; Q.nota=x.nota||''; Q.solicitud=null;
    Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth=''; Q.sello=null;
    removeFromQueue(Q.folio); saveState(); renderItems(); vibrar([20,60,20]);
    toast('Dirección rechazó '+folio+(x.nota?' — '+x.nota:''),'err',8000);
  }
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&(_foliosEsperando().length||_veoColaRemota())) consultarSolicitudes(); });
window.addEventListener('online',()=>{ if(_foliosEsperando().length||_veoColaRemota()) consultarSolicitudes(); });

/* ===================== La cola de dirección, de todos los teléfonos =====================
   La cola de siempre (`al3d_queue`) es de este aparato. Lo que se pidió desde otro llega por
   la hoja, y se pinta en la misma lista con su marca. Se revisa aparte, en su propia ventana,
   porque no es una cotización de este teléfono: no ocupa su folio ni entra a su historial. */
let _remotas=[], _remotasTs=0;
function _veoColaRemota(){ return Q.rol==='autorizador'&&puedeAutorizar(); }
async function cargarPendientesRemotas(){
  if(!puedeAutorizar()) return;
  try{
    const r=await hablarHoja('pendientes',{});
    if(r&&r.ok&&Array.isArray(r.solicitudes)){
      const propio='@'+dispositivo();
      /* Las de este mismo aparato ya están en la cola local: no se pintan dos veces. */
      const nuevas=r.solicitudes.filter(s=>s&&s.folio&&!String(s.folio).endsWith(propio));
      const cambio=JSON.stringify(nuevas.map(s=>s.folio))!==JSON.stringify(_remotas.map(s=>s.folio));
      _remotas=nuevas; _remotasTs=Date.now();
      if(cambio&&Q.rol==='autorizador') renderAuth();
      pintarPasos();
    }
  }catch(_){}
}
function remotasHTML(){
  if(!_remotas.length) return '';
  return _remotas.map(s=>{
    const c=s.cotizacion||{}, sub=(c.items||[]).reduce((t,it)=>t+lineTotal(it),0);
    const neto=c.iva?sub*1.16:sub;
    return `<div class="queue-item remota" ${_ABRIBLE} aria-label="Revisar ${esc(s.folio)} de otro teléfono${c.proyecto?', '+esc(c.proyecto):''}" onclick="abrirRevisionRemota('${esc(s.folio)}')">
      <span class="qi-dot"></span>
      <div class="qi-body">
        <div class="qi-folio">${esc(String(s.folio).split('@')[0])} <span class="qi-remota">otro teléfono</span></div>
        <div class="qi-name">${esc(c.proyecto||c.cliente||'Sin nombre')}</div>
        <div class="qi-fecha">${esc(s.solicito||'')}</div>
      </div>
      <div style="text-align:right"><div class="qi-total">${money(neto)}</div></div>
    </div>`;
  }).join('');
}

/* ----- La revisión de una solicitud remota ----- */
let _remotaAbierta=null;
function abrirRevisionRemota(folio){
  const s=_remotas.find(x=>x.folio===folio); if(!s) return;
  _remotaAbierta=s;
  const c=s.cotizacion||{}, items=c.items||[];
  const sub=+items.reduce((t,it)=>t+lineTotal(it),0).toFixed(2);
  $('rem-titulo').textContent=String(folio).split('@')[0]+(c.proyecto?' — '+c.proyecto:'');
  $('rem-quien').textContent='La pidió '+(s.solicito||'otro teléfono')+(c.cliente?' · cliente: '+c.cliente:'')+(s.nota?' · «'+s.nota+'»':'');
  $('rem-partidas').innerHTML=items.map((it,i)=>`<div class="ia-row"><div class="ia-hdr"><div class="ia-num">${i+1}</div><div class="ia-desc">${esc(it.desc||TIPO_NOMBRE[it.tipo]||'Partida')}</div><div class="ia-calc">${money(lineTotal(it))}</div></div></div>`).join('')
    +`<div class="ia-total"><span>${c.iva?'Subtotal calculado':'Total calculado'}</span><span>${money(sub)}</span></div>`;
  $('rem-lab').textContent='Precio final autorizado'+(c.iva?' · subtotal, SIN IVA':' (sin IVA)');
  $('rem-precio').value=sub;
  $('rem-nota').value='';
  pintarRemotaNeto();
  const i=identidadVerificada();
  $('rem-autoriza').innerHTML='Se sella en la hoja a nombre de <b>'+esc(i?i.correo:'—')+'</b>.';
  $('rem-estado').textContent='';
  remotaOcupada(false);
  $('remotamodal').classList.add('show');
}
function pintarRemotaNeto(){
  const c=(_remotaAbierta&&_remotaAbierta.cotizacion)||{};
  const v=parseFloat($('rem-precio').value)||0;
  $('rem-neto').innerHTML=c.iva?'Con IVA 16%: <b>'+money(+(v*1.16).toFixed(2))+'</b>':'';
}
function cerrarRevisionRemota(){ $('remotamodal').classList.remove('show'); _remotaAbierta=null; }
function remotaOcupada(si){
  ['rem-autorizar','rem-rechazar'].forEach(id=>{ const b=$(id); if(b) b.disabled=si; });
  const b=$('rem-autorizar'); if(b) b.classList.toggle('trabajando',si);
}
async function autorizarRemota(){
  const s=_remotaAbierta; if(!s) return;
  const c=s.cotizacion||{}, items=c.items||[];
  const sub=items.reduce((t,it)=>t+lineTotal(it),0);
  const v=parseFloat($('rem-precio').value)||0;
  /* El mismo criterio que el formulario de siempre: lo tecleado es el SUBTOTAL, y el precio
     autorizado se guarda en neto. Igual al calculado es «sin ajuste». */
  const precioAuth=(v>0&&Math.abs(v-sub)>0.01)?+(c.iva?v*1.16:v).toFixed(2):0;
  remotaOcupada(true); $('rem-estado').textContent='Sellando en la hoja…';
  try{
    const sello=await sellarEnLaHoja(s.folio,Object.assign({},c,{subtotal:sub}),precioAuth,{},$('rem-nota').value.trim());
    vibrar(14);
    toast('✓ '+String(s.folio).split('@')[0]+' autorizada · '+money(sello.total)+' · el teléfono que la pidió la recibe solo','ok',6000);
    _remotas=_remotas.filter(x=>x.folio!==s.folio);
    cerrarRevisionRemota(); renderAuth(); pintarPasos();
  }catch(e){
    remotaOcupada(false); $('rem-estado').textContent=e.message;
  }
}
async function rechazarRemota(){
  const s=_remotaAbierta; if(!s) return;
  if(navigator.onLine===false){ $('rem-estado').textContent='Sin señal no se puede avisar al otro teléfono.'; return; }
  remotaOcupada(true); $('rem-estado').textContent='Avisando…';
  try{
    const ses=await asegurarSesion(); if(!ses.ok) throw new Error(ses.mensaje);
    const r=await hablarHoja('rechazar',{folio:s.folio,nota:$('rem-nota').value.trim()});
    if(!r||!r.ok) throw new Error((r&&r.mensaje)||'La hoja no registró el rechazo.');
    vibrar([20,60,20]);
    toast(String(s.folio).split('@')[0]+' rechazada · el otro teléfono se entera solo','err',5000);
    _remotas=_remotas.filter(x=>x.folio!==s.folio);
    cerrarRevisionRemota(); renderAuth(); pintarPasos();
  }catch(e){ remotaOcupada(false); $('rem-estado').textContent=e.message; }
}

/* ----- Una vibración corta, donde el teléfono la tiene -----
   En tres momentos y en ninguno más: autorizar, borrar y rechazar. Vibrar al teclear sería ruido
   en la mano. Con «reducir movimiento» encendido tampoco: quien lo pide está pidiendo menos
   estímulo, no solo menos animación. */
function vibrar(patron){
  try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(_){}
  try{ if(navigator.vibrate) navigator.vibrate(patron); }catch(_){}
}
