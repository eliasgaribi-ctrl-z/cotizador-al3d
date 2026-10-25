// EL RELEVO DE LA BASE contra la base de verdad (paso 2 de «la base manda», docs/BASE-MANDA.md): con la empresa en modo 'base', la
// bandeja de un teléfono escribe directo en la base por js/datos/supa-relevo.js. pruebas/supabase-relevo.mjs prueba el relevo con una base
// de mentiras; aquí, que las MISMAS llamadas que arma —con el traductor de la sombra, sin folio de la hoja y quitando lo que el área no
// escribe— las acepta la base real (migraciones, RLS y funciones, en PGlite).
//
//   RE-01  una venta nueva: ganar_proyecto sin folio de la hoja, la base le da el V-### de su contador y el reintento contesta «ya existía»
//          con el MISMO folio (una sola venta)
//   RE-02  Fabricación: lo que el relevo le quita (el dinero) es justo lo que la base le negaría; lo que deja, la base lo acepta
//   RE-03  el almacén en un solo viaje, y el reintento del libro es «ya estaba»
//   RE-04  una venta de antes del cambio (la base la conoce como proy-hoja-V-###): el relevo la encuentra por su folio, con la RLS de la cuenta
//   RE-05  los gastos (paso 3, 0025): el alta y la anulación que arma el relevo las acepta la base, el reintento es «ya estaba», Fabricación ni
//          los manda; y la lectura de la fuente (sus columnas, contra la tabla de verdad) le da a Dirección y Pagos lo de la RLS, a
//          Fabricación nada, y lo que el teléfono lee es lo que se capturó
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, sql, una, conCopia, crearVenta } from '../comun/semilla.js';
import { crearRelevo } from '../../../js/datos/supa-relevo.js';
import { crearFuente } from '../../../js/datos/supa-vivo.js';
import { gastoDeBase } from '../../../js/datos/gastos.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'modo_cambiar', { p_modo: 'base' });
  return db;
}, { limpiar: db => db.close() });

/* Lo que supabase-js le daría al relevo, sobre una sesión de PGlite: `rpc` como /rpc/ de PostgREST y la única consulta que hace el relevo
   al escribir (buscar un proyecto por sus folios), con la RLS de esa cuenta. */
function clienteDe(sesion) {
  return {
    llamadas: [],
    async rpc(n, a) {
      this.llamadas.push(n);
      try { return { data: await llamar(sesion, n, a), error: null }; }
      catch (e) { return { data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }; }
    },
    from(tabla) {
      let cols = '*', ors = [], orden = '';
      const donde = [], params = [];
      const q = {
        select(c) { cols = c; return q; },
        or(f) { ors = f.split(',').map(x => { const [k] = x.split('.'); return [k, x.slice(k.length + 4)]; }); return q; },
        async limit(n) {
          const filas = await sesion.query(`select ${cols} from public.${tabla} where ${ors.map((o, i) => o[0] + ' = $' + (i + 1)).join(' or ')} limit ${n}`, ors.map(o => o[1]));
          return { data: filas.map(r => ({ ...r })), error: null };
        },
        /* Lo que pide la lectura de los gastos (`crearFuente().gastos`). Las filas salen como las da PostgREST: en JSON de Postgres (la
           fecha como «YYYY-MM-DD», los instantes como texto ISO, el monto como número). */
        eq(col, v) { params.push(v); donde.push(`${col} = $${params.length}`); return q; },
        is(col, v) { if (v === null) donde.push(`${col} is null`); return q; },
        order(col) { orden = ` order by ${col}`; return q; },
        async range(a, b) {
          const filas = await sesion.query(`select to_jsonb(x) as j from (select ${cols} from public.${tabla}${donde.length ? ' where ' + donde.join(' and ') : ''}${orden}
                                             offset ${a} limit ${b - a + 1}) x`, params);
          return { data: filas.map(r => r.j), error: null };
        },
      };
      return q;
    },
  };
}

/* El relevo de un teléfono con la sesión de `quien`: su área y sus permisos, de mi_acceso. Sin bajar (no hace falta aquí). */
async function relevoDe(db, quien) {
  const sesion = sesionDe(db, db.u[quien], { confirmar: true });
  const c = clienteDe(sesion);
  const acceso = async () => {
    const r = await llamar(sesion, 'mi_acceso', {});
    const e = (r.empresas || []).find(x => x.empresa_id === 'al3d' && x.estado === 'activo');
    return { estado: r.estado, area: e ? e.area : '', permisos: r.permisos, correo: r.usuario && r.usuario.correo, modo: r.modo };
  };
  const r = crearRelevo({ cliente: async () => c, haySesion: async () => true, acceso, lector: {}, fuente: {} });
  return { r, c, acceso };
}

