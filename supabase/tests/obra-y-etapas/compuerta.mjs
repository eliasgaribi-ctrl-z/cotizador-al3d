// La compuerta de sellos por campo (R3) a nivel de RPC — A.md §5.4 y §10.5, casos SE-01..SE-20, SE-23 y SE-24.
// (SE-21 y SE-22, la función pura, están en utilidades-puras.mjs; SE-14, la cita, en instalaciones.mjs.)
//
// «Gana el cambio más reciente, dato por dato», ahora decidido en la BASE: el empate al subir ESCRIBE; un valor vacío sin sello no borra; la
// etapa y la entrega no se vacían; el sello se acota a `ahora + 10 min`; y una operación SIN sellos ya no gana siempre (Q-A05).
//
// Todos parten de p1 = {etapa:'cortado', notas:'mía', plazo_k:2, dir_texto:'Calle 1', lat:20.1, lng:-103.1, entrega:'instalacion',
// sellos:{etapa:100, notas:100, tel:100}} (la semilla). Cada caso corre en UNA petición que se deshace sola.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, rpcT, una } from '../comun/semilla.js';

const base = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

const AHORA = () => Date.now();
const ESTADO = `select notas, tel, dir_texto, lat, lng, maps_url, geo_fuente, entrega, plazo_k, etapa, entrecalles, ubicacion_pendiente, contacto, negocio, tipo_trabajo,
                       compromiso_texto, fecha_anticipo::text as fecha_anticipo, sellos, updated_at::text as ts from public.proyectos where id = $1`;

/** Corre `fn(t)` como el usuario `quien` en UNA petición (se deshace al terminar) y devuelve lo que `fn` devuelva. */
async function como_(quien, fn) { const db = await base(); return sesionDe(db, db.u[quien]).transaccion(fn); }
/** proyecto_actualizar sobre p1 con los campos y sellos dados; devuelve {r: respuesta, e: estado de p1 después}. */
async function editar(quien, campos, sellos, id = 'p1') {
  return como_(quien, async t => {
    const r = await rpcT(t, 'proyecto_actualizar', { p_op: { id, campos, ...(sellos === undefined ? {} : { sellos }) } });
    return { r, e: (await t.query(ESTADO, [id]))[0] };
  });
}

describir('SE-01..SE-06 el reglamento básico: viejos, empate, vaciar, sin sello', () => {
  prueba('SE-01 etapa y tel con sello 200 se escriben; notas con sello 50 va a «viejos» y su sello sigue en 100', async () => {
    const x = await como_('dir', async t => {
      const a = await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'de la hoja', tel: '33 9' }, sellos: { notas: 50, tel: 200 } } });
      const m = await rpcT(t, 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: 200 });
      return { a, m, e: (await t.query(ESTADO, ['p1']))[0] };
    });
    igual(x.a.escritos, ['tel']);
    igual(x.a.viejos, [{ nombre: 'notas', por: 'ya tenía un cambio más reciente' }]);
    igual(x.a.rechazadas, []);
    igual([x.m.ok, x.m.etapa], [true, 'armado']);
    igual([x.e.etapa, x.e.tel, x.e.notas], ['armado', '33 9', 'mía']);
    igual([x.e.sellos.etapa, x.e.sellos.tel, x.e.sellos.notas], [200, 200, 100]);
  });
  prueba('SE-02 el EMPATE escribe: notas «otra» con sello igual al guardado (100)', async () => {
    const x = await editar('dir', { notas: 'otra' }, { notas: 100 });
    igual([x.r.escritos, x.e.notas, x.e.sellos.notas], [['notas'], 'otra', 100]);
  });
  prueba('SE-03 notas vacías con sello 300 borran y el sello sube a 300', async () => {
    const x = await editar('dir', { notas: '' }, { notas: 300 });
    igual([x.r.escritos, x.e.notas, x.e.sellos.notas], [['notas'], '', 300]);
  });
  prueba('SE-04 notas vacías con el objeto sellos presente pero SIN la clave notas: viejos (llega 0 < tiene 100)', async () => {
    const x = await editar('dir', { notas: '' }, { tel: 5 });
    igual([x.r.escritos, x.r.viejos.map(v => v.nombre), x.e.notas], [[], ['notas'], 'mía']);
  });
  prueba('SE-05 vacío sin sello sobre un proyecto sin sello de notas: rechazada «vacío sin sello no borra»', async () => {
    const x = await editar('dir', { notas: '' }, { notas: 0 }, 'p2');
    igual(x.r.rechazadas, [{ nombre: 'notas', por: 'vacío sin sello no borra' }]);
    igual(x.r.escritos, []);
  });
  prueba('SE-06 entrega vacía (null, sello 300) vía proyecto_actualizar: rechazada «no se puede vaciar»; nada cambia', async () => {
    const x = await editar('dir', { entrega: null }, { entrega: 300 });
    igual(x.r.rechazadas, [{ nombre: 'entrega', por: 'este dato no se puede vaciar' }]);
    igual([x.e.entrega, x.e.sellos.entrega], ['instalacion', undefined]);
    const y = await editar('dir', { entrega: '' }, { entrega: 300 });
    igual(y.r.rechazadas.length, 1);
  });
});

