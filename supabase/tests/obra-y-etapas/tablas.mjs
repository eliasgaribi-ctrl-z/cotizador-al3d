// Las restricciones y los triggers de las tablas de obra y de dinero (0003) — A.md §2.6..§2.9 y casos MT-05, IN-02, IN-03, IN-04 (la parte
// que impone la TABLA), PG-24 y lo que cada CHECK promete. Se escribe como SERVICE_ROLE (el camino del importador: respeta CHECK, UNIQUE y
// triggers) y como el DUEÑO donde hace falta saltarse los privilegios.
//
// Qué se comprueba: la identidad de un proyecto no cambia; lo que el cliente podría mandar mal (pin, teléfono, vocabularios, sellos) lo
// rechaza la base y no la pantalla; una instalación viva por proyecto, con su UID inmutable y su `movida` que solo sube; los abonos
// son un libro (no se editan ni se borran); y nada se borra.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, como, sql } from '../comun/semilla.js';

const base = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

// una sentencia como service_role, que nunca confirma: devuelve el sqlstate del error o 'ok'
const S = async (consulta, params = []) => (await como(await base(), { rol: 'service_role' }).intentar(consulta, params)).error?.codigo ?? 'ok';
// una sentencia como el dueño (superusuario)
// (solo para sentencias que DEBEN fallar: si una no fallara, quedaría confirmada)
const DUENO = async consulta => { try { await sql(await base(), consulta); return 'ok'; } catch (e) { return e.codigo ?? e.code ?? String(e.message); } };

const NUEVO = `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa`;

describir('proyectos: la identidad no cambia', () => {
  for (const [col, valor] of [['fuente', `'manual'`], ['historica', 'true'], ['dispositivo', `'otro'`], ['folio_local', `'otro'`], ['empresa_id', `'otra'`],
                              ['created_at', `now() - interval '1 day'`], ['folio_hoja', `'V-777'`], ['folio_global', `'COT-9999@K7QM'`]]) {
    prueba(`no se puede cambiar ${col} (P0001: «La identidad de un proyecto no se cambia»)`, async () => {
      igual(await S(`update public.proyectos set ${col} = ${valor} where id = 'p1'`), 'P0001');
    });
  }
  prueba('pasar folio_hoja o folio_global de NULL a un valor SÍ se permite (lo hace la importación al fusionar), y una vez fijado ya no cambia', async () => {
    const db = await base();
    const r = await como(db, { rol: 'service_role' }).transaccion(async t => {
      await t.query(`update public.proyectos set folio_global = 'COT-7777@K7QM' where id = 'p4'`);
      const otra = await t.intentar(`update public.proyectos set folio_global = 'COT-8888@K7QM' where id = 'p4'`);
      return [(await t.query(`select folio_global from public.proyectos where id = 'p4'`))[0].folio_global, otra.error.codigo];
    });
    igual(r, ['COT-7777@K7QM', 'P0001']);
  });
  prueba('lo demás sí se edita (nombre, notas, etapa…): el trigger solo protege la identidad', async () => {
    igual(await S(`update public.proyectos set nombre = 'Otro nombre', notas = 'x', etapa = 'armado' where id = 'p1'`), 'ok');
  });
});

