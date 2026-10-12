/* ============================================================================
   /VERIFICAR — el núcleo puro de la ruta que abre el QR de un PDF.

   Es rutaVerificar_() del Apps Script (puente/hoja-apps-script.gs, ~líneas 4016-4088) sin la
   hoja: la validación de la petición, la búsqueda de la fila, el recálculo de la firma, la
   respuesta pública y el cupo de peticiones. No toca la base ni la red ni el entorno: la clave, el
   reloj, la lectura de filas y el contador del cupo llegan como parámetros (`deps`), así que está
   escrito para correr igual en una Edge Function de Deno y en las pruebas de Node (solo se ha
   corrido en Node 24). La firma es de sello.js.

   Es PÚBLICA: la abre el teléfono de cualquiera, sin cuenta y sin token. Por eso contesta lo
   mínimo y por eso la forma de lo que sale está fijada aquí, una sola vez (respuestaPublica).

   LO QUE SALE A UN ANÓNIMO (mapa 04 §3). Con la firma buena:
       { ok: true, estado, folio, fecha, total, proyecto, renglones }       // esas siete llaves
   y nada más: ni cliente, ni teléfono, ni dirección, ni el correo de quien autorizó, ni nota,
   huella, subtotal calculado, precio autorizado, ajustes por partida, firma o código, ni la hora
   (solo el día), ni el estado de ningún otro folio. Sin ella, solo { ok: true, estado:
   'no_autentica' }. El `proyecto` es texto libre (puede traer un nombre de persona): es lo que
   firmó la hoja, y verificar.html lo escribe con textContent.

   LOS ESTADOS. Públicos, los que verificar.html ya sabe pintar: 'autentica' | 'superada' |
   'revocada' | 'no_autentica'. La fila guarda otros nombres ('vigente'), y NO se mandan: la página
   manda a «No auténtica» todo lo que no conoce, y un PDF bueno diría que es falso. La traducción
   es la del .gs: vigente → autentica, revocada → revocada, cualquier otra cosa → superada. «No se
   encontró» y «la firma no cuadra» se contestan IGUAL (no_autentica): distinguirlos le diría a
   quien prueba códigos cuáles existen. Por dentro sí se distinguen (`motivo`), para el registro.

   EL ERROR QUE NO SE PUEDE COMETER (mapa 04 R1, crítico C-27). El .gs, si falta la propiedad del
   sello o la hoja, contesta no_autentica: le dice a un cliente que su PDF legítimo es falso. Aquí
   no. Si falta la clave, falta una dependencia, o la fila no trae las columnas, o la base no
   contesta, la respuesta es un error explícito { ok: false, … } —que verificar.html muestra como
   «Espera un momento», sin acusar a nadie— y `alerta: true` para el registro. «No se halló una
   fila con ese folio y ese código» sigue siendo no_autentica: ese es el caso normal de un papel
   falso o mal copiado. (Así se interpreta lo de C-27, «si falta la clave o la fila»: la que falta
   es la FUENTE de las filas, la hoja entera, que aquí es la tabla; una fila concreta que no
   existe es, justamente, el papel falso.)

   LO QUE ENTRA Y LO QUE SALE DE verificarPublico(cuerpo, deps):
       cuerpo   { f, c } tal como lo manda la página (el `ruta` se ignora).
       deps     clave          texto. SELLO_AUTORIZACION, del secreto de la función.
                leerFilas      async ({ folio, folioCorto, conAparato, codigo }) → filas.
                               Las de `autorizaciones` cuyo código normalizado sea `codigo`, o, si la
                               tabla no se indexa así, todas las de ese folio corto; del MÁS
                               ANTIGUO al más nuevo (la última que cuadre es la que vale). Cada
                               fila con TODAS las columnas de COLUMNAS_DE_AUTORIZACION y, si la
                               tabla la tiene, `codificacion` (con cuál se firmó; ver abajo).
                contarCupo     async (clave, ventana) → número. Suma 1 a esa cuenta y devuelve
                               cuánto lleva, con ésta incluida. Tiene que ser atómico; ver abajo.
                ahora          () → milisegundos. El reloj (Date.now de quien llama).
                zonaHoraria    opcional. Para la fecha; por omisión America/Mexico_City.
                limites        opcional. Para pruebas; por omisión 30 / 400 / 600 s.
                codificaciones opcional, para pruebas y diagnóstico. Pasa a sello.verificar y solo
                               cuenta para las filas que no traen la suya (ver «LA CODIFICACIÓN»).
       sale     { status, cuerpo, motivo, alerta, … }. SOLO `cuerpo` va al cliente, con `status` como
                código HTTP: 200 en todo lo que el .gs contestaba con 200, 429 si se acabó el cupo,
                503 en un error de configuración y 500 en uno inesperado (la página mira `ok`, no el
                código). Lo demás —`motivo`, `alerta`, `detalle`, `reintentarEnSeg`, `codificacion`
                con la que cuadró la firma— es para el registro de la función.

   LA CODIFICACIÓN DE LA FIRMA (hecho comprobado en Apps Script real el 2026-10-10; ver «LA
   CODIFICACIÓN» en sello.js). Utilities.computeHmacSha256Signature no codifica en UTF-8 sino en
   US-ASCII con un «?» por cada punto de código no ASCII, y casi todo sello ya impreso se firmó así.
   La ruta no decide nada de eso: lo hace sello.verificar() sobre la fila que encontró. Si la fila
   trae su propia codificación (columna opcional `codificacion`), se recalcula SOLO con ésa
   (decisión C-13); si no la trae —las heredadas de la hoja—, primero con 'ascii-?' y después con
   'utf-8'. Con cuál cuadró sale en `codificacion`, solo para el registro; la respuesta pública no
   lo menciona. Una `codificacion` que no existe es una fila mal guardada: error de configuración
   (503, motivo `tipo_invalido`, con alerta), no «No auténtica».

   EL CUPO (GS:4079-4088, 2412-2417). 30 consultas por folio y 400 en total por ventana FIJA de
   600 s: la clave lleva el número de ventana, así que cada ventana empieza en cero. Una consulta
   de forma inválida no cuenta (ni consulta nada). Las dos cuentas se suman siempre y después se
   comparan, de modo que una consulta rechazada también cuenta. Si el contador falla se deja pasar,
   como el .gs (un contador roto no puede dejar sin servicio al cliente), pero `alerta` lo dice.

   DIFERENCIAS DELIBERADAS CON EL .gs (todas probadas en pruebas/supabase-sello.mjs):
     · falta de clave, de dependencias o de columnas, o una base que no contesta: un error
       explícito y no «no_autentica» (ver arriba);
     · eso se dice ANTES de contar el cupo, y no después;
     · el folio del cupo va en MAYÚSCULAS: la búsqueda ya ignora la caja y el .gs contaba
       «cot-0042» y «COT-0042» en cubetas distintas, así que el tope por folio se burlaba con
       variantes (el total de 400 sí valía);
     · f y c de más de 256 caracteres no son una petición: el .gs lo acotaba con su tope de 64 KB
       de cuerpo, aquí no hay cuerpo que acotar;
     · hay código HTTP de verdad (429, 503, 500) y no siempre 200: la página no lo mira.
   Todo lo demás —la forma de la petición, la búsqueda, la firma, la respuesta y su orden de llaves,
   el cuerpo del cupo agotado y el del error interno— sale igual que en el .gs, y la prueba lo
   compara contra el .gs real con filas firmadas por él.

   USO, en la Edge Function (esquema; el cableado real es de quien la escriba):
       const r = await verificarPublico(await req.json().catch(() => ({})), {
         clave: Deno.env.get('SELLO_AUTORIZACION'),
         leerFilas: q => leerAutorizaciones(q),                  // CON parámetros, nunca concatenando q
         contarCupo: (clave, ventana) => contarEnLaBase(clave, ventana),
         ahora: () => Date.now(),
       });
       if (r.alerta) console.error('verificar', r.motivo, r.detalle);   // al registro, jamás a la respuesta
       return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { ...cors, ...json } });
   Las cabeceras CORS van también en las respuestas de error: sin ellas el navegador no deja leerlas
   y la página dice «Sin respuesta» en vez de «Espera un momento».
   El contador atómico, en Postgres (una fila por clave; al cambiar la ventana vuelve a 1):
       create table verificar_cupo (clave text primary key, ventana bigint not null, n integer not null);
       insert into verificar_cupo (clave, ventana, n) values ($1, $2, 1)
         on conflict (clave) do update
           set n = case when verificar_cupo.ventana = excluded.ventana then verificar_cupo.n + 1 else 1 end,
               ventana = excluded.ventana
         returning n;
   Las claves nuevas están acotadas por el cupo total (400 cada 10 min); hay que borrar de vez en
   cuando las de ventanas viejas. contadorEnMemoria() es lo mismo para pruebas y desarrollo.
   ============================================================================ */

