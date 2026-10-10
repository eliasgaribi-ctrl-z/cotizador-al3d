/* ============================================================================
   LA IA POR EL PUENTE, LA PARTE QUE DECIDE Y ARMA — SIN TOCAR NADA.

   Las llaves de Qwen, DeepSeek y Gemini no viven en los teléfonos: viven del lado del
   servidor, y el teléfono le pide al servidor que llame por él. Hasta hoy ese servidor es el
   Apps Script de la hoja (`rutaIA_`, en puente/hoja-apps-script.gs). Al pasar a Supabase lo
   hace la función Edge `ia`, y este archivo es toda la lógica de esa función que NO es red ni
   entorno: qué se acepta, qué se le manda a cada proveedor, qué se contesta con lo que ellos
   devolvieron, a quién le toca qué llave y cuándo se acaba el cupo del día.

   Es PURO a propósito, y por dos razones que no son de estilo:
     · Corre igual en Deno, donde se despliega, y en node, donde se prueba. Nada de `process`,
       `Buffer` ni `require`: solo lo que traen los dos (JSON, Intl, encodeURIComponent).
     · Las llaves, el `fetch` y la hora entran como PARÁMETROS. Si el módulo leyera las llaves
       del entorno o el reloj del sistema, probarlo exigiría armar un entorno de mentiras, y lo
       que se probaría sería el entorno. Aquí quien llama lee el secreto, abre la conexión y
       mira el reloj; este archivo decide con lo que le pasan.

   EL CONTRATO CON EL TELÉFONO NO SE TOCA. js/cotizador/ia.js y js/nucleo/asistente.js ya leen
   `{ok, texto, prov, model}` y, si falla, `{codigo, status, transitorio, razon, crudo, mensaje}`;
   de eso cuelgan el reintento, el salto al siguiente proveedor y el «bloqueó la imagen con sus
   filtros». Cambiar una palabra de eso obligaría a cambiar los teléfonos, que se actualizan
   cuando se abre la app. Por eso las peticiones a los proveedores, los códigos, los textos y
   hasta el ORDEN de las llaves del JSON son los del .gs, y pruebas/supabase-ia.mjs lo
   comprueba corriendo el .gs de verdad al lado de este módulo, entrada por entrada.

   EL ORDEN DE LOS PASOS ES EL DE `rutaIA_` Y NO ES UN DETALLE
     1. validarCuerpoCrudo(texto)  — hasta 15 MB y que sea JSON.
        (Quién eres y las peticiones por minuto son de la función, no de este archivo.)
     2. validarPeticion(cuerpo)    — proveedor, modelo, formato; un PDF solo lo lee Gemini.
     3. elegirProveedor(...)       — las llaves de ese proveedor, en su turno. Sin ninguna:
                                     SIN_LLAVE, y eso NO gasta cupo.
     4. contar en la base y decidirCuota(n) — ANTES de llamar al proveedor. Una consulta que
                                     el proveedor rechaza también costó la llamada, y contar
                                     después dejaría pasar de a muchas en paralelo.
     5. consultarIA(...)           — una llamada por llave, hasta que una contesta.
   El resultado de cualquiera de estos pasos que trae `ok:false` es, tal cual, lo que se le
   contesta al teléfono. El cliente lee `codigo` del cuerpo y conviene que vaya con HTTP 200:
   con un 401 o un 403 (js/datos/puente.js) lo toma por «este teléfono no tiene permiso».

   Así se arma la función Edge con estas piezas (ejemplo, no código que corra aquí):
     const t = validarCuerpoCrudo(await req.text());   if (!t.ok) return responder(t);
     const v = validarPeticion(t.cuerpo);              if (!v.ok) return responder(v);
     const e = elegirProveedor({ prov: v.peticion.prov, llaves: <las del secreto>, rotacion: <la guardada> });
     if (!e.ok) return responder(e);                   // SIN_LLAVE: no gasta cupo
     <guardar e.rotacion>
     const c = decidirCuota(<contar en la base: cuotaDelDia(ahora) + la persona>, IA_LIMITE_DIARIO, v.peticion.prov);
     if (!c.ok) return responder(c);
     return responder(await consultarIA({ peticion: v.peticion, llaves: e.llaves, fetch, signal: <el plazo> }));
   Lo único de todo esto que lleva llaves de verdad es `e.llaves`: no se devuelve, no se registra.

   LO QUE CAMBIA RESPECTO AL .gs, TODO A PROPÓSITO Y TODO PROBADO
     1. El día del cupo es el de Ciudad de México y no el GMT (decisión Q-19). El .gs contaba
        el día en GMT, que cambia a las 18:00 de México: quien llegaba a su tope a las 17:50
        volvía a tener doscientas a las 18:00, y el aviso decía «mañana se reinicia». Aquí
        el día lo da `cuotaDelDia(ahora, zona)` con Intl y el nombre de la zona, no con un
        desfase fijo: México quitó el horario de verano en 2022 y antes lo tenía, y un `-6`
        escrito a mano contaría mal todo lo que se mire de antes.
     2. Una respuesta rara del proveedor ya no tumba la ruta. El .gs hace `.trim()` y `.slice()`
        sobre lo que venga; si `error.message` es un número o `content` un arreglo, truena y el
        teléfono lee «El puente falló procesando eso» en vez de lo que el proveedor dijo.
     3. NINGUNA llave sale en lo que se devuelve. El .gs copia al teléfono el texto de error del
        proveedor (`crudo`), y un proveedor que repita la llave que recibió se la regresaba al
        teléfono. Y como el mensaje de un `fetch` que falla puede traer la dirección —en Deno
        suele traerla— y la de Gemini lleva la llave, aquí una excepción de red nunca pasa su
        mensaje: siempre el fijo del .gs.
     4. Si no se pudo contar la consulta, se niega con SIN_RED (transitorio): el .gs tenía un
        `catch → true` que dejaba pasar sin contar. Contar a ciegas es lo que el cupo cierra.
     5. Se deja de probar llaves cuando la señal de aborto ya saltó: no hay llave que arregle
        un plazo vencido.
   Lo demás es igual, incluidos los cuatro textos que dicen «la hoja» (el del modelo que no está
   en la lista, el de SIN_LLAVE —que además manda a «⚡ AL3D → Llaves de IA»—, el de la llave
   sin permiso y el de «no pudo contar»): mientras la hoja siga en el flujo (fases 1 a 4) son
   verdad; al retirar el .gs en la fase 5 se reescriben aquí y en la prueba, y no antes.
   ============================================================================ */

