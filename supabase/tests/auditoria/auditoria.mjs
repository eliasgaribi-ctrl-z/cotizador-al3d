// Auditoría de privilegios — A.md §10.3, casos GR-01 a GR-10, y la prueba del ABORTO de `0011_auditoria.sql`.
//
// Todo lo que protege este diseño es un privilegio, así que la prueba más importante es la que mira los privilegios REALES: cada caso de GR consulta el catálogo
// por su cuenta (sin usar `interno.auditoria()`) y exige el resultado correcto. Y como la propia aduana también puede fallar, la segunda parte le mete DEFECTOS
// A PROPÓSITO a copias de la base y exige que `0011_auditoria.sql` ABORTE nombrando cada uno: una auditoría que nunca se ha visto fallar no es una auditoría.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, llamar, una, sql, conCopia, como } from '../comun/semilla.js';
import { exigirAuditoriaLimpia, crearBase } from '../arnes/arnes.mjs';
import { sol, aut, sello, CLAVE_DEL_MAPA } from '../comun/notario.js';
import * as Sello from '../../functions/_shared/sello.js';

const TEXTO_0011 = readFileSync(fileURLToPath(new URL('../../migrations/0011_auditoria.sql', import.meta.url)), 'utf8');
const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  return db;
}, { limpiar: db => db.close() });

const PUBLICAS_CLIENTE = ['almacen_aplicar', 'alta_venta', 'cancelar_solicitud', 'comisiones_cobradas', 'constante_guardar', 'corregir_abono', 'corregir_venta', 'cotizacion_guardar', 'cuaderno_guardar',
  'descartar_cotizacion', 'emitir_salidas_derivadas', 'estado_solicitudes', 'ganar_proyecto', 'instalacion_guardar', 'mi_acceso', 'miembro_alta', 'miembro_baja', 'miembro_cambiar_area', 'mover_etapa',
  'proyecto_actualizar', 'rechazar_solicitud', 'reclamar_acceso', 'registrar_abono_comision', 'registrar_cobro', 'repartir_abono_fifo', 'revocar_autorizacion', 'solicitar', 'subida_unica', 'version_contrato',
  'vista_previa_reparto'];
const PUBLICAS_SERVICIO = ['autorizacion_para_verificar', 'contador_sembrar', 'cuadre_hoja', 'ia_cuota', 'ia_turno', 'registrar_autorizacion', 'verificar_cupo'];
const TRECE = ['abonos', 'almacen_costos', 'almacen_movimientos', 'bitacora', 'constantes', 'cotizaciones', 'instalaciones', 'materiales', 'miembros', 'proyectos', 'requerimientos', 'solicitudes', 'ventas_dinero'];

/** Las funciones de un esquema con lo que cada rol puede hacer (consulta directa al catálogo). */
const funciones = (db, esquema) => sql(db, `select p.proname as nombre, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.proconfig as config,
    has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as svc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.prokind = 'f' order by 1`, [esquema]);
/** Los privilegios que un rol tiene sobre cada tabla/vista de `public`, leídos de la ACL (con o sin PUBLIC). */
const acls = (db, rol) => sql(db, `select c.relname as nombre, c.relkind as tipo, array(select distinct a.privilege_type from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                                    where a.grantee = (select oid from pg_roles where rolname = $1) or a.grantee = 0 order by 1) as privilegios,
                                  exists (select 1 from pg_policy p where p.polrelid = c.oid) as politica
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') order by 1`, [rol]);

