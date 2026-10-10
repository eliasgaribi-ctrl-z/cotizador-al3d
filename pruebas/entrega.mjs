/* Prueba de la entrega: instalación, paquetería o recolección en taller (js/datos/entrega.js).
   Lo que se cuida aquí es lo que se ve fuera del puente —el puente tiene lo suyo en puente.mjs y
   puente-hoja.mjs—: que el Mapa no pida pin ni meta a la ruta lo que no se instala, que el
   Calendario y el .ics lo rotulen «Envío» o «Recolección», y que el WhatsApp del cliente no le
   hable de instalación. Caso real: AVIDA Market, que se manda por paquetería a Puerto Vallarta.
   Node puro: sin DOM, sin base y sin red. */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../js/datos/entrega.js';
import { paraIcs } from '../js/datos/agenda.js';
import { mensajeWa } from '../js/datos/reglas.js';
import * as ICS from '../js/nucleo/ics.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let bien = 0, mal = 0;
const eq = (que, dio, esp) => {
  const ok = JSON.stringify(dio) === JSON.stringify(esp);
  console.log((ok ? '  ok   ' : '  FALLA ') + que);
  if (!ok) console.log('         dio: ' + JSON.stringify(dio) + '\n         esp: ' + JSON.stringify(esp));
  ok ? bien++ : mal++;
};
const cierto = (que, c) => eq(que, !!c, true);

const conPin = p => p.lat != null && p.lng != null;
const avida = { id: 'a', nombre: 'AVIDA - Market (Letras)', contacto: 'Laura', negocio: 'AVIDA Market',
  tel: '3221234567', entrega: 'paqueteria', dir_texto: 'Av. México 1200\nPuerto Vallarta, Jal.',
  tipo_trabajo: ['Letras 3D con iluminacion'], lat: null, lng: null, etapa: 'listo' };
const recoge = { ...avida, id: 'r', nombre: 'Beto - Taller', negocio: 'Taller Beto', entrega: 'recoleccion', dir_texto: '' };
const instala = { ...avida, id: 'i', nombre: 'Café Ana', negocio: 'Café Ana', entrega: undefined,
  dir_texto: 'Av. Vallarta 1234, Guadalajara', entrecalles: 'Chapultepec y Américas' };
const inst = { id: 'x1', fecha: '2026-10-16', hora: '10:00', estado: 'confirmada', ventana: 'dia', movida: 0 };

