/* ============================================================================
   LA FICHA DE OBRA — lo que hay que saber de un anuncio antes de cotizarlo, antes de
   fabricarlo y antes de instalarlo. PURA: sin DOM, sin red, sin reloj. La usa el agente de
   ventas (supabase/functions/agente) y se prueba en node (pruebas/ficha-agente.mjs).

   De dónde sale. De las 76 «Órdenes de Fabricación» de 2025-2026 que viven en OneDrive
   (Subir Carpeta AL3D). Leídas una por una, lo que más se repite NO es una medida: son las
   notas que alguien tuvo que escribir a mano porque el dato no se preguntó a tiempo.
     · «Dirección DESCONOCIDA» en una de cada cuatro órdenes.
     · «El cliente debe proporcionar salidas eléctricas», en casi todas las que llevan luz.
     · «Texto chico … no lleva iluminación, led no entra por la altura de la letra».
     · «No incluye instalación a más de 6 mts», «Instalación incluida a no más de 4 mts»,
       «Incluye grúa articulada».
     · «Es necesario tener su logotipo editable, de lo contrario podría tener cambios mínimos».
   El agente no se acuerda de preguntar: la ficha se lo exige. Mientras falte una respuesta de
   la etapa, `preguntasPendientes` la devuelve, y sin preguntas pendientes y sin decisiones
   para Dirección no hay precio (`puedeCotizarSolo`).

   Las tres etapas, porque no todo se pregunta el primer día (Elías, 2026-10-24: los
   archivos para corte se trabajan DESPUÉS del anticipo):
     cotizar  → lo que cambia el precio o lo que decide si el agente puede darlo solo.
     fabricar → lo que el taller necesita y el cliente ya puede contestar con calma.
     instalar → lo que el instalador necesita el día de la cita.

   Lo que el agente cotiza solo: letras 3D, recorte, caja de luz y bastidor —los cuatro tipos
   que el catálogo sabe cobrar (precio.js)— SIN logotipo ni símbolo. Todo lo demás es una
   decisión de Dirección y sale en `decisionesParaDireccion` con su razón escrita, porque esa
   razón es lo que Elías lee en el teléfono para decidir en un toque.

   Lo que este archivo NO hace, a propósito:
   1. No inventa precios de lo que el catálogo no tiene (neón, tótem, señalética, instalación
      fuera de la zona, grúa, envío). Esos van a Dirección; el día que tengan tarifa, entran.
   2. No redondea medidas «a algo razonable». Una medida que salió de una foto se marca
      `medida_confirmada: false` y manda la partida a Dirección: un precio plausible y
      equivocado se va a una cotización real y cuesta dinero.
   ============================================================================ */

import { FABRICA, subtotal as subtotalDe, neto, linea } from './precio.js';

/* La misma regla que el cotizador (js/cotizador/catalogo.js, ALTURA_MIN_LETRAS): abajo de
   10 cm no hay canto que doblar ni cabe el LED; el taller lo corta plano. */
export const ALTURA_MIN_LETRAS = 10;

/* Las órdenes dicen 4, 5 y 6 m según el trabajo. Se toma la más baja: pasar de aquí manda
   la instalación a Dirección, y un aviso de más cuesta un toque; uno de menos es una grúa que
   nadie cobró. Cuando Elías diga su número, se cambia aquí y en ningún otro lado. */
export const ALTURA_INSTALACION_INCLUIDA_M = 4;

/* Dónde la instalación va incluida sin preguntar. Afuera (El Grullo, Aguascalientes,
   Michoacán, todos en las órdenes) el traslado se cobra y lo decide Dirección. */
export const MUNICIPIOS_ZMG = Object.freeze([
  'guadalajara', 'zapopan', 'tlaquepaque', 'san pedro tlaquepaque', 'tonala',
  'tlajomulco', 'tlajomulco de zuniga', 'el salto',
]);

/* Las tarifas de caja viven en la partida y no en la tabla (precio.js, `caja`): son las del
   catálogo del cotizador (CAJAS). */
export const TARIFA_CAJA = Object.freeze({ std: 3900, nube: 4600 });

