// EL HISTORIAL DEL COTIZADOR contra la base de verdad (paso 4 de «la base manda», docs/BASE-MANDA.md): con la empresa en modo 'base', la
// plataforma sube el historial de cada teléfono por js/datos/supa-cotizaciones.js (subida_unica y cotizacion_guardar) y se lo baja al
// cotizador de la tabla `cotizaciones`. pruebas/supabase-cotizador.mjs lo prueba con una base de mentiras; aquí, que las MISMAS llamadas que
// arma las acepta la base real (migraciones, RLS y funciones, en PGlite), y que lo que cada cuenta baja es lo que la RLS de 0008 le deja ver.
//
//   CO-01  Dirección: la subida única automática crea cada cotización con su folio global y su autor; la segunda vuelta no llama a nada; sin
//          registro, la base contesta «ya estaba» y no duplica; una copia de antes SIN `disp` (la subida a mano del 2026-10-24) no se pisa
//          porque dice lo mismo; un TALÓN de la copia de la hoja se llena (0021)
//   CO-02  quién gana: una corrección más nueva entra por cotizacion_guardar; una más vieja que la de la base no la pisa; los hitos se suman
//   CO-03  quién ve qué: Pagos sube lo suyo, lo de Dirección la base no se lo deja (y no se reintenta), baja SOLO lo suyo; Fabricación sube y
//          corrige lo suyo pero no ve ni una fila, y la bajada ni pregunta
//   CO-04  lo borrado en un teléfono: `deleted_at` en la base (la fila se queda) y la bajada de otro teléfono lo quita de su historial
//   CO-05  los precios con la base mandando: los tres leen la misma tabla; guardar, solo Dirección
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, sql, una, conCopia } from '../comun/semilla.js';
import { crearCotizaciones, mezclar, datosParaLaNube } from '../../../js/datos/supa-cotizaciones.js';
import { almacenEnMemoria } from '../../../js/datos/supa-sombra.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'modo_cambiar', { p_modo: 'base' });
  return db;
}, { limpiar: db => db.close() });

/* Lo que supabase-js le daría al módulo, sobre una sesión de PGlite: `rpc` como /rpc/ de PostgREST y las dos lecturas de `cotizaciones`
   (por folios, y lo que cambió después de una fecha, por páginas), con la RLS de esa cuenta y en JSON de Postgres (como PostgREST). */
function clienteDe(sesion) {
  const c = {
    llamadas: [], pedidas: 0,
    async rpc(n, a) {
      this.llamadas.push(n);
      try { return { data: await llamar(sesion, n, a), error: null }; }
      catch (e) { return { data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }; }
    },
    from(tabla) {
      c.pedidas++;
      let cols = '*', orden = '';
      const donde = [], params = [];
      const correr = async (extra = '') => {
        const filas = await sesion.query(`select to_jsonb(x) as j from (select ${cols} from public.${tabla}${donde.length ? ' where ' + donde.join(' and ') : ''}${orden}${extra}) x`, params);
        return { data: filas.map(r => r.j), error: null };
      };
      const q = {
        select(s) { cols = s; return q; },
        eq(col, v) { params.push(v); donde.push(`${col} = $${params.length}`); return q; },
        gt(col, v) { params.push(v); donde.push(`${col} > $${params.length}::timestamptz`); return q; },
        in(col, l) { params.push(l); donde.push(`${col} = any($${params.length}::text[])`); return q; },
        order(col) { orden = ` order by ${col}`; return q; },
        range(a, b) { return correr(` offset ${a} limit ${b - a + 1}`); },
        then(ok, mal) { return correr().then(ok, mal); },
      };
      return q;
    },
  };
  return c;
}

/* El módulo de un teléfono con la sesión de `quien`: su área (de mi_acceso), su aparato y su historial. */
async function telefonoDe(db, quien, disp, historial = [], o = {}) {
  const sesion = sesionDe(db, db.u[quien], { confirmar: true });
  const c = clienteDe(sesion);
  const r = await llamar(sesion, 'mi_acceso', {});
  const e = (r.empresas || []).find(x => x.empresa_id === 'al3d' && x.estado === 'activo');
  const tel = { historial, hitos: o.hitos || {}, borradas: o.borradas || [], marca: null, ahora: o.ahora || 1792900000000 };
  const k = crearCotizaciones({ cliente: async () => c, almacen: almacenEnMemoria(), area: e ? e.area : '', empresa: 'al3d', disp,
    historial: () => tel.historial, hitos: () => tel.hitos, borradas: () => tel.borradas, folioMax: () => 0, ahora: () => tel.ahora,
    subidaHecha: { leer: () => tel.marca, poner: v => { tel.marca = v; } } });
  return { k, c, tel };
}

const entrada = (folio, disp, o = {}) => ({ folio, proy: 'Proyecto ' + folio, cliente: 'Cliente ' + folio, tel: '3310000000', fecha: '20 oct 2026',
  fechaAuth: '20 oct 2026', autorizador: 'dir@al3d.test', iva: true, sub: 10000, neto: 11600, anti: 5800, huellaAuth: 'h', sello: null,
  items: [{ id: 1, tipo: 'letras', material: 'al-paint', altura: 30, n: 5, _lt: 4500 }], itemsAuth: {}, renders: [], propuesta: [],
  aiFile: { name: 'ref.jpg', type: 'image/jpeg', url: 'data:image/jpeg;base64,AAAA' }, disp, ts: 1792800000000, ...o });