import { ErrorDeSello, claveUsable, exigirColumnas, normalizarCodigo, registroDeFila,
         verificar as verificarSello } from './sello.js';

export const LIMITES_VERIFICAR = Object.freeze({ porFolio: 30, enTotal: 400, ventanaSeg: 600 });
export const ZONA_DE_LA_HOJA = 'America/Mexico_City';    // NO CONFIRMADA: es la que simulan las pruebas del .gs
export const MAX_ENTRADA = 256;
export const ESTADOS_PUBLICOS = Object.freeze(['autentica', 'superada', 'revocada', 'no_autentica']);
/* Los estados con los que se guarda una fila (no se firman). Lo que se contesta es otra cosa. */
export const ESTADOS_DE_LA_FILA = Object.freeze(['vigente', 'superada', 'revocada']);
/* Todo lo que puede decir `motivo` en lo que sale de verificarPublico, para quien lee el registro:
   el veredicto («ok», «no_encontrada», «firma_invalida»), lo que no es culpa de quien consultó
   («forma_invalida», «cupo») y los errores de la función, que llevan alerta. */
export const MOTIVOS = Object.freeze(['ok', 'forma_invalida', 'cupo', 'no_encontrada', 'firma_invalida',
  'clave_ausente', 'dependencia_ausente', 'limites_invalidos', 'zona_invalida', 'columna_ausente', 'fila_invalida',
  'tipo_invalido', 'sin_webcrypto', 'dependencia_invalida', 'origen_no_disponible', 'error_inesperado']);

