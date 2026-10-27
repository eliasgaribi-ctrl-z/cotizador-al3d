/* ============================================================================
   Cotizador · tarifas.js

   Los precios que manda la hoja, y la pantalla donde Dirección los cambia.

   Hasta el 23 de octubre de 2026 el catálogo vivía escrito a mano en catalogo.js —y copiado en
   el Apps Script—, y subir el aluminio era cambiar código y volver a publicar. Elías pidió «un
   apartado de ajustes en el cotizador en el cual nosotros como administrador podamos mover
   únicamente en qué materiales y en cuánto se cotiza cada uno». La tabla vive ahora en la
   pestaña «Tarifas» de la hoja (ver «Las tarifas, editables» en puente/hoja-apps-script.gs), y
   la leen los dos lados: este teléfono para cotizar y la hoja para recalcular antes de sellar.

   Cómo llega aquí, sin que el primer pintado espere a la red:
     1. Al cargar, se aplica la última tabla guardada en este aparato (`al3d_tarifas`). Sin ella,
        el catálogo de catalogo.js, que es el de fábrica.
     2. Ya con la pantalla puesta se le pide a la hoja la de hoy (`/tarifas`) y, si cambió, se
        repinta. Sin señal o con una hoja vieja que no conoce la ruta, se queda la que había.
     3. Si al pedir una autorización la hoja contesta que el subtotal no cuadra
        (CATALOGO_DESINCRONIZADO), notario.js vuelve a pedirla: casi siempre es que alguien cambió
        un precio desde que se abrió el cotizador.

   La tabla se aplica MUTANDO las listas de catalogo.js en su lugar —son `const` y todo el
   cotizador las lee en cada pintado—, así que nadie más tiene que saber de dónde salió un precio.

   CON LA BASE MANDANDO (paso 4 de docs/BASE-MANDA.md) la tabla de hoy sale de la base
   (`tarifas_leer`, 0019_tarifas.sql) y Dirección la guarda ahí (`tarifas_guardar`), por la
   ventanilla de la plataforma (`ventanillaBase`, venta.js); la caché de este aparato es la misma
   (`al3d_tarifas`) y las dos funciones contestan la misma forma que la hoja. Lo que NO cambia es
   quién sella: la hoja (decidido por Elías el 2026-10-25), y la hoja recalcula con su pestaña. Por
   eso cada guardado se le copia también a la pestaña («El espejo de la hoja», abajo). Con la hoja
   mandando, todo es como antes y no se pide nada a la base.

   Es un script CLÁSICO, no un módulo ES, como el resto de js/cotizador/: el orden de carga lo
   fija cotizador.html, y este va después de nucleo.js (usa $, esc, toast y ACC) y antes de que
   arranque.js pinte nada.
   ============================================================================ */

const TARIFAS_LS='al3d_tarifas';
/* El catálogo de fábrica, copiado antes de que nada lo toque: es contra lo que se completa una
   tabla a la que le falte algo, y lo que la pantalla enseña si la hoja todavía no tiene pestaña. */
const _TAR_FABRICA=JSON.parse(JSON.stringify({material:MATERIALES,complejidad:COMPLEJIDAD,recorte:RECORTES,
  bastidor:BASTIDORES,caja:CAJAS,extra:RECORTE_COMP_EXTRA}));
/* Los grupos de la tabla, en el orden de la pantalla, con lo que cada precio quiere decir. */
const TAR_GRUPOS=[
  {g:'material',   t:'Materiales de letras 3D',     u:'por cm de altura, por letra', lista:()=>MATERIALES, campo:'precio', agrega:'material'},
  {g:'complejidad',t:'Complejidad de las letras',   u:'extra por cm de altura',      lista:()=>COMPLEJIDAD, campo:'extra'},
  {g:'recorte',    t:'Acabados de recorte',         u:'por cm de altura, por pieza', lista:()=>RECORTES,    campo:'precio', agrega:'acabado'},
  {g:'recorte-extra',t:'Sándwich con complejidad',  u:'extra por cm de altura'},
  {g:'bastidor',   t:'Bastidores',                  u:'por m² (mínimo 1 m²)',        lista:()=>BASTIDORES,  campo:'tarifa', agrega:'bastidor'},
  {g:'caja',       t:'Cajas de luz',                u:'por m² (mínimo 1 m²)',        lista:()=>CAJAS,       campo:'tarifa', agrega:'tipo de caja'},
];
/* De dónde salió la tabla que está puesta, para decirlo en la pantalla. */
let TARIFAS_INFO={desde:'fabrica',actualizado:'',por:'',filas:null,sinRuta:false};

