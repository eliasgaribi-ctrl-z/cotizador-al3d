/* Prueba de los datos para la entrega (js/datos/datos-de-entrega.js) y del link corto de Maps
   (`resolverLink` de js/datos/geo.js).

   El caso que la originó: en octubre de 2026 ningún proyecto tenía teléfono ni dirección, porque
   ni «Se ganó» ni «Registrar nueva venta» los pedían, y los links de Maps que llegan por WhatsApp
   son cortos (maps.app.goo.gl) y la plataforma no los leía. Lo que se cuida aquí:
     · qué le falta a cada proyecto según cómo se entrega —la recolección no pide dirección, el
       envío no pide pin— y que «Todavía no la tengo» no quite la falta;
     · el orden de «Faltan datos» del Tablero: la entrega más cercana primero;
     · lo que el bloque de captura deja guardar en «Se ganó» y en «Completar»;
     · el link corto: con señal se sigue con `/expandir` (simulado) y sale el pin; sin señal queda
       pendiente, guardado, y la sincronización lo termina.
   Node puro: sin DOM, sin base y sin red. */

import * as DD from '../js/datos/datos-de-entrega.js';
import { resolverLink } from '../js/datos/geo.js';
import { ubicacionDeHoja, desdeVentaDeHoja, puedeEscribir } from '../js/datos/proyectos.js';
import { ventaDeHoja } from '../js/datos/puente.js';
import { extraParaGanar, parcheDe } from '../js/mod/datos-entrega.js';

let bien = 0, mal = 0;
const eq = (que, dio, esp) => {
  const ok = JSON.stringify(dio) === JSON.stringify(esp);
  console.log((ok ? '  ok   ' : '  FALLA ') + que);
  if (!ok) console.log('         dio: ' + JSON.stringify(dio) + '\n         esp: ' + JSON.stringify(esp));
  ok ? bien++ : mal++;
};
const cierto = (que, c) => eq(que, !!c, true);

/* Un proyecto completo que se instala, y de ahí cada caso le quita algo. */
const LARGO = 'https://www.google.com/maps/place/Expo/@20.6543,-103.3901,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d20.6551!4d-103.3925';
const CORTO = 'https://maps.app.goo.gl/AbCdEf123';
const base = { id: 'p1', nombre: 'Ana - Café Luna', etapa: 'armado', tel: '33 1234 5678', entrega: 'instalacion',
  dir_texto: 'Av. Vallarta 1300, Guadalajara', lat: 20.6551, lng: -103.3925, maps_url: LARGO, estatus_notion: 'FABRICACION' };
const con = o => ({ ...base, ...o });

console.log('\nQUÉ LE FALTA — entrega × datos');
eq('completo, no le falta nada', DD.queLeFalta(base), []);
eq('sin teléfono', DD.queLeFalta(con({ tel: '' })), ['tel']);
eq('el de la cotización cuenta (el que enseña la ficha)', DD.queLeFalta(con({ tel: '', origen: { tel: '3312345678' } })), []);
eq('con 7 dígitos no es teléfono', DD.queLeFalta(con({ tel: '1234 567' })), ['tel']);
eq('con lada de país sí', DD.queLeFalta(con({ tel: '+52 1 33 1234 5678' })), []);
eq('instalación sin dirección', DD.queLeFalta(con({ dir_texto: '  ' })), ['dir']);
eq('instalación sin pin', DD.queLeFalta(con({ lat: null, lng: null })), ['pin']);
eq('un pin en 0,0 no es pin', DD.queLeFalta(con({ lat: 0, lng: 0 })), ['pin']);
eq('instalación sin nada', DD.queLeFalta(con({ tel: '', dir_texto: '', lat: null, lng: null })), ['tel', 'dir', 'pin']);
eq('paquetería sin dirección ni pin: no le falta (el destino no se cuenta)', DD.queLeFalta(con({ entrega: 'paqueteria', dir_texto: '', lat: null, lng: null })), []);
eq('paquetería sin teléfono', DD.queLeFalta(con({ entrega: 'paqueteria', tel: '' })), ['tel']);
eq('recolección no pide dirección ni pin', DD.queLeFalta(con({ entrega: 'recoleccion', dir_texto: '', lat: null, lng: null })), []);
eq('sin el campo de entrega (de antes de #97): falta, y se pregunta como instalación',
   DD.queLeFalta(con({ entrega: undefined, lat: null, lng: null })), ['entrega', 'pin']);
