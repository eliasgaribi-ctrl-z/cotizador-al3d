/* LA HOJA DE MENTIRAS: el Apps Script de verdad (puente/hoja-apps-script.gs) corriendo en node
   sobre una cuadrícula con lo mínimo de SpreadsheetApp que el .gs usa. Es la de
   pruebas/puente-hoja.mjs (`hojaDeMentiras`), aparte y con dos cosas más para la prueba de dos
   dispositivos (pruebas/sincronizacion.mjs):
     · `doPost(cuerpo)`: la puerta entera, como la llama el teléfono —el token decide el rol—;
     · `teclear(folio, columna, valor)`: alguien que escribe a mano en la hoja, con el `alEditar`
       que Sheets dispara en ese caso.
   Y, para la ruta `espejo` (pruebas/supabase-espejo.mjs), dos cosas opt-in que no cambian nada si no
   se piden: `setNote` ahora ANOTA lo que se le pone (y `getNote` lo devuelve), y `comoSheets: true`
   imita lo que Sheets le hace a un texto que empieza con apóstrofo (se queda con el texto sin él),
   salvo en una celda en texto sin formato ('@'), donde el apóstrofo es parte del texto.
   Vive en pruebas/comun/ porque no es una prueba: correr.sh corre todo *.mjs de pruebas/. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', '..', 'puente', 'hoja-apps-script.gs'), 'utf8');

const partesEn = (d, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  .formatToParts(d).map(x => [x.type, x.value]));
/* Las fechas a medianoche en UTC, como las arma el .gs con `new Date(a, m, d)` en el TZ del
   proceso: se formatean con la parte local para que vuelvan iguales. */
