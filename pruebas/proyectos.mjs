/* Prueba SOLO las funciones puras de datos/proyectos.js: tiposDerivados y nombreDerivado
   —y, al final, camposDelRecalculo y las de la venta que la hoja ya no tiene—. Puras significa que corren en node sin DOM, sin
   localStorage y sin IndexedDB, y por eso se pueden probar sin montar nada. Las dos primeras
   son el criterio de éxito número 1 del proyecto —`tipo_trabajo` lleno en el 100 % de las
   filas— así que tienen prueba propia.

   Corre:  node /tmp/probar-proyectos.mjs
   El código de salida es 0 si todo pasó y 1 si algo falló, para que un guion lo sepa. */

import { tiposDerivados, nombreDerivado, TIPOS_TRABAJO, camposDelRecalculo }
  from '../js/datos/proyectos.js';
import { readFileSync } from 'fs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que + '  ->  ' + a); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const ok_ = (que, cond) => { if (cond) { bien++; console.log('  ok   ' + que); } else { mal++; console.log('  FALLA ' + que); } };

/* Partidas como las guarda el cotizador. Los campos son los suyos: `luz` default true,
   `acab` solo en recorte, `bas` solo en bastidor. */
const letras = (o = {}) => ({ id: 1, tipo: 'letras', material: 'acero', comp: 'recta',
  luz: true, ilumTipo: 'fria', altura: 40, n: 8, ...o });
const caja = (o = {}) => ({ id: 2, tipo: 'caja', tarifa: 3900, ancho: 120, alto: 60, luz: true, ...o });
const recorte = (o = {}) => ({ id: 3, tipo: 'recorte', acab: 'sencillo', altura: 30, n: 2, luz: true, ...o });
const bastidor = (o = {}) => ({ id: 4, tipo: 'bastidor', bas: 'alucobond', ancho: 300, alto: 100, luz: true, ...o });
const manual = (o = {}) => ({ id: 5, tipo: 'manual', pz: 1, pu: 3500, desc: 'Instalación y viáticos', luz: true, ...o });

console.log('\nLOS SIETE VALORES, uno por uno');
eq('letras con luz',        tiposDerivados([letras()]),                     ['Letras 3D con iluminacion']);
eq('letras sin luz',        tiposDerivados([letras({ luz: false })]),       ['Letras 3D sin iluminacion']);
eq('caja con luz',          tiposDerivados([caja()]),                       ['Caja de luz con iluminacion']);
eq('caja sin luz',          tiposDerivados([caja({ luz: false })]),         ['Caja de luz sin iluminacion']);
eq('recorte acab vinil',    tiposDerivados([recorte({ acab: 'vinil' })]),   ['Rotulacion de vinil']);
eq('recorte sencillo',      tiposDerivados([recorte()]),                    ['Recorte acrilico']);
eq('recorte sandwich',      tiposDerivados([recorte({ acab: 'sandwich' })]),['Recorte acrilico']);
eq('partida manual',        tiposDerivados([manual()]),                     ['Custome / Proyecto Especial']);
eq('bastidor (sin valor propio entre los siete)',
   tiposDerivados([bastidor()]), ['Custome / Proyecto Especial']);

console.log('\nMEZCLA DE TRES TIPOS');
const mezcla = [letras(), caja({ luz: false }), recorte({ acab: 'vinil' })];
eq('letras+luz, caja sin luz, vinil', tiposDerivados(mezcla),
   ['Caja de luz sin iluminacion', 'Letras 3D con iluminacion', 'Rotulacion de vinil']);
/* El orden canónico es el del select, no el de las partidas: dos proyectos con las mismas
   partidas capturadas al revés tienen que dar el mismo array o no se pueden comparar. */
eq('mismas tres al revés dan el mismo array',
   tiposDerivados([...mezcla].reverse()), tiposDerivados(mezcla));
eq('cuatro letras iguales no repiten el valor',
   tiposDerivados([letras(), letras(), letras(), letras()]), ['Letras 3D con iluminacion']);
eq('los siete a la vez, en el orden del select',
   tiposDerivados([caja(), caja({ luz: false }), letras(), letras({ luz: false }),
                   recorte({ acab: 'vinil' }), recorte(), manual()]), TIPOS_TRABAJO);

