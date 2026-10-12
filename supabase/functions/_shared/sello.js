/* ============================================================================
   EL SELLO DE AUTORIZACIÓN — la firma de los PDF de AL3D, portada del Apps Script.

   Qué es. Cada cotización autorizada sale con un QR y un código de doce caracteres
   (XXXX-XXXX-XXXX): los primeros doce hexadecimales de un HMAC-SHA256 que hoy calcula
   puente/hoja-apps-script.gs (cotHuella, dinero2, itemsAuthCanon, itemsAuthDeCanon, canonDe,
   aHex, firmar, codigoDe y normalizarCodigo) y que /verificar vuelve a calcular desde el renglón
   guardado. Este archivo es ese algoritmo, reescrito con WebCrypto, para que las funciones de
   Supabase firmen y comprueben EXACTAMENTE lo que firma y comprueba la hoja. Un PDF ya impreso no
   se reimprime: si cambia un solo byte del texto que se firma, todos los que hay en la calle pasan
   a decir «No auténtica» (peligro P-02 del crítico; «mapa 04» es el informe de autorizaciones y
   sello de la revisión previa a la migración, del que salen los vectores de las pruebas).

   Por qué JavaScript y no SQL. La firma depende de Math.round (mitad hacia +∞), toFixed,
   String(número), sort() por unidades UTF-16 y JSON.stringify. En plpgsql ninguna de las cinco da
   lo mismo bit a bit (round(float8) redondea normalmente mitad-par y round(numeric) mitad lejos de
   cero; el texto de un float8 es otro; el orden de ORDER BY depende de la colación). Por eso
   /autorizar y /verificar corren en una Edge Function con este único módulo, y Postgres solo guarda
   texto y números (mapa 04 §1.7, C-27).

   Dónde corre. Escrito para Deno (Edge Functions) y para Node 24 sin cambiar una línea: solo
   WebCrypto, TextEncoder e Intl; nada de process, Buffer, require ni node:. Se probó en Node 24;
   en Deno NO se ha corrido (no había uno a la mano). Y nada de leer el entorno ni la red desde
   aquí: la CLAVE llega siempre como parámetro (quien llama la saca de sus secretos).

   Qué se firma (el orden es parte del algoritmo; cambiar uno invalida todos los PDF):
       v1 (sin renglones):  'AL3D-AUTH-v1' + JSON.stringify([ folio, huella, subCalc, precioAuth,
                            itemsAuth, total, proyecto, correo, ts ])                    // 9 campos
       v2 (con renglones):  'AL3D-AUTH-v2' + JSON.stringify([ …los mismos nueve…, renglones ])
   El prefijo va PEGADO al «[», sin separador. Los tres importes se firman como TEXTO con dos
   decimales (dinero2). Las demás cosas se firman TAL COMO están guardadas: por eso en Postgres
   ts, huella, itemsAuth y renglones tienen que ser `text` verbatim y nunca timestamptz, jsonb ni
   numeric (mapa 04 R2): un «2026-10-01T04:30:15.123Z» que vuelva como «2026-10-01 04:30:15.123+00»
   es otro texto y otra firma. registroDeFila() se niega a firmar o verificar lo que no es texto.

   ----------------------------------------------------------------------------------------------
   LA CODIFICACIÓN — un hecho comprobado en Apps Script real. Léelo antes de tocar nada.

   Utilities.computeHmacSha256Signature(texto, clave) recibe dos String y la documentación de
   Apps Script no dice con qué codificación los vuelve bytes. NO es UTF-8. Se comprobó el
   2026-10-10 ejecutándola en un proyecto real de Apps Script, con claves FALSAS: convierte el
   texto Y la clave a bytes como US-ASCII y pone un «?» por cada punto de código que no sea ASCII
   (un emoji es UN solo «?», no dos). Los caracteres ASCII, incluido U+0000, pasan tal cual. Y sus
   bytes vienen CON SIGNO (−128..127): aHex() los sube con (b + 256) % 256 como hace el .gs, y con
   los 0..255 de WebCrypto da lo mismo.
   Los doce HMAC que devolvió están en pruebas/datos/hmac-apps-script-real.json, y el bloque 5 de
   pruebas/supabase-sello.mjs exige que este módulo los reproduzca al byte: con 'ascii-?' coinciden
   los doce, y con 'utf-8' fallan los nueve que traen algo no ASCII (en el texto o en la clave).

   Y el .gs la llama exactamente así. firmar() de puente/hoja-apps-script.gs (~líneas 3666-3668) es
   aHex(Utilities.computeHmacSha256Signature(canonDe(r), secreto)): dos String, sin bytes ni tercer
   argumento, y es la ÚNICA llamada a esa función en todo el archivo (la hace autorizar al sellar y
   rutaVerificar_ al comprobar). Así que casi todo sello v2 ya impreso —el renglón por omisión lleva
   «·» y «×», y casi toda descripción lleva acentos— se firmó con ASCII-?, no con UTF-8. Solo el
   texto todo ASCII (los v1, por ejemplo) da lo mismo con las dos codificaciones.

   De ahí salen las reglas de este módulo:
     · Los sellos NUEVOS se firman con 'ascii-?' (CODIFICACION_DE_SELLOS_NUEVOS), igual que el Apps
       Script, para que su verificador viejo los siga aceptando si hay que retroceder. Con
       { codificacion: 'utf-8' } se firma en UTF-8, que es más fuerte (ver abajo) y es lo que
       convendrá cuando ya no haga falta retroceder.
     · Una fila puede traer su propia codificación (columna opcional `codificacion`; sellar()
       devuelve la que hay que guardar junto al registro). verificar() recalcula con ella y SOLO con
       ella (decisión C-13). Las que no la traen —todas las heredadas de la hoja— se prueban con
       'ascii-?' primero y con 'utf-8' después, y el resultado dice con cuál cuadró (`codificacion`).
     · Toda conversión de texto a bytes pasa por aBytes().

   Consecuencia que hay que saber: un sello firmado con ASCII-? no distingue un carácter no ASCII
   de otro («ñ» por «ü», «Güero» por «Gäero»). Quien pudiera editar el renglón cambiaría un acento
   sin romper la firma. Es la debilidad de TODOS los sellos heredados y, por la decisión de arriba,
   también la de los nuevos mientras se firmen así; los firmados con 'utf-8' sí la detectan. No se
   corrige hacia atrás sin reimprimir PDF.

   Lo que los doce vectores NO cubren, y sigue sin comprobarse contra Apps Script real: una clave de
   más de 64 bytes (HMAC la reduce con el hash; las de los vectores miden 29 y 13 caracteres, y la de
   producción, si la creó el propio .gs, son tres UUID: 108) y un sustituto suelto en el texto (el
   hallazgo dice que también es «?»; ninguno de los doce lo trae, y sellar() no deja firmarlo). Lo
   primero lo cierra la prueba de oro con filas reales (encabezado de pruebas/supabase-sello.mjs).
   Ni el NUL ni un sustituto suelto llegan a esta conversión dentro de un sello: el texto que se firma
   lo arma JSON.stringify, que los escapa como \uXXXX (ASCII). Solo podrían estar en una clave.

   Lo que este módulo NO hace, a propósito:
     · No inventa una clave. El .gs, si falta la propiedad, genera una nueva al firmar
       (secretoDelSello_(true)) y firma TODO lo que sigue con ella: aquí, sin clave, se lanza
       CLAVE_AUSENTE. Tampoco la recorta ni la normaliza: se usa byte a byte, con sus espacios.
     · No valida cotizaciones, ni recalcula precios, ni arma los renglones: eso es de /autorizar
       (catálogo, límites, folioValido). Aquí solo se firma y se comprueba lo que ya viene armado.
     · No contesta nada público: de eso se encarga verificar.js. Aquí nunca sale la firma
       recalculada de una fila, porque quien la tuviera podría falsificar ese renglón.
   ============================================================================ */

