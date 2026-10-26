/* DRIVE CON LA BASE MANDANDO (puente-sheets-16).

   El 26 de octubre de 2026 Elías subió los diseños a «Trabajos Pendientes» y la plataforma no los
   enseñaba. Desde el día anterior la empresa entra por la base («la base manda»): el teléfono trae
   su sesión de Supabase y ya no el permiso de Google de la hoja, que de fondo dejó de pedirse
   (auditoría 2026-10-25, ES-3). Pero Drive sigue en el Apps Script, y la hoja, sin una de sus dos
   puertas, contestaba ROL_SIN_PERMISO: la ficha se quedaba sin archivos.

   El arreglo es una tercera puerta, angosta: la sesión de la base entra a /carpetas,
   /crear_carpeta y /expandir, y a nada más. Quién es y qué área tiene lo dice la base (`mi_acceso`
   con el token de la persona). Aquí se prueba:
     1. la verificación del lado de la hoja (`identidadDeLaBase`), contra una base de mentiras;
     2. la puerta entera (`doPost`), con un Drive de mentiras: qué abre y qué NO abre;
     3. el teléfono: el relevo de la base manda su sesión en esos tres caminos y en ningún otro. */

import { createHash } from 'node:crypto';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

/* ---------------------------------------------------------------------------
   La base de mentiras: contesta `mi_acceso` según el token, como PostgREST.
   --------------------------------------------------------------------------- */
const acceso = (area, o = {}) => ({
  ok: true, estado: o.estado || 'activo',
  usuario: { id: 'u-1', correo: o.correo || 'Elias@Example.com' },
  empresas: [{ empresa_id: o.empresa || 'al3d', area, estado: o.estadoEmpresa || 'activo', modo: 'base' }],
  contrato: { actual: 1, minimo: 1 }, permisos: {}, modo: 'base',
});
const SESIONES = {
  'sesion-de-elias-direccion-0001': { codigo: 200, cuerpo: acceso('direccion') },
  'sesion-del-taller-fabricacion-01': { codigo: 200, cuerpo: acceso('fabricacion', { correo: 'taller@example.com' }) },
  'sesion-de-alguien-dado-de-baja-1': { codigo: 200, cuerpo: { ...acceso('pagos'), estado: 'acceso_revocado', empresas: [{ empresa_id: 'al3d', area: 'pagos', estado: 'baja' }] } },
  'sesion-de-otra-empresa-00000001': { codigo: 200, cuerpo: acceso('direccion', { empresa: 'otra' }) },
  'sesion-con-area-inventada-00001': { codigo: 200, cuerpo: acceso('jefazo') },
  'sesion-vencida-o-falsa-0000001': { codigo: 401, cuerpo: { code: 'PGRST301', message: 'JWT expired' } },
  'sesion-con-la-base-en-error-01': { codigo: 503, cuerpo: {} },
};