function formatDateFalso(d, tz, patron) {
  if (!/H/.test(String(patron))) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const p = partesEn(d, tz);
  return String(patron).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

/**
 * @param {{props?:Object, tokens?:Object, columnas?:number, comoSheets?:boolean}} o
 *        `tokens`: token → rol, como los guarda «Tokens del puente»
 *        `columnas`: con cuántas nace Ventas (30 = una hoja que todavía no corrió «Preparar»)
 *        `comoSheets`: el apóstrofo de adelante no se guarda (ver arriba)
 */
export function hojaDeMentiras({ props = {}, tokens = {}, columnas = 30, comoSheets = false } = {}) {
  const hojas = {};
  props = { PUENTE_Y_AD_ALINEADAS: '2026-09-24', PUENTE_TOKENS: JSON.stringify(tokens), ...props };
  const colDe = s => s.split('').reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0);
  /* Lo que Sheets guarda de lo que se le escribe. Sin `comoSheets`, lo mismo que llegó. */
  const aCelda = (v, formato) => (comoSheets && typeof v === 'string' && formato !== '@' && v.charAt(0) === "'") ? v.slice(1) : v;
  function nuevaHoja(nombre, filas = 330, cols = 30) {
    const g = [], f = [];
    const renglon = () => new Array(cols + 1).fill('');
    for (let r = 0; r <= filas; r++) { g.push(renglon()); f.push(renglon()); }
    const h = {
      _g: g, _f: f, _ocultas: new Set(), _notas: {},
      getName: () => nombre, setName(n) { delete hojas[nombre]; nombre = n; hojas[n] = h; return h; },
      getMaxColumns: () => cols, getMaxRows: () => filas,
      getLastRow() { let u = 0; for (let r = 1; r <= filas; r++) if (g[r].some((v, i) => i > 0 && v !== '')) u = r; return u; },
      getLastColumn() { let u = 0; for (let r = 1; r <= filas; r++) for (let i = 1; i <= cols; i++) if (g[r][i] !== '' && i > u) u = i; return u; },
      getRange(a, b, n, m) {
        if (typeof a === 'string') {
          const x = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a);
          const r1 = +x[2], c1 = colDe(x[1]), r2 = x[4] ? +x[4] : r1, c2 = x[3] ? colDe(x[3]) : c1;
          return rango(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
        }
        return rango(a, b, n || 1, m || 1);
      },
      deleteRows(ini, k) { g.splice(ini, k); f.splice(ini, k); for (let i = 0; i < k; i++) { g.push(renglon()); f.push(renglon()); } },
      copyTo() { const c = nuevaHoja(nombre + ' (copia)', filas, cols); for (let r = 0; r <= filas; r++) { c._g[r] = g[r].slice(); c._f[r] = f[r].slice(); } return c; },
      hideSheet() { return h; }, hideColumns(c) { h._ocultas.add(c); },
      setFrozenRows() {}, setColumnWidth() {}, setActiveRange() {},
      insertColumnsAfter(_d, k) { for (let r = 0; r <= filas; r++) { g[r].push(...new Array(k).fill('')); f[r].push(...new Array(k).fill('')); } cols += k; },
      insertRowsAfter(_d, k) { for (let i = 0; i < k; i++) { g.push(renglon()); f.push(renglon()); } filas += k; },
      protect: () => { const p = { setDescription: () => p, setWarningOnly: () => p }; return p; },
      getProtections: () => [],
    };
    function rango(r, c, n, m) {
      if (c + m - 1 > cols || r + n - 1 > filas) throw new Error('fuera de la hoja: ' + [r, c, n, m]);
      const R = {
        getValues: () => { const o = []; for (let i = 0; i < n; i++) o.push(g[r + i].slice(c, c + m)); return o; },
        setValues: v => { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) g[r + i][c + j] = aCelda(v[i][j], f[r + i][c + j]); return R; },
        getValue: () => g[r][c], setValue: v => { g[r][c] = aCelda(v, f[r][c]); return R; },
        getNumberFormat: () => f[r][c],
        setNumberFormat: x => { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) f[r + i][c + j] = x; return R; },
        protect: () => { const p = { setDescription: () => p, setWarningOnly: () => p }; return p; },
        setDataValidation: () => R,
        /* Lo que `alEditar` pregunta del rango editado. */
        getSheet: () => h, getRow: () => r, getColumn: () => c, getNumRows: () => n, getNumColumns: () => m,
      };
      for (const k of ['setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setFontSize',
                       'setWrap', 'setVerticalAlignment', 'setFontStyle', 'setNote'])
        R[k] = () => R;
      /* Las notas sí se anotan (por «fila,columna»): es lo que deja ver la que pone el espejo. */
      R.setNote = x => { h._notas[r + ',' + c] = String(x); return R; };
      R.getNote = () => h._notas[r + ',' + c] || '';
      return R;
    }
    hojas[nombre] = h;
    return h;
  }
  const ss = {
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => nuevaHoja(n, 400, 8),
    deleteSheet: h => { delete hojas[h.getName()]; },
    getSpreadsheetTimeZone: () => 'America/Mexico_City',
    setActiveSheet() {}, toast() {},
  };
  const cache = new Map();
  const validacion = { requireValueInList: () => validacion, setAllowInvalid: () => validacion, build: () => ({}) };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActive: () => ss, flush() {}, newDataValidation: () => validacion,
                      ProtectionType: { RANGE: 'RANGE' }, getUi: () => ({ showModalDialog() {}, alert() {} }) },
    HtmlService: { createHtmlOutput: html => { const o = { setWidth: () => o, setHeight: () => o }; return o; } },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock() {} }) },
    UrlFetchApp: { fetch: () => { throw new Error('sin red'); } },
    ContentService: { createTextOutput: s => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
    /* `parseDate` (para el espejo): la fecha «aaaa-mm-dd» a medianoche, como la devuelve y la lee formatDateFalso. */
    Utilities: { formatDate: formatDateFalso, getUuid: () => 'u-' + Math.random().toString(36).slice(2),
                 parseDate: (t, _tz, _p) => { const [a, m, d] = String(t).split('-').map(Number); return new Date(a, m - 1, d); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@al3d.mx' }) },
    /* Drive no existe aquí: /carpetas lo dice en la consola y contesta con su error, como debe. */
    console: { ...console, error: (...a) => { if (!/^carpetas:/.test(String(a[0]))) console.error(...a); } },
  });
  vm.runInContext(src, ctx);
  const run = code => vm.runInContext(code, ctx);
  const C = run('COL');
  const v = nuevaHoja('Ventas', 330, columnas);
  v._g[1][C['Proyecto']] = 'Proyecto';
  nuevaHoja('Abonos comisión', 2100, 6);

  const fila = folio => { for (let r = 2; r <= 310; r++) if (v._g[r][1] === folio) return r; return 0; };
  const celda = (folio, nombre) => { const r = fila(folio); return r ? v._g[r][C[nombre]] : undefined; };
  /* La puerta, como la toca el teléfono: el cuerpo es el texto del POST. */
  const doPost = cuerpo => { ctx.__e = { postData: { contents: cuerpo } }; return JSON.parse(run('doPost(__e)')); };
  /* Alguien que teclea en la hoja: la celda cambia y Sheets llama a `alEditar` con el rango. */
  const teclear = (folio, nombre, valor) => {
    const r = fila(folio);
    v._g[r][C[nombre]] = valor;
    ctx.__e = { range: v.getRange(r, C[nombre]) };
    run('alEditar(__e)');
  };
  return { ss, v, C, run, ctx, props, fila, celda, doPost, teclear };
}
