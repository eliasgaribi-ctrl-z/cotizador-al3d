/* EL ALMACÉN POR EL PUENTE (puente-sheets-9). Sin Google, sin cuenta, en node.

   Hasta la 8 el libro del almacén, el catálogo de material y las listas de compra se quedaban
   apartados en la bandeja de cada teléfono. Ahora tienen pestaña en la hoja y viajan como la
   venta, y lo que de verdad hay que probar es lo que no se ve mirando:

     · que un movimiento NO se descuente dos veces —ni por un reintento, ni porque dos teléfonos
       crucen el corte del mismo proyecto—;
     · que cada rol escriba solo lo suyo (pagos no mueve el almacén; fabricación no toca costos);
     · que el catálogo y las listas se escriban campo por campo, sin que un cambio atrasado pise
       uno nuevo, y que «consumido» no vuelva atrás;
     · que el teléfono mande en lotes, aparte lo del almacén contra una hoja vieja y lo
       reincorpore solo, y baje solo lo que le falta.

   Tres partes: el Apps Script corriendo contra una hoja de mentiras; el relevo y la bandeja de
   la plataforma contra ESE MISMO Apps Script (fetch → doPost), con una IndexedDB de mentiras; y
   la salida derivada con su id que sale del requerimiento.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'puente', 'hoja-apps-script.gs'), 'utf8');

/* ============================================================================
   LA HOJA DE MENTIRAS — lo mínimo de SpreadsheetApp que usa la sección del almacén: pestañas
   que crecen en filas y columnas, cabeceras, el candado y las propiedades del script.
   ============================================================================ */
function hoja({ candadoLibre = true, props = {} } = {}) {
  const hojas = {};
  function nuevaHoja(nombre, filas = 50, cols = 26) {
    const g = [];
    const renglon = () => new Array(cols + 1).fill('');
    for (let r = 0; r <= filas; r++) g.push(renglon());
    const h = {
      _g: g,
      getName: () => nombre,
      getMaxColumns: () => cols, getMaxRows: () => filas,
      getLastRow() { let u = 0; for (let r = 1; r <= filas; r++) if (g[r].some((v, i) => i > 0 && v !== '')) u = r; return u; },
      getLastColumn() { let u = 0; for (let r = 1; r <= filas; r++) for (let i = 1; i <= cols; i++) if (g[r][i] !== '' && i > u) u = i; return u; },
      insertColumnsAfter(_d, k) { for (const r of g) r.push(...new Array(k).fill('')); cols += k; },
      insertRowsAfter(_d, k) { for (let i = 0; i < k; i++) g.push(new Array(cols + 1).fill('')); filas += k; },
      setFrozenRows() {}, hideSheet() {}, setColumnWidth() {},
      protect: () => { const p = { setDescription: () => p, setWarningOnly: () => p }; return p; },
      getRange(r, c, n = 1, m = 1) {
        if (c + m - 1 > cols || r + n - 1 > filas) throw new Error('fuera de la hoja: ' + [nombre, r, c, n, m]);
        const R = {
          getValues: () => { const o = []; for (let i = 0; i < n; i++) o.push(g[r + i].slice(c, c + m)); return o; },
          setValues: v => { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) g[r + i][c + j] = v[i][j]; return R; },
          setValue: v => { g[r][c] = v; return R; },
          getValue: () => g[r][c],
        };
        for (const k of ['setNote', 'setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor']) R[k] = () => R;
        return R;
      },
    };
    hojas[nombre] = h;
    return h;
  }
  nuevaHoja('Ventas', 330, 30);
  const ss = { getSheetByName: n => hojas[n] || null, insertSheet: n => nuevaHoja(n), toast() {},
               getSpreadsheetTimeZone: () => 'America/Mexico_City' };
  const cache = new Map();
  const estado = { libre: candadoLibre };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActive: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => estado.libre,
      waitLock: () => { if (!estado.libre) throw new Error('ocupado'); },
      releaseLock() {} }) },
    ContentService: { createTextOutput: s => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
    Utilities: {
      computeDigest: (_a, s) => Array.from(Buffer.from(String(s))).slice(0, 32),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'sha' },
      formatDate: d => d.toISOString().slice(0, 10),
    },
    console,
  });
  vm.runInContext(src, ctx);
  const run = code => vm.runInContext(code, ctx);
  const j = x => JSON.stringify(x);
  /* El contexto del .gs es otro realm: lo que devuelve se pasa por JSON para compararlo. */
  const empujar = (ops, rol, quien = '') => JSON.parse(j(run('rutaEmpujarAlmacen_(' + j({ ops }) + ',' + j(rol) + ',' + j(quien) + ')')));
  const jalar = (desde, rol) => JSON.parse(j(run('rutaJalarAlmacen_(' + j({ desde }) + ',' + j(rol) + ')')));
  /* Las filas de una pestaña como objetos {cabecera: valor}, para leerlas como una persona. */
  const filas = nombre => {
    const h = hojas[nombre]; if (!h) return [];
    const cab = h._g[1];
    return h._g.slice(2).filter(r => r.some((v, i) => i > 0 && v !== ''))
      .map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]).filter(([c]) => c)));
  };
  return { ss, hojas, run, empujar, jalar, filas, props, estado, doPost: cuerpo => JSON.parse(run('doPost(' + j({ postData: { contents: j(cuerpo) } }) + ')')) };
}

