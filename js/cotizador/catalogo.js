/* ============================================================================
   Cotizador · catalogo.js

   Catálogo de precios. Es lo único de este directorio que se edita a mano cuando sube el aluminio; js/datos/catalogo-precios.js es su copia para la plataforma (herramientas/extraer-catalogo.sh).

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   doce archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y las
   154 acciones que el marcado nombra (data-acc…, ver nucleo.js) se buscan por su nombre
   en ese ámbito. Portarlo a módulos ES las dejaría mudas en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== Catálogo de precios ===================== */
const MATERIALES = [
  {key:'al-paint', label:'Aluminio Blanco/Negro/Pintado', precio:30, ilum:'LED posterior (cálida/fría)'},
  {key:'al-brush', label:'Aluminio Brush Cepillado',       precio:35, ilum:'LED posterior (cálida/fría)'},
  {key:'acr-vol',  label:'Acrílico + Aluminio (Volumen)',  precio:40, ilum:'LED fría frontal'},
  {key:'acr-vinil',label:'Acrílico + Vinil',               precio:45, ilum:'LED fría frontal'},
  {key:'acero',    label:'Acero Inoxidable',               precio:55, ilum:'LED posterior (cálida/fría)'},
];
const COMPLEJIDAD = [
  {key:'recta',    label:'Recta',    extra:0},
  {key:'cursiva',  label:'Cursiva',  extra:5},
  {key:'compleja', label:'Compleja', extra:10},
];
const CAJAS = [
  {key:'std',  label:'Estándar', tarifa:3900, desc:'Cuadrada / rectangular / circular'},
  {key:'nube', label:'Tipo nube / silueta', tarifa:4600, desc:'Silueta de logotipo o personaje'},
];
/* Recorte de acrílico: precio por cm de altura × pieza (igual que letras) */
const RECORTES = [
  {key:'sencillo', label:'Sencillo', precio:20},
  {key:'vinil',    label:'Rotulación de vinil', precio:25},
  {key:'sandwich', label:'Tipo sándwich c/iluminación', precio:55},
];
/* `let` y no `const`: es el único precio que no vive en una lista, y la tabla de la hoja lo
   puede cambiar (js/cotizador/tarifas.js). */
let RECORTE_COMP_EXTRA = 5; // complejidad opcional, solo para tipo sándwich
/* ----- Menos de 10 cm no son letras 3D: son recorte de acrílico -----
   Una letra de menos de 10 cm no se fabrica con volumen. No hay canto que doblar, no cabe
   el LED dentro y la cara no se sostiene sobre un costado de esa medida: el taller la corta
   plana en acrílico. Así que a esa altura la partida no es «letras 3D» barata, es otro
   producto, con otro catálogo y otro precio.

   Es una regla de fabricación y no una preferencia de quien captura, así que la app la
   aplica sola cada vez que una altura entra en una partida —a mano, desde la IA, desde el
   escalador y desde el vectorizador— y «Letras 3D» se niega mientras la altura mida menos.
   Lo que NO se elige de oficio es el acabado del recorte: $20, $25 o $55 el centímetro es
   dinero, y el dinero lo decide una persona. */
const ALTURA_MIN_LETRAS = 10;
const alturaDeRecorte = h => { const v = +h || 0; return v > 0 && v < ALTURA_MIN_LETRAS; };
/* Bastidores: precio por metro cuadrado */
const BASTIDORES = [
  {key:'lamina',    label:'Lámina',    tarifa:950},
  {key:'alucobond', label:'Alucobond', tarifa:1500},
];
/* Nombre de cada tipo de partida. El corto es para el teléfono, donde los cinco
   botones tienen que caber en un solo renglón; el largo es el que se lee en todos
   los demás lados. */
const TIPO_NOMBRE={letras:'Letras 3D',recorte:'Recorte acrílico',bastidor:'Bastidor',caja:'Caja de luz',manual:'Manual'};
const TIPO_CORTO ={letras:'Letras',   recorte:'Recorte',         bastidor:'Bastidor',caja:'Caja',       manual:'Manual'};
const matOf=k=>MATERIALES.find(m=>m.key===k);
/* El tipo de caja se guarda como su tarifa, no como su clave, así que para saber cuál es hay
   que buscarla en el catálogo. Vivía escrito tres veces —en el PDF, en su descripción y en el
   texto de Canva— como `it.tarifa>=4600?'Tipo Nube / Silueta':'Estándar'`, y ese umbral
   inventado decía «Estándar» de tres cosas que no lo son: una tarifa personalizada por debajo
   de 4600, una por encima —que quedaba como «nube» sin serlo— y, desde que la caja dejó de
   autoelegirse su tarifa, una caja a la que nadie le ha elegido el tipo todavía. El papel que
   firma el cliente no puede nombrar un tipo que nadie escogió: si la tarifa no está en el
   catálogo, la caja se describe sin apellido.
   Desde que los precios se editan en la hoja (23-oct-2026) eso no basta: subir la estándar de
   $3,900 a $4,200 dejaría sin tipo a todas las cajas ya cotizadas a $3,900. Así que el chip guarda
   además la clave (`it.caja`), que manda cuando está; una tarifa tecleada a mano la quita
   (typeItem), y una partida de antes, sin clave, se sigue buscando por su tarifa. */
const cajaOf=(t,k)=>(k&&CAJAS.find(c=>c.key===k))||CAJAS.find(c=>c.tarifa===Number(t))||_cajaDeFabrica(t);
/* Una caja de antes de la clave, cotizada a $4,600 cuando la nube costaba eso, sigue siendo nube
   aunque Dirección la haya subido: se busca también entre las tarifas de FÁBRICA (tarifas.js las
   copia antes de aplicar la tabla de la hoja). */
function _cajaDeFabrica(t){
  const fab=(typeof _TAR_FABRICA!=='undefined'&&_TAR_FABRICA.caja)||[];
  const f=fab.find(c=>c.tarifa===Number(t));
  return f?(CAJAS.find(c=>c.key===f.key)||null):null;
}
const cajaDe=it=>it?cajaOf(it.tarifa,it.caja):null;
/* De qué se fabrica una entrada del catálogo: la de fábrica es ella misma; una agregada desde
   Ajustes dice `como` (tarifas.js). Lo que no es dinero —la iluminación, el texto del PDF, el
   material de compra— se decide con esta clave y no con la de la entrada. */
const baseDe=e=>e?(e.como||e.key):'';
/* «Tipo Nube / Silueta» / «Estándar» — con las mayúsculas del papel, que no son las del chip. */
function cajaTipoPdf(it){
  const c=cajaDe(it);
  return c?(baseDe(c)==='nube'?'Tipo Nube / Silueta':'Estándar'):'';
}
/* Lo que se ofrece en los chips: lo visible, más lo que la partida ya tiene aunque se haya
   ocultado —una partida no pierde su material de vista porque Dirección lo retiró del catálogo—. */
const ofrecer=(lista,actual)=>lista.filter(e=>!e.oculto||e.key===actual);
const compOf=k=>COMPLEJIDAD.find(c=>c.key===k);
const recOf=k=>RECORTES.find(r=>r.key===k);
const basOf=k=>BASTIDORES.find(b=>b.key===k);
const factorOf=it=>((matOf(it.material)?.precio||0)+(compOf(it.comp)?.extra||0));

