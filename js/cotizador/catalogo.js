/* ============================================================================
   Cotizador · catalogo.js

   Catálogo de precios. Es lo único de este directorio que se edita a mano cuando sube el aluminio; js/datos/catalogo-precios.js es su copia para la plataforma (herramientas/extraer-catalogo.sh).

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

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
const RECORTE_COMP_EXTRA = 5; // complejidad opcional, solo para tipo sándwich
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
   catálogo, la caja se describe sin apellido. */
const cajaOf=t=>CAJAS.find(c=>c.tarifa===Number(t))||null;
/* «Tipo Nube / Silueta» / «Estándar» — con las mayúsculas del papel, que no son las del chip. */
function cajaTipoPdf(it){
  const c=cajaOf(it&&it.tarifa);
  return c?(c.key==='nube'?'Tipo Nube / Silueta':'Estándar'):'';
}
const compOf=k=>COMPLEJIDAD.find(c=>c.key===k);
const recOf=k=>RECORTES.find(r=>r.key===k);
const basOf=k=>BASTIDORES.find(b=>b.key===k);
const factorOf=it=>((matOf(it.material)?.precio||0)+(compOf(it.comp)?.extra||0));

