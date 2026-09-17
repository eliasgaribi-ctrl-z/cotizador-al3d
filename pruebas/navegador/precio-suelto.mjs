/* EL PRECIO QUE SE SUELTA, Y CÓMO SE VUELVE A CERRAR.

   Una cotización autorizada se puede editar («Editar partidas»), y al primer cambio que mueva
   el trabajo la app suelta el precio autorizado: vuelve al calculado y lo dice. Hasta la
   auditoría de septiembre de 2026 ahí se acababa el camino, y se acababa mal por cuatro lados
   que solo se ven haciéndolo con clics:

   · Las DEMÁS partidas se quedaban pintadas con el precio del cliente viejo —el ajuste por
     partida, el aumento repartido— porque el tecleo solo repinta la suya. La partida 2 decía
     «$1,000.00 → $1,029.44» mientras el PDF ya imprimía $1,000.00.
   · El PDF y el chat ya hechos conservaban su palomita, así que el siguiente paso era «Enviar
     por WhatsApp» un PDF que ya no decía lo que se cobra.
   · «Hay que autorizarlo de nuevo» se decía y no se podía hacer: ningún botón volvía a abrir la
     revisión, y la única salida era «Duplicar» del historial, que es otro folio.
   · Y el precio se contaba con dos bases distintas: el formulario de revisión decía «Descuento
     $1,000» contra el calculado y la columna, un segundo después, «Aumento $600» contra las
     partidas ya ajustadas. Las dos frases eran ciertas y juntas parecían un error.

   También entran aquí tres arreglos chicos de la misma auditoría que piden navegador: la imagen
   PNG con transparencia que se iba a la IA —y al PDF— sobre negro, el historial que reventaba
   con una entrada que no era un objeto, y la partida manual sin descripción, que salía en el
   papel como un renglón con precio y «—».

   Necesita navegador y un servidor:  pruebas/correr.sh --navegador
   o a mano:  npx http-server -p 8814 &  PUERTO=8814 node pruebas/navegador/precio-suelto.mjs */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({viewport:{width:1440,height:1000}, locale:'es-MX', timezoneId:'America/Mexico_City'});
const p = await ctx.newPage();
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

