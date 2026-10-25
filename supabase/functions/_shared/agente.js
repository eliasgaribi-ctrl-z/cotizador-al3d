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

import { ALTURA_INSTALACION_INCLUIDA_M, CAMPOS_PROYECTO, TIPOS, camposDePartida, cotizar, decisionesParaDireccion, preguntasPendientes } from './ficha.js';

export const MAX_PARTIDAS = 10;
export const MAX_RESPUESTA = 1200;
export const ANTICIPO_PCT = 50;
export const VIGENCIA_DIAS = 10;

export const WHATSAPP = '33 2813 0092';
export const TALLER = Object.freeze(['Naranjos 648, Linda Vista', '45169 Zapopan, Jal.']);

/* El saludo es el de Elías (su plantilla, en 35 de sus 61 chats ganadores), con una diferencia a
   propósito: él dice «Soy Elías» y el agente dice que es su asistente. Al cliente no se le hace creer
   que platica con una persona. */
export const SALUDO = '¡Holaa! Soy el asistente de Elías, de Anuncios Luminosos 3D 🚀\n\n' +
  '¿Cuál es tu nombre y de qué empresa nos contactas?\n\n' +
  'Cuéntame con confianza lo que necesitas o tienes en mente para poderte cotizar.\n\n' +
  '¿Quieres ver más de nuestros trabajos?\n⬇️⬇️⬇️\nhttps://www.instagram.com/construimagen.gg';

/* Lo que el agente puede decir de AL3D. Las condiciones son las que imprime el PDF (entrega.js,
   «Condiciones»); el taller, el Instagram y el WhatsApp de los comprobantes, los de las plantillas
   y las tarjetas de depósito de Elías. La instalación incluida y el tiempo de entrega los confirmó
   él el 2026-10-25 (6 m; Guadalajara, Zapopan, Tlaquepaque y Tonalá; 2.5 a 3 semanas, y el anticipo
   que llega después de la 1:00 p. m. cuenta desde el siguiente día hábil porque ya no se surte
   material ese día). Lo de la zona y la altura sale de ficha.js para que no se digan dos cosas. */
export const HECHOS = Object.freeze([
  'AL3D (Anuncios Luminosos 3D) fabrica en su propio taller: ' + TALLER.join(', ') + ' (Google Maps: https://maps.app.goo.gl/AQHck791iv5U4qRS9). El cliente puede visitarlo para conocer procesos y materiales.',
  'Trabajos anteriores: https://www.instagram.com/construimagen.gg',
  'Para arrancar se deja un anticipo de al menos el ' + ANTICIPO_PCT + ' %; el resto se liquida al instalar.',
  'La cotización vale ' + VIGENCIA_DIAS + ' días. El anticipo no es reembolsable.',
  'El IVA (16 %) solo se agrega si el cliente requiere factura; con factura se deposita a la cuenta de la empresa y sin factura a otra.',
  'El comprobante del anticipo se manda por WhatsApp al ' + WHATSAPP + '.',
  'Antes de fabricar se le enseña el diseño al cliente para que lo apruebe.',
  'El letrero queda de 2.5 a 3 semanas después del anticipo. Si el anticipo llega después de la 1:00 p. m., cuenta desde el siguiente día hábil (ese día ya no se surte material). La fecha exacta se confirma al dar el anticipo.',
  'La instalación va incluida en Guadalajara, Zapopan, Tlaquepaque y Tonalá hasta ' + ALTURA_INSTALACION_INCLUIDA_M + ' m de altura; más alto o en otro municipio se cotiza aparte.',
  'La salida eléctrica donde va el letrero la pone el cliente.',
]);

/* ----- Las tarjetas de depósito -----
   Las autorizadas por Elías: «Sin factura» (banco, beneficiario, tarjeta) y «Con factura» (banco,
   beneficiario, cuenta, CLABE, RFC y «precio neto establecido en la cotización»). Los datos NO viven
   en el repositorio, que es público: son dos secretos de la función, JSON con esas llaves, que pega
   Elías. El portal pinta la tarjeta con el mismo diseño (css/cotiza.css, .dep). */
export const VARIABLE_CUENTA = Object.freeze({ sin: 'AGENTE_CUENTA_SIN_FACTURA', con: 'AGENTE_CUENTA_CON_FACTURA' });
const ROTULOS = [['banco', 'Banco'], ['beneficiario', 'Beneficiario'], ['tarjeta', 'Tarjeta'], ['cta', 'Cta'], ['clabe', 'Clabe'], ['rfc', 'RFC']];

