/* LA SEGUNDA AUDITORÍA PESADA: LO QUE SOLO SE ROMPE CON CLICS.

   Septiembre de 2026, segunda pasada, con el cotizador sometido a escenarios que la primera no
   ejercitó: el almacenamiento lleno en el peor momento, el rol de autorizador y su cola, el
   escalador pasando su imagen a la IA, la red de la IA simulada, y el historial buscado como se
   busca de verdad. Lo que salió, y lo que aquí se fija para que no vuelva:

   · Autorizar con el almacenamiento LLENO hacía lo irreversible y fallaba en las tres escrituras
     que lo conservan. La app decía «borra cotizaciones viejas», y quien obedecía volvía a una
     autorizada que seguía sin estar en el historial, con la marca «sin guardar» puesta para
     siempre —aunque ya se guardara— y un folio que el contador no había contado.
   · «Cotizar esta medida con IA» desde el escalador abría el modal de IA y el history.back()
     asíncrono de cerrar el escalador lo cerraba cinco milisegundos después. En el teléfono:
     un parpadeo y nada.
   · El autorizador, al apretar Autorizar, se quedaba mirando «Sin cotizaciones pendientes»: ni
     el folio, ni el precio que quedó, ni cómo llegar al PDF.
   · Los términos del PDF prometen «válida por 10 días» desde siempre, y nadie contaba los días:
     ahora la fecha va en el encabezado, en los términos, en el WhatsApp, en la nota de
     «Autorizada» y en el historial, que dice cuáles ya vencieron.
   · La IA que respondía con la segunda key tras un 429 se leía como un análisis normal, y un
     número absurdo del modelo —1e12 de precio unitario— entraba a la cotización tal cual.
   · Buscar «3312345678» en el historial no encontraba la cotización guardada como «33 1234 5678».

   Necesita navegador y un servidor:  pruebas/correr.sh --navegador
   o a mano:  npx http-server -p 8814 &  PUERTO=8814 node pruebas/navegador/auditoria-pesada.mjs */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({viewport:{width:1440,height:1000}, locale:'es-MX', timezoneId:'America/Mexico_City'});
const p = await ctx.newPage();
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));
let dialogs=[]; p.on('dialog', async d=>{ dialogs.push(d.message()); await d.accept(); });