async function enBlanco(){
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.evaluate(()=>{ try{ localStorage.clear(); sessionStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(1000);
}
async function conCliente(){
  await enBlanco();
  await p.fill('#f-cli','Farmacia San Juan');
  await p.fill('#f-tel','33 1234 5678');
  await p.fill('#f-proy','Letrero de fachada');
  await p.waitForTimeout(300);
  await p.evaluate(()=>irAPantalla('partidas'));
  await p.waitForTimeout(400);
}
/* Dos partidas con precio: 8 letras de acero de 40 cm ($17,600) y una manual de 2 × $500. */
async function dosPartidas(){
  await p.click('.chip:has-text("Acero Inoxidable")');
  await p.fill('#h-1','40'); await p.fill('#n-1','8');
  await p.evaluate(()=>{ const it=addItem({}); setTipo(it.id,'manual'); });
  await p.fill('#d-2','Instalación'); await p.fill('#pz-2','2'); await p.fill('#pu-2','500');
  await p.waitForTimeout(300);
}
/* La revisión: baja la partida 1 a $16,000 y pone $17,500 de subtotal encima ($17,000 ajustados). */
async function autorizarAjustada(){
  await p.evaluate(()=>autorizarYoMismo()); await p.waitForTimeout(500);
  await p.evaluate(()=>toggleItemAuth(Q.items[0].id));
  await p.fill('#ia-in-1','16000'); await p.waitForTimeout(200);
  await p.fill('#a-precio','17500'); await p.waitForTimeout(200);
  await p.fill('#a-name','Elías');
  await p.evaluate(()=>autorizar()); await p.waitForTimeout(700);
}
const $t = (sel) => p.$eval(sel, e => e.textContent).catch(()=>'');

// ── 1. Una sola base para contar el ajuste ───────────────────────────────────
console.log('\nEL AJUSTE SE CUENTA CON UNA SOLA BASE, Y LA NOMBRA');
await conCliente(); await dosPartidas();
await p.evaluate(()=>autorizarYoMismo()); await p.waitForTimeout(500);
await p.evaluate(()=>toggleItemAuth(Q.items[0].id));
await p.fill('#ia-in-1','16000'); await p.waitForTimeout(200);
let info = await $t('#descuento-info');
/por debajo del calculado/.test(info) && /17,600|\$1,600/.test(info)
  ? bien('con la partida bajada y sin precio global, la revisión dice cuánto va por debajo del calculado: «'+info+'»')
  : mal('con solo un ajuste por partida la revisión dice «'+info+'»');
await p.fill('#a-precio','17500'); await p.waitForTimeout(200);
info = await $t('#descuento-info');
/^Aumento: \$500\.00/.test(info) && /partidas ya ajustadas \(\$17,000\.00\)/.test(info) && /\$1,100\.00 por debajo del calculado/.test(info)
  ? bien('con $17,500 encima de $17,000 ajustados: «'+info+'»')
  : mal('el formulario de revisión dice «'+info+'» — se esperaba un aumento de $500 sobre las partidas ajustadas, $1,100 por debajo del calculado');
await p.fill('#a-name','Elías');
await p.evaluate(()=>autorizar()); await p.waitForTimeout(700);
const col = await p.evaluate(()=>({estado:Q.estado, lab:document.querySelector('#s-auth-row .adj-label').textContent,
  imp:document.getElementById('s-auth').textContent, desc:document.getElementById('s-auth-desc').textContent,
  nota:[...document.querySelectorAll('#authbox .authnote')].map(e=>e.textContent).join(' | ')}));
col.estado==='autorizada' ? bien('autorizada') : mal('no llegó a autorizada: '+col.estado);
(col.lab==='Aumento' && /\$500\.00/.test(col.imp) && /partidas ya ajustadas \(\$17,000\.00\)/.test(col.desc) && /1,100\.00 por debajo/.test(col.desc))
  ? bien('la columna dice lo mismo que dijo el formulario: «'+col.lab+' '+col.imp+' · '+col.desc+'»')
  : mal('la columna dice «'+col.lab+' '+col.imp+' · '+col.desc+'» y el formulario había dicho otra base');
/Aumento: \$500\.00 \(3%\) sobre las partidas ya ajustadas/.test(col.nota)
  ? bien('y la nota del panel también: misma base, mismo importe')
  : mal('la nota del panel dice «'+col.nota+'»');
await p.evaluate(()=>abrirRegistrarVenta()); await p.waitForTimeout(400);
const rv = await $t('#rv-aviso-auth');
/aumento de \$500\.00 \(3%\) sobre las partidas ya ajustadas/.test(rv) && /por debajo del calculado/.test(rv)
  ? bien('el aviso de Registrar venta, igual: «'+rv+'»')
  : mal('el aviso de Registrar venta dice «'+rv+'»');
await p.evaluate(()=>cerrarRegistrarVenta()); await p.waitForTimeout(200);

// ── 2. Soltar el precio repinta a TODAS y borra los hitos que ya no valen ────
console.log('\nSOLTAR EL PRECIO: todas las partidas se repintan y la entrega vuelve a empezar');
await p.evaluate(()=>{ marcarHito('pdf'); marcarHito('wa'); marcarHito('venta'); });
await p.waitForTimeout(200);
let antes = await p.evaluate(()=>({lt2:document.getElementById('lt-2').textContent, tach:!!document.querySelector('#lt-2 .lt-calc'), h:hitosDe(Q.folio)}));
antes.tach ? bien('antes de editar, la partida 2 enseña su precio de cliente con el calculado tachado: «'+antes.lt2+'»')
           : mal('la partida 2 no enseña el reparto del aumento: «'+antes.lt2+'»');
await p.evaluate(()=>toggleEditMode()); await p.waitForTimeout(200);
await p.evaluate(()=>{ _plegadas.delete(1); renderItems(); }); await p.waitForTimeout(150);
await p.fill('#h-1','45'); await p.waitForTimeout(400);
const suelta = await p.evaluate(()=>({estado:Q.estado, huella:Q.huellaAuth, precioAuth:Q.precioAuth, suelta:autorizacionSuelta(),
  lt2:document.getElementById('lt-2').textContent, tach:!!document.querySelector('#lt-2 .lt-calc'),
  h:hitosDe(Q.folio), toast:document.getElementById('toast').textContent}));
(suelta.estado==='autorizada' && suelta.suelta && !suelta.precioAuth)
  ? bien('la altura 40 → 45 soltó el precio: sigue autorizada, sin huella y sin ajuste')
  : mal('tras editar quedó '+JSON.stringify({estado:suelta.estado,huella:suelta.huella,precioAuth:suelta.precioAuth}));
(!suelta.tach && /\$1,000\.00/.test(suelta.lt2))
  ? bien('y la partida 2 —la que NO se tocó— volvió a su calculado en el mismo tecleo: «'+suelta.lt2.trim()+'»')
  : mal('la partida 2 se quedó con el precio del cliente viejo: «'+suelta.lt2+'»');
(!suelta.h.pdf && !suelta.h.wa && suelta.h.venta)
  ? bien('el PDF y el chat perdieron su palomita —eran de otro trabajo— y la venta se queda')
  : mal('los hitos quedaron '+JSON.stringify(suelta.h));
/Volver a autorizar/.test(suelta.toast) ? bien('el aviso dice dónde está la salida: «'+suelta.toast+'»')
                                       : mal('el aviso dice «'+suelta.toast+'»');

// ── 3. La autorización suelta se ve, y tiene botón ───────────────────────────
console.log('\nLA AUTORIZACIÓN SUELTA SE VE EN TODAS PARTES, Y TIENE CÓMO CERRARSE');
await p.evaluate(()=>guardarCambiosEdicion()); await p.waitForTimeout(400);
const vista = await p.evaluate(()=>({
  nota:[...document.querySelectorAll('#authbox .authnote')].map(e=>e.textContent.trim()).join(' | '),
  boton:!!document.querySelector('#authbox .btn-pri[onclick="reautorizar()"]'),
  pdfSinRelleno:!document.querySelector('#entrega .btn-pri'),
  sig:(siguientePaso()||{}).txt, tab3:document.getElementById('tab-3').className,
  mbar:document.getElementById('mbar').innerText, cand:document.getElementById('cand-partidas-txt').textContent,
  hist:JSON.parse(localStorage.getItem('al3d_historial')||'[]').map(e=>({f:e.folio,pa:e.precioAuth,h:e.huellaAuth}))}));
/Las partidas cambiaron después de que Elías autorizara/.test(vista.nota) && /calculado/.test(vista.nota)
  ? bien('el panel ya no dice «Autorizada por Elías» a secas: «'+vista.nota.slice(0,110)+'…»')
  : mal('el panel dice «'+vista.nota+'»');
vista.boton ? bien('y ofrece «Volver a autorizar el precio» con relleno') : mal('no hay botón de volver a autorizar');
vista.pdfSinRelleno ? bien('mientras, ningún hito de la entrega lleva relleno: un solo botón con color') : mal('la entrega sigue con un hito en color');
/Vuelve a autorizar/.test(vista.sig) ? bien('«qué sigue» dice «'+vista.sig+'»') : mal('«qué sigue» dice «'+vista.sig+'»');
!/hecho/.test(vista.tab3) ? bien('la pestaña 3 perdió la palomita') : mal('la pestaña 3 sigue con palomita: '+vista.tab3);
/Volver a autorizar/.test(vista.mbar) ? bien('la barra fija del teléfono también lo ofrece') : mal('la barra fija dice «'+vista.mbar.replace(/\n/g,' ')+'»');
/volvió al calculado/.test(vista.cand) ? bien('y la ficha del paso 2: «'+vista.cand+'»') : mal('la ficha del paso 2 dice «'+vista.cand+'»');
(vista.hist.length===1 && vista.hist[0].pa===0 && vista.hist[0].h==='')
  ? bien('el historial guardó la edición con la huella vacía, que es lo que dice que se soltó')
  : mal('el historial quedó '+JSON.stringify(vista.hist));

// ── 4. Cancelar la revisión reabierta no deja un borrador ────────────────────
console.log('\nVOLVER A AUTORIZAR: cancelar devuelve la autorizada que era');
await p.click('#authbox .btn-pri[onclick="reautorizar()"]'); await p.waitForTimeout(600);
let rev = await p.evaluate(()=>({estado:Q.estado, self:_selfAuth, campo:document.getElementById('a-precio')&&document.getElementById('a-precio').value, cola:getQueue().length}));
(rev.estado==='pendiente' && rev.self && rev.cola===1)
  ? bien('se abre la revisión por el camino de siempre: pendiente, en la cola, autorizándote tú mismo')
  : mal('al volver a autorizar quedó '+JSON.stringify(rev));
Math.abs((+rev.campo)-19800-1000)<0.01
  ? bien('y propone el subtotal calculado de hoy: $'+rev.campo)
  : mal('el formulario propone '+rev.campo+' y el calculado es 20,800');
await p.fill('#a-precio','19000'); await p.waitForTimeout(200);
await p.click('button:has-text("Volver a editar")'); await p.waitForTimeout(500);
rev = await p.evaluate(()=>({estado:Q.estado, suelta:autorizacionSuelta(), cola:getQueue().length, aut:Q.autorizador, fecha:Q.fechaAuth, hist:JSON.parse(localStorage.getItem('al3d_historial')||'[]').length, toast:document.getElementById('toast').textContent}));
(rev.estado==='autorizada' && rev.suelta && rev.cola===0 && rev.aut==='Elías' && rev.fecha && rev.hist===1)
  ? bien('cancelar devuelve la autorizada que era —no un borrador—, con su nombre y su fecha, y la cola vacía')
  : mal('tras cancelar quedó '+JSON.stringify(rev));
/se dejó como estaba/.test(rev.toast) ? bien('y lo dice: «'+rev.toast+'»') : mal('el aviso dice «'+rev.toast+'»');

// ── 5. Volver a autorizar de verdad ──────────────────────────────────────────
console.log('\nVOLVER A AUTORIZAR: el precio nuevo se cierra sobre el mismo folio');
const folio = await p.evaluate(()=>Q.folio);
await p.evaluate(()=>reautorizar()); await p.waitForTimeout(500);
await p.fill('#a-precio','20000'); await p.waitForTimeout(200);
await p.evaluate(()=>autorizar()); await p.waitForTimeout(800);
const fin = await p.evaluate(()=>({folio:Q.folio, estado:Q.estado, suelta:autorizacionSuelta(), vigente:authVigente(), pa:Q.precioAuth, pf:precioFinal(),
  cola:getQueue().length, hist:JSON.parse(localStorage.getItem('al3d_historial')||'[]').map(e=>({f:e.folio,pa:e.precioAuth})),
  sig:(siguientePaso()||{}).txt, tab3:document.getElementById('tab-3').className, boton:!!document.querySelector('#authbox .btn-pri[onclick="reautorizar()"]')}));
(fin.folio===folio && fin.estado==='autorizada' && !fin.suelta && fin.vigente && Math.abs(fin.pa-23200)<0.01 && Math.abs(fin.pf-23200)<0.01)
  ? bien('autorizada otra vez sobre '+folio+': $20,000 + IVA = $23,200, con la huella puesta')
  : mal('tras volver a autorizar quedó '+JSON.stringify(fin));
(fin.cola===0 && fin.hist.length===1 && Math.abs(fin.hist[0].pa-23200)<0.01)
  ? bien('la cola quedó vacía y el historial sigue teniendo UNA entrada, la de este folio, con el precio nuevo')
  : mal('cola '+fin.cola+' · historial '+JSON.stringify(fin.hist));
/PDF/.test(fin.sig) && /hecho/.test(fin.tab3) && !fin.boton
  ? bien('lo que sigue vuelve a ser el PDF, la pestaña 3 recupera su palomita y el botón con relleno se va')
  : mal('«qué sigue» = «'+fin.sig+'», pestaña 3 = '+fin.tab3+', botón = '+fin.boton);
const ghost = await p.$('#authbox .btn-gho[onclick="reautorizar()"]');
ghost ? bien('y queda, sin relleno, «Volver a autorizar el precio» junto a «Editar partidas», para el cliente que regatea después del PDF')
      : mal('con la autorización vigente no queda manera de volver a autorizar');

// ── 6. Abrir del historial una que se soltó respeta que se soltó ─────────────
console.log('\nDEL HISTORIAL, LA SUELTA VUELVE SUELTA');
await p.evaluate(()=>toggleEditMode()); await p.waitForTimeout(200);
await p.evaluate(()=>{ _plegadas.delete(1); renderItems(); }); await p.waitForTimeout(150);
await p.fill('#h-1','50'); await p.waitForTimeout(300);
await p.evaluate(()=>guardarCambiosEdicion()); await p.waitForTimeout(300);
await p.evaluate(()=>nueva()); await p.waitForTimeout(400);
await p.evaluate(f=>{ _histData=getHistorial(); reabrirDeHistorial(f); }, folio); await p.waitForTimeout(500);
const re = await p.evaluate(()=>({folio:Q.folio, estado:Q.estado, suelta:autorizacionSuelta(), boton:!!document.querySelector('#authbox .btn-pri[onclick="reautorizar()"]')}));
(re.folio===folio && re.estado==='autorizada' && re.suelta && re.boton)
  ? bien('la que se guardó suelta abre suelta, con su botón: sellarla al abrir escondía que el precio es el calculado')
  : mal('al reabrir quedó '+JSON.stringify(re));
/* Y una entrada de ANTES de que existiera la huella —sin el campo— se sella como siempre. */
await p.evaluate(()=>{ const a=getHistorial(); delete a[0].huellaAuth; localStorage.setItem('al3d_historial',JSON.stringify(a)); nueva(); });
await p.waitForTimeout(300);
await p.evaluate(f=>{ _histData=getHistorial(); reabrirDeHistorial(f); }, folio); await p.waitForTimeout(500);
(await p.evaluate(()=>!!Q.huellaAuth && !autorizacionSuelta()))
  ? bien('una entrada vieja, sin el campo de la huella, se sella al abrir como siempre')
  : mal('una entrada sin huellaAuth abrió como suelta');

// ── 7. La imagen con transparencia va sobre blanco, no sobre negro ──────────
console.log('\nUN PNG TRANSPARENTE NO SE VUELVE NEGRO AL IR A LA IA');
const esquinas = await p.evaluate(async ()=>{
  const c=document.createElement('canvas'); c.width=2000; c.height=800;
  const g=c.getContext('2d'); g.fillStyle='#4060f8'; g.fillRect(600,200,800,400);
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));
  const leer=async (b64,mime)=>{ const img=new Image(); img.src='data:'+mime+';base64,'+b64; await new Promise(r=>{img.onload=r;});
    const c2=document.createElement('canvas'); c2.width=img.naturalWidth; c2.height=img.naturalHeight; const g2=c2.getContext('2d'); g2.drawImage(img,0,0);
    return [...g2.getImageData(5,5,1,1).data].slice(0,3); };
  const ia=await aiImagen(new File([blob],'logo.png',{type:'image/png'}));
  const a=await leer(ia.b64,ia.mime);
  /* Y la foto con cotas que sale del escalador, por el mismo camino */
  const img=new Image(); img.src=c.toDataURL('image/png'); await new Promise(r=>{img.onload=r;});
  SC.img=img; SC.imgW=img.naturalWidth; SC.imgH=img.naturalHeight; SC.items=[];
  const u=scImagenParaIA(); SC.img=null;
  const b=await leer(u.split(',')[1],'image/jpeg');
  return {ia:a, sc:b, mime:ia.mime};
});
(esquinas.mime==='image/jpeg' && esquinas.ia.every(v=>v>=250))
  ? bien('aiImagen recomprime a JPEG y la esquina transparente sale blanca: '+JSON.stringify(esquinas.ia))
  : mal('aiImagen dejó la esquina en '+JSON.stringify(esquinas.ia)+' ('+esquinas.mime+')');
esquinas.sc.every(v=>v>=250)
  ? bien('y la foto con cotas del escalador también: '+JSON.stringify(esquinas.sc))
  : mal('scImagenParaIA dejó la esquina en '+JSON.stringify(esquinas.sc));

// ── 8. Un historial con basura no tumba la app ───────────────────────────────
console.log('\nUN HISTORIAL CON UNA ENTRADA QUE NO ES UNA ENTRADA');
await p.evaluate(()=>{
  const a=getHistorial();
  const rara={folio:'COT-0099',cliente:'Sin partidas',proy:'Entrada sin items',tel:'33 9999 9999',fechaAuth:'1 sep 2026',autorizador:'Elías',neto:100,sub:100,precioAuth:0,ts:Date.now()};
  localStorage.setItem('al3d_historial',JSON.stringify([null,5,'x',rara].concat(a)));
});
await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'}); await p.waitForTimeout(1000);
const errsAntes=errs.length;
await p.evaluate(()=>{ abrirHistorial(); }); await p.waitForTimeout(400);
const hist = await p.evaluate(()=>({n:getHistorial().length, txt:document.getElementById('hist-body').innerText, cua:cuadernos().length, cli:clientesConocidos().length}));
(errs.length===errsAntes && hist.n===2 && /COT-0099/.test(hist.txt) && /Sin partidas/.test(hist.txt))
  ? bien('el historial abre, enseña las dos entradas de verdad —incluida la que no trae partidas— y se salta lo que no es una entrada')
  : mal('historial: '+hist.n+' entradas, errores nuevos: '+errs.slice(errsAntes).join(' | ')+' · '+hist.txt.slice(0,120));
(hist.cua>=1 && hist.cli>=1) ? bien('los cuadernos y las sugerencias de cliente tampoco truenan') : mal('cuadernos '+hist.cua+' · clientes '+hist.cli);
await p.evaluate(()=>cerrarHistorial());

// ── 9. La partida manual sin descripción ─────────────────────────────────────
console.log('\nLA PARTIDA MANUAL SIN DESCRIPCIÓN ES UNA PARTIDA SIN TERMINAR');
await conCliente();
await p.evaluate(()=>setTipo(Q.items[0].id,'manual')); await p.waitForTimeout(200);
await p.fill('#pz-1','2'); await p.fill('#pu-1','500'); await p.waitForTimeout(300);
const man = await p.evaluate(()=>({faltan:faltantesDe(Q.items[0]), formula:document.getElementById('formula-1').textContent, sig:document.getElementById('prog-next').textContent, lt:lineTotal(Q.items[0])}));
(man.faltan.length===1 && man.faltan[0]==='descripción' && man.lt===1000)
  ? bien('con piezas y precio pero sin descripción, lo único que falta es la descripción — y vale $1,000, no $0')
  : mal('faltan '+JSON.stringify(man.faltan)+' · vale '+man.lt);
/2 pza × \$500\.00 · falta la descripción/.test(man.formula)
  ? bien('la fórmula sigue enseñando la cuenta y lo dice al final: «'+man.formula+'»')
  : mal('la fórmula dice «'+man.formula+'»');
/falta descripción/.test(man.sig) ? bien('y «qué sigue» lo nombra: «'+man.sig+'»') : mal('«qué sigue» dice «'+man.sig+'»');
await p.evaluate(()=>autorizarYoMismo()); await p.waitForTimeout(400);
await p.fill('#a-name','Elías');
await p.evaluate(()=>autorizar()); await p.waitForTimeout(500);
const aviso = await p.evaluate(()=>({abierto:document.getElementById('faltmodal').classList.contains('show'), intro:document.getElementById('falt-intro').textContent, fila:document.querySelector('.falt-d')?.textContent||'', quitar:!!document.querySelector('.falt-quitar')}));
(aviso.abierto && /sin decir qué se cobra/.test(aviso.intro) && !/\$0/.test(aviso.intro))
  ? bien('al autorizar sale el aviso, y no miente: «'+aviso.intro+'»')
  : mal('el aviso '+(aviso.abierto?'dice «'+aviso.intro+'»':'no salió'));
/descripción/.test(aviso.fila) && !aviso.quitar
  ? bien('el renglón dice «'+aviso.fila+'» y no ofrece «Quitar»: la partida tiene precio, no está vacía')
  : mal('el renglón dice «'+aviso.fila+'», quitar='+aviso.quitar);
await p.click('.falt-ir'); await p.waitForTimeout(600);
(await p.evaluate(()=>document.activeElement&&document.activeElement.id))==='d-1'
  ? bien('tocar la partida deja el cursor en la descripción, que es el hueco')
  : mal('el cursor quedó en «'+(await p.evaluate(()=>document.activeElement&&document.activeElement.id))+'»');
await p.fill('#d-1','Instalación y viáticos'); await p.waitForTimeout(300);
(await p.evaluate(()=>partidasSinTerminar().length))===0
  ? bien('con la descripción escrita ya no queda nada sin terminar')
  : mal('sigue habiendo partidas sin terminar');

// ── 10. Nada se rompió por el camino ─────────────────────────────────────────
console.log('');
errs.length ? mal('errores de página: '+[...new Set(errs)].slice(0,3).join(' | '))
            : bien('cero errores de página en todo el recorrido');

console.log(fallos ? '\n'+fallos+' FALLO(S)' : '\nEl precio que se suelta se ve, se repinta y se vuelve a cerrar.');
await nav.close();
process.exit(fallos?1:0);
