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
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      /* La ruta primero: la hoja solo abre su tope de 64 KB a un cuerpo que empieza por ella. */
      body:JSON.stringify(Object.assign({ruta},cuerpo,{token:cfg.token,ruta}))});
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
  /* La autorizada que era, si esto cierra un «Volver a autorizar»: de ahí sale el precio que el
     cliente ya tiene en la mano (re.pf). */
  const re=(Q.reauth&&Q.reauth.folio===Q.folio)?Q.reauth:null;
  Q.precioAuth=Number(sello.precioAuth)||0;
  Q.itemsAuth=JSON.parse(JSON.stringify(sello.itemsAuth||{}));
  sellarAuth();
  Q.estado='autorizada';
  Q.autorizador=String(sello.correo||'');
  Q.nota=String(sello.nota||'');
  const d=new Date(sello.ts);
  Q.fechaAuth=(isNaN(d)?new Date():d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
  /* El proyecto que la hoja firmó viaja con el sello aunque la huella no lo cubra: verificar.html
     lo enseña, y el PDF dice «si el negocio no coincide, este documento fue alterado». Corregirlo
     después con «Corregir datos del cliente» no suelta el precio —las partidas no cambiaron—,
     así que es aquí donde se guarda contra qué comparar (selloImprimible, entrega.js). El sello
     de la hoja no lo trae: se toma el que se le mandó —el de la solicitud, si la hubo, porque
     mientras se esperaba se pudo corregir— y si no, el de la pantalla, que es el que acaba de
     salir en cotParaHoja(). */
  const sol=Q.solicitud;
  const proyecto=typeof sello.proyecto==='string'?sello.proyecto
    : (sol&&typeof sol.proyecto==='string')?sol.proyecto : (Q.proy||'').trim();
  Q.sello={codigo:String(sello.codigo),correo:Q.autorizador,ts:String(sello.ts),total:Number(sello.total)||0,folio:folioGlobal(),proyecto};
  Q.solicitud=null;
  _selfAuth=false; Q.reauth=null;
  paBorradorLimpiar();
  /* EL CLIENTE QUE REGATEA: el mismo folio a otro precio sin tocar una partida. La huella no
     cambió, así que nada desmarcaba el «PDF generado» ni el «Chat abierto», y «qué sigue» saltaba
     a «Registrar venta» con el cliente sosteniendo un PDF con el precio viejo. Si el precio cambió,
     esos dos papeles ya no dicen la verdad y se vuelven a pedir. */
  if(re&&Math.abs((Number(re.pf)||0)-precioFinal())>0.01) desmarcarHitos(['pdf','wa']);
  /* El anticipo se pone al precio autorizado ANTES de guardar en el historial: si no, el
     historial se quedaba con la mitad del precio CALCULADO y su firma no cuadraba con la de Q. */
  const antiAcotado=ajustarAnticipoAlPrecio();
  confirmarFolio(Q.folio);
  updateQueueEntry(Q.folio,{estado:'autorizada',precioAuth:Q.precioAuth,autorizador:Q.autorizador,nota:Q.nota,fechaAuth:Q.fechaAuth,itemsAuth:Q.itemsAuth,huellaAuth:Q.huellaAuth});
  const guardada=guardarEnHistorial();
  /* Solo si el historial DE VERDAD la recibió. Cuando no cupo, la cola es la única copia que
     queda del folio, el precio autorizado y quién lo autorizó. */
  if(guardada) removeFromQueue(Q.folio);
  saveState(); renderItems();
  vibrar(14);
  /* El neón (C23 #7): un momento breve sobre la tarjeta de autorización, que ya cambió a «Autorizada
     por…». Va aquí y no en autorizarConfirmado() porque hay DOS maneras de recibir un sello —autorizar
     en este teléfono, o que llegue el que se pidió a Dirección— y las dos son «se autorizó». En
     reposo no queda nada: la pieza quita sus capas por reloj, y renderAuth() conserva la capa si el
     panel se repinta mientras dura. */
  try{ if(window.Piezas&&Piezas.encenderNeon&&document.visibilityState==='visible') Piezas.encenderNeon('authbox'); }catch(_){}
  /* El total del sello es el que la hoja calculó. Si el de aquí no le da lo mismo, algo en este
     teléfono no es lo que la hoja firmó —una versión vieja del cálculo del total— y hay que
     decirlo antes de que salga un PDF con un número y un QR con otro. */
  /* ----- El único aviso que no se puede perder (C3) -----
     Impide mandar un PDF con un número y un QR con otro, y hasta aquí lo tapaban dos cosas: el
     «✓ … autorizó» que sale en la línea siguiente de atenderRespuesta (el mismo toast, el mismo
     lugar) y, cuando el marco del cotizador está escondido en la plataforma, el hecho de que nadie
     mira ese marco. Lo primero ya lo cierra la pila de avisos: un error tiene prioridad sobre
     todo lo informativo y nunca cede su lugar a uno, así que el «✓» entra en el otro de los dos
     sitios y el error se queda sus 12 s completos. Lo segundo se cierra pasándolo por
     avisoDelNotario(), que es quien sabe si el marco se ve: escondido, lo da la plataforma con
     el suyo y su botón «Ver» trae de vuelta al Cotizador. Con el marco a la vista es el mismo
     toast de siempre. */
  if(Math.abs(desgloseFinal().neto-Q.sello.total)>0.01){
    avisoDelNotario('El total de este teléfono ('+money(desgloseFinal().neto)+') no es el que selló la hoja ('+money(Q.sello.total)+'). Actualiza la app antes de mandar el PDF.','err',12000);
    return guardada;
  }
  const _r=respaldoEstado();
  if(guardada&&_saveOk&&_r.vencido) toast('✓ Autorizada y sellada · '+(_r.sinRespaldar||_r.total)+' sin respaldar en este teléfono','',6000,{label:'Respaldar',fn:()=>respaldar()});
  else if(guardada&&_saveOk&&antiAcotado) toast('✓ Autorizada y sellada. El anticipo pactado era mayor que el total autorizado de '+money(precioFinal())+': se dejó igual al total.','err',6400);
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
  const folio=Q.folio, sol=Q.solicitud, cot=cotParaHoja();
  try{
    const r=await hablarHoja('solicitar',{folio:folioGlobal(folio),cotizacion:cot,nota:''});
    /* Se canceló mientras iba en camino —«Editar», rechazar, otro cliente—. El «cancelar» pudo
       llegar a la hoja ANTES que esta solicitud, y entonces la dejó viva en la cola de dirección
       para un trabajo que ya no existe. Si la hoja la aceptó, se retira otra vez. */
    if(sol.retirada){
      if(!(r&&r.ok)) return;
      /* Salvo que ya se haya vuelto a pedir el mismo folio: entonces lo que la hoja tiene puede
         ser esto viejo encima de lo nuevo, y lo que toca es mandar lo nuevo en la siguiente
         vuelta, no cancelarlo. */
      if(Q.folio===folio&&Q.estado==='pendiente'&&Q.solicitud){ Q.solicitud.enviada=false; saveState(); }
      else retirarSolicitud(folio);
      return;
    }
    if(Q.folio!==folio||!Q.solicitud) return;
    if(r&&r.ok){
      const nueva=!Q.solicitud.enviada;
      Q.solicitud.enviada=true; Q.solicitud.error=''; delete Q.solicitud.cancelada;   // se volvió a pedir
      /* Lo que la hoja tiene es lo de ESTE envío: su proyecto es el que el sello va a firmar. */
      Q.solicitud.proyecto=cot.proyecto;
      saveState(); solicitudALaCola(folio); renderAuth();
      if(nueva) toast('Solicitud enviada a Dirección · te aviso cuando la autoricen','ok',4200);
    } else {
      /* Un catálogo que no cuadra no se arregla reintentando: se dice y se para. */
      Q.solicitud.error=(r&&r.mensaje)||'La hoja no aceptó la solicitud.';
      Q.solicitud.definitivo=r&&r.codigo==='CATALOGO_DESINCRONIZADO';
      saveState(); solicitudALaCola(folio); renderAuth();
      toast(Q.solicitud.error,'err',8000);
    }
  }catch(e){
    /* Sin respuesta no se sabe si llegó: el tope de espera corta aquí, pero Apps Script puede
       haberla escrito igual. Por eso retirar no pregunta si estaba `enviada` (ver reabrir). */
    if(sol.retirada||Q.folio!==folio||!Q.solicitud) return;
    const primera=!Q.solicitud.error;
    Q.solicitud.error=e.codigo==='SIN_PUENTE'?e.message:'Sin señal: la solicitud se manda sola cuando vuelva.';
    saveState(); renderAuth();
    if(primera) toast(Q.solicitud.error,'err',6000);
  }
  vigilarSolicitudes();
}
/* La foto de la cola se toma en solicitarConfirmado(), ANTES de mandar: se quedaba con
   `enviada:false` y sin `definitivo` para siempre. Al abrir otra, la de la cola se seguía
   preguntando aunque la hoja ya hubiera dicho que su catálogo no cuadra, y al volver a abrirla
   se reenviaba una solicitud que ya estaba —o que ya se había autorizado—. Lo que la hoja
   contestó se copia también a la cola. */
