/* ============================================================================
   EL ARNÉS DE PRUEBAS DE BASE DE DATOS.

   Levanta PostgreSQL en memoria (PGlite, PostgreSQL 18 compilado a WASM), le carga el shim
   de Supabase (arnes/shim.sql) y las migraciones del proyecto, y deja hablarle como lo
   haría PostgREST: con un rol y un JWT por petición. Sin Docker, sin red, sin CLI.

   Esto es una IMITACIÓN de Supabase, no Supabase. Sirve para que una migración que olvida
   un GRANT, una política que deja pasar de más o una función SECURITY DEFINER sin
   search_path se enteren aquí y no en producción. No sirve para dar por buena una
   migración: la validación definitiva es contra el proyecto de pruebas de Supabase (ver
   README.md, «Límites»).

   LO QUE IMITA DE POSTGREST, Y SU TRUCO:
   PostgREST conecta como `authenticator`, abre cada petición en una transacción, hace
   `SET LOCAL ROLE <rol del JWT>`, deja los claims en `request.jwt.claims` y recién entonces
   corre la consulta. Eso es lo que hace `como()`: dentro de una transacción, deja los claims,
   pasa la sesión a `authenticator` (`SET LOCAL SESSION AUTHORIZATION`) y de ahí cambia al
   rol. Que la sesión sea `authenticator` y no el superusuario importa: `reset role` o
   `set role postgres` dentro de una petición no te devuelven a postgres, igual que en
   Supabase (un `session_user` de superusuario dejaría escalar con un simple `reset role`).
   Todo es `LOCAL`: al terminar la transacción —bien o mal— el rol, la autorización y los
   claims desaparecen solos, y de ahí sale la garantía de que no se filtra estado de una
   sesión a otra. Pero «solos» no alcanza: una prueba puede escribir `set role` sin LOCAL,
   crear una tabla temporal o dejar un `begin` abierto, y en una conexión única eso
   contaminaría a la siguiente. Por eso, pase lo que pase, al final de cada petición se
   deshace lo que quede (ver `limpiarSesion`).

   UNA TRAMPA DE PGLITE que condiciona todo lo anterior: corre en modo monousuario, y ahí la
   autorización de sesión NO tiene valor base. Mientras nadie la haya fijado a mano, ni el
   ROLLBACK ni `RESET SESSION AUTHORIZATION` ni `DISCARD ALL` la devuelven al superusuario, y
   la conexión se queda en `authenticator` para siempre (lo comprobé). Fijada una vez con un
   `SET SESSION AUTHORIZATION postgres` explícito, el `SET LOCAL` ya se revierte bien. Por eso
   cada base se inicializa así al crearla (`inicializarConexion`) y cada limpieza lo repite.

   POR QUÉ UNA COLA: PGlite tiene UNA conexión. Si dos peticiones se entrelazan (un
   `Promise.all` de dos sesiones, un `await` olvidado) la segunda correría con lo que la
   primera dejó en la sesión. Cada petición completa —desde el BEGIN hasta la limpieza— pasa
   por una cola por base, así que nunca se mezclan. La consecuencia: dentro de
   `transaccion()` NO se puede llamar a `sql()` ni a otra sesión de la misma base (esperarían
   a la cola que ellas mismas ocupan y la prueba se colgaría); se detecta y se avisa con un
   error en vez de colgarse.

   LO QUE NO SE PUEDE IMITAR BIEN, para que nadie se lleve la sorpresa:
   - Dentro de una petición, `set session authorization postgres` SÍ escala a superusuario: en
     Supabase el usuario autenticado de la conexión es `authenticator`, que no puede; en
     PGlite es el superusuario de verdad. Nadie lo escribe por accidente, pero una prueba de
     «no se puede escalar» que lo intentara pasaría en falso.
   - No hay un reloj de prueba. Lo probé: `now()` sí sigue a un `Date.now` parchado, pero al
     saltar la hora aparece una cascada de `TimeoutOverflowWarning` (la causa probable son los
     temporizadores internos de Postgres en WASM, que calculan su espera con la hora que se
     movió; eso último es una inferencia, lo observado son los avisos). Para probar lógica de
     tiempo, siembra filas con fechas relativas a now() o haz que la función reciba el
     instante como parámetro.
   - La zona horaria se fija a UTC, como la de Supabase: la de PGlite sale del equipo donde
     corre (aquí era UTC−6) y haría que `current_date` o un cast de `timestamp` dieran otra
     cosa según la máquina. La colación, en cambio, es `C` (orden por bytes) y la de Supabase
     es `en_US.UTF-8`: un `order by` de texto con mayúsculas o acentos puede salir distinto.
   ============================================================================ */

import { PGlite, messages } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Carpeta supabase/tests/: desde ahí se cuentan las rutas relativas (`'../migrations'`). */
export const RAIZ_PRUEBAS = fileURLToPath(new URL('..', import.meta.url));
const RUTA_SHIM = fileURLToPath(new URL('./shim.sql', import.meta.url));

/** Los únicos roles con los que PostgREST abre una petición. */
export const ROLES = Object.freeze(['anon', 'authenticated', 'service_role']);

/* El search_path de la base de Supabase, y el que PostgREST fija en cada petición
   (`db-extra-search-path = public, extensions`: sin «$user», que no existe como esquema).
   El de la base va sin espacios porque viaja como UN argumento de la línea de comandos de
   PGlite. */
const SEARCH_PATH_BASE = '"$user",public,extensions';
const SEARCH_PATH_PETICION = 'public, extensions';

/* El superusuario con el que PGlite abre su única conexión (su nombre de usuario por
   omisión), y el rol con el que PostgREST abre la suya. */
const SUPERUSUARIO = 'postgres';
const ROL_CONEXION = 'authenticator';

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ============================== Errores ============================== */

/**
 * Un error de Postgres, con sus campos en español y el sqlstate en `codigo` (y en `code`,
 * donde lo busca `esperarError` y cualquier código hecho para el driver `pg`).
 * El `message` es el MISMO que dio Postgres: una prueba que lo compara con una regex no
 * tiene que saber que hay un arnés en medio.
 */
export class ErrorDeBase extends Error {
  constructor(mensaje, campos = {}, opciones) {
    super(mensaje, opciones);
    this.name = 'ErrorDeBase';
    this.codigo = campos.codigo ?? null;
    this.code = this.codigo;
    this.severidad = campos.severidad;
    this.detalle = campos.detalle;
    this.pista = campos.pista;
    this.posicion = campos.posicion ?? null;
    this.esquema = campos.esquema;
    this.tabla = campos.tabla;
    this.columna = campos.columna;
    this.restriccion = campos.restriccion;
    this.contexto = campos.contexto;      // la pila de PL/pgSQL («PL/pgSQL function f() line 4 at RAISE»)
    this.sql = campos.sql;
  }
}

