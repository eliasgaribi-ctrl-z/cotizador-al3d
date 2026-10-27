// @ts-nocheck
// ============================================================================
// LA FUNCIÓN `pantalla` EN UN SOLO ARCHIVO, para pegarla entera en el editor del panel de Supabase.
// GENERADO por supabase/functions/pantalla/desplegar/armar.mjs con esbuild 0.24.2. NO SE EDITA A MANO:
// se cambian las fuentes y se vuelve a armar (node supabase/functions/pantalla/desplegar/armar.mjs).
// Cómo se despliega: supabase/README.md, «La pantalla del taller (pantalla)». No lleva secretos propios.
// Fuentes (huella sha256 de 16 caracteres, con saltos LF); pruebas/supabase-pantalla.mjs falla si una cambió:
//   d8b415f4d8dcf1ed  js/datos/catalogo-precios.js
//   f4d76f28e34f9a66  js/datos/cotizador.js
//   2dd6625d9ef82214  js/datos/db.js
//   5e57c990f1be0624  js/datos/entrega.js
//   121a081376026fad  js/datos/geo.js
//   71dc554fabaf8870  js/datos/prefs.js
//   9fca655dea24dff6  js/datos/proyectos.js
//   3726e8a5b940e62f  js/datos/taller.js
//   a80af2424caeef7c  js/nucleo/fechas.js
//   182f2f140a2e13d6  js/nucleo/ui.js
//   da8d7ea3e1d49150  supabase/functions/_shared/cliente.js
//   2a71c519bbc0ec5f  supabase/functions/_shared/entorno.js
//   13245dbb0ee89b72  supabase/functions/_shared/http.js
//   21bde10737f49fe4  supabase/functions/_shared/ia.js
//   02ed914bbd6ab1de  supabase/functions/_shared/sello.js
//   2c6f2e9c03cb72f2  supabase/functions/pantalla/handler.js
//   f1aac3246e8e7347  supabase/functions/pantalla/index.ts
// ============================================================================
// supabase/functions/pantalla/index.ts
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
var IA_MODELOS = Object.freeze({
  qwen: Object.freeze(["qwen3.7-flash", "qwen3.6-flash"]),
  deepseek: Object.freeze(["deepseek-flash"]),
  gemini: Object.freeze(["gemini-3.1-flash-lite", "gemini-3.6-flash"])
});
var IA_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
var IA_MAX_CUERPO = 15 * 1024 * 1024;

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
  constructor(codigo, variables, mensaje) {
    super(mensaje);
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
function secretosDelEntorno(entorno2) {
  const todos = /* @__PURE__ */ new Set();
  const agrega = (x) => {
    if (typeof x === "string" && x.length >= 8) todos.add(x);
  };
  try {
    const sello2 = entorno2(VARIABLES.sello);
    if (claveUsable(sello2)) agrega(sello2);
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
function sobreDeError(codigo, mensaje, extra) {
  return { ok: false, codigo, mensaje, definitivo: DEFINITIVOS.has(codigo), ...extra || {} };
}
var errorInterno = () => ({ ok: false, codigo: "DESCONOCIDO", mensaje: "El puente falló procesando eso." });
function ocultarSecretos(texto, secretos) {
  let t = String(texto);
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
  let texto = JSON.stringify(cuerpo);
  if (o.secretos && o.secretos.length) texto = ocultarSecretos(texto, o.secretos);
  return new Response(texto, { status, headers: cabeceras(peticion, o.cabeceras) });
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
    let linea = JSON.stringify({ funcion, evento, ...datos || {} });
    if (secretos && secretos.length) linea = ocultarSecretos(linea, secretos);
    if (deps && typeof deps.registrar === "function") deps.registrar(nivel, linea);
    else (nivel === "error" ? console.error : console.log)(linea);
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

// js/nucleo/fechas.js
var p2 = (n) => String(n).padStart(2, "0");
var MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
var partesISO = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
};
var esISO = (iso) => !!partesISO(iso);
var hoyISO = () => {
  const d = /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
};
var bisiesto = (a) => a % 4 === 0 && a % 100 !== 0 || a % 400 === 0;
var diasDelMes = (a, m) => m === 2 ? bisiesto(a) ? 29 : 28 : [4, 6, 9, 11].includes(m) ? 30 : 31;
function masDias(iso, n) {
  const p = partesISO(iso);
  if (!p) return null;
  let { a, m, d } = p;
  d += Math.trunc(n || 0);
  while (d > diasDelMes(a, m)) {
    d -= diasDelMes(a, m);
    if (++m > 12) {
      m = 1;
      a++;
    }
  }
  while (d < 1) {
    if (--m < 1) {
      m = 12;
      a--;
    }
    d += diasDelMes(a, m);
  }
  return a + "-" + p2(m) + "-" + p2(d);
}
function diasEntre(desde, hasta) {
  const a = partesISO(desde), b = partesISO(hasta);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.a, b.m - 1, b.d) - Date.UTC(a.a, a.m - 1, a.d)) / 864e5);
}

