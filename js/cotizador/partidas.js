/* ============================================================================
   Cotizador · partidas.js

   Las partidas: agregar, duplicar, plegar, heredar material, pintarlas (renderItems), sus chips y su resumen, y la autorización por partida.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Acciones partidas ===================== */
/* ===================== Partidas plegables =====================
   Una partida de letras mide 1 293 px en un iPhone: con dos capturadas ya no cabía
   ninguna completa en pantalla. Plegada se queda en su encabezado —descripción, tipo, lo
   que ya está elegido y el total— y se abre con un toque.

   Tres de las funciones de aquí —plegarOtras, togglePartida y sincronizarPlegado— salían
   temprano si la pantalla medía más de 920 px, así que en escritorio no se podía plegar
   nada: se veía el catálogo completo de cada partida —los
   cinco materiales, las tres complejidades, los tres acabados— multiplicado por cada
   renglón de la cotización. Plegar sirve igual en las dos pantallas, y de hecho más
   arriba de 920 px, donde una cotización de cinco partidas medía 3 000 px de opciones.

   El estado se guarda aparte, en un conjunto de ids, y no dentro de Q: así no se
   escribe en localStorage, no viaja al historial ni acaba en el PDF; es una
   preferencia de cómo se está viendo la pantalla, no un dato de la cotización. */
const _plegadas=new Set();
/* Al abrir una partida se recogen las demás: se ve el resumen de lo que ya iba y el
   formulario de lo que se está capturando, sin desplazarse a ciegas. */
function plegarOtras(dejarAbierta){
  Q.items.forEach(it=>{ if(it.id!==dejarAbierta) _plegadas.add(it.id); });
  _plegadas.delete(dejarAbierta);
}
function togglePartida(id,opts){
  const plegada=_plegadas.has(id);
  if(opts&&opts.soloAbrir&&!plegada) return;   // el resumen solo abre; no pliega
  /* Al ABRIR se pliegan las demás. La app ya imponía «una abierta a la vez» al cargar
     una cotización (sincronizarPlegado) y al agregar una partida (plegarOtras dentro de
     addItem); faltaba la única vez que lo decide la persona, que es ésta. Sin esto, dos
     toques pasaban la página de 2 493 px a 3 787 px en un iPhone, y una partida de letras
     abierta mide 941 px en una pantalla de 844: dos no caben. Al plegar no se toca nada
     más — plegar es quitar, no reorganizar. */
  if(plegada) plegarOtras(id); else _plegadas.add(id);
  /* renderItems reconstruye la lista entera con innerHTML, así que el botón que se acaba
     de pulsar deja de existir y el foco se cae al <body>: quien navega con teclado
     volvía al principio del documento cada vez que plegaba. Se devuelve al ▾ de esta
     misma partida, que es el único punto de anclaje que sobrevive al repintado. */
  const a=document.activeElement;
  const teniaFoco=!!(a&&a.closest&&a.closest('.partida')&&a.closest('.partida').id==='p-'+id);
  renderItems();
  if(teniaFoco){
    const b=$('p-'+id)&&$('p-'+id).querySelector('.pfold');
    if(b){ try{ b.focus({preventScroll:true}); }catch(_){ b.focus(); } }
  }
  /* Al plegar, lo de abajo sube de golpe. En el teléfono eso se lleva la partida fuera
     de la pantalla y hay que traerla de vuelta a donde estaba el dedo; con ratón hay
     sitio de sobra y casi siempre sigue a la vista, y ahí un salto de página que nadie
     pidió estorba más que no moverse. Por eso se mira antes si de verdad se salió.

     Ahora vale para los dos sentidos: desde que abrir recoge las demás, abrir la última
     partida también sube todo lo que tenía encima y puede dejarla debajo de la barra
     pegajosa. La condición no cambia —solo se actúa si de verdad se salió—, así que
     cuando no se mueve nada, no se mueve nada. */
  const el=$('p-'+id);
  if(el&&el.getBoundingClientRect().top<altoTopbarFija()) irA(el);
}
function togglePlegarTodas(){
  const hayAbiertas=Q.items.some(it=>!_plegadas.has(it.id));
  if(hayAbiertas) Q.items.forEach(it=>_plegadas.add(it.id));
  else _plegadas.clear();
  renderItems();
  /* Plegar N partidas de golpe se ve de un vistazo y no se oye: sin esto, quien usa
     lector de pantalla pierde —o recupera— todos los formularios sin una palabra. */
  const n=Q.items.length;
  voz(n===1
    ? `1 partida ${hayAbiertas?'plegada':'abierta'}`
    : `${n} partidas ${hayAbiertas?'plegadas':'abiertas'}`);
}
/* Al abrir una cotización guardada solo se deja desplegada la última: si no, cinco
   partidas ya capturadas son seis mil píxeles de desplazamiento antes de ver el total. */
function sincronizarPlegado(){
  _plegadas.clear();
  if(Q.items.length<2)return;
  Q.items.slice(0,-1).forEach(it=>_plegadas.add(it.id));
}

/* ----- Material heredado -----
   El material es el único campo de una partida de letras que hay que elegir en TODAS
   y que casi nunca cambia dentro del mismo trabajo. Se hereda el último que se eligió
   a mano, con una etiqueta visible al lado para que se note que lo puso la app.

   No es lo mismo que adivinarlo: no sale de la imagen ni de una corazonada del
   programa, sale de la última decisión explícita de quien cotiza. Por eso solo se
   hereda cuando la partida nace de capturar a mano (`heredar:true`); las que crea el
   escalador o el vectorizador siguen naciendo sin material, porque ahí la partida
   viene de una medida y el material sí sería una suposición con precio. */
/* Devuelve la partida que creó, o null si no creó ninguna. No es un adorno: hasta ahora
   addItem SIEMPRE agregaba, y quien la llamaba desde el escalador o el vectorizador leía
   `Q.items[Q.items.length-1]` dando por hecho que era la recién nacida. Con una guarda que
   puede salir sin crear, esa línea agarra la partida ANTERIOR y le pisa altura, piezas y
   descripción sin decir nada —o es undefined con la lista vacía y truena—. Hoy lo tapan las
   guardas de más arriba, pero eso es confiar en una guarda que vive en otro archivo mental. */
function addItem(opts){
  if(locked())return null;
  /* Backstop mudo. Cada botón que llega hasta aquí ya pasó por exigirDatosParaPartidas()
     y ya dijo lo que faltaba; esta guarda es para los caminos que NO son un botón —el
     arranque de la app y `nueva()`, que crean la primera partida en blanco—, donde un
     aviso sería un regaño por no haber empezado todavía.

     Se repinta igual antes de salir: el arranque y `nueva()` daban por hecho que después
     de addItem la pantalla ya correspondía a Q —era addItem quien repintaba—, así que sin
     esto «Vaciar y empezar cotización nueva» dejaba en pantalla las partidas de la
     cotización que se acababa de vaciar. */
  if(faltanDatosCliente()){ renderItems(); return null; }
  const id=++pid;
  const heredado=(opts&&opts.heredar)?prefGet(PREF_MATERIAL,''):'';
  const mat=matOf(heredado)?heredado:'';
  Q.items.push({id,tipo:'letras',material:mat,matAuto:!!mat,comp:'recta',luz:true,ilumTipo:'fria',altura:0,n:0,
    tarifa:0,ancho:0,alto:0, acab:'',recComp:false,bas:'', desc:'',descAi:false,pz:1,pu:0,textoAuto:'',showInPdf:true});
  Q.sinEstrenar=false;
  plegarOtras(id);
  renderItems();
  /* Sin esto, quien usa lector de pantalla no se enteraba de que apareció una partida ni
     de que las anteriores se plegaron: la lista cambia entera y no se anuncia nada. */
  voz('Partida '+Q.items.length+' agregada'+(Q.items.length>1?' — se plegaron las anteriores':''));
  if(!opts||opts.enfocar!==false) enfocarPartida(id);
  return Q.items[Q.items.length-1];
}
/* La puerta de «+ Agregar partida». El botón NO se deshabilita cuando faltan los datos
   del cliente: un botón gris no dice por qué está gris, y aquí el porqué es justo lo que
   hay que hacer a continuación. Así que se queda vivo, nombra lo que falta y lleva ahí. */
function agregarPartida(){
  if(!exigirDatosParaPartidas()) return;
  addItem({heredar:true});
}
/* Duplicar la última partida. Es lo que más se hace cuando un letrero trae dos
   renglones del mismo material y distinta altura, y hasta ahora vivía escondido en el
   ⧉ del encabezado de cada partida. Sin partidas todavía, agrega la primera. */
function duplicarUltima(){
  if(locked())return;
  if(!exigirDatosParaPartidas()) return;
  const last=Q.items[Q.items.length-1];
  if(!last){ addItem({heredar:true}); return; }
  dupItem(last.id);
}
/* La partida nueva se trae a la vista. En el celular «+ Agregar partida» queda al
   final de una lista larga y la que se acababa de crear nacía fuera de pantalla. */
function enfocarPartida(id){
  const el=$('p-'+id); if(!el) return;
  requestAnimationFrame(()=>irA(el));
}
/* Última partida borrada, para poder deshacer: en el celular es fácil tocar la ×
   por accidente y perder una partida con todo su detalle capturado. */
let _borrada=null;
/* `opts.vacia` abre una puerta estrecha en los dos candados, y solo para una partida
   COMPLETAMENTE vacía. Es la misma razón por la que `deshacerBorrado` vive fuera de ellos:
   un renglón sin un solo dato no vale nada, no mueve el total y no hay trabajo que perder
   al soltarlo, así que quitarlo no es editar la cotización.

   Sin esta puerta, el botón «Quitar» del aviso de partidas sin terminar se escondía justo
   en el camino que se usa casi siempre. El aviso sale al mandar a autorización, y por el
   atajo «Autorizar yo mismo» la cotización ya pasó a «pendiente» —o sea `locked()`—, así
   que `delItem` se negaba en silencio y el botón no se pintaba: la única salida era tocar
   la partida, y eso REABRE la cotización entera y se lleva el nombre y la nota de quien
   iba a autorizar, para deshacerse de un renglón en blanco. Por «Solicitar autorización a
   alguien más» sí aparecía, porque ahí el estado sigue en borrador; el mismo aviso se
   portaba distinto según por cuál de los dos botones se llegó. */
