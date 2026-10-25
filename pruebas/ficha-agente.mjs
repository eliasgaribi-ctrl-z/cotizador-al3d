/* Prueba de la ficha de obra del agente de ventas (supabase/functions/_shared/ficha.js).

   Lo que se cuida aquí es lo que hoy se escribe a mano en las Órdenes de Fabricación porque
   no se preguntó a tiempo, y la frontera de lo que el agente puede cobrar solo:
     · qué pregunta falta en cada etapa, y que la de salidas eléctricas o la del archivo
       editable salgan solo cuando aplican;
     · que un logotipo, un tipo sin tarifa, una medida sacada de una foto, una instalación
       alta o fuera de la zona y un envío manden la ficha a Dirección, cada uno con su razón;
     · que el precio sea el del catálogo (precio.js) y que sin `puedeCotizarSolo` no haya número;
     · las notas de la orden, con los casos reales de las órdenes de 2025-2026.
   Node puro: sin DOM, sin base y sin red. */

import * as F from '../supabase/functions/_shared/ficha.js';
import { linea } from '../supabase/functions/_shared/precio.js';

let bien = 0, mal = 0;
const eq = (que, dio, esp) => {
  const ok = JSON.stringify(dio) === JSON.stringify(esp);
  console.log((ok ? '  ok   ' : '  FALLA ') + que);
  if (!ok) console.log('         dio: ' + JSON.stringify(dio) + '\n         esp: ' + JSON.stringify(esp));
  ok ? bien++ : mal++;
};
const cierto = (que, c) => eq(que, !!c, true);
const ids = l => l.map(q => q.id);

/* Una ficha que el agente puede cobrar sola, y de ahí cada caso le cambia algo. */
const TACOS = { tipo: 'letras', texto: 'TACOS', altura_cm: 40, material: 'acr-vol', luz: true, tono: 'fria', comp: 'recta', colores: 'blanco' };
const base = { negocio: 'Tacos Juan', lleva_logo: false, entrega: 'instalacion', municipio: 'Zapopan', lugar: 'exterior',
  altura_m: 3, factura: true, fecha_deseada: '2026-11-20', partidas: [TACOS] };
const con = (o, partidas) => ({ ...base, ...o, partidas: partidas || base.partidas });

console.log('\nCONTAR LETRAS');
eq('«Tacos Juan» son 9 (el espacio no es pieza)', F.contarLetras('Tacos Juan'), 9);
eq('«S&G» son 3 (el & se fabrica)', F.contarLetras('S&G'), 3);
eq('«#TSJ» son 4', F.contarLetras('#TSJ'), 4);
eq('«Café» con el acento separado cuenta 4', F.contarLetras('Café'), 4);
eq('vacío es 0', F.contarLetras(''), 0);

console.log('\nPREGUNTAS PENDIENTES');
eq('ficha vacía: primero qué quiere', F.preguntasPendientes({})[0].id, 'partidas');
eq('la ficha completa no pregunta nada para cotizar', F.preguntasPendientes(base, 'cotizar'), []);
eq('sin negocio ni factura', ids(F.preguntasPendientes(con({ negocio: '', factura: null }))), ['negocio', 'factura']);
eq('recolección no pregunta municipio ni altura', ids(F.preguntasPendientes(con({ entrega: 'recoleccion', municipio: '', altura_m: null }))), []);
eq('instalación sin municipio ni altura', ids(F.preguntasPendientes(con({ municipio: '', altura_m: null }))), ['municipio', 'altura_m']);
eq('letras sin altura ni luz: la del tono espera a saber si lleva luz',
  ids(F.preguntasPendientes(con({}, [{ tipo: 'letras', texto: 'TACOS', material: 'acr-vol', comp: 'recta' }]))), ['altura_cm', 'luz']);
eq('con luz, ya pregunta el tono',
  ids(F.preguntasPendientes(con({}, [{ ...TACOS, tono: '' }]))), ['tono']);
eq('una letra de 6 cm pide el acabado del recorte (es dinero)',
  ids(F.preguntasPendientes(con({}, [{ ...TACOS, altura_cm: 6 }]))), ['acabado']);
eq('fabricar con luz pide la salida eléctrica; sin logo no pide archivo',
  ids(F.preguntasPendientes(base, 'fabricar')), ['salidas_electricas']);
eq('fabricar con logo pide el archivo editable',
  ids(F.preguntasPendientes(con({ lleva_logo: true }), 'fabricar')), ['archivo_editable', 'salidas_electricas']);
eq('sin luz no hay salida eléctrica que pedir',
  ids(F.preguntasPendientes(con({}, [{ ...TACOS, luz: false, tono: '' }]), 'fabricar')), []);
eq('la caja lleva luz aunque nadie lo haya dicho todavía',
  ids(F.preguntasPendientes(con({}, [{ tipo: 'caja', ancho_cm: 200, alto_cm: 105, forma: 'std', vistas: 1, tono: 'fria', colores: 'blanco' }]), 'fabricar')),
  ['luz', 'salidas_electricas']);
eq('instalar: dirección, superficie y reglas del sitio',
  ids(F.preguntasPendientes({ ...base, salidas_electricas: 'hay' }, 'instalar')), ['direccion', 'superficie', 'reglas_sitio']);
eq('una partida null no tumba la ficha', ids(F.preguntasPendientes(con({}, [null, TACOS]))), []);

