/* LA BASE MANDA, PASO 4 — el cotizador con la base mandando (docs/BASE-MANDA.md, «Paso 4»).
 *
 * Lo que se vigila:
 *   · LO PURO de js/datos/supa-cotizaciones.js: lo que se manda es lo que la base guarda (sin la imagen de referencia ni data
 *     URLs, la regla de `interno.datos_cotizacion`), la firma no cambia porque la base reordene llaves, el folio global sale con
 *     la regla de `subida_unica`, y la mezcla: la más nueva gana, en un empate el teléfono que emitió el folio, sin duplicar, un
 *     folio corto es de una sola cotización, lo borrado allá se quita aquí, los talones de la copia de la hoja no entran;
 *   · SUBIR contra una base de mentiras con la regla de 0008/0021: la primera vez TODO el historial en lotes de 50 (la subida
 *     única automática) y la marca de que terminó; la segunda, nada (idempotente); un cambio de aquí va por cotizacion_guardar
 *     solo si es más nuevo que lo de la base (se lee la fila antes de pisar); lo de otra persona no se reintenta; lo borrado aquí
 *     se borra allá pasada la ventana de «Deshacer»; sin red se para y se reintenta;
 *   · QUIÉN VE QUÉ: Dirección baja todo, Pagos lo suyo, Fabricación ni pregunta (y su historial sube igual);
 *   · EL ENCHUFE con la base mandando: la ventanilla del cotizador por área, el historial que sube cuando el cotizador guarda, las
 *     imágenes sin la sombra; con la hoja, nada de esto;
 *   · EL COTIZADOR (sus guiones de verdad, en un contexto aparte): el historial que baja y se junta, `editado` y el aparato de una
 *     cotización ajena, la lápida; los precios de la base y su espejo en la hoja (que sigue sellando); el V-### de la base en el
 *     recibo de «Registrar venta» y «Copiar datos para la hoja» fuera;
 *   · CON LA HOJA MANDANDO, LO DE SIEMPRE: ni una pregunta a la ventanilla, ni una clave nueva, el botón de copiar en su lugar.
 *
 * No toca Supabase: el cliente es un doble. Lo que la base de verdad contesta a estas mismas llamadas lo prueba
 * supabase/tests/sync-e-importacion/cotizaciones.mjs (PGlite). Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { idbConIndices } from './comun/base-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const plano = x => JSON.parse(JSON.stringify(x));
const espera = (ms = 5) => new Promise(r => setTimeout(r, ms));

/* `function nombre(...){...}` completo, contando llaves y saltándose cadenas y comentarios (la receta de pruebas/cot-historial.mjs). */
function funcion(texto, nombre) {
  const ini = texto.search(new RegExp('(async )?function ' + nombre.replace(/\$/g, '\\$') + '\\('));
  if (ini < 0) throw new Error('no está function ' + nombre);
  let i = texto.indexOf('{', texto.indexOf('(', ini) + 1), prof = 0;
  /* Las llaves de los parámetros por omisión no cuentan: se busca la primera llave después del paréntesis que cierra. */
  let p = 0, j = texto.indexOf('(', ini);
  for (; j < texto.length; j++) { if (texto[j] === '(') p++; if (texto[j] === ')' && --p === 0) break; }
  i = texto.indexOf('{', j);
  for (; i < texto.length; i++) {
    const c = texto[i], s = texto[i + 1];
    if (c === '/' && s === '/') { i = texto.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = texto.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return texto.slice(ini, i + 1);
  }
  throw new Error('function ' + nombre + ' no cierra');
}
const tramo = (texto, desde, hasta) => {
  const a = texto.indexOf(desde), b = texto.indexOf(hasta, a + 1);
  if (a < 0 || b < 0) throw new Error('no está el tramo ' + desde);
  return texto.slice(a, b);
};

/* ── El almacenamiento de un teléfono ───────────────────────────────────────────────────────────────── */
const ls = {};
globalThis.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const ON = JSON.stringify({ encendido: true, desde: 1 });
const modo = (m, area = 'direccion') => {
  if (m === 'hoja-apagado') { delete ls.al3d_pf_supa; delete ls.al3d_pf_supa_modo; return; }
  ls.al3d_pf_supa = ON; ls.al3d_pf_supa_modo = JSON.stringify({ modo: m, area, visto: 1 });
};

const C = await import('../js/datos/supa-cotizaciones.js');
const { almacenEnMemoria } = await import('../js/datos/supa-sombra.js');

/* ── Una entrada del historial, como la guarda guardarEnHistorial() ─────────────────────────────────── */
const entrada = (folio, o = {}) => ({
  folio, proy: 'Proyecto ' + folio, cliente: 'Cliente ' + folio, tel: '33 1000 ' + folio.replace(/\D/g, '').slice(-4).padStart(4, '0'),
  dirRaw: '', direccion: '', maps: '', entrecalles: '', entrega: 'instalacion', notaCliente: '', fecha: '20 oct 2026', plazoK: null,
  fechaAuth: '20 oct 2026', autorizador: 'dir@al3d.mx', nota: '', precioAuth: 0, neto: 11600, sub: 10000, iva: true, huellaAuth: 'h-' + folio,
  sello: null, anti: 5800, antiPct: 50, antiManual: false,
  items: [{ id: 1, tipo: 'letras', material: 'al-paint', altura: 30, n: 5, pu: 0, _lt: 4500, plano: null }],
  itemsAuth: {}, aiFile: null, renders: [], propuesta: [], disp: 'K7QM', ts: 1792800000000, reenviada: 0, ...o,
});

/* ── LA BASE DE MENTIRAS: `cotizaciones` con la regla de subida_unica (0021) y cotizacion_guardar (0008) ── */
function baseDeMentiras() {
  let reloj = Date.parse('2026-10-25T12:00:00Z');
  const tick = () => new Date(reloj += 1000).toISOString();
  const B = { filas: new Map(), llamadas: [], pedidas: [], cuenta: { area: 'direccion', uid: 'u-dir' }, sinRed: false };
  const ve = f => B.cuenta.area === 'direccion' || (B.cuenta.area === 'pagos' && f.creado_por === B.cuenta.uid);
  const err = (codigo, mensaje) => ({ data: { ok: false, codigo, mensaje: mensaje || codigo } });
  const datosDe = e => C.datosParaLaNube(e);
  B.rpc = async (n, a) => {
    B.llamadas.push([n, plano(a || {})]);
    if (B.sinRed) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    const c = B.cuenta;
    if (n === 'subida_unica') {
      const L = a.p_lote, acuse = [];
      for (const e of L.cotizaciones || []) {
        const d = e.disp || (e.sello && String(e.sello.folio || '').split('@')[1]) || L.disp;
        const fg = e.folio + '@' + d, datos = datosDe(e), ya = B.filas.get(fg);
        if (!ya) {
          B.filas.set(fg, { folio_global: fg, folio: e.folio, disp: d, creado_por: c.uid, datos, hitos: (L.hitos || {})[e.folio] || {}, updated_at: tick(), deleted_at: null });
          acuse.push({ tipo: 'cotizacion', id: fg, estado: 'creada' });
        } else if (c.area !== 'direccion' && ya.creado_por !== c.uid) acuse.push({ tipo: 'cotizacion', id: fg, estado: 'rechazada', motivo: 'ROL_SIN_PERMISO' });
        else if (C.canonico(ya.datos) === C.canonico(datos)) acuse.push({ tipo: 'cotizacion', id: fg, estado: 'ya_estaba' });
        else acuse.push({ tipo: 'cotizacion', id: fg, estado: 'conflicto' });
      }
      return { data: { ok: true, acuse } };
    }
    if (n === 'cotizacion_guardar') {
      const o = a.p_op, f = B.filas.get(o.folio_global);
      if (!f) return err('NO_ENCONTRADO');
      if (c.area !== 'direccion' && f.creado_por !== c.uid) return err('ROL_SIN_PERMISO', 'Ese folio es de otra persona.');
      if (o.borrar) { f.deleted_at = f.deleted_at || tick(); f.updated_at = tick(); return { data: { ok: true } }; }
      if (o.datos) {
        const d = datosDe(o.datos);
        if ((d.folio && d.folio !== f.folio) || (d.disp && d.disp !== f.disp)) return err('DATO_INVALIDO', 'El folio o el aparato no coinciden.');
        f.datos = d;
      }
      if (o.hitos) f.hitos = { ...f.hitos, ...o.hitos };
      f.updated_at = tick();
      return { data: { ok: true } };
    }
    if (n === 'tarifas_leer') return { data: { ok: true, tabla: B.tabla } };
    if (n === 'tarifas_guardar') {
      if (c.area !== 'direccion') return err('ROL_SIN_PERMISO', 'Solo Dirección.');
      B.tabla = { ...B.tabla, filas: a.p_filas, actualizado: tick(), por: 'dir@al3d.mx' };
      return { data: { ok: true, tabla: B.tabla, cambios: 1 } };
    }
    if (n === 'mi_acceso') {
      return { data: { ok: true, estado: 'activo', usuario: { correo: c.area + '@al3d.mx' }, empresas: [{ empresa_id: 'al3d', area: c.area, estado: 'activo' }],
        contrato: { actual: 1, minimo: 1 }, permisos: {}, modo: B.modo || 'base' } };
    }
    return err('DESCONOCIDO', 'Función desconocida: ' + n);
  };
  B.from = tabla => {
    B.pedidas.push(tabla);
    const filtros = [];
    const filas = () => (tabla === 'cotizaciones' && !B.sinRed ? [...B.filas.values()] : []).filter(ve).filter(f => filtros.every(x => x(f)))
      .sort((x, y) => (x.updated_at < y.updated_at ? -1 : 1));
    const res = l => Promise.resolve(B.sinRed ? { data: null, error: { message: 'Failed to fetch' } } : { data: plano(l), error: null });
    const q = {
      select() { return q; }, order() { return q; },
      eq(col, v) { filtros.push(f => col === 'empresa_id' ? v === 'al3d' : f[col] === v); return q; },
      gt(col, v) { filtros.push(f => Date.parse(f[col]) > Date.parse(v)); return q; },
      in(col, l) { filtros.push(f => l.includes(f[col])); return res(filas()); },
      range(a, b) { return res(filas().slice(a, b + 1)); },
    };
    return q;
  };
  B.cliente = { rpc: (n, a) => B.rpc(n, a), from: t => B.from(t), auth: { getSession: async () => ({ data: { session: { user: {} } } }) },
    channel() { const ch = { on() { return ch; }, subscribe(cb) { if (cb) cb('SUBSCRIBED'); return ch; } }; return ch; }, removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), copy: async () => ({ error: null }), createSignedUrl: async () => ({ error: { message: 'not found', statusCode: '404' } }) }) } };
  B.llamadasDe = n => B.llamadas.filter(x => x[0] === n);
  return B;
}