/** La hoja con todo lo que la tercera puerta necesita: Utilities con resumen, la red y Drive. */
function montar({ red = 'bien', tokens = {} } = {}) {
  const H = hojaDeMentiras({ tokens });
  H.ctx.Utilities.computeDigest = (_alg, txt) => Array.from(createHash('sha256').update(txt).digest());
  H.ctx.Utilities.base64EncodeWebSafe = bytes => Buffer.from(bytes).toString('base64url');
  H.ctx.Utilities.DigestAlgorithm = { SHA_256: 'SHA_256' };
  const pedidas = [];
  H.ctx.UrlFetchApp = {
    fetch(url, opciones) {
      pedidas.push({ url, opciones });
      if (red === 'truena') throw new Error('sin red');
      if (!String(url).endsWith('/rest/v1/rpc/mi_acceso')) throw new Error('la hoja salió a otra parte: ' + url);
      const tok = String((opciones.headers || {}).Authorization || '').replace(/^Bearer /, '');
      const s = SESIONES[tok] || { codigo: 401, cuerpo: { message: 'invalid JWT' } };
      return { getResponseCode: () => s.codigo, getContentText: () => JSON.stringify(s.cuerpo) };
    },
  };
  /* «Trabajos Pendientes» con una carpeta y su PDF de órdenes, y lo que se cree después. */
  const archivo = (nombre, tipo) => ({ getName: () => nombre, getUrl: () => 'https://drive.google.com/file/d/' + nombre.length + 'xxxxxxxxxx/view',
    getMimeType: () => tipo, getLastUpdated: () => new Date(1793000000000) });
  const iter = lista => { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; };
  const carpeta = (id, nombre, archivos = []) => ({ getId: () => id, getName: () => nombre,
    getUrl: () => 'https://drive.google.com/drive/folders/' + id, getLastUpdated: () => new Date(1793000000000),
    getFiles: () => iter(archivos), getFolders: () => iter([]) });
  const hijas = [carpeta('c-malu', 'Mairi - Mundo Malu', [archivo('Ordenes de Fabricacion.pdf', 'application/pdf'), archivo('Escalas y Logotipo de Mundo Malú.cdr', 'application/octet-stream')])];
  const raiz = { ...carpeta('raiz', 'Trabajos Pendientes'), getFolders: () => iter(hijas),
    createFolder(n) { const c = carpeta('c-' + hijas.length, n); hijas.push(c); return c; } };
  H.ctx.DriveApp = { getFolderById: () => raiz, searchFolders: () => iter([]) };
  const api = H.run('({ identidadDeLaBase, RUTAS_CON_LA_BASE, BASE_URL, BASE_LLAVE_PUBLICA, BASE_EMPRESA })');
  return { H, api, pedidas, hijas };
}

console.log('\n1 · LA HOJA LE PREGUNTA A LA BASE QUIÉN ES');
{
  const { api, pedidas } = montar();
  eq('una sesión activa de Dirección entra con su correo y su área como rol',
     api.identidadDeLaBase('sesion-de-elias-direccion-0001'), { correo: 'elias@example.com', rol: 'direccion' });
  const p = pedidas[0];
  eq('pregunta mi_acceso a la base de producción, con la empresa', [p.url, JSON.parse(p.opciones.payload)],
     ['https://gwzfdprdrdudfakjsdxf.supabase.co/rest/v1/rpc/mi_acceso', { p_empresa: 'al3d' }]);
  eq('con la llave pública y el token de la persona', [p.opciones.headers.apikey, p.opciones.headers.Authorization, p.opciones.method],
     ['sb_publishable__yKAsMzY5aar3i2oYmJtPA_uWcTWjed', 'Bearer sesion-de-elias-direccion-0001', 'post']);
  eq('el taller entra como fabricación', api.identidadDeLaBase('sesion-del-taller-fabricacion-01'),
     { correo: 'taller@example.com', rol: 'fabricacion' });
}
{
  const { api } = montar();
  eq('un token vencido o falso no entra (la base dice 401)', api.identidadDeLaBase('sesion-vencida-o-falsa-0000001'), null);
  eq('una cuenta dada de baja no entra', api.identidadDeLaBase('sesion-de-alguien-dado-de-baja-1'), null);
  eq('una cuenta activa en OTRA empresa no entra a la de AL3D', api.identidadDeLaBase('sesion-de-otra-empresa-00000001'), null);
  eq('un área que la hoja no conoce no entra: el default es cerrado', api.identidadDeLaBase('sesion-con-area-inventada-00001'), null);
  eq('un token corto ni se pregunta', api.identidadDeLaBase('corto'), null);
}
{
  const { api, pedidas } = montar({ red: 'truena' });
  eq('sin red no se puede verificar, y no entra', api.identidadDeLaBase('sesion-de-elias-direccion-0001'), null);
  const dos = montar();
  eq('con la base en error (503) tampoco', dos.api.identidadDeLaBase('sesion-con-la-base-en-error-01'), null);
  dos.api.identidadDeLaBase('sesion-con-la-base-en-error-01');
  eq('  pero ese «no» no se guarda: se le vuelve a preguntar', dos.pedidas.length, 2);
  cierto('  (y la de sin red sí salió a preguntar)', pedidas.length === 1);
}
{
  const { api, pedidas } = montar();
  const a = api.identidadDeLaBase('sesion-de-elias-direccion-0001');
  const b = api.identidadDeLaBase('sesion-de-elias-direccion-0001');
  eq('la segunda vez da lo mismo sin volver a preguntar', [b, pedidas.length], [a, 1]);
  api.identidadDeLaBase('sesion-vencida-o-falsa-0000001');
  api.identidadDeLaBase('sesion-vencida-o-falsa-0000001');
  eq('un «no» de verdad también se recuerda (un rato)', pedidas.length, 2);
}