eq('una entrega inventada tampoco cuenta', DD.queLeFalta(con({ entrega: 'avion' })), ['entrega']);
eq('basura no truena', DD.queLeFalta(null), []);

console.log('\n«TODAVÍA NO LA TENGO» — se guarda, pero sigue faltando');
const pend = con({ dir_texto: '', lat: null, lng: null, maps_url: '', ubicacion_pendiente: true });
eq('la falta sigue', DD.queLeFalta(pend), ['dir', 'pin']);
eq('y se dice como pendiente', DD.queLeFalta(pend).map(k => DD.textoDeFalta(pend, k)), ['dirección pendiente', 'ubicación pendiente']);
const sinNada = con({ tel: '', dir_texto: '', lat: null, lng: null, maps_url: '' });
eq('sin la casilla, «sin …»', DD.queLeFalta(sinNada).map(k => DD.textoDeFalta(sinNada, k)), ['sin teléfono', 'sin dirección', 'sin ubicación']);
eq('teléfono a medias dice «incompleto»', DD.textoDeFalta(con({ tel: '33 12' }), 'tel'), 'teléfono incompleto');
const porLeer = con({ lat: null, lng: null, maps_url: CORTO });
eq('link corto guardado sin señal: «link de Maps por leer»', DD.textoDeFalta(porLeer, 'pin'), 'link de Maps por leer');
cierto('linkPorLeer lo reconoce', DD.linkPorLeer(porLeer));
cierto('y no a uno que ya tiene pin', !DD.linkPorLeer(con({ maps_url: CORTO })));

console.log('\n«FALTAN DATOS» DEL TABLERO — solo el taller, por la fecha más cercana');
{
  const hoy = '2026-10-09';
  const fechas = { a: '2026-10-20', b: '2026-10-12', c: null, d: '2026-10-05', e: '2026-10-16', f: '2026-10-10' };
  const ps = [
    con({ id: 'a', nombre: 'A', tel: '' }),
    con({ id: 'b', nombre: 'B', lat: null, lng: null }),
    con({ id: 'c', nombre: 'C sin fecha', dir_texto: '' }),
    con({ id: 'd', nombre: 'D ya pasó', tel: '' }),
    con({ id: 'e', nombre: 'E a 7 días', tel: '' }),
    con({ id: 'f', nombre: 'F completo' }),
    con({ id: 'g', nombre: 'G instalado', etapa: 'instalado', tel: '' }),
    con({ id: 'h', nombre: 'H cobrando', estatus_notion: 'COBRANDO', tel: '' }),
    con({ id: 'i', nombre: 'I cancelado', etapa: 'cancelado', tel: '' }),
    con({ id: 'j', nombre: 'J recoge', entrega: 'recoleccion', dir_texto: '', lat: null, lng: null }),
  ];
  const xs = DD.faltanDatos(ps, { hoy, fechaDe: p => fechas[p.id] || null });
  eq('orden: la que ya pasó, luego la más cercana, y sin fecha al final', xs.map(x => x.p.id), ['d', 'b', 'e', 'a', 'c']);
  eq('fuera lo instalado, lo que ya se cobra, lo cancelado, lo completo y la recolección sin dirección',
     ps.filter(p => !xs.some(x => x.p.id === p.id)).map(p => p.id), ['f', 'g', 'h', 'i', 'j']);
  eq('pronto: siete días o menos, y lo vencido', xs.map(x => [x.p.id, x.pronto]),
     [['d', true], ['b', true], ['e', true], ['a', false], ['c', false]]);
  eq('los días hasta la entrega', xs.map(x => x.dias), [-4, 3, 7, 11, null]);
  eq('sin `fechaDe`, ninguna tiene fecha y van por nombre', DD.faltanDatos(ps, { hoy }).map(x => x.p.id), ['a', 'b', 'c', 'd', 'e']);
  eq('una lista vacía es vacía', DD.faltanDatos([], { hoy }), []);
  eq('el mismo nombre del día de entrega: por nombre', DD.faltanDatos([con({ id: 'z', nombre: 'Zeta', tel: '' }), con({ id: 'y', nombre: 'Alfa', tel: '' })],
     { hoy, fechaDe: () => '2026-10-15' }).map(x => x.p.nombre), ['Alfa', 'Zeta']);
}

