// Acceso por correo (R8) — A.md §10.1, casos AC-01..AC-18, cada uno PERMITIDO y DENEGADO por rol.
//
// Qué se comprueba (migraciones 0001 y 0002):
//   · una invitación es una fila sin `usuario_id`; el primer ingreso con correo VERIFICADO la reclama;
//   · la baja no borra la fila y es la ÚNICA fuente de `acceso_revocado` (nunca por una lista vacía de RLS);
//   · una baja o un cambio de área surte efecto en la SIGUIENTE petición, con el mismo JWT;
//   · la cabecera `x-al3d-contrato` la exigen las RPC de escritura y NO `mi_acceso`.
//
// Las variantes que usan `proyectos` y `mover_etapa` (AC-01, AC-08, AC-09, AC-10, AC-15 tal como las escribe A.md)
// están en obra-y-etapas/acceso-con-obra.mjs: aquí se prueban con `empresas`, `miembros`, `bitacora` y las RPC
// `miembro_*`, que tienen el mismo preámbulo, para que este archivo no dependa de migraciones posteriores.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, sesionSinContrato, llamar, contar, conCopia, DEFS, como, sql, crearUsuarioAuth } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

// una RPC de escritura con preámbulo: Dirección la logra; los demás reciben el código de acceso que corresponda
const invitar = (s, correo = 'x@al3d.test', extra = {}) => llamar(s, 'miembro_alta', { p_correo: correo, p_area: 'pagos', ...extra });

describir('AC-01 sin fila en miembros (u_ext)', () => {
  prueba('mi_acceso dice sin_acceso, nunca acceso_revocado; reclamar_acceso no vincula nada', async () => {
    const db = await plantilla(), X = sesionDe(db, db.u.ext);
    const a = await llamar(X, 'mi_acceso');
    igual([a.ok, a.estado, a.empresas, a.permisos], [true, 'sin_acceso', [], null]);
    const r = await llamar(X, 'reclamar_acceso');
    igual(r.estado, 'sin_acceso');
  });
  prueba('0 filas en empresas, miembros y bitácora; una RPC de escritura recibe SIN_ACCESO (no definitivo)', async () => {
    const db = await plantilla(), X = sesionDe(db, db.u.ext);
    for (const t of ['empresas', 'miembros', 'bitacora']) igual(await contar(X, t), 0, t);
    const e = await invitar(X);
    igual([e.ok, e.codigo, e.definitivo], [false, 'SIN_ACCESO', false]);
  });
  prueba('contraprueba: un miembro sí ve su empresa y su fila', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    igual([await contar(F, 'empresas'), await contar(F, 'miembros')], [1, 1]);
  });
});