const T0 = 1790000000000;
const mov = (id, o = {}) => ({ id, empresa_id: 'al3d', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 2,
  unidad_compra: 'lamina', proyecto_id: null, requerimiento_id: null, origen: 'compra', costo_total: 1800,
  nota: 'Recibido', ts: T0, usuario: 'Omar', rol: 'fabricacion', dispositivo: 'F7K2', sello: 'Omar · fabricación · F7K2', sync: 0, ...o });
const opMov = (id, o, opId) => ({ id: opId || 'op-' + id, almacen: 'movimientos', tipo: 'apendice', registro_id: id, datos: mov(id, o) });
const mat = (o = {}) => ({ id: 'acr-3mm', empresa_id: 'al3d', nombre: 'Acrílico blanco 3 mm', familia: 'acrilico',
  unidad_consumo: 'm2', unidad_compra: 'lamina', medida: '1.22 × 2.44 m', factor: 2.9768, factor_origen: 'Hoja 4×8',
  largo_cm: 244, ancho_cm: 122, espesor: '3 mm', merma_pct: 0.25, fraccionable: true, min_compra: 1, min_stock: 0,
  costo_compra: 500, proveedor: 'Plásticos GDL', tel_proveedor: '3312345678', activo: true, sync: 0,
  creado_en: T0, actualizado_en: T0, ...o });
const req = (o = {}) => ({ id: 'proy-1:acr-3mm', empresa_id: 'al3d', proyecto_id: 'proy-1', material_id: 'acr-3mm',
  cantidad_consumo: 0.762, unidad_consumo: 'm2', cantidad_compra: 0.256, unidad_compra: 'lamina', partidas: [3, 4],
  formula: '0.75×40²×8 = 0.5714 m²', confianza: 'estimada', requiere: '', constantes_version: 'c-2026-08.4kz1',
  cantidad_ajustada: null, motivo_ajuste: '', ajustado_por: '', ajustado_en: 0, estado: 'calculado',
  creado_en: T0, actualizado_en: T0, sync: 0, ...o });

console.log('\nEL LIBRO DEL ALMACÉN — un renglón que ya está no se vuelve a escribir');
{
  const H = hoja();
  eq('la pestaña no existe antes de la primera subida', H.ss.getSheetByName('Almacén'), null);
  const r1 = H.empujar([opMov('mov-1')], 'fabricacion', 'omar@al3d.mx');
  eq('la primera subida la crea y escribe el renglón', [r1.ok, r1.resultados[0].ok, r1.resultados[0].creada], [true, true, true]);
  const f = H.filas('Almacén');
  eq('un renglón, con sus columnas por nombre', [f.length, f[0]['Material'], f[0]['Tipo'], f[0]['Cantidad'], f[0]['Id']],
     [1, 'acr-3mm', 'entrada', 2, 'mov-1']);
  eq('con quién lo subió y su número de secuencia', [f[0]['Subió'], f[0]['Secuencia']], ['omar@al3d.mx', 1]);
  cierto('y la fecha legible del movimiento', Object.prototype.toString.call(f[0]['Cuándo']) === '[object Date]');
  eq('«sync», la marca local de cada teléfono, no se guarda en ningún lado', JSON.stringify(f[0]).includes('"sync"'), false);

  /* El reintento: la respuesta se perdió y el teléfono lo vuelve a mandar. */
  const r2 = H.empujar([opMov('mov-1', {}, 'op-reintento')], 'fabricacion');
  eq('el reintento contesta «ya estaba»', [r2.resultados[0].ok, r2.resultados[0].ya_estaba], [true, true]);
  eq('y no agrega nada: el material no se suma dos veces', H.filas('Almacén').length, 1);

  /* Dos teléfonos que cruzan el corte del mismo proyecto emiten el MISMO id (mov-salida:<req>). */
  const sal = { tipo: 'salida', cantidad: -0.256, origen: 'manual', proyecto_id: 'proy-1', requerimiento_id: 'proy-1:acr-3mm', costo_total: null };
  const r3 = H.empujar([opMov('mov-salida:proy-1:acr-3mm', sal, 'op-A'),
                        opMov('mov-salida:proy-1:acr-3mm', { ...sal, dispositivo: 'D3XQ' }, 'op-B')], 'direccion');
  eq('la salida del primero entra, la del segundo es «ya estaba»', r3.resultados.map(x => [x.ok, !!x.ya_estaba]), [[true, false], [true, true]]);
  eq('y en el libro queda UNA salida', H.filas('Almacén').filter(x => x['Tipo'] === 'salida').length, 1);
  eq('la secuencia no se gasta en lo que ya estaba', H.filas('Almacén').map(x => x['Secuencia']), [1, 2]);
}

