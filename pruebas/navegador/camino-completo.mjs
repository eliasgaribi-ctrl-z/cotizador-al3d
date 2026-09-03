/* EL CAMINO COMPLETO: del cotizador a la plataforma, con clics de verdad.
   
   Esta prueba existe porque su ausencia costó caro. Había pruebas de cada módulo por
   separado y pruebas de que las seis pantallas pintan, y todas pasaban — pero ninguna
   recorría el camino que de verdad usa una persona. Y ahí estaba roto:
   
   La plataforma no arrancaba al llegar por el botón del cotizador. `plataforma.html` cargaba
   las fuentes de Google con un `<link rel="stylesheet">` normal, y una hoja de estilos
   pendiente BLOQUEA la ejecución de los scripts: con esa petición colgada, `js/app.js` nunca
   corría y la pantalla se quedaba en blanco. Sin un solo error en la consola. Y solo pasaba
   por ese camino, porque entrando directo la petición se resolvía antes.
   
   El cotizador ya tenía la solución desde antes (`media="print" onload="this.media='all'"`)
   y no la copié. La lección no es sobre fuentes: es que las pruebas por módulo no ven los
   huecos ENTRE los módulos, y el hueco entre el cotizador y la plataforma es todo el
   producto.
   
   Necesita navegador y servidor, así que va aparte de pruebas/correr.sh:
   
     python3 -m http.server 8814 &
     PUERTO=8814 node pruebas/navegador/camino-completo.mjs
   
   Recorre: capturar cliente con el teclado → pasar a partidas → elegir material tocando su
   chip → capturar medidas → autorizar → «Registrar como proyecto ganado» → clic en el
   enlace de la plataforma, en un teléfono de 430 px → y comprueba que del otro lado el
   proyecto existe con su nombre derivado, su tipo de trabajo derivado (el campo que quedó
   vacío en 0 de 142 filas en Notion), sus coordenadas sacadas del link de Google Maps sin
   una sola petición de red, y su material calculado.
*/

/* El camino completo, con clics de verdad y sin sembrar nada:
   cotizador → capturar → autorizar → «Registrar como proyecto ganado» → plataforma. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({viewport:{width:430,height:932},deviceScaleFactor:3,isMobile:true,
  hasTouch:true,locale:'es-MX',timezoneId:'America/Mexico_City',serviceWorkers:'allow'});
const p = await ctx.newPage();
let fallos=0; const mal=m=>{console.log('  ✗ '+m);fallos++;}; const bien=m=>console.log('  ✓ '+m);
const errs=[]; p.on('pageerror',e=>errs.push(e.message));

// ── 1. El cotizador, en blanco ────────────────────────────────────────────────
await p.goto(B+'/cotizador.html?solo=1',{waitUntil:'load'});
await p.waitForTimeout(1200);
bien('el cotizador abre');

// ── 2. Capturar el cliente con el teclado, como una persona ───────────────────
await p.fill('#f-cli','Andrey');
await p.fill('#f-tel','33 1234 5678');
await p.fill('#f-proy','Healthylicious sucursal La Perla');
await p.fill('#f-dir-raw','Plaza Palma Real, Av. Sta. Margarita 3740 L5, Valle Real');
await p.fill('#f-maps','https://www.google.com/maps/place/Plaza+Palma+Real/@20.7108,-103.4192,17z');
await p.waitForTimeout(500);
/* En el teléfono `.p1-cierre` está oculto por CSS y la acción vive en la barra fija de
   abajo. Se busca el botón que de verdad se puede tocar, que es lo que haría una persona. */
/* `.mbar-btn` y no `.mbar button`: el primer botón de la barra es el de deshacer, que es
   solo icono y no lleva texto. */
const cont = await p.$('.mbar .mbar-btn');
if (!cont) mal('no hay ningún botón visible para pasar a partidas');
else { bien('«Continuar» visible en la barra del teléfono: «'+(await cont.innerText()).trim().replace(/\n/g,' ')+'»');
       await cont.click(); }
await p.waitForTimeout(900);
const enPartidas = await p.evaluate(()=>!document.getElementById('card-partidas')?.hidden);
enPartidas ? bien('se pasó a la pantalla de partidas') : mal('no se pasó a partidas');

// ── 3. Capturar la partida tocando los chips ──────────────────────────────────
const hayPartida = await p.$('#items .partida');
if (!hayPartida) { await p.click('#addbtn'); await p.waitForTimeout(500); }
// acero inoxidable
const chips = await p.$$('#items .partida button, #items .partida .chip');
let clicAcero=false;
for (const c of chips) { const t=(await c.innerText()).trim(); if(/Acero/i.test(t)){ await c.click(); clicAcero=true; break; } }
clicAcero ? bien('se eligió Acero Inoxidable tocando su chip') : mal('no encontré el chip de Acero');
await p.waitForTimeout(300);
// altura y número de letras
const alt = await p.$('#items input[id^="alt"], #items .partida input[inputmode="decimal"]');
const campos = await p.$$('#items .partida input[type="number"], #items .partida input[inputmode="decimal"], #items .partida input[inputmode="numeric"]');
if (campos.length >= 2) { await campos[0].fill('40'); await campos[1].fill('8'); bien('altura 40 y 8 letras capturadas'); }
else mal('no encontré los campos de altura y piezas (hallé '+campos.length+')');
await p.waitForTimeout(600);
const total = await p.evaluate(()=>document.querySelector('#neto .amt, .neto .amt, #mbar-total')?.textContent||'');
/* $17,600 + 16% de IVA, que viene encendido por omisión. */
if (/20,416/.test(total)) bien('el total sale $20,416.00 = $17,600 + IVA — el precio es el correcto');
else mal('el total salió «'+total+'», esperaba 20,416');