console.log('\nDECISIONES PARA DIRECCIÓN');
eq('la ficha base no pide nada a Dirección', F.decisionesParaDireccion(base), []);
eq('con logotipo', ids(F.decisionesParaDireccion(con({ lleva_logo: true }))), ['logo']);
eq('neón flex no tiene tarifa', ids(F.decisionesParaDireccion(con({}, [{ tipo: 'neon' }]))), ['tipo']);
eq('medida sacada de una foto', ids(F.decisionesParaDireccion(con({}, [{ ...TACOS, medida_confirmada: false }]))), ['medida']);
eq('El Grullo está fuera de la zona', ids(F.decisionesParaDireccion(con({ municipio: 'El Grullo, Jalisco' }))), ['zona']);
eq('Tlaquepaque con acento y apellido está dentro', F.decisionesParaDireccion(con({ municipio: 'San Pedro Tlaquepaque' })), []);
eq('a 10 m (tótem de Weco) va a Dirección', ids(F.decisionesParaDireccion(con({ altura_m: 10 }))), ['altura']);
eq('a 4 m justos todavía va incluida', F.decisionesParaDireccion(con({ altura_m: 4 })), []);
eq('la altura escrita como texto también cuenta', ids(F.decisionesParaDireccion(con({ altura_m: '6' }))), ['altura']);
eq('paquetería: falta el envío', ids(F.decisionesParaDireccion(con({ entrega: 'paqueteria' }))), ['envio']);
cierto('cada decisión trae su razón escrita', F.decisionesParaDireccion(con({ lleva_logo: true, entrega: 'paqueteria' })).every(d => d.razon.length > 10));

console.log('\nEL PRECIO');
const c = F.cotizar(base);
eq('TACOS 40 cm acrílico con aluminio con luz: 40 × 40 × 5', c.subtotal, 8000);
eq('con factura lleva IVA', c.total, 9280);
eq('sin factura no', F.cotizar(con({ factura: false })).total, 8000);
eq('«Louis Café» aluminio cepillado sin luz: 35 × 30 × 9 × 0.8',
  F.cotizar(con({ factura: false }, [{ tipo: 'letras', texto: 'Louis Café', altura_cm: 30, material: 'aluminio cepillado', luz: false, comp: 'recta', colores: 'negro' }])).total, 7560);
eq('«Salon de Eventos» a 6 cm con vinil es recorte: 25 × 6 × 14',
  F.cotizar(con({ factura: false }, [{ ...TACOS, texto: 'Salon de Eventos', altura_cm: 6, acabado: 'vinil' }])).total, 2100);
eq('caja tipo nube de 1.20 × 0.71 cobra el metro mínimo',
  F.cotizar(con({ factura: false }, [{ tipo: 'caja', ancho_cm: 120, alto_cm: 71, forma: 'nube', vistas: 1, luz: true, tono: 'fria' }])).total, 4600);
eq('caja estándar de 2 × 1.05 (Bendito Frozen)',
  F.cotizar(con({ factura: false }, [{ tipo: 'caja', ancho_cm: 200, alto_cm: 105, forma: 'std', vistas: 1, luz: true, tono: 'fria' }])).total, 8190);
eq('bastidor de lámina de 4.70 × 1 (Tacos Los Compadres)',
  F.cotizar(con({ factura: false }, [{ tipo: 'bastidor', ancho_cm: 470, alto_cm: 100, material: 'lamina' }])).total, 4465);
eq('con logotipo no hay número', F.cotizar(con({ lleva_logo: true })), null);
eq('con una pregunta pendiente tampoco', F.cotizar(con({ factura: null })), null);
const it = F.aPartidasDelCotizador(base)[0];
eq('el renglón es el mismo que cobra precio.js', F.cotizar(base).renglones[0].importe, linea(it));
eq('«con detalles finos» es complejidad compleja', F.aPartidasDelCotizador(con({}, [{ ...TACOS, comp: 'con detalles finos' }]))[0].comp, 'compleja');
eq('un recorte sin acabado no se cobra de oficio', F.aPartidasDelCotizador(con({}, [{ tipo: 'recorte', texto: 'AB', altura_cm: 20 }]))[0].acab, '');
eq('el neón no sale como partida del cotizador', F.aPartidasDelCotizador(con({}, [{ tipo: 'neon' }])), []);

console.log('\nNOTAS DE LA ORDEN');
eq('con luz, instalada', F.notasDeOrden(base),
  ['El cliente debe proporcionar salidas eléctricas.', 'Instalación incluida a no más de 4 m de altura desde el piso.']);
eq('sin luz, entrega en taller', F.notasDeOrden(con({ entrega: 'recoleccion' }, [{ ...TACOS, luz: false }])),
  ['No incluye iluminación LED.', 'Entrega en taller.']);
eq('texto chico en recorte (Tres Jotas Salón)', F.notasDeOrden(con({ entrega: 'recoleccion' }, [TACOS, { tipo: 'recorte', texto: 'Salon de Eventos ', altura_cm: 6 }]))[1],
  'Texto «Salon de Eventos» de 6 cm: va en recorte plano, sin volumen y sin iluminación.');
cierto('interior (Salon Amour)', F.notasDeOrden(con({ lugar: 'interior' })).includes('Pensado para interior (sin contacto con agua).'));
cierto('logo sin archivo editable (Psicología Irma)', F.notasDeOrden(con({ lleva_logo: true, archivo_editable: false })).some(n => /editable/.test(n)));
eq('sin partidas no hay notas de luz', F.notasDeOrden({}), []);

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
