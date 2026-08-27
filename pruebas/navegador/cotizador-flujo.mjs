/* EL FLUJO DEL COTIZADOR, CON CLICS DE VERDAD.

   `camino-completo.mjs` recorre el camino felíz de punta a punta —capturar, autorizar,
   registrar, cruzar a la plataforma— y ahí se detiene: es una prueba del PUENTE entre las
   dos apps. Lo que no cubre nadie es el flujo de dentro del cotizador, y es justo donde el
   README dice que la app «nunca tuvo pruebas y se auditó a mano, pantalla por pantalla».

   Auditar a mano encuentra lo que se ve. No encuentra dos cosas, y las dos aparecieron en
   esta revisión:

   · Lo que solo se rompe en UNA de las dos ramas. El aviso de «partidas sin terminar»
     enseñaba el botón «Quitar» llegando por «Solicitar autorización a alguien más» y no
     llegando por «Autorizar yo mismo», que es el camino que se usa casi siempre. Mirando
     la pantalla las dos veces se ve; mirándola una, no.

   · Lo que solo se rompe en UNA dirección. Arrastrar una partida hacia arriba acomodaba
     bien y hacia abajo la dejaba una posición de más. El mismo gesto, dos resultados.

   Así que esto prueba el flujo por sus dos lados: los dos caminos a la autorización, las
   dos direcciones del arrastre, y el orden del proceso —qué dice la app que sigue— en cada
   estado por el que pasa una cotización.

   Necesita navegador y un servidor, así que va en pruebas/navegador/ y no en
   pruebas/correr.sh, que es de node puro:

     pruebas/correr.sh --navegador

   o a mano:

     python3 -m http.server 8814 &
     PUERTO=8814 node pruebas/navegador/cotizador-flujo.mjs
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({viewport:{width:1440,height:1000}, locale:'es-MX', timezoneId:'America/Mexico_City'});
const p = await ctx.newPage();
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

/* Cada bloque arranca de cero: la app guarda en localStorage y una cotización a medias
   arrastrada del bloque anterior convierte cualquier fallo en un misterio. */
async function enBlanco(){
  await p.goto(B+'/index.html',{waitUntil:'load'});
  await p.evaluate(()=>{ try{ localStorage.clear(); }catch(_){} });
  await p.goto(B+'/index.html',{waitUntil:'load'});
  await p.waitForTimeout(1100);
}
/* Los tres obligatorios y el salto a partidas: es la puerta por la que pasa todo lo demás. */
async function conCliente(){
  await enBlanco();
  await p.fill('#f-cli','Farmacia San Juan');
  await p.fill('#f-tel','33 1234 5678');
  await p.fill('#f-proy','Letrero de fachada sucursal Centro');
  await p.waitForTimeout(400);
  await p.evaluate(()=>irAPantalla('partidas'));
  await p.waitForTimeout(400);
}
/* Una partida de letras completa, que es la que tiene precio y deja pasar la autorización. */
async function unaPartidaCompleta(){
  await p.click('.chip:has-text("Acero Inoxidable")');
  await p.fill('#h-1','40');
  await p.fill('#n-1','8');
  await p.waitForTimeout(400);
}

// ── 1. Reordenar arrastrando: las DOS direcciones ────────────────────────────
console.log('\nREORDENAR ARRASTRANDO: el filete dice «va aquí, antes de ésta» en las dos direcciones');
await conCliente();
const ponerABC = () => p.evaluate(()=>{
  while(Q.items.length<3) addItem({enfocar:false});
  Q.items[0].desc='A'; Q.items[1].desc='B'; Q.items[2].desc='C';
  renderItems();
});
/* Se disparan los eventos de arrastre de verdad —no se llama al reordenador por dentro—
   porque el índice del destino se mide DENTRO del manejador de `drop` y es exactamente ahí
   donde estaba el error. */
const soltar = (de,sobre) => p.evaluate(([a,b])=>{
  const ps=[...document.querySelectorAll('.partida')];
  const dt=new DataTransfer();
  ps[a].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
  ps[b].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
  return Q.items.map(x=>x.desc).join('');
},[de,sobre]);

