/* ABRIR LA APP NO ES RECARGAR LA PÁGINA.

   `al3d_q` se guarda en cada tecla y vuelve entero al arrancar. Eso salva la captura cuando
   se recarga sin querer o cuando el teléfono mata la app mientras se adjunta el PDF en
   WhatsApp, y no se toca. Lo que costaba caro era devolverlo TODO, SIEMPRE y en silencio: al
   abrir la app al día siguiente la pantalla volvía con el cliente y el proyecto del último
   trabajo, y como el nombre del cliente vive en el paso 1 y se captura en el paso 2, las
   partidas nuevas se terminaban guardando a nombre del cliente anterior. El historial se
   quedaba con una cotización perfectamente plausible del cliente equivocado, sin rastro de
   que hubiera pasado nada.

   Esta prueba fija las tres reglas del arreglo, que es donde puede volver a romperse:

   · Recargar DENTRO de la misma sesión no cambia nada y no dice nada. Es lo que salva la
     captura, y si esta prueba se pusiera roja por aquí el arreglo estaría costando más de lo
     que arregla.
   · Abrir la app sobre una cotización que YA ESTÁ GUARDADA en el historial empieza en blanco.
     Nada se pierde —se comprueba la copia antes de soltarla— y la de antes sigue completa.
   · Abrir la app sobre la única copia que existe —un borrador a medias— no borra nada: la
     deja en pantalla con el aviso que dice de quién es.

   Una pestaña nueva del mismo navegador es exactamente «abrir la app»: comparte
   localStorage y estrena sessionStorage, que es la línea que el arreglo traza.

   Necesita navegador y un servidor, así que va en pruebas/navegador/:

     pruebas/correr.sh --navegador

   o a mano:

     python3 -m http.server 8814 &
     PUERTO=8814 node pruebas/navegador/cotizacion-de-antes.mjs
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({viewport:{width:1440,height:1000}, locale:'es-MX', timezoneId:'America/Mexico_City'});
await ctx.addInitScript({ path: decodeURIComponent(new URL('./hoja-de-mentiras.js', import.meta.url).pathname) });   // el notario, de mentiras
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const es   = (que, dio, esp) => (JSON.stringify(dio) === JSON.stringify(esp))
  ? bien(que) : mal(que + '  → dio ' + JSON.stringify(dio) + ', esperaba ' + JSON.stringify(esp));
const errs = [];

/* Una pestaña nueva: mismo localStorage, sessionStorage en blanco. O sea, abrir la app. */
async function abrirLaApp(){
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(1100);
  return p;
}
/* Lo que hay en pantalla, con las dos preguntas que importan: de quién es y qué folio lleva. */
const enPantalla = p => p.evaluate(()=>({
  folio:Q.folio, cliente:Q.cliente, proy:Q.proy, tel:Q.tel, estado:Q.estado,
  partidas:Q.items.filter(it=>!itemVacio(it)).length,
  aviso:(()=>{ const b=document.getElementById('cot-antes'); return (b&&!b.hidden)?b.textContent.replace(/\s+/g,' ').trim():''; })(),
}));
/* Una cotización capturada y autorizada, con clics de verdad: es la única forma de que el
   historial reciba lo que de verdad recibe. */
async function cotizarYAutorizar(p,{cliente,tel,proy}){
  await p.fill('#f-cli',cliente);
  await p.fill('#f-tel',tel);
  await p.fill('#f-proy',proy);
  await p.waitForTimeout(400);
  await p.evaluate(()=>irAPantalla('partidas'));
  await p.waitForTimeout(300);
  await p.click('.chip:has-text("Acero Inoxidable")');
  await p.fill('#h-1','40');
  await p.fill('#n-1','8');
  await p.waitForTimeout(400);
  await p.evaluate(()=>autorizarYoMismo());
  await p.waitForTimeout(400);
  await p.evaluate(()=>{ document.getElementById('a-name').value='Elías'; autorizar(); });
  await p.waitForTimeout(500);
}

