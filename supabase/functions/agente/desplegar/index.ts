// @ts-nocheck
// ============================================================================
// LA FUNCIÓN `agente` EN UN SOLO ARCHIVO, para pegarla entera en el editor del panel de Supabase.
// GENERADO por supabase/functions/agente/desplegar/armar.mjs con esbuild 0.24.2. NO SE EDITA A MANO:
// se cambian las fuentes y se vuelve a armar (node supabase/functions/agente/desplegar/armar.mjs).
// Cómo se despliega: docs/AGENTE-VENTAS.md, «Para publicarlo». Lee IA_KEYS y, si existen, AGENTE_CUENTA y AGENTE_EMPRESA.
// Fuentes (huella sha256 de 16 caracteres, con saltos LF); pruebas/agente-logica.mjs falla si una cambió:
//   b934ae4fa7d357f2  supabase/functions/_shared/agente.js
//   da8d7ea3e1d49150  supabase/functions/_shared/cliente.js
//   2a71c519bbc0ec5f  supabase/functions/_shared/entorno.js
//   7a2814286ef3b65e  supabase/functions/_shared/ficha.js
//   13245dbb0ee89b72  supabase/functions/_shared/http.js
//   21bde10737f49fe4  supabase/functions/_shared/ia.js
//   caedbec3fb61b918  supabase/functions/_shared/precio.js
//   02ed914bbd6ab1de  supabase/functions/_shared/sello.js
//   54a3eb4274d49483  supabase/functions/agente/handler.js
//   739ae7fbe1c67739  supabase/functions/agente/index.ts
// ============================================================================
// supabase/functions/agente/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/sello.js
var CAMPOS_PRECIO = Object.freeze([
  "tipo",
  "material",
  "comp",
  "luz",
  "altura",
  "n",
  "acab",
  "recComp",
  "bas",
  "ancho",
  "alto",
  "tarifa",
  "pz",
  "pu"
]);
var CODIFICACIONES = Object.freeze(["ascii-?", "utf-8"]);
var COLUMNAS_DE_AUTORIZACION = Object.freeze([
  "folio_global",
  "ts_iso",
  "proyecto",
  "sub_calc",
  "precio_auth",
  "total",
  "items_auth",
  "huella",
  "autorizo",
  "renglones",
  "codigo",
  "firma",
  "estado"
]);
function claveUsable(clave) {
  if (typeof clave !== "string") return false;
  const t = clave.trim();
  return t !== "" && t !== "undefined" && t !== "null";
}

// supabase/functions/_shared/ia.js
var IA_PROVS = Object.freeze(["qwen", "deepseek", "gemini"]);
var IA_NOMBRE = Object.freeze({ qwen: "Qwen", deepseek: "DeepSeek", gemini: "Gemini" });
var IA_URLS = Object.freeze({
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions"
});
var GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
var IA_MODELOS = Object.freeze({
  qwen: Object.freeze(["qwen3.7-flash", "qwen3.6-flash"]),
  deepseek: Object.freeze(["deepseek-flash"]),
  gemini: Object.freeze(["gemini-3.1-flash-lite", "gemini-3.6-flash"])
});
var IA_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
var IA_MAX_CUERPO = 15 * 1024 * 1024;
var IA_ESPERA_CHAT_MS = 6e4;
var MAX_PROMPT = 3e4;
var MAX_SISTEMA = 4e4;
var MAX_PREGUNTA = 4e3;
var MAX_MENSAJES = 20;
var MAX_CONTENIDO = 8e3;
var MIRA_B64 = 200;
var malo = (mensaje2) => ({ ok: false, codigo: "DATO_INVALIDO", mensaje: mensaje2 });
var errorSinLlave = (prov) => ({
  ok: false,
  codigo: "SIN_LLAVE",
  prov,
  transitorio: false,
  mensaje: IA_NOMBRE[prov] + " no tiene llave en la hoja — Dirección la pega en ⚡ AL3D → Llaves de IA"
});
var proveedorConocido = (donde, prov) => {
  if (!IA_PROVS.includes(prov)) throw new RangeError(donde + ": no existe el proveedor «" + prov + "»");
};
function limpiarPeticion(c) {
  const d = { modo: c.modo === "chat" ? "chat" : "cotizar", sinJson: !!c.sinJson };
  if (d.modo === "cotizar") {
    d.prompt = String(c.prompt || "");
    const img = c.imagen || {};
    d.b64 = String(img.b64 || "");
    d.mime = String(img.mime || "");
    if (!d.prompt || d.prompt.length > MAX_PROMPT) return { error: "Falta la instrucción para la IA." };
    if (!d.b64 || !/^[A-Za-z0-9+\/=]+$/.test(d.b64.slice(0, MIRA_B64))) return { error: "Falta el archivo que se va a analizar." };
    if (!IA_MIMES.includes(d.mime)) return { error: "Solo se analizan JPG, PNG, WEBP o PDF." };
  } else {
    d.sistema = String(c.sistema || "").slice(0, MAX_SISTEMA);
    d.pregunta = String(c.pregunta || "").slice(0, MAX_PREGUNTA);
    const ms = Array.isArray(c.mensajes) ? c.mensajes.slice(-MAX_MENSAJES) : [];
    d.mensajes = ms.map((m) => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: String(m && m.content || "").slice(0, MAX_CONTENIDO)
    }));
    if (!d.pregunta) return { error: "Falta la pregunta." };
  }
  return d;
}
function validarPeticion(cuerpo) {
  const prov = String(cuerpo && cuerpo.prov || "");
  const model = String(cuerpo && cuerpo.model || "");
  if (!IA_PROVS.includes(prov)) return malo("Ese proveedor de IA no existe.");
  if (!IA_MODELOS[prov].includes(model)) return malo(IA_NOMBRE[prov] + ": el modelo «" + model + "» no está en la lista de la hoja.");
  const d = limpiarPeticion(cuerpo);
  if (d.error) return malo(d.error);
  if (d.modo === "cotizar" && d.mime === "application/pdf" && prov !== "gemini") return malo("Solo Gemini lee PDF.");
  return { ok: true, peticion: { prov, model, ...d } };
}
function llavesDe(llaves, prov) {
  const ks = llaves && Array.isArray(llaves[prov]) ? llaves[prov] : [];
  return ks.filter((k) => typeof k === "string" && k.length >= 10);
}
function elegirProveedor({ prov, llaves, rotacion } = {}) {
  proveedorConocido("elegirProveedor", prov);
  const ks = llavesDe(llaves, prov);
  if (!ks.length) return errorSinLlave(prov);
  const rot = rotacion && typeof rotacion === "object" ? { ...rotacion } : {};
  if (ks.length < 2) return { ok: true, llaves: ks, rotacion: rot };
  const i = (Number(rot[prov]) || 0) % ks.length;
  rot[prov] = (i + 1) % ks.length;
  return { ok: true, llaves: ks.slice(i).concat(ks.slice(0, i)), rotacion: rot };
}
function construirLlamada(proveedor, peticion, llave) {
  proveedorConocido("construirLlamada", proveedor);
  if (typeof llave !== "string" || !llave) {
    throw new TypeError("construirLlamada: la llave tiene que ser una cadena, una por llamada (con varias, una llamada por cada una)");
  }
  const d = peticion || {};
  const model = d.model;
  if (!IA_MODELOS[proveedor].includes(model)) {
    throw new RangeError("construirLlamada: el modelo «" + model + "» no está en la lista de " + IA_NOMBRE[proveedor]);
  }
  if (proveedor === "gemini") {
    let body;
    if (d.modo === "cotizar") {
      body = {
        contents: [{ parts: [{ text: d.prompt }, { inline_data: { mime_type: d.mime, data: d.b64 } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      };
    } else {
      const contents = d.mensajes.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })).concat([{ role: "user", parts: [{ text: d.pregunta }] }]);
      body = {
        systemInstruction: { parts: [{ text: d.sistema }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
      };
    }
    return {
      url: GEMINI_BASE + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(llave),
      opciones: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    };
  }
  let b;
  if (d.modo === "cotizar") {
    b = {
      model,
      temperature: 0.2,
      max_tokens: 4096,
      messages: [{ role: "user", content: [
        { type: "text", text: d.prompt },
        { type: "image_url", image_url: { url: "data:" + d.mime + ";base64," + d.b64 } }
      ] }]
    };
    if (!d.sinJson) b.response_format = { type: "json_object" };
  } else {
    b = {
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [{ role: "system", content: d.sistema }].concat(d.mensajes, [{ role: "user", content: d.pregunta }])
    };
  }
  if (proveedor === "deepseek") b.thinking = { type: "disabled" };
  return {
    url: IA_URLS[proveedor],
    opciones: {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + llave },
      body: JSON.stringify(b)
    }
  };
}
var comoTexto = (x) => typeof x === "string" ? x : "";
function interpretarRespuesta(proveedor, respuesta, modelo) {
  proveedorConocido("interpretarRespuesta", proveedor);
  const codigo = respuesta && respuesta.status;
  const txt = comoTexto(respuesta && respuesta.texto);
  if (modelo === void 0) modelo = respuesta && respuesta.model;
  let data = null;
  try {
    data = JSON.parse(txt);
  } catch (_) {
    data = null;
  }
  const n = IA_NOMBRE[proveedor];
  const e = data && data.error;
  if (codigo >= 200 && codigo < 300 && data && !e) {
    let texto2 = "", razon = "";
    if (proveedor === "gemini") {
      const cand = (data.candidates || [])[0];
      const partes = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
      texto2 = partes.map((p) => p && p.text || "").join("").trim();
      razon = cand && cand.finishReason || data.promptFeedback && data.promptFeedback.blockReason || "";
    } else {
      const ch = (data.choices || [])[0];
      texto2 = comoTexto(ch && ch.message && ch.message.content).trim();
      razon = ch && ch.finish_reason || "";
    }
    if (texto2) return { ok: true, texto: texto2, prov: proveedor, model: modelo };
    return {
      ok: false,
      codigo: "VACIO",
      razon: String(razon || ""),
      transitorio: !razon,
      prov: proveedor,
      mensaje: n + " respondió vacío"
    };
  }
  const dicho = [typeof e === "string" ? e : e && (e.message || e.msg), data && data.message].find((x) => typeof x === "string" && x !== "");
  const crudo = (dicho !== void 0 ? dicho : txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 140);
  const s = e && typeof e.code === "number" && e.code >= 100 ? e.code : codigo;
  let msg, trans = false;
  if (s === 429) {
    msg = n + " alcanzó su límite de peticiones";
    trans = true;
  } else if (s === 408 || s >= 500) {
    msg = n + " está saturado";
    trans = true;
  } else if (s === 401 || s === 403) msg = "la llave de " + n + " que está en la hoja no es válida o no tiene saldo";
  else if (s === 404) msg = n + " no reconoce el modelo «" + modelo + "»";
  else if (s === 413) msg = "el archivo pesa demasiado para " + n;
  else msg = n + " rechazó la petición (HTTP " + s + ")";
  return {
    ok: false,
    codigo: "PROVEEDOR",
    status: s,
    transitorio: trans,
    crudo,
    prov: proveedor,
    mensaje: crudo ? msg + " — " + crudo : msg
  };
}
var MARCA_DE_LLAVE = "[llave oculta]";
function secretosDe(llaves) {
  const todos = /* @__PURE__ */ new Set();
  for (const k of [].concat(llaves || [])) {
    if (typeof k !== "string" || k.length < 8) continue;
    todos.add(k);
    try {
      todos.add(encodeURIComponent(k));
    } catch (_) {
    }
  }
  return [...todos].sort((a, b) => b.length - a.length);
}
function ocultarLlaves(valor, llaves) {
  const secretos = secretosDe(llaves);
  if (!secretos.length) return valor;
  const quitar = (t) => secretos.reduce((s, k) => s.includes(k) ? s.split(k).join(MARCA_DE_LLAVE) : s, t);
  const recorre = (v) => {
    if (typeof v === "string") return quitar(v);
    if (Array.isArray(v)) return v.map(recorre);
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) o[k] = recorre(v[k]);
      return o;
    }
    return v;
  };
  return recorre(valor);
}
async function consultarIA({ peticion, llaves, fetch: llamar, signal } = {}) {
  if (typeof llamar !== "function") {
    throw new TypeError("consultarIA: falta `fetch`; se inyecta, este módulo no abre conexiones");
  }
  if (!Array.isArray(llaves)) {
    throw new TypeError("consultarIA: `llaves` es la lista ya en su turno que devuelve elegirProveedor");
  }
  const prov = peticion && peticion.prov;
  proveedorConocido("consultarIA", prov);
  const orden = llaves.filter((k) => typeof k === "string" && k);
  if (!orden.length) return errorSinLlave(prov);
  let ultima = null;
  for (const llave of orden) {
    const { url, opciones } = construirLlamada(prov, peticion, llave);
    let resp, texto2;
    try {
      resp = await llamar(url, signal ? { ...opciones, signal } : opciones);
      texto2 = await resp.text();
    } catch (_) {
      ultima = { ok: false, codigo: "PROVEEDOR", status: 0, transitorio: true, prov, mensaje: "no se pudo conectar con " + IA_NOMBRE[prov] };
      if (signal && signal.aborted) break;
      continue;
    }
    const res = interpretarRespuesta(prov, { status: resp.status, texto: texto2 }, peticion.model);
    if (res.ok) return ocultarLlaves(res, orden);
    ultima = res;
    if (!(res.status === 429 || res.status === 401 || res.status === 403)) break;
  }
  return ocultarLlaves(ultima, orden);
}

