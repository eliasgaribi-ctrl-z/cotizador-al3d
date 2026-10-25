// LOS CLIENTES FISCALES Y LAS DOS FACTURAS DE CADA VENTA FISCAL (0027, decidido por Elías el 2026-10-25; docs/DINERO-Y-FACTURAS.md):
// `clientes_fiscales`, `ventas_fiscales` y sus cuatro RPC (`cliente_fiscal_guardar`, `venta_cliente_fiscal`, `venta_factura_marcar`,
// `constancia_registrar`). Las cuentas fiscales son Constru BNT, Tatis BNT y Moni MPago. Datos de mentiras: los RFC tienen la forma del SAT
// y no son de nadie.
//
//   FI-01  el RFC: la forma del SAT (3 o 4 letras, AAMMDD que exista, homoclave), limpio (mayúsculas, sin espacios ni guiones), los genéricos no
//   FI-02  quién: Dirección y Pagos; Fabricación ROL_SIN_PERMISO en las cuatro; la ajena, la baja, la app vieja y anon, no; otra empresa no
//          encuentra las ventas de al3d
//   FI-03  ligar una venta: solo una venta fiscal; un RFC nuevo con su razón social se da de alta en el mismo viaje; dos ventas, el mismo cliente;
//          quitarlo; una lápida o una venta que no existe, NO_ENCONTRADO
//   FI-04  las dos casillas: marcar solo en una venta fiscal (quién y cuándo), desmarcar siempre (y se borra quién y cuándo)
//   FI-05  la bitácora: una línea de nivel DINERO por lo que se escribió (entidades `venta` y `cliente`), con su op_id; Fabricación no la ve
//   FI-06  idempotente: el mismo op_id contesta lo mismo y no escribe otra vez; lo mismo con otro op_id es «sin cambio»
//   FI-07  la constancia: solo de un cliente que existe, con la ruta de ESE RFC y su extensión, de hasta 5 MB; reemplazarla
//   FI-08  las tablas: RLS (Dirección y Pagos ven; Fabricación, la ajena y otra empresa, cero; anon, permission denied), nadie escribe directo,
//          sin_borrar, service_role sin DELETE, sin Realtime, y los CHECK que cuidan lo que las RPC ya cuidan
//   FI-09  la copia de cada 3 horas (importar-diario) NO toca nada de esto: ni en el texto de su SQL, ni al correr con la hoja mandando
//   FI-10  la auditoría limpia, y las auditorías de antes (0011…0026) se pueden volver a correr sobre una base con 0027 (y 0025 con líneas `cliente`)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, sesionSinContrato, llamar, como, sql, una, conCopia } from '../comun/semilla.js';
import { volcado } from '../comun/hoja-de-mentiras.js';
import { cincuentaFilas } from '../comun/escenarios-importador.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { copiar } from '../../functions/importar-diario/copia.js';

/* La semilla: p1 V-001 Constru BNT (fiscal, anticipo 5800), p2 V-002 Elias BBVA, p3 V-003 Moni MPago (fiscal), p4 V-004 Elias BBVA,
   p6 V-005 Constru BNT (histórica, liquidada), p5 la lápida «No se dio» (sin V-###). */
const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

const RFC_MORAL = 'ABC010203XY1';       // 3 letras + 2001-02-03 + homoclave
const RFC_FISICA = 'GOMA850615H2A';     // 4 letras + 1985-06-15 + homoclave terminada en A
const S = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });
let n = 0;
const op = () => 'op-' + (++n);
const cliente = (db, quien, rfc, razon, o = op()) => llamar(S(db, quien), 'cliente_fiscal_guardar', { p_op: { op_id: o, rfc, razon_social: razon } });
const ligar = (db, quien, proyecto_id, rfc, razon, o = op()) => llamar(S(db, quien), 'venta_cliente_fiscal', { p_op: { op_id: o, proyecto_id, rfc, razon_social: razon } });
const marcar = (db, quien, proyecto_id, cual, marcada, o = op()) => llamar(S(db, quien), 'venta_factura_marcar', { p_op: { op_id: o, proyecto_id, cual, marcada } });
const registrar = (db, quien, p, o = op()) => llamar(S(db, quien), 'constancia_registrar', { p_op: { op_id: o, ...p } });
const vf = async (db, id) => (await una(db, `select rfc, factura_anticipo as fa, factura_anticipo_por as fa_por, (factura_anticipo_en is not null) as fa_en,
                                       factura_liquidacion as fl, factura_liquidacion_por as fl_por, (factura_liquidacion_en is not null) as fl_en
                                  from public.ventas_fiscales where proyecto_id = $1`, [id])) ?? null;
const cf = (db, rfc, empresa = 'al3d') => una(db, `select rfc, razon_social, csf_ruta, csf_tipo, csf_bytes, (csf_subida_en is not null) as subida, csf_subio, creado_por
                                                     from public.clientes_fiscales where empresa_id = $1 and rfc = $2`, [empresa, rfc]);