/* Los textos que ve quien verifica. El de cupo y el interno son los del .gs, palabra por palabra. */
export const MENSAJE_CUPO = 'Demasiadas consultas seguidas. Espera unos minutos.';
export const MENSAJE_INTERNO = 'El puente falló procesando eso.';
export const MENSAJE_CONFIGURACION =
  'El registro de AL3D no está disponible por el momento. Vuelve a intentarlo más tarde; ' +
  'esto no quiere decir que tu cotización sea falsa.';

/* ============================================================================
   La petición
   ============================================================================ */

/* folioDePapel_() del .gs: lo que llega de un papel. El «@aparato» es opcional AQUÍ y solo aquí:
   el PDF imprime «COT-0042» y el QR trae «COT-0042@K7QM». En las rutas que escriben, el folio
   corto es ambiguo (se repite entre teléfonos) y se rechaza; en /verificar el que identifica es
   el código, el folio solo estrecha la búsqueda. */
const RE_FOLIO_DE_PAPEL = /^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$/;
export function folioDePapel(f) { return typeof f === 'string' && RE_FOLIO_DE_PAPEL.test(f); }

/* «COT-0042@K7QM» → «COT-0042»: lo que va impreso y lo que se contesta. */
export function folioCorto(f) { return String(f == null ? '' : f).split('@')[0]; }

/* La petición, como la valida el .gs: el folio con trim y con la forma del papel, y el código a
   doce hexadecimales. Una petición mal formada NO consulta nada ni cuenta para el cupo. */
export function validarPeticion(cuerpo) {
  const f = String((cuerpo && cuerpo.f) || '');
  const c = String((cuerpo && cuerpo.c) || '');
  if (f.length > MAX_ENTRADA || c.length > MAX_ENTRADA) return { valida: false, motivo: 'forma_invalida', detalle: 'demasiado_largo' };
  const folio = f.trim();
  const codigo = normalizarCodigo(c);
  if (!folioDePapel(folio) || codigo.length !== 12) return { valida: false, motivo: 'forma_invalida' };
  return { valida: true, folio, codigo, folioCorto: folioCorto(folio) };
}

/* ============================================================================
   La búsqueda
   ============================================================================ */

const comoTexto = x => (x == null ? '' : String(x));

/* ultimaFilaDeVerificar_() del .gs. Manda el CÓDIGO; el folio solo estrecha: exacto si trae
   «@aparato», por el corto si no, y el corto sin distinguir mayúsculas (el prefijo es «COT-» y lo
   demás son dígitos, y quien teclea del papel escribe «cot-42» igual de fácil). De atrás para
   adelante: una cotización reautorizada deja varias filas con el mismo folio, y la última es la
   que vale. Devuelve la fila, o null. */