function solicitudALaCola(folio){
  const e=getQueue().find(x=>x.folio===folio&&x.estado==='pendiente');
  if(e&&e.q&&Q.solicitud) updateQueueEntry(folio,{q:Object.assign({},e.q,{solicitud:JSON.parse(JSON.stringify(Q.solicitud))})});
}
/* La solicitud ya no corresponde —se reabrió para editar—: se retira de la cola de dirección
   para que nadie autorice un trabajo que ya no es éste. Si no hay señal, la hoja se entera por
   el lado de la huella: autorizar lo viejo no se aplicaría aquí.
   Se llama SIEMPRE que haya solicitud, subiera o no: una que va en camino, o una que se dio por
   perdida al vencer la espera, puede estar ya en la hoja, y /cancelar sobre un folio sin
   solicitud viva no hace nada. `sol` es el objeto que se retira: queda marcado para que un envío
   que todavía no contesta sepa, al volver, que lo que subió ya no vale (enviarSolicitud). */
function retirarSolicitud(folio,sol){
  if(sol) sol.retirada=true;
  hablarHoja('cancelar',{folio:folioGlobal(folio)}).catch(()=>{});
}

/* ===================== Esperar la respuesta =====================
   Cada quince segundos mientras la pantalla está a la vista, y en cuanto se vuelve a ella —de
   WhatsApp, de otra app—, que es cuando de verdad se mira. Con la pantalla apagada no se
   pregunta nada: no hay nadie para leer la respuesta. */