const fila = (db, fg) => una(db, `select folio_global, disp, creado_por::text as por, estado, datos, hitos, deleted_at is not null as borrada
                                     from public.cotizaciones where empresa_id = 'al3d' and folio_global = $1`, [fg]);

describir('CO-01 la subida única automática, idempotente', () => {
  prueba('Dirección: crea, la segunda vuelta no llama, sin registro «ya estaba», la copia de antes sin `disp` no se pisa, el talón se llena', async () => conCopia(plantilla, async db => {
    /* Lo que ya había en la base: una cotización de la subida a mano (datos SIN `disp`) y un talón de la copia de la hoja. */
    const vieja = entrada('COT-0001-K', 'K7QM');
    const sinDisp = datosParaLaNube(vieja); delete sinDisp.disp;
    await sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, procedencia)
                   values ('al3d', 'COT-0001-K@K7QM', 'COT-0001-K', 'K7QM', $1, 'retirada', $2::jsonb, '{"subida_unica": true}')`, [db.u.dir.uid, JSON.stringify(sinDisp)]);
    await sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos, procedencia)
                   values ('al3d', 'COT-0003-K@K7QM', 'COT-0003-K', 'K7QM', 'autorizada', '{"proy":"x","cliente":"y","subtotal":10000,"items":[]}', '{"stub":"Autorizaciones"}')`);
    const h = [vieja, entrada('COT-0002-K', 'K7QM'), entrada('COT-0003-K', 'K7QM')];
    const { k, c, tel } = await telefonoDe(db, 'dir', 'K7QM', h, { hitos: { 'COT-0002-K': { pdf: 1792800001000 } } });
    const r = await k.subir();
    igual([r.motivo, r.subidas, r.ya_estaban, r.actualizadas], ['ok', 2, 1, 0], JSON.stringify(r));
    igual(c.llamadas, ['subida_unica'], 'una sola llamada: la copia sin disp dice lo mismo y no se escribe');
    const f2 = await fila(db, 'COT-0002-K@K7QM');
    igual([f2.por, f2.datos.aiFile, f2.hitos.pdf], [db.u.dir.uid, { name: 'ref.jpg', type: 'image/jpeg' }, 1792800001000], 'con su autor, sin la imagen, con sus hitos');
    igual((await fila(db, 'COT-0001-K@K7QM')).datos.disp, undefined, 'la de antes no se tocó');
    const t = await una(db, `select datos ->> 'folio' as folio, procedencia ? 'talon' as talon from public.cotizaciones where folio_global = 'COT-0003-K@K7QM'`);
    igual([t.folio, t.talon], ['COT-0003-K', true], 'el talón se llenó con la cotización del aparato (0021)');
    cierto(!!tel.marca, 'la marca de la subida única');
    c.llamadas.length = 0;
    igual([(await k.subir()).motivo, c.llamadas], ['nada', []], 'la segunda vuelta no llama a nada');
    const otro = await telefonoDe(db, 'dir', 'K7QM', h);
    const r2 = await otro.k.subir();
    igual([r2.subidas, (await una(db, `select count(*)::int as n from public.cotizaciones where empresa_id = 'al3d'`)).n], [0, 3], 'sin registro: «ya estaba», y no hay dos');
  }));
});

describir('CO-02 quién gana', () => {
  prueba('lo más nuevo entra por cotizacion_guardar; lo más viejo no pisa; los hitos se suman', async () => conCopia(plantilla, async db => {
    const e = entrada('COT-0010-K', 'K7QM');
    const { k, c, tel } = await telefonoDe(db, 'dir', 'K7QM', [e]);
    await k.subir();
    tel.historial = [{ ...e, anti: 7000, editado: 1792900000000 }];
    c.llamadas.length = 0;
    const r = await k.subir();
    igual([r.actualizadas, c.llamadas], [1, ['cotizacion_guardar']]);
    igual((await fila(db, 'COT-0010-K@K7QM')).datos.anti, 7000, 'la base tiene la corrección');
    /* Otro teléfono (Dirección también) la corrige después; este trae una edición más vieja. */
    const otro = await telefonoDe(db, 'dir2', 'D2D2', [{ ...e, anti: 9999, editado: 1792900500000 }]);
    const ro = await otro.k.subir();
    igual([ro.actualizadas], [1], 'el otro teléfono, más nuevo, sí la cambia');
    tel.historial = [{ ...e, anti: 1, editado: 1792900100000 }];
    const r2 = await k.subir();
    igual([r2.actualizadas, r2.esperan, (await fila(db, 'COT-0010-K@K7QM')).datos.anti], [0, 1, 9999], 'la más vieja no pisa');
    tel.historial = [{ ...e, anti: 7000, editado: 1792900000000 }];
    tel.hitos = { 'COT-0010-K': { wa: 1792900200000 } };
    await k.subir();
    const b = await k.bajar('');
    const m = mezclar({ historial: tel.historial, hitos: tel.hitos }, b.filas, 'K7QM');
    igual([m.historial[0].anti, m.historial[0].aiFile.url], [9999, 'data:image/jpeg;base64,AAAA'], 'la bajada trae la más nueva y conserva la imagen de aquí');
    igual((await fila(db, 'COT-0010-K@K7QM')).hitos.wa, 1792900200000, 'los hitos se suman en la base');
  }));
});

