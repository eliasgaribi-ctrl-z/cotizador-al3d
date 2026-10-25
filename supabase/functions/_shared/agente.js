/* ============================================================================
   EL AGENTE DE VENTAS, LA PARTE QUE DECIDE — sin red, sin base y sin reloj.

   Cada mensaje del cliente da UNA VUELTA, en dos llamadas a la IA y con la ficha en medio:
     1. EXTRAER  — la IA lee el mensaje y dice qué datos trae (`instruccionExtraer`). Contesta
                   un JSON; `leerJson` lo saca aunque venga envuelto en ``` o con una frase antes.
     2. APLICAR  — `aplicarCambios` mete en la ficha SOLO los campos que existen (ficha.js), con
                   su tipo y su tope. Lo que la IA invente fuera de la lista no entra.
     3. DECIDIR  — `estadoDe` le pregunta a la ficha qué falta, qué decide Dirección y, si ya se
                   puede, cuánto cuesta. Esto es código, no IA: el precio sale de precio.js.
     4. CONTESTAR — la IA redacta con lo que diga el paso 3 (`instruccionResponder`), y
                   `armarRespuesta` le quita cualquier cantidad de dinero que se le haya
                   escapado y le pega el precio de verdad, escrito por código.
   La IA habla; los números los pone el código. Un precio plausible y equivocado se va a una
   cotización real y cuesta dinero.

   Lo que el agente SÍ puede decir de AL3D está en HECHOS y en ningún otro lado: lo que imprime
   el PDF de la cotización (js/cotizador/entrega.js). Lo que no esté ahí, lo consulta.
   ============================================================================ */

import { CAMPOS_PROYECTO, TIPOS, camposDePartida, cotizar, decisionesParaDireccion, preguntasPendientes } from './ficha.js';

export const MAX_PARTIDAS = 10;
export const MAX_RESPUESTA = 1200;
export const ANTICIPO_PCT = 50;
export const VIGENCIA_DIAS = 10;

/* Las condiciones que ya imprime el PDF (entrega.js, «Condiciones»). */
export const HECHOS = Object.freeze([
  'AL3D fabrica anuncios luminosos en su propio taller (Naranjos #648, Col. Lindavista, C.P. 45169).',
  'Para arrancar se deja un anticipo de al menos el ' + ANTICIPO_PCT + ' %; el resto se liquida al instalar.',
  'La cotización vale ' + VIGENCIA_DIAS + ' días. El anticipo no es reembolsable.',
  'Con factura se agrega el IVA (16 %).',
  'La salida eléctrica donde va el letrero la pone el cliente.',
]);

/* ============================================================================
   2 · Meter en la ficha solo lo que existe
   ============================================================================ */

const texto = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const numero = (v, min, max) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v; return typeof n === 'number' && isFinite(n) && n >= min && n <= max ? n : undefined; };
const booleano = v => (v === true || v === false ? v : undefined);
const uno = (v, lista) => (lista.includes(v) ? v : undefined);

/* Cómo se limpia cada campo. Lo que no esté aquí pasa como texto corto. */
const LIMPIA_PROYECTO = {
  negocio: v => texto(v, 80),
  lleva_logo: booleano,
  entrega: v => uno(v, ['instalacion', 'paqueteria', 'recoleccion']),
  municipio: v => texto(v, 80),
  lugar: v => uno(v, ['interior', 'exterior']),
  altura_m: v => numero(v, 0, 60),
  factura: booleano,
  archivo_editable: booleano,
  acepta: booleano,
};
const LIMPIA_PARTIDA = {
  texto: v => texto(v, 200),
  altura_cm: v => numero(v, 0.5, 2000),
  ancho_cm: v => numero(v, 1, 5000),
  alto_cm: v => numero(v, 1, 5000),
  luz: booleano,
  tono: v => uno(v, ['fria', 'calida']),
  forma: v => uno(v, ['std', 'nube']),
  vistas: v => (v === 1 || v === 2 ? v : undefined),
  acabado: v => uno(v, ['sencillo', 'vinil', 'sandwich']),
  medida_confirmada: booleano,
};

/**
 * La ficha nueva, sin tocar la vieja. `ext` es lo que contestó la IA:
 *   { proyecto: {campo: valor…}, partidas: [{ i?: número, tipo?, campo: valor… }] }
 * Una partida con `i` de una que ya existe se completa; sin `i` (o con uno que no existe) y con
 * un tipo conocido, se agrega. Nunca más de MAX_PARTIDAS. Un valor que no pasa su limpieza se
 * ignora: la pregunta sigue pendiente y el agente la vuelve a hacer.
 */