/**
 * @typedef {{prov:string, model:string, modo:'cotizar'|'chat', sinJson:boolean,
 *            prompt?:string, b64?:string, mime?:string,
 *            sistema?:string, pregunta?:string, mensajes?:{role:string, content:string}[]}} Peticion
 *   Lo que `validarPeticion` deja limpio. De aquí en adelante nadie vuelve a mirar el cuerpo
 *   que mandó el teléfono.
 * @typedef {{ok:false, codigo:string, mensaje:string, transitorio?:boolean, prov?:string,
 *            status?:number, crudo?:string, razon?:string}} Fallo
 *   Un fallo ya con la forma que el teléfono sabe leer: se devuelve tal cual.
 * @typedef {{ok:true, texto:string, prov:string, model:string}} Contestado
 */

/* ============================================================================
   LO QUE SE ACEPTA Y A DÓNDE SE MANDA — copia de las constantes del .gs
   Con esta hay tres copias de la lista de modelos (el .gs, este archivo y AI_DEFAULTS /
   AI_RESPALDO de js/cotizador/ia.js). pruebas/supabase-ia.mjs compara las tres.
   ============================================================================ */
export const IA_PROVS = Object.freeze(['qwen', 'deepseek', 'gemini']);
export const IA_NOMBRE = Object.freeze({ qwen: 'Qwen', deepseek: 'DeepSeek', gemini: 'Gemini' });
/* Gemini no tiene dirección fija: lleva el modelo y la llave en la propia dirección. */
export const IA_URLS = Object.freeze({
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
});
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
/* Con la llave aquí, dejar que el teléfono escoja cualquier modelo sería dejar que escoja
   cuánto cuesta cada llamada. */
export const IA_MODELOS = Object.freeze({
  qwen: Object.freeze(['qwen3.7-flash', 'qwen3.6-flash']),
  deepseek: Object.freeze(['deepseek-flash']),
  gemini: Object.freeze(['gemini-3.1-flash-lite', 'gemini-3.6-flash']),
});
export const IA_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
/* Por persona y por día. Una cotización con IA son de una a cuatro llamadas; doscientas es un
   día de trabajo muy largo y es muy poco para quien quiera vaciar la cuenta. */