const VIGILA_MS=15000;
let _vigilaT=null, _vigilaEnVuelo=false;
/* Cuándo contestó la hoja la última vez que se le preguntó por las solicitudes (C9). Es lo que
   dice «revisado hace 9 s» en la espera: sin él, una solicitud pendiente era una frase y un giro,
   y no se sabía si la app seguía preguntando o se había quedado esperando en silencio. Solo cuenta
   una respuesta de verdad —una consulta sin señal no mueve la hora—. */
let _estadoTs=0;
const _yaAvisadas=new Set();
/* Qué solicitudes siguen esperando una respuesta de la hoja. Dos no, aunque sigan pendientes:
   la `definitivo` —la hoja la rechazó por el catálogo y nunca llegó a dirección, así que no hay
   respuesta que esperar— y la que ya trae `rechazo` —la hoja ya contestó y la cotización está
   en la cola esperando a que alguien la abra—. Las dos se preguntaban cada quince segundos para
   siempre. Tampoco la `cancelada`: la hoja dijo que ya no está en la cola de dirección, y
   preguntar otra vez no la devuelve (ver atenderCancelada). */
function _esperaViva(sol){ return !!(sol&&!sol.definitivo&&!sol.rechazo&&!sol.cancelada); }
function _foliosEsperando(){
  const fs=new Set();
  if(Q.estado==='pendiente'&&_esperaViva(Q.solicitud)) fs.add(Q.folio);
  getQueue().forEach(e=>{ if(e.estado==='pendiente'&&e.q&&_esperaViva(e.q.solicitud)) fs.add(e.folio); });
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
    /* Lo que no subió, se vuelve a mandar antes de preguntar por ello. Lo que alguien retiró
       de la cola de dirección, no: volver a pedirlo es decisión de quien cotiza, con su botón. */
    if(Q.estado==='pendiente'&&Q.solicitud&&!Q.solicitud.enviada&&!Q.solicitud.definitivo&&!Q.solicitud.cancelada) await enviarSolicitud();
    const folios=_foliosEsperando();
    if(folios.length){
      const r=await hablarHoja('estado',{folios:folios.map(f=>folioGlobal(f))});
      if(r&&r.ok&&r.folios){
        _estadoTs=Date.now();
        folios.forEach(f=>atenderRespuesta(f,r.folios[folioGlobal(f)]));
        /* La espera de la pantalla repinta su «revisado hace…» con la hora nueva. Con la solicitud
           ya contestada no queda nada que repintar, y atenderRespuesta se encargó. */
        if(typeof pintarHaceEspera==='function') pintarHaceEspera();
      }
    }
    if(_veoColaRemota()) await cargarPendientesRemotas();
  }catch(_){ /* sin señal: se vuelve a preguntar en la siguiente vuelta */ }
  finally{ _vigilaEnVuelo=false; vigilarSolicitudes(); }
}
/* ----- Un sello de antes de pedir no contesta esta solicitud -----
   /estado devuelve el último sello VIGENTE del folio, y un folio que ya estuvo autorizado tiene
   uno. «Volver a autorizar el precio» (reautorizar, proceso.js) deja la cotización pendiente
   con las MISMAS partidas —el cliente regatea el precio, no el trabajo—, así que la huella del
   sello viejo cuadra, y a los quince segundos la vuelta lo aplicaba: autorizada otra vez, al
   precio de antes, sin que dirección hubiera visto nada. La hoja se está arreglando para no
   mandarlo; aquí se defiende también, por dos lados:
     · el código del sello que se está volviendo a autorizar (Q.reauth.sello) no es respuesta,
       sin importar la hora —cubre el regateo de cinco minutos después—;
     · un sello emitido antes de pedir tampoco. La hora de la solicitud es la de ESTE teléfono
       (Date.now() en solicitarConfirmado) y la del sello la de Google: la holgura es para un
       reloj adelantado, que de otro modo tiraría el sello bueno y dejaría la cotización
       esperando para siempre. */
