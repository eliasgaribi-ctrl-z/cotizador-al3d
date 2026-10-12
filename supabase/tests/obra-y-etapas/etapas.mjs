// La etapa por rol, las salidas de material del corte y las dos transiciones automáticas (R5, Q-05) — A.md §5.6 y §10.6, casos ET-01..ET-24.
//
//   · Dirección mueve cualquier etapa a cualquier etapa; Fabricación solo dentro de «ganado…listo» en origen Y destino; Pagos, ninguna;
//   · al ALCANZAR el corte (cortado o más) salen del almacén los materiales del proyecto, una vez, con id determinista `mov-salida:<req.id>`;
//   · instalación `hecha` ⇒ `instalado` (solo si la marca Dirección) y cobro ⇒ `instalado` (solo en filas importadas).
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, rpcT, una, sql, conCopia } from '../comun/semilla.js';

const ETAPAS = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo', 'instalado', 'garantia', 'cancelado'];
const TALLER = ETAPAS.slice(0, 5);
const AHORA = () => Date.now();

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  await sembrarMateriales(db);
  return db;
}, { limpiar: db => db.close() });

/** Más proyectos y listas de compra para los casos de salidas; todo como superusuario. */
async function sembrarMateriales(db) {
  const proy = (id, folio, etapa, fuente = 'hoja', extra = '') => sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, fuente, nombre, etapa, estatus ${extra ? ', ' + extra.split('=')[0] : ''})
      values ('${id}', 'al3d', '${folio}', '${folio}', '${fuente}', 'Proyecto ${id}', '${etapa}', 'FABRICACION' ${extra ? ', ' + extra.split('=')[1] : ''})`);
  const req = (proyecto, material, cant, estado = 'calculado', ajustada = null) => sql(db,
    `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, cantidad_ajustada, unidad_compra, estado) values ('al3d', $1, $2, $3, $4, $5, 'unidad', $6)`,
    [`${proyecto}:${material}`, proyecto, material, cant, ajustada, estado]);
  await proy('e7', 'V-107', 'ganado');            // ET-07, ET-09: tres requerimientos (dos con cantidad, uno en cero)
  await req('e7', 'acr-3mm', 2); await req('e7', 'led-12v', 5); await req('e7', 'pegamento', 0);
  await proy('e8', 'V-108', 'ganado');            // ET-08
  await req('e8', 'acr-3mm', 1);
  await proy('e10', 'V-110', 'ganado');           // ET-10: la salida ya la emitió otro teléfono
  await req('e10', 'led-12v', 3);
  await sql(db, `insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts, proyecto_id, requerimiento_id)
                 values ('al3d', 'mov-salida:e10:led-12v', 'led-12v', 'salida', -3, 'unidad', 'manual', 5000, 'e10', 'e10:led-12v')`);
  await proy('e11', 'V-111', 'ganado');           // ET-11: la corrección manda
  await req('e11', 'acr-3mm', 5, 'calculado', 3);
  await proy('e12c', 'V-112', 'cancelado');       // ET-12: desde cancelado y desde garantia
  await req('e12c', 'acr-3mm', 2);
  await proy('e12g', 'V-113', 'garantia');
  await req('e12g', 'acr-3mm', 4);
  await proy('e13', 'V-114', 'ganado');           // ET-13: descartado no se emite
  await req('e13', 'acr-3mm', 2, 'descartado'); await req('e13', 'led-12v', 1);
  await proy('e23', 'V-123', 'armado');           // ET-23: cancelar no emite
  await req('e23', 'acr-3mm', 2);
}

const movs = (t, filtro = 'true') => t.query(`select id, cantidad::text as cantidad, origen, tipo, proyecto_id, requerimiento_id, usuario, rol, dispositivo, firma from public.almacen_movimientos where ${filtro} order by id`);
const estadoReq = async t => Object.fromEntries((await t.query(`select id, estado from public.requerimientos`)).map(r => [r.id, r.estado]));

describir('ET-01 a ET-05 la tabla de permisos: Dirección, Fabricación y Pagos', () => {
  prueba('ET-01 Dirección: las 8 × 8 transiciones (incluye cancelado → cualquiera y cualquiera → cancelado) se permiten', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    let n = 0;
    for (const o of ETAPAS) {
      await sql(db, `update public.proyectos set etapa = '${o}', sellos = '{}' where id = 'p4'`);
      for (const d of ETAPAS) {
        const r = (await D.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: d, p_sello: AHORA() }))[0].mover_etapa;
        igual(r.ok, true, `${o} → ${d}: ${JSON.stringify(r)}`);
        igual(!!r.sin_cambio, o === d, `${o} → ${d}`);
        n++;
      }
    }
    igual(n, 64);
    await sql(db, `update public.proyectos set etapa = 'ganado', sellos = '{}' where id = 'p4'`);
  });
  prueba('ET-02 Fabricación: las 25 transiciones dentro de ganado…listo (incluso retroceder) se permiten', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    let n = 0;
    for (const o of TALLER) {
      await sql(db, `update public.proyectos set etapa = '${o}', sellos = '{}' where id = 'p4'`);
      for (const d of TALLER) { igual((await F.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: d, p_sello: AHORA() }))[0].mover_etapa.ok, true, `${o} → ${d}`); n++; }
    }
    igual(n, 25);
    await sql(db, `update public.proyectos set etapa = 'ganado', sellos = '{}' where id = 'p4'`);
  });
  prueba('ET-03 Fabricación: desde ganado…listo hacia instalado, garantia o cancelado → ROL_SIN_PERMISO (definitivo)', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    for (const o of TALLER) {
      await sql(db, `update public.proyectos set etapa = '${o}', sellos = '{}' where id = 'p4'`);
      for (const d of ['instalado', 'garantia', 'cancelado']) {
        const r = (await F.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: d, p_sello: AHORA() }))[0].mover_etapa;
        igual([r.ok, r.codigo, r.definitivo], [false, 'ROL_SIN_PERMISO', true], `${o} → ${d}`);
      }
    }
    await sql(db, `update public.proyectos set etapa = 'ganado', sellos = '{}' where id = 'p4'`);
  });
  prueba('ET-04 Fabricación: desde instalado, garantia o cancelado hacia CUALQUIERA → ROL_SIN_PERMISO (endurece: hoy solo mira el destino)', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    for (const o of ['instalado', 'garantia', 'cancelado']) {
      await sql(db, `update public.proyectos set etapa = '${o}', sellos = '{}' where id = 'p4'`);
      for (const d of ETAPAS) {
        const r = (await F.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: d, p_sello: AHORA() }))[0].mover_etapa;
        igual([r.ok, r.codigo], [false, 'ROL_SIN_PERMISO'], `${o} → ${d}`);
      }
    }
    await sql(db, `update public.proyectos set etapa = 'ganado', sellos = '{}' where id = 'p4'`);
  });
  prueba('ET-05 Pagos: cualquier movimiento → ROL_SIN_PERMISO', async () => {
    const db = await plantilla(), P = sesionDe(db, db.u.pag);
    for (const d of ETAPAS) igual((await P.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: d, p_sello: AHORA() }))[0].mover_etapa.codigo, 'ROL_SIN_PERMISO', d);
  });
  prueba('el permiso se decide antes de leer nada: un proyecto inexistente da el MISMO ROL_SIN_PERMISO a Pagos; y a Fabricación NO_ENCONTRADO (puede mover)', async () => {
    const db = await plantilla();
    igual((await sesionDe(db, db.u.pag).rpc('mover_etapa', { p_proyecto: 'no-existe', p_etapa: 'armado', p_sello: 1 }))[0].mover_etapa.codigo, 'ROL_SIN_PERMISO');
    igual((await sesionDe(db, db.u.fab).rpc('mover_etapa', { p_proyecto: 'no-existe', p_etapa: 'armado', p_sello: 1 }))[0].mover_etapa.codigo, 'NO_ENCONTRADO');
    igual((await sesionDe(db, db.u.dir).rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: 'terminado', p_sello: 1 }))[0].mover_etapa.codigo, 'DATO_INVALIDO');
  });
  prueba('una fila histórica no es una tarjeta de obra: DATO_INVALIDO (no hay etapa de la que mover)', async () => {
    const db = await plantilla();
    const r = (await sesionDe(db, db.u.dir).rpc('mover_etapa', { p_proyecto: 'p6', p_etapa: 'armado', p_sello: AHORA() }))[0].mover_etapa;
    igual([r.ok, r.codigo], [false, 'DATO_INVALIDO']);
  });
});

describir('ET-06 y ET-22 el doble toque y el sello obligatorio', () => {
  prueba('ET-06 la misma etapa: sin_cambio, sin escritura y sin bitácora', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const antes = { u: (await t.query(`select updated_at::text as u from public.proyectos where id = 'p4'`))[0].u, b: (await t.query(`select count(*)::int as n from public.bitacora`))[0].n };
      const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'ganado', p_sello: AHORA() });
      const despues = { u: (await t.query(`select updated_at::text as u from public.proyectos where id = 'p4'`))[0].u, b: (await t.query(`select count(*)::int as n from public.bitacora`))[0].n };
      return { r, antes, despues };
    });
    igual(x.r, { ok: true, sin_cambio: true });
    igual(x.despues, x.antes);
  });
  prueba('ET-22 mover_etapa sin p_sello → DATO_INVALIDO (Q-A05); el doble toque sin sello sí es sin_cambio', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    const r = (await D.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: 'armado' }))[0].mover_etapa;
    igual([r.ok, r.codigo, r.definitivo], [false, 'DATO_INVALIDO', true]);
    igual((await D.rpc('mover_etapa', { p_proyecto: 'p4', p_etapa: 'ganado' }))[0].mover_etapa.sin_cambio, true);
  });
  prueba('un cambio más viejo que el sello guardado no pisa: ok con «viejos» y el remoto vigente', async () => {
    const db = await plantilla();
    const r = (await sesionDe(db, db.u.dir).rpc('mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: 50 }))[0].mover_etapa;
    igual([r.ok, r.viejos.map(v => v.nombre), r.remoto.etapa], [true, ['etapa'], 'cortado']);
  });
  prueba('la respuesta trae remoto SIN dinero; mover_etapa anota en la bitácora general «pasó a / regresó a»', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const a = await rpcT(t, 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'armado', p_sello: AHORA() });
      const b = await rpcT(t, 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'en_diseno', p_sello: AHORA() + 1 });
      return { a, b, bit: await t.query(`select nivel, titulo, antes, despues from public.bitacora where entidad_id = 'p4' and accion = 'etapa' order by id`) };
    });
    for (const k of ['subtotal', 'anticipo', 'liquidacion', 'cuenta', 'neto', 'saldo']) cierto(!(k in x.a.remoto), k);
    igual(x.bit.map(b => [b.nivel, b.titulo, b.antes.etapa, b.despues.etapa]),
          [['general', 'Mario - Cafe pasó a Armado', 'ganado', 'armado'], ['general', 'Mario - Cafe regresó a En diseño', 'armado', 'en_diseno']]);
  });
});

describir('ET-07 a ET-13 las salidas de material del corte', () => {
  prueba('ET-07 ganado → cortado con 3 requerimientos (2 con cantidad, 1 en cero): 2 salidas con cantidad NEGATIVA, consumidos; la línea en cero queda calculada', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'e7', p_etapa: 'cortado', p_sello: AHORA(), p_motivo: 'Corte listo' });
      return { r, m: await movs(t, `proyecto_id = 'e7'`), req: await estadoReq(t) };
    });
    igual([x.r.ok, x.r.salidas], [true, 2]);
    igual(x.m.map(m => [m.id, m.cantidad, m.tipo, m.origen]), [['mov-salida:e7:acr-3mm', '-2', 'salida', 'manual'], ['mov-salida:e7:led-12v', '-5', 'salida', 'manual']]);
    igual([x.req['e7:acr-3mm'], x.req['e7:led-12v'], x.req['e7:pegamento']], ['consumido', 'consumido', 'calculado']);
    igual([x.m[0].usuario, x.m[0].rol, x.m[0].dispositivo, x.m[0].firma], ['dir@al3d.test', 'direccion', 'srv', 'dir@al3d.test · direccion (srv)']);
  });
  prueba('ET-08 Fabricación ganado → listo (se salta «cortado»): emite (ALCANZAR, no tocar)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.fab).transaccion(async t => {
      const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'e8', p_etapa: 'listo', p_sello: AHORA() });
      return { r, m: await movs(t, `proyecto_id = 'e8'`) };
    });
    igual([x.r.salidas, x.m.length, x.m[0].rol], [1, 1, 'fabricacion']);
  });
  prueba('ET-09 volver a ganado y cruzar otra vez no emite ni duplica (los requerimientos ya están consumidos)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const a = await rpcT(t, 'mover_etapa', { p_proyecto: 'e7', p_etapa: 'cortado', p_sello: AHORA() });
      const b = await rpcT(t, 'mover_etapa', { p_proyecto: 'e7', p_etapa: 'ganado', p_sello: AHORA() + 1 });
      const c = await rpcT(t, 'mover_etapa', { p_proyecto: 'e7', p_etapa: 'cortado', p_sello: AHORA() + 2 });
      return { n: [a.salidas, b.salidas ?? 0, c.salidas], movs: (await movs(t, `proyecto_id = 'e7'`)).length };
    });
    igual(x.n, [2, 0, 0]);
    igual(x.movs, 2);
  });
  prueba('ET-10 si OTRO teléfono ya insertó mov-salida:<req> (por almacen_aplicar): no se duplica, el requerimiento se marca consumido y salidas = 0', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'e10', p_etapa: 'cortado', p_sello: AHORA() });
      return { r, m: await movs(t, `proyecto_id = 'e10'`), req: (await estadoReq(t))['e10:led-12v'] };
    });
    igual([x.r.salidas, x.m.length, x.req], [0, 1, 'consumido']);
  });
  prueba('ET-11 cantidad_ajustada MANDA sobre cantidad_compra (5 calculado, 3 ajustado → sale 3)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      await rpcT(t, 'mover_etapa', { p_proyecto: 'e11', p_etapa: 'cortado', p_sello: AHORA() });
      return movs(t, `proyecto_id = 'e11'`);
    });
    igual(x.map(m => m.cantidad), ['-3']);
  });
  prueba('ET-12 cancelado → armado y garantia → armado cruzan el corte (orden nulo) y emiten lo no consumido', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const a = await rpcT(t, 'mover_etapa', { p_proyecto: 'e12c', p_etapa: 'armado', p_sello: AHORA() });
      const b = await rpcT(t, 'mover_etapa', { p_proyecto: 'e12g', p_etapa: 'armado', p_sello: AHORA() });
      return { a: a.salidas, b: b.salidas };
    });
    igual(x, { a: 1, b: 1 });
  });
  prueba('ET-13 un requerimiento descartado no se emite (los demás sí)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'e13', p_etapa: 'cortado', p_sello: AHORA() });
      return { r, m: await movs(t, `proyecto_id = 'e13'`), req: await estadoReq(t) };
    });
    igual([x.r.salidas, x.m.map(m => m.requerimiento_id), x.req['e13:acr-3mm']], [1, ['e13:led-12v'], 'descartado']);
  });
  prueba('mover a etapas que NO cruzan el corte (en_diseno, cancelado) no emite nada', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const a = await rpcT(t, 'mover_etapa', { p_proyecto: 'e7', p_etapa: 'en_diseno', p_sello: AHORA() });
      const b = await rpcT(t, 'mover_etapa', { p_proyecto: 'e8', p_etapa: 'cancelado', p_sello: AHORA() });
      return { a: a.salidas, b: b.salidas, n: (await movs(t, `proyecto_id in ('e7', 'e8')`)).length };
    });
    igual(x, { a: 0, b: 0, n: 0 });
  });
});

describir('ET-14 y ET-15 la degradación: emitir_salidas_derivadas', () => {
  /** Cinco proyectos con una instalación distinta cada uno; devuelve la copia lista. */
  async function conInstalaciones(fn) {
    return conCopia(plantilla, async db => {
      const ins = (id, etapa, extra) => sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('${id}', 'al3d', 'V-${200 + Number(id.slice(1))}', 'hoja', 'Der ${id}', '${etapa}');
        insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra) values ('al3d', '${id}:acr-3mm', '${id}', 'acr-3mm', 2, 'lamina');
        insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('i${id}', 'al3d', '${id}', ${extra}, 'confirmada', 'inst-i${id}@al3d.mx')`);
      await ins('d1', 'listo', `interno.hoy_mx() + 1`);        // mañana
      await ins('d2', 'listo', `interno.hoy_mx() - 1`);        // ayer
      await ins('d3', 'listo', `interno.hoy_mx() + 3`);        // en 3 días
      await ins('d4', 'listo', `interno.hoy_mx() + 1`);        // cita cancelada
      await sql(db, `update public.instalaciones set estado = 'cancelada' where id = 'id4'`);
      await ins('d5', 'cancelado', `interno.hoy_mx() + 1`);    // proyecto cancelado
      return fn(db);
    });
  }
  prueba('ET-14 con la instalación mañana / ayer: emite con origen «derivado»; en 3 días, con la cita cancelada o con el proyecto cancelado: no; la segunda llamada = 0; NO mueve la etapa', async () => {
    await conInstalaciones(async db => {
      for (const quien of ['dir', 'fab']) {
        const x = await sesionDe(db, db.u[quien]).transaccion(async t => {
          const a = await rpcT(t, 'emitir_salidas_derivadas');
          const b = await rpcT(t, 'emitir_salidas_derivadas');
          return { a, b, m: await movs(t, `proyecto_id like 'd%'`), etapas: (await t.query(`select id, etapa from public.proyectos where id like 'd%' order by id`)).map(r => r.etapa) };
        });
        igual([x.a.ok, x.a.proyectos, x.a.movimientos], [true, 2, 2], quien);
        igual([x.b.proyectos, x.b.movimientos], [0, 0], quien + ': la segunda llamada no emite');
        igual(x.m.map(m => [m.proyecto_id, m.origen, m.tipo]).sort(), [['d1', 'derivado', 'salida'], ['d2', 'derivado', 'salida']], quien);
        igual(x.etapas, ['listo', 'listo', 'listo', 'listo', 'cancelado'], quien + ': no mueve la etapa');
      }
    });
  });
  prueba('ET-15 Pagos puede llamar emitir_salidas_derivadas (la regla es «derivado + salida»)', async () => {
    await conInstalaciones(async db => {
      const r = (await sesionDe(db, db.u.pag).rpc('emitir_salidas_derivadas', { p_hoy: null }))[0].emitir_salidas_derivadas;
      igual([r.ok, r.proyectos], [true, 2]);
    });
  });
  prueba('p_hoy ya NO mueve el día a voluntad (hallazgo M-1 de la revisión adversarial): solo cuenta si difiere a lo más 1 día de hoy en México; +3 días, +2000 días y 2099 se ignoran', async () => {
    const dia = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    /* Sin p_hoy emiten d1 y d2 (2 proyectos). Con +3 días antes emitía también d3; ahora se ignora y sigue en 2: nadie puede consumir material por adelantado. */
    for (const [quien, p_hoy] of [['dir', dia(3)], ['pag', dia(3)], ['pag', '2099-12-31'], ['fab', dia(2000)]]) {
      await conInstalaciones(async db => {
        const r = await sesionDe(db, db.u[quien]).transaccion(async t => rpcT(t, 'emitir_salidas_derivadas', { p_hoy }));
        igual([r.ok, r.proyectos], [true, 2], quien + ' con p_hoy ' + p_hoy);
      });
    }
  });
});