export const FORMATO_V1 = 'AL3D-AUTH-v1';
export const FORMATO_V2 = 'AL3D-AUTH-v2';

/* Los campos de una partida que mueven el precio, en el mismo orden que _CAMPOS_PRECIO de
   js/cotizador/nucleo.js y COT_CAMPOS_PRECIO del .gs. La huella se arma con ellos. */
export const CAMPOS_PRECIO = Object.freeze(['tipo', 'material', 'comp', 'luz', 'altura', 'n', 'acab',
  'recComp', 'bas', 'ancho', 'alto', 'tarifa', 'pz', 'pu']);

/* Las dos maneras de volver texto en bytes que este módulo conoce (ver «LA CODIFICACIÓN»), en el
   orden en que verificar() las prueba cuando la fila no dice con cuál se firmó: primero la del
   Apps Script real. */
export const CODIFICACIONES = Object.freeze(['ascii-?', 'utf-8']);
/* Con la que se firman los sellos NUEVOS: la del Apps Script real (hecho comprobado el 2026-10-10),
   para que su verificador viejo los siga aceptando si hay que retroceder. */
export const CODIFICACION_DE_SELLOS_NUEVOS = 'ascii-?';

/* Las columnas que una fila de `autorizaciones` tiene que traer para poder verificarse y
   contestarse. Los nombres son los de la propuesta del mapa 04 §7; si la migración usa otros,
   quien lee la tabla los renombra al leer. Una columna que NO viene (undefined) es un error de
   configuración, no un sello falso: sin `renglones`, por ejemplo, todos los v2 se comprobarían
   como v1 y «fallarían» —el peor error posible: decirle a un cliente que su PDF es falso—. */
