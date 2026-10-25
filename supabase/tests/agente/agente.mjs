// El AGENTE DE VENTAS (0023, pedido por Elías el 2026-10-24): conversaciones con clientes, sus mensajes y la cola «Necesita tu
// decisión». Datos de mentiras.
//
//   AG-01  quién llama qué: anon nada; la app solo decidir; la función (service_role) solo abrir, leer y guardar
//   AG-02  una conversación de punta a punta: abrir, guardar vueltas, el estado que decide la base y una sola decisión pendiente
//   AG-03  decidir: solo Dirección de SU empresa; aprobar con precio, corregir pide algo, descartar la pierde; queda en la bitácora
//   AG-04  quién ve qué: Dirección sin la huella; los demás nada; los mensajes no se editan ni se borran
//   AG-05  los topes: conversaciones por hora y mensajes del cliente por día; y la auditoría limpia
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una, llamar, conCopia } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const HUELLA = c => c.repeat(64);
const servicio = db => como(db, { rol: 'service_role', confirmar: true });
const abrir = (db, h, empresa = 'al3d') => llamar(servicio(db), 'agente_abrir', { p_empresa: empresa, p_token_hash: h, p_canal: 'portal', p_contacto: { nombre: 'Daniel' } });
const leer = (db, h) => llamar(servicio(db), 'agente_leer', { p_token_hash: h });
const guardar = (db, h, o = {}) => llamar(servicio(db), 'agente_guardar', {
  p_token_hash: h, p_texto_cliente: o.cliente ?? 'Hola, quiero cotizar unas letras', p_texto_agente: o.agente ?? '¡Claro! ¿Qué dice el letrero?',
  p_ficha: o.ficha ?? { negocio: 'Tacos Juan' }, p_cotizacion: o.cotizacion ?? null, p_razones: o.razones ?? [], p_resumen: o.resumen ?? '' });
const decidir = (db, quien, id, accion, o = {}) =>
  llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'agente_decidir', { p_id: id, p_accion: accion, p_precio: o.precio ?? null, p_nota: o.nota ?? '' });
const RAZON = [{ id: 'logo', razon: 'Lleva logotipo o símbolo: el criterio de cobro cambia por proyecto.' }];

describir('AG-01 quién llama qué', () => {
  prueba('anon ninguna; la app no abre, no lee ni guarda; la función no decide', async () => conCopia(plantilla, async db => {
    const anon = como(db, { rol: 'anon' });
    for (const [f, a] of [['agente_abrir', { p_empresa: 'al3d', p_token_hash: HUELLA('a') }], ['agente_leer', { p_token_hash: HUELLA('a') }],
                          ['agente_guardar', { p_token_hash: HUELLA('a'), p_texto_cliente: 'x', p_texto_agente: 'y', p_ficha: {} }],
                          ['agente_decidir', { p_id: '00000000-0000-4000-8000-000000000000', p_accion: 'aprobar' }]]) {
      await esperarError(anon.rpc(f, a), '42501', 'anon: ' + f);
    }
    const dir = sesionDe(db, db.u.dir);
    await esperarError(dir.rpc('agente_abrir', { p_empresa: 'al3d', p_token_hash: HUELLA('a') }), '42501', 'la app no abre conversaciones');
    await esperarError(dir.rpc('agente_leer', { p_token_hash: HUELLA('a') }), '42501', 'la app no lee con la huella');
    await esperarError(dir.rpc('agente_guardar', { p_token_hash: HUELLA('a'), p_texto_cliente: 'x', p_texto_agente: 'y', p_ficha: {} }), '42501', 'la app no guarda vueltas');
    await esperarError(como(db, { rol: 'service_role' }).rpc('agente_decidir', { p_id: '00000000-0000-4000-8000-000000000000', p_accion: 'aprobar' }), '42501', 'la función no decide');
  }));
});