console.log('\nLO QUE NO PUEDE ENTRAR AL LIBRO, venga de quien venga');
{
  const H = hoja();
  const casos = [
    ['una salida con cantidad positiva (el almacén crecería al consumir)', { tipo: 'salida', cantidad: 3 }],
    ['una entrada negativa', { tipo: 'entrada', cantidad: -1 }],
    ['un conteo negativo', { tipo: 'conteo', cantidad: -1, origen: 'conteo' }],
    ['un tipo inventado', { tipo: 'regalo' }],
    ['una unidad inventada', { unidad_compra: 'medio rollo' }],
    ['un movimiento sin sello de tiempo', { ts: 0 }],
    ['una cantidad que no es número', { cantidad: 'mucho' }],
  ];
  for (const [que, o] of casos) {
    const r = H.empujar([opMov('m-' + que.length, o)], 'direccion').resultados[0];
    eq(que + ': DATO_INVALIDO', r.codigo, 'DATO_INVALIDO');
  }
  eq('y nada de eso quedó escrito', H.filas('Almacén').length, 0);
  const conteo0 = H.empujar([opMov('m-c0', { tipo: 'conteo', cantidad: 0, origen: 'conteo' })], 'fabricacion').resultados[0];
  eq('un conteo de cero sí entra: «no queda nada» es un dato', conteo0.ok, true);

  /* Una nota que empieza con «=» es una fórmula, y saldría a internet sola. */
  H.empujar([opMov('m-f', { nota: '=IMPORTXML("http://malo/","//a")' })], 'fabricacion');
  const celda = H.filas('Almacén').find(x => x['Id'] === 'm-f')['Nota'];
  eq('una nota con «=» se guarda como texto, con su apóstrofo', celda.charAt(0), "'");
  const bajado = H.jalar(0, 'direccion').registros.find(x => x.datos.id === 'm-f').datos.nota;
  eq('y al teléfono le llega como la escribió', bajado, '=IMPORTXML("http://malo/","//a")');
}

console.log('\nLOS ROLES — pagos no mueve el almacén; fabricación no toca costos');
{
  const H = hoja();
  const manual = H.empujar([opMov('p-1', { origen: 'manual', tipo: 'entrada' })], 'pagos').resultados[0];
  eq('pagos no registra una entrada', manual.codigo, 'ROL_SIN_PERMISO');
  cierto('  y se le dice quién la mueve', /fabricación y dirección/.test(manual.mensaje));
  const derivada = H.empujar([opMov('p-2', { origen: 'derivado', tipo: 'salida', cantidad: -0.5 })], 'pagos').resultados[0];
  eq('pero la salida que deriva la obra sola sí entra (si no, ese día no se descontaría)', derivada.ok, true);
  const derivadaEntrada = H.empujar([opMov('p-3', { origen: 'derivado', tipo: 'entrada' })], 'pagos').resultados[0];
  eq('y «derivado» no le abre a pagos una entrada', derivadaEntrada.codigo, 'ROL_SIN_PERMISO');
  eq('pagos no edita el catálogo', H.empujar([{ id: 'o1', almacen: 'materiales', datos: mat() }], 'pagos').resultados[0].codigo, 'ROL_SIN_PERMISO');

  /* Fabricación guarda un material con el costo que tiene su teléfono: ninguno, porque no lo recibe. */
  H.empujar([{ id: 'o2', almacen: 'materiales', tipo: 'crear', datos: mat() }], 'direccion');
  const fab = H.empujar([{ id: 'o3', almacen: 'materiales', datos: mat({ min_stock: 2, costo_compra: null, actualizado_en: T0 + 10 }),
                          campos: ['min_stock', 'costo_compra'] }], 'fabricacion').resultados[0];
  const fila = H.filas('Catálogo de material')[0];
  eq('fabricación corrige el mínimo de almacén', [fab.ok, fila['Mínimo de almacén']], [true, 2]);
  eq('y el costo que dirección capturó sigue ahí', fila['Costo de compra'], 500);
  eq('fabricación no recibe el costo del catálogo', 'costo_compra' in H.jalar(0, 'fabricacion').registros.find(x => x.almacen === 'materiales').datos, false);
  eq('ni el del libro', 'costo_total' in (H.jalar(0, 'fabricacion').registros.find(x => x.almacen === 'movimientos') || { datos: {} }).datos, false);
  eq('dirección sí', H.jalar(0, 'direccion').registros.find(x => x.almacen === 'materiales').datos.costo_compra, 500);
  eq('y pagos también: ve el dinero', H.jalar(0, 'pagos').registros.find(x => x.almacen === 'materiales').datos.costo_compra, 500);
}