function delItem(id,opts){
  const idx=Q.items.findIndex(x=>x.id===id);
  if(idx<0) return;
  const vacia=!!(opts&&opts.vacia)&&itemVacio(Q.items[idx]);
  if(locked()&&!vacia)return;
  /* Borrar tampoco: el candado es sobre la partida entera, no solo sobre sus campos. Una
     cotización a la que todavía no se le puede meter nada tampoco tiene por qué poder
     perder lo que ya traía —las partidas de una cotización vieja que se abrió sin
     teléfono siguen ahí, intactas, hasta que se escriba. */
  if(!vacia&&!exigirDatosParaPartidas({llevar:false}))return;
  /* Borrar también estrena la cotización: si aquí hubo una partida, la de arriba ya no es
     la primera y no hay nada que sembrar. Sin esto quedaba un rincón —vaciar, duplicar
     del historial, borrarlas todas— donde la bandera seguía en pie y la partida en blanco
     reaparecía al abrirse el candado. */
  Q.sinEstrenar=false;
  _borrada={item:Q.items[idx],idx,precioAuth:(Q.itemsAuth||{})[id],vacia};
  Q.items.splice(idx,1);
  // Su precio autorizado se va con ella: si no, queda en el mapa y vuelve a sumar
  if(Q.itemsAuth) delete Q.itemsAuth[id];
  renderItems();
  /* Sin esto el foco se caía al <body> y el «Deshacer» del aviso quedaba a decenas de
     tabulaciones. Va al ▾ de la partida vecina y no a su ×: dejar el cursor sobre un
     botón destructivo justo después de borrar convierte un segundo Enter en otra pérdida. */
  const _sig=Q.items[Math.min(idx,Q.items.length-1)];
  const _b=_sig?document.querySelector('#p-'+_sig.id+' .pfold'):$('addbtn');
  if(_b){ try{ _b.focus({preventScroll:true}); }catch(_){ _b.focus(); } }
  toast('Partida '+(idx+1)+' eliminada','',6000,{label:'Deshacer',fn:deshacerBorrado});
}
/* Deshacer un borrado queda FUERA del candado nuevo, y no es un olvido: restituir no es
   capturar, y devolver una partida que ya existía hace un segundo no mete un dato que no
   estuviera. Bloquearlo era además el único punto donde este candado podía PERDER trabajo:
   el «Deshacer» dura seis segundos, y si en esos seis segundos el vendedor se fue a
   corregir el teléfono —lo borró para reescribirlo—, el candado se cerraba y la partida se
   perdía para siempre. Un candado que existe para que no se pierda nada no puede ser el
   único que pierde algo. Borrar sí se queda dentro: ahí no hay nada que rescatar. */
function deshacerBorrado(){
  if(!_borrada) return;
  /* Si lo que se quitó era una partida vacía, devolverla tampoco mueve el precio: el
     candado no puede negar la vuelta de algo que sí dejó salir, o el aviso saldría con un
     «Deshacer» que se niega. */
  if(locked()&&!_borrada.vacia){ toast('La cotización está bloqueada','err'); return; }
  Q.items.splice(Math.min(_borrada.idx,Q.items.length),0,_borrada.item);
  if(_borrada.precioAuth!==undefined){ if(!Q.itemsAuth)Q.itemsAuth={}; Q.itemsAuth[_borrada.item.id]=_borrada.precioAuth; }
  _borrada=null;
  renderItems();
  toast('Partida restaurada','ok');
}
function setItem(id,k,v){
  /* Los chips y los interruptores ya salen apagados cuando la partida está bloqueada,
     pero setItem y typeItem eran las dos únicas funciones que escriben dentro de una
     partida sin preguntar nada: el candado dependía por completo de que el HTML se
     hubiera pintado bien. Ahora lo preguntan ellas, que es donde se escribe. */
  if(capturaBloqueada())return;
  const it=Q.items.find(x=>x.id===id); if(!it)return;
  it[k]=v;
  /* Elegir el material a mano lo vuelve decisión propia: se quita la etiqueta de
     heredado y ese material pasa a ser el que hereden las partidas siguientes. */
  if(k==='material'){ it.matAuto=false; if(v) prefSet(PREF_MATERIAL,v); }
  renderItems();
}
/* Escritura ligera: no re-renderiza el input (evita perder el foco), solo refresca total y resumen */
function typeItem(id,k,v){
  if(capturaBloqueada())return;
  const it=Q.items.find(x=>x.id===id); if(!it)return;
  undoJuntar('it:'+id+':'+k);
  it[k]=v;
  /* El «N letras» de al lado es el espejo de n y solo se pintaba en el primer repintado:
     se teclea 8 y sigue diciendo «0 letras». El span no existe con la partida bloqueada. */
  /* Corregir la cuenta a mano la vuelve la buena: el contador de al lado deja de escribirla.
     Ver autoContarLetras. */
  if(k==='n'){ it.nManual=true; const c=$('acnt-'+it.id); if(c) c.textContent=(v||0)+(it.tipo==='recorte'?' piezas':' letras'); }
  if(k==='desc'){ it.descAi=false; it.descAuto=false; }
  const f=$('formula-'+id), l=$('lt-'+id);
  if(f) f.innerHTML=formulaHTML(it);
  if(l) l.innerHTML=ltHTML(it);
  pintarResumen(it);
  /* updProg además de renderSummary: la barra de completitud y el «falta esto» se quedaban
     con la cuenta de antes mientras se teclea —los campos del proyecto sí la refrescan
     desde upd(), los de la partida no—, así que decía que faltaba la altura con la altura
     ya escrita, hasta que otra cosa repintara. */
  renderSummary(); updProg(); saveState();
}
/* Tocar «Caja de luz» metía `tarifa=3900` de una vez, y con eso el chip «Estándar» salía con
   su palomita y el encabezado del grupo decía «Estándar» en vez de «Sin elegir»: exactamente
   igual que si lo hubiera elegido una persona. Una caja tipo nube capturada por quien solo
   teclea las medidas se cobraba a estándar —en 1.6 m² son $11,200 de menos— y el ámbar de
   «Falta tipo de caja» era inalcanzable, porque solo aparecía si alguien borraba la tarifa a
   mano. Es la doctrina que este archivo ya tiene escrita para la IA: lo predeterminado no
   decide el precio. Ahora la caja arranca en $0, el grupo dice «Sin elegir» en ámbar, la
   fórmula dice «Falta: tipo de caja» y la partida entra en el aviso de partidas sin terminar;
   elegir Estándar es un toque, y el chip ya trae su $3,900 escrito.
   El camino de la IA no cambia: ahí el número lo propone un análisis y la insignia lo dice. */
/* ----- Lo que el campo no pudo leer no se guarda como 0 en silencio -----
   Todos los numéricos escriben `+this.value`, y un `type=number` con contenido que el
   navegador no valida devuelve cadena vacía: pegar «40 cm» de un mensaje, o teclear la coma
   decimal en vez del punto, deja la altura en 0 mientras el campo se ve escrito, y la fórmula
   acaba diciendo «Falta: altura» justo encima de un campo lleno — que es la manera más rápida
   de perderle la confianza a la app.

   Va en `onblur` y no en `onchange`, y no es un detalle: si el campo estaba vacío y se pega
   texto inválido, `value` es '' antes y después, así que el navegador nunca dispara `change`
   y el texto se queda en pantalla. `blur` siempre corre. El valor entero del cambio es que el
   campo se reescriba con lo que la app leyó DE VERDAD.

   Solo la altura redondea al medio centímetro, porque es la única que declara ese paso en su
   `step` y la que ya aplica el escalador al bajar sus medidas. En ancho, alto, tarifa y
   unitario no se redondea nada: inventarles una precisión que nunca declararon movería el
   importe de una cotización a espaldas de quien la teclea. */
function saneaNum(el,id,k,paso){
  const v=+el.value;
  const n=(v>0)?(paso?Math.round(v/paso)*paso:v):0;
  el.value=n||'';
  typeItem(id,k,n);
}
function setTipo(id,t){ if(capturaBloqueada())return; const it=Q.items.find(x=>x.id===id); if(!it)return; it.tipo=t; renderItems(); }
function dupItem(id){
  if(locked())return;
  if(!exigirDatosParaPartidas()) return;
  const src=Q.items.find(x=>x.id===id); if(!src)return;
  /* Duplicar es una decisión explícita: el material de la copia ya no va marcado como
     heredado, porque quien duplicó sabe exactamente qué está copiando. */
  const copy=JSON.parse(JSON.stringify(src)); copy.id=++pid; copy.matAuto=false;
  const idx=Q.items.findIndex(x=>x.id===id);
  Q.items.splice(idx+1,0,copy);
  plegarOtras(copy.id);
  renderItems(); enfocarPartida(copy.id); toast('Partida duplicada');
}
/* Ocultar una partida del PDF cambia el documento que firma el cliente, así que va con
   candado: en una cotización bloqueada el ojo seguía funcionando y el cambio no se
   guardaba en el historial, de modo que al reimprimir volvían a salir las ocultas. */