// supabase/functions/_shared/entorno.js
var VARIABLES = Object.freeze({
  url: "SUPABASE_URL",
  publicas: "SUPABASE_PUBLISHABLE_KEYS",
  secretas: "SUPABASE_SECRET_KEYS",
  anon: "SUPABASE_ANON_KEY",
  serviceRole: "SUPABASE_SERVICE_ROLE_KEY",
  sello: "SELLO_AUTORIZACION",
  ia: "IA_KEYS"
});
var ErrorDeEntorno = class extends Error {
  constructor(codigo, variables, mensaje2) {
    super(mensaje2);
    this.name = "ErrorDeEntorno";
    this.codigo = codigo;
    this.variables = Object.freeze([...variables]);
  }
};
var esErrorDeEntorno = (e) => !!e && e.name === "ErrorDeEntorno";
function exigirLector(entorno2) {
  if (typeof entorno2 !== "function") {
    throw new TypeError("El lector del entorno tiene que ser una función nombre → valor (en Deno: n => Deno.env.get(n)).");
  }
}
function leer(entorno2, nombre) {
  exigirLector(entorno2);
  const v = entorno2(nombre);
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}
var RE_LLAVE_SUELTA = /^[A-Za-z0-9._~+\/=-]+$/;
function llaveDe(entorno2, nombre) {
  const crudo = leer(entorno2, nombre);
  if (crudo === void 0) return null;
  const t = crudo.trim();
  if (!t.startsWith("{")) {
    if (RE_LLAVE_SUELTA.test(t)) return t;
    throw new ErrorDeEntorno("INVALIDA", [nombre], "La variable " + nombre + ' tiene que ser un JSON {"default":"…"} o una llave suelta.');
  }
  let m;
  try {
    m = JSON.parse(t);
  } catch (_) {
    throw new ErrorDeEntorno("INVALIDA", [nombre], "La variable " + nombre + ' no es un JSON válido (se espera {"default":"…"}).');
  }
  if (!m || typeof m !== "object" || Array.isArray(m)) {
    throw new ErrorDeEntorno("INVALIDA", [nombre], "La variable " + nombre + ' tiene que ser un objeto JSON {"default":"…"}.');
  }
  const validas = Object.entries(m).filter(([, v]) => typeof v === "string" && RE_LLAVE_SUELTA.test(v.trim()));
  if (!validas.length) return null;
  const buena = validas.find(([k]) => k === "default") || validas[0];
  return buena[1].trim();
}
function todasLasLlavesDe(entorno2, nombre) {
  try {
    const crudo = leer(entorno2, nombre);
    if (crudo === void 0) return [];
    const t = crudo.trim();
    if (!t.startsWith("{")) return [t];
    const m = JSON.parse(t);
    return m && typeof m === "object" ? Object.values(m).filter((v) => typeof v === "string") : [];
  } catch (_) {
    return [];
  }
}
function direccion(entorno2) {
  const v = leer(entorno2, VARIABLES.url);
  if (v === void 0) return { falta: VARIABLES.url };
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("esquema");
    return { url: u.href.replace(/\/+$/, "") };
  } catch (_) {
    throw new ErrorDeEntorno("INVALIDA", [VARIABLES.url], "La variable " + VARIABLES.url + " no es una dirección http(s) válida.");
  }
}
function leerSupabase(entorno2, { nueva, antigua }) {
  const d = direccion(entorno2);
  let llave = llaveDe(entorno2, nueva), fuente = nueva;
  if (llave === null) {
    const vieja = leer(entorno2, antigua);
    if (vieja !== void 0 && RE_LLAVE_SUELTA.test(vieja.trim())) {
      llave = vieja.trim();
      fuente = antigua;
    }
  }
  const faltan = [];
  if (d.falta) faltan.push(d.falta);
  if (llave === null) faltan.push(nueva);
  if (faltan.length) {
    throw new ErrorDeEntorno(
      "FALTA",
      faltan,
      "Falta configurar: " + faltan.map((n) => n === nueva ? n + " (o la antigua " + antigua + ")" : n).join(", ") + "."
    );
  }
  return { url: d.url, llave, fuente };
}
function leerSupabasePublico(entorno2) {
  return leerSupabase(entorno2, { nueva: VARIABLES.publicas, antigua: VARIABLES.anon });
}
function leerSupabaseServicio(entorno2) {
  return leerSupabase(entorno2, { nueva: VARIABLES.secretas, antigua: VARIABLES.serviceRole });
}
function leerLlavesIA(entorno2) {
  const crudo = leer(entorno2, VARIABLES.ia);
  if (crudo === void 0) {
    throw new ErrorDeEntorno(
      "FALTA",
      [VARIABLES.ia],
      "Falta configurar " + VARIABLES.ia + ' (un JSON con las llaves de IA: {"qwen":[…],"deepseek":[…],"gemini":[…]}).'
    );
  }
  let m;
  try {
    m = JSON.parse(crudo);
  } catch (_) {
    throw new ErrorDeEntorno("INVALIDA", [VARIABLES.ia], "La variable " + VARIABLES.ia + " no es un JSON válido.");
  }
  if (!m || typeof m !== "object" || Array.isArray(m)) {
    throw new ErrorDeEntorno("INVALIDA", [VARIABLES.ia], "La variable " + VARIABLES.ia + " tiene que ser un objeto JSON con una lista de llaves por proveedor.");
  }
  const llaves = {};
  for (const p of IA_PROVS) llaves[p] = Array.isArray(m[p]) ? m[p].filter((k) => typeof k === "string") : [];
  return llaves;
}
function secretosDelEntorno(entorno2) {
  const todos = /* @__PURE__ */ new Set();
  const agrega = (x) => {
    if (typeof x === "string" && x.length >= 8) todos.add(x);
  };
  try {
    const sello = entorno2(VARIABLES.sello);
    if (claveUsable(sello)) agrega(sello);
  } catch (_) {
  }
  try {
    const crudo = leer(entorno2, VARIABLES.ia);
    if (crudo !== void 0) {
      const m = JSON.parse(crudo);
      if (m && typeof m === "object") {
        for (const v of Object.values(m)) if (Array.isArray(v)) v.forEach(agrega);
      }
    }
  } catch (_) {
  }
  todasLasLlavesDe(entorno2, VARIABLES.secretas).forEach(agrega);
  try {
    const v = leer(entorno2, VARIABLES.serviceRole);
    if (v !== void 0) agrega(v.trim());
  } catch (_) {
  }
  return [...todos];
}

