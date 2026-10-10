/* ============================================================================
   IA — las consultas a Qwen, DeepSeek y Gemini por el servidor (reemplaza /ia del Apps Script).

   Las llaves de los proveedores viven aquí, del lado del servidor (IA_KEYS, secreto de la función),
   y el teléfono le pide a la función que llame por él. Qué se acepta, qué se le manda a cada
   proveedor y cómo se lee lo que contestan está en _shared/ia.js y es lo mismo que hacía el .gs;
   este archivo es el pegamento: la sesión, las llaves, el cupo, el cuerpo y el plazo.

   ENTRADA   POST con el cuerpo de siempre y  Authorization: Bearer <JWT de la persona>:
               { prov, model, modo: 'cotizar', prompt, imagen: {b64, mime}, sinJson }
               { prov, model, modo: 'chat', sistema, pregunta, mensajes: [{role, content}] }
             (los campos de más, como `ruta` o `token`, se ignoran)
             GET con la misma sesión: qué proveedores tienen llave, lo que `/salud` contestaba en
             `ia` y lo que leen el cotizador y el asistente para saltarse a los que no.
   SALIDA    SIEMPRE con HTTP 200 y la forma de siempre: el teléfono lee `codigo` del cuerpo, y con un
             401 o un 403 lo tomaría por «este teléfono no tiene permiso» (ia.js lo dice):
               { ok: true, texto, prov, model }
               { ok: false, codigo: 'DATO_INVALIDO'|'SIN_LLAVE'|'SIN_RED'|'CUPO_AGOTADO'|'VACIO'|'PROVEEDOR', … }
               GET →  { ok: true, ia: { qwen: bool, deepseek: bool, gemini: bool } }
             Lo que no es de ia.js es de la sesión y va con su HTTP: sin sesión 401 SIN_SESION; sin
             acceso 403 SIN_ACCESO / ACCESO_REVOCADO; sin poder confirmarla 503 (ver auth.js); falta
             IA_KEYS 503 CONFIGURACION (con su nombre: ya sabemos quién pregunta); origen no
             permitido 403; método que no es GET ni POST 405.

   EL ORDEN ES EL DE rutaIA_ DEL .gs Y NO ES UN DETALLE (ia.js lo explica):
     sesión → llaves (IA_KEYS) → cuerpo (tope y JSON) → petición (proveedor, modelo, formato) →
     las llaves de ese proveedor, en su turno (SIN_LLAVE no gasta cupo) → EL CUPO → el proveedor.
   La sesión va primero y antes de leer el cuerpo: a quien no la trae no se le leen quince megas.
   El cupo se cuenta ANTES de llamar al proveedor, y una sola vez, con la RPC ia_cuota: 200 al día por
   persona, el día de Ciudad de México (Q-19) y atómico en la base (A.md §8.1). Si no se pudo contar,
   se niega con SIN_RED (transitorio): pasar sin contar es justo lo que el cupo cierra. El turno de las
   llaves de un mismo proveedor (para repartir la cuota entre ellas) lo lleva la RPC ia_turno; sin
   ella se empieza por la primera llave y no pasa nada más.

   NINGUNA LLAVE SALE. Ni en la respuesta ni en el registro: ia.js esconde las del proveedor que se
   usó en lo que éste conteste, las excepciones de red no pasan su mensaje (en Deno suele traer la
   dirección, y la de Gemini lleva la llave), y http.js esconde cualquier aparición de cualquier llave
   en lo último que sale.

   TOPES (los de hoy; ver LIMITES): el cuerpo de 15 MB, medido en bytes mientras se lee y sin
   guardar nada de más; y el plazo, que se rinde unos segundos ANTES de lo que espera el teléfono
   (100 s al cotizar, 60 s en el asistente) para que le llegue un fallo nuestro y el siguiente
   proveedor de su cadena, y no su propio corte.

   deps: { fetch, ahora, entorno, clienteBase, limites?, registrar? }
         `fetch` es el que sale a internet (solo hacia los tres proveedores, con sus llaves).
         `limites` pisa LIMITES, para las pruebas.
   ============================================================================ */

import {
  IA_ESPERA_CHAT_MS, IA_ESPERA_MS, IA_LIMITE_DIARIO, IA_MAX_CUERPO,
  consultarIA, decidirCuota, elegirProveedor, proveedoresConLlave, validarCuerpoCrudo, validarPeticion,
} from '../_shared/ia.js';
import { exigirAcceso } from '../_shared/auth.js';
import { errorInterno, json, leerTexto, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, leerLlavesIA, secretosDelEntorno } from '../_shared/entorno.js';

/* Cuánto antes que el teléfono se rinde la función. */
const MARGEN_MS = 5000;
export const LIMITES = Object.freeze({
  /* 15 MB, como el .gs. NO CONFIRMADO: el límite real del cuerpo de una petición a una Edge Function
     de Supabase (la página de límites no lo declara; sí dice 150 s de plazo en el plan Free, 2 s de
     CPU por petición sin contar la espera de red y 256 MB de memoria). Si fuera menor, la
     plataforma contestaría 413 sin llegar aquí; la app ya manda las imágenes a 1600 px. */
  maxCuerpo: IA_MAX_CUERPO,
  esperaCotizarMs: IA_ESPERA_MS - MARGEN_MS,
  esperaChatMs: IA_ESPERA_CHAT_MS - MARGEN_MS,
});

const datoInvalido = mensaje => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje });

/* El turno de las llaves, de la base. Sin turno (la RPC falla o contesta raro) se empieza por la
   primera llave: el turno solo reparte la cuota, no decide nada de seguridad. */