describir('SE-07 y SE-08 el sello se acota; sin sellos no hay escritura', () => {
  prueba('SE-07 un sello de ahora + 1 h se guarda como ahora + 10 min', async () => {
    const ahora = AHORA(), x = await editar('dir', { notas: 'futuro' }, { notas: ahora + 3_600_000 });
    const g = x.e.sellos.notas;
    cierto(Math.abs(g - (ahora + 600_000)) < 30_000, `se guardó ${g - ahora} ms por delante de ahora (esperado ≈ 600000)`);
  });
  prueba('SE-08 campos sellados SIN objeto sellos → DATO_INVALIDO definitivo (antes ganaba siempre con la hora de llegada)', async () => {
    const x = await editar('dir', { notas: 'x' }, undefined);
    igual([x.r.ok, x.r.codigo, x.r.definitivo], [false, 'DATO_INVALIDO', true]);
    igual(x.e.notas, 'mía');
    const y = await editar('dir', { notas: 'x' }, 'no es un objeto');
    igual(y.r.codigo, 'DATO_INVALIDO');
  });
  prueba('SE-08 sin campos sellados el objeto sellos no hace falta (contacto y tipo_trabajo no se sellan)', async () => {
    const x = await editar('dir', { contacto: 'Nuevo' }, undefined);
    igual([x.r.ok, x.r.escritos, x.e.contacto], [true, ['contacto'], 'Nuevo']);
  });
});

describir('SE-09 y SE-10 plazo, converger y no ensuciar', () => {
  prueba('SE-09 plazo_k null (sello 400) borra (vuelve al propuesto) y el sello sube a 400', async () => {
    const x = await editar('dir', { plazo_k: null }, { plazo_k: 400 });
    igual([x.r.escritos, x.e.plazo_k, x.e.sellos.plazo_k], [['plazo_k'], null, 400]);
  });
  prueba('SE-10 mismo valor y sello más nuevo: el valor no cambia pero el SELLO sube (converge) y updated_at también', async () => {
    const x = await como_('dir', async t => {
      const antes = (await t.query(ESTADO, ['p1']))[0];
      const r = await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'mía' }, sellos: { notas: 500 } } });
      return { antes, r, despues: (await t.query(ESTADO, ['p1']))[0] };
    });
    igual([x.r.escritos, x.despues.notas, x.despues.sellos.notas], [['notas'], 'mía', 500]);
    cierto(x.despues.ts > x.antes.ts, 'updated_at avanza porque cambió `sellos`');
  });
  prueba('SE-10 mismo valor y MISMO sello (reintento): no se escribe nada, ni sellos ni updated_at', async () => {
    const x = await como_('dir', async t => {
      const antes = (await t.query(ESTADO, ['p1']))[0];
      const r = await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'mía' }, sellos: { notas: 100 } } });
      return { antes, r, despues: (await t.query(ESTADO, ['p1']))[0] };
    });
    igual(x.despues.sellos, x.antes.sellos);
    igual(x.despues.ts, x.antes.ts, 'updated_at no se movió');
    igual(x.r.ok, true);
  });
});