export const IA_LIMITE_DIARIO = 200;
/* 15 MB de texto: una imagen o un PDF en base64 viaja dentro del cuerpo. Se mide en caracteres,
   como el .gs; con base64 (ASCII) caracteres y bytes son lo mismo. */
export const IA_MAX_CUERPO = 15 * 1024 * 1024;
/* Lo que espera el teléfono: 100 s en una cotización (AI_TIMEOUT en js/cotizador/ia.js) y 60 s
   en el asistente (TIMEOUT en js/nucleo/asistente.js). Quien llama debe rendirse un poco antes de
   la que toque según el `modo` de la petición, para que al teléfono le llegue un fallo nuestro
   (y el siguiente proveedor de su cadena) y no su propio corte. */
export const IA_ESPERA_MS = 100000;
export const IA_ESPERA_CHAT_MS = 60000;
/* El día del cupo se cuenta aquí. Es el parámetro por omisión de `cuotaDelDia`. */
export const IA_ZONA = 'America/Mexico_City';

/* Los topes de texto del .gs (limpiarPeticionIA). Solo el del prompt RECHAZA; los otros cuatro
   recortan en silencio, y el recorte es parte del comportamiento que se conserva. */
const MAX_PROMPT = 30000, MAX_SISTEMA = 40000, MAX_PREGUNTA = 4000, MAX_MENSAJES = 20, MAX_CONTENIDO = 8000;
/* Cuántos caracteres del base64 se miran. El resto no se valida: es el .gs, y un base64 roto
   más allá de ahí lo rechaza el proveedor. */
const MIRA_B64 = 200;

const malo = mensaje => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje });
const errorSinLlave = prov => ({ ok: false, codigo: 'SIN_LLAVE', prov, transitorio: false,
  mensaje: IA_NOMBRE[prov] + ' no tiene llave en la hoja — Dirección la pega en ⚡ AL3D → Llaves de IA' });
const proveedorConocido = (donde, prov) => {
  if (!IA_PROVS.includes(prov)) throw new RangeError(donde + ': no existe el proveedor «' + prov + '»');
};

/* ============================================================================
   1 y 2 · EL CUERPO Y LA PETICIÓN
   ============================================================================ */

/**
 * El texto crudo que llegó: que quepa y que sea JSON, con las frases de `doPost`. Mide
 * caracteres (`.length`), como el .gs.
 * @param {string} texto
 * @param {number} [tope]
 * @returns {{ok:true, cuerpo:*}|Fallo}
 */
export function validarCuerpoCrudo(texto, tope = IA_MAX_CUERPO) {
  const crudo = typeof texto === 'string' ? texto : '';
  if (crudo.length > tope) return malo('El cuerpo es demasiado grande.');
  let cuerpo;
  try { cuerpo = JSON.parse(crudo); } catch (_) { return malo('El cuerpo no es JSON.'); }
  return { ok: true, cuerpo };
}

/* Deja la petición limpia o dice por qué no. Es limpiarPeticionIA del .gs, con las MISMAS
   coerciones de JavaScript (`String(x || '')`): un `prompt` numérico es el texto del número y
   uno que sea un objeto es «[object Object]». Son rarezas, pero son las del .gs: mientras
   convivan los dos servidores, que contesten distinto al mismo teléfono es un fallo muy
   difícil de ver. Lo que de verdad se cierra aquí es la lista blanca y los topes. */
function limpiarPeticion(c) {
  const d = { modo: c.modo === 'chat' ? 'chat' : 'cotizar', sinJson: !!c.sinJson };
  if (d.modo === 'cotizar') {
    d.prompt = String(c.prompt || '');
    const img = c.imagen || {};
    d.b64 = String(img.b64 || ''); d.mime = String(img.mime || '');
    if (!d.prompt || d.prompt.length > MAX_PROMPT) return { error: 'Falta la instrucción para la IA.' };
    if (!d.b64 || !/^[A-Za-z0-9+\/=]+$/.test(d.b64.slice(0, MIRA_B64))) return { error: 'Falta el archivo que se va a analizar.' };
    if (!IA_MIMES.includes(d.mime)) return { error: 'Solo se analizan JPG, PNG, WEBP o PDF.' };
  } else {
    d.sistema = String(c.sistema || '').slice(0, MAX_SISTEMA);
    d.pregunta = String(c.pregunta || '').slice(0, MAX_PREGUNTA);
    /* Los ÚLTIMOS veinte: el hilo viejo es lo que sobra. Y todo papel que no sea `assistant`
       es del usuario: «system» desde un teléfono no puede darle órdenes al modelo. */
    const ms = Array.isArray(c.mensajes) ? c.mensajes.slice(-MAX_MENSAJES) : [];
    d.mensajes = ms.map(m => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) || '').slice(0, MAX_CONTENIDO),
    }));
    if (!d.pregunta) return { error: 'Falta la pregunta.' };
  }
  return d;
}

