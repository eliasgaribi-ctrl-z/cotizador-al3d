/* ============================================================================
   AGENTE — el agente de ventas que atiende a los clientes (portal ahora, WhatsApp después).

   Las reglas están en _shared/agente.js (qué se le pide a la IA, qué entra a la ficha, qué se
   contesta) y en _shared/ficha.js (qué falta, qué decide Dirección, cuánto cuesta). Este archivo es
   el pegamento: el secreto de la conversación, la base, las llaves de IA y el plazo. Plan completo:
   docs/AGENTE-VENTAS.md. Tablas y RPC: supabase/migrations/0023_agente.sql.

   ENTRADA (sin sesión: el cliente no tiene cuenta; lo reconoce su SECRETO, 64 hex, que viaja en el link)
     POST { accion: 'abrir' }                       → { ok, token, respuesta }   una conversación nueva
     POST { accion: 'mensaje', token, texto }       → { ok, respuesta, estado, cotizacion }
     GET  ?t=<token>                                → { ok, estado, mensajes, cotizacion }
   SALIDA siempre HTTP 200 con { ok:false, codigo, mensaje } si algo falla (como `ia`), salvo lo de
   origen y método, que resuelve http.js.

   CADA MENSAJE DEL CLIENTE CUESTA DOS LLAMADAS A LA IA (sacar los datos y redactar). Por eso: el
   tope de 80 mensajes por conversación al día lo mira la base ANTES de llamar a la IA, abrir
   conversaciones tiene tope por IP aquí y por empresa en la base, y el cuerpo es chico (16 KB).

   La base nunca ve el secreto: aquí se saca su huella sha256 y con ella se pregunta.

   deps: { fetch, ahora, entorno, clienteBase, aleatorio?, registrar? }
         `aleatorio(arreglo)` llena un Uint8Array (por omisión crypto.getRandomValues); las pruebas
         lo fijan para que el secreto sea uno conocido.
   ============================================================================ */

import { aplicarCambios, armarRespuesta, estadoDe, instruccionExtraer, instruccionResponder, leerJson, resumenParaDireccion } from '../_shared/agente.js';
import { IA_ESPERA_CHAT_MS, consultarIA, elegirProveedor, validarPeticion } from '../_shared/ia.js';
import { crearLimitador, errorInterno, ipDeLaPeticion, json, leerTexto, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, leerLlavesIA, secretosDelEntorno } from '../_shared/entorno.js';

export const LIMITES = Object.freeze({
  maxCuerpo: 16 * 1024,
  maxTexto: 2000,
  mensajesPorDia: 80,
  /* Las dos llamadas a la IA comparten el plazo, y la función se rinde antes de los 60 s del portal. */
  esperaMs: IA_ESPERA_CHAT_MS - 5000,
  abrirPorMinuto: 10,
});

/* El orden en que se prueba a los proveedores. Son los modelos que ya están en la lista blanca de ia.js:
   aquí no se puede pedir otro. */
export const IA_AGENTE = Object.freeze([
  Object.freeze({ prov: 'gemini', model: 'gemini-3.6-flash' }),
  Object.freeze({ prov: 'qwen', model: 'qwen3.7-flash' }),
  Object.freeze({ prov: 'deepseek', model: 'deepseek-flash' }),
]);

export const SALUDO = '¡Hola! Soy el asistente de AL3D. Cuéntame qué tienes en mente —letras 3D, caja de luz, recorte, neón u otra cosa— y para qué negocio es.';
const TOKEN = /^[0-9a-f]{64}$/;
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
export async function huella(token) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

const falla = (codigo, mensaje, extra) => sobreDeError(codigo, mensaje, extra);
const sinRed = () => falla('SIN_RED', 'No pude conectar con el sistema. Intenta de nuevo en un momento.', { transitorio: true });

/* Una RPC de servicio: lo que contestó la RPC (ya con su `ok`), o null si la base no contestó. */
async function rpc(deps, nombre, args) {
  try {
    const r = await deps.clienteBase.rpcServicio(nombre, args);
    if (r.error || !r.data || typeof r.data !== 'object') return null;
    return r.data;
  } catch (_) { return null; }
}