export const TIPOS = Object.freeze({
  letras:        { nombre: 'Letras 3D',                  cotizaSolo: true },
  recorte:       { nombre: 'Recorte (acrílico o PVC)',   cotizaSolo: true },
  caja:          { nombre: 'Caja de luz',                cotizaSolo: true },
  bastidor:      { nombre: 'Bastidor',                   cotizaSolo: true },
  neon:          { nombre: 'Neón flex',                  cotizaSolo: false },
  totem:         { nombre: 'Tótem',                      cotizaSolo: false },
  senaletica:    { nombre: 'Señalética',                 cotizaSolo: false },
  placa:         { nombre: 'Placa de acrílico',          cotizaSolo: false },
  vinil:         { nombre: 'Rotulación de vinil',        cotizaSolo: false },
  mantenimiento: { nombre: 'Mantenimiento de letrero',   cotizaSolo: false },
  especial:      { nombre: 'Proyecto especial',          cotizaSolo: false },
});

const vacio = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0);
const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const lleva_luz = p => !!p && (p.luz === true || (['caja', 'neon'].includes(p.tipo) && p.luz !== false));
const esChica = p => !!p && ['letras', 'recorte'].includes(p.tipo) && Number(p.altura_cm) > 0 && Number(p.altura_cm) < ALTURA_MIN_LETRAS;

/** Cuántas letras cobra un texto: letras y números, más los signos que se fabrican como pieza
 *  (& # + @). Los espacios y la puntuación chica no son pieza. NFC primero, para que una «é»
 *  escrita como e + acento cuente una vez. */