describir('proyectos: lo que el cliente podría mandar mal lo rechaza la base (CHECK)', () => {
  const malo = (nombre, set) => prueba(`${nombre} → check_violation`, async () => igual(await S(`update public.proyectos set ${set} where id = 'p1'`), '23514'));
  malo('lat sin lng', `lat = 20, lng = null`);
  malo('el pin (0, 0)', `lat = 0, lng = 0`);
  malo('latitud 91', `lat = 91, lng = 10`);
  malo('longitud 181', `lat = 10, lng = 181`);
  malo('teléfono con letras', `tel = '33 abc'`);
  malo('teléfono sin dígitos', `tel = '(+)'`);
  malo('teléfono de más de 30 caracteres', `tel = '${'3'.repeat(31)}'`);
  malo('un tipo de trabajo fuera del vocabulario', `tipo_trabajo = array['Caja de luz con iluminacion', 'Letrero raro']`);
  malo('una etapa inventada', `etapa = 'terminado'`);
  malo('una entrega inventada', `entrega = 'dron'`);
  malo('plazo_k 0', `plazo_k = 0`);
  malo('plazo_k 6', `plazo_k = 6`);
  malo('un estatus inventado (minúsculas)', `estatus = 'cobrando'`);
  malo('nombre vacío', `nombre = '   '`);
  malo('sellos con una clave que no es un grupo', `sellos = '{"otra": 1}'`);
  malo('sellos con un negativo', `sellos = '{"etapa": -1}'`);
  malo('sellos con una fracción', `sellos = '{"etapa": 1.5}'`);
  malo('origen_obra que no es un objeto', `origen_obra = '[1]'::jsonb`);
  prueba('lo válido pasa: pin real, teléfonos con +, ( ) y -, vocabularios, sellos de los 8 grupos', async () => {
    igual(await S(`update public.proyectos set lat = 20.67, lng = -103.35, tel = '+52 (33) 1234-5678', tipo_trabajo = array['Recorte acrilico'], entrega = 'paqueteria', plazo_k = 5,
                    estatus = 'LIQUIDADO', sellos = '{"etapa":1,"notas":2,"plazo_k":3,"tel":4,"dir_texto":5,"ubicacion":6,"entrega":7,"instalacion":8}' where id = 'p1'`), 'ok');
  });
  prueba('un id con caracteres raros o vacío no entra', async () => {
    igual(await S(`${NUEVO}) values ('con espacio', 'al3d', 'V-800', 'hoja', 'X', 'ganado')`), '23514');
    igual(await S(`${NUEVO}) values ('', 'al3d', 'V-801', 'hoja', 'X', 'ganado')`), '23514');
    igual(await S(`${NUEVO}) values ('ok-id:1._x@y', 'al3d', 'V-802', 'hoja', 'X', 'ganado')`), 'ok');
  });
  prueba('un folio_hoja o folio_global con mal formato no entra', async () => {
    igual(await S(`${NUEVO}) values ('f1', 'al3d', 'V-12', 'hoja', 'X', 'ganado')`), '23514', 'V-## de menos de 3 dígitos');
    igual(await S(`${NUEVO}) values ('f2', 'al3d', '12', 'hoja', 'X', 'ganado')`), '23514');
    igual(await S(`insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, fuente, nombre, etapa) values ('f3', 'al3d', 'V-803', 'COT-1', 'cotizacion', 'X', 'ganado')`), '23514', 'sin @aparato');
  });
  prueba('el mismo folio_global dos veces en la empresa → unique_violation (Q-07)', async () => {
    igual(await S(`insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, fuente, nombre, etapa) values ('f4', 'al3d', 'V-804', 'COT-0001@K7QM', 'cotizacion', 'X', 'ganado')`), '23505');
  });
});

describir('proyectos y ventas_dinero: el dueño no borra, y nada se borra (sin_borrar)', () => {
  for (const t of ['proyectos', 'ventas_dinero', 'abonos', 'instalaciones']) {
    prueba(`${t}: DELETE como dueño → P0001; como service_role → permission denied (42501)`, async () => {
      igual(await DUENO(`delete from public.${t}`), 'P0001');
      igual(await S(`delete from public.${t} where false`), '42501');
    });
  }
  prueba('un borrado lógico sí: deleted_at (la fila se queda y los clientes reciben la lápida)', async () => {
    igual(await S(`update public.proyectos set deleted_at = now() where id = 'p2'`), 'ok');
  });
});

describir('updated_at es el cursor de sincronización: solo se mueve si la fila CAMBIÓ de verdad', () => {
  prueba('un UPDATE con los mismos valores no la «ensucia»; uno que cambia algo, sí, y avanza', async () => {
    const db = await base();
    const r = await como(db, { rol: 'service_role' }).transaccion(async t => {
      const lee = async () => (await t.query(`select updated_at::text as u from public.proyectos where id = 'p2'`))[0].u;
      const antes = await lee();
      await t.query(`update public.proyectos set nombre = nombre where id = 'p2'`);
      const igualDespues = await lee();
      await t.query(`update public.proyectos set notas = 'cambió' where id = 'p2'`);
      const cambiado = await lee();
      return { sinCambio: antes === igualDespues, avanza: cambiado > antes };
    });
    igual(r, { sinCambio: true, avanza: true });
  });
});

