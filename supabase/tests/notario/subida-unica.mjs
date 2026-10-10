// La subida única del historial del cotizador — A.md §5.12 y §10.11, casos NO-22, NO-23 y NO-24 (y IM-12: dos COT-0042 de aparatos distintos).
//
// Es la PUERTA DE SALIDA de lo que solo existe en un teléfono (al3d_historial, al3d_queue, hitos, cuadernos, bitácora local, el folio máximo del aparato).
// Sin esta subida, con acuse POR REGISTRO, el borrado local por revocación no se puede habilitar. Reglas que se prueban:
//   · cualquier miembro sube lo SUYO; Dirección sube lo de cualquiera; Fabricación escribe y NUNCA lee de vuelta;
//   · la unión es por (folio, disp), no por «folio» a secas; los conflictos NO se resuelven aquí: no se sobrescribe y se avisa en el acuse;
//   · idempotente: por `folio_global` en las cotizaciones y por `op_id` («tel:<disp>:<id>») en la bitácora;
//   · las imágenes (data URLs, aiFile.url) NO entran a la base; el contador del aparato solo sube.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { sesionDe, llamar, una, sql, conCopia, como } from '../comun/semilla.js';
import { crearBaseNotario } from '../comun/notario.js';

const plantilla = dato(crearBaseNotario, { limpiar: db => db.close() });
const subir = (db, quien, lote, o) => llamar(sesionDe(db, db.u[quien], { confirmar: true, ...o }), 'subida_unica', { p_lote: lote });
const entrada = (n, extra = {}) => ({ folio: 'COT-' + String(n).padStart(4, '0') + '-B', disp: 'K7QM', proy: 'Tacos ' + n, cliente: 'Juan', tel: '33 1234 5678', neto: 1000,
  items: [{ id: 1, tipo: 'Letras' }], aiFile: { name: 'a.png', type: 'image/png', url: 'data:image/png;base64,AAAA' }, ...extra });
const estados = r => r.acuse.map(x => x.estado);