export function contarLetras(texto) {
  const m = String(texto || '').normalize('NFC').match(/[\p{L}\p{N}&#+@]/gu);
  return m ? m.length : 0;
}

/* ============================================================================
   Las preguntas. Cada una: en qué etapa se necesita, a quién aplica, y cómo la diría Elías.

   EL ORDEN ES EL DE ELÍAS, sacado de sus 61 chats ganadores (octubre de 2026): primero el nombre
   y la empresa; luego qué quiere, las medidas y para cuándo; el logo y si lleva factura (casi
   siempre se pregunta antes de cotizar: cambia el IVA y la cuenta); dónde va; y al final el
   material, el color y la luz. `ORDEN` lo fija por campo, de proyecto o de partida, porque en
   sus chats se mezclan: las medidas de la partida van antes de la factura del proyecto.
   ============================================================================ */

const ORDEN = {
  contacto: 10, negocio: 11, partidas: 12,
  texto: 20, descripcion: 20, que_cambia: 20,
  altura_cm: 21, ancho_cm: 21, alto_cm: 22, medidas: 21, piezas: 21, fotos: 23,
  fecha_deseada: 30, lleva_logo: 31, factura: 32,
  entrega: 40, municipio: 41, lugar: 42, altura_m: 43,
  luz: 60, tono: 61,
};
const ordenDe = id => ORDEN[id] ?? 50;

const P_PROYECTO = [
  { id: 'contacto', etapa: 'cotizar', pregunta: '¿Cuál es tu nombre?' },
  { id: 'negocio', etapa: 'cotizar', pregunta: '¿De qué empresa o negocio nos contactas?' },
  { id: 'lleva_logo', etapa: 'cotizar', pregunta: '¿El letrero lleva logotipo o algún símbolo, o solo texto?' },
  { id: 'entrega', etapa: 'cotizar', pregunta: '¿Lo instalamos nosotros, pasas por él al taller o te lo enviamos por paquetería?' },
  { id: 'municipio', etapa: 'cotizar', aplica: f => f.entrega === 'instalacion', pregunta: '¿En qué municipio o colonia se instala?' },
  { id: 'lugar', etapa: 'cotizar', pregunta: '¿Va en interior o en exterior (le da el sol o la lluvia)?' },
  { id: 'altura_m', etapa: 'cotizar', aplica: f => f.entrega === 'instalacion', pregunta: '¿Más o menos a qué altura del piso va el letrero?' },
  { id: 'factura', etapa: 'cotizar', pregunta: '¿Vas a requerir factura?' },
  { id: 'fecha_deseada', etapa: 'cotizar', pregunta: '¿Para qué fecha lo necesitas?' },
  { id: 'archivo_editable', etapa: 'fabricar', aplica: f => f.lleva_logo === true,
    pregunta: '¿Tienes tu logotipo en archivo editable (AI, PDF, SVG o CDR)? Si no, lo redibujamos y puede haber cambios mínimos.' },
  { id: 'salidas_electricas', etapa: 'fabricar', aplica: f => (f.partidas || []).some(lleva_luz),
    pregunta: '¿Hay una salida eléctrica (110 V) detrás o cerca de donde va el letrero? La salida la proporciona el cliente.' },
  /* La factura se hace al liquidar, y el equipo pregunta «¿a qué razón social?» cada vez. */
  { id: 'datos_factura', etapa: 'fabricar', aplica: f => f.factura === true,
    pregunta: '¿Me compartes tu constancia de situación fiscal (CIF) para la factura?' },
  { id: 'direccion', etapa: 'instalar', aplica: f => f.entrega === 'instalacion' || f.entrega === 'paqueteria', pregunta: '¿Me compartes la dirección completa (o tu ubicación de Maps)?' },
  { id: 'superficie', etapa: 'instalar', aplica: f => f.entrega === 'instalacion',
    pregunta: '¿Sobre qué se instala: muro de concreto o ladrillo, tablaroca, vidrio, lámina o una estructura?' },
  { id: 'reglas_sitio', etapa: 'instalar', aplica: f => f.entrega === 'instalacion',
    pregunta: '¿Hay horario o reglas para instalar (plaza, condominio, parque industrial)?' },
];

/* Por tipo. `medida` marca las que cambian el precio: si salen de una foto, Dirección decide. */
const P_PARTIDA = {
  letras: [
    { id: 'texto', etapa: 'cotizar', pregunta: '¿Qué dice exactamente el letrero? Tal cual, con mayúsculas y acentos.' },
    { id: 'altura_cm', etapa: 'cotizar', medida: true, pregunta: '¿De qué altura quieres las letras (en cm)? Si no sabes, dime el ancho del muro y te propongo una.' },
    { id: 'material', etapa: 'cotizar', pregunta: '¿Qué acabado te late: aluminio pintado, aluminio cepillado, acrílico con aluminio (la cara se ilumina), acrílico con vinil o acero inoxidable?' },
    { id: 'luz', etapa: 'cotizar', pregunta: '¿Lleva luz?' },
    { id: 'tono', etapa: 'cotizar', aplica: p => p.luz === true, pregunta: '¿Luz blanca fría o cálida (amarillenta)?' },
    { id: 'comp', etapa: 'cotizar', pregunta: '¿La tipografía es recta, cursiva o con detalles finos?' },
    { id: 'colores', etapa: 'fabricar', pregunta: '¿De qué color exacto van las caras y los cantos? Si es metálico, ¿dorado o plata? ¿Mate o brillante?' },
  ],
  recorte: [
    { id: 'texto', etapa: 'cotizar', pregunta: '¿Qué dice exactamente? Tal cual, con mayúsculas y acentos.' },
    { id: 'altura_cm', etapa: 'cotizar', medida: true, pregunta: '¿De qué altura las letras o piezas (en cm)?' },
    { id: 'acabado', etapa: 'cotizar', pregunta: '¿Sencillo, con rotulación de vinil o tipo sándwich con luz?' },
    { id: 'colores', etapa: 'fabricar', pregunta: '¿De qué color el acrílico o el vinil?' },
    { id: 'montaje', etapa: 'fabricar', pregunta: '¿Pegado directo, separado de la pared o sobre una base de acrílico transparente?' },
  ],
  caja: [
    { id: 'ancho_cm', etapa: 'cotizar', medida: true, pregunta: '¿Qué medidas quieres la caja: ancho y alto (en cm)?' },
    { id: 'alto_cm', etapa: 'cotizar', medida: true, pregunta: '¿Y de alto (en cm)?' },
    { id: 'forma', etapa: 'cotizar', pregunta: '¿Rectangular o circular, o con la silueta de tu logo (tipo nube)?' },
    { id: 'vistas', etapa: 'cotizar', pregunta: '¿Se ve de un solo lado o de los dos (tipo bandera)?' },
    { id: 'luz', etapa: 'cotizar', pregunta: '¿Lleva luz?' },
    { id: 'tono', etapa: 'cotizar', aplica: p => p.luz !== false, pregunta: '¿Luz blanca fría o cálida?' },
    { id: 'colores', etapa: 'fabricar', pregunta: '¿De qué color exacto los cantos (mate o brillante)? La cara va en acrílico con tu diseño en vinil.' },
  ],
  bastidor: [
    { id: 'ancho_cm', etapa: 'cotizar', medida: true, pregunta: '¿Qué medidas del bastidor: ancho y alto (en cm)?' },
    { id: 'alto_cm', etapa: 'cotizar', medida: true, pregunta: '¿Y de alto (en cm)?' },
    { id: 'material', etapa: 'cotizar', pregunta: '¿En lámina galvanizada o en alucobond?' },
    { id: 'rotulacion', etapa: 'fabricar', pregunta: '¿Qué lleva encima: vinil de corte, vinil impreso o letras 3D?' },
  ],
  neon: [
    { id: 'ancho_cm', etapa: 'cotizar', medida: true, pregunta: '¿Qué medida aproximada, ancho y alto (en cm)?' },
    { id: 'alto_cm', etapa: 'cotizar', medida: true, pregunta: '¿Y de alto (en cm)?' },
    { id: 'colores', etapa: 'cotizar', pregunta: '¿De qué color o colores el neón?' },
    { id: 'base', etapa: 'cotizar', pregunta: '¿Base de acrílico transparente, espejo o negra?' },
  ],
  totem: [
    { id: 'alto_cm', etapa: 'cotizar', medida: true, pregunta: '¿Qué altura total y qué ancho tendría el tótem?' },
    { id: 'vistas', etapa: 'cotizar', pregunta: '¿Se ve de uno o de los dos lados?' },
    { id: 'cimentacion', etapa: 'cotizar', pregunta: '¿Ya hay cimentación o base donde va?' },
    { id: 'luz', etapa: 'cotizar', pregunta: '¿Lleva luz?' },
  ],
  senaletica: [
    { id: 'piezas', etapa: 'cotizar', pregunta: '¿Cuántas piezas y de qué medida cada una?' },
    { id: 'material', etapa: 'cotizar', pregunta: '¿En lámina, acrílico o alucobond? ¿Con poste?' },
    { id: 'lugar_detalle', etapa: 'cotizar', pregunta: '¿Interior o exterior? ¿Necesita vinil reflejante o antigrafiti?' },
  ],
  placa: [
    { id: 'ancho_cm', etapa: 'cotizar', medida: true, pregunta: '¿Qué medida la placa: ancho y alto (en cm)?' },
    { id: 'alto_cm', etapa: 'cotizar', medida: true, pregunta: '¿Y de alto (en cm)?' },
    { id: 'colores', etapa: 'cotizar', pregunta: '¿Acrílico transparente o espejo, y de qué colores el vinil?' },
  ],
  vinil: [
    { id: 'superficie', etapa: 'cotizar', orden: 20, pregunta: '¿Dónde va el vinil: vidrio, pared o vehículo (qué modelo)?' },
    { id: 'medidas', etapa: 'cotizar', medida: true, pregunta: '¿Qué medidas cubre (o qué partes del vehículo)?' },
    { id: 'impreso', etapa: 'cotizar', pregunta: '¿Vinil impreso a color o de corte en un solo color?' },
  ],
  mantenimiento: [
    { id: 'que_cambia', etapa: 'cotizar', pregunta: '¿Qué hay que cambiarle: la lona, la iluminación, la estructura?' },
    { id: 'medidas', etapa: 'cotizar', medida: true, pregunta: '¿Qué medidas tiene el letrero actual?' },
    { id: 'fotos', etapa: 'cotizar', pregunta: '¿Me mandas fotos de cómo está hoy, de frente y de lado?' },
  ],
  especial: [
    { id: 'descripcion', etapa: 'cotizar', pregunta: '¿Me platicas qué tienes en mente? Si tienes una imagen de referencia, mándamela.' },
    { id: 'medidas', etapa: 'cotizar', medida: true, pregunta: '¿Qué medidas aproximadas?' },
  ],
};

/* Los nombres de los campos que existen, para que el agente no le escriba a la ficha nada que no
   esté aquí (agente.js, `aplicarCambios`). */
export const CAMPOS_PROYECTO = Object.freeze(P_PROYECTO.map(q => q.id));
export const camposDePartida = tipo => (P_PARTIDA[tipo] || P_PARTIDA.especial).map(q => q.id);

const ETAPAS = ['cotizar', 'fabricar', 'instalar'];
const hasta = etapa => ETAPAS.slice(0, ETAPAS.indexOf(etapa) + 1);

/** Las preguntas que faltan para llegar a `etapa` (y las de las etapas anteriores), en el
 *  orden en que se hacen. Cada una dice dónde va la respuesta: `{donde:'proyecto'}` o
 *  `{donde:'partida', i}`. Una ficha sin partidas pregunta primero qué se quiere. */
export function preguntasPendientes(ficha, etapa = 'cotizar') {
  const f = ficha || {};
  const etapas = hasta(etapa);
  const out = [];
  for (const q of P_PROYECTO) {
    if (!etapas.includes(q.etapa)) continue;
    if (q.aplica && !q.aplica(f)) continue;
    if (vacio(f[q.id])) out.push({ id: q.id, etapa: q.etapa, pregunta: q.pregunta, donde: 'proyecto', orden: q.orden ?? ordenDe(q.id) });
  }
  const partidas = Array.isArray(f.partidas) ? f.partidas : [];
  if (!partidas.length) {
    out.unshift({ id: 'partidas', etapa: 'cotizar', donde: 'proyecto', orden: ordenDe('partidas'),
      pregunta: '¿Qué tienes en mente: letras 3D, caja de luz, recorte, neón u otra cosa? Si tienes foto de la fachada, mándamela.' });
  }
  partidas.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const lista = P_PARTIDA[p.tipo] || P_PARTIDA.especial;
    for (const q of lista) {
      if (!etapas.includes(q.etapa)) continue;
      if (q.aplica && !q.aplica(p)) continue;
      if (vacio(p[q.id])) out.push({ id: q.id, etapa: q.etapa, pregunta: q.pregunta, donde: 'partida', i, orden: q.orden ?? ordenDe(q.id) });
    }
    /* Una letra de menos de 10 cm ya no es letra 3D: es recorte, y el acabado del recorte es
       dinero ($20, $25 o $55 el cm). Como en el cotizador, eso no se elige de oficio. */
    if (p.tipo === 'letras' && esChica(p) && vacio(p.acabado)) {
      out.push({ id: 'acabado', etapa: 'cotizar', donde: 'partida', i, orden: ordenDe('altura_cm'),
        pregunta: 'A ' + Number(p.altura_cm) + ' cm la letra va en recorte plano (sin volumen ni luz): ¿sencillo o con rotulación de vinil?' });
    }
  });
  /* Lo de la etapa más temprana primero, aunque sea de una partida: nadie pregunta por la
     salida eléctrica antes de saber si el letrero lleva luz. Dentro de la etapa, el orden de
     Elías (ORDEN). El sort es estable: a igual orden, el de las listas. */
  return out.sort((a, b) => (ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa)) || (a.orden - b.orden));
}