function setShowInPdf(id,val){
  /* Ocultar del PDF queda FUERA del candado nuevo, por lo mismo que deshacer un borrado:
     no mete un dato en la partida, decide qué renglones salen impresos. Y bloquearlo dejaba
     a la app dándose instrucciones que ella misma frenaba: en una cotización autorizada sin
     teléfono —de las que el historial guarda desde antes de que se pidiera—, el ojo decía
     «usa Editar partidas», y al entrar a editar el candado se cerraba encima y el ojo
     contestaba que no se podía, con el banner del modo edición señalándolo. Ahí no se está
     capturando nada: la cotización ya se autorizó y lo que se quiere es tapar un renglón
     del papel. */
  if(locked()){ toast('La cotización está bloqueada — usa «Editar partidas» para ocultar partidas','err',4200); return; }
  const it=Q.items.find(x=>x.id===id); if(!it)return;
  it.showInPdf=val;
  renderItems();
  if(Q.estado==='autorizada') guardarEnHistorial();
}
function toggleEditMode(){
  Q.editMode=true;
  renderItems();renderAuth();
  /* La condición tiene que ser LA MISMA que decide soltar, y no lo era: `soltarAuthSiCambio`
     suelta con `Q.precioAuth>0 || hay ajustes por partida`, y aquí solo se miraba el precio
     total. La cotización cuyo autorizador ajustó partida por partida sin mover el total
     —Q.precioAuth queda en 0 y Q.itemsAuth lleno, que es media pantalla del formulario de
     revisión— entraba a edición con el aviso suave y perdía todos esos ajustes al primer
     tecleo, avisada después. El aviso que cuesta se da donde se decide, no cuando ya pasó. */
  toast(hayAuthQueSoltar()
    ? 'Modo edición activado — si cambias las partidas habrá que volver a autorizar el precio'
    : 'Modo edición activado — modifica y guarda cuando termines','',4600);
}
/* Guardar ya no decide nada sobre el precio: soltarlo pasó a ser cosa de
   soltarAuthSiCambio(), que corre en cada repintado. Antes vivía aquí y por eso bastaba
   con no apretar este botón —recargar, cerrar la app— para dejar una cotización autorizada
   en el precio de otras partidas. */
function guardarCambiosEdicion(){
  Q.editMode=false;
  /* Soltar ANTES de escribir en el historial: al revés, la entrada guardada se llevaba el
     precio autorizado viejo. Normalmente ya se soltó —y ya se avisó— en el momento del
     cambio, así que aquí casi siempre toca el «Cambios guardados». */
  if(soltarAuthSiCambio()) toast('Cambiaron las partidas: el precio vuelve al calculado y hay que autorizarlo de nuevo','',6000);
  else toast('Cambios guardados','ok');
  guardarEnHistorial();
  saveState();
  renderItems();renderAuth();renderSummary();renderMobileBar();
  if(typeof updateQueueEntry==='function')
    updateQueueEntry(Q.folio,{precioAuth:Q.precioAuth,itemsAuth:Q.itemsAuth,huellaAuth:Q.huellaAuth});
}
function autoContarLetras(id,texto){
  if(capturaBloqueada())return;
  const n=texto.replace(/\s/g,'').length;
  const it=Q.items.find(x=>x.id===id); if(!it)return;
  undoJuntar('it:'+id+':texto');
  it.textoAuto=texto;
  /* ----- El texto se teclea una vez, no dos -----
     `textoAuto` se guardaba con la cotización y no se leía en ningún otro sitio: ni en la
     cara plegada, ni en la fórmula, ni en el PDF, ni en el WhatsApp, ni en Canva. Así que el
     vendedor tecleaba «FARMACIA GDL» aquí para que saliera el 11, y lo volvía a teclear en
     Descripción para que el renglón del PDF dijera cuál es cuál. Con seis partidas son seis
     textos capturados dos veces.

     Ahora siembra la descripción, con el mismo contrato que ya tienen el material heredado y
     el autocompletado de cliente: solo si está vacía o si la puso la app, y en cuanto la
     escribe una persona deja de tocarse. Bandera propia y NO `descAi`, que pinta la insignia
     de IA y aquí sería mentira. */
  if(!(it.desc||'').trim()||it.descAuto){
    const t=texto.trim();
    it.desc=t; it.descAuto=!!t;
    const d=$('d-'+id); if(d&&d.value!==it.desc) d.value=it.desc;
  }
  /* ----- Y una cuenta corregida a mano no se pisa -----
     `it.n` se reescribía en cada teclazo del texto. Corregir «# Letras» a 17 sobre un texto
     que cuenta 19 y volver a tocar la caja —para arreglar una letra del propio texto—
     devolvía el 19 y se llevaba la corrección, sin nada que dijera que ese número lo había
     puesto una persona. En letras de acero a 40 cm cada pieza son $2,200. Vaciar la caja de
     texto le devuelve el mando al contador: sin eso, un `n` viejo se queda pegado para
     siempre. */
  if(!texto) it.nManual=false;
  if(!it.nManual) it.n=n;
  const inp=$('n-'+id); if(inp&&!it.nManual) inp.value=n||'';
  /* En un recorte el mismo campo cuenta piezas, no letras: el contador dice lo que
     dice la etiqueta de arriba. */
  /* El contador dice SIEMPRE lo que está guardado, nunca dos números distintos: con la
     cuenta corregida a mano, lo guardado es la corrección. */
  const cnt=$('acnt-'+id); if(cnt) cnt.textContent=(it.n||0)+(it.tipo==='recorte'?' piezas':' letras');
  const f=$('formula-'+id),l=$('lt-'+id);
  if(f) f.innerHTML=formulaHTML(it);
  if(l) l.innerHTML=ltHTML(it);
  pintarResumen(it);
  /* updProg además de renderSummary: la barra de completitud y el «falta esto» se quedaban
     con la cuenta de antes mientras se teclea —los campos del proyecto sí la refrescan
     desde upd(), los de la partida no—, así que decía que faltaba la altura con la altura
     ya escrita, hasta que otra cosa repintara. */
  renderSummary(); updProg(); saveState();
}

/* ----- El foco sobrevive al repintado -----
   renderItems reconstruye la lista con innerHTML, así que el control que se acaba de pulsar
   deja de existir y el foco se cae al <body>. Capturar una partida son de tres a cinco
   opciones —material, complejidad, acabado, iluminación— y cada una costaba retabular la
   página entera desde arriba, sin nada que confirmara la elección: el flujo central de la
   app quedaba inservible por teclado. togglePartida ya resolvía su propio caso a mano; esto
   lo generaliza para todos.

   El control se reconoce por su propio onclick, que ya es único porque lleva el id de la
   partida y el valor elegido, así que no hace falta marcar nada en el HTML ni mantener una
   lista de qué es enfocable. */
function _focoDeItems(){
  const a=document.activeElement;
  if(!a||!a.closest||!a.closest('#items')) return null;
  /* El ojo del PDF y los dos interruptores llevan su marca en data-foco: en los tres el
     onclick es justo lo que cambia al pulsarlos, así que la marca no sobrevivía. */
  return a.getAttribute('data-foco')||a.getAttribute('onclick')||null;
}
function _devolverFocoItems(marca){
  if(!marca) return;
  const c=$('items'); if(!c) return;
  const el=c.querySelector('[data-foco="'+CSS.escape(marca)+'"]')||Array.prototype.find.call(c.querySelectorAll('[onclick]'),e=>e.getAttribute('onclick')===marca);
  if(el){ try{ el.focus({preventScroll:true}); }catch(_){ el.focus(); } }
}