await ponerABC();
const abajo = await soltar(0,2);
abajo==='BAC' ? bien('la 1 sobre la 3 (hacia abajo) deja BAC')
              : mal('la 1 sobre la 3 dejó '+abajo+' y el filete señalaba BAC');
await ponerABC();
const arriba = await soltar(2,0);
arriba==='CAB' ? bien('la 3 sobre la 1 (hacia arriba) deja CAB')
               : mal('la 3 sobre la 1 dejó '+arriba+', esperaba CAB');

// ── 2. El aviso de partidas sin terminar: los DOS caminos ────────────────────
console.log('\nPARTIDAS SIN TERMINAR: el mismo aviso por los dos botones que llevan a él');
await conCliente();
await unaPartidaCompleta();
await p.click('#addbtn');            // una segunda partida, en blanco
await p.waitForTimeout(500);

await p.click('button:has-text("Solicitar autorización a alguien más")');
await p.waitForTimeout(700);
(await p.$$('.falt-quitar')).length===1
  ? bien('por «Solicitar autorización a alguien más» sale «Quitar»')
  : mal('por «Solicitar autorización a alguien más» no sale «Quitar»');
await p.click('#faltmodal .modal-h button');
await p.waitForTimeout(300);
await p.evaluate(()=>reabrir());
await p.waitForTimeout(400);

await p.click('button:has-text("Autorizar yo mismo")');
await p.waitForTimeout(600);
await p.fill('#a-name','Elías');
await p.waitForTimeout(200);
await p.click('button:has-text("Autorizar precio")');
await p.waitForTimeout(800);
const quitar = await p.$$('.falt-quitar');
quitar.length===1
  ? bien('por «Autorizar yo mismo» también — y ése es el camino que se usa casi siempre')
  : mal('por «Autorizar yo mismo» no sale «Quitar»: la cotización ya está en «pendiente» y el candado del precio lo apagaba');
if (quitar.length===1){
  const antes = await p.evaluate(()=>Q.items.length);
  await quitar[0].click();
  await p.waitForTimeout(1000);
  const est = await p.evaluate(()=>({n:Q.items.length, estado:Q.estado, autorizador:Q.autorizador}));
  est.n===antes-1 ? bien('la partida vacía se fue ('+antes+' → '+est.n+')')
                  : mal('la partida vacía no se fue: '+JSON.stringify(est));
  est.estado==='autorizada' ? bien('y el aviso siguió solo con lo que se iba a hacer: autorizar')
                            : mal('tras quitarla el estado quedó en «'+est.estado+'», esperaba «autorizada»');
  /* Tocar la partida en vez de quitarla REABRE la cotización y borra estos dos campos. Que
     sobrevivan es la diferencia entre las dos salidas del aviso. */
  est.autorizador==='Elías' ? bien('el nombre de quien autoriza sobrevivió al quitado')
                            : mal('se perdió el nombre de quien autoriza: «'+est.autorizador+'»');
}

// ── 3. El proceso dice qué sigue en CADA estado ──────────────────────────────
console.log('\nEL PROCESO: en cada estado hay un siguiente paso escrito, y se puede tocar');
await conCliente();
await unaPartidaCompleta();
await p.waitForTimeout(400);

/* Lo que el proceso dice en este momento. `pasoActual()` y `siguientePaso()` son las dos
   funciones de las que salen la barra de pasos, la barra fija del teléfono y el renglón de
   «qué sigue»: si las tres se alimentan de aquí, no pueden contradecirse. */
const proceso = () => p.evaluate(()=>({
  paso: pasoActual(),
  sig: (()=>{ const s=siguientePaso(); return s?{txt:s.txt,paso:s.paso||null}:null; })(),
  estado: Q.estado,
  renglon: (document.getElementById('prog-next')||{}).textContent||'',
  apagado: !!(document.querySelector('.prog-box')||{}).disabled,
}));

let e = await proceso();
e.paso===2 ? bien('capturando: el proceso va en el paso 2') : mal('capturando, pasoActual() = '+e.paso);
/* La dirección es opcional y no bloquea nada, así que se pide al FINAL de la captura y solo
   mientras es borrador: es cuando todavía se está con el cliente al teléfono. */