/**
 * El cuerpo ya parseado, contra la lista blanca y el formato. Los rechazos y su orden son los
 * de `rutaIA_`: proveedor, modelo, formato, y que un PDF no vaya a quien no lo lee.
 * @param {*} cuerpo
 * @returns {{ok:true, peticion:Peticion}|Fallo}
 */
export function validarPeticion(cuerpo) {
  const prov = String((cuerpo && cuerpo.prov) || '');
  const model = String((cuerpo && cuerpo.model) || '');
  /* La lista se mira ANTES de usar `prov` como llave de nada: «constructor» o «__proto__»
     no son proveedores y no deben llegar a IA_MODELOS[...]. */
  if (!IA_PROVS.includes(prov)) return malo('Ese proveedor de IA no existe.');
  if (!IA_MODELOS[prov].includes(model)) return malo(IA_NOMBRE[prov] + ': el modelo «' + model + '» no está en la lista de la hoja.');
  const d = limpiarPeticion(cuerpo);
  if (d.error) return malo(d.error);
  if (d.modo === 'cotizar' && d.mime === 'application/pdf' && prov !== 'gemini') return malo('Solo Gemini lee PDF.');
  return { ok: true, peticion: { prov, model, ...d } };
}

/* ============================================================================
   3 · LAS LLAVES Y SU TURNO
   ============================================================================ */

/* iaLlaves_ del .gs: las llaves de un proveedor, solo las que parecen llaves (cadenas de diez
   caracteres o más). Lo que no sea una lista de esas se queda en «sin llave». */
function llavesDe(llaves, prov) {
  const ks = llaves && Array.isArray(llaves[prov]) ? llaves[prov] : [];
  return ks.filter(k => typeof k === 'string' && k.length >= 10);
}

/**
 * Qué proveedores tienen llave: solo sí o no, la llave no sale (es `iaEstado` del .gs, lo que
 * `/salud` contesta en `ia` y lo que js/cotizador/ia.js y js/nucleo/asistente.js leen para
 * saltarse a los que no tienen).
 * @param {{qwen?:string[], deepseek?:string[], gemini?:string[]}} llaves
 * @returns {{qwen:boolean, deepseek:boolean, gemini:boolean}}
 */
export function proveedoresConLlave(llaves) {
  const o = {};
  IA_PROVS.forEach(p => { o[p] = llavesDe(llaves, p).length > 0; });
  return o;
}

/**
 * A quién le toca qué llave. Cada llamada empieza por la siguiente, para repartir la cuota
 * entre las llaves de un mismo proveedor; y las demás van detrás, por si la primera está
 * agotada. Es `iaOrdenDeLlaves_`, más el «sin llave» que `rutaIA_` decide justo después.
 *
 * El PROVEEDOR no se elige aquí: lo escoge el teléfono (la cadena Qwen → DeepSeek → Gemini es
 * suya, para poder decir «probando con Qwen…» con el cliente enfrente), y cada llamada es UN
 * intento contra UN proveedor. Lo que se elige es con qué llaves se atiende ese intento.
 *
 * Es una función pura: no toca `rotacion` y devuelve la nueva, para que quien llama la guarde
 * donde sea (una tabla, la memoria). Con menos de dos llaves no hay nada que turnar y devuelve
 * la misma. El índice sale de `(Number(x) || 0) % n`, como en el .gs, así que CUALQUIER estado,
 * hasta uno roto, da un orden válido de las llaves.
 *
 * ¡Ojo! `llaves` en el resultado son las llaves de verdad: es para `consultarIA`, no para el
 * teléfono. Lo que va al teléfono es el otro resultado, `{ok:false, codigo:'SIN_LLAVE', …}`.
 * @param {{prov:string, llaves:object, rotacion?:object}} args
 * @returns {{ok:true, llaves:string[], rotacion:object}|Fallo}
 */