console.log('\nEL CATÁLOGO, CAMPO POR CAMPO — un cambio atrasado no pisa uno nuevo');
{
  const H = hoja();
  H.empujar([{ id: 'a', almacen: 'materiales', datos: mat() }], 'direccion');
  /* Dirección cambia el proveedor; fabricación, el mínimo. Cada uno sube solo lo suyo. */
  H.empujar([{ id: 'b', almacen: 'materiales', datos: mat({ proveedor: 'Acrílicos del Bajío', min_stock: 0, actualizado_en: T0 + 100 }), campos: ['proveedor'] }], 'direccion');
  H.empujar([{ id: 'c', almacen: 'materiales', datos: mat({ proveedor: 'Plásticos GDL', min_stock: 3, actualizado_en: T0 + 200 }), campos: ['min_stock'] }], 'fabricacion');
  let f = H.filas('Catálogo de material')[0];
  eq('quedan los dos cambios', [f['Proveedor'], f['Mínimo de almacén']], ['Acrílicos del Bajío', 3]);
  /* El teléfono que estuvo sin señal sube un cambio del proveedor hecho ANTES que el de dirección. */
  const tarde = H.empujar([{ id: 'd', almacen: 'materiales', datos: mat({ proveedor: 'El de antes', actualizado_en: T0 + 50 }), campos: ['proveedor'] }], 'fabricacion').resultados[0];
  f = H.filas('Catálogo de material')[0];
  eq('el cambio atrasado no pisa el nuevo', f['Proveedor'], 'Acrílicos del Bajío');
  eq('  y no es un rechazo: se contesta ok, con lo que no entró', [tarde.ok, tarde.viejos], [true, ['proveedor']]);
  eq('  ni gasta secuencia: no hay nada nuevo que bajar', f['Secuencia'], 3);
  /* Una operación de una versión anterior no dice qué cambió: cuenta como todos, con la misma regla. */
  H.empujar([{ id: 'e', almacen: 'materiales', datos: mat({ nombre: 'Acrílico blanco 3mm', min_stock: 9, proveedor: 'Viejo', actualizado_en: T0 + 150 }) }], 'direccion');
  f = H.filas('Catálogo de material')[0];
  eq('la de antes, sin campos: de cada campo entra si es más nuevo (nombre y proveedor) y no si no (el mínimo)',
     [f['Nombre'], f['Mínimo de almacén'], f['Proveedor']], ['Acrílico blanco 3mm', 3, 'Viejo']);
  /* Borrar el costo también es un cambio, y tiene que llegar a los otros teléfonos. */
  H.empujar([{ id: 'g', almacen: 'materiales', datos: mat({ costo_compra: null, actualizado_en: T0 + 300 }), campos: ['costo_compra'] }], 'direccion');
  const m = H.jalar(0, 'direccion').registros.find(x => x.almacen === 'materiales').datos;
  eq('un costo borrado baja como null, no como «no vino»', [Object.prototype.hasOwnProperty.call(m, 'costo_compra'), m.costo_compra], [true, null]);
  eq('lo que nunca se escribió no se inventa', 'algo_que_no_existe' in m, false);
  /* La clave no se cambia en un cambio. */
  eq('un material con unidad inventada no entra', H.empujar([{ id: 'h', almacen: 'materiales', datos: mat({ id: 'x', unidad_compra: 'rollito' }) }], 'direccion').resultados[0].codigo, 'DATO_INVALIDO');
  /* Lo que llega sin columna propia viaja igual, en «Otros (JSON)». */
  H.empujar([{ id: 'i', almacen: 'materiales', datos: mat({ id: 'led-6500', color: 'frío', actualizado_en: T0 + 400 }) }], 'direccion');
  eq('un campo nuevo de la plataforma no se pierde por no tener columna', H.jalar(0, 'direccion').registros.find(x => x.datos.id === 'led-6500').datos.color, 'frío');
}

console.log('\nLAS LISTAS DE COMPRA — «consumido» no vuelve atrás');
{
  const H = hoja();
  H.empujar([{ id: 'a', almacen: 'requerimientos', datos: req() }], 'direccion');
  H.empujar([{ id: 'b', almacen: 'requerimientos', datos: req({ estado: 'consumido', actualizado_en: T0 + 100 }), campos: ['estado'] }], 'fabricacion');
  /* Un teléfono atrasado, que todavía la tiene calculada, recalcula y manda el estado. */
  H.empujar([{ id: 'c', almacen: 'requerimientos', datos: req({ estado: 'calculado', cantidad_compra: 0.3, actualizado_en: T0 + 500 }), campos: ['estado', 'cantidad_compra'] }], 'direccion');
  const f = H.filas('Listas de compra')[0];
  eq('se queda consumido: si volviera a calculado, el corte restaría otra vez', f['Estado'], 'consumido');
  eq('y lo demás del cambio sí entra', f['Cantidad'], 0.3);
  eq('las partidas viajan como lista', H.jalar(0, 'direccion').registros[0].datos.partidas, [3, 4]);
  /* La corrección de fabricación no la pisa un recálculo que no la tocó. */
  H.empujar([{ id: 'd', almacen: 'requerimientos', datos: req({ cantidad_ajustada: 0.5, actualizado_en: T0 + 600 }), campos: ['cantidad_ajustada'] }], 'fabricacion');
  H.empujar([{ id: 'e', almacen: 'requerimientos', datos: req({ cantidad_ajustada: null, formula: 'otra', actualizado_en: T0 + 700 }), campos: ['formula'] }], 'direccion');
  eq('la corrección de fabricación sobrevive al recálculo', H.filas('Listas de compra')[0]['Corrección'], 0.5);
  /* Pagos solo marca lo que ya salió. */
  const p1 = H.empujar([{ id: 'f', almacen: 'requerimientos', datos: req({ id: 'proy-2:acr-3mm', proyecto_id: 'proy-2', estado: 'consumido' }), campos: ['estado'] }], 'pagos').resultados[0];
  eq('pagos marca consumido lo que derivó la obra', p1.ok, true);
  const p2 = H.empujar([{ id: 'g', almacen: 'requerimientos', datos: req({ cantidad_ajustada: 9 }), campos: ['cantidad_ajustada'] }], 'pagos').resultados[0];
  eq('pero no corrige cantidades', p2.codigo, 'ROL_SIN_PERMISO');
  /* El proyecto y el material son el id de la línea: no se cambian. */
  H.empujar([{ id: 'h', almacen: 'requerimientos', datos: req({ proyecto_id: 'proy-hoja-V-042', actualizado_en: T0 + 900 }), campos: ['proyecto_id'] }], 'fabricacion');
  eq('el proyecto de una línea no se cambia en un cambio', H.filas('Listas de compra')[0]['Proyecto (id)'], 'proy-1');
}