// supabase/functions/_shared/cliente.js
var ESPERA_BASE_MS = 15e3;
var SIN_SESION = Object.freeze({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
function conTope(fetchBase, esperaMs) {
  return async (entrada, init) => {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), esperaMs);
    const suya = init && init.signal;
    if (suya) {
      if (suya.aborted) ctrl.abort();
      else suya.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    try {
      return await fetchBase(entrada, { ...init || {}, signal: ctrl.signal });
    } finally {
      clearTimeout(reloj);
    }
  };
}
function simple(e) {
  if (!e) return null;
  return {
    message: String(e.message || ""),
    code: e.code === void 0 ? void 0 : String(e.code),
    status: e.status === void 0 ? void 0 : Number(e.status),
    name: String(e.name || "")
  };
}
var resultado = (r) => ({ data: r.data === void 0 ? null : r.data, error: simple(r.error), status: r.status });
function crearClienteBase({ createClient: createClient2, entorno: entorno2, fetch: fetchBase, esperaMs } = {}) {
  if (typeof createClient2 !== "function") throw new TypeError("crearClienteBase: falta createClient (el de npm:@supabase/supabase-js@2).");
  if (typeof entorno2 !== "function") throw new TypeError("crearClienteBase: falta el lector del entorno.");
  if (typeof fetchBase !== "function") throw new TypeError("crearClienteBase: falta el fetch de la plataforma.");
  const salida = conTope(fetchBase, esperaMs || ESPERA_BASE_MS);
  const opciones = (cabeceras2) => ({ auth: SIN_SESION, global: { fetch: salida, ...cabeceras2 ? { headers: cabeceras2 } : {} } });
  let publico = null, servicio = null;
  const clientePublico = () => {
    if (!publico) {
      const c = leerSupabasePublico(entorno2);
      publico = createClient2(c.url, c.llave, opciones());
    }
    return publico;
  };
  const clienteServicio = () => {
    if (!servicio) {
      const c = leerSupabaseServicio(entorno2);
      servicio = createClient2(c.url, c.llave, opciones());
    }
    return servicio;
  };
  const comoUsuario = (jwt) => {
    const c = leerSupabasePublico(entorno2);
    return createClient2(c.url, c.llave, opciones({ Authorization: "Bearer " + jwt }));
  };
  return {
    async usuarioDe(jwt) {
      const r = await clientePublico().auth.getUser(jwt);
      return { data: r.data || { user: null }, error: simple(r.error) };
    },
    async rpcUsuario(jwt, nombre, args) {
      return resultado(await comoUsuario(jwt).rpc(nombre, args || {}));
    },
    async rpcServicio(nombre, args) {
      return resultado(await clienteServicio().rpc(nombre, args || {}));
    },
    async leerMinimo() {
      const r = await clienteServicio().from("empresas").select("id").limit(1);
      return { data: null, error: simple(r.error), status: r.status };
    }
  };
}

// supabase/functions/_shared/precio.js
var MATERIALES = Object.freeze({ "al-paint": 30, "al-brush": 35, "acr-vol": 40, "acr-vinil": 45, "acero": 55 });
var COMPLEJIDAD = Object.freeze({ "recta": 0, "cursiva": 5, "compleja": 10 });
var RECORTES = Object.freeze({ "sencillo": 20, "vinil": 25, "sandwich": 55 });
var RECORTE_COMP_EXTRA = 5;
var BASTIDORES = Object.freeze({ "lamina": 950, "alucobond": 1500 });
var M2_MINIMO = 1;
var IVA = 0.16;
var FABRICA = Object.freeze({ material: MATERIALES, complejidad: COMPLEJIDAD, recorte: RECORTES, bastidor: BASTIDORES, extra: RECORTE_COMP_EXTRA });
var tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var precioDe = (mapa, k) => tiene(mapa, k) ? mapa[k] : 0;
var factorDe = (it, M) => precioDe(M.material, it.material) + precioDe(M.complejidad, it.comp);
var m2Total = (tarifa, m2) => (tarifa || 0) * Math.max(m2 || 0, M2_MINIMO);
function lineaCruda(it, M = FABRICA) {
  if (it.tipo === "letras") {
    let p = factorDe(it, M) * (it.altura || 0) * (it.n || 0);
    if (!it.luz) p *= 0.8;
    return p;
  }
  if (it.tipo === "recorte") {
    let rate = precioDe(M.recorte, it.acab);
    if (it.acab === "sandwich" && it.recComp) rate += M.extra;
    return rate * (it.altura || 0) * (it.n || 0);
  }
  if (it.tipo === "bastidor") {
    const m2b = (it.ancho || 0) * (it.alto || 0) / 1e4;
    if (m2b <= 0) return 0;
    return m2Total(precioDe(M.bastidor, it.bas), m2b);
  }
  if (it.tipo === "caja") {
    const m2c = (it.ancho || 0) * (it.alto || 0) / 1e4;
    if (m2c <= 0) return 0;
    return m2Total(it.tarifa || 0, m2c);
  }
  return (it.pz || 0) * (it.pu || 0);
}
var linea = (it, M = FABRICA) => Math.round(lineaCruda(it, M) * 100) / 100;
function subtotal(items, M = FABRICA) {
  let s = 0;
  for (let i = 0; i < items.length; i++) s += linea(items[i], M);
  return s;
}
var neto = (sub, iva) => iva ? sub + sub * IVA : sub;

// supabase/functions/_shared/ficha.js
var ALTURA_MIN_LETRAS = 10;
var ALTURA_INSTALACION_INCLUIDA_M = 4;
var MUNICIPIOS_ZMG = Object.freeze([
  "guadalajara",
  "zapopan",
  "tlaquepaque",
  "san pedro tlaquepaque",
  "tonala",
  "tlajomulco",
  "tlajomulco de zuniga",
  "el salto"
]);
var TARIFA_CAJA = Object.freeze({ std: 3900, nube: 4600 });
var TIPOS = Object.freeze({
  letras: { nombre: "Letras 3D", cotizaSolo: true },
  recorte: { nombre: "Recorte (acrílico o PVC)", cotizaSolo: true },
  caja: { nombre: "Caja de luz", cotizaSolo: true },
  bastidor: { nombre: "Bastidor", cotizaSolo: true },
  neon: { nombre: "Neón flex", cotizaSolo: false },
  totem: { nombre: "Tótem", cotizaSolo: false },
  senaletica: { nombre: "Señalética", cotizaSolo: false },
  placa: { nombre: "Placa de acrílico", cotizaSolo: false },
  vinil: { nombre: "Rotulación de vinil", cotizaSolo: false },
  mantenimiento: { nombre: "Mantenimiento de letrero", cotizaSolo: false },
  especial: { nombre: "Proyecto especial", cotizaSolo: false }
});
var vacio = (v) => v === void 0 || v === null || typeof v === "string" && v.trim() === "" || Array.isArray(v) && v.length === 0;
var sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
var lleva_luz = (p) => !!p && (p.luz === true || ["caja", "neon"].includes(p.tipo) && p.luz !== false);
var esChica = (p) => !!p && ["letras", "recorte"].includes(p.tipo) && Number(p.altura_cm) > 0 && Number(p.altura_cm) < ALTURA_MIN_LETRAS;
function contarLetras(texto2) {
  const m = String(texto2 || "").normalize("NFC").match(/[\p{L}\p{N}&#+@]/gu);
  return m ? m.length : 0;
}
var P_PROYECTO = [
  { id: "negocio", etapa: "cotizar", pregunta: "¿Cómo se llama tu negocio?" },
  { id: "lleva_logo", etapa: "cotizar", pregunta: "¿El letrero lleva logotipo o algún símbolo, o solo texto?" },
  { id: "entrega", etapa: "cotizar", pregunta: "¿Lo instalamos nosotros, pasas por él al taller o te lo enviamos por paquetería?" },
  { id: "municipio", etapa: "cotizar", aplica: (f) => f.entrega === "instalacion", pregunta: "¿En qué municipio o colonia se instala?" },
  { id: "lugar", etapa: "cotizar", pregunta: "¿Va en interior o en exterior (le da el sol o la lluvia)?" },
  { id: "altura_m", etapa: "cotizar", aplica: (f) => f.entrega === "instalacion", pregunta: "¿Más o menos a qué altura del piso va el letrero?" },
  { id: "factura", etapa: "cotizar", pregunta: "¿Vas a requerir factura?" },
  { id: "fecha_deseada", etapa: "cotizar", pregunta: "¿Para qué fecha lo necesitas?" },
  {
    id: "archivo_editable",
    etapa: "fabricar",
    aplica: (f) => f.lleva_logo === true,
    pregunta: "¿Tienes tu logotipo en archivo editable (AI, PDF, SVG o CDR)? Si no, lo redibujamos y puede haber cambios mínimos."
  },
  {
    id: "salidas_electricas",
    etapa: "fabricar",
    aplica: (f) => (f.partidas || []).some(lleva_luz),
    pregunta: "¿Hay una salida eléctrica (110 V) detrás o cerca de donde va el letrero? La salida la proporciona el cliente."
  },
  { id: "direccion", etapa: "instalar", aplica: (f) => f.entrega === "instalacion" || f.entrega === "paqueteria", pregunta: "¿Me compartes la dirección completa (o tu ubicación de Maps)?" },
  {
    id: "superficie",
    etapa: "instalar",
    aplica: (f) => f.entrega === "instalacion",
    pregunta: "¿Sobre qué se instala: muro de concreto o ladrillo, tablaroca, vidrio, lámina o una estructura?"
  },
  {
    id: "reglas_sitio",
    etapa: "instalar",
    aplica: (f) => f.entrega === "instalacion",
    pregunta: "¿Hay horario o reglas para instalar (plaza, condominio, parque industrial)?"
  }
];
var P_PARTIDA = {
  letras: [
    { id: "texto", etapa: "cotizar", pregunta: "¿Qué dice exactamente el letrero? Tal cual, con mayúsculas y acentos." },
    { id: "altura_cm", etapa: "cotizar", medida: true, pregunta: "¿De qué altura quieres las letras (en cm)? Si no sabes, dime el ancho del muro y te propongo una." },
    { id: "material", etapa: "cotizar", pregunta: "¿Qué acabado te late: aluminio pintado, aluminio cepillado, acrílico con aluminio (la cara se ilumina), acrílico con vinil o acero inoxidable?" },
    { id: "luz", etapa: "cotizar", pregunta: "¿Lleva luz?" },
    { id: "tono", etapa: "cotizar", aplica: (p) => p.luz === true, pregunta: "¿Luz blanca fría o cálida (amarillenta)?" },
    { id: "comp", etapa: "cotizar", pregunta: "¿La tipografía es recta, cursiva o con detalles finos?" },
    { id: "colores", etapa: "fabricar", pregunta: "¿De qué color van las caras y los cantos?" }
  ],
  recorte: [
    { id: "texto", etapa: "cotizar", pregunta: "¿Qué dice exactamente? Tal cual, con mayúsculas y acentos." },
    { id: "altura_cm", etapa: "cotizar", medida: true, pregunta: "¿De qué altura las letras o piezas (en cm)?" },
    { id: "acabado", etapa: "cotizar", pregunta: "¿Sencillo, con rotulación de vinil o tipo sándwich con luz?" },
    { id: "colores", etapa: "fabricar", pregunta: "¿De qué color el acrílico o el vinil?" },
    { id: "montaje", etapa: "fabricar", pregunta: "¿Pegado directo, separado de la pared o sobre una base de acrílico transparente?" }
  ],
  caja: [
    { id: "ancho_cm", etapa: "cotizar", medida: true, pregunta: "¿Qué medidas quieres la caja: ancho y alto (en cm)?" },
    { id: "alto_cm", etapa: "cotizar", medida: true, pregunta: "¿Y de alto (en cm)?" },
    { id: "forma", etapa: "cotizar", pregunta: "¿Rectangular o circular, o con la silueta de tu logo (tipo nube)?" },
    { id: "vistas", etapa: "cotizar", pregunta: "¿Se ve de un solo lado o de los dos (tipo bandera)?" },
    { id: "luz", etapa: "cotizar", pregunta: "¿Lleva luz?" },
    { id: "tono", etapa: "cotizar", aplica: (p) => p.luz !== false, pregunta: "¿Luz blanca fría o cálida?" },
    { id: "colores", etapa: "fabricar", pregunta: "¿De qué color los cantos? La cara va en acrílico con tu diseño en vinil." }
  ],
  bastidor: [
    { id: "ancho_cm", etapa: "cotizar", medida: true, pregunta: "¿Qué medidas del bastidor: ancho y alto (en cm)?" },
    { id: "alto_cm", etapa: "cotizar", medida: true, pregunta: "¿Y de alto (en cm)?" },
    { id: "material", etapa: "cotizar", pregunta: "¿En lámina galvanizada o en alucobond?" },
    { id: "rotulacion", etapa: "fabricar", pregunta: "¿Qué lleva encima: vinil de corte, vinil impreso o letras 3D?" }
  ],
  neon: [
    { id: "ancho_cm", etapa: "cotizar", medida: true, pregunta: "¿Qué medida aproximada, ancho y alto (en cm)?" },
    { id: "alto_cm", etapa: "cotizar", medida: true, pregunta: "¿Y de alto (en cm)?" },
    { id: "colores", etapa: "cotizar", pregunta: "¿De qué color o colores el neón?" },
    { id: "base", etapa: "cotizar", pregunta: "¿Base de acrílico transparente, espejo o negra?" }
  ],
  totem: [
    { id: "alto_cm", etapa: "cotizar", medida: true, pregunta: "¿Qué altura total y qué ancho tendría el tótem?" },
    { id: "vistas", etapa: "cotizar", pregunta: "¿Se ve de uno o de los dos lados?" },
    { id: "cimentacion", etapa: "cotizar", pregunta: "¿Ya hay cimentación o base donde va?" },
    { id: "luz", etapa: "cotizar", pregunta: "¿Lleva luz?" }
  ],
  senaletica: [
    { id: "piezas", etapa: "cotizar", pregunta: "¿Cuántas piezas y de qué medida cada una?" },
    { id: "material", etapa: "cotizar", pregunta: "¿En lámina, acrílico o alucobond? ¿Con poste?" },
    { id: "lugar_detalle", etapa: "cotizar", pregunta: "¿Interior o exterior? ¿Necesita vinil reflejante o antigrafiti?" }
  ],
  placa: [
    { id: "ancho_cm", etapa: "cotizar", medida: true, pregunta: "¿Qué medida la placa: ancho y alto (en cm)?" },
    { id: "alto_cm", etapa: "cotizar", medida: true, pregunta: "¿Y de alto (en cm)?" },
    { id: "colores", etapa: "cotizar", pregunta: "¿Acrílico transparente o espejo, y de qué colores el vinil?" }
  ],
  vinil: [
    { id: "superficie", etapa: "cotizar", pregunta: "¿Dónde va el vinil: vidrio, pared o vehículo (qué modelo)?" },
    { id: "medidas", etapa: "cotizar", medida: true, pregunta: "¿Qué medidas cubre (o qué partes del vehículo)?" },
    { id: "impreso", etapa: "cotizar", pregunta: "¿Vinil impreso a color o de corte en un solo color?" }
  ],
  mantenimiento: [
    { id: "que_cambia", etapa: "cotizar", pregunta: "¿Qué hay que cambiarle: la lona, la iluminación, la estructura?" },
    { id: "medidas", etapa: "cotizar", medida: true, pregunta: "¿Qué medidas tiene el letrero actual?" },
    { id: "fotos", etapa: "cotizar", pregunta: "¿Me mandas fotos de cómo está hoy, de frente y de lado?" }
  ],
  especial: [
    { id: "descripcion", etapa: "cotizar", pregunta: "¿Me platicas qué tienes en mente? Si tienes una imagen de referencia, mándamela." },
    { id: "medidas", etapa: "cotizar", medida: true, pregunta: "¿Qué medidas aproximadas?" }
  ]
};
var CAMPOS_PROYECTO = Object.freeze(P_PROYECTO.map((q) => q.id));
var camposDePartida = (tipo) => (P_PARTIDA[tipo] || P_PARTIDA.especial).map((q) => q.id);
var ETAPAS = ["cotizar", "fabricar", "instalar"];
var hasta = (etapa) => ETAPAS.slice(0, ETAPAS.indexOf(etapa) + 1);
function preguntasPendientes(ficha, etapa = "cotizar") {
  const f = ficha || {};
  const etapas = hasta(etapa);
  const out = [];
  for (const q of P_PROYECTO) {
    if (!etapas.includes(q.etapa)) continue;
    if (q.aplica && !q.aplica(f)) continue;
    if (vacio(f[q.id])) out.push({ id: q.id, etapa: q.etapa, pregunta: q.pregunta, donde: "proyecto" });
  }
  const partidas = Array.isArray(f.partidas) ? f.partidas : [];
  if (!partidas.length) {
    out.unshift({
      id: "partidas",
      etapa: "cotizar",
      donde: "proyecto",
      pregunta: "¿Qué tienes en mente: letras 3D, caja de luz, recorte, neón u otra cosa? Si tienes foto de la fachada, mándamela."
    });
  }
  partidas.forEach((p, i) => {
    if (!p || typeof p !== "object") return;
    const lista = P_PARTIDA[p.tipo] || P_PARTIDA.especial;
    for (const q of lista) {
      if (!etapas.includes(q.etapa)) continue;
      if (q.aplica && !q.aplica(p)) continue;
      if (vacio(p[q.id])) out.push({ id: q.id, etapa: q.etapa, pregunta: q.pregunta, donde: "partida", i });
    }
    if (p.tipo === "letras" && esChica(p) && vacio(p.acabado)) {
      out.push({
        id: "acabado",
        etapa: "cotizar",
        donde: "partida",
        i,
        pregunta: "A " + Number(p.altura_cm) + " cm la letra va en recorte plano (sin volumen ni luz): ¿sencillo o con rotulación de vinil?"
      });
    }
  });
  return out.sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa));
}
function decisionesParaDireccion(ficha) {
  const f = ficha || {};
  const out = [];
  if (f.lleva_logo === true) out.push({ id: "logo", razon: "Lleva logotipo o símbolo: el criterio de cobro cambia por proyecto." });
  (f.partidas || []).forEach((p, i) => {
    const t = TIPOS[p && p.tipo];
    if (!t) out.push({ id: "tipo", i, razon: "Partida sin tipo reconocido." });
    else if (!t.cotizaSolo) out.push({ id: "tipo", i, razon: t.nombre + ": no está en el catálogo, se cotiza a mano." });
    if (p && p.medida_confirmada === false) out.push({ id: "medida", i, razon: "La medida de «" + (t ? t.nombre : "la partida") + "» salió de una foto: el cliente no la confirmó." });
  });
  if (f.entrega === "instalacion") {
    const m = sinAcentos(f.municipio);
    if (m && !MUNICIPIOS_ZMG.some((z) => m === z || m.includes(z))) out.push({ id: "zona", razon: "Instalación fuera de la zona metropolitana (" + f.municipio + "): falta cobrar el traslado." });
    if (Number(f.altura_m) > ALTURA_INSTALACION_INCLUIDA_M) out.push({ id: "altura", razon: "Se instala a " + f.altura_m + " m: arriba de " + ALTURA_INSTALACION_INCLUIDA_M + " m puede pedir grúa." });
  }
  if (f.entrega === "paqueteria") out.push({ id: "envio", razon: "Va por paquetería: falta el costo del envío." });
  return out;
}
function puedeCotizarSolo(ficha) {
  return preguntasPendientes(ficha, "cotizar").length === 0 && decisionesParaDireccion(ficha).length === 0;
}
var MATERIAL = {
  "aluminio pintado": "al-paint",
  "aluminio cepillado": "al-brush",
  "acrilico con aluminio": "acr-vol",
  "acrilico con vinil": "acr-vinil",
  "acero inoxidable": "acero"
};
var deMaterial = (v) => FABRICA.material[v] !== void 0 ? v : MATERIAL[sinAcentos(v)] || "";
var deComp = (v) => {
  const s = sinAcentos(v);
  return s.startsWith("curs") ? "cursiva" : s.startsWith("compl") || s.includes("detalle") ? "compleja" : "recta";
};
function aPartidasDelCotizador(ficha) {
  const items = [];
  (ficha && ficha.partidas || []).forEach((p, i) => {
    if (!p || typeof p !== "object") return;
    const id = i + 1;
    const altura = Number(p.altura_cm) || 0;
    const n = Number(p.n) || contarLetras(p.texto);
    if (p.tipo === "letras" && !esChica(p)) {
      items.push({
        id,
        tipo: "letras",
        material: deMaterial(p.material),
        comp: deComp(p.comp),
        luz: p.luz === true,
        ilumTipo: sinAcentos(p.tono) === "calida" ? "calida" : "fria",
        altura,
        n
      });
    } else if (p.tipo === "letras" || p.tipo === "recorte") {
      items.push({ id, tipo: "recorte", acab: p.acabado || "", recComp: false, altura, n });
    } else if (p.tipo === "caja") {
      items.push({ id, tipo: "caja", tarifa: TARIFA_CAJA[p.forma === "nube" ? "nube" : "std"], ancho: Number(p.ancho_cm) || 0, alto: Number(p.alto_cm) || 0 });
    } else if (p.tipo === "bastidor") {
      items.push({ id, tipo: "bastidor", bas: sinAcentos(p.material) === "alucobond" ? "alucobond" : "lamina", ancho: Number(p.ancho_cm) || 0, alto: Number(p.alto_cm) || 0 });
    }
  });
  return items;
}
function cotizar(ficha, M = FABRICA) {
  if (!puedeCotizarSolo(ficha)) return null;
  const items = aPartidasDelCotizador(ficha);
  const sub = subtotal(items, M);
  const iva = ficha.factura === true;
  return { items, renglones: items.map((it) => ({ id: it.id, importe: linea(it, M) })), subtotal: sub, iva, total: +neto(sub, iva).toFixed(2) };
}

// supabase/functions/_shared/agente.js
var MAX_PARTIDAS = 10;
var MAX_RESPUESTA = 1200;
var ANTICIPO_PCT = 50;
var VIGENCIA_DIAS = 10;
var HECHOS = Object.freeze([
  "AL3D fabrica anuncios luminosos en su propio taller (Naranjos #648, Col. Lindavista, C.P. 45169).",
  "Para arrancar se deja un anticipo de al menos el " + ANTICIPO_PCT + " %; el resto se liquida al instalar.",
  "La cotización vale " + VIGENCIA_DIAS + " días. El anticipo no es reembolsable.",
  "Con factura se agrega el IVA (16 %).",
  "La salida eléctrica donde va el letrero la pone el cliente."
]);
var texto = (v, max) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : void 0;
var numero = (v, min, max) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && isFinite(n) && n >= min && n <= max ? n : void 0;
};
var booleano = (v) => v === true || v === false ? v : void 0;
var uno = (v, lista) => lista.includes(v) ? v : void 0;
var LIMPIA_PROYECTO = {
  negocio: (v) => texto(v, 80),
  lleva_logo: booleano,
  entrega: (v) => uno(v, ["instalacion", "paqueteria", "recoleccion"]),
  municipio: (v) => texto(v, 80),
  lugar: (v) => uno(v, ["interior", "exterior"]),
  altura_m: (v) => numero(v, 0, 60),
  factura: booleano,
  archivo_editable: booleano,
  acepta: booleano
};
var LIMPIA_PARTIDA = {
  texto: (v) => texto(v, 200),
  altura_cm: (v) => numero(v, 0.5, 2e3),
  ancho_cm: (v) => numero(v, 1, 5e3),
  alto_cm: (v) => numero(v, 1, 5e3),
  luz: booleano,
  tono: (v) => uno(v, ["fria", "calida"]),
  forma: (v) => uno(v, ["std", "nube"]),
  vistas: (v) => v === 1 || v === 2 ? v : void 0,
  acabado: (v) => uno(v, ["sencillo", "vinil", "sandwich"]),
  medida_confirmada: booleano
};
function aplicarCambios(ficha, ext) {
  const f = JSON.parse(JSON.stringify(ficha && typeof ficha === "object" ? ficha : {}));
  if (!Array.isArray(f.partidas)) f.partidas = [];
  const e = ext && typeof ext === "object" ? ext : {};
  const p = e.proyecto && typeof e.proyecto === "object" ? e.proyecto : {};
  for (const k of [...CAMPOS_PROYECTO, "acepta"]) {
    if (!(k in p)) continue;
    const v = (LIMPIA_PROYECTO[k] || ((x) => texto(x, 200)))(p[k]);
    if (v !== void 0) f[k] = v;
  }
  for (const q of Array.isArray(e.partidas) ? e.partidas.slice(0, MAX_PARTIDAS) : []) {
    if (!q || typeof q !== "object") continue;
    let destino = Number.isInteger(q.i) && f.partidas[q.i] ? f.partidas[q.i] : null;
    if (!destino) {
      if (!TIPOS[q.tipo] || f.partidas.length >= MAX_PARTIDAS) continue;
      destino = { tipo: q.tipo };
      f.partidas.push(destino);
    }
    for (const k of [...camposDePartida(destino.tipo), "medida_confirmada"]) {
      if (!(k in q)) continue;
      const v = (LIMPIA_PARTIDA[k] || ((x) => texto(x, 200)))(q[k]);
      if (v !== void 0) destino[k] = v;
    }
  }
  return f;
}
function estadoDe(ficha) {
  const pendientes = preguntasPendientes(ficha, "cotizar");
  const decisiones = pendientes.length ? [] : decisionesParaDireccion(ficha);
  const cotizacion = pendientes.length || decisiones.length ? null : cotizar(ficha);
  const siguiente = pendientes.length ? "preguntar" : decisiones.length ? "direccion" : "cerrar";
  return { pendientes, decisiones, cotizacion, siguiente };
}
var ultimos = (mensajes, n) => (Array.isArray(mensajes) ? mensajes.slice(-n) : []).map((m) => ({ role: m.de === "cliente" ? "user" : "assistant", content: String(m.texto || "").slice(0, 1500) }));
function instruccionExtraer(ficha, mensajes, textoCliente) {
  const tipos = Object.entries(TIPOS).map(([k, t]) => k + " (" + t.nombre + ")").join(", ");
  const campos = Object.keys(TIPOS).map((t) => t + ": " + camposDePartida(t).join(", ")).join("\n");
  const sistema = [
    "Llenas la ficha de un anuncio para AL3D (anuncios luminosos) con lo que escribe el cliente.",
    'Contesta SOLO un objeto JSON: {"proyecto": {...}, "partidas": [{"i": <índice si completa una que ya existe>, "tipo": "...", ...}]}.',
    'Pon SOLO lo que el cliente dijo o confirmó en su último mensaje. No adivines, no completes, no supongas. Si no dijo nada nuevo: {"proyecto":{},"partidas":[]}.',
    "Campos del proyecto: " + [...CAMPOS_PROYECTO, "acepta"].join(", ") + ".",
    'entrega es "instalacion", "paqueteria" o "recoleccion" (pasa al taller). lugar es "interior" o "exterior". altura_m en metros.',
    "lleva_logo, factura, archivo_editable y luz son true/false. acepta = true solo si dice que quiere hacer el trabajo con la cotización que ya tiene.",
    "Tipos de partida: " + tipos + ". Campos por tipo:\n" + campos,
    'Medidas en centímetros. texto = lo que dice el letrero, tal cual lo escribió. tono "fria" o "calida". forma de caja "std" (rectangular o circular) o "nube" (silueta). acabado de recorte "sencillo", "vinil" o "sandwich".',
    'material de letras: "aluminio pintado", "aluminio cepillado", "acrilico con aluminio", "acrilico con vinil" o "acero inoxidable". comp: "recta", "cursiva" o "compleja".',
    'Si una medida la calcula por una foto o dice "más o menos" o "como de", pon "medida_confirmada": false.'
  ].join("\n");
  const pregunta = "Ficha actual:\n" + JSON.stringify(ficha || {}) + "\n\nÚltimo mensaje del cliente:\n" + String(textoCliente || "").slice(0, 2e3);
  return { sistema, pregunta, mensajes: ultimos(mensajes, 6) };
}
function instruccionResponder(ficha, estado, mensajes, textoCliente, decision) {
  const sistema = [
    "Eres el asistente de ventas de AL3D. Hablas como Elías, el dueño: español de México, amable, directo y breve (3 o 4 renglones), de tú.",
    'Contesta SOLO un objeto JSON: {"respuesta": "<lo que le escribes al cliente>"}.',
    "Reglas:",
    "1. NUNCA escribas precios, cantidades de dinero, porcentajes de descuento ni números de cuenta. El precio lo agrega el sistema después de tu texto.",
    "2. Si hay preguntas pendientes, haz como máximo las dos primeras, con tus palabras y en ese orden.",
    "3. Si hay cosas para Dirección, dile que lo revisas con el encargado y que le confirmas en cuanto lo tengas. No prometas una hora.",
    "4. Si ya hay cotización, dile que abajo va el precio y pregúntale si quiere arrancar.",
    "5. Si Dirección mandó una nota, transmítela con tus palabras.",
    "6. De AL3D solo puedes decir esto: " + HECHOS.join(" "),
    "7. Si te preguntan algo que no está aquí, di que lo consultas y le confirmas.",
    '8. Si siguiente es "descartada", dile con amabilidad que por ahora AL3D no puede hacer ese trabajo (con la nota de Dirección si la hay) y agradécele.'
  ].join("\n");
  const contexto = {
    siguiente: estado.siguiente,
    preguntas_pendientes: estado.pendientes.slice(0, 2).map((p) => p.pregunta),
    para_direccion: estado.decisiones.map((d) => d.razon),
    hay_cotizacion: !!estado.cotizacion,
    nota_de_direccion: decision && decision.nota ? decision.nota : "",
    negocio: ficha && ficha.negocio || ""
  };
  const pregunta = "Lo que decidió el sistema:\n" + JSON.stringify(contexto) + "\n\nÚltimo mensaje del cliente:\n" + String(textoCliente || "").slice(0, 2e3);
  return { sistema, pregunta, mensajes: ultimos(mensajes, 10) };
}
function leerJson(t) {
  const s = String(t || "");
  const ini = s.indexOf("{"), fin = s.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  try {
    const o = JSON.parse(s.slice(ini, fin + 1));
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch (_) {
    return null;
  }
}
var pesos = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
var DINERO = /\$\s?\d|\d[\d.,]*\s?(pesos|mxn|mil pesos)\b|\bmxn\s?\d/i;
function sinDinero(t) {
  const partes = String(t || "").split(/(?<=[.!?\n])\s*/);
  return partes.filter((p) => !DINERO.test(p)).join(" ").replace(/\s+\n/g, "\n").trim();
}
function mensajeDePrecio(c) {
  if (!c) return "";
  const anticipo = Math.round(c.total * ANTICIPO_PCT) / 100;
  return [
    "Tu cotización: " + pesos(c.total) + (c.iva ? " con IVA incluido." : "."),
    "Para arrancar: anticipo de " + pesos(anticipo) + " (" + ANTICIPO_PCT + " %) y el resto al instalar. Vale " + VIGENCIA_DIAS + " días."
  ].join("\n");
}
function armarRespuesta(textoIA, estado, ficha, cuenta) {
  let t = sinDinero(textoIA).slice(0, MAX_RESPUESTA);
  if (!t) {
    t = estado.siguiente === "preguntar" ? estado.pendientes[0].pregunta : estado.siguiente === "direccion" ? "Déjame revisarlo con el encargado y te confirmo en cuanto lo tenga." : estado.siguiente === "descartada" ? "Por ahora no podemos hacer este trabajo. ¡Gracias por escribirnos!" : "¡Listo! Aquí va tu cotización.";
  }
  const partes = [t];
  if (estado.cotizacion) partes.push(mensajeDePrecio(estado.cotizacion));
  if (estado.cotizacion && ficha && ficha.acepta === true && cuenta) partes.push("Te dejo la cuenta para el anticipo:\n" + cuenta);
  return partes.join("\n\n");
}
function resumenParaDireccion(ficha) {
  const f = ficha || {};
  const ps = (f.partidas || []).map((p) => (TIPOS[p.tipo] ? TIPOS[p.tipo].nombre : "Partida") + (p.texto ? " «" + p.texto + "»" : "") + (p.altura_cm ? " " + p.altura_cm + " cm" : "") + (p.ancho_cm && p.alto_cm ? " " + p.ancho_cm + "×" + p.alto_cm + " cm" : ""));
  return [f.negocio || "Sin nombre", ps.join(", "), f.entrega === "instalacion" && f.municipio ? "en " + f.municipio : ""].filter(Boolean).join(" · ").slice(0, 600);
}

// supabase/functions/_shared/http.js
var ORIGENES_PERMITIDOS = Object.freeze([
  "https://eliasgaribi-ctrl-z.github.io",
  "https://cotizador-al3d.pages.dev"
]);
var EN_LISTA = new Set(ORIGENES_PERMITIDOS);
var origenPermitido = (origen) => typeof origen === "string" && EN_LISTA.has(origen);
var CABECERAS_BASE = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
  "x-al3d-contrato"
];
var MARCA_DE_SECRETO = "[oculto]";
var DEFINITIVOS = /* @__PURE__ */ new Set(["ROL_SIN_PERMISO", "NO_ENCONTRADO", "DATO_INVALIDO", "DUPLICADO"]);
function sobreDeError(codigo, mensaje2, extra) {
  return { ok: false, codigo, mensaje: mensaje2, definitivo: DEFINITIVOS.has(codigo), ...extra || {} };
}
var errorInterno = () => ({ ok: false, codigo: "DESCONOCIDO", mensaje: "El puente falló procesando eso." });
function ocultarSecretos(texto2, secretos) {
  let t = String(texto2);
  for (const s of secretos || []) {
    if (typeof s !== "string" || s.length < 8) continue;
    for (const forma of /* @__PURE__ */ new Set([s, JSON.stringify(s).slice(1, -1)])) {
      if (forma && t.includes(forma)) t = t.split(forma).join(MARCA_DE_SECRETO);
    }
  }
  return t;
}
function origenDe(peticion) {
  try {
    return peticion.headers.get("origin");
  } catch (_) {
    return null;
  }
}
function cabeceras(peticion, extra) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...extra || {}
  });
  const origen = origenDe(peticion);
  if (origenPermitido(origen)) h.set("Access-Control-Allow-Origin", origen);
  return h;
}
function json(peticion, status, cuerpo, opciones) {
  const o = opciones || {};
  let texto2 = JSON.stringify(cuerpo);
  if (o.secretos && o.secretos.length) texto2 = ocultarSecretos(texto2, o.secretos);
  return new Response(texto2, { status, headers: cabeceras(peticion, o.cabeceras) });
}
function previa(peticion, { metodos }) {
  const origen = peticion.headers.get("origin");
  if (origen !== null && !origenPermitido(origen)) {
    return json(peticion, 403, sobreDeError("ORIGEN_NO_PERMITIDO", "Este origen no puede usar esta función.", { definitivo: true }));
  }
  const metodo = String(peticion.method || "").toUpperCase();
  if (metodo === "OPTIONS") return preflight(peticion, metodos);
  if (!metodos.includes(metodo)) {
    return json(
      peticion,
      405,
      sobreDeError("DATO_INVALIDO", "Este camino no atiende ese método."),
      { cabeceras: { Allow: metodos.concat("OPTIONS").join(", ") } }
    );
  }
  return null;
}
function preflight(peticion, metodos) {
  const h = new Headers({ "Vary": "Origin, Access-Control-Request-Headers, Access-Control-Request-Method" });
  const origen = peticion.headers.get("origin");
  if (origenPermitido(origen)) {
    const pedidas = String(peticion.headers.get("access-control-request-headers") || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{1,64}$/.test(s));
    h.set("Access-Control-Allow-Origin", origen);
    h.set("Access-Control-Allow-Methods", metodos.concat("OPTIONS").join(", "));
    h.set("Access-Control-Allow-Headers", [.../* @__PURE__ */ new Set([...CABECERAS_BASE, ...pedidas])].slice(0, 40).join(", "));
    h.set("Access-Control-Max-Age", "600");
  }
  return new Response(null, { status: 204, headers: h });
}
async function leerTexto(peticion, tope) {
  const declarado = Number(peticion.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > tope) return { ok: false, motivo: "demasiado_grande" };
  const cuerpo = peticion.body;
  if (cuerpo === null || cuerpo === void 0) return { ok: true, texto: "" };
  if (typeof cuerpo.getReader !== "function") {
    const t = await peticion.text();
    return new TextEncoder().encode(t).byteLength > tope ? { ok: false, motivo: "demasiado_grande" } : { ok: true, texto: t };
  }
  const lector = cuerpo.getReader();
  const partes = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > tope) {
        try {
          await lector.cancel();
        } catch (_) {
        }
        return { ok: false, motivo: "demasiado_grande" };
      }
      partes.push(value);
    }
  } catch (_) {
    return { ok: false, motivo: "ilegible" };
  }
  const todo = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    todo.set(p, o);
    o += p.byteLength;
  }
  return { ok: true, texto: new TextDecoder().decode(todo) };
}
var RE_IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
var RE_IPV6 = /^[0-9a-f:.]{2,45}$/i;
function esIp(t) {
  if (RE_IPV4.test(t)) return t.split(".").every((n) => Number(n) <= 255);
  return RE_IPV6.test(t) && (t.match(/:/g) || []).length >= 2;
}
function ipDeLaPeticion(peticion) {
  const candidatas = [peticion.headers.get("cf-connecting-ip"), String(peticion.headers.get("x-forwarded-for") || "").split(",")[0]];
  for (const c of candidatas) {
    const t = String(c || "").trim();
    if (esIp(t)) return t.toLowerCase();
  }
  return null;
}
function registrar(deps, funcion, nivel, evento, datos, secretos) {
  try {
    let linea2 = JSON.stringify({ funcion, evento, ...datos || {} });
    if (secretos && secretos.length) linea2 = ocultarSecretos(linea2, secretos);
    if (deps && typeof deps.registrar === "function") deps.registrar(nivel, linea2);
    else (nivel === "error" ? console.error : console.log)(linea2);
  } catch (_) {
  }
}
var textoDeError = (e) => String(e && e.message || e).slice(0, 300);
function crearLimitador({ ahora, maximo, ventanaMs }) {
  const cuentas = /* @__PURE__ */ new Map();
  let ventanaActual = null;
  return async (clave) => {
    const v = Math.floor(Number(ahora()) / ventanaMs);
    if (v !== ventanaActual) {
      cuentas.clear();
      ventanaActual = v;
    }
    const n = (cuentas.get(clave) || 0) + 1;
    cuentas.set(clave, n);
    return n <= maximo;
  };
}