describir('AC-02 y AC-03 invitación: reclamar una vez y otra (u_inv)', () => {
  prueba('invitacion_pendiente → reclamar_acceso → activo, con uid, reclamado_en y bitácora de nivel direccion', async () => {
    await conCopia(plantilla, async db => {
      const I = sesionDe(db, db.u.inv);
      igual((await llamar(I, 'mi_acceso')).estado, 'invitacion_pendiente');
      const r = await llamar(I, 'reclamar_acceso', {}, { confirmar: true });
      igual([r.ok, r.estado], [true, 'activo']);
      const f = (await sql(db, `select usuario_id, reclamado_en is not null as rec, estado from public.miembros where correo = 'fab2@al3d.test'`))[0];
      igual([f.usuario_id, f.rec, f.estado], [db.u.inv.uid, true, 'activo']);
      const bit = await sql(db, `select nivel, entidad, accion from public.bitacora where accion = 'reclamo'`);
      igual(bit.map(b => [b.nivel, b.entidad]), [['direccion', 'miembro']], 'una sola anotación, de nivel direccion');
      igual(await contar(I, 'bitacora', `nivel = 'direccion'`), 0, 'el propio u_inv, Fabricación, NO ve el nivel direccion');
      igual(await contar(sesionDe(db, db.u.dir), 'bitacora', `accion = 'reclamo'`), 1, 'Dirección sí la ve');
    });
  });
  prueba('reclamar por segunda vez: ok, sin cambios (idempotente) y sin otra anotación', async () => {
    await conCopia(plantilla, async db => {
      const I = sesionDe(db, db.u.inv);
      await llamar(I, 'reclamar_acceso', {}, { confirmar: true });
      const antes = (await sql(db, `select reclamado_en, updated_at from public.miembros where correo = 'fab2@al3d.test'`))[0];
      const r2 = await llamar(I, 'reclamar_acceso', {}, { confirmar: true });
      igual([r2.ok, r2.estado], [true, 'activo']);
      const despues = (await sql(db, `select reclamado_en, updated_at from public.miembros where correo = 'fab2@al3d.test'`))[0];
      igual(despues, antes, 'la fila no se tocó');
      igual((await sql(db, `select count(*)::int n from public.bitacora where accion = 'reclamo'`))[0].n, 1);
    });
  });
  prueba('una invitación en DOS empresas se reclama en las dos, cada una con su área', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.miembros (empresa_id, correo, area) values ('otra', 'fab2@al3d.test', 'pagos')`);
      const I = sesionDe(db, db.u.inv);
      const r = await llamar(I, 'reclamar_acceso', {}, { confirmar: true });
      igual(r.empresas.map(e => [e.empresa_id, e.area, e.estado]), [['al3d', 'fabricacion', 'activo'], ['otra', 'pagos', 'activo']]);
      igual(r.permisos, null, 'con dos empresas activas no se elige permisos solo');
    });
  });
});

describir('AC-04 y AC-06 correo sin verificar o sesión anónima', () => {
  prueba('u_noverif: reclamar_acceso dice correo_no_verificado y la fila sigue invitada; mi_acceso no la ofrece', async () => {
    await conCopia(plantilla, async db => {
      const N = sesionDe(db, db.u.noverif);
      const r = await llamar(N, 'reclamar_acceso', {}, { confirmar: true });
      igual([r.ok, r.estado], [true, 'correo_no_verificado']);
      igual((await sql(db, `select estado, usuario_id from public.miembros where correo = 'nv@al3d.test'`))[0], { estado: 'invitado', usuario_id: null });
      igual((await llamar(N, 'mi_acceso')).estado, 'sin_acceso', 'sin verificar no se ofrece la invitación');
    });
  });
  prueba('sesión anónima (claim is_anonymous) con el correo de una invitación: correo_no_verificado', async () => {
    await conCopia(plantilla, async db => {
      const ANON = sesionDe(db, db.u.inv, { claims: { is_anonymous: true } });
      const r = await llamar(ANON, 'reclamar_acceso', {}, { confirmar: true });
      igual(r.estado, 'correo_no_verificado');
      igual((await sql(db, `select estado from public.miembros where correo = 'fab2@al3d.test'`))[0].estado, 'invitado');
    });
  });
  prueba('user_metadata.email_verified = true NO basta: manda email_confirmed_at', async () => {
    await conCopia(plantilla, async db => {
      const falso = await crearUsuarioAuth(db, { correo: 'nv@al3d.test2', verificado: false, metadatos: { email_verified: true } });
      await sql(db, `insert into public.miembros (empresa_id, correo, area) values ('al3d', 'nv@al3d.test2', 'pagos')`);
      const r = await llamar(sesionDe(db, falso, { claims: { user_metadata: { email: falso.correo, email_verified: true } } }), 'reclamar_acceso', {}, { confirmar: true });
      igual(r.estado, 'correo_no_verificado');
    });
  });
});

describir('AC-05 Dirección invita y la persona reclama', () => {
  prueba('miembro_alta normaliza el correo (« Ana@AL3D.test » → ana@al3d.test) y luego se vincula', async () => {
    await conCopia(plantilla, async db => {
      const D = sesionDe(db, db.u.dir);
      const r = await llamar(D, 'miembro_alta', { p_correo: ' Ana@AL3D.test ', p_area: 'pagos', p_nota: 'contadora' }, { confirmar: true });
      igual([r.ok, r.accion], [true, 'alta']);
      igual((await sql(db, `select correo, estado, area, nota, invitado_por from public.miembros where correo like 'ana%'`))[0],
            { correo: 'ana@al3d.test', estado: 'invitado', area: 'pagos', nota: 'contadora', invitado_por: db.u.dir.uid });
      const ana = await crearUsuarioAuth(db, { correo: 'ana@al3d.test' });
      const a = await llamar(sesionDe(db, ana), 'reclamar_acceso', {}, { confirmar: true });
      igual([a.estado, a.empresas[0].area], ['activo', 'pagos']);
    });
  });
  prueba('datos inválidos: correo mal formado o área desconocida → DATO_INVALIDO (definitivo); nada se escribe', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    for (const [correo, area] of [['sin-arroba', 'pagos'], ['a@b', 'pagos'], ['', 'pagos'], ['ok@al3d.test', 'cliente'], ['ok@al3d.test', null]]) {
      const e = await llamar(D, 'miembro_alta', { p_correo: correo, p_area: area });
      igual([e.ok, e.codigo, e.definitivo], [false, 'DATO_INVALIDO', true], JSON.stringify([correo, area]));
    }
  });
  prueba('invitar de nuevo a quien ya está activo cambia su área (accion cambio_area) y queda en la bitácora', async () => {
    await conCopia(plantilla, async db => {
      const D = sesionDe(db, db.u.dir);
      const r = await llamar(D, 'miembro_alta', { p_correo: 'pag@al3d.test', p_area: 'fabricacion' }, { confirmar: true });
      igual([r.ok, r.accion], [true, 'cambio_area']);
      const b = (await sql(db, `select antes, despues from public.bitacora where accion = 'cambio_area' and entidad_id = 'pag@al3d.test'`))[0];
      igual([b.antes.area, b.despues.area], ['pagos', 'fabricacion']);
    });
  });
});

describir('AC-07 la cuenta se recreó (otro uid, mismo correo)', () => {
  prueba('reclamar_acceso → ACCESO_CONFLICTO y la fila no cambia (Dirección tiene que reactivarla)', async () => {
    await conCopia(plantilla, async db => {
      const viejo = await crearUsuarioAuth(db, { correo: 'viejo@al3d.test' });
      await sql(db, `insert into public.miembros (empresa_id, correo, area, estado, usuario_id) values ('al3d', 'viejo@al3d.test', 'pagos', 'activo', '${viejo.uid}')`);
      await sql(db, `delete from auth.users where id = '${viejo.uid}'`);                 // auth.users.email es único: no hay dos cuentas vivas con el mismo correo
      const nuevo = await crearUsuarioAuth(db, { correo: 'viejo@al3d.test' });
      const e = await llamar(sesionDe(db, nuevo), 'reclamar_acceso', {}, { confirmar: true });
      igual([e.ok, e.codigo, e.definitivo], [false, 'ACCESO_CONFLICTO', false]);
      igual((await sql(db, `select usuario_id, estado from public.miembros where correo = 'viejo@al3d.test'`))[0], { usuario_id: viejo.uid, estado: 'activo' });
    });
  });
});

describir('AC-08 y AC-09 baja: efecto inmediato, con el mismo JWT, y la persona se entera', () => {
  prueba('Dirección da de baja a Fabricación: 1 fila → 0 SIN reautenticar; mi_acceso dice acceso_revocado; ve su fila baja', async () => {
    await conCopia(plantilla, async db => {
      const F = sesionDe(db, db.u.fab);
      igual(await contar(F, 'empresas'), 1, 'antes de la baja');
      const r = await llamar(sesionDe(db, db.u.dir), 'miembro_baja', { p_correo: 'fab@al3d.test' }, { confirmar: true });
      igual(r.ok, true);
      igual(await contar(F, 'empresas'), 0, 'después de la baja: 0 filas, mismo JWT');
      igual((await llamar(F, 'mi_acceso')).estado, 'acceso_revocado');
      igual((await F.query(`select estado from public.miembros`)).map(x => x.estado), ['baja'], 'sí ve su propia fila baja');
      const e = await invitar(F);
      igual([e.ok, e.codigo, e.definitivo], [false, 'ACCESO_REVOCADO', false], 'una escritura recibe ACCESO_REVOCADO, NO definitivo');
      const bit = (await sql(db, `select nivel, usuario_id from public.bitacora where accion = 'baja'`))[0];
      igual([bit.nivel, bit.usuario_id], ['direccion', db.u.dir.uid], 'bitácora direccion con quién la dio');
      const f = (await sql(db, `select baja_en is not null as b, baja_por, estado, usuario_id from public.miembros where correo = 'fab@al3d.test'`))[0];
      igual(f, { b: true, baja_por: db.u.dir.uid, estado: 'baja', usuario_id: db.u.fab.uid }, 'la fila NO se borra');
    });
  });
  prueba('miembro_baja dos veces: la segunda es sin_cambio; de alguien que no existe: NO_ENCONTRADO (definitivo)', async () => {
    await conCopia(plantilla, async db => {
      const D = sesionDe(db, db.u.dir);
      await llamar(D, 'miembro_baja', { p_correo: 'fab@al3d.test' }, { confirmar: true });
      igual(await llamar(D, 'miembro_baja', { p_correo: 'fab@al3d.test' }), { ok: true, sin_cambio: true });
      const e = await llamar(D, 'miembro_baja', { p_correo: 'fantasma@al3d.test' });
      igual([e.codigo, e.definitivo], ['NO_ENCONTRADO', true]);
    });
  });
  prueba('u_baja (ya en baja desde la semilla): ACCESO_REVOCADO, 0 filas', async () => {
    const db = await plantilla(), B = sesionDe(db, db.u.baja);
    igual((await llamar(B, 'mi_acceso')).estado, 'acceso_revocado');
    igual(await contar(B, 'empresas'), 0);
    igual((await invitar(B)).codigo, 'ACCESO_REVOCADO');
  });
});

describir('AC-10 cambiar el área surte efecto en la SIGUIENTE petición', () => {
  prueba('Fabricación → Pagos: empieza a leer la bitácora de nivel dinero y deja de ser Fabricación en mi_acceso.permisos', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.bitacora (empresa_id, nivel, accion, entidad, titulo) values ('al3d', 'dinero', 'prueba', 'venta', 'Un hecho de dinero')`);
      const F = sesionDe(db, db.u.fab);
      igual(await contar(F, 'bitacora', `nivel = 'dinero'`), 0, 'Fabricación no lo ve');
      igual((await llamar(F, 'mi_acceso')).permisos.ve_dinero, false);
      const r = await llamar(sesionDe(db, db.u.dir), 'miembro_cambiar_area', { p_correo: 'fab@al3d.test', p_area: 'pagos' }, { confirmar: true });
      igual(r.ok, true);
      igual(await contar(F, 'bitacora', `nivel = 'dinero'`), 1, 'ahora sí, con el mismo JWT');
      igual((await llamar(F, 'mi_acceso')).permisos.ve_dinero, true);
      const e = await invitar(F);
      igual(e.codigo, 'ROL_SIN_PERMISO', 'y deja de poder invitar (nunca pudo)');
      const b = (await sql(db, `select antes, despues from public.bitacora where accion = 'cambio_area' and entidad_id = 'fab@al3d.test'`))[0];
      igual([b.antes.area, b.despues.area], ['fabricacion', 'pagos'], 'bitácora con antes {area} y despues {area}');
    });
  });
  prueba('cambiar a la misma área es sin_cambio; a un área inventada, DATO_INVALIDO; a quien está en baja, NO_ENCONTRADO', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    igual(await llamar(D, 'miembro_cambiar_area', { p_correo: 'fab@al3d.test', p_area: 'fabricacion' }), { ok: true, sin_cambio: true });
    igual((await llamar(D, 'miembro_cambiar_area', { p_correo: 'fab@al3d.test', p_area: 'cliente' })).codigo, 'DATO_INVALIDO');
    igual((await llamar(D, 'miembro_cambiar_area', { p_correo: 'baja@al3d.test', p_area: 'pagos' })).codigo, 'NO_ENCONTRADO');
  });
});