export function elegirProveedor({ prov, llaves, rotacion } = {}) {
  proveedorConocido('elegirProveedor', prov);
  const ks = llavesDe(llaves, prov);
  if (!ks.length) return errorSinLlave(prov);
  const rot = rotacion && typeof rotacion === 'object' ? { ...rotacion } : {};
  if (ks.length < 2) return { ok: true, llaves: ks, rotacion: rot };
  const i = (Number(rot[prov]) || 0) % ks.length;
  rot[prov] = (i + 1) % ks.length;
  return { ok: true, llaves: ks.slice(i).concat(ks.slice(0, i)), rotacion: rot };
}

/* ============================================================================
   4 · LA LLAMADA AL PROVEEDOR
   ============================================================================ */

/**
 * La llamada, armada EXACTAMENTE como la armaban aiLlamar() del cotizador y llamar() del
 * asistente cuando salían del teléfono, y como la arma `iaPeticion` en el .gs: misma dirección,
 * mismas cabeceras y el mismo cuerpo, hasta en el orden de las llaves del JSON. `opciones` es lo
 * que recibe `fetch`.
 *
 * UNA llave por llamada, no la lista: Gemini la lleva en la dirección y los otros dos en
 * `Authorization`, así que cada llave es una llamada distinta (`consultarIA` las recorre).
 * El modelo se vuelve a mirar contra la lista blanca: es lo último antes de la red, y lo que se
 * valida lejos de donde se usa es lo que un día alguien salta.
 * @param {string} proveedor
 * @param {Peticion} peticion
 * @param {string} llave
 * @returns {{url:string, opciones:{method:'POST', headers:object, body:string}}}
 */
export function construirLlamada(proveedor, peticion, llave) {
  proveedorConocido('construirLlamada', proveedor);
  if (typeof llave !== 'string' || !llave) {
    throw new TypeError('construirLlamada: la llave tiene que ser una cadena, una por llamada (con varias, una llamada por cada una)');
  }
  const d = peticion || {};
  const model = d.model;
  if (!IA_MODELOS[proveedor].includes(model)) {
    throw new RangeError('construirLlamada: el modelo «' + model + '» no está en la lista de ' + IA_NOMBRE[proveedor]);
  }
  if (proveedor === 'gemini') {
    let body;
    if (d.modo === 'cotizar') {
      /* Gemini siempre pide JSON aquí e ignora `sinJson`: lo que se quita es `response_format`
         de los otros dos, que es lo que algunos modelos de visión no aceptan junto a una imagen. */
      body = { contents: [{ parts: [{ text: d.prompt }, { inline_data: { mime_type: d.mime, data: d.b64 } }] }],
               generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
    } else {
      const contents = d.mensajes.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        .concat([{ role: 'user', parts: [{ text: d.pregunta }] }]);
      body = { systemInstruction: { parts: [{ text: d.sistema }] }, contents,
               generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } };
    }
    return { url: GEMINI_BASE + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(llave),
             opciones: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } };
  }
  let b;
  if (d.modo === 'cotizar') {
    b = { model, temperature: 0.2, max_tokens: 4096,
          messages: [{ role: 'user', content: [{ type: 'text', text: d.prompt },
                     { type: 'image_url', image_url: { url: 'data:' + d.mime + ';base64,' + d.b64 } }] }] };
    if (!d.sinJson) b.response_format = { type: 'json_object' };
  } else {
    b = { model, temperature: 0.2, max_tokens: 1200,
          messages: [{ role: 'system', content: d.sistema }].concat(d.mensajes, [{ role: 'user', content: d.pregunta }]) };
  }
  if (proveedor === 'deepseek') b.thinking = { type: 'disabled' };
  return { url: IA_URLS[proveedor],
           opciones: { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llave },
                       body: JSON.stringify(b) } };
}

/* Lo que se lee de un cuerpo de respuesta que no se sabe cómo viene: texto si es texto, nada
   si es cualquier otra cosa. El .gs llama `.trim()` a lo que venga y truena con un arreglo. */
const comoTexto = x => (typeof x === 'string' ? x : '');