/** Una migración (o archivo extra) que falló al cargarse: dice cuál, en qué línea y con qué sentencia. */
export class ErrorDeMigracion extends ErrorDeBase {
  constructor({ archivo, ruta, linea, sentencia, origen }) {
    const l = [`Falló «${archivo}»${linea ? ', línea ' + linea : ''}: ${origen.message} [${origen.codigo}]`];
    if (sentencia) l.push('    > ' + resumirSql(sentencia));
    if (origen.detalle) l.push('    detalle: ' + origen.detalle);
    if (origen.pista) l.push('    pista: ' + origen.pista);
    // Si el error saltó DENTRO de una función (la sentencia que la llamó es la que se ubica), su pila
    // de PL/pgSQL dice cuál y en qué línea de ella.
    if (origen.contexto) l.push('    dentro de: ' + String(origen.contexto).split('\n')[0]);
    super(l.join('\n'), origen, { cause: origen.cause ?? origen });
    this.name = 'ErrorDeMigracion';
    this.archivo = archivo;
    this.ruta = ruta;
    this.linea = linea;
    this.sentencia = sentencia;
    this.mensajeBase = origen.message;
  }
}

/** Lo que lanza `exigirAuditoriaLimpia`. `sinPila`: el marco imprime solo el mensaje. */
export class ErrorDeAuditoria extends Error {
  constructor(mensaje, reporte) { super(mensaje); this.name = 'ErrorDeAuditoria'; this.reporte = reporte; this.sinPila = true; }
}

/* Lo que PGlite lanza ante un error de Postgres es un `messages.DatabaseError`; se reconoce
   además por sus campos (`severity` y `code`) por si llegara de otra copia del paquete. Un
   Error de node con `code: 'ENOENT'` no trae `severity`, y ese no es de la base. */
const esErrorPG = e => e instanceof messages.DatabaseError ||
  (!!e && typeof e === 'object' && typeof e.code === 'string' && typeof e.severity === 'string');

function comoErrorDeBase(e, sql) {
  if (e instanceof ErrorDeBase || !esErrorPG(e)) return e;
  return new ErrorDeBase(e.message, {
    codigo: e.code, severidad: e.severity, detalle: e.detail, pista: e.hint,
    // La posición solo vale como «posición en TU texto» si el error no vino de una consulta interna
    // (una función ejecutándose): ahí `position` es de la consulta de la función, no de la tuya.
    posicion: e.position && !e.internalQuery ? Number(e.position) : null,
    esquema: e.schema, tabla: e.table, columna: e.column, restriccion: e.constraint,
    contexto: e.where, sql,
  }, { cause: e });
}

const resumirSql = s => { const l = String(s).trim().split('\n')[0]; return l.length > 140 ? l.slice(0, 137) + '…' : l; };

/* ========================= Partir SQL en sentencias ========================= */

/* Para qué sirve esto: cuando un archivo falla, Postgres a veces dice dónde (errores de
   análisis: sintaxis, tabla inexistente) y a veces no (un INSERT que viola una restricción,
   un RAISE EXCEPTION). Para poder decir SIEMPRE «línea N» se parte el archivo en
   sentencias y se repiten una por una. Se parte a mano porque un `split(';')` corta dentro
   de las funciones ($$ … $$), de los textos ('a;b') y de los comentarios.
   Lo que entiende: textos '…' (con '' y, en E'…', con \), identificadores "…", comentarios
   de línea (--) y de bloque (que en Postgres anidan), cuerpos $$…$$ y $etiqueta$…$etiqueta$,
   y el cuerpo estándar de las funciones (`BEGIN ATOMIC … END`, con sus CASE … END adentro).
   Lo que NO: los comandos de psql (`\i`, `\.`) y COPY … FROM stdin, que no van en migraciones.
   Y solo se usa para DIAGNOSTICAR: el archivo se ejecuta entero, tal cual, con el
   analizador de Postgres; si este divisor se equivocara, a lo sumo la línea del mensaje
   saldría mal, nunca una migración sana saldría rota. */

/* Letras de cualquier alfabeto (Postgres trata como letra todo lo que no es ASCII), dígitos,
   `_` y, en el cuerpo de un nombre, `$`: `mi$nombre` es UN identificador y su `$` no abre un
   cuerpo entrecomillado. Clases de propiedad Unicode y no un rango de caracteres altos, que se
   estropean al copiar el archivo entre editores. */
const RE_PALABRA = /[\p{L}_][\p{L}\p{M}\p{N}_$]*/uy;
const RE_ETIQUETA_DOLAR = /\$([\p{L}_][\p{L}\p{M}\p{N}_]*)?\$/uy;

/** Devuelve `linea(indice)`: la línea (desde 1) en que cae un índice del texto. */
function indiceDeLineas(texto) {
  const saltos = [];
  for (let i = texto.indexOf('\n'); i !== -1; i = texto.indexOf('\n', i + 1)) saltos.push(i);
  return indice => {
    let lo = 0, hi = saltos.length;                    // cuántos saltos hay antes de `indice`
    while (lo < hi) { const m = (lo + hi) >> 1; if (saltos[m] < indice) lo = m + 1; else hi = m; }
    return lo + 1;
  };
}

/**
 * Parte un texto SQL en sentencias.
 * @param {string} texto
 * @returns {{sql: string, linea: number, desde: number, hasta: number}[]}
 *   `linea` es la del primer carácter que no es blanco ni comentario; `desde`/`hasta`, los
 *   índices del texto (hasta exclusivo, sin el `;`).
 */