async function enBlanco(){
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.evaluate(()=>{ try{ localStorage.clear(); sessionStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(900);
}
async function conCliente(cli='Farmacia San Juan',proy='Letrero de fachada'){
  await enBlanco();
  await p.fill('#f-cli',cli); await p.fill('#f-tel','33 1234 5678'); await p.fill('#f-proy',proy);
  await p.waitForTimeout(300);
  await p.evaluate(()=>irAPantalla('partidas'));
  await p.waitForTimeout(400);
}
async function dosPartidas(){
  await p.click('.chip:has-text("Acero Inoxidable")');
  await p.fill('#h-1','40'); await p.fill('#n-1','8');
  await p.evaluate(()=>{ const it=addItem({}); setTipo(it.id,'manual'); });
  await p.fill('#d-2','Instalación'); await p.fill('#pz-2','2'); await p.fill('#pu-2','500');
  await p.waitForTimeout(300);
}
async function autorizarYo(nombre='Elías'){
  await p.evaluate(()=>autorizarYoMismo()); await p.waitForTimeout(400);
  await p.fill('#a-name',nombre); await p.evaluate(()=>autorizar()); await p.waitForTimeout(600);
}
const $t=sel=>p.$eval(sel,e=>e.textContent).catch(()=>'');
const toast=()=>p.evaluate(()=>document.getElementById('toast')?.textContent||'');
const money=n=>'$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
/* El almacenamiento «lleno»: setItem lanza como lo hace el navegador cuando no cabe. */
const llenar=()=>p.evaluate(()=>{ window.__set=Storage.prototype.setItem; Storage.prototype.setItem=function(){ throw new DOMException('quota','QuotaExceededError'); }; });
const liberar=()=>p.evaluate(()=>{ if(window.__set) Storage.prototype.setItem=window.__set; });
const PLANO=`(()=>{ const c=document.createElement('canvas'); c.width=1200; c.height=800; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,1200,800); x.fillStyle='#000'; x.fillRect(100,100,400,200); return c.toDataURL('image/png'); })()`;
/* Hoy + 10, escrito como lo escribe la app, con el mismo motor —el del navegador— para no
   depender de cómo abrevie node el mes. */
const hasta10=()=>p.evaluate(()=>{ const d=new Date(); d.setDate(d.getDate()+10); return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); });
const hace=n=>p.evaluate(n=>{ const d=new Date(); d.setDate(d.getDate()-n); return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); },n);

// ── 1. El almacenamiento lleno que vuelve a caber ────────────────────────────
console.log('\nAUTORIZAR CON EL ALMACENAMIENTO LLENO, Y QUE VUELVA A CABER');
await conCliente(); await dosPartidas();
await llenar();
await p.evaluate(()=>{ _plegadas.clear(); renderItems(); }); await p.fill('#h-1','42'); await p.waitForTimeout(300);
let s=await p.evaluate(()=>({saveOk:_saveOk,folio:document.getElementById('folio').textContent,nosave:document.getElementById('folio').classList.contains('nosave')}));
s.nosave&&/sin guardar/.test(s.folio) ? bien('con el almacenamiento lleno el folio se marca «sin guardar»') : mal('no se marcó «sin guardar»: '+JSON.stringify(s));
await autorizarYo();
s=await p.evaluate(()=>({estado:Q.estado,hist:getHistorial().length,contador:localStorage.getItem('al3d_folio'),toast:document.getElementById('toast').textContent}));
s.estado==='autorizada'&&s.hist===0&&s.contador===null ? bien('autorizó, y ni el historial ni el contador de folios pudieron escribirse (toast: «'+s.toast.slice(0,60)+'…»)') : mal('estado tras autorizar lleno: '+JSON.stringify(s));
await liberar();
/* El siguiente guardado cualquiera —aquí, uno directo— es el que recupera. */
await p.evaluate(()=>{ saveState(); }); await p.waitForTimeout(300);
s=await p.evaluate(()=>({saveOk:_saveOk,folioTxt:document.getElementById('folio').textContent,nosave:document.getElementById('folio').classList.contains('nosave'),hist:getHistorial().map(h=>h.folio),contador:localStorage.getItem('al3d_folio'),queue:getQueue().length,toast:document.getElementById('toast').textContent}));
!s.nosave&&!/sin guardar/.test(s.folioTxt) ? bien('al volver a caber, la marca «sin guardar» se quita') : mal('la marca «sin guardar» se quedó puesta: '+s.folioTxt);
s.hist.length===1&&s.hist[0]==='COT-0001' ? bien('la autorizada que no cupo quedó guardada en el historial') : mal('historial tras liberar: '+JSON.stringify(s.hist));
s.contador==='1' ? bien('y su folio se confirmó en el contador') : mal('contador de folios: '+s.contador);
/Volvió a haber espacio/.test(s.toast) ? bien('se dice: «'+s.toast.replace(/Respaldar$/,'')+'»') : mal('no se avisó de la recuperación: '+s.toast);
await p.evaluate(()=>{ saveState(); }); await p.waitForTimeout(200);
s=await p.evaluate(()=>getHistorial().length);
s===1 ? bien('un segundo guardado no la duplica') : mal('historial duplicado: '+s);
/* La misma recuperación por el camino que el aviso manda: borrar una cotización vieja. */
await conCliente('Otro','Dos'); await dosPartidas();
await p.evaluate(()=>{ const h=getHistorial(); h.push({folio:'COT-0900',cliente:'Vieja',items:[],itemsAuth:{},neto:1,sub:1,precioAuth:0,ts:1}); localStorage.setItem('al3d_historial',JSON.stringify(h)); invalidarCuadernos(); });
await llenar(); await autorizarYo(); await liberar();
dialogs=[]; await p.evaluate(()=>{ abrirHistorial(); borrarDeHistorial('COT-0900'); }); await p.waitForTimeout(300);
s=await p.evaluate(()=>({hist:getHistorial().map(h=>h.folio),folio:Q.folio,saveOk:_saveOk}));
s.hist.length===1&&s.hist[0]===s.folio ? bien('borrar del historial con el guardado caído también recupera la autorizada de la pantalla') : mal('tras borrar: '+JSON.stringify(s));
await p.evaluate(()=>cerrarHistorial());
/* Y la pendiente que no llegó a la cola. */
await conCliente('Tres','Tres'); await dosPartidas();
await llenar(); await p.evaluate(()=>solicitar()); await p.waitForTimeout(300);
s=await p.evaluate(()=>({estado:Q.estado,cola:getQueue().length}));
s.estado==='pendiente'&&s.cola===0 ? bien('solicitar con el almacenamiento lleno deja la pendiente fuera de la cola') : mal('pendiente lleno: '+JSON.stringify(s));
await liberar(); await p.evaluate(()=>saveState()); await p.waitForTimeout(200);
s=await p.evaluate(()=>({cola:getQueue().map(e=>e.folio+':'+e.estado+':'+!!e.q),toast:document.getElementById('toast').textContent}));
s.cola.length===1&&/pendiente:true$/.test(s.cola[0]) ? bien('al volver a caber, la solicitud entra a la cola con su copia') : mal('cola tras liberar: '+JSON.stringify(s));

// ── 2. Del escalador a la IA sin que el modal se cierre solo ─────────────────
console.log('\nDEL ESCALADOR AL MODAL DE IA, Y QUE SE QUEDE ABIERTO');
await conCliente('Plaza','Directorio');
await p.evaluate(()=>abrirScaler()); await p.waitForTimeout(300);
await p.evaluate(`new Promise(r=>scLoadImgSrc(${PLANO},'plano.png',()=>r()))`);
await p.evaluate(()=>{ SC.mode='ref'; scCommitLine({x:100/1200*SC.cvsW,y:150/800*SC.cvsH},{x:500/1200*SC.cvsW,y:150/800*SC.cvsH}); document.getElementById('sc-ref-cm-input').value='200'; scConfirmCalib(); SC.mMode='h'; scCommitLine({x:100/1200*SC.cvsW,y:300/800*SC.cvsH},{x:500/1200*SC.cvsW,y:300/800*SC.cvsH}); });
await p.waitForTimeout(200);
s=await p.evaluate(()=>({sc:SC.hist,state:JSON.stringify(history.state)}));
await p.click('#scalermodal [onclick*="scCotizarConIA"]'); await p.waitForTimeout(1200);
s=await p.evaluate(()=>({ai:document.getElementById('aimodal').classList.contains('show'),sc:document.getElementById('scalermodal').classList.contains('show'),src:!!(aiSrc&&aiSrc.origen==='escalador'),state:JSON.stringify(history.state),hist:document.getElementById('aimodal').dataset.hist}));
s.ai&&!s.sc&&s.src ? bien('un segundo después el modal de IA sigue abierto, con la imagen medida, y el escalador cerrado') : mal('escalador→IA: '+JSON.stringify(s));
/capa":"aimodal/.test(s.state)&&s.hist==='1' ? bien('la entrada de historial del escalador ahora es del modal de IA') : mal('la entrada no se cedió: '+JSON.stringify(s));
await p.evaluate(()=>aiClose()); await p.waitForTimeout(700);
s=await p.evaluate(()=>({ai:document.getElementById('aimodal').classList.contains('show'),state:JSON.stringify(history.state),pantalla:_pantalla}));
!s.ai&&/"cot":1/.test(s.state)&&s.pantalla==='partidas' ? bien('cerrarlo con la × consume esa única entrada y deja la pantalla de partidas') : mal('tras cerrar la IA: '+JSON.stringify(s));
/* El «atrás» del teléfono, con el modal de IA abierto por este camino, lo cierra y nada más. */
await p.evaluate(()=>abrirScaler()); await p.waitForTimeout(200); await p.evaluate(()=>scCotizarConIA()); await p.waitForTimeout(500);
await p.evaluate(()=>history.back()); await p.waitForTimeout(700);
s=await p.evaluate(()=>({ai:document.getElementById('aimodal').classList.contains('show'),sc:document.getElementById('scalermodal').classList.contains('show'),pantalla:_pantalla,url:location.pathname}));
!s.ai&&!s.sc&&s.pantalla==='partidas'&&/cotizador\.html$/.test(s.url) ? bien('el atrás del navegador cierra el modal de IA y se queda en la cotización') : mal('atrás con IA abierta desde el escalador: '+JSON.stringify(s));

// ── 3. La vigencia, en todo lo que sale de la cotización ─────────────────────
console.log('\nLA COTIZACIÓN DICE HASTA CUÁNDO VALE');
await conCliente(); await dosPartidas(); await autorizarYo();
const h10=await hasta10();
await p.evaluate(()=>{ window.__pdfs=[]; window.open=(u)=>{ window.__pdfs.push(u); return {focus(){}}; }; });
await p.evaluate(()=>generarPDF()); await p.waitForTimeout(500);
let pdf=await p.evaluate(async()=>{ const u=window.__pdfs.at(-1); return u?await (await fetch(u)).text():''; });
pdf.includes('Válida hasta el '+h10) ? bien('el encabezado del PDF dice «Válida hasta el '+h10+'»') : mal('el encabezado del PDF no trae la vigencia');
pdf.includes('válida por 10 días — hasta el '+h10) ? bien('y los términos, además del plazo, dicen la fecha') : mal('los términos no traen la fecha: '+(pdf.match(/.{30}válida por.{60}/)||[''])[0]);
(pdf.match(/Válida hasta el/g)||[]).length===1 ? bien('solo en la hoja de cotización: la orden de trabajo y la de instalación no vencen') : mal('«Válida hasta el» aparece '+(pdf.match(/Válida hasta el/g)||[]).length+' veces');
let wa=await p.evaluate(()=>mensajeWhatsApp());
wa.includes('Precio válido hasta el '+h10) ? bien('el WhatsApp dice «Precio válido hasta el '+h10+'»') : mal('el WhatsApp no trae la vigencia:\n'+wa);
let nota=await $t('#authbox');
new RegExp('Vigente hasta el '+h10.replace('.','\\.')+' · faltan 10 días').test(nota) ? bien('la nota de «Autorizada» dice «Vigente hasta el … · faltan 10 días»') : mal('la nota de autorizada: '+nota.slice(0,200));
await p.evaluate(()=>abrirHistorial()); await p.waitForTimeout(300);
let vig=await $t('.hentry-vig');
/faltan 10 días/.test(vig) ? bien('el historial también: «'+vig.trim()+'»') : mal('el historial no dice la vigencia: «'+vig+'»');
await p.evaluate(()=>cerrarHistorial());
/* La misma cotización, fechada hace 15 días: venció hace 5. */
const f15=await hace(15);
await p.evaluate(f=>{ Q.fecha=f; const h=getHistorial(); h[0].fecha=f; localStorage.setItem('al3d_historial',JSON.stringify(h)); saveState(); renderAuth(); },f15);
nota=await $t('#authbox');
/Venció el .+ · hace 5 días — si el cliente la retoma, revisa el precio/.test(nota) ? bien('vencida, la nota lo dice en ámbar y pide revisar el precio antes de reimprimir') : mal('nota vencida: '+nota.slice(0,260));
await p.evaluate(()=>abrirHistorial()); await p.waitForTimeout(300);
s=await p.evaluate(()=>({txt:document.querySelector('.hentry-vig')?.textContent,venc:document.querySelector('.hentry-vig')?.classList.contains('venc')}));
/Venció el .+ · hace 5 días/.test(s.txt||'')&&s.venc ? bien('en el historial sale «'+s.txt+'», marcada como vencida') : mal('historial vencida: '+JSON.stringify(s));
await p.fill('#hist-search','venció'); await p.waitForTimeout(250);
s=await p.evaluate(()=>document.querySelectorAll('.hentry').length);
s===1 ? bien('y teclear «venció» en el buscador la encuentra') : mal('buscar «venció» da '+s);
await p.fill('#hist-search',''); await p.evaluate(()=>cerrarHistorial());
/* Con la venta registrada, ya no vence. */
await p.evaluate(()=>{ marcarHito('venta'); renderAuth(); }); await p.waitForTimeout(200);
nota=await $t('#authbox');
!/Venció|Vigente/.test(nota) ? bien('con la venta registrada la nota deja de hablar de vigencia') : mal('con venta sigue diciendo vigencia: '+nota.slice(0,200));
await p.evaluate(()=>abrirHistorial()); await p.waitForTimeout(300);
s=await p.evaluate(()=>document.querySelectorAll('.hentry-vig').length);
s===0 ? bien('y el historial tampoco') : mal('el historial sigue marcando vigencia con venta: '+s);
await p.evaluate(()=>cerrarHistorial());
/* Una fecha que no se puede leer no inventa nada. */
await p.evaluate(()=>{ Q.fecha='2026-09-16'; renderAuth(); });
nota=await $t('#authbox'); wa=await p.evaluate(()=>mensajeWhatsApp());
!/Vigente|Venció|Vence/.test(nota)&&!/válido hasta/.test(wa) ? bien('con una fecha ilegible se calla, en la nota y en el WhatsApp') : mal('fecha ilegible: '+nota.slice(0,120)+' | '+wa);

// ── 4. El autorizador ve lo que acaba de hacer ───────────────────────────────
console.log('\nEL AUTORIZADOR VE LO QUE ACABA DE HACER');
await conCliente(); await dosPartidas();
await p.evaluate(()=>solicitar()); await p.waitForTimeout(300);
await p.evaluate(()=>cambiarRol('autorizador')); await p.waitForTimeout(300);
await p.fill('#a-precio','17000'); await p.fill('#a-name','Jefe'); await p.evaluate(()=>autorizar()); await p.waitForTimeout(600);
nota=await $t('#authbox'); const pf=await p.evaluate(()=>precioFinal());
/COT-0001/.test(nota)&&/quedó autorizada/.test(nota)&&/por Jefe/.test(nota)&&nota.includes(money(pf)) ? bien('tras autorizar dice: folio, «quedó autorizada por Jefe» y el precio '+money(pf)) : mal('vista del autorizador tras autorizar: '+nota.slice(0,300));
/vigente hasta el/.test(nota) ? bien('con la vigencia') : mal('sin vigencia: '+nota.slice(0,300));
const btn=await p.$('#authbox button:has-text("Ver como vendedor")');
btn ? bien('y ofrece «Ver como vendedor»') : mal('no hay botón «Ver como vendedor»');
if(btn){ await btn.click(); await p.waitForTimeout(400); s=await p.evaluate(()=>({rol:Q.rol,pdf:!!document.querySelector('#authbox button[onclick*="generarPDF"]')})); s.rol==='vendedor'&&s.pdf ? bien('que cambia el rol y enseña el PDF y el WhatsApp') : mal('tras «Ver como vendedor»: '+JSON.stringify(s)); }
await conCliente('Toño','Anuncio'); await dosPartidas();
await p.evaluate(()=>solicitar()); await p.waitForTimeout(300);
await p.evaluate(()=>cambiarRol('autorizador')); await p.waitForTimeout(300);
await p.fill('#a-name','Jefe'); await p.fill('#a-note','Sube el acero'); await p.evaluate(()=>rechazar()); await p.waitForTimeout(400);
nota=await $t('#authbox');
/quedó rechazada — «Sube el acero»/.test(nota) ? bien('tras rechazar dice «quedó rechazada — «Sube el acero»»') : mal('vista tras rechazar: '+nota.slice(0,300));
await p.evaluate(()=>cambiarRol('vendedor'));

// ── 5. La IA: la key que respondió, los números absurdos, el candado dicho al abrir ──
console.log('\nLA IA DICE QUÉ KEY RESPONDIÓ Y NO SE TRAGA NÚMEROS ABSURDOS');
await conCliente('Cliente IA','Proyecto IA');
await p.evaluate(()=>{
  window.__plan=[{status:429,body:{error:{message:'quota',code:429}}}];
  window.fetch=async(url,opts)=>{ const paso=window.__plan.shift();
    if(paso) return new Response(JSON.stringify(paso.body),{status:paso.status,headers:{'Content-Type':'application/json'}});
    const resp={cliente:'Taquería El Güero',partidas:[{tipo:'letras',material:'acero',altura_cm:40,n_letras:8},{tipo:'manual',piezas:1,precio_unitario:1e12,descripcion:'Absurdo'},{tipo:'letras',material:'acero',altura_cm:1e8,n_letras:3}]};
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(resp)}]},finishReason:'STOP'}]}),{status:200,headers:{'Content-Type':'application/json'}}); };
  setKeys('gemini',['AIzaKEY1xxxxxxxx','AIzaKEY2xxxxxxxx']); aiOpen();
});
await p.evaluate(`(async()=>{ const c=document.createElement('canvas'); c.width=400; c.height=300; const b=await new Promise(r=>c.toBlob(r,'image/png')); aiArchivoElegido(new File([b],'p.png',{type:'image/png'}),'elegido'); })()`);
await p.evaluate(()=>aiAnalyze()); await p.waitForFunction(()=>!aiTrabajando,{timeout:20000}); await p.waitForTimeout(200);
s=await p.evaluate(()=>({status:document.getElementById('ai-status').textContent,toast:document.getElementById('toast').textContent,items:Q.items.map(it=>({tipo:it.tipo,h:it.altura,pu:it.pu,desc:it.desc})),neto:totals().neto}));
/key 1 de Gemini no respondió · borrador generado con la key 2/.test(s.status) ? bien('el estado dice «La key 1 de Gemini no respondió · borrador generado con la key 2»') : mal('estado tras 429→key2: '+s.status);
/key 1 de Gemini no respondió · lo resolvió la key 2/.test(s.toast) ? bien('y el aviso también nombra las dos keys') : mal('toast: '+s.toast);
const abs=s.items.find(it=>it.desc==='Absurdo');
abs&&abs.pu===0 ? bien('un precio unitario de 1e12 entra en $0, no en un billón') : mal('precio absurdo: '+JSON.stringify(abs));
s.items.filter(it=>it.tipo==='letras').every(it=>it.h<1e7) ? bien('una altura de 1e8 cm entra en 0') : mal('altura absurda entró: '+JSON.stringify(s.items));
s.neto<1e7 ? bien('el total sigue siendo un número de este negocio ('+money(s.neto)+')') : mal('total absurdo: '+s.neto);
await p.waitForTimeout(1600);
await p.evaluate(()=>{ Q.items.forEach(it=>{ if(!it.altura&&it.tipo==='letras') { it.altura=30; it.n=3; } if(it.tipo==='manual'&&!it.pu) it.pu=100; }); renderItems(); });
await autorizarYo();
const faltModal=await p.evaluate(()=>document.getElementById('faltmodal').classList.contains('show')); if(faltModal){ await p.evaluate(()=>faltSeguir()); await p.waitForTimeout(500); }
await p.evaluate(()=>aiOpen()); await p.waitForTimeout(200);
s=await p.evaluate(()=>({estado:Q.estado,status:document.getElementById('ai-status').textContent}));
s.estado==='autorizada'&&/está autorizada/.test(s.status) ? bien('sobre una autorizada el modal de IA lo dice al abrir, no después de elegir el archivo') : mal('aiOpen en autorizada: '+JSON.stringify(s));
await p.evaluate(()=>aiClose());

