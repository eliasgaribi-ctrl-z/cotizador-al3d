/* Prueba SOLO las dos funciones puras de datos/proyectos.js: tiposDerivados y
   nombreDerivado. Puras significa que corren en node sin DOM, sin localStorage y sin
   IndexedDB, y por eso se pueden probar sin montar nada. Es el criterio de éxito número 1
   del proyecto —`tipo_trabajo` lleno en el 100 % de las filas— así que tiene prueba propia.

   Corre:  node /tmp/probar-proyectos.mjs
   El código de salida es 0 si todo pasó y 1 si algo falló, para que un guion lo sepa. */

import { tiposDerivados, nombreDerivado, TIPOS_TRABAJO }
  from '../js/datos/proyectos.js';
import { readFileSync } from 'fs';

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

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