describir('NO-22 cotizaciones del historial', () => {
  const LOTE = { disp: 'K7QM', letra_folio: 'B', folio_max: 42, cotizaciones: [entrada(42)], hitos: { 'COT-0042-B': { pdf: 111, wa: 222 } }, canva: { 'COT-0042-B': { primera: 1, ultima: 2, veces: 1 } } };
  prueba('NO-22 crea: acuse «creada» por registro; la cotización queda autorizada, a nombre de quien sube, con hitos y propuesta, SIN data URL ni aiFile.url, y el contador del aparato en 42', () => conCopia(plantilla, async db => {
    const r = await subir(db, 'pag', LOTE);
    igual([r.ok, estados(r), r.resumen], [true, ['creada'], { creadas: 1, ya_estaban: 0, conflictos: 0, rechazadas: 0 }]);
    igual(r.acuse[0], { tipo: 'cotizacion', id: 'COT-0042-B@K7QM', estado: 'creada' });
    const c = await una(db, `select estado, creado_por::text as por, datos, hitos, procedencia, folio, disp, proy from public.cotizaciones where folio_global = 'COT-0042-B@K7QM'`);
    igual([c.estado, c.por, c.folio, c.disp, c.proy], ['autorizada', db.u.pag.uid, 'COT-0042-B', 'K7QM', 'Tacos 42']);
    igual([c.hitos.pdf, c.hitos.wa, c.hitos.propuesta], [111, 222, { primera: 1, ultima: 2, veces: 1 }]);
    igual([c.procedencia.telefonos, c.procedencia.disp_inferido, typeof c.procedencia.subida_unica], [['K7QM'], false, 'string']);
    igual(['url' in c.datos.aiFile, c.datos.aiFile.name, JSON.stringify(c.datos).includes('data:')], [false, 'a.png', false]);
    igual((await una(db, `select n::int as n from public.contadores where clave = 'folio_cot:K7QM'`)).n, 42);
  }));
  prueba('NO-22 reintento del MISMO lote: «ya_estaba» (cero filas nuevas); datos distintos: «conflicto» SIN sobrescribir y el teléfono queda en procedencia (una vez)', () => conCopia(plantilla, async db => {
    await subir(db, 'pag', LOTE);
    igual(estados(await subir(db, 'pag', LOTE)), ['ya_estaba']);
    const otra = await subir(db, 'pag', { ...LOTE, cotizaciones: [entrada(42, { cliente: 'Otro' })] });
    igual([estados(otra), otra.resumen.conflictos, typeof otra.acuse[0].motivo], [['conflicto'], 1, 'string']);
    const c = await una(db, `select datos ->> 'cliente' as c, procedencia -> 'telefonos' as t from public.cotizaciones where folio_global = 'COT-0042-B@K7QM'`);
    igual([c.c, c.t], ['Juan', ['K7QM']], 'no se sobrescribió y K7QM no se repite');
    const desdeOtro = await subir(db, 'pag', { ...LOTE, disp: 'ZZ99', cotizaciones: [entrada(42, { cliente: 'Otro' })] });
    igual(estados(desdeOtro), ['conflicto']);
    igual((await una(db, `select procedencia -> 'telefonos' as t from public.cotizaciones where folio_global = 'COT-0042-B@K7QM'`)).t, ['K7QM', 'ZZ99'], 'otro teléfono con datos distintos se anota');
  }));
  prueba('NO-22 autor ajeno: Fabricación sobre una cotización de Pagos → «rechazada» (ROL_SIN_PERMISO) sin comparar ni revelar; Dirección sube lo de otro (ya_estaba)', () => conCopia(plantilla, async db => {
    await subir(db, 'pag', LOTE);
    const f = await subir(db, 'fab', LOTE);
    igual([estados(f), f.acuse[0].motivo, f.resumen.rechazadas], [['rechazada'], 'ROL_SIN_PERMISO', 1]);
    const fDistinto = await subir(db, 'fab', { ...LOTE, cotizaciones: [entrada(42, { cliente: 'Otro' })] });
    igual([estados(fDistinto), fDistinto.acuse[0].motivo], [['rechazada'], 'ROL_SIN_PERMISO'], 'ni siquiera dice si los datos coinciden');
    igual(estados(await subir(db, 'dir', LOTE)), ['ya_estaba']);
    igual((await una(db, `select procedencia -> 'telefonos' as t from public.cotizaciones where folio_global = 'COT-0042-B@K7QM'`)).t, ['K7QM'], 'el rechazo no toca la fila');
  }));
  prueba('NO-22 el disp de cada entrada: el suyo; si no, el de e.sello.folio; si no, el del lote; si no HIST+md5 con disp_inferido', () => conCopia(plantilla, async db => {
    const sinDisp = n => { const e = entrada(n); delete e.disp; return e; };
    const r = await subir(db, 'dir', { disp: 'LOTE', cotizaciones: [sinDisp(1), { ...sinDisp(2), sello: { folio: 'COT-0002-B@AB12' } }, entrada(3, { disp: 'PROP' })] });
    igual(estados(r), ['creada', 'creada', 'creada']);
    const f = await sql(db, `select folio_global, procedencia -> 'disp_inferido' as inf from public.cotizaciones order by folio_global`);
    igual(f.map(x => [x.folio_global, x.inf]), [['COT-0001-B@LOTE', false], ['COT-0002-B@AB12', false], ['COT-0003-B@PROP', false]]);
    const h = await subir(db, 'dir', { cotizaciones: [{ ...sinDisp(7), fecha: '2026-01-01' }] });
    igual(estados(h), ['creada']);
    const c = await una(db, `select folio_global, disp, procedencia -> 'disp_inferido' as inf, procedencia -> 'telefonos' as t from public.cotizaciones where folio = 'COT-0007-B'`);
    cierto(/^COT-0007-B@HIST[0-9a-f]{6}$/.test(c.folio_global), c.folio_global);
    igual([c.inf, c.t, c.disp.startsWith('HIST')], [true, [], true]);
    igual(estados(await subir(db, 'dir', { cotizaciones: [{ ...sinDisp(7), fecha: '2026-01-01' }] })), ['ya_estaba'], 'el HIST es estable: el mismo folio, cliente y fecha dan el mismo aparato inferido');
  }));
  prueba('NO-24 / IM-12 dos COT-0042 de aparatos distintos coexisten (folio_global distinto); la unión es por (folio, disp)', () => conCopia(plantilla, async db => {
    await subir(db, 'dir', { disp: 'K7QM', cotizaciones: [entrada(42)] });
    const r = await subir(db, 'dir', { disp: 'ZZZ9', cotizaciones: [entrada(42, { disp: 'ZZZ9', cliente: 'Otro cliente' })] });
    igual(estados(r), ['creada']);
    const f = await sql(db, `select folio_global, cliente from public.cotizaciones where folio = 'COT-0042-B' order by disp`);
    igual(f.map(x => [x.folio_global, x.cliente]), [['COT-0042-B@K7QM', 'Juan'], ['COT-0042-B@ZZZ9', 'Otro cliente']]);
  }));
  prueba('NO-22 el contador del aparato SOLO sube: un folio_max menor no lo baja; el de otro aparato es independiente', () => conCopia(plantilla, async db => {
    await subir(db, 'dir', { disp: 'K7QM', folio_max: 42, cotizaciones: [] });
    await subir(db, 'dir', { disp: 'K7QM', folio_max: 10, cotizaciones: [] });
    await subir(db, 'dir', { disp: 'OTRO', folio_max: 7, cotizaciones: [] });
    const n = async d => (await una(db, `select n::int as n from public.contadores where clave = $1`, ['folio_cot:' + d])).n;
    igual([await n('K7QM'), await n('OTRO')], [42, 7]);
    await subir(db, 'dir', { disp: 'K7QM', folio_max: 50, cotizaciones: [] });
    igual(await n('K7QM'), 50);
  }));
  prueba('NO-22 entradas inválidas: folio con espacios, sin folio, que no es objeto o con aparato inválido → «rechazada» por registro; el resto del lote sigue', () => conCopia(plantilla, async db => {
    const r = await subir(db, 'dir', { disp: 'K7QM', cotizaciones: [entrada(1, { folio: 'COT 1' }), entrada(2, { folio: undefined }), 'texto', entrada(3, { disp: 'a b' }), entrada(4)] });
    igual(estados(r), ['rechazada', 'rechazada', 'rechazada', 'rechazada', 'creada']);
    igual(r.acuse.slice(0, 4).map(x => x.motivo), ['DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO']);
    igual(r.resumen, { creadas: 1, ya_estaban: 0, conflictos: 0, rechazadas: 4 });
  }));
});

