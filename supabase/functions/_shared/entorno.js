/* ============================================================================
   ENTORNO — de dónde saca cada función lo que necesita, y qué dice cuando falta.

   Todo lo que las funciones saben del mundo (la dirección del proyecto, las llaves, los secretos
   propios) llega por variables de entorno: en Supabase, los secretos de las funciones. Este
   módulo es el ÚNICO que sabe cómo se llaman y qué forma tienen, y por eso lo demás no lee
   `Deno.env` por su cuenta: recibe un «lector» (`entorno`), una función nombre → texto. En
   producción es `nombre => Deno.env.get(nombre)` (lo pone cada index.ts); en las pruebas, un
   objeto de mentiras. No toca Deno ni Node, así que corre igual en los dos.

   LOS NOMBRES, verificados el 2026-10-10 en la documentación oficial
   (supabase.com/docs/guides/functions/secrets y /docs/guides/api/api-keys):

     Los inyecta la plataforma en cada función (no se cargan a mano):
       SUPABASE_URL                 la dirección del proyecto
       SUPABASE_PUBLISHABLE_KEYS    JSON con las llaves públicas nuevas: {"default":"sb_publishable_…"}
       SUPABASE_SECRET_KEYS         JSON con las llaves secretas nuevas: {"default":"sb_secret_…"}
       SUPABASE_ANON_KEY            la llave pública ANTIGUA (un JWT). Se acepta de respaldo
       SUPABASE_SERVICE_ROLE_KEY    la llave secreta ANTIGUA (un JWT). Se acepta de respaldo
     Los carga Elías (`supabase secrets set` o el panel; un secreto propio no puede empezar con
     «SUPABASE_», esa familia es de la plataforma):
       SELLO_AUTORIZACION           la clave con la que se firman los PDF. NO se rota nunca
       IA_KEYS                      JSON {"qwen":[…],"deepseek":[…],"gemini":[…]}, como la propiedad
                                    del Apps Script

   Las llaves nuevas (sb_publishable_ / sb_secret_) NO son JWT. Por eso ninguna función puede
   confiar en que la plataforma verifique a quien llama (config.toml pone verify_jwt = false en
   todas): lo hace auth.js en código, con el JWT de la persona.
   Cuando están las nuevas Y las antiguas, mandan las nuevas: son las que la plataforma
   recomienda, y las antiguas se retiran a fines de 2026.

   LO QUE NUNCA HACE ESTE MÓDULO: decir el VALOR de una variable. Un error nombra la variable que
   falta o que no tiene la forma esperada, y nada más. (Ojo con JSON.parse: el mensaje de V8 cita
   un pedazo del texto que no pudo leer, y si el texto es IA_KEYS ese pedazo es una llave. Por eso
   el mensaje de la excepción de JSON.parse no se reenvía JAMÁS.)
   ============================================================================ */

import { claveUsable } from './sello.js';
import { IA_PROVS } from './ia.js';

export const VARIABLES = Object.freeze({
  url: 'SUPABASE_URL',
  publicas: 'SUPABASE_PUBLISHABLE_KEYS',
  secretas: 'SUPABASE_SECRET_KEYS',
  anon: 'SUPABASE_ANON_KEY',
  serviceRole: 'SUPABASE_SERVICE_ROLE_KEY',
  sello: 'SELLO_AUTORIZACION',
  ia: 'IA_KEYS',
});

/* Una variable que falta o que no sirve. `variables` son NOMBRES, nunca valores: es lo único que
   quien lea el registro o la respuesta necesita para saber qué cargar. */
export class ErrorDeEntorno extends Error {
  constructor(codigo, variables, mensaje) {
    super(mensaje);
    this.name = 'ErrorDeEntorno';
    this.codigo = codigo;                      // 'FALTA' | 'INVALIDA'
    this.variables = Object.freeze([...variables]);
  }
}

/* Por el nombre y no por instanceof: sigue valiendo si el módulo llegara cargado dos veces. */
export const esErrorDeEntorno = e => !!e && e.name === 'ErrorDeEntorno';

function exigirLector(entorno) {
  if (typeof entorno !== 'function') {
    throw new TypeError('El lector del entorno tiene que ser una función nombre → valor (en Deno: n => Deno.env.get(n)).');
  }
}