console.log('\nQUE NUNCA QUEDE VACÍO NI TRUENE (es el criterio de éxito, no un extra)');
eq('sin partidas',            tiposDerivados([]),   []);
eq('items no es arreglo',     tiposDerivados(null), []);
eq('basura entre partidas',   tiposDerivados([null, 'x', letras()]), ['Letras 3D con iluminacion']);
/* La partida lleva altura y piezas a propósito: sin un solo dato capturado sería una partida
   EN BLANCO y no contaría, que es lo que prueba el bloque de aquí abajo. Lo que esta línea
   vigila es el MAPEO de un `tipo` que este archivo no conoce, no la criba. */
eq('tipo que este archivo no conoce (el neón flex del futuro)',
   tiposDerivados([{ id: 9, tipo: 'neon', altura: 25, n: 6 }]), ['Custome / Proyecto Especial']);
eq('partida de la IA sin `luz` -> se lee como CON luz',
   tiposDerivados([{ id: 9, tipo: 'letras', altura: 30, n: 4 }]), ['Letras 3D con iluminacion']);

/* ----- La partida en blanco no es un tipo de trabajo -----
   `addItem()` del cotizador siembra cada partida nueva en `tipo:'letras'` con `luz:true`, y
   esa plantilla llega al historial tal cual si la cotización se autoriza con el renglón
   todavía vacío —el aviso de partidas sin terminar tiene su «continuar de todos modos»—.
   Contarla le inventaba al proyecto un «Letras 3D con iluminacion» que nadie vendió, y con
   él un cubo de más en el plazo de taller, porque `plazoSugerido` suma uno por cada tipo
   distinto: un trabajo de puro vinil pasaba de 1 semana a 2.5. */
console.log('\nLA PARTIDA EN BLANCO NO INVENTA TRABAJO');
const enBlanco = (o = {}) => ({ id: 9, tipo: 'letras', material: '', matAuto: false,
  comp: 'recta', luz: true, ilumTipo: 'fria', altura: 0, n: 0, tarifa: 0, ancho: 0, alto: 0,
  acab: '', recComp: false, bas: '', desc: '', descAi: false, pz: 1, pu: 0, ...o });
eq('la que siembra addItem() no cuenta',      tiposDerivados([enBlanco()]), []);
eq('y no le añade un tipo a la que sí tiene', tiposDerivados([recorte({ acab: 'vinil' }), enBlanco()]),
   ['Rotulacion de vinil']);
eq('el material HEREDADO tampoco la llena (lo puso la app, no la persona)',
   tiposDerivados([enBlanco({ material: 'acero', matAuto: true })]), []);
eq('pero el elegido a mano sí',
   tiposDerivados([enBlanco({ material: 'acero', matAuto: false })]), ['Letras 3D con iluminacion']);
eq('y una descripción sola también: es trabajo capturado',
   tiposDerivados([enBlanco({ desc: 'Neón flex del letrero' })]), ['Letras 3D con iluminacion']);
eq('la caja con su tipo elegido y sin medidas cuenta (la tarifa es una decisión de precio)',
   tiposDerivados([enBlanco({ tipo: 'caja', tarifa: 4600 })]), ['Caja de luz con iluminacion']);
eq('el nombre tampoco la nombra',
   nombreDerivado({ folio: 'COT-0009', cliente: 'Ale', proy: 'Parentesis',
                    items: [recorte({ acab: 'vinil' }), enBlanco()] }, ['Rotulacion de vinil']),
   'Ale - Parentesis (Vinil)');

/* Las dos mitades de la misma regla: `partidaEnBlanco` aquí y `itemVacio` en el cotizador,
   que es un script clásico y no se puede importar. Si se separan, el vendedor ve un plazo y
   la plataforma escribe otro. Es la misma clase de prueba que `pruebas/taller.mjs` ya hace
   con las dos tablas de plazos. Se comparan los CAMPOS que mira cada una. */
