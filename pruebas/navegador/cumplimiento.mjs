/* CUMPLIMIENTO, CON CLICS: LO QUE legal.html PROMETE SE COMPRUEBA EN EL NAVEGADOR.

   pruebas/cumplimiento.mjs amarra cada promesa al texto del repo; ésta la ve pasar de verdad:

   · Ninguna petición sale del origen en una cotización completa —abrir, capturar, autorizar,
     generar el PDF, abrir el historial y los cuadernos, leer la página legal—. Antes cada apertura
     pedía las tipografías a Google; ahora la lista de hosts es exactamente uno.
   · legal.html abre sin errores, en claro y en oscuro, sin desborde en un teléfono angosto, con los
     ocho términos pintados desde la misma función que el PDF y las licencias alcanzables.
   · El PDF trae el aviso de privacidad, el nombre de la empresa y la dirección de la página; sin IVA
     dice que con factura se agrega el 16%; y la hoja de términos sigue cabiendo en la carta.
   · «Registrar venta» arma el nombre «Contacto - Negocio» sin repetir al cliente, y el historial
     enseña ese mismo nombre.
   · «Borrar sus datos» en el cuaderno quita del dispositivo TODO lo del cliente —historial, cola,
     hitos, propuestas, nota, constancia de venta y la cotización en pantalla si es suya— después de
     descargar un respaldo, y no toca a los demás clientes.
   · El formulario del cliente enlaza el aviso, el modal de IA dice a dónde manda el archivo y
     Ajustes de la plataforma enlaza la página.

   Necesita navegador y un servidor:  pruebas/correr.sh --navegador
   o a mano:  npx http-server -p 8814 &  PUERTO=8814 node pruebas/navegador/cumplimiento.mjs */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({viewport:{width:1440,height:1000}, locale:'es-MX', timezoneId:'America/Mexico_City', acceptDownloads:true});
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
/* Todo lo que pida cualquier página de este contexto, por host. */
const hosts = new Map();
ctx.on('request', r => { const u=r.url(); if(/^(blob:|data:|about:)/.test(u)) return; const h=new URL(u).host; hosts.set(h,(hosts.get(h)||0)+1); });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let dialogs=[], aceptar=true, descargas=[];
p.on('dialog', async d=>{ dialogs.push(d.message()); await (aceptar?d.accept():d.dismiss()); });
p.on('download', d=>{ descargas.push(d.suggestedFilename()); d.delete().catch(()=>{}); });