const lineas = (db, entidad) => sql(db, `select nivel, accion, entidad, entidad_id, titulo, detalle, op_id, rol from public.bitacora where entidad = $1 order by id`, [entidad]);
const ruta = (rfc, ext = 'pdf', id = '3f9c2a7e-0b1d-4c55-9e1f-aa00bb11cc22') => `al3d/${rfc}/csf-${id}.${ext}`;

describir('FI-01 el RFC', () => {
  prueba('la forma del SAT entra limpia: persona moral (3 letras) y física (4), con Ñ y &, en minúsculas, con espacios, guiones y puntos', () => conCopia(plantilla, async db => {
    igual(await cliente(db, 'pag', RFC_MORAL, 'Constructora ABC, S.A. de C.V.'), { ok: true, rfc: RFC_MORAL, razon_social: 'Constructora ABC, S.A. de C.V.', creado: true });
    igual((await cliente(db, 'pag', ' goma-850615 h2a ', 'Ana  Gómez   Martínez ')).rfc, RFC_FISICA, 'física, limpio');
    igual((await cf(db, RFC_FISICA)).razon_social, 'Ana Gómez Martínez', 'la razón social sin espacios de más');
    igual((await cliente(db, 'pag', 'ñ&o990101ab9', 'Ñandú & Ostión')).rfc, 'Ñ&O990101AB9', 'la ñ también se vuelve mayúscula');
    igual((await cliente(db, 'pag', 'MAG000229AB1', 'Bisiesto')).ok, true, '29 de febrero de 2000 existe');
  }));
  prueba('lo que no es un RFC es DATO_INVALIDO definitivo, con el porqué, y no escribe nada', () => conCopia(plantilla, async db => {
    for (const [rfc, motivo] of [['', /Falta el RFC/], [null, /Falta el RFC/], ['AB010203XY1', /forma del SAT/], ['ABCDE010203XY1', /forma del SAT/],
                                 ['ABC0102031XY', /forma del SAT/], ['ABC010203XYB', /forma del SAT/], ['ABC011303XY1', /no existe/],
                                 ['ABC010231XY1', /no existe/], ['ABC010229XY1', /no existe/], ['XAXX010101000', /genérico/], ['XEXX010101000', /genérico/],
                                 ['ABC010203XY1;', /forma del SAT/]]) {
      const r = await cliente(db, 'pag', rfc, 'Alguien');
      igual([String(rfc), r.ok, r.codigo, r.definitivo, motivo.test(r.mensaje)], [String(rfc), false, 'DATO_INVALIDO', true, true], r.mensaje);
    }
    for (const [razon, motivo] of [['', /razón social/], ['   ', /razón social/], [null, /razón social/], ['x'.repeat(301), /demasiado larga/]]) {
      const r = await cliente(db, 'pag', RFC_MORAL, razon);
      igual([r.ok, r.codigo, motivo.test(r.mensaje)], [false, 'DATO_INVALIDO', true], r.mensaje);
    }
    igual(await una(db, `select count(*)::int as n from public.clientes_fiscales`), { n: 0 });
    igual((await lineas(db, 'cliente')).length, 0);
  }));
  prueba('cambiar la razón social de un RFC que ya existe; lo mismo es «sin cambio»', () => conCopia(plantilla, async db => {
    await cliente(db, 'pag', RFC_MORAL, 'Constructora ABC');
    igual((await cliente(db, 'dir', RFC_MORAL, 'Constructora ABC, S.A. de C.V.')).cambiado, true);
    igual((await cliente(db, 'dir', RFC_MORAL, 'Constructora ABC, S.A. de C.V.')).sin_cambio, true);
    igual((await cf(db, RFC_MORAL)).razon_social, 'Constructora ABC, S.A. de C.V.');
    igual((await cf(db, RFC_MORAL)).creado_por, 'pag@al3d.test', 'quién lo dio de alta no cambia');
  }));
});

