/* Prueba del agente de ventas: la lógica (supabase/functions/_shared/agente.js) y la función entera
   (supabase/functions/agente/handler.js) con una base y una IA de mentiras.

   Lo que se cuida, en orden de cuánto cuesta equivocarse:
     · que NINGÚN número de dinero escrito por la IA llegue al cliente, y que el precio sea el de
       precio.js (vía ficha.js), escrito por código;
     · que la IA no pueda meterle a la ficha campos, tipos o valores que no existen;
     · que lo que Dirección ya decidió no abra otra tarjeta y que su precio mande;
     · que el tope de mensajes se mire ANTES de gastar una llamada a la IA, y que sin IA el cliente
       reciba de todos modos la siguiente pregunta;
     · que la cuenta de depósito salga solo cuando el cliente aceptó y hay cuenta configurada.
   Node puro: sin red, sin base y sin Deno. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as A from '../supabase/functions/_shared/agente.js';
import { manejar, huella, SALUDO } from '../supabase/functions/agente/handler.js';

let bien = 0, mal = 0;
const eq = (que, dio, esp) => {
  const ok = JSON.stringify(dio) === JSON.stringify(esp);
  console.log((ok ? '  ok   ' : '  FALLA ') + que);
  if (!ok) console.log('         dio: ' + JSON.stringify(dio) + '\n         esp: ' + JSON.stringify(esp));
  ok ? bien++ : mal++;
};
const cierto = (que, c) => eq(que, !!c, true);

const LISTA = { contacto: 'Daniel', negocio: 'Tacos Juan', lleva_logo: false, entrega: 'instalacion', municipio: 'Zapopan', lugar: 'exterior',
  altura_m: 3, factura: true, fecha_deseada: '2026-11-20',
  partidas: [{ tipo: 'letras', texto: 'TACOS', altura_cm: 40, material: 'acr-vol', luz: true, tono: 'fria', comp: 'recta' }] };

console.log('\nAPLICAR CAMBIOS — solo lo que existe');
let f = A.aplicarCambios({}, { proyecto: { negocio: '  Tacos Juan ', factura: 'sí', precio: 1, entrega: 'a domicilio', altura_m: '3,5' },
  partidas: [{ tipo: 'letras', texto: 'TACOS', altura_cm: 40, luz: true, total: 99999 }, { tipo: 'cohete', texto: 'x' }] });
eq('el negocio se limpia', f.negocio, 'Tacos Juan');
eq('«sí» no es booleano: la pregunta sigue pendiente', 'factura' in f, false);
eq('un campo que no existe no entra', 'precio' in f, false);
eq('una entrega fuera de la lista no entra', 'entrega' in f, false);
eq('«3,5» metros sí se entiende', f.altura_m, 3.5);
eq('el tipo inventado no se agrega', f.partidas.length, 1);
eq('ni un «total» que mande la IA', 'total' in f.partidas[0], false);
f = A.aplicarCambios(f, { partidas: [{ i: 0, material: 'acrilico con aluminio', tono: 'azul' }] });
eq('con `i` completa la que ya existe', [f.partidas.length, f.partidas[0].material], [1, 'acrilico con aluminio']);
eq('un tono que no existe no entra', 'tono' in f.partidas[0], false);
eq('la ficha de entrada no se toca', A.aplicarCambios(LISTA, { proyecto: { negocio: 'Otro' } }).negocio === 'Otro' && LISTA.negocio === 'Tacos Juan', true);
eq('basura de la IA no rompe nada', A.aplicarCambios(LISTA, 'no soy un objeto').negocio, 'Tacos Juan');
eq('no más de 10 partidas', A.aplicarCambios({}, { partidas: Array.from({ length: 15 }, () => ({ tipo: 'neon' })) }).partidas.length, 10);

console.log('\nQUÉ SIGUE');
eq('ficha vacía: preguntar', A.estadoDe({}).siguiente, 'preguntar');
eq('completa y sin logo: cerrar, con precio', [A.estadoDe(LISTA).siguiente, A.estadoDe(LISTA).cotizacion.total], ['cerrar', 9280]);
eq('con logo: Dirección y sin precio', [A.estadoDe({ ...LISTA, lleva_logo: true }).siguiente, A.estadoDe({ ...LISTA, lleva_logo: true }).cotizacion], ['direccion', null]);

console.log('\nLEER EL JSON DE LA IA');
eq('entre ```', A.leerJson('```json\n{"respuesta":"hola"}\n```'), { respuesta: 'hola' });
eq('con una frase antes', A.leerJson('Claro, aquí va: {"a":1}'), { a: 1 });
eq('sin objeto', A.leerJson('no sé'), null);
eq('una lista no es la respuesta', A.leerJson('[1,2]'), null);

console.log('\nLA PLÁTICA VA EN LA PREGUNTA, NO COMO TURNOS');
/* En producción (2026-10-25) los turnos de «assistant» hacían que el modelo contestara en texto suelto y su
   respuesta se tiraba: desde el segundo mensaje el cliente solo recibía la pregunta fija de la ficha. */