console.log('\nLO QUE «SE GANÓ» DEJA GUARDAR');
{
  const ok = (d, o) => DD.validarDatos(d, o).ok;
  const err = (d, o) => DD.validarDatos(d, o).errores;
  const todo = { tel: '33 1234 5678', entrega: 'instalacion', dir: 'Av. Patria 100', maps: LARGO };
  cierto('completo, sí', ok(todo));
  eq('sin teléfono, no, y dice por qué', err({ ...todo, tel: '' }).tel, 'Falta el teléfono del cliente.');
  eq('teléfono corto, no', err({ ...todo, tel: '33 12' }).tel, 'Ese teléfono no tiene los 10 dígitos.');
  eq('sin entrega, no', err({ ...todo, entrega: '' }).entrega, 'Falta decir cómo se entrega.');
  cierto('instalación sin link, no', /Todavía no la tengo/.test(err({ ...todo, maps: '' }).maps));
  cierto('instalación sin dirección, no', /la dirección/.test(err({ ...todo, dir: '' }).dir));
  cierto('sin las dos: lo dice junto', /la dirección y el link/.test(err({ ...todo, dir: '', maps: '' }).dir));
  cierto('con «Todavía no la tengo» sí se guarda sin las dos', ok({ ...todo, dir: '', maps: '', pendiente: true }));
  cierto('el link corto de WhatsApp pasa (se lee al guardar)', ok({ ...todo, maps: CORTO }));
  cierto('el par suelto de Maps también', ok({ ...todo, maps: '20.6736, -103.344' }));
  cierto('un texto que no es link, no', /no trae coordenadas/.test(err({ ...todo, maps: 'por la iglesia' }).maps));
  cierto('paquetería sin destino, sí (el destino es opcional)', ok({ tel: '3312345678', entrega: 'paqueteria', dir: '', maps: '' }));
  cierto('recolección sin nada más, sí', ok({ tel: '3312345678', entrega: 'recoleccion' }));
  eq('el primero que falla es al que va el foco', DD.validarDatos({ tel: '', entrega: '' }).primero, 'tel');
}

console.log('\nLO QUE «COMPLETAR» DEJA GUARDAR — lo que se llenó, aunque no sea todo');
{
  const v = (d, pide, entregaActual = 'instalacion') => DD.validarDatos(d, { modo: 'completar', pide, entregaActual });
  cierto('solo el teléfono, sí', v({ tel: '3312345678' }, ['tel', 'dir', 'pin']).ok);
  cierto('solo el link, sí', v({ maps: CORTO }, ['tel', 'dir', 'pin']).ok);
  eq('nada, no', v({}, ['tel', 'dir', 'pin']).mensaje, 'No escribiste nada. Llena lo que ya tengas y guarda.');
  eq('un teléfono corto sigue sin servir', v({ tel: '12' }, ['tel']).errores.tel, 'Ese teléfono no tiene los 10 dígitos.');
  cierto('elegir la entrega cuenta como algo', v({ entrega: 'recoleccion' }, ['entrega', 'dir', 'pin']).ok);
  cierto('un destino de paquetería cuenta', v({ entrega: 'paqueteria', dir: 'Vallarta' }, ['entrega']).ok);
}

