/* LA COPIA DIARIA HOJA → NUBE (decidida por Elías el 2026-10-16), PROBADA CON DOBLES. Sin Supabase, sin Google, en node.

   Tres piezas y lo que se vigila de cada una:
     1. La función `importar-diario` (supabase/functions/importar-diario/): la puerta (secreto en tiempo constante, 503 sin
        secreto configurado y sin hacer nada, 401 con otro), el cuerpo (un volcado al3d-volcado v1, reciente, de 15 MB a lo
        más), que todo vaya en UNA transacción (ni un begin/commit dentro del SQL del importador), que con conflictos o filas
        que no entran NO se aplique nada pero se anote, que si truena se deshaga y se anote el fallo, y que ni la respuesta,
        ni el registro, ni el renglón de cuadre_diario lleven un nombre, un teléfono, un importe, el secreto o la contraseña
        de la base. La base es un doble que anota cada sentencia (con PGlite y el SQL de verdad:
        supabase/tests/sync-e-importacion/importar-diario.mjs).
     2. El CPU: con un volcado de mentiras de 220 ventas, cuánto CPU gasta la función (el límite de Supabase es 2 s).
     3. El archivo para pegar en el panel (desplegar/index.ts): que esté al día con sus fuentes y que corra solo, con un
        Deno y un postgres de mentiras.
     4. El Apps Script (puente/copia-diaria.gs), cargado en vm: sin sus propiedades no hace nada y lo dice, arma EXACTAMENTE
        el volcado de volcado-para-importar.gs sin tocar Drive ni escribir la hoja, lo manda con el secreto, deja una línea
        sin datos de clientes, programa y quita sus disparadores (cada 3 horas, hora de México) y no choca con nada de Código.gs.
     5. Ajustes: la racha de la copia diaria (resumenCopiaDiaria) y que apagado no cambie nada.

   Todo es de mentiras: nombres, importes, el secreto y la dirección de la base. Se corre con pruebas/correr.sh. */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const seccion = t => console.log('\n' + t);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const url = r => pathToFileURL(join(RAIZ, r)).href;

const H = await import(url('supabase/functions/importar-diario/handler.js'));
const C = await import(url('supabase/functions/importar-diario/copia.js'));
const { planear } = await import(url('scripts/importador/plan.mjs'));
const { sqlDeImportacion, sqlDeDiferencias } = await import(url('scripts/importador/sql.mjs'));
const { volcado, filaVentas, dia } = await import(url('supabase/tests/comun/hoja-de-mentiras.js'));
const Q = await import(url('js/datos/supa-cuadre.js'));
const SEMILLA = JSON.parse(leer('datos/semilla.json'));

/* ── El mundo de mentiras ─────────────────────────────────────────────────────────────────── */
const AHORA = Date.parse('2026-10-17T09:05:00.000Z');                        // 03:05 de México
const SECRETO = 'secreto-FALSO-de-prueba-0123456789-abcdef';
const CONTRASENA = 'Contrasena-FALSA-777';
const URL_BD = 'postgresql://postgres.abcdefghijklmnopqrst:' + CONTRASENA + '@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

/** Una hoja de mentiras con n ventas (~6 de cada 7 con un abono), Accesos y una bitácora larga: el tamaño de la de verdad. */
function volcadoGrande(n = 220, cambiar = x => x) {
  const estatus = ['COBRANDO', 'LIQUIDADO', 'COBRANDO', 'FABRICACION', 'LIQUIDADO', 'REPARANDO', 'COBRANDO'];
  const cuentas = ['', 'Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT'];
  const ventas = [], abonos = [];
  for (let k = 0; k < n; k++) {
    const folio = 'V-' + String(1 + k).padStart(3, '0');
    const C0 = estatus[k % 7], cuenta = cuentas[k % 6];
    const ab = k % 7 < 6 ? [String(100 + (k % 13) * 10) + '.50'] : [];
    const celdas = cambiar({ A: folio, B: `Persona${k} - NegocioInventado${k}`, C: C0, D: cuenta, E: 'Rotulacion de vinil', F: cuenta === 'Elias BBVA' ? 'No' : 'Sí',
      G: 1000 + (k * 37) % 9000 + (k % 3) / 4, I: k % 4 ? 500 : '', J: C0 === 'LIQUIDADO' ? 100 : '', L: dia(`2026-0${1 + (k % 9)}-1${k % 10}`),
      M: C0 === 'FABRICACION' ? dia('2026-11-0' + (1 + (k % 9))) : '', N: C0 === 'LIQUIDADO' ? dia('2026-09-2' + (k % 10)) : '',
      Z: C0 === 'FABRICACION' || C0 === 'REPARANDO' ? 'En diseño' : '', AE: '33 4' + String(1000000 + k).slice(1), AC: 'Calle Inventada ' + k, AG: 'nota de mentiras ' + k }, k);
    ventas.push(filaVentas({ celdas, abonos: ab }));
    for (const a of ab) abonos.push([folio, '', Number(a), dia('2026-09-15'), 'abono de mentiras', '']);
  }
  const bitacora = Array.from({ length: 1500 }, (_, i) => [dia('2026-09-01'), 'direccion', 'V-' + String(1 + (i % n)).padStart(3, '0'), i + 2, 'escribió algo de mentiras', '']);
  return volcado({ ventas, abonos, accesos: [['dir@al3d.test', 'direccion', ''], ['fab@al3d.test', 'fabricacion', ''], ['pag@al3d.test', 'pagos', '']], bitacora },
    { hecho: new Date(AHORA - 5 * 60 * 1000).toISOString() });
}
const VOLCADO = volcadoGrande();
const TEXTO_VOLCADO = JSON.stringify(VOLCADO);

/** ¿Este texto trae algo que no debe? Nombres, teléfonos o direcciones de la hoja de mentiras, importes, el secreto o la contraseña. */
function fugas(texto) {
  const t = String(texto);
  const malas = [];
  if (/Persona\d|NegocioInventado|Calle Inventada|nota de mentiras|abono de mentiras|33 4\d/.test(t)) malas.push('un dato de cliente');
  if (/\b\d{3,}\.\d{1,2}\b/.test(t)) malas.push('un importe con centavos');
  if (t.includes(SECRETO) || t.includes(CONTRASENA) || t.includes('pooler.supabase.com')) malas.push('el secreto o la base');
  return malas;
}

