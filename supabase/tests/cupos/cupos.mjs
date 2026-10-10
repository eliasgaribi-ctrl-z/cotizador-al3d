// Cupos sin estado (R11) — A.md §8 y §10.14, casos CU-01..CU-15.
//
//   · `ia_cuota`        el tope de 200 consultas de IA por persona y por DÍA DE MÉXICO (hoy es el día GMT: se reinicia a las 18:00 locales);
//   · `ia_turno`        el turno de las llaves de IA (1, 2, … 0, 1);
//   · `verificar_cupo`  30 por folio y 400 en total por ventana de 600 s, y 60 por IP; el folio se cuenta en MAYÚSCULAS;
//   · `contador_sembrar` siembra V-###, P-### y la secuencia del almacén por ENCIMA de lo que ya tiene la hoja: solo sube;
//   · todas SOLO para `service_role` (las llaman las Edge Functions); Dirección, Fabricación, Pagos y `anon` reciben «permission denied».
//
// Las llamadas de un mismo caso van en UNA petición (`transaccion`): cada petición se deshace al terminar, así que 200 llamadas
// por separado no se verían unas a otras.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, rpcT, una, sql, conCopia, como } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);                                   // trae los contadores V = 5 y P = 1
  return db;
}, { limpiar: db => db.close() });

const SR = db => como(db, { rol: 'service_role' });
const ANON = db => como(db, { rol: 'anon' });
const U1 = '00000000-0000-4000-8000-0000000000d1', U2 = '00000000-0000-4000-8000-0000000000d2';
const T0 = '2026-10-10T18:00:00Z';                              // 12:00 en México; 12:00:00Z es múltiplo de 600 s (ventana redonda)
const T_VENT = '2026-10-10T12:00:00Z';                          // el segundo exacto en que empieza una ventana de 600 s
const SEGS = (iso, s) => new Date(Date.parse(iso) + s * 1000).toISOString();

describir('CU-01 y CU-02 ia_cuota: 200 por persona y día', () => {
  prueba('CU-01 service_role: 200 consultas ok, la 201.ª CUPO_AGOTADO (transitorio:false) con el mensaje de hoy, y el contador NO pasa de 200', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const ok = [];
      for (let i = 1; i <= 200; i++) ok.push(await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 }));
      const extra = await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      const otraMas = await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      const fila = (await t.query(`select n::int as n from public.contadores where clave = 'ia:' || $1::text`, [U1]))[0];
      return { ok, extra, otraMas, n: fila.n };
    });
    igual(x.ok.every(r => r.ok === true), true, 'las 200 primeras pasan');
    igual([x.ok[0].usadas, x.ok[199].usadas, x.ok[199].limite, x.ok[0].dia], [1, 200, 200, '20261010']);
    igual([x.extra.ok, x.extra.codigo, x.extra.transitorio, x.extra.definitivo, x.extra.limite, x.extra.dia], [false, 'CUPO_AGOTADO', false, false, 200, '20261010']);
    igual(x.extra.mensaje, 'Llegaste al tope de 200 consultas de IA por hoy. Mañana se reinicia.');
    igual(x.otraMas.codigo, 'CUPO_AGOTADO', 'y las siguientes también');
    igual(x.n, 200, 'el contador nunca pasa del tope');
  });
  prueba('CU-01 el tope es parámetro: con p_limite 3 la 4.ª se rechaza; p_limite < 1 o usuario nulo es DATO_INVALIDO', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const r = [];
      for (let i = 0; i < 4; i++) r.push(await rpcT(t, 'ia_cuota', { p_usuario: U1, p_limite: 3, p_ahora: T0 }));
      return { r, cero: await rpcT(t, 'ia_cuota', { p_usuario: U1, p_limite: 0, p_ahora: T0 }), sin: await rpcT(t, 'ia_cuota', { p_usuario: null, p_ahora: T0 }) };
    });
    igual(x.r.map(a => a.ok), [true, true, true, false]);
    igual([x.r[3].mensaje], ['Llegaste al tope de 3 consultas de IA por hoy. Mañana se reinicia.']);
    igual([x.cero.codigo, x.cero.definitivo, x.sin.codigo], ['DATO_INVALIDO', true, 'DATO_INVALIDO']);
  });
  prueba('CU-02 otra persona tiene su PROPIO cupo (aunque la primera ya esté en el tope)', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      for (let i = 0; i < 200; i++) await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      return { u1: await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 }), u2: await rpcT(t, 'ia_cuota', { p_usuario: U2, p_ahora: T0 }) };
    });
    igual([x.u1.ok, x.u1.codigo], [false, 'CUPO_AGOTADO']);
    igual([x.u2.ok, x.u2.usadas], [true, 1]);
  });
  prueba('CU-01 (sin p_ahora) usa el reloj de la base: la primera consulta de hoy cuenta 1 y trae el día de México', async () => {
    const db = await plantilla();
    const r = await SR(db).rpc('ia_cuota', { p_usuario: U1 });
    const hoy = (await sql(db, `select interno.dia_mx(now()) as d`))[0].d;
    igual([r[0].ia_cuota.ok, r[0].ia_cuota.usadas, r[0].ia_cuota.dia], [true, 1, hoy]);
  });
});