e.sig && /direcci/i.test(e.sig.txt) && e.sig.paso===1
  ? bien('sin dirección y todavía en borrador, se pide la dirección: «'+e.sig.txt+'»')
  : mal('sin dirección, «qué sigue» dice '+JSON.stringify(e.sig)+', esperaba la dirección en el paso 1');

/* La dirección vive en el paso 1, así que se vuelve por la pestaña — que es justo el camino
   de vuelta que la barra tiene que ofrecer— y se regresa al 2. */
await p.evaluate(()=>irAPaso(1));
await p.waitForTimeout(400);
(await proceso()).paso===1 ? bien('la pestaña 1 lleva de vuelta al cliente') : mal('irAPaso(1) no volvió al paso 1');
await p.fill('#f-dir-raw','Av. Vallarta 1234, Guadalajara');
await p.waitForTimeout(500);
await p.evaluate(()=>irAPaso(2));
await p.waitForTimeout(400);
e = await proceso();
e.sig && /precio/i.test(e.sig.txt) && e.sig.paso===3
  ? bien('con la captura terminada, lo que sigue es el precio: «'+e.sig.txt+'»')
  : mal('con la captura terminada, «qué sigue» dice '+JSON.stringify(e.sig)+' — antes se apagaba en el 100 %');
!e.apagado ? bien('y el renglón de «qué sigue» sigue tocable') : mal('el renglón de «qué sigue» quedó apagado con la captura al 100 %');

await p.evaluate(()=>autorizarYoMismo()); await p.waitForTimeout(500);
e = await proceso();
e.paso===3 ? bien('mandada a autorización: el proceso va en el paso 3') : mal('en «pendiente», pasoActual() = '+e.paso);

await p.evaluate(()=>{ const n=document.getElementById('a-name'); if(n){n.value='Elías'; Q.autorizador='Elías';} autorizar(); });
await p.waitForTimeout(900);
e = await proceso();
e.estado==='autorizada' ? bien('autorizada') : mal('no llegó a autorizada: '+e.estado);
e.paso===4 ? bien('autorizada: el proceso va en el paso 4, la entrega') : mal('en «autorizada», pasoActual() = '+e.paso);
e.sig && /PDF/i.test(e.sig.txt)
  ? bien('y lo que sigue es el PDF: «'+e.sig.txt+'»')
  : mal('autorizada, «qué sigue» dice '+JSON.stringify(e.sig)+' — quedan tres pasos de entrega');

// ── 4. Los hitos de la entrega se recuerdan ──────────────────────────────────
console.log('\nLOS HITOS: la app se acuerda de lo que ya se hizo con esta cotización');
const hitos = () => p.evaluate(()=>hitosDe(Q.folio));
let h = await hitos();
(!h.pdf && !h.wa && !h.venta) ? bien('recién autorizada, ningún hito puesto') : mal('hitos de arranque: '+JSON.stringify(h));

/* Generar el PDF abre una ventana e imprime; en la prueba se marca el hito directamente,
   que es lo que interesa medir: que quede escrito y que sobreviva a una recarga. */
await p.evaluate(()=>marcarHito('pdf'));
await p.waitForTimeout(300);
h = await hitos();
h.pdf ? bien('tras generar el PDF, el hito queda escrito') : mal('el hito del PDF no quedó escrito');
e = await proceso();
e.sig && /whatsapp/i.test(e.sig.txt)
  ? bien('y «qué sigue» avanza al siguiente: «'+e.sig.txt+'»')
  : mal('con el PDF hecho, «qué sigue» dice '+JSON.stringify(e.sig));

await p.reload({waitUntil:'load'});
await p.waitForTimeout(1200);
h = await hitos();
h.pdf ? bien('y sigue ahí después de recargar') : mal('el hito del PDF se perdió al recargar');

// ── 5. El paso 2 de una cotización congelada tiene salida ───────────────────
console.log('\nEL PASO 2 CONGELADO: se puede leer, no tiene botones muertos y dice por dónde se destraba');
await p.evaluate(()=>irAPaso(2));
await p.waitForTimeout(500);
const congelado = await p.evaluate(()=>{
  const vis=id=>{const e=document.getElementById(id); if(!e) return null;
    const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;};
  return {paso:pasoActual(), addrow:vis('paso2-addrow'), aviso:vis('cand-partidas'),
    txt:(document.getElementById('cand-partidas-txt')||{}).textContent||'',
    partidas:document.querySelectorAll('.partida').length,
    /* Medir no es capturar: estos dos siguen abiertos a propósito. */
    escalar:!!vis('paso2-tools')};
});
congelado.partidas>0 ? bien('las partidas siguen a la vista: leerlas nunca estuvo prohibido')
                     : mal('las partidas desaparecieron del paso 2 congelado');