/** La tarjeta que le toca al cliente según su factura, o null si esa cuenta no está configurada. */
export function tarjetaDeDeposito(ficha, entorno) {
  const con = !!ficha && ficha.factura === true;
  let d = null;
  try { d = JSON.parse(entorno(con ? VARIABLE_CUENTA.con : VARIABLE_CUENTA.sin) || 'null'); } catch (_) { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const filas = ROTULOS.filter(([k]) => typeof d[k] === 'string' && d[k].trim()).map(([k, r]) => [r, d[k].trim().slice(0, 80)]);
  if (!filas.length || filas[0][0] !== 'Banco' || filas.length < 3) return null;
  return { titulo: con ? 'Con factura' : 'Sin factura', filas, nota: con ? 'Precio neto establecido en la cotización' : '', whatsapp: WHATSAPP, taller: [...TALLER] };
}

/* ============================================================================
   2 · Meter en la ficha solo lo que existe
   ============================================================================ */

const texto = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const numero = (v, min, max) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v; return typeof n === 'number' && isFinite(n) && n >= min && n <= max ? n : undefined; };
const booleano = v => (v === true || v === false ? v : undefined);
const uno = (v, lista) => (lista.includes(v) ? v : undefined);

/* Cómo se limpia cada campo. Lo que no esté aquí pasa como texto corto. */
const LIMPIA_PROYECTO = {
  contacto: v => texto(v, 80),
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

/* El tope de la pregunta en _shared/ia.js (MAX_PREGUNTA): lo que pase de ahí se corta por el final. */
export const PREGUNTA_MAX = 4000;

/* La plática va DENTRO de la pregunta, como texto, y no como turnos de «assistant»: con los turnos,
   el modelo seguía el formato de las respuestas anteriores (texto suelto, sin JSON) y su respuesta
   se tiraba. Así le pasó en producción el 2026-10-25: desde el segundo mensaje, el cliente recibía
   solo la pregunta fija de la ficha. Va de la más nueva hacia atrás hasta llenar `cabe`, y se lee
   de la más vieja a la más nueva. Los montos van tapados: el precio lo escribe el código. */
export function platica(mensajes, cabe) {
  const lineas = [];
  let usado = 0;
  for (const m of (Array.isArray(mensajes) ? mensajes : []).slice().reverse()) {
    const l = (m.de === 'cliente' ? 'Cliente: ' : 'AL3D: ')
      + String(m.texto || '').replace(/\$\s?[\d.,]+/g, '[precio]').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (usado + l.length + 1 > cabe) break;
    lineas.unshift(l);
    usado += l.length + 1;
  }
  return lineas.join('\n');
}

/* La pregunta: primero lo de este turno (que nunca se corta) y al final la plática con lo que sobre. */
function conPlatica(cabeza, mensajes) {
  const titulo = '\n\nLa plática antes de ese mensaje (de la más vieja a la más nueva):\n';
  const p = platica(mensajes, PREGUNTA_MAX - cabeza.length - titulo.length);
  return p ? cabeza + titulo + p : cabeza;
}

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
    'lleva_logo, factura, archivo_editable y luz son true/false. acepta = true si acepta la cotización que ya tiene («va», «me late», «sí, adelante») o pregunta cómo pagar o dónde depositar el anticipo.',
    'Tipos de partida: ' + tipos + '. Campos por tipo:\n' + campos,
    'Medidas en centímetros. texto = lo que dice el letrero, tal cual lo escribió. tono "fria" o "calida". forma de caja "std" (rectangular o circular) o "nube" (silueta). acabado de recorte "sencillo", "vinil" o "sandwich".',
    'material de letras: "aluminio pintado", "aluminio cepillado", "acrilico con aluminio", "acrilico con vinil" o "acero inoxidable". comp: "recta", "cursiva" o "compleja".',
    'Si una medida la calcula por una foto o dice "más o menos" o "como de", pon "medida_confirmada": false.',
  ].join('\n');
  const pregunta = conPlatica('Último mensaje del cliente:\n' + String(textoCliente || '').slice(0, 2000)
    + '\n\nFicha actual:\n' + JSON.stringify(ficha || {}), mensajes);
  return { sistema, pregunta, mensajes: [] };
}