const SELLO_HOLGURA_MS=2*60*1000;
function selloDeAntes(sello,sol,reauth,folio){
  if(!sello) return false;
  const viejo=reauth&&reauth.folio===folio&&reauth.sello;
  if(viejo&&viejo.codigo&&String(viejo.codigo)===String(sello.codigo)) return true;
  const t=Date.parse(sello.ts), pedida=Number(sol&&sol.ts)||0;
  return pedida>0&&isFinite(t)&&t<pedida-SELLO_HOLGURA_MS;
}
function atenderRespuesta(folio,x){
  if(!x||!x.estado||x.estado==='pendiente') return;
  const enPantalla=folio===Q.folio&&Q.estado==='pendiente';
  const fila=enPantalla?null:getQueue().find(e=>e.folio===folio&&e.estado==='pendiente');
  const cot=enPantalla?Q:(fila&&fila.q)||null;
  if(x.estado==='autorizada'&&x.sello){
    if(cot&&selloDeAntes(x.sello,cot.solicitud,cot.reauth,folio)) return;
    if(!enPantalla){
      /* Es de una cotización que está en la cola, no en pantalla: se avisa y se abre con un toque.
         Al abrirla, la siguiente vuelta la encuentra en pantalla y le aplica el sello. */
      if(_yaAvisadas.has(folio)) return;
      _yaAvisadas.add(folio);
      avisoDelNotario(folio+' ya está autorizada por '+x.sello.correo,'ok',9000,folio);
      return;
    }
    /* El sello es del trabajo que se pidió. Si en este teléfono las partidas ya son otras, esa
       autorización no es de esto: se dice y no se aplica. */
    if(x.sello.huella!==huellaTrabajo()){
      if(!_yaAvisadas.has(folio+'#h')){ _yaAvisadas.add(folio+'#h'); avisoDelNotario('Dirección autorizó '+folio+', pero las partidas cambiaron aquí después de pedirla. Vuelve a solicitarla.','err',9000); }
      return;
    }
    aplicarSello(x.sello);
    avisoDelNotario('✓ '+x.sello.correo+' autorizó '+folio+' · '+money(Q.sello.total),'ok',6000);
    return;
  }
  if(x.estado==='cancelada'){ atenderCancelada(folio,enPantalla,fila); return; }
  /* `null` es «la hoja no tiene esa solicitud», y puede ser que todavía no le llegue: se sigue
     preguntando. */
  if(x.estado!=='rechazada') return;
  if(!enPantalla){
    /* Rechazada, y en la cola, no en pantalla. Antes no se decía nada y se seguía preguntando
       por ella cada quince segundos para siempre. Se avisa como la autorizada, con «Abrir», y la
       respuesta se guarda en su solicitud: sale de la espera (_esperaViva) y se aplica al
       abrirla (aplicarRechazoGuardado), también si se abre días después desde la cola.
       No se aplica aquí: rechazar la saca de la cola, y en la cola está la única copia. */
    if(!fila||!fila.q||!fila.q.solicitud||fila.q.solicitud.rechazo) return;
    const sol=Object.assign({},fila.q.solicitud,{rechazo:{resolvio:String(x.resolvio||''),nota:String(x.nota||'')}});
    updateQueueEntry(folio,{q:Object.assign({},fila.q,{solicitud:sol})});
    if(_yaAvisadas.has(folio+'#r')) return;
    _yaAvisadas.add(folio+'#r');
    avisoDelNotario('Dirección rechazó '+folio+(x.nota?' — '+x.nota:''),'err',9000,folio);
    return;
  }
  Q.estado='rechazada'; Q.autorizador=x.resolvio||''; Q.nota=x.nota||''; Q.solicitud=null;
  Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth=''; Q.sello=null;
  removeFromQueue(Q.folio); saveState(); renderItems(); vibrar([20,60,20]);
  avisoDelNotario('Dirección rechazó '+folio+(x.nota?' — '+x.nota:''),'err',8000);
}
/* ----- Cancelada en la hoja -----
   La retiró Dirección, o este mismo teléfono desde otra sesión. Se preguntaba por ella cada
   quince segundos para siempre, porque atenderRespuesta solo conocía «autorizada» y
   «rechazada». Es una respuesta final: sale de la espera (`cancelada`, ver _esperaViva) y la
   cotización se queda pendiente en la cola —no se borra nada: ahí puede estar la única copia—,
   con «Volver a pedirla» a la mano (renderAuth, proceso.js) y «Editar» como siempre.
   Se avisa una vez, y no se avisa lo que retiró este teléfono (`retirada`): eso ya lo sabe
   quien tocó el botón. */
function atenderCancelada(folio,enPantalla,fila){
  const sol=enPantalla?Q.solicitud:(fila&&fila.q&&fila.q.solicitud);
  if(!sol||sol.cancelada) return;
  const nueva=Object.assign({},sol,{enviada:false,cancelada:true,
    error:'La solicitud ya no está en la cola de Dirección. Vuelve a pedirla cuando esté lista, o edítala.'});
  if(enPantalla){ Q.solicitud=nueva; saveState(); solicitudALaCola(folio); renderAuth(); }
  else updateQueueEntry(folio,{q:Object.assign({},fila.q,{solicitud:nueva})});
  if(sol.retirada||_yaAvisadas.has(folio+'#c')) return;
  _yaAvisadas.add(folio+'#c');
  avisoDelNotario('La solicitud de '+folio+' se retiró de la cola de Dirección · vuelve a pedirla cuando esté lista','err',9000,enPantalla?null:folio);
}
/* La que se rechazó mientras estaba en la cola, al abrirla. La llaman loadQueueEntry() y el
   arranque: ésa es la próxima vez que la cotización está en pantalla. */
function aplicarRechazoGuardado(){
  const s=Q.solicitud;
  if(Q.estado!=='pendiente'||!s||!s.rechazo) return;
  atenderRespuesta(Q.folio,{estado:'rechazada',resolvio:s.rechazo.resolvio,nota:s.rechazo.nota});
}
/* El «Abrir» de esos avisos. Abierta, se pregunta en ese momento en vez de esperar a la vuelta
   siguiente: quien tocó «Abrir» quiere ver el sello puesto, no quince segundos de pendiente. */