console.log('\nLOS TRES VALORES');
{
  eq('son tres, en el orden del desplegable', E.ENTREGAS, ['instalacion', 'paqueteria', 'recoleccion']);
  eq('sin el campo se instala', [E.entregaDe({}), E.entregaDe(instala), E.seInstala(instala)], ['instalacion', 'instalacion', true]);
  eq('lo de AVIDA se envía', [E.entregaDe(avida), E.seInstala(avida)], ['paqueteria', false]);
  eq('los rótulos del calendario', E.ENTREGAS.map(k => E.ENTREGA_ROTULO[k]), ['Instalación', 'Envío', 'Recolección']);
  eq('y cómo se dice la fecha', E.ENTREGAS.map(k => E.ENTREGA_FECHA[k]), ['Fecha de instalación', 'Fecha de envío', 'Fecha de recolección']);
  cierto('la dirección del taller es la de Naranjos 648, en Zapopan', /Naranjos #648.*45169 Zapopan/.test(E.DIRECCION_TALLER));
}

console.log('\nEL MAPA — lo que no se instala no pide pin ni entra a la ruta');
{
  const conPinEnvio = { ...avida, id: 'a2', lat: 20.65, lng: -105.22 };
  const sinPinInst = { ...instala, id: 'i2', lat: null, lng: null };
  const conPinInst = { ...instala, id: 'i3', lat: 20.67, lng: -103.36 };
  const r = E.repartirParaElMapa([avida, recoge, conPinEnvio, sinPinInst, conPinInst, null], conPin);
  eq('«sin ubicar» es solo lo que se instala sin pin', r.sinUbicar.map(p => p.id), ['i2']);
  eq('paquetería y recolección van aparte, con pin o sin él', r.sinInstalacion.map(p => p.id), ['a', 'r', 'a2']);
  eq('a la ruta entra solo lo que se instala y tiene pin', r.enRuta.map(p => p.id), ['i3']);
  const fuente = readFileSync(join(RAIZ, 'js/mod/mapa.js'), 'utf8');
  cierto('la pantalla usa el reparto para «sin ubicar»', /repartirParaElMapa\(PROYS, tienePin\)\.sinUbicar/.test(fuente));
  cierto('y la ruta del día deja fuera lo que no se instala', /const deHoy = \(\) => conPin\(\)\.filter\(p => \{\s*if \(!seInstala\(p\)\) return false;/.test(fuente));
  cierto('y la hoja enseña «Envíos por paquetería» y «Recolección en taller»',
    fuente.includes("'Envíos por paquetería'") && fuente.includes("'Recolección en taller'"));
}

console.log('\nEL CALENDARIO — «Envío» y «Recolección» con su palabra y su forma');
{
  const fuente = readFileSync(join(RAIZ, 'js/mod/fabricacion.js'), 'utf8');
  cierto('el chip del mes lleva la palabra al frente y la clase `envio`',
    /' envio ' \+ ent/.test(fuente) && /<b class="cal-ent">' \+ esc\(ENTREGA_ROTULO\[ent\]\)/.test(fuente));
  cierto('la hoja de agendar pregunta con su verbo', /'¿Qué día se va a ' \+ ENTREGA_VERBO\[ent\]/.test(fuente));
  const css = readFileSync(join(RAIZ, 'css/plataforma.css'), 'utf8');
  cierto('el chip tiene otra forma (borde punteado), no solo otro color', /\.cal-ev\.envio\{[^}]*dashed/.test(css));
  cierto('y en el teléfono, donde es un punto, el suyo es un rombo', /\.cal-ev\.envio\{[^}]*rotate\(45deg\)/.test(css));
  eq('el verbo de cada una', E.ENTREGAS.map(k => E.ENTREGA_VERBO[k]), ['instalar', 'enviar', 'entregar en el taller']);
}

console.log('\nEL .ics');
{
  const env = paraIcs(inst, avida);
  eq('un envío se titula «Envío: …»', env.summary, 'Envío: AVIDA - Market (Letras)');
  eq('sin ubicación de calle: el destino va en la descripción', env.location, '');
  cierto('y la descripción dice a dónde va', /Destino del envío: Av\. México 1200, Puerto Vallarta/.test(env.description));
  cierto('sin «Buscar a» ni «Se instala»', !/Buscar a|Se instala/.test(env.description));
  const rec = paraIcs(inst, recoge);
  eq('una recolección se titula «Recolección: …»', rec.summary, 'Recolección: Beto - Taller');
  eq('y su ubicación es el taller', rec.location, E.TALLER_NOMBRE + ', ' + E.DIRECCION_TALLER);
  const ins = paraIcs(inst, instala);
  eq('una instalación sigue como siempre', [ins.summary, ins.location],
     ['Instalación · Café Ana', 'Av. Vallarta 1234, Guadalajara — Chapultepec y Américas']);
  eq('cambiar de instalación a envío NO cambia el UID: mueve el mismo evento', env.uid, ins.uid);
  const txt = ICS.evento(env).replace(/\r\n[ \t]/g, '');
  cierto('el archivo sale con SUMMARY «Envío: …»', /SUMMARY:Envío: AVIDA/.test(txt));
  cierto('sin LOCATION', !/^LOCATION:/m.test(txt));
  cierto('y sus alarmas no dicen «carga la camioneta»', !/camioneta/.test(txt) && /paquetería/.test(txt));
  cierto('la de instalación sí la dice', /camioneta/.test(ICS.evento(ins)));
  cierto('la de recolección avisa que pasa al taller', /recogerlo al taller/.test(ICS.evento(rec).replace(/\r\n[ \t]/g, '')));
}

console.log('\nEL WHATSAPP DEL CLIENTE');
{
  const env = mensajeWa('confirmar_cliente', { proyecto: avida, instalacion: inst }).texto;
  cierto('al de un envío no se le habla de instalación', !/instala/i.test(env));
  cierto('se le dice que sale por paquetería y a dónde', /paquetería/.test(env) && /Puerto Vallarta/.test(env));
  const sinDestino = mensajeWa('confirmar_cliente', { proyecto: { ...avida, dir_texto: '' }, instalacion: inst }).texto;
  cierto('sin destino, se lo pide', /dirección completa de entrega/.test(sinDestino));
  const rec = mensajeWa('confirmar_cliente', { proyecto: recoge, instalacion: inst }).texto;
  cierto('al de una recolección: que pase al taller, con la dirección', !/instala/i.test(rec) && /recogerlo al taller/.test(rec) && rec.includes(E.DIRECCION_TALLER));
  const ins = mensajeWa('confirmar_cliente', { proyecto: instala, instalacion: inst }).texto;
  cierto('el de instalación no cambia', /Le confirmo la instalación de Café Ana/.test(ins));
  const orden = mensajeWa('orden_instalador', { proyecto: avida, instalacion: inst }).texto;
  cierto('la orden de un envío es del taller: «Qué se empaca», sin «Buscar a»', /^ENVÍO POR PAQUETERÍA/.test(orden) && /Qué se empaca/.test(orden) && !/Buscar a/.test(orden));
}

console.log('\nLA FICHA');
{
  const fuente = readFileSync(join(RAIZ, 'js/mod/proyectos.js'), 'utf8');
  cierto('el control «Cómo se entrega» con las tres opciones', /segmento\(ENTREGAS\.map\(e => \(\{ v: e, t: ENTREGA_NOMBRE\[e\] \}\)\), ent, 'data-entrega'/.test(fuente));
  cierto('la fecha se rotula según la entrega', /dato\(ENTREGA_FECHA\[ent\], inst/.test(fuente));
  cierto('con recolección no hay «Abrir en Maps»', /const mapa = ent === 'recoleccion' \? '' : urlMapa\(p\);/.test(fuente));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