describir('CU-03 a CU-05 el día es el de MÉXICO, no el GMT', () => {
  prueba('CU-03 dia_mx cambia a la medianoche de México: 05:59:00Z sigue siendo el 10 y 06:00:00Z ya es el 11', async () => {
    const db = await plantilla();
    const f = async ts => (await sql(db, `select interno.dia_mx($1::timestamptz) as d`, [ts]))[0].d;
    igual([await f('2026-10-11T05:59:00Z'), await f('2026-10-11T06:00:00Z')], ['20261010', '20261011']);
  });
  prueba('CU-04 las 00:00Z del 11 son las 18:00 del 10 en México: el tope NO se reinicia a las 18:00 como con el día GMT de hoy', async () => {
    const db = await plantilla();
    igual((await sql(db, `select interno.dia_mx('2026-10-11T00:00:00Z'::timestamptz) as d`))[0].d, '20261010');
    const x = await SR(db).transaccion(async t => {
      for (let i = 0; i < 200; i++) await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: '2026-10-10T17:59:00Z' });
      return { despues: await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: '2026-10-11T00:00:00Z' }), manana: await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: '2026-10-11T06:00:00Z' }) };
    });
    igual([x.despues.ok, x.despues.codigo, x.despues.dia], [false, 'CUPO_AGOTADO', '20261010'], 'a las 18:00 de México sigue siendo el mismo día: sigue agotado');
    igual([x.manana.ok, x.manana.usadas, x.manana.dia], [true, 1, '20261011'], 'a la medianoche de México sí hay ventana nueva');
  });
  prueba('CU-05 ia_cuota con p_ahora el día siguiente: usadas = 1 (ventana nueva)', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      for (let i = 0; i < 200; i++) await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      const agotada = await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      const manana = await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: SEGS(T0, 86400) });
      return { agotada, manana };
    });
    igual(x.agotada.codigo, 'CUPO_AGOTADO');
    igual([x.manana.ok, x.manana.usadas, x.manana.dia], [true, 1, '20261011']);
  });
});