congelado.addrow===false ? bien('«+ Agregar partida» e «Igual que la anterior» no se quedan a la vista para negarse')
                         : mal('los botones de agregar siguen visibles y muertos en una cotización autorizada');
congelado.aviso===true ? bien('y hay una sola cosa tocable, con la puerta escrita: «'+congelado.txt.trim()+'»')
                       : mal('el paso 2 congelado no dice por dónde se destraba');
await p.click('#cand-partidas');
await p.waitForTimeout(700);
await p.evaluate(()=>Q.editMode) ? bien('tocarla abre el modo edición') : mal('tocar el aviso no destrabó nada');
(await p.evaluate(()=>{const e=document.getElementById('paso2-addrow'); const r=e.getBoundingClientRect(); return r.width>0;}))
  ? bien('y ahí sí vuelven los botones de agregar') : mal('en modo edición los botones de agregar siguen escondidos');

// ── 6. La partida: lo que se teclea una vez y lo que no se pisa ─────────────
console.log('\nCAPTURAR UNA PARTIDA: nada se teclea dos veces y nada de lo que puso una persona se pisa');
await conCliente();
/* La caja del contador siembra la descripción, que antes había que volver a teclear. */
await p.fill('.autoctr input','FARMACIA GDL');
await p.waitForTimeout(500);
let it = await p.evaluate(()=>({desc:Q.items[0].desc, n:Q.items[0].n, auto:!!Q.items[0].descAuto}));
it.desc==='FARMACIA GDL' && it.auto
  ? bien('el texto del letrero siembra la descripción: «'+it.desc+'»')
  : mal('la descripción no se sembró: '+JSON.stringify(it));
it.n===11 ? bien('y cuenta 11 letras') : mal('contó '+it.n+', esperaba 11');

/* Corregir «# Letras» a mano manda: volver a tocar el texto ya no se lo lleva. */
await p.fill('#n-1','13');
await p.waitForTimeout(400);
await p.fill('.autoctr input','FARMACIA GDLX');
await p.waitForTimeout(500);
it = await p.evaluate(()=>({n:Q.items[0].n, manual:!!Q.items[0].nManual,
  campo:document.getElementById('n-1').value,
  contador:(document.getElementById('acnt-1')||{}).textContent||''}));
it.n===13 ? bien('la cuenta corregida a mano sobrevive a seguir tecleando el texto')
          : mal('la cuenta se pisó: quedó en '+it.n+' y se había corregido a 13');
it.contador.startsWith('13') ? bien('y el contador de al lado dice lo mismo que el campo: «'+it.contador+'»')
                             : mal('el contador dice «'+it.contador+'» y el campo «'+it.campo+'»: dos números distintos');
await p.fill('.autoctr input','');
await p.waitForTimeout(400);
!(await p.evaluate(()=>Q.items[0].nManual)) ? bien('vaciar el texto le devuelve el mando al contador')
                                           : mal('con el texto vacío la cuenta sigue trabada a mano');

/* Escribir la descripción a mano apaga el sembrado. */
await p.fill('#d-1','Letrero de fachada, dos caras');
await p.waitForTimeout(400);
!(await p.evaluate(()=>Q.items[0].descAuto)) ? bien('escribir la descripción a mano apaga el sembrado')
                                            : mal('la app sigue creyendo que la descripción es suya');

/* La caja de luz ya no se autoelige la tarifa. */
await p.evaluate(()=>setTipo(Q.items[0].id,'caja'));
await p.waitForTimeout(500);
const caja = await p.evaluate(()=>({tarifa:Q.items[0].tarifa||0,
  sinElegir:!!document.querySelector('#p-1 .optgrp.falta'),
  falta:resumenPartida(Q.items[0]).filter(f=>f.estado==='falta').map(f=>f.txt)}));