/* ===================== Render partidas ===================== */
function renderItems(){
  const _focoPrevio=_focoDeItems();
  renderAiPreview();
  renderScalerPreview();
  const c=$('items'); c.innerHTML='';
  /* Las partidas de una cotización que se abrió sin los datos del cliente siguen ahí y se
     leen; lo que no se puede es escribir en ellas. La clase las apaga para que se note. */
  c.classList.toggle('items-cand',!locked()&&faltanDatosCliente());
  if(Q.editMode&&Q.estado==='autorizada'){
    const banner=document.createElement('div');
    banner.className='edit-mode-banner';
    banner.innerHTML=ico('i-lapiz')+' <span>Modo edición activo — modifica materiales, descripciones o usa '+ico('i-ojo')+' para ocultar partidas del PDF sin borrarlas.</span>';
    c.appendChild(banner);
  }
  /* El recuadro de «Aún no hay partidas» solo sale cuando de verdad se pueden agregar. Con
     el paso 1 sin terminar el texto de siempre —«Agrega letras 3D…»— pedía justo lo que la
     ficha ámbar acaba de prohibir dos centímetros más arriba, y cualquier redacción
     alternativa repite palabra por palabra lo que ya dice la ficha. Dos avisos seguidos
     diciendo lo mismo no informan el doble: se estorban. */
  if(Q.items.length===0&&!(!locked()&&faltanDatosCliente())){
    const empty=document.createElement('div'); empty.className='empty';
    empty.textContent='Aún no hay partidas. Agrega letras 3D, un recorte de acrílico, un bastidor, una caja de luz o una partida manual.';
    c.appendChild(empty);
  }
  Q.items.forEach((it,i)=>{
    const d=document.createElement('div'); d.className='partida'; d.id='p-'+it.id;
    /* El matiz de la partida. Va por POSICIÓN y no por id: lo que hay que poder distinguir
       de un vistazo es la de arriba de la de abajo, así que el color tiene que decir lo
       mismo que el número —y con seis tonos, dos vecinas nunca coinciden—. Por id, borrar
       la segunda de tres dejaría dos partidas del mismo color pegadas.
       Se pone aquí y no con :nth-child porque dentro de #items pueden ir por delante la
       banda de «modo edición» y el recuadro de «aún no hay partidas», y contar hijos daría
       el color corrido justo cuando esos aparecen. */
    d.dataset.tono=(i%6)+1;
    if(it.showInPdf===false) d.classList.add('hidden-pdf');
    /* De aquí para abajo se pregunta por capturaBloqueada() y no por locked(): reordenar,
       cambiar el tipo, duplicar y borrar son maneras de meter datos en las partidas, y el
       candado nuevo las cubre igual que el viejo.

       Los dos botones que sí se pintan —el selector de tipo y la ×— se apagan de dos
       maneras distintas a propósito. Con el candado del precio, `disabled`, que es lo que
       han hecho siempre. Con el candado nuevo, `aria-disabled`: un <button disabled> no
       despacha click, así que el oyente que existe para que nada se quede callado nunca se
       enteraba y los dos eran los únicos puntos mudos que quedaban en la partida —el resto
       ya contesta—. La escritura la frenan setTipo y delItem, que preguntan ellos mismos. */
    const _off=locked()?'disabled':(faltanDatosCliente()?'aria-disabled="true"':'');
    if(!capturaBloqueada()) d.setAttribute('draggable','true');
    const pdfVis=it.showInPdf!==false;
    const plegada=_plegadas.has(it.id);
    if(plegada) d.classList.add('folded');
    /* ----- El encabezado, y por qué ahora se queda pegado arriba -----
       `.partida-top` y `.psum` eran hermanos sueltos y `.psum` solo se veía plegada. Ahora
       van los dos dentro de `.pcab`, que es lo que el CSS pega arriba mientras se hace
       scroll DENTRO de una partida abierta —que con cinco materiales, tres complejidades,
       tres luces y cuatro campos son unos 700 px—. Antes, a mitad de esa captura no había en
       pantalla una sola cosa que dijera en cuál de las seis partidas se estaba ni qué llevaba
       elegido; ahora el número, la descripción, el total y las fichas de lo elegido se quedan
       a la vista. Es lo que sustituye al matiz de color por partida que el rediseño retiró:
       dice más, y lo dice también en papel y para quien no distingue seis tonos.

       El total se MUDA aquí desde `.pline`. Sigue fuera de `.pbody`, que era la razón por la
       que vivía abajo —para no esconderse al plegar y para poder espiar el importe tapado—,
       y ahora además se ve mientras se captura. Abajo se queda la fórmula sola, que es la
       explicación del número y no el número. */
    d.innerHTML=`
      <div class="pcab">
      <div class="partida-top">
        <div class="pnum">
          <!-- El nombre no cambia con el estado: quien lo cambiaba obligaba a conciliar
               un nombre que dice la acción («Abrir») con un aria-expanded que dice el
               estado, leídos uno tras otro. El estado lo carga aria-expanded, que es su
               trabajo; el title sí dice la acción, que es lo que necesita el ratón. -->
          <button class="pfold" onclick="togglePartida(${it.id})" aria-expanded="${plegada?'false':'true'}" aria-controls="pbody-${it.id}" title="${plegada?'Abrir la partida':'Plegar la partida'}" aria-label="Detalle de la partida ${i+1}"><span aria-hidden="true">▾</span></button>
          ${!capturaBloqueada()?'<span class="drag-handle" title="Arrastra para reordenar" aria-hidden="true">'+ico('i-asa')+'</span>':''}
          <div class="n">${i+1}</div>
        </div>
        <span class="ptipo"><span class="lg">${TIPO_NOMBRE[it.tipo]||''}</span><span class="sm">${TIPO_CORTO[it.tipo]||''}</span></span>
        <div class="tipo-seg" role="group" aria-label="Tipo de la partida ${i+1}">
          ${['letras','recorte','bastidor','caja','manual'].map(t=>`<button class="${it.tipo===t?'on':''}" aria-pressed="${it.tipo===t?'true':'false'}" ${_off} onclick="setTipo(${it.id},'${t}')"><span class="lg">${TIPO_NOMBRE[t]}</span><span class="sm">${TIPO_CORTO[t]}</span></button>`).join('')}
        </div>
        <span class="lt" id="lt-${it.id}">${ltHTML(it)}</span>
        <div class="ptop-actions">
          ${!capturaBloqueada()?`<button class="dup" onclick="dupItem(${it.id})" title="Duplicar partida" aria-label="Duplicar partida">${ico('i-copiar')}</button>`:''}
          <button data-foco="pdf-${it.id}" class="pdf-vis${pdfVis?'':' off'}" onclick="setShowInPdf(${it.id},${!pdfVis})" title="${pdfVis?'Ocultar del PDF — la partida sigue sumando al total':'Mostrar en PDF'}" aria-label="${pdfVis?'Ocultar del PDF':'Mostrar en PDF'}">${ico('i-ojo')}</button>
          <button class="del" ${_off} onclick="delItem(${it.id})" title="Eliminar" aria-label="Eliminar la partida ${i+1}"><span aria-hidden="true">×</span></button>
        </div>
      </div>
      ${resumenHTML(it)}
      </div>
      <div class="pbody" id="pbody-${it.id}">${bodyFor(it)}</div>
      <!-- La fórmula va FUERA de .pbody a propósito: es lo único del cuerpo que se queda a la
           vista al plegar. El total se subió al encabezado —ver arriba— y desde ahí sigue
           fuera de .pbody y sigue siendo donde se espían los importes tapados. -->
      <div class="pline">
        <span class="formula" id="formula-${it.id}">${formulaHTML(it)}</span>
      </div>`;
    if(!capturaBloqueada()){
      d.addEventListener('dragstart',e=>{
        dragId=it.id; d.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
      });
      d.addEventListener('dragover',e=>{
        e.preventDefault(); e.dataTransfer.dropEffect='move';
        if(!d.classList.contains('drag-over')){
          document.querySelectorAll('.partida.drag-over').forEach(el=>el.classList.remove('drag-over'));
          d.classList.add('drag-over');
        }
      });
      d.addEventListener('dragleave',e=>{
        if(!d.contains(e.relatedTarget)) d.classList.remove('drag-over');
      });
      d.addEventListener('drop',e=>{
        e.preventDefault(); d.classList.remove('drag-over');
        if(dragId===null||dragId===it.id)return;
        const fi=Q.items.findIndex(x=>x.id===dragId), ti=Q.items.findIndex(x=>x.id===it.id);
        if(fi<0||ti<0)return;
        const [moved]=Q.items.splice(fi,1);
        /* El filete de «suelta aquí» se pinta ENCIMA de la partida sobre la que se suelta, o
           sea «va aquí, antes de ésta». Pero `ti` se midió con la partida arrastrada todavía
           en la lista, así que hacia abajo el hueco ya se corrió uno al sacarla: en [A,B,C],
           arrastrar A sobre C dejaba [B,C,A] y no [B,A,C]. Hacia arriba acertaba, y eso era
           lo peor: el mismo gesto se portaba distinto según la dirección, y el orden es el de
           los renglones del PDF, así que corregirlo arrastrando otra vez volvía a fallar. */
        Q.items.splice(fi<ti?ti-1:ti,0,moved);
        dragId=null; renderItems();
      });
      d.addEventListener('dragend',()=>{
        dragId=null;
        document.querySelectorAll('.partida').forEach(p=>p.classList.remove('dragging','drag-over'));
      });
    }
    c.appendChild(d);
  });
  const _hiddenPdf=Q.items.filter(x=>x.showInPdf===false).length;
  $('pcount').textContent=Q.items.length+' partida'+(Q.items.length!==1?'s':'')+(_hiddenPdf?` · ${_hiddenPdf} oculta${_hiddenPdf>1?'s':''} del PDF`:'');
  /* «Igual que la anterior» solo tiene sentido cuando hay una anterior. */
  const dupBtn=$('dupbtn'); if(dupBtn) dupBtn.style.display=Q.items.length?'':'none';
  /* Plegar/abrir todas: solo tiene sentido con más de una partida */
  const fab=$('fold-all-btn');
  if(fab){
    const hayAbiertas=Q.items.some(it=>!_plegadas.has(it.id));
    fab.classList.toggle('oculto',Q.items.length<2);
    fab.setAttribute('aria-expanded',hayAbiertas?'true':'false');
    $('fold-all-txt').textContent=hayAbiertas?'Plegar todas':'Abrir todas';
  }
  pintarPlazo();
  renderSummary(); updProg(); saveState();
  _devolverFocoItems(_focoPrevio);
}
function calcProg(){
  let pts=0,max=0;
  /* Los tres obligatorios pesan aquí, cada uno lo mismo: si el teléfono no contara, la
     barra podría llegar al 100% con una cotización que la autorización va a frenar. */
  max+=30; if((Q.cliente||'').trim())pts+=10; if((Q.proy||'').trim())pts+=10;
  if(!telIncompleto(Q.tel))pts+=10;
  max+=10; if((Q.dirRaw||'').trim()||(Q.maps||'').trim())pts+=10;
  /* Lo que le falta a una partida se decide en UN solo lugar: resumenPartida, que es de
     donde salen también el aviso de «qué falta», la ficha ámbar de la partida plegada y el
     freno de la autorización. Aquí vivía una segunda lista, escrita por tipo y con sus
     propios pesos, y las dos ya habían divergido: la barra podía marcar 100% sobre una
     partida que el aviso seguía listando como incompleta. */
  if(!Q.items.length){max+=30;}
  else{
    Q.items.forEach(it=>{
      max+=30;
      const campos=resumenPartida(it).filter(f=>f.estado!=='off');
      if(!campos.length){ pts+=30; return; }
      const puestos=campos.filter(f=>f.estado!=='falta').length;
      pts+=30*puestos/campos.length;
    });
  }
  return Math.min(100,Math.round(pts/max*100));
}
function updProg(){
  /* Aquí y no en cada llamador: los datos del proyecto cambian por muchos caminos
     —se teclean, los llena un cliente conocido, llegan de la IA, de la cola o del
     historial— y todos pasan por un repintado. */
  pintarObligatorios();
  /* El candado de las partidas, por lo mismo y en el mismo sitio: es la otra cosa que
     cambia cuando cambian los tres obligatorios. */
  pintarCandadoPartidas();
  /* El resumen del encabezado plegado de «Datos del proyecto» se quedaba con el cliente de
     la cotización anterior al abrir otra: se pintaba solo al plegar y desplegar, no cuando
     los datos cambiaban. Va aquí por el mismo motivo que pintarObligatorios. */
  aplicarFoldProy();
  const pct=calcProg();
  const bar=$('prog-bar'),pctEl=$('prog-pct');
  if(!bar||!pctEl)return;
  bar.style.width=pct+'%';
  pctEl.textContent=pct+'%';
  /* El color lo pone la hoja: aquí solo se dice si ya está completa. Antes se escribían tres
     degradados como estilo EN LÍNEA, que gana a cualquier regla de css/sistema.css, así que el
     color de esta barra era lo único de la app que el tema no podía cambiar —de noche seguía
     saliendo el ámbar y el verde de día— y las reglas de la hoja estaban muertas. Y eran tres
     colores para una medida: el ámbar en esta app significa «falta un dato obligatorio», no
     «vas por el 30 %». */
  bar.classList.toggle('lleno',pct>=100);
  pintarPendiente();
}

