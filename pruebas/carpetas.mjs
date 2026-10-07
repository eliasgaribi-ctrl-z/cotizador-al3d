/* LAS CARPETAS DE DISEÑO: qué carpeta de Drive es la de cada proyecto (js/datos/carpetas.js).

   Lo que importa probar es lo que no se ve mirando: que con dos carpetas parecidas se pregunte
   en vez de adivinar —abrirle al taller el diseño de otro trabajo es peor que no abrirle
   nada—, que un nombre común («Daniel») no baste, y que la elección de Dirección mande sobre
   el nombre. Los nombres son los de la carpeta «AL3D» de verdad (octubre de 2026).

   Se corre con pruebas/correr.sh, como todas. */

import { buscar, parecido, normalizar, enlace, llavesDe } from '../js/datos/carpetas.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

const nombres = [
  'Diego - Herrajes Innova 2', 'Hector - Smufit Westrock (S2D Graficas)', 'Joaquin - Placita La Perla',
  'José - Kelvarion', 'Juan Carlos - Centro Dental', 'Litzy - Profix Soluciones',
  'Madre Maria - Colegio Madre Velarde', 'Sofia - Inhuman Movement',
  'Ale - Parentesis', 'Ale -Parentesis Coffee', 'Daniel - Tacos Juan', 'Daniel - YogoCup',
  'Andrey - Healthylicious', 'Erik - Healthylicious', 'Georgina - Arreglalo Valle Real',
  'Georgina -Arreglalo Aviacion', 'Ing. Luis - Rypaosa', 'Mireya - JM Dental',
];
const indice = { carpetas: nombres.map((n, i) => ({ id: 'ID' + String(i).padStart(10, '0'), nombre: n, ruta: '2026 › Trabajos Terminados', mod: i })), fijas: {} };
const nombreDe = r => r.carpeta ? r.carpeta.nombre : r.estado;

console.log('\n· normalizar');
eq('sin acentos ni signos', normalizar('José -  Kelvarión!'), 'jose kelvarion');

console.log('\n· la carpeta de cada proyecto');
eq('contacto y negocio exactos', nombreDe(buscar({ contacto: 'Juan Carlos', negocio: 'Centro Dental' }, indice)), 'Juan Carlos - Centro Dental');
eq('con acento distinto y apellido de más', nombreDe(buscar({ contacto: 'Jose Ramírez', negocio: 'Kelvarion' }, indice)), 'José - Kelvarion');
eq('solo el negocio', nombreDe(buscar({ negocio: 'Placita la Perla' }, indice)), 'Joaquin - Placita La Perla');
eq('nombre viejo con todo junto', nombreDe(buscar({ nombre: 'Litzy - Profix Soluciones' }, indice)), 'Litzy - Profix Soluciones');
eq('el negocio desempata a los dos Danieles', nombreDe(buscar({ contacto: 'Daniel', negocio: 'YogoCup' }, indice)), 'Daniel - YogoCup');
eq('el contacto desempata a los dos Healthylicious', nombreDe(buscar({ contacto: 'Erik', negocio: 'Healthylicious' }, indice)), 'Erik - Healthylicious');

console.log('\n· cuando no alcanza, se pregunta');
const par = buscar({ contacto: 'Ale', negocio: 'Parentesis' }, indice);
eq('Parentesis contra Parentesis Coffee', par.estado === 'una' ? par.carpeta.nombre : par.estado, 'Ale - Parentesis');
const hl = buscar({ negocio: 'Healthylicious' }, indice);
eq('dos Healthylicious sin contacto son «varias»', hl.estado, 'varias');
eq('…y enseña las dos', (hl.opciones || []).map(c => c.nombre).sort(), ['Andrey - Healthylicious', 'Erik - Healthylicious']);
eq('un nombre de pila solo no es una carpeta', buscar({ contacto: 'Daniel' }, indice).estado, 'ninguna');
eq('un cliente nuevo no tiene carpeta todavía', buscar({ contacto: 'Pedro', negocio: 'Ferretería El Clavo' }, indice).estado, 'ninguna');
eq('«Dental» suelto no es JM Dental ni Centro Dental', buscar({ contacto: 'Laura', negocio: 'Sonrisas Dental' }, indice).estado, 'ninguna');
eq('un proyecto vacío no se parece a nada', parecido({}, indice.carpetas[0]), 0);

console.log('\n· la elección de Dirección manda');
const fijo = { ...indice, fijas: { 'V-120': { id: 'ID0000000011', nombre: 'Daniel - YogoCup' } } };
eq('por el folio de la fila', nombreDe(buscar({ notion_page_id: 'V-120', contacto: 'Daniel', negocio: 'Tacos Juan' }, fijo)), 'Daniel - YogoCup');
eq('y dice que fue elegida', buscar({ notion_page_id: 'V-120' }, fijo).estado, 'fija');
eq('también para el importado de la hoja', buscar({ folio_hoja: 'V-120' }, fijo).estado, 'fija');
eq('las llaves, de la fila primero', llavesDe({ folio_global: 'COT-1@x', notion_page_id: 'V-9' }), ['V-9', 'COT-1@x']);

console.log('\n· el enlace');
eq('a la carpeta de Drive', enlace({ id: '1MJXS9yVbQXj1rvnsCOF4SJ5LwBS4TJ9N' }), 'https://drive.google.com/drive/folders/1MJXS9yVbQXj1rvnsCOF4SJ5LwBS4TJ9N');
eq('un id raro no arma enlace', enlace({ id: 'javascript:alert(1)' }), '');

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