/* Lo que hay en una variable, o undefined si no está o está vacía. Deno.env.get devuelve
   undefined cuando no existe, y una variable cargada con valor vacío es lo mismo que no cargada. */
function leer(entorno, nombre) {
  exigirLector(entorno);
  const v = entorno(nombre);
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/* Una llave suelta: las de Supabase (sb_…) y los JWT antiguos son de letras, números y . _ - ~ + / = */
const RE_LLAVE_SUELTA = /^[A-Za-z0-9._~+\/=-]+$/;

/* Lo que vale una variable de «llaves con nombre» (SUPABASE_PUBLISHABLE_KEYS y SUPABASE_SECRET_KEYS):
   el valor de la llave llamada «default» o, si no hay, la primera. Acepta también una llave suelta,
   sin JSON (una pegada a mano en un .env local). null si no hay ninguna. Lo que no es ni lo uno ni lo
   otro es un error, y su mensaje no cita el texto. */
function llaveDe(entorno, nombre) {
  const crudo = leer(entorno, nombre);
  if (crudo === undefined) return null;
  const t = crudo.trim();
  if (!t.startsWith('{')) {
    if (RE_LLAVE_SUELTA.test(t)) return t;
    throw new ErrorDeEntorno('INVALIDA', [nombre], 'La variable ' + nombre + ' tiene que ser un JSON {"default":"…"} o una llave suelta.');
  }
  let m;
  try { m = JSON.parse(t); }
  catch (_) { throw new ErrorDeEntorno('INVALIDA', [nombre], 'La variable ' + nombre + ' no es un JSON válido (se espera {"default":"…"}).'); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    throw new ErrorDeEntorno('INVALIDA', [nombre], 'La variable ' + nombre + ' tiene que ser un objeto JSON {"default":"…"}.');
  }
  const validas = Object.entries(m).filter(([, v]) => typeof v === 'string' && RE_LLAVE_SUELTA.test(v.trim()));
  if (!validas.length) return null;
  const buena = validas.find(([k]) => k === 'default') || validas[0];
  return buena[1].trim();
}

/* Todas las llaves que trae una variable de «llaves con nombre», para esconderlas. Nunca lanza. Aquí
   no importa la forma: lo que haya en la variable y parezca una llave se esconde. */
function todasLasLlavesDe(entorno, nombre) {
  try {
    const crudo = leer(entorno, nombre);
    if (crudo === undefined) return [];
    const t = crudo.trim();
    if (!t.startsWith('{')) return [t];
    const m = JSON.parse(t);
    return m && typeof m === 'object' ? Object.values(m).filter(v => typeof v === 'string') : [];
  } catch (_) { return []; }
}

/* SUPABASE_URL: lo que hay, ya limpio y sin la barra final; o el nombre de la variable si falta. */
function direccion(entorno) {
  const v = leer(entorno, VARIABLES.url);
  if (v === undefined) return { falta: VARIABLES.url };
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('esquema');
    return { url: u.href.replace(/\/+$/, '') };
  } catch (_) {
    throw new ErrorDeEntorno('INVALIDA', [VARIABLES.url], 'La variable ' + VARIABLES.url + ' no es una dirección http(s) válida.');
  }
}

function leerSupabase(entorno, { nueva, antigua }) {
  const d = direccion(entorno);
  let llave = llaveDe(entorno, nueva), fuente = nueva;
  if (llave === null) {
    const vieja = leer(entorno, antigua);
    if (vieja !== undefined && RE_LLAVE_SUELTA.test(vieja.trim())) { llave = vieja.trim(); fuente = antigua; }
  }
  const faltan = [];
  if (d.falta) faltan.push(d.falta);
  if (llave === null) faltan.push(nueva);
  if (faltan.length) {
    throw new ErrorDeEntorno('FALTA', faltan,
      'Falta configurar: ' + faltan.map(n => (n === nueva ? n + ' (o la antigua ' + antigua + ')' : n)).join(', ') + '.');
  }
  return { url: d.url, llave, fuente };
}

/* Lo que hace falta para hablar con Supabase en nombre de una PERSONA (su JWT va aparte): la
   dirección y la llave pública. Devuelve { url, llave, fuente }, y `fuente` dice de cuál variable
   salió la llave. */