/* ----- Qué falta, no solo cuánto -----
   El porcentaje decía cuánto faltaba pero no qué, así que para encontrarlo había que
   recorrer la pantalla a mano. Ahora el bloque nombra lo primero pendiente y tocarlo
   lleva ahí. El orden es el de la captura: primero de quién es, luego dónde, luego las
   partidas. */
/* Cada caso trae su frase completa en vez de colgar de un «Falta» fijo: con el prefijo
   suelto salía «Falta la partida 1 · falta altura», que repite el verbo. */
function siguientePendiente(){
  /* Los tres obligatorios se nombran de uno en uno y en el orden en que están en la
     pantalla: es la misma lista que frena la autorización, así que el aviso de arriba
     y el que sale al continuar nunca pueden decir cosas distintas. */
  const oblig=datosFaltantes();
  if(oblig.length) return {txt:'Falta '+faltaTexto(oblig[0]),campo:oblig[0].campo};
  if(!Q.items.length) return {txt:'Agrega una partida',boton:'addbtn'};
  const pend=partidasSinTerminar();
  if(pend.length){
    const p=pend[0];
    const detalle=p.vacia?'está vacía':`${p.faltan.length>1?'faltan':'falta'} ${p.faltan.join(', ')}`;
    return {txt:`Partida ${p.n} · ${detalle}`,item:p.it.id};
  }
  /* La dirección va al FINAL de la captura y solo mientras la cotización es borrador, y las
     dos cosas son una corrección. No bloquea nada —los obligatorios son tres, no cuatro— y
     estaba delante de «Agrega una partida», que sí bloquea: una cotización recién empezada
     pedía la dirección antes de pedir la primera partida. Y como nunca se llenaba sola, se
     quedaba de titular para siempre y tapaba lo que de verdad seguía: con el precio ya
     autorizado, «qué sigue» decía «Falta la dirección» en lugar de «Genera el PDF».

     Se pide donde sirve: al terminar de capturar, cuando todavía se está con el cliente al
     teléfono y preguntarla sale gratis, y antes de que el precio se cierre. Después ya no es
     el titular; sigue contando en el porcentaje, que es donde se ve que falta algo. */
  if(Q.estado==='borrador'&&!(Q.dirRaw||'').trim()&&!(Q.maps||'').trim())
    return {txt:'Falta la dirección',campo:'f-dir-raw'};
  return null;
}
/* ----- Y después de capturar, el proceso sigue -----
   `siguientePendiente()` es la mejor pieza de conducción que tiene la app: nombra el primer
   hueco y tocarlo lleva ahí. Pero se acababa en las partidas, así que en el instante exacto
   en que el vendedor termina de capturar —el 100 %— el renglón se quedaba vacío y el botón
   muerto, y ahí seguía, al 100 % y mudo, durante todo lo que viene después: mandar a
   autorizar, autorizar, el PDF, mandarlo, registrar la venta. Se apagaba justo cuando dejaba
   de ser obvio qué toca.

   Esto lo continúa hasta el final. Sale de aquí y no de tres sitios distintos para que la
   barra, la pestaña y la barra fija del teléfono digan siempre lo mismo. */
function siguientePaso(){
  /* Primero la captura, tal cual estaba: la dirección y los tres obligatorios son del paso
     1, lo demás del 2. */
  const cap=siguientePendiente();
  if(cap) return Object.assign({paso:cap.campo?1:2},cap);
  if(Q.rol==='autorizador'){
    if(Q.estado==='pendiente') return {txt:'Revisa el precio',paso:3};
    const n=getQueue().filter(x=>x.estado==='pendiente').length;
    return n?{txt:n===1?'1 cotización por revisar':n+' cotizaciones por revisar',paso:3}:null;
  }
  if(Q.estado==='borrador')  return {txt:'Autoriza el precio',paso:3};
  if(Q.estado==='rechazada') return {txt:'Rechazada · vuelve a editarla',paso:3};
  if(Q.estado==='pendiente') return _selfAuth
    ? {txt:'Cierra el precio',paso:3}
    : {txt:'Esperando autorización',paso:3};
  /* Autorizada: la entrega, en el orden en que se hace. */
  const h=hitosDe(Q.folio);
  const falta=HITOS.find(x=>!h[x.k]);
  return falta?{txt:falta.label,paso:4}:null;
}
function pintarPendiente(){
  const el=$('prog-next'); if(!el) return;
  const box=el.closest('.prog-box');
  const p=siguientePaso();
  if(!p){ el.textContent=''; if(box) box.disabled=true; return; }
  if(box) box.disabled=false;
  el.innerHTML=`${esc(p.txt)} <span aria-hidden="true">›</span>`;
}
/* Tocar el aviso del candado lleva al primer hueco y enciende el ámbar, igual que si se
   hubiera intentado agregar una partida: el aviso y el freno del botón dicen lo mismo y
   hacen lo mismo, así que no hay dos maneras de enterarse que puedan discrepar.

   Y con el otro candado —el del precio ya cerrado— el aviso es la puerta de esa frontera:
   abre el modo edición si la cotización está autorizada, y la reabre si está pendiente o
   rechazada. Es el mismo botón que en el panel del resumen; aquí solo está donde se mira. */
function irAlCandado(){
  if(locked()&&!Q.editMode){
    if(Q.estado==='autorizada') toggleEditMode();
    else reabrir();
    return;
  }
  exigirDatosParaPartidas();
}
/* ----- Ningún control mudo -----
   Un `<input disabled>` no despacha `click` ni `pointerdown`: tocar la altura de una
   partida congelada no producía absolutamente nada, y un campo que se ve y no contesta es,
   palabra por palabra, «la app se rompió». El resto de la partida sí despacha —los chips
   apagados son `<div>` con aria-disabled, las etiquetas, los recuadros de opciones y el
   marco de la partida—, así que con un solo oyente en la lista se contesta casi toda la
   superficie que se puede tocar.

   Quedan fuera a propósito lo que sirve para LEER una cotización congelada: el ▾ de
   plegar, la cara plegada entera —que es el blanco grande, el ▾ es un botón de 30 px al
   lado, y las dos hacen lo mismo—, las fichas del resumen —donde el gesto es espiar un
   importe tapado— y el ojo del PDF. Sin la cara plegada, abrir una partida para leerla
   funcionaba Y sacaba un aviso rojo diciendo que había fallado, en el mismo toque. */
function _candTocarPartida(e){
  if(locked()||!faltanDatosCliente()) return;
  const t=e.target;
  if(t&&t.closest&&t.closest('.pfold,.pdf-vis,.psum,[href]')) return;
  exigirDatosParaPartidas({llevar:false});
}
function irAPendiente(){
  const p=siguientePaso();
  if(!p){ toast(Q.estado==='autorizada'?'Esta cotización ya está entregada':'No falta nada por capturar','ok',2400); return; }
  if(p.item) return llevarAPartida(p.item);
  if(p.boton){ irA(p.boton); return; }
  if(p.campo) return irACampoProy(p.campo);
  /* Los pasos 3 y 4 no tienen un campo al que llevar: lo que falta se hace en la columna del
     dinero, que es donde vive el panel. */
  irAResumen();
}
/* Llevar el foco a un campo de «Datos del proyecto», venga del aviso de arriba o del
   freno al mandar a autorización. Los datos pueden estar plegados: llevar ahí sin
   abrirlos dejaría al usuario mirando un encabezado cerrado. */
function irACampoProy(id){
  /* Antes que nada, la pantalla: enfocar un campo que está en la otra no enfoca nada, y el
     usuario se queda mirando la misma pantalla creyendo que el aviso no hizo caso. */
  if(_pantalla!=='cliente') irAPantalla('cliente',{subir:false});
  if(_foldProy){
    _foldProy=false; aplicarFoldProy();
    try{ localStorage.setItem('al3d_fold_proy','0'); }catch(_){}
  }
  irA('card-proy');
  const el=$(id);
  if(el&&!el.disabled) requestAnimationFrame(()=>{ try{ el.focus({preventScroll:true}); }catch(_){ el.focus(); } });
}

/* Campo de descripción "qué se cotiza", disponible en todas las partidas */
/* ----- Opciones de la partida: chip y grupo -----
   Un solo lugar donde se decide cómo se ve una opción elegida, para que material,
   complejidad, acabado, bastidor y caja se lean todos igual. */
function chip(on,click,label,extra,libre){
  /* `libre` es para los chips que no son de una partida —el plazo de taller— y que por eso no
     llevan ni el candado del precio autorizado ni el de los datos del cliente: no mueven el
     total y se pactan hasta el final, igual que los campos de _FM_PDF. */
  const dis=!libre&&capturaBloqueada();
  return `<div class="chip${on?' on':''}" role="button" aria-pressed="${on?'true':'false'}"`+
    (dis?' aria-disabled="true"':` tabindex="0" onclick="${click}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`)+
    `><span class="ck" aria-hidden="true"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg></span>${label}${extra?` <small>${extra}</small>`:''}</div>`;
}
/* Bloque de opciones con su valor elegido en el encabezado; si no hay nada elegido
   el bloque se marca en ámbar con "Sin elegir". */