describir('ventas_dinero: lo que prohíbe la tabla', () => {
  const malo = (nombre, set) => prueba(`${nombre} → check_violation`, async () => igual(await S(`update public.ventas_dinero set ${set} where proyecto_id = 'p1'`), '23514'));
  malo('anticipo negativo', `anticipo = -1`);
  malo('liquidación negativa', `liquidacion = -5`);
  malo('una cuenta que no es una de las cinco', `cuenta = 'Efectivo'`);
  malo('pct_comision 101', `pct_comision = 101`);
  malo('pct_comision negativo', `pct_comision = -1`);
  malo('origen_dinero que no es un objeto', `origen_dinero = '[1]'::jsonb`);
  prueba('el subtotal sí puede ser negativo y la cuenta nula; pct_comision 0 y 100 valen', async () => {
    igual(await S(`update public.ventas_dinero set subtotal = -500.55, cuenta = null, pct_comision = 100 where proyecto_id = 'p1'`), 'ok');
  });
  prueba('una segunda fila de dinero para el mismo proyecto → llave primaria (1:1)', async () => {
    igual(await S(`insert into public.ventas_dinero (proyecto_id, empresa_id) values ('p1', 'al3d')`), '23505');
  });
  prueba('una lápida y un proyecto inexistente no tienen dinero (trigger ventas_dinero_libro; FK compuesta)', async () => {
    igual(await S(`insert into public.ventas_dinero (proyecto_id, empresa_id) values ('p5', 'al3d')`), '23514');
    igual(await S(`insert into public.ventas_dinero (proyecto_id, empresa_id) values ('no-existe', 'al3d')`), '23514');
  });
});

describir('PG-24 abonos es un LIBRO: no se edita ni se borra', () => {
  prueba('UPDATE como service_role → el trigger del libro (P0001); DELETE → permission denied (42501)', async () => {
    igual(await S(`update public.abonos set nota = 'x' where folio_hoja = 'V-001'`), 'P0001');
    igual(await S(`delete from public.abonos where folio_hoja = 'V-001'`), '42501');
    igual(await DUENO(`update public.abonos set importe = 1`), 'P0001');
  });
  prueba('lo que prohíbe la tabla: abono o reparto con importe ≤ 0; importes de 1e7 o más; pago_id mal formado; folio mal formado', async () => {
    const ins = (cols, vals) => `insert into public.abonos (empresa_id, folio_hoja, ${cols}) values ('al3d', 'V-001', ${vals})`;
    igual(await S(ins('importe, tipo', `-5, 'abono'`)), '23514');
    igual(await S(ins('importe, tipo', `0, 'reparto'`)), '23514');
    igual(await S(ins('importe', `10000000`)), '23514');
    igual(await S(ins('importe', `-10000000`)), '23514');
    igual(await S(ins('importe, pago_id', `5, 'P-1'`)), '23514');
    igual(await S(`insert into public.abonos (empresa_id, folio_hoja, importe) values ('al3d', 'V-1', 5)`), '23514');
    igual(await S(ins('importe, tipo', `-5, 'correccion'`)), 'ok', 'una corrección sí es negativa');
    igual(await S(ins('importe, tipo', `-5, 'historico'`)), 'ok');
    igual(await S(ins('importe', `9999999.99`)), 'ok');
  });
  prueba('el índice de idempotencia: (empresa, op_id, folio) único, pero un mismo op_id sirve para VARIOS folios (el reparto)', async () => {
    const db = await base();
    const r = await como(db, { rol: 'service_role' }).transaccion(async t => {
      await t.query(`insert into public.abonos (empresa_id, folio_hoja, importe, op_id) values ('al3d', 'V-001', 5, 'op-1')`);
      const otroFolio = await t.intentar(`insert into public.abonos (empresa_id, folio_hoja, importe, op_id) values ('al3d', 'V-002', 5, 'op-1')`);
      const mismo = await t.intentar(`insert into public.abonos (empresa_id, folio_hoja, importe, op_id) values ('al3d', 'V-001', 5, 'op-1')`);
      return [otroFolio.ok, mismo.error.codigo];
    });
    igual(r, [true, '23505']);
  });
  prueba('un abono de un folio que no existe SÍ entra (se enlaza por texto, como la hoja)', async () => {
    igual(await S(`insert into public.abonos (empresa_id, folio_hoja, importe) values ('al3d', 'V-9999', 5)`), 'ok');
  });
});