/** La base de la función, de mentiras: anota cada sentencia de cada transacción y contesta lo que se le pida. */
function baseFalsa(o = {}) {
  const m = { abiertas: 0, cerradas: 0, tx: [], insertados: [] };
  const sesion = log => ({
    ejecutar: async t => { log.push({ e: t }); if (o.fallaEn && o.fallaEn(t)) throw o.error; },
    consultar: async (t, p) => {
      log.push({ q: t, p });
      if (/pg_try_advisory_xact_lock/.test(t)) return [{ ok: o.candado !== false }];
      if (/from _imp_cambios/.test(t)) return o.cambios || [];
      if (/with hoja \(folio/.test(t)) { if (o.difFalla) throw new Error('timeout'); return o.dif || []; }
      if (/insert into public\.cuadre_diario/.test(t)) { m.insertados.push(p); return [{ id: String(m.insertados.length), fecha: '2026-10-17', cuadra: p[2] }]; }
      return [];
    },
  });
  m.base = {
    transaccion: async fn => {
      if (o.sinConexion) throw o.sinConexion;
      const log = ['begin']; m.tx.push(log);
      try { const r = await fn(sesion(log)); log.push('commit'); return r; } catch (e) { log.push('rollback'); throw e; }
    },
    cerrar: async () => { m.cerradas++; },
  };
  m.abrir = u => { m.abiertas++; m.url = u; return m.base; };
  return m;
}

async function llamar({ secreto = SECRETO, entorno = {}, cuerpo, base = baseFalsa(), metodo = 'POST', cabeceras = {}, ahora = AHORA } = {}) {
  const env = { IMPORTAR_SECRETO: SECRETO, SUPABASE_DB_URL: URL_BD, ...entorno };
  const reg = [];
  const h = { 'content-type': 'application/json', ...cabeceras };
  if (secreto !== null) h['x-importar-secreto'] = secreto;
  const req = new Request('https://falso.supabase.co/functions/v1/importar-diario', { method: metodo, headers: h,
    body: metodo === 'GET' || metodo === 'OPTIONS' ? undefined : (cuerpo === undefined ? TEXTO_VOLCADO : cuerpo) });
  let t = ahora;
  const res = await H.manejar(req, { ahora: () => (t += 3), entorno: n => env[n], semilla: SEMILLA, abrirBase: base.abrir, registrar: (n, l) => reg.push(n + ' ' + l) });
  const texto = await res.text();
  let c = null; try { c = JSON.parse(texto); } catch (_) { /* sin cuerpo */ }
  return { status: res.status, texto, c, reg, base };
}
const sentencias = log => log.map(x => (typeof x === 'string' ? x : x.e !== undefined ? 'E:' + clase(x.e) : 'Q:' + clase(x.q)));
function clase(t) {
  if (/pg_try_advisory_xact_lock/.test(t)) return 'candado';
  if (/statement_timeout/.test(t)) return 'tiempo';
  if (/create temp table if not exists _imp_cambios/.test(t)) return 'importador';
  if (/from _imp_cambios/.test(t)) return 'cambios';
  if (/drop table if exists _lote/.test(t)) return 'limpiar';
  if (/with hoja \(folio/.test(t)) return 'cuadre';
  if (/insert into public\.cuadre_diario/.test(t)) return 'anotar';
  if (/^savepoint|^release|^rollback to/.test(t)) return t.split(' ')[0];
  return 'otra';
}

/* ============================================================================ */
seccion('1. LA PUERTA — sin secreto configurado no hace NADA; con otro, 401; lo que falta se dice por su nombre');
{
  const sinSec = await llamar({ entorno: { IMPORTAR_SECRETO: undefined } });
  eq('sin IMPORTAR_SECRETO: 503 CONFIGURACION que nombra la variable, y la base ni se abre', [sinSec.status, sinSec.c.codigo, sinSec.c.variables, sinSec.base.abiertas], [503, 'CONFIGURACION', ['IMPORTAR_SECRETO'], 0]);
  const corto = await llamar({ entorno: { IMPORTAR_SECRETO: 'a'.repeat(31) }, secreto: 'a'.repeat(31) });
  eq('con un secreto configurado de 31 caracteres: igual, 503 y nada (aunque quien llama traiga el mismo)', [corto.status, corto.base.abiertas], [503, 0]);
  const otro = await llamar({ secreto: SECRETO.slice(0, -1) + 'X' });
  eq('con otro secreto: 401 y la base ni se abre', [otro.status, otro.c.codigo, otro.base.abiertas], [401, 'SIN_SESION', 0]);
  const sin = await llamar({ secreto: null });
  eq('sin la cabecera: el mismo 401, con el mismo cuerpo (no dice qué faltó)', [sin.status, sin.texto], [401, otro.texto]);
  const sinBd = await llamar({ entorno: { SUPABASE_DB_URL: undefined } });
  eq('sin SUPABASE_DB_URL: 503 que la nombra, y nada', [sinBd.status, sinBd.c.variables, sinBd.base.abiertas], [503, ['SUPABASE_DB_URL'], 0]);
  const get = await llamar({ metodo: 'GET' });
  eq('GET: 405', get.status, 405);
  const nav = await llamar({ cabeceras: { origin: 'https://evil.example' } });
  eq('una página de otro origen: 403 sin tocar nada', [nav.status, nav.base.abiertas], [403, 0]);
  const fn = leer('supabase/functions/_shared/respaldo.js');
  cierto('el secreto se compara con secretoValido (recorre siempre el más largo: tiempo constante)', /export function secretoValido/.test(fn) &&
    /for \(let i = 0; i < n; i\+\+\) d \|= /.test(fn) && /secretoValido\(peticion\.headers\.get\(CABECERA_SECRETO\), esperado\)/.test(leer('supabase/functions/importar-diario/handler.js')));
  eq('ningún registro de estas llevó el secreto ni la base', [sinSec, corto, otro, sin, sinBd].flatMap(r => fugas(r.reg.join('\n') + r.texto)), []);
}

/* ============================================================================ */
seccion('2. EL CUERPO — un volcado al3d-volcado v1, reciente y de 15 MB a lo más');
{
  const r1 = await llamar({ cuerpo: 'no es json' });
  const r2 = await llamar({ cuerpo: JSON.stringify({ formato: 'otra-cosa', version: 1 }) });
  const r3 = await llamar({ cuerpo: JSON.stringify({ ...VOLCADO, hecho: new Date(AHORA - 37 * 3600 * 1000).toISOString() }) });
  const r4 = await llamar({ cuerpo: JSON.stringify({ ...VOLCADO, hecho: new Date(AHORA + 3600 * 1000).toISOString() }) });
  const r5 = await llamar({ cuerpo: 'x'.repeat(15 * 1024 * 1024 + 10) });
  const r6 = await llamar({ cuerpo: JSON.stringify({ ...VOLCADO, pestanas: {} }) });
  eq('no JSON / otro formato / de hace 37 h / del futuro / más de 15 MB / sin Ventas: 400, 400, 400, 400, 413, 400', [r1, r2, r3, r4, r5, r6].map(r => r.status), [400, 400, 400, 400, 413, 400]);
  eq('y en ninguno se abrió la base', [r1, r2, r3, r4, r5, r6].map(r => r.base.abiertas), [0, 0, 0, 0, 0, 0]);
  cierto('el de hace 37 h dice por qué no se aplica', /36 horas/.test(r3.c.mensaje));
  eq('problemaDelVolcado: el de hace 35 h sí pasa', H.problemaDelVolcado({ ...VOLCADO, hecho: new Date(AHORA - 35 * 3600 * 1000).toISOString() }, AHORA), null);
}

/* ============================================================================ */
seccion('3. UN DÍA NORMAL — todo en UNA transacción, el cuadre después y un renglón sin datos de clientes');
{
  const b = baseFalsa({ cambios: [{ tabla: 'proyectos', llave: 'proy-hoja-V-001', accion: 'cambio' }, { tabla: 'abonos', llave: 'hoja:abono:x:1', accion: 'alta' }] });
  const r = await llamar({ base: b });
  eq('200 con lo que pasó: aplicada, cuadra, 220 ventas', [r.status, r.c.ok, r.c.aplicado, r.c.cuadra, r.c.ventas, r.c.diferencias, r.c.conflictos, r.c.rechazos, r.c.motivo],
    [200, true, true, true, 220, 0, 0, 0, null]);
  eq('UNA transacción: begin, candado, tiempo, el importador, lo que hizo, limpiar las temporales, el cuadre, anotar, commit', b.tx.map(sentencias),
    [['begin', 'Q:candado', 'E:tiempo', 'E:importador', 'Q:cambios', 'E:limpiar', 'Q:cuadre', 'Q:anotar', 'commit']]);
  const sqlCopia = b.tx[0].find(x => x.e && clase(x.e) === 'importador').e;
  cierto('el SQL del importador NO abre ni cierra transacciones por su cuenta (ni ensayo, ni consulta final)',
    !/^\s*(begin|commit|rollback)\s*;/im.test(sqlCopia) && !/ENSAYO/.test(sqlCopia) && !/group by tabla, accion/.test(sqlCopia));
  const planHoy = await planear({ volcado: VOLCADO, semilla: SEMILLA });
  const normal = t => t.split('\n').filter(l => l.trim() && !/^(begin|commit);$/.test(l)).join('\n');
  const deSiempre = normal(sqlDeImportacion(planHoy));
  cierto('y es el MISMO SQL de importar.sql (sqlDeImportacion), quitándole solo los begin/commit de cada lote y la consulta final',
    sqlCopia === sqlDeImportacion(planHoy, { externa: true }) && deSiempre.startsWith(normal(sqlCopia)) &&
    /^-- lo que hizo esta corrida[^\n]*\nselect tabla, accion, count\(\*\)::int as filas from _imp_cambios group by tabla, accion order by tabla, accion;$/.test(deSiempre.slice(normal(sqlCopia).length + 1)));
  eq('se cerró la conexión', [b.abiertas, b.cerradas, b.url === URL_BD], [1, 1, true]);
  const p = b.insertados[0];
  eq('el renglón: empresa, aplicado, cuadra, diferencias, conflictos, rechazos', p.slice(0, 6), ['al3d', true, true, 0, 0, 0]);
  const resumen = JSON.parse(p[6]);
  eq('su resumen dice cuántas filas leyó de cada pestaña, sin leerlas', [resumen.volcado.pestanas['Ventas'], resumen.volcado.pestanas['Abonos comisión'], resumen.volcado.pestanas['Bitácora del puente']],
    [220, VOLCADO.pestanas['Abonos comisión'].length - 1, 1500]);
  eq('y lo que hizo la base, en cuentas', resumen.cambios, [{ tabla: 'abonos', accion: 'alta', n: 1 }, { tabla: 'proyectos', accion: 'cambio', n: 1 }]);
  eq('ni el resumen, ni la respuesta, ni el registro llevan nombres, teléfonos, importes, el secreto o la base', fugas(p[6] + r.texto + r.reg.join('\n')), []);
  eq('el registro: una línea de info, con cuentas', r.reg.map(l => l.split(' ')[0]), ['info']);
}

/* ============================================================================ */
seccion('4. CON CONFLICTOS O FILAS QUE NO ENTRAN — no se aplica NADA, pero se anota (y el cuadre corre)');
{
  const dup = volcadoGrande(30);
  dup.pestanas['Ventas'].push(dup.pestanas['Ventas'][5].map((x, i) => (i === 1 ? 'PersonaRepetida - NegocioInventado' : x)));     // folio repetido
  const b = baseFalsa({ dif: [{ folio: 'V-005', col: 'fila', en_hoja: 'sí', en_base: 'no está' }, { folio: 'V-007', col: 'K', en_hoja: '1234.50', en_base: '1000.25' }] });
  const r = await llamar({ base: b, cuerpo: JSON.stringify(dup) });
  eq('200 sin aplicar: aplicado false, motivo conflictos, no cuadra', [r.status, r.c.ok, r.c.aplicado, r.c.cuadra, r.c.motivo, r.c.conflictos, r.c.diferencias], [200, true, false, false, 'conflictos', 1, 2]);
  eq('la transacción: candado, tiempo, el cuadre y anotar; el importador NO corrió', b.tx.map(sentencias), [['begin', 'Q:candado', 'E:tiempo', 'Q:cuadre', 'Q:anotar', 'commit']]);
  const res = JSON.parse(b.insertados[0][6]);
  eq('el renglón dice el tema y el folio del conflicto, y dónde no cuadra (folio y columna, sin los importes)',
    [res.conflictos_plan, res.diferencias], [[{ tema: 'folio repetido en Ventas', n: 1, folios: ['V-005'] }], { columnas: { fila: 1, K: 1 }, folios: ['V-005', 'V-007'] }]);
  eq('sin datos de clientes ni importes (los del cuadre no salen)', fugas(b.insertados[0][6] + r.texto + r.reg.join('\n')), []);
  const malo = volcadoGrande(30);
  malo.pestanas['Ventas'][4][6] = 'mil quinientos';                                   // V-004, fila 5 de la hoja: G con texto
  const b2 = baseFalsa();
  const r2 = await llamar({ base: b2, cuerpo: JSON.stringify(malo) });
  eq('una fila que no entra (G con texto): tampoco se aplica; dice la pestaña y la fila', [r2.c.aplicado, r2.c.rechazos, JSON.parse(b2.insertados[0][6]).rechazos],
    [false, 1, [{ donde: 'Ventas', n: 1, filas: [5] }]]);
  eq('y el importador no corrió', b2.tx.map(sentencias).flat().includes('E:importador'), false);
}

/* ============================================================================ */
seccion('5. SI ALGO TRUENA — la copia se deshace entera y el fallo se anota en otra transacción, sin el mensaje de la base');
{
  const err = Object.assign(new Error('new row violates check constraint; Failing row contains (Persona3 - NegocioInventado3, 1234.50)'),
    { code: '23514', table_name: 'proyectos', constraint_name: 'proyectos_inventada', detail: 'Persona3 1234.50' });
  const b = baseFalsa({ fallaEn: t => clase(t) === 'importador', error: err, dif: [{ folio: 'V-010', col: 'H', en_hoja: '1.00', en_base: '2.00' }] });
  const r = await llamar({ base: b });
  eq('502 BASE_RECHAZO con el código, la tabla y la restricción', [r.status, r.c.ok, r.c.codigo, r.c.aplicado, r.c.error], [502, false, 'BASE_RECHAZO', false,
    { codigo: '23514', tabla: 'proyectos', restriccion: 'proyectos_inventada' }]);
  eq('la primera transacción se deshizo; la segunda anota (con el cuadre en su punto de guardado)', b.tx.map(sentencias),
    [['begin', 'Q:candado', 'E:tiempo', 'E:importador', 'rollback'], ['begin', 'E:savepoint', 'Q:cuadre', 'E:release', 'Q:anotar', 'commit']]);
  eq('el renglón: no aplicado, no cuadra, 1 diferencia', b.insertados[0].slice(1, 4), [false, false, 1]);
  eq('ni el mensaje ni el detalle de la base salen a ningún lado', fugas(b.insertados[0][6] + r.texto + r.reg.join('\n')).concat(/Failing/.test(b.insertados[0][6] + r.texto + r.reg.join('')) ? ['el mensaje'] : []), []);
  const b2 = baseFalsa({ fallaEn: t => clase(t) === 'importador', error: err, difFalla: true });
  const r2 = await llamar({ base: b2 });
  eq('si el cuadre también truena, el fallo se anota igual (el cuadre vuelve a su punto de guardado)', [r2.status, sentencias(b2.tx[1]), JSON.parse(b2.insertados[0][6]).diferencias],
    [502, ['begin', 'E:savepoint', 'Q:cuadre', 'E:rollback', 'Q:anotar', 'commit'], null]);
  const b3 = baseFalsa({ candado: false });
  const r3 = await llamar({ base: b3 });
  eq('otra copia corriendo (el candado está tomado): 409 y no se anota nada', [r3.status, r3.c.codigo, b3.insertados.length, b3.tx.map(sentencias)], [409, 'OCUPADA', 0, [['begin', 'Q:candado', 'rollback']]]);
  const b4 = baseFalsa({ sinConexion: new Error('connect ECONNREFUSED ' + URL_BD) });
  const r4 = await llamar({ base: b4 });
  eq('la base no contesta (y su error cita la dirección con la contraseña): 502 sin ella en ningún lado', [r4.status, r4.c.codigo, fugas(r4.texto + r4.reg.join('\n'))], [502, 'BASE_NO_CONTESTA', []]);
  eq('y la conexión se cerró igual', [b.cerradas, b3.cerradas, b4.cerradas], [1, 1, 1]);
}

/* ============================================================================ */
seccion('6. LO QUE SE ANOTA — listas cerradas: lo que no se reconoce sale «otro»');
{
  const c = C.resumenDeCambios([
    { tabla: 'proyectos', llave: 'proy-hoja-V-012', accion: 'conflicto: su folio ya es de proy-abc' },
    { tabla: 'proyectos', llave: 'proy-hoja-V-013', accion: 'conflicto: en la base es viva de hoja y ahora sería histórica de hoja' },
    { tabla: 'abonos', llave: 'V-014 1500.5 (fila 9)', accion: 'conflicto: ya no está en la hoja; si se corrigió, va una corrección a mano' },
    { tabla: 'abonos', llave: 'x', accion: 'conflicto: Persona3 dijo 1234.50' },
    { tabla: 'instalaciones', llave: 'i1', accion: 'cambio: cancelada (otra cita es la viva)' },
    { tabla: 'secreta', llave: 'x', accion: 'alta' },
  ]);
  eq('los conflictos de la base: por tipo, con su folio y nunca con la llave entera (la del abono lleva el importe)', c.conflictos_base, [
    { tabla: 'abonos', tipo: 'otro', n: 1, folios: [] }, { tabla: 'abonos', tipo: 'ya no está en la hoja', n: 1, folios: ['V-014'] },
    { tabla: 'proyectos', tipo: 'en la base es viva de hoja y ahora sería histórica de hoja', n: 1, folios: ['V-013'] },
    { tabla: 'proyectos', tipo: 'su folio ya es de otro proyecto', n: 1, folios: ['V-012'] }]);
  eq('los cambios: tablas y acciones conocidas', c.cambios, [{ tabla: 'instalaciones', accion: 'cambio: cancelada (otra cita es la viva)', n: 1 }, { tabla: 'otra', accion: 'alta', n: 1 }]);
  eq('errorSinDatos: código, tabla y restricción; ni mensaje ni detalle', C.errorSinDatos({ code: '23505', table_name: 'abonos', constraint_name: 'abonos_op', message: 'Persona', detail: 'x' }),
    { codigo: '23505', tabla: 'abonos', restriccion: 'abonos_op' });
  eq('y un error que no es de la base: DESCONOCIDO', C.errorSinDatos(new Error('Persona3 1234.50')), { codigo: 'DESCONOCIDO' });
}

/* ============================================================================ */
seccion('7. EL CPU — con un volcado de mentiras de 220 ventas (el límite de una función de Supabase es 2 s de CPU)');
let cpuFrio = 0, cpuTibio = 0;
{
  const ms = d => (d.user + d.system) / 1000;
  const kb = Math.round(Buffer.byteLength(TEXTO_VOLCADO) / 1024);
  // por partes, una vez: lo que hace la función con el cuerpo
  let c0 = process.cpuUsage();
  const v = JSON.parse(TEXTO_VOLCADO);
  const tParse = ms(process.cpuUsage(c0)); c0 = process.cpuUsage();
  const plan = await planear({ volcado: v, telefonos: [], clave: null, semilla: SEMILLA });
  const tPlan = ms(process.cpuUsage(c0)); c0 = process.cpuUsage();
  const sqlA = sqlDeImportacion(plan, { externa: true }), sqlB = sqlDeDiferencias(plan);
  const tSql = ms(process.cpuUsage(c0));
  // la función entera (la petición, el plan, el SQL, el resumen y la respuesta), con la base de mentiras
  const corridas = [];
  for (let i = 0; i < 6; i++) { const b = baseFalsa(); const c1 = process.cpuUsage(); const r = await llamar({ base: b }); corridas.push(ms(process.cpuUsage(c1))); if (r.status !== 200) corridas.push(NaN); }
  cpuTibio = corridas.slice(1).sort((a, b) => a - b)[2];
  /* En FRÍO de verdad: un proceso nuevo, sin nada compilado todavía, como una instancia recién arrancada de la función. */
  const dir = mkdtempSync(join(tmpdir(), 'al3d-cpu-'));
  let frio = null;
  try {
    writeFileSync(join(dir, 'volcado.json'), TEXTO_VOLCADO);
    writeFileSync(join(dir, 'medir.mjs'), `
      import { readFileSync } from 'node:fs';
      const ms = d => (d.user + d.system) / 1000;
      const c0 = process.cpuUsage();
      const H = await import(${JSON.stringify(url('supabase/functions/importar-diario/handler.js'))});
      const semilla = JSON.parse(readFileSync(${JSON.stringify(join(RAIZ, 'datos', 'semilla.json'))}, 'utf8'));
      const carga = ms(process.cpuUsage(c0));
      const texto = readFileSync(${JSON.stringify(join(dir, 'volcado.json'))}, 'utf8');
      const ahora = Date.parse(JSON.parse(texto).hecho) + 60000;
      const tx = { ejecutar: async () => {}, consultar: async (t, p) => /advisory/.test(t) ? [{ ok: true }] : /insert into public.cuadre_diario/.test(t) ? [{ id: '1', fecha: 'x', cuadra: p[2] }] : [] };
      const base = { transaccion: fn => fn(tx), cerrar: async () => {} };
      const env = { IMPORTAR_SECRETO: ${JSON.stringify(SECRETO)}, SUPABASE_DB_URL: 'postgresql://x:y@h/postgres' };
      const c1 = process.cpuUsage();
      const r = await H.manejar(new Request('https://x.supabase.co/functions/v1/importar-diario', { method: 'POST', headers: { 'x-importar-secreto': env.IMPORTAR_SECRETO }, body: texto }),
        { ahora: () => ahora, entorno: n => env[n], semilla, abrirBase: () => base, registrar: () => {} });
      await r.text();
      console.log(JSON.stringify({ carga, peticion: ms(process.cpuUsage(c1)), status: r.status }));`);
    const p = spawnSync(process.execPath, [join(dir, 'medir.mjs')], { encoding: 'utf8' });
    try { frio = JSON.parse(p.stdout.trim().split('\n').pop()); } catch (_) { frio = { error: (p.stderr || p.stdout).slice(0, 300) }; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  cpuFrio = frio && Number.isFinite(frio.peticion) ? frio.peticion : NaN;
  console.log(`  ·    volcado: ${VOLCADO.pestanas['Ventas'].length - 1} ventas, ${VOLCADO.pestanas['Abonos comisión'].length - 1} abonos, 1500 renglones de bitácora: ${kb} KB de JSON; ` +
    `SQL de la copia ${Math.round(sqlA.length / 1024)} KB y del cuadre ${Math.round(sqlB.length / 1024)} KB`);
  console.log(`  ·    CPU en node ${process.version}, sin contar a Postgres (corre en la base, no en la función):`);
  console.log(`  ·      en frío (proceso nuevo): cargar los módulos ${frio && frio.carga ? frio.carga.toFixed(0) : '?'} ms y la petición entera ${Number.isFinite(cpuFrio) ? cpuFrio.toFixed(0) : '?'} ms` +
    (frio && frio.error ? ' — ' + frio.error : ''));
  console.log(`  ·      ya caliente: ${cpuTibio.toFixed(0)} ms por petición (mediana de 5); por partes: JSON.parse ${tParse.toFixed(0)} ms, planear ${tPlan.toFixed(0)} ms, armar el SQL ${tSql.toFixed(0)} ms`);
  cierto('cada corrida contestó 200 (también la del proceso nuevo)', corridas.every(Number.isFinite) && frio && frio.status === 200);
  cierto('la petición en frío gasta menos de 1.5 s de CPU: lejos de los 2 s del límite', cpuFrio < 1500);
}

/* ============================================================================ */
seccion('8. EL ARCHIVO PARA EL PANEL (desplegar/index.ts) — al día con sus fuentes, y corre solo');
{
  const BUNDLE = 'supabase/functions/importar-diario/desplegar/index.ts';
  const txt = leer(BUNDLE);
  const fuentes = [...txt.matchAll(/^\/\/ {3}([0-9a-f]{16}) {2}(\S+)$/gm)].map(m => ({ h: m[1], f: m[2] }));
  const huella = t => createHash('sha256').update(t.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16);
  eq('cada fuente de su cabecera tiene la huella de hoy (si falla: node supabase/functions/importar-diario/desplegar/armar.mjs)',
    fuentes.filter(x => !existsSync(join(RAIZ, x.f)) || huella(readFileSync(join(RAIZ, x.f), 'utf8')) !== x.h).map(x => x.f), []);
  const deben = ['supabase/functions/importar-diario/index.ts', 'supabase/functions/importar-diario/handler.js', 'supabase/functions/importar-diario/copia.js',
    'supabase/functions/importar-diario/base.js', 'supabase/functions/importar-diario/respaldo.js', 'scripts/importador/plan.mjs', 'scripts/importador/sql.mjs', 'scripts/importador/celdas.mjs',
    'supabase/functions/_shared/http.js', 'supabase/functions/_shared/respaldo.js', 'datos/semilla.json'];
  eq('y lleva las fuentes que tiene que llevar', deben.filter(f => !fuentes.some(x => x.f === f)), []);
  eq('lo único de fuera: el driver de Postgres fijado por versión y lo de Node que Deno trae', [...new Set([...txt.matchAll(/^import .* from "([^"]+)";$/gm)].map(m => m[1]))].sort(),
    ['node:crypto', 'node:fs', 'npm:postgres@3.4.5']);
  cierto('empieza con @ts-nocheck (el editor del panel no lo revisa como TypeScript a mano)', txt.startsWith('// @ts-nocheck\n'));
  const esbuild = join(RAIZ, 'supabase/functions/importar-diario/desplegar/node_modules/esbuild/package.json');
  if (existsSync(esbuild)) {
    const r = spawnSync(process.execPath, [join(RAIZ, 'supabase/functions/importar-diario/desplegar/armar.mjs'), '--comprobar'], { encoding: 'utf8' });
    eq('con esbuild a la mano: armado otra vez sale IDÉNTICO, byte por byte', [r.status, (r.stdout + r.stderr).trim().slice(0, 60)], [0, (r.stdout + r.stderr).trim().slice(0, 60)]);
  } else console.log('  ·    (esbuild no está instalado en desplegar/: la comparación byte por byte se salta; las huellas de arriba sí corrieron)');

  // corre en node con un Deno y un postgres de mentiras: el mismo archivo que se pega en el panel
  globalThis.__al3dPostgres = (u, opciones) => {
    const pg = { url: u, opciones, sentencias: [], terminado: false };
    globalThis.__al3dUltimoPg = pg;
    return {
      begin: async fn => fn({ unsafe: async (t, p) => {
        pg.sentencias.push(t);
        if (/pg_try_advisory_xact_lock/.test(t)) return [{ ok: true }];
        if (/insert into public\.cuadre_diario/.test(t)) return [{ id: '1', fecha: '2026-10-17', cuadra: p[2] }];
        if (/json_agg/.test(t)) return [{ filas: '[{"id":1}]', n: 1 }];
        return [];
      } }),
      end: async () => { pg.terminado = true; },
    };
  };
  register('data:text/javascript,' + encodeURIComponent(
    'export async function resolve(s, c, n) { if (s === "npm:postgres@3.4.5") return { url: "data:text/javascript,export default globalThis.__al3dPostgres;", shortCircuit: true }; return n(s, c); }'));
  let servido = null;
  const envB = { IMPORTAR_SECRETO: SECRETO, SUPABASE_DB_URL: URL_BD };
  globalThis.Deno = { serve: h => { servido = h; }, env: { get: n => envB[n] } };
  const dir = mkdtempSync(join(tmpdir(), 'al3d-paquete-'));
  try {
    writeFileSync(join(dir, 'paquete.mjs'), txt);
    await import(pathToFileURL(join(dir, 'paquete.mjs')).href);
    cierto('al cargarlo, llama a Deno.serve con su manejador', typeof servido === 'function');
    const pedir = (sec, cuerpo) => servido(new Request('https://falso.supabase.co/functions/v1/importar-diario', { method: 'POST',
      headers: { 'x-importar-secreto': sec, 'content-type': 'application/json' }, body: cuerpo }));
    const no = await pedir('otro-secreto-cualquiera-de-32-caracteres!!');
    eq('con otro secreto: 401', no.status, 401);
    const v = { ...VOLCADO, hecho: new Date(Date.now() - 60000).toISOString() };
    const si = await pedir(SECRETO, JSON.stringify(v));
    const cuerpo = await si.json();
    const pg = globalThis.__al3dUltimoPg;
    eq('con el secreto y un volcado de hoy: 200, aplicada, por el driver con prepare:false y cerrando la conexión', [si.status, cuerpo.aplicado, cuerpo.ventas, pg.opciones.prepare, pg.terminado, pg.url === URL_BD],
      [200, true, 220, false, true, true]);
    eq('y por el driver pasaron: candado, tiempo, importador, cambios, limpiar, cuadre, anotar', pg.sentencias.map(clase), ['candado', 'tiempo', 'importador', 'cambios', 'limpiar', 'cuadre', 'anotar']);
    const pr = await pedir(SECRETO, JSON.stringify({ formato: 'al3d-pedir-respaldo', version: 1 }));
    const prTexto = await pr.text();
    const pg2 = globalThis.__al3dUltimoPg;
    eq('y el pedido del respaldo: 200 con el archivo al3d-respaldo-1 (21 tablas: 0022 sumó pantallas), en una transacción de solo lectura, cerrando la conexión',
      [pr.status, JSON.parse(prTexto).formato, Object.keys(JSON.parse(prTexto).tablas).length, pg2.sentencias[0], pg2.sentencias.filter(t => /json_agg/.test(t)).length, pg2.terminado],
      [200, 'al3d-respaldo-1', 21, 'set transaction isolation level repeatable read, read only', 21, true]);
    delete envB.IMPORTAR_SECRETO;
    const sinSec = await pedir(SECRETO, JSON.stringify(v));
    eq('y sin el secreto en el entorno: 503', sinSec.status, 503);
  } finally { rmSync(dir, { recursive: true, force: true }); delete globalThis.Deno; }
  const kb = Math.round(Buffer.byteLength(txt) / 1024);
  console.log(`  ·    desplegar/index.ts: ${kb} KB, ${fuentes.length} fuentes`);
  const toml = leer('supabase/config.toml');
  cierto('config.toml: [functions.importar-diario] con verify_jwt = false (la protege su secreto)', /\[functions\.importar-diario\]\nverify_jwt = false/.test(toml));
}

/* ============================================================================ */
seccion('9. EL APPS SCRIPT (puente/copia-diaria.gs), EN vm — lee, arma, manda; ni Drive ni escribir la hoja');
const GS = leer('puente/copia-diaria.gs');
const VOL_GS = leer('puente/volcado-para-importar.gs');
const PUENTE_GS = leer('puente/hoja-apps-script.gs');
function formatear(d, tz, patron) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return String(patron).replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
}
/** La hoja de mentiras para el .gs: pestañas como matrices; escribir en ellas truena. */
function libroFalso(extra = {}) {
  const fecha = (s, h = '00:00') => new Date(s + 'T' + h + ':00-06:00');
  const tabs = {
    'Ventas': [['Folio', 'Proyecto', 'Estatus', 'Cuenta', 'Tipo', 'IVA', 'Subtotal'], ['V-001', 'PersonaGs - NegocioGs', 'COBRANDO', 'Elias BBVA', 'Rotulacion de vinil', 'No', 1500.5],
      ['V-002', 'Otra - Otra', 'FABRICACION', '', '', 'Sí', 800], ['V-003', '', '', '', '', '', '']],
    'Abonos comisión': [['Folio', 'Proyecto', 'Importe', 'Fecha', 'Nota', 'Pago'], ['V-001', 'PersonaGs', 150.25, fecha('2026-09-15', '10:30'), 'abono', '']],
    'Accesos': [['Correo', 'Rol', 'Nota'], ['dir@al3d.test', 'direccion', ''], ['x', true, new Date(NaN)]],
    'Bitácora del puente': [['Cuándo', 'Rol', 'Folio'], [fecha('2026-09-01'), 'direccion', 'V-002']],
    'Pestaña que no se manda': [['nada'], ['secreto']],
    ...extra,
  };
  const escribir = () => { throw new Error('la copia NO escribe en la hoja'); };
  const hoja = (nombre, m) => {
    const cols = Math.max(...m.map(r => r.length));
    return { getName: () => nombre, getLastRow: () => m.length, getLastColumn: () => cols,
      getRange: (r, c, nr, nc) => ({ getValues: () => m.slice(r - 1, r - 1 + nr).map(row => Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j]))),
        setValue: escribir, setValues: escribir, clear: escribir, clearContent: escribir, setNote: escribir }),
      appendRow: escribir, deleteRow: escribir, insertRowsAfter: escribir };
  };
  const leidas = [];
  return { tabs, leidas, getSheetByName: n => (tabs[n] ? (leidas.push(n), hoja(n, tabs[n])) : null), getSpreadsheetTimeZone: () => 'America/Mexico_City', getName: () => 'Finanzas AL3D (de mentiras)',
    insertSheet: escribir };
}
/* El Utilities de Apps Script que hace falta: computeHmacSha256Signature como el de VERDAD (US-ASCII con un «?» por cada carácter
   que no lo sea, bytes con signo; comprobado el 2026-10-10, pruebas/datos/hmac-apps-script-real.json y pruebas/supabase-sello.mjs),
   computeDigest sobre bytes (con signo, como getContent()) y newBlob. */
const asciiInterr = s => Uint8Array.from([...String(s)].map(c => (c.codePointAt(0) < 128 ? c.codePointAt(0) : 63)));
const aSigno = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const sinSigno = a => Buffer.from(Array.from(a, b => (b + 256) % 256));
const UTILITIES = {
  formatDate: formatear,
  DigestAlgorithm: { SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8' },
  computeHmacSha256Signature: (valor, clave) => aSigno(createHmac('sha256', asciiInterr(clave)).update(asciiInterr(valor)).digest()),
  computeDigest: (alg, valor) => { if (!Array.isArray(valor)) throw new Error('el doble solo sabe digerir bytes'); return aSigno(createHash(alg).update(sinSigno(valor)).digest()); },
  newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre, getBytes: () => bytes }),
};
/** Una respuesta de UrlFetchApp: status, texto o bytes (con signo, como getContent()) y cabeceras. */
function respuestaFalsa({ status = 200, texto = '', bytes = null, cabeceras = {} } = {}) {
  const b = bytes || aSigno(Buffer.from(texto, 'utf8'));
  return { getResponseCode: () => status, getContentText: () => (bytes ? sinSigno(bytes).toString('utf8') : texto), getContent: () => b, getHeaders: () => ({ ...cabeceras }) };
}
/**
 * Un .gs (o varios, en orden, en el MISMO contexto: así comparten el ámbito global como los archivos de un proyecto de Apps
 * Script) con los servicios de mentiras. `rutas(u, o)` contesta lo que no es la función (Drive); `drive` es el DriveApp.
 */
function cargarGs(fuente, { props = {}, respuesta = { status: 200, texto: '{}' }, conPuenteVersion = true, falloFetch = null, tabs = {}, rutas = null, drive = null } = {}) {
  const reg = { logs: [], fetch: [], orden: [], drive: [], permisos: [] };
  const triggers = [{ fn: 'enviarResumen' }, { fn: 'alEditar' }];
  const libro = libroFalso(tabs);
  const driveQueAnota = new Proxy({}, { get: (_, metodo) => (...args) => {
    if (metodo === 'createFile') { reg.drive.push({ nombre: args[0], contenido: args[1] }); return { getUrl: () => 'https://drive.falso/archivo' }; }
    reg.drive.push({ metodo }); throw new Error('no hay Drive en esta prueba');
  } });
  const ctx = vm.createContext({
    SpreadsheetApp: { getActive: () => libro },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: () => { throw new Error('no escribe propiedades'); } }) },
    Utilities: UTILITIES,
    Logger: { log: x => reg.logs.push(String(x)) },
    console: { log: x => reg.logs.push(String(x)), error: x => reg.logs.push(String(x)) },
    LockService: { getScriptLock: () => ({ waitLock: () => reg.orden.push('candado'), tryLock: () => (reg.orden.push('candado'), true), releaseLock: () => reg.orden.push('soltar') }) },
    UrlFetchApp: { fetch: (u, o) => {
      reg.orden.push('mandar'); reg.fetch.push({ u, o });
      if (falloFetch) throw falloFetch;
      const otra = rutas ? rutas(u, o || {}) : null;
      if (otra) return otra;
      return respuesta.getResponseCode ? respuesta : respuestaFalsa(respuesta);
    } },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' }, WeekDay: { SUNDAY: 'SUNDAY' },
      getOAuthToken: () => 'token-FALSO-de-la-hoja',
      requireScopes: (modo, alcances) => { reg.permisos.push(alcances.slice()); },
      getProjectTriggers: () => triggers.map(t => ({ getHandlerFunction: () => t.fn, _t: t })),
      deleteTrigger: x => { const i = triggers.indexOf(x._t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: fn => { const t = { fn, cadena: [] }; const b = { timeBased: () => (t.cadena.push('timeBased'), b), atHour: h => (t.cadena.push('atHour:' + h), b),
        everyDays: n => (t.cadena.push('everyDays:' + n), b), onWeekDay: d => (t.cadena.push('onWeekDay:' + d), b), inTimezone: z => (t.cadena.push('inTimezone:' + z), b),
        create: () => { triggers.push(t); return {}; } }; return b; },
    },
    DriveApp: drive || driveQueAnota,
    ...(conPuenteVersion ? { PUENTE_VERSION: 'puente-sheets-14' } : {}),
  });
  for (const f of [].concat(fuente)) vm.runInContext(f, ctx, { filename: 'gs' });
  return { ctx, reg, triggers, libro };
}
const PROPS = { IMPORTAR_URL: 'https://gwzfdprdrdudfakjsdxf.supabase.co/functions/v1/importar-diario', IMPORTAR_SECRETO: SECRETO };
{
  const sinNada = cargarGs(GS);
  const m0 = sinNada.ctx.copiarHojaASupabase();
  eq('sin propiedades: no lee la hoja, no manda nada, y dice las dos que faltan', [sinNada.reg.fetch.length, sinNada.libro.leidas.length, /IMPORTAR_URL/.test(m0) && /IMPORTAR_SECRETO/.test(m0) && /no se hizo nada/.test(m0)], [0, 0, true]);
  for (const [que, props] of [['un secreto de 31 caracteres', { ...PROPS, IMPORTAR_SECRETO: 'x'.repeat(31) }], ['una URL que no es de Supabase', { ...PROPS, IMPORTAR_URL: 'https://evil.example/functions/v1/importar-diario' }],
    ['una URL de Supabase con otro camino', { ...PROPS, IMPORTAR_URL: 'https://gwzfdprdrdudfakjsdxf.supabase.co/functions/v1/otra' }], ['http sin s', { ...PROPS, IMPORTAR_URL: PROPS.IMPORTAR_URL.replace('https', 'http') }]]) {
    const g = cargarGs(GS, { props });
    g.ctx.copiarHojaASupabase();
    eq('con ' + que + ': no manda nada', [g.reg.fetch.length, /no se hizo nada/.test(g.reg.logs[0] || '')], [0, true]);
  }

  const resp = { status: 200, texto: JSON.stringify({ ok: true, aplicado: true, cuadra: true, ventas: 3, diferencias: 0, conflictos: 0, rechazos: 0, duracion_ms: 4100, id: '9' }) };
  const g = cargarGs(GS, { props: PROPS, respuesta: resp });
  const linea = g.ctx.copiarHojaASupabase();
  eq('con sus propiedades: UN envío, por POST a la función, con el secreto en la cabecera y sin seguir redirecciones', [g.reg.fetch.length, g.reg.fetch[0].u, g.reg.fetch[0].o.method,
    g.reg.fetch[0].o.contentType, g.reg.fetch[0].o.headers['x-importar-secreto'] === SECRETO, g.reg.fetch[0].o.followRedirects, g.reg.fetch[0].o.muteHttpExceptions],
    [1, PROPS.IMPORTAR_URL, 'post', 'application/json', true, false, true]);
  eq('lee con el candado del puente puesto y lo suelta ANTES de mandar', g.reg.orden, ['candado', 'soltar', 'mandar']);
  eq('ni Drive ni escribir la hoja (las escrituras del doble truenan)', g.reg.drive.length, 0);
  const mandado = JSON.parse(g.reg.fetch[0].o.payload);
  const v = cargarGs(VOL_GS, {});
  v.ctx.volcarParaImportar();
  const deDrive = JSON.parse(v.reg.drive[0].contenido);
  const sinHora = x => { const { autorizaciones_comprobadas: _, ...resto } = x; return { ...resto, hecho: 'x' }; };
  eq('lo que manda es EXACTAMENTE el volcado de volcado-para-importar.gs (salvo la hora en que se hizo y la comprobación de las firmas)', sinHora(mandado), sinHora(deDrive));
  eq('sin Código.gs junto (aquí está solo): no comprueba ninguna firma y lo dice', mandado.autorizaciones_comprobadas, { version: 1, filas: [], sin: 'codigo' });
  eq('las mismas pestañas en los dos archivos', /var COPIA_PESTANAS = (\[[\s\S]*?\]);/.exec(GS)[1].replace(/\s+/g, ' '), /var VOLCADO_PESTANAS = (\[[\s\S]*?\]);/.exec(VOL_GS)[1].replace(/\s+/g, ' '));
  eq('con fechas como {$fecha,$hora,$ms} en la zona de la hoja, y una fecha inválida como celda vacía', [mandado.pestanas['Abonos comisión'][1][3].$fecha, mandado.pestanas['Abonos comisión'][1][3].$hora, mandado.pestanas['Accesos'][2][2]],
    ['2026-09-15', '10:30', '']);
  eq('formato al3d-volcado v1, con la versión del puente, y sin la pestaña que no se manda', [mandado.formato, mandado.version, mandado.puente_version, 'Pestaña que no se manda' in mandado.pestanas], ['al3d-volcado', 1, 'puente-sheets-14', false]);
  cierto('y lo que manda lo acepta la función tal cual (forma de volcado)', H.problemaDelVolcado(mandado, Date.parse(mandado.hecho)) === null);
  eq('la línea del registro: cuentas, sin nombres ni importes', [/aplicada · CUADRA · 3 ventas · 0 diferencias · 0 conflictos/.test(linea), fugas(linea).length, /PersonaGs|1500|150\.25/.test(g.reg.logs.join('\n'))], [true, 0, false]);
  const con = { status: 200, texto: JSON.stringify({ ok: true, aplicado: false, cuadra: false, ventas: 3, diferencias: 2, conflictos: 1, rechazos: 1, motivo: 'conflictos', nombre: 'PersonaGs 1500.50' }) };
  const g2 = cargarGs(GS, { props: PROPS, respuesta: con });
  const l2 = g2.ctx.copiarHojaASupabase();
  eq('sin aplicar: lo dice, con sus cuentas, y no copia nada más de la respuesta', [/NO se aplicó/.test(l2), /2 diferencias · 1 conflictos · 1 filas que no entran/.test(l2), /PersonaGs/.test(l2)], [true, true, false]);
  const g3 = cargarGs(GS, { props: PROPS, respuesta: { status: 401, texto: '{"ok":false,"codigo":"SIN_SESION","mensaje":"No autorizado."}' } });
  eq('401: dice el código y la pista del secreto', /contestó 401 SIN_SESION.*secreto no coincide/.test(g3.ctx.copiarHojaASupabase()), true);
  const g4 = cargarGs(GS, { props: PROPS, respuesta: { status: 502, texto: '<html>PersonaGs</html>' } });
  eq('una respuesta que no es JSON: solo el número, nada del cuerpo', [/contestó 502 \(3 ventas mandadas/.test(g4.ctx.copiarHojaASupabase()), /PersonaGs/.test(g4.reg.logs.join(''))], [true, false]);
  const g5 = cargarGs(GS, { props: PROPS, falloFetch: new Error('Address unavailable') });
  eq('la función no contesta: lo dice y no truena', /no contestó \(Address unavailable\)/.test(g5.ctx.copiarHojaASupabase()), true);
  eq('ni en esos casos el secreto llega al registro', [g, g2, g3, g4, g5].some(x => x.reg.logs.join('').includes(SECRETO)), false);

  // el disparador
  const d0 = cargarGs(GS);
  d0.ctx.instalarCopiaDiaria();
  eq('instalar sin propiedades: no programa nada', d0.triggers.map(t => t.fn), ['enviarResumen', 'alEditar']);
  const d = cargarGs(GS, { props: PROPS });
  d.ctx.instalarCopiaDiaria(); d.ctx.instalarCopiaDiaria();
  eq('instalar (dos veces): OCHO disparadores de copiarHojaASupabase, cada 3 horas en hora de México (2026-10-24, por la pantalla del taller); los de la hoja siguen',
    d.triggers.map(t => [t.fn, (t.cadena || []).join(',')]), [['enviarResumen', ''], ['alEditar', ''], ...[0, 3, 6, 9, 12, 15, 18, 21].map(h => ['copiarHojaASupabase', 'timeBased,atHour:' + h + ',everyDays:1,inTimezone:America/Mexico_City'])]);
  const msg = d.ctx.quitarCopiaDiaria();
  eq('quitar: solo los suyos', [d.triggers.map(t => t.fn), /8 disparadores quitados/.test(msg)], [['enviarResumen', 'alEditar'], true]);
  eq('quitar otra vez: dice que no estaba', /no estaba programada/.test(d.ctx.quitarCopiaDiaria()), true);

  // junto a Código.gs
  const nombres = t => new Set([...t.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm)].map(m => m[1] || m[2]));
  const propios = nombres(GS);
  eq('ningún nombre de copia-diaria.gs existe en Código.gs (hoja-apps-script.gs) ni en volcado-para-importar.gs: pegado junto, no pisa nada',
    [...propios].filter(n => nombres(PUENTE_GS).has(n) || nombres(VOL_GS).has(n)), []);
  const EDITOR = ['copiarHojaASupabase', 'instalarCopiaDiaria', 'quitarCopiaDiaria', 'respaldarSemanal', 'instalarRespaldoSemanal', 'quitarRespaldoSemanal'];
  eq('y todos llevan su prefijo (o son las seis que se eligen en el editor)', [...propios].filter(n => !/^(copia|Copia|COPIA_)/.test(n) && !EDITOR.includes(n)), []);
  cierto('las seis que se eligen en el editor no terminan en _ (Apps Script esconde esas)', EDITOR.every(n => propios.has(n)));
  const sinComentarios = GS.replace(/\/\*[\s\S]*?\*\//g, '');
  const corte = GS.lastIndexOf('/*', GS.indexOf('EL RESPALDO SEMANAL DE LA BASE'));
  cierto('no usa nada que escriba la hoja ni las propiedades: ni setValue(s), ni appendRow, ni setProperty', !/setValues?\(|appendRow|setProperty|deleteProperty|insertSheet|deleteRow/.test(sinComentarios));
  cierto('y la COPIA no toca Drive: DriveApp solo aparece en el bloque del respaldo, que va después y no lee la hoja',
    corte > 0 && !/DriveApp/.test(GS.slice(0, corte).replace(/\/\*[\s\S]*?\*\//g, '')) && !/SpreadsheetApp/.test(GS.slice(corte).replace(/\/\*[\s\S]*?\*\//g, '')));
}

/* ============================================================================ */
seccion('9 bis. LAS FIRMAS DE «AUTORIZACIONES», COMPROBADAS DENTRO DE LA HOJA — Código.gs real + copia-diaria.gs en el mismo vm, clave FALSA');
{
  const CLAVE = 'CLAVE-FALSA-SOLO-PARA-PRUEBAS-0000';
  const PROPS_SELLO = { ...PROPS, SELLO_AUTORIZACION: CLAVE };
  /* Las filas como las deja autorizar() de Código.gs (17 columnas, getValues()), firmadas con SU firmar() en el mismo contexto. */
  const base = (o) => {
    const v = new Array(17).fill('');
    Object.assign(v, { 0: o.ts, 1: o.folio, 2: o.proyecto, 3: 'Cliente de mentiras', 4: o.sub ?? 12500, 5: o.precio ?? 0, 6: o.total ?? 14500, 7: 0, 8: o.items ?? '',
      9: o.huella ?? 'c|1:Letras~acrilico', 10: 'dir@al3d.test', 11: 'pag@al3d.test', 14: o.estado ?? 'vigente', 15: '', 16: o.renglones ?? '' });
    return v;
  };
  const especies = [
    { folio: 'COT-0101@K7QM', ts: '2026-09-01T16:00:00.000Z', proyecto: 'Tacos Ana' },                                                  // 2: v1, todo ASCII
    { folio: 'COT-0102@K7QM', ts: '2026-09-02T16:00:00.000Z', proyecto: 'Taquería «El Güero»', items: '1:500.00',
      renglones: '[["Letras 3D · 8 × 40 cm «Acrílico»",8,12500]]' },                                                                     // 3: v2 con acentos, ·, × y «»
    { folio: 'COT-0103@K7QM', ts: '2026-09-03T16:00:00.000Z', proyecto: 'Óptica Luz', estado: 'superada' },                              // 4: superada, buena
    { folio: 'COT-0104@K7QM', ts: '2026-09-04T16:00:00.000Z', proyecto: 'Total movido', alterar: v => { v[6] = 15500; } },               // 5: el total, a mano
    { folio: 'COT-0105@K7QM', ts: '2026-09-05T16:00:00.000Z', proyecto: 'Nombre', alterar: v => { v[2] = 'Nombre cambiado'; } },          // 6: el negocio, a mano
    { folio: 'COT-0106@K7QM', ts: '2026-09-06T16:00:00.000Z', proyecto: 'Código', alterar: v => { v[12] = 'AAAA-BBBB-CCCC'; } },          // 7: el código impreso
    { folio: 'COT-0107@K7QM', ts: '2026-09-07T16:00:00.000Z', proyecto: 'Hora hecha fecha', alterar: v => { v[0] = new Date(v[0]); } },   // 8: la hoja la volvió fecha
  ];
  const conCodigo = (props = PROPS_SELLO, o = {}, mas = []) => {
    const g = cargarGs([PUENTE_GS, GS], { props, ...o });
    const filasAut = especies.concat(mas).map(e => {
      const v = base(e);
      const firma = g.ctx.firmar(g.ctx.registroDeFila(v), CLAVE);
      v[13] = firma; v[12] = g.ctx.codigoDe(firma);
      if (e.alterar) e.alterar(v);
      return v;
    });
    filasAut.push(base({ folio: '', ts: '', proyecto: 'renglón a medias, sin folio' }));                                                 // 9: no es una autorización
    g.libro.tabs['Autorizaciones'] = [['Cuándo (ISO)', 'Folio', 'Proyecto', 'Cliente', 'Subtotal calculado', 'Precio autorizado (neto)', 'Total', 'Ajuste %',
      'Ajustes por partida', 'Huella', 'Autorizó', 'Solicitó', 'Código', 'Firma', 'Estado', 'Nota', 'Renglones'], ...filasAut];
    return g;
  };

  const g = conCodigo();
  g.ctx.copiarHojaASupabase();
  const textoMandado = g.reg.fetch[0].o.payload;
  const mandado = JSON.parse(textoMandado);
  const ver = mandado.autorizaciones_comprobadas;
  eq('un veredicto por fila con folio (la 9 no lo tiene): buenas la 2, 3 y 4; las alteradas a mano, no, con su motivo',
    ver.filas.map(f => [f.fila, f.firma_ok, f.firma_ok ? f.codificacion : f.motivo]),
    [[2, true, 'ascii-?'], [3, true, 'ascii-?'], [4, true, 'ascii-?'], [5, false, 'firma_no_coincide'], [6, false, 'firma_no_coincide'], [7, false, 'codigo_no_coincide'], [8, false, 'firma_no_coincide']]);
  eq('las buenas llevan el texto que se firmó (canon de Código.gs); las malas, nada más que su motivo',
    [ver.filas.filter(f => f.firma_ok).every(f => typeof f.canon === 'string' && f.canon.startsWith('AL3D-AUTH-v')), ver.filas.filter(f => !f.firma_ok).every(f => Object.keys(f).sort().join() === 'fila,firma_ok,motivo')],
    [true, true]);
  eq('NUNCA la clave: ni en lo que se manda (tal cual o escapada), ni en el registro, ni una firma recalculada de las malas',
    [textoMandado.includes(CLAVE), textoMandado.includes(JSON.stringify(CLAVE).slice(1, -1)), g.reg.logs.join('\n').includes(CLAVE),
      ver.filas.some(f => 'firma' in f || 'clave' in f || 'secreto' in f)], [false, false, false, false]);
  eq('y la comprobación se hizo con el candado puesto, antes de mandar (lee una sola vez)', g.reg.orden, ['candado', 'soltar', 'mandar']);
  const cg = vm.runInContext('copiaHayNotario_()', g.ctx);
  cierto('copiaHayNotario_ ve las funciones de Código.gs desde el otro archivo (ámbito global compartido)', cg === true);

  /* Lo que mandó la hoja, a la función (con un volcado de 220 ventas que cuadra, para ver que lo de las firmas no frena nada). */
  const vol = { ...VOLCADO, pestanas: { ...VOLCADO.pestanas, 'Autorizaciones': mandado.pestanas['Autorizaciones'] }, autorizaciones_comprobadas: ver };
  const b = baseFalsa();
  const r = await llamar({ base: b, cuerpo: JSON.stringify(vol) });
  eq('la función: aplicada y CUADRA; entran las 3 buenas, 4 no entran y NO frenan la copia (ni rechazos ni conflictos)',
    [r.status, r.c.aplicado, r.c.cuadra, r.c.rechazos, r.c.conflictos, r.c.autorizaciones], [200, true, true, 0, 0, { comprobadas: 3, no_entran: 4 }]);
  const sqlCopia = b.tx[0].find(x => x.e && clase(x.e) === 'importador').e;
  const firmaDe = n => mandado.pestanas['Autorizaciones'][n - 1][13];
  eq('al SQL van las firmas de las filas 2, 3 y 4, y ninguna de las otras', [2, 3, 4, 5, 6, 7, 8].map(n => sqlCopia.includes(firmaDe(n))), [true, true, true, false, false, false, false]);
  const res = JSON.parse(b.insertados[0][6]);
  eq('el renglón de cuadre_diario dice qué filas no entraron y por qué (lista cerrada), sin folios ni nombres; la 7 (código cambiado) ya la para el importador antes',
    res.no_importado.find(x => x.que === 'Autorizaciones'), { que: 'Autorizaciones', n: 4, filas: [5, 6, 7, 8], motivos: { firma_no_coincide: 3, fila_mal_formada: 1 } });
  eq('ni el renglón, ni la respuesta, ni el registro llevan nombres, importes, el secreto ni la clave',
    [fugas(b.insertados[0][6] + r.texto + r.reg.join('\n')), (b.insertados[0][6] + r.texto + r.reg.join('')).includes(CLAVE), /COT-01/.test(b.insertados[0][6])], [[], false, false]);
  const linea = g.ctx.copiaLinea_(200, r.c, 220, 4.2);
  cierto('la línea del registro de la hoja lo cuenta: «3 autorizaciones con firma buena (4 no entran…)»', /3 autorizaciones con firma buena \(4 no entran/.test(linea));

  /* Lo que se guardaría es lo que se firmó: sello.js (otra implementación, WebCrypto) lo recalcula con la clave desde la fila del plan. */
  const plan = await planear({ volcado: vol, semilla: SEMILLA, aceptarVeredictosDeLaHoja: true });
  const S = await import(url('supabase/functions/_shared/sello.js'));
  const comoBase = a => ({ ...a, sub_calc: a.sub_calc_txt, precio_auth: a.precio_auth_txt, total: a.total_txt });
  const v = [];
  for (const a of plan.tablas.autorizaciones) v.push([a.fila_hoja, a.codificacion, (await S.verificar(comoBase(a), CLAVE)).valida]);
  eq('cada autorización que entra se verifica después con la clave, desde lo que guardaría la base, con SU codificación (ascii-?)', v,
    [[2, 'ascii-?', true], [3, 'ascii-?', true], [4, 'ascii-?', true]]);

  /* El importador de línea de comandos NO cree el veredicto: sin la clave, ninguna entra. */
  const cli = await planear({ volcado: vol, semilla: SEMILLA });
  eq('planear sin aceptarVeredictosDeLaHoja (como scripts/importar-hoja.mjs): ninguna entra; «falta la clave»', [cli.tablas.autorizaciones.length, cli.reporte.no_importado.find(x => x.que === 'Autorizaciones').n,
    /falta la clave/.test(cli.reporte.no_importado.find(x => x.que === 'Autorizaciones').por)], [0, 7, true]);
  cierto('y scripts/importar-hoja.mjs llama planear solo con volcado, teléfonos y la clave del entorno', /planear\(\{ volcado, telefonos, clave: env\.AL3D_SELLO_CLAVE \|\| null \}\)/.test(leer('scripts/importar-hoja.mjs')));
  const conClave = await planear({ volcado: vol, semilla: SEMILLA, clave: CLAVE, aceptarVeredictosDeLaHoja: true });
  eq('con la clave a la mano, manda la clave (se recalcula aquí; el veredicto no se usa): entra también la 8, cuya hora la hoja volvió fecha y aquí se reconstruye ' +
    '(la hoja dice que no porque su /verificar ya no la reconoce)', conClave.tablas.autorizaciones.map(a => a.fila_hoja), [2, 3, 4, 8]);

  /* Un veredicto que no cuadra con la fila que llegó: no se le cree. */
  const t = JSON.parse(JSON.stringify(vol));
  t.pestanas['Autorizaciones'][1][2] = 'Tacos Ana y Asociados';                                                // la 2 dice otra cosa que lo que se comprobó
  t.autorizaciones_comprobadas.filas.find(f => f.fila === 3).codificacion = 'utf-16';                           // la 3, con una codificación que no existe
  t.autorizaciones_comprobadas.filas.push({ ...t.autorizaciones_comprobadas.filas.find(f => f.fila === 4) });    // la 4, dos veces
  const p2 = await planear({ volcado: t, semilla: SEMILLA, aceptarVeredictosDeLaHoja: true });
  eq('texto distinto del comprobado, codificación inventada, veredicto repetido: ninguna entra, cada una con su motivo',
    [p2.tablas.autorizaciones.length, p2.reporte.no_importado.find(x => x.que === 'Autorizaciones').detalle.filter(x => x.fila <= 4).map(x => x.fila + ':' + x.motivo)],
    [0, ['2:texto_distinto', '3:veredicto_invalido', '4:sin_veredicto']]);
  const gDos = conCodigo(PROPS_SELLO, {}, [{ folio: 'COT-0101@K7QM', ts: '2026-09-09T16:00:00.000Z', proyecto: 'Tacos Ana', total: 15000 }]);   // fila 9: otra vigente de la 2
  gDos.ctx.copiarHojaASupabase();
  const p3 = await planear({ volcado: { ...VOLCADO, ...JSON.parse(gDos.reg.fetch[0].o.payload), pestanas: { ...VOLCADO.pestanas, 'Autorizaciones': JSON.parse(gDos.reg.fetch[0].o.payload).pestanas['Autorizaciones'] } },
    semilla: SEMILLA, aceptarVeredictosDeLaHoja: true });
  eq('dos vigentes del mismo folio (las dos con firma buena): en la copia diaria no se decide; las dos esperan en la hoja, sin conflicto que frene',
    [p3.tablas.autorizaciones.map(a => a.fila_hoja), p3.reporte.conflictos.length, p3.reporte.no_importado.find(x => x.que === 'Autorizaciones').detalle.filter(x => x.motivo === 'dos_vigentes').map(x => x.fila)],
    [[3, 4], 0, [2, 9]]);

  /* Sin clave en la hoja, sin Código.gs, o con la hoja vieja (sin comprobación): no entra ninguna, se dice y la copia sigue. */
  const sinClave = conCodigo(PROPS);
  sinClave.ctx.copiarHojaASupabase();
  const mSin = JSON.parse(sinClave.reg.fetch[0].o.payload);
  eq('sin SELLO_AUTORIZACION en las propiedades: { sin: clave } y NO crea una (setProperty truena en el doble)', mSin.autorizaciones_comprobadas, { version: 1, filas: [], sin: 'clave' });
  for (const [que, comp, motivo] of [['la hoja sin clave', mSin.autorizaciones_comprobadas, 'sin_clave_en_la_hoja'], ['sin Código.gs', { version: 1, filas: [], sin: 'codigo' }, 'sin_codigo_gs'],
    ['un volcado de antes (sin comprobación)', undefined, 'sin_comprobacion']]) {
    const b2 = baseFalsa();
    const r2 = await llamar({ base: b2, cuerpo: JSON.stringify({ ...vol, autorizaciones_comprobadas: comp }) });
    eq(que + ': aplicada y cuadra; las 7 no entran, con su motivo', [r2.c.aplicado, r2.c.cuadra, r2.c.autorizaciones, JSON.parse(b2.insertados[0][6]).no_importado.find(x => x.que === 'Autorizaciones').motivos],
      [true, true, { comprobadas: 0, no_entran: 7 }, { [motivo]: 7 }]);
  }
}

/* ============================================================================ */
seccion('10. AJUSTES — la racha de la copia diaria, y apagado no cambia nada');
{
  const f = (fecha, cuadra, hora = '09:05', o = {}) => ({ fecha, hecho_en: fecha + 'T' + hora + ':00.000Z', aplicado: true, cuadra, diferencias: cuadra ? 0 : 2, conflictos: 0, rechazos: 0, ...o });
  eq('sin corridas: null', Q.resumenCopiaDiaria([], '2026-10-17'), null);
  const r = Q.resumenCopiaDiaria([f('2026-10-11', true), f('2026-10-12', false), f('2026-10-13', true), f('2026-10-14', true), f('2026-10-15', true), f('2026-10-16', true), f('2026-10-17', true)], '2026-10-17');
  eq('cuadró 6 de 7; la racha, 5 (el 12 la cortó); el último, el del 17', [r.deSiete, r.racha, r.meta, r.ultimo.fecha, r.ultimo.cuadra], [6, 5, 7, '2026-10-17', true]);
  const r2 = Q.resumenCopiaDiaria([f('2026-10-17', false, '09:05'), f('2026-10-17', true, '15:00'), f('2026-10-16', true)], '2026-10-17');
  eq('dos corridas el mismo día: manda la última (la de la tarde, que cuadró)', [r2.deSiete, r2.racha, r2.ultimo.cuadra], [2, 2, true]);
  const r3 = Q.resumenCopiaDiaria([f('2026-10-09', true), f('2026-10-10', true)], '2026-10-17');
  eq('lo de hace más de una semana no cuenta en «de 7»', [r3.deSiete, r3.racha], [0, 2]);
  const r4 = Q.resumenCopiaDiaria([f('2026-10-17', false, '09:05', { aplicado: false, conflictos: 3, rechazos: 1, nombre: 'PersonaGs' })], '2026-10-17');
  eq('el último trae solo cuentas (lo que no es suyo no pasa)', r4.ultimo, { fecha: '2026-10-17', hecho_en: '2026-10-17T09:05:00.000Z', aplicado: false, cuadra: false, diferencias: 2, conflictos: 3, rechazos: 1 });

  const sinCom = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const aj = sinCom(leer('js/mod/ajustes.js'));
  const pinta = /async function pintarSupabase\(\) \{([\s\S]*?)\n\}/.exec(aj)[1];
  cierto('apagado (sin el interruptor de Supabase), pintarSupabase sale antes de cualquier cosa nueva', pinta.indexOf('if (!Supa.encendido())') > -1 &&
    pinta.indexOf('if (!Supa.encendido())') < pinta.indexOf('bloqueSombra()') && /if \(!Supa\.encendido\(\)\) \{[\s\S]*?return;\s*\}/.test(pinta));
  cierto('el bloque que lee la copia diaria solo existe dentro de bloqueSombra, que solo se pinta a Dirección activa con sesión',
    (aj.match(/E\.cuadreDiario\(\)/g) || []).length === 1 && /async function bloqueSombra\(\) \{[\s\S]*?E\.cuadreDiario\(\)[\s\S]*?\n\}/.test(aj) &&
    /if \(a\.estado === 'activo' && a\.area === 'direccion'\) html \+= await bloquePersonas\(Supa\) \+ await bloquePantallas\(Supa\) \+ await bloqueSombra\(\);/.test(aj));
  cierto('y un fallo al leerla no rompe la tarjeta (se atrapa y se dice)', /E\.cuadreDiario\(\)\.catch\(/.test(aj));
  const en = sinCom(leer('js/datos/supa-enchufe.js'));
  const cd = /export async function cuadreDiario\(\) \{([\s\S]*?)\n\}/.exec(en)[1];
  cierto('supa-enchufe.cuadreDiario lee SOLO cuadre_diario, sin el resumen (solo las cuentas)', /from\('cuadre_diario'\)\.select\('fecha, hecho_en, aplicado, cuadra, diferencias, conflictos, rechazos'\)/.test(cd) &&
    !/select\([^)]*resumen/.test(cd));
  const sw = leer('sw.js');
  cierto('sw.js: APP_VERSION subió (los teléfonos bajan el Ajustes nuevo) y lleva los tres archivos que cambiaron', Number((/const APP_VERSION = (\d+);/.exec(sw) || [])[1]) >= 122 &&
    ['js/mod/ajustes.js', 'js/datos/supa-enchufe.js', 'js/datos/supa-cuadre.js'].every(a => sw.includes("'./" + a + "'")));
}

/* ============================================================================ */
seccion('11. EL RESPALDO SEMANAL, POR importar-diario — con el MISMO secreto, la base entera en un JSON, de solo lectura');
const R = await import(url('supabase/functions/_shared/respaldo.js'));
const RD = await import(url('supabase/functions/importar-diario/respaldo.js'));
const PEDIDO = JSON.stringify({ formato: 'al3d-pedir-respaldo', version: 1 });
/** La base de mentiras para el respaldo: contesta cada json_agg con las filas de su tabla (texto, como Postgres). */
function baseDeRespaldo(o = {}) {
  const m = { tx: [], abiertas: 0, cerradas: 0 };
  m.base = {
    transaccion: async fn => {
      const log = ['begin']; m.tx.push(log);
      try {
        const r = await fn({
          ejecutar: async t => { log.push({ e: t }); },
          consultar: async t => {
            log.push({ q: t });
            if (o.falla) throw o.falla;
            const tabla = /from public\.([a-z_]+) x$/.exec(t)[1];
            if (o.texto && o.texto[tabla]) return [{ filas: o.texto[tabla], n: 1 }];
            const filas = (o.tablas || {})[tabla] || [];
            return [{ filas: filas.length ? '[' + filas.map(f => JSON.stringify(f)).join(', \n ') + ']' : '[]', n: filas.length }];
          },
        });
        log.push('commit'); return r;
      } catch (e) { log.push('rollback'); throw e; }
    },
    cerrar: async () => { m.cerradas++; },
  };
  m.abrir = () => { m.abiertas++; return m.base; };
  return m;
}
/** La respuesta de la función, cruda (bytes y cabeceras): es lo que recibe UrlFetchApp. */
async function pedirRespaldo({ secreto = SECRETO, entorno = {}, base = baseDeRespaldo(), cuerpo = PEDIDO } = {}) {
  const env = { IMPORTAR_SECRETO: SECRETO, SUPABASE_DB_URL: URL_BD, SUPABASE_URL: 'https://gwzfdprdrdudfakjsdxf.supabase.co', ...entorno };
  const reg = [];
  const h = { 'content-type': 'application/json' };
  if (secreto !== null) h['x-importar-secreto'] = secreto;
  const res = await H.manejar(new Request('https://falso.supabase.co/functions/v1/importar-diario', { method: 'POST', headers: h, body: cuerpo }),
    { ahora: () => AHORA, entorno: n => env[n], semilla: SEMILLA, abrirBase: base.abrir, registrar: (n, l) => reg.push(n + ' ' + l) });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, bytes, texto: bytes.toString('utf8'), cab: Object.fromEntries(res.headers.entries()), reg, base };
}
/* Unas tablas de mentiras con datos de clientes (para ver que no salen al registro) y caracteres que no son ASCII. */
const TABLAS_FALSAS = {
  empresas: [{ id: 'al3d', nombre: 'AL3D' }],
  proyectos: [{ id: 'p1', nombre: 'PersonaRespaldo - Taquería «Ñandú»', tel: '33 41234567' }, { id: 'p2', nombre: 'Otra 😀', tel: '' }],
  abonos: [{ id: 1, importe: 1500.5, nota: 'abono de mentiras' }],
  autorizaciones: [{ id: 7, folio_global: 'COT-0101@K7QM', renglones: '[["Letras 3D · 8 × 40 cm",8,12500]]' }],
};
{
  const b = baseDeRespaldo({ tablas: TABLAS_FALSAS });
  const r = await pedirRespaldo({ base: b });
  const sha = createHash('sha256').update(r.bytes).digest('hex');
  eq('200, JSON, sin caché, con nombre, huella, bytes y filas en las cabeceras (y la huella y los bytes son los del cuerpo)',
    [r.status, r.cab['content-type'], r.cab['cache-control'], R.PATRON_NOMBRE.test(r.cab['x-respaldo-nombre']), r.cab['x-respaldo-sha256'] === sha, r.cab['x-respaldo-bytes'] === String(r.bytes.length), r.cab['x-respaldo-filas']],
    [200, 'application/json; charset=utf-8', 'no-store', true, true, true, '5']);
  const j = JSON.parse(r.texto);
  const tablas = Object.fromEntries(R.TABLAS.map(t => [t.nombre, TABLAS_FALSAS[t.nombre] || []]));
  eq('el archivo es EXACTAMENTE el de la función respaldo (armarArchivo, «al3d-respaldo-1»): mismas llaves, mismo orden, mismas filas', j,
    JSON.parse(R.armarArchivo({ tablas, ahoraMs: AHORA, origen: 'gwzfdprdrdudfakjsdxf.supabase.co' })));
  eq('con las 21 tablas en el orden de TABLAS, y el nombre del archivo con la hora', [Object.keys(j.tablas), r.cab['x-respaldo-nombre']], [R.TABLAS.map(t => t.nombre), R.nombreDeArchivo(AHORA)]);
  eq('UNA transacción de solo lectura (repeatable read: una foto exacta), con tope de tiempo y una consulta por tabla; ni candado ni escritura',
    b.tx.map(log => log.map(x => (typeof x === 'string' ? x : x.e !== undefined ? 'E:' + x.e : 'Q'))).map(l => [l.slice(0, 4), l.length]),
    [[['begin', 'E:set transaction isolation level repeatable read, read only', "E:set local statement_timeout = '60s'", 'Q'], 1 + 2 + 21 + 1]]);
  cierto('cada tabla con su orden de llave primaria, nombres solo de TABLAS', R.TABLAS.every(t => b.tx[0].some(x => x.q === RD.consultaDeTabla(t))) &&
    RD.consultaDeTabla({ nombre: 'contadores', orden: 'empresa_id,clave,ventana' }).includes('json_agg(x order by x.empresa_id, x.clave, x.ventana)'));
  let lanzo = false; try { RD.consultaDeTabla({ nombre: 'x; drop table y', orden: 'id' }); } catch (_) { lanzo = true; }
  cierto('un nombre de tabla raro no se arma', lanzo);
  eq('al registro: una línea de info con bytes y filas; ni un dato de cliente, ni el secreto, ni la base', [r.reg.length, /"evento":"respaldo"/.test(r.reg[0]),
    /PersonaRespaldo|Ñandú|33 41|abono de mentiras|1500/.test(r.reg.join('')), fugas(r.reg.join(''))], [1, true, false, []]);
  eq('se cerró la conexión', [b.abiertas, b.cerradas], [1, 1]);

  const otro = await pedirRespaldo({ secreto: SECRETO.slice(0, -1) + 'Z' });
  const sinSec = await pedirRespaldo({ entorno: { IMPORTAR_SECRETO: undefined } });
  eq('con otro secreto: 401 y la base ni se abre; sin IMPORTAR_SECRETO en la función: 503 y nada', [otro.status, otro.base.abiertas, sinSec.status, sinSec.base.abiertas], [401, 0, 503, 0]);
  const malPedido = await pedirRespaldo({ cuerpo: JSON.stringify({ formato: 'al3d-pedir-respaldo', version: 2 }) });
  eq('un pedido de otra versión no es respaldo (ni volcado): 400 y la base ni se abre', [malPedido.status, malPedido.base.abiertas], [400, 0]);
  const grande = await pedirRespaldo({ base: baseDeRespaldo({ texto: { proyectos: '["' + 'x'.repeat(RD.TOPE_RESPALDO) + '"]' } }) });
  eq('más de 45 MB: 413 RESPALDO_GRANDE, sin mandar nada (UrlFetchApp no recibe más de 50)', [grande.status, JSON.parse(grande.texto).codigo, grande.bytes.length < 2000], [413, 'RESPALDO_GRANDE', true]);
  const err = Object.assign(new Error('could not read: PersonaRespaldo ' + URL_BD), { code: '57014' });
  const caida = await pedirRespaldo({ base: baseDeRespaldo({ falla: err }) });
  eq('la base no contesta: 502 BASE_NO_CONTESTA; al registro, el código y nunca el mensaje', [caida.status, JSON.parse(caida.texto).codigo, /57014/.test(caida.reg.join('')),
    /PersonaRespaldo|could not/.test(caida.reg.join('') + caida.texto), fugas(caida.reg.join('') + caida.texto)], [502, 'BASE_NO_CONTESTA', true, false, []]);
  /* El CPU: unas 5 000 filas de proyectos (~2 MB). La función solo pega el texto de Postgres: no lo parsea ni lo vuelve a escribir. */
  const muchas = { proyectos: Array.from({ length: 5000 }, (_, i) => ({ id: 'p' + i, nombre: 'PersonaRespaldo' + i + ' - Negocio', notas: 'n'.repeat(300) })) };
  const bm = baseDeRespaldo({ tablas: muchas });
  const c0 = process.cpuUsage();
  const rm = await pedirRespaldo({ base: bm });
  const cpu = (d => (d.user + d.system) / 1000)(process.cpuUsage(c0));
  console.log(`  ·    respaldo de ${Math.round(rm.bytes.length / 1024)} KB: ${cpu.toFixed(0)} ms de CPU en node (con la base de mentiras armando el texto)`);
  cierto('y gasta poco CPU (menos de 500 ms con 2 MB; el límite es 2 s)', rm.status === 200 && cpu < 500);
}

/* ============================================================================ */
seccion('12. EL RESPALDO SEMANAL EN LA HOJA (copia-diaria.gs, respaldarSemanal), EN vm — lo pide, lo comprueba, lo guarda en «AL3D Respaldos» y deja 8');
/** Drive de mentiras: unidades compartidas y carpetas (lo que contestaría la API v3) y los archivos de cada carpeta (DriveApp). */
function driveFalso({ unidades = [{ id: 'unidadAL3DRespaldos01', name: 'AL3D Respaldos' }], carpetas = [], archivos = [], fallaBusqueda = null } = {}) {
  const d = { creados: [], papelera: [], carpetasCreadas: [], abiertas: [], busquedas: [], archivos };
  const archivo = o => ({ getId: () => o.id, getName: () => o.name, getDescription: () => o.desc || '', isTrashed: () => !!o.trashed,
    setTrashed: v => { o.trashed = v; d.papelera.push(o.name); }, setDescription: x => { o.desc = x; } });
  const carpeta = id => ({
    getFiles: () => { const l = archivos.filter(a => a.carpeta === id).map(archivo); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
    createFile: blob => { const o = { id: 'archivoNuevo' + (d.creados.length + 1) + 'xxxx', name: blob.nombre, tipo: blob.tipo, bytes: blob.bytes, carpeta: id }; archivos.push(o); d.creados.push(o); return archivo(o); },
  });
  d.DriveApp = { getFolderById: id => { d.abiertas.push(id); return carpeta(id); }, createFolder: n => { d.carpetasCreadas.push(n); return carpeta('carpetaCreadaMiUnidad1'); } };
  d.rutas = (u, o) => {
    if (!u.startsWith('https://www.googleapis.com/drive/v3/')) return null;
    d.busquedas.push({ u, auth: o.headers && o.headers.Authorization, q: new URL(u).searchParams.get('q') });
    if (fallaBusqueda) return respuestaFalsa({ status: fallaBusqueda, texto: '{"error":{"code":' + fallaBusqueda + '}}' });
    if (u.includes('/drive/v3/drives?')) return respuestaFalsa({ texto: JSON.stringify({ drives: unidades }) });
    return respuestaFalsa({ texto: JSON.stringify({ files: carpetas }) });
  };
  return d;
}
/** Lo que contesta la función de verdad (handler.js) a un pedido de respaldo, como respuesta de UrlFetchApp. */
async function respuestaDeLaFuncion(cambiar) {
  const r = await pedirRespaldo({ base: baseDeRespaldo({ tablas: TABLAS_FALSAS }) });
  const x = { status: r.status, bytes: aSigno(r.bytes), cabeceras: { 'X-Respaldo-Nombre': r.cab['x-respaldo-nombre'], 'X-Respaldo-Sha256': r.cab['x-respaldo-sha256'],
    'X-Respaldo-Bytes': r.cab['x-respaldo-bytes'], 'X-Respaldo-Filas': r.cab['x-respaldo-filas'], 'Content-Type': r.cab['content-type'] } };
  if (cambiar) cambiar(x);
  return respuestaFalsa(x);
}
const MARCA = /var COPIA_RESPALDO_MARCA = '([^']+)';/.exec(GS)[1];
/* Lo que ya había en la carpeta: 9 respaldos de este script (uno ya en la papelera), uno que se llama igual pero sin la marca (alguien lo dejó
   a mano) y otro archivo cualquiera. */
const yaHabia = id => [
  ...Array.from({ length: 9 }, (_, i) => ({ id: 'viejo' + i + 'xxxxxxxxxx', name: `al3d-respaldo-2026-08-${String(10 + i)}T112300Z.json`, desc: MARCA, carpeta: id })),
  { id: 'enPapelera0xxxxxxx', name: 'al3d-respaldo-2026-07-01T112300Z.json', desc: MARCA, carpeta: id, trashed: true },
  { id: 'ajeno0xxxxxxxxxxx', name: 'al3d-respaldo-2026-01-01T000000Z.json', desc: '', carpeta: id },
  { id: 'otro0xxxxxxxxxxxx', name: 'notas.txt', desc: MARCA, carpeta: id },
];
{
  const d = driveFalso({ archivos: yaHabia('unidadAL3DRespaldos01') });
  const resp = await respuestaDeLaFuncion();
  const g = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: resp, rutas: d.rutas, drive: d.DriveApp });
  const linea = g.ctx.respaldarSemanal();
  eq('pide el respaldo a la función: POST, con el secreto en la cabecera, sin seguir redirecciones, cuerpo «al3d-pedir-respaldo»', [g.reg.fetch[0].u, g.reg.fetch[0].o.method,
    g.reg.fetch[0].o.headers['x-importar-secreto'] === SECRETO, g.reg.fetch[0].o.followRedirects, g.reg.fetch[0].o.payload], [PROPS.IMPORTAR_URL, 'post', true, false, PEDIDO]);
  eq('busca la unidad compartida «AL3D Respaldos» por nombre, con el permiso de la hoja (su token), y guarda AHÍ',
    [d.busquedas.map(b => b.q), d.busquedas[0].auth, d.abiertas, d.carpetasCreadas], [["name = 'AL3D Respaldos'"], 'Bearer token-FALSO-de-la-hoja', ['unidadAL3DRespaldos01'], []]);
  const nuevo = d.creados[0];
  eq('UN archivo, con el nombre que dio la función, JSON, con los MISMOS bytes que llegaron y la marca del script',
    [d.creados.length, nuevo.name, nuevo.tipo, Buffer.compare(sinSigno(nuevo.bytes), sinSigno(resp.getContent())) === 0, nuevo.desc === MARCA, R.PATRON_NOMBRE.test(nuevo.name)],
    [1, resp.getHeaders()['X-Respaldo-Nombre'], 'application/json', true, true, true]);
  eq('se quedan 8 (el nuevo y los 7 más recientes); los 2 más viejos de los SUYOS van a la papelera; el ajeno, el de otro nombre y el que ya estaba en la papelera no se tocan',
    d.papelera.sort(), ['al3d-respaldo-2026-08-10T112300Z.json', 'al3d-respaldo-2026-08-11T112300Z.json']);
  cierto('la línea del registro: nombre, dónde, KB, filas y cuántos a la papelera', /guardado al3d-respaldo-2026-10-17T090500Z\.json en «AL3D Respaldos» \(unidad compartida\) · \d+ KB · 5 filas · se quedan 8 respaldos; a la papelera: 2\./.test(linea));
  eq('y NADA del contenido al registro (nombres, teléfonos, importes), ni el secreto, ni el token', [/PersonaRespaldo|Ñandú|33 41|abono|1500|Letras/.test(g.reg.logs.join('')),
    g.reg.logs.join('').includes(SECRETO), /token-FALSO/.test(g.reg.logs.join(''))], [false, false, false]);
  cierto('la hoja ni se leyó', g.libro.leidas.length === 0);

  // otra semana: con lo de la anterior ya rotado, sigue dejando 8
  const g2 = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: await respuestaDeLaFuncion(x => { x.cabeceras['X-Respaldo-Nombre'] = 'al3d-respaldo-2026-10-24T110000Z.json'; }), rutas: d.rutas, drive: d.DriveApp });
  g2.ctx.respaldarSemanal();
  eq('a la semana siguiente: 8 de los suyos vivos, el más viejo a la papelera', [d.archivos.filter(a => a.desc === MARCA && !a.trashed && R.PATRON_NOMBRE.test(a.name)).length, d.papelera.length], [8, 3]);

  // lo que llega mal no se guarda
  for (const [que, cambiar, patron] of [
    ['bytes de menos (se cortó)', x => { x.bytes = x.bytes.slice(0, -10); }, /no llegó entero/],
    ['otra huella', x => { x.cabeceras['X-Respaldo-Sha256'] = '0'.repeat(64); }, /huella sha256 no coincide/],
    ['algo que no es un respaldo', x => { const t = Buffer.from('{"formato":"otra-cosa"}'); x.bytes = aSigno(t); x.cabeceras['X-Respaldo-Bytes'] = String(t.length);
      x.cabeceras['X-Respaldo-Sha256'] = createHash('sha256').update(t).digest('hex'); }, /no es un respaldo/],
  ]) {
    const dm = driveFalso();
    const gm = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: await respuestaDeLaFuncion(cambiar), rutas: dm.rutas, drive: dm.DriveApp });
    const l = gm.ctx.respaldarSemanal();
    eq('con ' + que + ': no guarda nada, ni busca la carpeta, y lo dice', [dm.creados.length, dm.busquedas.length, patron.test(l)], [0, 0, true]);
  }
  for (const [status, codigo, patron] of [[401, 'SIN_SESION', /secreto no coincide/], [400, 'DATO_INVALIDO', /versión de importar-diario que sabe dar el respaldo/],
    [413, 'RESPALDO_GRANDE', /45 MB/], [502, 'BASE_NO_CONTESTA', /502 BASE_NO_CONTESTA/]]) {
    const dm = driveFalso();
    const gm = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: { status, texto: JSON.stringify({ ok: false, codigo, mensaje: 'PersonaRespaldo' }) }, rutas: dm.rutas, drive: dm.DriveApp });
    const l = gm.ctx.respaldarSemanal();
    eq('la función contesta ' + status + ': nada se guarda, la línea da el código y la pista, sin copiar el cuerpo', [dm.creados.length, patron.test(l), /PersonaRespaldo/.test(gm.reg.logs.join(''))], [0, true, false]);
  }

  // la carpeta: sin unidad compartida, una carpeta con ese nombre; sin nada, se crea en Mi unidad; si Drive no deja buscar, no se crea nada
  const d1 = driveFalso({ unidades: [], carpetas: [{ id: 'carpetaMiUnidad0001', name: 'AL3D Respaldos' }] });
  const g3 = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: await respuestaDeLaFuncion(), rutas: d1.rutas, drive: d1.DriveApp });
  const l3 = g3.ctx.respaldarSemanal();
  eq('sin unidad compartida: la carpeta con ese nombre (buscada en todas las unidades, sin las de la papelera)', [d1.abiertas, d1.creados.length, d1.carpetasCreadas, /carpeta de Mi unidad/.test(l3),
    /mimeType = 'application\/vnd\.google-apps\.folder' and trashed = false/.test(d1.busquedas[1].q), /corpora=allDrives/.test(d1.busquedas[1].u)],
    [['carpetaMiUnidad0001'], 1, [], true, true, true]);
  const d2 = driveFalso({ unidades: [], carpetas: [] });
  const g4 = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: await respuestaDeLaFuncion(), rutas: d2.rutas, drive: d2.DriveApp });
  const l4 = g4.ctx.respaldarSemanal();
  eq('sin nada que se llame así: se crea «AL3D Respaldos» en Mi unidad, y la línea lo dice', [d2.carpetasCreadas, d2.creados.length, /se creó/.test(l4)], [['AL3D Respaldos'], 1, true]);
  const d3 = driveFalso({ fallaBusqueda: 403 });
  const g5 = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: await respuestaDeLaFuncion(), rutas: d3.rutas, drive: d3.DriveApp });
  const l5 = g5.ctx.respaldarSemanal();
  eq('si Drive no deja buscar (403): no crea ninguna carpeta (una búsqueda que falla no es «no existe») ni guarda nada', [d3.carpetasCreadas, d3.creados.length, /permiso de Drive/.test(l5)], [[], 0, true]);

  // instalar y quitar
  const d4 = driveFalso();
  const g6 = cargarGs([PUENTE_GS, GS], { props: PROPS, respuesta: await respuestaDeLaFuncion(), rutas: d4.rutas, drive: d4.DriveApp });
  g6.ctx.instalarCopiaDiaria();
  const li = g6.ctx.instalarRespaldoSemanal(); g6.ctx.instalarRespaldoSemanal();
  eq('instalar (dos veces): UN disparador de respaldarSemanal, los domingos de 5 a 6 en hora de México; el de la copia y los de la hoja siguen',
    g6.triggers.map(t => [t.fn, (t.cadena || []).join(',')]), [['enviarResumen', ''], ['alEditar', ''], ...[0, 3, 6, 9, 12, 15, 18, 21].map(h => ['copiarHojaASupabase', 'timeBased,atHour:' + h + ',everyDays:1,inTimezone:America/Mexico_City']),
      ['respaldarSemanal', 'timeBased,onWeekDay:SUNDAY,atHour:5,inTimezone:America/Mexico_City']]);
  eq('pide los permisos de Drive y de conectarse afuera (por si quedaron desmarcados) y hace el primer respaldo en ese momento',
    [g6.reg.permisos[0], d4.creados.length >= 1, /programado: los domingos entre las 5 y las 6/.test(li) && /guardado al3d-respaldo-/.test(li)],
    [['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/script.external_request'], true, true]);
  const lq = g6.ctx.quitarRespaldoSemanal();
  eq('quitar: solo el suyo', [g6.triggers.map(t => t.fn), /1 disparador quitado/.test(lq)], [['enviarResumen', 'alEditar', ...Array(8).fill('copiarHojaASupabase')], true]);
  const g7 = cargarGs([PUENTE_GS, GS], { props: {}, rutas: d4.rutas, drive: d4.DriveApp });
  const l7 = g7.ctx.instalarRespaldoSemanal();
  eq('sin IMPORTAR_URL / IMPORTAR_SECRETO: ni programa ni pide nada', [g7.triggers.map(t => t.fn), g7.reg.fetch.length, /no se programó/.test(l7)], [['enviarResumen', 'alEditar'], 0, true]);
  const g8 = cargarGs([PUENTE_GS, GS], { props: PROPS, falloFetch: new Error('Timeout') });
  eq('la función no contesta: lo dice y no truena', /no contestó \(Timeout\)/.test(g8.ctx.respaldarSemanal()), true);
}

console.log('\n' + (mal ? mal + ' FALLA(S) de ' + (bien + mal) + '.' : 'Todo pasa. ' + bien + ' comprobaciones.') +
  ` CPU de la función con 220 ventas: ${cpuFrio.toFixed(0)} ms la primera vez, ${cpuTibio.toFixed(0)} ms después.`);
process.exit(mal ? 1 : 0);