/* Una pregunta a la IA, proveedor por proveedor, hasta que uno conteste un JSON que se lea. null si nadie. */
async function preguntarIA(deps, llaves, instr, signal) {
  for (const { prov, model } of IA_AGENTE) {
    if (signal.aborted) return null;
    const v = validarPeticion({ prov, model, modo: 'chat', sistema: instr.sistema, pregunta: instr.pregunta, mensajes: instr.mensajes });
    if (!v.ok) continue;
    const e = elegirProveedor({ prov, llaves });
    if (!e.ok) continue;
    const r = await consultarIA({ peticion: v.peticion, llaves: e.llaves, fetch: deps.fetch, signal });
    const o = r.ok ? leerJson(r.texto) : null;
    if (o) return o;
  }
  return null;
}

const claveDe = d => (d && d.id ? d.id + ':' + (d.i ?? '') : '');
const mismasRazones = (a, b) => JSON.stringify((a || []).map(claveDe).sort()) === JSON.stringify((b || []).map(claveDe).sort());

async function abrir(peticion, deps, limitador) {
  if (!(await limitador(ipDeLaPeticion(peticion) || 'sin-ip'))) {
    return falla('CUPO_AGOTADO', 'Demasiadas conversaciones nuevas desde aquí. Prueba en un minuto.', { transitorio: true });
  }
  const bytes = new Uint8Array(32);
  (deps.aleatorio || (a => crypto.getRandomValues(a)))(bytes);
  const token = hex(bytes);
  const h = await huella(token);
  const empresa = deps.entorno('AGENTE_EMPRESA') || 'al3d';
  const a = await rpc(deps, 'agente_abrir', { p_empresa: empresa, p_token_hash: h, p_canal: 'portal', p_contacto: {} });
  if (!a) return sinRed();
  if (!a.ok) return a;
  const g = await rpc(deps, 'agente_guardar', { p_token_hash: h, p_texto_cliente: '', p_texto_agente: SALUDO, p_ficha: {}, p_cotizacion: null, p_razones: [], p_resumen: '' });
  if (!g) return sinRed();
  return { ok: true, token, respuesta: SALUDO };
}

async function mensaje(cuerpo, deps) {
  const token = String(cuerpo.token || '');
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : '';
  if (!TOKEN.test(token)) return falla('DATO_INVALIDO', 'Este link no es válido.');
  if (!texto || texto.length > LIMITES.maxTexto) return falla('DATO_INVALIDO', 'Escribe tu mensaje (hasta ' + LIMITES.maxTexto + ' letras).');
  const h = await huella(token);
  const c = await rpc(deps, 'agente_leer', { p_token_hash: h });
  if (!c) return sinRed();
  if (!c.ok) return c;
  if (c.mensajes_cliente_24h >= LIMITES.mensajesPorDia) {
    return falla('CUPO_AGOTADO', 'Por hoy ya no puedo contestar más en esta conversación. Mañana seguimos, o escríbenos por WhatsApp.');
  }
  const llaves = leerLlavesIA(deps.entorno);
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), LIMITES.esperaMs);
  try {
    const ext = await preguntarIA(deps, llaves, instruccionExtraer(c.ficha, c.mensajes, texto), ctrl.signal);
    const ficha = aplicarCambios(c.ficha, ext);
    let estado = estadoDe(ficha);
    let razones = estado.decisiones;
    /* Lo que Dirección ya decidió no se vuelve a preguntar mientras las razones sean las mismas: con
       precio, ese precio es la cotización; sin precio, el agente pasa la nota y no abre otra tarjeta.
       Se busca entre las últimas decisiones y no solo en la última: después de decidir el logo se
       puede abrir otra tarjeta (la cuenta, por ejemplo) y el logo sigue decidido. */
    const d = razones.length ? (c.decisiones || []).find(x => x && x.estado !== 'pendiente' && mismasRazones(x.razones, razones)) : null;
    if (d) {
      razones = [];
      if (d.estado !== 'descartada' && d.precio !== null && d.precio !== undefined) {
        estado = { ...estado, decisiones: [], siguiente: 'cerrar', cotizacion: { total: Number(d.precio), iva: ficha.factura === true, de: 'direccion' } };
      }
    }
    const cuenta = deps.entorno('AGENTE_CUENTA') || '';
    if (ficha.acepta === true && estado.cotizacion && !cuenta) {
      razones = [...razones, { id: 'cuenta', razon: 'El cliente aceptó la cotización y no hay cuenta de depósito configurada (AGENTE_CUENTA).' }];
    }
    const r = await preguntarIA(deps, llaves, instruccionResponder(ficha, estado, c.mensajes, texto, d || c.decision), ctrl.signal);
    const respuesta = armarRespuesta(r && typeof r.respuesta === 'string' ? r.respuesta : '', estado, ficha, cuenta);
    const g = await rpc(deps, 'agente_guardar', {
      p_token_hash: h, p_texto_cliente: texto, p_texto_agente: respuesta, p_ficha: ficha,
      p_cotizacion: estado.cotizacion, p_razones: razones, p_resumen: resumenParaDireccion(ficha),
    });
    if (!g) return sinRed();
    if (!g.ok) return g;
    return { ok: true, respuesta, estado: g.estado, cotizacion: estado.cotizacion ? { total: estado.cotizacion.total, iva: estado.cotizacion.iva } : null };
  } finally {
    clearTimeout(reloj);
  }
}