const estL = A.estadoDe(LISTA);
const HILO = [{ de: 'agente', texto: A.SALUDO }, { de: 'cliente', texto: 'Letras CAFE de 30 cm' },
  { de: 'agente', texto: '¡Listo!\n\nTu cotización: $13,920.00 con IVA incluido.' }, { de: 'cliente', texto: 'va' }];
const iR = A.instruccionResponder(LISTA, estL, HILO, '¿y dónde está su taller?', null);
const iE = A.instruccionExtraer(LISTA, HILO, '¿y dónde está su taller?');
eq('ningún turno aparte: ni para responder ni para sacar datos', [iR.mensajes, iE.mensajes], [[], []]);
cierto('lo de este turno va primero (si algo se corta, es lo viejo)', iR.pregunta.startsWith('Último mensaje del cliente:\n¿y dónde está su taller?') && iE.pregunta.startsWith('Último mensaje del cliente:'));
cierto('la plática va en orden y con quién dijo qué', /Cliente: Letras CAFE de 30 cm\nAL3D: ¡Listo! Tu cotización: \[precio\] con IVA incluido\.\nCliente: va$/.test(iR.pregunta));
cierto('el monto va tapado: el precio lo escribe el código', !iR.pregunta.includes('13,920'));
const largo = Array.from({ length: 40 }, (_, i) => ({ de: i % 2 ? 'cliente' : 'agente', texto: 'mensaje ' + i + ' ' + 'x'.repeat(400) }));
const iL = A.instruccionResponder(LISTA, estL, largo, 'y'.repeat(2000), null);
cierto('con una plática larga cabe en el tope de ia.js y se queda lo más nuevo',
  iL.pregunta.length <= A.PREGUNTA_MAX && iL.pregunta.includes('mensaje 39 ') && !iL.pregunta.includes('mensaje 0 '));
const acepto = fi => JSON.parse(A.instruccionResponder(fi, estL, HILO, 'va', null).pregunta.match(/Lo que decidió el sistema:\n(.*)\n/)[1]).acepto;
eq('le dice si el cliente ya aceptó', [acepto(LISTA), acepto({ ...LISTA, acepta: true })], [false, true]);
cierto('«me late» y preguntar cómo pagar cuentan como aceptar', /me late/.test(iE.sistema) && /cómo pagar/.test(iE.sistema));

console.log('\nNI UN PESO ESCRITO POR LA IA');
eq('quita la oración con $', A.sinDinero('¡Va! Te sale en $5,000 más o menos. ¿Lleva luz?'), '¡Va! ¿Lleva luz?');
eq('y la de «pesos»', A.sinDinero('Serían 3500 pesos. ¿Factura?'), '¿Factura?');
eq('el punto de una liga o de «2.5» no corta (producción, 2026-10-25: «maps. app. goo. gl» y «2. 5 semanas»)',
  A.sinDinero('El taller: https://maps.app.goo.gl/AQHck791iv5U4qRS9. Queda de 2.5 a 3 semanas.'), 'El taller: https://maps.app.goo.gl/AQHck791iv5U4qRS9. Queda de 2.5 a 3 semanas.');
