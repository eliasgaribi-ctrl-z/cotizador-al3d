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

// ── 6. Nada se rompió por el camino ─────────────────────────────────────────
console.log('');
errs.length ? mal('errores de página: '+[...new Set(errs)].slice(0,3).join(' | '))
            : bien('cero errores de página en todo el recorrido');

console.log(fallos ? '\n'+fallos+' FALLO(S)' : '\nEl flujo del cotizador funciona por sus dos lados.');
await nav.close();
process.exit(fallos?1:0);