describir('AC-11 miembro_alta de una baja', () => {
  prueba('con usuario_id → vuelve activo (sin reclamar); sin él → vuelve invitado; y se limpia baja_en/baja_por', async () => {
    await conCopia(plantilla, async db => {
      const D = sesionDe(db, db.u.dir);
      await llamar(D, 'miembro_baja', { p_correo: 'fab@al3d.test' }, { confirmar: true });
      const r = await llamar(D, 'miembro_alta', { p_correo: 'fab@al3d.test', p_area: 'fabricacion' }, { confirmar: true });
      igual([r.ok, r.accion], [true, 'reactivo']);
      igual((await sql(db, `select estado, baja_en, baja_por from public.miembros where correo = 'fab@al3d.test'`))[0], { estado: 'activo', baja_en: null, baja_por: null });
      igual((await llamar(sesionDe(db, db.u.fab), 'mi_acceso')).estado, 'activo', 'la persona vuelve a entrar sin hacer nada');
      await sql(db, `insert into public.miembros (empresa_id, correo, area, estado, baja_en) values ('al3d', 'nuncaentro@al3d.test', 'pagos', 'baja', now())`);
      await llamar(D, 'miembro_alta', { p_correo: 'nuncaentro@al3d.test', p_area: 'pagos' }, { confirmar: true });
      igual((await sql(db, `select estado, usuario_id from public.miembros where correo = 'nuncaentro@al3d.test'`))[0], { estado: 'invitado', usuario_id: null });
    });
  });
});

