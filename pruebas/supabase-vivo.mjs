/* LA LECTURA EN VIVO (fase 4, APAGADA) — js/datos/supa-vivo.js y la fuente de filas de js/datos/puente.js.
 *
 * Lo que se vigila:
 *   · que la fila que se arma con la base es la MISMA que manda la hoja: pasada por `ventaDeHoja`
 *     (el récord de Control) da los mismos números, y el relevo la trata igual;
 *   · R1, FABRICACIÓN JAMÁS RECIBE DINERO: con el área de Fabricación no se pide `ventas_calculadas`
 *     ni `almacen_costos`, no hay suscripción a `ventas_dinero`/`abonos`/`almacen_costos`, y la fila
 *     no lleva ni la llave de una columna de dinero;
 *   · que un área que la base no reconoce no lee nada;
 *   · las páginas de 500 (PostgREST trunca a 1000 sin avisar) y el libro del almacén por secuencia;
 *   · Realtime: un aviso por ráfaga y solo de las tablas del área;
 *   · y la VUELTA ATRÁS: con la fuente enchufada, `sync.jalar` no toca la red de la hoja y llena el
 *     récord desde la base; desenchufada, vuelve a bajar de la hoja y el récord vuelve a ser el de la
 *     hoja (con el Apps Script DE VERDAD de pruebas/comun/hoja-de-mentiras.mjs).
 *
 * No toca Supabase: el cliente es un doble. Se corre con pruebas/correr.sh, como todas. */

import { idbConIndices } from './comun/base-de-mentiras.mjs';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const URL_PUENTE = 'https://puente.test/exec';
const TOKEN = 'd'.repeat(40);
const ls = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'K7QM', al3d_pf_puente: JSON.stringify({ url: URL_PUENTE, token: TOKEN }) };
globalThis.window = globalThis;
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
let H = null;
const red = [];
globalThis.fetch = async (url, init) => { red.push(String(url)); return { status: 200, json: async () => H.doPost(init.body) }; };
globalThis.indexedDB = idbConIndices();
const setTimeoutReal = globalThis.setTimeout;

const Pu = await import('../js/datos/puente.js');
const V = await import('../js/datos/supa-vivo.js');
const { P } = Pu;

/* ── El doble de supabase-js ────────────────────────────────────────────────────────────── */
function clienteDoble(tablas) {
  const pedidas = [], canales = [];
  const cliente = {
    pedidas, canales,
    from(tabla) {
      pedidas.push(tabla);
      const filtros = [];
      const q = {
        select() { return q; }, order() { return q; },
        eq(c, v) { filtros.push(r => r[c] === v); return q; },
        neq(c, v) { filtros.push(r => r[c] !== v); return q; },
        is(c, v) { filtros.push(r => (r[c] ?? null) === v); return q; },
        not(c, op, v) { filtros.push(r => (r[c] ?? null) !== v); return q; },
        gt(c, v) { filtros.push(r => Number(r[c]) > Number(v)); return q; },
        range(a, b) {
          const l = (tablas[tabla] || []).filter(r => filtros.every(f => f(r)));
          return Promise.resolve({ data: l.slice(a, b + 1).map(r => ({ ...r })), error: null });
        },
      };
      return q;
    },
    channel() {
      const c = { tablas: [], on(_t, f) { c.tablas.push(f.table); return c; }, subscribe(cb) { cb('SUBSCRIBED'); return c; } };
      canales.push(c);
      return c;
    },
    removeChannel() {},
  };
  return cliente;
}

const PROY = (o = {}) => ({ id: 'proy-1', empresa_id: 'al3d', folio_hoja: 'V-900', folio_global: 'COT-0042@K7QM', nombre: 'Ana - Café',
  estatus: 'FABRICACION', iva: true, tipo_trabajo: ['Letras 3D con iluminacion'], etapa: 'cortado', fecha_anticipo: '2026-10-01',
  fecha_instalacion_hist: null, dir_texto: 'Av. Vallarta 1', lat: 20.6736, lng: -103.344, maps_url: '', tel: '33 1000 0000',
  entrega: 'paqueteria', notas: 'llamar antes', plazo_k: 3, sellos: { etapa: 5000, notas: 4000, instalacion: 3000 }, deleted_at: null, ...o });
