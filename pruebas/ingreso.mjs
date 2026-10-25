/* ENTRAR CON GOOGLE — la frontera, probada del lado que la defiende.
 *
 * El rol puede salir ahora de la identidad de Google y no solo de un token de dispositivo.
 * Eso mueve la puerta de sitio, así que hay que probar la puerta.
 *
 * De todo lo que se prueba aquí, lo que NO puede faltar nunca es la comprobación de la
 * AUDIENCIA. Los tokens de Google los verifica el mismo Google para todo el mundo: si este
 * puente se conformara con «Google dice que el token es válido», serviría para entrar aquí
 * un token que Google emitió para CUALQUIER otra aplicación del planeta —una en la que
 * cualquiera puede registrarse en dos minutos— y con el correo que esa app quisiera. La
 * comprobación de que `aud` es exactamente esta app es lo único que lo impide, y por eso
 * tiene su propia prueba y su propio nombre.
 *
 * Lo segundo que se prueba es que FALLA CERRADO: si la verificación no se puede hacer
 * —sin red del lado de la hoja, Google que contesta un error— no entra nadie. Fallar
 * abierto ahí sería quitar la llave justo cuando falla la cerradura.
 *
 * Se corre con pruebas/correr.sh, como todas. No toca Google ni la hoja: el Apps Script se
 * evalúa en un contexto aparte con dobles de los servicios.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'puente', 'hoja-apps-script.gs'), 'utf8');

const CLIENTE = '1234567890-abcdefg.apps.googleusercontent.com';

/* ----- Los dobles de los servicios de Google -----
   Solo los que toca el camino del ingreso. Cada uno cuenta sus llamadas para poder probar
   que la caché de verdad ahorra la petición de red, que es su única razón de existir. */
function montar(opciones = {}) {
  const estado = { fetches: 0, ultimaUrl: '' };
  const accesos = opciones.accesos === undefined
    ? [['ELIAS@example.com', 'direccion', ''], ['taller@example.com', 'fabricacion', '']]
    : opciones.accesos;

  const cache = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => { cache.set(k, v); },
    }),
  };

  const UrlFetchApp = {
    fetch: (url) => {
      estado.fetches++;
      estado.ultimaUrl = url;
      if (opciones.red === 'truena') throw new Error('sin red');
      if (opciones.red === 'error') return { getResponseCode: () => 500, getContentText: () => '' };
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          aud: opciones.aud === undefined ? CLIENTE : opciones.aud,
          email: opciones.email === undefined ? 'elias@example.com' : opciones.email,
          email_verified: opciones.verificado === undefined ? 'true' : opciones.verificado,
          expires_in: 3500,
        }),
      };
    },
  };

  const hoja = accesos === null ? null : {
    getLastRow: () => accesos.length + 1,
    getRange: (fila, col, n, ancho) => ({
      getValues: () => accesos.slice(fila - 2, fila - 2 + n).map(r => r.slice(col - 1, col - 1 + ancho)),
    }),
  };
  const SpreadsheetApp = { getActive: () => ({ getSheetByName: n => (n === 'Accesos' ? hoja : null) }) };

  const Utilities = {
    formatDate: d => d.toISOString().slice(0, 10),
    computeDigest: (_alg, txt) => Array.from(createHash('sha256').update(txt).digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    getUuid: () => 'uuid-de-prueba',
  };
  /* `Utilities.DigestAlgorithm` se lee como propiedad del objeto, así que va dentro. */
  Utilities.DigestAlgorithm = { SHA_256: 'SHA_256' };

  const noImplementado = new Proxy({}, {
    get: () => () => { throw new Error('servicio de Google no disponible en la prueba'); },
  });

  const ctx = vm.createContext({
    SpreadsheetApp, CacheService, UrlFetchApp, Utilities,
    PropertiesService: noImplementado, ScriptApp: noImplementado, MailApp: noImplementado,
    LockService: noImplementado, ContentService: noImplementado, HtmlService: noImplementado,
    Session: { getEffectiveUser: () => ({ getEmail: () => 'elias@example.com' }) },
    Logger: noImplementado, console,
  });
  vm.runInContext(src, ctx);
  /* La prueba inyecta su propia lista para no depender del identificador real que el archivo
     trae escrito: si mañana se agrega el de Android, estas pruebas no tienen por qué
     enterarse. Que la lista VACÍA apague el camino entero tiene su prueba más abajo, y que
     acepte más de una app también. */
  if (opciones.cliente === null) vm.runInContext('PUENTE_CLIENT_IDS = []', ctx);
  else {
    const lista = Array.isArray(opciones.cliente) ? opciones.cliente : [opciones.cliente || CLIENTE];
    vm.runInContext('PUENTE_CLIENT_IDS = ' + JSON.stringify(lista), ctx);
  }
  const api = vm.runInContext('({ identidadDelIngreso, rolDelCorreo, PUENTE_ROLES, PUENTE_CLIENT_IDS })', ctx);
  return { api, estado };
}