// js/datos/prefs.js
var CLAVES = {
  DISP: "al3d_pf_disp",
  LETRA_FOLIO: "al3d_pf_letra_folio",
  ROL: "al3d_pf_rol",
  NOMBRE: "al3d_pf_nombre",
  GANADAS: "al3d_pf_ganadas",
  TILES: "al3d_pf_tiles",
  GCAL: "al3d_pf_gcal",
  PUENTE: "al3d_pf_puente",
  /* Entrar con Google: SOLO el correo con el que se entró y, si alguien está probando otro,
     el identificador de la app. El token de acceso NUNCA se guarda aquí — es una credencial
     y esta clave viaja en los respaldos. Ver js/nucleo/ingreso.js. */
  INGRESO: "al3d_pf_ingreso",
  ULT_EXPORT: "al3d_pf_ult_export",
  EMPRESA: "al3d_pf_empresa",
  /* La mitad del cotizador de un respaldo completo, esperando a que el cotizador la tome. La
     plataforma tiene prohibido escribir las claves del cotizador (§4.1); esto es una clave
     SUYA que el cotizador lee, ofrece con un botón y borra al restaurar. */
  RESTAURAR: "al3d_pf_restaurar",
  /* «Ya probé que la key del asistente sirve»: la escribe js/nucleo/asistente.js para no
     volver a gastar una petición en comprobarla. Estaba escrita como literal allá; la lista
     de claves de la plataforma es ésta y no hay otra. */
  IA_OK: "al3d_pf_ia_ok",
  /* EL PASE. Lo que la hoja contestó la última vez que se preguntó quién es el que entró:
     {correo, rol, hasta}. Ver js/nucleo/puerta.js — el porqué de que exista está entero
     allá, y se resume en que el aparato tiene que abrir en una azotea sin señal. */
  PASE: "al3d_pf_pase",
  /* El día (AAAA-MM-DD, del aparato) en que alguien entró por última vez con el botón de
     Google. La sesión vale ese día y nada más: al día siguiente la puerta se vuelve a poner.
     Ver CIERRE_DIARIO en js/nucleo/puerta.js. */
  ENTRADA: "al3d_pf_entrada",
  /* La bolsa barajada de fondos que le faltan por salir a la puerta, y el último que salió.
     Adorno puro. */
  FONDO: "al3d_pf_fondo"
};
var CRUDAS = /* @__PURE__ */ new Set([
  CLAVES.DISP,
  CLAVES.LETRA_FOLIO,
  CLAVES.ROL,
  CLAVES.NOMBRE,
  CLAVES.TILES,
  CLAVES.ULT_EXPORT,
  CLAVES.EMPRESA,
  CLAVES.RESTAURAR
]);