export function aplicarCambios(ficha, ext) {
  const f = JSON.parse(JSON.stringify(ficha && typeof ficha === 'object' ? ficha : {}));
  if (!Array.isArray(f.partidas)) f.partidas = [];
  const e = ext && typeof ext === 'object' ? ext : {};
  const p = e.proyecto && typeof e.proyecto === 'object' ? e.proyecto : {};
  for (const k of [...CAMPOS_PROYECTO, 'acepta']) {
    if (!(k in p)) continue;
    const v = (LIMPIA_PROYECTO[k] || (x => texto(x, 200)))(p[k]);
    if (v !== undefined) f[k] = v;
  }
  for (const q of Array.isArray(e.partidas) ? e.partidas.slice(0, MAX_PARTIDAS) : []) {
    if (!q || typeof q !== 'object') continue;
    let destino = Number.isInteger(q.i) && f.partidas[q.i] ? f.partidas[q.i] : null;
    if (!destino) {
      if (!TIPOS[q.tipo] || f.partidas.length >= MAX_PARTIDAS) continue;
      destino = { tipo: q.tipo };
      f.partidas.push(destino);
    }
    for (const k of [...camposDePartida(destino.tipo), 'medida_confirmada']) {
      if (!(k in q)) continue;
      const v = (LIMPIA_PARTIDA[k] || (x => texto(x, 200)))(q[k]);
      if (v !== undefined) destino[k] = v;
    }
  }
  return f;
}

/* ============================================================================
   3 · Qué sigue — código, no IA
   ============================================================================ */

/**
 * @returns {{pendientes:object[], decisiones:object[], cotizacion:object|null, siguiente:'preguntar'|'direccion'|'cerrar'}}
 *   `siguiente` es lo que el agente tiene que hacer en esta vuelta. «cerrar» = ya hay precio:
 *   pedir el anticipo. (La función agrega «descartada» cuando Dirección dijo que no se hace.)
 */
export function estadoDe(ficha) {
  const pendientes = preguntasPendientes(ficha, 'cotizar');
  const decisiones = pendientes.length ? [] : decisionesParaDireccion(ficha);
  const cotizacion = pendientes.length || decisiones.length ? null : cotizar(ficha);
  const siguiente = pendientes.length ? 'preguntar' : decisiones.length ? 'direccion' : 'cerrar';
  return { pendientes, decisiones, cotizacion, siguiente };
}

/* ============================================================================
   1 y 4 · Lo que se le pide a la IA
   ============================================================================ */

const ultimos = (mensajes, n) => (Array.isArray(mensajes) ? mensajes.slice(-n) : [])
  .map(m => ({ role: m.de === 'cliente' ? 'user' : 'assistant', content: String(m.texto || '').slice(0, 1500) }));

/** La instrucción para sacar datos del último mensaje del cliente. */
export function instruccionExtraer(ficha, mensajes, textoCliente) {
  const tipos = Object.entries(TIPOS).map(([k, t]) => k + ' (' + t.nombre + ')').join(', ');
  const campos = Object.keys(TIPOS).map(t => t + ': ' + camposDePartida(t).join(', ')).join('\n');
  const sistema = [
    'Llenas la ficha de un anuncio para AL3D (anuncios luminosos) con lo que escribe el cliente.',
    'Contesta SOLO un objeto JSON: {"proyecto": {...}, "partidas": [{"i": <índice si completa una que ya existe>, "tipo": "...", ...}]}.',
    'Pon SOLO lo que el cliente dijo o confirmó en su último mensaje. No adivines, no completes, no supongas. Si no dijo nada nuevo: {"proyecto":{},"partidas":[]}.',
    'Campos del proyecto: ' + [...CAMPOS_PROYECTO, 'acepta'].join(', ') + '.',
    'entrega es "instalacion", "paqueteria" o "recoleccion" (pasa al taller). lugar es "interior" o "exterior". altura_m en metros.',
    'lleva_logo, factura, archivo_editable y luz son true/false. acepta = true solo si dice que quiere hacer el trabajo con la cotización que ya tiene.',
    'Tipos de partida: ' + tipos + '. Campos por tipo:\n' + campos,
    'Medidas en centímetros. texto = lo que dice el letrero, tal cual lo escribió. tono "fria" o "calida". forma de caja "std" (rectangular o circular) o "nube" (silueta). acabado de recorte "sencillo", "vinil" o "sandwich".',
    'material de letras: "aluminio pintado", "aluminio cepillado", "acrilico con aluminio", "acrilico con vinil" o "acero inoxidable". comp: "recta", "cursiva" o "compleja".',
    'Si una medida la calcula por una foto o dice "más o menos" o "como de", pon "medida_confirmada": false.',
  ].join('\n');
  const pregunta = 'Ficha actual:\n' + JSON.stringify(ficha || {}) + '\n\nÚltimo mensaje del cliente:\n' + String(textoCliente || '').slice(0, 2000);
  return { sistema, pregunta, mensajes: ultimos(mensajes, 6) };
}