const cot = readFileSync(new URL('../js/cotizador/ia.js', import.meta.url), 'utf8');
const cuerpoCot = (/function itemVacio\(it\)\{([\s\S]*?)\n\}/.exec(cot) || [, ''])[1];
const mio = readFileSync(new URL('../js/datos/proyectos.js', import.meta.url), 'utf8');
const cuerpoMio = (/export function partidaEnBlanco\(it\) \{([\s\S]*?)\n\}/.exec(mio) || [, ''])[1];
const campos = txt => [...new Set([...txt.matchAll(/it\.([a-zA-Z]+)/g)].map(m => m[1]))].sort();
eq('el cotizador y la plataforma miran los mismos campos para decir «en blanco»',
   campos(cuerpoMio), campos(cuerpoCot));

console.log('\nEL NOMBRE, CONTRA LA CONVENCIÓN REAL DE SU BASE DE NOTION');
const org = (o = {}) => ({ folio: 'COT-0007', cliente: 'Ale', proy: 'Parentesis', ...o });
eq('«Andrey - Healthylicious (Panel Alucobond)», tal cual está en su base',
   nombreDerivado({ folio: 'COT-0031', cliente: 'Andrey', proy: 'Healthylicious',
                    items: [bastidor()] }, ['Custome / Proyecto Especial']),
   'Andrey - Healthylicious (Panel Alucobond)');
eq('caja de luz con luz',
   nombreDerivado(org({ items: [caja()] }), ['Caja de luz con iluminacion']),
   'Ale - Parentesis (Caja Luz)');
eq('letras con luz',
   nombreDerivado(org({ cliente: 'Beto', proy: 'Tacos El Güero', items: [letras()] }),
                  ['Letras 3D con iluminacion']),
   'Beto - Tacos El Güero (Letras Luz)');
eq('letras sin luz',
   nombreDerivado(org({ items: [letras({ luz: false })] }), ['Letras 3D sin iluminacion']),
   'Ale - Parentesis (Letras)');
eq('recorte de vinil',
   nombreDerivado(org({ items: [recorte({ acab: 'vinil' })] }), ['Rotulacion de vinil']),
   'Ale - Parentesis (Vinil)');
eq('mezcla de tres',
   nombreDerivado(org({ items: mezcla }),
                  ['Caja de luz sin iluminacion', 'Letras 3D con iluminacion', 'Rotulacion de vinil']),
   'Ale - Parentesis (Letras Luz + Caja + Vinil)');
eq('cinco piezas distintas: tres etiquetas y la cuenta del resto',
   nombreDerivado(org({ items: [letras(), caja(), recorte({ acab: 'vinil' }), bastidor(), manual()] }), []),
   'Ale - Parentesis (Letras Luz + Caja Luz + Vinil +2)');
eq('dos letras iguales no duplican la etiqueta',
   nombreDerivado(org({ items: [letras(), letras()] }), ['Letras 3D con iluminacion']),
   'Ale - Parentesis (Letras Luz)');

console.log('\nEL NOMBRE CUANDO FALTA ALGO: nunca cadena vacía');
eq('sin partidas, con los siete valores',
   nombreDerivado(org(), ['Caja de luz con iluminacion']), 'Ale - Parentesis (Caja Luz)');
eq('sin negocio',        nombreDerivado({ cliente: 'Ale', items: [caja()] }, []), 'Ale (Caja Luz)');
eq('sin contacto',       nombreDerivado({ proy: 'Parentesis', items: [caja()] }, []), 'Parentesis (Caja Luz)');
eq('solo el folio',      nombreDerivado({ folio: 'COT-0042', items: [letras()] }, []), 'COT-0042 (Letras Luz)');
eq('nada de nada',       nombreDerivado(null, null), 'Sin nombre');
eq('sin partidas y sin tipos', nombreDerivado(org(), []), 'Ale - Parentesis');

/* ----- Recalcular sube el precio nuevo a la hoja -----
   `resincronizar` es «la única puerta por la que el importe cambia», y encolaba el cambio sin
   `campos`: `aNotion` no manda ni el nombre ni el dinero de una fila que ya existe si la
   operación no dice que eso cambió, así que la hoja seguía cobrando el precio viejo. */
console.log('\nRECALCULAR: LO QUE CAMBIÓ VIAJA, LO QUE NO, NO PISA LA HOJA');
const antes = { nombre: 'Ale - Parentesis (Caja Luz)', sub: 10000, iva: true, anti_pactado: 6000,
  origen: { folio: 'COT-0007', anti: 5800 } };