describir('AC-12 Fabricación y Pagos no administran accesos', () => {
  for (const clave of ['fab', 'pag']) {
    prueba(`${clave}: miembro_alta, miembro_cambiar_area y miembro_baja → ROL_SIN_PERMISO (definitivo); solo ve su propia fila`, async () => {
      const db = await plantilla(), S = sesionDe(db, db.u[clave]);
      for (const [f, a] of [['miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' }],
                            ['miembro_cambiar_area', { p_correo: 'pag@al3d.test', p_area: 'direccion' }],
                            ['miembro_baja', { p_correo: 'dir@al3d.test' }]]) {
        const e = await llamar(S, f, a);
        igual([f, e.ok, e.codigo, e.definitivo], [f, false, 'ROL_SIN_PERMISO', true]);
      }
      igual(await contar(S, 'miembros'), 1);
      igual((await S.query(`select correo from public.miembros`))[0].correo, DEFS[clave].correo);
    });
  }
  prueba('Dirección sí ve a todos los de su empresa (contraprueba)', async () => {
    const db = await plantilla();
    igual(await contar(sesionDe(db, db.u.dir), 'miembros'), 8, 'dir, dir2, fab, pag, inv, noverif, baja y multi (en al3d)');
  });
  prueba('ninguna escritura directa a miembros: ni Dirección puede hacer INSERT/UPDATE/DELETE (todo es por RPC)', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    for (const q of [`insert into public.miembros (empresa_id, correo, area) values ('al3d', 'z@al3d.test', 'pagos')`,
                     `update public.miembros set area = 'direccion' where correo = 'fab@al3d.test'`,
                     `delete from public.miembros where correo = 'fab@al3d.test'`]) {
      await esperarError(D.query(q), '42501');
    }
  });
});