describir('GR-01 a GR-04 funciones, RLS y vistas', () => {
  prueba('GR-01 ninguna función de public ni de interno es ejecutable por anon (ni por PUBLIC): has_function_privilege(anon) es falso en TODAS', async () => {
    const db = await plantilla();
    for (const esq of ['public', 'interno']) {
      const f = await funciones(db, esq);
      cierto(f.length > 30, `hay funciones en ${esq}`);
      igual([esq, f.filter(x => x.anon).map(x => x.nombre + '(' + x.args + ')')], [esq, []]);
    }
  });
  prueba('GR-02 las 7 funciones de servicio: authenticated NO las ejecuta y service_role SÍ; las 30 de cliente: authenticated sí; y no hay ninguna otra función en public', async () => {
    const db = await plantilla(), f = await funciones(db, 'public');
    igual(f.map(x => x.nombre).sort(), [...PUBLICAS_CLIENTE, ...PUBLICAS_SERVICIO].sort(), 'las 37 y solo esas');
    for (const x of f.filter(x => PUBLICAS_SERVICIO.includes(x.nombre))) igual([x.nombre, x.auth, x.svc, x.anon], [x.nombre, false, true, false]);
    for (const x of f.filter(x => PUBLICAS_CLIENTE.includes(x.nombre))) igual([x.nombre, x.auth, x.anon], [x.nombre, true, false]);
    igual([PUBLICAS_CLIENTE.length, PUBLICAS_SERVICIO.length], [30, 7]);
    // y de verdad: el rol authenticated recibe «permission denied» al llamar a una de servicio
    for (const [fn, args] of [['registrar_autorizacion', aut(db)], ['cuadre_hoja', { p_empresa: 'al3d' }], ['ia_cuota', { p_usuario: '00000000-0000-4000-8000-0000000000d1' }], ['autorizacion_para_verificar', { p_folio: 'COT-1', p_codigo: 'ABCDEF012345' }]]) {
      await esperarError(sesionDe(db, db.u.dir).rpc(fn, args), '42501', fn);
    }
  });
  prueba('GR-03 relrowsecurity verdadero en TODA tabla de public; contadores no tiene NINGUNA política; las demás tienen al menos una', async () => {
    const db = await plantilla();
    const t = await sql(db, `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forzada, (select count(*)::int from pg_policy p where p.polrelid = c.oid) as politicas
                               from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    igual(t.length, 17, 'las 17 tablas de public');
    igual(t.filter(x => !x.rls).map(x => x.relname), []);
    igual(t.find(x => x.relname === 'contadores').politicas, 0);
    igual(t.filter(x => x.relname !== 'contadores' && x.politicas === 0).map(x => x.relname), [], 'toda tabla legible tiene su política (la RLS no la deja «abierta» por omisión)');
  });
  prueba('GR-04 toda vista de public lleva security_invoker=true en sus reloptions (y no hay vistas materializadas)', async () => {
    const db = await plantilla();
    const v = await sql(db, `select c.relname, c.relkind, c.reloptions::text as opciones from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1`);
    igual(v.map(x => x.relname), ['comisiones_pendientes', 'espejo_abonos', 'espejo_ventas', 'ventas_calculadas']);
    for (const x of v) igual([x.relname, x.relkind, x.opciones], [x.relname, 'v', '{security_invoker=true}']);
  });
  prueba('GR-01/03/04/07 el auditor genérico del arnés (auditarRLS) también sale limpio, sin excepciones', async () => {
    const db = await plantilla();
    const r = await exigirAuditoriaLimpia(db);
    igual([r.ok, r.total], [true, 0]);
  });
});

describir('GR-05 a GR-09 Realtime, privilegios, search_path, interno y borrados', () => {
  prueba('GR-05 las 13 tablas publicadas tienen replica identity DEFAULT (d) y supabase_realtime contiene EXACTAMENTE esas 13 (ni empresas, ni autorizaciones, ni cuaderno_notas, ni contadores)', async () => {
    const db = await plantilla();
    const pub = (await sql(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1`)).map(r => r.tablename);
    igual(pub, TRECE);
    const rep = await sql(db, `select c.relname, c.relreplident as r from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    igual(rep.filter(x => TRECE.includes(x.relname)).map(x => x.r), Array(13).fill('d'));
    igual(rep.filter(x => x.r !== 'd').map(x => x.relname), [], 'ninguna tabla, publicada o no, con identidad de réplica FULL o por índice');
    igual((await una(db, `select pubinsert and pubupdate and pubdelete as todo from pg_publication where pubname = 'supabase_realtime'`)).todo, true);
  });
  prueba('GR-06 anon: NINGÚN privilegio en ninguna tabla ni vista; authenticated: SOLO SELECT, en tablas únicamente donde hay política y de las vistas solo ventas_calculadas y comisiones_pendientes; service_role: nunca DELETE ni TRUNCATE', async () => {
    const db = await plantilla();
    const anon = await acls(db, 'anon'), auth = await acls(db, 'authenticated'), svc = await acls(db, 'service_role');
    igual(anon.filter(x => x.privilegios.length).map(x => x.nombre + ':' + x.privilegios.join(',')), []);
    igual(auth.filter(x => x.privilegios.some(p => p !== 'SELECT')).map(x => x.nombre + ':' + x.privilegios.join(',')), [], 'authenticated nunca escribe');
    const lee = auth.filter(x => x.privilegios.includes('SELECT'));
    igual(lee.filter(x => x.tipo === 'v').map(x => x.nombre), ['comisiones_pendientes', 'ventas_calculadas']);
    igual(lee.filter(x => x.tipo === 'r' && !x.politica).map(x => x.nombre), [], 'ninguna tabla se lee sin política');
    igual(auth.filter(x => x.tipo === 'r' && x.politica && !x.privilegios.includes('SELECT')).map(x => x.nombre), [], 'ni queda una tabla con política y sin GRANT (nadie la podría leer)');
    igual(svc.filter(x => x.tipo === 'r').flatMap(x => x.privilegios.filter(p => ['DELETE', 'TRUNCATE'].includes(p)).map(p => x.nombre + ':' + p)), []);
    igual(svc.find(x => x.nombre === 'contadores').privilegios, ['INSERT', 'SELECT', 'UPDATE']);
    igual(svc.find(x => x.nombre === 'espejo_ventas').privilegios, ['SELECT']);
    igual(auth.find(x => x.nombre === 'contadores').privilegios, [], 'authenticated ni siquiera lee contadores');
    // y de verdad: authenticated escribiendo directo
    await esperarError(sesionDe(db, db.u.dir).query(`update public.proyectos set nombre = 'x'`), '42501');
    await esperarError(como(db, { rol: 'anon' }).query(`select * from public.proyectos`), '42501');
  });
  prueba('GR-06 los esquemas: anon y authenticated no pueden CREAR en public; nadie de la aplicación puede CREAR en interno; las secuencias no se tocan', async () => {
    const db = await plantilla();
    for (const rol of ['anon', 'authenticated', 'service_role']) igual([rol, (await una(db, `select has_schema_privilege($1, 'public', 'create') as c`, [rol])).c], [rol, false]);
    for (const rol of ['anon', 'authenticated', 'service_role']) igual([rol, (await una(db, `select has_schema_privilege($1, 'interno', 'create') as c`, [rol])).c], [rol, false]);
    const sec = await sql(db, `select c.relname, has_sequence_privilege('anon', c.oid, 'usage,select,update') as a, has_sequence_privilege('authenticated', c.oid, 'usage,select,update') as b
                                from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'interno') and c.relkind = 'S'`);
    cierto(sec.length >= 3, 'hay secuencias');
    igual(sec.filter(x => x.a || x.b).map(x => x.relname), []);
  });
  prueba('GR-07 toda función SECURITY DEFINER de public e interno fija search_path = "" (proconfig)', async () => {
    const db = await plantilla();
    for (const esq of ['public', 'interno']) {
      const f = (await funciones(db, esq)).filter(x => x.definer);
      cierto(f.length >= 2, `hay SECURITY DEFINER en ${esq}`);
      igual([esq, f.filter(x => !(x.config ?? []).includes('search_path=""')).map(x => x.nombre)], [esq, []]);
    }
    // y TODA función de public lo es (las RPC escriben con los privilegios del dueño, nunca con los del llamante)
    const pub = await funciones(db, 'public');
    igual(pub.filter(x => !x.definer).map(x => x.nombre), ['version_contrato'], 'toda RPC es SECURITY DEFINER salvo la constante version_contrato (que igual fija su search_path)');
    cierto((pub.find(x => x.nombre === 'version_contrato').config ?? []).includes('search_path=""'));
  });
  prueba('GR-08 el esquema interno: anon sin USAGE ni EXECUTE; authenticated con USAGE y EXECUTE solo en empresas_donde, neto, comision y hoy_mx; service_role esas cuatro más sellos_validos y contiene_dinero', async () => {
    const db = await plantilla();
    const sch = async rol => (await una(db, `select has_schema_privilege($1, 'interno', 'usage') as u`, [rol])).u;
    igual([await sch('anon'), await sch('authenticated'), await sch('service_role')], [false, true, true]);
    const f = await funciones(db, 'interno');
    igual(f.filter(x => x.anon).map(x => x.nombre), []);
    igual([...new Set(f.filter(x => x.auth).map(x => x.nombre))].sort(), ['comision', 'empresas_donde', 'hoy_mx', 'neto']);
    igual([...new Set(f.filter(x => x.svc).map(x => x.nombre))].sort(), ['comision', 'contiene_dinero', 'empresas_donde', 'hoy_mx', 'neto', 'sellos_validos']);
    // y de verdad: authenticated llamando a una interna que no es suya
    await esperarError(sesionDe(db, db.u.dir).query(`select interno.siguiente('al3d', 'V', '', 1)`), '42501');
    await esperarError(sesionDe(db, db.u.dir).query(`select interno.ctx(null)`), '42501');
    await esperarError(como(db, { rol: 'anon' }).query(`select interno.neto(1, true)`), '42501');
    igual((await sesionDe(db, db.u.dir).query(`select interno.neto(100, true)::text as n`))[0].n, '116.00', 'las cuatro permitidas sí');
  });
  prueba('GR-09 toda tabla de negocio tiene su trigger sin_borrar (contadores es la única sin él) y los libros su solo_agregar', async () => {
    const db = await plantilla();
    const t = await sql(db, `select c.relname, exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal and g.tgfoid = 'interno.sin_borrar()'::regprocedure and g.tgenabled <> 'D') as sin_borrar,
                                    exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal and g.tgfoid = 'interno.solo_agregar()'::regprocedure and g.tgenabled <> 'D') as libro
                               from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    igual(t.filter(x => !x.sin_borrar).map(x => x.relname), ['contadores']);
    igual(t.filter(x => x.libro).map(x => x.relname), ['abonos', 'almacen_movimientos', 'bitacora']);
  });
});