console.log('\nEL PARCHE QUE SE GUARDA');
{
  const d = { tel: '+52 1 33.1234.5678', entrega: 'instalacion', dir: 'Av. Patria 100', maps: CORTO, pendiente: false };
  const u = { ok: true, parche: { maps_url: CORTO, lat: 20.6551, lng: -103.3925, geo_fuente: 'maps_pin' }, aviso: '' };
  eq('«Se ganó» con instalación: teléfono limpio, dirección, link y pin', extraParaGanar(d, u),
     { tel: '+52 1 33 1234 5678', entrega: 'instalacion', dir_texto: 'Av. Patria 100', maps_url: CORTO, lat: 20.6551, lng: -103.3925, geo_fuente: 'maps_pin' });
  eq('sin señal: el link y nada de pin', extraParaGanar(d, { ok: true, parche: { maps_url: CORTO }, aviso: 'x' }),
     { tel: '+52 1 33 1234 5678', entrega: 'instalacion', dir_texto: 'Av. Patria 100', maps_url: CORTO });
  eq('«Todavía no la tengo» queda anotado', extraParaGanar({ ...d, dir: '', maps: '', pendiente: true }, { parche: {} }),
     { tel: '+52 1 33 1234 5678', entrega: 'instalacion', dir_texto: '', maps_url: '', ubicacion_pendiente: true });
  eq('paquetería: el destino, sin link ni pin', extraParaGanar({ ...d, entrega: 'paqueteria', dir: 'Vallarta', maps: '' }, { parche: {} }),
     { tel: '+52 1 33 1234 5678', entrega: 'paqueteria', dir_texto: 'Vallarta' });
  eq('recolección: ni dirección (se queda la de la cotización)', extraParaGanar({ ...d, entrega: 'recoleccion', dir: '', maps: '' }, { parche: {} }),
     { tel: '+52 1 33 1234 5678', entrega: 'recoleccion' });
  eq('«Completar» no borra con un vacío', parcheDe({ tel: '', entrega: '', dir: '', maps: '' }, ['tel', 'dir', 'pin']), {});
  eq('«Completar» guarda solo lo pedido y escrito', parcheDe({ tel: '3312345678', dir: 'Calle 1' }, ['tel']), { tel: '3312345678' });
}

console.log('\nQUIÉN COMPLETA QUÉ (CAMPOS_ROL)');
{
  const tabla = r => ['tel', 'entrega', 'dir_texto', 'lat', 'maps_url'].map(c => puedeEscribir(r, c));
  eq('dirección, todo', tabla('direccion'), [true, true, true, true, true]);
  eq('fabricación, todo (el taller llama y recibe la dirección)', tabla('fabricacion'), [true, true, true, true, true]);
  eq('pagos, solo el teléfono (cobra por WhatsApp)', tabla('pagos'), [true, false, false, false, false]);
  eq('un campo que no se edita, nadie', puedeEscribir('direccion', 'origen'), false);
}