describir('ET-16 a ET-18 instalación hecha ⇒ instalado (solo si la marca Dirección)', () => {
  const hecha = (proyecto, id = 'ih') => ({ p_op: { id, proyecto_id: proyecto, fecha: '2026-10-15', hora: '09:30', ventana: 'dia', duracion_min: 180, estado: 'hecha', sello: AHORA() } });
  async function conProyecto(etapa, quien, fn) {
    return conCopia(plantilla, async db => {
      await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('h1', 'al3d', 'V-300', 'hoja', 'Con cita', '${etapa}');
                     insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, estado, uid_ics) values ('ih', 'al3d', 'h1', '2026-10-15', '09:30', 'confirmada', 'inst-ih@al3d.mx');
                     insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra) values ('al3d', 'h1:acr-3mm', 'h1', 'acr-3mm', 2, 'lamina')`);
      return sesionDe(db, db.u[quien]).transaccion(t => fn(t));
    });
  }
  prueba('ET-16 Dirección marca hecha con etapa «listo» → instalado; con instalado, garantia o cancelado la etapa no cambia', async () => {
    const a = await conProyecto('listo', 'dir', async t => { const r = await rpcT(t, 'instalacion_guardar', hecha('h1')); return { r, e: (await t.query(`select etapa from public.proyectos where id = 'h1'`))[0].etapa }; });
    igual([a.r.ok, a.r.instalacion.estado, a.e], [true, 'hecha', 'instalado']);
    for (const etapa of ['instalado', 'garantia']) {
      const x = await conProyecto(etapa, 'dir', async t => { await rpcT(t, 'instalacion_guardar', hecha('h1')); return (await t.query(`select etapa from public.proyectos where id = 'h1'`))[0].etapa; });
      igual(x, etapa);
    }
  });
  prueba('ET-17 Fabricación marca hecha con etapa «listo»: la etapa SE QUEDA en listo', async () => {
    const x = await conProyecto('listo', 'fab', async t => {
      const r = await rpcT(t, 'instalacion_guardar', hecha('h1'));
      return { r, e: (await t.query(`select etapa from public.proyectos where id = 'h1'`))[0].etapa };
    });
    igual([x.r.ok, x.e], [true, 'listo']);
  });
  prueba('ET-18 Dirección marca hecha con etapa «ganado»: pasa a instalado Y emite (cruzó el corte)', async () => {
    const x = await conProyecto('ganado', 'dir', async t => {
      await rpcT(t, 'instalacion_guardar', hecha('h1'));
      return { e: (await t.query(`select etapa from public.proyectos where id = 'h1'`))[0].etapa, m: (await movs(t, `proyecto_id = 'h1'`)).length };
    });
    igual(x, { e: 'instalado', m: 1 });
  });
});

describir('ET-19 a ET-21 cobro ⇒ instalado (solo filas importadas, sin salidas, con sello del servidor)', () => {
  async function conVentas(fn) {
    return conCopia(plantilla, async db => {
      const v = (id, folio, fuente, etapa, hist = false) => sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, historica, nombre, etapa, estatus, iva, folio_global)
          values ('${id}', 'al3d', '${folio}', '${fuente}', ${hist}, 'Venta ${id}', ${etapa ? `'${etapa}'` : 'null'}, 'COBRANDO', false, ${fuente === 'cotizacion' ? `'COT-${id}@K7QM'` : 'null'});
        insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, cuenta) values ('${id}', 'al3d', 1000, 100, 'Elias BBVA')`);
      await v('c1', 'V-401', 'hoja', 'armado');            // importada
      await v('c2', 'V-402', 'cotizacion', 'armado');      // de la plataforma
      await v('c3', 'V-403', 'hoja', null, true);          // histórica
      await v('c4', 'V-404', 'hoja', 'garantia');          // en garantía
      await v('c5', 'V-405', 'manual', 'listo');           // alta manual
      return fn(db);
    });
  }
  const etapa = (t, id) => t.query(`select etapa, sellos->>'etapa' as sello from public.proyectos where id = '${id}'`).then(r => r[0]);
  prueba('ET-19 Pagos registrar_cobro(liquidar): fuente hoja en armado → instalado (sin salidas, sello de etapa NUEVO); cotización, histórica y garantía NO cambian', async () => {
    await conVentas(async db => {
      const antes = Date.now();
      const x = await sesionDe(db, db.u.pag).transaccion(async t => {
        for (const id of ['c1', 'c2', 'c3', 'c4']) await rpcT(t, 'registrar_cobro', { p_proyecto: id, p_monto: 100, p_liquidar: true });
        return { c1: await etapa(t, 'c1'), c2: await etapa(t, 'c2'), c3: await etapa(t, 'c3'), c4: await etapa(t, 'c4'), m: (await movs(t)).filter(m => m.id.startsWith('mov-salida:c')).length };
      });
      igual([x.c1.etapa, x.c2.etapa, x.c3.etapa, x.c4.etapa], ['instalado', 'armado', null, 'garantia']);
      cierto(Number(x.c1.sello) >= antes, 'el sello de etapa es de la hora del servidor');
      igual(x.m, 0, 'sin salidas');
    });
  });
  prueba('ET-20 Dirección y Pagos: corregir_venta(estatus COBRANDO) en una fila manual en «listo» → instalado', async () => {
    await conVentas(async db => {
      for (const quien of ['dir', 'pag']) {
        await sql(db, `update public.proyectos set estatus = 'FABRICACION', etapa = 'listo' where id = 'c5'`);
        const y = await sesionDe(db, db.u[quien]).transaccion(async t => {
          const r = await rpcT(t, 'corregir_venta', { p_proyecto: 'c5', p_cambios: { estatus: 'COBRANDO' } });
          return { r, e: (await etapa(t, 'c5')).etapa };
        });
        igual([y.r.ok, y.e], [true, 'instalado'], quien);
      }
    });
  });
  prueba('ET-21 una op vieja de la bandeja (etapa en_diseno con sello anterior al del cobro) → «viejos»: NO revierte', async () => {
    await conVentas(async db => {
      const y = await sesionDe(db, db.u.dir).transaccion(async t => {
        await rpcT(t, 'registrar_cobro', { p_proyecto: 'c1', p_monto: 100, p_liquidar: true });
        const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'c1', p_etapa: 'en_diseno', p_sello: Date.now() - 60_000 });
        return { r, e: (await etapa(t, 'c1')).etapa };
      });
      igual([y.r.ok, y.r.viejos.map(v => v.nombre), y.e], [true, ['etapa'], 'instalado']);
    });
  });
});