describir('NO-22 la cola de pendientes, cuadernos y bitácora', () => {
  const COLA = [{ folio: 'COT-0050-B', estado: 'pendiente', proy: 'Tacos 50', cliente: 'Ana', neto: 500, q: { proyecto: 'Tacos 50', cliente: 'Ana', iva: true, subtotal: 500, items: [{ id: 1, tipo: 'Letras', pu: 100 }] }, nota: 'urgente' },
                { folio: 'COT-0099-B', estado: 'autorizada', q: null }];
  const LOTE = { disp: 'K7QM', folio_max: 40, cotizaciones: [], cola: COLA, cuadernos: { 'tel:3312345678': 'llamar el lunes', 'tel:123': 'inválida' },
                 bitacora: [{ id: 'b1', accion: 'cambio', titulo: 'Algo' }, { id: 'b2', accion: 'etapa', titulo: 'Pasó a cortado', entidad: 'proyecto', entidad_id: 'p1', ts: 1760000000000 }] };
  prueba('NO-22 la cola «pendiente» con q crea cotización pendiente + solicitud pendiente (de quien sube); el «fantasma» (q:null) solo aporta su folio al contador', () => conCopia(plantilla, async db => {
    const r = await subir(db, 'pag', LOTE);
    igual(r.acuse.filter(x => x.tipo === 'cola').map(x => [x.id, x.estado]), [['COT-0050-B@K7QM', 'creada'], ['COT-0099-B', 'ya_estaba']]);
    const s = await una(db, `select estado, solicito_id::text as por, solicito_texto, nota, subtotal::text as sub, procedencia ? 'subida_unica' as sub_u from public.solicitudes where folio_global = 'COT-0050-B@K7QM'`);
    igual([s.estado, s.por, s.solicito_texto, s.nota, s.sub, s.sub_u], ['pendiente', db.u.pag.uid, db.u.pag.correo, 'urgente', '500', true]);
    igual(await una(db, `select estado, creado_por::text as por, procedencia -> 'telefonos' as t from public.cotizaciones where folio_global = 'COT-0050-B@K7QM'`), { estado: 'pendiente', por: db.u.pag.uid, t: ['K7QM'] });
    igual((await una(db, `select count(*)::int as n from public.cotizaciones where folio_global = 'COT-0099-B@K7QM'`)).n, 0, 'el fantasma no crea cotización');
    igual((await una(db, `select n::int as n from public.contadores where clave = 'folio_cot:K7QM'`)).n, 99, 'pero su folio sube el contador');
  }));
  prueba('NO-22 reintento: la cola es «ya_estaba» (una solicitud, no dos); cuadernos y bitácora idempotentes por clave y por op_id', () => conCopia(plantilla, async db => {
    await subir(db, 'pag', LOTE);
    const r = await subir(db, 'pag', LOTE);
    igual(r.acuse.map(x => [x.tipo, x.id, x.estado]).sort(), [['bitacora', 'b1', 'ya_estaba'], ['bitacora', 'b2', 'ya_estaba'], ['cola', 'COT-0050-B@K7QM', 'ya_estaba'], ['cola', 'COT-0099-B', 'ya_estaba'],
                                                                  ['cuaderno', 'tel:123', 'rechazada'], ['cuaderno', 'tel:3312345678', 'ya_estaba']]);
    igual((await una(db, `select count(*)::int as n from public.solicitudes where folio_global = 'COT-0050-B@K7QM'`)).n, 1);
    igual((await una(db, `select count(*)::int as n from public.bitacora where op_id like 'tel:K7QM:%'`)).n, 2, 'el op_id repetido no duplica');
    igual((await una(db, `select count(*)::int as n from public.cuaderno_notas`)).n, 1);
    igual(r.resumen, { creadas: 0, ya_estaban: 5, conflictos: 0, rechazadas: 1 });
  }));
  prueba('NO-22 la cola con q inválido (sin partidas) se rechaza con el mensaje; sin disp en el lote, la cola y la bitácora se rechazan por registro; lo que no está pendiente no sube nada', () => conCopia(plantilla, async db => {
    const mala = await subir(db, 'dir', { disp: 'K7QM', cola: [{ folio: 'COT-0060-B', estado: 'pendiente', q: { proyecto: 'x', iva: true, subtotal: 1, items: [] } }] });
    igual([estados(mala), mala.acuse[0].motivo], [['rechazada'], 'La cotización no trae partidas.']);
    const sinDisp = await subir(db, 'dir', { cola: COLA.slice(0, 1), bitacora: [{ id: 'b9', accion: 'x' }] });
    igual([estados(sinDisp), sinDisp.acuse.map(x => x.motivo)], [['rechazada', 'rechazada'], ['DATO_INVALIDO', 'DATO_INVALIDO']]);
    const resuelta = await subir(db, 'dir', { disp: 'K7QM', cola: [{ folio: 'COT-0061-B', estado: 'rechazada', q: COLA[0].q }] });
    igual([estados(resuelta), resuelta.acuse[0].motivo], [['ya_estaba'], 'Sin datos que subir.']);
    igual((await una(db, `select count(*)::int as n from public.cotizaciones`)).n, 0);
  }));
  prueba('NO-22 cuadernos: la misma nota = ya_estaba; una nota distinta NO se sobrescribe (conflicto); la clave inválida se rechaza', () => conCopia(plantilla, async db => {
    await subir(db, 'dir', { disp: 'K7QM', cuadernos: { 'tel:3312345678': 'primera' } });
    const r = await subir(db, 'dir', { disp: 'K7QM', cuadernos: { 'tel:3312345678': 'segunda', 'nom:ana lópez': 'otra', 'x': 'y', 'tel:3300000000': 'z'.repeat(1201) } });
    igual(r.acuse.map(x => [x.id, x.estado]).sort(), [['nom:ana lópez', 'creada'], ['tel:3300000000', 'rechazada'], ['tel:3312345678', 'conflicto'], ['x', 'rechazada']]);
    igual((await una(db, `select nota from public.cuaderno_notas where clave = 'tel:3312345678'`)).nota, 'primera');
    const otraPersona = await subir(db, 'pag', { disp: 'K7QM', cuadernos: { 'tel:3312345678': 'la mía' } });
    igual(estados(otraPersona), ['creada'], 'la nota es POR AUTOR');
    igual((await una(db, `select count(*)::int as n from public.cuaderno_notas where clave = 'tel:3312345678'`)).n, 2);
  }));
  prueba('NO-22 bitácora local: nivel por LISTA BLANCA (etapa, agendo, reagendo, marco, cancelo → general; el resto → dinero); entidad desconocida → plataforma; op_id tel:<disp>:<id>; ts en ms o ISO; el autor es quien sube', () => conCopia(plantilla, async db => {
    const b = [{ id: 'e1', accion: 'etapa', titulo: 'A cortado' }, { id: 'e2', accion: 'agendo', titulo: 'Agendó' }, { id: 'e3', accion: 'ganar', titulo: 'Ganó con $5000.00' }, { id: 'e4', accion: 'actualizar', titulo: 'Cambió la cuenta' },
               { id: 'e5', accion: 'etapa', titulo: 'x', entidad: 'rara' }, { id: 'e6', accion: 'etapa', titulo: 'x', ts: '2026-09-01T10:00:00.000Z' }, { id: 'e7', accion: 'etapa', ts: 1760000000000, usuario: 'dir@al3d.test', rol: 'direccion' }];
    const r = await subir(db, 'fab', { disp: 'FAB1', bitacora: b });
    igual(estados(r), Array(7).fill('creada'));
    const f = await sql(db, `select op_id, nivel, entidad, titulo, dispositivo, usuario_id::text as u, ts from public.bitacora where op_id like 'tel:FAB1:%' order by op_id`);
    igual(f.map(x => [x.op_id, x.nivel, x.entidad]), [['tel:FAB1:e1', 'general', 'plataforma'], ['tel:FAB1:e2', 'general', 'plataforma'], ['tel:FAB1:e3', 'dinero', 'plataforma'], ['tel:FAB1:e4', 'dinero', 'plataforma'],
                                                      ['tel:FAB1:e5', 'general', 'plataforma'], ['tel:FAB1:e6', 'general', 'plataforma'], ['tel:FAB1:e7', 'general', 'plataforma']]);
    igual([f[0].dispositivo, f[0].u, f[6].titulo], ['FAB1', db.u.fab.uid, 'Evento de un teléfono']);
    igual([f[5].ts.toISOString(), f[6].ts.toISOString()], ['2026-09-01T10:00:00.000Z', '2025-10-09T08:53:20.000Z']);
    const fab = (await sesionDe(db, db.u.fab).query(`select op_id from public.bitacora where op_id like 'tel:FAB1:%' order by op_id`)).map(x => x.op_id);
    igual(fab, ['tel:FAB1:e1', 'tel:FAB1:e2', 'tel:FAB1:e5', 'tel:FAB1:e6', 'tel:FAB1:e7'], 'Fabricación ve las «general» y NO las de dinero');
  }));
  prueba('NO-22 la entidad conocida se respeta (proyecto, instalacion, material…) y los textos se recortan (titulo 200, detalle 600, accion 80)', () => conCopia(plantilla, async db => {
    await subir(db, 'dir', { disp: 'K7QM', bitacora: [{ id: 'z1', accion: 'etapa', entidad: 'proyecto', entidad_id: 'p1', titulo: 't'.repeat(300), detalle: 'd'.repeat(700), antes: { a: 1 }, despues: [1] }] });
    const f = await una(db, `select entidad, entidad_id, length(titulo) as lt, length(detalle) as ld, antes, despues from public.bitacora where op_id = 'tel:K7QM:z1'`);
    igual([f.entidad, f.entidad_id, f.lt, f.ld, f.antes, f.despues], ['proyecto', 'p1', 200, 600, { a: 1 }, [1]]);
  }));
});