console.log('\nEL LINK CORTO — con /expandir simulado');
{
  /* La hoja de mentiras: el corto lleva al largo en un salto; el de dos saltos pasa por un
     goo.gl intermedio. */
  const pedidas = [];
  const hoja = mapa => async u => { pedidas.push(u); return mapa[u] || { ok: true, url: u }; };
  const conSenal = hoja({
    [CORTO]: { ok: true, url: LARGO },
    'https://goo.gl/maps/dos': { ok: true, url: 'https://maps.app.goo.gl/intermedio' },
    'https://maps.app.goo.gl/intermedio': { ok: true, url: 'https://www.google.com/maps?q=20.5230,-103.4470' },
    'https://maps.app.goo.gl/busqueda': { ok: true, url: 'https://www.google.com/maps/search/Tacos+el+Guero' },
    'https://maps.app.goo.gl/fuera': { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo se siguen ligas de Google Maps.' },
  });

  let r = await resolverLink(LARGO, conSenal);
  eq('el largo se lee sin preguntar a la hoja', [r.ok, r.lat, r.lng, pedidas.length], [true, 20.6551, -103.3925, 0]);

  r = await resolverLink(CORTO, conSenal);
  eq('el corto, con señal, da el pin del lugar', [r.ok, r.lat, r.lng, r.exacta, r.fuente], [true, 20.6551, -103.3925, true, 'maps_pin']);
  eq('y lo que se guarda es lo que se pegó (el corto)', [r.url, r.largo], [CORTO, LARGO]);
  eq('una sola pregunta a la hoja', pedidas, [CORTO]);

  pedidas.length = 0;
  r = await resolverLink('https://goo.gl/maps/dos', conSenal);
  eq('dos saltos', [r.ok, r.lat, r.lng, pedidas.length], [true, 20.523, -103.447, 2]);

  r = await resolverLink('https://maps.app.goo.gl/busqueda', conSenal);
  eq('un corto que abre una búsqueda sin coordenadas: no inventa nada', [r.ok, r.motivo], [false, 'sin_coord']);
  cierto('  y dice qué hacer', /deja el dedo/.test(r.mensaje));

  r = await resolverLink('https://maps.app.goo.gl/fuera', conSenal);
  eq('si la hoja dice que no es Maps, es definitivo', [r.ok, r.motivo, r.codigo], [false, 'sin_coord', 'DATO_INVALIDO']);

  const sinSenal = async () => ({ ok: false, codigo: 'SIN_RED', mensaje: 'No hay señal.' });
  r = await resolverLink(CORTO, sinSenal);
  eq('sin señal: pendiente, con el link para guardar', [r.ok, r.motivo, r.url], [false, 'pendiente', CORTO]);
  cierto('  y el aviso dice que se pone solo', /se pone solo/.test(r.mensaje));
  r = await resolverLink(CORTO, async () => { throw new Error('se cayó'); });
  eq('si la petición truena, también pendiente', r.motivo, 'pendiente');
  r = await resolverLink(CORTO, async () => ({ ok: false, codigo: 'SIN_CONFIG' }));
  eq('sin puente, pendiente', r.motivo, 'pendiente');
  r = await resolverLink(CORTO, null);
  eq('sin quién expanda, pendiente', r.motivo, 'pendiente');
  r = await resolverLink('por la iglesia', conSenal);
  eq('un texto sin coordenadas', [r.ok, r.motivo], [false, 'sin_coord']);
  r = await resolverLink('   ', conSenal);
  eq('vacío', r.motivo, 'vacio');

  /* La vuelta completa del pendiente: sin señal se guarda el link; la sincronización siguiente,
     ya con señal, lo vuelve a leer con la misma función y saca el pin. */
  const guardado = { ...con({ lat: null, lng: null, maps_url: '' }) };
  const r1 = await resolverLink(CORTO, sinSenal);
  if (r1.motivo === 'pendiente') guardado.maps_url = r1.url;
  eq('primero: se guarda el link sin pin', [guardado.maps_url, DD.queLeFalta(guardado)], [CORTO, ['pin']]);
  const r2 = await resolverLink(guardado.maps_url, conSenal);
  if (r2.ok) Object.assign(guardado, { lat: r2.lat, lng: r2.lng });
  eq('después, con señal: ya no le falta nada', DD.queLeFalta(guardado), []);
}

console.log('\nLA UBICACIÓN QUE BAJA DE LA HOJA (columna AB, puente-sheets-13)');
{
  eq('«lat,lng» es pin', ubicacionDeHoja('20.6551,-103.3925'), { maps_url: '', lat: 20.6551, lng: -103.3925, geo_fuente: 'maps_pin' });
  eq('el link corto que la hoja no pudo leer baja como link, sin pin', ubicacionDeHoja(CORTO),
     { maps_url: CORTO, lat: null, lng: null, geo_fuente: 'sin_ubicar' });
  eq('un link largo con coordenada: pin y link', ubicacionDeHoja(LARGO).lat, 20.6551);
  eq('vacía, sin ubicar', ubicacionDeHoja(''), { maps_url: '', lat: null, lng: null, geo_fuente: 'sin_ubicar' });
  const fila = { id_notion: 'V-120', 'Proyecto': 'Beto - Taller', 'Estatus': 'FABRICACION', 'Telefono': '33 1234 5678',
                 'Entrega': 'Instalación', 'Direccion': 'Naranjos 648', 'Ubicacion': '20.7214,-103.3918' };
  const p = desdeVentaDeHoja(ventaDeHoja(fila));
  eq('la venta registrada en la hoja llega con teléfono, entrega, dirección y pin',
     [p.tel, p.entrega, p.dir_texto, p.lat, p.lng], ['33 1234 5678', 'instalacion', 'Naranjos 648', 20.7214, -103.3918]);
  eq('  y no le falta nada', DD.queLeFalta({ ...p, etapa: 'ganado' }), []);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