describir('SE-11 y SE-12 ubicación y teléfono', () => {
  for (const quien of ['dir', 'fab']) {
    prueba(`SE-11 (${quien}) lat sin lng, el pin (0, 0) y lat=91 → rechazadas; el pin válido se escribe`, async () => {
      for (const [campos, nombre] of [[{ lat: 20 }, 'lat sin lng'], [{ lat: 0, lng: 0 }, '(0,0)'], [{ lat: 91, lng: 10 }, 'lat=91'], [{ lat: 10, lng: 181 }, 'lng=181']]) {
        const x = await editar(quien, campos, { ubicacion: 300 });
        igual(x.r.rechazadas.map(r => r.nombre), ['ubicacion'], nombre);
        igual([x.e.lat, x.e.lng], [20.1, -103.1], nombre + ': nada cambió');
      }
      const ok = await editar(quien, { lat: 20.67, lng: -103.35, maps_url: 'https://maps.app.goo.gl/x', geo_fuente: 'maps_pin' }, { ubicacion: 300 });
      igual([ok.r.escritos, ok.e.lat, ok.e.lng, ok.e.maps_url, ok.e.geo_fuente, ok.e.sellos.ubicacion], [['ubicacion'], 20.67, -103.35, 'https://maps.app.goo.gl/x', 'maps_pin', 300]);
    });
  }
  prueba('SE-11 la ubicación vacía (lat y lng nulos y maps_url vacío) con sello borra todo el grupo', async () => {
    const x = await editar('dir', { lat: null, lng: null, maps_url: '', geo_fuente: '' }, { ubicacion: 300 });
    igual([x.r.escritos, x.e.lat, x.e.lng, x.e.maps_url, x.e.sellos.ubicacion], [['ubicacion'], null, null, '', 300]);
  });
  for (const quien of ['dir', 'fab', 'pag']) {
    prueba(`SE-12 (${quien}) tel: «abc» se rechaza; «33 1234 5678» y «+52 (33) 1234-5678» pasan; 40 caracteres se recortan a 30`, async () => {
      const mal = await editar(quien, { tel: 'abc' }, { tel: 300 });
      igual(mal.r.rechazadas.map(r => r.nombre), ['tel']);
      for (const t of ['33 1234 5678', '+52 (33) 1234-5678']) igual((await editar(quien, { tel: t }, { tel: 300 })).e.tel, t);
      const largo = await editar(quien, { tel: '3'.repeat(40) }, { tel: 300 });
      igual(largo.e.tel.length, 30);
    });
  }
});

describir('SE-13 y SE-23 el orden de llegada no cambia el resultado (conmutan por sello)', () => {
  prueba('SE-13 notas de A (sello 150) y de B (sello 200) en el orden B → A: gana B y A va a «viejos»', async () => {
    const x = await como_('dir', async t => {
      await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'de B' }, sellos: { notas: 200 } } });
      const a = await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'de A' }, sellos: { notas: 150 } } });
      return { a, e: (await t.query(ESTADO, ['p1']))[0] };
    });
    igual([x.e.notas, x.e.sellos.notas, x.a.viejos.map(v => v.nombre)], ['de B', 200, ['notas']]);
  });
  prueba('SE-23 dos operaciones sobre el mismo proyecto en AMBOS órdenes de llegada: el mismo estado final', async () => {
    const A = { campos: { notas: 'de A', tel: '33 0001', plazo_k: 3 }, sellos: { notas: 150, tel: 400, plazo_k: 150 } };
    const B = { campos: { notas: 'de B', tel: '33 0002', plazo_k: 4 }, sellos: { notas: 200, tel: 300, plazo_k: 200 } };
    const final = async orden => como_('dir', async t => {
      for (const op of orden) await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', ...op } });
      const e = (await t.query(ESTADO, ['p1']))[0];
      return { notas: e.notas, tel: e.tel, plazo_k: e.plazo_k, sellos: e.sellos };
    });
    const ab = await final([A, B]), ba = await final([B, A]);
    igual(ab, ba);
    igual([ab.notas, ab.tel, ab.plazo_k], ['de B', '33 0001', 4], 'cada dato lo gana su sello más nuevo');
  });
});

