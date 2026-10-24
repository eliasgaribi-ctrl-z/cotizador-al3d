// La SOMBRA y la COPIA DIARIA juntas (2026-10-24): una venta que la sombra da de alta no debe chocar con la copia de la madrugada, y la
// lectura en vivo debe leer lo mismo que la hoja. Lo encontró la primera prueba de la lectura en vivo contra la base real.
//
//   CS-01  la sombra da de alta la venta con el id de la copia (`proy-hoja-V-###`) y la copia la respeta como «de cotización»: se aplica,
//          cuadra y sin conflictos, dos días seguidos
//   CS-02  la contraprueba: con el id del teléfono (como antes), la copia lo anota como conflicto y el día no cuadra
//   CS-03  lo que la hoja tenía vacío (anticipo, liquidación, la etapa de una viva) la copia lo dice, y la lectura en vivo lo regresa vacío
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, sql, una, conCopia } from '../comun/semilla.js';
import { volcado, filaVentas, dia } from '../comun/hoja-de-mentiras.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { copiar } from '../../functions/importar-diario/copia.js';
import { traducir } from '../../../js/datos/supa-sombra.js';
import { filaDeSupabase } from '../../../js/datos/supa-vivo.js';
import { ventaDeHoja } from '../../../js/datos/puente.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const basePGlite = db => ({ transaccion: fn => db.transaction(tx => fn({ ejecutar: t => tx.exec(t), consultar: async (t, p) => (await tx.query(t, p)).rows })) });
let reloj = 0;
const copia = async (db, v) => copiar({ base: basePGlite(db), plan: await planear({ volcado: v }), volcado: v, ahora: () => (reloj += 5), inicio: reloj });

/* La operación de la bandeja cuando la plataforma recoge la venta ganada en el cotizador (la «crear» de `proyectos`). */
const opCrear = (id = 'proy-k7a1b2') => ({ id: 'op-' + id, almacen: 'proyectos', tipo: 'crear', registro_id: id, ts: 1792860000000,
  datos: { id, folio_global: 'COT-0061@5D93', folio_local: 'COT-0061', dispositivo: '5D93', nombre: 'Ana - Tacos El Güero', contacto: 'Ana',
    negocio: 'Tacos El Güero', sub: 10000, anti_pactado: 5800, iva: true, cuenta: 'Elias BBVA', estatus_notion: 'FABRICACION',
    fecha_ganado: '2026-10-24', tipo_trabajo: ['Letras 3D con iluminacion'], sellos: {} } });
/* Su renglón en la hoja, con el V-### que la hoja le dio y su folio de cotización en Y. */
const filaDeLaVenta = (extra = {}) => filaVentas({ celdas: { A: 'V-500', B: 'Ana - Tacos El Güero', C: 'FABRICACION', D: 'Elias BBVA',
  E: 'Letras 3D con iluminacion', F: 'Sí', G: 10000, I: 5800, J: '', L: dia('2026-10-24'), Y: 'COT-0061@5D93', ...extra } });
const ganar = (db, op, folioHoja) => llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'ganar_proyecto', traducir(op, { folio_hoja: folioHoja }).llamadas[0].args);

describir('CS-01 una venta de la sombra y la copia de la madrugada no chocan', () => {
  prueba('la sombra la da de alta con el id de la copia; la copia se aplica, cuadra y la deja «de cotización», dos días seguidos', async () => conCopia(plantilla, async db => {
    const tr = traducir(opCrear(), { folio_hoja: 'V-500' });
    igual([tr.llamadas[0].args.p_op.id, tr.llamadas[0].idLocal, tr.llamadas[0].args.p_op.folio_hoja], ['proy-hoja-V-500', 'proy-k7a1b2', 'V-500']);
    igual((await ganar(db, opCrear(), 'V-500')).ok, true);
    const v = volcado({ ventas: [filaDeLaVenta()] });
    for (const dia of [1, 2]) {
      const r = await copia(db, v);
      igual([r.aplicado, r.cuadra, r.conflictos, r.diferencias], [true, true, 0, 0], 'día ' + dia);
    }
    const p = await una(db, `select id, fuente, dispositivo, folio_global, historica from public.proyectos where folio_hoja = 'V-500'`);
    igual([p.id, p.fuente, p.dispositivo, p.folio_global, p.historica], ['proy-hoja-V-500', 'cotizacion', '5D93', 'COT-0061@5D93', false]);
    igual((await una(db, `select count(*)::int as n from public.proyectos`)).n, 1, 'una sola venta, no dos');
  }));
  prueba('si la copia llegó primero, el alta de la sombra es «ya estaba» y nada choca', async () => conCopia(plantilla, async db => {
    const v = volcado({ ventas: [filaDeLaVenta()] });
    igual((await copia(db, v)).cuadra, true);
    const r = await ganar(db, opCrear(), 'V-500');
    cierto(r.ok === true || r.codigo === 'DUPLICADO', JSON.stringify(r));
    igual([(await copia(db, v)).cuadra, (await una(db, `select count(*)::int as n from public.proyectos`)).n], [true, 1]);
  }));
});