export function ultimaFilaDeVerificar(filas, folio, cod) {
  const conAparato = String(folio).indexOf('@') >= 0, corto = folioCorto(folio).toUpperCase();
  for (let i = filas.length - 1; i >= 0; i--) {
    const v = filas[i], f = comoTexto(v.folio_global);
    if (conAparato ? f !== folio : folioCorto(f).toUpperCase() !== corto) continue;
    if (normalizarCodigo(v.codigo) !== cod) continue;
    return v;
  }
  return null;
}

/* ============================================================================
   La respuesta pública
   ============================================================================ */

/* renglonesDeTexto() del .gs. null es «este sello no guardó renglones» (los de antes de
   puente-sheets-8: v1). Un texto que no se entiende también es null, pero ése no llega a verse:
   la firma lo cubre, y uno alterado ya no verifica. */
export function renglonesDeTexto(s) {
  if (!s) return null;
  let a;
  try { a = JSON.parse(String(s)); } catch (e) { return null; }
  if (!Array.isArray(a)) return null;
  return a.map(r => ({ descripcion: String(r && r[0] != null ? r[0] : ''), cantidad: Number(r && r[1]) || 0,
                       importe: Number(r && r[2]) || 0 }));
}

/* dd/MM/yyyy del texto ISO, en la zona de la hoja (Utilities.formatDate del .gs). Solo el DÍA: la
   hora de una autorización no se le da a un anónimo. '' si el texto no es una fecha. */
export function fechaDeVerificar(ts, zona = ZONA_DE_LA_HOJA) {
  const cuando = new Date(String(ts));
  if (Number.isNaN(cuando.getTime())) return '';
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(cuando)) p[x.type] = x.value;
  return p.day + '/' + p.month + '/' + p.year;
}

/* vigente → autentica, revocada → revocada, lo demás → superada (como el .gs). */
export function estadoPublico(estado) {
  const e = String(estado);
  return e === 'vigente' ? 'autentica' : (e === 'revocada' ? 'revocada' : 'superada');
}

/* LA forma de lo que sale. Se arma de cero, llave por llave, y nunca se reparte la fila: una
   columna nueva en la tabla no puede colarse a un anónimo por descuido. El folio sale de la
   FILA y no de lo tecleado: lo que se enseña junto al papel es lo que está guardado. */
export function respuestaPublica(fila, zona = ZONA_DE_LA_HOJA) {
  const r = registroDeFila(fila);
  return {
    ok: true,
    estado: estadoPublico(fila.estado),
    folio: folioCorto(r.folio),
    fecha: fechaDeVerificar(r.ts, zona),
    total: r.total,
    proyecto: r.proyecto,
    renglones: renglonesDeTexto(r.renglones),
  };
}

/* ============================================================================
   El cupo
   ============================================================================ */

function limitesDe(l) {
  const L = { ...LIMITES_VERIFICAR, ...(l || {}) };
  for (const k of ['porFolio', 'enTotal', 'ventanaSeg']) {
    if (!Number.isFinite(L[k]) || L[k] <= 0) throw new RangeError('límite inválido: «' + k + '» tiene que ser un número mayor que cero.');
  }
  return L;
}

/* El número de la ventana fija en la que cae `ahora`: Math.floor(Date.now() / (segundos * 1000)),
   como contarEnVentana() del .gs. */
export function ventanaDe(ahora, limites = LIMITES_VERIFICAR) {
  return Math.floor(Number(ahora) / (limitesDe(limites).ventanaSeg * 1000));
}

/* Las dos cuentas de una consulta. Se sale del folio CORTO y en mayúsculas (ver arriba). El «__»
   del total no puede chocar con ningún folio: el corto no admite guion bajo. */
export function clavesDeCupo(folioCortoDeLaConsulta) {
  return { porFolio: 'v_' + String(folioCortoDeLaConsulta).toUpperCase(), enTotal: 'v__total' };
}

/* La decisión, pura. `contadores` son las cuentas de la ventana ACTUAL con esta consulta ya
   incluida ({ porFolio, enTotal }); se permite mientras las dos estén dentro de su tope (la 31 de
   un folio y la 401 del total se rechazan). Lo que no es un número válido cuenta como cero.
   Devuelve { permitido, tope, ventana, reintentarEnSeg }: `tope` es 'folio' o 'total' (el de
   folio primero si se pasaron los dos) y `reintentarEnSeg` lo que falta para que cierre la
   ventana, para un Retry-After. */