eq('los renglones se quedan, y la oración con dinero se va sin dejar hueco', A.sinDinero('¡Hola!\n\nSerían $9,000.\nVa en exterior.'), '¡Hola!\n\nVa en exterior.');
eq('las medidas y los porcentajes de anticipo no son dinero', A.sinDinero('Las letras de 40 cm quedan bien. El anticipo es del 50 %.'), 'Las letras de 40 cm quedan bien. El anticipo es del 50 %.');
const est = A.estadoDe(LISTA);
const r1 = A.armarRespuesta('¡Listo! Te sale en $1,000. ¿Arrancamos?', est, LISTA, '');
cierto('el precio de la IA no llega', !r1.includes('1,000'));
cierto('el de verdad sí, escrito por código', r1.includes('$9,280.00') && r1.includes('$4,640.00'));
/* Las tarjetas de depósito: los datos de mentiras, con las llaves de las tarjetas autorizadas de Elías. */
const SIN = JSON.stringify({ banco: 'BBVA', beneficiario: 'Persona de Prueba', tarjeta: '0000-1111-2222-3333' });
const CON = JSON.stringify({ banco: 'BANREGIO', beneficiario: 'EMPRESA DE PRUEBA SA DE CV', cta: '000-000-000-000', clabe: '000-000-000-000-000-000', rfc: 'XAXX010101000' });
const ent = o => n => o[n];
eq('sin factura: la tarjeta «Sin factura» con banco, beneficiario y tarjeta',
  A.tarjetaDeDeposito({ factura: false }, ent({ AGENTE_CUENTA_SIN_FACTURA: SIN, AGENTE_CUENTA_CON_FACTURA: CON })),
  { titulo: 'Sin factura', filas: [['Banco', 'BBVA'], ['Beneficiario', 'Persona de Prueba'], ['Tarjeta', '0000-1111-2222-3333']], nota: '', whatsapp: '33 2813 0092', taller: ['Naranjos 648, Linda Vista', '45169 Zapopan, Jal.'] });
eq('con factura: la de la empresa, con cuenta, CLABE, RFC y la nota del precio neto',
  (t => [t.titulo, t.filas.map(f => f[0]), t.nota])(A.tarjetaDeDeposito({ factura: true }, ent({ AGENTE_CUENTA_SIN_FACTURA: SIN, AGENTE_CUENTA_CON_FACTURA: CON }))),
  ['Con factura', ['Banco', 'Beneficiario', 'Cta', 'Clabe', 'RFC'], 'Precio neto establecido en la cotización']);
eq('sin la variable, o con algo que no es JSON, no hay tarjeta', [A.tarjetaDeDeposito({}, ent({})), A.tarjetaDeDeposito({}, ent({ AGENTE_CUENTA_SIN_FACTURA: 'BBVA 0000' }))], [null, null]);
eq('una tarjeta sin banco no es tarjeta', A.tarjetaDeDeposito({}, ent({ AGENTE_CUENTA_SIN_FACTURA: JSON.stringify({ tarjeta: '1', beneficiario: 'x' }) })), null);
const TJ = A.tarjetaDeDeposito({}, ent({ AGENTE_CUENTA_SIN_FACTURA: SIN }));
cierto('sin aceptar no va la frase de la cuenta', !A.armarRespuesta('Va', est, LISTA, TJ).includes('datos para tu anticipo'));
cierto('aceptó y hay tarjeta: la frase, y el número NO va en el texto (lo pinta la tarjeta)',
  (t => t.includes('datos para tu anticipo (sin factura)') && t.includes('33 2813 0092') && !t.includes('0000-1111'))(A.armarRespuesta('Va', est, { ...LISTA, acepta: true }, TJ)));