console.log('\n2 · LA PUERTA: la sesión de la base abre Drive y Maps, y nada más');
{
  const { H, hijas } = montar();
  const post = c => H.doPost(JSON.stringify(c));
  const s = 'sesion-de-elias-direccion-0001';
  const r = post({ ruta: 'carpetas', supa_token: s });
  eq('/carpetas con la sesión de la base contesta las carpetas', [r.ok, r.carpetas.map(c => c.nombre)], [true, ['Mairi - Mundo Malu']]);
  eq('  con sus archivos', r.carpetas[0].archivos.map(a => a.nombre), ['Ordenes de Fabricacion.pdf', 'Escalas y Logotipo de Mundo Malú.cdr']);
  eq('sin ninguna puerta, /carpetas sigue cerrada', post({ ruta: 'carpetas' }).codigo, 'ROL_SIN_PERMISO');
  const mala = post({ ruta: 'carpetas', supa_token: 'sesion-vencida-o-falsa-0000001' });
  eq('con una sesión que la base no reconoce, cerrada y diciendo por qué', [mala.codigo, /base no reconoce/.test(mala.mensaje)], ['ROL_SIN_PERMISO', true]);

  const nueva = post({ ruta: 'crear_carpeta', nombre: 'Romina - JM Dental Digital', supa_token: s });
  eq('Dirección, con la sesión de la base, abre la carpeta de un proyecto', [nueva.ok, nueva.creada, hijas.length], [true, true, 2]);
  const taller = post({ ruta: 'crear_carpeta', nombre: 'Otro - Negocio', supa_token: 'sesion-del-taller-fabricacion-01' });
  eq('  y fabricación no: el área de la base es el rol', [taller.codigo, hijas.length], ['ROL_SIN_PERMISO', 2]);

  const maps = post({ ruta: 'expandir', u: 'https://example.com/x', supa_token: s });
  cierto('/expandir pasa la puerta (contesta lo suyo, no ROL_SIN_PERMISO)', maps.codigo !== 'ROL_SIN_PERMISO');

  for (const ruta of ['salud', 'jalar', 'empujar', 'jalar_gastos', 'empujar_gastos', 'pendientes', 'autorizar', 'ia', 'tarifas', 'jalar_almacen']) {
    eq('la sesión de la base NO abre /' + ruta, post({ ruta, supa_token: s }).codigo, 'ROL_SIN_PERMISO');
  }
  eq('las rutas que abre son exactamente tres', Object.keys(H.run('RUTAS_CON_LA_BASE')).sort(), ['carpetas', 'crear_carpeta', 'expandir']);
}
{
  /* Un teléfono con token de dispositivo y sesión de la base: la identidad manda, como con Google. */
  const { H } = montar({ tokens: { ['p'.repeat(40)]: 'pagos' } });
  const r = H.doPost(JSON.stringify({ ruta: 'crear_carpeta', nombre: 'Sofia - Inhuman', token: 'p'.repeat(40), supa_token: 'sesion-de-elias-direccion-0001' }));
  eq('con token de pagos y la sesión de Dirección, manda la sesión', r.ok, true);
  const solo = H.doPost(JSON.stringify({ ruta: 'jalar', token: 'p'.repeat(40), supa_token: 'sesion-de-elias-direccion-0001' }));
  cierto('y fuera de esos tres caminos manda el token de siempre', solo.codigo !== 'ROL_SIN_PERMISO');
}