describir('FI-02 quién', () => {
  prueba('Dirección y Pagos sí; Fabricación ROL_SIN_PERMISO (definitivo) en las cuatro; la ajena, la baja y la app vieja no; anon ni las llama', () => conCopia(plantilla, async db => {
    igual((await cliente(db, 'dir', RFC_MORAL, 'ABC')).ok, true);
    igual((await ligar(db, 'pag', 'p1', RFC_MORAL)).ok, true);
    for (const [q, codigo] of [['fab', 'ROL_SIN_PERMISO'], ['ext', 'SIN_ACCESO'], ['baja', 'ACCESO_REVOCADO']]) {
      const r = [await cliente(db, q, RFC_FISICA, 'X'), await ligar(db, q, 'p3', RFC_MORAL), await marcar(db, q, 'p1', 'anticipo', true),
                 await registrar(db, q, { rfc: RFC_MORAL, ruta: ruta(RFC_MORAL), tipo: 'application/pdf', bytes: 1000 })];
      igual([q, ...r.map(x => x.codigo)], [q, codigo, codigo, codigo, codigo]);
      if (q === 'fab') igual(r.map(x => x.definitivo), [true, true, true, true], 'Fabricación: definitivo en las cuatro');
    }
    const viejo = sesionSinContrato(db, db.u.pag);
    igual((await llamar(viejo, 'venta_factura_marcar', { p_op: { op_id: 'v', proyecto_id: 'p1', cual: 'anticipo', marcada: true } })).codigo, 'CLIENTE_VIEJO');
    for (const f of ['cliente_fiscal_guardar', 'venta_cliente_fiscal', 'venta_factura_marcar', 'constancia_registrar']) {
      await esperarError(como(db, { rol: 'anon' }).rpc(f, { p_op: { proyecto_id: 'p1' } }), '42501', f);
    }
    igual(await vf(db, 'p1'), { rfc: RFC_MORAL, fa: false, fa_por: '', fa_en: false, fl: false, fl_por: '', fl_en: false }, 'nada de lo negado escribió');
    igual(await una(db, `select count(*)::int as n from public.clientes_fiscales`), { n: 1 });
  }));
  prueba('Dirección de OTRA empresa no encuentra las ventas de al3d (NO_ENCONTRADO), ni registra la constancia de un cliente de al3d', () => conCopia(plantilla, async db => {
    await cliente(db, 'dir', RFC_MORAL, 'ABC');
    igual((await ligar(db, 'otra', 'p1', RFC_MORAL, 'ABC')).codigo, 'NO_ENCONTRADO');
    igual((await marcar(db, 'otra', 'p1', 'anticipo', true)).codigo, 'NO_ENCONTRADO');
    igual((await registrar(db, 'otra', { rfc: RFC_MORAL, ruta: 'otra/' + RFC_MORAL + '/csf-12345678.pdf', tipo: 'application/pdf', bytes: 10 })).codigo, 'NO_ENCONTRADO',
      'el RFC es cliente de al3d, no de otra');
    igual(await vf(db, 'p1'), null);
  }));
});

describir('FI-03 ligar una venta a su cliente fiscal', () => {
  prueba('un RFC nuevo con su razón social se da de alta en el mismo viaje; otra venta del mismo cliente usa el MISMO renglón', () => conCopia(plantilla, async db => {
    const r = await ligar(db, 'pag', 'p1', ' abc010203xy1 ', 'Constructora ABC');
    igual(r, { ok: true, proyecto_id: 'p1', rfc: RFC_MORAL, razon_social: 'Constructora ABC', cliente_creado: true });
    igual((await ligar(db, 'dir', 'p3', RFC_MORAL)).cliente_creado, false, 'Moni MPago también es fiscal; el cliente ya existía (sin razón social está bien)');
    igual([(await vf(db, 'p1')).rfc, (await vf(db, 'p3')).rfc], [RFC_MORAL, RFC_MORAL]);
    igual(await una(db, `select count(*)::int as n from public.clientes_fiscales`), { n: 1 }, 'un cliente con dos ventas: un solo renglón (la misma constancia)');
    igual((await ligar(db, 'pag', 'p6', RFC_MORAL)).ok, true, 'una histórica de Constru BNT también');
  }));
  prueba('una venta que NO es de una cuenta fiscal no se liga (Elias BBVA, sin cuenta); una lápida o una que no existe, NO_ENCONTRADO', () => conCopia(plantilla, async db => {
    const r = await ligar(db, 'pag', 'p2', RFC_MORAL, 'ABC');
    igual([r.codigo, r.definitivo, /V-002 cobra en «Elias BBVA», que no factura/.test(r.mensaje)], ['DATO_INVALIDO', true, true], r.mensaje);
    await sql(db, `update public.ventas_dinero set cuenta = null where proyecto_id = 'p4'`);
    igual((await ligar(db, 'pag', 'p4', RFC_MORAL, 'ABC')).mensaje.includes('no tiene cuenta de cobro'), true);
    igual((await ligar(db, 'pag', 'p5', RFC_MORAL, 'ABC')).codigo, 'NO_ENCONTRADO', 'la lápida «No se dio» no es una venta');
    igual((await ligar(db, 'pag', 'no-existe', RFC_MORAL, 'ABC')).codigo, 'NO_ENCONTRADO');
    igual((await ligar(db, 'pag', null, RFC_MORAL, 'ABC')).codigo, 'NO_ENCONTRADO');
    igual(await una(db, `select (select count(*)::int from public.clientes_fiscales) as c, (select count(*)::int from public.ventas_fiscales) as v`), { c: 0, v: 0 },
      'y no dio de alta al cliente de paso');
  }));
  prueba('un RFC nuevo sin razón social no entra; un RFC malo, tampoco', () => conCopia(plantilla, async db => {
    igual((await ligar(db, 'pag', 'p1', RFC_MORAL)).mensaje.includes('todavía no está dado de alta'), true);
    igual((await ligar(db, 'pag', 'p1', 'XAXX010101000', 'Público')).codigo, 'DATO_INVALIDO');
    igual(await vf(db, 'p1'), null);
  }));
  prueba('cambiar de cliente y quitarlo (rfc vacío); quitar dos veces es «sin cambio»; las casillas se quedan', () => conCopia(plantilla, async db => {
    await ligar(db, 'pag', 'p1', RFC_MORAL, 'ABC');
    await marcar(db, 'pag', 'p1', 'anticipo', true);
    igual((await ligar(db, 'pag', 'p1', RFC_FISICA, 'Ana Gómez')).rfc, RFC_FISICA);
    igual((await ligar(db, 'pag', 'p1', RFC_FISICA)).sin_cambio, true);
    igual(await ligar(db, 'dir', 'p1', ''), { ok: true, proyecto_id: 'p1', rfc: null });
    igual((await ligar(db, 'dir', 'p1', null)).sin_cambio, true);
    igual([(await vf(db, 'p1')).rfc, (await vf(db, 'p1')).fa], [null, true], 'sin cliente, con su factura del anticipo marcada');
    igual((await ligar(db, 'dir', 'p3', '')).sin_cambio, true, 'quitarle el cliente a una que nunca tuvo: sin cambio, sin renglón');
    igual(await vf(db, 'p3'), null);
    await sql(db, `update public.ventas_dinero set cuenta = 'Elias BBVA' where proyecto_id = 'p1'`);
    igual((await ligar(db, 'pag', 'p1', RFC_MORAL)).codigo, 'DATO_INVALIDO', 'si la venta cambió a una cuenta que no factura, ya no se liga');
  }));
});