eq('sin texto de la IA, la siguiente pregunta', A.armarRespuesta('', A.estadoDe({ ...LISTA, factura: null }), LISTA, ''), '¿Vas a requerir factura?');
eq('el resumen para el teléfono de Elías', A.resumenParaDireccion(LISTA), 'Tacos Juan · Letras 3D «TACOS» 40 cm · en Zapopan');

/* ============================================================================
   LA FUNCIÓN ENTERA, con una base y una IA de mentiras
   ============================================================================ */

/* La base: lo mínimo de 0023 (supabase/tests/agente/agente.mjs prueba la de verdad). */
function baseDeMentiras() {
  const convs = new Map();
  const llamadas = [];
  return {
    convs, llamadas,
    async rpcServicio(nombre, a) {
      llamadas.push(nombre);
      if (nombre === 'agente_abrir') { convs.set(a.p_token_hash, { ficha: {}, estado: 'abierta', mensajes: [], decisiones: [], cotizacion: null }); return { data: { ok: true, id: 'c1' }, error: null }; }
      const c = convs.get(a.p_token_hash);
      if (!c) return { data: { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Esa conversación no existe.' }, error: null };
      if (nombre === 'agente_leer') {
        const ds = [...c.decisiones].reverse();
        return { data: { ok: true, estado: c.estado, ficha: c.ficha, cotizacion: c.cotizacion, mensajes: c.mensajes.slice(-30), decision: ds[0] || null, decisiones: ds,
          mensajes_cliente_24h: c.forzar24h ?? c.mensajes.filter(m => m.de === 'cliente').length }, error: null };
      }
      if (nombre === 'agente_guardar') {
        if (a.p_texto_cliente) c.mensajes.push({ de: 'cliente', texto: a.p_texto_cliente });
        if (a.p_texto_agente) c.mensajes.push({ de: 'agente', texto: a.p_texto_agente });
        c.ficha = a.p_ficha; c.cotizacion = a.p_cotizacion || c.cotizacion; c.razones = a.p_razones;
        /* Como 0023: las razones van a la tarjeta pendiente, o abren una. */
        if (a.p_razones.length) {
          const pend = c.decisiones.find(d => d.estado === 'pendiente');
          if (pend) pend.razones = a.p_razones;
          else c.decisiones.push({ id: 'd' + (c.decisiones.length + 1), estado: 'pendiente', razones: a.p_razones, precio: null, nota: '' });
        }
        c.estado = a.p_razones.length ? 'con_direccion' : a.p_cotizacion ? 'cotizada' : 'abierta';
        return { data: { ok: true, estado: c.estado }, error: null };
      }
      throw new Error('rpc desconocida ' + nombre);
    },
  };
}
/* La IA: solo Qwen tiene llave (Gemini y DeepSeek contestan SIN_LLAVE y se saltan); contesta lo que haya en la cola. */
function iaDeMentiras(cola) {
  const pedidas = [];
  const fetch = async (url, op) => {
    pedidas.push(JSON.parse(op.body));
    if (!cola.length) throw new Error('sin red');
    const contenido = cola.shift();
    return new Response(JSON.stringify({ choices: [{ message: { content: contenido } }] }), { status: 200 });
  };
  return { fetch, pedidas };
}
const ENTORNO = { IA_KEYS: JSON.stringify({ qwen: ['sk-falsa-qwen-00000000000000'], deepseek: [], gemini: [] }), AGENTE_EMPRESA: 'al3d' };
const deps = (base, ia, extra = {}) => ({ fetch: ia.fetch, ahora: () => 1792900000000, entorno: n => ({ ...ENTORNO, ...extra })[n],
  clienteBase: base, aleatorio: a => a.fill(7) });
const post = cuerpo => new Request('https://al3d.supabase.co/functions/v1/agente', { method: 'POST', body: JSON.stringify(cuerpo) });
const leerResp = async r => [r.status, await r.json()];

console.log('\nLA FUNCIÓN — abrir, platicar, cotizar');
{
  const base = baseDeMentiras();
  const ia = iaDeMentiras([
    JSON.stringify({ proyecto: { contacto: 'Daniel', negocio: 'Tacos Juan', lleva_logo: false, entrega: 'instalacion', municipio: 'Zapopan', lugar: 'exterior', altura_m: 3, factura: true, fecha_deseada: '2026-11-20' },
                     partidas: [{ tipo: 'letras', texto: 'TACOS', altura_cm: 40, material: 'acrilico con aluminio', luz: true, tono: 'fria', comp: 'recta' }] }),
    JSON.stringify({ respuesta: '¡Perfecto! Te quedaría en $5,000 aprox. Abajo te dejo el precio. ¿Arrancamos?' }),
  ]);
  const [s1, a] = await leerResp(await manejar(post({ accion: 'abrir' }), deps(base, ia)));
  eq('abrir: 200, ok y el saludo', [s1, a.ok, a.respuesta], [200, true, SALUDO]);
  eq('el secreto son 64 hex (aquí, el de mentiras)', a.token, '07'.repeat(32));
  const h = await huella(a.token);
  cierto('a la base solo llegó la huella', base.convs.has(h) && !base.convs.has(a.token));
  const [, m] = await leerResp(await manejar(post({ accion: 'mensaje', token: a.token, texto: 'Quiero letras TACOS de 40 cm con luz fría para Tacos Juan en Zapopan, a 3 m, con factura, para el 20 de noviembre, sin logo' }), deps(base, ia)));
  eq('cotizada, con el precio del catálogo', [m.ok, m.estado, m.cotizacion], [true, 'cotizada', { total: 9280, iva: true }]);
  cierto('el «$5,000» de la IA no llegó al cliente', !m.respuesta.includes('5,000'));
  cierto('el precio sí, escrito por código', m.respuesta.includes('$9,280.00'));
  eq('dos llamadas a la IA en la vuelta', ia.pedidas.length, 2);
  eq('a la IA solo le llega system + una pregunta: la plática va adentro', ia.pedidas.map(p => p.messages.map(x => x.role).join()), ['system,user', 'system,user']);
  cierto('la IA nunca recibe el secreto', !JSON.stringify(ia.pedidas).includes(a.token));
  const [, g] = await leerResp(await manejar(post({ accion: 'leer', token: a.token }), deps(base, ia)));
  eq('el portal lee la plática', g.mensajes.map(x => x.de), ['agente', 'cliente', 'agente']);
  eq('por GET no: el secreto nunca va en la dirección', (await manejar(new Request('https://al3d.supabase.co/functions/v1/agente?t=' + a.token), deps(base, ia))).status, 405);
}

console.log('\nLA FUNCIÓN — la IA contesta en texto suelto');
{
  const base = baseDeMentiras();
  const { token } = await (await manejar(post({ accion: 'abrir' }), deps(base, iaDeMentiras([])))).json();
  base.convs.get(await huella(token)).ficha = { ...LISTA };
  const iaT = iaDeMentiras(['{"proyecto":{},"partidas":[]}', 'Claro: el taller está en Naranjos 648, Linda Vista, en Zapopan.']);
  const [, m] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: '¿dónde está su taller?' }), deps(base, iaT)));
  cierto('lo que contestó se usa, y el precio va abajo', m.respuesta.startsWith('Claro: el taller está en Naranjos 648') && m.respuesta.includes('$9,280.00'));
  const iaR = iaDeMentiras(['{"proyecto":{},"partidas":[]}', '{"respuesta": "Claro, el taller']);
  const [, m2] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: '¿dónde está su taller?' }), deps(base, iaR)));
  cierto('un JSON roto no llega al cliente: queda el texto fijo', m2.respuesta.startsWith('¡Listo! Aquí va tu cotización.') && !m2.respuesta.includes('{'));
}