async function enBlanco(){
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.evaluate(()=>{ try{ localStorage.clear(); sessionStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(900);
}
async function conCliente(cli='Deyanira',proy='Abajeño Tlaquepaque'){
  await enBlanco();
  await p.fill('#f-cli',cli); await p.fill('#f-tel','33 1234 5678'); await p.fill('#f-proy',proy);
  await p.waitForTimeout(300);
  await p.evaluate(()=>irAPantalla('partidas'));
  await p.waitForTimeout(400);
}
async function unaPartida(){ await p.click('.chip:has-text("Acero Inoxidable")'); await p.fill('#h-1','40'); await p.fill('#n-1','8'); await p.waitForTimeout(250); }
async function autorizarYo(){ await p.evaluate(()=>autorizarYoMismo()); await p.waitForTimeout(400); await p.fill('#a-name','Elías'); await p.evaluate(()=>autorizar()); await p.waitForTimeout(600); }
const $t=sel=>p.$eval(sel,e=>e.textContent).catch(()=>'');
const toast=()=>p.evaluate(()=>document.getElementById('toast')?.textContent||'');
async function pdfHTML(){
  await p.evaluate(()=>{ window.__u=null; window.open=(u)=>{ window.__u=u; return {focus(){}}; }; generarPDF(); });
  await p.waitForTimeout(500);
  return p.evaluate(async()=>{ const u=window.__u; return u?await (await fetch(u)).text():''; });
}

// ── 1. El formulario, el PDF y el nombre de la venta ─────────────────────────
console.log('\nEL FORMULARIO ENLAZA EL AVISO; EL PDF LO IMPRIME');
await conCliente();
const consent=await p.evaluate(()=>{ const a=document.querySelector('#consent-datos a'); return a?{href:a.getAttribute('href'),target:a.target,txt:document.getElementById('consent-datos').textContent.trim()}:null; });
consent&&consent.href==='legal.html#privacidad'&&consent.target==='_blank' ? bien('bajo los datos del cliente: «'+consent.txt.slice(0,70)+'…», con la liga al aviso en otra pestaña') : mal('la nota de consentimiento: '+JSON.stringify(consent));
await unaPartida(); await autorizarYo();
let pdf=await pdfHTML();
/Aviso de privacidad<\/span>/.test(pdf)&&/AL3D Anuncios Luminosos 3D usa el nombre, el teléfono y la dirección/.test(pdf) ? bien('el PDF imprime el aviso de privacidad con el nombre de la empresa') : mal('el PDF no trae el aviso de privacidad');
/127\.0\.0\.1:\d+\/legal\.html/.test(pdf) ? bien('con la dirección de la página legal de este mismo sitio') : mal('el PDF no trae la dirección de legal.html: '+(pdf.match(/Aviso completo: [^<]*/)||[''])[0]);
/<span class="lbl">Empresa<\/span><span>AL3D Anuncios Luminosos 3D<\/span>/.test(pdf) ? bien('y el pie de los términos nombra a la empresa') : mal('el pie de los términos no nombra a la empresa');
/salvo que indique lo contrario por escrito o por WhatsApp antes de la instalación/.test(pdf) ? bien('el uso de imágenes se puede negar: lo dice el apartado 8') : mal('el apartado 8 no trae la salida');
!/Precio sin IVA/.test(pdf) ? bien('con IVA no aparece la nota de «sin IVA»') : mal('la nota de sin IVA aparece con IVA');
/* La hoja de términos, con el aviso encima de la aceptación, sigue cabiendo en la carta. El
   documento se escribe sobre una página DEL SITIO —no con setContent, que lo dejaría en about:blank
   con origen opaco—: así las fuentes se piden desde el mismo origen, como en la pestaña real del
   PDF, que es una URL blob: con el origen de la app. */
const p2=await ctx.newPage(); await p2.goto(B+'/',{waitUntil:'load'});
await p2.evaluate(h=>{ document.open(); document.write(h); document.close(); },pdf); await p2.waitForTimeout(800);
const hojas=await p2.$$eval('.pg',els=>els.map(e=>({sh:e.scrollHeight,ch:e.clientHeight,tt:!!e.querySelector('.priv')})));
const terminosHoja=hojas.find(h=>h.tt);
terminosHoja&&terminosHoja.sh<=terminosHoja.ch+1 ? bien('la hoja de términos con el aviso sigue cabiendo ('+terminosHoja.sh+' de '+terminosHoja.ch+' px)') : mal('la hoja de términos desborda: '+JSON.stringify(terminosHoja));
const inter=await p2.evaluate(async()=>{ await document.fonts.ready; return document.fonts.check('12px Inter'); });
inter ? bien('el documento carga Inter desde el propio sitio') : mal('Inter no cargó en el documento del PDF');
await p2.close();
await p.evaluate(()=>{ Q.iva=false; saveState(); renderItems(); }); await p.waitForTimeout(200);
pdf=await pdfHTML();
/Precio sin IVA · si requiere factura se agrega el 16%/.test(pdf) ? bien('sin IVA, el recuadro de totales dice que con factura se agrega el 16%') : mal('sin IVA no se dice el 16%');
const wa=await p.evaluate(()=>mensajeWhatsApp());
/sin IVA · con factura se agrega el 16%/.test(wa) ? bien('y el WhatsApp también') : mal('el WhatsApp sin IVA: '+wa.split('\n').find(l=>/Total/.test(l)));
/· AL3D Anuncios Luminosos 3D$/m.test(wa) ? bien('firmado por la empresa') : mal('firma del WhatsApp: '+wa.split('\n').pop());
await p.evaluate(()=>{ Q.iva=true; saveState(); renderItems(); });

console.log('\n«CONTACTO - NEGOCIO», SIN REPETIR AL CLIENTE');
const nombreVenta=async(cli,proy)=>{ await p.evaluate(([c,pr])=>{ Q.cliente=c; Q.proy=pr; abrirRegistrarVenta(); },[cli,proy]); await p.waitForTimeout(200); const v=await p.$eval('#rv-proyecto',e=>e.value); await p.evaluate(()=>cerrarRegistrarVenta()); return v; };
let v=await nombreVenta('Deyanira','Abajeño Tlaquepaque');
v==='Deyanira - Abajeño Tlaquepaque' ? bien('Cliente «Deyanira» + Proyecto «Abajeño Tlaquepaque» → «'+v+'», como en Canva') : mal('venta: «'+v+'»');
v=await nombreVenta('Abajeño Tlaquepaque','Deyanira - Abajeño Tlaquepaque');
v==='Deyanira - Abajeño Tlaquepaque' ? bien('con el proyecto ya escrito a la manera de Canva no se antepone el cliente otra vez') : mal('venta con proyecto de Canva: «'+v+'»');
v=await nombreVenta('Farmacia San Juan','Farmacia San Juan – Letrero fachada');
v==='Farmacia San Juan – Letrero fachada' ? bien('ni con el guion largo del placeholder viejo') : mal('venta con guion largo: «'+v+'»');
await p.evaluate(()=>{ Q.cliente='Deyanira'; Q.proy='Abajeño Tlaquepaque'; saveState(); guardarEnHistorial(); abrirHistorial(); }); await p.waitForTimeout(300);
const hn=await $t('.hentry-name'), hs=await $t('.hentry-sub');
hn.trim()==='Deyanira - Abajeño Tlaquepaque' ? bien('el historial nombra la cotización «'+hn.trim()+'»') : mal('nombre en el historial: «'+hn+'»');
!/Deyanira/.test(hs) ? bien('y debajo ya no repite al cliente: «'+hs.trim()+'»') : mal('el renglón de abajo repite al cliente: «'+hs+'»');
await p.evaluate(()=>cerrarHistorial());

// ── 2. El modal de IA dice a dónde manda el archivo ──────────────────────────
console.log('\nLA IA DICE A DÓNDE MANDA EL ARCHIVO');
await p.evaluate(()=>{ Q.estado='borrador'; renderItems(); aiOpen(); }); await p.waitForTimeout(200);
const intro=await $t('#ai-intro');
/proveedor de IA que elijas/.test(intro)&&/confidencialidad/.test(intro) ? bien('«'+intro.slice(intro.indexOf('El archivo se envía'),intro.indexOf('El archivo se envía')+90)+'…»') : mal('el intro de la IA: '+intro.slice(0,200));
await p.evaluate(()=>aiClose());

// ── 3. Borrar los datos de un cliente ────────────────────────────────────────
console.log('\nBORRAR LOS DATOS DE UN CLIENTE, Y SOLO LOS SUYOS');
await enBlanco();
await p.evaluate(()=>{
  const base={items:[{id:1,tipo:'manual',pz:1,pu:100,desc:'x',_lt:100}],itemsAuth:{},iva:true,sub:100,neto:116,precioAuth:0,autorizador:'Elías',fechaAuth:'01 sep 2026',fecha:'01 sep 2026',huellaAuth:'h',ts:Date.now()};
  localStorage.setItem('al3d_historial',JSON.stringify([
    {...base,folio:'COT-0001',cliente:'Deyanira',tel:'33 1234 5678',proy:'Abajeño Tlaquepaque'},
    {...base,folio:'COT-0002',cliente:'Deyanira',tel:'3312345678',proy:'Abajeño · interior'},
    {...base,folio:'COT-0003',cliente:'Héctor',tel:'33 9999 0000',proy:'TATA Consultores'}]));
  localStorage.setItem('al3d_queue',JSON.stringify([{folio:'COT-0004',cliente:'Deyanira',proy:'Otra',estado:'pendiente',q:{folio:'COT-0004',cliente:'Deyanira',tel:'33 1234 5678',items:[]}},{folio:'COT-0005',cliente:'Héctor',proy:'x',estado:'pendiente',q:{folio:'COT-0005',items:[]}}]));
  localStorage.setItem('al3d_hitos',JSON.stringify({'COT-0001':{pdf:1},'COT-0003':{pdf:1}}));
  localStorage.setItem('al3d_canva',JSON.stringify({'COT-0002':{primera:1},'COT-0003':{primera:1}}));
  localStorage.setItem('al3d_cuadernos',JSON.stringify({'tel:3312345678':'Paga en efectivo','tel:3399990000':'Factura siempre'}));
  localStorage.setItem('al3d_pf_ganadas',JSON.stringify([{folio:'COT-0001',disp:'x'},{folio:'COT-0003',disp:'x'}]));
  invalidarCuadernos();
  /* La cotización en pantalla es de Deyanira: también se va. */
  Q.folio='COT-0001'; Q.cliente='Deyanira'; Q.tel='33 1234 5678'; Q.proy='Abajeño Tlaquepaque'; saveState();
  abrirCuadernos(); abrirCuaderno('tel:3312345678');
});
await p.waitForTimeout(300);
const btn=await p.$('#cua-body button.cua-borrar');
btn ? bien('el cuaderno tiene «Borrar sus datos»') : mal('no hay botón de borrar en el cuaderno');
/* Primero cancelar: nada cambia. */
dialogs=[]; aceptar=false; await p.evaluate(()=>cuaBorrarDatos('tel:3312345678')); await p.waitForTimeout(200);
let est=await p.evaluate(()=>({hist:getHistorial().length,cola:getQueue().length}));
dialogs.length===1&&est.hist===3&&est.cola===2 ? bien('cancelar el diálogo no borra nada') : mal('cancelar: '+JSON.stringify({dialogs,est}));
/* Ahora sí. Nota: la cola de Deyanira (COT-0004) no está en el historial; el cuaderno se arma con el
   historial, así que lo que se borra de la cola son los folios del cuaderno. */
dialogs=[]; aceptar=true; descargas=[]; await p.evaluate(()=>cuaBorrarDatos('tel:3312345678')); await p.waitForTimeout(900);
est=await p.evaluate(()=>({hist:getHistorial().map(e=>e.folio),cola:getQueue().map(e=>e.folio),sinEstrenar:!!Q.sinEstrenar,hitos:Object.keys(getHitos()),canva:Object.keys(getPropuestas()),notas:Object.keys(getCuaNotas()),ganadas:JSON.parse(localStorage.getItem('al3d_pf_ganadas')).map(x=>x.folio),qcli:Q.cliente,qfolio:Q.folio,cuadernos:cuadernos().map(g=>g.nombre),toast:document.getElementById('toast').textContent,titulo:document.getElementById('cua-titulo').textContent}));
/¿Borrar todos los datos de Deyanira/.test(dialogs[0]||'')&&/2 cotizaciones/.test(dialogs[0]) ? bien('el diálogo dice de quién y cuánto: «'+dialogs[0].split('\n')[0]+'»') : mal('diálogo: '+dialogs[0]);
descargas.some(n=>/antes-de-borrar-deyanira/.test(n)) ? bien('antes de borrar se descargó el respaldo «'+descargas[0]+'»') : mal('no se descargó el respaldo: '+JSON.stringify(descargas));
JSON.stringify(est.hist)==='["COT-0003"]' ? bien('del historial se fueron las dos de Deyanira y quedó la de Héctor') : mal('historial: '+JSON.stringify(est.hist));
!est.hitos.includes('COT-0001')&&est.hitos.includes('COT-0003') ? bien('sus hitos también, y los de Héctor no') : mal('hitos: '+JSON.stringify(est.hitos));
!est.canva.includes('COT-0002')&&est.canva.includes('COT-0003') ? bien('y sus propuestas de Canva') : mal('canva: '+JSON.stringify(est.canva));
JSON.stringify(est.notas)==='["tel:3399990000"]' ? bien('y la nota de su cuaderno, no la del otro') : mal('notas: '+JSON.stringify(est.notas));
JSON.stringify(est.ganadas)==='["COT-0003"]' ? bien('y su constancia de venta que esperaba a la plataforma') : mal('ganadas: '+JSON.stringify(est.ganadas));
est.qcli===''&&est.sinEstrenar ? bien('la cotización en pantalla, que era suya, se vació (ahora es '+est.qfolio+', en blanco)') : mal('la cotización en pantalla: '+est.qcli+' '+est.qfolio);
JSON.stringify(est.cola)==='["COT-0005"]' ? bien('y de la cola se fue su solicitud pendiente —que no estaba en el historial— por el teléfono, y quedó la de Héctor') : mal('cola: '+JSON.stringify(est.cola));
est.cuadernos.length===1&&est.cuadernos[0]==='Héctor' ? bien('la lista de cuadernos vuelve con solo Héctor') : mal('cuadernos: '+JSON.stringify(est.cuadernos));
/Se borraron los datos de Deyanira/.test(est.toast) ? bien('y se dice: «'+est.toast.slice(0,80)+'»') : mal('toast: '+est.toast);
await p.evaluate(()=>cerrarCuadernos());

// ── 4. La página legal ───────────────────────────────────────────────────────
console.log('\nLA PÁGINA LEGAL');
const lerrs=[]; p.on('pageerror',e=>lerrs.push(e.message));
await p.goto(B+'/legal.html',{waitUntil:'load'}); await p.waitForTimeout(500);
const lg=await p.evaluate(async()=>({
  terminos:document.querySelectorAll('#lg-terminos .lg-tsec').length,
  t8:document.querySelector('#lg-terminos .lg-tsec:last-child')?.textContent||'',
  secciones:[...document.querySelectorAll('.lg-sec h2')].map(h=>h.textContent),
  ofl:(await Promise.all(['fonts/OFL-Figtree.txt','fonts/OFL-Outfit.txt','fonts/OFL-Inter.txt'].map(u=>fetch(u).then(r=>r.ok)))).every(Boolean),
  tema:document.documentElement.getAttribute('data-tema'),
  fuentes:await document.fonts.ready.then(()=>document.fonts.check('16px Figtree')&&document.fonts.check('16px Outfit')),
  sw:document.documentElement.scrollWidth<=innerWidth+1,
  h1:document.querySelector('h1')?.textContent,
}));
lg.terminos===8 ? bien('pinta los 8 términos desde terminosCotizacion') : mal('términos pintados: '+lg.terminos);
/salvo que indique lo contrario/.test(lg.t8) ? bien('con el apartado 8 nuevo') : mal('apartado 8: '+lg.t8.slice(0,120));
lg.secciones.length===10 ? bien('diez apartados: '+lg.secciones.join(' · ')) : mal('apartados: '+JSON.stringify(lg.secciones));
lg.ofl ? bien('las tres licencias OFL se pueden abrir') : mal('alguna licencia OFL no responde');
lg.fuentes ? bien('Figtree y Outfit cargan desde el sitio') : mal('las tipografías no cargaron');
lg.sw ? bien('sin desborde horizontal a 1440') : mal('desborde horizontal a 1440');
/* Oscuro, y angosto. */
await p.evaluate(()=>localStorage.setItem('al3d_tema','oscuro')); await p.setViewportSize({width:344,height:760}); await p.reload({waitUntil:'load'}); await p.waitForTimeout(400);
const osc=await p.evaluate(()=>({tema:document.documentElement.getAttribute('data-tema'),bg:getComputedStyle(document.body).backgroundColor,sw:document.documentElement.scrollWidth<=innerWidth+1,logo:[...document.querySelectorAll('.lg-marca img')].filter(i=>i.offsetWidth>0).length}));
osc.tema==='oscuro'&&!/255, 255, 255|243, 244, 251/.test(osc.bg) ? bien('en oscuro el fondo cambia ('+osc.bg+')') : mal('oscuro: '+JSON.stringify(osc));
osc.sw ? bien('y a 344 px no desborda') : mal('desborde a 344 px');
osc.logo===1 ? bien('se ve un solo logotipo, el del tema') : mal('logotipos visibles: '+osc.logo);
await p.keyboard.press('Tab'); const foco=await p.evaluate(()=>document.activeElement&&document.activeElement.className);
foco==='lg-skip' ? bien('el primer Tab cae en «Saltar al contenido»') : mal('primer foco: '+foco);
await p.evaluate(()=>localStorage.removeItem('al3d_tema')); await p.setViewportSize({width:1440,height:1000});
lerrs.length===0 ? bien('sin errores de JavaScript en la página') : mal('errores: '+lerrs.join(' | '));

// ── 5. Ajustes de la plataforma ──────────────────────────────────────────────
console.log('\nAJUSTES DE LA PLATAFORMA ENLAZA LA PÁGINA');
const antesHosts=new Map(hosts);
/* Ajustes enseña solo «¿Quién usa este teléfono?» hasta que el aparato tiene rol y nombre: se le
   dan antes de entrar, como los tendría cualquier teléfono del equipo. */
await p.goto(B+'/index.html',{waitUntil:'load'});
await p.evaluate(()=>{ localStorage.setItem('al3d_pf_rol','direccion'); localStorage.setItem('al3d_pf_nombre','Elías'); });
await p.goto(B+'/index.html#/ajustes',{waitUntil:'load'});
await p.waitForSelector('#mod-ajustes a[href="legal.html"]',{timeout:15000}).then(()=>bien('la tarjeta «Aviso de privacidad, términos y licencias» está en Ajustes')).catch(()=>mal('Ajustes no enlaza legal.html'));

// ── 6. Ningún host ajeno ─────────────────────────────────────────────────────
console.log('\nNINGUNA PETICIÓN SALE DEL SITIO');
const propio=new URL(B).host;
const ajenos=[...antesHosts.keys()].filter(h=>h!==propio);
ajenos.length===0 ? bien('en toda la cotización, el PDF y la página legal, un solo host: '+propio+' ('+antesHosts.get(propio)+' peticiones)') : mal('hosts ajenos: '+ajenos.join(', '));
const ajenosPf=[...hosts.keys()].filter(h=>h!==propio&&!antesHosts.has(h));
console.log('   (la plataforma en #/ajustes pidió a: '+([...hosts.keys()].filter(h=>h!==propio).join(', ')||'nadie más')+')');
ajenosPf.length===0 ? bien('la plataforma tampoco pide nada fuera al abrir Ajustes') : mal('la plataforma pidió a: '+ajenosPf.join(', '));

console.log('\nSIN ERRORES DE PÁGINA');
errs.length===0 ? bien('ningún error de JavaScript en toda la corrida') : mal('errores: '+[...new Set(errs)].join(' | '));

await nav.close();
console.log('');
if(fallos){ console.log(fallos+' fallo(s).'); process.exit(1); }
console.log('Cumplimiento: se ve, se imprime y se borra como se promete.');