describir('FI-04 las dos casillas', () => {
  prueba('marcar la del anticipo y la de la liquidación: quién (el correo que Google confirmó) y cuándo; desmarcar las vacía', () => conCopia(plantilla, async db => {
    const a = await marcar(db, 'pag', 'p1', 'anticipo', true);
    igual([a.ok, a.cual, a.marcada, a.por, typeof a.en], [true, 'anticipo', true, 'pag@al3d.test', 'string']);
    igual(await vf(db, 'p1'), { rfc: null, fa: true, fa_por: 'pag@al3d.test', fa_en: true, fl: false, fl_por: '', fl_en: false }, 'sin cliente fiscal también se puede');
    igual((await marcar(db, 'dir', 'p1', 'liquidacion', true)).por, 'dir@al3d.test');
    igual(await marcar(db, 'dir', 'p1', 'anticipo', false), { ok: true, proyecto_id: 'p1', cual: 'anticipo', marcada: false, por: '', en: null });
    igual(await vf(db, 'p1'), { rfc: null, fa: false, fa_por: '', fa_en: false, fl: true, fl_por: 'dir@al3d.test', fl_en: true });
    igual((await marcar(db, 'dir', 'p1', 'anticipo', false)).sin_cambio, true);
  }));
  prueba('marcar en una venta que no factura, no; desmarcar sí se puede siempre (deshacer un error aunque la venta haya cambiado de cuenta)', () => conCopia(plantilla, async db => {
    const r = await marcar(db, 'pag', 'p2', 'anticipo', true);
    igual([r.codigo, /las casillas de factura son de las ventas de una cuenta fiscal/.test(r.mensaje)], ['DATO_INVALIDO', true]);
    igual((await marcar(db, 'pag', 'p2', 'anticipo', false)).sin_cambio, true, 'desmarcar lo que nunca se marcó');
    await marcar(db, 'pag', 'p3', 'liquidacion', true);
    await sql(db, `update public.ventas_dinero set cuenta = 'Rul HSBC' where proyecto_id = 'p3'`);
    igual((await marcar(db, 'pag', 'p3', 'liquidacion', false)).marcada, false, 'p3 ya no es fiscal y se desmarca igual');
  }));
  prueba('lo malo: otra casilla, «marcada» que no es sí/no, una venta que no existe', () => conCopia(plantilla, async db => {
    for (const [cual, marcada, motivo] of [['iva', true, /anticipo o la de la liquidación/], [null, true, /anticipo o la de la liquidación/],
                                           ['anticipo', 'true', /si la factura se marca/], ['anticipo', 1, /si la factura se marca/], ['anticipo', null, /si la factura se marca/]]) {
      const r = await marcar(db, 'pag', 'p1', cual, marcada);
      igual([String(cual), String(marcada), r.codigo, motivo.test(r.mensaje)], [String(cual), String(marcada), 'DATO_INVALIDO', true], r.mensaje);
    }
    igual((await marcar(db, 'pag', 'p404', 'anticipo', true)).codigo, 'NO_ENCONTRADO');
    igual(await vf(db, 'p1'), null);
  }));
});