console.log('\nLA FUNCIÓN — Dirección, topes y sin IA');
{
  const base = baseDeMentiras();
  const ia = iaDeMentiras([]);
  const { token } = await (await manejar(post({ accion: 'abrir' }), deps(base, ia))).json();
  const h = await huella(token);
  const c = base.convs.get(h);
  /* Sin IA (no hay respuestas en la cola: la red «falla»): la ficha no cambia y el cliente recibe la siguiente pregunta. */
  const [, m] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: 'hola' }), deps(base, ia)));
  eq('sin IA, la siguiente pregunta de la ficha (la primera de Elías: el nombre)', [m.ok, m.respuesta.startsWith('¿Cuál es tu nombre?')], [true, true]);
  /* Logo: va a Dirección. */
  c.ficha = { ...LISTA, lleva_logo: true };
  const ia2 = iaDeMentiras(['{"proyecto":{},"partidas":[]}', '{"respuesta":"Déjame revisarlo con el encargado."}']);
  const [, m2] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: 'y lleva mi logo' }), deps(base, ia2)));
  eq('con logo va a Dirección, sin precio', [m2.estado, m2.cotizacion, c.razones.map(r => r.id)], ['con_direccion', null, ['logo']]);
  /* Dirección aprobó con precio: no se abre otra tarjeta y ese precio manda. */
  Object.assign(c.decisiones[0], { estado: 'aprobada', precio: 15000, nota: 'El logo va en caja de luz.' });
  const ia3 = iaDeMentiras(['{"proyecto":{},"partidas":[]}', '{"respuesta":"Ya lo revisó el encargado: el logo va en caja de luz."}']);
  const [, m3] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: '¿ya?' }), deps(base, ia3)));
  eq('el precio de Dirección es la cotización', [m3.estado, m3.cotizacion, c.razones], ['cotizada', { total: 15000, iva: true }, []]);
  cierto('y se lo dice al cliente', m3.respuesta.includes('$15,000.00'));
  /* Aceptó sin cuenta configurada: tarjeta para Dirección; con cuenta, la cuenta. */
  const ia4 = iaDeMentiras(['{"proyecto":{"acepta":true},"partidas":[]}', '{"respuesta":"¡Excelente!"}']);
  await manejar(post({ accion: 'mensaje', token, texto: 'va, hagámoslo' }), deps(base, ia4));
  eq('aceptó y no hay cuenta: avisa a Dirección, con la variable que falta', [c.razones.map(r => r.id), /AGENTE_CUENTA_CON_FACTURA/.test(c.razones[0].razon)], [['cuenta'], true]);
  const ia5 = iaDeMentiras(['{"proyecto":{},"partidas":[]}', '{"respuesta":"¡Excelente!"}']);
  const [, m5] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: '¿a dónde deposito?' }), deps(base, ia5, { AGENTE_CUENTA_CON_FACTURA: CON })));
  eq('con factura y su cuenta: la tarjeta «Con factura» va en la respuesta para que el portal la pinte', [m5.cuenta && m5.cuenta.titulo, m5.respuesta.includes('datos para tu anticipo (con factura)')], ['Con factura', true]);
  const [, l5] = await leerResp(await manejar(post({ accion: 'leer', token }), deps(base, ia5, { AGENTE_CUENTA_CON_FACTURA: CON })));
  eq('y al volver a abrir el link sigue ahí (se arma al leer, no se guarda)', l5.cuenta && l5.cuenta.titulo, 'Con factura');
  eq('con la tarjeta de la cuenta abierta, el logo sigue decidido: no se reabre', [m5.cotizacion, c.decisiones.map(d => d.razones.map(r => r.id).join())], [{ total: 15000, iva: true }, ['logo', 'cuenta']]);
  /* Dirección dijo que no se hace: el agente no vuelve a decir «lo reviso». */
  const t2 = (await (await manejar(post({ accion: 'abrir' }), { ...deps(base, ia), aleatorio: x => x.fill(9) })).json());   // otro secreto
  const c2 = base.convs.get(await huella(t2.token));
  c2.ficha = { ...LISTA, partidas: [{ tipo: 'neon', ancho_cm: 100, alto_cm: 50, colores: 'rosa', base: 'transparente' }] };
  c2.decisiones.push({ id: 'dx', estado: 'descartada', razones: [{ id: 'tipo', i: 0, razon: 'Neón flex: no está en el catálogo, se cotiza a mano.' }], precio: null, nota: '' });
  const iaD = iaDeMentiras(['{"proyecto":{},"partidas":[]}']);
  const [, mD] = await leerResp(await manejar(post({ accion: 'mensaje', token: t2.token, texto: '¿y mi neón?' }), deps(base, iaD)));
  eq('descartada: no abre otra tarjeta y no dice «lo reviso»', [c2.razones, mD.respuesta], [[], 'Por ahora no podemos hacer este trabajo. ¡Gracias por escribirnos!']);
  /* El tope se mira antes de la IA. */
  c.forzar24h = 80;
  const ia6 = iaDeMentiras(['{}', '{}']);
  const [, m6] = await leerResp(await manejar(post({ accion: 'mensaje', token, texto: 'otro' }), deps(base, ia6)));
  eq('80 mensajes en el día: no contesta y no gasta IA', [m6.codigo, ia6.pedidas.length], ['CUPO_AGOTADO', 0]);
}