console.log('\n3 · EL TELÉFONO manda su sesión solo donde la hoja la acepta');
{
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const pedidas = [];
  globalThis.fetch = async (_url, init) => {
    const c = JSON.parse(init.body);
    pedidas.push(c);
    const cuerpo = c.ruta === 'carpetas' ? { ok: true, raiz: 'https://drive.google.com/drive/folders/raiz', carpetas: [] }
      : c.ruta === 'crear_carpeta' ? { ok: true, creada: true, carpeta: { id: 'x', nombre: c.nombre } }
      : c.ruta === 'expandir' ? { ok: true, url: 'https://www.google.com/maps/@20.6,-103.3,17z' }
      : { ok: true, ts: 1, cursor: null, registros: [] };
    return { status: 200, json: async () => cuerpo };
  };
  const { crear } = await import('../js/datos/puente.js');
  const cfg = { url: 'https://puente.test/exec', token: '' };
  const conBase = crear(cfg, { tokenDeLaBase: async () => 'sesion-de-elias-direccion-0001' });
  const r = await conBase.carpetas();
  eq('el relevo de la base pide las carpetas y llegan', r.ok, true);
  eq('  con su sesión en el cuerpo', pedidas.at(-1).supa_token, 'sesion-de-elias-direccion-0001');
  await conBase.crearCarpeta('Romina - JM Dental Digital');
  eq('al abrir una carpeta también', pedidas.at(-1).supa_token, 'sesion-de-elias-direccion-0001');
  await conBase.expandir('https://maps.app.goo.gl/abc');
  eq('y al leer un link corto de Maps', pedidas.at(-1).supa_token, 'sesion-de-elias-direccion-0001');
  await conBase.salud();
  eq('pero no en /salud ni en lo demás', pedidas.at(-1).supa_token, undefined);

  const deLaHoja = crear(cfg);
  await deLaHoja.carpetas();
  eq('el relevo de la hoja, el de siempre, no manda ninguna sesión de la base', pedidas.at(-1).supa_token, undefined);
  const sinSesion = crear(cfg, { tokenDeLaBase: async () => '' });
  await sinSesion.carpetas();
  eq('sin sesión abierta no viaja nada', 'supa_token' in pedidas.at(-1), false);
  const truena = crear(cfg, { tokenDeLaBase: async () => { throw new Error('la librería no cargó'); } });
  const t = await truena.carpetas();
  eq('si leer la sesión truena, la petición sale igual, sin ella', [t.ok, 'supa_token' in pedidas.at(-1)], [true, false]);
}

console.log('\nLOS DOS LADOS DICEN LO MISMO');
{
  const { readFileSync } = await import('node:fs');
  const cfgSrc = readFileSync(new URL('../js/datos/supabase-config.js', import.meta.url), 'utf8');
  const prod = /'al3d-produccion':\s*Object\.freeze\(\{[\s\S]*?url:\s*'([^']+)',[\s\S]*?llave:\s*'([^']+)'/.exec(cfgSrc);
  const { api } = montar();
  eq('la hoja pregunta a la misma base y con la misma llave pública que la app', [api.BASE_URL, api.BASE_LLAVE_PUBLICA], [prod[1], prod[2]]);
  const relevo = readFileSync(new URL('../js/datos/supa-relevo.js', import.meta.url), 'utf8');
  cierto('el relevo de la base arma su lector de Drive con la sesión de la base',
         /Puente\.crear\(Prefs\.puente\(\),\s*\{\s*tokenDeLaBase:\s*Supa\.tokenDeSesion\s*\}\)/.test(relevo));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