export function partirSql(texto) {
  const n = texto.length;
  const linea = indiceDeLineas(texto);
  const salida = [];
  let i = 0, primero = -1, atomico = 0, anterior = '';

  const cerrar = fin => {
    if (primero !== -1) {
      const sql = texto.slice(primero, fin).trimEnd();
      salida.push({ sql, linea: linea(primero), desde: primero, hasta: primero + sql.length });
    }
    primero = -1; atomico = 0; anterior = '';
  };

  while (i < n) {
    const c = texto[i], c2 = texto[i + 1];
    if (c === '-' && c2 === '-') { while (i < n && texto[i] !== '\n') i++; continue; }          // comentario de línea
    if (c === '/' && c2 === '*') {                                                                // comentario de bloque (anida)
      let prof = 1; i += 2;
      while (i < n && prof > 0) {
        if (texto[i] === '/' && texto[i + 1] === '*') { prof++; i += 2; }
        else if (texto[i] === '*' && texto[i + 1] === '/') { prof--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }

    // El `;` va antes de marcar el principio de sentencia: un `;;` no abre una sentencia vacía.
    // Dentro de BEGIN ATOMIC … END el `;` es de una sentencia del cuerpo y no cierra la de afuera.
    if (c === ';') { if (atomico === 0) cerrar(i); i++; anterior = ''; continue; }
    if (primero === -1) primero = i;

    if (c === "'") {                                    // texto; en E'…' el \ escapa
      const previo = texto[i - 1];
      const conEscapes = (previo === 'E' || previo === 'e') && (i < 2 || !/[\p{L}\p{M}\p{N}_$]/u.test(texto[i - 2]));
      i++;
      while (i < n) {
        if (conEscapes && texto[i] === '\\') { i += 2; continue; }
        if (texto[i] === "'") { if (texto[i + 1] === "'") { i += 2; continue; } break; }
        i++;
      }
      i++; anterior = ''; continue;
    }
    if (c === '"') {                                    // identificador entrecomillado
      i++;
      while (i < n) {
        if (texto[i] === '"') { if (texto[i + 1] === '"') { i += 2; continue; } break; }
        i++;
      }
      i++; anterior = ''; continue;
    }
    if (c === '$') {                                    // $$ … $$ o $etiqueta$ … $etiqueta$ ($1 no es una de ellas)
      RE_ETIQUETA_DOLAR.lastIndex = i;
      const m = RE_ETIQUETA_DOLAR.exec(texto);
      if (m) {
        const fin = texto.indexOf(m[0], i + m[0].length);
        i = fin === -1 ? n : fin + m[0].length;
      } else i++;
      anterior = ''; continue;
    }
    RE_PALABRA.lastIndex = i;
    const w = RE_PALABRA.exec(texto);
    if (w) {                                            // palabra: se come entera (un `$` adentro no abre nada)
      const p = w[0].toLowerCase();
      if (atomico > 0) { if (p === 'case') atomico++; else if (p === 'end') atomico--; }
      else if (p === 'atomic' && anterior === 'begin') atomico = 1;
      anterior = p;
      i += w[0].length; continue;
    }
    anterior = ''; i++;
  }
  cerrar(n);
  return salida;
}

/* Las sentencias que mueven la transacción no se repiten al buscar un fallo: un COMMIT
   dejaría hecho lo que el intento por localizar debía deshacer. */
const esControlDeTransaccion = s => /^(begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction)\b/i.test(s.trim());

/* ============================ Estado y cola ============================ */

/* Por cada base: con qué se creó (para clonarla) y su cola de peticiones. */
const ESTADO = new WeakMap();
const dentroDe = new AsyncLocalStorage();

function estadoDe(db) {
  const st = ESTADO.get(db);
  if (!st) throw new Error('Esta base no la creó crearBase() de arnes.mjs; como(), sql() y compañía solo saben trabajar con las que sí.');
  return st;
}

/* Todo lo que sale de aquí es una promesa, también los errores de uso: una función que a
   veces lanza y a veces devuelve una promesa rechazada obliga a escribir dos try/catch. */
function enCola(db, fn) {
  let st;
  try { st = estadoDe(db); } catch (e) { return Promise.reject(e); }
  if (dentroDe.getStore() === db) {
    return Promise.reject(new Error('Reentrada: se llamó a como()/sql() sobre la misma base DESDE DENTRO de una transacción (o de otra petición) ' +
      'de esa base. Esperaría a la cola que ella misma está ocupando y la prueba se colgaría. Dentro de transaccion() usa solo el objeto `t` que recibe.'));
  }
  const turno = st.cola.then(() => dentroDe.run(db, fn));
  st.cola = turno.then(() => {}, () => {});          // un fallo no rompe la cola
  return turno;
}

/* Si algo dejó la conexión dentro de una transacción (un archivo con BEGIN sin COMMIT, una
   sentencia que falló a medias), se deshace. `isInTransaction` es verdadero también con la
   transacción abortada, que es cuando más falta hace. */
async function salirDeTransaccion(db) {
  if (db.isInTransaction()) { try { await db.exec('rollback'); } catch { /* ya no hay nada que deshacer */ } }
}

/* Fija la autorización de sesión al superusuario con un valor EXPLÍCITO. Es lo que hace que
   un `SET LOCAL SESSION AUTHORIZATION` posterior se revierta solo al terminar la transacción
   (ver «una trampa de PGlite» arriba), y de paso devuelve el rol activo a `postgres`. */
const fijarAutorizacion = db => db.exec(`set session authorization ${SUPERUSUARIO}`);

/* Lo que se deshace al terminar CADA petición, en este orden:
     1. un ROLLBACK, si algo dejó una transacción abierta;
     2. DISCARD ALL: variables de sesión (RESET ALL: vuelven el search_path y la zona horaria
        de arranque), tablas temporales, sentencias preparadas, bloqueos consultivos y cursores.
        No puede ir dentro de una transacción ni en un texto de varias sentencias;
     3. la autorización de sesión, AL FINAL: DISCARD ALL la devuelve a su valor base NULL (que
        en PGlite no restaura nada), así que va después, para que la próxima petición encuentre
        un valor explícito. Y ni DISCARD ALL ni un ROLLBACK la arreglan si una prueba la cambió
        a mano (`set session authorization …` confirmado): esto sí. */
async function limpiarSesion(db) {
  await salirDeTransaccion(db);
  await db.exec('discard all');
  await fijarAutorizacion(db);
}

/* ============================ Crear la base ============================ */

/* PGlite arranca con `search_path=public` y con la zona horaria del equipo. Se cambian por
   las de Supabase en los parámetros de arranque y no con un SET: lo que va en la línea de
   comandos es también el valor al que vuelve `RESET ALL` / `DISCARD ALL`, que corren después
   de cada petición. Se parte de los parámetros por defecto de PGlite (no se copian a mano) y
   solo se tocan esos dos. */
function paramsDeArranque() {
  const p = [...PGlite.defaultStartParams];
  const poner = (nombre, valor) => {
    const i = p.findIndex(x => x.toLowerCase().startsWith(nombre + '='));
    if (i === -1) p.push('-c', `${nombre}=${valor}`); else p[i] = `${nombre}=${valor}`;
  };
  poner('search_path', SEARCH_PATH_BASE);
  poner('timezone', 'UTC');
  return p;
}

async function cargarExtensiones(nombres) {
  const r = { pgcrypto };
  for (const n of nombres) {
    if (!/^[a-z0-9_]+$/.test(n)) throw new Error(`crearBase: nombre de extensión no válido «${n}»`);
    if (n === 'pgcrypto') continue;
    let mod;
    try { mod = await import(`@electric-sql/pglite/contrib/${n}`); }
    catch (e) { throw new Error(`crearBase: PGlite no trae la extensión «${n}» (@electric-sql/pglite/contrib/${n}): ${e.code ?? e.message}`); }
    const ext = mod[n] ?? Object.values(mod).find(v => v && typeof v.setup === 'function');
    if (!ext) throw new Error(`crearBase: @electric-sql/pglite/contrib/${n} no exporta una extensión`);
    r[n] = ext;
  }
  return r;
}

/* Rutas: absolutas se respetan; relativas se cuentan desde supabase/tests/ (no desde el
   directorio de donde se lanzó node, que cambia según quién corra la prueba) para que
   `'../migrations'` sea siempre supabase/migrations. También se acepta un URL. */
function resolverRuta(r) {
  if (r instanceof URL) return fileURLToPath(r);
  if (typeof r === 'string' && r.startsWith('file:')) return fileURLToPath(r);
  return isAbsolute(r) ? r : resolve(RAIZ_PRUEBAS, r);
}

/* Los *.sql de una carpeta, en orden alfabético por nombre (como las aplica Supabase: el
   prefijo AAAAMMDDHHMMSS_ las ordena). Orden por unidades de código, no por idioma: da lo
   mismo en cualquier máquina. Un archivo suelto se devuelve tal cual. */
function listarSql(ruta, rol) {
  const dir = resolverRuta(ruta);
  let st;
  try { st = statSync(dir); }
  catch (e) { throw new Error(`crearBase: ${rol} «${dir}» no existe (${e.code ?? e.message}). Las rutas relativas se cuentan desde supabase/tests/.`); }
  if (!st.isDirectory()) return [dir];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.toLowerCase().endsWith('.sql'))
    .map(d => d.name).sort()
    .map(nombre => join(dir, nombre));
}

function leerSql(ruta) {
  let t;
  try { t = readFileSync(ruta, 'utf8'); }
  catch (e) { throw new Error(`No se pudo leer el archivo SQL «${ruta}»: ${e.code ?? e.message}`); }
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;          // la marca BOM de algunos editores de Windows
}

/* Ejecuta el archivo ENTERO con el analizador de Postgres (una sola transacción implícita,
   como `supabase db push`: o entra todo o no entra nada). Solo si falla se busca dónde. */
async function cargarArchivo(db, ruta) {
  const texto = leerSql(ruta);
  try { await db.exec(texto); }
  catch (e) {
    if (!esErrorPG(e)) throw e;
    const origen = comoErrorDeBase(e, texto);
    await salirDeTransaccion(db);
    const donde = await ubicarFallo(db, texto, origen).catch(() => ({ linea: null, sentencia: null }));
    throw new ErrorDeMigracion({ archivo: basename(ruta), ruta, linea: donde.linea, sentencia: donde.sentencia, origen });
  }
  // Un BEGIN sin su COMMIT no da ningún error de Postgres: deja la conexión dentro de una
  // transacción que nadie va a cerrar, y lo que hizo el archivo se perdería al deshacerla sin
  // decir nada (la migración siguiente fallaría por «no existe» sin que se vea por qué). Se
  // dice aquí, señalando el último BEGIN, que es casi siempre el culpable.
  if (db.isInTransaction()) {
    await salirDeTransaccion(db);
    const ultimoBegin = partirSql(texto).filter(s => /^(begin|start\s+transaction)\b/i.test(s.sql)).at(-1);
    const origen = new ErrorDeBase('el archivo terminó con una transacción abierta (¿falta un COMMIT?) y se deshizo todo lo suyo', { codigo: '25001' });
    throw new ErrorDeMigracion({ archivo: basename(ruta), ruta, linea: ultimoBegin ? ultimoBegin.linea : null, sentencia: ultimoBegin ? ultimoBegin.sql : null, origen });
  }
}

/* ¿Dónde falló este texto? Con la posición de Postgres, si la dio; si no, repitiendo las
   sentencias de una en una dentro de una transacción que se deshace (el texto entero ya se
   deshizo al fallar, así que se parte del mismo estado y falla en la misma sentencia).
   Eso último solo vale si el estado de partida es el mismo, y no lo es cuando el archivo trae
   sus propios BEGIN/COMMIT y una parte se confirmó antes del fallo: repetir esa parte falla
   por OTRA razón («ya existe…»). Por eso la sentencia que falla en la repetición tiene que
   fallar IGUAL que el original (mismo sqlstate y mismo mensaje); si no, el estado divergió
   y se informa el archivo sin línea: una línea inventada es peor que ninguna. */
async function ubicarFallo(db, texto, error) {
  const sentencias = partirSql(texto);
  if (error.posicion) {
    // La posición de Postgres cuenta caracteres (no unidades UTF-16): se pasa a índice del texto.
    const indice = [...texto].slice(0, error.posicion - 1).join('').length;
    const s = sentencias.find(x => indice >= x.desde && indice <= x.hasta);
    return { linea: indiceDeLineas(texto)(indice), sentencia: s ? s.sql : null };
  }
  const sinUbicar = { linea: null, sentencia: null };
  await db.exec('begin');
  try {
    for (const s of sentencias) {
      if (esControlDeTransaccion(s.sql)) continue;
      try { await db.exec(s.sql); }
      catch (e) {
        return e && e.code === error.codigo && e.message === error.message ? { linea: s.linea, sentencia: s.sql } : sinUbicar;
      }
    }
    return sinUbicar;
  } finally { await salirDeTransaccion(db); }
}

/**
 * Crea una base de PGlite con el shim de Supabase y las migraciones.
 * Orden de carga: shim → `antes` → migraciones (alfabético) → `extra`.
 *
 * @param {object} [opciones]
 * @param {string|URL} [opciones.migraciones]  carpeta con los *.sql. Relativa a supabase/tests/
 *        (`'../migrations'` es supabase/migrations). Sin ella, solo se carga el shim.
 * @param {string|URL|(string|URL)[]} [opciones.extra]  archivo(s) .sql (o carpetas) que se cargan DESPUÉS
 *        de las migraciones: semillas, datos de prueba comunes.
 * @param {string|URL|(string|URL)[]} [opciones.antes]  archivo(s) .sql (o carpetas) que se cargan ANTES de
 *        las migraciones: dobles de lo que el shim no trae (un `cron.schedule` de mentiras, un esquema
 *        `vault`…) para que migraciones que lo nombran no truenen.
 * @param {string|string[]} [opciones.extensiones]  contribs de PGlite además de pgcrypto (`['uuid_ossp', 'citext']`);
 *        la migración sigue haciendo su propio `create extension … with schema extensions`.
 * @returns {Promise<PGlite>}
 * @throws {ErrorDeMigracion} si un archivo falla: dice cuál, en qué línea y con qué sentencia.
 */
export async function crearBase({ migraciones, extra, antes, extensiones } = {}) {
  // Todo lo que se puede comprobar sin base se comprueba antes de arrancarla: una ruta mal
  // escrita falla al instante y no después de segundo y medio de WASM. Cada opción acepta un
  // valor suelto o una lista.
  const lista = x => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
  const archivos = [
    ...lista(antes).flatMap(r => listarSql(r, 'el archivo previo')),
    ...lista(migraciones).flatMap(r => listarSql(r, 'la carpeta de migraciones')),
    ...lista(extra).flatMap(r => listarSql(r, 'el archivo extra')),
  ];
  const exts = await cargarExtensiones(lista(extensiones));
  const startParams = paramsDeArranque();
  const db = new PGlite({ extensions: exts, startParams });
  await db.waitReady;
  ESTADO.set(db, { extensiones: exts, startParams, cola: Promise.resolve() });
  try {
    await fijarAutorizacion(db);
    await cargarArchivo(db, RUTA_SHIM);
    for (const f of archivos) await cargarArchivo(db, f);
    // Lo que una migración dejó a nivel de sesión (un `set search_path`…) no existe en producción
    // para las peticiones, que no comparten la conexión de la migración: se limpia antes de entregarla.
    await limpiarSesion(db);
  } catch (e) {
    await db.close().catch(() => {});                // no dejar instancias de WASM colgadas por una migración rota
    throw e;
  }
  return db;
}

/**
 * Una copia independiente de una base ya armada (shim + migraciones + lo que se le haya
 * sembrado y confirmado). Arrancar PGlite y correr 30 migraciones tarda segundos; copiar
 * una base ya hecha, unos 0,3 s: para suites con muchas pruebas que modifican datos, se
 * arma UNA plantilla y cada prueba trabaja con su copia.
 * @param {PGlite} db
 * @returns {Promise<PGlite>}
 */
export async function clonarBase(db) {
  const st = estadoDe(db);
  return enCola(db, async () => {
    await salirDeTransaccion(db);
    const tarball = await db.dumpDataDir('none');
    // No se usa `db.clone()` de PGlite porque la copia nace sin los parámetros de arranque
    // (volvería a `search_path=public`).
    const copia = new PGlite({ loadDataDir: tarball, extensions: st.extensiones, startParams: st.startParams });
    await copia.waitReady;
    ESTADO.set(copia, { extensiones: st.extensiones, startParams: st.startParams, cola: Promise.resolve() });
    await fijarAutorizacion(copia);
    return copia;
  });
}

/* ======================= Filas, superusuario, usuarios ======================= */

/* Las filas, como un arreglo corriente (se compara con igual() sin ruido), y lo demás que
   cuenta el resultado colgado como propiedades que no se enumeran: `afectadas` es lo que
   interesa en una política que filtra un UPDATE sin dar error (0 filas afectadas). */
function aFilas(r) {
  const filas = r.rows;
  Object.defineProperties(filas, {
    afectadas: { value: r.affectedRows ?? 0 },
    comando: { value: r.command },
    campos: { value: r.fields },
  });
  return filas;
}

/**
 * Corre SQL como superusuario (`postgres`): semillas, datos de prueba, cambios de esquema.
 * Sin `params` acepta varias sentencias y devuelve las filas de la última; con `params`
 * es una sola. NO limpia la sesión después: lo que se fije a nivel de sesión (un `set
 * session_replication_role = replica` para sembrar sin disparadores) sigue vigente hasta
 * que se deshaga a mano.
 * @param {PGlite} db
 * @param {string} texto
 * @param {any[]} [params]
 * @returns {Promise<any[]>}
 */
export function sql(db, texto, params) {
  return enCola(db, async () => {
    try {
      if (params !== undefined) return aFilas(await db.query(texto, params));
      const rs = await db.exec(texto);
      return aFilas(rs[rs.length - 1] ?? { rows: [] });
    } catch (e) {
      if (!esErrorPG(e)) throw e;
      const err = comoErrorDeBase(e, texto);
      if (params === undefined) {                                        // con params es UNA sentencia: no hay qué localizar
        await salirDeTransaccion(db);
        const donde = await ubicarFallo(db, texto, err).catch(() => ({ linea: null, sentencia: null }));
        err.linea = donde.linea; err.sentencia = donde.sentencia;
      }
      throw err;
    }
  });
}

/**
 * Da de alta un usuario en `auth.users`, como lo dejaría GoTrue tras entrar con Google:
 * con los disparadores de la migración activos (un alta de perfil, por ejemplo).
 * @param {PGlite} db
 * @param {{uid?: string, correo?: string, verificado?: boolean, metadatos?: object}} [datos]
 * @returns {Promise<{uid: string, correo: string, verificado: boolean}>}  listo para `como(db, {rol: 'authenticated', ...usuario})`
 */
export async function crearUsuarioAuth(db, { uid, correo, verificado = true, metadatos = {} } = {}) {
  const id = uid ?? crypto.randomUUID();
  if (!RE_UUID.test(id)) throw new Error(`crearUsuarioAuth: uid «${id}» no es un uuid`);
  const email = correo ?? id.slice(0, 8) + '@pruebas.invalid';           // .invalid está reservado: nunca es un buzón de verdad
  await sql(db,
    `insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
     values ($1, 'authenticated', 'authenticated', $2, case when $3::boolean then now() end, $4::jsonb, $5::jsonb)`,
    [id, email, verificado, JSON.stringify({ provider: 'google', providers: ['google'] }),
     JSON.stringify({ email, email_verified: verificado, ...metadatos })]);
  return { uid: id, correo: email, verificado };
}

/* ============================ Sesiones: como() ============================ */

/* Los claims de un JWT de Supabase, con la forma que tienen de verdad. Se ponen SOLO los que
   existen allá: añadir uno cómodo que producción no trae (un `email_verified` en la raíz, que
   en Supabase vive en `user_metadata`) haría pasar aquí una política que allá fallaría. */
function construirClaims({ rol, sub, correo, verificado, claims }) {
  const iat = Math.floor(Date.now() / 1000);
  let base;
  if (rol === 'authenticated') {
    base = {
      iss: 'https://proyecto-de-pruebas.supabase.co/auth/v1', sub, aud: 'authenticated', iat, exp: iat + 3600,
      ...(correo ? { email: correo } : {}),
      phone: '',
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { ...(correo ? { email: correo, email_verified: verificado ?? true } : {}) },
      role: 'authenticated', aal: 'aal1', amr: [{ method: 'oauth', timestamp: iat }],
      session_id: crypto.randomUUID(), is_anonymous: false,
    };
  } else {
    // La llave anon y la service_role son JWT sin usuario: solo dicen quién eres.
    base = { iss: 'supabase', ref: 'proyecto-de-pruebas', role: rol, iat, exp: iat + 3600, ...(sub ? { sub } : {}) };
  }
  return { ...base, ...(claims ?? {}) };
}

function normalizarSesion(opciones) {
  const { rol = 'authenticated', sub, uid, correo, verificado, claims, cabeceras, confirmar = false } = opciones;
  if (!ROLES.includes(rol)) throw new Error(`como(): el rol «${rol}» no es uno de los que usa PostgREST (${ROLES.join(', ')})`);
  const idUsuario = sub ?? uid;
  if (rol === 'authenticated' && !idUsuario) throw new Error('como(): el rol authenticated necesita `sub` (el uuid del usuario; crearUsuarioAuth lo devuelve como `uid`)');
  if (rol === 'anon' && idUsuario) throw new Error('como(): el rol anon no tiene usuario; quita `sub`');
  if (idUsuario && !RE_UUID.test(idUsuario)) throw new Error(`como(): sub «${idUsuario}» no es un uuid (auth.uid() lo castea y tronaría)`);
  const completos = construirClaims({ rol, sub: idUsuario, correo, verificado, claims });
  const cab = Object.fromEntries(Object.entries(cabeceras ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    rol, sub: completos.sub ?? '', correo, confirmar: !!confirmar,
    claims: completos, json: JSON.stringify(completos), cabeceras: JSON.stringify(cab),
    original: opciones,
  };
}

/* Abre la petición dentro de la transacción: primero lo de PostgREST (claims y search_path)
   y luego el cambio de rol. Todo LOCAL, así que se va con la transacción. El rol va
   interpolado (SET ROLE no admite parámetros) pero ya pasó por la lista blanca de ROLES. */
async function prepararPeticion(tx, cfg) {
  await tx.query(
    `select set_config('request.jwt.claims', $1, true),
            set_config('request.jwt.claim.sub', $2, true),
            set_config('request.headers', $3, true),
            set_config('search_path', $4, true)`,
    [cfg.json, cfg.sub, cfg.cabeceras, SEARCH_PATH_PETICION]);
  await tx.exec(`set local session authorization ${ROL_CONEXION}`);
  await tx.exec(`set local role ${cfg.rol}`);
}

/* El final de la petición, antes de que PGlite confirme o deshaga:
   - Sin confirmar, un COMMIT habría revisado las restricciones DEFERRABLE INITIALLY DEFERRED;
     un ROLLBACK a secas no, y una violación de ese tipo pasaría en la prueba y fallaría en
     producción: se fuerzan (`set constraints all immediate`) y luego se deshace.
   - Confirmando, el COMMIT de una transacción ABORTADA no da error: la deshace en silencio.
     La prueba creería que lo suyo persistió. Se sondea con un `select 1` para avisar.
   Una transacción abortada aquí es siempre el mismo descuido: un error de Postgres atrapado
   dentro de transaccion() sin SAVEPOINT (Postgres ignora todo lo que sigue hasta el ROLLBACK). */
async function cerrarPeticion(tx, confirmar) {
  const sonda = confirmar ? 'select 1' : 'set constraints all immediate';
  try { await tx.exec(sonda); }
  catch (e) {
    if (e && e.code === '25P02') {
      throw new Error('La petición terminó con la transacción abortada: un error de Postgres se atrapó dentro de ' +
        'transaccion() sin SAVEPOINT' + (confirmar ? ', así que el COMMIT habría deshecho todo en silencio' : '') +
        '. Para probar una sentencia que debe fallar sin abortar todo, usa t.intentar().');
    }
    throw comoErrorDeBase(e, sonda);
  }
  if (!confirmar) await tx.rollback();
}

/* Una petición completa, de principio a fin, en la cola de la base. */
function peticion(db, cfg, cuerpo, confirmar) {
  return enCola(db, async () => {
    if (db.isInTransaction()) {
      throw new Error('La base tiene una transacción abierta (¿un sql() con BEGIN y sin COMMIT?). Ciérrala antes de abrir una sesión: ' +
        'como() abre la suya y las dos se estorbarían.');
    }
    let valor, fallo = null;
    try {
      valor = await db.transaction(async tx => {
        await prepararPeticion(tx, cfg);
        const v = await cuerpo(tx);
        await cerrarPeticion(tx, confirmar);
        return v;
      });
    } catch (e) { fallo = e ?? new Error('fallo sin detalle'); }
    await limpiarSesion(db);                         // pase lo que pase, antes de soltar la cola
    if (fallo) throw comoErrorDeBase(fallo);
    return valor;
  });
}

async function consulta(tx, texto, params) {
  try { return aFilas(await tx.query(texto, params ?? [])); }
  catch (e) {
    const err = comoErrorDeBase(e, texto);
    if (err.codigo === '42601' && /multiple commands/i.test(err.message)) {
      err.pista = 'query() corre UNA sentencia por llamada. Para varias, usa transaccion() y un t.query() por sentencia.';
    }
    throw err;
  }
}

const resumenDeError = e => ({ codigo: e.codigo, mensaje: e.message, detalle: e.detalle, pista: e.pista, tabla: e.tabla, restriccion: e.restriccion, columna: e.columna });

/* Cómo viaja cada argumento de rpc(). Un objeto (`{a: 1}`) solo puede ser JSON: se serializa
   AQUÍ, así que llega igual a un parámetro jsonb que a uno text (a PostgREST le pasa lo mismo:
   un objeto JSON en un parámetro de texto llega como su texto JSON); si se lo dejara a PGlite,
   un parámetro text recibiría «[object Object]» sin avisar. Los arreglos se dejan a PGlite,
   que sabe si el parámetro es jsonb o text[]. Un TEXTO para un jsonb se toma por JSON ya
   escrito; para mandar el texto «hola» como JSON, JSON.stringify('hola'). */
const aParametro = v => {
  if (v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !ArrayBuffer.isView(v)) {
    return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));
  }
  return v;
};