export function decidirCupo(contadores, ahora, limites = LIMITES_VERIFICAR) {
  const L = limitesDe(limites);
  const t = Number(ahora);
  if (!Number.isFinite(t)) throw new TypeError('decidirCupo: «ahora» tiene que ser un número de milisegundos.');
  const cuenta = x => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  const porFolio = cuenta(contadores && contadores.porFolio), enTotal = cuenta(contadores && contadores.enTotal);
  const ventana = ventanaDe(t, L);
  const tope = porFolio > L.porFolio ? 'folio' : (enTotal > L.enTotal ? 'total' : null);
  const fin = (ventana + 1) * L.ventanaSeg * 1000;
  return { permitido: tope === null, tope, ventana, reintentarEnSeg: Math.max(1, Math.ceil((fin - t) / 1000)) };
}

/* El contador de pruebas y de desarrollo: una cuenta por «clave@ventana», como la caché del .gs.
   En producción el contador va en la base (el SQL de arriba), no aquí: esto no se comparte entre
   instancias de la función. Las cuentas de ventanas viejas se olvidan solas. */
export function contadorEnMemoria() {
  const cuentas = new Map();
  let ultima = -Infinity;
  return {
    async contar(clave, ventana) {
      if (ventana > ultima) { cuentas.clear(); ultima = ventana; }
      const k = clave + '@' + ventana;
      const n = (cuentas.get(k) || 0) + 1;
      cuentas.set(k, n);
      return n;
    },
    tamano: () => cuentas.size,
  };
}

/* ============================================================================
   La ruta completa
   ============================================================================ */

/* Los envoltorios de salida. `alerta` es «que alguien lo mire»: lo que no es culpa de quien
   consultó (configuración, base caída, una fila que no cuadra). Las llaves sin valor no salen. */
function sobre(status, cuerpo, extra) {
  const s = { status, cuerpo, alerta: false, ...extra };
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
  return s;
}
const NO_AUTENTICA = () => ({ ok: true, estado: 'no_autentica' });
const errorDeConfiguracion = (motivo, detalle) =>
  sobre(503, { ok: false, codigo: 'CONFIGURACION', mensaje: MENSAJE_CONFIGURACION }, { motivo, alerta: true, detalle: String(detalle) });
const errorInterno = (motivo, e) =>
  sobre(500, { ok: false, codigo: 'DESCONOCIDO', mensaje: MENSAJE_INTERNO }, { motivo, alerta: true, detalle: String((e && e.message) || e) });

/* Lo que sello.js lanza cuando algo está mal CONFIGURADO (no un sello falso) y el nombre que se le
   da en el registro. */
const MOTIVO_DE_ERROR = { CLAVE_AUSENTE: 'clave_ausente', COLUMNA_AUSENTE: 'columna_ausente',
  FILA_INVALIDA: 'fila_invalida', TIPO_INVALIDO: 'tipo_invalido', SIN_WEBCRYPTO: 'sin_webcrypto',
  CODIFICACION_DESCONOCIDA: 'dependencia_invalida' };

/* Lo que falta o está mal en `deps`, o null. Va ANTES de tocar nada: sin clave no se contesta, y
   se dice que es la clave. */
function falloDeConfiguracion(deps) {
  if (!claveUsable(deps.clave)) return ['clave_ausente', 'Falta la clave del sello (SELLO_AUTORIZACION).'];
  for (const d of ['leerFilas', 'contarCupo', 'ahora']) {
    if (typeof deps[d] !== 'function') return ['dependencia_ausente', 'Falta la dependencia «' + d + '» (tiene que ser una función).'];
  }
  try { limitesDe(deps.limites); } catch (e) { return ['limites_invalidos', e.message]; }
  try { fechaDeVerificar('2026-01-01T00:00:00.000Z', deps.zonaHoraria || ZONA_DE_LA_HOJA); }
  catch (e) { return ['zona_invalida', 'La zona horaria «' + (deps.zonaHoraria || ZONA_DE_LA_HOJA) + '» no existe.']; }
  return null;
}

