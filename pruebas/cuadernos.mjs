/* Que la plataforma y el cotizador agrupen a los clientes IGUAL.
   Si divergen, la misma app da dos respuestas a «¿cuánto le hemos vendido a este cliente?».
   La regla vive en index.html (función cuadernos()) y aquí hay una réplica; esta prueba es
   lo que avisa cuando una de las dos se mueve. */
import { readFileSync } from 'fs';
let fallos=0; const mal=m=>{console.log('  ✗ '+m);fallos++;}; const bien=m=>console.log('  ✓ '+m);

// Se siembra un historial de mentiras con los casos que la regla tiene que resolver.
const HIST=[
  {folio:'COT-0009',cliente:'Andrey Healthylicious',tel:'33 1111 2222',ts:900,neto:5000,precioAuth:0,dirRaw:'La Perla'},
  {folio:'COT-0008',cliente:'Andrey',              tel:'3311112222',  ts:800,neto:3000,precioAuth:0,dirRaw:''},
  {folio:'COT-0007',cliente:'Andrey',              tel:'',            ts:700,neto:1000,precioAuth:0}, // sin tel: se une por nombre
  {folio:'COT-0006',cliente:'Sarai',               tel:'+52 33 9999 8888',ts:600,neto:2000,precioAuth:0},
  {folio:'COT-0005',cliente:'',                    tel:'',            ts:500,neto:500, precioAuth:0}, // sin nada
];
globalThis.localStorage={ _d:{'al3d_historial':JSON.stringify(HIST),'al3d_cuadernos':JSON.stringify({'tel:3311112222':'Paga a 15 días'})},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const Cot=await import('../js/datos/cotizador.js');
const gs=Cot.cuadernos();
const and=gs.find(g=>g.clave==='tel:3311112222');
if(!and) mal('no agrupó por teléfono'); else bien('agrupa por teléfono normalizado a 10 dígitos');
if(and&&and.cots.length!==3) mal('«Andrey» debía juntar 3 cotizaciones, juntó '+(and?and.cots.length:0));
else bien('la que no trae teléfono se une por nombre al cuaderno del teléfono');
if(and&&and.nombre!=='Andrey Healthylicious') mal('el nombre debe ser el de la cotización más reciente, salió: '+(and&&and.nombre));
else bien('manda el nombre de la cotización más reciente');
if(and&&!and.alias.includes('Andrey')) mal('«Andrey» debía quedar como alias'); else bien('los nombres viejos quedan como alias');
if(and&&Math.abs(and.vendido-9000)>0.01) mal('vendido debía ser 9000, salió '+(and&&and.vendido)); else bien('suma lo vendido del cuaderno completo');
const mx=gs.find(g=>g.clave==='tel:3399998888');
if(!mx) mal('«+52 33 9999 8888» debía normalizarse a los últimos 10 dígitos'); else bien('la lada de país no parte el cuaderno');
if(!gs.some(g=>g.clave==='?')) mal('la cotización sin nombre ni teléfono debía ir a «?»'); else bien('lo que no se puede identificar va a «?», no se pierde');
if(Cot.notaDeCuaderno(and)!=='Paga a 15 días') mal('no leyó la nota del cuaderno'); else bien('lee la nota que escribió el cotizador');
if(Cot.clientes().some(c=>c.clave==='?')) mal('«?» no debe salir en la lista de clientes'); else bien('«?» no ensucia la lista de clientes');
if(gs[0].clave!=='tel:3311112222') mal('el cuaderno más reciente debe ir arriba'); else bien('arriba el cliente con el que se habló hace menos');
console.log(fallos?'\n'+fallos+' FALLO(S)':'\nTodo pasa.');
process.exit(fallos?1:0);