describir('FI-05 la bitácora', () => {
  prueba('una línea de nivel DINERO por lo que se escribió, con su op_id; «sin cambio» no anota; Dirección y Pagos la ven, Fabricación no', () => conCopia(plantilla, async db => {
    await ligar(db, 'pag', 'p1', RFC_MORAL, 'Constructora ABC', 'o-ligar');
    await ligar(db, 'pag', 'p1', RFC_MORAL, null, 'o-ligar-2');                         // sin cambio
    await marcar(db, 'pag', 'p1', 'anticipo', true, 'o-fa');
    await marcar(db, 'dir', 'p1', 'anticipo', false, 'o-fa-no');
    await cliente(db, 'dir', RFC_MORAL, 'Constructora ABC, S.A.', 'o-razon');
    igual((await lineas(db, 'cliente')).map(x => [x.nivel, x.accion, x.entidad_id, x.titulo, x.op_id]), [
      ['dinero', 'alta', RFC_MORAL, 'Cliente fiscal ' + RFC_MORAL + ': Constructora ABC', null],
      ['dinero', 'cambio', RFC_MORAL, 'Razón social de ' + RFC_MORAL + ': Constructora ABC, S.A.', 'cliente:o-razon'],
    ], 'el alta que vino con la venta no lleva op_id: lo lleva la línea de la venta');
    igual((await lineas(db, 'venta')).filter(x => x.entidad_id === 'p1').map(x => [x.nivel, x.accion, x.titulo, x.detalle, x.op_id, x.rol]), [
      ['dinero', 'cambio', 'Cliente fiscal de V-001: ' + RFC_MORAL, 'Constructora ABC · Constru BNT', 'fiscal:o-ligar', 'pagos'],
      ['dinero', 'factura', 'Se hizo la factura del anticipo de V-001', 'Anticipo $5,800.00 · Constru BNT · ' + RFC_MORAL, 'factura:o-fa', 'pagos'],
      ['dinero', 'desmarco', 'Se desmarcó la factura del anticipo de V-001', 'Anticipo $5,800.00 · Constru BNT · ' + RFC_MORAL, 'factura:o-fa-no', 'direccion'],
    ]);
    const ve = async q => (await sesionDe(db, db.u[q]).query(`select count(*)::int as n from public.bitacora where entidad in ('cliente', 'venta')`))[0].n;
    igual([await ve('dir'), await ve('pag'), await ve('fab'), await ve('ext')], [5, 5, 0, 0]);
  }));
});

describir('FI-06 idempotente por op_id', () => {
  prueba('el mismo op_id contesta lo de su primera vez y no escribe otra vez (aunque en medio otro lo haya cambiado); otro op_id con lo mismo, «sin cambio»', () => conCopia(plantilla, async db => {
    const a = await marcar(db, 'pag', 'p1', 'anticipo', true, 'o-1');
    igual(await marcar(db, 'pag', 'p1', 'anticipo', true, 'o-1'), a, 'el reintento de una respuesta que se perdió');
    igual((await marcar(db, 'pag', 'p1', 'anticipo', true, 'o-2')).sin_cambio, true);
    await marcar(db, 'dir', 'p1', 'anticipo', false, 'o-3');
    igual(await marcar(db, 'pag', 'p1', 'anticipo', true, 'o-1'), a, 'el reintento tardío de o-1 NO vuelve a marcar lo que Dirección desmarcó');
    igual((await vf(db, 'p1')).fa, false);
    const l = await ligar(db, 'pag', 'p3', RFC_MORAL, 'ABC', 'o-l');
    igual(await ligar(db, 'pag', 'p3', RFC_MORAL, 'ABC', 'o-l'), l);
    const c = await cliente(db, 'pag', RFC_FISICA, 'Ana', 'o-c');
    igual(await cliente(db, 'pag', RFC_FISICA, 'Ana', 'o-c'), c);
    igual(await una(db, `select count(*)::int as n from public.bitacora where op_id in ('factura:o-1', 'factura:o-2', 'fiscal:o-l', 'cliente:o-c')`), { n: 3 }, 'una línea por operación hecha');
  }));
});