describir('GR-10 la clave del sello no existe en la base', () => {
  prueba('GR-10 tras un flujo completo de autorización con la clave FALSA (solicitar, firmar con sello.js, registrar, verificar, revocar), esa cadena no aparece en NINGUNA tabla, en el texto de NINGUNA función ni en los comentarios', () => conCopia(plantilla, async db => {
    const S = quien => sesionDe(db, db.u[quien], { confirmar: true });
    await llamar(S('pag'), 'solicitar', { p_op: sol('COT-0042-B@K7QM') });
    const r = { folio: 'COT-0042-B@K7QM', huella: 'c|1:x', subCalc: 12500, precioAuth: 0, itemsAuth: '', total: 14500, proyecto: 'Tacos "El Güero"', correo: db.u.dir.correo, ts: '2026-10-01T04:30:15.123Z', renglones: '[["Letras «TACOS»",8,12500]]' };
    const s = await Sello.sellar(r, CLAVE_DEL_MAPA);
    const ok = await llamar(como(db, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(db, { p_codigo: s.codigo, p_firma: s.firma, p_codificacion: s.codificacion, p_renglones: r.renglones }));
    igual(ok.ok, true);
    const fila = (await llamar(como(db, { rol: 'service_role' }), 'autorizacion_para_verificar', { p_folio: 'COT-0042-B', p_codigo: s.codigo })).filas[0];
    igual((await Sello.verificar(fila, CLAVE_DEL_MAPA)).valida, true);
    await llamar(S('dir'), 'revocar_autorizacion', { p_folio_global: 'COT-0042-B@K7QM', p_nota: 'prueba' });
    // la búsqueda: un trozo distintivo de la clave (y la clave entera) en todas las columnas de todas las tablas de public
    const trozos = [CLAVE_DEL_MAPA, CLAVE_DEL_MAPA.slice(0, 20), 'FALSO-0000aaaa', 'FALSO-0000bbbb', 'FALSO-0000cccc'];
    const tablas = (await sql(db, `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`)).map(x => x.relname);
    igual(tablas.length, 17, 'se recorrieron las 17 tablas');
    for (const t of tablas) {
      for (const trozo of trozos) igual([t, (await una(db, `select count(*)::int as n from public."${t}" x where x::text like '%' || $1 || '%'`, [trozo])).n], [t, 0]);
    }
    for (const trozo of trozos) {
      igual((await una(db, `select count(*)::int as n from pg_proc where prosrc like '%' || $1 || '%' or (prokind in ('f', 'p') and pronamespace in ('public'::regnamespace, 'interno'::regnamespace) and pg_get_functiondef(oid) like '%' || $1 || '%')`, [trozo])).n, 0, 'texto de funciones');
      igual((await una(db, `select count(*)::int as n from pg_description where description like '%' || $1 || '%'`, [trozo])).n, 0, 'comentarios');
      igual((await una(db, `select count(*)::int as n from pg_settings where setting like '%' || $1 || '%' or coalesce(boot_val, '') like '%' || $1 || '%'`, [trozo])).n, 0, 'configuración');
    }
    // y lo que SÍ está: la firma y el código (público: van impresos en el PDF), pero no la clave
    igual((await una(db, `select count(*)::int as n from public.autorizaciones where firma = $1`, [s.firma])).n, 1);
    // ninguna función ni columna se llama «secreto», «hmac», «firmar» ni «sellar»: la base no sabe firmar (solo_claves/sin_claves son de las llaves de un JSON, no de la clave del sello)
    igual((await sql(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'interno') and (p.proname ~* '(clave_del_sello|clave_sello|secret|hmac|firmar|sellar)')`)).map(x => x.proname), []);
    igual((await sql(db, `select table_name || '.' || column_name as c from information_schema.columns where table_schema = 'public' and column_name ~* '(clave_sello|secret|hmac|llave)'`)).map(x => x.c), []);
  }), { tiempo: 120_000 });
});

describir('un proyecto con «exponer tablas automáticamente» ENCENDIDO termina igual de cerrado', () => {
  /** Los privilegios por defecto de un proyecto de Supabase con la exposición automática encendida (todo para los tres roles, también fuera de `public`). */
  const EXPUESTO = `
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres grant all on functions to anon, authenticated, service_role;
    alter default privileges for role postgres grant all on tables to anon, authenticated, service_role;`;
  const resumenDePrivilegios = async db => ({
    tablas: await sql(db, `select c.relname, array(select (case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) || ':' || a.privilege_type from aclexplode(c.relacl) a order by 1) as acl
                             from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'interno') and c.relkind in ('r', 'v') order by 1`),
    funciones: await sql(db, `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f, has_function_privilege('anon', p.oid, 'execute') as anon,
                                     has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as svc
                                from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'interno') and p.prokind = 'f' order by 1`),
    secuencias: await sql(db, `select c.relname, has_sequence_privilege('anon', c.oid, 'usage') as a, has_sequence_privilege('authenticated', c.oid, 'usage') as b from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'interno') and c.relkind = 'S' order by 1`),
  });
  prueba('con los privilegios por defecto de «exponer automáticamente» las migraciones cargan, 0011 PASA y los privilegios finales (tablas, vistas, funciones, secuencias) son EXACTAMENTE los de un proyecto con la exposición apagada', async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), 'al3d-expuesto-')), 'expuesto.sql');
    writeFileSync(archivo, EXPUESTO);
    const expuesta = await crearBase({ migraciones: '../migrations', antes: pathToFileURL(archivo) });
    const cerrada = await crearBase({ migraciones: '../migrations' });
    try {
      cierto((await una(expuesta, `select count(*)::int as n from pg_default_acl`)).n >= 5, 'la simulación dejó sus privilegios por defecto');
      igual((await una(expuesta, `select interno.auditoria() as p`)).p, []);
      const a = await resumenDePrivilegios(expuesta), b = await resumenDePrivilegios(cerrada);
      igual(a.tablas, b.tablas);
      igual(a.funciones, b.funciones);
      igual(a.secuencias, b.secuencias);
      cierto(a.funciones.filter(x => x.anon).length === 0, 'anon no ejecuta nada');
    } finally { await expuesta.close(); await cerrada.close(); rmSync(dirname(archivo), { recursive: true, force: true }); }
  }, { tiempo: 120_000 });
});

describir('el «RLS automático» de Supabase instala una función de disparador de evento en public y NO es un hueco', () => {
  /* Descubierto contra el proyecto REAL de pruebas el 2026-10-10: al crear el proyecto con «RLS automático» encendido, Supabase deja
     `public.rls_auto_enable()` (SECURITY DEFINER, sin search_path, con EXECUTE para todos) y la primera corrida de 0011 abortó por ella.
     Una función que devuelve `event_trigger` no se puede llamar como RPC, así que no es una puerta; pero una `trigger` nuestra sí se audita. */
  const ARCHIVO = () => {
    const archivo = join(mkdtempSync(join(tmpdir(), 'al3d-rlsauto-')), 'rls-auto.sql');
    writeFileSync(archivo, `create function public.rls_auto_enable() returns event_trigger language plpgsql security definer as $$ begin null; end $$;`);
    return archivo;
  };
  prueba('con public.rls_auto_enable() (event_trigger, definer, sin search_path, ejecutable por todos) 0011 PASA y la auditoría sale limpia', async () => {
    const archivo = ARCHIVO();
    const db = await crearBase({ migraciones: '../migrations', antes: pathToFileURL(archivo) });
    try {
      cierto((await una(db, `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable'`)).n === 1, 'la función de Supabase está');
      igual((await una(db, `select interno.auditoria() as p`)).p, []);
    } finally { await db.close(); rmSync(dirname(archivo), { recursive: true, force: true }); }
  }, { tiempo: 120_000 });
  prueba('pero una función `trigger` (no de evento) mal protegida en public SÍ la caza la aduana', async () => {
    const db = await crearBaseDePruebas();
    try {
      await sql(db, `create function public.trigger_olvidado() returns trigger language plpgsql security definer as $$ begin return new; end $$;`);
      const p = (await una(db, `select interno.auditoria() as p`)).p;
      /* La función nace DESPUÉS de 0001, que quitó el EXECUTE de PUBLIC por defecto: no es GR-01 sino GR-07 (definer sin search_path) y GR-02 (fuera de las listas cerradas). */
      cierto(p.some(x => /trigger_olvidado/.test(x) && /GR-07/.test(x)) && p.some(x => /trigger_olvidado/.test(x) && /GR-02/.test(x)), 'GR-07 y GR-02 nombran a trigger_olvidado: ' + JSON.stringify(p));
    } finally { await db.close(); }
  }, { tiempo: 120_000 });
});