describir('CS-02 la contraprueba: con el id del teléfono, la copia choca', () => {
  prueba('ganar_proyecto con el id del teléfono → la copia lo anota como conflicto y el día no cuadra (lo que pasaba antes)', async () => conCopia(plantilla, async db => {
    const p = traducir(opCrear(), { folio_hoja: 'V-500' }).llamadas[0].args.p_op;
    igual((await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'ganar_proyecto', { p_op: { ...p, id: 'proy-k7a1b2' } })).ok, true);
    const r = await copia(db, volcado({ ventas: [filaDeLaVenta()] }));
    igual([r.cuadra, r.conflictos > 0], [false, true]);
  }));
});

describir('CS-03 lo vacío en la hoja se lee vacío desde la base', () => {
  prueba('anticipo y liquidación vacíos y una viva sin etapa: la copia lo dice y la lectura en vivo arma la misma venta que la hoja', async () => conCopia(plantilla, async db => {
    const filas = [
      filaVentas({ celdas: { A: 'V-510', B: 'Beto - Sin anticipo', C: 'FABRICACION', D: 'Elias BBVA', F: 'No', G: 3000, I: '', J: '', L: dia('2026-10-20') } }),
      filaVentas({ celdas: { A: 'V-511', B: 'Caro - Con etapa', C: 'FABRICACION', D: 'Elias BBVA', F: 'No', G: 4000, I: 2000, J: '', L: dia('2026-10-21'), Z: 'Cortado' } }),
      filaVentas({ celdas: { A: 'V-512', B: 'Dani - Cero de verdad', C: 'COBRANDO', D: 'Elias BBVA', F: 'No', G: 5000, I: 0, J: 0, L: dia('2026-10-22') } }),
    ];
    const r = await copia(db, volcado({ ventas: filas }));
    igual([r.aplicado, r.cuadra], [true, true]);
    const proc = await sql(db, `select p.folio_hoja, p.etapa, p.procedencia -> 'etapa_vacia' as etapa_vacia, d.procedencia -> 'vacias' as vacias
                                  from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id order by 1`);
    igual(proc.map(x => [x.folio_hoja, x.etapa, x.etapa_vacia, x.vacias]),
      [['V-510', 'ganado', true, ['I', 'J']], ['V-511', 'cortado', null, ['J']], ['V-512', null, null, null]],
      'V-512 (COBRANDO sin folio de cotización) es histórica: sin etapa en los dos lados, y sus ceros son ceros');
    /* La lectura en vivo, con lo que daría PostgREST (las mismas columnas que pide supa-vivo.js), contra lo que daría la hoja. */
    const ps = await sql(db, `select id, folio_hoja, folio_global, nombre, estatus, iva, tipo_trabajo, etapa, fecha_anticipo::text, fecha_instalacion_hist::text,
                                     dir_texto, lat, lng, maps_url, tel, entrega, notas, plazo_k, sellos, procedencia -> 'etapa_vacia' as etapa_vacia
                                from public.proyectos order by folio_hoja`);
    const din = await sql(db, `select c.proyecto_id, c.d_cuenta, c.g_subtotal::float8, c.h_neto::float8, c.i_anticipo::float8, c.j_liquidacion::float8, c.k_saldo::float8,
                                      c.r_comision::float8, c.s_abonado::float8, c.t_restante::float8, c.pct_comision::float8, c.n_fecha_liquidacion::text,
                                      d.procedencia -> 'vacias' as vacias
                                 from public.ventas_calculadas c join public.ventas_dinero d on d.proyecto_id = c.proyecto_id`);
    const porId = new Map(din.map(x => [x.proyecto_id, x]));
    const leidas = ps.map(p => ventaDeHoja(filaDeSupabase(p, null, porId.get(p.id))));
    igual(leidas.map(v => [v.folio_hoja, v.anticipo, v.liquidacion, v.etapa]),
      [['V-510', null, null, null], ['V-511', 2000, null, 'cortado'], ['V-512', 0, 0, null]]);
    /* Si después se captura (el día del cambio, en la base), el número ya no es 0 y se enseña aunque la hoja lo tuviera vacío. */
    await sql(db, `update public.ventas_dinero set anticipo = 1500 where proyecto_id = 'proy-hoja-V-510'`);
    const d510 = (await sql(db, `select c.i_anticipo::float8, d.procedencia -> 'vacias' as vacias from public.ventas_calculadas c join public.ventas_dinero d on d.proyecto_id = c.proyecto_id where c.proyecto_id = 'proy-hoja-V-510'`))[0];
    igual(ventaDeHoja(filaDeSupabase(ps[0], null, d510)).anticipo, 1500);
  }));
});

await resumen();
