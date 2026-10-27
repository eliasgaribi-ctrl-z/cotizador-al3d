/* LA HOJA CON LA BASE MANDANDO (puente-sheets-17; auditoría 2026-10-26, T1-2 y T1-4).

   Desde el 25 de octubre de 2026 la base manda y la hoja quedó congelada. Pero la hoja seguía ACEPTANDO lo que le mandaba un
   teléfono que no se había enterado —una etapa, un gasto, un movimiento del almacén—: contestaba «listo», el teléfono lo sacaba de
   su bandeja y el cambio se quedaba en la hoja, sin llegar a la base. Ahora la hoja sabe quién manda (MODO_EMPRESA) y con 'base'
   contesta LA_BASE_MANDA sin escribir nada; el teléfono deja el cambio en su bandeja.

   La auditoría encontró que se escapaban fallas porque las pruebas usaban aparatos de mentiras con token. Aquí el teléfono es el
   REAL de este caso: entró con su cuenta de Google (sin token de dispositivo, como el equipo desde puente-sheets-5) y NO sabe que la
   base manda (sin al3d_pf_supa ni al3d_pf_supa_modo). La hoja es el Apps Script de verdad (Código.gs y Copia diaria.gs en el mismo
   vm, como en el proyecto de Apps Script) sobre la cuadrícula de mentiras, verificando el token de Google contra un Google de
   mentiras y el rol en su pestaña «Accesos». La función importar-diario es la de verdad, con una base de mentiras.

     1. La hoja: con 'base' las tres rutas de escritura no escriben y contestan LA_BASE_MANDA; con 'hoja', todo como antes;
        /salud dice el modo; a mano se fija; una sesión de la base lo anota de paso.
     2. La copia de cada 3 horas fija el modo con lo que contesta importar-diario (de punta a punta).
     3. Al abrir la hoja se ve el aviso; el correo de los lunes no sale con cifras viejas.
     4. El teléfono: la bandeja CONSERVA el cambio (no lo aparta), no satura la hoja, el evento sale una vez por vuelta, y el día
        que la hoja vuelve a recibir, lo guardado sale solo.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { idbConIndices } from './comun/base-de-mentiras.mjs';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8');
const COPIA_GS = leer('puente/copia-diaria.gs');

/* ── El mundo de mentiras ────────────────────────────────────────────────────────────────────── */
const URL_PUENTE = 'https://puente.test/exec';
const CORREO = 'elias@al3d.test';
const GTOK = 'ya29.token-de-acceso-de-google-de-MENTIRAS-0001';

/* EL TELÉFONO, antes de cargar NADA de js/: el importador de la función (sección 2) carga js/datos/puente.js, y con él el ingreso
   con Google, que lee su token del localStorage al cargarse. Es el de Dirección como está en la vida real: entró con Google (token
   de acceso guardado, SIN token de dispositivo) y NO sabe que la base manda: ni al3d_pf_supa ni al3d_pf_supa_modo. */
const LS = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'K7QM', al3d_pf_nombre: 'Elías',
  al3d_pf_puente: JSON.stringify({ url: URL_PUENTE, token: '' }),
  al3d_pf_ingreso: JSON.stringify({ correo: CORREO }),
  al3d_pf_gtok: JSON.stringify({ token: GTOK, expira: Date.now() + 3600 * 1000 }) };
globalThis.window = globalThis;
globalThis.indexedDB = idbConIndices();
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
const SESION_BASE = 'sesion-de-la-base-de-elias-0001';
const IMPORTAR = { IMPORTAR_URL: 'https://gwzfdprdrdudfakjsdxf.supabase.co/functions/v1/importar-diario', IMPORTAR_SECRETO: 'secreto-FALSO-de-prueba-0123456789-abcdef' };

/**
 * La hoja de verdad con lo que el teléfono real necesita: la pestaña «Accesos» con su correo, un Google que reconoce su token
 * (tokeninfo), una base que contesta mi_acceso, el correo de los lunes y los avisos de la hoja anotados. `modo`: la propiedad
 * MODO_EMPRESA con la que nace (sin ella, la hoja no sabe nada: 'hoja').
 */