describir('AG-02 una conversación de punta a punta', () => {
  prueba('abrir: la forma, la empresa y lo repetido', async () => conCopia(plantilla, async db => {
    igual((await abrir(db, 'corta')).codigo, 'DATO_INVALIDO', 'una huella que no es sha256');
    igual((await abrir(db, HUELLA('a'), 'nadie')).codigo, 'NO_ENCONTRADO', 'una empresa que no existe');
    igual((await abrir(db, HUELLA('a'))).ok, true);
    igual((await abrir(db, HUELLA('a'))).codigo, 'DUPLICADO', 'la misma huella otra vez');
    igual((await leer(db, HUELLA('9'))).codigo, 'NO_ENCONTRADO', 'una huella que nadie abrió');
  }));

  prueba('las vueltas: abierta, cotizada, con Dirección; una sola tarjeta pendiente', async () => conCopia(plantilla, async db => {
    await abrir(db, HUELLA('a'));
    igual((await guardar(db, HUELLA('a'))).estado, 'abierta', 'sin cotización ni razones');
    let c = await leer(db, HUELLA('a'));
    igual(c.mensajes.map(m => m.de), ['cliente', 'agente'], 'los dos mensajes, en orden');
    igual([c.ficha, c.contacto, c.mensajes_cliente_24h], [{ negocio: 'Tacos Juan' }, { nombre: 'Daniel' }, 1]);
    igual((await guardar(db, HUELLA('a'), { cotizacion: { total: 9280 } })).estado, 'cotizada');
    const r = await guardar(db, HUELLA('a'), { razones: RAZON, resumen: 'Letras TACOS con logo' });
    igual(r.estado, 'con_direccion');
    cierto(r.decision, 'abrió una tarjeta');
    const r2 = await guardar(db, HUELLA('a'), { razones: [...RAZON, { id: 'zona', razon: 'Fuera de la zona.' }] });
    igual(r2.decision, r.decision, 'la misma tarjeta, con las razones al día');
    igual((await una(db, `select count(*)::int as n, max(jsonb_array_length(razones))::int as r from public.agente_decisiones`)), { n: 1, r: 2 });
    c = await leer(db, HUELLA('a'));
    igual([c.estado, c.cotizacion, c.decision.estado], ['con_direccion', { total: 9280 }, 'pendiente'], 'la cotización anterior se queda');
    igual((await guardar(db, HUELLA('a'), { cliente: '', agente: 'Sigo aquí' })).ok, true, 'una vuelta sin mensaje del cliente');
    igual((await guardar(db, HUELLA('a'), { ficha: [] })).codigo, 'DATO_INVALIDO', 'la ficha es un objeto');
    igual((await guardar(db, HUELLA('a'), { cliente: 'x'.repeat(4001) })).codigo, 'DATO_INVALIDO', 'un mensaje de más de 4000');
  }));
});

describir('AG-03 decidir', () => {
  prueba('solo Dirección de su empresa; aprobar con precio y nota; no se decide dos veces; queda en la bitácora', async () => conCopia(plantilla, async db => {
    await abrir(db, HUELLA('a'));
    const { decision } = await guardar(db, HUELLA('a'), { razones: RAZON, resumen: 'Letras TACOS con logo' });
    for (const q of ['fab', 'pag']) igual((await decidir(db, q, decision, 'aprobar')).codigo, 'ROL_SIN_PERMISO', q);
    igual((await decidir(db, 'otra', decision, 'aprobar')).codigo, 'NO_ENCONTRADO', 'la de otra empresa no existe para ella');
    igual((await decidir(db, 'dir', decision, 'quien-sabe')).codigo, 'DATO_INVALIDO', 'acción desconocida');
    igual((await decidir(db, 'dir', decision, 'corregir')).codigo, 'DATO_INVALIDO', 'corregir sin precio ni nota');
    igual((await decidir(db, 'dir', decision, 'aprobar', { precio: 12500, nota: 'El logo va en caja de luz.' })).estado, 'aprobada');
    const c = await leer(db, HUELLA('a'));
    igual([c.estado, c.cotizacion.precio_direccion, c.decision.precio], ['cotizada', 12500, 12500]);
    igual(c.decisiones.map(x => [x.estado, x.precio]), [['aprobada', 12500]], 'la lista de decisiones, para reconocer lo ya decidido');
    igual(c.mensajes.at(-1), { de: 'direccion', texto: 'El logo va en caja de luz.', en: c.mensajes.at(-1).en }, 'la nota llega como mensaje de Dirección');
    igual((await decidir(db, 'dir', decision, 'descartar')).sin_cambio, true, 'ya estaba decidida');
    igual((await una(db, `select nivel, entidad, accion from public.bitacora where entidad_id = $1`, ['agente:' + decision])),
          { nivel: 'dinero', entidad: 'cotizacion', accion: 'decision' });
  }));

  prueba('descartar deja la conversación perdida, y un mensaje nuevo no la revive', async () => conCopia(plantilla, async db => {
    await abrir(db, HUELLA('b'));
    const { decision } = await guardar(db, HUELLA('b'), { razones: RAZON });
    igual((await decidir(db, 'dir', decision, 'descartar')).estado, 'descartada');
    igual((await guardar(db, HUELLA('b'))).estado, 'perdida');
  }));
});