describir('SE-15 a SE-17 sello cero, ausente o raro', () => {
  prueba('SE-15 sellos {notas: 0} con tiene=0 y un valor NO vacío: escribe y NO crea sello', async () => {
    const x = await editar('dir', { notas: 'con sello cero' }, { notas: 0 }, 'p2');
    igual([x.r.escritos, x.e.notas, 'notas' in x.e.sellos], [['notas'], 'con sello cero', false]);
  });
  prueba('SE-16 tiene>0 y llega=0 (clave ausente o 0): «viejos»', async () => {
    const x = await editar('dir', { notas: 'x' }, { notas: 0 });
    igual([x.r.viejos.map(v => v.nombre), x.e.notas], [['notas'], 'mía']);
  });
  prueba('SE-17 el sello como «250», «abc», -5 y 250.9 → 250, 0, 0 y 250 (sobre un proyecto sin sello)', async () => {
    for (const [sello, esperado] of [['250', 250], ['abc', undefined], [-5, undefined], [250.9, 250], [{}, undefined], [null, undefined]]) {
      const x = await editar('dir', { notas: 'prueba' }, { notas: sello }, 'p2');
      igual(x.e.sellos.notas, esperado, JSON.stringify(sello));
      igual(x.e.notas, 'prueba');
    }
  });
});

describir('SE-18 y SE-19 campos sin sello y campos bloqueados', () => {
  prueba('SE-18 contacto, negocio, tipo_trabajo, compromiso_texto, fecha_anticipo, entrecalles y ubicacion_pendiente SIEMPRE se escriben (último en llegar gana)', async () => {
    const x = await editar('dir', { contacto: 'Contacto', negocio: 'Negocio', tipo_trabajo: ['Recorte acrilico'], compromiso_texto: 'para el viernes',
                                    fecha_anticipo: '2026-09-15', entrecalles: 'A y B', ubicacion_pendiente: true });
    igual(x.r.escritos.sort(), ['compromiso_texto', 'contacto', 'entrecalles', 'fecha_anticipo', 'negocio', 'tipo_trabajo', 'ubicacion_pendiente']);
    igual([x.e.contacto, x.e.negocio, x.e.tipo_trabajo, x.e.compromiso_texto, x.e.fecha_anticipo, x.e.entrecalles, x.e.ubicacion_pendiente],
          ['Contacto', 'Negocio', ['Recorte acrilico'], 'para el viernes', '2026-09-15', 'A y B', true]);
  });
  prueba('SE-18 valores inválidos de campos sin sello: rechazados con su razón, sin abortar el resto', async () => {
    const x = await editar('dir', { tipo_trabajo: ['Letrero raro'], fecha_anticipo: '10/10/26', ubicacion_pendiente: 'sí', contacto: 'Bueno' });
    igual(x.r.rechazadas.map(r => r.nombre).sort(), ['fecha_anticipo', 'tipo_trabajo', 'ubicacion_pendiente']);
    igual([x.r.escritos, x.e.contacto], [['contacto'], 'Bueno']);
  });
  prueba('SE-19 sub, neto, iva, etapa, folio_global, id, estatus y cuenta en proyecto_actualizar → rechazadas (BLOQUEADOS); lo demás se escribe', async () => {
    const x = await editar('dir', { sub: 1, neto: 2, iva: false, etapa: 'listo', folio_global: 'COT-9@X', id: 'otro', estatus: 'LIQUIDADO', cuenta: 'Elias BBVA', anticipo: 5, subtotal: 9, notas: 'sí pasa' }, { notas: 300 });
    igual(x.r.rechazadas.map(r => r.nombre).sort(), ['anticipo', 'cuenta', 'estatus', 'etapa', 'folio_global', 'id', 'iva', 'neto', 'sub', 'subtotal']);
    igual(x.r.rechazadas[0].por, 'el rol direccion no puede escribir esta propiedad');
    igual([x.r.escritos, x.e.notas, x.e.etapa], [['notas'], 'sí pasa', 'cortado']);
  });
});