/* La operación de la bandeja cuando la plataforma recoge una venta ganada en el cotizador. */
const opAlta = (id = 'proy-k7a1b2') => ({ id: 'op-' + id, almacen: 'proyectos', tipo: 'crear', registro_id: id, ts: 1792860000000,
  datos: { id, folio_global: 'COT-0061@5D93', folio_local: 'COT-0061', dispositivo: '5D93', nombre: 'Ana - Tacos El Güero', contacto: 'Ana',
    negocio: 'Tacos El Güero', sub: 10000, anti_pactado: 5800, iva: true, cuenta: 'Elias BBVA', estatus_notion: 'FABRICACION',
    fecha_ganado: '2026-10-24', tipo_trabajo: ['Letras 3D con iluminacion'], sellos: {}, notion_page_id: null } });

describir('RE-01 una venta nueva entra a la base con el V-### de la base', () => {
  prueba('sin folio de la hoja: el contador de la base; el reintento, el mismo folio y una sola venta', async () => conCopia(plantilla, async db => {
    igual((await una(db, "select modo from public.empresas where id = 'al3d'")).modo, 'base');
    const { r, c } = await relevoDe(db, 'dir');
    const [x] = await r.subir([opAlta()]);
    igual([x.ok, /^V-\d{3,7}$/.test(x.remoto && x.remoto.id_notion)], [true, true], JSON.stringify(x));
    const p = await una(db, "select id, folio_hoja, fuente from public.proyectos where folio_global = 'COT-0061@5D93'");
    igual([p.id, p.folio_hoja, p.fuente], ['proy-k7a1b2', x.remoto.id_notion, 'cotizacion'], 'con el id del teléfono y el folio que volvió');
    const [y] = await r.subir([opAlta()]);
    igual([y.ok, y.remoto && y.remoto.id_notion], [true, x.remoto.id_notion], 'el reintento: «ya existía», el mismo V-###');
    igual((await una(db, "select count(*)::int as n from public.proyectos where folio_global = 'COT-0061@5D93'")).n, 1, 'una sola venta');
    igual(c.llamadas, ['ganar_proyecto', 'ganar_proyecto']);
  }));
});

describir('RE-02 Fabricación: el relevo quita justo lo que la base le negaría', () => {
  prueba('la obra y la etapa entran; el dinero no viaja y la base no cambia', async () => conCopia(plantilla, async db => {
    const d = await relevoDe(db, 'dir');
    await d.r.subir([opAlta()]);
    const { r, c } = await relevoDe(db, 'fab');
    const op = { id: 'op-fab-1', almacen: 'proyectos', tipo: 'actualizar', registro_id: 'proy-k7a1b2', ts: 1792860100000,
      campos: ['notas', 'anti_pactado', 'etapa'],
      datos: { ...opAlta().datos, notas: 'listo para pintar', anti_pactado: 1, etapa: 'en_diseno', sellos: { notas: 1792860100000, etapa: 1792860100000 } } };
    const [x] = await r.subir([op]);
    igual([x.ok, (x.rechazadas || []).map(y => y.nombre)], [true, ['anticipo']], JSON.stringify(x));
    igual(c.llamadas, ['proyecto_actualizar', 'mover_etapa'], 'sin corregir_venta');
    const p = await una(db, "select p.notas, p.etapa, d.anticipo::float8 as anticipo from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.id = 'proy-k7a1b2'");
    igual([p.notas, p.etapa, p.anticipo], ['listo para pintar', 'en_diseno', 5800]);
    /* La contraprueba: si el relevo NO lo quitara, la base lo negaría entero. */
    igual((await llamar(sesionDe(db, db.u.fab), 'corregir_venta', { p_proyecto: 'proy-k7a1b2', p_cambios: { anticipo: 1 } })).codigo, 'ROL_SIN_PERMISO');
    const [alta] = await r.subir([opAlta('proy-otro')]);
    igual([alta.ok, alta.codigo, alta.definitivo, c.llamadas.length], [false, 'ROL_SIN_PERMISO', true, 2], 'un alta desde Fabricación ni se intenta');
  }));
});