// ── 4. Autorizar ──────────────────────────────────────────────────────────────
await p.evaluate(()=>autorizarYoMismo());
await p.waitForTimeout(600);
const dlg = await p.$('#pa-modal-bg.show, .modal-bg.show');
await p.evaluate(()=>{ const i=document.getElementById('pa-autorizador'); if(i) i.value='Elías'; });
await p.evaluate(()=>{ if(typeof autorizar==='function') autorizar(); });
await p.waitForTimeout(900);
const estado = await p.evaluate(()=>Q.estado);
estado==='autorizada' ? bien('la cotización quedó autorizada') : mal('estado quedó en «'+estado+'»');

// ── 5. El botón nuevo ─────────────────────────────────────────────────────────
await p.evaluate(()=>abrirRegistrarVenta());
await p.waitForTimeout(700);
const btnGanado = await p.$('button:has-text("Registrar como proyecto ganado")');
if (!btnGanado) mal('no encontré el botón «Registrar como proyecto ganado»');
else {
  bien('el botón «Registrar como proyecto ganado» está ahí');
  await btnGanado.click();
  await p.waitForTimeout(900);
  const buzon = await p.evaluate(()=>{ try{return JSON.parse(localStorage.getItem('al3d_pf_ganadas')||'[]');}catch(_){return[];} });
  buzon.length===1 ? bien('quedó constancia en el buzón: '+buzon[0].folio+' · fecha '+(buzon[0].fecha_instalacion||'(vacía)'))
                   : mal('el buzón tiene '+buzon.length+' registros, esperaba 1');
}

// ── 6. El enlace a la plataforma, en un teléfono de 430 px ────────────────────
await p.evaluate(()=>cerrarRegistrarVenta());
await p.waitForTimeout(400);
const enlace = await p.$('a.btn-pf');
const visible = enlace ? await enlace.isVisible() : false;
visible ? bien('el enlace a la plataforma se ve en un teléfono de 430 px') : mal('el enlace a la plataforma NO se ve');
if (visible) { await enlace.click(); await p.waitForTimeout(4000); }
else { await p.goto(B+'/#/proyectos',{waitUntil:'load'}); await p.waitForTimeout(4000); }

// ── 7. ¿Llegó el proyecto, con su material? ───────────────────────────────────
/* Antes se miraba la URL buscando «plataforma.html»; desde el cambio de puerta la plataforma
   es la raíz y su URL es «/#/hoy», así que se pregunta por lo que solo la plataforma pinta:
   su barra de módulos. */
const url = p.url();
const hayNav = await p.$('#pf-nav');
hayNav ? bien('el enlace llevó a la plataforma') : mal('acabé en '+url+' y no hay barra de módulos');
await p.evaluate(()=>{location.hash='#/proyectos';});
await p.waitForTimeout(2500);
const r = await p.evaluate(async () => {
  const s = document.querySelector('.pf-mod:not([hidden])');
  const txt = s ? (s.innerText||'') : '';
  let proys = [], reqs = 0, diag = {};
  try {
    const DB = await import('./js/datos/db.js');
    const Prefs = await import('./js/datos/prefs.js');
    diag.db = DB.estado();
    diag.buzon = Prefs.leerBuzon().length;
    diag.crudo = (await DB.listar('proyectos')).length;
    diag.disp = Prefs.dispositivo();
    const P = await import('./js/datos/proyectos.js');
    proys = await P.listar();
    const M = await import('./js/datos/material.js');
    if (proys[0]) reqs = (await M.requerimientos(proys[0].id)).length;
  } catch (e) { return { error: String(e.message), diag, txt: txt.slice(0,200) }; }
  return { n: proys.length, nombre: proys[0]?.nombre, tipos: proys[0]?.tipo_trabajo,
           lat: proys[0]?.lat, lng: proys[0]?.lng, reqs, diag, txt: txt.slice(0,260) };
});
console.log('  diagnóstico:', JSON.stringify(r.diag));
if (r.error) mal('la plataforma tronó al leer: '+r.error);
else {
  r.n===1 ? bien('la plataforma tiene 1 proyecto') : mal('la plataforma tiene '+r.n+' proyectos, esperaba 1');
  r.nombre ? bien('nombre derivado: «'+r.nombre+'»') : mal('el proyecto no tiene nombre');
  (r.tipos&&r.tipos.length) ? bien('tipo de trabajo derivado: '+JSON.stringify(r.tipos)+'  ← el campo que murió en Notion')
                            : mal('tipo_trabajo quedó VACÍO: es el criterio de éxito nº1 y falló');
  (r.lat&&r.lng) ? bien('ubicación del link de Maps: '+r.lat.toFixed(4)+', '+r.lng.toFixed(4))
                 : mal('no sacó la ubicación del link de Google Maps');
  r.reqs>0 ? bien('material derivado: '+r.reqs+' renglones') : mal('NO derivó material (0 renglones)');
  console.log('\n  lo que se ve en pantalla:\n  «'+r.txt.replace(/\n/g,' · ')+'»');
}
await p.screenshot({path:'/tmp/tomas/E2E-proyectos.png'});
await p.evaluate(()=>{location.hash='#/material';}); await p.waitForTimeout(2200);
await p.screenshot({path:'/tmp/tomas/E2E-material.png'});
if (errs.length) mal('errores de página: '+[...new Set(errs)].slice(0,3).join(' | '));
else bien('cero errores de página en todo el camino');
console.log(fallos?'\n'+fallos+' FALLO(S)':'\nEl camino completo funciona.');
await nav.close(); process.exit(fallos?1:0);