async function leer(url, deps) {
  const token = String(url.searchParams.get('t') || '');
  if (!TOKEN.test(token)) return falla('DATO_INVALIDO', 'Este link no es válido.');
  const c = await rpc(deps, 'agente_leer', { p_token_hash: await huella(token) });
  if (!c) return sinRed();
  if (!c.ok) return c;
  return { ok: true, estado: c.estado, mensajes: c.mensajes, cotizacion: c.cotizacion };
}

/** La función entera. Una por instancia: el tope por IP vive en `limitador`. */
export function crearManejador(depsFijas) {
  const limitador = crearLimitador({ ahora: depsFijas.ahora, maximo: LIMITES.abrirPorMinuto, ventanaMs: 60000 });
  return peticion => manejar(peticion, depsFijas, limitador);
}

export async function manejar(peticion, deps, limitador) {
  const lim = limitador || crearLimitador({ ahora: deps.ahora, maximo: LIMITES.abrirPorMinuto, ventanaMs: 60000 });
  const antes = previa(peticion, { metodos: ['GET', 'POST'] });
  if (antes) return antes;
  const secretos = secretosDelEntorno(deps.entorno);
  const responder = cuerpo => json(peticion, 200, cuerpo, { secretos });
  try {
    if (peticion.method.toUpperCase() === 'GET') return responder(await leer(new URL(peticion.url), deps));
    const t = await leerTexto(peticion, LIMITES.maxCuerpo);
    if (!t.ok) return responder(falla('DATO_INVALIDO', 'El mensaje es demasiado grande.'));
    let cuerpo;
    try { cuerpo = JSON.parse(t.texto); } catch (_) { return responder(falla('DATO_INVALIDO', 'El cuerpo no es JSON.')); }
    if (!cuerpo || typeof cuerpo !== 'object') return responder(falla('DATO_INVALIDO', 'El cuerpo no es JSON.'));
    if (cuerpo.accion === 'abrir') return responder(await abrir(peticion, deps, lim));
    if (cuerpo.accion === 'mensaje') return responder(await mensaje(cuerpo, deps));
    return responder(falla('DATO_INVALIDO', 'Acción desconocida.'));
  } catch (e) {
    if (esErrorDeEntorno(e)) return json(peticion, 503, falla('CONFIGURACION', e.message), { secretos });
    registrar(deps, 'agente', 'error', 'inesperado', { error: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}