/* `rpc('autorizar', {folio: 'COT-1', datos: {a: 1}})` → select * from "public"."autorizar"("folio" => $1, "datos" => $2).
   Con argumentos con nombre, como PostgREST: el orden da igual y los que tienen valor por
   omisión se pueden callar. */
function construirRpc(nombre, args) {
  const m = /^(?:([A-Za-z_][A-Za-z0-9_]*)\.)?([A-Za-z_][A-Za-z0-9_]*)$/.exec(nombre);
  if (!m) throw new Error(`rpc(): «${nombre}» no es un nombre de función (esquema.nombre o nombre)`);
  const claves = Object.keys(args ?? {});
  for (const k of claves) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`rpc(): «${k}» no es un nombre de argumento válido`);
  const params = claves.map(k => aParametro(args[k]));
  return {
    texto: `select * from "${m[1] ?? 'public'}"."${m[2]}"(${claves.map((k, i) => `"${k}" => $${i + 1}`).join(', ')})`,
    params,
  };
}

/**
 * Una sesión «como PostgREST»: cada llamada es UNA petición, en su propia transacción, con
 * el rol y los claims indicados. Por omisión se DESHACE al terminar (las pruebas no se
 * contaminan entre sí); con `confirmar: true` se confirma y persiste.
 *
 * @param {PGlite} db  la que devolvió crearBase()
 * @param {object} opciones
 * @param {'anon'|'authenticated'|'service_role'} [opciones.rol='authenticated']
 * @param {string} [opciones.sub]       uuid del usuario (obligatorio con authenticated). También se acepta `uid`.
 * @param {string} [opciones.correo]    va al claim `email` y a `user_metadata.email`
 * @param {boolean} [opciones.verificado]  `user_metadata.email_verified` (verdadero si hay correo)
 * @param {object} [opciones.claims]    claims extra o que pisan a los de siempre (superficial)
 * @param {object} [opciones.cabeceras] cabeceras HTTP, a `request.headers` (llaves en minúsculas)
 * @param {boolean} [opciones.confirmar=false]  confirmar en vez de deshacer, como valor por omisión de la sesión
 */