describir('CO-03 quién ve qué', () => {
  prueba('Pagos lo suyo; Fabricación escribe lo suyo y no ve nada', async () => conCopia(plantilla, async db => {
    const dir = await telefonoDe(db, 'dir', 'K7QM', [entrada('COT-0020-K', 'K7QM')]);
    await dir.k.subir();
    const pag = await telefonoDe(db, 'pag', 'P4G0', [entrada('COT-0001-P', 'P4G0'), entrada('COT-0020-K', 'K7QM', { anti: 1 })]);
    const rp = await pag.k.subir();
    igual([rp.subidas, rp.ajenas], [1, 1], 'lo de Dirección la base no se lo deja: se aparta como ajeno');
    pag.c.llamadas.length = 0;
    igual([(await pag.k.subir()).motivo, pag.c.llamadas], ['nada', []], 'y no se reintenta');
    const bp = await pag.k.bajar('');
    igual(bp.filas.map(f => f.folio_global), ['COT-0001-P@P4G0'], 'Pagos baja SOLO las suyas');
    const bd = await dir.k.bajar('');
    igual(bd.filas.map(f => f.folio_global).sort(), ['COT-0001-P@P4G0', 'COT-0020-K@K7QM'], 'Dirección, todas');
    const fab = await telefonoDe(db, 'fab', 'F4B0', [entrada('COT-0001-F', 'F4B0')]);
    const rf = await fab.k.subir();
    igual([rf.subidas, (await fila(db, 'COT-0001-F@F4B0')).por], [1, db.u.fab.uid], 'Fabricación sube lo suyo');
    fab.tel.historial = [{ ...fab.tel.historial[0], anti: 2, editado: 1792900000000 }];
    const rf2 = await fab.k.subir();
    igual([rf2.actualizadas, (await fila(db, 'COT-0001-F@F4B0')).datos.anti, fab.c.pedidas], [1, 2, 0], 'y lo corrige sin leer ni una fila');
    const n = (await sesionDe(db, db.u.fab).query('select count(*)::int as n from public.cotizaciones'))[0].n;
    igual(n, 0, 'Fabricación no ve ni una fila (llevan precios)');
    const bf = await fab.k.bajar('');
    igual([bf.ok, bf.codigo, fab.c.pedidas], [false, 'ROL_SIN_PERMISO', 0], 'y la bajada ni pregunta');
  }));
});

describir('CO-04 lo borrado en un teléfono', () => {
  prueba('pasada la ventana de «Deshacer»: deleted_at en la base, la fila se queda, y la bajada de otro teléfono lo quita', async () => conCopia(plantilla, async db => {
    const e = entrada('COT-0030-K', 'K7QM');
    const a = await telefonoDe(db, 'dir', 'K7QM', [e]);
    await a.k.subir();
    a.tel.historial = [];
    a.tel.borradas = [{ clave: 'COT-0030-K@K7QM', ts: a.tel.ahora - 20000 }];
    const r = await a.k.subir();
    igual([r.borradas, (await fila(db, 'COT-0030-K@K7QM')).borrada], [1, true]);
    const b = await telefonoDe(db, 'dir2', 'D2D2', [e]);
    const baja = await b.k.bajar('');
    const m = mezclar({ historial: [e], hitos: {} }, baja.filas, 'D2D2');
    igual([m.quitadas, m.historial.length], [1, 0], 'el otro teléfono la quita de su historial');
  }));
});

describir('CO-05 los precios con la base mandando', () => {
  prueba('los tres leen la misma tabla; guardar, solo Dirección', async () => conCopia(plantilla, async db => {
    const D = sesionDe(db, db.u.dir, { confirmar: true });
    const t = await llamar(D, 'tarifas_leer', {});
    const filas = t.tabla.filas.map(f => ({ grupo: f.grupo, clave: f.clave, nombre: f.nombre, precio: f.clave === 'al-paint' ? 33 : Number(f.precio), como: f.como, visible: f.visible }));
    const g = await llamar(D, 'tarifas_guardar', { p_filas: filas });
    igual([g.ok, g.cambios > 0], [true, true]);
    for (const quien of ['pag', 'fab']) {
      const l = await llamar(sesionDe(db, db.u[quien]), 'tarifas_leer', {});
      igual(Number(l.tabla.filas.find(f => f.clave === 'al-paint').precio), 33, quien + ' lee el precio que guardó Dirección');
      igual((await llamar(sesionDe(db, db.u[quien]), 'tarifas_guardar', { p_filas: filas })).codigo, 'ROL_SIN_PERMISO', quien + ' no guarda');
    }
  }));
});

await resumen();