console.log('\nBAJAR — solo lo que falta, en el orden en que llegó');
{
  const H = hoja();
  H.empujar([{ id: '1', almacen: 'materiales', datos: mat() }, opMov('m1'), { id: '2', almacen: 'requerimientos', datos: req() }], 'direccion');
  const todo = H.jalar(0, 'direccion');
  eq('desde cero, todo, en el orden de la secuencia', todo.registros.map(x => x.almacen), ['materiales', 'movimientos', 'requerimientos']);
  eq('con hasta dónde llegó', [todo.hasta, todo.hay_mas], [3, false]);
  eq('desde ahí, nada', H.jalar(todo.hasta, 'direccion').registros.length, 0);
  H.empujar([opMov('m2')], 'fabricacion');
  const nuevo = H.jalar(todo.hasta, 'direccion');
  eq('y después, solo lo nuevo', [nuevo.registros.map(x => x.datos.id), nuevo.hasta], [['m2'], 4]);
  /* Una columna movida a mano no hace que se escriba en la de al lado. */
  const h = H.hojas['Almacén'];
  const iN = h._g[1].indexOf('Nota'), iQ = h._g[1].indexOf('Quién');
  for (const r of h._g) { const t = r[iN]; r[iN] = r[iQ]; r[iQ] = t; }
  H.empujar([opMov('m3', { nota: 'tras mover columnas', usuario: 'Beto' })], 'fabricacion');
  const m3 = H.filas('Almacén').find(x => x['Id'] === 'm3');
  eq('con dos columnas cambiadas de lugar, cada dato cae en la suya (por su cabecera)', [m3['Nota'], m3['Quién']], ['tras mover columnas', 'Beto']);
  /* La secuencia vive en las propiedades; si se pierden, sigue de la más alta de las pestañas. */
  delete H.props.ALMACEN_SECUENCIA;
  H.empujar([opMov('m4')], 'fabricacion');
  eq('sin la propiedad, la secuencia sigue de la más alta y no repite números', H.filas('Almacén').find(x => x['Id'] === 'm4')['Secuencia'], 6);
  /* El candado ocupado. */
  H.estado.libre = false;
  eq('con la hoja ocupada, subir dice que se reintente', [H.empujar([opMov('m5')], 'direccion').codigo], ['SIN_RED']);
  eq('y bajar también', H.jalar(0, 'direccion').codigo, 'SIN_RED');
  H.estado.libre = true;
  eq('y no se escribió nada a medias', H.filas('Almacén').some(x => x['Id'] === 'm5'), false);
}

console.log('\nLA PUERTA — los dos caminos pasan por doPost, con rol y cupo');
{
  const tok = 'f'.repeat(40);
  const H = hoja({ props: { PUENTE_TOKENS: JSON.stringify({ [tok]: 'fabricacion' }) } });
  const r = H.doPost({ ruta: 'empujar_almacen', token: tok, ops: [opMov('d1')] });
  eq('/empujar_almacen entra por la puerta con el rol del token', [r.ok, r.resultados[0].ok], [true, true]);
  eq('/jalar_almacen también', H.doPost({ ruta: 'jalar_almacen', token: tok, desde: 0 }).registros.length, 1);
  eq('sin token, ninguno de los dos', H.doPost({ ruta: 'jalar_almacen', desde: 0 }).codigo, 'ROL_SIN_PERMISO');
  eq('la versión del .gs trae el almacén, la carpeta, el teléfono y la entrega', H.run('PUENTE_VERSION'), 'puente-sheets-12');
  eq('las rutas son privadas (guion bajo): google.script.run no las alcanza', ['rutaEmpujarAlmacen', 'rutaJalarAlmacen'].map(f => H.run('typeof ' + f)), ['undefined', 'undefined']);
  /* prepararHojaParaElPuente las crea antes de la primera subida. */
  H.run('prepararPestanasDelAlmacen()');
  eq('prepararPestanasDelAlmacen crea las tres pestañas', ['Almacén', 'Catálogo de material', 'Listas de compra'].map(n => !!H.ss.getSheetByName(n)), [true, true, true]);
  H.run('prepararPestanasDelAlmacen()');
  eq('y es idempotente: no duplica cabeceras', H.hojas['Catálogo de material']._g[1].filter(x => x === 'Clave').length, 1);
}

/* ============================================================================
   EL VOCABULARIO DUPLICADO — el .gs no importa nada; se compara con la plataforma.
   ============================================================================ */