export function como(db, opciones = {}) {
  estadoDe(db);                                       // falla ya, no hasta la primera consulta
  const cfg = normalizarSesion(opciones);
  const porOmision = o => (o && o.confirmar !== undefined ? !!o.confirmar : cfg.confirmar);

  const sesion = {
    rol: cfg.rol,
    sub: cfg.sub || null,
    get claims() { return structuredClone(cfg.claims); },

    /** Una sentencia. Devuelve las filas (con `.afectadas` y `.comando`); lanza ErrorDeBase si Postgres falla. */
    query: (texto, params, opts) => peticion(db, cfg, tx => consulta(tx, texto, params), porOmision(opts)),

    /** Igual, pero NO lanza: `{ok, filas, afectadas, error: {codigo, mensaje, …}}`. Solo atrapa errores de Postgres. */
    async intentar(texto, params, opts) {
      try { const filas = await sesion.query(texto, params, opts); return { ok: true, filas, afectadas: filas.afectadas, error: null }; }
      catch (e) { if (!(e instanceof ErrorDeBase)) throw e; return { ok: false, filas: [], afectadas: 0, error: resumenDeError(e) }; }
    },

    /** Llama a una función con argumentos con nombre, como `/rpc/<nombre>` de PostgREST. */
    async rpc(nombre, args, opts) { const r = construirRpc(nombre, args); return sesion.query(r.texto, r.params, opts); },

    /**
     * Varias sentencias en UNA misma petición (una transacción): lo que una sentencia hace lo
     * ve la siguiente. `fn` recibe `t` con `query`, `intentar` y `rpc`; no se debe llamar a
     * sql() ni a otra sesión de la misma base desde dentro.
     */
    transaccion: (fn, opts) => peticion(db, cfg, tx => fn(sesionEnTransaccion(tx)), porOmision(opts)),

    /** La misma sesión con otras opciones (`s.con({confirmar: true})`, `s.con({correo: …})`). */
    con: cambios => como(db, { ...cfg.original, ...cambios }),
  };
  return sesion;
}