/* El encabezado del grupo llevaba el valor elegido —«MATERIAL / ACABADO  ✓ Acero
   Inoxidable»— con el chip «Acero Inoxidable» resaltado dos renglones más abajo, en la
   misma caja. Era la misma palabra dos veces, tres veces por partida y multiplicado por
   cada renglón de la cotización: de las cosas que más saturaban la pantalla sin aportar un
   dato. Con la partida abierta el chip resaltado ES la respuesta; el encabezado se queda
   solo con el nombre del campo. Lo que sí sigue ahí es el «Sin elegir», que no se lee de
   ninguna otra parte —un grupo sin nada resaltado se confunde con uno que no miraste—, y
   la cara de la partida plegada sigue enseñando lo elegido, que es su trabajo. */
/* `catalogo` marca los grupos que son un CATÁLOGO —los cinco materiales, los tipos de caja—
   frente a los que son dos o tres opciones cortas —complejidad, iluminación, acabado—. Los
   primeros se pintan en rejilla, para que las cinco opciones midan lo mismo y sus tarifas
   caigan en columna y se comparen de un barrido; los segundos se quedan en fila, porque una
   rejilla de 180 px para «Recta · Cursiva · Compleja» son tres cajas medio vacías. Lo decide
   quien llama y no un `:has()` sobre la cuenta de chips: «esto es un catálogo» es una cosa que
   el código sabe, no algo que haya que adivinar del marcado. */
function grupo(titulo,valor,chipsHTML,extraHTML='',catalogo=false){
  const falta=!valor;
  return `<div class="optgrp${falta?' falta':''}">
      <div class="optgrp-h"><span class="optgrp-t">${titulo}</span>${falta?'<span class="optgrp-v falta">Sin elegir</span>':''}</div>
      <div class="chips${catalogo?' chips-catalogo':''}" role="group" aria-label="${esc(titulo.replace(/<[^>]*>/g,'').trim())}">${chipsHTML}</div>${extraHTML}
    </div>`;
}

/* ----- Resumen: qué está seleccionado en esta partida -----
   Devuelve fichas {txt, estado}: 'ok' elegido, 'falta' pendiente, 'off' desactivado
   a propósito (p. ej. sin iluminación).

   Es la fuente de tres cosas más, así que se trata como contrato cerrado: de las fichas
   'falta' salen `faltantesDe` —y con ella la fórmula, el aviso de partidas sin terminar
   y el freno de la autorización—. Una ficha por hueco, siempre; consolidar o recortar se
   hace después, al pintar la cara plegada, nunca aquí.

   Dos banderas opcionales, que solo lee esa cara:
   · `pesa`: la ficha apagada tiene consecuencia de precio y por eso vale enseñarla
     plegada. «Sin iluminación» son 20 pesos de cada cien; «Sin complejidad» es el valor
     por omisión de uno de los tres acabados y no mueve nada.
   · `dinero`: la ficha lleva un precio de ESTE trabajo —una tarifa teclateada a mano, un
     precio unitario—, no una tarifa del catálogo, así que se difumina y se espía como
     los demás importes mientras la cotización es borrador. */
function resumenPartida(it){
  const t=[], push=(txt,estado,extra)=>t.push(Object.assign({txt,estado},extra||{}));
  const ok=x=>push(x,'ok'), falta=x=>push(x,'falta'), off=x=>push(x,'off');
  const medidas=()=>{
    if(it.ancho>0&&it.alto>0){
      const m2=it.ancho*it.alto/10000;
      ok(`${it.ancho}×${it.alto} cm`);
      ok(m2EsMinimo(m2)?`${m2.toFixed(2)} m² · se cobra 1 m²`:`${m2.toFixed(2)} m²`);
    } else falta('Faltan medidas');
  };
  if(it.tipo==='letras'){
    /* El material heredado se marca: abierta, la partida lo dice con «↩ como la anterior»
       y con una nota, pero eso vive dentro del cuerpo y al plegar desaparecía, así que la
       ficha quedaba idéntica a un material elegido a mano. Es el campo que más pesa en el
       precio —de $30 a $55 el centímetro— y lo puso la app, no una persona. */
    const m=matOf(it.material); m?push((it.matAuto?'↩ ':'')+m.label,'ok'):falta('Falta material');
    const c=compOf(it.comp);    c?ok(c.label):falta('Falta complejidad');
    if(it.luz) ok((it.ilumTipo||'fria')==='calida'?'Luz cálida 3000K':'Luz fría 6500K');
    else push('Sin iluminación · −20%','off',{pesa:true});
    it.altura>0?ok(it.altura+' cm de altura'):falta('Falta altura');
    it.n>0?ok(it.n+(it.n===1?' letra':' letras')):falta('Faltan letras');
  }else if(it.tipo==='recorte'){
    const r=recOf(it.acab); r?ok(r.label):falta('Falta acabado');
    if(it.acab==='sandwich') it.recComp?ok('Con complejidad +$5'):off('Sin complejidad');
    it.altura>0?ok(it.altura+' cm de altura'):falta('Falta altura');
    it.n>0?ok(it.n+(it.n===1?' pieza':' piezas')):falta('Faltan piezas');
  }else if(it.tipo==='bastidor'){
    const b=basOf(it.bas); b?ok(b.label+' · $'+b.tarifa+'/m²'):falta('Falta material');
    medidas();
  }else if(it.tipo==='caja'){
    const c=CAJAS.find(x=>x.tarifa===it.tarifa);
    /* La tarifa del catálogo es catálogo; la personalizada la teclea quien cotiza para
       este trabajo, así que esa sí es un precio y se tapa como los demás. */
    it.tarifa>0?push((c?c.label:'Tarifa personalizada')+' · $'+it.tarifa+'/m²','ok',{dinero:!c}):falta('Falta tipo de caja');
    medidas();
  }else{
    it.pz>0?ok(it.pz+(it.pz===1?' pieza':' piezas')):falta('Faltan piezas');
    it.pu>0?push(money(it.pu)+' c/u','ok',{dinero:true}):falta('Falta precio unitario');
  }
  return t;
}
/* ----- La cara de la partida plegada -----
   Lo que se está cotizando en esa partida, y nada más. Plegada, esto es TODO lo que se
   ve de ella junto con el encabezado y el renglón del total, así que lo que sobra aquí
   sobra en la pantalla entera:

   · La descripción va primero. Es el único texto que no se deduce del catálogo, el que
     escribió una persona y el que viaja al PDF: entre dos partidas del mismo material y
     distinta altura, es lo que dice cuál es cuál. Vacía se avisa en gris y no en ámbar,
     porque no frena la autorización ni sale en el aviso de partidas sin terminar.
   · Los huecos se resumen en UNA ficha ámbar con su cuenta. Una partida recién creada
     tiene tres —material, altura, letras— y con una ficha por hueco la partida más vacía
     era la que más ruido hacía, diciendo lo mismo que la fórmula de abajo ya itemiza con
     sus propias palabras («Faltan: material, altura»). Va primera para que sea lo último
     que se recorte cuando no cabe.
   · De las fichas apagadas solo pasa la que mueve el precio (la bandera `pesa`).
   · «Oculta del PDF» se dice con palabras: plegada, la única señal era un 45% de opacidad
     y un borde gris, que se confunde con una partida sin capturar.

   Un solo constructor para el primer pintado y para el repintado ligero de `typeItem`:
   cuando eran dos mapas iguales, cualquier cosa que se agregara a uno desaparecía al
   primer teclazo, porque el otro reescribía el innerHTML sin ella. */
function caraPlegadaHTML(it){
  const fichas=resumenPartida(it);
  const huecos=fichas.filter(f=>f.estado==='falta').length;
  const desc=(it.desc||'').trim();
  const tok=(txt,cls)=>`<span class="ptok ${cls}">${esc(txt)}</span>`;
  return `<span class="pdsc${desc?'':' vacia'}">${desc?esc(desc):'Sin descripción'}</span>`
    +(huecos?tok(huecos===1?'Falta 1 dato':`Faltan ${huecos} datos`,'falta'):'')
    +fichas.filter(f=>f.estado==='ok'||(f.estado==='off'&&f.pesa))
           .map(f=>tok(f.txt,f.estado+(f.dinero?' dinero':''))).join('')
    +(it.showInPdf===false?tok('Oculta del PDF','off'):'');
}
/* Plegada, esta cara es la partida: pulsarla la vuelve a abrir. Ya no es un `role=button`
   —lo era, y en escritorio anunciaba «Abrir la partida 3» sobre una partida abierta y al
   pulsarlo no pasaba nada—. Como botón, además, volvía presentacionales a sus fichas: un
   lector de pantalla no podía leerlas una por una, solo la etiqueta entera de corrido.
   Ahora es texto que se puede leer y navegar, con el clic como atajo de ratón y de dedo;
   el control accesible es el ▾ del encabezado, que hace exactamente lo mismo. */
function resumenHTML(it){
  return `<div class="psum" id="psum-${it.id}" onclick="abrirDesdeResumen(${it.id},event)">${caraPlegadaHTML(it)}</div>`;
}
/* Salvo cuando el toque cae en una ficha con precio TAPADO: ahí el gesto es espiar el
   importe —se destapa mientras se mantiene tocado— y abrir la partida al soltar sería
   castigar justo el gesto que la app enseña. Si los precios están a la vista no hay nada
   que espiar y la ficha abre como el resto de la fila. */
function abrirDesdeResumen(id,ev){
  const t=ev&&ev.target;
  if(document.body.classList.contains('precios-ocultos')&&t&&t.closest&&t.closest('.ptok.dinero')) return;
  togglePartida(id,{soloAbrir:true});
}
function pintarResumen(it){
  const el=$('psum-'+it.id);
  if(!el) return;
  el.innerHTML=caraPlegadaHTML(it);
}
function faltantesDe(it){ return resumenPartida(it).filter(f=>f.estado==='falta').map(f=>f.txt.replace(/^Faltan? /,'').toLowerCase()); }