export const COLUMNAS_DE_AUTORIZACION = Object.freeze(['folio_global', 'ts_iso', 'proyecto', 'sub_calc',
  'precio_auth', 'total', 'items_auth', 'huella', 'autorizo', 'renglones', 'codigo', 'firma', 'estado']);
/* Las que se firman como TEXTO, tal cual: no se aceptan convertidas (ver registroDeFila). */
const COLUMNAS_DE_TEXTO = ['folio_global', 'ts_iso', 'proyecto', 'items_auth', 'huella', 'autorizo', 'renglones'];

/* folioValido() del .gs: el folio con el que se SELLA lleva el aparato que lo emitió. */
const RE_FOLIO_CON_APARATO = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
/* new Date().toISOString(): veinticuatro caracteres, con milisegundos y la «Z». */
const RE_TS_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/* Lo que una columna `text` de Postgres NO guarda tal cual: el carácter NUL, y un sustituto suelto
   (la mitad de un emoji, que es lo que deja un slice(0, 140) que cae en medio). Firmar algo así
   rompe lo que más importa de un sello nuevo: que lo firmado sea EXACTAMENTE lo guardado. */
const RE_NO_GUARDABLE = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/* Todo lo que este módulo se niega a hacer sale con un código, para que quien llama distinga
   «falta la clave» de «la fila no es lo que debía» sin leer el mensaje. */
export class ErrorDeSello extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorDeSello';
    this.codigo = codigo;
  }
}

/* ============================================================================
   El texto que se firma. Todo lo de esta sección es el .gs, línea por línea.
   ============================================================================ */

/* Dos decimales como texto. Math.round redondea la mitad hacia +∞ y la multiplicación por 100
   arrastra el error del flotante: Math.round(1.005 * 100) / 100 es 1, no 1.01, y así tiene que
   seguir siendo. NO equivale a round() de Postgres. */
export function dinero2(n) { return (Math.round(Number(n || 0) * 100) / 100).toFixed(2); }

/* Los ajustes por partida, en un orden que no dependa de cómo los armó el objeto. sort() SIN
   comparador: por unidades UTF-16, así que «1», «10», «2» y un id con un emoji se ordenan como
   en el .gs. Un localeCompare o un orden por punto de código daría otro texto. */