console.log('\nLA FUNCIÓN — lo que se rechaza');
{
  const base = baseDeMentiras(), ia = iaDeMentiras([]);
  eq('token que no es de 64 hex', (await (await manejar(post({ accion: 'mensaje', token: 'abc', texto: 'hola' }), deps(base, ia))).json()).codigo, 'DATO_INVALIDO');
  eq('un link que nadie abrió', (await (await manejar(post({ accion: 'mensaje', token: 'f'.repeat(64), texto: 'hola' }), deps(base, ia))).json()).codigo, 'NO_ENCONTRADO');
  eq('mensaje vacío', (await (await manejar(post({ accion: 'mensaje', token: 'f'.repeat(64), texto: '  ' }), deps(base, ia))).json()).codigo, 'DATO_INVALIDO');
  eq('acción desconocida', (await (await manejar(post({ accion: 'borrar' }), deps(base, ia))).json()).codigo, 'DATO_INVALIDO');
  eq('un origen de fuera: 403', (await manejar(new Request('https://al3d.supabase.co/functions/v1/agente', { method: 'POST', body: '{}', headers: { origin: 'https://otra.com' } }), deps(base, ia))).status, 403);
  eq('sin IA_KEYS: 503 CONFIGURACION', await (async () => {
    const b = baseDeMentiras();
    const { token } = await (await manejar(post({ accion: 'abrir' }), deps(b, ia))).json();
    const r = await manejar(post({ accion: 'mensaje', token, texto: 'hola' }), { ...deps(b, ia), entorno: n => (n === 'AGENTE_EMPRESA' ? 'al3d' : undefined) });
    return [r.status, (await r.json()).codigo];
  })(), [503, 'CONFIGURACION']);
}

console.log('\nEL ARCHIVO PARA EL PANEL (agente/desplegar/index.ts) — al día con sus fuentes');
{
  const raiz = new URL('../', import.meta.url);
  const leer = r => readFileSync(new URL(r, raiz), 'utf8');
  const txt = leer('supabase/functions/agente/desplegar/index.ts');
  const fuentes = [...txt.matchAll(/^\/\/ {3}([0-9a-f]{16}) {2}(\S+)$/gm)].map(m => ({ h: m[1], f: m[2] }));
  const huellaDe = t => createHash('sha256').update(t.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16);
  eq('cada fuente de su cabecera tiene la huella de hoy (si falla: node supabase/functions/agente/desplegar/armar.mjs)',
    fuentes.filter(x => huellaDe(leer(x.f)) !== x.h).map(x => x.f), []);
  cierto('y lleva la ficha, el agente y el precio adentro', ['_shared/ficha.js', '_shared/agente.js', '_shared/precio.js', 'agente/handler.js'].every(f => fuentes.some(x => x.f.endsWith(f))));
  eq('lo único de fuera: supabase-js 2', [...txt.matchAll(/^import .* from "([^"]+)";$/gm)].map(m => m[1]), ['npm:@supabase/supabase-js@2']);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