/**
 * Qué contestó el proveedor, en el idioma que el teléfono ya lee (iaRespuesta del .gs, que a su
 * vez copiaba aiError() del cotizador): el estado, si vale la pena reintentar y una frase que se
 * pueda leer. `respuesta` es `{status, texto}`: el estado HTTP y el cuerpo ya leído como texto.
 * Lleva `modelo` aparte porque la frase del 404 y el `{ok:true}` lo nombran; si no se pasa, se
 * toma de `respuesta.model`.
 *
 * Los textos tienen un solo dueño: el .gs. Los dos casos con peso:
 *   · «respondió vacío» (VACIO) lleva la `razon` del proveedor tal cual (finishReason,
 *     blockReason o finish_reason). El teléfono la lee con una expresión regular para decir
 *     «bloqueó la imagen con sus filtros» o «cortó la respuesta»: no se traduce ni se normaliza.
 *   · `transitorio` es lo que decide si el teléfono reintenta. Verdadero para 429, 408 y los 5xx,
 *     y para un vacío SIN razón (un hipo); falso para todo lo demás.
 * @param {string} proveedor
 * @param {{status:number, texto:string}} respuesta
 * @param {string} modelo
 * @returns {Contestado|Fallo}
 */
export function interpretarRespuesta(proveedor, respuesta, modelo) {
  proveedorConocido('interpretarRespuesta', proveedor);
  const codigo = respuesta && respuesta.status;
  const txt = comoTexto(respuesta && respuesta.texto);
  if (modelo === undefined) modelo = respuesta && respuesta.model;
  let data = null;
  try { data = JSON.parse(txt); } catch (_) { data = null; }
  const n = IA_NOMBRE[proveedor];
  const e = data && data.error;
  if (codigo >= 200 && codigo < 300 && data && !e) {
    let texto = '', razon = '';
    if (proveedor === 'gemini') {
      const cand = (data.candidates || [])[0];
      const partes = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
      texto = partes.map(p => (p && p.text) || '').join('').trim();
      razon = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '';
    } else {
      const ch = (data.choices || [])[0];
      texto = comoTexto(ch && ch.message && ch.message.content).trim();
      razon = (ch && ch.finish_reason) || '';
    }
    if (texto) return { ok: true, texto, prov: proveedor, model: modelo };
    return { ok: false, codigo: 'VACIO', razon: String(razon || ''), transitorio: !razon, prov: proveedor,
             mensaje: n + ' respondió vacío' };
  }
  /* Lo que el proveedor dijo, en orden de preferencia: su error, su mensaje suelto y, si no
     habló en JSON, el texto con las etiquetas HTML quitadas (una página de error de un
     intermediario). Se toma el primero que sea TEXTO y no esté vacío. */
  const dicho = [typeof e === 'string' ? e : (e && (e.message || e.msg)), data && data.message]
    .find(x => typeof x === 'string' && x !== '');
  const crudo = (dicho !== undefined ? dicho : txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 140);
  const s = (e && typeof e.code === 'number' && e.code >= 100) ? e.code : codigo;
  let msg, trans = false;
  if (s === 429) { msg = n + ' alcanzó su límite de peticiones'; trans = true; }
  else if (s === 408 || s >= 500) { msg = n + ' está saturado'; trans = true; }
  else if (s === 401 || s === 403) msg = 'la llave de ' + n + ' que está en la hoja no es válida o no tiene saldo';
  else if (s === 404) msg = n + ' no reconoce el modelo «' + modelo + '»';
  else if (s === 413) msg = 'el archivo pesa demasiado para ' + n;
  else msg = n + ' rechazó la petición (HTTP ' + s + ')';
  return { ok: false, codigo: 'PROVEEDOR', status: s, transitorio: trans, crudo, prov: proveedor,
           mensaje: crudo ? msg + ' — ' + crudo : msg };
}

/* ============================================================================
   NINGUNA LLAVE SALE
   ============================================================================ */
const MARCA_DE_LLAVE = '[llave oculta]';

/* Lo que hay que esconder: cada llave tal cual y también como viaja en una dirección (Gemini
   la lleva ahí, y un proveedor que repite la dirección la repite codificada). Las más largas
   primero, para que una llave que contiene a otra no quede a medias. Lo de menos de ocho
   caracteres no es una llave y esconderlo borraría palabras de verdad. */