!caja.tarifa ? bien('la caja de luz arranca sin tarifa: $3,900 dejó de ser una decisión que la app toma sola')
             : mal('la caja se autoeligió tarifa '+caja.tarifa);
caja.falta.some(t=>/tipo de caja/i.test(t)) ? bien('y lo dice: «'+caja.falta.join(' · ')+'»')
                                            : mal('la caja no reporta que falta el tipo: '+JSON.stringify(caja.falta));

/* Un campo numérico que el navegador no puede leer se reescribe con lo que la app leyó. */
await p.evaluate(()=>setTipo(Q.items[0].id,'letras'));
await p.waitForTimeout(400);
await p.evaluate(()=>{ const h=document.getElementById('h-1'); h.focus(); h.value='40 cm'; h.dispatchEvent(new Event('input',{bubbles:true})); h.blur(); });
await p.waitForTimeout(400);
const num = await p.evaluate(()=>({campo:document.getElementById('h-1').value, alt:Q.items[0].altura||0}));
num.campo==='' && !num.alt
  ? bien('«40 cm» no se queda en pantalla valiendo 0 por dentro: el campo se reescribe con lo que la app leyó')
  : mal('el campo dice «'+num.campo+'» y por dentro vale '+num.alt);
await p.evaluate(()=>{ const h=document.getElementById('h-1'); h.focus(); h.value='40.3'; h.dispatchEvent(new Event('input',{bubbles:true})); h.blur(); });
await p.waitForTimeout(400);
(await p.evaluate(()=>Q.items[0].altura))===40.5
  ? bien('y la altura se acomoda al medio centímetro que declara su propio step')
  : mal('40.3 quedó en '+(await p.evaluate(()=>Q.items[0].altura))+', esperaba 40.5');

/* El aviso de «falta material» deja el cursor EN el hueco, no en el marco. */
await p.evaluate(()=>{ Q.items[0].material=''; Q.items[0].matAuto=false; renderItems(); irAPendiente(); });
await p.waitForTimeout(700);
const foco = await p.evaluate(()=>{ const a=document.activeElement;
  return {cls:a?a.className:'', en:!!(a&&a.closest&&a.closest('.optgrp.falta'))}; });
foco.en ? bien('ir a lo que falta deja el cursor en el primer hueco de la partida, no en su marco')
        : mal('el foco quedó en «'+foco.cls+'», fuera del grupo en ámbar');

// ── 7. Lo que la app recuerda y lo que avisa antes de que duela ─────────────
console.log('\nMEMORIA Y AVISOS: el respaldo, el buscador, el aparato y el «sin guardar»');
await conCliente();
await unaPartidaCompleta();
await p.waitForTimeout(400);
await p.evaluate(()=>{autorizarYoMismo();}); await p.waitForTimeout(500);
await p.evaluate(()=>{const a=document.getElementById('a-name');if(a){a.value='Elías';Q.autorizador='Elías';}autorizar();});
await p.waitForTimeout(900);

/* El buscador del historial encuentra por fecha, por partida y por total: los tres datos que
   se ven en el renglón y que el filtro ignoraba. */
await p.evaluate(()=>abrirHistorial()); await p.waitForTimeout(600);
const busca = async q => { await p.fill('#hist-search',q); await p.waitForTimeout(300);
  return p.$$eval('.hentry',e=>e.length); };
const mes = (await p.evaluate(()=>Q.fechaAuth)).split(' ')[1] || 'ago';
(await busca(mes))===1 ? bien('busca por el mes que el propio renglón imprime: «'+mes+'»')
                       : mal('teclear «'+mes+'» no encuentra la cotización, y la fecha está a la vista');
(await busca('acero'))===1 ? bien('y por lo que se cotizó: «acero»')
                           : mal('teclear «acero» no encuentra la partida de acero inoxidable');
(await busca('20,416'))===1 ? bien('y por el total: «20,416»') : mal('teclear el total no encuentra nada');
(await busca('zzzz'))===0 ? bien('y lo que no existe no aparece') : mal('el filtro devuelve cosas que no coinciden');
await p.fill('#hist-search','');