eq('subió el precio: viaja el subtotal', camposDelRecalculo(antes, { ...antes, sub: 12000, anti_pactado: 5800 }), ['sub']);
eq('cambió el nombre y el IVA', camposDelRecalculo(antes, { ...antes, nombre: 'Ale - Parentesis (Letras Luz)', iva: false, anti_pactado: 5800 }), ['nombre', 'iva']);
eq('el anticipo de la COTIZACIÓN cambió: viaja', camposDelRecalculo(antes, { ...antes, anti_pactado: 7000, origen: { anti: 7000 } }), ['anti_pactado']);
eq('nada cambió: no se pisa lo que PAGOS corrigió allá (ni el anticipo de 6,000 que bajó de la hoja)',
   camposDelRecalculo(antes, { ...antes, anti_pactado: 5800 }), []);
const { aNotion, P: COLS } = await import('../js/datos/puente.js');
ok_('y son nombres que `aNotion` entiende: el subtotal nuevo llega a su columna',
   aNotion({ ...antes, sub: 12000 }, null, { alta: false, campos: ['sub'] })[COLS.subtotal] === 12000 &&
   !(COLS.subtotal in aNotion({ ...antes, sub: 12000 }, null, { alta: false, campos: [] })));
ok_('resincronizar encola con esos campos',
   /await encolar\('actualizar', r\.valor, camposDelRecalculo\(p, r\.valor\)\);/.test(mio));

/* ----- La venta que la hoja ya no tiene, y la que está dos veces -----
   Las cuatro piezas puras con las que la capa de datos decide qué se marca, qué se junta sola
   y qué espera a Dirección. La decisión del dueño es que NADA se borre solo sin que se pueda
   decir qué se perdió: estas son las que lo dicen. El camino con base de datos (el relevo, la
   bandeja y la revisión al bajar) está en pruebas/puente.mjs. */
console.log('\nLA VENTA Y LA HOJA NO CUADRAN: QUÉ SE MARCA Y QUÉ SE JUNTA');
const { avisoDeHoja, marcaPerdida, huerfanasDeLaHoja, repetidasDeLaHoja, loQueSePerderia } =
  await import('../js/datos/proyectos.js');
const imp = (fh, o = {}) => ({ id: 'proy-hoja-' + fh, de_hoja: true, folio_hoja: fh, notion_page_id: fh, folio_global: '',
  etapa: 'ganado', nombre: 'Copia ' + fh, lat: null, lng: null, notas: '', plazo_k: null, ...o });
const propio = (fg, np, o = {}) => ({ id: 'proy-' + fg, folio_global: fg, notion_page_id: np, etapa: 'ganado',
  nombre: 'Propio ' + fg, lat: null, lng: null, notas: '', plazo_k: null, ...o });

eq('una bajada completa sin V-300: su tarjeta importada queda huérfana, la de V-301 no',
   huerfanasDeLaHoja([imp('V-300'), imp('V-301')], new Set(['V-301'])).map(p => p.id), ['proy-hoja-V-300']);
eq('sin un solo folio visto no se marca nada: una lectura vacía no es una hoja vacía',
   huerfanasDeLaHoja([imp('V-300')], new Set()), []);
eq('la venta de este teléfono no se marca por aquí: la marca el rebote de su cambio',
   huerfanasDeLaHoja([propio('COT-0001@A', 'V-9')], ['V-1']), []);
eq('ni lo que Dirección ya decidió dejar, ni la lápida',
   huerfanasDeLaHoja([imp('V-300', { fuera_de_hoja: 1 }), imp('V-302', { etapa: 'cancelado' })], ['V-1']), []);

const ventasHoja = [{ folio_hoja: 'V-310', folio_cotizacion: 'COT-0310@A' }, { folio_hoja: 'V-320', folio_cotizacion: '' },
  { folio_hoja: 'V-330', folio_cotizacion: 'V-330' }, { folio_hoja: 'V-340', folio_cotizacion: 'COT-9999@OTRO' }];
const tablero = [propio('COT-0310@A', 'V-310'), imp('V-310'), propio('COT-0320@A', 'V-320'), imp('V-320'),
  propio('COT-0330@A', 'V-330'), imp('V-330'), propio('COT-0340@A', 'V-340'), imp('V-340'), imp('V-350')];