function secretosDe(llaves) {
  const todos = new Set();
  for (const k of [].concat(llaves || [])) {
    if (typeof k !== 'string' || k.length < 8) continue;
    todos.add(k);
    try { todos.add(encodeURIComponent(k)); } catch (_) { /* una llave con medio par sustituto no se codifica */ }
  }
  return [...todos].sort((a, b) => b.length - a.length);
}

/**
 * Lo mismo que `valor`, con cada llave cambiada por «[llave oculta]» en todos los textos que
 * tenga por dentro. No toca el original. Se aplica a lo que `consultarIA` devuelve: el texto
 * de error de un proveedor (`crudo` y el `mensaje` que lo lleva) es lo único que viaja del
 * proveedor al teléfono sin que nadie lo haya escrito aquí, y un proveedor puede repetir la
 * llave que recibió.
 * @param {*} valor
 * @param {string|string[]} llaves
 */
export function ocultarLlaves(valor, llaves) {
  const secretos = secretosDe(llaves);
  if (!secretos.length) return valor;
  const quitar = t => secretos.reduce((s, k) => (s.includes(k) ? s.split(k).join(MARCA_DE_LLAVE) : s), t);
  const recorre = v => {
    if (typeof v === 'string') return quitar(v);
    if (Array.isArray(v)) return v.map(recorre);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = recorre(v[k]);
      return o;
    }
    return v;
  };
  return recorre(valor);
}

/**
 * Una llamada por llave hasta que una contesta: el bucle de `rutaIA_`. Recibe las llaves YA en
 * su turno (lo que devuelve `elegirProveedor`) y el `fetch` que se le inyecta, y devuelve lo que
 * hay que contestarle al teléfono: `{ok:true, texto, prov, model}` o el fallo con su forma.
 *
 * Se pasa a la siguiente llave SOLO si el problema era de ESA llave: una cuota agotada (429) o
 * una llave sin permiso (401, 403). Un modelo que no existe, un archivo demasiado grande o un
 * vacío no los arregla otra llave. Una excepción de red también sigue con la siguiente.
 * (Con eso hay dos casos que el .gs trata así y que podrían discutirse: DeepSeek contesta 402
 * a una llave sin saldo y Gemini contesta 400 a una llave inválida; ninguno de los dos pasa a
 * la siguiente. Se conserva porque es lo que hace hoy.)
 *
 * `signal` es opcional y se le pasa a `fetch` tal cual: es como la función pone su plazo (lo que
 * espera el teléfono es `IA_ESPERA_MS`, o `IA_ESPERA_CHAT_MS` en el asistente). No se mide
 * tiempo aquí. Una vez que la señal saltó no se prueban más llaves: otra no arregla un plazo.
 * @param {{peticion:Peticion, llaves:string[], fetch:function, signal?:*}} args
 * @returns {Promise<Contestado|Fallo>}
 */
export async function consultarIA({ peticion, llaves, fetch: llamar, signal } = {}) {
  if (typeof llamar !== 'function') {
    throw new TypeError('consultarIA: falta `fetch`; se inyecta, este módulo no abre conexiones');
  }
  if (!Array.isArray(llaves)) {
    throw new TypeError('consultarIA: `llaves` es la lista ya en su turno que devuelve elegirProveedor');
  }
  const prov = peticion && peticion.prov;
  proveedorConocido('consultarIA', prov);
  const orden = llaves.filter(k => typeof k === 'string' && k);
  if (!orden.length) return errorSinLlave(prov);
  let ultima = null;
  for (const llave of orden) {
    const { url, opciones } = construirLlamada(prov, peticion, llave);
    let resp, texto;
    try {
      resp = await llamar(url, signal ? { ...opciones, signal } : opciones);
      texto = await resp.text();
    } catch (_) {
      /* El mensaje de la excepción NO pasa: puede traer la dirección del `fetch` (en Deno suele),
         y la de Gemini lleva la llave. El texto es el del .gs. */
      ultima = { ok: false, codigo: 'PROVEEDOR', status: 0, transitorio: true, prov, mensaje: 'no se pudo conectar con ' + IA_NOMBRE[prov] };
      if (signal && signal.aborted) break;
      continue;
    }
    const res = interpretarRespuesta(prov, { status: resp.status, texto }, peticion.model);
    if (res.ok) return ocultarLlaves(res, orden);
    ultima = res;
    if (!(res.status === 429 || res.status === 401 || res.status === 403)) break;
  }
  return ocultarLlaves(ultima, orden);
}

