/* ============================================================================
   EL MINI MARCO DE PRUEBAS.

   Las pruebas de node del repo (pruebas/ics.mjs, pruebas/notario.mjs) son scripts sueltos:
   un contador de fallos, `bien()` y `mal()`, y un `process.exit(fallos ? 1 : 0)` al final.
   Funciona porque cada verificación es síncrona y el script se lee de arriba abajo. Las de
   base de datos no: casi todo es `await`, una base cuesta un segundo en arrancar, y un
   `await` olvidado hace que dos pruebas corran a la vez contra la misma conexión y se
   estorben de una forma que no se parece en nada a la causa. Este archivo pone lo mínimo
   para eso, sin traer un marco de pruebas entero:

   - `bien()` y `mal()` son los de siempre (y cuentan), para quien quiera escribir al estilo
     del resto del repo.
   - `describir()` y `prueba()` se declaran SIN `await`: cada `prueba()` se encadena detrás de
     la anterior, así que corren una por una, en el orden en que se escribieron, aunque se
     olvide el `await`. Una prueba que lanza un error no tumba el script: se imprime ✗ con el
     motivo y se sigue con la siguiente.
   - `igual()`, `cierto()` y `esperarError()` LANZAN al fallar (como un `assert`); `prueba()`
     las atrapa. Una prueba cuenta como UNA verificación, pase las aserciones que pase.
   - `dato()` es un dato de prueba perezoso: se fabrica la primera vez que se pide y se
     reutiliza (típicamente una base de PGlite, que tarda un segundo en arrancar) y se limpia
     solo en `resumen()`.
   - `resumen()` espera a que terminen todas, imprime el total y deja el código de salida.

   Se corre desde un script con `node mi-prueba.mjs`; ver README.md.
   ============================================================================ */

import { isDeepStrictEqual, inspect } from 'node:util';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Error de una aserción de este marco (no de la base). Se distingue para no imprimir su pila. */
export class ErrorDeAfirmacion extends Error {
  constructor(mensaje) { super(mensaje); this.name = 'ErrorDeAfirmacion'; }
}

/* ============================ El idioma del repo ============================ */

let aciertos = 0, fallos = 0;

/** Una verificación que pasó. Mismo formato que pruebas/ics.mjs. */
export const bien = m => { aciertos++; console.log('  ✓ ' + sangrar(m, '    ')); };
/** Una verificación que falló. Cuenta para el código de salida. */
export const mal = m => { fallos++; console.log('  ✗ ' + sangrar(m, '    ')); };
/** Cuántas van y cuántas fallaron (para el que arma su propio resumen). */
export const contadores = () => ({ aciertos, fallos });

/* Las líneas de un mensaje largo (dio/esperado, el SQL que falló) se sangran para que no se
   confundan con la siguiente verificación. `sangrar` deja la primera línea donde está (ya
   lleva su ✓/✗ delante); `bloque` sangra todas. */
function sangrar(texto, prefijo) {
  return String(texto).split('\n').map((l, i) => (i ? prefijo + l : l)).join('\n');
}
const bloque = (texto, prefijo) => String(texto).split('\n').map(l => prefijo + l).join('\n');

/* ====================== La cola: describir, prueba, dato ====================== */

/* Todo lo declarado se encadena aquí. Cada eslabón atrapa sus propios fallos, así que la
   cola nunca termina rechazada y un `prueba()` sin `await` no deja una promesa huérfana. */
let cola = Promise.resolve();
let nivel = 0;                       // cuántos `describir` anidados rodean a lo que se declara
const finalizadores = [];            // lo que `dato()` limpia al terminar

const encolar = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };
const sangria = n => '  '.repeat(n);

/** Agrupa pruebas bajo un título. La función se ejecuta AL DECLARAR y no puede ser async. */
export function describir(titulo, fn) {
  const mio = nivel;
  encolar(() => console.log('\n' + sangria(mio) + '── ' + titulo + ' ──'));
  nivel++;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      throw new Error('describir(«' + titulo + '»): la función no puede ser async. Declara las ' +
        'pruebas de forma síncrona y pon el await DENTRO de cada prueba().');
    }
  } finally { nivel--; }
}

/**
 * Una prueba. `fn` puede ser async; si lanza, la prueba falla; si no, pasa.
 * @param {string} titulo
 * @param {() => (void|Promise<void>)} fn
 * @param {{tiempo?: number}} [opciones]  milisegundos antes de darla por colgada (60 000 por defecto)
 * @returns {Promise<void>}  nunca rechaza; no hace falta esperarla
 */