describir('el origen (solo Dirección): la base lo PARTE en obra y dinero', () => {
  const ORIGEN = { folio: 'COT-0001', proy: 'Tacos Nuevos', cliente: 'Juan', items: [{ id: 1, tipo: 'caja', altura: 50, pu: 999, tarifa: 4100, _lt: 5000 }], precioAuth: 7777, neto: 9000, itemsAuth: { 1: 777 }, aiFile: { name: 'x.png', type: 'image/png', url: 'https://x.invalid/x.png' } };
  prueba('Dirección escribe un origen COMPLETO con precios: origen_obra queda SIN precios y ventas_dinero.origen_dinero CON ellos (y conserva lo que mandó el modal en «venta»)', async () => {
    const x = await como_('dir', async t => {
      const r = await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { origen: ORIGEN } } });
      return { r, o: (await t.query(`select origen_obra from public.proyectos where id = 'p1'`))[0].origen_obra, d: (await t.query(`select origen_dinero from public.ventas_dinero where proyecto_id = 'p1'`))[0].origen_dinero };
    });
    igual([x.r.ok, x.r.escritos], [true, ['origen']]);
    igual([x.o.proy, x.o.items, x.o.aiFile], ['Tacos Nuevos', [{ id: 1, tipo: 'caja', altura: 50 }], { name: 'x.png', type: 'image/png' }]);
    igual([x.d.precioAuth, x.d.neto, x.d.items['1'].pu, x.d.items['1'].tarifa, x.d.items['1']._lt], [7777, 9000, 999, 4100, 5000]);
  });
  prueba('Fabricación y Pagos NO pueden escribir origen: rechazada con su razón y nada cambia', async () => {
    for (const quien of ['fab', 'pag']) {
      const x = await editar(quien, { origen: ORIGEN }, {});
      igual([x.r.rechazadas.map(r => r.nombre), x.r.escritos], [['origen'], []], quien);
    }
  });
  prueba('un origen que no es un objeto se rechaza; una lápida (sin ventas_dinero) acepta la obra y no inventa dinero', async () => {
    const mal = await editar('dir', { origen: [1, 2] }, {});
    igual(mal.r.rechazadas.map(r => r.nombre), ['origen']);
    const x = await como_('dir', async t => {
      const r = await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p5', campos: { origen: ORIGEN } } });
      return { r, n: (await t.query(`select count(*)::int as n from public.ventas_dinero where proyecto_id = 'p5'`))[0].n, o: (await t.query(`select origen_obra->>'proy' as p from public.proyectos where id = 'p5'`))[0].p };
    });
    igual([x.r.escritos, x.n, x.o], [['origen'], 0, 'Tacos Nuevos']);
  });
});

