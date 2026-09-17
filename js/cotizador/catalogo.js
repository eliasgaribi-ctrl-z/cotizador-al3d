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
/* ----- Vigencia de una cotización -----
   Los términos del PDF dicen «La cotización es válida por 10 días» desde la primera versión, y
   era la única vez que la app nombraba ese plazo: ni el encabezado decía HASTA CUÁNDO, ni el
   WhatsApp, ni el historial sabía cuáles ya vencieron —que es justo la lista a la que hay que
   llamar—. La regla vive aquí, con las demás del negocio; de aquí la leen los términos, el
   encabezado del PDF, el mensaje de WhatsApp, la nota de «Autorizada» y el historial
   (vigenciaDe y fraseVigencia, en nucleo.js). */
const VIGENCIA_DIAS = 10;

/* ----- Los términos que imprime cada cotización -----
   Vivían dentro de generarPDF(), en entrega.js, y solo ahí; la página legal de la app (legal.html)
   los habría tenido que repetir a mano, y dos copias de un texto legal son dos textos legales al
   primer cambio. Aquí, con las demás reglas del negocio, y de aquí los leen el PDF y la página.
   `hasta` es la fecha de vigencia ya escrita —«26 sep 2026»— o '' para el texto general. Los puntos
   pueden traer <u>: quien los pinte los mete como HTML propio, no como texto de fuera.

   El apartado 8 dejó de amarrar dos cosas distintas en una sola frase: el depósito acepta los
   términos, y las imágenes del proyecto terminado se pueden usar en el portafolio SALVO que el
   cliente diga que no, sin que eso le cambie el precio ni el servicio. Un consentimiento que va
   pegado a pagar no es un consentimiento, y decirlo así también protege a AL3D: el que no quiere
   salir en el portafolio tiene una manera clara de decirlo antes, no un reclamo después. */
function terminosCotizacion(hasta){
  return [
    ['Pagos y Facturación',['50% de anticipo para comenzar fabricación.','50% al finalizar, debe liquidar en máximo 2 días posterior a la instalación.','<u>Excepción: proyectos mayores a $60,000 MXN.</u>','Si requiere factura, el anticipo es más IVA.','La cotización es válida por '+VIGENCIA_DIAS+' días'+(hasta?' — hasta el '+hasta:'')+'.']],
    ['Requisitos para Instalación',['En caso de que el proyecto lleve iluminación, el cliente debe proporcionar salida eléctrica detrás de donde se instalará el anuncio.','Área limpia, accesible y segura.','El cliente debe gestionar accesos, permisos y condiciones necesarias.','Cualquier retraso por falta de esto será responsabilidad del cliente.']],
    ['Modificaciones',['Cambios al diseño aprobado pueden generar costos y retrasos.','Deben ser autorizados previamente.','AL3D no responde por fallas si el cliente exige cambios fuera de especificación.']],
    ['Garantías',['1 año en material eléctrico.','2 años en colorimetría.','Se atiende según disponibilidad del equipo.','No aplica si fue instalado/modificado por terceros o expuesto a condiciones extremas.']],
    ['Cancelaciones y Penalizaciones',['El anticipo no es reembolsable.','Si se cancela con el proyecto iniciado o materiales comprados, se debe pagar el 100%.','Después de 10 días sin pago, AL3D puede retirar el anuncio.']],
    ['Uso y Responsabilidad',['Uso indebido o manipulación externa a nosotros.','Clima extremo.','Fallas estructurales del inmueble.'],'AL3D no se hace responsable por:'],
    ['Permisos',['El cliente debe tramitar los permisos.','AL3D no se hace responsable por multas o clausuras.']],
    ['Consentimiento y Uso de Imágenes',['<u>El depósito implica aceptación de todos estos términos.</u>','El cliente autoriza a AL3D a usar imágenes del proyecto terminado con fines promocionales y de portafolio, salvo que indique lo contrario por escrito o por WhatsApp antes de la instalación; negarse no cambia el precio ni el servicio.']],
  ];
}
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