/** Lo que el agente NO puede decidir solo, cada cosa con la razón que Elías lee en el teléfono. */
export function decisionesParaDireccion(ficha) {
  const f = ficha || {};
  const out = [];
  if (f.lleva_logo === true) out.push({ id: 'logo', razon: 'Lleva logotipo o símbolo: el criterio de cobro cambia por proyecto.' });
  (f.partidas || []).forEach((p, i) => {
    const t = TIPOS[p && p.tipo];
    if (!t) out.push({ id: 'tipo', i, razon: 'Partida sin tipo reconocido.' });
    else if (!t.cotizaSolo) out.push({ id: 'tipo', i, razon: t.nombre + ': no está en el catálogo, se cotiza a mano.' });
    if (p && p.medida_confirmada === false) out.push({ id: 'medida', i, razon: 'La medida de «' + (t ? t.nombre : 'la partida') + '» salió de una foto: el cliente no la confirmó.' });
  });
  if (f.entrega === 'instalacion') {
    const m = sinAcentos(f.municipio);
    if (m && !MUNICIPIOS_ZMG.some(z => m === z || m.includes(z))) out.push({ id: 'zona', razon: 'Instalación fuera de la zona metropolitana (' + f.municipio + '): falta cobrar el traslado.' });
    if (Number(f.altura_m) > ALTURA_INSTALACION_INCLUIDA_M) out.push({ id: 'altura', razon: 'Se instala a ' + f.altura_m + ' m: arriba de ' + ALTURA_INSTALACION_INCLUIDA_M + ' m puede pedir grúa.' });
  }
  if (f.entrega === 'paqueteria') out.push({ id: 'envio', razon: 'Va por paquetería: falta el costo del envío.' });
  return out;
}