// supabase/functions/agente/handler.js
var LIMITES = Object.freeze({
  maxCuerpo: 16 * 1024,
  maxTexto: 2e3,
  mensajesPorDia: 80,
  /* Las dos llamadas a la IA comparten el plazo, y la función se rinde antes de los 60 s del portal. */
  esperaMs: IA_ESPERA_CHAT_MS - 5e3,
  abrirPorMinuto: 10
});
var IA_AGENTE = Object.freeze([
  Object.freeze({ prov: "gemini", model: "gemini-3.6-flash" }),
  Object.freeze({ prov: "qwen", model: "qwen3.7-flash" }),
  Object.freeze({ prov: "deepseek", model: "deepseek-flash" })
]);
var SALUDO = "¡Hola! Soy el asistente de AL3D. Cuéntame qué tienes en mente —letras 3D, caja de luz, recorte, neón u otra cosa— y para qué negocio es.";
var TOKEN = /^[0-9a-f]{64}$/;
var hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
async function huella(token) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}
var falla = (codigo, mensaje2, extra) => sobreDeError(codigo, mensaje2, extra);
var sinRed = () => falla("SIN_RED", "No pude conectar con el sistema. Intenta de nuevo en un momento.", { transitorio: true });
async function rpc(deps, nombre, args) {
  try {
    const r = await deps.clienteBase.rpcServicio(nombre, args);
    if (r.error || !r.data || typeof r.data !== "object") return null;
    return r.data;
  } catch (_) {
    return null;
  }
}
async function preguntarIA(deps, llaves, instr, signal) {
  for (const { prov, model } of IA_AGENTE) {
    if (signal.aborted) return null;
    const v = validarPeticion({ prov, model, modo: "chat", sistema: instr.sistema, pregunta: instr.pregunta, mensajes: instr.mensajes });
    if (!v.ok) continue;
    const e = elegirProveedor({ prov, llaves });
    if (!e.ok) continue;
    const r = await consultarIA({ peticion: v.peticion, llaves: e.llaves, fetch: deps.fetch, signal });
    const o = r.ok ? leerJson(r.texto) : null;
    if (o) return o;
  }
  return null;
}
var claveDe = (d) => d && d.id ? d.id + ":" + (d.i ?? "") : "";
var mismasRazones = (a, b) => JSON.stringify((a || []).map(claveDe).sort()) === JSON.stringify((b || []).map(claveDe).sort());
async function abrir(peticion, deps, limitador) {
  if (!await limitador(ipDeLaPeticion(peticion) || "sin-ip")) {
    return falla("CUPO_AGOTADO", "Demasiadas conversaciones nuevas desde aquí. Prueba en un minuto.", { transitorio: true });
  }
  const bytes = new Uint8Array(32);
  (deps.aleatorio || ((a2) => crypto.getRandomValues(a2)))(bytes);
  const token = hex(bytes);
  const h = await huella(token);
  const empresa = deps.entorno("AGENTE_EMPRESA") || "al3d";
  const a = await rpc(deps, "agente_abrir", { p_empresa: empresa, p_token_hash: h, p_canal: "portal", p_contacto: {} });
  if (!a) return sinRed();
  if (!a.ok) return a;
  const g = await rpc(deps, "agente_guardar", { p_token_hash: h, p_texto_cliente: "", p_texto_agente: SALUDO, p_ficha: {}, p_cotizacion: null, p_razones: [], p_resumen: "" });
  if (!g) return sinRed();
  return { ok: true, token, respuesta: SALUDO };
}
async function mensaje(cuerpo, deps) {
  const token = String(cuerpo.token || "");
  const texto2 = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  if (!TOKEN.test(token)) return falla("DATO_INVALIDO", "Este link no es válido.");
  if (!texto2 || texto2.length > LIMITES.maxTexto) return falla("DATO_INVALIDO", "Escribe tu mensaje (hasta " + LIMITES.maxTexto + " letras).");
  const h = await huella(token);
  const c = await rpc(deps, "agente_leer", { p_token_hash: h });
  if (!c) return sinRed();
  if (!c.ok) return c;
  if (c.mensajes_cliente_24h >= LIMITES.mensajesPorDia) {
    return falla("CUPO_AGOTADO", "Por hoy ya no puedo contestar más en esta conversación. Mañana seguimos, o escríbenos por WhatsApp.");
  }
  const llaves = leerLlavesIA(deps.entorno);
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), LIMITES.esperaMs);
  try {
    const ext = await preguntarIA(deps, llaves, instruccionExtraer(c.ficha, c.mensajes, texto2), ctrl.signal);
    const ficha = aplicarCambios(c.ficha, ext);
    let estado = estadoDe(ficha);
    let razones = estado.decisiones;
    const d = razones.length ? (c.decisiones || []).find((x) => x && x.estado !== "pendiente" && mismasRazones(x.razones, razones)) : null;
    if (d) {
      razones = [];
      if (d.estado === "descartada") {
        estado = { ...estado, decisiones: [], cotizacion: null, siguiente: "descartada" };
      } else if (d.precio !== null && d.precio !== void 0) {
        estado = { ...estado, decisiones: [], siguiente: "cerrar", cotizacion: { total: Number(d.precio), iva: ficha.factura === true, de: "direccion" } };
      }
    }
    const cuenta = deps.entorno("AGENTE_CUENTA") || "";
    if (ficha.acepta === true && estado.cotizacion && !cuenta) {
      razones = [...razones, { id: "cuenta", razon: "El cliente aceptó la cotización y no hay cuenta de depósito configurada (AGENTE_CUENTA)." }];
    }
    const r = await preguntarIA(deps, llaves, instruccionResponder(ficha, estado, c.mensajes, texto2, d || c.decision), ctrl.signal);
    const respuesta = armarRespuesta(r && typeof r.respuesta === "string" ? r.respuesta : "", estado, ficha, cuenta);
    const g = await rpc(deps, "agente_guardar", {
      p_token_hash: h,
      p_texto_cliente: texto2,
      p_texto_agente: respuesta,
      p_ficha: ficha,
      p_cotizacion: estado.cotizacion,
      p_razones: razones,
      p_resumen: resumenParaDireccion(ficha)
    });
    if (!g) return sinRed();
    if (!g.ok) return g;
    return { ok: true, respuesta, estado: g.estado, cotizacion: estado.cotizacion ? { total: estado.cotizacion.total, iva: estado.cotizacion.iva } : null };
  } finally {
    clearTimeout(reloj);
  }
}
async function leer2(cuerpo, deps) {
  const token = String(cuerpo.token || "");
  if (!TOKEN.test(token)) return falla("DATO_INVALIDO", "Este link no es válido.");
  const c = await rpc(deps, "agente_leer", { p_token_hash: await huella(token) });
  if (!c) return sinRed();
  if (!c.ok) return c;
  return { ok: true, estado: c.estado, mensajes: c.mensajes, cotizacion: c.cotizacion };
}
function crearManejador(depsFijas) {
  const limitador = crearLimitador({ ahora: depsFijas.ahora, maximo: LIMITES.abrirPorMinuto, ventanaMs: 6e4 });
  return (peticion) => manejar(peticion, depsFijas, limitador);
}
async function manejar(peticion, deps, limitador) {
  const lim = limitador || crearLimitador({ ahora: deps.ahora, maximo: LIMITES.abrirPorMinuto, ventanaMs: 6e4 });
  const antes = previa(peticion, { metodos: ["POST"] });
  if (antes) return antes;
  const secretos = secretosDelEntorno(deps.entorno);
  const responder = (cuerpo) => json(peticion, 200, cuerpo, { secretos });
  try {
    const t = await leerTexto(peticion, LIMITES.maxCuerpo);
    if (!t.ok) return responder(falla("DATO_INVALIDO", "El mensaje es demasiado grande."));
    let cuerpo;
    try {
      cuerpo = JSON.parse(t.texto);
    } catch (_) {
      return responder(falla("DATO_INVALIDO", "El cuerpo no es JSON."));
    }
    if (!cuerpo || typeof cuerpo !== "object") return responder(falla("DATO_INVALIDO", "El cuerpo no es JSON."));
    if (cuerpo.accion === "abrir") return responder(await abrir(peticion, deps, lim));
    if (cuerpo.accion === "mensaje") return responder(await mensaje(cuerpo, deps));
    if (cuerpo.accion === "leer") return responder(await leer2(cuerpo, deps));
    return responder(falla("DATO_INVALIDO", "Acción desconocida."));
  } catch (e) {
    if (esErrorDeEntorno(e)) return json(peticion, 503, falla("CONFIGURACION", e.message), { secretos });
    registrar(deps, "agente", "error", "inesperado", { error: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}

// supabase/functions/agente/index.ts
var entorno = (nombre) => Deno.env.get(nombre);
var fetchPlataforma = (...a) => fetch(...a);
var clienteBase = crearClienteBase({ createClient, entorno, fetch: fetchPlataforma });
Deno.serve(crearManejador({
  fetch: fetchPlataforma,
  ahora: () => Date.now(),
  entorno,
  clienteBase
}));