describir('FI-07 la constancia', () => {
  prueba('solo de un cliente que existe, con la ruta de ESE RFC y la extensión de su tipo, de hasta 5 MB; registrarla y reemplazarla', () => conCopia(plantilla, async db => {
    igual((await registrar(db, 'pag', { rfc: RFC_MORAL, ruta: ruta(RFC_MORAL), tipo: 'application/pdf', bytes: 1000 })).codigo, 'NO_ENCONTRADO', 'el RFC todavía no es cliente');
    await cliente(db, 'pag', RFC_MORAL, 'ABC');
    await cliente(db, 'pag', RFC_FISICA, 'Ana');
    for (const [p, motivo] of [
      [{ ruta: ruta(RFC_FISICA) }, /no es la de ese RFC/], [{ ruta: 'otra/' + RFC_MORAL + '/csf-12345678.pdf' }, /no es la de ese RFC/],
      [{ ruta: ruta(RFC_MORAL, 'jpg') }, /no es la de ese RFC/], [{ ruta: `al3d/${RFC_MORAL}/csf-1234.pdf` }, /no es la de ese RFC/],
      [{ ruta: `al3d/${RFC_MORAL}/x/csf-12345678.pdf` }, /no es la de ese RFC/], [{ ruta: `al3d/${RFC_MORAL}/csf-12345678.pdf.html` }, /no es la de ese RFC/],
      [{ ruta: `al3d/${RFC_MORAL}/../csf-12345678.pdf` }, /no es la de ese RFC/], [{ tipo: 'image/heic' }, /PDF o en foto/], [{ tipo: 'text/html', ruta: ruta(RFC_MORAL, 'html') }, /PDF o en foto/],
      [{ bytes: 5242881 }, /5 MB/], [{ bytes: 0 }, /5 MB/], [{ bytes: 10.5 }, /5 MB/], [{ bytes: null }, /5 MB/],
    ]) {
      const r = await registrar(db, 'pag', { rfc: RFC_MORAL, ruta: ruta(RFC_MORAL), tipo: 'application/pdf', bytes: 1000, ...p });
      igual([JSON.stringify(p), r.codigo, motivo.test(r.mensaje)], [JSON.stringify(p), 'DATO_INVALIDO', true], r.mensaje);
    }
    igual((await cf(db, RFC_MORAL)).csf_ruta, null, 'nada de lo malo quedó');
    const r = await registrar(db, 'pag', { rfc: RFC_MORAL.toLowerCase(), ruta: ruta(RFC_MORAL), tipo: 'application/pdf', bytes: 123456 });
    igual([r.ok, r.ruta, r.tipo, r.bytes, r.reemplaza], [true, ruta(RFC_MORAL), 'application/pdf', 123456, false]);
    igual(await cf(db, RFC_MORAL), { rfc: RFC_MORAL, razon_social: 'ABC', csf_ruta: ruta(RFC_MORAL), csf_tipo: 'application/pdf', csf_bytes: 123456, subida: true,
      csf_subio: 'pag@al3d.test', creado_por: 'pag@al3d.test' });
    igual((await registrar(db, 'dir', { rfc: RFC_MORAL, ruta: ruta(RFC_MORAL), tipo: 'application/pdf', bytes: 123456 })).sin_cambio, true);
    const otra = ruta(RFC_MORAL, 'jpg', '0a0b0c0d-1111-2222-3333-444455556666');
    igual((await registrar(db, 'dir', { rfc: RFC_MORAL, ruta: otra, tipo: 'image/jpeg', bytes: 2000000 })).reemplaza, true);
    igual([(await cf(db, RFC_MORAL)).csf_ruta, (await cf(db, RFC_MORAL)).csf_subio], [otra, 'dir@al3d.test']);
    const l = (await lineas(db, 'cliente')).filter(x => /Constancia/.test(x.titulo));
    igual(l.map(x => [x.nivel, x.accion, x.titulo]), [['dinero', 'subio', 'Constancia de situación fiscal de ' + RFC_MORAL],
                                                      ['dinero', 'cambio', 'Constancia de situación fiscal de ' + RFC_MORAL + ' (otra)']]);
    cierto(/reemplaza la del \d\d\/\d\d\/\d{4}/.test(l[1].detalle), 'la segunda dice a cuál reemplaza: ' + l[1].detalle);
  }));
});

