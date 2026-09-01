/* Que la plataforma y el cotizador agrupen a los clientes IGUAL.
   Si divergen, la misma app da dos respuestas a «¿cuánto le hemos vendido a este cliente?».
   La regla vive en index.html (función cuadernos()) y aquí hay una réplica; esta prueba es
   lo que avisa cuando una de las dos se mueve.

   La mitad de los casos son de HOMÓNIMOS, y no por gusto: dos clientes que se llaman igual
   es lo que rompió los cuadernos en la calle. Lo que se comprueba abajo es que no se junten
   —ni al agrupar el historial ni al preguntar por una cotización suelta— y que la app pueda
   decir cuál es cuál sin abrirlos. */
import { readFileSync } from 'fs';
let fallos=0; const mal=m=>{console.log('  ✗ '+m);fallos++;}; const bien=m=>console.log('  ✓ '+m);

// Se siembra un historial de mentiras con los casos que la regla tiene que resolver.
const HIST=[
  {folio:'COT-0009',cliente:'Andrey Healthylicious',tel:'33 1111 2222',ts:900,neto:5000,precioAuth:0,dirRaw:'La Perla',proy:'Letrero fachada'},
  {folio:'COT-0008',cliente:'Andrey',              tel:'3311112222',  ts:800,neto:3000,precioAuth:0,dirRaw:''},
  {folio:'COT-0007',cliente:'Andrey',              tel:'',            ts:700,neto:1000,precioAuth:0}, // sin tel: se une por nombre
  {folio:'COT-0006',cliente:'Sarai',               tel:'+52 33 9999 8888',ts:600,neto:2000,precioAuth:0},
  {folio:'COT-0005',cliente:'',                    tel:'',            ts:500,neto:500, precioAuth:0}, // sin nada
  /* Dos «Farmacia San Juan» que no tienen nada que ver: mismo nombre, dos teléfonos. */
  {folio:'COT-0004',cliente:'Farmacia San Juan',   tel:'33 4444 5555',ts:400,neto:7000,precioAuth:0,proy:'Letrero fachada'},
  {folio:'COT-0003',cliente:'Farmacia San Juan',   tel:'33 6666 7777',ts:300,neto:4000,precioAuth:0,proy:'Toldo'},
  /* Nombre nuevo con dígitos a medias que DESMIENTEN al único cuaderno de ese nombre. */
  {folio:'COT-0002',cliente:'Sarai',               tel:'33 12',       ts:200,neto:900, precioAuth:0},
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

/* ----- Homónimos: dos clientes distintos que se llaman igual ----- */
console.log('\n  — dos clientes con el mismo nombre —');
const f1=gs.find(g=>g.clave==='tel:3344445555'), f2=gs.find(g=>g.clave==='tel:3366667777');
if(!f1||!f2) mal('los dos «Farmacia San Juan» debían ser dos cuadernos');
else bien('mismo nombre y dos teléfonos son dos cuadernos, no uno');
if(f1&&f1.cots.length!==1) mal('el primer «Farmacia San Juan» quedó con '+f1.cots.length+' cotizaciones');
else if(f2&&f2.cots.length!==1) mal('el segundo «Farmacia San Juan» quedó con '+f2.cots.length+' cotizaciones');
else bien('los proyectos de uno no entran al cuaderno del otro');
if(f1&&Math.abs(f1.vendido-7000)>0.01) mal('lo vendido se cruzó: '+f1.vendido+' en vez de 7000');
else bien('lo vendido de cada uno es lo suyo');
if(!(f1&&f1.homonimo&&f2&&f2.homonimo)) mal('los dos debían quedar marcados como homónimos');
else bien('los homónimos quedan marcados, para que la pantalla los distinga');
if(and&&and.homonimo) mal('«Andrey» no tiene homónimo y quedó marcado'); else bien('el que no tiene homónimo no se marca');
if(f1&&f1.proy!=='Letrero fachada') mal('debía traer el proyecto más reciente, trajo: '+(f1&&f1.proy));
else bien('cada cuaderno trae su último proyecto, que es lo que distingue a dos homónimos');

/* La segunda «Sarai» trae «33 12»: no alcanza para formar cuaderno, pero desmiente al de
   «33 9999 8888». Unirla sería meter la cotización de una en el cuaderno de la otra. */
if(mx&&mx.cots.length!==1) mal('«33 12» no debía unirse al cuaderno de «33 9999 8888»');
else bien('unos dígitos que desmienten al teléfono del cuaderno impiden la unión');
if(!gs.some(g=>g.clave==='nom:sarai')) mal('la «Sarai» del teléfono a medias debía quedar en su propio cuaderno');
else bien('la que no se puede ubicar se queda a la vista, en su cuaderno');

/* ----- cuadernoDeEntrada: el teléfono manda y no hay premio de consolación ----- */
console.log('\n  — el cuaderno de una cotización suelta —');
const dePrimera=Cot.cuadernoDeEntrada({cliente:'Farmacia San Juan',tel:'33 6666 7777'});
if(!dePrimera||dePrimera.clave!=='tel:3366667777') mal('con teléfono debía dar el cuaderno de ESE teléfono');
else bien('con teléfono manda el teléfono, no el nombre');
const nuevo=Cot.cuadernoDeEntrada({cliente:'Farmacia San Juan',tel:'33 8888 9999'});
if(nuevo) mal('un teléfono nuevo con nombre repetido heredó el cuaderno de «'+nuevo.tel+'»');
else bien('un cliente nuevo que se llama como uno viejo NO hereda su cuaderno');
const ambiguo=Cot.cuadernoDeEntrada({cliente:'Farmacia San Juan',tel:''});
if(ambiguo) mal('sin teléfono y con dos homónimos eligió uno: '+ambiguo.tel);
else bien('sin teléfono y con dos candidatos no se adivina: no hay cuaderno');
const porNombre=Cot.cuadernoDeEntrada({cliente:'Andrey',tel:''});
if(!porNombre||porNombre.clave!=='tel:3311112222') mal('sin teléfono y con un solo candidato debía darlo');
else bien('sin teléfono, un nombre que señala a uno solo sí abre su cuaderno');

console.log(fallos?'\n'+fallos+' FALLO(S)':'\nTodo pasa.');
process.exit(fallos?1:0);