describir('ET-23 y ET-24 cancelar y la lápida', () => {
  prueba('ET-23 cancelado: la etapa pasa a «cancelado», sin salidas, y queda en la bitácora de etapa', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const r = await rpcT(t, 'mover_etapa', { p_proyecto: 'e23', p_etapa: 'cancelado', p_sello: AHORA() });
      return { r, e: (await t.query(`select etapa from public.proyectos where id = 'e23'`))[0].etapa, m: (await movs(t, `proyecto_id = 'e23'`)).length,
               b: await t.query(`select nivel, despues from public.bitacora where accion = 'etapa' and entidad_id = 'e23'`) };
    });
    igual([x.r.ok, x.r.salidas, x.e, x.m], [true, 0, 'cancelado', 0]);
    igual(x.b.map(b => [b.nivel, b.despues.etapa]), [['general', 'cancelado']]);
  });
  prueba('ET-24 mover_etapa de una lápida (sin folio_hoja) a «ganado» → DATO_INVALIDO; ganar_proyecto sobre el mismo folio_global → DUPLICADO; la fila no cambia', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const m = await rpcT(t, 'mover_etapa', { p_proyecto: 'p5', p_etapa: 'ganado', p_sello: AHORA() });
      const g = await rpcT(t, 'ganar_proyecto', { p_op: { id: 'p5-nuevo', folio_global: 'COT-0005@K7QM', nombre: 'Pedro', venta: { sub: 100 } } });
      return { m, g, e: (await t.query(`select etapa, folio_hoja from public.proyectos where id = 'p5'`))[0] };
    });
    igual([x.m.ok, x.m.codigo], [false, 'DATO_INVALIDO']);
    igual([x.g.ok, x.g.codigo, x.g.proyecto_id], [false, 'DUPLICADO', 'p5']);
    igual(x.e, { etapa: 'cancelado', folio_hoja: null });
  });
  prueba('Fabricación tampoco mueve una lápida (su origen «cancelado» no está en el rango): ROL_SIN_PERMISO', async () => {
    const db = await plantilla();
    igual((await sesionDe(db, db.u.fab).rpc('mover_etapa', { p_proyecto: 'p5', p_etapa: 'ganado', p_sello: AHORA() }))[0].mover_etapa.codigo, 'ROL_SIN_PERMISO');
  });
});

await resumen();