/* ----- De la tabla de la hoja a las listas del cotizador ----- */
function _tarFab(g){ return g==='recorte-extra'?null:_TAR_FABRICA[g]; }
/* Las listas que saldrían de una tabla, o null si no sirve: un grupo vacío, una clave de fábrica
   que falta o un precio que no es número no se aplican a medias, se queda la que había. */
function _tarListas(tabla){
  if(!tabla||!Array.isArray(tabla.filas)) return null;
  const L={material:[],complejidad:[],recorte:[],bastidor:[],caja:[],extra:_TAR_FABRICA.extra};
  for(const f of tabla.filas){
    if(!f||typeof f!=='object') return null;
    const precio=Number(f.precio);
    if(!isFinite(precio)||precio<0) return null;
    if(f.grupo==='recorte-extra'){ if(f.clave==='sandwich') L.extra=precio; continue; }
    const fab=_tarFab(f.grupo); if(!fab) continue;
    const clave=String(f.clave||''), como=String(f.como||'');
    const base=fab.find(e=>e.key===clave)||fab.find(e=>e.key===como);
    if(!base||!/^[a-z0-9-]{2,24}$/.test(clave)) return null;
    /* El nombre llega de la hoja —se puede teclear a mano en la pestaña— y el catálogo lo pinta tal cual en los chips y el PDF:
       sin < > & " ` no hay marcado que colar. La hoja ya los rechaza al guardar; esto cubre la celda editada a mano. */
    const nom=String(f.nombre||'').replace(/[<>&"`]/g,'').trim().slice(0,60);
    const e=Object.assign({},base,{key:clave,label:nom||base.label});
    if(clave!==base.key) e.como=base.key; else delete e.como;
    if(f.visible===false) e.oculto=true; else delete e.oculto;
    if(f.grupo==='material'){ e.precio=precio; if(f.detalle) e.ilum=String(f.detalle); }
    else if(f.grupo==='complejidad') e.extra=precio;
    else if(f.grupo==='recorte') e.precio=precio;
    else { e.tarifa=precio; if(f.grupo==='caja'&&f.detalle) e.desc=String(f.detalle); }
    if(L[f.grupo].some(x=>x.key===clave)) continue;
    L[f.grupo].push(e);
  }
  for(const g of ['material','complejidad','recorte','bastidor','caja']){
    if(!_TAR_FABRICA[g].every(b=>L[g].some(e=>e.key===b.key))) return null;
  }
  return L;
}
function _tarPoner(lista,nueva){ lista.splice(0,lista.length,...nueva); }
/* Aplica una tabla de la hoja (o de la base: `desde`). Devuelve true si se aplicó. */
function aplicarTarifas(tabla,desde){
  const L=_tarListas(tabla); if(!L) return false;
  _tarPoner(MATERIALES,L.material); _tarPoner(COMPLEJIDAD,L.complejidad); _tarPoner(RECORTES,L.recorte);
  _tarPoner(BASTIDORES,L.bastidor); _tarPoner(CAJAS,L.caja);
  RECORTE_COMP_EXTRA=L.extra;
  TARIFAS_INFO=Object.assign({},TARIFAS_INFO,{desde:desde||'hoja',actualizado:String(tabla.actualizado||''),por:String(tabla.por||''),filas:tabla.filas});
  return true;
}
/* ----- Una tabla nueva no reescribe lo que ya se autorizó -----
   Una cotización autorizada al precio calculado (sin precio ni ajustes del autorizador) saca sus
   importes de lineTotal(), o sea del catálogo de HOY: con la tabla nueva, la que está en pantalla
   cambiaría de total sin que nadie la autorice, el PDF saldría con otros importes (y sin QR) y el
   historial congelaría el precio nuevo. Es lo mismo que reabrirDeHistorial() ya resuelve al abrir
   una del historial: cada partida cuyo importe se movió queda en Q.itemsAuth con el que tenía, y con
   eso el total, los renglones del papel y el sello siguen siendo los que se autorizaron. Para
   cobrarla al precio nuevo, se vuelve a autorizar. */
function _tarAplicarCuidando(tabla,desde){
  const aut=typeof Q!=='undefined'&&Q&&Q.estado==='autorizada'&&Array.isArray(Q.items);
  const antes=aut?Q.items.map(it=>({id:it.id,lt:+lineTotal(it).toFixed(2)})):null;
  if(!aplicarTarifas(tabla,desde)) return false;
  /* En un borrador lo que manda es el catálogo de hoy, y la caja guarda su precio en la partida: la
     que tiene su tipo elegido (it.caja) pasa al precio nuevo de ese tipo, en ella y en sus opciones.
     Solo en borrador: en una pendiente o autorizada cambiar la tarifa soltaría la autorización. */
  if(typeof Q!=='undefined'&&Q&&Q.estado==='borrador'&&Array.isArray(Q.items)){
    const alDia=d=>{ if(!d||d.tipo!=='caja'||!d.caja) return; const c=CAJAS.find(x=>x.key===d.caja); if(c) d.tarifa=c.tarifa; };
    Q.items.forEach(it=>{ alDia(it); if(it.opciones&&Array.isArray(it.opciones.lista)) it.opciones.lista.forEach(o=>alDia(o.d)); });
  }
  if(antes){
    if(!Q.itemsAuth) Q.itemsAuth={};
    let congelo=false;
    antes.forEach(a=>{
      const it=Q.items.find(x=>x.id===a.id); if(!it) return;
      if(Object.prototype.hasOwnProperty.call(Q.itemsAuth,a.id)) return;   // ya manda un importe autorizado
      if(Math.abs(lineTotal(it)-a.lt)>0.01){ Q.itemsAuth[a.id]=a.lt; congelo=true; }
    });
    if(congelo){
      if(!Q.huellaAuth) sellarAuth();
      try{ saveState(); }catch(_){}
    }
  }
  return true;
}
/* Lo que cobra el catálogo puesto, para saber si una tabla nueva cambió algo. */
function _tarFirma(){ return JSON.stringify([MATERIALES,COMPLEJIDAD,RECORTES,BASTIDORES,CAJAS,RECORTE_COMP_EXTRA]); }

/* 1 · La última tabla de este aparato, antes del primer pintado. */
try{ const t=JSON.parse(localStorage.getItem(TARIFAS_LS)||'null'); if(t) aplicarTarifas(t); }catch(_){}

/* 2 · La de hoy, de la hoja. Callada: sin señal, sin puente o con una hoja que todavía no tiene la
   ruta, se queda la que había y no se dice nada (no hay nada que el vendedor pueda hacer). Con
   `avisar`, si cambió algo, lo dice: es el caso del subtotal que no cuadró.
   Con la base mandando, la de hoy sale de la BASE (la hoja ni se pregunta): se espera a que la
   plataforma ponga la ventanilla —al abrir tarda unos segundos en entrar a la base— y, si no
   llega, se queda la de este aparato. Y si el subtotal no cuadró pero la base no cambió nada, la
   que está atrasada es la pestaña de la hoja: ver «El espejo de la hoja». */
let _tarPidiendo=null;
function refrescarTarifas(avisar){
  if(_tarPidiendo) return _tarPidiendo;
  _tarPidiendo=(async()=>{
    const enBase=laBaseManda();
    let r=null;
    if(enBase){
      const nube=await esperarVentanillaBase('tarifas',avisar?4000:20000);
      if(!nube){ _tarSinBaseEs(true); return false; }
      try{ r=await nube.tarifas(); }catch(_){ return false; }
      if(!r||!r.ok||!r.tabla) return false;
      _tarSinBaseEs(false);
    } else {
      try{ r=await hablarHoja('tarifas',{},12000); }catch(_){ return false; }
      if(!r||!r.ok||!r.tabla){ if(r&&r.codigo==='NO_ENCONTRADO') TARIFAS_INFO.sinRuta=true; return false; }
      TARIFAS_INFO.sinRuta=false;
    }
    const antes=_tarFirma();
    if(!_tarAplicarCuidando(r.tabla,enBase?'base':'hoja')) return false;
    try{ localStorage.setItem(TARIFAS_LS,JSON.stringify(r.tabla)); localStorage.setItem(TARIFAS_LEIDA,String(Date.now())); }catch(_){}
    const cambio=_tarFirma()!==antes;
    if(cambio){
      try{ renderItems(); renderSummary(); }catch(_){}
      if(avisar) toast('Los precios de la '+(enBase?'base':'hoja')+' cambiaron y ya se trajeron: revisa la cotización y vuelve a mandarla.','',7000);
    }
    if(enBase) await _tarEspejoSiHaceFalta(r.tabla,avisar&&!cambio);
    return cambio;
  })().finally(()=>{ _tarPidiendo=null; });
  return _tarPidiendo;
}

/* ----- El espejo de la hoja, con la base mandando -----
   El sello sigue en la hoja (decidido por Elías el 2026-10-25): antes de sellar, la hoja recalcula el
   subtotal con SU pestaña «Tarifas» y, si no cuadra con el del teléfono, no sella
   (CATALOGO_DESINCRONIZADO). Con la base mandando los precios se guardan en la base, así que la
   pestaña pasa a ser la copia que lee el notario: cada guardado de Dirección se le manda también, con
   las mismas filas (las dos validan igual: `tarifas_guardar` de 0019 copia las reglas de
   /guardar_tarifas). Si la hoja no contesta, queda pendiente en este aparato (`al3d_tarifas_espejo`) y
   se reintenta la siguiente vez que este teléfono de Dirección lee los precios, siempre con lo que diga
   la base en ese momento. Y si al autorizar la hoja dice que no cuadra y la base no cambió nada, el
   teléfono de Dirección le pone a la hoja los de la base y lo dice. Editar la pestaña a mano con la base
   mandando no sirve de nada: el teléfono cotiza con los de la base y el espejo la vuelve a dejar igual. */
const TARIFAS_ESPEJO='al3d_tarifas_espejo';
function _tarEspejoPendiente(){ try{ return !!localStorage.getItem(TARIFAS_ESPEJO); }catch(_){ return false; } }
async function _tarEspejoHoja(tabla){
  const filas=(tabla&&Array.isArray(tabla.filas)?tabla.filas:[]).map(f=>({grupo:f.grupo,clave:f.clave,
    nombre:String(f.nombre||'').trim(),precio:Number(f.precio),como:f.como||'',visible:f.visible!==false}));
  if(!filas.length) return false;
  let r=null;
  /* De fondo SIEMPRE (auditoría 2026-10-26, T1-8): la copia la reintenta la lectura de precios, que nadie
     pidió, y la del botón «Guardar precios» llega después de asegurarSesion(), que ya pidió la ventana de
     Google en ese mismo toque. Si la persona la cerró, abrirle otra aquí sería no escucharla: sin permiso la
     copia queda pendiente y se dice. */
  try{ r=await hablarHoja('guardar_tarifas',{filas},25000); }catch(_){ r=null; }
  const ok=!!(r&&r.ok);
  try{ if(ok) localStorage.removeItem(TARIFAS_ESPEJO); else localStorage.setItem(TARIFAS_ESPEJO,String(Date.now())); }catch(_){}
  return ok;
}
async function _tarEspejoSiHaceFalta(tabla,noCuadro){
  if(!puedeAutorizar()){
    if(noCuadro) toast('La hoja, que sella las autorizaciones, tiene otros precios que la base: que Dirección abra el cotizador para ponerla al día.','err',8000);
    return;
  }
  if(noCuadro){
    const ok=await _tarEspejoHoja(tabla);
    toast(ok?'La hoja tenía otros precios que la base: ya se le pusieron los de la base. Vuelve a autorizar.'
      :'La hoja tiene otros precios que la base y no se le pudieron poner: vuelve a intentarlo con señal.',ok?'ok':'err',8000);
    return;
  }
  if(_tarEspejoPendiente()) await _tarEspejoHoja(tabla);
}
window.addEventListener('load',()=>{ setTimeout(()=>{ _tarVueltaEn=Date.now(); refrescarTarifas(false); },1200); });

/* ----- Precios de este teléfono, sin entrar a la base (auditoría 2026-10-25, CZ-3) -----
   Con la base mandando, un teléfono que no ha entrado a Supabase —Safari sin la tarjeta de Google, «Ahora no», uno
   nuevo— no tiene a quién pedirle los precios: cotiza con los que guardó la última vez, o con los de fábrica. Eso no
   se decía, y el vendedor le daba al cliente un precio que la hoja después no sellaba («no cuadra»), en un ciclo sin
   salida. Ahora el paso de Precio lo dice con la fecha de esos precios y la salida (Ajustes, entrar a Supabase), y en
   cuanto la plataforma entra a la base se traen solos. `al3d_tarifas_leida` es cuándo se trajeron por última vez. */
const TARIFAS_LEIDA='al3d_tarifas_leida';
let _tarSinBase=false, _tarSinBaseT=0;
function _tarSinBaseEs(si){
  _tarSinBase=!!si;
  clearTimeout(_tarSinBaseT); _tarSinBaseT=0;
  /* Mientras no haya ventanilla se mira cada 30 s si ya llegó (mirar es local: no sale a la red). */
  if(_tarSinBase) _tarSinBaseT=setTimeout(()=>{ _tarSinBaseT=0; if(laBaseManda()&&ventanillaBase('tarifas')) refrescarTarifas(false); else _tarSinBaseEs(laBaseManda()); },30000);
  pintarAvisoTarifas();
}
function _tarDeCuando(){
  let t=0;
  try{ t=Number(localStorage.getItem(TARIFAS_LEIDA))||0; }catch(_){}
  if(!t&&TARIFAS_INFO.actualizado) t=Date.parse(TARIFAS_INFO.actualizado)||0;
  if(!t) return '';
  try{ return new Date(t).toLocaleDateString('es-MX',{day:'numeric',month:'short'}); }catch(_){ return ''; }
}
/* La frase, la misma en el letrero y cuando la hoja rebota la autorización por precios. */
function mensajeTarifasSinBase(sufijo){
  const c=_tarDeCuando();
  const de=TARIFAS_INFO.desde==='fabrica'?'Precios de fábrica de este teléfono':'Precios de este teléfono'+(c?' del '+c:'');
  return de+': entra a Supabase para traer los de hoy'+(sufijo||'')+'.';
}
function pintarAvisoTarifas(){
  const caja=$('s-tar-aviso'); if(!caja) return;
  const si=laBaseManda()&&_tarSinBase;
  if(si){
    const t=$('s-tar-aviso-txt'), m=mensajeTarifasSinBase();
    if(t&&t.textContent!==m){ t.textContent=m; if(caja.hidden&&typeof voz==='function') voz(m); }
  }
  caja.hidden=!si;
}
function entrarALaBaseParaPrecios(){ irAPlataforma('ajustes'); }

/* ----- Al volver a la app (CZ-6) -----
   El cotizador es una pantalla que se conserva: no se recarga al cambiar de pantalla, y en un iPhone con la app viva
   se cotizaba con los precios de ayer hasta que la autorización rebotaba. Al volver a la app se piden otra vez, una
   vez cada 5 minutos como mucho; sin ventanilla todavía, siempre (mirarla es local). */
let _tarVueltaEn=0;
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible') return;
    if(!_tarSinBase&&Date.now()-_tarVueltaEn<5*60*1000) return;
    _tarVueltaEn=Date.now();
    refrescarTarifas(false);
  });
}