try {
  console.log('\nLO PURO: LO QUE SE MANDA ES LO QUE LA BASE GUARDA');
  {
    const e = entrada('COT-0001-K', { aiFile: { name: 'logo.png', type: 'image/png', url: 'data:image/png;base64,AAAA' },
      renders: ['img-1', 'data:image/jpeg;base64,BBBB'], nota: 'data:text/plain,nada' });
    const d = C.datosParaLaNube(e);
    eq('sin la imagen de referencia (aiFile.url) y sin data URLs, en objetos y en listas (interno.datos_cotizacion)',
      [d.aiFile, d.renders, 'nota' in d], [{ name: 'logo.png', type: 'image/png' }, ['img-1'], false]);
    eq('y la entrada de aquí no se toca', e.aiFile.url.slice(0, 5), 'data:');
    eq('la firma no cambia porque la base reordene las llaves (jsonb)', C.firma({ ...e }, 'K7QM') === C.firma(Object.fromEntries(Object.entries(e).reverse()), 'K7QM'), true);
    eq('ni porque falte la imagen de referencia', C.firma(e, 'K7QM') === C.firma({ ...e, aiFile: { name: 'logo.png', type: 'image/png' } }, 'K7QM'), true);
    eq('el folio global, con la regla de subida_unica: el aparato de la entrada, el de su sello, o el de este teléfono',
      [C.claveDe(e, 'ZZZZ'), C.claveDe({ ...e, disp: '', sello: { folio: 'COT-0001-K@5D93' } }, 'ZZZZ'), C.claveDe({ ...e, disp: '' }, 'ZZZZ')],
      ['COT-0001-K@K7QM', 'COT-0001-K@5D93', 'COT-0001-K@ZZZZ']);
    eq('y una entrada de antes sin aparato se manda con él puesto', C.normal({ ...e, disp: '' }, 'ZZZZ').disp, 'ZZZZ');
    eq('un talón de la copia de la hoja (sin folio ni partidas) y una pendiente de la cola no son entradas del historial',
      [C.esEntrada({ proy: 'x', cliente: 'y', subtotal: 1, items: [] }), C.esEntrada({ proy: 'x', items: [] }), C.esEntrada(e)], [false, false, true]);
    eq('quién gana: la más nueva (`editado`, o `ts` en las de antes)', [C.ganaLocal({ editado: 5 }, { editado: 4 }, 'A'), C.ganaLocal({ ts: 3 }, { editado: 4 }, 'A')], [true, false]);
    eq('en un empate, el teléfono que emitió el folio', [C.ganaLocal({ ts: 4, disp: 'A' }, { ts: 4 }, 'A'), C.ganaLocal({ ts: 4, disp: 'B' }, { ts: 4 }, 'A')], [true, false]);
  }

  console.log('\nLO PURO: LA MEZCLA');
  {
    const D = 'K7QM';
    const local = [entrada('COT-0003-K', { ts: 3000 }), entrada('COT-0001-K', { ts: 1000, aiFile: { name: 'ref.jpg', type: 'image/jpeg', url: 'data:image/jpeg;base64,QQ' } })];
    const fila = (e, o = {}) => ({ folio_global: e.folio + '@' + (e.disp || o.disp || 'K7QM'), folio: e.folio, disp: e.disp || o.disp || 'K7QM',
      datos: C.datosParaLaNube(e), hitos: o.hitos || {}, updated_at: o.u || '2026-10-25T12:00:00Z', deleted_at: o.borrada || null });
    const otra = entrada('COT-0002-P', { disp: 'P4G0', ts: 2000 });
    const m1 = C.mezclar({ historial: local, hitos: {} }, [fila(otra, { hitos: { pdf: 50, wa: 0 } })], D);
    eq('una de otro teléfono entra, en su lugar por fecha (la más nueva arriba)', m1.historial.map(x => x.folio), ['COT-0003-K', 'COT-0002-P', 'COT-0001-K']);
    eq('con sus hitos (los de la base)', m1.hitos, { 'COT-0002-P': { pdf: 50 } });
    eq('y la cuenta', [m1.cambios, m1.nuevas], [1, 1]);
    const m2 = C.mezclar({ historial: m1.historial, hitos: m1.hitos }, [fila(otra, { hitos: { pdf: 50 } })], D);
    eq('la misma fila otra vez: nada cambia (sin duplicar)', [m2.cambios, m2.historial.length, m2.hitos], [0, 3, null]);
    const editada = { ...C.datosParaLaNube(local[1]), anti: 7000, editado: 9000 };
    const m3 = C.mezclar({ historial: local, hitos: {} }, [fila(editada)], D);
    eq('la base trae una más nueva de una de aquí: gana la base…', [m3.reemplazadas, m3.historial[1].anti], [1, 7000]);
    eq('…y se queda la imagen de referencia de aquí (la base no la guarda)', m3.historial[1].aiFile.url, 'data:image/jpeg;base64,QQ');
    const m4 = C.mezclar({ historial: [{ ...local[1], anti: 6000, editado: 9500 }], hitos: {} }, [fila(editada)], D);
    eq('la de aquí es más nueva: se queda la de aquí (la sube la plataforma)', [m4.cambios, m4.historial[0].anti], [0, 6000]);
    const viejaAqui = { ...otra, anti: 1 };       // copia vieja, sin `editado`, de una cotización de OTRO teléfono
    const m5 = C.mezclar({ historial: [viejaAqui], hitos: {} }, [fila(otra)], D);
    eq('empate sin `editado` en una ajena: gana la base (la del teléfono que la emitió)', [m5.reemplazadas, m5.historial[0].anti], [1, 5800]);
    const propiaAqui = { ...local[0], anti: 2 };
    const m6 = C.mezclar({ historial: [propiaAqui], hitos: {} }, [fila(local[0])], D);
    eq('empate en una de ESTE teléfono: se queda la de aquí', [m6.cambios, m6.historial[0].anti], [0, 2]);
    const m7 = C.mezclar({ historial: local, hitos: {} }, [fila(local[0], { borrada: '2026-10-25T13:00:00Z' })], D);
    eq('borrada en la base: se quita de aquí', [m7.quitadas, m7.historial.map(x => x.folio)], [1, ['COT-0001-K']]);
    const m8 = C.mezclar({ historial: [{ ...local[0], editado: Date.parse('2026-10-25T14:00:00Z') }], hitos: {} }, [fila(local[0], { borrada: '2026-10-25T13:00:00Z' })], D);
    eq('…salvo que aquí se editó DESPUÉS de borrarla', m8.quitadas, 0);
    const mismoFolio = entrada('COT-0003-K', { disp: 'OTRO', ts: 5000, cliente: 'Otro cliente' });
    const m9 = C.mezclar({ historial: local, hitos: {} }, [fila(mismoFolio)], D);
    eq('un folio corto que aquí ya es de otra cotización: no entra (un folio, una entrada) y se cuenta', [m9.cambios, m9.choques, m9.historial.length], [0, 1, 2]);
    const talon = { folio_global: 'COT-0009-K@K7QM', folio: 'COT-0009-K', disp: 'K7QM', datos: { proy: 'x', cliente: 'y', subtotal: 1, items: [] }, hitos: {} };
    eq('un talón de la copia de la hoja no entra', C.mezclar({ historial: local, hitos: {} }, [talon], D).cambios, 0);
    const sinDisp = C.datosParaLaNube(entrada('COT-0007', { disp: undefined, ts: 7000 }));
    delete sinDisp.disp;
    const m10 = C.mezclar({ historial: [], hitos: {} }, [{ folio_global: 'COT-0007@5D93', folio: 'COT-0007', disp: '5D93', datos: sinDisp, hitos: {} }], D);
    eq('una de antes sin aparato llega con el suyo puesto (si no, aquí parecería de ESTE teléfono)', m10.historial[0].disp, '5D93');
    const m11 = C.mezclar({ historial: [local[0]], hitos: { 'COT-0003-K': { pdf: 900, wa: 0 } } }, [fila(local[0], { hitos: { pdf: 800, wa: 850, venta: 0 } })], D);
    eq('los hitos: lo que falta aquí, y de lo que hay en los dos, el más viejo (la primera vez manda)', m11.hitos['COT-0003-K'], { pdf: 800, wa: 850 });
  }

  console.log('\nLO PURO: QUÉ SE MANDA EN CADA VUELTA');
  {
    const D = 'K7QM', h = [entrada('COT-0001-K'), entrada('COT-0002-K')];
    const reg = new Map([[h[0].folio + '@K7QM', { estado: 'nube', en_nube: true, firma: C.firma(h[0], D), hitos: C.firmaHitos(null), editado: h[0].ts }]]);
    let p = C.planDeSubida({ historial: h, hitos: {}, borradas: [] }, reg, { disp: D });
    eq('lo que la base no tiene es nuevo; lo que ya tiene igual, nada', [p.nuevas.map(x => x.fg), p.cambiadas.length], [['COT-0002-K@K7QM'], 0]);
    p = C.planDeSubida({ historial: [{ ...h[0], anti: 1, editado: h[0].ts + 5 }], hitos: {}, borradas: [] }, reg, { disp: D });
    eq('cambiada aquí y más nueva: se revisa contra la base', p.cambiadas.map(x => x.fg), ['COT-0001-K@K7QM']);
    p = C.planDeSubida({ historial: [{ ...h[0], anti: 1 }], hitos: {}, borradas: [] }, new Map([[h[0].folio + '@K7QM', { estado: 'nube', firma: 'otra', editado: h[0].ts + 99 }]]), { disp: D });
    eq('la base la tiene más nueva: espera a la bajada (no se pisa)', [p.cambiadas.length, p.esperan], [0, 1]);
    p = C.planDeSubida({ historial: [h[0]], hitos: { 'COT-0001-K': { pdf: 7 } }, borradas: [] }, reg, { disp: D });
    eq('solo los hitos', p.soloHitos.map(x => [x.fg, x.hitos]), [['COT-0001-K@K7QM', { pdf: 7, wa: 0, venta: 0 }]]);
    const ahora = 1_000_000;
    p = C.planDeSubida({ historial: [], hitos: {}, borradas: [{ clave: 'COT-0001-K@K7QM', ts: ahora - 5000 }] }, reg, { disp: D, ahora });
    eq('una lápida dentro de la ventana de «Deshacer» espera (y se dice cuánto)', [p.borrar, p.borrarEn], [[], 10000]);
    p = C.planDeSubida({ historial: [], hitos: {}, borradas: [{ clave: 'COT-0001-K@K7QM', ts: ahora - 20000 }] }, reg, { disp: D, ahora });
    eq('pasada la ventana, se borra', p.borrar, ['COT-0001-K@K7QM']);
    p = C.planDeSubida({ historial: [h[0]], hitos: {}, borradas: [{ clave: 'COT-0001-K@K7QM', ts: ahora - 20000 }] }, reg, { disp: D, ahora });
    eq('si volvió (Deshacer), no', p.borrar, []);
    p = C.planDeSubida({ historial: h, hitos: {}, borradas: [] }, new Map([...reg, ['COT-0002-K@K7QM', { estado: 'ajena', firma: 'x' }]]), { disp: D });
    eq('lo de otra persona no se vuelve a intentar', [p.nuevas.length, p.ajenas], [0, 1]);
  }

  console.log('\nSUBIR: LA SUBIDA ÚNICA AUTOMÁTICA, IDEMPOTENTE, CONTRA LA BASE DE MENTIRAS (Dirección)');
  const B = baseDeMentiras();
  let reloj = 2_000_000_000_000;
  const tel = { historial: [], hitos: {}, borradas: [], area: 'direccion', disp: 'K7QM', marca: null };
  const almacen = almacenEnMemoria();
  const crear = (o = {}) => C.crearCotizaciones({ cliente: async () => B.cliente, almacen: o.almacen || almacen, area: () => tel.area, disp: () => tel.disp,
    historial: () => tel.historial, hitos: () => tel.hitos, borradas: () => tel.borradas, folioMax: () => 120, ahora: () => reloj,
    subidaHecha: { leer: () => tel.marca, poner: v => { tel.marca = v; } } });
  const K = crear();
  {
    tel.historial = Array.from({ length: 120 }, (_, i) => entrada('COT-' + String(i + 1).padStart(4, '0') + '-K', { ts: 1792800000000 + i }));
    tel.hitos = { 'COT-0001-K': { pdf: 11, wa: 12 } };
    const r1 = await K.subir();
    eq('la primera vez sube TODO el historial de este aparato, en lotes de 50 (el tope de subida_unica)',
      [r1.subidas, B.llamadasDe('subida_unica').map(x => x[1].p_lote.cotizaciones.length)], [120, [50, 50, 20]]);
    const lote = B.llamadasDe('subida_unica')[0][1].p_lote;
    eq('con el aparato, el folio más alto del contador y los hitos', [lote.disp, lote.folio_max, lote.hitos], ['K7QM', 120, { 'COT-0001-K': { pdf: 11, wa: 12, venta: 0 } }]);
    cierto('sin la imagen de referencia (la base no la guarda: no se gastan datos en mandarla)', lote.cotizaciones.every(e => !e.aiFile || !e.aiFile.url));
    eq('y la marca de que la subida única de este aparato terminó', [!!tel.marca, tel.marca && tel.marca.en_la_base], [true, 120]);
    B.llamadas.length = 0;
    const r2 = await K.subir();
    eq('la segunda vuelta no manda NADA (lo que la base ya tiene se recuerda por su firma)', [r2.motivo, B.llamadas.length], ['nada', 0]);
    /* El registro se perdió (otro navegador, la base local borrada): la base contesta «ya estaba» y no duplica. */
    const K2 = crear({ almacen: almacenEnMemoria() });
    const r3 = await K2.subir();
    eq('sin registro, reintentar es seguro: la base contesta «ya estaba» y no hay dos', [r3.subidas, r3.ya_estaban, B.filas.size], [0, 120, 120]);
  }

  console.log('\nSUBIR: LO QUE CAMBIÓ, QUIÉN GANA, LO BORRADO');
  {
    B.llamadas.length = 0;
    const i = tel.historial.findIndex(e => e.folio === 'COT-0005-K');
    tel.historial[i] = { ...tel.historial[i], anti: 7000, editado: Date.parse('2026-10-26T10:00:00Z') };
    const r = await K.subir();
    eq('una corrección de aquí: se lee la fila y, como es más nueva, cotizacion_guardar con los datos', [r.actualizadas, B.llamadas.map(x => x[0])], [1, ['cotizacion_guardar']]);
    cierto('antes de pisar se leyó la fila de la base', B.pedidas.includes('cotizaciones'));
    eq('la base quedó con lo de aquí', B.filas.get('COT-0005-K@K7QM').datos.anti, 7000);

    /* Otro teléfono la corrigió después en la base; este teléfono la cambia con una edición más vieja. */
    B.filas.get('COT-0006-K@K7QM').datos = { ...B.filas.get('COT-0006-K@K7QM').datos, anti: 9999, editado: Date.parse('2026-10-27T10:00:00Z') };
    const j = tel.historial.findIndex(e => e.folio === 'COT-0006-K');
    tel.historial[j] = { ...tel.historial[j], anti: 1234, editado: Date.parse('2026-10-26T09:00:00Z') };
    B.llamadas.length = 0;
    const r2 = await K.subir();
    eq('si la base la tiene más nueva, NO se pisa: espera a que la bajada la traiga', [r2.actualizadas, r2.esperan, B.llamadasDe('cotizacion_guardar').length, B.filas.get('COT-0006-K@K7QM').datos.anti],
      [0, 1, 0, 9999]);
    B.llamadas.length = 0;
    eq('y no se vuelve a intentar en cada vuelta', [(await K.subir()).motivo, B.llamadas.length], ['nada', 0]);

    tel.hitos['COT-0007-K'] = { pdf: 77 };
    B.llamadas.length = 0;
    await K.subir();
    eq('un hito nuevo: solo los hitos, y la base los suma', [B.llamadas.map(x => [x[0], Object.keys(x[1].p_op)]), B.filas.get('COT-0007-K@K7QM').hitos.pdf],
      [[['cotizacion_guardar', ['folio_global', 'hitos']]], 77]);

    tel.historial = tel.historial.filter(e => e.folio !== 'COT-0008-K');
    tel.borradas = [{ clave: 'COT-0008-K@K7QM', ts: reloj - 3000 }];
    B.llamadas.length = 0;
    const r3 = await K.subir();
    eq('borrada aquí: dentro de la ventana de «Deshacer» no se manda, y dice cuándo volver', [B.llamadas.length, r3.borrar_en], [0, 12000]);
    reloj += 13000;
    const r4 = await K.subir();
    eq('pasada la ventana, se borra en la base (fecha de borrado; la fila se queda)', [r4.borradas, !!B.filas.get('COT-0008-K@K7QM').deleted_at], [1, true]);
    B.llamadas.length = 0;
    eq('y una vez', [(await K.subir()).motivo, B.llamadas.length], ['nada', 0]);
    tel.borradas = [];

    /* Sin red: se para, no se anota nada como subido, y la siguiente vuelta lo manda. */
    tel.historial.unshift(entrada('COT-0200-K', { ts: 1792900000000 }));
    B.sinRed = true;
    const r5 = await K.subir();
    eq('sin red se para y no se da por subida', [r5.motivo, r5.codigo, (await K.estado()).por_subir], ['parada', 'SIN_RED', 1]);
    B.sinRed = false;
    eq('con red, sale', (await K.subir()).subidas, 1);

    /* Una cotización que pasa del tope de la base: se aparta, y no se reintenta mientras no cambie. */
    tel.historial.unshift(entrada('COT-0201-K', { notaCliente: 'x'.repeat(210000) }));
    const r6 = await K.subir();
    eq('demasiado grande: se aparta con su motivo', [r6.apartadas, (await K.estado()).apartadas], [1, 1]);
    B.llamadas.length = 0;
    eq('y no se vuelve a mandar', [(await K.subir()).motivo, B.llamadas.length], ['nada', 0]);
    tel.historial.shift();
  }

  console.log('\nQUIÉN VE QUÉ: DIRECCIÓN TODO, PAGOS LO SUYO, FABRICACIÓN NI PREGUNTA');
  {
    const todas = await K.bajar('');
    eq('Dirección baja todas las de la empresa', [todas.ok, todas.filas.length], [true, B.filas.size]);
    const desde = await K.bajar(todas.hasta);
    eq('y la siguiente vez, solo lo que cambió desde la anterior', [desde.ok, desde.filas.length], [true, 0]);
    B.cuenta = { area: 'pagos', uid: 'u-pag' };
    tel.area = 'pagos'; tel.disp = 'P4G0';
    const almP = almacenEnMemoria();
    const KP = crear({ almacen: almP });
    tel.historial = [entrada('COT-0001-P', { disp: 'P4G0' }), entrada('COT-0002-K')];      // la segunda es de Dirección (vino en un respaldo)
    B.llamadas.length = 0;
    const r = await KP.subir();
    eq('Pagos sube lo suyo; lo de otra persona la base no se lo deja y no se reintenta', [r.subidas, r.ajenas], [1, 1]);
    B.llamadas.length = 0;
    eq('(ni una llamada más)', [(await KP.subir()).motivo, B.llamadas.length], ['nada', 0]);
    const b = await KP.bajar('');
    eq('Pagos baja SOLO las suyas (la RLS de 0008)', b.filas.map(f => f.folio_global), ['COT-0001-P@P4G0']);
    B.cuenta = { area: 'fabricacion', uid: 'u-fab' };
    tel.area = 'fabricacion'; tel.disp = 'F4B0';
    tel.historial = [entrada('COT-0001-F', { disp: 'F4B0' })];
    const KF = crear({ almacen: almacenEnMemoria() });
    B.pedidas.length = 0;
    const bf = await KF.bajar('');
    eq('Fabricación: la bajada ni se intenta (las cotizaciones llevan precios)', [bf.ok, bf.codigo, B.pedidas.length], [false, 'ROL_SIN_PERMISO', 0]);
    const rf = await KF.subir();
    eq('pero su historial sí sube (la base se lo deja: escribe y nunca lee de vuelta)', [rf.subidas, B.pedidas.length], [1, 0]);
    tel.historial[0] = { ...tel.historial[0], anti: 1, editado: Date.now() + 1 };
    B.llamadas.length = 0;
    const rf2 = await KF.subir();
    eq('y una corrección suya va sin leer la fila (no la ve): solo pisa las que emitió este aparato', [rf2.actualizadas, B.pedidas.length, B.llamadas.map(x => x[0])],
      [1, 0, ['cotizacion_guardar']]);
    B.cuenta = { area: 'direccion', uid: 'u-dir' };
    tel.area = 'direccion'; tel.disp = 'K7QM';
  }

  console.log('\nEL ENCHUFE CON LA BASE MANDANDO: LA VENTANILLA, EL HISTORIAL QUE SUBE, LAS IMÁGENES SIN LA SOMBRA');
  {
    for (const k of Object.keys(ls)) delete ls[k];
    ls.al3d_pf_disp = 'K7QM';            // crudo, como lo guarda Prefs (CRUDAS)
    const idb = idbConIndices();
    globalThis.indexedDB = { open: (n, v) => idb.open(n, v), deleteDatabase: () => {} };
    globalThis.IDBKeyRange = { only: v => ({ only: v }) };
    globalThis.document = { createElement: () => ({}), head: { appendChild() {} }, visibilityState: 'visible', addEventListener() {} };
    globalThis.window = globalThis;
    const oyentes = {};
    globalThis.addEventListener = (t, f) => { (oyentes[t] = oyentes[t] || []).push(f); };
    globalThis.dispatchEvent = () => true;
    const stReal = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...a) => stReal(fn, Number(ms) >= 1000 ? 1 : ms, ...a);
    globalThis.setInterval = () => 0;
    const BE = baseDeMentiras();
    BE.tabla = { filas: [{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 33 }], actualizado: '', por: '' };
    globalThis.supabase = { createClient: () => BE.cliente };
    const Supa = await import('../js/nucleo/supa.js');
    const E = await import('../js/datos/supa-enchufe.js');
    modo('hoja');
    eq('con la hoja mandando, el historial no sube', (await E.subirCotizaciones(true)).motivo, 'hoja');
    await E.arrancar({});
    cierto('ni hay ventanilla del cotizador', !globalThis.AL3D_NUBE);
    eq('ni se pidió nada a la base', BE.llamadas.length, 0);

    ls.al3d_historial = JSON.stringify([entrada('COT-0001-K'), entrada('COT-0002-K')]);
    BE.modo = 'base';
    modo('base');
    Supa.guardarModo({ estado: 'activo', modo: 'base', area: 'direccion' });
    await E.arrancar({});
    eq('Dirección: la ventanilla trae lo del cotizador (precios e historial) además de las imágenes',
      Object.keys(globalThis.AL3D_NUBE).sort(), ['cotizaciones', 'guardarTarifas', 'imagenes', 'mezclar', 'obra', 'tarifas']);
    for (let n = 0; n < 200 && !BE.llamadasDe('subida_unica').length; n++) await espera(5);
    eq('al arrancar, la subida única del historial sale sola', BE.llamadasDe('subida_unica').map(x => x[1].p_lote.cotizaciones.map(e => e.folio)), [['COT-0001-K', 'COT-0002-K']]);
    const t = await globalThis.AL3D_NUBE.tarifas();
    eq('los precios, de la base (tarifas_leer), con la forma de la hoja', [t.ok, t.tabla.filas[0].precio], [true, 33]);
    const g = await globalThis.AL3D_NUBE.guardarTarifas([{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 40 }]);
    eq('y se guardan en la base (tarifas_guardar)', [g.ok, g.tabla.filas[0].precio, BE.llamadasDe('tarifas_guardar').length], [true, 40, 1]);
    /* El cotizador guarda: el evento 'storage' de su historial hace que suba. */
    ls.al3d_historial = JSON.stringify([entrada('COT-0003-K'), entrada('COT-0001-K'), entrada('COT-0002-K')]);
    BE.llamadas.length = 0;
    for (const f of oyentes.storage || []) f({ key: 'al3d_historial' });
    for (let n = 0; n < 200 && !BE.llamadasDe('subida_unica').length; n++) await espera(5);
    eq('el cotizador guardó: sube lo nuevo, y solo eso', BE.llamadasDe('subida_unica').map(x => x[1].p_lote.cotizaciones.map(e => e.folio)), [['COT-0003-K']]);
    const im = await E.subirImagenes(true);
    cierto('las imágenes suben con la base mandando aunque la sombra esté apagada', im.motivo !== 'apagada');
    await E.subirCotizaciones(true);            // la vuelta que corre termina (y si no hay, una que no manda nada)
    const st = await E.estadoCotizaciones();
    eq('Ajustes ve lo del historial', [st.en_la_base, st.por_subir, !!st.subida_unica], [3, 0, true]);

    BE.cuenta = { area: 'pagos', uid: 'u-pag' };
    E.apagar();
    cierto('apagar quita la ventanilla', !globalThis.AL3D_NUBE);
    await E.arrancar({});
    eq('Pagos: precios e historial (lo suyo), sin las obras', Object.keys(globalThis.AL3D_NUBE).sort(), ['cotizaciones', 'guardarTarifas', 'imagenes', 'mezclar', 'tarifas']);
    const gp = await globalThis.AL3D_NUBE.guardarTarifas([]);
    eq('guardar precios desde Pagos: la base dice que no, y la ventanilla lo contesta sin lanzar', [gp.ok, gp.codigo], [false, 'ROL_SIN_PERMISO']);
    BE.cuenta = { area: 'fabricacion', uid: 'u-fab' };
    E.apagar();
    await E.arrancar({});
    eq('Fabricación: los precios y las obras ganadas; ni `cotizaciones` ni `mezclar` (llevan precios)', Object.keys(globalThis.AL3D_NUBE).sort(), ['guardarTarifas', 'obra', 'tarifas']);
    BE.cuenta = { area: 'direccion', uid: 'u-dir' };
    E.apagar();
    modo('hoja');
    Supa.guardarModo({ estado: 'activo', modo: 'hoja', area: 'direccion' });
    await E.arrancar({});
    cierto('de vuelta en la hoja: sin ventanilla', !globalThis.AL3D_NUBE);
    BE.llamadas.length = 0;
    for (const f of oyentes.storage || []) f({ key: 'al3d_historial' });
    await espera(30);
    eq('y lo que guarda el cotizador ya no sube', BE.llamadas.length, 0);
    globalThis.setTimeout = stReal;
  }

  /* ── EL COTIZADOR: sus guiones de verdad, en un contexto aparte ─────────────────────────────────── */
  const venta = leer('js/cotizador/venta.js'), hist = leer('js/cotizador/historial.js'), entrega = leer('js/cotizador/entrega.js');
  const BASE_COT = ['laBaseManda', 'ventanillaBase', 'esperarVentanillaBase', 'dispDeLaCotizacion'].map(n => funcion(venta, n)).join('\n');

  console.log('\nEL COTIZADOR: EL HISTORIAL DE LA EMPRESA BAJA Y SE JUNTA');
  {
    const lsC = {};
    const avisos = [];
    const ctx = vm.createContext({
      localStorage: { getItem: k => (k in lsC ? lsC[k] : null), setItem: (k, v) => { lsC[k] = String(v); }, removeItem: k => { delete lsC[k]; } },
      window: { addEventListener() {} }, document: { addEventListener() {} }, parent: null, setTimeout, Date, JSON, Math, Promise, console,
      $: () => null, toast: (...a) => avisos.push(a[0]), pintarClientes() {}, invalidarCuadernos() {}, invalidarClientes() {}, respaldar() {},
      dispositivo: () => 'K7QM', indexarHistorial() {}, pintarFichasHistorial() {}, pintarHistorial() {}, cuadernos: () => [], pintarCuadernos() {},
    });
    ctx.parent = ctx.window;
    vm.runInContext(BASE_COT + '\nconst HITOS_KEY=\'al3d_hitos\';\n' + funcion(entrega, 'getHitos') + '\n' + funcion(hist, 'getHistorial') + '\n' +
      funcion(hist, 'saveHistorial') + '\nlet _cuaAbierto=null, _cuaData=[], _histData=[];\n' +
      tramo(hist, 'const HIST_NUBE=', 'let _histData=[];'), ctx);
    const traer = o => vm.runInContext('traerHistorialDeLaNube', ctx)(o);
    const pedidos = [];
    const filasNube = [
      { folio_global: 'COT-0002-P@P4G0', folio: 'COT-0002-P', disp: 'P4G0', datos: C.datosParaLaNube(entrada('COT-0002-P', { disp: 'P4G0', ts: 2000 })),
        hitos: { venta: 99 }, updated_at: '2026-10-25T12:00:05.000Z', deleted_at: null },
    ];
    lsC.al3d_historial = JSON.stringify([entrada('COT-0001-K', { ts: 1000 })]);
    /* Con la hoja mandando: ni se busca la ventanilla. */
    ctx.window.AL3D_NUBE = { cotizaciones: async d => { pedidos.push(d); return { ok: true, filas: filasNube, hasta: '2026-10-25T12:00:05.000Z' }; }, mezclar: C.mezclar };
    eq('con la hoja mandando, no se pregunta nada', [await traer({ forzar: true }), pedidos.length, Object.keys(lsC).sort()], [0, 0, ['al3d_historial']]);
    lsC.al3d_pf_supa = ON; lsC.al3d_pf_supa_modo = JSON.stringify({ modo: 'base', area: 'direccion' });
    const n = await traer({ forzar: true });
    eq('con la base mandando: la primera vez pide TODO', [n, pedidos], [1, ['']]);
    eq('y lo junta en el historial de aquí (escrito por el cotizador)', JSON.parse(lsC.al3d_historial).map(e => e.folio + '@' + e.disp), ['COT-0002-P@P4G0', 'COT-0001-K@K7QM']);
    eq('con sus hitos', JSON.parse(lsC.al3d_hitos), { 'COT-0002-P': { venta: 99 } });
    eq('la marca de hasta dónde se trajo', JSON.parse(lsC.al3d_hist_nube).hasta, '2026-10-25T12:00:05.000Z');
    eq('dentro del minuto no se vuelve a preguntar', [await traer(), pedidos.length], [0, 1]);
    await traer({ forzar: true });
    eq('la siguiente, solo lo que cambió desde la marca', pedidos[1], '2026-10-25T12:00:05.000Z');
    /* Lo que se guardó mientras la red contestaba entra a la mezcla (se lee DESPUÉS de la red). */
    ctx.window.AL3D_NUBE.cotizaciones = async d => { lsC.al3d_historial = JSON.stringify([entrada('COT-0009-K', { ts: 9000 }), ...JSON.parse(lsC.al3d_historial)]);
      return { ok: true, filas: [], hasta: d }; };
    await traer({ forzar: true });
    eq('lo que se guardó mientras la red contestaba no se pierde', JSON.parse(lsC.al3d_historial).map(e => e.folio), ['COT-0009-K', 'COT-0002-P', 'COT-0001-K']);
    /* Un folio corto que ya es de otra cotización: no entra, y se dice una vez. */
    ctx.window.AL3D_NUBE.cotizaciones = async () => ({ ok: true, filas: [{ folio_global: 'COT-0001-K@OTRO', folio: 'COT-0001-K', disp: 'OTRO',
      datos: C.datosParaLaNube(entrada('COT-0001-K', { disp: 'OTRO', cliente: 'Otro' })), hitos: {}, updated_at: '2026-10-25T13:00:00Z' }], hasta: '2026-10-25T13:00:00Z' });
    avisos.length = 0;
    await traer({ forzar: true });
    eq('un folio repetido no entra y se avisa, con su folio y su teléfono', [JSON.parse(lsC.al3d_historial).length, avisos.length,
      /COT-0001-K del teléfono OTRO/.test(avisos[0] || ''), /la suya en Ajustes/.test(avisos[0] || '')], [3, 1, true, true]);
    avisos.length = 0;
    await traer({ forzar: true });
    eq('la siguiente vuelta (y la siguiente apertura) ya no lo repite: se dice UNA vez por cotización', [avisos.length, JSON.parse(lsC.al3d_hist_choques)],
      [0, ['COT-0001-K@OTRO']]);
    /* Sin ventanilla (sin sesión en la base): no pasa nada. */
    delete ctx.window.AL3D_NUBE;
    eq('sin ventanilla, nada', await traer({ forzar: true }), 0);

    /* La lápida: con la base mandando al borrar, y se quita con «Deshacer». */
    const lapida = (e, si) => vm.runInContext('_histLapida', ctx)(e, si);
    lapida(entrada('COT-0002-P', { disp: 'P4G0' }), true);
    eq('borrar con la base mandando deja la lápida con su folio global', JSON.parse(lsC.al3d_hist_borradas).map(x => x.clave), ['COT-0002-P@P4G0']);
    lapida(entrada('COT-0002-P', { disp: 'P4G0' }), false);
    eq('«Deshacer» la quita', JSON.parse(lsC.al3d_hist_borradas), []);
    delete lsC.al3d_pf_supa;
    delete lsC.al3d_hist_borradas;
    lapida(entrada('COT-0002-P'), true);
    cierto('con la hoja mandando, ni lápida', !('al3d_hist_borradas' in lsC));
  }

  console.log('\nEL COTIZADOR: GUARDAR EN EL HISTORIAL (`editado` y el aparato de una ajena)');
  {
    const lsC = {};
    const ctx = vm.createContext({
      localStorage: { getItem: k => (k in lsC ? lsC[k] : null), setItem: (k, v) => { lsC[k] = String(v); }, removeItem: k => { delete lsC[k]; } },
      window: { addEventListener() {} }, document: { addEventListener() {} }, parent: null, setTimeout, Date, JSON, Math, console,
      toast() {}, pintarClientes() {}, invalidarCuadernos() {}, invalidarClientes() {}, respaldar() {}, reFoliarSiEsOtroCliente: () => false,
      dispositivo: () => 'K7QM', totals: () => ({ neto: 11600, sub: 10000 }), lineTotal: () => 4500, ANTICIPO_PASOS: [50, 65, 80, 95, 100],
      Q: null,
    });
    ctx.parent = ctx.window;
    vm.runInContext(BASE_COT + '\n' + ['getHistorial', 'saveHistorial', 'guardarEnHistorial', '_histDispDe', '_histFirma', '_histCorreoAqui', '_histAjena', '_histQuien'].map(nm => funcion(hist, nm)).join('\n'), ctx);
    const Q = (o = {}) => ({ folio: 'COT-0010-K', proy: 'Café', cliente: 'Ana', tel: '3310000000', estado: 'autorizada', fechaAuth: 'hoy', autorizador: 'dir',
      huellaAuth: 'h', items: [{ id: 1, tipo: 'letras' }], itemsAuth: {}, renders: [], propuesta: [], anti: 5800, antiPct: 50, iva: true, ...o });
    const guardar = q => { vm.runInContext('Q=' + JSON.stringify(q), ctx); vm.runInContext('guardarEnHistorial()', ctx); return JSON.parse(lsC.al3d_historial); };
    let h = guardar(Q());
    eq('con la hoja mandando, la entrada de siempre: sin `editado`, con el aparato de este teléfono', ['editado' in h[0], h[0].disp], [false, 'K7QM']);
    lsC.al3d_pf_supa = ON; lsC.al3d_pf_supa_modo = JSON.stringify({ modo: 'base' });
    h = guardar(Q({ folio: 'COT-0011-K' }));
    cierto('con la base mandando, una nueva lleva `editado`', h[0].editado > 0);
    const ed = h[0].editado;
    h = guardar(Q({ folio: 'COT-0011-K' }));
    eq('volver a guardar lo mismo NO la mueve (no es una edición)', h[0].editado, ed);
    h = guardar(Q({ folio: 'COT-0011-K', anti: 7000 }));
    cierto('un cambio sí', h[0].editado >= ed && h[0].anti === 7000);
    /* Una cotización de OTRO teléfono que vino de la base: al corregirla aquí conserva su aparato (su folio global). */
    lsC.al3d_historial = JSON.stringify([entrada('COT-0002-P', { disp: 'P4G0' })]);
    h = guardar(Q({ folio: 'COT-0002-P', cliente: 'Cliente COT-0002-P', tel: '33 1000 0002' }));
    eq('una ajena corregida aquí sigue siendo de su teléfono', h[0].disp, 'P4G0');
    eq('y no se vuelve de quien la corrigió (una de antes, sin vendedor, se queda sin él)', 'vendedor' in h[0], false);
    eq('de otro teléfono: es ajena, y se dice de quién (sin correo, el teléfono)', vm.runInContext('[_histAjena(getHistorial()[0]), _histQuien(getHistorial()[0])]', ctx),
      [true, 'otro teléfono (P4G0)']);
    /* Una nueva lleva el correo de quien entró, y una que ya lo tenía lo conserva aunque la guarde otra persona. */
    ctx.identidadVerificada = () => ({ correo: 'ana.pagos@al3d.mx', rol: 'pagos' });
    h = guardar(Q({ folio: 'COT-0012-K' }));
    eq('una nueva guarda quién la hizo (el correo de la puerta)', h.find(x => x.folio === 'COT-0012-K').vendedor, 'ana.pagos@al3d.mx');
    ctx.identidadVerificada = () => ({ correo: 'dir@al3d.mx', rol: 'direccion' });
    h = guardar(Q({ folio: 'COT-0012-K', anti: 9000 }));
    eq('y la conserva aunque la corrija otra persona', h.find(x => x.folio === 'COT-0012-K').vendedor, 'ana.pagos@al3d.mx');
    eq('el nombre que se enseña sale del correo', vm.runInContext('_histQuien({vendedor:"ana.pagos@al3d.mx"})', ctx), 'Ana pagos');
    delete ctx.identidadVerificada;
    eq('y «Registrar venta» la vende con SU folio global', vm.runInContext('Q.folio=\'COT-0002-P\'; dispDeLaCotizacion()', ctx), 'P4G0');
    delete lsC.al3d_pf_supa;
    eq('con la hoja mandando, la de este teléfono (lo de siempre)', vm.runInContext('dispDeLaCotizacion()', ctx), 'K7QM');
  }

  console.log('\nEL COTIZADOR: LOS PRECIOS DE LA BASE Y SU ESPEJO EN LA HOJA (que sigue sellando)');
  {
    const lsC = {};
    const hoja = [], avisos = [];
    let respuestaHoja = r => ({ ok: true, tabla: { filas: [{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio de la hoja', precio: 31 }], actualizado: '', por: '' } });
    let dir = true;
    const elementos = {};
    const el = id => (elementos[id] = elementos[id] || { classList: { add() {}, remove() {}, contains: () => false }, focus() {}, hidden: false, innerHTML: '' });
    const ctx = vm.createContext({
      localStorage: { getItem: k => (k in lsC ? lsC[k] : null), setItem: (k, v) => { lsC[k] = String(v); }, removeItem: k => { delete lsC[k]; } },
      window: { addEventListener() {} }, parent: null, setTimeout, clearTimeout, Date, JSON, Math, console,
      $: el, toast: (m, t) => avisos.push([m, t || '']), renderItems() {}, renderSummary() {}, puedeAutorizar: () => dir, asegurarSesion: async () => ({ ok: true }),
      hablarHoja: async (ruta, cuerpo) => { hoja.push([ruta, cuerpo]); return respuestaHoja(ruta, cuerpo); },
      esc: s => String(s), dispositivo: () => 'K7QM', Q: null,
    });
    ctx.parent = ctx.window;
    const nucleo = leer('js/cotizador/nucleo.js');
    vm.runInContext(leer('js/cotizador/catalogo.js'), ctx);
    vm.runInContext('const ACC={}; function accionesDirectas(){} const M2_MINIMO=1;' + ['m2Total', 'lineTotal', 'lineTotalCrudo'].map(nm => funcion(nucleo, nm)).join('\n'), ctx);
    vm.runInContext(leer('js/cotizador/tarifas.js'), ctx);
    vm.runInContext(BASE_COT, ctx);
    const precio = () => vm.runInContext('MATERIALES.find(m=>m.key===\'al-paint\').precio', ctx);
    const refrescar = av => vm.runInContext('refrescarTarifas', ctx)(av);
    /* La tabla completa: la de fábrica con el aluminio cambiado (como las dos funciones la devuelven). */
    const tabla = (p, nombre = 'Aluminio') => {
      const t = vm.runInContext('_tarRenglones()', ctx).map(f => f.grupo === 'material' && f.clave === 'al-paint' ? { ...f, precio: p, nombre } : f);
      return { filas: t, actualizado: '2026-10-25T12:00:00.000Z', por: 'dir@al3d.mx' };
    };
    respuestaHoja = (ruta) => ruta === 'tarifas' ? { ok: true, tabla: tabla(31, 'Aluminio de la hoja') } : { ok: true, tabla: tabla(31) };
    await refrescar(false);
    eq('con la hoja mandando, los precios salen de la hoja, como siempre', [hoja.map(x => x[0]), precio()], [['tarifas'], 31]);
    const nube = { tarifas: async () => ({ ok: true, tabla: tabla(36) }), guardarTarifas: async filas => ({ ok: true, tabla: { ...tabla(0), filas }, cambios: 1 }) };
    ctx.window.AL3D_NUBE = nube;
    lsC.al3d_pf_supa = ON; lsC.al3d_pf_supa_modo = JSON.stringify({ modo: 'base' });
    hoja.length = 0;
    await refrescar(false);
    eq('con la base mandando, salen de la base y a la hoja ni se le pregunta', [hoja.length, precio()], [0, 36]);
    eq('la caché de este aparato es la misma (la lee también la plataforma)', JSON.parse(lsC.al3d_tarifas).filas.find(f => f.clave === 'al-paint').precio, 36);
    /* Dirección guarda: a la base, y la copia a la hoja. */
    vm.runInContext('_tarEdit=_tarRenglones(); _tarEdit.find(f=>f.clave===\'al-paint\').precio=42;', ctx);
    avisos.length = 0;
    await vm.runInContext('guardarTarifas', ctx)();
    eq('guardar con la base mandando: a la base, y la MISMA tabla a la pestaña de la hoja (el notario sella con ella)',
      [precio(), hoja.map(x => x[0]), hoja[0] && hoja[0][1].filas.find(f => f.clave === 'al-paint').precio], [42, ['guardar_tarifas'], 42]);
    cierto('y se dice que se guardó en la base', /guardados en la base/.test(avisos.map(a => a[0]).join(' ')));
    /* La hoja no contesta: queda pendiente y se avisa; la siguiente lectura de Dirección la reintenta. */
    respuestaHoja = () => { throw new Error('sin red'); };
    hoja.length = 0; avisos.length = 0;
    vm.runInContext('_tarEdit=_tarRenglones(); _tarEdit.find(f=>f.clave===\'al-paint\').precio=44;', ctx);
    await vm.runInContext('guardarTarifas', ctx)();
    eq('si la hoja no recibe la copia: se guardó en la base igual, queda pendiente y se dice', [precio(), !!lsC.al3d_tarifas_espejo, avisos.some(a => a[1] === 'err' && /sella/.test(a[0]))],
      [44, true, true]);
    respuestaHoja = () => ({ ok: true });
    hoja.length = 0;
    nube.tarifas = async () => ({ ok: true, tabla: tabla(44) });
    await refrescar(false);
    eq('la siguiente lectura en el teléfono de Dirección la vuelve a mandar, con lo que dice la base', [hoja.map(x => x[0]), !!lsC.al3d_tarifas_espejo], [['guardar_tarifas'], false]);
    /* Al autorizar, la hoja dice que el subtotal no cuadra y la base no cambió: la atrasada es la hoja. */
    hoja.length = 0; avisos.length = 0;
    await refrescar(true);
    eq('«no cuadra» y la base no cambió: Dirección le pone a la hoja los de la base y lo dice', [hoja.map(x => x[0]), /Vuelve a autorizar/.test(avisos.map(a => a[0]).join(' '))],
      [['guardar_tarifas'], true]);
    dir = false; hoja.length = 0; avisos.length = 0;
    await refrescar(true);
    eq('desde otro teléfono no se toca la hoja: se dice que Dirección la ponga al día', [hoja.length, /Dirección/.test(avisos.map(a => a[0]).join(' '))], [0, true]);
    dir = true;
    /* Sin ventanilla (todavía sin sesión en la base): se queda la de este aparato y a la hoja no se le pregunta. */
    delete ctx.window.AL3D_NUBE;
    hoja.length = 0;
    vm.runInContext('esperarVentanillaBase=async function(){ return null; }', ctx);
    eq('sin ventanilla: se queda la que había, sin ir a la hoja', [await refrescar(false), hoja.length, precio()], [false, 0, 44]);
    /* Auditoría 2026-10-25 · CZ-3: y el paso de Precio lo dice, con la fecha de esos precios y la salida. */
    eq('sin ventanilla, el letrero del paso de Precio sale y dice de cuándo son y qué hacer',
      [el('s-tar-aviso').hidden, /^Precios de este teléfono del .+: entra a Supabase para traer los de hoy\.$/.test(el('s-tar-aviso-txt').textContent)], [false, true]);
    eq('la autorización que rebota por precios dice lo mismo (no «ya se trajeron los de la hoja»)',
      vm.runInContext('mensajeTarifasSinBase(\', y vuelve a mandarla\')', ctx).endsWith('entra a Supabase para traer los de hoy, y vuelve a mandarla.'), true);
    vm.runInContext('esperarVentanillaBase=async function(){ return window.AL3D_NUBE||null; }', ctx);
    ctx.window.AL3D_NUBE = nube;
    await refrescar(false);
    eq('en cuanto hay ventanilla, se traen y el letrero se va', el('s-tar-aviso').hidden, true);
    delete lsC.al3d_pf_supa;
    vm.runInContext('_tarSinBaseEs(true)', ctx);
    eq('con la hoja mandando, el letrero nunca sale', el('s-tar-aviso').hidden, true);
  }

  console.log('\nEL COTIZADOR: «REGISTRAR VENTA» CON EL V-### DE LA BASE EN EL RECIBO');
  {
    const lsC = {};
    const recibos = [], avisos = [], red = [];
    const elementos = {};
    const el = id => (elementos[id] = elementos[id] || { id, value: '', hidden: false, textContent: '', style: {}, readOnly: false, title: '',
      classList: { add() {}, remove() {}, toggle() {}, contains: c => c === 'show' }, querySelector: () => null });
    let folios = ['', '', 'V-305'];
    const ctx = vm.createContext({
      localStorage: { getItem: k => (k in lsC ? lsC[k] : null), setItem: (k, v) => { lsC[k] = String(v); }, removeItem: k => { delete lsC[k]; } },
      window: {}, parent: null, setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 2)), clearTimeout, Date, JSON, Math, console, Promise,
      document: { getElementById: el }, fetch: async u => { red.push(u); throw new Error('no'); },
      toast: (m, t) => avisos.push(m), accionesDirectas() {}, prefGet: (k, d) => d, prefSet() {}, PREF_RV_CUENTA: 'x',
      dispositivo: () => 'K7QM', getHistorial: () => JSON.parse(lsC.al3d_historial || '[]'), marcarHito() {}, voz() {},
      desgloseFinal: () => ({ sub: 10000, neto: 11600 }), subAjustado: () => 10000, totals: () => ({ sub: 10000 }), authVigente: () => true,
      fraseAjuste: () => null, precioFinal: () => 11600, money: n => '$' + n, pasoDeAnticipo: () => 50, anticipoDePct: () => 5800, avisoPasoAnticipo: () => '',
      saveState() {}, renderSummary() {}, guardarEnHistorial() {}, pintarPlazo() {}, irAPlataforma() {},
      Piezas: { opcionesDeslizantesHTML: () => '', opcionesDeslizantes: () => ({ destruir() {} }), fichaQueViaja() {}, rodarCifra() {}, estadoBoton: () => ({ reiniciar() {} }),
        palomitaHTML: () => '' },
      Q: { folio: 'COT-0002-P', iva: true, anti: 5800, antiPct: 50, proy: 'Café', cliente: 'Ana', huellaAuth: 'h', plazoK: null },
    });
    ctx.window = ctx; ctx.parent = ctx;
    vm.runInContext(venta, ctx);
    vm.runInContext('function _al3d(){ return window.AL3D||null; } function direccionPdf(){ return \'\'; } rvListo=function(t){ _recibos.push(t); }', ctx);
    ctx._recibos = recibos;
    lsC.al3d_historial = JSON.stringify([entrada('COT-0002-P', { disp: 'P4G0' })]);
    /* Con la hoja mandando: el botón de copiar se queda. */
    vm.runInContext('abrirRegistrarVenta()', ctx);
    eq('con la hoja mandando, «Copiar datos para la hoja» sigue ahí', elementos['rv-copiar'].hidden, false);
    ctx.AL3D = { folioDeVenta: async fg => { recibos.push('?' + fg); return folios.shift() || ''; } };
    lsC.al3d_pf_supa = ON; lsC.al3d_pf_supa_modo = JSON.stringify({ modo: 'base' });
    folios = [''];
    vm.runInContext('abrirRegistrarVenta()', ctx);
    eq('con la base mandando, se quita', elementos['rv-copiar'].hidden, true);
    await espera(20);
    recibos.length = 0;
    folios = ['', '', 'V-305'];
    vm.runInContext('registrarGanada()', ctx);
    for (let n = 0; n < 100 && !recibos.some(r => /V-305/.test(r)); n++) await espera(5);
    eq('registrar: la constancia va con el folio global de la cotización (de otro teléfono)', JSON.parse(lsC.al3d_pf_ganadas).map(g => g.folio + '@' + g.disp), ['COT-0002-P@P4G0']);
    eq('el recibo espera el folio de la base, pregunta por ESE folio global, y lo enseña cuando llega',
      recibos, ['Registrada como proyecto ganado — esperando su folio de la base…', '?COT-0002-P@P4G0', '?COT-0002-P@P4G0', '?COT-0002-P@P4G0', 'Venta registrada en la base — V-305']);
    cierto('y lo dice en un aviso', avisos.some(a => /V-305/.test(a)));
    eq('ni una petición a la hoja', red.length, 0);
    /* Al volver a abrir el modal de una ya vendida, su folio en el recibo. */
    recibos.length = 0;
    folios = ['V-305'];
    vm.runInContext('abrirRegistrarVenta()', ctx);
    await espera(20);
    eq('al abrir el de una ya vendida: «Ya está registrada en la base — V-305»', recibos.filter(r => r && !r.startsWith('?')), ['Ya está registrada en la base — V-305']);
    /* Suelto (sin la plataforma) no hay a quién preguntar: lo dice. */
    delete ctx.AL3D;
    recibos.length = 0;
    vm.runInContext('esperarFolioDeVenta(\'COT-0002-P@P4G0\')', ctx);
    cierto('sin la plataforma alrededor, el recibo dice dónde verlo', /se ve en la plataforma/.test(recibos[0] || ''));

    /* Auditoría 2026-10-25 · CZ-1: si la bandeja APARTÓ el alta (la base no la aceptó), el recibo dice que no entró y por qué,
       en vez de «llega solo». */
    vm.runInContext('rvNoEntro=function(t,tono){ _recibos.push((tono===\'av\'?\'AV:\':\'NO:\')+t); }', ctx);
    recibos.length = 0; avisos.length = 0;
    ctx.AL3D = { estadoDeVenta: async fg => { recibos.push('?' + fg); return { apartada: 'Este teléfono no puede dar de alta la venta en la base' }; },
      folioDeVenta: async () => '' };
    await vm.runInContext('esperarFolioDeVenta(\'COT-0002-P@P4G0\')', ctx);
    eq('una venta apartada por la bandeja: «No entró a la base» con el motivo, y no se sigue esperando',
      recibos, ['Registrada como proyecto ganado — esperando su folio de la base…', '?COT-0002-P@P4G0', 'NO:No entró a la base: Este teléfono no puede dar de alta la venta en la base']);
    cierto('y lo dice en un aviso de error', avisos.some(a => /no entró a la base/.test(a)));
    /* Con `estadoDeVenta`, el folio también llega por ahí. */
    recibos.length = 0;
    ctx.AL3D = { estadoDeVenta: async () => ({ folio: 'V-306' }) };
    await vm.runInContext('esperarFolioDeVenta(\'COT-0002-P@P4G0\')', ctx);
    eq('y cuando la base le dio su V-###, el recibo lo enseña', recibos.slice(-1), ['Venta registrada en la base — V-306']);

    /* CZ-1: Fabricación con la base mandando no deja constancia (la base no le deja dar de alta ventas) y se le dice antes. */
    ctx.identidadVerificada = () => ({ correo: 'taller@al3d.mx', rol: 'fabricacion' });
    vm.runInContext('abrirRegistrarVenta()', ctx);
    eq('Fabricación: el modal lo dice antes y el botón va apagado', [elementos['rv-base-av'].hidden, /Dirección o Pagos/.test(elementos['rv-base-av'].textContent), elementos['rv-registrar'].disabled],
      [false, true, true]);
    const antesF = lsC.al3d_pf_ganadas;
    avisos.length = 0;
    vm.runInContext('registrarGanada()', ctx);
    eq('y registrar no deja constancia (no se aparta después en la bandeja)', [lsC.al3d_pf_ganadas === antesF, avisos.some(a => /Dirección o Pagos/.test(a))], [true, true]);
    ctx.identidadVerificada = () => ({ correo: 'ana@al3d.mx', rol: 'pagos' });
    vm.runInContext('abrirRegistrarVenta()', ctx);
    eq('Pagos sí registra (0028): ni aviso ni botón apagado', [elementos['rv-base-av'].hidden, elementos['rv-registrar'].disabled], [true, false]);

    /* CZ-2: el segundo toque con OTRA cuenta no la cambia en silencio: dice qué no se cambió y a dónde ir. */
    recibos.length = 0; avisos.length = 0;
    elementos['rv-cuenta'].value = 'Constru BNT';
    vm.runInContext('registrarGanada()', ctx);
    const ganadas = JSON.parse(lsC.al3d_pf_ganadas);
    /* Desde la auditoría 2026-10-26 (T1-6), a Pagos se le dice dónde SÍ cambia la cuenta: en la ficha (en «Cobros y abonos» no está). */
    eq('con otra cuenta: no se manda nada nuevo y el recibo dice dónde se cambia la cuenta (Pagos: en la ficha del proyecto)',
      [ganadas.length, ganadas[0].cuenta, recibos.some(r => /^AV:La venta ya está en la base: la cuenta no se cambia desde aquí\. La cuenta se cambia en la ficha del proyecto, en Proyectos\.$/.test(r))],
      [1, '', true]);
    cierto('con un botón para ir a corregirla', avisos.some(a => /la cuenta no se cambia/.test(a)));
    eq('lo que cambió, sin contar lo que no se sabe de antes', vm.runInContext('rvCambiosDesde({cuenta:\'Elias BBVA\',anti:5800,estatus:null},{cuenta:\'Elias BBVA\',anti:7000,estatus:\'COBRANDO\'})', ctx),
      ['el anticipo']);

    /* ── Auditoría 2026-10-26, T1-6: «Ir a corregir» lleva a donde se corrige SIN sumar, y un segundo toque otro día no inventa cambios ── */
    const idas = [];
    const acciones = [];
    ctx.toast = (m, t, d, accion) => { avisos.push(m); acciones.push(accion || null); };
    vm.runInContext('irAPlataforma=function(r,p){ _idas.push([r,p||null]); }', ctx);
    ctx._idas = idas;
    ctx.AL3D = { estadoDeVenta: async () => ({ folio: 'V-305', datos: { cuenta: 'Constru BNT', estatus: 'COBRANDO', anti: 5800, fecha_anticipo: '2026-10-01' } }) };
    const tocar = async (rol, cambios) => {
      ctx.identidadVerificada = () => ({ correo: 'x@al3d.mx', rol });
      idas.length = 0; acciones.length = 0;
      vm.runInContext('rvYaEstabaConCambios(' + JSON.stringify(cambios) + ',\'COT-0002-P@P4G0\')', ctx);
      const a = acciones[acciones.length - 1];
      if (a && a.fn) await a.fn();
      return { texto: avisos[avisos.length - 1], boton: a ? a.label : null, ida: idas[0] || null };
    };
    let t = await tocar('pagos', ['el anticipo']);
    eq('Pagos, el anticipo: «Ir a corregir» abre «Corregir el anticipo» de ESA venta (no «Pago del cliente», que lo sumaría)',
      [t.boton, t.ida], ['Ir a corregir', ['control', { tab: 'asientos', form: 'anticipo', venta: 'V-305' }]]);
    cierto('y el aviso dice que es el anticipo total y que no se suma', /Corregir el anticipo» \(con el anticipo total: no es un pago y no se suma\)/.test(t.texto));
    t = await tocar('pagos', ['la cuenta', 'el estatus']);
    eq('Pagos, la cuenta y el estatus: a la ficha del proyecto (donde Pagos los cambia), con su V-###', [t.boton, t.ida], ['Abrir la ficha', ['proyectos', { venta: 'V-305' }]]);
    t = await tocar('pagos', ['la fecha del anticipo']);
    eq('Pagos, la fecha del anticipo: la corrige Dirección; sin botón (desde aquí no hay a dónde ir)',
      [/la fecha del anticipo la corrige Dirección, en «Datos de la venta»/i.test(t.texto), t.boton], [true, null]);
    t = await tocar('direccion', ['la cuenta', 'la fecha del anticipo']);
    eq('Dirección, la cuenta y la fecha del anticipo: a «Datos de la venta»', [t.boton, t.ida, /se corrigen en Control → Cobros y abonos → «Datos de la venta»/.test(t.texto)],
      ['Ir a corregir', ['control', { tab: 'asientos', form: 'datos', venta: 'V-305' }], true]);
    t = await tocar('direccion', ['la cuenta', 'el anticipo']);
    eq('Dirección, el anticipo y la cuenta: primero el dinero (Corregir el anticipo), y el aviso dice dónde va la cuenta', [t.ida && t.ida[1].form,
      /La venta ya está en la base: la cuenta y el anticipo no se cambian desde aquí\. El anticipo se corrige en .*; la cuenta se corrige en Control → Cobros y abonos → «Datos de la venta»\.$/.test(t.texto)],
      ['anticipo', true]);
    t = await tocar('pagos', ['la fecha de instalación']);
    eq('solo la fecha de instalación: al Calendario, como antes', [t.boton, t.ida], ['Ir al Calendario', ['agenda', null]]);

    /* Un segundo toque OTRO DÍA, sin tocar nada: el modal abre con la fecha del anticipo de HOY, el estatus FABRICACION y el anticipo de
       la cotización, y la base tiene otra fecha, COBRANDO y el anticipo que Pagos corrigió. Nada de eso lo cambió nadie. */
    ctx.identidadVerificada = () => ({ correo: 'ana@al3d.mx', rol: 'pagos' });
    ctx.AL3D = { estadoDeVenta: async () => ({ folio: 'V-305', datos: { cuenta: 'Constru BNT', estatus: 'COBRANDO', anti: 6500, fecha_anticipo: '2026-09-02' } }) };
    lsC.al3d_pf_ganadas = '[]';
    vm.runInContext('hitosDe=function(){ return { venta: 1 }; }', ctx);
    vm.runInContext('abrirRegistrarVenta()', ctx);
    elementos['rv-cuenta'].value = 'Constru BNT';
    vm.runInContext('_rvAlAbrir=rvValoresDelModal()', ctx);          // la cuenta preferida de este teléfono, la misma de la venta
    recibos.length = 0; avisos.length = 0;
    vm.runInContext('registrarGanada()', ctx);
    for (let n = 0; n < 60 && !avisos.length; n++) await espera(5);
    eq('otro día, sin tocar nada: «ya estaba registrada», sin avisos de cambios que nadie hizo, ni otra constancia',
      [avisos.some(a => /ya estaba registrada/.test(a)), recibos.some(r => /^AV:/.test(String(r))), JSON.parse(lsC.al3d_pf_ganadas).length], [true, false, 0]);
    eq('las fechas y el estatus del modal eran los de siempre (por eso eran avisos falsos)', [elementos['rv-fecha'].value !== '2026-09-02', elementos['rv-estatus'].value], [true, 'FABRICACION']);
    /* Y si esa vez sí cambia el anticipo en el modal, se dice: solo eso. */
    vm.runInContext('abrirRegistrarVenta()', ctx);
    elementos['rv-cuenta'].value = 'Constru BNT';
    vm.runInContext('_rvAlAbrir=rvValoresDelModal()', ctx);
    vm.runInContext('rvAcotar=function(){ return { anti: 7000, paso: 65, aviso: \'\' }; }', ctx);
    elementos['rv-anticipo'].value = '7000';
    recibos.length = 0; avisos.length = 0;
    vm.runInContext('registrarGanada()', ctx);
    for (let n = 0; n < 60 && !recibos.some(r => /^AV:/.test(String(r))); n++) await espera(5);
    eq('cambiar el anticipo en el modal: el aviso nombra SOLO el anticipo', recibos.filter(r => /^AV:/.test(String(r))).map(r => /^AV:La venta ya está en la base: el anticipo no se cambia desde aquí\./.test(r)),
      [true]);
    eq('lo puro: sin tocar, nada; tocado y distinto de la base, sí', [
      vm.runInContext('rvCambiosDesde({cuenta:\'A\',anti:5800,fecha_anticipo:\'2026-09-02\',estatus:\'COBRANDO\'},{cuenta:\'A\',anti:5800,fecha_anticipo:\'2026-10-26\',estatus:\'FABRICACION\'},{cuenta:\'A\',anti:5800,fecha_anticipo:\'2026-10-26\',estatus:\'FABRICACION\'})', ctx),
      vm.runInContext('rvCambiosDesde({cuenta:\'A\',estatus:\'COBRANDO\'},{cuenta:\'B\',estatus:\'LIQUIDADO\'},{cuenta:\'A\',estatus:\'FABRICACION\'})', ctx)],
      [[], ['la cuenta', 'el estatus']]);
    ctx.toast = (m, t) => avisos.push(m);
    delete ctx.identidadVerificada;
  }

  console.log('\nCON LA HOJA MANDANDO, LO DE SIEMPRE (y el código)');
  {
    const todos = [];
    const recorrer = d => { for (const f of readdirSync(join(RAIZ, d), { withFileTypes: true })) {
      if (f.isDirectory()) recorrer(d + '/' + f.name); else if (f.name.endsWith('.js')) todos.push(d + '/' + f.name); } };
    recorrer('js');
    eq('solo el enchufe importa supa-cotizaciones.js (y el enchufe solo se carga con la base mandando o la sombra)',
      todos.filter(f => /^\s*import[^;(]*supa-cotizaciones\.js/m.test(leer(f))), ['js/datos/supa-enchufe.js']);
    const tar = sinComentarios(leer('js/cotizador/tarifas.js'));
    cierto('tarifas.js: con la hoja, la ruta de siempre (`hablarHoja(\'tarifas\')`), en la rama que no es la base',
      /if\(enBase\)\{[\s\S]*?\} else \{\s*try\{ r=await hablarHoja\('tarifas',\{\},12000\); \}catch\(_\)\{ return false; \}/.test(tar));
    cierto('y el espejo solo con la base mandando', /if\(enBase\) await _tarEspejoSiHaceFalta\(/.test(tar));
    const h = sinComentarios(hist);
    cierto('historial.js: la bajada no hace nada con la hoja mandando', /function traerHistorialDeLaNube\(o\)\{\s*o=o\|\|\{\};\s*if\(!laBaseManda\(\)\) return Promise\.resolve\(0\);/.test(h));
    cierto('ni la lápida', /function _histLapida\(entry,poner\)\{\s*if\(!laBaseManda\(\)\|\|/.test(h));
    cierto('y `editado` y el aparato de la ajena solo con la base mandando', /if\(laBaseManda\(\)\)\{\s*const prev=idx>=0\?arr\[idx\]:null;/.test(h));
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(leer('cotizador.html'))[1];
    cierto('la CSP del cotizador sigue sin Supabase (la red de la base es de la plataforma)', !/supabase/.test(csp));
    cierto('el cotizador no habla con la red de la base', !/supabase\.co|\.rpc\(|createClient/.test(sinComentarios(venta) + h + tar));
    const sw = leer('sw.js');
    cierto('el service worker lleva el módulo nuevo en el conjunto versionado', sw.includes("'./js/datos/supa-cotizaciones.js'"));
    cierto('las claves nuevas no viajan en los respaldos', !/al3d_hist_nube|al3d_hist_borradas|al3d_tarifas_espejo/.test(tramo(hist, 'const RESPALDO_KEYS=', ';')));
    const S = await import('../js/nucleo/supa.js');
    cierto('y la baja de acceso las borra con lo demás', ['al3d_hist_nube', 'al3d_hist_borradas', 'al3d_pf_supa_subida', 'al3d_tarifas_espejo'].every(k => S.SE_BORRAN.includes(k)));
    const { ALMACENES_SOMBRA, VERSION_BASE } = await import('../js/datos/supa-sombra.js');
    eq('el registro vive en la base local de la sombra (versión 3)', [ALMACENES_SOMBRA.includes('cotizaciones'), VERSION_BASE], [true, 3]);
  }
} catch (e) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (e && e.stack || e));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