export function prueba(titulo, fn, { tiempo = 60_000 } = {}) {
  const mio = nivel;
  return encolar(async () => {
    const t0 = performance.now();
    try {
      await conTiempo(Promise.resolve().then(fn), tiempo, titulo);
      aciertos++;
      console.log(sangria(mio + 1) + '✓ ' + titulo + demora(t0));
    } catch (e) {
      fallos++;
      console.log(sangria(mio + 1) + '✗ ' + titulo + demora(t0) + '\n' + bloque(describirFallo(e), sangria(mio + 3)));
    }
  });
}

/* Solo se anota el tiempo cuando se nota: una prueba de 3 ms no necesita decirlo. */
const demora = t0 => { const ms = performance.now() - t0; return ms >= 500 ? ' (' + (ms / 1000).toFixed(1) + ' s)' : ''; };

/* Una prueba colgada —una promesa que nunca se resuelve— se corta. OJO: esto NO interrumpe
   SQL que esté corriendo (PGlite es síncrono por dentro); solo evita que el script espere
   para siempre algo que no va a llegar. El temporizador NO se desreferencia a propósito: si
   la promesa colgada es lo único pendiente, sin él node ve el bucle de eventos vacío y sale
   con el código 13 («await de nivel superior sin resolver») sin decir cuál fue la prueba.
   Cuando la prueba termina a tiempo se cancela, así que no retrasa la salida de nadie. */
function conTiempo(promesa, ms, titulo) {
  let reloj;
  const limite = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new ErrorDeAfirmacion('la prueba «' + titulo + '» no terminó en ' + ms + ' ms')), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}

/* Qué se imprime de un fallo. Una aserción propia dice lo suyo; un error de la base lleva su
   sqlstate y el SQL (cortado); cualquier otra cosa es un error del propio código y lleva pila,
   porque ahí sí hace falta saber de dónde salió. */
function describirFallo(e) {
  // `sinPila`: errores que traen su mensaje completo (la auditoría de arnes.mjs) y cuya pila no dice nada.
  // Un error de migración ya dice archivo, línea, sentencia y sqlstate en su propio mensaje.
  if (e instanceof ErrorDeAfirmacion || (e && (e.sinPila || e.name === 'ErrorDeMigracion'))) return e.message;
  // «De la base» = lo que lanza arnes.mjs (trae `codigo`) o un error crudo de PGlite (trae
  // `severity` junto a `code`). Un ENOENT o un TypeError de node también traen `code`, pero
  // esos son errores del propio código y necesitan su pila.
  if (e && (e.codigo || (e.severity && e.code))) {
    const l = [(e.name === 'Error' || e.name === 'error' ? '' : e.name + ': ') + e.message + ' [' + (e.codigo || e.code) + ']'];
    if (e.detalle) l.push('detalle: ' + e.detalle);
    if (e.pista) l.push('pista: ' + e.pista);
    if (e.linea) l.push('línea ' + e.linea + (e.archivo ? ' de ' + e.archivo : ''));
    const sentencia = e.sentencia || e.sql;
    if (sentencia) l.push('sql: ' + String(sentencia).trim().split('\n')[0].slice(0, 160));
    return l.join('\n');
  }
  return e && e.stack ? e.stack.split('\n').slice(0, 7).join('\n') : String(e);
}

/**
 * Un dato de prueba perezoso: `fabrica` se llama la PRIMERA vez que se pide, y de ahí en
 * adelante se devuelve el mismo valor. Sirve para lo caro, sobre todo una base de PGlite:
 *
 *     const base = dato(() => crearBase({ migraciones: '../migrations' }), { limpiar: d => d.close() });
 *     prueba('algo', async () => { const db = await base(); ... });
 *
 * @template T
 * @param {() => (T|Promise<T>)} fabrica
 * @param {{limpiar?: (valor: T) => (void|Promise<void>)}} [opciones]
 * @returns {() => Promise<T>}
 */
export function dato(fabrica, { limpiar } = {}) {
  let promesa = null;
  const obtener = () => (promesa ??= Promise.resolve().then(fabrica));
  finalizadores.push(async () => {
    if (!promesa || !limpiar) return;
    let valor;
    try { valor = await promesa; } catch { return; }   // si nunca se pudo fabricar, no hay nada que limpiar
    await limpiar(valor);
  });
  return obtener;
}

/* ============================ Aserciones (lanzan) ============================ */

const mostrar = v => inspect(v, { depth: 8, breakLength: 100, compact: 3, sorted: true });

/**
 * Igualdad profunda y estricta (tipos incluidos: `1` no es `'1'`, un BigInt no es un número).
 * Las filas de PGlite traen números y textos: si una columna es int8 grande llega como BigInt;
 * para comparar sin sorpresas se castea en el SQL (`::text`, `::int`).
 */
export function igual(actual, esperado, que = 'los valores no son iguales') {
  if (isDeepStrictEqual(actual, esperado)) return;
  throw new ErrorDeAfirmacion(que + '\ndio: ' + mostrar(actual) + '\nesp: ' + mostrar(esperado));
}