console.log('\nLAS COPIAS DEL VOCABULARIO DICEN LO MISMO');
{
  const H = hoja();
  const Stock = await import('../js/datos/stock.js');
  eq('los tipos de movimiento', H.run('ALM_TIPOS').slice(), Stock.TIPOS);
  eq('los orígenes', H.run('ALM_ORIGENES').slice(), Stock.ORIGENES);
  const matSrc = readFileSync(join(aqui, '..', 'js', 'datos', 'material.js'), 'utf8');
  const lista = nombre => JSON.parse(new RegExp('const ' + nombre + ' = (\\[[^\\]]*\\])').exec(matSrc)[1].replace(/'/g, '"'));
  eq('las unidades de compra', H.run('ALM_UNIDADES_COMPRA').slice(), lista('UNIDADES_COMPRA'));
  eq('las unidades de consumo', H.run('ALM_UNIDADES_CONSUMO').slice(), lista('UNIDADES_CONSUMO'));
  const { VERSION_ESPERADA, VERSION_DEL_ALMACEN, numeroDeVersion } = await import('../js/datos/puente.js');
  eq('la plataforma espera la versión que el .gs declara', H.run('PUENTE_VERSION'), VERSION_ESPERADA);
  cierto('y esa versión ya trae el almacén', numeroDeVersion(VERSION_ESPERADA) >= VERSION_DEL_ALMACEN);
  eq('el lote de la bandeja cabe en lo que la hoja acepta', /const MAX_LOTE = (\d+);/.exec(readFileSync(join(aqui, '..', 'js', 'datos', 'sync.js'), 'utf8'))[1],
     String(H.run('ALM_OPS_MAX')));
}

/* ============================================================================
   EL TELÉFONO CONTRA ESA MISMA HOJA — relevo, bandeja y base, de punta a punta.
   ============================================================================ */
function idbConIndices() {
  /* La de pruebas/puente.mjs: índices y cursores, con el orden de llaves de IndexedDB. */
  const almacenes = new Map();
  const llave = (v, c) => (Array.isArray(c) ? c.map(k => v[k]) : v[c]);
  const valida = k => (Array.isArray(k) ? k.every(valida) : (typeof k === 'string' || (typeof k === 'number' && !Number.isNaN(k))));
  const cmp = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  class Tx extends EventTarget {
    constructor() { super(); this.error = null; this._pend = 0; this._fin = false; setTimeout(() => this._revisar(), 0); }
    _revisar() {
      if (this._pend || this._fin) return;
      this._fin = true;
      const ev = new Event('complete'); this.dispatchEvent(ev); if (this.oncomplete) this.oncomplete(ev);
    }
    _paso(p, hacer) {
      this._pend++;
      setTimeout(() => { p.result = hacer(); if (p.onsuccess) p.onsuccess({ target: p }); this._pend--; setTimeout(() => this._revisar(), 0); }, 0);
      return p;
    }
    objectStore(n) { return vista(this, almacenes.get(n), null); }
  }
  function vista(tx, a, indice) {
    const campo = indice ? a.indices.get(indice) : a.keyPath;
    const filas = (rango, dir) => {
      let xs = [...a.datos.values()].filter(v => valida(llave(v, campo)));
      if (rango && 'only' in rango) xs = xs.filter(v => cmp(llave(v, campo), rango.only) === 0);
      xs.sort((x, y) => cmp(llave(x, campo), llave(y, campo)) || cmp(llave(x, a.keyPath), llave(y, a.keyPath)));
      return dir === 'prev' ? xs.reverse() : xs;
    };
    return {
      get: k => tx._paso({}, () => (a.datos.has(k) ? structuredClone(a.datos.get(k)) : undefined)),
      put: v => tx._paso({}, () => { a.datos.set(llave(v, a.keyPath), structuredClone(v)); return llave(v, a.keyPath); }),
      delete: k => tx._paso({}, () => { a.datos.delete(k); }),
      clear: () => tx._paso({}, () => { a.datos.clear(); }),
      count: r => tx._paso({}, () => filas(r).length),
      index: i => vista(tx, a, i),
      openCursor(rango, dir) {
        const xs = filas(rango, dir);
        let i = 0;
        const p = {};
        const siguiente = () => tx._paso(p, () => (i < xs.length ? { value: structuredClone(xs[i]), continue: () => { i++; siguiente(); } } : null));
        siguiente();
        return p;
      },
    };
  }
  const db = {
    objectStoreNames: { contains: n => almacenes.has(n) },
    createObjectStore(n, { keyPath }) {
      const a = { keyPath, indices: new Map(), datos: new Map() };
      almacenes.set(n, a);
      return { indexNames: { contains: i => a.indices.has(i) }, createIndex: (i, c) => a.indices.set(i, c) };
    },
    transaction: () => new Tx(),
    close() {},
  };
  return { open() { const p = {}; setTimeout(() => { p.result = db; if (p.onupgradeneeded) p.onupgradeneeded({ oldVersion: 0 }); p.onsuccess(); }, 0); return p; } };
}

console.log('\nEL TELÉFONO — lotes, hoja vieja, reincorporar y bajar');
{
  globalThis.window = globalThis;
  globalThis.indexedDB = idbConIndices();
  globalThis.IDBKeyRange = { only: v => ({ only: v }), bound: (a, b) => ({ bound: [a, b] }) };
  const tok = 'd'.repeat(40);
  const guardado = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'TEST', al3d_pf_nombre: 'Elías',
                     al3d_pf_puente: JSON.stringify({ url: 'https://puente.test/exec', token: tok }) };
  globalThis.localStorage = { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); },
                              removeItem: k => { delete guardado[k]; } };

  /* La hoja: primero una que corre la 8 —sin las rutas del almacén—, después la de verdad. */
  let H = hoja({ props: { PUENTE_TOKENS: JSON.stringify({ [tok]: 'direccion' }) } });
  let vieja = true;
  const pedidas = [];
  globalThis.fetch = async (_url, init) => {
    const c = JSON.parse(init.body);
    pedidas.push(c);
    let cuerpo;
    if (vieja && c.ruta === 'salud') cuerpo = { ok: true, rol: 'direccion', escribibles: [], version: 'puente-sheets-8' };
    else if (vieja && /_almacen$/.test(c.ruta)) cuerpo = { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' };
    else cuerpo = H.doPost(c);
    return { status: 200, json: async () => cuerpo };
  };

  const DB = await import('../js/datos/db.js');
  const S = await import('../js/datos/sync.js');
  const { crear } = await import('../js/datos/puente.js');
  eq('la base de mentira abre', await DB.abrir(), true);
  S.registrar(crear({ url: 'https://puente.test/exec', token: tok }));

  const encolarMov = async id => {
    const m = mov(id);
    await DB.poner('movimientos', m);
    await S.encolar({ tipo: 'apendice', almacen: 'movimientos', registro_id: id, datos: m });
  };
  for (const id of ['t-1', 't-2', 't-3']) await encolarMov(id);

  /* 1 · Contra la 8: se aparta con su razón, sin una petición por renglón. */
  const b1 = await S.bombear();
  const apartadas = await S.sinDestino();
  eq('contra una hoja en la 8, los tres se apartan (no se rechazan, no se pierden)', [b1.valor.sin_destino, apartadas.length, b1.valor.rechazadas], [3, 3, 0]);
  cierto('con la razón: la hoja corre un puente sin la pestaña', apartadas.every(o => /«Almacén»/.test(o.ultimo_error) && /Apps Script/.test(o.ultimo_error)));
  eq('y la banda no los cuenta como «no ha podido mandar»', (await S.pendientes()).length, 0);
  const antes = pedidas.length;
  await encolarMov('t-4');
  await S.bombear();
  eq('sabiendo que la hoja es vieja, el siguiente se aparta sin gastar una petición del almacén',
     pedidas.slice(antes).filter(c => /_almacen$/.test(c.ruta)).length, 0);

  /* 2 · Se actualiza la hoja. Un relevo nuevo (la app se volvió a abrir) los reincorpora solos. */
  vieja = false;
  S.registrar(crear({ url: 'https://puente.test/exec', token: tok }));
  const antes2 = pedidas.length;
  const b2 = await S.bombear();
  const empujes = pedidas.slice(antes2).filter(c => c.ruta === 'empujar_almacen');
  eq('con la hoja en la 9, lo apartado vuelve solo y sube', [b2.valor.subidas, (await S.sinDestino()).length], [4, 0]);
  eq('en UN viaje, en el orden de la bandeja', [empujes.length, empujes[0] && empujes[0].ops.map(o => o.datos.id)], [1, ['t-1', 't-2', 't-3', 't-4']]);
  eq('y la hoja tiene los cuatro renglones', H.filas('Almacén').map(x => x['Id']), ['t-1', 't-2', 't-3', 't-4']);
  eq('sin la marca local «sync»', 'sync' in empujes[0].ops[0].datos, false);

  /* 3 · Un movimiento de un proyecto que ya tiene fila lleva el folio de su venta. */
  await DB.poner('proyectos', { id: 'proy-9', nombre: 'Café Ana', etapa: 'ganado', notion_page_id: 'V-042', folio_global: 'COT-0009@TEST' });
  await DB.poner('movimientos', mov('t-5', { proyecto_id: 'proy-9', tipo: 'salida', cantidad: -1, origen: 'manual' }));
  await S.encolar({ tipo: 'apendice', almacen: 'movimientos', registro_id: 't-5', datos: await DB.obtener('movimientos', 't-5') });
  await S.bombear();
  eq('el renglón de un proyecto con fila dice de qué venta es', H.filas('Almacén').find(x => x['Id'] === 't-5')['Venta'], 'V-042');

  /* 4 · Un reintento después de una respuesta perdida no resta dos veces. */
  await S.encolar({ tipo: 'apendice', almacen: 'movimientos', registro_id: 't-5', datos: await DB.obtener('movimientos', 't-5') });
  const b4 = await S.bombear();
  eq('el reintento sale de la bandeja como subido…', [b4.valor.subidas, (await S.pendientes()).length], [1, 0]);
  eq('…y en la hoja sigue habiendo una sola salida', H.filas('Almacén').filter(x => x['Id'] === 't-5').length, 1);

  /* 5 · Bajar: lo de otro teléfono llega; lo propio no se duplica. */
  H.empujar([opMov('otro-1', { dispositivo: 'F7K2' }), { id: 'x', almacen: 'materiales', datos: mat({ min_stock: 4 }) },
             { id: 'y', almacen: 'requerimientos', datos: req({ id: 'p-ajeno:acr-3mm', proyecto_id: 'p-ajeno', folio_hoja: 'V-042' }) }], 'fabricacion');
  const j1 = await S.jalar();
  eq('la bajada trae el renglón, el material y la línea del otro teléfono', [j1.ok, !!(await DB.obtener('movimientos', 'otro-1')),
     (await DB.obtener('materiales', 'acr-3mm') || {}).min_stock, !!(await DB.obtener('requerimientos', 'p-ajeno:acr-3mm'))], [true, true, 4, true]);
  eq('sin duplicar los que este teléfono ya tenía', (await DB.listar('movimientos')).length, 6);
  const marca = await DB.obtener('pendientes', '_almacen_hoja');
  eq('y anota hasta dónde vio, ya escrito lo que bajó', marca && marca.desde, Number(H.props.ALMACEN_SECUENCIA));
  const antes5 = pedidas.length;
  await S.jalar();
  eq('la siguiente bajada pide desde ahí', pedidas.slice(antes5).find(c => c.ruta === 'jalar_almacen').desde, marca.desde);
  cierto('la marca no se cuenta como cambio pendiente', !(await S.pendientes()).some(o => o.id === '_almacen_hoja'));

  /* 6 · Un cambio esperando en la bandeja no se pisa con lo que baja. */
  const local = { ...(await DB.obtener('materiales', 'acr-3mm')), proveedor: 'El que acabo de escribir' };
  await DB.poner('materiales', local);
  await S.encolar({ tipo: 'actualizar', almacen: 'materiales', registro_id: 'acr-3mm', datos: local, campos: ['proveedor'] });
  H.empujar([{ id: 'z', almacen: 'materiales', datos: mat({ min_stock: 5, actualizado_en: Date.now() + 1000 }), campos: ['min_stock'] }], 'fabricacion');
  await S.jalar();
  eq('lo que la persona acaba de escribir sigue en pantalla mientras sube', (await DB.obtener('materiales', 'acr-3mm')).proveedor, 'El que acabo de escribir');
  await S.bombear();
  await S.jalar();
  const yaJunto = await DB.obtener('materiales', 'acr-3mm');
  eq('y cuando sube, la hoja junta los dos cambios y bajan juntos', [yaJunto.proveedor, yaJunto.min_stock], ['El que acabo de escribir', 5]);

  /* 7 · La lista de compra de ESTE teléfono ve la línea ajena por el folio de la venta. */
  const Stock = await import('../js/datos/stock.js');
  await DB.poner('proyectos', { id: 'proy-hoja-V-042', nombre: 'Café Ana (de la hoja)', etapa: 'ganado', folio_hoja: 'V-042', de_hoja: true });
  await DB.poner('requerimientos', req({ id: 'p-ajeno:acr-3mm', proyecto_id: 'p-ajeno', folio_hoja: 'V-042', cantidad_compra: 0.7 }));
  const lc = await Stock.listaCompra({ hastaDias: 365 });
  const linea = lc.find(x => x.material_id === 'acr-3mm');
  eq('la línea que derivó otro teléfono entra a la lista de compra de esta tarjeta', linea && linea.requerido, 0.7);
  eq('  una sola vez, aunque haya dos tarjetas de la misma venta aquí', linea && linea.proyectos.length, 1);
}