export function itemsAuthCanon(ia) {
  return Object.keys(ia || {}).sort().map(k => k + ':' + dinero2(ia[k])).join(',');
}

/* Lo contrario, para devolverle al teléfono sus ajustes. Igual que el .gs, un id que traiga una
   coma o que empiece con «:» no sobrevive al viaje; los id reales son números. */
export function itemsAuthDeCanon(s) {
  const out = {};
  String(s || '').split(',').filter(Boolean).forEach(par => {
    const i = par.lastIndexOf(':');
    if (i > 0) out[par.slice(0, i)] = Number(par.slice(i + 1));
  });
  return out;
}

/* huellaTrabajo() del cotizador (js/cotizador/nucleo.js) y cotHuella() del .gs: el trabajo, no su
   importe. Se ORDENA entera (cada entrada empieza por el id) porque el orden de las partidas no es
   parte del trabajo. String(null) es «null», String(true) es «true», y un campo que no existe
   (undefined) es vacío: por eso el teléfono y la hoja tienen que armarla idéntica. */
export function huellaDe(iva, items) {
  return (iva ? 'c' : 's') + '|' + items.map(it =>
    it.id + ':' + CAMPOS_PRECIO.map(k => (it[k] === undefined ? '' : String(it[k]))).join('~')).sort().join(',');
}

/* Lo que se firma, como un arreglo en JSON y no unido con «|»: con separador, un negocio con una
   «|» corría la frontera con el campo de al lado. JSON escapa sus comillas, y dos registros
   distintos no pueden dar el mismo texto. Con renglones, la v2; sin ellos, la v1 de siempre: el
   prefijo es parte de lo firmado, y a una v2 a la que le vacían la celda de los renglones se le
   comprueba como v1 y ya no cuadra —a propósito—. */
export function canonDe(r) {
  const campos = [String(r.folio), String(r.huella), dinero2(r.subCalc),
    dinero2(r.precioAuth), String(r.itemsAuth), dinero2(r.total), String(r.proyecto),
    String(r.correo), String(r.ts)];
  if (r.renglones) return FORMATO_V2 + JSON.stringify(campos.concat([String(r.renglones)]));
  return FORMATO_V1 + JSON.stringify(campos);
}

/* Cuál de los dos formatos le toca a un registro. */
export function formatoDe(r) { return r.renglones ? FORMATO_V2 : FORMATO_V1; }

/* ============================================================================
   De texto a bytes, y de bytes a hexadecimal.
   ============================================================================ */

const esAscii = t => /^[\x00-\x7f]*$/.test(t);

/* EL punto de conversión (ver «LA CODIFICACIÓN»). 'ascii-?' es lo que hace de verdad
   Utilities.computeHmacSha256Signature en Apps Script: US-ASCII con un «?» (0x3F) por cada punto
   de código que no sea ASCII —un par sustituto (un emoji) es UN solo «?», y un sustituto suelto
   también—, y el U+0000 pasa tal cual. Se recorre con for…of, que va por puntos de código y no por
   unidades UTF-16. 'utf-8' es TextEncoder: NO es lo que hace Apps Script. */
export function aBytes(texto, codificacion = CODIFICACION_DE_SELLOS_NUEVOS) {
  const t = String(texto);
  if (codificacion === 'utf-8') return new TextEncoder().encode(t);
  if (codificacion === 'ascii-?') {
    const bytes = [];
    for (const c of t) { const p = c.codePointAt(0); bytes.push(p < 128 ? p : 63); }
    return Uint8Array.from(bytes);
  }
  throw new ErrorDeSello('CODIFICACION_DESCONOCIDA', 'No conozco la codificación «' + codificacion + '». Las que hay: ' + CODIFICACIONES.join(', ') + '.');
}

/* aHex() del .gs: cada byte (b + 256) % 256 a dos dígitos hexadecimales en minúscula. Con los
   bytes con signo de Apps Script y con los 0..255 de WebCrypto sale lo mismo. */
export function aHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] + 256) % 256;
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}

/* ============================================================================
   La clave. Es TEXTO: no se decodifica de hex ni de base64, no se recorta, no se normaliza.
   ============================================================================ */