describir('0011_auditoria.sql: la aduana ABORTA cuando se le mete un defecto', () => {
  /** Aplica un defecto a una copia, corre 0011 y exige que aborte nombrando `ids` (y todo lo que se pida). */
  const aborta = (que, defecto, ids, { tambien = [] } = {}) => prueba(`ABORTO ${que}`, () => conCopia(plantilla, async db => {
    await sql(db, defecto);
    const e = await esperarError(sql(db, TEXTO_0011), /AUDITORIA DE SEGURIDAD/, que);
    for (const id of ids) cierto(e.message.includes(id), `el mensaje debe nombrar ${id}:\n${e.message}`);
    for (const t of tambien) cierto(e.message.includes(t), `el mensaje debe mencionar «${t}»:\n${e.message}`);
    // y la propia consulta lo ve igual, sin abortar
    const problemas = (await una(db, `select interno.auditoria() as p`)).p;
    cierto(problemas.length > 0 && ids.every(id => problemas.some(x => x.startsWith(id))), 'interno.auditoria() lista: ' + problemas.join(' | '));
  }));

  prueba('la base LIMPIA pasa la aduana (0011 se puede volver a aplicar: es idempotente) y interno.auditoria() devuelve la lista vacía', () => conCopia(plantilla, async db => {
    igual((await una(db, `select interno.auditoria() as p`)).p, []);
    await sql(db, TEXTO_0011);
    await sql(db, TEXTO_0011);
    igual((await una(db, `select interno.auditoria() as p`)).p, []);
  }));
  prueba('interno.auditoria() es de quien administra: ni anon, ni authenticated, ni service_role la ejecutan', () => conCopia(plantilla, async db => {
    for (const rol of [{ rol: 'anon' }, { rol: 'authenticated', uid: db.u.dir.uid, correo: db.u.dir.correo }, { rol: 'service_role' }]) await esperarError(como(db, rol).query(`select interno.auditoria()`), '42501', rol.rol);
  }));
  aborta('(GR-03) una tabla nueva SIN RLS', `create table public.tabla_abierta (id int primary key)`, ['GR-03'], { tambien: ['tabla_abierta', 'GR-09'] });
  aborta('(GR-03) a una tabla existente se le apaga la RLS', `alter table public.ventas_dinero disable row level security`, ['GR-03'], { tambien: ['ventas_dinero'] });
  aborta('(GR-03) contadores recibe una política', `create policy abierta on public.contadores for select to authenticated using (true)`, ['GR-03'], { tambien: ['contadores'] });
  aborta('(GR-01) una función de public ejecutable por PUBLIC', `create function public.f_publica() returns int language sql as 'select 1'; grant execute on function public.f_publica() to public`, ['GR-01', 'GR-02'], { tambien: ['f_publica'] });
  aborta('(GR-01) una RPC de cliente con GRANT a anon', `grant execute on function public.mi_acceso(text) to anon`, ['GR-01'], { tambien: ['mi_acceso'] });
  aborta('(GR-01) una función de interno ejecutable por PUBLIC', `create function interno.x_publica() returns int language sql as 'select 1'; grant execute on function interno.x_publica() to public`, ['GR-01'], { tambien: ['x_publica'] });
  aborta('(GR-04) una vista sin security_invoker', `create view public.vista_mala as select id from public.proyectos`, ['GR-04'], { tambien: ['vista_mala'] });
  aborta('(GR-04) a una vista existente se le quita security_invoker', `alter view public.ventas_calculadas reset (security_invoker)`, ['GR-04'], { tambien: ['ventas_calculadas'] });
  aborta('(GR-04) una vista materializada en public', `create materialized view public.mv as select 1 as a`, ['GR-04'], { tambien: ['MATERIALIZADA', 'mv'] });
  aborta('(GR-05) una tabla publicada con replica identity FULL', `alter table public.proyectos replica identity full`, ['GR-05'], { tambien: ['proyectos', 'replica identity'] });
  aborta('(GR-05) una tabla fuera de la lista cerrada entra a Realtime', `alter publication supabase_realtime add table public.empresas`, ['GR-05'], { tambien: ['empresas', 'lista cerrada'] });
  aborta('(GR-05) una de las 13 sale de Realtime', `alter publication supabase_realtime drop table public.ventas_dinero`, ['GR-05'], { tambien: ['ventas_dinero', 'debe estar publicada'] });
  aborta('(GR-06) INSERT para authenticated en una tabla de negocio', `grant insert on public.proyectos to authenticated`, ['GR-06'], { tambien: ['INSERTAR', 'proyectos'] });
  aborta('(GR-06) UPDATE por COLUMNA para authenticated', `grant update (nombre) on public.proyectos to authenticated`, ['GR-06'], { tambien: ['ACTUALIZAR', 'proyectos'] });
  aborta('(GR-06) DELETE para authenticated', `grant delete on public.abonos to authenticated`, ['GR-06'], { tambien: ['BORRAR', 'abonos'] });
  aborta('(GR-06) anon con SELECT en una tabla', `grant select on public.empresas to anon`, ['GR-06'], { tambien: ['anon', 'empresas'] });
  aborta('(GR-06) authenticated lee una tabla sin política (contadores)', `grant select on public.contadores to authenticated`, ['GR-06'], { tambien: ['contadores', 'ninguna política'] });
  aborta('(GR-06) authenticated lee una vista de espejo', `grant select on public.espejo_ventas to authenticated`, ['GR-06'], { tambien: ['espejo_ventas'] });
  aborta('(GR-06) service_role con DELETE', `grant delete on public.proyectos to service_role`, ['GR-06'], { tambien: ['service_role', 'proyectos'] });
  aborta('(GR-06) authenticated puede CREAR en public', `grant create on schema public to authenticated`, ['GR-06'], { tambien: ['CREAR'] });
  aborta('(GR-06) anon con USAGE en una secuencia', `grant usage on sequence public.abonos_id_seq to anon`, ['GR-06'], { tambien: ['abonos_id_seq'] });
  aborta('(GR-02) una RPC de servicio ejecutable por authenticated', `grant execute on function public.cuadre_hoja(text) to authenticated`, ['GR-02'], { tambien: ['cuadre_hoja'] });
  aborta('(GR-02) una RPC de cliente sin su GRANT', `revoke execute on function public.solicitar(jsonb, text) from authenticated`, ['GR-02'], { tambien: ['solicitar'] });
  aborta('(GR-02) una RPC de servicio sin su GRANT', `revoke execute on function public.verificar_cupo(text, timestamptz, text) from service_role`, ['GR-02'], { tambien: ['verificar_cupo'] });
  aborta('(GR-07) una función SECURITY DEFINER sin search_path', `create function public.f_def() returns int language sql security definer as 'select 1'; revoke all on function public.f_def() from public, anon, authenticated`, ['GR-07'], { tambien: ['f_def'] });
  aborta('(GR-07) a una RPC existente se le quita el search_path', `alter function public.solicitar(jsonb, text) reset search_path`, ['GR-07'], { tambien: ['solicitar'] });
  aborta('(GR-08) authenticated ejecuta una función interna que no es suya', `grant execute on function interno.err(text, text, jsonb) to authenticated`, ['GR-08'], { tambien: ['err'] });
  aborta('(GR-08) service_role ejecuta interno.siguiente', `grant execute on function interno.siguiente(text, text, text, bigint) to service_role`, ['GR-08'], { tambien: ['siguiente'] });
  aborta('(GR-08) anon con USAGE sobre interno', `grant usage on schema interno to anon`, ['GR-08'], { tambien: ['anon'] });
  aborta('(GR-08) authenticated pierde su EXECUTE sobre empresas_donde (las políticas dejarían de funcionar)', `revoke execute on function interno.empresas_donde(text[]) from authenticated`, ['GR-08'], { tambien: ['empresas_donde'] });
  aborta('(GR-09) a una tabla se le quita su trigger sin_borrar', `drop trigger proyectos_sin_borrar on public.proyectos`, ['GR-09'], { tambien: ['proyectos'] });
  aborta('(GR-09) el trigger sin_borrar está desactivado', `alter table public.abonos disable trigger abonos_sin_borrar`, ['GR-09'], { tambien: ['abonos'] });
  prueba('ABORTO con VARIOS defectos a la vez: el mensaje los lista TODOS y cuenta cuántos son; y NO queda cambiado nada por la aduana (es de solo lectura)', () => conCopia(plantilla, async db => {
    await sql(db, `grant insert on public.proyectos to authenticated; create table public.t1 (id int); grant select on public.empresas to anon; create view public.v1 as select 1 as a`);
    const antes = await una(db, `select (select count(*)::int from pg_proc) as f, (select count(*)::int from pg_class) as c, (select count(*)::int from pg_policy) as p`);
    const e = await esperarError(sql(db, TEXTO_0011), /AUDITORIA DE SEGURIDAD: se encontraron \d+ problema/);
    const n = Number(/se encontraron (\d+) problema/.exec(e.message)[1]);
    cierto(n >= 5, 'cuenta: ' + n);
    for (const x of ['GR-03', 'GR-04', 'GR-06', 'proyectos', 't1', 'v1', 'empresas']) cierto(e.message.includes(x), x);
    igual(await una(db, `select (select count(*)::int from pg_proc) as f, (select count(*)::int from pg_class) as c, (select count(*)::int from pg_policy) as p`), antes);
  }));
  prueba('arreglar el defecto y volver a aplicar 0011 vuelve a pasar (la aduana no deja nada en el camino)', () => conCopia(plantilla, async db => {
    await sql(db, `grant insert on public.proyectos to authenticated`);
    await esperarError(sql(db, TEXTO_0011), /GR-06/);
    await sql(db, `revoke insert on public.proyectos from authenticated`);
    await sql(db, TEXTO_0011);
    igual((await una(db, `select interno.auditoria() as p`)).p, []);
  }));
});

await resumen();