/* El `t` de transaccion(): comparte la transacción abierta. `intentar` usa un SAVEPOINT para
   que una sentencia que falla no aborte la petición entera (Postgres ignora todo lo que
   sigue a un error hasta el ROLLBACK). */
function sesionEnTransaccion(tx) {
  let n = 0;
  const t = {
    query: (texto, params) => consulta(tx, texto, params),
    async intentar(texto, params) {
      const sp = 'arnes_intento_' + (++n);
      await tx.exec(`savepoint ${sp}`);
      try {
        const filas = await consulta(tx, texto, params);
        await tx.exec(`release savepoint ${sp}`);
        return { ok: true, filas, afectadas: filas.afectadas, error: null };
      } catch (e) {
        if (!(e instanceof ErrorDeBase)) throw e;
        await tx.exec(`rollback to savepoint ${sp}`);
        await tx.exec(`release savepoint ${sp}`);
        return { ok: false, filas: [], afectadas: 0, error: resumenDeError(e) };
      }
    },
    async rpc(nombre, args) { const r = construirRpc(nombre, args); return consulta(tx, r.texto, r.params); },
  };
  return t;
}

/* ================================ Auditoría ================================ */

/* Lo que una migración puede dejar mal y que ninguna prueba de comportamiento nota hasta
   que alguien lo explota. Son las reglas de docs/DECISIONES-SUPABASE.md, sección A:
   RLS en toda tabla, vistas con security_invoker, SECURITY DEFINER con search_path fijo y
   ninguna función ejecutable por anon salvo las públicas a propósito. */

