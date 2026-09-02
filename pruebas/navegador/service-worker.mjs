/* ¿Sobrevive la garantía «el cotizador abre sin señal» cuando a la plataforma le falta un
   archivo?

   Esta prueba existe por un incidente real: el PR se fusionó con la plataforma a medio
   construir, y sw.js pedía sus 25 archivos con addAll, que es todo-o-nada. Al faltar tres
   módulos, `install` fallaba, el service worker nuevo no activaba, y quien instalara la app
   POR PRIMERA VEZ se quedaba sin service worker — o sea sin el cotizador sin señal, que es
   la única razón por la que ese archivo existe. Para quien ya la tenía instalada no pasó
   nada, porque el viejo seguía sirviendo; el daño era invisible y solo para los nuevos.

   Necesita navegador y un servidor local, así que no entra en pruebas/correr.sh, que es de
   node puro. Se corre así, desde la raíz del repo:

     python3 -m http.server 8811 &
     PUERTO=8811 node pruebas/navegador/service-worker.mjs

   Y se corre con archivos FALTANDO a propósito: si algún día están todos, hay que borrar
   uno para que la prueba mida lo que dice medir.
*/
const PUERTO = process.env.PUERTO || '8811';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await nav.newContext({ serviceWorkers:'allow', locale:'es-MX' });
const p = await ctx.newPage();
const avisos=[]; p.on('console', m => { if(m.text().includes('[al3d]')) avisos.push(m.text()); });
await p.goto('http://127.0.0.1:'+PUERTO+'/cotizador.html', { waitUntil:'load' });
const listo = await p.evaluate(async () => {
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    await Promise.race([ navigator.serviceWorker.ready,
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('no activó en 15 s')),15000)) ]);
    return { ok:true, estado: reg.active ? 'activo' : (reg.installing?'instalando':'esperando') };
  } catch (e) { return { ok:false, error:String(e.message||e) }; }
});
await p.waitForTimeout(2500);
const cachés = await p.evaluate(async () => {
  const ks = await caches.keys(); const out = {};
  for (const k of ks) { const c = await caches.open(k); out[k] = (await c.keys()).length; }
  return out;
});
let fallos=0; const mal=m=>{console.log('  ✗ '+m);fallos++;}; const bien=m=>console.log('  ✓ '+m);
console.log('Con 3 de los 6 módulos de la plataforma FALTANDO (la condición que rompió main):\n');
if(!listo.ok) mal('el service worker no llegó a activar: '+listo.error);
else bien('el service worker instaló y activó ('+listo.estado+')');
const cot = cachés['al3d-v1'] || 0;
if(cot < 3) mal('la caché del cotizador quedó con '+cot+' archivos: se pierde abrir sin señal');
else bien('la caché del cotizador tiene '+cot+' archivos: sigue abriendo sin señal');
if (cachés['al3d-app-1'] !== undefined) mal('quedó una caché de plataforma a medias ('+cachés['al3d-app-1']+'): es la mezcla de versiones');
else bien('no quedó ninguna caché de plataforma a medias');
/* El console.warn del service worker NO llega aquí: vive en la consola del worker, que es
   un contexto aparte, y Playwright no la expone. Así que no se afirma sobre él. Lo que sí se
   afirma son las tres garantías que importan, y están arriba. El aviso existe para la
   persona que abra las herramientas del navegador el día que el mapa no abra sin señal. */
if(avisos.length) bien('además avisó en consola: ' + avisos[0].slice(0,95));
console.log('\ncachés:', JSON.stringify(cachés));
console.log(fallos?'\n'+fallos+' FALLO(S)':'\nPasa: la garantía del cotizador ya no depende de la plataforma.');
await nav.close(); process.exit(fallos?1:0);
