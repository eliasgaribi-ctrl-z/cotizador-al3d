/* ============================================================================
   Copia del catálogo de precios del cotizador.

   GENERADA. No la edites aquí: el catálogo vive en cotizador.html y se edita allá.
   Corre herramientas/extraer-catalogo.sh para regenerarla.

   Existe por un caso concreto: la plataforma se puede abrir sin que cotizador.html se haya
   cargado nunca en esa pestaña —es su propio documento—, así que no puede contar con que
   MATERIALES exista en window. Y necesita el catálogo para dos cosas que NO son dinero:
   poner la etiqueta legible de un material y derivar de qué está hecha una partida.

   LA REGLA, y es la que importa: con esto NO se recalcula dinero. Nunca. El importe de una
   partida vendida ya viene congelado en `_lt` dentro de la entrada del historial, y el del
   proyecto en `itemsAuth`. El cotizador congela esos números justo para que subir el precio
   del aluminio no reescriba hacia atrás lo que un cliente ya firmó; recalcular aquí sería
   deshacer esa protección desde otro archivo.
   ============================================================================ */

export const MATERIALES = [
  {key:'al-paint', label:'Aluminio Blanco/Negro/Pintado', precio:30, ilum:'LED posterior (cálida/fría)'},
  {key:'al-brush', label:'Aluminio Brush Cepillado',       precio:35, ilum:'LED posterior (cálida/fría)'},
  {key:'acr-vol',  label:'Acrílico + Aluminio (Volumen)',  precio:40, ilum:'LED fría frontal'},
  {key:'acr-vinil',label:'Acrílico + Vinil',               precio:45, ilum:'LED fría frontal'},
  {key:'acero',    label:'Acero Inoxidable',               precio:55, ilum:'LED posterior (cálida/fría)'},
];
export const COMPLEJIDAD = [
  {key:'recta',    label:'Recta',    extra:0},
  {key:'cursiva',  label:'Cursiva',  extra:5},
  {key:'compleja', label:'Compleja', extra:10},
];
export const CAJAS = [
  {key:'std',  label:'Estándar', tarifa:3900, desc:'Cuadrada / rectangular / circular'},
  {key:'nube', label:'Tipo nube / silueta', tarifa:4600, desc:'Silueta de logotipo o personaje'},
];
/* Recorte de acrílico: precio por cm de altura × pieza (igual que letras) */
export const RECORTES = [
  {key:'sencillo', label:'Sencillo', precio:20},
  {key:'vinil',    label:'Rotulación de vinil', precio:25},
  {key:'sandwich', label:'Tipo sándwich c/iluminación', precio:55},
];
export const RECORTE_COMP_EXTRA = 5; // complejidad opcional, solo para tipo sándwich
/* Bastidores: precio por metro cuadrado */
export const BASTIDORES = [
  {key:'lamina',    label:'Lámina',    tarifa:950},
  {key:'alucobond', label:'Alucobond', tarifa:1500},
];
export const TIPO_NOMBRE={letras:'Letras 3D',recorte:'Recorte acrílico',bastidor:'Bastidor',caja:'Caja de luz',manual:'Manual'};
export const TIPO_CORTO ={letras:'Letras',   recorte:'Recorte',         bastidor:'Bastidor',caja:'Caja',       manual:'Manual'};

/* Se cobra un mínimo de 1 m² en caja de luz y en bastidor. Va aquí porque la derivación de
   material tiene que saber que ESTE número es de precio y no de geometría: una caja de
   0.3 m² se COBRA como 1 m² y se FABRICA con 0.3. Comprar material por el área cobrada es
   comprar tres veces lo que se necesita. */
export const M2_MINIMO = 1;

export const matOf  = k => MATERIALES.find(m => m.key === k) || null;
export const compOf = k => COMPLEJIDAD.find(c => c.key === k) || null;
export const recOf  = k => RECORTES.find(r => r.key === k) || null;
export const basOf  = k => BASTIDORES.find(b => b.key === k) || null;
export const cajaOf = t => CAJAS.find(c => c.tarifa === Number(t)) || null;

export function catalogos() {
  return { MATERIALES, COMPLEJIDAD, RECORTES, BASTIDORES, CAJAS,
           RECORTE_COMP_EXTRA, TIPO_NOMBRE, TIPO_CORTO, M2_MINIMO };
}