function descFld(it){
  const dis=capturaBloqueada()?'disabled':'';
  const tag=it.descAi?'<span class="ai-tag">'+ico('i-ia')+' IA</span>':'';
  return `<div class="fld"><label for="d-${it.id}">Descripción ${tag}</label><input id="d-${it.id}" value="${esc(it.desc)}" placeholder="Ej. Letrero de fachada «FARMACIA», acrílico blanco" ${dis} oninput="typeItem(${it.id},'desc',this.value)"></div>`;
}

function bodyFor(it){
  const dis=capturaBloqueada()?'disabled':'';
  if(it.tipo==='letras'){
    const matChips=MATERIALES.map(m=>chip(it.material===m.key,`setItem(${it.id},'material','${m.key}')`,m.label,'$'+m.precio)).join('');
    const compChips=COMPLEJIDAD.map(c=>chip(it.comp===c.key,`setItem(${it.id},'comp','${c.key}')`,c.label,c.extra?'+$'+c.extra:'+$0')).join('');
    const mat=matOf(it.material);
    /* Material heredado: el título lo dice y la nota explica de dónde salió. Se avisa
       porque es el campo que más pesa en el precio —de $30 a $55 por cm. */
    const heredado=!!(it.matAuto&&mat);
    const matTitulo='Material / acabado'+(heredado?' <span class="heredado">↩ como la anterior</span>':'');
    /* Los avisos de material se quedaron en uno solo, y corto. Antes eran hasta tres a la
       vez —de dónde salió el material heredado, la iluminación sugerida y el consejo del
       material— repetidos en CADA partida: multiplicado por seis renglones, el consejo tapaba
       la cotización. Lo que dice el «↩ como la anterior» del título no hace falta repetirlo
       abajo en un párrafo, y la iluminación sugerida decía con otras palabras lo mismo que el
       consejo del material que va debajo. */
    const avisos=`
      ${(it.material==='acr-vol'||it.material==='acr-vinil')&&!it.luz?`<div class="hintnote nota-av"><svg class="svgi" aria-hidden="true"><use href="#i-aviso"/></svg> Acrílico sin luz: el <b>Aluminio</b> se ve igual y cuesta menos.</div>`:''}
      ${(it.material==='al-paint'||it.material==='acero')&&it.luz?`<div class="hintnote nota-ok"><span class="emo">💡</span> Opaco: la luz sale por detrás. Para luz de frente, <b>Acrílico + Aluminio</b>.</div>`:''}`;
    const tono=(it.ilumTipo||'fria')==='calida';
    const luzChips=it.luz
      ? chip(tono,`setItem(${it.id},'ilumTipo','calida')`,'<span class="emo">🌅</span> Cálida','3000K')+chip(!tono,`setItem(${it.id},'ilumTipo','fria')`,'<span class="emo">❄️</span> Fría','6500K')
      : '';
    return `
      ${descFld(it)}
      ${grupo(matTitulo,mat?mat.label:'',matChips,avisos,true)}
      ${grupo('Iluminación',it.luz?(tono?'Cálida 3000K':'Fría 6500K'):'Sin iluminación · −20%',
        `<button type="button" class="switch" role="switch" data-foco="luz-${it.id}" aria-checked="${it.luz?'true':'false'}" style="margin:0 6px 0 0" ${capturaBloqueada()?'disabled':`onclick="setItem(${it.id},'luz',${!it.luz})"`}><span class="tg ${it.luz?'on':''}" aria-hidden="true"></span> Con iluminación</button>${luzChips}`)}
      ${grupo('Complejidad',compOf(it.comp)?compOf(it.comp).label:'',compChips)}
      <div class="grid3">
        <div class="fld">
          <label for="h-${it.id}">Altura (cm)</label>
          <input id="h-${it.id}" type="number" inputmode="decimal" min="0" step="0.5" value="${it.altura||''}" ${dis} oninput="typeItem(${it.id},'altura',+this.value)" onblur="saneaNum(this,${it.id},'altura',0.5)">
        </div>
        <div class="fld">
          <label for="n-${it.id}"># Letras</label>
          <input id="n-${it.id}" type="number" inputmode="numeric" min="0" value="${it.n||''}" ${dis} oninput="typeItem(${it.id},'n',+this.value)" onchange="this.value=Math.max(0,Math.round(+this.value||0))||'';typeItem(${it.id},'n',+this.value)">
        </div>
        <div class="fld fld-relleno"><label aria-hidden="true" style="visibility:hidden">.</label></div>
      </div>
      ${!locked()?`<div class="autoctr"><input type="text" aria-label="Escribe el texto y se cuentan las letras" placeholder="Escribe el texto →" value="${esc(it.textoAuto||'')}" ${dis} oninput="autoContarLetras(${it.id},this.value)"><span class="cnt" id="acnt-${it.id}">${it.n||0} letras</span></div>`:''}`;
  }
  if(it.tipo==='recorte'){
    const recChips=RECORTES.map(r=>chip(it.acab===r.key,`setItem(${it.id},'acab','${r.key}')`,r.label,'$'+r.precio)).join('');
    /* Los tres precios ya van en los chips; repetirlos en una lista era decir dos veces lo
       mismo dentro del mismo recuadro. Lo único que los chips no dicen es CÓMO se cobra. */
    const hint='<div class="hintnote">Por cm de altura × pieza</div>';
    const compRow = it.acab==='sandwich'
      ? grupo('Complejidad',it.recComp?'Con complejidad +$5/cm':'Sencilla',
          `<button type="button" class="switch" role="switch" data-foco="reccomp-${it.id}" aria-checked="${it.recComp?'true':'false'}" style="margin:0" ${capturaBloqueada()?'disabled':`onclick="setItem(${it.id},'recComp',${!it.recComp})"`}><span class="tg ${it.recComp?'on':''}" aria-hidden="true"></span> Con complejidad (+$5/cm)</button>`)
      : '';
    return `
      ${descFld(it)}
      ${grupo('Acabado del recorte',recOf(it.acab)?recOf(it.acab).label:'',recChips,hint)}
      ${compRow}
      <div class="grid3" style="margin-top:12px">
        <div class="fld">
          <label for="h-${it.id}">Altura (cm)</label>
          <input id="h-${it.id}" type="number" inputmode="decimal" min="0" step="0.5" value="${it.altura||''}" ${dis} oninput="typeItem(${it.id},'altura',+this.value)" onblur="saneaNum(this,${it.id},'altura',0.5)">
        </div>
        <div class="fld"><label for="n-${it.id}"># Piezas</label><input id="n-${it.id}" type="number" inputmode="numeric" min="0" value="${it.n||''}" ${dis} oninput="typeItem(${it.id},'n',+this.value)" onchange="this.value=Math.max(0,Math.round(+this.value||0))||'';typeItem(${it.id},'n',+this.value)"></div>
        <div class="fld fld-relleno"><label aria-hidden="true" style="visibility:hidden">.</label></div>
      </div>
      ${!locked()?`<div class="autoctr"><input type="text" aria-label="Escribe el texto y se cuentan las piezas" placeholder="Escribe el texto →" value="${esc(it.textoAuto||'')}" ${dis} oninput="autoContarLetras(${it.id},this.value)"><span class="cnt" id="acnt-${it.id}">${it.n||0} piezas</span></div>`:''}`;
  }
  if(it.tipo==='bastidor'){
    const chips=BASTIDORES.map(b=>chip(it.bas===b.key,`setItem(${it.id},'bas','${b.key}')`,b.label,'$'+b.tarifa+'/m²')).join('');
    const hint='<div class="hintnote">Por área (ancho × alto), mínimo 1 m²</div>';
    return `
      ${descFld(it)}
      ${grupo('Material del bastidor',basOf(it.bas)?basOf(it.bas).label:'',chips,hint,true)}
      <div class="grid2" style="margin-top:12px">
        <div class="fld"><label for="an-${it.id}">Ancho (cm)</label><input id="an-${it.id}" type="number" inputmode="decimal" min="0" step="0.5" value="${it.ancho||''}" ${dis} oninput="typeItem(${it.id},'ancho',+this.value)" onblur="saneaNum(this,${it.id},'ancho')"></div>
        <div class="fld"><label for="al-${it.id}">Alto (cm)</label><input id="al-${it.id}" type="number" inputmode="decimal" min="0" step="0.5" value="${it.alto||''}" ${dis} oninput="typeItem(${it.id},'alto',+this.value)" onblur="saneaNum(this,${it.id},'alto')"></div>
      </div>`;
  }
  if(it.tipo==='caja'){
    const chips=CAJAS.map(c=>chip(it.tarifa===c.tarifa,`setItem(${it.id},'tarifa',${c.tarifa})`,c.label,'$'+c.tarifa+'/m²')).join('');
    const hint='<div class="hintnote">Mínimo 1 m²</div>';
    const cajaSel=CAJAS.find(c=>c.tarifa===it.tarifa);
    return `
      ${descFld(it)}
      ${grupo('Tipo de caja',cajaSel?cajaSel.label:(it.tarifa>0?'Tarifa personalizada · $'+it.tarifa+'/m²':''),chips,hint,true)}
      <div class="grid3" style="margin-top:12px">
        <div class="fld"><label for="an-${it.id}">Ancho (cm)</label><input id="an-${it.id}" type="number" inputmode="decimal" min="0" step="0.5" value="${it.ancho||''}" ${dis} oninput="typeItem(${it.id},'ancho',+this.value)" onblur="saneaNum(this,${it.id},'ancho')"></div>
        <div class="fld"><label for="al-${it.id}">Alto (cm)</label><input id="al-${it.id}" type="number" inputmode="decimal" min="0" step="0.5" value="${it.alto||''}" ${dis} oninput="typeItem(${it.id},'alto',+this.value)" onblur="saneaNum(this,${it.id},'alto')"></div>
        <div class="fld"><label for="ta-${it.id}">Tarifa ($/m²)</label><div class="inp-money"><input id="ta-${it.id}" type="number" inputmode="decimal" min="0" step="1" value="${it.tarifa||''}" ${dis} oninput="typeItem(${it.id},'tarifa',+this.value)" onblur="saneaNum(this,${it.id},'tarifa')"></div></div>
      </div>`;
  }
  // manual
  return `
    <div class="fld"><label for="d-${it.id}">Descripción ${it.descAi?'<span class="ai-tag">'+ico('i-ia')+' IA</span>':''}</label><input id="d-${it.id}" value="${esc(it.desc)}" placeholder="Ej. Rotulación vehicular, instalación, viáticos…" ${dis} oninput="typeItem(${it.id},'desc',this.value)"></div>
    <div class="grid2">
      <div class="fld"><label for="pz-${it.id}">Piezas</label><input id="pz-${it.id}" type="number" inputmode="numeric" min="1" value="${it.pz||''}" ${dis} oninput="typeItem(${it.id},'pz',+this.value)" onchange="this.value=Math.max(1,Math.round(+this.value||0))||'';typeItem(${it.id},'pz',+this.value)"></div>
      <div class="fld"><label for="pu-${it.id}">Precio unitario</label><div class="inp-money"><input id="pu-${it.id}" type="number" inputmode="decimal" min="0" step="1" value="${it.pu||''}" ${dis} oninput="typeItem(${it.id},'pu',+this.value)" onblur="saneaNum(this,${it.id},'pu')"></div></div>
    </div>`;
}