describir('NO-23 Fabricación escribe y no lee de vuelta; el lote se valida', () => {
  prueba('NO-23 Fabricación sube SUS cotizaciones (escribe) y NO las lee de vuelta: 0 filas, también en solicitudes; Dirección las ve', () => conCopia(plantilla, async db => {
    const r = await subir(db, 'fab', { disp: 'FAB1', cotizaciones: [entrada(7, { disp: 'FAB1' })], cola: [{ folio: 'COT-0008-B', estado: 'pendiente', q: { proyecto: 'x', iva: true, subtotal: 5, items: [{ id: 1 }] } }] });
    igual(estados(r), ['creada', 'creada']);
    const F = sesionDe(db, db.u.fab);
    igual([(await F.query(`select count(*)::int as n from public.cotizaciones`))[0].n, (await F.query(`select count(*)::int as n from public.solicitudes`))[0].n], [0, 0]);
    igual((await sesionDe(db, db.u.dir).query(`select count(*)::int as n from public.cotizaciones where disp = 'FAB1'`))[0].n, 2);
  }));
  prueba('NO-22 lote fuera de tope o mal formado → DATO_INVALIDO: 51 cotizaciones, 51 de la cola, 201 de bitácora; listas que no son listas; objetos que no son objetos; disp inválido; folio_max fuera de rango', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    const malos = [['51 cotizaciones', { disp: 'K7QM', cotizaciones: Array.from({ length: 51 }, (_, i) => entrada(i + 100)) }], ['51 de la cola', { disp: 'K7QM', cola: Array.from({ length: 51 }, (_, i) => ({ folio: 'COT-' + i, estado: 'x' })) }],
                   ['201 de bitácora', { disp: 'K7QM', bitacora: Array.from({ length: 201 }, (_, i) => ({ id: 'b' + i })) }], ['cotizaciones objeto', { disp: 'K7QM', cotizaciones: {} }], ['cola texto', { disp: 'K7QM', cola: 'x' }],
                   ['hitos lista', { disp: 'K7QM', hitos: [] }], ['cuadernos lista', { disp: 'K7QM', cuadernos: [] }], ['disp inválido', { disp: 'a b', cotizaciones: [] }], ['disp largo', { disp: 'x'.repeat(25) }],
                   ['folio_max enorme', { disp: 'K7QM', folio_max: 2e9 }], ['folio_max negativo', { disp: 'K7QM', folio_max: -1 }], ['lote texto', JSON.stringify('x')], ['lote lista', '[]']];
    for (const [que, lote] of malos) {
      const r = await llamar(D, 'subida_unica', { p_lote: lote });
      igual([que, r.ok, r.codigo, r.definitivo], [que, false, 'DATO_INVALIDO', true]);
    }
    const tope = await llamar(D, 'subida_unica', { p_lote: { disp: 'K7QM', cotizaciones: Array.from({ length: 50 }, (_, i) => entrada(i + 100)), bitacora: Array.from({ length: 200 }, (_, i) => ({ id: 'b' + i, accion: 'etapa' })) } });
    igual([tope.ok, tope.resumen.creadas], [true, 250], 'en el tope exacto sí pasa');
  });
  prueba('NO-22 un lote vacío es válido (acuse vacío); sin acceso (ext / baja) no sube; anon: permission denied', async () => {
    const db = await plantilla();
    const v = await llamar(sesionDe(db, db.u.dir), 'subida_unica', { p_lote: {} });
    igual([v.ok, v.acuse, v.resumen], [true, [], { creadas: 0, ya_estaban: 0, conflictos: 0, rechazadas: 0 }]);
    igual((await llamar(sesionDe(db, db.u.ext), 'subida_unica', { p_lote: {} })).codigo, 'SIN_ACCESO');
    igual((await llamar(sesionDe(db, db.u.baja), 'subida_unica', { p_lote: {} })).codigo, 'ACCESO_REVOCADO');
    await esperarError(como(db, { rol: 'anon' }).rpc('subida_unica', { p_lote: {} }), '42501');
  });
  prueba('NO-22 el acuse trae UN registro por cada cosa subida (cotizaciones + cola + cuadernos + bitácora)', () => conCopia(plantilla, async db => {
    const r = await subir(db, 'dir', { disp: 'K7QM', cotizaciones: [entrada(1), entrada(2)], cola: [{ folio: 'COT-0003-B', estado: 'pendiente', q: { proyecto: 'x', iva: true, subtotal: 5, items: [{ id: 1 }] } }],
                                         cuadernos: { 'tel:3312345678': 'n' }, bitacora: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    igual(r.acuse.length, 2 + 1 + 1 + 3);
    igual(r.acuse.map(x => x.tipo), ['cotizacion', 'cotizacion', 'cola', 'cuaderno', 'bitacora', 'bitacora', 'bitacora']);
    igual(r.resumen.creadas, 7);
  }));
});

await resumen();