/* ¿Parece una clave? Una cadena que no es cadena, vacía, de puros espacios, o la palabra
   «undefined» o «null» (lo que sale de interpolar una variable de entorno que no existe) no lo es.
   Nada de esto es «una clave corta»: la real puede ser lo que sea. Es solo lo que SEGURO no es. */
export function claveUsable(clave) {
  if (typeof clave !== 'string') return false;
  const t = clave.trim();
  return t !== '' && t !== 'undefined' && t !== 'null';
}

export function exigirClave(clave) {
  if (!claveUsable(clave)) {
    throw new ErrorDeSello('CLAVE_AUSENTE',
      'Falta la clave del sello (SELLO_AUTORIZACION). Sin ella no se firma ni se verifica, y nunca se inventa una.');
  }
}

/* ============================================================================
   HMAC, firma y código
   ============================================================================ */

/* HMAC-SHA256 en hexadecimal, con la clave y el texto vueltos bytes por la MISMA codificación (por
   omisión la de los sellos nuevos, 'ascii-?': así lo hace Apps Script con el texto y con la clave). */
export async function hmacHex(texto, clave, codificacion = CODIFICACION_DE_SELLOS_NUEVOS) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new ErrorDeSello('SIN_WEBCRYPTO', 'Este entorno no tiene WebCrypto (crypto.subtle).');
  const llave = await subtle.importKey('raw', aBytes(clave, codificacion), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return aHex(new Uint8Array(await subtle.sign('HMAC', llave, aBytes(texto, codificacion))));
}

/* Lo que va impreso: los primeros doce del HMAC en tres grupos. 48 bits: adivinarlo es imposible
   con el cupo de /verificar, y cabe dictado por teléfono. */
export function codigoDe(firma) {
  const c = String(firma).slice(0, 12).toUpperCase();
  return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8, 12);
}

/* Lo que alguien teclea o escanea, a doce hexadecimales: «a1b2-c3d4 e5f6zz9» es A1B2C3D4E5F6. */
export function normalizarCodigo(c) { return String(c || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12); }

/* La firma de un registro: firmar() del .gs. El registro tiene los nombres del .gs —folio, huella,
   subCalc, precioAuth, itemsAuth, total, proyecto, correo, ts, renglones—. No lo valida (es lo que
   hace falta para comprobar sellos heredados, con lo que sean); lo que sí exige es la clave. Sin
   `opciones.codificacion` firma como el Apps Script real (CODIFICACION_DE_SELLOS_NUEVOS). */
export async function firmar(r, clave, opciones) {
  exigirClave(clave);
  return hmacHex(canonDe(r), clave, (opciones && opciones.codificacion) || CODIFICACION_DE_SELLOS_NUEVOS);
}

/* Firmar un sello NUEVO: lo mismo, pero antes se comprueba que el registro es lo que se va a
   firmar de verdad. Texto es texto (no un Date ni un objeto que se volvería «[object Object]»),
   los importes son números finitos, el folio lleva su aparato y la hora es la de toISOString().
   Devuelve lo que hay que guardar junto al registro, y con él la `codificacion` con la que se
   firmó: verificar() la usa, y SOLO ella, cuando la fila la trae. */
export async function sellar(r, clave, opciones) {
  exigirRegistro(r);
  const codificacion = (opciones && opciones.codificacion) || CODIFICACION_DE_SELLOS_NUEVOS;
  const firma = await firmar(r, clave, { codificacion });
  return { firma, codigo: codigoDe(firma), formato: formatoDe(r), codificacion };
}