describir('CU-06 la limpieza perezosa borra solo lo que vence', () => {
  const sembrarViejos = async db => {
    await sql(db, `insert into public.contadores (empresa_id, clave, ventana, n) values
                     ('al3d', 'alm', '', 3), ('al3d', 'folio_cot:K7QM', '', 7), ('*', 'ia_turno:qwen', '', 2), ('al3d', 'espejo:ventas', '', 1),
                     ('*', 'ia:' || '${U2}', '20260901', 9), ('*', 'ia:' || '${U2}', '20261006', 9), ('*', 'ia:' || '${U2}', '20261007', 9), ('*', 'ia:' || '${U2}', '20261008', 9)`);
  };
  const foto = async db => (await sql(db, `select empresa_id || '|' || clave || '|' || ventana as k from public.contadores order by 1`)).map(r => r.k);
  prueba('CU-06 ia_cuota borra ventanas ia: de hace MÁS de 3 días (20260901 y 20261006) y deja el resto; V, P, alm, folio_cot, ia_turno y espejo no se tocan', () => conCopia(plantilla, async db => {
    await sembrarViejos(db);
    await SR(db).transaccion(async t => {
      await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      const k = (await t.query(`select empresa_id || '|' || clave || '|' || ventana as k from public.contadores order by 1`)).map(r => r.k);
      igual(k.includes(`*|ia:${U2}|20260901`), false, 'la de septiembre se fue');
      igual(k.includes(`*|ia:${U2}|20261006`), false, 'la de hace 4 días se fue');
      igual(k.includes(`*|ia:${U2}|20261007`), true, 'la de hace exactamente 3 días se queda');
      igual(k.includes(`*|ia:${U2}|20261008`), true);
      igual(k.includes(`*|ia:${U1}|20261010`), true, 'y la de hoy se creó');
      for (const c of ['al3d|V|', 'al3d|P|', 'al3d|alm|', 'al3d|folio_cot:K7QM|', '*|ia_turno:qwen|', 'al3d|espejo:ventas|']) igual(k.includes(c), true, `${c} no se toca`);
    });
  }));
  prueba('CU-06 son hasta 20 filas por llamada: con 25 vencidas, la primera llamada deja 5 y la segunda ninguna', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.contadores (empresa_id, clave, ventana, n)
                   select '*', 'ia:' || gen_random_uuid()::text, '2026' || lpad((100 + g)::text, 4, '0'), 1 from generate_series(1, 25) g`);
    const x = await SR(db).transaccion(async t => {
      const cuenta = async () => (await t.query(`select count(*)::int as n from public.contadores where clave like 'ia:%' and ventana < '20261007'`))[0].n;
      const antes = await cuenta();
      await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      const tras1 = await cuenta();
      await rpcT(t, 'ia_cuota', { p_usuario: U1, p_ahora: T0 });
      return { antes, tras1, tras2: await cuenta() };
    });
    igual([x.antes, x.tras1, x.tras2], [25, 5, 0]);
  }));
  prueba('CU-06 verificar_cupo limpia sus propias ventanas (de hace más de 6 = 1 h) y no toca ia: ni V ni P', () => conCopia(plantilla, async db => {
    const w = Math.floor(Date.parse(T_VENT) / 1000 / 600);
    await sql(db, `insert into public.contadores (empresa_id, clave, ventana, n) values
                     ('*', 'ver:total', $1, 5), ('*', 'ver:total', $2, 5), ('*', 'ver:abc', $3, 5), ('*', 'ia:' || '${U2}', '20260901', 9)`,
      [String(w - 7), String(w - 6), String(w)]);
    await SR(db).transaccion(async t => {
      await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0001', p_ahora: T_VENT });
      const k = (await t.query(`select empresa_id || '|' || clave || '|' || ventana as k from public.contadores order by 1`)).map(r => r.k);
      igual(k.includes(`*|ver:total|${w - 7}`), false, 'hace 7 ventanas se fue');
      igual(k.includes(`*|ver:total|${w - 6}`), true, 'hace 6 se queda');
      igual(k.includes(`*|ver:abc|${w}`), true);
      igual(k.includes(`*|ia:${U2}|20260901`), true, 'verificar_cupo no limpia las de IA');
      igual(k.includes('al3d|V|') && k.includes('al3d|P|'), true);
    });
  }));
});

describir('CU-07 a CU-11 verificar_cupo', () => {
  prueba('CU-07 el mismo folio 30 veces ok y la 31.ª SIN_RED («Demasiadas consultas seguidas…»); el sobre trae ok:false', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const r = [];
      for (let i = 0; i < 31; i++) r.push(await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0042', p_ahora: T_VENT }));
      return r;
    });
    igual(x.slice(0, 30).every(r => r.ok === true), true);
    igual([x[0].n_folio, x[29].n_folio, x[29].n_total], [1, 30, 30]);
    igual([x[30].ok, x[30].codigo, x[30].definitivo, x[30].mensaje], [false, 'SIN_RED', false, 'Demasiadas consultas seguidas. Espera unos minutos.']);
  });
  prueba('CU-08 400 folios distintos ok y el 401.º SIN_RED (el tope total por ventana)', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const r = [];
      for (let i = 1; i <= 401; i++) r.push(await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-' + String(i).padStart(4, '0'), p_ahora: T_VENT }));
      return r;
    });
    igual(x.slice(0, 400).every(r => r.ok === true), true);
    igual([x[399].n_total, x[400].ok, x[400].codigo], [400, false, 'SIN_RED']);
  }, { tiempo: 120_000 });
  prueba('CU-09 la misma consulta en la ventana siguiente (+600 s) vuelve a pasar; en la misma ventana sigue rechazada', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      for (let i = 0; i < 30; i++) await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0042', p_ahora: T_VENT });
      return { rechazada: await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0042', p_ahora: SEGS(T_VENT, 599) }),
               nueva: await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0042', p_ahora: SEGS(T_VENT, 600) }) };
    });
    igual(x.rechazada.codigo, 'SIN_RED', 'a los 599 s es la misma ventana');
    igual([x.nueva.ok, x.nueva.n_folio, x.nueva.n_total], [true, 1, 1], 'a los 600 s empieza otra');
  });
  prueba('CU-10 cot-0042 y COT-0042 COMPARTEN cubeta (antes eran dos y el tope por folio era burlable)', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const r = [];
      for (let i = 0; i < 31; i++) r.push(await rpcT(t, 'verificar_cupo', { p_folio_corto: i % 2 ? 'cot-0042' : 'COT-0042', p_ahora: T_VENT }));
      const cubetas = (await t.query(`select count(*)::int as n from public.contadores where clave like 'ver:%' and clave <> 'ver:total'`))[0].n;
      return { r, cubetas };
    });
    igual(x.r.slice(0, 30).every(r => r.ok), true);
    igual(x.r[30].codigo, 'SIN_RED', 'la 31.ª rechazada aunque se haya alternado el uso de mayúsculas');
    igual(x.cubetas, 1, 'una sola cubeta de folio');
  });
  prueba('CU-11 60 consultas por IP ok y la 61.ª SIN_RED (con folios distintos, para que no sea el tope del folio); sin IP no cuenta', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const r = [];
      for (let i = 1; i <= 61; i++) r.push(await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-' + String(i).padStart(4, '0'), p_ahora: T_VENT, p_ip: '203.0.113.7' }));
      const otraIp = await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0900', p_ahora: T_VENT, p_ip: '203.0.113.8' });
      const sinIp = await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0901', p_ahora: T_VENT });
      const filasIp = (await t.query(`select count(*)::int as n from public.contadores where clave like 'ver:ip:%'`))[0].n;
      return { r, otraIp, sinIp, filasIp };
    });
    igual(x.r.slice(0, 60).every(r => r.ok), true);
    igual([x.r[60].ok, x.r[60].codigo], [false, 'SIN_RED']);
    igual(x.otraIp.ok, true, 'otra IP tiene su propia cubeta');
    igual(x.sinIp.ok, true, 'sin IP no se cuenta por IP (y no hay IP que castigar)');
    igual(x.filasIp, 2, 'solo las dos IP que llegaron tienen cubeta; la consulta sin IP no creó ninguna');
  });
  prueba('CU-11 la IP se guarda con hash (jamás en claro) y el folio también', async () => {
    const db = await plantilla();
    await SR(db).transaccion(async t => {
      await rpcT(t, 'verificar_cupo', { p_folio_corto: 'COT-0042', p_ahora: T_VENT, p_ip: '203.0.113.7' });
      const claves = (await t.query(`select clave from public.contadores where clave like 'ver:%'`)).map(r => r.clave);
      cierto(claves.length === 3, 'folio, total e IP');
      igual(claves.some(c => c.includes('203.0.113.7') || c.includes('COT-0042') || c.includes('cot-0042')), false, 'ni la IP ni el folio quedan escritos en claro');
      igual(claves.filter(c => /^ver:(ip:)?[0-9a-f]{24}$/.test(c)).length, 2);
    });
  });
});

describir('CU-12 contador_sembrar solo sube', () => {
  prueba('CU-12 contador_sembrar(al3d, V, 214) y dos altas dan V-215 y V-216; sembrar con 100 después NO baja nada; el siguiente sigue siendo V-217', async () => {
    await conCopia(plantilla, async copia => {
      const sr = como(copia, { rol: 'service_role', confirmar: true });
      igual((await sr.rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'V', p_minimo: 214 }))[0].contador_sembrar, 214);
      const alta = id => ({ p_op: { id, nombre: 'Venta ' + id, cuenta: 'Moni MPago', tipo_trabajo: ['Rotulacion de vinil'], tel: '33 2222 3333', entrega: 'paqueteria', subtotal: 100, anticipo: 10, sellos: { etapa: Date.now() } } });
      const D = sesionDe(copia, copia.u.dir, { confirmar: true });
      const a = (await D.rpc('alta_venta', alta('c1')))[0].alta_venta, b = (await D.rpc('alta_venta', alta('c2')))[0].alta_venta;
      igual([a.folio_hoja, b.folio_hoja], ['V-215', 'V-216']);
      igual((await sr.rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'V', p_minimo: 100 }))[0].contador_sembrar, 216, 'devuelve lo que hay: no baja');
      const c = (await D.rpc('alta_venta', alta('c3')))[0].alta_venta;
      igual(c.folio_hoja, 'V-217');
    });
  });
  prueba('CU-12 V-1000 no se trunca: sembrar 999 y dar un alta da V-1000, y el siguiente V-1001', async () => {
    await conCopia(plantilla, async copia => {
      const sr = como(copia, { rol: 'service_role', confirmar: true });
      await sr.rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'V', p_minimo: 999 });
      const D = sesionDe(copia, copia.u.dir, { confirmar: true });
      const alta = id => ({ p_op: { id, nombre: 'Venta ' + id, cuenta: 'Moni MPago', tipo_trabajo: ['Rotulacion de vinil'], tel: '33 2222 3333', entrega: 'paqueteria', subtotal: 100, anticipo: 10, sellos: { etapa: Date.now() } } });
      const a = (await D.rpc('alta_venta', alta('m1')))[0].alta_venta, b = (await D.rpc('alta_venta', alta('m2')))[0].alta_venta;
      igual([a.folio_hoja, b.folio_hoja], ['V-1000', 'V-1001']);
    });
  });
  prueba('CU-12 siembra P y alm igual (por empresa y por clave); una clave nueva nace en el mínimo; entradas inválidas devuelven NULL sin tocar nada', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const p = (await t.query(`select public.contador_sembrar('al3d', 'P', 0) as v`))[0].v;               // P ya vale 1: no baja
      const p2 = (await t.query(`select public.contador_sembrar('al3d', 'P', 41) as v`))[0].v;
      const alm = (await t.query(`select public.contador_sembrar('al3d', 'alm', 300) as v`))[0].v;
      const otra = (await t.query(`select public.contador_sembrar('otra', 'V', 7) as v`))[0].v;
      const malos = (await t.query(`select public.contador_sembrar(null, 'V', 1) as a, public.contador_sembrar('al3d', '  ', 1) as b, public.contador_sembrar('al3d', 'V', null) as c, public.contador_sembrar('al3d', 'V', -5) as d`))[0];
      const v = (await t.query(`select n::int as n from public.contadores where empresa_id = 'al3d' and clave = 'V' and ventana = ''`))[0].n;
      return { p: Number(p), p2: Number(p2), alm: Number(alm), otra: Number(otra), malos, v };
    });
    igual([x.p, x.p2, x.alm, x.otra], [1, 41, 300, 7]);
    igual([x.malos.a, x.malos.b, x.malos.c], [null, null, null]);
    igual(Number(x.malos.d), 5, 'un mínimo negativo se toma como 0: V se queda en 5');
    igual(x.v, 5);
  });
});

describir('CU-13 ia_turno y CU-15 siguiente()', () => {
  prueba('CU-13 ia_turno(qwen, 3) cuatro veces: 1, 2, 0, 1 (rota y vuelve); otro proveedor lleva su propia cuenta; n < 1 se toma como 1', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const a = [];
      for (let i = 0; i < 4; i++) a.push((await t.query(`select public.ia_turno('qwen', 3) as v`))[0].v);
      const otro = (await t.query(`select public.ia_turno('gemini', 2) as v`))[0].v;
      const cero = (await t.query(`select public.ia_turno('uno', 0) as v`))[0].v;
      return { a, otro, cero };
    });
    igual(x.a, [1, 2, 0, 1]);
    igual([x.otro, x.cero], [1, 0], 'gemini empieza en 1; con n = 0 el módulo es 1 y todo da 0');
  });
  prueba('CU-15 dos siguiente() en la misma transacción son CONSECUTIVOS; tras ROLLBACK el número se reutiliza (nadie lo vio) y tras COMMIT no', async () => {
    const db = await plantilla();
    const sig = tx => tx.query(`select interno.siguiente('al3d', 'cu15', '', 1)::int as n`).then(r => r.rows[0].n);
    const a = await db.transaction(async tx => { const r = [await sig(tx), await sig(tx)]; await tx.rollback(); return r; });
    const b = await db.transaction(async tx => [await sig(tx), await sig(tx)]);
    const c = await db.transaction(async tx => [await sig(tx)]);
    igual(a, [1, 2], 'consecutivos');
    igual(b, [1, 2], 'tras el rollback se reutilizan');
    igual(c, [3], 'tras el commit, sigue');
  });
  prueba('CU-15 lo mismo visto desde el rol: ia_turno devuelve el mismo número en dos peticiones deshechas y avanza cuando la petición se confirma', async () => {
    const db = await plantilla();
    const sr = como(db, { rol: 'service_role' }), srC = como(db, { rol: 'service_role', confirmar: true });
    const v = s => s.query(`select public.ia_turno('cu15', 100) as v`).then(r => r[0].v);
    igual([await v(sr), await v(sr)], [1, 1]);
    igual([await v(srC), await v(srC)], [1, 2]);
    igual(await v(sr), 3);
  });
});

describir('CU-14 solo service_role', () => {
  const LLAMADAS = [
    ['ia_cuota', { p_usuario: U1 }], ['verificar_cupo', { p_folio_corto: 'COT-0042' }],
    ['contador_sembrar', { p_empresa: 'al3d', p_clave: 'V', p_minimo: 1 }], ['ia_turno', { p_prov: 'qwen', p_n: 3 }],
  ];
  for (const quien of ['dir', 'fab', 'pag']) {
    prueba(`CU-14 ${quien} (authenticated) no puede ejecutar ia_cuota, verificar_cupo, contador_sembrar ni ia_turno: permission denied`, async () => {
      const db = await plantilla();
      for (const [f, a] of LLAMADAS) await esperarError(sesionDe(db, db.u[quien]).rpc(f, a), '42501', f);
    });
  }
  prueba('CU-14 anon tampoco', async () => {
    const db = await plantilla();
    for (const [f, a] of LLAMADAS) await esperarError(ANON(db).rpc(f, a), '42501', f);
  });
  prueba('CU-14 PERMITIDO: service_role ejecuta las cuatro', async () => {
    const db = await plantilla();
    for (const [f, a] of LLAMADAS) igual((await SR(db).rpc(f, a)).length, 1, f);
  });
  prueba('CU-14 la tabla contadores no se lee ni se escribe desde un cliente: authenticated y anon sin SELECT (42501); service_role no puede borrar (la limpieza la hacen las funciones)', async () => {
    const db = await plantilla();
    await esperarError(sesionDe(db, db.u.dir).query(`select * from public.contadores`), '42501', 'authenticated lee');
    await esperarError(sesionDe(db, db.u.dir).query(`update public.contadores set n = 0`), '42501', 'authenticated escribe');
    await esperarError(ANON(db).query(`select * from public.contadores`), '42501', 'anon lee');
    igual((await SR(db).query(`select count(*)::int as n from public.contadores`))[0].n >= 2, true, 'service_role la lee');
    await esperarError(SR(db).query(`delete from public.contadores`), '42501', 'service_role borra');
  });
  prueba('CU-14 las funciones de cupos no se pueden llamar con el esquema interno: authenticated no puede ejecutar interno.siguiente ni interno.dia_mx', async () => {
    const db = await plantilla();
    await esperarError(sesionDe(db, db.u.dir).query(`select interno.siguiente('al3d', 'V', '', 1)`), '42501', 'siguiente');
    await esperarError(sesionDe(db, db.u.dir).query(`select interno.dia_mx(now())`), '42501', 'dia_mx');
    await esperarError(SR(db).query(`select interno.siguiente('al3d', 'V', '', 1)`), '42501', 'service_role tampoco llama a las internas');
  });
});

await resumen();