/** La instrucción para redactar la respuesta, con lo que decidió el código. */
export function instruccionResponder(ficha, estado, mensajes, textoCliente, decision) {
  const sistema = [
    'Eres el asistente de ventas de AL3D. Hablas como Elías, el dueño: español de México, amable, directo y breve (3 o 4 renglones), de tú.',
    'Contesta SOLO un objeto JSON: {"respuesta": "<lo que le escribes al cliente>"}.',
    'Reglas:',
    '1. NUNCA escribas precios, cantidades de dinero, porcentajes de descuento ni números de cuenta. El precio lo agrega el sistema después de tu texto.',
    '2. Si hay preguntas pendientes, haz como máximo las dos primeras, con tus palabras y en ese orden.',
    '3. Si hay cosas para Dirección, dile que lo revisas con el encargado y que le confirmas en cuanto lo tengas. No prometas una hora.',
    '4. Si ya hay cotización, dile que abajo va el precio y pregúntale si quiere arrancar.',
    '5. Si Dirección mandó una nota, transmítela con tus palabras.',
    '6. De AL3D solo puedes decir esto: ' + HECHOS.join(' '),
    '7. Si te preguntan algo que no está aquí, di que lo consultas y le confirmas.',
    '8. Si siguiente es "descartada", dile con amabilidad que por ahora AL3D no puede hacer ese trabajo (con la nota de Dirección si la hay) y agradécele.',
  ].join('\n');
  const contexto = {
    siguiente: estado.siguiente,
    preguntas_pendientes: estado.pendientes.slice(0, 2).map(p => p.pregunta),
    para_direccion: estado.decisiones.map(d => d.razon),
    hay_cotizacion: !!estado.cotizacion,
    nota_de_direccion: decision && decision.nota ? decision.nota : '',
    negocio: (ficha && ficha.negocio) || '',
  };
  const pregunta = 'Lo que decidió el sistema:\n' + JSON.stringify(contexto) + '\n\nÚltimo mensaje del cliente:\n' + String(textoCliente || '').slice(0, 2000);
  return { sistema, pregunta, mensajes: ultimos(mensajes, 10) };
}

/** El JSON de la IA, aunque venga entre ``` o con una frase antes. null si no hay objeto. */
export function leerJson(t) {
  const s = String(t || '');
  const ini = s.indexOf('{'), fin = s.lastIndexOf('}');
  if (ini < 0 || fin <= ini) return null;
  try { const o = JSON.parse(s.slice(ini, fin + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; }
  catch (_) { return null; }
}

/* ============================================================================
   4 · La respuesta final
   ============================================================================ */

const pesos = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
/* Dinero escrito por la IA: «$1,200», «1200 pesos», «MXN 900». La oración que lo trae se quita
   entera: media oración sin su número dice otra cosa. */
const DINERO = /\$\s?\d|\d[\d.,]*\s?(pesos|mxn|mil pesos)\b|\bmxn\s?\d/i;

export function sinDinero(t) {
  const partes = String(t || '').split(/(?<=[.!?\n])\s*/);
  return partes.filter(p => !DINERO.test(p)).join(' ').replace(/\s+\n/g, '\n').trim();
}

/** El precio, escrito por código. */
export function mensajeDePrecio(c) {
  if (!c) return '';
  const anticipo = Math.round(c.total * ANTICIPO_PCT) / 100;
  return [
    'Tu cotización: ' + pesos(c.total) + (c.iva ? ' con IVA incluido.' : '.'),
    'Para arrancar: anticipo de ' + pesos(anticipo) + ' (' + ANTICIPO_PCT + ' %) y el resto al instalar. Vale ' + VIGENCIA_DIAS + ' días.',
  ].join('\n');
}

/**
 * Lo que se le manda al cliente: el texto de la IA sin dinero, y después el precio y la cuenta
 * escritos por código. La cuenta solo cuando el cliente aceptó y hay cuenta configurada.
 * Sin texto de la IA (no contestó o contestó algo que no se lee) queda un texto fijo: el cliente
 * nunca se queda sin respuesta.
 */
export function armarRespuesta(textoIA, estado, ficha, cuenta) {
  let t = sinDinero(textoIA).slice(0, MAX_RESPUESTA);
  if (!t) {
    t = estado.siguiente === 'preguntar' ? estado.pendientes[0].pregunta
      : estado.siguiente === 'direccion' ? 'Déjame revisarlo con el encargado y te confirmo en cuanto lo tenga.'
      : estado.siguiente === 'descartada' ? 'Por ahora no podemos hacer este trabajo. ¡Gracias por escribirnos!'
      : '¡Listo! Aquí va tu cotización.';
  }
  const partes = [t];
  if (estado.cotizacion) partes.push(mensajeDePrecio(estado.cotizacion));
  if (estado.cotizacion && ficha && ficha.acepta === true && cuenta) partes.push('Te dejo la cuenta para el anticipo:\n' + cuenta);
  return partes.join('\n\n');
}

/** Lo que va en la tarjeta de Dirección, en una línea. */
export function resumenParaDireccion(ficha) {
  const f = ficha || {};
  const ps = (f.partidas || []).map(p => (TIPOS[p.tipo] ? TIPOS[p.tipo].nombre : 'Partida') + (p.texto ? ' «' + p.texto + '»' : '')
    + (p.altura_cm ? ' ' + p.altura_cm + ' cm' : '') + (p.ancho_cm && p.alto_cm ? ' ' + p.ancho_cm + '×' + p.alto_cm + ' cm' : ''));
  return [(f.negocio || 'Sin nombre'), ps.join(', '), f.entrega === 'instalacion' && f.municipio ? 'en ' + f.municipio : ''].filter(Boolean).join(' · ').slice(0, 600);
}