function formulaM2(tarifa,it){
  const m2=((it.ancho||0)*(it.alto||0)/10000);
  if(m2EsMinimo(m2)) return `$${tarifa}/m² · mínimo 1 m² (área real ${m2.toFixed(3)} m²)`;
  return `$${tarifa}/m² × ${m2.toFixed(3)} m²`;
}
/* La fórmula con las cifras de dinero envueltas, para poder taparlas sin tapar las
   medidas. Se escapa antes de envolver: la fórmula sale de catálogos y de números, pero
   el precio unitario de una partida manual lo escribe una persona. */
function formulaHTML(it){
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(formulaFor(it)).replace(/\$[\d.,]+/g,m=>`<span class="dinero">${m}</span>`);
}
function formulaFor(it){
  // Con datos incompletos la fórmula era "$0 ($0) × 0cm × 0": mejor decir qué falta.
  const faltan=faltantesDe(it);
  if(faltan.length) return (faltan.length>1?'Faltan: ':'Falta: ')+faltan.join(', ');
  if(it.tipo==='letras'){
    const f=factorOf(it), base=matOf(it.material)?.precio||0, ex=compOf(it.comp)?.extra||0;
    const adj=(!it.luz)?' · −20% sin luz':'';
    return `$${f} ($${base}${ex?` + $${ex}`:''}) × ${it.altura||0}cm × ${it.n||0}${adj}`;
  }
  if(it.tipo==='recorte'){
    const p=recOf(it.acab)?.precio||0;
    const ex=(it.acab==='sandwich'&&it.recComp)?RECORTE_COMP_EXTRA:0;
    return `$${p+ex}/cm${ex?` ($${p} + $${ex})`:''} × ${it.altura||0}cm × ${it.n||0} pza`;
  }
  if(it.tipo==='bastidor') return formulaM2(basOf(it.bas)?.tarifa||0,it);
  if(it.tipo==='caja')     return formulaM2(it.tarifa||0,it);
  return `${it.pz||0} pza × ${money(it.pu)}`;
}

/* ===================== Vista previa del archivo analizado por IA ===================== */
function renderAiPreview(){
  const el=$('aiPreview'); if(!el)return;
  if(!Q.aiFile){ el.innerHTML=''; return; }
  const f=Q.aiFile;
  const isImg=f.type && f.type.indexOf('image/')===0;
  const big=isImg
    ? `<img class="ai-prev-img" src="${urlImagenSegura(f.url)}" alt="Archivo analizado" ${_ABRIBLE} onclick="openAiFile()">`
    : `<div class="ai-prev-pdf" ${_ABRIBLE} onclick="openAiFile()"><svg class="svgi" aria-hidden="true"><use href="#i-doc"/></svg> Ver PDF analizado a pantalla completa<br><span style="font-weight:500;font-size:11px">${esc(f.name||'archivo')}</span></div>`;
  el.innerHTML=`<div class="ai-prev-big">
    <div class="ai-prev-head">
      <span class="ttl"><svg class="svgi" aria-hidden="true"><use href="#i-ia"/></svg> Archivo analizado por IA · revisa que ningún elemento haya quedado fuera antes de autorizar</span>
      <button class="x" onclick="clearAiFile()" title="Quitar la imagen de esta pantalla" aria-label="Quitar la imagen de esta pantalla">×</button>
    </div>
    ${big}
    <div class="sub">${esc(f.name||'archivo')} ${isImg?'· clic en la imagen para verla a pantalla completa':''}</div>
  </div>`;
}
function openAiFile(){
  if(!Q.aiFile||!Q.aiFile.url)return;
  const isImg=Q.aiFile.type && Q.aiFile.type.indexOf('image/')===0;
  const safeName=esc(Q.aiFile.name||'Archivo');
  $('lightboxBody').innerHTML=isImg
    ? `<img class="lightbox-img" src="${urlImagenSegura(Q.aiFile.url)}" alt="${safeName}" onclick="event.stopPropagation()">`
    : `<iframe class="lightbox-iframe" src="${urlPdfSegura(Q.aiFile.url)}" onclick="event.stopPropagation()"></iframe>`;
  $('lightbox').classList.add('show');
}
function closeLightbox(){ $('lightbox').classList.remove('show'); $('lightboxBody').innerHTML=''; }
/* En un borrador esta es la ÚNICA copia de la imagen —la del historial nace al autorizar—, y
   el ✕ está a un dedo de la miniatura, con el archivo original quizá ya fuera del teléfono.
   Así que sale con Deshacer, igual que borrar una partida. */
function clearAiFile(){
  const previa=Q.aiFile;
  Q.aiFile=null; saveState(); renderAiPreview();
  if(!previa) return;
  toast('Imagen quitada de la pantalla','',5600,{label:'Deshacer',fn:()=>{
    Q.aiFile=previa; saveState(); renderAiPreview();
  }});
}

/* ===================== Auth por partida ===================== */
function shortDescAuth(it){
  if(it.desc) return it.desc;
  if(it.tipo==='letras')    return 'Letras 3D · '+( it.n||0)+' letras, '+(it.altura||0)+'cm';
  if(it.tipo==='recorte')   return 'Recorte acrílico · '+(it.n||0)+' pzas, '+(it.altura||0)+'cm';
  if(it.tipo==='bastidor')  return 'Bastidor · '+(it.ancho||0)+'×'+(it.alto||0)+'cm';
  if(it.tipo==='caja')      return 'Caja de luz · '+(it.ancho||0)+'×'+(it.alto||0)+'cm';
  return 'Manual · '+(it.pz||1)+' pza';
}
function toggleItemAuth(id){
  const body=$('ia-body-'+id),arrow=$('ia-arrow-'+id);
  if(!body) return;
  const open=body.style.display!=='none';
  body.style.display=open?'none':'';
  /* Se apunta, para que el siguiente repintado del formulario lo devuelva abierto. */
  if(open) _authAbiertas.delete(id); else _authAbiertas.add(id);
  if(arrow) arrow.textContent=open?'▸':'▾';
  /* El estado lo carga aria-expanded, no el ▸/▾, que va aria-hidden. */
  const hdr=arrow&&arrow.closest('.ia-hdr');
  if(hdr) hdr.setAttribute('aria-expanded',open?'false':'true');
}
function updItemAuth(id,val){
  if(!Q.itemsAuth) Q.itemsAuth={};
  Q.itemsAuth[id]=val;
  const neto=totals().neto;
  const it=Q.items.find(x=>x.id===id);
  const orig=it?lineTotal(it):0;
  const adjEl=$('ia-adj-'+id);
  if(adjEl){
    const diff=val-orig;
    if(Math.abs(diff)<0.01){adjEl.textContent='';adjEl.className='ia-adj';}
    else if(diff<0){adjEl.textContent='Descuento: '+money(-diff);adjEl.className='ia-adj';}
    else{adjEl.textContent='Aumento: '+money(diff);adjEl.className='ia-adj inc';}
  }
  // Los ajustes por partida van sin IVA; el precio final que se autoriza lo lleva.
  const sub=Q.items.reduce((s,x)=>{const v=Q.itemsAuth[x.id];return s+(v!==undefined?v:lineTotal(x));},0);
  // Mismo criterio que el formulario: no se redondea, para no inventar un ajuste.
  const netoAj=+(Q.iva?sub*1.16:sub).toFixed(2);
  const sumEl=$('ia-sum'); if(sumEl) sumEl.textContent=money(sub);
  const sumNetoEl=$('ia-sum-neto'); if(sumNetoEl) sumNetoEl.textContent=money(Q.iva?sub*1.16:sub);
  const gInput=$('a-precio'); if(gInput) gInput.value=netoAj;
  // Se respeta el ajuste sea hacia abajo o hacia arriba: antes un aumento se veía
  // en pantalla pero se perdía al autorizar.
  Q.precioAuth=Math.abs(netoAj-neto)>0.01?netoAj:0;
  sellarAuth();
  updPrecioAuth(netoAj,neto);
  saveState();
  /* El avance de la revisión vuelve a la cola. Antes updItemAuth solo llamaba a
     saveState(), así que el snapshot de la cola seguía con itemsAuth vacío: bastaba con
     tocar otra cotización pendiente y volver para que los ajustes desaparecieran sin
     aviso, porque loadQueueEntry pisa Q con ese snapshot. */
  if(Q.estado==='pendiente'&&typeof updateQueueEntry==='function'){
    updateQueueEntry(Q.folio,{precioAuth:Q.precioAuth,itemsAuth:Q.itemsAuth,huellaAuth:Q.huellaAuth,
      q:JSON.parse(JSON.stringify({...Q,aiFile:null,editMode:false}))});
  }
}