describir('SE-20 Pagos: notas y tel sí; dir_texto, entrega y plazo_k no', () => {
  prueba('Pagos escribe notas y tel; dir_texto, entrega, plazo_k, lat y contacto van a rechazadas con su razón y NO aborta el resto', async () => {
    const x = await editar('pag', { notas: 'cobranza', tel: '33 5555', dir_texto: 'otra', entrega: 'paqueteria', plazo_k: 5, lat: 1, lng: 1, contacto: 'x' }, { notas: 300, tel: 300 });
    igual(x.r.escritos.sort(), ['notas', 'tel']);
    igual(x.r.rechazadas.map(r => r.nombre).sort(), ['contacto', 'dir_texto', 'entrega', 'lat', 'lng', 'plazo_k']);
    igual([x.e.notas, x.e.tel, x.e.dir_texto, x.e.entrega, x.e.plazo_k], ['cobranza', '33 5555', 'Calle 1', 'instalacion', 2]);
  });
  prueba('Fabricación: todo el taller (dir_texto, entrega, plazo, ubicación, entrecalles) pero no contacto, negocio, tipo, compromiso ni fecha_anticipo', async () => {
    const x = await editar('fab', { dir_texto: 'Calle 9', entrega: 'recoleccion', plazo_k: 5, entrecalles: 'X y Y', contacto: 'no', negocio: 'no', tipo_trabajo: [], compromiso_texto: 'no', fecha_anticipo: '2026-01-01', origen: {} },
                          { dir_texto: 300, entrega: 300, plazo_k: 300 });
    igual(x.r.escritos.sort(), ['dir_texto', 'entrecalles', 'entrega', 'plazo_k']);
    igual(x.r.rechazadas.map(r => r.nombre).sort(), ['compromiso_texto', 'contacto', 'fecha_anticipo', 'negocio', 'origen', 'tipo_trabajo']);
  });
});

describir('la respuesta: remoto sin dinero, nada de escribir si no hay qué, y quién puede', () => {
  prueba('remoto es la fila de proyectos (sin origen_obra ni procedencia) y NO trae ninguna clave de dinero', async () => {
    const x = await editar('fab', { notas: 'x' }, { notas: 300 });
    cierto(x.r.remoto && x.r.remoto.id === 'p1', 'trae la fila');
    for (const k of ['origen_obra', 'procedencia', 'subtotal', 'anticipo', 'liquidacion', 'cuenta', 'neto', 'saldo', 'costo_compra']) cierto(!(k in x.r.remoto), k + ' no debe viajar');
  });
  prueba('un proyecto que no existe o está borrado: NO_ENCONTRADO; una operación sin id o sin campos: DATO_INVALIDO', async () => {
    igual((await editar('dir', { notas: 'x' }, { notas: 1 }, 'no-existe')).r.codigo, 'NO_ENCONTRADO');
    const db = await base();
    const D = sesionDe(db, db.u.dir);
    igual((await D.rpc('proyecto_actualizar', { p_op: { campos: { notas: 'x' }, sellos: { notas: 1 } } }))[0].proyecto_actualizar.codigo, 'DATO_INVALIDO');
    igual((await D.rpc('proyecto_actualizar', { p_op: { id: 'p1' } }))[0].proyecto_actualizar.codigo, 'DATO_INVALIDO');
  });
  prueba('la bitácora de obra anota «Se editó…» con la lista de campos y SIN importes; una operación sin nada que escribir no anota', async () => {
    const x = await como_('dir', async t => {
      await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'otra nota' }, sellos: { notas: 300 } } });
      await rpcT(t, 'proyecto_actualizar', { p_op: { id: 'p1', campos: { notas: 'vieja' }, sellos: { notas: 10 } } });
      return (await t.query(`select nivel, titulo, detalle from public.bitacora where accion = 'cambio' and entidad_id = 'p1'`));
    });
    igual(x.map(b => [b.nivel, b.titulo, b.detalle]), [['general', 'Se editó Juan - Tacos (Caja de luz)', 'Campos: notas']]);
  });
});

describir('SE-24 un reintento tardío de «Se ganó» no regresa la etapa', () => {
  prueba('ganar_proyecto sobre un proyecto ya en armado devuelve ya_existia y la etapa NO regresa', async () => {
    const x = await como_('dir', async t => {
      await rpcT(t, 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: AHORA() });
      const r = await rpcT(t, 'ganar_proyecto', { p_op: { id: 'p1', folio_global: 'COT-0001@K7QM', nombre: 'Juan - Tacos (Caja de luz)', venta: { sub: 10000 }, sellos: { etapa: 50 } } });
      return { r, etapa: (await t.query(`select etapa from public.proyectos where id = 'p1'`))[0].etapa };
    });
    igual([x.r.ok, x.r.ya_existia, x.r.proyecto_id, x.r.folio_hoja, x.etapa], [true, true, 'p1', 'V-001', 'armado']);
  });
});

await resumen();