// js/datos/catalogo-precios.js
var MATERIALES = [
  { key: "al-paint", label: "Aluminio Blanco/Negro/Pintado", precio: 30, ilum: "LED posterior (cálida/fría)" },
  { key: "al-brush", label: "Aluminio Brush Cepillado", precio: 35, ilum: "LED posterior (cálida/fría)" },
  { key: "acr-vol", label: "Acrílico + Aluminio (Volumen)", precio: 40, ilum: "LED fría frontal" },
  { key: "acr-vinil", label: "Acrílico + Vinil", precio: 45, ilum: "LED fría frontal" },
  { key: "acero", label: "Acero Inoxidable", precio: 55, ilum: "LED posterior (cálida/fría)" }
];
var COMPLEJIDAD = [
  { key: "recta", label: "Recta", extra: 0 },
  { key: "cursiva", label: "Cursiva", extra: 5 },
  { key: "compleja", label: "Compleja", extra: 10 }
];
var CAJAS = [
  { key: "std", label: "Estándar", tarifa: 3900, desc: "Cuadrada / rectangular / circular" },
  { key: "nube", label: "Tipo nube / silueta", tarifa: 4600, desc: "Silueta de logotipo o personaje" }
];
var RECORTES = [
  { key: "sencillo", label: "Sencillo", precio: 20 },
  { key: "vinil", label: "Rotulación de vinil", precio: 25 },
  { key: "sandwich", label: "Tipo sándwich c/iluminación", precio: 55 }
];
var RECORTE_COMP_EXTRA = 5;
var BASTIDORES = [
  { key: "lamina", label: "Lámina", tarifa: 950 },
  { key: "alucobond", label: "Alucobond", tarifa: 1500 }
];
var CAJAS_FABRICA = CAJAS.map((c) => ({ key: c.key, tarifa: c.tarifa }));
function aplicarGuardadas() {
  let t = null;
  try {
    t = JSON.parse(localStorage.getItem("al3d_tarifas") || "null");
  } catch (_) {
    return;
  }
  if (!t || !Array.isArray(t.filas)) return;
  const fab = { material: MATERIALES, complejidad: COMPLEJIDAD, recorte: RECORTES, bastidor: BASTIDORES, caja: CAJAS };
  const L = { material: [], complejidad: [], recorte: [], bastidor: [], caja: [] };
  let extra = RECORTE_COMP_EXTRA;
  for (const f of t.filas) {
    if (!f || typeof f !== "object" || !isFinite(Number(f.precio))) return;
    if (f.grupo === "recorte-extra") {
      if (f.clave === "sandwich") extra = Number(f.precio);
      continue;
    }
    const lista = fab[f.grupo];
    if (!lista) continue;
    const base = lista.find((e2) => e2.key === f.clave) || lista.find((e2) => e2.key === f.como);
    if (!base || L[f.grupo].some((e2) => e2.key === f.clave)) continue;
    const nom = String(f.nombre || "").replace(/[<>&"`]/g, "").trim().slice(0, 60);
    const e = Object.assign({}, base, { key: String(f.clave), label: nom || base.label });
    if (e.key !== base.key) e.como = base.key;
    if (f.visible === false) e.oculto = true;
    const p = Number(f.precio);
    if (f.grupo === "complejidad") e.extra = p;
    else if (f.grupo === "material" || f.grupo === "recorte") e.precio = p;
    else e.tarifa = p;
    L[f.grupo].push(e);
  }
  for (const g in fab) if (!fab[g].every((b) => L[g].some((e) => e.key === b.key))) return;
  for (const g in fab) fab[g].splice(0, fab[g].length, ...L[g]);
  RECORTE_COMP_EXTRA = extra;
}
if (typeof localStorage !== "undefined") aplicarGuardadas();

// js/datos/geo.js
var N = String.raw`-?\d{1,3}(?:\.\d+)?`;
var D = String.raw`-?\d{1,3}\.\d+`;
var REGLAS = [
  { re: new RegExp(`^\\+?(${D})\\s*,\\s*\\+?(${D})$`), orden: "latlng", fuente: "coordenadas", exacta: true },
  { re: new RegExp(`^geo:\\+?(${N})\\s*,\\s*\\+?(${N})`, "i"), orden: "latlng", fuente: "geo_uri", exacta: true },
  { re: new RegExp(`!3d(${N})!4d(${N})`), orden: "latlng", fuente: "maps_pin", exacta: true },
  { re: new RegExp(`[?&](?:q|query|center|ll|destination|origin|daddr|saddr)=(?:loc:)?[+\\s]*(${N})\\s*,\\s*\\+?(${N})`, "i"), orden: "latlng", fuente: "maps_query", exacta: true },
  { re: new RegExp(`/maps/search/(${N})\\s*,\\s*\\+?(${N})`), orden: "latlng", fuente: "maps_search", exacta: true },
  { re: new RegExp(`/maps/place/(${N})\\s*,\\s*\\+?(${N})`), orden: "latlng", fuente: "maps_place", exacta: true },
  { re: new RegExp(`@(${N}),(${N})(?:,(?:\\d+(?:\\.\\d+)?)[zmayht])?`), orden: "latlng", fuente: "maps_camara", exacta: false },
  { re: new RegExp(`!2d(${N})!3d(${N})`), orden: "lnglat", fuente: "maps_dir", exacta: false },
  { re: new RegExp(`!1d(${N})!2d(${N})`), orden: "lnglat", fuente: "maps_dir", exacta: false }
];
var TTL_GEO = 90 * 24 * 3600 * 1e3;
var cadena = Promise.resolve();

// js/nucleo/ui.js
var _CAPAS = [];
var _piezas = typeof window !== "undefined" ? window.Piezas : null;
if (_piezas && _piezas.hojasDeslizables) {
  _piezas.hojasDeslizables({
    hoja: ".pf-modal-bg.show>.pf-panel",
    cabeza: ".pf-panel-h",
    cuerpo: ".pf-panel-b",
    excluir: 'input,textarea,select,[contenteditable="true"],canvas,.leaflet-container',
    cierre: (velo) => {
      const c = _CAPAS.find((x) => x.id === velo.id);
      return c ? c.cerrar : null;
    }
  });
}
if (_piezas && _piezas.desenfoqueProgresivo) _piezas.desenfoqueProgresivo(["#pf-abajo", "#pf-mbar"], { lado: "abajo" });

// js/datos/proyectos.js
var ETAPAS = [
  "ganado",
  "en_diseno",
  "cortado",
  "armado",
  "listo",
  "instalado",
  "garantia",
  "cancelado"
];
var ETAPA_NOMBRE = {
  ganado: "Ganado",
  en_diseno: "En diseño",
  cortado: "Cortado",
  armado: "Armado",
  listo: "Listo para instalar",
  instalado: "Instalado",
  garantia: "En garantía",
  cancelado: "No se dio"
};
var VIVAS = ETAPAS.filter((e) => e !== "cancelado");
var MS_REINTENTO_LINK = 10 * 60 * 1e3;
var _salidas = Promise.resolve();

// js/datos/taller.js
var PLAZOS = [
  { k: 1, semanas: 1, dias: 7, etiqueta: "1 semana", corto: "1" },
  { k: 2, semanas: 1.5, dias: 11, etiqueta: "1.5 semanas", corto: "1½" },
  { k: 3, semanas: 2, dias: 14, etiqueta: "2 semanas", corto: "2" },
  { k: 4, semanas: 2.5, dias: 18, etiqueta: "2.5 semanas", corto: "2½" },
  { k: 5, semanas: 3, dias: 21, etiqueta: "3 semanas o más", corto: "3+" }
];
var PLAZO_DEFECTO = 4;
function plazo(k) {
  const n = Number(k);
  return PLAZOS.find((p) => p.k === n) || PLAZOS.find((p) => p.k === PLAZO_DEFECTO);
}
var CUBO_POR_TIPO = {
  "Rotulacion de vinil": 1,
  "Recorte acrilico": 1,
  "Letras 3D sin iluminacion": 2,
  "Caja de luz sin iluminacion": 2,
  "Letras 3D con iluminacion": 3,
  "Caja de luz con iluminacion": 3,
  "Custome / Proyecto Especial": 4
};
var LARGO_LAMINA_CM = 244;
function ladoMayor(it) {
  if (!it || typeof it !== "object") return 0;
  const n = (x) => isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0;
  if (it.tipo === "letras" || it.tipo === "recorte") return n(it.altura);
  if (it.tipo === "caja" || it.tipo === "bastidor") return Math.max(n(it.ancho), n(it.alto));
  return 0;
}
function plazoSugerido(tipos, items, opts = {}) {
  const lista = Array.isArray(tipos) ? tipos : tipos ? [tipos] : [];
  const largoLamina = isFinite(Number(opts.largo_lamina_cm)) && Number(opts.largo_lamina_cm) > 0 ? Number(opts.largo_lamina_cm) : LARGO_LAMINA_CM;
  let base = 0, lento = "", reconocidos = 0;
  for (const t of lista) {
    const k2 = String(t || "").trim();
    if (CUBO_POR_TIPO[k2] === void 0) continue;
    reconocidos++;
    if (CUBO_POR_TIPO[k2] > base) {
      base = CUBO_POR_TIPO[k2];
      lento = k2;
    }
  }
  if (!reconocidos) {
    return { k: PLAZO_DEFECTO, razon: "Sin tipo de trabajo reconocido → " + plazo(PLAZO_DEFECTO).etiqueta + ", que es lo que se supone de lo que no se sabe qué es" };
  }
  let k = base;
  const partes = [lento + " (" + plazo(base).etiqueta + ")"];
  if (reconocidos > 1) {
    k += reconocidos - 1;
    partes.push("+" + (reconocidos - 1) + " cubo" + (reconocidos > 2 ? "s" : "") + ": hay " + reconocidos + " tipos de trabajo distintos");
  }
  const mayor = (Array.isArray(items) ? items : []).reduce((m, it) => Math.max(m, ladoMayor(it)), 0);
  if (mayor > largoLamina) {
    k += 1;
    partes.push("+1 cubo: la pieza mide " + Math.round(mayor) + " cm y la lámina " + largoLamina + ", hay junta");
  }
  k = Math.min(PLAZOS.length, k);
  return { k, razon: partes.join(" ") + " → " + plazo(k).etiqueta };
}
var CTS_TALLER = {
  PLAZO_COLCHON_DIAS: 1,
  // el anuncio tiene que estar listo la víspera de instalar
  PLAZO_PROVEEDOR_DIAS: 3
  // lo que tarda en llegar el material. Es el DIAS_GRAVE de agenda.js
};
var LIM_TALLER = { PLAZO_COLCHON_DIAS: [0, 7], PLAZO_PROVEEDOR_DIAS: [0, 30] };
function enteroSano(v, clave) {
  const n = Number(v);
  const [lo, hi] = LIM_TALLER[clave];
  if (!isFinite(n)) return CTS_TALLER[clave];
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}
var SIGUIENTE = { ganado: "en_diseno", en_diseno: "cortado", cortado: "armado", armado: "listo", listo: "instalado" };
var ORDEN = ETAPAS.reduce((m, e, i) => {
  m[e] = i;
  return m;
}, {});
function vacia(p, P, fuente, razon, estado2, texto) {
  return {
    proyecto_id: p && p.id || null,
    titulo: p && p.nombre || "",
    plazo_k: P.k,
    plazo_dias: P.dias,
    plazo_etiqueta: P.etiqueta,
    plazo_fuente: fuente,
    plazo_razon: razon,
    ancla: "ninguna",
    instalacion: null,
    entrega_estimada: null,
    empezar: null,
    material: null,
    comprar: null,
    listo: null,
    hitos: { en_diseno: null, cortado: null, armado: null, listo: null, instalado: null },
    etapa_real: p && p.etapa || "ganado",
    etapa_esperada: null,
    atraso_dias: 0,
    holgura_dias: 0,
    estado: estado2,
    texto
  };
}
var fmtCorta = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  return +m[3] + " " + MES_CORTO[+m[2] - 1];
};
var VERBO = { en_diseno: "ponerlo en diseño", cortado: "cortar", armado: "armar", listo: "dejarlo listo", instalado: "instalar" };
var PARTICIPIO = { en_diseno: "en diseño", cortado: "cortado", armado: "armado", listo: "listo", instalado: "instalado" };
function ventanaTaller(p, inst, opts = {}) {
  p = p || {};
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const cts = opts.cts || {};
  const colchon = enteroSano(cts.PLAZO_COLCHON_DIAS, "PLAZO_COLCHON_DIAS");
  const proveedor = enteroSano(cts.PLAZO_PROVEEDOR_DIAS, "PLAZO_PROVEEDOR_DIAS");
  const kElegido = Number.isInteger(Number(p.plazo_k)) && Number(p.plazo_k) >= 1 && Number(p.plazo_k) <= PLAZOS.length ? Number(p.plazo_k) : null;
  const sug = plazoSugerido(p.tipo_trabajo, p.origen && p.origen.items);
  const P = plazo(kElegido !== null ? kElegido : sug.k);
  const fuente = kElegido !== null ? "elegido" : "derivado";
  const razon = kElegido !== null ? "Elegido a mano" : sug.razon;
  if (p.etapa === "cancelado") return vacia(p, P, fuente, razon, "cancelado", "No se dio. No hay taller que planear.");
  const instViva = inst && esISO(inst.fecha) && inst.estado !== "cancelada" ? inst : null;
  let ancla, D2 = null, base;
  if (instViva) {
    ancla = "instalacion";
    D2 = instViva.fecha;
  } else if (esISO(p.fecha_ganado)) {
    ancla = "ganado";
    base = p.fecha_ganado;
  } else return vacia(p, P, fuente, razon, "sin_fecha", "Sin fecha de instalación y sin fecha de venta: no hay de dónde contar.");
  let empezar, listo, entregaEstimada = null;
  if (ancla === "instalacion") {
    empezar = masDias(D2, -P.dias);
    listo = masDias(D2, -colchon);
    if (listo < empezar) listo = empezar;
  } else {
    empezar = base;
    listo = masDias(base, Math.max(0, P.dias - colchon));
    entregaEstimada = masDias(base, P.dias);
  }
  const util = diasEntre(empezar, listo);
  const t1 = Math.round(util / 3), t2 = Math.round(util * 2 / 3);
  const hitos = {
    en_diseno: empezar,
    cortado: masDias(empezar, t1),
    armado: masDias(empezar, t2),
    listo,
    instalado: ancla === "instalacion" ? D2 : null
  };
  const comprar = masDias(hitos.cortado, -proveedor);
  const salida = {
    proyecto_id: p.id || null,
    titulo: p.nombre || "",
    plazo_k: P.k,
    plazo_dias: P.dias,
    plazo_etiqueta: P.etiqueta,
    plazo_fuente: fuente,
    plazo_razon: razon,
    ancla,
    instalacion: D2,
    entrega_estimada: entregaEstimada,
    empezar: hitos.en_diseno,
    material: hitos.cortado,
    comprar,
    listo: hitos.listo,
    hitos,
    etapa_real: p.etapa || "ganado",
    etapa_esperada: null,
    atraso_dias: 0,
    holgura_dias: 0,
    estado: "a_tiempo",
    texto: ""
  };
  if (p.etapa === "instalado" || p.etapa === "garantia" || instViva && instViva.estado === "hecha") {
    salida.estado = "hecho";
    salida.etapa_esperada = "instalado";
    salida.texto = "Ya se instaló.";
    return salida;
  }
  const esperada = hoy < hitos.en_diseno ? "ganado" : hoy >= hitos.listo ? "listo" : hoy < hitos.cortado ? "en_diseno" : hoy < hitos.armado ? "cortado" : "armado";
  salida.etapa_esperada = esperada;
  const sig = SIGUIENTE[p.etapa || "ganado"];
  const lim = sig ? hitos[sig] : null;
  const d = lim ? diasEntre(lim, hoy) : null;
  salida.atraso_dias = d !== null && d > 0 ? d : 0;
  salida.holgura_dias = d !== null && d <= 0 ? -d : 0;
  const noLlega = salida.atraso_dias > 0 && hoy > hitos.listo && (ORDEN[p.etapa] === void 0 || ORDEN[p.etapa] < ORDEN.listo);
  salida.estado = salida.atraso_dias > 0 ? noLlega ? "no_llega" : "tarde" : salida.holgura_dias === 0 ? "justo" : "a_tiempo";
  const sinFecha = ancla === "ganado" ? " No hay fecha de instalación; esto cuenta desde el día que se ganó." : "";
  if (salida.estado === "no_llega") {
    salida.texto = "Debía estar listo el " + fmtCorta(hitos.listo) + " y sigue " + (PARTICIPIO[p.etapa] || "sin empezar") + ". O se termina hoy, o hay que mover la fecha con el cliente." + sinFecha;
  } else if (salida.estado === "tarde") {
    salida.texto = "Va " + salida.atraso_dias + " día" + (salida.atraso_dias === 1 ? "" : "s") + " tarde: debía estar " + (PARTICIPIO[sig] || sig) + " desde el " + fmtCorta(lim) + "." + sinFecha;
  } else if (salida.estado === "justo") {
    salida.texto = "Hoy toca " + (VERBO[sig] || sig) + "." + sinFecha;
  } else {
    salida.texto = lim ? "Va a tiempo. Toca " + (VERBO[sig] || sig) + " el " + fmtCorta(lim) + "." + sinFecha : "Va a tiempo." + sinFecha;
  }
  return salida;
}
var ESTATUS_POR_COBRAR = Object.freeze(["FABRICACION", "REPARANDO", "COBRANDO"]);

// supabase/functions/pantalla/handler.js
var MAX_CUERPO = 2048;
var ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var ESTACIONES = ETAPAS.slice(0, ETAPAS.indexOf("listo") + 1);
var PESO = { no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4 };
var PROXIMAS_DIAS = 14;
var PROXIMAS_TOPE = 8;
var VIENEN = /* @__PURE__ */ new Set(["propuesta", "confirmada", "reagendada"]);
var EN_PRODUCCION = ["en_diseno", "cortado", "armado"];
var TOPE_PIEZAS = 8;
var BUCKET = "cotizacion-imagenes";
var FIRMA_SEGUNDOS = 3600;
var FIRMA_REUSO_MS = 45 * 60 * 1e3;
var ID_IMAGEN = /^[A-Za-z0-9_-]{1,64}$/;
var VENTANA_MS = 10 * 60 * 1e3;
function crearManejador() {
  let limPedir = null, limTablero = null;
  const firmadas = /* @__PURE__ */ new Map();
  return async function manejar2(peticion, deps) {
    const secretos = secretosDelEntorno(deps && deps.entorno);
    try {
      const previo = previa(peticion, { metodos: ["POST"] });
      if (previo) return previo;
      if (!limPedir) {
        limPedir = crearLimitador({ ahora: deps.ahora, maximo: 6, ventanaMs: VENTANA_MS });
        limTablero = crearLimitador({ ahora: deps.ahora, maximo: 240, ventanaMs: VENTANA_MS });
      }
      const t = await leerTexto(peticion, MAX_CUERPO);
      if (!t.ok) return json(peticion, 413, sobreDeError("DATO_INVALIDO", "La petición es demasiado grande.", { definitivo: true }), { secretos });
      let cuerpo;
      try {
        cuerpo = JSON.parse(t.texto || "{}");
      } catch (_) {
        cuerpo = null;
      }
      if (!cuerpo || typeof cuerpo !== "object") return json(peticion, 400, sobreDeError("DATO_INVALIDO", "Falta el cuerpo.", { definitivo: true }), { secretos });
      const ip = ipDeLaPeticion(peticion) || "sin-ip";
      if (cuerpo.accion === "pedir") {
        if (!await limPedir(ip)) return demasiadas(peticion, secretos);
        return await pedir(peticion, deps, secretos);
      }
      if (cuerpo.accion === "tablero") {
        if (!await limTablero(ip)) return demasiadas(peticion, secretos);
        return await tablero(peticion, deps, secretos, cuerpo.secreto, firmadas);
      }
      return json(peticion, 400, sobreDeError("DATO_INVALIDO", "No sé qué hacer con eso.", { definitivo: true }), { secretos });
    } catch (e) {
      const config = esErrorDeEntorno(e);
      registrar(deps, "pantalla", "error", config ? "entorno" : "inesperado", { detalle: textoDeError(e) }, secretos);
      if (config) return json(peticion, 503, sobreDeError("CONFIGURACION", "La función no está configurada por completo."), { secretos });
      return json(peticion, 500, errorInterno(), { secretos });
    }
  };
}
var demasiadas = (peticion, secretos) => json(
  peticion,
  429,
  sobreDeError("CUPO_AGOTADO", "Demasiadas peticiones desde aquí. Espera unos minutos.", { transitorio: true }),
  { secretos, cabeceras: { "Retry-After": "60" } }
);
var sinRed = (peticion, secretos) => json(peticion, 503, sobreDeError("SIN_RED", "La base no contestó.", { transitorio: true }), { secretos });
async function pedir(peticion, deps, secretos) {
  for (let intento = 0; intento < 4; intento++) {
    const secreto = base64url(azar(deps, 32));
    const codigo = codigoAlAzar(deps);
    const r = await deps.clienteBase.rpcServicio("pantalla_solicitar", { p_secreto_hash: await huella(secreto), p_codigo: codigo });
    if (r.error) {
      registrar(deps, "pantalla", "error", "solicitar", { detalle: String(r.error.code || "") + " " + String(r.error.message || "") }, secretos);
      return sinRed(peticion, secretos);
    }
    const d = r.data || {};
    if (d.ok) return json(peticion, 200, { ok: true, secreto, codigo: d.codigo, vence: d.vence }, { secretos });
    if (d.codigo !== "DUPLICADO") return json(peticion, d.codigo === "CUPO_AGOTADO" ? 429 : 400, d, { secretos });
  }
  return sinRed(peticion, secretos);
}
async function tablero(peticion, deps, secretos, secreto, firmadas) {
  if (typeof secreto !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(secreto)) {
    return json(peticion, 400, sobreDeError("DATO_INVALIDO", "Falta el secreto de la pantalla.", { definitivo: true }), { secretos });
  }
  const r = await deps.clienteBase.rpcServicio("pantalla_tablero", { p_secreto_hash: await huella(secreto) });
  if (r.error) {
    registrar(deps, "pantalla", "error", "tablero", { detalle: String(r.error.code || "") + " " + String(r.error.message || "") }, secretos);
    return sinRed(peticion, secretos);
  }
  const d = r.data || {};
  if (!d.ok) return json(peticion, 200, d, { secretos });
  if (d.estado === "pendiente") return json(peticion, 200, { ok: true, estado: "pendiente", codigo: d.codigo, vence: d.vence }, { secretos });
  if (d.estado !== "activa") return json(peticion, 200, { ok: true, estado: d.estado }, { secretos });
  const v = vista(d);
  await firmarPlanos(v.ordenes, deps, firmadas || /* @__PURE__ */ new Map(), secretos);
  return json(peticion, 200, v, { secretos });
}
async function firmarPlanos(ordenes, deps, firmadas, secretos) {
  const ahora = Number(deps.ahora());
  for (const o of ordenes) {
    const ruta = o.imagen_ruta;
    delete o.imagen_ruta;
    o.imagen = null;
    if (!ruta || typeof deps.firmar !== "function") continue;
    const guardada = firmadas.get(ruta);
    if (guardada && guardada.hasta > ahora) {
      o.imagen = guardada.url;
      continue;
    }
    let url = null;
    try {
      url = await deps.firmar(BUCKET, ruta, FIRMA_SEGUNDOS);
    } catch (e) {
      registrar(deps, "pantalla", "aviso", "firmar", { detalle: textoDeError(e) }, secretos);
    }
    if (typeof url === "string" && /^https:\/\//.test(url)) {
      firmadas.set(ruta, { url, hasta: ahora + FIRMA_REUSO_MS });
      o.imagen = url;
    }
  }
}
function vista(d) {
  const hoy = String(d.hoy || "");
  const cts = d.constantes || {};
  const obras = Array.isArray(d.obras) ? d.obras : [];
  const insts = (Array.isArray(d.instalaciones) ? d.instalaciones : []).slice().sort(ordenDia);
  const instDe = /* @__PURE__ */ new Map();
  for (const i of insts) if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
  const fichas = obras.map((o) => {
    const p = {
      id: o.id,
      nombre: o.nombre,
      etapa: o.etapa,
      tipo_trabajo: Array.isArray(o.tipo_trabajo) ? o.tipo_trabajo : [],
      fecha_ganado: o.fecha_ganado || null,
      plazo_k: o.plazo_k ?? null,
      origen: o.origen || null
    };
    const inst = instDe.get(o.id) || null;
    const v = ventanaTaller(p, inst, { hoy, cts });
    return {
      id: String(o.id),
      titulo: String(o.nombre || ""),
      negocio: String(o.negocio || ""),
      etapa: o.etapa,
      estado: v.estado,
      atraso_dias: v.atraso_dias || 0,
      texto: v.texto || "",
      instalacion: inst ? { fecha: inst.fecha, hora: inst.hora || null } : null
    };
  });
  const estaciones = ESTACIONES.map((etapa) => ({
    etapa,
    nombre: ETAPA_NOMBRE[etapa] || etapa,
    fichas: fichas.filter((f) => f.etapa === etapa).sort((a, b) => (PESO[a.estado] ?? 9) - (PESO[b.estado] ?? 9) || String(a.instalacion && a.instalacion.fecha || "9999").localeCompare(String(b.instalacion && b.instalacion.fecha || "9999")) || a.titulo.localeCompare(b.titulo, "es"))
  }));
  const porId = new Map(obras.map((o) => [o.id, o]));
  const limite = masDias2(hoy, PROXIMAS_DIAS);
  const proximas = insts.filter((i) => VIENEN.has(i.estado) && i.fecha >= hoy && i.fecha <= limite && porId.has(i.proyecto_id)).slice(0, PROXIMAS_TOPE).map((i) => ({
    fecha: i.fecha,
    hora: i.hora || null,
    ventana: i.ventana || "dia",
    confirmada: i.estado === "confirmada",
    titulo: String(porId.get(i.proyecto_id).nombre || ""),
    negocio: String(porId.get(i.proyecto_id).negocio || "")
  }));
  const ordenes = [];
  for (const e of estaciones) {
    if (!EN_PRODUCCION.includes(e.etapa)) continue;
    for (const f of e.fichas) {
      const o = porId.get(f.id) || {}, origen = o.origen && typeof o.origen === "object" ? o.origen : {};
      const items = (Array.isArray(origen.items) ? origen.items : []).filter((x) => x && typeof x === "object");
      if (!items.length) continue;
      const plano = items.map((x) => x.plano).find((x) => typeof x === "string" && ID_IMAGEN.test(x)) || (Array.isArray(origen.renders) ? origen.renders : []).find((x) => typeof x === "string" && ID_IMAGEN.test(x)) || null;
      ordenes.push({
        id: f.id,
        titulo: f.titulo,
        negocio: f.negocio,
        etapa: f.etapa,
        etapa_nombre: e.nombre,
        estado: f.estado,
        texto: f.texto,
        limite: String(origen.entrega || "").trim(),
        nota: String(origen.notaCliente || "").trim(),
        piezas: items.slice(0, TOPE_PIEZAS).map(pieza),
        mas_piezas: Math.max(0, items.length - TOPE_PIEZAS),
        imagen_ruta: plano && d.empresa && o.folio_global ? d.empresa + "/" + o.folio_global + "/" + plano + ".jpg" : null
      });
    }
  }
  return {
    ok: true,
    estado: "activa",
    nombre: String(d.nombre || ""),
    hoy,
    actualizado: d.actualizado || null,
    resumen: {
      obras: fichas.length,
      tarde: fichas.filter((f) => f.estado === "tarde" || f.estado === "no_llega").length,
      justo: fichas.filter((f) => f.estado === "justo").length
    },
    estaciones,
    proximas,
    ordenes
  };
}
var TITULO = { letras: "Letras Individuales 3D", recorte: "Recorte de Acrílico", bastidor: "Bastidor para Letras 3D", caja: "Caja de Luz" };
var cifra = (v) => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};
function pieza(it) {
  const tipo = it.tipo, detalle = [];
  if (tipo === "letras") detalle.push(it.luz ? "Con iluminación LED " + (it.ilumTipo === "calida" ? "cálida (3000K)" : "fría (6500K)") : "Sin iluminación");
  if (tipo === "caja") detalle.push("Caras en acrílico con iluminación LED fría");
  if (typeof it.desc === "string" && it.desc.trim()) detalle.push(it.desc.trim());
  const op = it.opciones;
  if (op && typeof op === "object" && Array.isArray(op.lista) && op.lista.length >= 2) detalle.push("Ojo: el cliente aún no elige entre " + op.lista.length + " opciones");
  const medidas = tipo === "letras" ? cifra(it.altura) + "cm alt." : tipo === "recorte" ? cifra(it.altura) + "cm × pieza" : tipo === "bastidor" || tipo === "caja" ? cifra(it.ancho) + "×" + cifra(it.alto) + " cm" : "—";
  const piezas = tipo === "letras" || tipo === "recorte" ? cifra(it.n || 0) : tipo === "bastidor" || tipo === "caja" ? 1 : cifra(it.pz || 1);
  return { titulo: TITULO[tipo] || detalle.shift() || "—", detalle: detalle.join(". "), medidas, piezas };
}
function ordenDia(a, b) {
  return String(a.fecha || "").localeCompare(String(b.fecha || "")) || (a.hora ? 0 : 1) - (b.hora ? 0 : 1) || String(a.hora || "").localeCompare(String(b.hora || ""));
}
function masDias2(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return f.toISOString().slice(0, 10);
}
function azar(deps, n) {
  if (deps && typeof deps.azar === "function") return deps.azar(n);
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}
function codigoAlAzar(deps) {
  let codigo = "";
  const tope = 256 - 256 % ALFABETO.length;
  while (codigo.length < 6) {
    for (const b of azar(deps, 12)) {
      if (b < tope && codigo.length < 6) codigo += ALFABETO[b % ALFABETO.length];
    }
  }
  return codigo;
}
function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function huella(texto) {
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
var manejar = crearManejador();

// supabase/functions/pantalla/index.ts
var entorno = (nombre) => Deno.env.get(nombre);
var fetchPlataforma = (...a) => fetch(...a);
var clienteBase = crearClienteBase({ createClient, entorno, fetch: fetchPlataforma });
var almacen = null;
async function firmar(bucket, ruta, segundos) {
  if (!almacen) {
    const c = leerSupabaseServicio(entorno);
    almacen = createClient(c.url, c.llave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  const r = await almacen.storage.from(bucket).createSignedUrl(ruta, segundos);
  return r.error || !r.data ? null : r.data.signedUrl;
}
Deno.serve((peticion) => manejar(peticion, {
  ahora: () => Date.now(),
  entorno,
  clienteBase,
  firmar
}));