const DIN = (o = {}) => ({ proyecto_id: 'proy-1', empresa_id: 'al3d', a_folio: 'V-900', folio_global: 'COT-0042@K7QM', d_cuenta: 'Constru BNT',
  g_subtotal: 10000, h_neto: 11600, i_anticipo: 5000, j_liquidacion: 0, k_saldo: 6600, r_comision: 1000, s_abonado: 250, t_restante: 750,
  pct_comision: 10, n_fecha_liquidacion: null, ...o });
const INST = { id: 'inst-1', empresa_id: 'al3d', proyecto_id: 'proy-1', fecha: '2026-11-02', hora: '10:00', estado: 'confirmada', deleted_at: null };

try {
  console.log('\nLA FILA DE LA BASE ES LA FILA DE LA HOJA');
  {
    const f = V.filaDeSupabase(PROY(), INST, DIN());
    const v = Pu.ventaDeHoja(f);
    eq('el récord de Control sale con los mismos números', [v.id, v.folio_hoja, v.folio_cotizacion, v.sub, v.neto, v.anticipo, v.liquidacion,
      v.pago_pendiente, v.comisiones, v.abono_comision, v.comision_restante, v.pct_comision, v.cuenta, v.estatus],
      ['hoja:V-900', 'V-900', 'COT-0042@K7QM', 10000, 11600, 5000, 0, 6600, 1000, 250, 750, 10, 'Constru BNT', 'FABRICACION']);
    eq('y la obra con los nombres de la hoja', [v.etapa, v.entrega, v.plazo_k, v.notas, v.telefono, v.fecha_instalacion, v.ubicacion],
      ['cortado', 'paqueteria', 3, 'llamar antes', '33 1000 0000', '2026-11-02', '20.6736,-103.344']);
    eq('los sellos por grupo vuelven a ser los de la columna AI', v.sellos, { etapa: 5000, notas: 4000, instalacion: 3000 });
    eq('la hora de la cita', f[P.horaInst], '10:00');
    eq('sin pin, la ubicación es el link (como la hoja)', V.filaDeSupabase(PROY({ lat: null, lng: null, maps_url: 'https://maps.app.goo.gl/x' }), null, null)[P.ubicacion], 'https://maps.app.goo.gl/x');
    eq('una lápida (sin folio de la hoja) no es fila', V.filaDeSupabase(PROY({ folio_hoja: null }), null, null), null);
    eq('una histórica lleva su fecha heredada', V.filaDeSupabase(PROY({ fecha_instalacion_hist: '2024-03-01' }), null, null)[P.fechaInst], '2024-03-01');
  }

  console.log('\nLA CITA BAJA ENTERA (auditoría 2026-10-25, CM-1)');
  {
    const BASE = { ...INST, ventana: 'noche', duracion_min: 420, estado: 'propuesta', movida: 2, uid_ics: 'inst-inst-1@al3d.mx', notas: 'subir por atrás' };
    const f = V.filaDeSupabase(PROY(), BASE, null);
    eq('la fila trae la cita de la base con su ventana, duración, estado y notas', f[Pu.CITA_DE_LA_BASE],
      { id: 'inst-1', fecha: '2026-11-02', hora: '10:00', ventana: 'noche', duracion_min: 420, estado: 'propuesta', movida: 2, uid_ics: 'inst-inst-1@al3d.mx', notas: 'subir por atrás' });
    eq('sin cita viva, la llave va en null (no se agenda la fecha histórica)', V.filaDeSupabase(PROY({ fecha_instalacion_hist: '2026-12-01' }), null, null)[Pu.CITA_DE_LA_BASE], null);
    const o = { hoy: '2026-10-25', ahora: 9000, nuevoId: () => 'inst-local', empresa: 'al3d' };
    const proy = { id: 'p-local', empresa_id: 'al3d', etapa: 'cortado', tipo_trabajo: [] };
    const nueva = Pu.citaDeHoja(f, proy, [], o);
    eq('un teléfono sin la cita la crea TAL CUAL: la propuesta sigue siendo propuesta, de noche, 420 min, con su nota',
      [nueva.id, nueva.proyecto_id, nueva.estado, nueva.ventana, nueva.duracion_min, nueva.notas, nueva.uid_ics, nueva.movida],
      ['inst-1', 'p-local', 'propuesta', 'noche', 420, 'subir por atrás', 'inst-inst-1@al3d.mx', 2]);
    const local = { id: 'inst-1', proyecto_id: 'p-local', fecha: '2026-11-02', hora: '10:00', ventana: 'dia', duracion_min: 180, estado: 'confirmada',
      movida: 3, uid_ics: 'inst-inst-1@al3d.mx', notas: '', actualizado_en: 1000 };
    const hecha = Pu.citaDeHoja(V.filaDeSupabase(PROY({ sellos: { instalacion: 5000 } }), { ...BASE, estado: 'hecha', ventana: 'dia', duracion_min: 180, notas: '' }, null), proy, [local], o);
    eq('«Ya se instaló» en otro teléfono llega como hecha (misma fecha y hora), y `movida` no baja', [hecha && hecha.estado, hecha && hecha.movida], ['hecha', 3]);
    eq('lo que ya es igual no se reescribe', Pu.citaDeHoja(V.filaDeSupabase(PROY({ sellos: { instalacion: 5000 } }),
      { ...BASE, estado: 'confirmada', ventana: 'dia', duracion_min: 180, notas: '' }, null), proy, [local], o), null);
    const cancelada = Pu.citaDeHoja(V.filaDeSupabase(PROY({ sellos: { instalacion: 5000 }, fecha_instalacion_hist: '2026-11-02' }), null, null), proy, [local], o);
    eq('la base sin cita viva y con un sello más nuevo: se cancela aquí, aunque la venta tenga fecha histórica',
      [cancelada && cancelada.estado, cancelada && cancelada.notas], ['cancelada', 'Cancelada en otro teléfono.']);
    eq('sin sello, la fecha histórica no se agenda', Pu.instalacionDeHoja(V.filaDeSupabase(PROY({ sellos: {}, fecha_instalacion_hist: '2026-12-01' }), null, null), proy, [], o), null);
    const viva = V.citasVivas([{ id: 'a', proyecto_id: 'p', fecha: '2026-09-01', estado: 'hecha', updated_at: '2026-09-02' },
      { id: 'b', proyecto_id: 'p', fecha: '2026-12-01', estado: 'confirmada', updated_at: '2026-10-20' }]);
    eq('con una hecha y una pendiente, la viva es la pendiente (no la más vieja)', viva.get('p').id, 'b');
    const hoja = Pu.instalacionDeHoja({ [P.fechaInst]: '2026-11-05', [P.horaInst]: '' }, proy, [], o);
    eq('con la hoja mandando (sin la llave), como siempre: confirmada y «Agendada desde la hoja.»', [hoja.estado, hoja.notas], ['confirmada', 'Agendada desde la hoja.']);
  }

  console.log('\nR1: FABRICACIÓN JAMÁS RECIBE DINERO');
  {
    const f = V.filaDeSupabase(PROY(), INST, null);
    eq('sin su fila de dinero, la fila no trae ni la llave de una columna de dinero', V.COLUMNAS_DE_DINERO.filter(c => c in f), []);
    eq('son las mismas once que la hoja le quita', V.COLUMNAS_DE_DINERO.length, 11);
    const v = Pu.ventaDeHoja(f);
    eq('y el récord no inventa ceros: los importes no están', ['sub', 'neto', 'anticipo', 'pago_pendiente', 'comisiones', 'cuenta'].map(k => v[k] ?? 'nada'),
      ['nada', 'nada', 'nada', 'nada', 'nada', 'nada']);

    const tablas = { proyectos: [PROY()], instalaciones: [INST], ventas_calculadas: [DIN()], almacen_costos: [{ id: 1, empresa_id: 'al3d', material_id: 'acr-3mm', importe: 999 }],
      materiales: [{ id: 'acr-3mm', empresa_id: 'al3d', nombre: 'Acrílico', sellos: {}, procedencia: {} }], requerimientos: [], almacen_movimientos: [] };
    const c = clienteDoble(tablas);
    const fu = V.crearFuente({ cliente: async () => c, area: 'fabricacion' });
    const r = await fu.filas();
    eq('aunque la base tuviera dinero a la mano, Fabricación no lo pide', c.pedidas.includes('ventas_calculadas'), false);
    eq('y sus filas no traen dinero', r.registros.flatMap(x => V.COLUMNAS_DE_DINERO.filter(k => k in x.datos)), []);
    const a = await fu.almacen();
    eq('ni los costos del almacén', [c.pedidas.includes('almacen_costos'), a.registros.some(x => 'costo_compra' in x.datos || 'costo_total' in x.datos)], [false, false]);
    eq('ni se suscribe a las tablas de dinero', V.tablasDe('fabricacion').filter(t => ['ventas_dinero', 'abonos', 'almacen_costos'].includes(t)), []);
    const cd = clienteDoble(tablas);
    const fd = V.crearFuente({ cliente: async () => cd, area: 'direccion' });
    const rd = await fd.filas();
    eq('Dirección sí los pide y los recibe', [cd.pedidas.includes('ventas_calculadas'), rd.registros[0].datos[P.subtotal]], [true, 10000]);
    eq('y su almacén trae el costo', (await fd.almacen()).registros.find(x => x.almacen === 'materiales').datos.costo_compra, 999);
    const cx = clienteDoble(tablas);
    const fx = V.crearFuente({ cliente: async () => cx, area: '' });
    eq('un área que la base no reconoce no lee NADA', [(await fx.filas()).ok, (await fx.almacen()).ok, cx.pedidas], [false, false, []]);
  }

  console.log('\nPÁGINAS Y EL LIBRO DEL ALMACÉN');
  {
    const muchos = Array.from({ length: 1234 }, (_, i) => PROY({ id: 'p' + i, folio_hoja: 'V-' + String(1000 + i), folio_global: null }));
    const c = clienteDoble({ proyectos: muchos, instalaciones: [], ventas_calculadas: [] });
    const r = await V.crearFuente({ cliente: async () => c, area: 'pagos' }).filas();
    eq('1234 proyectos en páginas de 500: llegan todos (PostgREST trunca a 1000 sin avisar)', [r.registros.length, c.pedidas.filter(t => t === 'proyectos').length], [1234, 3]);
    let marca = 0;
    const movs = [1, 2, 3].map(n => ({ id: 'mov-' + n, empresa_id: 'al3d', seq: n, material_id: 'acr-3mm', tipo: 'entrada', cantidad: 2, unidad_compra: 'lamina',
      origen: 'compra', firma: 'Ana · direccion (K7QM)', ts: n }));
    const cm = clienteDoble({ almacen_movimientos: movs, proyectos: [], materiales: [], requerimientos: [], almacen_costos: [] });
    const fa = V.crearFuente({ cliente: async () => cm, area: 'direccion', marca: { leer: () => marca, poner: v => { marca = v; } } });
    const a1 = await fa.almacen();
    eq('el libro baja con la firma como `sello` (el nombre del teléfono)', a1.registros.filter(x => x.almacen === 'movimientos').map(x => [x.datos.id, x.datos.sello]),
      [['mov-1', 'Ana · direccion (K7QM)'], ['mov-2', 'Ana · direccion (K7QM)'], ['mov-3', 'Ana · direccion (K7QM)']]);
    eq('y guarda hasta qué secuencia vio, en su PROPIA marca', marca, 3);
    eq('la siguiente vez solo lo nuevo', (await fa.almacen()).registros.filter(x => x.almacen === 'movimientos').length, 0);
  }

  console.log('\nREALTIME: AVISA, NO TRAE');
  {
    const c = clienteDoble({});
    let avisos = 0;
    const s = V.suscribir(c, 'fabricacion', () => { avisos++; }, { espera: 20 });
    eq('se suscribe solo a las tablas de su área', c.canales[0].tablas, V.tablasDe('fabricacion'));
    cierto('y queda viva', s.viva());
    const cb = c.canales[0];
    eq('Dirección también a las de dinero', V.tablasDe('direccion').filter(t => ['ventas_dinero', 'abonos', 'almacen_costos'].includes(t)).length, 3);
    /* Una ráfaga de cambios es un solo aviso. */
    const s2 = V.suscribir(clienteDoble({}), 'direccion', () => { avisos++; }, { espera: 20 });
    s.cerrar(); s2.cerrar();
    cierto('al cerrarla deja de estar viva', !s.viva() && cb);
    let n = 0;
    const c3 = clienteDoble({});
    let disparar = null;
    c3.channel = () => { const ch = { on(_t, _f, fn) { disparar = fn; return ch; }, subscribe(cb2) { cb2('SUBSCRIBED'); return ch; } }; return ch; };
    V.suscribir(c3, 'pagos', () => { n++; }, { espera: 20 });
    disparar(); disparar(); disparar();
    await new Promise(r => setTimeoutReal(r, 60));
    eq('tres cambios seguidos: un solo aviso', n, 1);
  }

  console.log('\nLA VUELTA ATRÁS: CON LA FUENTE, DE LA BASE; SIN ELLA, DE LA HOJA');
  {
    H = hojaDeMentiras({ tokens: { [TOKEN]: 'direccion' } });
    H.run('prepararHojaParaElPuente()');
    globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) >= 1000 ? 0 : setTimeoutReal(fn, ms, ...a));
    const DB = await import('../js/datos/db.js');
    const S = await import('../js/datos/sync.js');
    await DB.abrir();
    S.registrar(Pu.crear({ url: URL_PUENTE, token: TOKEN }));

    const c = clienteDoble({ proyectos: [PROY()], instalaciones: [INST], ventas_calculadas: [DIN()], materiales: [], requerimientos: [], almacen_movimientos: [], almacen_costos: [] });
    Pu.fuenteDeLectura(V.crearFuente({ cliente: async () => c, area: 'direccion' }));
    cierto('Ajustes puede decir que lee de la base', Pu.leeDeOtraFuente());
    red.length = 0;
    const j = await S.jalar();
    eq('la bajada sale bien y no le pide NADA a la hoja', [j.ok, red.length], [true, 0]);
    const v = await DB.obtener('ventas_hoja', 'hoja:V-900');
    eq('el récord de Control se llenó desde la base', [v && v.neto, v && v.pago_pendiente], [11600, 6600]);

    Pu.fuenteDeLectura(null);
    cierto('apagado, ya no', !Pu.leeDeOtraFuente());
    const j2 = await S.jalar();
    cierto('la siguiente bajada vuelve a ser de la hoja', j2.ok && red.length > 0 && red.every(u => u === URL_PUENTE));
    eq('y el récord vuelve a ser el de la hoja (que no tiene la V-900 de la base de pruebas)', await DB.obtener('ventas_hoja', 'hoja:V-900'), null);
  }
} catch (e) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (e && e.stack || e));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