const EXCLUIR_DE_EXTENSION = (clase, alias) =>
  `not exists (select 1 from pg_depend d where d.classid = '${clase}'::regclass and d.objid = ${alias}.oid and d.deptype = 'e')`;

const SQL_AUDITORIA = {
  // Tablas ordinarias y particionadas (una partición consultada directo NO hereda la política de la madre).
  tablasSinRLS: `
    select n.nspname || '.' || c.relname as nombre
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = any ($1::text[]) and c.relkind in ('r', 'p') and not c.relrowsecurity
       and ${EXCLUIR_DE_EXTENSION('pg_class', 'c')}
     order by 1`,
  vistasSinInvoker: `
    select n.nspname || '.' || c.relname as nombre
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = any ($1::text[]) and c.relkind = 'v'
       and not coalesce((select o.option_value::boolean from pg_options_to_table(c.reloptions) o
                          where o.option_name = 'security_invoker'), false)
       and ${EXCLUIR_DE_EXTENSION('pg_class', 'c')}
     order by 1`,
  // Una vista materializada no admite ni RLS ni security_invoker: quien la pueda leer lee todo.
  matviewsExpuestas: `
    select n.nspname || '.' || c.relname as nombre
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = any ($1::text[]) and c.relkind = 'm'
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
       and ${EXCLUIR_DE_EXTENSION('pg_class', 'c')}
     order by 1`,
  definerSinSearchPath: `
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nombre
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = any ($1::text[]) and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
       and ${EXCLUIR_DE_EXTENSION('pg_proc', 'p')}
     order by 1`,
  // `has_function_privilege` ve TODO (directo, por PUBLIC o por membresía); el detalle de quién
  // se lo dio sale del ACL, y una función sin ACL (NULL) tiene el de por defecto: PUBLIC la ejecuta.
  funcionesAbiertas: `
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nombre,
           array_remove(array[
             case when exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'PUBLIC' end,
             case when exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                where a.grantee = 'anon'::regrole::oid and a.privilege_type = 'EXECUTE') then 'anon' end
           ], null) as via
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = any ($1::text[]) and has_function_privilege('anon', p.oid, 'EXECUTE')
       and ${EXCLUIR_DE_EXTENSION('pg_proc', 'p')}
     order by 1`,
};