export function leerSupabasePublico(entorno) {
  return leerSupabase(entorno, { nueva: VARIABLES.publicas, antigua: VARIABLES.anon });
}

/* Lo que hace falta para hablar con Supabase como la FUNCIÓN (rol service_role, salta RLS): la
   dirección y la llave secreta. Solo la usan las funciones, nunca sale en una respuesta. */
export function leerSupabaseServicio(entorno) {
  return leerSupabase(entorno, { nueva: VARIABLES.secretas, antigua: VARIABLES.serviceRole });
}

/* La clave del sello: SELLO_AUTORIZACION, tal cual (sello.js no la recorta ni la normaliza: se usa
   byte a byte, con sus espacios). Sin ella no se firma ni se verifica, y NUNCA se inventa una. */
export function leerSelloClave(entorno) {
  exigirLector(entorno);
  const v = entorno(VARIABLES.sello);
  if (!claveUsable(v)) {
    throw new ErrorDeEntorno('FALTA', [VARIABLES.sello], 'Falta configurar ' + VARIABLES.sello + ' (la clave con la que se firman los PDF).');
  }
  return v;
}

/* Las llaves de IA de cada proveedor: IA_KEYS es un JSON {"qwen":[…],"deepseek":[…],"gemini":[…]}.
   Un proveedor que no esté, o cuyo valor no sea una lista, queda sin llaves (la función contesta
   SIN_LLAVE de ése, como el .gs). Que la VARIABLE falte o no sea JSON es otra cosa: es un error de
   configuración, y se dice con su nombre. Aquí no se filtra por largo: eso lo decide ia.js. */
export function leerLlavesIA(entorno) {
  const crudo = leer(entorno, VARIABLES.ia);
  if (crudo === undefined) {
    throw new ErrorDeEntorno('FALTA', [VARIABLES.ia],
      'Falta configurar ' + VARIABLES.ia + ' (un JSON con las llaves de IA: {"qwen":[…],"deepseek":[…],"gemini":[…]}).');
  }
  let m;
  try { m = JSON.parse(crudo); }
  catch (_) { throw new ErrorDeEntorno('INVALIDA', [VARIABLES.ia], 'La variable ' + VARIABLES.ia + ' no es un JSON válido.'); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    throw new ErrorDeEntorno('INVALIDA', [VARIABLES.ia], 'La variable ' + VARIABLES.ia + ' tiene que ser un objeto JSON con una lista de llaves por proveedor.');
  }
  const llaves = {};
  for (const p of IA_PROVS) llaves[p] = Array.isArray(m[p]) ? m[p].filter(k => typeof k === 'string') : [];
  return llaves;
}

/* TODO lo que no puede salir en una respuesta ni en el registro: la clave del sello, cada llave de
   IA y las llaves secretas de Supabase (las nuevas y las antiguas). Las públicas no: son públicas.
   Es la lista con la que http.js esconde lo que se le escape a cualquier ruta del código, y nunca
   lanza: si una variable está mal, simplemente no aporta. Lo de menos de ocho caracteres no es una
   llave, y esconderlo borraría palabras de verdad. */
export function secretosDelEntorno(entorno) {
  const todos = new Set();
  const agrega = x => { if (typeof x === 'string' && x.length >= 8) todos.add(x); };
  try {
    const sello = entorno(VARIABLES.sello);
    if (claveUsable(sello)) agrega(sello);
  } catch (_) { /* un lector roto no puede romper el escondido */ }
  try {
    const crudo = leer(entorno, VARIABLES.ia);
    if (crudo !== undefined) {
      const m = JSON.parse(crudo);
      if (m && typeof m === 'object') for (const v of Object.values(m)) if (Array.isArray(v)) v.forEach(agrega);
    }
  } catch (_) { /* IA_KEYS mal formada: sin llaves que esconder, y el error ya se dijo por su nombre */ }
  todasLasLlavesDe(entorno, VARIABLES.secretas).forEach(agrega);
  try { const v = leer(entorno, VARIABLES.serviceRole); if (v !== undefined) agrega(v.trim()); } catch (_) { /* idem */ }
  return [...todos];
}