describir('IN-02, IN-03, IN-04 e IN-09 instalaciones: una viva por proyecto, UID inmutable, movida que solo sube', () => {
  const ins = (id, proy, extra = '') => `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics${extra ? ', ' + extra.split('=')[0] : ''})
                                           values ('${id}', 'al3d', '${proy}', '2026-11-01', 'propuesta', 'inst-${id}@al3d.mx'${extra ? ', ' + extra.split('=')[1] : ''})`;
  prueba('IN-02 un insert directo de una segunda viva sobre el mismo proyecto viola el índice único; si la primera está cancelada o borrada, sí entra', async () => {
    igual(await S(ins('x2', 'p1')), '23505');
    const db = await base();
    const r = await como(db, { rol: 'service_role' }).transaccion(async t => {
      await t.query(`update public.instalaciones set estado = 'cancelada', movida = 1 where id = 'i1'`);
      const conCancelada = await t.intentar(ins('x3', 'p1'));
      const segunda = await t.intentar(ins('x4', 'p1'));
      return [conCancelada.ok, segunda.error.codigo];
    });
    igual(r, [true, '23505']);
  });
  prueba('IN-03 un uid_ics distinto de «inst-<id>@al3d.mx» → check_violation; cambiar uid_ics, proyecto_id, id o empresa_id → el trigger', async () => {
    igual(await S(`insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('x5', 'al3d', 'p2', '2026-11-01', 'propuesta', 'otro-uid@al3d.mx')`), '23514');
    igual(await S(`update public.instalaciones set uid_ics = 'inst-otro@al3d.mx' where id = 'i1'`), 'P0001', 'el trigger corta antes que el CHECK');
    igual(await S(`update public.instalaciones set proyecto_id = 'p2' where id = 'i1'`), 'P0001');
    igual(await S(`update public.instalaciones set id = 'i9', uid_ics = 'inst-i9@al3d.mx' where id = 'i1'`), 'P0001');
  });
  prueba('IN-04 movida solo sube: bajarla → P0001; subirla o dejarla igual, ok', async () => {
    const db = await base();
    const r = await como(db, { rol: 'service_role' }).transaccion(async t => {
      await t.query(`update public.instalaciones set movida = 3 where id = 'i1'`);
      const baja = await t.intentar(`update public.instalaciones set movida = 2 where id = 'i1'`);
      const igualM = await t.intentar(`update public.instalaciones set movida = 3, notas = 'x' where id = 'i1'`);
      return [baja.error.codigo, igualM.ok];
    });
    igual(r, ['P0001', true]);
  });
  prueba('IN-09 hora «25:00» o mal formada → check_violation; sin hora (todo el día) y 00:00 / 23:59, ok', async () => {
    const hora = h => `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, estado, uid_ics) values ('xh', 'al3d', 'p2', '2026-11-01', ${h}, 'propuesta', 'inst-xh@al3d.mx')`;
    for (const mala of [`'25:00'`, `'9:30'`, `'09:60'`, `'0930'`, `'ab:cd'`]) igual(await S(hora(mala)), '23514', mala);
    for (const buena of [`null`, `'00:00'`, `'23:59'`, `'09:30'`]) igual(await S(hora(buena)), 'ok', buena);
  });
  prueba('IN-10 duración 0 o 601 y ventana «manana» → check_violation; 1 y 600, y «dia», «noche», «madrugada», ok', async () => {
    const col = (c, v) => `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics, ${c}) values ('xd', 'al3d', 'p2', '2026-11-01', 'propuesta', 'inst-xd@al3d.mx', ${v})`;
    igual(await S(col('duracion_min', 0)), '23514');
    igual(await S(col('duracion_min', 601)), '23514');
    igual(await S(col('duracion_min', 1)), 'ok');
    igual(await S(col('duracion_min', 600)), 'ok');
    igual(await S(col('ventana', `'manana'`)), '23514');
    for (const v of ['dia', 'noche', 'madrugada']) igual(await S(col('ventana', `'${v}'`)), 'ok', v);
  });
  prueba('un estado inventado o sin fecha → check/not null', async () => {
    igual(await S(`insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('xe', 'al3d', 'p2', '2026-11-01', 'agendada', 'inst-xe@al3d.mx')`), '23514');
    igual(await S(`insert into public.instalaciones (id, empresa_id, proyecto_id, estado, uid_ics) values ('xf', 'al3d', 'p2', 'propuesta', 'inst-xf@al3d.mx')`), '23502');
  });
});

describir('lo que authenticated y anon NO pueden ni intentar sobre estas tablas', () => {
  prueba('Dirección (la más poderosa) tampoco escribe directo: todo es por RPC', async () => {
    const db = await base(), D = sesionDe(db, db.u.dir);
    for (const t of ['proyectos', 'ventas_dinero', 'abonos', 'instalaciones']) {
      await esperarError(D.query(`update public.${t} set updated_at = now()`), '42501');
    }
  });
});

await resumen();
