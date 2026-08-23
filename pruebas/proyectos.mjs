/* Prueba SOLO las dos funciones puras de datos/proyectos.js: tiposDerivados y
   nombreDerivado. Puras significa que corren en node sin DOM, sin localStorage y sin
   IndexedDB, y por eso se pueden probar sin montar nada. Es el criterio de éxito número 1
   del proyecto —`tipo_trabajo` lleno en el 100 % de las filas— así que tiene prueba propia.

   Corre:  node /tmp/probar-proyectos.mjs
   El código de salida es 0 si todo pasó y 1 si algo falló, para que un guion lo sepa. */

import { tiposDerivados, nombreDerivado, TIPOS_TRABAJO }
  from '../js/datos/proyectos.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que + '  ->  ' + a); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

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
eq('tipo que este archivo no conoce (el neón flex del futuro)',
   tiposDerivados([{ id: 9, tipo: 'neon' }]), ['Custome / Proyecto Especial']);
eq('partida de la IA sin `luz` -> se lee como CON luz',
   tiposDerivados([{ id: 9, tipo: 'letras', altura: 30, n: 4 }]), ['Letras 3D con iluminacion']);

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

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