export function exigirRegistro(r) {
  const no = (que) => { throw new ErrorDeSello('REGISTRO_INVALIDO', que); };
  if (!r || typeof r !== 'object') no('Falta el registro que se va a firmar.');
  for (const c of ['folio', 'huella', 'itemsAuth', 'proyecto', 'correo', 'ts', 'renglones']) {
    if (typeof r[c] !== 'string') no('«' + c + '» tiene que ser texto: se firma tal cual, sin convertirlo.');
    if (RE_NO_GUARDABLE.test(r[c])) {
      no('«' + c + '» trae un carácter que una columna text no guarda tal cual (un NUL, o la mitad de un emoji cortado ' +
         'con slice): se firmaría una cosa y se guardaría otra. Corta por puntos de código, no por unidades.');
    }
  }
  for (const c of ['subCalc', 'precioAuth', 'total']) {
    if (typeof r[c] !== 'number' || !Number.isFinite(r[c])) no('«' + c + '» tiene que ser un número finito.');
  }
  if (!RE_FOLIO_CON_APARATO.test(r.folio)) no('El folio con el que se sella lleva el aparato: COT-0042-B@K7QM.');
  if (!RE_TS_ISO.test(r.ts)) no('«ts» tiene que ser un texto de new Date().toISOString(), con milisegundos y la «Z».');
  if (r.correo.trim() === '') no('Falta el correo de quien autoriza.');
}

/* La hora de la firma, en el texto exacto que se firma. Se le pasa el reloj (Date.now() de quien
   llama): el módulo no lee ninguno. */
export function tsIso(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) throw new ErrorDeSello('TS_INVALIDO', 'La hora de la firma no es un número de milisegundos.');
  try { return new Date(n).toISOString(); }
  catch (_) { throw new ErrorDeSello('TS_INVALIDO', 'La hora de la firma está fuera de rango.'); }
}

/* ============================================================================
   Comparación en tiempo constante
   ============================================================================ */

/* Compara dos textos sin salirse en la primera diferencia: recorre el más largo entero y junta
   las diferencias con OR. El largo de una firma no es secreto (siempre son 64); lo que no debe
   filtrarse es EN QUÉ POSICIÓN deja de coincidir. */
export function iguales(a, b) {
  const x = String(a), y = String(b);
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

/* ============================================================================
   De la fila de la base al registro que se firma, y verificar
   ============================================================================ */

const comoTexto = x => (x == null ? '' : String(x));
const tipoDe = x => (x === null ? 'null' : Array.isArray(x) ? 'arreglo' : typeof x);

/* Que la fila traiga todas las columnas (aunque sea con null). Una que no viene es una consulta
   mal hecha y se dice con su nombre. */
export function exigirColumnas(fila) {
  if (!fila || typeof fila !== 'object') throw new ErrorDeSello('FILA_INVALIDA', 'La fila de autorización no es un objeto.');
  for (const c of COLUMNAS_DE_AUTORIZACION) {
    if (fila[c] === undefined) throw new ErrorDeSello('COLUMNA_AUSENTE', 'A la fila de autorización le falta la columna «' + c + '».');
  }
}

/* registroDeFila() del .gs. Un null de la base es lo que en la hoja es una celda vacía: texto
   vacío o cero. Lo que NO se acepta es texto que no sea texto (un jsonb que ya vino parseado, un
   timestamptz hecho Date): se firmaría otra cosa y no cuadraría. Los importes pueden venir como
   número o como texto numérico («12500.00», que es como los entregan algunos controladores). */
export function registroDeFila(fila) {
  exigirColumnas(fila);
  for (const c of COLUMNAS_DE_TEXTO) {
    if (fila[c] !== null && typeof fila[c] !== 'string') {
      throw new ErrorDeSello('TIPO_INVALIDO', '«' + c + '» tiene que ser texto tal como se firmó (text), y vino ' + tipoDe(fila[c]) + '.');
    }
  }
  const numero = c => {
    const v = fila[c];
    if (v === null) return 0;
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!Number.isFinite(n)) throw new ErrorDeSello('TIPO_INVALIDO', '«' + c + '» tiene que ser un número, y vino ' + tipoDe(v) + '.');
    return n;
  };
  return {
    folio: comoTexto(fila.folio_global), huella: comoTexto(fila.huella), subCalc: numero('sub_calc'),
    precioAuth: numero('precio_auth'), itemsAuth: comoTexto(fila.items_auth), total: numero('total'),
    proyecto: comoTexto(fila.proyecto), correo: comoTexto(fila.autorizo), ts: comoTexto(fila.ts_iso),
    renglones: comoTexto(fila.renglones),
  };
}