describir('RE-03 el almacén en un solo viaje', () => {
  prueba('el libro y la lista de compra de la venta; el reintento del libro es «ya estaba»', async () => conCopia(plantilla, async db => {
    const { r, c } = await relevoDe(db, 'dir');
    await r.subir([opAlta()]);
    const mov = { id: 'op-mov-1', almacen: 'movimientos', tipo: 'apendice', registro_id: 'mov-k7-1', ts: 1792860200000,
      datos: { id: 'mov-k7-1', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, unidad_compra: 'lamina', origen: 'compra', ts: 1792860200000, sync: 0 } };
    const req = { id: 'op-req-1', almacen: 'requerimientos', tipo: 'crear', registro_id: 'proy-k7a1b2:acr-3mm', ts: 1792860200001,
      datos: { id: 'proy-k7a1b2:acr-3mm', proyecto_id: 'proy-k7a1b2', material_id: 'acr-3mm', cantidad: 2, unidad_compra: 'lamina', estado: 'calculado', sync: 0 } };
    const res = await r.subir([mov, req]);
    igual(res.map(x => [x.id, x.ok]), [['op-mov-1', true], ['op-req-1', true]], JSON.stringify(res));
    igual(c.llamadas.filter(n => n === 'almacen_aplicar').length, 1, 'un solo viaje');
    const [otra] = await r.subir([mov]);
    igual([otra.ok, otra.ya_estaba], [true, true], 'el reintento del libro');
    igual((await una(db, "select count(*)::int as n from public.almacen_movimientos where id = 'mov-k7-1'")).n, 1, 'el libro no resta dos veces');
  }));
});

describir('RE-04 una venta de antes del cambio', () => {
  prueba('la base la conoce como proy-hoja-V-###: el relevo la encuentra por su folio y la mueve', async () => conCopia(plantilla, async db => {
    await crearVenta(db, { folio: 'V-120', id: 'proy-hoja-V-120', fuente: 'cotizacion', estatus: 'FABRICACION', etapa: 'ganado' });
    const fg = (await una(db, "select folio_global from public.proyectos where id = 'proy-hoja-V-120'")).folio_global;
    const { r, c } = await relevoDe(db, 'fab');
    const op = { id: 'op-vieja', almacen: 'proyectos', tipo: 'actualizar', registro_id: 'proy-de-este-telefono', ts: 1792860300000, campos: ['etapa'],
      datos: { id: 'proy-de-este-telefono', folio_global: fg, notion_page_id: 'V-120', etapa: 'cortado', sellos: { etapa: 1792860300000 } } };
    const [x] = await r.subir([op]);
    igual(x.ok, true, JSON.stringify(x));
    igual(c.llamadas, ['mover_etapa', 'mover_etapa'], 'la primera no la encuentra; la segunda, con el id de la base');
    igual((await una(db, "select etapa from public.proyectos where id = 'proy-hoja-V-120'")).etapa, 'cortado');
    cierto((await sql(db, "select 1 from public.proyectos where id = 'proy-de-este-telefono'")).length === 0, 'no se creó otra');
  }));
});

/* Un gasto como lo deja js/datos/gastos.js en la bandeja (con las marcas de este teléfono, que no viajan). */
const gastoDelTelefono = (id, o = {}) => ({ id, fecha: '2026-10-24', concepto: 'Lámina de acrílico 3 mm', categoria: 'Material', monto: 1500, cuenta: 'Elias BBVA',
  folio: 'V-042', registro_por: 'Ana · Pagos (K7QM)', registrado_en: Date.parse('2026-10-24T17:05:00Z'), anulado: false, anulo: '', anulado_en: null, sync: 0, ...o });