/** La instrucción para redactar la respuesta, con lo que decidió el código. */
export function instruccionResponder(ficha, estado, mensajes, textoCliente, decision) {
  const sistema = [
    'Eres el asistente de ventas de AL3D. Hablas como Elías, el dueño: español de México, amable, directo y breve (3 o 4 renglones), de tú.',
    'Contesta SOLO un objeto JSON: {"respuesta": "<lo que le escribes al cliente>"}.',
    'Reglas:',
    '1. NUNCA escribas precios, cantidades de dinero, porcentajes de descuento ni números de cuenta. El precio lo agrega el sistema después de tu texto.',
    '2. Si hay preguntas pendientes, haz como máximo las dos primeras, con tus palabras y en ese orden.',
    '3. Si hay cosas para Dirección, dile que lo revisas con el encargado y que hoy mismo le mandas su cotización. No prometas una hora.',
    '3b. La cotización sale el MISMO DÍA en que el cliente escribe (regla de Elías): pregunta todo lo que falte en esta plática, sin dejar nada para mañana.',
    '4. Si ya hay cotización, el sistema pone abajo el precio y el anticipo: no los repitas. Si no ha aceptado, pregúntale si quiere arrancar. Si ya aceptó (acepto), dale las gracias: abajo el sistema pone los datos para el anticipo y el WhatsApp del comprobante.',
    '4b. Si el cliente pregunta algo (el taller, los tiempos, cómo pagar), contéstalo primero con lo de la regla 6.',
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
    acepto: !!(ficha && ficha.acepta === true),
    nota_de_direccion: decision && decision.nota ? decision.nota : '',
    negocio: (ficha && ficha.negocio) || '',
  };
  const pregunta = conPlatica('Último mensaje del cliente:\n' + String(textoCliente || '').slice(0, 2000)
    + '\n\nLo que decidió el sistema:\n' + JSON.stringify(contexto)
    + '\n\nContesta SOLO {"respuesta": "..."}.', mensajes);
  return { sistema, pregunta, mensajes: [] };
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

/* Se corta por oración solo donde al punto le sigue un espacio, o en un salto de renglón: el punto de
   «2.5 semanas» o de «maps.app.goo.gl» no termina nada (antes los partía y llegaban «2. 5» y la liga rota).
   Los separadores se guardan (van en las posiciones impares) para que los renglones sigan iguales. */
export function sinDinero(t) {
  const partes = String(t || '').split(/((?<=[.!?])[ \t]+|\n+)/);
  let out = '';
  for (let i = 0; i < partes.length; i += 2) {
    if (!DINERO.test(partes[i])) out += partes[i] + (partes[i + 1] || '');
    else if (/\n/.test(partes[i + 1] || '')) out += partes[i + 1];
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
 * Lo que se le manda al cliente: el texto de la IA sin dinero, y después el precio escrito por
 * código. Cuando el cliente aceptó y su cuenta está configurada (`tarjeta`), la frase que la
 * presenta: la tarjeta misma la pinta el portal, con el diseño autorizado.
 * Sin texto de la IA (no contestó o contestó algo que no se lee) queda un texto fijo: el cliente
 * nunca se queda sin respuesta.
 */
export function armarRespuesta(textoIA, estado, ficha, tarjeta) {
  let t = sinDinero(textoIA).slice(0, MAX_RESPUESTA);
  if (!t) {
    t = estado.siguiente === 'preguntar' ? estado.pendientes[0].pregunta
      : estado.siguiente === 'direccion' ? 'Déjame revisarlo con el encargado: hoy mismo te mando tu cotización.'
      : estado.siguiente === 'descartada' ? 'Por ahora no podemos hacer este trabajo. ¡Gracias por escribirnos!'
      : '¡Listo! Aquí va tu cotización.';
  }
  const partes = [t];
  if (estado.cotizacion) partes.push(mensajeDePrecio(estado.cotizacion));
  if (estado.cotizacion && ficha && ficha.acepta === true && tarjeta) {
    partes.push('Te dejo los datos para tu anticipo (' + tarjeta.titulo.toLowerCase() + '). Cuando deposites, mándanos tu comprobante por WhatsApp al ' + WHATSAPP + '.');
  }
  return partes.join('\n\n');
}

/** Lo que va en la tarjeta de Dirección, en una línea. */
export function resumenParaDireccion(ficha) {
  const f = ficha || {};
  const ps = (f.partidas || []).map(p => (TIPOS[p.tipo] ? TIPOS[p.tipo].nombre : 'Partida') + (p.texto ? ' «' + p.texto + '»' : '')
    + (p.altura_cm ? ' ' + p.altura_cm + ' cm' : '') + (p.ancho_cm && p.alto_cm ? ' ' + p.ancho_cm + '×' + p.alto_cm + ' cm' : ''));
  return [(f.negocio || 'Sin nombre'), ps.join(', '), f.entrega === 'instalacion' && f.municipio ? 'en ' + f.municipio : ''].filter(Boolean).join(' · ').slice(0, 600);
}
