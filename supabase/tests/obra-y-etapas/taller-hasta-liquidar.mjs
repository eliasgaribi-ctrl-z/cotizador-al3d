// LA TABLA DEL TALLER HASTA LIQUIDAR (0029, auditoría 2026-10-26, T1-9) — lo que decidió Elías: «quiero que los proyectos que salen en
// fabricación se queden en la tabla hasta que pasen a Liquidados» y, el mismo día, «ponles un botón para ocultar» a las obras que nunca le van a
// liquidar.
//
//   TL-01  COBRANDO ya no mueve la etapa: una venta importada que pasa a cobrar sigue en su estación (Dirección y Pagos, por corregir_venta)
//   TL-02  LIQUIDADO sí la da por instalada (registrar_cobro y corregir_venta), con el sello del servidor y su línea en la bitácora
//   TL-03  Dirección oculta una obra: la columna, su sello, su línea propia en la bitácora, y el dinero intacto (estatus, saldo, comisión)
//   TL-04  Fabricación y Pagos no ocultan (la matriz): se les contesta en `rechazadas`, con el nombre del dato, y la obra no cambia
//   TL-05  la compuerta: un «mostrar» con sello viejo es `viejos`; sin sello, DATO_INVALIDO; un valor que no es sí o no, `rechazadas`
//   TL-06  volver a mostrar la regresa, con su línea «volvió a mostrarse»
//   TL-07  las tres áreas LEEN la marca (no es dinero) y la pantalla del taller no enseña la obra oculta ni su cita
//   TL-08  la auditoría sigue limpia
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { exigirAuditoriaLimpia } from '../arnes/arnes.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una, llamar, rpcT, conCopia, crearVenta } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  /* Tres ventas del libro como las deja la copia de la hoja (fuente 'hoja'), en tres estaciones, y una de la plataforma (fuente 'cotizacion'). */
  await crearVenta(db, { folio: 'V-501', etapa: 'armado', estatus: 'FABRICACION', sub: 10000, anti: 5000, cuenta: 'Constru BNT', nombre: 'Berna - Merlacsa (Rotulacion Vehicular)' });
  await crearVenta(db, { folio: 'V-502', etapa: 'listo', estatus: 'FABRICACION', sub: 8000, anti: 4000, cuenta: 'Constru BNT', nombre: 'Omar - M3 Arquitectos' });
  await crearVenta(db, { folio: 'V-503', etapa: 'en_diseno', estatus: 'FABRICACION', sub: 2000, anti: 1000, cuenta: 'Constru BNT', nombre: 'Gamaliel - Tacos Taquería' });
  await crearVenta(db, { folio: 'V-504', etapa: 'armado', estatus: 'FABRICACION', fuente: 'cotizacion', sub: 3000, anti: 0, cuenta: 'Constru BNT', nombre: 'Ana - Café' });
  await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, estado, uid_ics, ventana) values
                   ('i501', 'al3d', 'v501', interno.hoy_mx() + 3, '10:00', 'confirmada', 'inst-i501@al3d.mx', 'dia'),
                   ('i503', 'al3d', 'v503', interno.hoy_mx() + 6, null,    'confirmada', 'inst-i503@al3d.mx', 'dia')`);
  return db;
}, { limpiar: db => db.close() });

const etapa = (t, id) => t.query(`select etapa, sellos->>'etapa' as sello from public.proyectos where id = '${id}'`).then(r => r[0]);
const lineas = (t, id, acc) => t.query(`select accion, titulo, detalle, antes, despues, rol from public.bitacora where entidad_id = '${id}'${acc ? ` and accion = '${acc}'` : ''} order by id`);
const ocultar = (id, valor, sello) => ({ p_op: { id, op_id: 'op-' + id + '-' + sello, campos: { oculto_taller: valor }, sellos: { oculto_taller: sello } } });

describir('TL-01 y TL-02 la etapa por cobro: COBRANDO se queda, LIQUIDADO se instala', () => {
  prueba('TL-01 corregir_venta(estatus COBRANDO) en una venta importada en «armado» NO la mueve, sea Dirección o Pagos, y no deja línea de etapa', async () => {
    await conCopia(plantilla, async db => {
      for (const quien of ['dir', 'pag']) {
        await sql(db, `update public.proyectos set estatus = 'FABRICACION', etapa = 'armado' where id = 'v501'`);
        const y = await sesionDe(db, db.u[quien]).transaccion(async t => {
          const r = await rpcT(t, 'corregir_venta', { p_proyecto: 'v501', p_cambios: { estatus: 'COBRANDO' } });
          return { r, e: (await etapa(t, 'v501')).etapa, est: (await t.query(`select estatus from public.proyectos where id = 'v501'`))[0].estatus,
                   l: (await lineas(t, 'v501', 'etapa')).length };
        });
        igual([y.r.ok, y.est, y.e, y.l], [true, 'COBRANDO', 'armado', 0], quien);
      }
    });
  });
  prueba('TL-01b registrar_cobro SIN liquidar (un abono a la liquidación) tampoco la mueve', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `update public.proyectos set estatus = 'COBRANDO' where id = 'v502'`);
      const y = await sesionDe(db, db.u.pag).transaccion(async t => {
        const r = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v502', p_monto: 500, p_liquidar: false });
        return { r, e: (await etapa(t, 'v502')).etapa };
      });
      igual([y.r.ok, y.r.estatus, y.e], [true, 'COBRANDO', 'listo']);
    });
  });
  prueba('TL-02 LIQUIDADO sí: registrar_cobro(liquidar) y corregir_venta(LIQUIDADO) la pasan a «Instalado» con el sello del servidor y su línea «se liquidó»', async () => {
    await conCopia(plantilla, async db => {
      const antes = Date.now();
      const y = await sesionDe(db, db.u.pag).transaccion(async t => {
        await rpcT(t, 'corregir_venta', { p_proyecto: 'v501', p_cambios: { estatus: 'COBRANDO' } });
        await rpcT(t, 'registrar_cobro', { p_proyecto: 'v501', p_monto: 100, p_liquidar: true });
        await rpcT(t, 'corregir_venta', { p_proyecto: 'v502', p_cambios: { estatus: 'LIQUIDADO' } });
        return { a: await etapa(t, 'v501'), b: await etapa(t, 'v502'), l: await lineas(t, 'v501', 'etapa') };
      });
      igual([y.a.etapa, y.b.etapa], ['instalado', 'instalado']);
      cierto(Number(y.a.sello) >= antes, 'el sello de etapa es de la hora del servidor');
      igual(y.l.map(x => [x.titulo, x.detalle]), [['Berna - Merlacsa (Rotulacion Vehicular) pasó a Instalado', 'Estaba en Armado y la venta se liquidó']]);
    });
  });
  prueba('TL-02b una venta de la plataforma (fuente cotización) que se liquida sigue en su estación, como siempre', async () => {
    await conCopia(plantilla, async db => {
      const e = await sesionDe(db, db.u.dir).transaccion(async t => {
        await rpcT(t, 'registrar_cobro', { p_proyecto: 'v504', p_monto: 3480, p_liquidar: true });
        return (await etapa(t, 'v504')).etapa;
      });
      igual(e, 'armado');
    });
  });
});

describir('TL-03 a TL-06 «Ocultar del taller»', () => {
  prueba('TL-03 Dirección la oculta: queda marcada con su sello, con UNA línea «se ocultó del taller» (y ninguna de «Se editó»), y el dinero no se mueve', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `update public.proyectos set estatus = 'COBRANDO' where id = 'v501'`);
      const dinero = id => una(db, `select c_estatus, k_saldo::text as saldo, r_comision::text as comision, t_restante::text as restante from public.ventas_calculadas where proyecto_id = '${id}'`);
      const antes = await dinero('v501');
      const sello = Date.now();
      const y = await sesionDe(db, db.u.dir).transaccion(async t => {
        const r = await rpcT(t, 'proyecto_actualizar', ocultar('v501', true, sello));
        return { r, p: (await t.query(`select oculto_taller, sellos->>'oculto_taller' as sello, etapa, estatus from public.proyectos where id = 'v501'`))[0],
                 l: await lineas(t, 'v501') };
      }, { confirmar: true });
      igual([y.r.ok, y.r.escritos, y.r.rechazadas, y.r.viejos], [true, ['oculto_taller'], [], []]);
      igual([y.p.oculto_taller, Number(y.p.sello), y.p.etapa, y.p.estatus], [true, sello, 'armado', 'COBRANDO']);
      igual(y.l.map(x => [x.accion, x.titulo, x.antes, x.despues, x.rol]),
        [['ocultar', 'Berna - Merlacsa (Rotulacion Vehicular) se ocultó del taller', { oculto_taller: false }, { oculto_taller: true }, 'direccion']]);
      cierto(/No cambia el dinero/.test(y.l[0].detalle), 'la línea dice que el dinero no cambia');
      igual(await dinero('v501'), antes, 'el estatus, el saldo y la comisión, idénticos');
      igual(y.r.remoto.oculto_taller, true, 'y el teléfono la recibe en `remoto`');
    });
  });
  prueba('TL-04 Fabricación y Pagos no ocultan: el dato vuelve en `rechazadas` con su nombre y la obra no cambia', async () => {
    await conCopia(plantilla, async db => {
      for (const quien of ['fab', 'pag']) {
        const r = await llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'proyecto_actualizar', ocultar('v502', true, Date.now()));
        igual([r.ok, r.escritos, r.rechazadas.map(x => x.nombre)], [true, [], ['oculto_taller']], quien);
      }
      igual((await una(db, `select oculto_taller, sellos ? 'oculto_taller' as con_sello from public.proyectos where id = 'v502'`)), { oculto_taller: false, con_sello: false });
      igual((await sql(db, `select count(*)::int as n from public.bitacora where entidad_id = 'v502' and accion in ('ocultar', 'mostrar')`))[0].n, 0);
    });
  });
  prueba('TL-05 la compuerta: un «mostrar» con sello más viejo es `viejos` y no escribe; sin sellos, DATO_INVALIDO; «sí» en texto, `rechazadas`', async () => {
    await conCopia(plantilla, async db => {
      const D = () => sesionDe(db, db.u.dir, { confirmar: true });
      const s = Date.now();
      igual((await llamar(D(), 'proyecto_actualizar', ocultar('v503', true, s))).escritos, ['oculto_taller']);
      const v = await llamar(D(), 'proyecto_actualizar', ocultar('v503', false, s - 60_000));
      igual([v.ok, v.escritos, v.viejos.map(x => x.nombre)], [true, [], ['oculto_taller']]);
      const sin = await llamar(D(), 'proyecto_actualizar', { p_op: { id: 'v503', campos: { oculto_taller: false } } });
      igual([sin.ok, sin.codigo], [false, 'DATO_INVALIDO']);
      const texto = await llamar(D(), 'proyecto_actualizar', ocultar('v503', 'si', s + 1000));
      igual([texto.ok, texto.escritos, texto.rechazadas.map(x => [x.nombre, x.por])], [true, [], [['oculto_taller', 'ocultar del taller es sí o no']]]);
      igual((await una(db, `select oculto_taller from public.proyectos where id = 'v503'`)).oculto_taller, true, 'sigue oculta');
    });
  });
  prueba('TL-06 volver a mostrarla (sello nuevo) la regresa, con su línea «volvió a mostrarse en el taller»', async () => {
    await conCopia(plantilla, async db => {
      const D = () => sesionDe(db, db.u.dir, { confirmar: true });
      const s = Date.now();
      await llamar(D(), 'proyecto_actualizar', ocultar('v503', true, s));
      const r = await llamar(D(), 'proyecto_actualizar', ocultar('v503', false, s + 1));
      igual([r.ok, r.escritos, r.remoto.oculto_taller], [true, ['oculto_taller'], false]);
      igual((await sql(db, `select accion, titulo from public.bitacora where entidad_id = 'v503' and accion in ('ocultar', 'mostrar') order by id`)).map(x => [x.accion, x.titulo]),
        [['ocultar', 'Gamaliel - Tacos Taquería se ocultó del taller'], ['mostrar', 'Gamaliel - Tacos Taquería volvió a mostrarse en el taller']]);
    });
  });
  prueba('TL-06b junto con otro dato (las notas): las dos cosas se escriben y cada una deja su línea', async () => {
    await conCopia(plantilla, async db => {
      const s = Date.now();
      const r = await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'proyecto_actualizar',
        { p_op: { id: 'v502', campos: { oculto_taller: true, notas: 'no contesta' }, sellos: { oculto_taller: s, notas: s } } });
      igual([r.ok, [...r.escritos].sort()], [true, ['notas', 'oculto_taller']]);
      igual((await sql(db, `select accion, detalle from public.bitacora where entidad_id = 'v502' order by id`)).map(x => [x.accion, x.accion === 'cambio' ? x.detalle : '']),
        [['cambio', 'Campos: notas'], ['ocultar', '']]);
    });
  });
});

describir('TL-07 quién la ve y la pantalla del taller', () => {
  const HUELLA = c => c.repeat(64);
  const servicio = db => como(db, { rol: 'service_role', confirmar: true });
  prueba('TL-07 las tres áreas leen la marca (no es dinero), y la TV del taller ya no enseña la obra oculta ni su cita', async () => {
    await conCopia(plantilla, async db => {
      await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'proyecto_actualizar', ocultar('v501', true, Date.now()));
      for (const quien of ['dir', 'fab', 'pag']) {
        const f = await sesionDe(db, db.u[quien]).query(`select id, oculto_taller from public.proyectos where id in ('v501', 'v502') order by id`);
        igual(f, [{ id: 'v501', oculto_taller: true }, { id: 'v502', oculto_taller: false }], quien);
      }
      igual((await llamar(servicio(db), 'pantalla_solicitar', { p_secreto_hash: HUELLA('e'), p_codigo: 'TRS234' })).ok, true, 'pedir');
      igual((await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'pantalla_aprobar', { p_codigo: 'TRS234', p_nombre: 'TV' })).ok, true, 'aprobar');
      const tv = await llamar(servicio(db), 'pantalla_tablero', { p_secreto_hash: HUELLA('e') });
      igual(tv.obras.map(o => o.id).sort(), ['v502', 'v503', 'v504']);
      igual(tv.instalaciones.map(i => i.proyecto_id), ['v503']);
    });
  });
});

describir('TL-08 la aduana', () => {
  prueba('TL-08 la auditoría de seguridad no encuentra nada con 0029', async () => {
    await exigirAuditoriaLimpia(await plantilla());
  });
});

await resumen();