// ── 6. El historial se busca por teléfono como se dicta ──────────────────────
console.log('\nEL HISTORIAL SE BUSCA POR TELÉFONO, ESCRITO COMO SEA');
await enBlanco();
await p.evaluate(()=>{
  const base={items:[],itemsAuth:{},iva:true,sub:100,neto:116,precioAuth:0,autorizador:'Elías',fechaAuth:'01 sep 2026',fecha:'01 sep 2026',ts:Date.now()};
  localStorage.setItem('al3d_historial',JSON.stringify([
    {...base,folio:'COT-0001',cliente:'Farmacia San Juan',tel:'33 1234 5678',proy:'Fachada'},
    {...base,folio:'COT-0002',cliente:'Farmacia San Juan',tel:'3312345678',proy:'Interior'},
    {...base,folio:'COT-0003',cliente:'Tortas Toño',tel:'+52 33 9999 0000',proy:'Anuncio 2026'}]));
  invalidarCuadernos(); abrirHistorial();
});
await p.waitForTimeout(300);
const cuenta=async q=>{ await p.fill('#hist-search',q); await p.waitForTimeout(200); return p.evaluate(()=>document.querySelectorAll('.hentry').length); };
(await cuenta('3312345678'))===2 ? bien('«3312345678» encuentra las dos, escritas con y sin espacios') : mal('«3312345678» → '+await cuenta('3312345678'));
(await cuenta('33 1234'))===2 ? bien('«33 1234», a medias y con espacio, también') : mal('«33 1234» → '+await cuenta('33 1234'));
(await cuenta('5678'))===2 ? bien('los últimos cuatro dígitos, que es lo que se dicta') : mal('«5678» → '+await cuenta('5678'));
(await cuenta('9999 0000'))===1 ? bien('y el que se guardó con +52 se encuentra sin el +52') : mal('«9999 0000» → '+await cuenta('9999 0000'));
(await cuenta('2026'))===3 ? bien('«2026» sigue encontrando por la fecha (las tres), no solo por teléfono') : mal('«2026» → '+await cuenta('2026'));
(await cuenta('juan'))===2 ? bien('y el texto sigue buscándose como siempre') : mal('«juan» → '+await cuenta('juan'));
await p.evaluate(()=>cerrarHistorial());

// ── Cierre ───────────────────────────────────────────────────────────────────
console.log('\nSIN ERRORES DE PÁGINA');
const propios=errs.filter(e=>!/font|ERR_CERT/i.test(e));
propios.length===0 ? bien('ningún error de JavaScript en toda la corrida') : mal('errores: '+[...new Set(propios)].join(' | '));

await nav.close();
console.log('');
if(fallos){ console.log(fallos+' fallo(s).'); process.exit(1); }
console.log('Auditoría pesada: todo en su sitio.');