describir('AC-13 siempre queda al menos un Dirección activo', () => {
  prueba('el ÚNICO Dirección no se puede dar de baja, degradar con cambiar_area ni degradar con miembro_alta', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.empresas (id, nombre) values ('solo', 'Solo') on conflict do nothing`);
      const u = await crearUsuarioAuth(db, { correo: 'unico@solo.test' });
      await sql(db, `insert into public.miembros (empresa_id, correo, area, estado, usuario_id) values ('solo', 'unico@solo.test', 'direccion', 'activo', '${u.uid}')`);
      const U = sesionDe(db, u);
      igual((await llamar(U, 'miembro_baja', { p_correo: 'unico@solo.test' })).codigo, 'DATO_INVALIDO');
      igual((await llamar(U, 'miembro_cambiar_area', { p_correo: 'unico@solo.test', p_area: 'pagos' })).codigo, 'DATO_INVALIDO');
      igual((await llamar(U, 'miembro_alta', { p_correo: 'unico@solo.test', p_area: 'pagos' })).codigo, 'DATO_INVALIDO', 'tampoco por el camino de miembro_alta');
      igual((await sql(db, `select area, estado from public.miembros where correo = 'unico@solo.test'`))[0], { area: 'direccion', estado: 'activo' });
    });
  });
  prueba('con otro Dirección activo (u_dir2) sí se puede', async () => {
    await conCopia(plantilla, async db => {
      const D = sesionDe(db, db.u.dir);
      igual((await llamar(D, 'miembro_baja', { p_correo: 'dir@al3d.test' }, { confirmar: true })).ok, true);
      igual((await sql(db, `select estado from public.miembros where correo = 'dir@al3d.test'`))[0].estado, 'baja');
    });
  });
  prueba('un Dirección en OTRA empresa no cuenta como «otro Dirección activo»', async () => {
    await conCopia(plantilla, async db => {
      // `otra@otra.test` es Dirección en `otra`; el único Dirección de una empresa nueva no se salva por eso
      await sql(db, `insert into public.empresas (id, nombre) values ('solo', 'Solo') on conflict do nothing`);
      const u = await crearUsuarioAuth(db, { correo: 'unico2@solo.test' });
      await sql(db, `insert into public.miembros (empresa_id, correo, area, estado, usuario_id) values ('solo', 'unico2@solo.test', 'direccion', 'activo', '${u.uid}')`);
      igual((await llamar(sesionDe(db, u), 'miembro_baja', { p_correo: 'unico2@solo.test' })).codigo, 'DATO_INVALIDO');
    });
  });
});

describir('AC-14 una lista vacía de RLS no es una revocación', () => {
  prueba('Fabricación lee 0 filas de la bitácora de dinero (por diseño) y mi_acceso sigue diciendo activo', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    igual(await contar(F, 'bitacora', `nivel = 'dinero'`), 0);
    igual((await llamar(F, 'mi_acceso')).estado, 'activo');
  });
});

describir('AC-15 varias empresas (u_multi): la baja cuenta solo en la empresa pedida', () => {
  prueba('con dos membresías activas y sin p_empresa → EMPRESA_REQUERIDA (no definitivo); con p_empresa funciona', async () => {
    const db = await plantilla(), M = sesionDe(db, db.u.multi);
    const e = await invitar(M);
    igual([e.codigo, e.definitivo], ['EMPRESA_REQUERIDA', false]);
    igual((await llamar(M, 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos', p_empresa: 'al3d' })).ok, true, 'Dirección en al3d');
    igual((await llamar(M, 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos', p_empresa: 'otra' })).codigo, 'ROL_SIN_PERMISO', 'Fabricación en otra');
  });
  prueba('baja en otra y activo en al3d: estado activo; ACCESO_REVOCADO solo para otra; SIN_ACCESO para una que nunca tuvo', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `update public.miembros set estado = 'baja', baja_en = now() where correo = 'multi@al3d.test' and empresa_id = 'otra'`);
      const M = sesionDe(db, db.u.multi);
      const a = await llamar(M, 'mi_acceso');
      igual(a.estado, 'activo');
      cierto(a.empresas.some(e => e.empresa_id === 'otra' && e.estado === 'baja'), 'la baja aparece en empresas');
      igual((await llamar(M, 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos', p_empresa: 'otra' })).codigo, 'ACCESO_REVOCADO');
      igual((await llamar(M, 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos', p_empresa: 'jamas' })).codigo, 'SIN_ACCESO');
      igual((await llamar(M, 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' })).ok, true, 'sin p_empresa y con UNA sola activa, la resuelve sola');
    });
  });
});

describir('AC-16 versión de contrato', () => {
  prueba('una RPC de escritura SIN cabecera o con x-al3d-contrato: 0 → CLIENTE_VIEJO (no definitivo, con el mínimo); con 1, pasa', async () => {
    const db = await plantilla(), D = sesionSinContrato(db, db.u.dir);
    const sin = await llamar(D, 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' });
    igual([sin.ok, sin.codigo, sin.definitivo, sin.minimo], [false, 'CLIENTE_VIEJO', false, 1]);
    const cero = await llamar(sesionSinContrato(db, db.u.dir, { cabeceras: { 'x-al3d-contrato': '0' } }), 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' });
    igual(cero.codigo, 'CLIENTE_VIEJO');
    const raro = await llamar(sesionSinContrato(db, db.u.dir, { cabeceras: { 'x-al3d-contrato': 'abc' } }), 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' });
    igual(raro.codigo, 'CLIENTE_VIEJO', 'una cabecera que no es un entero también');
    const ok = await llamar(sesionSinContrato(db, db.u.dir, { cabeceras: { 'x-al3d-contrato': '1' } }), 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' });
    igual(ok.ok, true);
    const mas = await llamar(sesionSinContrato(db, db.u.dir, { cabeceras: { 'x-al3d-contrato': '7' } }), 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' });
    igual(mas.ok, true, 'un cliente más nuevo que el mínimo pasa');
  });
  prueba('mi_acceso y reclamar_acceso NO exigen la cabecera (una app vieja debe poder enterarse de que está vieja)', async () => {
    const db = await plantilla(), D = sesionSinContrato(db, db.u.dir);
    const a = await llamar(D, 'mi_acceso');
    igual([a.ok, a.estado, a.contrato], [true, 'activo', { actual: 1, minimo: 1 }]);
    igual((await llamar(sesionSinContrato(db, db.u.ext), 'reclamar_acceso')).estado, 'sin_acceso');
  });
  prueba('version_contrato la puede llamar cualquier sesión autenticada y devuelve {actual, minimo, esquema}', async () => {
    const db = await plantilla();
    igual(await llamar(sesionSinContrato(db, db.u.ext), 'version_contrato'), { actual: 1, minimo: 1, esquema: 'al3d-1' });
    await esperarError(como(db, { rol: 'anon' }).rpc('version_contrato', {}), '42501');
  });
  prueba('la cabecera se comprueba ANTES del acceso: sin cabecera, un usuario sin acceso recibe CLIENTE_VIEJO y no SIN_ACCESO', async () => {
    const db = await plantilla();
    igual((await llamar(sesionSinContrato(db, db.u.ext), 'miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' })).codigo, 'CLIENTE_VIEJO');
  });
});

describir('AC-17 anon no entra', () => {
  prueba('anon no puede ni ejecutar mi_acceso, reclamar_acceso ni las RPC de miembros (permission denied)', async () => {
    const db = await plantilla(), A = como(db, { rol: 'anon' });
    await esperarError(A.rpc('mi_acceso', {}), '42501');
    await esperarError(A.rpc('reclamar_acceso', {}), '42501');
    await esperarError(A.rpc('miembro_alta', { p_correo: 'x@al3d.test', p_area: 'pagos' }), '42501');
    await esperarError(A.rpc('miembro_baja', { p_correo: 'x@al3d.test' }), '42501');
  });
  prueba('una sesión SIN sub (teórico: el arnés no fabrica un JWT authenticated sin sub) recibe SIN_SESION de mi_acceso y ROL_SIN_PERMISO de una RPC de escritura', async () => {
    const db = await plantilla();
    // como superusuario y sin claims: auth.uid() es null, igual que con un JWT sin `sub`. La cabecera se fija solo en esta transacción.
    const [r] = await sql(db, `select public.mi_acceso() as a`);
    igual([r.a.ok, r.a.codigo, r.a.definitivo], [false, 'SIN_SESION', false]);
    const [w] = await sql(db, `select set_config('request.headers', '{"x-al3d-contrato":"1"}', true) as h;
                               select public.miembro_alta('x@al3d.test', 'pagos') as r`);
    igual(w.r.codigo, 'ROL_SIN_PERMISO');
  });
});

describir('AC-18 dos empresas, el mismo correo', () => {
  prueba('Dirección de al3d y Dirección de otra invitan el mismo correo: dos filas independientes', async () => {
    await conCopia(plantilla, async db => {
      await llamar(sesionDe(db, db.u.dir), 'miembro_alta', { p_correo: 'comun@x.test', p_area: 'pagos' }, { confirmar: true });
      await llamar(sesionDe(db, db.u.otra), 'miembro_alta', { p_correo: 'comun@x.test', p_area: 'fabricacion' }, { confirmar: true });
      const f = await sql(db, `select empresa_id, area from public.miembros where correo = 'comun@x.test' order by empresa_id`);
      igual(f.map(x => [x.empresa_id, x.area]), [['al3d', 'pagos'], ['otra', 'fabricacion']]);
    });
  });
  prueba('el Dirección de una empresa no ve ni toca a los miembros de la otra', async () => {
    const db = await plantilla(), O = sesionDe(db, db.u.otra);
    igual((await O.query(`select correo from public.miembros order by correo`)).map(x => x.correo), ['multi@al3d.test', 'otra@otra.test'].sort());
    igual((await llamar(O, 'miembro_baja', { p_correo: 'fab@al3d.test' })).codigo, 'NO_ENCONTRADO', 'en su empresa no existe: no revela que existe en al3d');
  });
});

describir('permisos que mi_acceso entrega al cliente (reemplazan a `escribibles` de /salud)', () => {
  prueba('cada área recibe SU parte de la matriz; con dos empresas activas y sin p_empresa, ninguna', async () => {
    const db = await plantilla();
    const p = async (k, a = {}) => (await llamar(sesionDe(db, db.u[k]), 'mi_acceso', a)).permisos;
    igual((await p('dir')).corregir_venta.includes('iva'), true);
    igual((await p('pag')).corregir_venta.includes('iva'), false);
    igual((await p('fab')).proyecto_actualizar.includes('contacto'), false);
    igual((await p('fab')).ve_dinero, false);
    igual(await p('multi'), null);
    igual((await p('multi', { p_empresa: 'otra' })).ve_dinero, false, 'Fabricación en otra');
    igual((await p('multi', { p_empresa: 'al3d' })).ve_dinero, true, 'Dirección en al3d');
  });
  prueba('mi_acceso de Dirección: usuario con id y correo; empresas con área y estado', async () => {
    const db = await plantilla();
    const a = await llamar(sesionDe(db, db.u.dir), 'mi_acceso');
    igual(a.usuario, { id: db.u.dir.uid, correo: 'dir@al3d.test' });
    igual(a.empresas, [{ empresa_id: 'al3d', area: 'direccion', estado: 'activo' }]);
  });
});

await resumen();