const rep = repetidasDeLaHoja(tablero, ventasHoja);
eq('la copia es la misma venta por el folio de cotización de la fila, por su folio de hoja con la celda vacía y con la huella del defecto',
   rep.map(x => [x.copia.id, x.real && x.real.id]),
   [['proy-hoja-V-310', 'proy-COT-0310@A'], ['proy-hoja-V-320', 'proy-COT-0320@A'], ['proy-hoja-V-330', 'proy-COT-0330@A']]);
ok_('una fila atada a OTRA cotización no es la misma venta aunque el folio de hoja coincida',
   !rep.some(x => x.copia.id === 'proy-hoja-V-340'));
ok_('y sin la fila en el espejo no se decide nada', !rep.some(x => x.copia.id === 'proy-hoja-V-350'));
eq('dos proyectos de aquí con la misma venta: no se adivina con cuál juntarla',
   repetidasDeLaHoja([propio('COT-0310@A', 'V-310'), propio('COT-0311@A', 'V-310'), imp('V-310')],
                     [{ folio_hoja: 'V-310', folio_cotizacion: '' }]).map(x => [x.real, x.candidatos.length]), [[null, 2]]);

const claves = (c, r, ctx) => loQueSePerderia(c, r, ctx).map(x => x.clave);
eq('la copia igual o más atrasada no pierde nada: se junta sola',
   claves(imp('V-1', { etapa: 'cortado' }), propio('C', 'V-1', { etapa: 'armado' }), {}), []);
eq('la copia más adelantada sí: su etapa se perdería', claves(imp('V-1', { etapa: 'cortado' }), propio('C', 'V-1'), {}), ['etapa']);
eq('y sus notas, su pin y su plazo, si la de aquí no los tiene',
   claves(imp('V-1', { notas: 'llamar antes', lat: 20.6, lng: -103.3, plazo_k: 3 }), propio('C', 'V-1'), {}), ['notas', 'pin', 'plazo']);
eq('las mismas notas y el mismo pin no son pérdida',
   claves(imp('V-1', { notas: 'llamar antes', lat: 20.6, lng: -103.3 }), propio('C', 'V-1', { notas: 'x\nllamar antes', lat: 20.6, lng: -103.3 }), {}), []);
eq('dos instalaciones vivas, material de la copia, o la de aquí como «No se dio»: no se juntan',
   [claves(imp('V-1'), propio('C', 'V-1'), { instCopia: [{ estado: 'confirmada' }], instReal: [{ estado: 'propuesta' }] }),
    claves(imp('V-1'), propio('C', 'V-1'), { reqCopia: [{ id: 'r' }] }),
    claves(imp('V-1'), propio('C', 'V-1', { etapa: 'cancelado' }), {})],
   [['instalaciones'], ['material'], ['cancelada']]);
eq('una instalación cancelada de la de aquí no estorba', claves(imp('V-1'), propio('C', 'V-1'),
   { instCopia: [{ estado: 'confirmada' }], instReal: [{ estado: 'cancelada' }] }), []);

const m1 = marcaPerdida(null, 'borrada', 'V-404', 'La venta V-404 ya no está en la hoja', 1000);
eq('la marca dice por qué, qué fila y desde cuándo', [m1.motivo, m1.folio, m1.desde], ['borrada', 'V-404', 1000]);
ok_('el mismo rebote otra vez no reinicia la fecha', marcaPerdida(m1, 'borrada', 'V-404', 'otra vez', 5000) === m1);
eq('otro motivo sí es otra marca', marcaPerdida(m1, 'de_otra', 'V-404', '', 5000).desde, 5000);
eq('qué aviso lleva cada una: nada, perdida, repetida (manda sobre perdida), fuera, y la lápida ninguno',
   [avisoDeHoja({}), avisoDeHoja({ hoja_perdida: m1 }), avisoDeHoja({ duplicado_de: { id: 'x' }, hoja_perdida: m1 }),
    avisoDeHoja({ fuera_de_hoja: 1 }), avisoDeHoja({ etapa: 'cancelado', hoja_perdida: m1 })],
   ['', 'perdida', 'repetida', 'fuera', '']);

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