/** Que algo sea verdadero. */
export function cierto(valor, que = 'se esperaba algo verdadero') {
  if (!valor) throw new ErrorDeAfirmacion(que + '\ndio: ' + mostrar(valor));
}

/**
 * Espera una promesa que DEBE fallar. `patron` puede ser:
 *   - una expresión regular, que se prueba contra «<sqlstate> <mensaje>»; por eso sirve igual
 *     `/permission denied/` que `/42501/` o `/denied|42501/`;
 *   - un sqlstate suelto como texto ('42501', 'P0001'): se compara exacto con el código;
 *   - cualquier otro texto: debe aparecer en el mensaje (sin distinguir mayúsculas).
 * Devuelve el error por si la prueba quiere mirar más (`.detalle`, `.restriccion`…).
 * Si la promesa termina bien, o falla con otra cosa, lanza.
 */
export async function esperarError(promesa, patron, que = '') {
  let error = null, termino = false;
  try { await promesa; termino = true; } catch (e) { error = e; }
  if (termino) throw new ErrorDeAfirmacion((que ? que + ': ' : '') + 'se esperaba un error' + (patron !== undefined ? ' (' + String(patron) + ')' : '') + ' y la operación terminó bien');
  if (patron !== undefined && !coincide(error, patron)) {
    throw new ErrorDeAfirmacion((que ? que + ': ' : '') + 'el error no es el esperado\nesp: ' + String(patron) +
      '\ndio: ' + (error.codigo || error.code || '') + ' ' + (error && error.message));
  }
  return error;
}

function coincide(error, patron) {
  const codigo = String((error && (error.codigo || error.code)) || '');
  const mensaje = String((error && error.message) || '');
  if (patron instanceof RegExp) {
    // Una regex con /g o /y recuerda dónde se quedó y alterna aciertos y fallos: se prueba una copia.
    return new RegExp(patron.source, patron.flags.replace(/[gy]/g, '')).test(codigo + ' ' + mensaje);
  }
  const texto = String(patron);
  if (/^(?=.*\d)[0-9A-Z]{5}$/.test(texto)) return codigo === texto;       // sqlstate: 5 caracteres con algún dígito
  return mensaje.toLowerCase().includes(texto.toLowerCase());
}

/* ================================== Final ================================== */

/**
 * Espera a que terminen todas las pruebas, limpia los `dato()`, imprime el total y deja el
 * código de salida (1 si algo falló). Se llama una vez, al final del script:
 *
 *     await resumen();
 *
 * Termina el proceso ella misma, con el código que toca. No se puede dejar que node se vaya
 * solo cuando se vacíe el bucle de eventos, porque PGlite deja un temporizador de Postgres
 * (unos 10 s tras la última consulta; con una copia sin cerrar, mucho más) y cada archivo
 * de prueba tardaría eso en terminar. Pero un `process.exit()` a secas puede cortar lo
 * último que se escribió cuando la salida va a un pipe o a un archivo (por ejemplo, la
 * que lee correr.sh): se espera a que lo escrito se vacíe y entonces se sale.
 * `{salir: false}` solo devuelve el código (para quien arma su propio cierre).
 */
export async function resumen({ salir = true } = {}) {
  await cola;
  for (const f of finalizadores.splice(0).reverse()) {
    try { await f(); } catch (e) { fallos++; console.log('  ✗ al limpiar un dato de prueba: ' + (e && e.message)); }
  }
  const total = aciertos + fallos;
  console.log(fallos ? '\n' + fallos + ' FALLO(S) de ' + total + ' verificaciones' : '\nTodo pasa. ' + total + ' verificaciones.');
  const codigo = fallos ? 1 : 0;
  if (salir) {
    process.exitCode = codigo;
    process.stdout.write('', () => process.exit(codigo));
  }
  return codigo;
}

/* ================== ¿Este archivo es el que se está ejecutando? ================== */

/**
 * `esPrincipal(import.meta.url)` dice si el módulo es el que se lanzó con `node archivo.mjs`
 * (y no uno importado por otro). Lo usa autoprueba.mjs para poder exportar `auditarRLS` sin
 * que importarlo la ponga a correr y la haga salir con su propio código.
 * Compara rutas reales en vez de usar `import.meta.main` (node ≥ 24.2): esa propiedad es
 * del módulo donde se escribe, así que un ayudante como este no puede leerla por quien lo
 * llama; y en una versión de node que no la tuviera, devolver `false` haría que la
 * autoprueba «pasara» sin haber corrido nada, que es lo peor que le puede pasar a una prueba.
 */
export function esPrincipal(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    const mia = realpathSync.native(fileURLToPath(metaUrl));
    const lanzada = realpathSync.native(resolve(process.argv[1]));
    return process.platform === 'win32' ? mia.toLowerCase() === lanzada.toLowerCase() : mia === lanzada;
  } catch { return false; }
}
