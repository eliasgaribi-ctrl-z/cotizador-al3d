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
  cierto('otro dominio no', !I.origenAutorizado('https://al3d.pages.dev'));
  cierto('un archivo abierto a mano (origen «null») no', !I.origenAutorizado('null'));
  cierto('localhost tampoco, porque Google no lo tiene', !I.origenAutorizado('http://localhost:8080'));
  cierto('sin origen no se juzga', I.origenAutorizado(''));
  const ing = readFileSync(join(aqui, '..', 'js', 'nucleo', 'ingreso.js'), 'utf8');
  cierto('entrar() lo comprueba antes de cargar el guion de Google',
         ing.indexOf('origenAutorizado(origenActual())') !== -1 &&
         ing.indexOf('origenAutorizado(origenActual())') < ing.indexOf('await cargarGis()'));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