function montarHoja({ modo = null, modoDeLaBase = 'base', respuestaImportar = null } = {}) {
  const H = hojaDeMentiras({ props: { ...IMPORTAR, ...(modo ? { MODO_EMPRESA: modo } : {}) } });
  H.run('prepararHojaParaElPuente()');
  const acc = H.ss.insertSheet('Accesos');
  acc._g[1][1] = 'Correo'; acc._g[1][2] = 'Rol';
  acc._g[2][1] = CORREO; acc._g[2][2] = 'direccion';
  const reg = { logs: [], correos: [], toasts: [], afuera: [] };
  H.ss.toast = (m, t, s) => reg.toasts.push({ m: String(m), t: String(t), s });
  H.ss.getUrl = () => 'https://docs.google.com/spreadsheets/d/de-mentiras';
  H.ss.getName = () => 'Finanzas AL3D (de mentiras)';
  Object.assign(H.ctx.Utilities, {
    computeDigest: (_alg, txt) => Array.from(createHash('sha256').update(txt).digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    formatString: (_f, x) => String(x),
  });
  H.ctx.Logger = { log: x => reg.logs.push(String(x)) };
  H.ctx.MailApp = { sendEmail: o => reg.correos.push(o) };
  const cliente = H.run('PUENTE_CLIENT_IDS[0]');
  H.ctx.UrlFetchApp = {
    fetch(u, o = {}) {
      reg.afuera.push(String(u));
      const resp = (codigo, cuerpo) => ({ getResponseCode: () => codigo, getContentText: () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });
      if (String(u).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
        return /access_token=ya29\.token-de-acceso-de-google-de-MENTIRAS-0001$/.test(String(u))
          ? resp(200, { aud: cliente, email_verified: 'true', email: CORREO }) : resp(400, { error: 'invalid_token' });
      }
      if (String(u).endsWith('/rest/v1/rpc/mi_acceso')) {
        const tok = String((o.headers || {}).Authorization || '').replace(/^Bearer /, '');
        if (tok !== SESION_BASE) return resp(401, { message: 'JWT expired' });
        return resp(200, { ok: true, estado: 'activo', usuario: { id: 'u-1', correo: CORREO },
          empresas: [{ empresa_id: 'al3d', area: 'direccion', estado: 'activo', modo: modoDeLaBase }], modo: modoDeLaBase });
      }
      if (u === IMPORTAR.IMPORTAR_URL && respuestaImportar) return resp(respuestaImportar.status, respuestaImportar.texto);
      throw new Error('la hoja salió a otra parte: ' + u);
    },
  };
  /* Copia diaria.gs, en el MISMO proyecto (el mismo ámbito global), como en Apps Script. */
  vm.runInContext(COPIA_GS, H.ctx, { filename: 'Copia diaria.gs' });
  const post = cuerpo => H.doPost(JSON.stringify(cuerpo));
  const comoGoogle = cuerpo => post({ ...cuerpo, google_token: GTOK });
  /* Una foto de todo lo que la hoja tiene escrito: pestañas, celdas y propiedades que no son el modo. */
  const foto = () => JSON.stringify(['Ventas', 'Abonos comisión', 'Almacén', 'Catálogo de material', 'Listas de compra', 'Gastos', 'Bitácora del puente']
    .map(n => { const h = H.ss.getSheetByName(n); return [n, h ? h._g : null]; }));
  return { H, reg, post, comoGoogle, foto };
}

const opVenta = (id, o = {}) => ({ id, tipo: 'crear', id_notion: null, datos: { 'Proyecto': 'Ana - Café ' + id, 'Estatus': 'FABRICACION', 'Cuenta ': 'Elias BBVA',
  'Precio Subtotal': 10000, 'Etapa de obra': 'En diseño', ...o } });
const opMov = id => ({ id: 'op-' + id, almacen: 'movimientos', tipo: 'apendice', registro_id: id, datos: { id, empresa_id: 'al3d', material_id: 'acr-3mm',
  tipo: 'entrada', cantidad: 2, unidad_compra: 'lamina', proyecto_id: null, requerimiento_id: null, origen: 'compra', costo_total: 1800, nota: 'Recibido',
  ts: 1790000000000, usuario: 'Elías', rol: 'direccion', dispositivo: 'K7QM', sello: 'Elías · dirección · K7QM', sync: 0 } });
const opGasto = id => ({ id: 'op-' + id, tipo: 'crear', almacen: 'gastos', registro_id: id, datos: { id, fecha: '2026-10-26', concepto: 'Lámina de acrílico 3 mm',
  categoria: 'Material', monto: 1850, cuenta: 'Elias BBVA', folio: '', registro_por: 'Elías · Dirección (K7QM)', registrado_en: 1790000000000, anulado: false,
  anulo: '', anulado_en: null }, campos: null });

/* ============================================================================================ */
console.log('\n1 · LA HOJA SABE QUIÉN MANDA');
{
  const { H, comoGoogle } = montarHoja();
  eq('sin la propiedad, la hoja no sabe nada: manda la hoja (todo como siempre)', H.run('modoEmpresa_()'), 'hoja');
  const s = comoGoogle({ ruta: 'salud' });
  eq('/salud entra con la cuenta de Google y dice el modo', [s.ok, s.version, s.via, s.correo, s.modo], [true, 'puente-sheets-17', 'google', CORREO, 'hoja']);
  H.props.MODO_EMPRESA = 'Base ';
  eq('la propiedad se lee sin mayúsculas ni espacios', H.run('modoEmpresa_()'), 'base');
  H.props.MODO_EMPRESA = 'quién sabe';
  eq('un valor raro es «hoja»: ante la duda, como siempre', H.run('modoEmpresa_()'), 'hoja');
}

console.log('\n1a · CON LA BASE MANDANDO, LAS TRES RUTAS DE ESCRITURA NO ESCRIBEN');
{
  const { H, comoGoogle, post, foto } = montarHoja({ modo: 'base' });
  const antes = foto();
  const rv = comoGoogle({ ruta: 'empujar', ops: [opVenta('op-v1')] });
  eq('/empujar contesta LA_BASE_MANDA, sin resultados por operación', [rv.ok, rv.codigo, rv.modo, 'resultados' in rv], [false, 'LA_BASE_MANDA', 'base', false]);
  cierto('  y dice qué pasa con el cambio: se queda en el teléfono y sale a la base', /no se escribió nada/.test(rv.mensaje) && /entre con su cuenta/.test(rv.mensaje));
  const ra = comoGoogle({ ruta: 'empujar_almacen', ops: [opMov('m1')] });
  eq('/empujar_almacen, lo mismo', [ra.ok, ra.codigo], [false, 'LA_BASE_MANDA']);
  const rg = comoGoogle({ ruta: 'empujar_gastos', ops: [opGasto('gas-1')] });
  eq('/empujar_gastos, lo mismo', [rg.ok, rg.codigo], [false, 'LA_BASE_MANDA']);
  eq('y la hoja quedó EXACTAMENTE igual: ni una fila, ni una pestaña nueva, ni la bitácora', foto(), antes);
  /* «Preparar la hoja» ya creó las pestañas con sus cabeceras: lo que se mira es que sigan sin un solo renglón. */
  const renglones = n => H.ss.getSheetByName(n)._g.slice(2).filter(r => r.some((v, i) => i > 0 && v !== '')).length;
  eq('  (ni un gasto en «Gastos» ni un movimiento en «Almacén», ni una venta en «Ventas»)', [renglones('Gastos'), renglones('Almacén'), H.v._g.slice(2).filter(r => r[2] !== '').length], [0, 0, 0]);
  const s = comoGoogle({ ruta: 'salud' });
  eq('/salud sigue contestando, y dice que manda la base', [s.ok, s.modo], [true, 'base']);
  const j = comoGoogle({ ruta: 'jalar' });
  eq('leer sigue igual: /jalar contesta', j.ok, true);
  eq('/jalar_gastos también', comoGoogle({ ruta: 'jalar_gastos' }).ok, true);
  const x = comoGoogle({ ruta: 'expandir', u: 'https://example.com/x' });
  cierto('Maps sigue igual: /expandir contesta lo suyo, no LA_BASE_MANDA', x.codigo !== 'LA_BASE_MANDA');
  eq('sin ninguna llave, la puerta contesta lo de siempre (no le confirma nada a nadie)', post({ ruta: 'empujar', ops: [opVenta('op-v2')] }).codigo, 'ROL_SIN_PERMISO');
  eq('con un token de Google que no es de nadie, igual', post({ ruta: 'empujar_gastos', google_token: 'ya29.otro-token-cualquiera-de-alguien', ops: [] }).codigo, 'ROL_SIN_PERMISO');
}
{
  /* Un aparato con token de dispositivo (la salida de emergencia de Ajustes) tampoco escribe. */
  const T = 'd'.repeat(40);
  const { H, post } = montarHoja({ modo: 'base' });
  H.props.PUENTE_TOKENS = JSON.stringify({ [T]: 'direccion' });
  eq('con el token de dispositivo de Dirección, tampoco', post({ ruta: 'empujar', token: T, ops: [opVenta('op-v3')] }).codigo, 'LA_BASE_MANDA');
}

console.log('\n1b · CON LA HOJA MANDANDO, TODO COMO ANTES');
{
  const { H, comoGoogle } = montarHoja({ modo: 'hoja' });
  const rv = comoGoogle({ ruta: 'empujar', ops: [opVenta('op-v1')] });
  eq('/empujar da de alta la venta con su folio', [rv.ok, rv.resultados[0].ok, /^V-\d+$/.test(rv.resultados[0].remoto.id_notion)], [true, true, true]);
  eq('  y la fila está, con su etapa', H.celda(rv.resultados[0].remoto.id_notion, 'Etapa de obra'), 'En diseño');
  const ra = comoGoogle({ ruta: 'empujar_almacen', ops: [opMov('m1')] });
  eq('/empujar_almacen escribe el movimiento', [ra.ok, ra.resultados[0].ok, !!H.ss.getSheetByName('Almacén')], [true, true, true]);
  const rg = comoGoogle({ ruta: 'empujar_gastos', ops: [opGasto('gas-1')] });
  eq('/empujar_gastos escribe el gasto', [rg.ok, rg.resultados[0].ok, !!H.ss.getSheetByName('Gastos')], [true, true, true]);
}

console.log('\n1c · QUIÉN FIJA EL MODO: a mano, y una sesión de la base de paso');
{
  const { H, comoGoogle, reg } = montarHoja();
  const l1 = H.run('marcarQueLaBaseManda()');
  eq('marcarQueLaBaseManda: la propiedad dice «base» y queda de dónde salió', [H.props.MODO_EMPRESA, /^a mano \(marcarQueLaBaseManda\) · \d{4}-/.test(H.props.MODO_EMPRESA_NOTA)], ['base', true]);
  cierto('  lo dice en el registro y en la hoja', /^Listo: la base manda/.test(l1) && reg.logs.includes(l1) && reg.toasts.some(t => t.m === l1));
  cierto('  y otra vez: «ya estaba así», sin escribir', /^Ya estaba así/.test(H.run('marcarQueLaBaseManda()')));
  eq('desde ese momento /empujar ya no escribe', comoGoogle({ ruta: 'empujar', ops: [opVenta('op-v1')] }).codigo, 'LA_BASE_MANDA');
  H.run('marcarQueLaHojaManda()');
  eq('marcarQueLaHojaManda la regresa, y /empujar vuelve a escribir', [H.props.MODO_EMPRESA, comoGoogle({ ruta: 'empujar', ops: [opVenta('op-v2')] }).resultados[0].ok], ['hoja', true]);
  eq('fijarModoEmpresa_ no escribe nada que no sea «base» u «hoja»', [H.run('fijarModoEmpresa_("espejo", "x")'), H.props.MODO_EMPRESA], [false, 'hoja']);
}
{
  /* Un teléfono que YA manda desde la base abre la ficha de un proyecto: la hoja le pregunta a la base quién es, y de paso se entera. */
  const { H, post } = montarHoja({ modoDeLaBase: 'base' });
  eq('antes, la hoja no sabía', H.run('modoEmpresa_()'), 'hoja');
  post({ ruta: 'expandir', u: 'https://example.com/x', supa_token: SESION_BASE });
  eq('una sesión de la base que entra a Maps o a Drive le deja el modo que dijo la base', [H.props.MODO_EMPRESA, /^sesión de la base/.test(H.props.MODO_EMPRESA_NOTA)], ['base', true]);
  eq('y desde ahí las escrituras de un teléfono que no se enteró ya no entran', post({ ruta: 'empujar', google_token: GTOK, ops: [opVenta('op-v1')] }).codigo, 'LA_BASE_MANDA');
  const otra = montarHoja({ modoDeLaBase: 'base' });
  otra.post({ ruta: 'expandir', u: 'https://example.com/x', supa_token: 'una-sesion-vencida-o-falsa-000001' });
  eq('una sesión que la base no reconoce no anota nada', otra.H.props.MODO_EMPRESA, undefined);
}

/* ============================================================================================ */
console.log('\n2 · LA COPIA DE CADA 3 HORAS FIJA EL MODO (importar-diario de verdad → Copia diaria.gs → Código.gs)');
const Hd = await import(pathToFileURL(join(RAIZ, 'supabase/functions/importar-diario/handler.js')).href);
const { volcado, filaVentas, dia } = await import(pathToFileURL(join(RAIZ, 'supabase/tests/comun/hoja-de-mentiras.js')).href);
const SEMILLA = JSON.parse(leer('datos/semilla.json'));
/** Lo que contesta la función de verdad, con una base de mentiras cuya empresa está en `modo` (o sin renglón). */
async function importarDiario(modo) {
  const ahora = Date.parse('2026-10-26T15:05:00.000Z');
  const v = volcado({ ventas: [filaVentas({ celdas: { A: 'V-001', B: 'Persona - NegocioInventado', C: 'COBRANDO', D: 'Elias BBVA', E: 'Rotulacion de vinil',
    F: 'No', G: 1000, L: dia('2026-09-10') } })], accesos: [[CORREO, 'direccion', '']] }, { hecho: new Date(ahora - 60000).toISOString() });
  const base = { transaccion: async fn => fn({
    ejecutar: async () => {},
    consultar: async t => {
      if (/pg_try_advisory_xact_lock/.test(t)) return [{ ok: true }];
      if (/select modo from public\.empresas/.test(t)) return modo ? [{ modo }] : [];
      if (/insert into public\.cuadre_diario/.test(t)) return [{ id: '1', fecha: '2026-10-26', cuadra: false }];
      return [];
    } }), cerrar: async () => {} };
  let t = ahora;
  const res = await Hd.manejar(new Request(IMPORTAR.IMPORTAR_URL, { method: 'POST', body: JSON.stringify(v),
    headers: { 'content-type': 'application/json', 'x-importar-secreto': IMPORTAR.IMPORTAR_SECRETO } }),
  { ahora: () => (t += 3), entorno: n => ({ IMPORTAR_SECRETO: IMPORTAR.IMPORTAR_SECRETO, SUPABASE_DB_URL: 'postgresql://de-mentiras' })[n], semilla: SEMILLA,
    abrirBase: () => base, registrar: () => {} });
  return { status: res.status, texto: await res.text() };
}
{
  const rb = await importarDiario('base');
  const cb = JSON.parse(rb.texto);
  eq('con la base mandando, la función contesta el modo y por qué no aplicó', [rb.status, cb.ok, cb.aplicado, cb.modo, cb.motivo], [200, true, false, 'base', 'modo_base']);
  const ch = JSON.parse((await importarDiario('hoja')).texto);
  eq('con la hoja mandando, aplica y dice «hoja»', [ch.aplicado, ch.modo, ch.motivo], [true, 'hoja', null]);
  const cn = JSON.parse((await importarDiario(null)).texto);
  eq('sin renglón de la empresa, modo null: la hoja no cambia lo que sabía', cn.modo, null);

  const { H, reg, comoGoogle } = montarHoja({ respuestaImportar: rb });
  const linea = H.run('copiarHojaASupabase()');
  eq('la copia anota en la hoja que manda la base', [H.props.MODO_EMPRESA, /^copia diaria/.test(H.props.MODO_EMPRESA_NOTA)], ['base', true]);
  cierto('  y su línea lo dice: no se aplicó porque la base manda (no «lo decide una persona»)',
    /la base manda \(modo base\) y la copia ya solo cuadra/.test(linea) && !/lo decide una persona/.test(linea) && /Manda la base: la hoja lo anotó y ya no recibe/.test(linea));
  cierto('  (en el registro, sin nombres de clientes)', reg.logs.some(l => l === linea) && !/Persona|NegocioInventado/.test(reg.logs.join('\n')));
  eq('y desde ese momento un teléfono que no se enteró ya no escribe', comoGoogle({ ruta: 'empujar', ops: [opVenta('op-v1')] }).codigo, 'LA_BASE_MANDA');
  cierto('la siguiente copia: «la hoja ya lo sabía», sin volver a escribir', /Manda la base \(la hoja ya lo sabía\)/.test(H.run('copiarHojaASupabase()')));

  const dos = montarHoja({ modo: 'base', respuestaImportar: { status: 200, texto: JSON.stringify(ch) } });
  dos.H.run('copiarHojaASupabase()');
  eq('si la base vuelve a «hoja», la copia la regresa y la hoja vuelve a recibir',
    [dos.H.props.MODO_EMPRESA, dos.comoGoogle({ ruta: 'empujar', ops: [opVenta('op-v1')] }).resultados[0].ok], ['hoja', true]);
  const vieja = { ...cb }; delete vieja.modo; vieja.motivo = 'conflictos';
  const tres = montarHoja({ modo: 'base', respuestaImportar: { status: 200, texto: JSON.stringify(vieja) } });
  const l3 = tres.H.run('copiarHojaASupabase()');
  eq('una función vieja que no dice el modo no cambia nada', tres.H.props.MODO_EMPRESA, 'base');
  cierto('  (y ahí la línea sigue diciendo lo de antes)', /lo decide una persona/.test(l3));
  const cuatro = montarHoja({ respuestaImportar: { status: 401, texto: '{"ok":false,"codigo":"SIN_SESION"}' } });
  cuatro.H.run('copiarHojaASupabase()');
  eq('ni una respuesta de error', cuatro.H.props.MODO_EMPRESA, undefined);
}

/* ============================================================================================ */
console.log('\n3 · QUIEN ABRE LA HOJA LO VE, Y EL CORREO DE LOS LUNES NO SALE CON CIFRAS VIEJAS');
const abrir = H => H.run(`(function () {
  var menu = function () { var m = { addItem: function () { return m; }, addSeparator: function () { return m; },
    addSubMenu: function () { return m; }, addToUi: function () {} }; return m; };
  SpreadsheetApp.getUi = function () { return { createMenu: menu }; };
  onOpen(); })()`);
{
  const { H, reg } = montarHoja({ modo: 'base' });
  abrir(H);
  eq('con la base mandando, al abrir sale el aviso, y se queda hasta que lo cierran', reg.toasts.map(t => [t.m, t.s]),
    [['La plataforma manda desde el 25 de octubre: lo que se escriba aquí ya no llega a ningún lado. Captura en la plataforma.', -1]]);
  const otra = montarHoja({ modo: 'hoja' });
  abrir(otra.H);
  eq('con la hoja mandando, ningún aviso', otra.reg.toasts.length, 0);
}
{
  const { H, reg } = montarHoja({ modo: 'base' });
  H.v._g[2][1] = 'V-001'; H.v._g[2][2] = 'Persona - NegocioInventado'; H.v._g[2][11] = 1234.5;
  const l1 = H.run('enviarResumen()');
  eq('con la base mandando, el lunes sale UN aviso corto en lugar del resumen', reg.correos.map(c => c.subject), ['AL3D — el resumen de los lunes ahora está en la plataforma']);
  cierto('  sin cifras de la hoja congelada ni nombres, y con el botón a la plataforma',
    !/\$|1234|Persona/.test(reg.correos[0].htmlBody) && reg.correos[0].htmlBody.includes('https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/'));
  cierto('  y queda en el registro', reg.logs.includes(l1) && /no se mandó con cifras/.test(l1));
  const l2 = H.run('enviarResumen()');
  eq('el lunes siguiente no sale nada: solo la línea del registro', [reg.correos.length, reg.logs.includes(l2), /ya salió el \d{4}-\d{2}-\d{2}/.test(l2)], [1, true, true]);
  const otra = montarHoja({ modo: 'hoja' });
  otra.H.v._g[2][1] = 'V-001'; otra.H.v._g[2][2] = 'Persona - NegocioInventado'; otra.H.v._g[2][11] = 1234.5;
  otra.H.run('enviarResumen()');
  eq('con la hoja mandando, el resumen de siempre', otra.reg.correos.map(c => c.subject), ['AL3D — pendientes de la semana']);
}

/* ============================================================================================ */
console.log('\n4 · EL TELÉFONO QUE NO SE ENTERÓ: no pierde nada, no satura la hoja, avisa una vez por vuelta');
{
  /* El teléfono es el del principio del archivo (TELEFONO): Dirección, con su cuenta de Google y sin saber que la base manda. */
  const setTimeoutReal = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) >= 1000 ? 0 : setTimeoutReal(fn, ms, ...a));
  /* El reloj del teléfono, para que pasen las vueltas sin esperar. */
  const ahoraReal = Date.now;
  let salto = 0;
  Date.now = () => ahoraReal() + salto;
  const eventos = [];
  globalThis.dispatchEvent = e => { eventos.push(e && e.type); return true; };

  const { H, comoGoogle } = montarHoja();
  const pedidas = [];
  let sinCuenta = 0;
  globalThis.fetch = async (_u, init) => {
    const c = JSON.parse(init.body);
    pedidas.push(c.ruta);
    if (c.google_token !== GTOK || c.token) sinCuenta++;
    return { status: 200, json: async () => H.doPost(init.body) };
  };
  const DB = await import('../js/datos/db.js');
  const S = await import('../js/datos/sync.js');
  const Proy = await import('../js/datos/proyectos.js');
  const G = await import('../js/datos/gastos.js');
  const Pu = await import('../js/datos/puente.js');
  await DB.abrir();
  S.registrar(Pu.crear({ url: URL_PUENTE, token: '' }));
  cierto('el teléfono tiene puente por su cuenta de Google, sin token', S.configurado());

  /* Antes del 25: la venta se da de alta en la hoja, como siempre. */
  const ahora0 = Date.now();
  await DB.poner('proyectos', { id: 'proy-1', folio_local: 'COT-0001', dispositivo: 'K7QM', folio_global: 'COT-0001@K7QM', nombre: 'Ana - Café',
    contacto: 'Ana', negocio: 'Café', etapa: 'ganado', tipo_trabajo: ['Letras 3D con iluminacion'], fecha_ganado: '2026-10-01', dir_texto: 'Av. Vallarta 1',
    lat: 20.6736, lng: -103.344, geo_fuente: 'maps_pin', sub: 10000, neto: 11600, precio_auth: 11600, anti_pactado: 5000, iva: true, notion_page_id: null,
    notion_estado: 'pendiente', estatus_notion: 'FABRICACION', cuenta: 'Elias BBVA', pct_comision: 0, plazo_k: null, notas: '', tel: '33 1000 0000',
    entrega: 'instalacion', origen: { folio: 'COT-0001', items: [] }, sellos: { etapa: ahora0 }, creado_en: ahora0, actualizado_en: ahora0, sync: 0 });
  await S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: null, ts: ahora0 });
  const b0 = await S.bombear();
  const folio = (await DB.obtener('proyectos', 'proy-1')).notion_page_id;
  eq('con la hoja mandando, el alta sube (con la cuenta de Google) y la hoja le da su folio', [b0.valor.subidas, /^V-\d+$/.test(folio || '')], [1, true]);
  const etapaEnHoja = H.celda(folio, 'Etapa de obra');

  /* El 25 la base pasa a mandar, y la hoja se entera. Este teléfono, no. */
  H.run('marcarQueLaBaseManda()');
  const fotoHoja = JSON.stringify([H.v._g, H.ss.getSheetByName('Gastos'), H.ss.getSheetByName('Almacén')]);
  pedidas.length = 0;
  const re = await Proy.avanzarEtapa('proy-1', 'en_diseno');
  const rg = await G.registrar({ fecha: '2026-10-26', concepto: 'Lámina de acrílico', categoria: 'Material', monto: 1850, cuenta: 'Elias BBVA' });
  eq('en el teléfono, la etapa y el gasto se guardan como siempre', [re.ok, rg.ok], [true, true]);
  const b1 = await S.bombear();
  eq('la vuelta no sube nada…', [b1.valor.subidas, b1.valor.rechazadas, b1.valor.sin_destino], [0, 0, 0]);
  const cola = await S.pendientes();
  eq('…y la bandeja CONSERVA los dos cambios como pendientes: ni rechazados ni apartados', [cola.length, cola.map(o => o.almacen).sort(), (await S.rechazadas()).length, (await S.sinDestino()).length],
    [2, ['gastos', 'proyectos'], 0, 0]);
  eq('cada uno dice por qué espera', cola.map(o => o.ultimo_error), [Pu.MSG_LA_BASE_MANDA, Pu.MSG_LA_BASE_MANDA]);
  cierto('  («La plataforma ahora guarda en la base: este teléfono tiene que entrar con su cuenta»)', /^La plataforma ahora guarda en la base: este teléfono tiene que entrar con su cuenta\./.test(Pu.MSG_LA_BASE_MANDA));
  eq('la hoja no escribió nada: la etapa de la fila sigue igual, y ni «Gastos» ni «Almacén» cambiaron', [H.celda(folio, 'Etapa de obra'), JSON.stringify([H.v._g, H.ss.getSheetByName('Gastos'), H.ss.getSheetByName('Almacén')]) === fotoHoja],
    [etapaEnHoja, true]);
  eq('el proyecto no se marca como fallido: espera', (await DB.obtener('proyectos', 'proy-1')).notion_estado, 'enviado');
  eq('UNA sola escritura le llegó a la hoja en toda la vuelta: el gasto se contestó aquí, sin red', pedidas.filter(r => /^empujar/.test(r)), ['empujar']);
  eq('y el aviso salió una vez', eventos, ['al3d-la-base-manda']);

  /* La vuelta siguiente, 30 s después (la de cada 30 s con la app a la vista). */
  salto += 30 * 1000;
  pedidas.length = 0;
  await S.bombear();
  eq('la vuelta siguiente no le pregunta nada a la hoja (lo recuerda diez minutos)', pedidas.filter(r => /^empujar/.test(r)), []);
  eq('  avisa otra vez, una sola', eventos, ['al3d-la-base-manda', 'al3d-la-base-manda']);
  eq('  y los dos cambios siguen ahí, con un intento más', (await S.pendientes()).map(o => o.intentos), [2, 2]);
  await S.bombear();
  eq('una vuelta pegada a la anterior no repite el aviso', eventos.length, 2);

  /* Pasan los diez minutos: se le vuelve a preguntar a la hoja UNA vez. */
  salto += 11 * 60 * 1000;
  pedidas.length = 0;
  await S.bombear();
  eq('pasados diez minutos, una petición a la hoja (por si volvió a recibir), y nada más', pedidas.filter(r => /^empujar/.test(r)), ['empujar']);
  eq('  sigue sin escribir y la bandeja sigue con los dos', [H.celda(folio, 'Etapa de obra'), (await S.pendientes()).length], [etapaEnHoja, 2]);

  /* Si la empresa regresara a la hoja, lo guardado sale solo: no se perdió nada. */
  H.run('marcarQueLaHojaManda()');
  salto += 11 * 60 * 1000;
  const b4 = await S.bombear();
  eq('el día que la hoja vuelve a recibir, los dos cambios guardados suben solos', [b4.valor.subidas, (await S.pendientes()).length], [2, 0]);
  eq('  la etapa llega a la fila y el gasto a su pestaña', [H.celda(folio, 'Etapa de obra'), H.ss.getSheetByName('Gastos') && H.ss.getSheetByName('Gastos')._g.some(r => r.includes(rg.valor.id))],
    ['En diseño', true]);

  /* /salud también lo dice: un relevo nuevo que pregunta /salud con la base mandando ni siquiera intenta /empujar. */
  H.run('marcarQueLaBaseManda()');
  S.registrar(Pu.crear({ url: URL_PUENTE, token: '' }));
  await Proy.avanzarEtapa('proy-1', 'cortado');
  pedidas.length = 0;
  await S.bombear();
  eq('con /salud diciendo «base», el relevo nuevo no gasta ni un /empujar', [pedidas.includes('salud'), pedidas.filter(r => /^empujar/.test(r))], [true, []]);
  eq('  y el cambio se queda en la bandeja', (await S.pendientes()).length, 1);
  cierto('(la hoja, por su lado, también le habría dicho que no)', comoGoogle({ ruta: 'empujar', ops: [opVenta('op-x')] }).codigo === 'LA_BASE_MANDA');
  eq('y todas las peticiones del teléfono fueron con su cuenta de Google, sin token de dispositivo (el aparato real)', [pedidas.length > 0, sinCuenta], [true, 0]);

  S.registrar(null);
  Date.now = ahoraReal;
  globalThis.setTimeout = setTimeoutReal;
}

console.log('\nLOS DOS LADOS DICEN LO MISMO');
{
  const { H } = montarHoja();
  const Pu = await import('../js/datos/puente.js');
  eq('el código de la hoja es el que el teléfono traduce', H.run('respuestaLaBaseManda_().codigo'), Pu.LA_BASE_MANDA);
  eq('la versión del .gs es la que la plataforma espera', H.run('PUENTE_VERSION'), Pu.VERSION_ESPERADA);
  eq('el evento es el que escucha la app', Pu.EVENTO_LA_BASE_MANDA, 'al3d-la-base-manda');
  eq('las rutas que dejan de escribir son exactamente tres', Object.keys(H.run('RUTAS_QUE_ESCRIBEN')).sort(), ['empujar', 'empujar_almacen', 'empujar_gastos']);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