/* El pie dice cuánto lleva sin respaldarse, que antes no estaba en ninguna parte. */
const nota = await p.$eval('#hist-nota',e=>e.textContent.trim());
/respald/i.test(nota) ? bien('el pie del historial dice el estado del respaldo: «'+nota+'»')
                      : mal('el pie no dice nada del respaldo: «'+nota+'»');
await p.evaluate(()=>cerrarHistorial()); await p.waitForTimeout(300);

/* La entrada guardada sabe de qué aparato salió: es lo que desempata dos COT-0001. */
const disp = await p.evaluate(()=>{const h=JSON.parse(localStorage.getItem('al3d_historial')||'[]'); return h[0]&&h[0].disp||'';});
/^[0-9A-Z]{4}$/.test(disp) ? bien('la cotización guardada sabe de qué aparato salió: '+disp)
                           : mal('la entrada del historial no trae el identificador del aparato: «'+disp+'»');

/* «Sin guardar» se queda puesto mientras el problema esté puesto. */
await p.evaluate(()=>{ _saveOk=false; pintarFolio(); }); await p.waitForTimeout(300);
const folio = await p.evaluate(()=>({txt:document.getElementById('folio').textContent,
  cls:document.getElementById('folio').className, t:document.getElementById('folio').title}));
/sin guardar/i.test(folio.txt) && /nosave/.test(folio.cls)
  ? bien('con el teléfono lleno, el folio lo dice y no se va: «'+folio.txt.trim()+'»')
  : mal('la condición «no se está guardando» sigue sin dejar marca: '+JSON.stringify(folio));
/espacio/i.test(folio.t) ? bien('y explica qué hacer al detenerse encima') : mal('el title no explica nada');
await p.evaluate(()=>{ _saveOk=true; pintarFolio(); }); await p.waitForTimeout(200);
!/sin guardar/i.test(await p.$eval('#folio',e=>e.textContent))
  ? bien('y se quita en cuanto vuelve a guardar') : mal('la marca de «sin guardar» se quedó pegada');

/* Cambiar de rol lleva a la pantalla de ese rol. */
await p.evaluate(()=>irAPaso(1)); await p.waitForTimeout(400);
await p.evaluate(()=>cambiarRol('autorizador')); await p.waitForTimeout(500);
!(await p.evaluate(()=>document.getElementById('sidebox').hidden))
  ? bien('el autorizador que cambia el rol llega a la pantalla donde vive su cola')
  : mal('la cola del autorizador quedó dentro de un elemento oculto');
await p.evaluate(()=>cambiarRol('vendedor')); await p.waitForTimeout(400);

// ── 8. Lo que el proceso tiene que recordar y nombrar ───────────────────────
console.log('\nEL PROCESO SE ACUERDA Y SE DEJA LEER');
await conCliente();
await unaPartidaCompleta();
await p.waitForTimeout(400);

/* Las cuatro pestañas tienen nombre accesible: en el corte angosto tres esconden su texto. */
const etiquetas = await p.$$eval('.paso-tab',e=>e.map(t=>t.getAttribute('aria-label')||''));
etiquetas.every(t=>/^Paso [1-4] de 4 · \S/.test(t))
  ? bien('las cuatro pestañas se anuncian con su nombre: «'+etiquetas[2]+'»')
  : mal('alguna pestaña se anuncia sin nombre: '+JSON.stringify(etiquetas));

/* El rol se guarda: antes se volvía vendedor al recargar. */
await p.evaluate(()=>cambiarRol('autorizador')); await p.waitForTimeout(500);
await p.reload({waitUntil:'load'}); await p.waitForTimeout(1300);
(await p.evaluate(()=>Q.rol))==='autorizador'
  ? bien('el rol elegido sobrevive a recargar') : mal('el rol volvió a vendedor al recargar');
await p.evaluate(()=>cambiarRol('vendedor')); await p.waitForTimeout(500);

await p.evaluate(()=>{autorizarYoMismo();}); await p.waitForTimeout(600);
/* Los renglones que el autorizador abre para comparar no se cierran al teclear. */
const idItem = await p.evaluate(()=>Q.items[0].id);
await p.evaluate(id=>toggleItemAuth(id),idItem); await p.waitForTimeout(300);
await p.fill('#a-precio','19000'); await p.waitForTimeout(500);
(await p.evaluate(id=>{const b=document.getElementById('ia-body-'+id);return b&&b.style.display!=='none';},idItem))
  ? bien('el renglón que se abrió para comparar sigue abierto al teclear el precio')
  : mal('el renglón se cerró solo: el formulario se reconstruye y no se acordaba');