/* La codificación con la que la fila DICE haberse firmado: su columna opcional `codificacion`, que
   es lo que sellar() devuelve para guardarse junto al registro. null si no la trae (undefined, null
   o vacía): así vienen las filas heredadas de la hoja. Una que no sea ninguna de CODIFICACIONES es
   una fila mal guardada, y se dice: ni se adivina ni se cae a la otra, que sería contestar «falso»
   por un error que no es de quien trae el papel. */
export function codificacionDeFila(fila) {
  const c = fila.codificacion;
  if (c === undefined || c === null || c === '') return null;
  if (typeof c !== 'string' || !CODIFICACIONES.includes(c)) {
    throw new ErrorDeSello('TIPO_INVALIDO', '«codificacion» tiene que ser ' + CODIFICACIONES.map(x => '«' + x + '»').join(' o ') +
      ' (o venir vacía), y vino ' + (typeof c === 'string' ? 'otro texto' : tipoDe(c)) + '.');
  }
  return c;
}

/* La verificación de /verificar sobre UNA fila ya encontrada: recalcular la firma desde sus campos
   y exigir que sea la guardada Y que su código sea el guardado. No basta con que la fila exista.

   Con qué codificación se recalcula (ver «LA CODIFICACIÓN»), decisión C-13:
     · si la fila trae la suya (codificacionDeFila), SOLO con ésa: no se prueba la otra, ni vale lo
       que diga `opciones`;
     · si no la trae —las heredadas de la hoja—, con `opciones.codificaciones` o, por omisión, con
       CODIFICACIONES: primero 'ascii-?' (la del Apps Script real) y después 'utf-8'.

   Devuelve { valida, motivo, formato, codificacion }:
     motivo        'ok' | 'firma_no_coincide' | 'codigo_no_coincide'
     codificacion  con cuál coincidió: 'ascii-?' o 'utf-8', o 'ascii' cuando la fila no trae la suya,
                   el texto es solo ASCII y las dos dan lo mismo (esa fila no distingue una de otra).
   NUNCA devuelve la firma recalculada. Lanza ErrorDeSello si falta la clave o la fila no es lo que
   debía (columna ausente, tipo equivocado, codificación que no existe): eso no es un veredicto, es
   un error de quien llama.

   Estado, nota y cliente NO están firmados: cambiar el estado de vigente a revocada no rompe la
   firma. Eso lo defiende quien puede escribir la tabla (RLS y las funciones de revocar), no este
   módulo. */
export async function verificar(fila, clave, opciones) {
  exigirClave(clave);
  const r = registroDeFila(fila);
  const canon = canonDe(r);
  const guardada = comoTexto(fila.firma);
  const codigoGuardado = normalizarCodigo(fila.codigo);
  const propia = codificacionDeFila(fila);
  const lista = propia ? [propia] : ((opciones && opciones.codificaciones) || CODIFICACIONES);
  /* Sin la suya y con todo en ASCII las dos codificaciones dan los mismos bytes: con una pasada basta. */
  const indistinta = !propia && esAscii(canon) && esAscii(clave);
  let firmaCoincide = false;
  for (const cod of lista) {
    const f = await hmacHex(canon, clave, cod);
    const dFirma = iguales(f, guardada);
    const dCodigo = iguales(normalizarCodigo(codigoDe(f)), codigoGuardado);
    firmaCoincide = firmaCoincide || dFirma;
    if (dFirma && dCodigo) {
      return { valida: true, motivo: 'ok', formato: formatoDe(r), codificacion: indistinta ? 'ascii' : cod };
    }
    if (indistinta) break;
  }
  return { valida: false, motivo: firmaCoincide ? 'codigo_no_coincide' : 'firma_no_coincide', formato: formatoDe(r), codificacion: null };
}