// ── 1. La recarga de siempre: no cambia nada, no dice nada ───────────────────
console.log('\nRECARGAR NO ES ABRIR: el autoguardado sigue salvando la captura');
{
  const p = await abrirLaApp();
  await p.evaluate(()=>{ try{ localStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(900);
  await p.fill('#f-cli','Joaquín');
  await p.fill('#f-tel','33 1234 5678');
  await p.fill('#f-proy','Letrero de fachada');
  await p.waitForTimeout(500);
  const antes = await enPantalla(p);
  /* La misma pestaña: sessionStorage sobrevive, y eso es una recarga. */
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(1100);
  const despues = await enPantalla(p);
  es('la cotización a medias vuelve entera', {cliente:despues.cliente,tel:despues.tel,proy:despues.proy,folio:despues.folio},
     {cliente:antes.cliente,tel:antes.tel,proy:antes.proy,folio:antes.folio});
  es('y sin un aviso que nadie pidió', despues.aviso, '');
  await p.close();
}

// ── 2. Abrir la app sobre una AUTORIZADA: empieza en blanco ──────────────────
console.log('\nUNA AUTORIZADA YA CUMPLIÓ: lo que sigue después de ella es otra cotización');
{
  const p = await abrirLaApp();
  await p.evaluate(()=>{ try{ localStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(900);
  await cotizarYAutorizar(p,{cliente:'Joaquín',tel:'33 1234 5678',proy:'Letrero de fachada'});
  const cerrada = await enPantalla(p);
  es('queda autorizada en pantalla, como siempre', cerrada.estado, 'autorizada');
  await p.close();

  /* Al día siguiente se abre la app. Pestaña nueva: mismo localStorage, otra sesión. */
  const p2 = await abrirLaApp();
  const hoy = await enPantalla(p2);
  es('el cliente de ayer NO viene en el nombre', hoy.cliente, '');
  es('ni su proyecto', hoy.proy, '');
  es('ni su teléfono', hoy.tel, '');
  es('es un borrador en blanco', {estado:hoy.estado,partidas:hoy.partidas}, {estado:'borrador',partidas:0});
  es('con un folio nuevo, no el de la de ayer', hoy.folio !== cerrada.folio, true);
  const hist = await p2.evaluate(()=>getHistorial().map(e=>({folio:e.folio,cliente:e.cliente,proy:e.proy})));
  es('y la de ayer sigue completa en el historial', hist, [{folio:cerrada.folio,cliente:'Joaquín',proy:'Letrero de fachada'}]);

  /* Y el aviso deja volver: es el mismo «Deshacer» de vaciar. */
  await p2.evaluate(()=>deshacerVaciado());
  await p2.waitForTimeout(400);
  const vuelta = await enPantalla(p2);
  es('«Deshacer» la devuelve tal cual', {folio:vuelta.folio,cliente:vuelta.cliente,estado:vuelta.estado},
     {folio:cerrada.folio,cliente:'Joaquín',estado:'autorizada'});
  await p2.close();
}

// ── 3. Abrir la app sobre un BORRADOR a medias: no se borra, se avisa ────────
console.log('\nUN BORRADOR ES LA ÚNICA COPIA QUE HAY: no se toca, se dice de quién es');
{
  const p = await abrirLaApp();
  await p.evaluate(()=>{ try{ localStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(900);
  await p.fill('#f-cli','Joaquín');
  await p.fill('#f-tel','33 1234 5678');
  await p.fill('#f-proy','Letrero de fachada');
  await p.waitForTimeout(500);
  const medias = await enPantalla(p);
  await p.close();

  const p2 = await abrirLaApp();
  const hoy = await enPantalla(p2);
  es('el borrador sigue entero: no se borra trabajo que no está guardado en ningún lado',
     {cliente:hoy.cliente,tel:hoy.tel,proy:hoy.proy,folio:hoy.folio},
     {cliente:medias.cliente,tel:medias.tel,proy:medias.proy,folio:medias.folio});
  const aviso = hoy.aviso;
  es('pero la pantalla avisa de que venía de antes', /ya estaba en pantalla antes de abrir/.test(aviso), true);
  es('y lo dice nombrando al cliente, que es el dato que se pierde de vista', /Joaquín/.test(aviso), true);
  es('y el folio', aviso.includes(medias.folio), true);

  /* El aviso se ve en las DOS pantallas: el error se comete capturando partidas, que es
     donde el candado del cliente no se ve. */
  await p2.evaluate(()=>irAPantalla('partidas'));
  await p2.waitForTimeout(400);
  es('sigue a la vista en el paso 2, que es donde se captura', (await enPantalla(p2)).aviso !== '', true);

  /* Y se contesta de un toque, por sus dos lados. */
  await p2.evaluate(()=>seguirConLaDeAntes());
  await p2.waitForTimeout(300);
  es('«Sigo con ésta» lo apaga sin tocar la cotización',
     (await enPantalla(p2)).aviso + '|' + (await enPantalla(p2)).cliente, '|Joaquín');

  await p2.evaluate(()=>nueva());
  await p2.waitForTimeout(400);
  const limpia = await enPantalla(p2);
  es('y «Empezar una cotización nueva» deja la pantalla en blanco', {cliente:limpia.cliente,proy:limpia.proy,tel:limpia.tel}, {cliente:'',proy:'',tel:''});
  /* Con el MISMO folio, y está bien: un borrador nunca gasta uno. El contador solo avanza
     al autorizar, así que el número libre sigue siendo el mismo. */
  es('reusando el folio que el borrador nunca llegó a gastar', limpia.folio, medias.folio);
  es('y sin dejar el aviso puesto', limpia.aviso, '');
  await p2.close();
}

// ── 4. Y sobre una cotización en blanco, ni una palabra ──────────────────────
console.log('\nSIN NADA CAPTURADO NO HAY NADA QUE DECIR');
{
  const p = await abrirLaApp();
  await p.evaluate(()=>{ try{ localStorage.clear(); }catch(_){} });
  await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
  await p.waitForTimeout(900);
  await p.close();
  const p2 = await abrirLaApp();
  es('la app abre como abrió siempre', (await enPantalla(p2)).aviso, '');
  await p2.close();
}

es('cero errores de página', errs, []);
await nav.close();
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nAbrir la app ya no hereda la cotización de antes.');
process.exit(fallos ? 1 : 0);