describir('FI-08 las tablas', () => {
  prueba('Dirección y Pagos ven las filas de su empresa; Fabricación, la ajena, la baja, otra empresa: cero; anon: permission denied', () => conCopia(plantilla, async db => {
    await ligar(db, 'pag', 'p1', RFC_MORAL, 'ABC');
    await marcar(db, 'pag', 'p3', 'anticipo', true);
    await cliente(db, 'otra', RFC_FISICA, 'De otra empresa');
    const ve = async (q, t) => (await sesionDe(db, db.u[q]).query(`select count(*)::int as n from public.${t}`))[0].n;
    for (const t of ['clientes_fiscales', 'ventas_fiscales']) {
      igual([t, await ve('dir', t), await ve('pag', t), await ve('fab', t), await ve('ext', t), await ve('baja', t)],
            [t, t === 'clientes_fiscales' ? 1 : 2, t === 'clientes_fiscales' ? 1 : 2, 0, 0, 0]);
      igual([t, await ve('otra', t)], [t, t === 'clientes_fiscales' ? 1 : 0], 'otra ve SOLO lo suyo');
      await esperarError(como(db, { rol: 'anon' }).query(`select * from public.${t}`), '42501', t);
    }
    // ni por la vista de fórmulas: Fabricación tampoco ve ventas_calculadas (el JOIN interno con ventas_dinero)
    igual(await ve('fab', 'ventas_calculadas'), 0);
  }));
  prueba('nadie escribe directo; service_role sin DELETE; ni el dueño borra (sin_borrar); fuera de Realtime', () => conCopia(plantilla, async db => {
    await ligar(db, 'pag', 'p1', RFC_MORAL, 'ABC');
    for (const q of [`insert into public.clientes_fiscales (empresa_id, rfc, razon_social) values ('al3d', '${RFC_FISICA}', 'x')`,
                     `update public.ventas_fiscales set factura_anticipo = true, factura_anticipo_en = now()`,
                     `update public.clientes_fiscales set csf_ruta = 'x'`, `delete from public.ventas_fiscales`]) {
      await esperarError(sesionDe(db, db.u.dir).query(q), '42501', q);
    }
    for (const t of ['clientes_fiscales', 'ventas_fiscales', 'ajustes_dinero']) {
      await esperarError(como(db, { rol: 'service_role' }).query(`delete from public.${t}`), '42501', t);
      igual((await una(db, `select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = $1`, [t])).n, 0, t + ' sin Realtime');
    }
    await esperarError(sql(db, `delete from public.ventas_fiscales`), /no se borran/);
    await esperarError(sql(db, `delete from public.clientes_fiscales`), /no se borran/);
    igual((await como(db, { rol: 'service_role' }).query(`select count(*)::int as n from public.ventas_fiscales`))[0].n, 1, 'service_role lee (el respaldo)');
  }));
  prueba('los CHECK cuidan lo mismo que las RPC: el RFC, la ruta de la constancia, el tipo, el peso, quién y cuándo de cada casilla, la empresa de la venta', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.clientes_fiscales (empresa_id, rfc, razon_social) values ('al3d', '${RFC_MORAL}', 'ABC')`);
    for (const [q, r] of [
      [`insert into public.clientes_fiscales (empresa_id, rfc, razon_social) values ('al3d', 'abc010203xy1', 'x')`, /check/],
      [`insert into public.clientes_fiscales (empresa_id, rfc, razon_social) values ('al3d', '${RFC_FISICA}', ' ')`, /check/],
      [`update public.clientes_fiscales set csf_ruta = 'al3d/${RFC_FISICA}/csf-12345678.pdf', csf_tipo = 'application/pdf', csf_subida_en = now()`, /check/],
      [`update public.clientes_fiscales set csf_ruta = 'al3d/${RFC_MORAL}/csf-12345678.pdf'`, /clientes_fiscales_csf/],
      [`update public.clientes_fiscales set csf_ruta = 'al3d/${RFC_MORAL}/csf-12345678.pdf', csf_tipo = 'text/html', csf_subida_en = now()`, /check/],
      [`update public.clientes_fiscales set csf_bytes = 5242881`, /check/],
      [`insert into public.ventas_fiscales (proyecto_id, empresa_id, factura_anticipo) values ('p1', 'al3d', true)`, /ventas_fiscales_anticipo/],
      [`insert into public.ventas_fiscales (proyecto_id, empresa_id, factura_liquidacion_por) values ('p1', 'al3d', 'alguien')`, /ventas_fiscales_liquidacion/],
      [`insert into public.ventas_fiscales (proyecto_id, empresa_id) values ('p1', 'otra')`, /foreign key|violates/],
      [`insert into public.ventas_fiscales (proyecto_id, empresa_id, rfc) values ('p1', 'al3d', '${RFC_FISICA}')`, /foreign key|violates/],
    ]) await esperarError(sql(db, q), r, q);
  }));
});

describir('FI-09 la copia de cada 3 horas no toca lo fiscal', () => {
  prueba('el SQL del importador (scripts/importador) y la función importar-diario no nombran ninguna de las tres tablas', () => {
    const carpetas = [['../../../scripts/importador/', '.mjs'], ['../../functions/importar-diario/', '.js']];
    for (const [c, ext] of carpetas) {
      const dir = fileURLToPath(new URL(c, import.meta.url));
      for (const f of readdirSync(dir).filter(x => x.endsWith(ext))) {
        const t = readFileSync(dir + f, 'utf8');
        igual([f, /ventas_fiscales|clientes_fiscales|ajustes_dinero/.test(t)], [f, false]);
      }
    }
  });
  prueba('con la hoja mandando, una copia que CAMBIA la cuenta y el anticipo de una venta ligada deja intactos su cliente, sus casillas y las cuentas disponibles', async () => {
    const db = await crearBaseDePruebas();
    try {
      db.u = await sembrarUsuarios(db);
      const basePGlite = { transaccion: fn => db.transaction(tx => fn({ ejecutar: t => tx.exec(t), consultar: async (t, p) => (await tx.query(t, p)).rows })) };
      let reloj = 0;
      const corre = async filas => {
        const v = volcado({ ventas: filas.map(f => f.fila), abonos: [] });
        return copiar({ base: basePGlite, plan: await planear({ volcado: v }), volcado: v, ahora: () => (reloj += 7), inicio: reloj });
      };
      const filas = cincuentaFilas().map(f => ({ ...f, fila: f.fila.slice() }));
      igual((await corre(filas)).aplicado, true, 'día 1');
      const id = (await una(db, `select id from public.proyectos where folio_hoja = 'V-100'`)).id;          // Constru BNT, anticipo 5800
      await ligar(db, 'pag', id, RFC_MORAL, 'Constructora ABC');
      await marcar(db, 'pag', id, 'anticipo', true);
      await llamar(S(db, 'dir'), 'cuentas_disponibles_guardar', { p_op: { op_id: 'cd', cuentas: ['Elias BBVA', 'Rul HSBC'] } });
      const foto = async () => ({ vf: await una(db, `select to_jsonb(x) as j from public.ventas_fiscales x where proyecto_id = $1`, [id]),
                                  cf: await una(db, `select to_jsonb(x) as j from public.clientes_fiscales x`), ad: await una(db, `select to_jsonb(x) as j from public.ajustes_dinero x`) });
      const antes = await foto();
      filas[0].fila[3] = 'Moni MPago';                // la cuenta (D)
      filas[0].fila[8] = 6000;                        // el anticipo (I)
      const d2 = await corre(filas);
      igual([d2.aplicado, (await una(db, `select cuenta, anticipo::text as a from public.ventas_dinero where proyecto_id = $1`, [id]))], [true, { cuenta: 'Moni MPago', a: '6000' }],
        'la copia sí puso lo de la hoja en ventas_dinero');
      igual(await foto(), antes, 'y no tocó ni una columna de ventas_fiscales, clientes_fiscales ni ajustes_dinero');
    } finally { await db.close(); }
  }, { tiempo: 120_000 });
});

describir('FI-10 la auditoría', () => {
  prueba('limpia con 0027; y volver a correr 0011, 0019, 0022…0026 sobre una base con 0027 (y con líneas `cliente` en la bitácora) no aborta', () => conCopia(plantilla, async db => {
    igual((await una(db, `select interno.auditoria() as p`)).p, []);
    await ligar(db, 'pag', 'p1', RFC_MORAL, 'ABC');
    igual((await una(db, `select count(*)::int as n from public.bitacora where entidad = 'cliente'`)).n, 1);
    const carpeta = fileURLToPath(new URL('../../migrations/', import.meta.url));
    for (const f of ['0011_auditoria.sql', '0019_tarifas.sql', '0022_pantallas.sql', '0023_agente.sql', '0024_modo.sql', '0025_gastos.sql', '0026_alta_venta_modo.sql', '0027_dinero_y_facturas.sql']) {
      await sql(db, readFileSync(carpeta + f, 'utf8'));
      igual([f, (await una(db, `select interno.auditoria() as p`)).p], [f, []]);
    }
    igual(await vf(db, 'p1'), { rfc: RFC_MORAL, fa: false, fa_por: '', fa_en: false, fl: false, fl_por: '', fl_en: false }, 'volver a correrlas no tocó los datos');
  }), { tiempo: 120_000 });
  prueba('las cinco RPC son de cliente (authenticated sí, anon no, SECURITY DEFINER con search_path vacío); los ayudantes de interno no los ejecuta nadie de la app', async () => {
    const db = await plantilla();
    const f = await sql(db, `select p.proname as n, p.prosecdef as d, p.proconfig as c, has_function_privilege('authenticated', p.oid, 'execute') as auth,
                                    has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('service_role', p.oid, 'execute') as svc
                               from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                              where s.nspname = 'public' and p.proname in ('cliente_fiscal_guardar', 'constancia_registrar', 'cuentas_disponibles_guardar', 'venta_cliente_fiscal', 'venta_factura_marcar')
                              order by 1`);
    igual(f.map(x => [x.n, x.d, (x.c || []).includes('search_path=""'), x.auth, x.anon, x.svc]), [
      ['cliente_fiscal_guardar', true, true, true, false, false], ['constancia_registrar', true, true, true, false, false],
      ['cuentas_disponibles_guardar', true, true, true, false, false], ['venta_cliente_fiscal', true, true, true, false, false],
      ['venta_factura_marcar', true, true, true, false, false]]);
    const i = await sql(db, `select p.proname as n, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as svc
                               from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                              where s.nspname = 'interno' and p.proname in ('cuentas_fiscales', 'rfc_limpio', 'rfc_problema', 'venta_para_fiscal', 'op_fiscal', 'op_ya_hecha', 'cliente_fiscal_poner')
                              order by 1`);
    igual(i.map(x => [x.n, x.auth, x.svc]), [['cliente_fiscal_poner', false, false], ['cuentas_fiscales', false, false], ['op_fiscal', false, false],
      ['op_ya_hecha', false, false], ['rfc_limpio', false, false], ['rfc_problema', false, false], ['venta_para_fiscal', false, false]]);
  });
});

await resumen();