/** Sí solo cuando ya no falta nada de la etapa «cotizar» y no hay nada que decida Dirección. */
export function puedeCotizarSolo(ficha) {
  return preguntasPendientes(ficha, 'cotizar').length === 0 && decisionesParaDireccion(ficha).length === 0;
}

/* ============================================================================
   De la ficha a las partidas del cotizador — el mismo formato que cobra precio.js.
   ============================================================================ */

const MATERIAL = { 'aluminio pintado': 'al-paint', 'aluminio cepillado': 'al-brush', 'acrilico con aluminio': 'acr-vol',
  'acrilico con vinil': 'acr-vinil', 'acero inoxidable': 'acero' };
const deMaterial = v => (FABRICA.material[v] !== undefined ? v : MATERIAL[sinAcentos(v)] || '');
const deComp = v => { const s = sinAcentos(v); return s.startsWith('curs') ? 'cursiva' : (s.startsWith('compl') || s.includes('detalle')) ? 'compleja' : 'recta'; };

/** Las partidas que el catálogo sabe cobrar, ya en el formato del cotizador. Una letra de
 *  menos de 10 cm se vuelve recorte, igual que en la app; las que no tienen tarifa no salen. */
export function aPartidasDelCotizador(ficha) {
  const items = [];
  (ficha && ficha.partidas || []).forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const id = i + 1;
    const altura = Number(p.altura_cm) || 0;
    const n = Number(p.n) || contarLetras(p.texto);
    if (p.tipo === 'letras' && !esChica(p)) {
      items.push({ id, tipo: 'letras', material: deMaterial(p.material), comp: deComp(p.comp), luz: p.luz === true,
        ilumTipo: sinAcentos(p.tono) === 'calida' ? 'calida' : 'fria', altura, n });
    } else if (p.tipo === 'letras' || p.tipo === 'recorte') {
      /* Sin acabado no hay precio (0), nunca uno elegido de oficio: ver preguntasPendientes. */
      items.push({ id, tipo: 'recorte', acab: p.acabado || '', recComp: false, altura, n });
    } else if (p.tipo === 'caja') {
      items.push({ id, tipo: 'caja', tarifa: TARIFA_CAJA[p.forma === 'nube' ? 'nube' : 'std'], ancho: Number(p.ancho_cm) || 0, alto: Number(p.alto_cm) || 0 });
    } else if (p.tipo === 'bastidor') {
      items.push({ id, tipo: 'bastidor', bas: sinAcentos(p.material) === 'alucobond' ? 'alucobond' : 'lamina', ancho: Number(p.ancho_cm) || 0, alto: Number(p.alto_cm) || 0 });
    }
  });
  return items;
}