console.log('\nLA AUDIENCIA — la comprobación que no puede faltar');
{
  const { api } = montar({ aud: 'otra-app-cualquiera.apps.googleusercontent.com' });
  eq('un token emitido para OTRA app no entra, aunque Google diga que es válido',
     api.identidadDelIngreso('token-largo-de-otra-app-1234567890'), null);

  const bueno = montar({});
  eq('el de esta app sí, y trae su correo y su rol',
     bueno.api.identidadDelIngreso('token-largo-de-esta-app-1234567890'),
     { correo: 'elias@example.com', rol: 'direccion' });

  /* Es una LISTA, no un valor, y de eso depende que el día que exista la app de Android sus
     tokens no salgan rechazados: cada plataforma tiene su propio identificador ante Google.
     Se prueba con dos para que quien la vuelva a convertir en un solo valor rompa esto. */
  const ANDROID = '1057893837924-otroidparaandroid.apps.googleusercontent.com';
  const dos = montar({ cliente: [CLIENTE, ANDROID], aud: ANDROID });
  eq('un token de la SEGUNDA app de la lista también entra: la web y la de Android conviven',
     dos.api.identidadDelIngreso('token-largo-desde-android-1234567890').rol, 'direccion');
  const tercera = montar({ cliente: [CLIENTE, ANDROID], aud: 'una-tercera-app.apps.googleusercontent.com' });
  eq('y una tercera que no está en la lista sigue sin entrar',
     tercera.api.identidadDelIngreso('token-largo-de-una-tercera-12345'), null);
}

console.log('\nEL CORREO — verificado, y en la pestaña Accesos');
{
  const sinVerificar = montar({ verificado: 'false' });
  eq('un correo sin verificar no entra: lo pone cualquiera',
     sinVerificar.api.identidadDelIngreso('token-largo-sin-verificar-123456'), null);

  const fuera = montar({ email: 'desconocido@example.com' });
  eq('un correo verificado que no está en Accesos tampoco',
     fuera.api.identidadDelIngreso('token-largo-de-un-desconocido-12345'), null);

  const mayus = montar({ email: 'Elias@Example.com' });
  eq('las mayúsculas no deciden quién entra',
     mayus.api.identidadDelIngreso('token-largo-con-mayusculas-123456').rol, 'direccion');

  const inventado = montar({ accesos: [['elias@example.com', 'jefazo', '']] });
  eq('un rol que no existe en la tabla no entra: el default es cerrado',
     inventado.api.identidadDelIngreso('token-largo-con-rol-inventado-1234'), null);

  const sinPestana = montar({ accesos: null });
  eq('sin pestaña Accesos no entra nadie por Google',
     sinPestana.api.identidadDelIngreso('token-largo-sin-pestana-12345678'), null);

  const fabricacion = montar({ email: 'taller@example.com' });
  eq('y el del taller entra como fabricación',
     fabricacion.api.identidadDelIngreso('token-largo-del-taller-123456789').rol, 'fabricacion');
}

console.log('\nCUANDO NO SE PUEDE VERIFICAR — falla cerrado');
{
  const truena = montar({ red: 'truena' });
  eq('si la verificación truena, no entra',
     truena.api.identidadDelIngreso('token-largo-con-la-red-caida-12345'), null);

  const error = montar({ red: 'error' });
  eq('si Google contesta un error, tampoco',
     error.api.identidadDelIngreso('token-largo-con-google-en-error-123'), null);

  const apagado = montar({ cliente: null });
  eq('y sin identificador de app el camino entero está apagado',
     apagado.api.identidadDelIngreso('token-largo-con-la-app-sin-montar-1'), null);
}

console.log('\nLA CACHÉ — para no verificar veinticinco veces el mismo token');
{
  const { api, estado } = montar({});
  const tok = 'token-largo-que-se-repite-1234567890';
  const a = api.identidadDelIngreso(tok);
  const b = api.identidadDelIngreso(tok);
  eq('la segunda vez da lo mismo', b, a);
  eq('y no gastó una segunda petición de red', estado.fetches, 1);
  cierto('el token viaja escapado en la URL de verificación',
         estado.ultimaUrl.indexOf(encodeURIComponent(tok)) !== -1);

  /* Un token distinto NO puede leer la entrada del otro: la clave es su hash. */
  const otro = api.identidadDelIngreso('token-largo-distinto-0987654321abc');
  eq('un token distinto se verifica aparte', estado.fetches, 2);
  eq('y da su propio resultado', otro && otro.correo, 'elias@example.com');
}