/* ============================================================================
   LA SALIDA DERIVADA — su id sale del requerimiento, y no se emite dos veces.
   ============================================================================ */
console.log('\nLA SALIDA DEL CORTE — dos teléfonos, un renglón');
{
  const DB = await import('../js/datos/db.js');
  const S = await import('../js/datos/sync.js');
  const Proy = await import('../js/datos/proyectos.js');
  S.registrar(null);   // sin puente: lo que se prueba aquí es el libro de este teléfono
  await DB.poner('materiales', mat({ id: 'lam-galv', nombre: 'Lámina galvanizada', unidad_compra: 'lamina', familia: 'galvanizado' }));
  await DB.poner('proyectos', { id: 'proy-c', nombre: 'Letras Luz', folio_local: 'COT-0100', etapa: 'ganado', origen: { items: [] } });
  await DB.poner('requerimientos', req({ id: 'proy-c:lam-galv', proyecto_id: 'proy-c', material_id: 'lam-galv', cantidad_compra: 0.4 }));
  const r1 = await Proy.avanzarEtapa('proy-c', 'cortado');
  const salida = await DB.obtener('movimientos', 'mov-salida:proy-c:lam-galv');
  eq('al cruzar el corte sale el material, con el id que sale del requerimiento', [r1.ok, r1.valor.movimientos, salida && salida.cantidad], [true, 1, -0.4]);
  const op = (await S.pendientes()).find(o => o.almacen === 'requerimientos' && o.registro_id === 'proy-c:lam-galv');
  eq('y el requerimiento sube solo con su estado', op && op.campos, ['estado']);
  /* Este teléfono no se había enterado de que la línea ya estaba consumida (el otro la cortó) pero
     ya tiene el renglón de la salida, que bajó de la hoja. */
  await DB.poner('proyectos', { ...(await DB.obtener('proyectos', 'proy-c')), etapa: 'ganado' });
  await DB.poner('requerimientos', { ...(await DB.obtener('requerimientos', 'proy-c:lam-galv')), estado: 'calculado' });
  const r2 = await Proy.avanzarEtapa('proy-c', 'cortado');
  eq('volver a cruzar el corte no emite otra salida', r2.valor.movimientos, 0);
  eq('en el libro sigue habiendo un renglón de esa línea', (await DB.listar('movimientos')).filter(m => m.requerimiento_id === 'proy-c:lam-galv').length, 1);
  eq('y la línea queda consumida', (await DB.obtener('requerimientos', 'proy-c:lam-galv')).estado, 'consumido');
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