/* La ruta, en el orden del .gs salvo por una cosa: lo que está mal configurado se dice antes de
   contar el cupo. 1) la forma; 2) la configuración; 3) el cupo; 4) leer las filas y revisar que
   traen sus columnas; 5) buscar; 6) recalcular la firma; 7) contestar. Lo que se escape de todo
   eso es un error inesperado (500), como el try/catch de doPost en el .gs: nunca una excepción
   hacia afuera ni, peor, un «no auténtica». */
export async function verificarPublico(cuerpo, deps) {
  try { return await rutaDeVerificar(cuerpo, deps || {}); }
  catch (e) { return errorInterno('error_inesperado', e); }
}

async function rutaDeVerificar(cuerpo, deps) {
  /* 1. La forma. Un papel mal copiado no es un error: es «no auténtica», y no gasta cupo. */
  const p = validarPeticion(cuerpo);
  if (!p.valida) return sobre(200, NO_AUTENTICA(), { motivo: p.motivo, detalle: p.detalle });

  /* 2. La configuración. */
  const falla = falloDeConfiguracion(deps);
  if (falla) return errorDeConfiguracion(falla[0], falla[1]);
  const zona = deps.zonaHoraria || ZONA_DE_LA_HOJA;

  /* 3. El cupo. Si el contador no contesta, se deja pasar y se anota en lo que salga de aquí. */
  let cupoNoDisponible = null;
  try {
    const L = limitesDe(deps.limites), ahora = Number(deps.ahora());
    const claves = clavesDeCupo(p.folioCorto), ventana = ventanaDe(ahora, L);
    const [porFolio, enTotal] = await Promise.all([deps.contarCupo(claves.porFolio, ventana), deps.contarCupo(claves.enTotal, ventana)]);
    const d = decidirCupo({ porFolio, enTotal }, ahora, L);
    if (!d.permitido) {
      return sobre(429, { ok: false, codigo: 'SIN_RED', mensaje: MENSAJE_CUPO },
                   { motivo: 'cupo', detalle: d.tope, reintentarEnSeg: d.reintentarEnSeg });
    }
  } catch (e) { cupoNoDisponible = String((e && e.message) || e); }
  const marcar = envoltorio => (cupoNoDisponible === null ? envoltorio : { ...envoltorio, alerta: true, cupoNoDisponible });

  /* 4. Las filas. Que la base no conteste es un error, no un «no auténtica». */
  let filas;
  try {
    filas = await deps.leerFilas({ folio: p.folio, folioCorto: p.folioCorto, conAparato: p.folio.indexOf('@') >= 0, codigo: p.codigo });
    if (!Array.isArray(filas)) throw new TypeError('leerFilas no devolvió un arreglo.');
  } catch (e) { return marcar(errorInterno('origen_no_disponible', e)); }
  try { filas.forEach(fila => exigirColumnas(fila)); }
  catch (e) { return marcar(errorDeConfiguracion(MOTIVO_DE_ERROR[e.codigo] || 'columna_ausente', e.message)); }

  /* 5. Buscar. Ninguna fila con ese folio y ese código: el caso de un papel falso. */
  const hallada = ultimaFilaDeVerificar(filas, p.folio, p.codigo);
  if (!hallada) return marcar(sobre(200, NO_AUTENTICA(), { motivo: 'no_encontrada' }));

  /* 6. Recalcular la firma desde la fila. La fila existe, pero ¿dice lo que se firmó? Si alguien
     cambió un total a mano, o una importación salió mal, aquí se sabe. Es no_autentica para quien
     pregunta y una alerta para quien mira el registro. La codificación (la de la fila, y solo ésa,
     o primero 'ascii-?' y luego 'utf-8') la decide sello.verificar. */
  let v;
  try { v = await verificarSello(hallada, deps.clave, { codificaciones: deps.codificaciones }); }
  catch (e) {
    if (e instanceof ErrorDeSello) return marcar(errorDeConfiguracion(MOTIVO_DE_ERROR[e.codigo] || 'dependencia_invalida', e.message));
    return marcar(errorInterno('error_inesperado', e));
  }
  if (!v.valida) return marcar(sobre(200, NO_AUTENTICA(), { motivo: 'firma_invalida', alerta: true, detalle: v.motivo }));

  /* 7. Contestar. */
  return marcar(sobre(200, respuestaPublica(hallada, zona), { motivo: 'ok', codificacion: v.codificacion }));
}