async function abrirRespondida(folio){
  await loadQueueEntry(folio);
  if(Q.folio!==folio) return;
  aplicarRechazoGuardado();
  if(_foliosEsperando().includes(folio)) consultarSolicitudes();
}
/* ----- Un aviso que alguien tiene que ver -----
   El cotizador conservado sigue vivo con su sección escondida en la plataforma
   (js/mod/cotizador.js#ocultar), y dentro del marco `visibilityState` sigue diciendo
   'visible': el vigilante pregunta, el sello llega y el aviso se pintaba en un marco que nadie
   ve. Con _yaAvisadas, además, no se repetía nunca. Si la plataforma dice que el marco está
   escondido, el aviso lo da ella con el suyo, y su «Abrir» trae de vuelta al Cotizador.

   Los avisos de aquí no se escriben unos encima de otros porque la pila de toast() (pieza 12)
   decide con la misma regla en las dos páginas: error (2) > con botón (1) > informativo (0). Lo
   que sale con `tipo:'err'` nunca lo reemplaza un informativo, y el «Abrir» de una autorización
   que llegó a la cola tampoco: dos así a la vez se quedan los dos, y un tercero espera su turno
   en vez de pisar a uno. Por eso aquí no hay ninguna lógica de «cuál va primero». */
function avisoDelNotario(msg,tipo,dur,folio){
  const abrir=folio?()=>abrirRespondida(folio):null;
  const b=_al3d();
  try{ if(b&&typeof b.avisar==='function'&&b.avisar(msg,tipo,abrir)===true) return; }catch(_){}
  toast(msg,tipo,dur,abrir?{label:'Abrir',fn:abrir}:null);
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
    /* `data-clave` es la identidad del renglón para listaViva (C22): el folio con su aparato, que no
       se repite entre teléfonos. Con ella lo que llega entra marcado «nueva» y lo que se va se
       pliega, en vez de repintar la lista entera sin que nada distinga la solicitud recién llegada. */
    return `<div class="queue-item remota" data-clave="${esc(s.folio)}" ${_ABRIBLE} aria-label="Revisar ${esc(s.folio)} de otro teléfono${c.proyecto?', '+esc(c.proyecto):''}" onclick="abrirRevisionRemota(${jsArg(s.folio)})">
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

/* ----- La revisión de una solicitud remota -----
   Hasta octubre de 2026 esta ventana solo dejaba mover el TOTAL. Para bajar una partida y no
   otra —«el bastidor va a precio de costo, las letras no se tocan»— Dirección tenía que pedirle
   al vendedor el folio, abrirlo en su teléfono y autorizarlo ahí, que es justo el viaje que la
   solicitud remota existe para ahorrar. Ahora cada renglón trae su calculado y su campo, igual
   que el formulario de este teléfono (authRevisionHTML, proceso.js), y el total sale de ellos.

   No hizo falta tocar el contrato del puente: /autorizar acepta `itemsAuth` desde que existe
   —es lo que manda el formulario local—, lo valida contra las partidas que recalcula
   (limpiarItemsAuth), lo FIRMA dentro del sello (itemsAuthCanon) y /estado lo devuelve con el
   sello al teléfono que pidió, donde aplicarSello() ya lo copiaba a Q.itemsAuth. Lo único que
   faltaba era que esta ventana lo mandara lleno en vez de `{}`. Por eso una solicitud que ya
   estaba en vuelo se revisa igual que una nueva: la solicitud no trae ajustes —los pone quien
   revisa—, y un teléfono que pidió con la versión anterior recibe el sello por el mismo camino. */
let _remotaAbierta=null;
/* Lo tecleado en cada renglón, por el id de la partida EN TEXTO —así lo guarda la hoja—. Vive
   aparte del DOM porque el campo vacío no es «$0»: es «sin ajuste», como en updItemAuth. */
let _remIa={};
/* Lo último que remotaPartida() escribió en el campo del total: distingue «este número lo puso
   la suma de las partidas» de «este número lo tecleó Dirección» (el _aPrecioDerivado de allá). */
let _remDerivado=null;

/* ----- La cuenta de la revisión, sin pantalla -----
   De lo tecleado a lo que se manda a sellar. Es la MISMA regla que el formulario local, escrita
   aparte porque allá la cuenta vive repartida en Q (updItemAuth, autorizarConfirmado) y aquí la
   cotización no es Q —no es de este teléfono—:
     · un renglón vale lo tecleado si es un número ≥ 0 y se aparta del calculado más de un
       centavo; vacío, o igual al calculado, es «sin ajuste» y no viaja (un itemsAuth lleno de
       renglones iguales al calculado no cambia el precio pero sí la firma: dos sellos distintos
       para la misma decisión);
     · el total que se autoriza es el tecleado arriba si lo hay y, si no, la suma de los renglones;
     · `precioAuth` va en NETO —con IVA si la cotización lo lleva—, que es lo que guarda Q desde
       siempre, y en 0 si el total quedó igual al calculado. Igual que conIva(): redondeado al
       centavo, porque la hoja compara al centavo.
   Que el total pueda quedar distinto de la suma de los renglones es el atajo de siempre: un
   precio global encima de las partidas ya ajustadas. El teléfono que pidió lo resuelve con el
   mecanismo de siempre (preciosCliente, nucleo.js): un descuento se le enseña al cliente; un
   aumento se reparte entre las partidas. La hoja no reparte nada: firma el total que se cobra
   (cotTotalFinal) y los ajustes por partida tal cual, y el QR comprueba ese total. */
function cuentaRemota(items,tecleados,subTecleado,iva){
  const r2=n=>+(+n).toFixed(2);
  const lista=Array.isArray(items)?items:[];
  const subCalc=r2(lista.reduce((t,it)=>t+lineTotal(it),0));
  const itemsAuth={};
  lista.forEach(it=>{
    const k=String(it.id), v=tecleados?tecleados[k]:undefined;
    if(v===undefined||v===null||String(v).trim()==='') return;
    const n=Number(v);
    if(!isFinite(n)||n<0) return;
    if(Math.abs(n-lineTotal(it))>0.01) itemsAuth[k]=r2(n);
  });
  const subBase=r2(lista.reduce((t,it)=>{ const v=itemsAuth[String(it.id)]; return t+(v!==undefined?v:lineTotal(it)); },0));
  const g=Number(subTecleado);
  const subFinal=(isFinite(g)&&g>0)?r2(g):subBase;
  const precioAuth=Math.abs(subFinal-subCalc)>0.01?r2(iva?subFinal*1.16:subFinal):0;
  return {subCalc,subBase,subFinal,itemsAuth,precioAuth,ajustadas:Object.keys(itemsAuth).length};
}

function abrirRevisionRemota(folio){
  if(selloEnVuelo()) return;
  const s=_remotas.find(x=>x.folio===folio); if(!s) return;
  _remotaAbierta=s; _remIa={};
  const c=s.cotizacion||{}, items=c.items||[];
  const sub=+items.reduce((t,it)=>t+lineTotal(it),0).toFixed(2);
  $('rem-titulo').textContent=String(folio).split('@')[0]+(c.proyecto?' — '+c.proyecto:'');
  $('rem-quien').textContent='La pidió '+(s.solicito||'otro teléfono')+(c.cliente?' · cliente: '+c.cliente:'')+(s.nota?' · «'+s.nota+'»':'');
  /* Cada renglón con su calculado a la vista y su campo debajo, ya abierto. En el formulario
     local los renglones se pliegan porque comparten columna con toda la cotización; aquí la
     ventana es solo esto, y un renglón plegado es un ajuste que nadie encuentra.
     Los identificadores del DOM van por POSICIÓN y no por el id de la partida: el id llega de
     otro teléfono a través de la hoja, y en un atributo o en un oninput no se pone texto ajeno.
     El encabezado es la etiqueta del campo: tocar el renglón pone el cursor en su precio. */
  $('rem-partidas').innerHTML=`<div class="auth-divider">Precio de cada partida${c.iva?' · sin IVA':''}</div>`
    +items.map((it,i)=>{
      const calc=lineTotal(it);
      return `<div class="ia-row"><label class="ia-hdr" for="rem-ia-${i}"><span class="ia-num">${i+1}</span><span class="ia-desc">${esc(it.desc||TIPO_NOMBRE[it.tipo]||'Partida')}</span><span class="ia-calc">${money(calc)}</span></label>`
        +`<div class="ia-body"><div class="inp-money"><input id="rem-ia-${i}" type="number" inputmode="decimal" min="0" step="50" value="${+(+calc).toFixed(2)}" aria-label="Precio autorizado de la partida ${i+1}${c.iva?', sin IVA':''} · calculado ${money(calc)}" aria-describedby="rem-ia-adj-${i}" oninput="remotaPartida(${i},this.value)"></div>`
        +`<div class="ia-adj" id="rem-ia-adj-${i}"></div></div></div>`;
    }).join('')
    +`<div class="ia-total"><span>${c.iva?'Subtotal calculado':'Total calculado'}</span><span>${money(sub)}</span></div>`
    /* La suma de los renglones ajustados, solo cuando se aparta del calculado: con todo en su
       precio sería el mismo número dos veces. */
    +`<div class="ia-total soft" id="rem-ia-suma" style="display:none"><span>${c.iva?'Subtotal de las partidas ajustadas':'Total de las partidas ajustadas'}</span><span id="rem-ia-sum"></span></div>`;
  $('rem-lab').textContent='Precio final autorizado'+(c.iva?' · subtotal, SIN IVA':' (sin IVA)');
  $('rem-precio').value=sub; _remDerivado=sub;
  $('rem-nota').value='';
  /* El deslizador de la misma regla que el del formulario local (C18): −20 % a +10 % del calculado,
     con imanes. Va DESPUÉS de escribir el campo, que es quien manda: así el pulgar nace en el 0 %. */
  if(typeof deslizadorDelPrecio==='function') deslizadorDelPrecio('rem-precio-r','rem-precio',sub);
  pintarRemotaNeto();
  const i=identidadVerificada();
  $('rem-autoriza').innerHTML='Se sella en la hoja a nombre de <b>'+esc(i?i.correo:'—')+'</b>.';
  $('rem-estado').textContent='';
  remotaOcupada(false);
  $('remotamodal').classList.add('show');
}
/* Lo que pasa al teclear el precio de un renglón. El total de arriba SIGUE a la suma de los
   renglones, como en el formulario local: no se puede honrar a la vez un total libre y unas
   partidas libres —alguna tendría que absorber la diferencia—. Si Dirección ya llevaba un total
   suyo tecleado, se le dice UNA vez por cifra en vez de borrárselo en silencio (la misma razón y
   el mismo aviso que updItemAuth). Después de ajustar los renglones puede volver a teclear un
   total, y ése es el atajo: un precio global encima de las partidas ajustadas. */
function remotaPartida(i,val){
  const s=_remotaAbierta; if(!s) return;
  const c=s.cotizacion||{}, items=c.items||[], it=items[i]; if(!it) return;
  const k=String(it.id), calc=lineTotal(it), t=String(val==null?'':val).trim();
  if(t===''||!isFinite(+t)||+t<0) delete _remIa[k]; else _remIa[k]=+t;
  const adj=$('rem-ia-adj-'+i);
  if(adj){
    const v=_remIa[k]!==undefined?_remIa[k]:calc, d=+(v-calc).toFixed(2);
    adj.textContent=Math.abs(d)<0.01?'':(d<0?'Descuento: '+money(-d):'Aumento: '+money(d));
    adj.classList.toggle('inc',d>0.01);
  }
  const cu=cuentaRemota(items,_remIa,0,c.iva);
  const campo=$('rem-precio');
  const prevTxt=String(campo.value).trim(), prev=prevTxt===''?null:+prevTxt;
  const eraSuyo=prev!==null&&isFinite(prev)&&(_remDerivado===null||Math.abs(prev-_remDerivado)>0.01);
  /* El deslizador se entera solo: vigila el valor del campo aunque se escriba sin evento. */
  campo.value=cu.subBase; _remDerivado=cu.subBase;
  if(eraSuyo&&Math.abs(prev-cu.subBase)>0.01)
    toast('El subtotal que llevabas tecleado ('+money(prev)+') se ajustó a la suma de las partidas: '+money(cu.subBase)+'.','',6000);
  pintarRemotaNeto();
}
function pintarRemotaNeto(){
  const c=(_remotaAbierta&&_remotaAbierta.cotizacion)||{};
  const v=parseFloat($('rem-precio').value)||0;
  $('rem-neto').innerHTML=c.iva?'Con IVA 16%: <b>'+money(+(v*1.16).toFixed(2))+'</b>':'';
  const cu=cuentaRemota(c.items||[],_remIa,v,c.iva);
  const suma=$('rem-ia-suma');
  if(suma){
    const hay=Math.abs(cu.subBase-cu.subCalc)>0.01;
    suma.style.display=hay?'':'none';
    if(hay) $('rem-ia-sum').textContent=money(cu.subBase);
  }
  /* La frase del ajuste, en vivo mientras se arrastra, con la misma cuenta y las mismas palabras
     del formulario local (fraseAjuste y updPrecioAuth): contra las partidas YA AJUSTADAS, que es
     la base contra la que el teléfono que pidió va a medir todo después, y nombrando el calculado
     cuando las dos bases no coinciden. Sin ajuste global pero con renglones ajustados, cuánto se
     movió contra el calculado. */
  const aj=$('rem-ajuste'); if(!aj) return;
  const f=(v>0&&cu.subBase>0)?fraseAjuste(cu.subFinal,cu.subBase,cu.subCalc):null;
  const dc=+(cu.subCalc-cu.subFinal).toFixed(2), conPartidas=Math.abs(cu.subBase-cu.subCalc)>0.01;
  let txt='', inc=false;
  if(f){ txt=f.linea; inc=f.d<0; }
  else if(conPartidas&&Math.abs(dc)>=0.01){ txt='Igual a las partidas ajustadas · '+money(Math.abs(dc))+' '+(dc>0?'por debajo':'por encima')+' del calculado ('+money(cu.subCalc)+')'; inc=dc<0; }
  if(aj.textContent!==txt) aj.textContent=txt;
  aj.classList.toggle('inc',inc);
}
function cerrarRevisionRemota(){ $('remotamodal').classList.remove('show'); _remotaAbierta=null; _remIa={}; _remDerivado=null; }
/* Los dos botones de la revisión, juntos. «Ocupada» ya no apaga nada por su cuenta: quien trabaja
   es el botón que se tocó (Piezas.trabajando, abajo) y él aparta a su hermano —con aria-disabled y
   no con `disabled`, para que el foco no se pierda a media espera—. Lo que queda aquí es lo que
   la pieza no sabe: devolverle a la revisión sus dos botones limpios al abrir otra, que es cuando
   se llama con `false`. */
function remotaOcupada(si){
  const conPieza=!!(window.Piezas&&Piezas.estadoBoton&&Piezas.trabajando);
  ['rem-autorizar','rem-rechazar'].forEach(id=>{
    const b=$(id); if(!b) return;
    if(conPieza){ if(!si){ const h=Piezas.estadoBoton(b); if(h) h.reiniciar(); } b.disabled=false; }
    else b.disabled=si;
  });
}
/* Lo que se ve entre que la hoja contesta y que la revisión se cierra: el botón lavado en verde con
   el código del sello, y el neón de la tarjeta. Sin ese rato —un cuarto de segundo y poco más—
   el modal se iba en el mismo cuadro en que el sello llegaba, y la única confirmación era un aviso
   de abajo que se podía ni mirar. Con menos movimiento el rato es el mismo: lo que dice el botón
   es información, no adorno. */
const REMOTA_RATO_MS=900;
async function autorizarRemota(){
  const s=_remotaAbierta; if(!s) return;
  const c=s.cotizacion||{}, items=c.items||[];
  const sub=items.reduce((t,it)=>t+lineTotal(it),0);
  const v=parseFloat($('rem-precio').value)||0;
  /* El mismo criterio que el formulario de siempre: lo tecleado es el SUBTOTAL, y el precio
     autorizado se guarda en neto. Igual al calculado es «sin ajuste». Los renglones viajan en
     `itemsAuth`, sin IVA, como los del formulario local: la hoja los firma con el sello y el
     teléfono que pidió los recibe con él (cuentaRemota, arriba). */
  const cu=cuentaRemota(items,_remIa,v,c.iva);
  const nota=$('rem-nota').value.trim();
  const pedir=()=>sellarEnLaHoja(s.folio,Object.assign({},c,{subtotal:sub}),cu.precioAuth,cu.itemsAuth,nota);
  $('rem-estado').textContent='';
  const conPieza=!!(window.Piezas&&Piezas.trabajando);
  let r;
  if(conPieza){
    r=await Piezas.trabajando('rem-autorizar',pedir,{verbo:'Sellando',tau:6000,
      ok:sello=>'Sellada · '+sello.codigo,mal:'No se selló',hermanos:['rem-rechazar']});
  } else {
    /* Sin las piezas (una página que no las cargó): el comportamiento de siempre, con sus dos
       botones apagados y la frase de abajo. */
    remotaOcupada(true); $('rem-estado').textContent='Sellando en la hoja…';
    try{ r={ok:true,valor:await pedir()}; }catch(e){ r={ok:false,error:e}; }
  }
  /* Mientras se esperaba se pudo cerrar la revisión o abrir otra: el sello existe en la hoja, pero
     lo que hay en pantalla ya no es de esta solicitud. */
  if(_remotaAbierta!==s&&r.ok){ _remotas=_remotas.filter(x=>x.folio!==s.folio); renderAuth(); pintarPasos(); return; }
  if(!r.ok){
    if(!conPieza) remotaOcupada(false);
    /* El botón ya dice «No se selló · Reintentar»; la frase de abajo dice POR QUÉ, que es lo que
       el botón no cabe en decir —sin señal, sin sesión de Google, catálogo que no cuadra—. */
    if(_remotaAbierta===s) $('rem-estado').textContent=(r.error&&r.error.message)||'No se pudo sellar.';
    return;
  }
  const sello=r.valor;
  vibrar(14);
  toast('✓ '+String(s.folio).split('@')[0]+' autorizada · '+money(sello.total)+(cu.ajustadas?' · '+cu.ajustadas+(cu.ajustadas===1?' partida ajustada':' partidas ajustadas'):'')+' · el teléfono que la pidió la recibe solo','ok',6000);
  /* El neón sobre la tarjeta de la revisión (C23 #7), mientras el botón dice «Sellada». */
  try{ if(window.Piezas&&Piezas.encenderNeon){ const tarjeta=$('remotamodal').querySelector('.modal'); if(tarjeta) Piezas.encenderNeon(tarjeta); } }catch(_){}
  _remotas=_remotas.filter(x=>x.folio!==s.folio);
  await new Promise(ok=>setTimeout(ok,REMOTA_RATO_MS));
  if(_remotaAbierta===s) cerrarRevisionRemota();
  renderAuth(); pintarPasos();
}
async function rechazarRemota(){
  const s=_remotaAbierta; if(!s) return;
  if(navigator.onLine===false){ $('rem-estado').textContent='Sin señal no se puede avisar al otro teléfono.'; return; }
  const nota=$('rem-nota').value.trim();
  const pedir=async()=>{
    const ses=await asegurarSesion(); if(!ses.ok) throw new Error(ses.mensaje);
    const r=await hablarHoja('rechazar',{folio:s.folio,nota});
    if(!r||!r.ok) throw new Error((r&&r.mensaje)||'La hoja no registró el rechazo.');
  };
  $('rem-estado').textContent='';
  const conPieza=!!(window.Piezas&&Piezas.trabajando);
  let r;
  if(conPieza){
    r=await Piezas.trabajando('rem-rechazar',pedir,{verbo:'Avisando',tau:3000,ok:false,mal:'No se avisó',hermanos:['rem-autorizar']});
  } else {
    remotaOcupada(true); $('rem-estado').textContent='Avisando…';
    try{ await pedir(); r={ok:true}; }catch(e){ r={ok:false,error:e}; }
  }
  if(!r.ok){
    if(!conPieza) remotaOcupada(false);
    if(_remotaAbierta===s) $('rem-estado').textContent=(r.error&&r.error.message)||'No se pudo avisar.';
    return;
  }
  vibrar([20,60,20]);
  toast(String(s.folio).split('@')[0]+' rechazada · el otro teléfono se entera solo','err',5000);
  _remotas=_remotas.filter(x=>x.folio!==s.folio);
  if(_remotaAbierta===s) cerrarRevisionRemota();
  renderAuth(); pintarPasos();
}

/* ----- Una vibración corta, donde el teléfono la tiene -----
   En tres momentos y en ninguno más: autorizar, borrar y rechazar. Vibrar al teclear sería ruido
   en la mano. Con «reducir movimiento» encendido tampoco: quien lo pide está pidiendo menos
   estímulo, no solo menos animación. */
function vibrar(patron){
  try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(_){}
  /* Sin un toque previo el navegador la bloquea y lo anota como error: un sello que llega solo
     mientras nadie ha tocado la pantalla no vibra, y está bien. */
  try{ if(navigator.userActivation&&!navigator.userActivation.hasBeenActive) return; }catch(_){}
  try{ if(navigator.vibrate) navigator.vibrate(patron); }catch(_){}
}