async function turnoDeLlaves(deps, prov, cuantas) {
  try {
    const r = await deps.clienteBase.rpcServicio('ia_turno', { p_prov: prov, p_n: cuantas });
    if (!r.error && Number.isInteger(r.data) && r.data >= 0 && r.data < cuantas) return { [prov]: r.data };
  } catch (_) { /* sin turno */ }
  return {};
}

/* Cuenta ESTA consulta con ia_cuota. Devuelve { ok: true } o { ok: false, cuerpo, alerta?, detalle? }
   con lo que hay que contestar. La decisión es de la base; decidirCuota (la misma de ia.js) solo
   pone el sobre de «no se pudo contar» y es la segunda opinión si la base devolviera una cuenta
   pasada del tope. */
async function contarConsulta(deps, usuarioId, prov) {
  const noSePudo = detalle => ({ ok: false, cuerpo: decidirCuota(undefined, IA_LIMITE_DIARIO, prov), alerta: true, detalle });
  let r;
  try { r = await deps.clienteBase.rpcServicio('ia_cuota', { p_usuario: usuarioId, p_limite: IA_LIMITE_DIARIO }); }
  catch (e) { return noSePudo(textoDeError(e)); }
  if (r.error) return noSePudo('ia_cuota: ' + r.error.code + ' ' + r.error.message);
  const d = r.data;
  if (d && d.ok === true && Number.isInteger(d.usadas)) {
    const c = decidirCuota(d.usadas, IA_LIMITE_DIARIO, prov);
    return c.ok ? { ok: true } : { ok: false, cuerpo: c };
  }
  /* El tope: la base contesta su sobre (CUPO_AGOTADO, transitorio:false, con el texto de hoy) y se
     devuelve tal cual (A.md §11.5 C-14). */
  if (d && d.ok === false && d.codigo === 'CUPO_AGOTADO') return { ok: false, cuerpo: d };
  return noSePudo('ia_cuota contestó algo que no se entiende.');
}

export async function manejar(peticion, deps) {
  const secretos = secretosDelEntorno(deps && deps.entorno);
  try {
    const previo = previa(peticion, { metodos: ['GET', 'POST'] });
    if (previo) return previo;

    /* 1. La sesión, antes de leer nada. */
    const acceso = await exigirAcceso(peticion, deps);
    if (!acceso.ok) {
      if (acceso.alerta) registrar(deps, 'ia', 'error', acceso.motivo, { detalle: acceso.detalle }, secretos);
      return json(peticion, acceso.status, acceso.cuerpo, { secretos });
    }

    /* 2. Las llaves. Que falte IA_KEYS es de configuración, y a quien ya entró se le dice cuál. */
    let llaves;
    try { llaves = leerLlavesIA(deps.entorno); }
    catch (e) {
      if (!esErrorDeEntorno(e)) throw e;
      registrar(deps, 'ia', 'error', 'entorno', { detalle: e.message }, secretos);
      return json(peticion, 503, sobreDeError('CONFIGURACION', e.message), { secretos });
    }
    if (String(peticion.method).toUpperCase() === 'GET') {
      return json(peticion, 200, { ok: true, ia: proveedoresConLlave(llaves) }, { secretos });
    }

    /* 3. El cuerpo y la petición. Lo de siempre del .gs: 200 con su `DATO_INVALIDO`. */
    const L = { ...LIMITES, ...(deps.limites || {}) };
    let t = await leerTexto(peticion, L.maxCuerpo);
    if (!t.ok) return json(peticion, 200, datoInvalido(t.motivo === 'demasiado_grande' ? 'El cuerpo es demasiado grande.' : 'El cuerpo no es JSON.'), { secretos });
    const crudo = validarCuerpoCrudo(t.texto, L.maxCuerpo);
    t = null;      // el texto (hasta 15 MB) ya está parseado: que se pueda soltar mientras se espera al proveedor, que puede tardar un minuto
    if (!crudo.ok) return json(peticion, 200, crudo, { secretos });
    const valida = validarPeticion(crudo.cuerpo);
    if (!valida.ok) return json(peticion, 200, valida, { secretos });
    const pedido = valida.peticion;

    /* 4. Las llaves de ese proveedor y su turno. Sin ninguna: SIN_LLAVE, y no gasta cupo. */
    let elegidas = elegirProveedor({ prov: pedido.prov, llaves, rotacion: {} });
    if (!elegidas.ok) return json(peticion, 200, elegidas, { secretos });
    if (elegidas.llaves.length >= 2) {
      elegidas = elegirProveedor({ prov: pedido.prov, llaves, rotacion: await turnoDeLlaves(deps, pedido.prov, elegidas.llaves.length) });
    }

    /* 5. El cupo, ANTES de llamar al proveedor. */
    const cupo = await contarConsulta(deps, acceso.usuario.id, pedido.prov);
    if (!cupo.ok) {
      if (cupo.alerta) registrar(deps, 'ia', 'error', 'cupo_no_disponible', { detalle: cupo.detalle }, secretos);
      return json(peticion, 200, cupo.cuerpo, { secretos });
    }

    /* 6. El proveedor, con un plazo. */
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), pedido.modo === 'chat' ? L.esperaChatMs : L.esperaCotizarMs);
    let respuesta;
    try { respuesta = await consultarIA({ peticion: pedido, llaves: elegidas.llaves, fetch: deps.fetch, signal: ctrl.signal }); }
    finally { clearTimeout(reloj); }
    return json(peticion, 200, respuesta, { secretos });
  } catch (e) {
    registrar(deps, 'ia', 'error', 'inesperado', { detalle: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}