function permitida(lista, nombre) {
  const sinArgumentos = nombre.replace(/\(.*\)$/s, '');
  return (lista ?? []).some(p => p === nombre || p === sinArgumentos);
}

/**
 * Revisa que la base cumpla las reglas de seguridad del proyecto y devuelve lo que no.
 * No lanza: devuelve el reporte; `exigirAuditoriaLimpia()` es la versión que sí lanza.
 *
 * @param {PGlite} db
 * @param {object} [opciones]
 * @param {string[]} [opciones.esquemas=['public','interno']]  donde se exige RLS, security_invoker y search_path
 * @param {string[]} [opciones.expuestos=['public']]           donde ninguna función puede ser ejecutable por anon
 * @param {{tablas?: string[], vistas?: string[], definer?: string[], funciones?: string[]}} [opciones.permitir]
 *        excepciones a propósito, como `'public.verificar_pdf'` (todas las sobrecargas) o
 *        `'public.verificar_pdf(codigo text)'` (una). Las de `funciones` son las públicas de verdad.
 * @returns {Promise<{ok: boolean, total: number,
 *   tablasSinRLS: string[], vistasSinSecurityInvoker: string[], vistasMaterializadasExpuestas: string[],
 *   funcionesDefinerSinSearchPath: string[], funcionesEjecutablesPorAnon: {funcion: string, via: string[]}[]}>}
 */
export async function auditarRLS(db, { esquemas = ['public', 'interno'], expuestos = ['public'], permitir = {} } = {}) {
  const pedir = async (clave, lista) => (await sql(db, SQL_AUDITORIA[clave], [lista]));
  // Se ordena aquí y no solo en el SQL: el orden de `order by` depende del collation de la base
  // y estos reportes se comparan con `igual()`. Por unidades de código, igual en cualquier máquina.
  const porNombre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const nombres = async (clave, excepciones) =>
    (await pedir(clave, esquemas)).map(f => f.nombre).filter(n => !permitida(excepciones, n)).sort(porNombre);

  const tablasSinRLS = await nombres('tablasSinRLS', permitir.tablas);
  const vistasSinSecurityInvoker = await nombres('vistasSinInvoker', permitir.vistas);
  const vistasMaterializadasExpuestas = await nombres('matviewsExpuestas', permitir.vistas);
  const funcionesDefinerSinSearchPath = await nombres('definerSinSearchPath', permitir.definer);
  const funcionesEjecutablesPorAnon = (await pedir('funcionesAbiertas', expuestos))
    .filter(f => !permitida(permitir.funciones, f.nombre))
    .map(f => ({ funcion: f.nombre, via: f.via.length ? f.via : ['membresía de otro rol'] }))
    .sort((a, b) => porNombre(a.funcion, b.funcion));

  const total = tablasSinRLS.length + vistasSinSecurityInvoker.length + vistasMaterializadasExpuestas.length +
                funcionesDefinerSinSearchPath.length + funcionesEjecutablesPorAnon.length;
  return { ok: total === 0, total, tablasSinRLS, vistasSinSecurityInvoker, vistasMaterializadasExpuestas, funcionesDefinerSinSearchPath, funcionesEjecutablesPorAnon };
}

/** El reporte de auditarRLS() en texto legible, con qué hacer en cada caso. Vacío si todo está bien. */
export function describirAuditoria(r) {
  if (r.ok) return '';
  const l = ['Auditoría de seguridad: ' + r.total + ' hallazgo(s)'];
  const grupo = (titulo, remedio, lista) => { if (lista.length) l.push(`  · ${titulo} (${remedio}): ${lista.join(', ')}`); };
  grupo('Tablas sin RLS', 'alter table … enable row level security', r.tablasSinRLS);
  grupo('Vistas sin security_invoker', 'create view … with (security_invoker = true)', r.vistasSinSecurityInvoker);
  grupo('Vistas materializadas legibles por anon/authenticated', 'no admiten RLS: revoca el select o no las expongas', r.vistasMaterializadasExpuestas);
  grupo('SECURITY DEFINER sin search_path', "set search_path = ''", r.funcionesDefinerSinSearchPath);
  grupo('Funciones ejecutables por anon', 'revoke all on function … from public, anon', r.funcionesEjecutablesPorAnon.map(f => `${f.funcion} [${f.via.join('+')}]`));
  return l.join('\n');
}

/** Como auditarRLS(), pero LANZA si hay algo (el mensaje es describirAuditoria). Para una sola línea en una suite. */
export async function exigirAuditoriaLimpia(db, opciones) {
  const r = await auditarRLS(db, opciones);
  if (!r.ok) throw new ErrorDeAuditoria(describirAuditoria(r), r);
  return r;
}