describir('RE-05 los gastos, contra la base de verdad', () => {
  prueba('el alta y la anulación que arma el relevo entran; el reintento es «ya estaba»; Fabricación ni los manda', async () => conCopia(plantilla, async db => {
    const { r, c } = await relevoDe(db, 'pag');
    const alta = { id: 'op-gas-1', tipo: 'crear', almacen: 'gastos', registro_id: 'gas-k7-1', ts: 1792860400000, datos: gastoDelTelefono('gas-k7-1') };
    const [x] = await r.subir([alta]);
    igual([x.ok, x.ya_estaba], [true, false], JSON.stringify(x));
    const g = await una(db, "select concepto, monto::float8 as monto, folio, subio, procedencia ->> 'op_id' as op from public.gastos where id = 'gas-k7-1'");
    igual(g, { concepto: 'Lámina de acrílico 3 mm', monto: 1500, folio: 'V-042', subio: 'pag@al3d.test', op: 'gasto:op-gas-1' });
    const [y] = await r.subir([alta]);
    igual([y.ok, (await una(db, "select count(*)::int as n from public.gastos where id = 'gas-k7-1'")).n], [true, 1], 'el reintento no lo duplica');
    const anulo = { id: 'op-gas-2', tipo: 'actualizar', almacen: 'gastos', registro_id: 'gas-k7-1', ts: 1792860500000, campos: ['anulado', 'anulo', 'anulado_en'],
      datos: gastoDelTelefono('gas-k7-1', { anulado: true, anulo: 'Ana · Pagos (K7QM)', anulado_en: Date.parse('2026-10-25T15:00:00Z') }) };
    const [z] = await r.subir([anulo]);
    igual(z.ok, true, JSON.stringify(z));
    igual(await una(db, "select anulado, anulo from public.gastos where id = 'gas-k7-1'"), { anulado: true, anulo: 'Ana · Pagos (K7QM)' });
    igual(c.llamadas, ['gasto_registrar', 'gasto_registrar', 'gasto_anular']);
    /* La anulación de un gasto que la base no conoce (el alta se perdió en otro teléfono): entra ya anulado. */
    const [w] = await r.subir([{ ...anulo, id: 'op-gas-3', registro_id: 'gas-k7-2', datos: { ...anulo.datos, id: 'gas-k7-2' } }]);
    igual([w.ok, (await una(db, "select anulado from public.gastos where id = 'gas-k7-2'")).anulado], [true, true]);
    const f = await relevoDe(db, 'fab');
    const [v] = await f.r.subir([{ ...alta, id: 'op-gas-fab', registro_id: 'gas-fab', datos: gastoDelTelefono('gas-fab') }]);
    igual([v.ok, v.codigo, v.definitivo, f.c.llamadas.length], [false, 'ROL_SIN_PERMISO', true, 0], 'Fabricación: ni se intenta');
    igual((await llamar(sesionDe(db, db.u.fab), 'gasto_registrar', { p_op: { id: 'gas-fab' } })).codigo, 'ROL_SIN_PERMISO', 'y la base se lo negaría igual');
  }));
  prueba('la lectura de la fuente, con sus columnas contra la tabla de verdad: Dirección y Pagos ven lo de la RLS (sin lápidas), Fabricación nada', async () => conCopia(plantilla, async db => {
    const { r } = await relevoDe(db, 'dir');
    await r.subir([{ id: 'op-gas-l1', tipo: 'crear', almacen: 'gastos', registro_id: 'gas-l1', ts: 1, datos: gastoDelTelefono('gas-l1', { monto: 389.5, cuenta: '' }) }]);
    await r.subir([{ id: 'op-gas-l2', tipo: 'crear', almacen: 'gastos', registro_id: 'gas-l2', ts: 2, datos: gastoDelTelefono('gas-l2') }]);
    await sql(db, "update public.gastos set deleted_at = now() where id = 'gas-l2'");
    await sql(db, "insert into public.gastos (empresa_id, id, fecha, concepto, categoria, monto) values ('otra', 'gas-otra', '2026-10-24', 'De otra', 'Otros', 5)");
    const AREA = { dir: 'direccion', pag: 'pagos', fab: 'fabricacion' };
    const fuenteDe = quien => crearFuente({ cliente: async () => clienteDe(sesionDe(db, db.u[quien])), area: AREA[quien], empresa: 'al3d' });
    const d = await fuenteDe('dir').gastos();
    igual([d.ok, d.completa, d.gastos.map(x => x.id)], [true, true, ['gas-l1']], 'sin la lápida y sin los de otra empresa');
    const l1 = gastoDeBase(d.gastos[0]);
    igual(l1, { id: 'gas-l1', fecha: '2026-10-24', concepto: 'Lámina de acrílico 3 mm', categoria: 'Material', monto: 389.5, cuenta: '', folio: 'V-042',
      registro_por: 'Ana · Pagos (K7QM)', registrado_en: Date.parse('2026-10-24T17:05:00Z'), anulado: false, anulo: '', anulado_en: null }, 'lo que el teléfono lee es lo que se capturó');
    igual((await fuenteDe('pag').gastos()).gastos.map(x => x.id), ['gas-l1']);
    const fab = await fuenteDe('fab').gastos();
    igual([fab.ok, fab.completa, fab.gastos], [true, false, []], 'Fabricación: ni se pregunta (y no es una lectura completa: no barre nada)');
    igual((await sesionDe(db, db.u.fab).query('select count(*)::int as n from public.gastos'))[0].n, 0, 'y la RLS le daría cero filas igual');
  }));
});

await resumen();