/* ===================== La pantalla: Precios y materiales =====================
   Solo para Dirección (puedeAutorizar, la misma puerta que autorizar): el engrane de la barra de
   arriba no se pinta para nadie más, y la hoja vuelve a comprobarlo al guardar —con la cuenta de
   Google, no con el token del teléfono—.

   Lo que se edita es una copia (`_tarEdit`) de los renglones; nada toca el catálogo puesto hasta
   que la hoja contesta que guardó. Así «Cancelar» no tiene nada que deshacer, y lo que se ve
   después de guardar es lo que la hoja tiene, no lo que este teléfono creyó mandar. */
let _tarEdit=null, _tarSucio=false, _tarGuardando=false;
/* Los renglones con los que arranca la pantalla: los de la hoja si los hay; si no, los del
   catálogo puesto, con la forma de los de la hoja. */
function _tarRenglones(){
  if(Array.isArray(TARIFAS_INFO.filas)&&TARIFAS_INFO.filas.length) return JSON.parse(JSON.stringify(TARIFAS_INFO.filas));
  const out=[];
  TAR_GRUPOS.forEach(G=>{
    if(G.g==='recorte-extra'){ out.push({grupo:G.g,clave:'sandwich',nombre:'Complejidad del sándwich',precio:RECORTE_COMP_EXTRA,como:'',visible:true}); return; }
    G.lista().forEach(e=>out.push({grupo:G.g,clave:e.key,nombre:e.label,precio:e[G.campo],como:e.como||'',visible:!e.oculto}));
  });
  return out;
}
function _tarEsFabrica(g,k){ const f=_tarFab(g); return g==='recorte-extra'?k==='sandwich':!!(f&&f.some(e=>e.key===k)); }
function pintarBotonTarifas(){
  const b=$('tarbtn'); if(!b) return;
  const si=puedeAutorizar();
  if(b.hidden===si) b.hidden=!si;
}
function abrirTarifas(){
  if(!puedeAutorizar()){ toast('Solo una cuenta de Dirección cambia los precios','err'); return; }
  _tarEdit=_tarRenglones(); _tarSucio=false;
  pintarTarifas();
  $('tarmodal').classList.add('show');
  const t=$('tar-titulo'); if(t){ try{ t.focus({preventScroll:true}); }catch(_){ t.focus(); } }
  /* Lo de la hoja puede ser más nuevo que lo de este aparato. Si llega antes de que se toque
     nada, se repinta con eso. */
  refrescarTarifas(false).then(()=>{ if(!_tarSucio&&$('tarmodal').classList.contains('show')){ _tarEdit=_tarRenglones(); pintarTarifas(); } });
}
function cerrarTarifas(){
  if(_tarGuardando) return;
  $('tarmodal').classList.remove('show');
  _tarEdit=null; _tarSucio=false;
}
function _tarFecha(iso){
  const d=new Date(iso); if(!iso||isNaN(d)) return '';
  try{ return d.toLocaleString('es-MX',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}); }catch(_){ return iso; }
}
function pintarTarifas(){
  const body=$('tar-body'); if(!body||!_tarEdit) return;
  const I=TARIFAS_INFO;
  const ay=$('tar-ayuda');
  /* Con la base mandando y sin entrar a ella, «de fábrica» no es verdad: la base sí tiene lista, este teléfono no la ha
     podido traer (CZ-3). */
  if(ay) ay.innerHTML=(laBaseManda()&&_tarSinBase
      ? '<b>Este teléfono no ha entrado a la base</b>: lo de abajo es lo que tiene guardado'+(I.desde==='fabrica'?' (los de fábrica)':'')+', no la lista de hoy. Entra a Supabase en Ajustes para verla y guardarla. '
      : I.sinRuta
      ? '<b>La hoja todavía no tiene esta función.</b> Hay que publicar la versión nueva del Apps Script para poder guardar. '
      : I.desde!=='fabrica'&&I.actualizado
        ? 'Última vez que se cambió: <b>'+esc(_tarFecha(I.actualizado))+'</b>'+(I.por?' por '+esc(I.por):'')+'. '
        : 'Son los precios de fábrica: todavía no se ha guardado ninguna lista. ')
    +'Un precio nuevo vale para lo que se cotice desde ahora. Una cotización ya autorizada conserva su precio; si se vuelve a mandar, pide autorizar con el nuevo.';
  body.innerHTML=TAR_GRUPOS.map(G=>{
    const filas=_tarEdit.map((f,i)=>({f,i})).filter(x=>x.f.grupo===G.g);
    const fab=_tarFab(G.g)||[];
    return `<section class="tar-g" aria-labelledby="tar-g-${G.g}">
      <h3 class="tar-gt" id="tar-g-${G.g}">${esc(G.t)} <small>$ ${esc(G.u)}</small></h3>
      ${filas.map(({f,i})=>{
        const fija=_tarEsFabrica(G.g,f.clave), siempre=G.g==='recorte-extra'||(G.g==='complejidad'&&f.clave==='recta');
        const como=!fija?`<div class="fld tar-como"><label for="tar-c-${i}">Se fabrica como</label><select id="tar-c-${i}" data-al-cambiar="tarComo(${i})">${fab.map(e=>`<option value="${esc(e.key)}"${f.como===e.key?' selected':''}>${esc(e.label)}</option>`).join('')}</select></div>`:'';
        return `<div class="tar-fila${f.visible===false?' oculta':''}">
          <div class="fld tar-nom"><label for="tar-n-${i}">Nombre</label><input id="tar-n-${i}" maxlength="60" value="${esc(f.nombre)}" data-al-escribir="tarNombre(${i})"></div>
          <div class="fld tar-pre"><label for="tar-p-${i}">Precio</label><div class="inp-money"><input id="tar-p-${i}" type="number" inputmode="decimal" min="0" step="0.5" value="${f.precio===''||f.precio==null?'':esc(String(f.precio))}" data-al-escribir="tarPrecio(${i})"></div></div>
          ${siempre?'':`<button type="button" class="switch tar-vis" role="switch" aria-checked="${f.visible===false?'false':'true'}" data-foco="tar-v-${i}" data-acc="tarVisible(${i})"><span class="tg ${f.visible===false?'':'on'}" aria-hidden="true"></span> Se ofrece</button>`}
          ${como}
        </div>`;
      }).join('')}
      ${G.agrega?`<button type="button" class="op-mas tar-mas" data-foco="tar-mas-${G.g}" data-acc="agregarTarifa('${G.g}')">+ Agregar ${esc(G.agrega)}</button>`:''}
    </section>`;
  }).join('');
}
function _tarSucia(){ _tarSucio=true; }
function tarNombre(i,v){ if(!_tarEdit||!_tarEdit[i]) return; _tarEdit[i].nombre=v; _tarSucia(); }
function tarPrecio(i,v){ if(!_tarEdit||!_tarEdit[i]) return; _tarEdit[i].precio=v===''?'':Number(v); _tarSucia(); }
function tarComo(i,v){ if(!_tarEdit||!_tarEdit[i]) return; _tarEdit[i].como=v; _tarSucia(); }
function tarVisible(i){
  if(!_tarEdit||!_tarEdit[i]) return;
  const f=_tarEdit[i], g=f.grupo;
  const vis=_tarEdit.filter(x=>x.grupo===g&&x.visible!==false);
  if(f.visible!==false&&vis.length<=1){ toast('Al menos uno de cada grupo se tiene que ofrecer','err'); return; }
  f.visible=f.visible===false; _tarSucia();
  pintarTarifas();
}
/* Una clave nueva: corta, sin acentos y que no choque. La pone la app, no la persona: es lo que
   las partidas guardan, y un nombre se puede corregir mañana sin perderlas. */