console.log('\nLOS TRES ROLES SIGUEN SIENDO LOS MISMOS');
{
  const { api } = montar({});
  eq('la tabla de roles no cambió al abrir la puerta nueva',
     Object.keys(api.PUENTE_ROLES).sort(), ['direccion', 'fabricacion', 'pagos']);
}

console.log('\nEL ORIGEN SE COMPRUEBA ANTES DE ABRIR LA VENTANA DE GOOGLE');
{
  /* Desde un origen que Google no tiene dado de alta, la ventana solo enseña «Error 400:
     origin_mismatch». La app tiene que darse cuenta antes y decir cuál es la dirección buena. */
  const I = await import('../js/nucleo/ingreso.js');
  cierto('github.io, que es donde vive la app, vale', I.origenAutorizado('https://eliasgaribi-ctrl-z.github.io'));
  cierto('Cloudflare Pages, donde también se publica, vale', I.origenAutorizado('https://cotizador-al3d.pages.dev'));
  cierto('otro dominio no', !I.origenAutorizado('https://al3d.pages.dev'));
  cierto('un archivo abierto a mano (origen «null») no', !I.origenAutorizado('null'));
  cierto('localhost tampoco, porque Google no lo tiene', !I.origenAutorizado('http://localhost:8080'));
  cierto('sin origen no se juzga', I.origenAutorizado(''));
  const ing = readFileSync(join(aqui, '..', 'js', 'nucleo', 'ingreso.js'), 'utf8').replace(/\r\n/g, '\n');
  /* Dentro de entrar(), y no en el archivo entero: desde el botón de Google (`botonDeIdentidad`) hay
     otra llamada a cargarGis() más arriba en el archivo, que no tiene nada que ver con ésta. */
  const ent = (ing.match(/export async function entrar\(callado, opc\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('entrar() lo comprueba antes de cargar el guion de Google',
         ent.indexOf('origenAutorizado(origenActual())') !== -1 &&
         ent.indexOf('origenAutorizado(origenActual())') < ent.indexOf('await cargarGis()'));
}

/* EL TOKEN DE IDENTIDAD DEL BOTÓN DE GOOGLE (la puerta de un toque, 2026-10-25).
 *
 * La puerta ya no solo abre la ventana del permiso de la hoja: enseña el botón de Google, que da un token
 * de IDENTIDAD (un JWT) y se va a Supabase. Del lado de la app ese token solo se LEE —la firma la comprueba
 * Supabase, que es quien abre algo—, pero leerlo mal tiene costo: anotar el correo de un token de otra app,
 * de un correo sin verificar o ya vencido dejaría a la puerta diciendo «entraste como…» de alguien que
 * Supabase va a rechazar. Y lo que NO puede pasar nunca: que el token se quede guardado en el aparato
 * (viajaría en un respaldo) o que se use como el token de la hoja (la hoja lo rechaza y echaría a su dueño). */
console.log('\nEL TOKEN DE IDENTIDAD DEL BOTÓN DE GOOGLE');
{
  const almacen = new Map();
  globalThis.localStorage = {
    getItem: k => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: k => almacen.delete(k),
  };
  const I = await import('../js/nucleo/ingreso.js');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const AHORA = Date.now();
  const jwt = (extra = {}) => b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: 'https://accounts.google.com', aud: I.CLIENT_ID, email: 'beto@al3d.mx', email_verified: true,
    exp: Math.floor(AHORA / 1000) + 3600, nonce: 'huella-del-nonce', name: 'Alberto Núñez', ...extra,
  }) + '.firma-que-solo-mira-supabase';

  const r = I.leerCredencial(jwt(), { nonce: 'huella-del-nonce' });
  eq('uno bueno: su correo y cuándo vence, con la forma de entrar()', [r.ok, r.valor && r.valor.correo, r.valor && r.valor.expira],
     [true, 'beto@al3d.mx', (Math.floor(AHORA / 1000) + 3600) * 1000]);
  eq('un nombre con acento no rompe la lectura (base64url → bytes → UTF-8)', I.leerCredencial(jwt({ name: 'Ñandú Pérez' })).ok, true);
  eq('el emisor también puede venir sin https', I.leerCredencial(jwt({ iss: 'accounts.google.com' })).ok, true);

  /* La audiencia, por lo mismo que en el Apps Script: un token de otra app no es de esta app. */
  const otra = I.leerCredencial(jwt({ aud: 'otra-app.apps.googleusercontent.com' }));
  cierto('un token de OTRA app no se anota', !otra.ok && /otra app/.test(otra.mensaje));
  cierto('  ni uno con la audiencia en lista que no la incluye', !I.leerCredencial(jwt({ aud: ['otra-app.apps.googleusercontent.com'] })).ok);
  cierto('  y en lista que sí, sí', I.leerCredencial(jwt({ aud: ['x', I.CLIENT_ID] })).ok);
  const sinVerificar = I.leerCredencial(jwt({ email_verified: false }));
  cierto('un correo sin verificar no se anota: lo pone cualquiera', !sinVerificar.ok && /no está verificado/.test(sinVerificar.mensaje));
  eq('  «true» como texto sí vale (así lo escribe tokeninfo)', I.leerCredencial(jwt({ email_verified: 'true' })).ok, true);
  const vencido = I.leerCredencial(jwt({ exp: Math.floor(AHORA / 1000) - 5 }));
  cierto('uno vencido no se anota, y se dice (casi siempre es el reloj del teléfono)', !vencido.ok && /venció/.test(vencido.mensaje));
  cierto('  ni uno sin fecha', !I.leerCredencial(jwt({ exp: undefined })).ok);
  cierto('otro emisor que no es Google, no', !I.leerCredencial(jwt({ iss: 'https://evil.example' })).ok);
  cierto('con otro nonce que el que se le dio a Google, no', !I.leerCredencial(jwt(), { nonce: 'otra-huella' }).ok);
  cierto('sin correo, o con uno que no es correo, no', !I.leerCredencial(jwt({ email: undefined })).ok && !I.leerCredencial(jwt({ email: 'beto' })).ok);
  for (const [que, t] of [['vacío', ''], ['dos trozos', 'a.b'], ['basura', 'a.%%%.c'], ['JSON que no es objeto', 'x.' + Buffer.from('[1]').toString('base64url') + '.y'], ['null', null]]) {
    eq('un token ' + que + ' no truena: dice que no', I.leerCredencial(t).ok, false);
  }
  eq('el Client ID pegado en Ajustes también manda aquí (clienteId())',
     I.leerCredencial(jwt({ aud: 'probando.apps.googleusercontent.com' }), { clienteId: 'probando.apps.googleusercontent.com' }).ok, true);

  /* Anotar: el correo queda como el de la puerta; el token, en ninguna parte. */
  I.salir();
  const cred = jwt();
  const a = I.anotarCredencial(cred, { nonce: 'huella-del-nonce' });
  eq('anotarlo deja el correo de la puerta, como entrar()', [a.ok, I.correo()], [true, 'beto@al3d.mx']);
  eq('  pero NO es el token de la hoja: la hoja lo rechazaría', [I.dentro(), I.token()], [false, '']);
  const crudo = [...almacen.values()].join('\n');
  cierto('  y no queda guardado en el aparato (ni el token ni su cuerpo): no viaja en un respaldo',
         !crudo.includes(cred) && !crudo.includes(cred.split('.')[1]) && !almacen.has('al3d_pf_gtok'));
  eq('uno malo no cambia el correo que había', [I.anotarCredencial(jwt({ aud: 'otra' })).ok, I.correo()], [false, 'beto@al3d.mx']);

  /* Un permiso de la hoja vivo de OTRA cuenta no se queda: no es de quien acaba de entrar. */
  almacen.set('al3d_pf_gtok', JSON.stringify({ token: 'tok-de-beto', expira: Date.now() + 600000 }));
  const I2 = await import('../js/nucleo/ingreso.js?otra-vez');
  I2.anotarCredencial(jwt({ email: 'beto@al3d.mx' }));
  eq('el permiso de la hoja de la MISMA cuenta se queda', I2.token(), 'tok-de-beto');
  I2.anotarCredencial(jwt({ email: 'ana@al3d.mx' }));
  eq('el de otra cuenta se suelta', [I2.token(), I2.correo(), almacen.has('al3d_pf_gtok')], ['', 'ana@al3d.mx', false]);

  const ing = readFileSync(join(aqui, '..', 'js', 'nucleo', 'ingreso.js'), 'utf8');
  const anotar = (ing.match(/export function anotarCredencial\([\s\S]*?\n\}/) || [''])[0];
  cierto('anotarCredencial no toca el token de la hoja salvo para soltarlo', anotar && !/_tok = \{/.test(anotar) && !/guardarTok\(\{/.test(anotar));
  cierto('ni ingreso.js usa sessionStorage para nada', !/sessionStorage/.test(ing.replace(/\/\*[\s\S]*?\*\//g, '')));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