/* Y el precio tecleado sigue ahí después de un repintado. */
await p.evaluate(()=>renderAuth()); await p.waitForTimeout(300);
(await p.$eval('#a-precio',e=>e.value))==='19000'
  ? bien('y el precio tecleado sobrevive al repintado') : mal('el precio tecleado se perdió');

await p.evaluate(()=>{const a=document.getElementById('a-name');if(a){a.value='Elías';Q.autorizador='Elías';}autorizar();});
await p.waitForTimeout(900);

/* El pliegue de otras salidas no se cierra al teclear el anticipo, que está al lado. */
await p.evaluate(()=>{const d=document.querySelector('details.otras-salidas'); if(d) d.open=true;});
await p.waitForTimeout(200);
await p.fill('#f-anti','6000'); await p.waitForTimeout(500);
(await p.evaluate(()=>!!document.querySelector('details.otras-salidas')?.open))
  ? bien('«otras salidas» sigue abierto después de teclear el anticipo')
  : mal('el pliegue se cerró solo al teclear el anticipo, que está a un renglón');

/* Los pasos 3 y 4 llevan a sitios distintos. */
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(300);
await p.evaluate(()=>irAPaso(4)); await p.waitForTimeout(600);
const yEntrega = await p.evaluate(()=>{const e=document.getElementById('entrega'); if(!e) return null;
  const r=e.getBoundingClientRect(); return r.top>=-5&&r.top<innerHeight;});
yEntrega ? bien('la pestaña 4 lleva a la entrega, no al principio de la columna')
         : mal('la pestaña 4 no dejó la entrega a la vista');

/* La caja de luz sin tipo elegido ya no se hace pasar por «Estándar» en el papel. */
const etiquetaCaja = await p.evaluate(()=>({sin:cajaTipoPdf({tarifa:0}), std:cajaTipoPdf({tarifa:3900}),
  nube:cajaTipoPdf({tarifa:4600}), custom:cajaTipoPdf({tarifa:5200})}));
etiquetaCaja.sin==='' && etiquetaCaja.std==='Estándar' && etiquetaCaja.nube==='Tipo Nube / Silueta' && etiquetaCaja.custom===''
  ? bien('el papel solo nombra el tipo de caja cuando alguien lo eligió: '+JSON.stringify(etiquetaCaja))
  : mal('el tipo de caja se inventa: '+JSON.stringify(etiquetaCaja));

/* Una sola firma para el papel, el WhatsApp y Canva. */
(await p.evaluate(()=>vendedorActual()))==='Elías'
  ? bien('el papel, el WhatsApp y Canva los firma quien autorizó') : mal('la firma no sigue a quien autorizó');

/* Y el historial dice qué se hizo con cada folio. */
await p.evaluate(()=>marcarHito('pdf')); await p.waitForTimeout(400);
await p.evaluate(()=>abrirHistorial()); await p.waitForTimeout(600);
const marca = await p.$$eval('.hentry-hitos',e=>e.map(x=>x.textContent.trim()));
marca.length===1 && /PDF generado/.test(marca[0])
  ? bien('el renglón del historial dice qué se hizo: «'+marca[0]+'»')
  : mal('el historial no enseña los hitos: '+JSON.stringify(marca));
await p.fill('#hist-search','PDF generado'); await p.waitForTimeout(300);
(await p.$$eval('.hentry',e=>e.length))===1
  ? bien('y se puede buscar por eso') : mal('buscar por el hito no encuentra la cotización');
await p.evaluate(()=>cerrarHistorial()); await p.waitForTimeout(300);

// ── 9. Nada se rompió por el camino ─────────────────────────────────────────
console.log('');
errs.length ? mal('errores de página: '+[...new Set(errs)].slice(0,3).join(' | '))
            : bien('cero errores de página en todo el recorrido');

console.log(fallos ? '\n'+fallos+' FALLO(S)' : '\nEl flujo del cotizador funciona por sus dos lados.');
await nav.close();
process.exit(fallos?1:0);