function _tarClaveNueva(g){
  let k; do{ k='x'+Date.now().toString(36).slice(-5)+Math.floor(Math.random()*36).toString(36); }while(_tarEdit.some(f=>f.grupo===g&&f.clave===k));
  return k;
}
function agregarTarifa(g){
  if(!_tarEdit) return;
  const fab=_tarFab(g); if(!fab||!fab.length) return;
  _tarEdit.push({grupo:g,clave:_tarClaveNueva(g),nombre:'',precio:'',como:fab[0].key,visible:true});
  _tarSucia(); pintarTarifas();
  const i=_tarEdit.length-1, el=$('tar-n-'+i);
  if(el){ try{ el.focus({preventScroll:true}); }catch(_){ el.focus(); } el.scrollIntoView({block:'center'}); }
}
/* Lo mismo que revisa la hoja, dicho antes de mandar: el primer renglón malo, con su campo. */
function _tarRevisar(){
  for(let i=0;i<_tarEdit.length;i++){
    const f=_tarEdit[i], gratis=f.grupo==='complejidad'||f.grupo==='recorte-extra';
    const nom=String(f.nombre||'').trim();
    if(!nom) return {i,campo:'n',msg:'Falta el nombre de un renglón.'};
    if(/[<>&"`]/.test(nom)) return {i,campo:'n',msg:'El nombre «'+nom.replace(/[<>&"`]/g,'')+'» no puede llevar < > & " ni `.'};
    const p=Number(f.precio);
    if(f.precio===''||!isFinite(p)||p<0||(!gratis&&p<=0)) return {i,campo:'p',msg:'El precio de «'+nom+'» no sirve.'};
  }
  return null;
}
async function guardarTarifas(){
  if(!_tarEdit||_tarGuardando) return;
  const mal=_tarRevisar();
  if(mal){ toast(mal.msg,'err',5200); const el=$('tar-'+mal.campo+'-'+mal.i); if(el){ try{ el.focus(); }catch(_){} } return; }
  /* La cuenta de Google es la llave de la hoja. Con la base mandando lo que se guarda va a la base (su sesión es
     otra) y la hoja solo recibe la copia: sin Google se guarda igual y la copia queda pendiente. */
  const enBase=laBaseManda();
  const s=await asegurarSesion();
  if(!s.ok&&!enBase){ toast(s.mensaje||'No se pudo confirmar tu cuenta de Google.','err',6000); return; }
  const filas=_tarEdit.map(f=>({grupo:f.grupo,clave:f.clave,nombre:String(f.nombre).trim(),precio:Number(f.precio),como:f.como||'',visible:f.visible!==false}));
  _tarGuardando=true;
  const P=window.Piezas;
  const mandar=async()=>{
    if(enBase){
      const nube=await esperarVentanillaBase('guardarTarifas',4000);
      if(!nube) throw new Error('Este aparato todavía no entra a la base: entra a Supabase en Ajustes y vuelve a guardar.');
      const rb=await nube.guardarTarifas(filas);
      if(!rb||!rb.ok) throw new Error((rb&&rb.mensaje)||'La base no guardó los precios.');
      if(!_tarAplicarCuidando(rb.tabla,'base')) throw new Error('La base guardó, pero lo que devolvió no se entiende. Vuelve a abrir el cotizador.');
      try{ localStorage.setItem(TARIFAS_LS,JSON.stringify(rb.tabla)); }catch(_){}
      return Object.assign({},rb,{espejo:await _tarEspejoHoja(rb.tabla)});
    }
    let r;
    /* Del botón (T1-8): con la hoja mandando es la pregunta que el toque pidió. */
    try{ r=await hablarHoja('guardar_tarifas',{filas},25000,true); }
    catch(e){ throw new Error(e&&e.message||'La hoja no contestó.'); }
    if(!r||!r.ok){
      if(r&&r.codigo==='NO_ENCONTRADO'){ TARIFAS_INFO.sinRuta=true; pintarTarifas(); throw new Error('La hoja todavía no tiene esta función: hay que publicar la versión nueva del Apps Script.'); }
      throw new Error((r&&r.mensaje)||'La hoja no guardó los precios.');
    }
    if(!_tarAplicarCuidando(r.tabla)) throw new Error('La hoja guardó, pero lo que devolvió no se entiende. Vuelve a abrir el cotizador.');
    try{ localStorage.setItem(TARIFAS_LS,JSON.stringify(r.tabla)); }catch(_){}
    return r;
  };
  /* Piezas.trabajando no lanza: contesta {ok, valor | error}. Sin la pieza, lo mismo a mano. */
  const res=(P&&P.trabajando)
    ? await P.trabajando($('tar-guardar'),mandar,{verbo:'Guardando',tau:6000,ok:'Guardados',mal:'No se guardó',voz:false})
    : await mandar().then(valor=>({ok:true,valor}),error=>({ok:false,error}));
  _tarGuardando=false;
  if(!res.ok){ if(!res.ocupado) toast((res.error&&res.error.message)||'No se guardaron los precios.','err',8000); return; }
  cerrarTarifas();
  try{ renderItems(); renderSummary(); }catch(_){}
  const n=res.valor&&res.valor.cambios;
  toast('Precios guardados'+(enBase?' en la base':'')+(n?' · '+n+(n===1?' cambio':' cambios'):'')+'. Los demás teléfonos los toman al abrir el cotizador o al volver a la app.','ok',6000);
  if(enBase&&res.valor&&!res.valor.espejo){
    toast('La hoja, que sella las autorizaciones, no recibió los precios nuevos: se le vuelven a mandar solos. Hasta entonces, autorizar puede decir que el precio no cuadra.','err',9000);
  }
}

/* ----- Lo que el marcado puede pedirle a este archivo -----
   Ver «Los botones del marcado» en nucleo.js. */
accionesDirectas(['abrirTarifas','cerrarTarifas','guardarTarifas','agregarTarifa','tarVisible','entrarALaBaseParaPrecios']);
Object.assign(ACC,{
  tarNombre:(el,ev,i)=>tarNombre(i,el.value),
  tarPrecio:(el,ev,i)=>{ if(el.validity.badInput) return; tarPrecio(i,el.value); },
  tarComo:(el,ev,i)=>tarComo(i,el.value),
});