/** El precio, solo si `puedeCotizarSolo`. Si no, `null`: el agente no da número. */
export function cotizar(ficha, M = FABRICA) {
  if (!puedeCotizarSolo(ficha)) return null;
  const items = aPartidasDelCotizador(ficha);
  const sub = subtotalDe(items, M);
  const iva = ficha.factura === true;
  return { items, renglones: items.map(it => ({ id: it.id, importe: linea(it, M) })), subtotal: sub, iva, total: +neto(sub, iva).toFixed(2) };
}

/* ============================================================================
   Las notas de la orden — las que hoy se escriben a mano en cada PDF.
   ============================================================================ */

export function notasDeOrden(ficha) {
  const f = ficha || {};
  const partidas = f.partidas || [];
  const notas = [];
  if (partidas.some(lleva_luz)) notas.push('El cliente debe proporcionar salidas eléctricas.');
  else if (partidas.length) notas.push('No incluye iluminación LED.');
  partidas.forEach(p => {
    const h = Number(p.altura_cm) || 0;
    if ((p.tipo === 'letras' || p.tipo === 'recorte') && h > 0 && h < ALTURA_MIN_LETRAS) {
      notas.push('Texto «' + (p.texto || '').trim() + '» de ' + h + ' cm: va en recorte plano, sin volumen y sin iluminación.');
    }
  });
  if (f.lugar === 'interior') notas.push('Pensado para interior (sin contacto con agua).');
  if (f.lleva_logo === true && f.archivo_editable === false) notas.push('Es necesario el logotipo editable; de lo contrario puede haber cambios mínimos.');
  if (f.entrega === 'instalacion') notas.push('Instalación incluida a no más de ' + ALTURA_INSTALACION_INCLUIDA_M + ' m de altura desde el piso.');
  if (f.entrega === 'recoleccion') notas.push('Entrega en taller.');
  if (f.entrega === 'paqueteria') notas.push('Envío por paquetería.');
  return notas;
}