describir('AG-04 quién ve qué', () => {
  prueba('Dirección ve lo suyo sin la huella; los demás nada; los mensajes no se tocan', async () => conCopia(plantilla, async db => {
    await abrir(db, HUELLA('a'));
    await guardar(db, HUELLA('a'), { razones: RAZON });
    await abrir(db, HUELLA('c'), 'otra');
    const dir = sesionDe(db, db.u.dir);
    igual((await dir.query(`select estado from public.agente_conversaciones`)), [{ estado: 'con_direccion' }], 'solo la de su empresa');
    igual((await dir.query(`select count(*)::int as n from public.agente_mensajes`))[0].n, 2);
    igual((await dir.query(`select count(*)::int as n from public.agente_decisiones`))[0].n, 1);
    await esperarError(dir.query(`select token_hash from public.agente_conversaciones`), '42501', 'la huella no se lee desde la app');
    for (const q of ['fab', 'pag']) {
      for (const t of ['agente_conversaciones', 'agente_mensajes', 'agente_decisiones']) {
        igual((await sesionDe(db, db.u[q]).query(`select count(*)::int as n from public.${t}`))[0].n, 0, q + ' no ve ' + t);
      }
    }
    const srv = como(db, { rol: 'service_role' });
    await esperarError(srv.query(`update public.agente_mensajes set texto = 'otra cosa'`), 'P0001', 'nadie edita un mensaje: es un libro');
    await esperarError(srv.query(`delete from public.agente_mensajes`), '42501', 'nadie lo borra');
    await esperarError(sql(db, `delete from public.agente_conversaciones`), 'P0001', 'ni el dueño borra una conversación');
  }));
});

describir('AG-05 los topes y la auditoría', () => {
  prueba('60 conversaciones nuevas por hora; 80 mensajes del cliente por día', async () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.agente_conversaciones (empresa_id, token_hash)
                   select 'al3d', lpad(to_hex(g), 64, '0') from generate_series(1, 60) g`);
    igual((await abrir(db, HUELLA('a'))).codigo, 'CUPO_AGOTADO', 'la 61 en una hora no entra');
    igual((await abrir(db, HUELLA('a'), 'otra')).ok, true, 'el tope es por empresa');
    await sql(db, `update public.agente_conversaciones set created_at = now() - interval '2 hours' where empresa_id = 'al3d'`);
    igual((await abrir(db, HUELLA('b'))).ok, true, 'las de hace dos horas no cuentan');
    await sql(db, `insert into public.agente_mensajes (empresa_id, conversacion_id, de, texto)
                   select 'al3d', (select id from public.agente_conversaciones where token_hash = $1), 'cliente', 'hola ' || g
                     from generate_series(1, 80) g`, [HUELLA('b')]);
    igual((await leer(db, HUELLA('b'))).mensajes_cliente_24h, 80);
    igual((await guardar(db, HUELLA('b'))).codigo, 'CUPO_AGOTADO', 'el 81 del día no entra');
    igual((await guardar(db, HUELLA('b'), { cliente: '', agente: 'Mañana seguimos.' })).ok, true, 'el agente sí puede despedirse');
    igual((await una(db, `select interno.auditoria() as p`)).p, [], 'la auditoría de 0011 sigue limpia con 0023');
  }));
});

await resumen();