/* ============================================================================
   5 · EL CUPO DEL DÍA
   ============================================================================ */

/* Un formateador por zona: construirlo es lo caro, y solo hay una zona en uso. El idioma, el
   calendario y la numeración van fijos (en-US, gregoriano, latn): la fecha que sale no puede
   depender de cómo esté configurada la máquina donde corre. */
const formatos = new Map();
function formatoDeDia(zona) {
  let f = formatos.get(zona);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (_) {
      throw new RangeError('cuotaDelDia: no conozco la zona horaria «' + zona + '»');
    }
    formatos.set(zona, f);
  }
  return f;
}

/**
 * El día del cupo, como `aaaa-mm-dd`, de la hora que se le pase y en la zona que se diga. El
 * cupo de cada persona es de ese día: cambia la clave, y con ella la cuenta empieza de cero.
 *
 * Aquí está la decisión Q-19. El .gs contaba el día con `Utilities.formatDate(new Date(),
 * 'GMT', 'yyyyMMdd')`, y el día GMT cambia a las 18:00 de Ciudad de México (a las 17:59 del
 * 10 de octubre en México ya son las 23:59 GMT del 10; un minuto después son las 00:00 del 11).
 * Con la zona de México el cupo se reinicia a la medianoche de México, que es lo que decía el
 * aviso («mañana se reinicia»). La zona es un parámetro y se resuelve con la base de zonas del
 * motor, NO con un desfase: así «hoy» y «un día de 2021» (con horario de verano) dan lo correcto.
 *
 * La clave se puede guardar tal cual en una columna `date`. No se lee el reloj aquí: `ahora` es
 * obligatorio, una Date o milisegundos desde 1970.
 * @param {Date|number} ahora
 * @param {string} [zona]
 * @returns {string}
 */
export function cuotaDelDia(ahora, zona = IA_ZONA) {
  const ms = Object.prototype.toString.call(ahora) === '[object Date]' ? ahora.getTime() : ahora;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError('cuotaDelDia: `ahora` tiene que ser una Date o milisegundos, y la hora la pone quien llama');
  }
  const p = {};
  for (const x of formatoDeDia(zona).formatToParts(ms)) p[x.type] = x.value;
  return String(p.year).padStart(4, '0') + '-' + p.month + '-' + p.day;
}

/**
 * ¿Pasa esta consulta? `usadoHoy` es la cuenta de la persona HOY, CONTANDO la consulta que se
 * está decidiendo: la base la sube y la devuelve en un solo paso (un `insert … on conflict do
 * update … returning` atómico; leer, sumar y escribir por separado deja pasar a veinte que
 * llegan juntas). Con un tope de 200, la consulta 200 pasa y la 201 es la primera que se niega,
 * como en el .gs; las negadas también suman, y da igual.
 *
 * Si `usadoHoy` no es una cuenta (la base no contestó), se niega con SIN_RED, transitorio: el
 * teléfono reintenta. Pasar sin contar es justo lo que el cupo cierra.
 * @param {number} usadoHoy
 * @param {number} [tope]
 * @param {string} [prov] — solo para que el SIN_RED lleve el mismo `prov` que el del .gs
 * @returns {{ok:true, usado:number, restantes:number}|Fallo}
 */
export function decidirCuota(usadoHoy, tope = IA_LIMITE_DIARIO, prov) {
  if (!Number.isInteger(tope) || tope < 0) throw new RangeError('decidirCuota: el tope es un entero de cero en adelante');
  if (!Number.isInteger(usadoHoy) || usadoHoy < 1) {
    const r = { ok: false, codigo: 'SIN_RED', transitorio: true };
    if (prov !== undefined) r.prov = prov;
    r.mensaje = 'La hoja está ocupada con otra escritura y no pudo contar esta consulta de IA. Vuelve a intentarlo en un momento.';
    return r;
  }
  if (usadoHoy > tope) {
    return { ok: false, codigo: 'CUPO_AGOTADO', transitorio: false,
             mensaje: 'Llegaste al tope de ' + tope + ' consultas de IA por hoy. Mañana se reinicia.' };
  }
  return { ok: true, usado: usadoHoy, restantes: tope - usadoHoy };
}
