/* LA LISTA BLANCA DE MAPS, CORRIENDO DE VERDAD. Sin Google, sin red, en node.

   `supabase/functions/_shared/maps.js` es el módulo de la Edge Function que sustituye a
   `/expandir` del Apps Script. Sale a internet con una dirección que le manda quien llama,
   y lo único que impide que sea un trampolín hacia el servicio de metadatos de la nube o hacia
   una red interna es su lista blanca de dominios. Por eso esta prueba no se conforma con
   probar los casos que se le ocurrieron a quien la escribió: además de la tabla de evasiones,
   comprueba el INVARIANTE con miles de entradas generadas —si una liga se acepta, el
   analizador estándar dice que su host de verdad es uno de la lista— y con un doble de red
   que anota todo lo que se le pide y se queja de cualquier petición que no debió salir.

   Lo que se cuida, en este orden:
     1. El hueco del .gs, REPRODUCIDO: se carga puente/hoja-apps-script.gs en vm y se le pasa
        «https://maps.google.com:x@evil.example/». Pasa su lista blanca y `UrlFetchApp.fetch`
        recibe esa cadena, cuyo host de verdad es evil.example. maps.js la rechaza. Y se
        prueba el parche mínimo del .gs que se propone en el informe (aplicado en memoria: este
        archivo no toca el .gs).
     2. La lista es la del .gs, letra por letra.
     3. Más de cien evasiones —con su motivo—: usuario con «@» y con «:», puertos, http,
        subdominios falsos, el host permitido escondido en un parámetro, IPv4 en todas sus
        formas, IPv6, homógrafos, esquemas raros, diagonales invertidas, saltos de línea,
        direcciones enormes y tipos que no son texto.
     4. Lo legítimo sigue pasando: lo que aceptaba el .gs, sacado del código y de las pruebas
        del repositorio, y lo que Maps de verdad comparte.
     5. El invariante, con treinta mil entradas generadas con semilla fija: lo que se acepta
        apunta, para el analizador estándar, a un host de la lista, y lo que se pide es lo que
        se validó.
     6. `expandir` con un fetch de mentiras: saltos válidos, a mano y revalidados; una
        dirección fuera de la lista en el 1.er, 2.º y 3.er salto que NUNCA se pide; bucles;
        http; tiempo; bytes; y el mismo contrato que el .gs. Y otra vez con el `fetch` REAL de
        node contra un servidor HTTP local en 127.0.0.1 (sin internet), para comprobar lo que
        los dobles no pueden: que `redirect:'manual'` entrega la 30x con su `Location`, que
        cancelar el cuerpo suelta la conexión y que la señal corta una petición colgada.
     7. El cliente de verdad (`Geo.resolverLink`) saca el mismo pin con el .gs de un salto que
        con maps.js de varios.
     8. El módulo no usa nada de node: se corre en un contexto sin `process`, `Buffer` ni
        `require`.

   Estas pruebas se probaron a su vez con mutaciones: se rompió el módulo adrede en cuarenta
   y tres sitios (quitar la revisión de usuario, volver a sacar el host con el regex del .gs,
   dejar que `fetch` siga solo, no validar la `Location`, quitar el reloj, quitar el tope de
   bytes…) y en cada uno esta prueba falla o se cuelga.

   No se pudo correr en Deno (no hay Deno aquí): lo que se comprueba es que no usa nada que
   Deno no tenga, y que `fetch` con `redirect:'manual'` se porta como se espera en node. Si en
   Deno `redirect:'manual'` devolviera una respuesta opaca, el módulo contesta `SIN_RED` en
   vez de seguir a ciegas.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { DOMINIOS_MAPS, ACORTADORES, LIMITES, esEnlaceDeMapas, validarEnlace, expandir }
  from '../supabase/functions/_shared/maps.js';
import { resolverLink } from '../js/datos/geo.js';

let fallos = 0;
let total = 0;
const bien = m => { total++; console.log('  ok   ' + m); };
const mal = m => { total++; fallos++; console.log('  FALLA ' + m); };
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) bien(que);
  else mal(que + '\n         dio: ' + a + '\n         esp: ' + b);
};
const cierto = (que, v) => (v ? bien(que) : mal(que));
const nota = m => console.log('  ·    ' + m);

/* Los caracteres que no se ven se arman con su número y no se escriben: en un archivo de
   texto un U+00AD o un U+2028 son invisibles, y una prueba cuyo caso nadie puede leer no
   enseña nada. */
const cp = n => String.fromCodePoint(n);
const BS = '\\';                    // una sola diagonal invertida
const TAB = cp(9), LF = cp(10), CR = cp(13), NUL = cp(0);
const completo = s => [...s].map(c => cp(c.codePointAt(0) + 0xFEE0)).join('');   // «maps» en ancho completo

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaGs = join(aqui, '..', 'puente', 'hoja-apps-script.gs');
const rutaMaps = join(aqui, '..', 'supabase', 'functions', '_shared', 'maps.js');
const fuenteGs = readFileSync(rutaGs, 'utf8');

const EN_LISTA = h => DOMINIOS_MAPS.includes(h);
const sinPunto = h => h.replace(/\.$/, '');
/* El host de verdad: el que entrega el analizador estándar, el mismo que usa `fetch`. */
const hostReal = u => { try { return sinPunto(new URL(u).hostname); } catch (_) { return null; } };

const LARGO = 'https://www.google.com/maps/place/Expo/@20.6543,-103.3901,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d20.6551!4d-103.3925';
const CORTO = 'https://maps.app.goo.gl/AbCdEf123';

/* ===========================================================================
   EL .gs, CARGADO EN VM
   =========================================================================== */

/* La línea de `expandirLiga_` que saca el host, y su arreglo mínimo: exigir que lo que sigue al
   host sea «/», «?», «#» o el final. Con eso el host ya no se puede cortar en el «:» de un
   usuario con contraseña. Es el parche que se propone en el informe; aquí se aplica sobre una
   COPIA en memoria. Si el .gs ya trae el arreglo, las pruebas de abajo lo dicen y siguen
   valiendo (comprueban que cierra, en vez de comprobar que está abierto). */
const LINEA_CON_EL_HUECO = String.raw`var m = /^https?:\/\/([^\/:?#]+)/i.exec(u);`;
const LINEA_PARCHADA = String.raw`var m = /^https?:\/\/([^\/:?#]+)(?=[\/?#]|$)/i.exec(u);`;
const tieneElHueco = fuenteGs.includes(LINEA_CON_EL_HUECO);
const fuenteParchada = fuenteGs.replace(LINEA_CON_EL_HUECO, LINEA_PARCHADA);

/* Una copia viva del .gs con un `UrlFetchApp` que anota cada dirección que le piden. `red`
   decide qué contesta (o lanza, como lanza Apps Script cuando no hay red). */
function cargarGs(fuente, red) {
  const pedidas = [];
  const ctx = vm.createContext({
    UrlFetchApp: { fetch(u, opciones) { pedidas.push(u); return red(u, opciones); } },
    console,
  });
  vm.runInContext(fuente, ctx);
  return {
    pedidas,
    /* La puerta de /expandir, tal cual: `rutaExpandir_({ u })`. El resultado pasa por JSON
       porque el objeto nace en otro contexto de vm. */
    expandir(u) {
      ctx.__u = u;
      return JSON.parse(vm.runInContext('JSON.stringify(rutaExpandir_({ u: __u }))', ctx));
    },
    lista: () => JSON.parse(vm.runInContext('JSON.stringify(DOMINIOS_MAPS)', ctx)),
  };
}
const googleContesta = loc => () => ({ getHeaders: () => (loc ? { Location: loc } : {}) });

/* ===========================================================================
   LOS INSUMOS: la tabla de evasiones y un corpus generado
   =========================================================================== */

/* [qué es, el texto, el motivo con el que se rechaza]. El motivo es de la PRIMERA regla que lo
   para, en el orden en que `validarEnlace` las revisa: así cada caso prueba la regla que dice
   probar y no cae por otra por casualidad. */
const EVASIONES = [
  ['USUARIO Y CONTRASEÑA', [
    ['usuario con «:» (el hueco del .gs)', 'https://maps.google.com:x@evil.example/', 'credenciales'],
    ['usuario con «:» y la contraseña vacía', 'https://maps.google.com:@evil.example/', 'credenciales'],
    ['usuario «host:443»', 'https://maps.google.com:443@evil.example/', 'credenciales'],
    ['usuario con «:» hacia el servicio de metadatos', 'https://www.google.com:x@169.254.169.254/latest/meta-data/', 'credenciales'],
    ['usuario con «:» hacia localhost', 'https://goo.gl:x@localhost:8080/admin', 'credenciales'],
    ['usuario con «:» y puerto en el host de verdad', 'https://maps.google.com:x@evil.example:8443/', 'credenciales'],
    ['usuario con «@» (el permitido es el usuario)', 'https://maps.google.com@evil.example/', 'credenciales'],
    ['usuario con «@» (el permitido es el host)', 'https://evil.example@maps.google.com/', 'credenciales'],
    ['usuario y contraseña de forma normal', 'https://user:pass@maps.google.com/', 'credenciales'],
    ['solo usuario', 'https://user@www.google.com/maps', 'credenciales'],
    ['dos «@» seguidas', 'https://a@b@maps.google.com/', 'credenciales'],
    ['«@» codificada dentro del usuario', 'https://maps.google.com%40evil.example@maps.google.com/', 'credenciales'],
    ['«@@» al principio', 'https://@@maps.google.com/', 'credenciales'],
    ['usuario vacío con «:» (el analizador lo descarta solo)', 'https://:@maps.google.com/', 'autoridad_rara'],
    ['«@» sola (el analizador la descarta solo)', 'https://@maps.google.com/', 'autoridad_rara'],
  ]],
  ['PUERTOS', [
    ['puerto 80 sobre https', 'https://maps.google.com:80/', 'puerto'],
    ['puerto 8443', 'https://www.google.com:8443/maps', 'puerto'],
    ['puerto 22', 'https://goo.gl:22/maps/x', 'puerto'],
    ['puerto 0', 'https://maps.app.goo.gl:0/x', 'puerto'],
    ['puerto 65535', 'https://google.com:65535/', 'puerto'],
    ['puerto fuera de rango', 'https://maps.google.com:65536/', 'no_es_url'],
    ['puerto con letras', 'https://maps.google.com:abc/', 'no_es_url'],
    ['puerto con signo', 'https://maps.google.com:+443/', 'no_es_url'],
    ['443 con cero a la izquierda (se ve distinto del 443 de siempre)', 'https://maps.google.com:0443/', 'autoridad_rara'],
    ['«:» sin número', 'https://www.google.com:/maps', 'autoridad_rara'],
    ['443 dos veces', 'https://maps.google.com:443:443/', 'no_es_url'],
  ]],
  ['ESQUEMAS', [
    ['http', 'http://maps.google.com/', 'esquema'],
    ['http a un acortador', 'http://maps.app.goo.gl/AbC', 'esquema'],
    ['http en mayúsculas', 'HTTP://MAPS.GOOGLE.COM/', 'esquema'],
    ['ftp', 'ftp://maps.google.com/', 'esquema'],
    ['ws', 'ws://maps.google.com/', 'esquema'],
    ['wss', 'wss://maps.google.com/', 'esquema'],
    ['file con el host de la lista', 'file://maps.google.com/etc/passwd', 'esquema'],
    ['file sin host', 'file:///etc/passwd', 'esquema'],
    ['data', 'data:text/html,<script>alert(1)</script>', 'esquema'],
    ['javascript', 'javascript:alert(1)', 'esquema'],
    ['javascript disfrazado de URL', 'javascript://maps.google.com/%0aalert(1)', 'esquema'],
    ['blob', 'blob:https://maps.google.com/0b1a2c3d', 'esquema'],
    ['gopher', 'gopher://maps.google.com/', 'esquema'],
    ['about', 'about:blank', 'esquema'],
    ['sin esquema, protocolo relativo', '//maps.google.com/', 'no_es_url'],
    ['sin esquema (lo que acepta esAcortado del cliente)', 'maps.app.goo.gl/AbC', 'no_es_url'],
    ['sin esquema, con www', 'www.google.com/maps', 'no_es_url'],
    ['una sola diagonal', 'https:/maps.google.com/x', 'autoridad_rara'],
    ['ninguna diagonal', 'https:maps.google.com/x', 'autoridad_rara'],
    ['diagonales invertidas en vez de «//»', 'https:' + BS + BS + 'maps.google.com' + BS + 'x', 'autoridad_rara'],
    ['tres diagonales', 'https:///maps.google.com/x', 'autoridad_rara'],
  ]],
  ['SUBDOMINIOS FALSOS Y HOSTS QUE NO SON LOS DE LA LISTA', [
    ['la lista disfrazada de subdominio', 'https://maps.google.com.evil.example/', 'host_no_permitido'],
    ['lo mismo con maps.app.goo.gl (el caso que ya probaba puente-hoja.mjs)', 'https://maps.app.goo.gl.evil.com/x', 'host_no_permitido'],
    ['un prefijo pegado al host', 'https://evilmaps.google.com/', 'host_no_permitido'],
    ['un subdominio del permitido (no hay comodines)', 'https://evil.maps.google.com/', 'host_no_permitido'],
    ['foo.google.com', 'https://foo.google.com/', 'host_no_permitido'],
    ['mail.google.com', 'https://mail.google.com/', 'host_no_permitido'],
    ['otro TLD', 'https://www.google.com.mx/maps', 'host_no_permitido'],
    ['google.com como subdominio', 'https://google.com.evil.example/', 'host_no_permitido'],
    ['un dominio que solo termina igual', 'https://notgoo.gl/', 'host_no_permitido'],
    ['un prefijo sobre goo.gl', 'https://xgoo.gl/maps/x', 'host_no_permitido'],
    ['goo.gl como subdominio', 'https://goo.gl.evil.example/maps/x', 'host_no_permitido'],
    ['g.co como subdominio', 'https://g.co.evil.example/', 'host_no_permitido'],
    ['guion en vez de punto', 'https://maps-google.com/', 'host_no_permitido'],
    ['sin el punto', 'https://mapsgoogle.com/', 'host_no_permitido'],
    ['un TLD parecido', 'https://maps.google.co/', 'host_no_permitido'],
    ['otro dominio de Google que no está en la lista', 'https://www.googleusercontent.com/', 'host_no_permitido'],
    ['una API de Google que no está en la lista', 'https://maps.googleapis.com/maps/api/geocode/json', 'host_no_permitido'],
    ['el servicio de metadatos de Google Cloud', 'https://metadata.google.internal/computeMetadata/v1/', 'host_no_permitido'],
    ['localhost', 'https://localhost/', 'host_no_permitido'],
    ['un nombre interno sin punto', 'https://internal/', 'host_no_permitido'],
    ['un host cualquiera', 'https://evil.example/', 'host_no_permitido'],
    ['dos puntos finales (uno se quita, el otro no)', 'https://maps.google.com../x', 'host_no_permitido'],
    ['un punto al principio', 'https://.maps.google.com/', 'host_no_permitido'],
  ]],
  ['LA LISTA ESCONDIDA EN OTRA PARTE DE LA DIRECCIÓN (el host de verdad es otro)', [
    ['en la ruta', 'https://evil.example/maps.google.com', 'host_no_permitido'],
    ['como parámetro', 'https://evil.example/?url=https://maps.google.com/', 'host_no_permitido'],
    ['en el fragmento', 'https://evil.example/#https://maps.google.com', 'host_no_permitido'],
    ['detrás de una diagonal invertida', 'https://evil.example' + BS + '@maps.google.com/', 'host_no_permitido'],
    ['detrás de «?»', 'https://evil.example?@maps.google.com/', 'host_no_permitido'],
    ['detrás de «#»', 'https://evil.example#@maps.google.com/', 'host_no_permitido'],
    ['antes del host, con «:» (usuario)', 'https://evil.example:443@maps.google.com/', 'credenciales'],
    ['el permitido como «usuario» de otro permitido', 'https://google.com@maps.google.com/', 'credenciales'],
  ]],
  ['IPs, EN TODAS SUS FORMAS', [
    ['loopback', 'https://127.0.0.1/', 'host_ip'],
    ['metadatos de AWS y de Google Cloud', 'https://169.254.169.254/latest/meta-data/', 'host_ip'],
    ['red privada 10/8', 'https://10.0.0.1/', 'host_ip'],
    ['red privada 192.168/16', 'https://192.168.1.1/', 'host_ip'],
    ['red privada 172.16/12', 'https://172.16.0.1/', 'host_ip'],
    ['una IP de Google', 'https://142.250.217.78/maps', 'host_ip'],
    ['decimal (2130706433 = 127.0.0.1)', 'https://2130706433/', 'host_ip'],
    ['hexadecimal', 'https://0x7f000001/', 'host_ip'],
    ['octal', 'https://0177.0.0.1/', 'host_ip'],
    ['abreviada (127.1)', 'https://127.1/', 'host_ip'],
    ['cero', 'https://0/', 'host_ip'],
    ['mezcla de hexadecimal y octal', 'https://0x7f.0.0.01/', 'host_ip'],
    ['IPv6 loopback', 'https://[::1]/', 'host_ip'],
    ['IPv6 con IPv4 incrustada', 'https://[::ffff:127.0.0.1]/', 'host_ip'],
    ['IPv6 de metadatos de AWS', 'https://[fd00:ec2::254]/', 'host_ip'],
    ['IPv6 pública', 'https://[2001:4860:4860::8888]/', 'host_ip'],
    ['una IP que parece subdominio', 'https://1.1.1.1.example.com/', 'host_no_permitido'],
  ]],
  ['HOMÓGRAFOS, PUNYCODE Y LETRAS QUE EL ANALIZADOR «ARREGLA»', [
    ['«o» cirílicas en maps.google.com', 'https://maps.g' + cp(0x43e) + cp(0x43e) + 'gle.com/', 'host_idn'],
    ['«a» cirílica en maps', 'https://m' + cp(0x430) + 'ps.google.com/', 'host_idn'],
    ['«g» latina con gancho (U+0261)', 'https://' + cp(0x261) + 'oogle.com/', 'host_idn'],
    ['lo mismo sobre goo.gl', 'https://goo.' + cp(0x261) + 'l/maps/x', 'host_idn'],
    ['punycode escrito a mano', 'https://xn--mps-6ve.google.com/', 'host_idn'],
    ['punycode de otro dominio', 'https://xn--80ak6aa92e.com/', 'host_idn'],
    ['ancho completo: el analizador lo vuelve maps.google.com', 'https://' + completo('maps') + '.google.com/', 'autoridad_rara'],
    ['ancho completo en todo el host', 'https://' + completo('google') + '.' + completo('com') + '/', 'autoridad_rara'],
    ['guion blando dentro del host (el analizador lo borra)', 'https://maps.goo' + cp(0xad) + 'gle.com/', 'autoridad_rara'],
    ['punto ideográfico al final (el analizador lo vuelve «.»)', 'https://maps.google.com' + cp(0x3002) + '/', 'autoridad_rara'],
    ['punto de ancho completo dentro del host', 'https://maps' + cp(0xff0e) + 'google.com/', 'autoridad_rara'],
    ['espacio de ancho cero tras el host', 'https://maps.google.com' + cp(0x200b) + '/', 'autoridad_rara'],
    ['punto codificado (%2E)', 'https://maps%2Egoogle.com/', 'autoridad_rara'],
    ['«%0d%0a» en el host (inyección de cabeceras)', 'https://maps.google.com%0d%0a.evil.example/', 'no_es_url'],
    ['«%00» en el host', 'https://maps.google.com%00.evil.example/', 'no_es_url'],
  ]],
  ['DIAGONALES INVERTIDAS', [
    ['como separador del usuario', 'https://maps.google.com' + BS + '@evil.example/', 'autoridad_rara'],
    ['como separador del host', 'https://maps.google.com' + BS + '.evil.example/', 'autoridad_rara'],
    ['cerrando el host', 'https://www.google.com' + BS + 'maps', 'autoridad_rara'],
  ]],
  ['ESPACIOS, SALTOS DE LÍNEA Y CONTROL DENTRO DE LA LIGA', [
    ['un espacio en la ruta', 'https://maps.app.goo.gl/abc def', 'espacios_o_control'],
    ['una segunda liga después de un salto de línea', 'https://maps.app.goo.gl/abc' + LF + 'https://evil.example/', 'espacios_o_control'],
    ['inyección de cabeceras con CR LF', 'https://maps.app.goo.gl/abc' + CR + LF + 'Host: evil.example', 'espacios_o_control'],
    ['un tabulador en la ruta', 'https://maps.app.goo.gl/' + TAB + 'abc', 'espacios_o_control'],
    ['un salto de línea dentro del host (el analizador lo borra)', 'https://maps.goo' + LF + 'gle.com/', 'espacios_o_control'],
    ['un tabulador dentro del host', 'https://maps.goo' + TAB + 'gle.com/', 'espacios_o_control'],
    ['un NUL antes', NUL + 'https://maps.app.goo.gl/x', 'espacios_o_control'],
    ['un NUL después', 'https://maps.app.goo.gl/x' + NUL, 'espacios_o_control'],
    ['un NEL (U+0085) en la ruta', 'https://maps.app.goo.gl/' + cp(0x85) + 'x', 'espacios_o_control'],
    ['un separador de línea (U+2028) en la ruta', 'https://maps.app.goo.gl/x' + cp(0x2028) + 'y', 'espacios_o_control'],
    ['un espacio duro (U+00A0) en la ruta', 'https://maps.app.goo.gl/x' + cp(0xa0) + 'y', 'espacios_o_control'],
    ['un DEL', 'https://maps.app.goo.gl/x' + cp(0x7f), 'espacios_o_control'],
  ]],
  ['TAMAÑO', [
    ['una dirección de cien mil caracteres', 'https://www.google.com/maps/' + 'a'.repeat(100000), 'muy_larga'],
    ['un host de cinco mil caracteres', 'https://' + 'a'.repeat(5000) + '.google.com/', 'muy_larga'],
    ['un caracter más que el tope', 'https://maps.app.goo.gl/' + 'a'.repeat(LIMITES.maxUrl - 'https://maps.app.goo.gl/'.length + 1), 'muy_larga'],
    ['corta de largo pero enorme al canonizar (cada é pasa a seis caracteres)', 'https://maps.app.goo.gl/' + 'é'.repeat(1000), 'muy_larga'],
  ]],
  ['LO QUE NO ES TEXTO O NO TRAE NADA', [
    ['null', null, 'no_es_texto'],
    ['undefined', undefined, 'no_es_texto'],
    ['un número', 123, 'no_es_texto'],
    ['un booleano', true, 'no_es_texto'],
    ['un objeto', { u: CORTO }, 'no_es_texto'],
    ['un arreglo con una liga buena (el .gs lo volvía texto con String())', [CORTO], 'no_es_texto'],
    ['un objeto con toString (no es texto)', { toString: () => CORTO }, 'no_es_texto'],
    ['una cadena vacía', '', 'vacio'],
    ['solo espacios', '   ', 'vacio'],
    ['solo un salto de línea', LF, 'vacio'],
    ['una frase (tiene espacios)', 'oye mandame la ubicacion de la casa porfa', 'espacios_o_control'],
    ['un par de coordenadas (tiene un espacio)', '20.673611, -103.344000', 'espacios_o_control'],
    ['las coordenadas sin espacio (no es una liga que seguir)', '20.673611,-103.344000', 'no_es_url'],
    ['una palabra suelta, sin esquema', 'ubicacion', 'no_es_url'],
    ['un geo:', 'geo:20.6736,-103.344?z=17', 'esquema'],
  ]],
];

/* El invariante necesita MUCHAS entradas. Se arman por piezas peligrosas, con un generador
   con semilla fija —mulberry32— para que lo que falle una vez falle siempre. */
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PIEZAS = {
  esquema: ['https://', 'https://', 'https://', 'https://', 'HTTPS://', 'http://', 'https:/', 'https:', '//', 'https:' + BS + BS, 'ftp://', 'javascript://', ''],
  usuario: ['', '', '', '', '', 'a@', 'maps.google.com:x@', ':@', '@', 'maps.google.com@', 'evil.example@', 'evil.example:443@', 'x:y@', '%40@', 'goo.gl:@'],
  host: [
    ...DOMINIOS_MAPS, ...DOMINIOS_MAPS, ...DOMINIOS_MAPS.map(h => h.toUpperCase()), ...DOMINIOS_MAPS.map(h => h + '.'),
    'evil.example', 'maps.google.com.evil.example', 'evilmaps.google.com', 'foo.google.com', 'google.com..',
    '127.0.0.1', '[::1]', '2130706433', '0x7f000001', '169.254.169.254', 'localhost', 'metadata.google.internal',
    'maps.g' + cp(0x43e) + 'ogle.com', completo('maps') + '.google.com', 'maps.goo' + cp(0xad) + 'gle.com',
    'maps' + cp(0x3002) + 'google.com', 'maps.google.com%2e', 'maps%2egoogle.com', 'maps.goo' + TAB + 'gle.com',
  ],
  puerto: ['', '', '', '', ':443', ':80', ':8443', ':', ':x', ':0443', ':65536'],
  corte: ['/', '/', '/', '?', '#', '', BS, '/' + BS, ' ', LF, TAB],
  resto: ['', 'maps/place/x', 'x@evil.example', '%2f', '@evil.example/', ':x@evil.example/', 'AbC123', '?q=1#f', 'a b', '.evil.example/'],
  borde: ['', '', '', '', ' ', LF, TAB + ' '],
};
function corpus(n, semilla) {
  const r = generador(semilla);
  const una = lista => lista[Math.floor(r() * lista.length)];
  const salida = [];
  for (let i = 0; i < n; i++) {
    salida.push(una(PIEZAS.borde) + una(PIEZAS.esquema) + una(PIEZAS.usuario) + una(PIEZAS.host) +
                una(PIEZAS.puerto) + una(PIEZAS.corte) + una(PIEZAS.resto) + una(PIEZAS.borde));
  }
  return salida;
}
/* Las evasiones de la tabla también entran al corpus (las que son texto), para que el hueco
   del .gs esté seguro entre las entradas aunque el azar no lo toque. */
const DE_LA_TABLA = EVASIONES.flatMap(([, casos]) => casos.map(c => c[1])).filter(t => typeof t === 'string');
const CORPUS = [...DE_LA_TABLA, ...corpus(30000, 20261010)];

/* ===========================================================================
   1. EL HUECO DEL .gs
   =========================================================================== */
console.log('\n1. EL HUECO DEL .gs — reproducido cargando puente/hoja-apps-script.gs en vm');
{
  /* Cada una pasa por rutaExpandir_ con un UrlFetchApp de mentiras que contesta una liga larga
     de Maps. Lo que se mira: ¿la dejó pasar?, ¿qué cadena le dio a UrlFetchApp.fetch? y ¿a qué
     host apunta esa cadena según el analizador estándar —el de `fetch`—? */
  const VARIANTES = [
    ['https://maps.google.com:x@evil.example/', 'evil.example'],
    ['https://maps.google.com:@evil.example/', 'evil.example'],
    ['https://maps.google.com:443@evil.example/', 'evil.example'],
    ['https://www.google.com:x@169.254.169.254/latest/meta-data/', '169.254.169.254'],
    ['https://goo.gl:x@localhost:8080/admin', 'localhost'],
    ['http://maps.app.goo.gl:x@evil.example/', 'evil.example', 'esquema'],   // con http, la primera regla que lo para es el esquema
  ];

  if (tieneElHueco) {
    nota('el .gs de este árbol trae todavía la línea con el hueco: se reproduce');
    for (const [u, esperadoReal] of VARIANTES) {
      const gs = cargarGs(fuenteGs, googleContesta(LARGO));
      const r = gs.expandir(u);
      eq('el .gs deja pasar «' + u + '»', r.ok, true);
      eq('  y UrlFetchApp.fetch recibe esa misma cadena', gs.pedidas, [u]);
      eq('  cuyo host de verdad, para el analizador estándar, es', hostReal(gs.pedidas[0]), esperadoReal);
      cierto('  y ese host NO está en la lista blanca', !EN_LISTA(hostReal(gs.pedidas[0])));
    }
    /* La regex del .gs, aislada: la misma expresión, para que se vea de dónde sale. */
    const reDelGs = /^https?:\/\/([^\/:?#]+)/i;
    eq('la causa: la expresión del .gs da «maps.google.com» para el ejemplo', reDelGs.exec('https://maps.google.com:x@evil.example/')[1], 'maps.google.com');
    /* Y lo que el informe dice de las otras dos formas con «@»: esas sí las paraba. */
    for (const u of ['https://maps.google.com@evil.example/', 'https://evil.example@maps.google.com/']) {
      const gs = cargarGs(fuenteGs, googleContesta(LARGO));
      eq('el .gs sí rechaza «' + u + '» (el «@» no está en la clase excluida)', [gs.expandir(u).ok, gs.pedidas.length], [false, 0]);
    }
  } else {
    nota('el .gs de este árbol YA trae el arreglo (no está la línea con el hueco): se comprueba que cierra');
  }

  for (const [u, , motivo = 'credenciales'] of VARIANTES) {
    const v = validarEnlace(u);
    eq('maps.js rechaza «' + u + '»', [v.ok, esEnlaceDeMapas(u)], [false, false]);
    eq('  por «' + motivo + '»' + (motivo === 'credenciales' ? ': el usuario y la contraseña, que es lo que el regex no veía' : ''), v.motivo, motivo);
  }

  console.log('\n  El parche mínimo del .gs, aplicado en memoria a la línea de expandirLiga_:');
  nota('antes:   ' + LINEA_CON_EL_HUECO);
  nota('después: ' + LINEA_PARCHADA);
  if (tieneElHueco) cierto('el parche cambia exactamente esa línea', fuenteParchada !== fuenteGs && fuenteParchada.split(LINEA_PARCHADA).length === 2);
  for (const [u] of VARIANTES) {
    const gs = cargarGs(fuenteParchada, googleContesta(LARGO));
    eq('con el parche, el .gs rechaza «' + u + '» y no sale a ningún lado', [gs.expandir(u).ok, gs.pedidas.length], [false, 0]);
  }
  /* Lo que el parche NO debe romper: lo que ya probaba pruebas/puente-hoja.mjs y los enlaces buenos. */
  for (const u of ['http://169.254.169.254/latest/meta-data/', 'https://evil.example.com/x', 'https://maps.app.goo.gl.evil.com/x', 'file:///etc/passwd', '']) {
    const gs = cargarGs(fuenteParchada, googleContesta(LARGO));
    const r = gs.expandir(u);
    eq('con el parche sigue rechazando «' + (u || '(vacío)').slice(0, 40) + '»', [r.ok, r.codigo], [false, 'DATO_INVALIDO']);
  }
  for (const u of [CORTO, 'https://goo.gl/maps/abcdEFGH1234', LARGO, 'https://www.google.com/maps?q=20.5230,-103.4470',
                   'https://maps.google.com/?q=20.7214%2C-103.3918', 'https://g.co/kgs/abc123', 'https://google.com/maps']) {
    const antes = cargarGs(fuenteGs, googleContesta(LARGO)).expandir(u);
    const gs = cargarGs(fuenteParchada, googleContesta(LARGO));
    eq('con el parche sigue aceptando «' + u.slice(0, 52) + '», igual que antes', [gs.expandir(u), gs.pedidas], [antes, [u]]);
  }

  /* El hueco, medido sobre todo el corpus: cuántas veces el .gs le entrega a UrlFetchApp una
     dirección cuyo host de verdad no es de la lista. Sin parche tiene que haber; con él, cero. */
  const violaciones = fuente => {
    const gs = cargarGs(fuente, googleContesta(LARGO));
    const malas = [];
    for (const s of CORPUS) {
      gs.pedidas.length = 0;
      gs.expandir(s);
      if (gs.pedidas.length) {
        const h = hostReal(gs.pedidas[0]);
        if (h !== null && !EN_LISTA(h)) malas.push(gs.pedidas[0]);
      }
    }
    return malas;
  };
  const sinParche = violaciones(fuenteGs);
  const conParche = violaciones(fuenteParchada);
  nota(CORPUS.length + ' entradas del corpus: el .gs de este árbol sale a un host que no es de la lista en ' + sinParche.length + ' de ellas; con el parche, ' + conParche.length);
  if (tieneElHueco) cierto('sin parche el .gs sí sale a hosts de afuera (el hueco existe)', sinParche.length > 0);
  eq('con el parche, jamás sale a un host que no esté en la lista', conParche, []);
}

/* ===========================================================================
   2. LA LISTA
   =========================================================================== */
console.log('\n2. LA LISTA BLANCA ES LA DEL .gs');
{
  const delGs = cargarGs(fuenteGs, googleContesta(LARGO)).lista();
  eq('misma lista, mismo orden, letra por letra', [...DOMINIOS_MAPS], delGs);
  eq('son seis', DOMINIOS_MAPS.length, 6);
  cierto('está congelada (nadie la amplía en caliente)', Object.isFrozen(DOMINIOS_MAPS));
  cierto('los acortadores son un subconjunto de la lista, no una ampliación', ACORTADORES.every(h => EN_LISTA(h)));
  eq('y son los tres que redirigen a otra parte', [...ACORTADORES], ['maps.app.goo.gl', 'goo.gl', 'g.co']);
  eq('los límites por omisión', { ...LIMITES }, { maxUrl: 4096, maxSaltos: 3, tiempoMs: 8000, maxBytes: 65536 });
  cierto('y están congelados', Object.isFrozen(LIMITES));
}

/* ===========================================================================
   3. EVASIONES
   =========================================================================== */
let nEvasiones = 0;
for (const [grupo, casos] of EVASIONES) {
  console.log('\n3. EVASIONES · ' + grupo);
  for (const [que, texto, motivo] of casos) {
    nEvasiones++;
    const v = validarEnlace(texto);
    if (!v.ok && v.motivo === motivo && esEnlaceDeMapas(texto) === false) bien(que + '  →  ' + motivo);
    else mal(que + ' · dio ' + JSON.stringify(v) + ' y esperaba el motivo «' + motivo + '»');
  }
}
console.log('');
cierto('al menos 60 casos de evasión en la tabla (hay ' + nEvasiones + ')', nEvasiones >= 60);

console.log('\n3. EVASIONES · LOS LÍMITES JUSTO EN EL BORDE');
{
  const base = 'https://maps.app.goo.gl/';
  const justo = base + 'a'.repeat(LIMITES.maxUrl - base.length);
  eq('de exactamente el tope de largo, pasa', [justo.length, esEnlaceDeMapas(justo)], [LIMITES.maxUrl, true]);
  eq('un carácter más, no', esEnlaceDeMapas(justo + 'a'), false);
  const adversario = 'https://' + 'a'.repeat(LIMITES.maxUrl - 8 - 7) + '.gl.com';
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) validarEnlace(adversario);
  cierto('un host de cuatro mil caracteres no se atora (200 vueltas en ' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 2000);
}

/* ===========================================================================
   4. LO LEGÍTIMO SIGUE PASANDO
   =========================================================================== */
console.log('\n4. LO LEGÍTIMO SIGUE PASANDO');
{
  /* Enlaces que el negocio de verdad maneja: los de pruebas/geo.mjs, pruebas/datos-de-entrega.mjs
     y pruebas/puente-hoja.mjs, y lo que el cliente pone de ejemplo en pantalla. */
  const LEGITIMOS = [
    CORTO, 'https://maps.app.goo.gl/xY7bQm4TfZ2kL9aA', 'https://maps.app.goo.gl/intermedio',
    'https://goo.gl/maps/abcdEFGH1234', 'https://goo.gl/maps/dos',
    'https://www.google.com/maps?q=20.5230,-103.4470', LARGO,
    'https://www.google.com/maps/place/Av.+Vallarta+1300,+Guadalajara/@20.6736,-103.3440,17z/',
    'https://maps.google.com/?q=20.7214%2C-103.3918',
    'https://www.google.com/maps/search/20.6134,+-103.4370',
    'https://www.google.com/maps/@20.6597,-103.3496,15z',
    'https://maps.google.com/maps?ll=20.6768,-103.3475&z=16&t=m',
    'https://www.google.com/maps/dir/Guadalajara/Zapopan/data=!4m8!4m7!1m5!1m1!1s0x0:0x0!2m2!1d-103.3918!2d20.7214!1m0',
    'https://www.google.com/maps/dir/?api=1&destination=20.5881,-103.4230&travelmode=driving',
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3732.5!2d-103.3496!3d20.6597!2m3',
    'https://www.google.com/maps/place/Tienda%20Ni%C3%B1o/@20.67,-103.34,17z',
    'https://www.google.com/maps/place/Tienda%E0%A4/@20.67,-103.34,17z',
    'https://www.google.com/maps/place/?q=place_id:ChIJm2VqQ8CvKIQRnaGSU5T9mHc',
    'https://www.google.com/maps/place/Guadalajara',
    'https://maps.google.com/?q=loc:+20.6597,-103.3496',
    'https://g.co/kgs/abc123', 'https://google.com/maps',
    'https://www.google.com/maps?q=0,0',
  ];
  for (const u of LEGITIMOS) {
    const v = validarEnlace(u);
    const gs = cargarGs(fuenteGs, googleContesta(LARGO));
    eq('«' + u.slice(0, 70) + (u.length > 70 ? '…' : '') + '» pasa, igual que en el .gs', [v.ok, gs.expandir(u).ok], [true, true]);
  }

  console.log('\n  La forma canónica es la que se pide, y no se descompone:');
  eq('el host en mayúsculas se escribe en minúsculas, y la ruta no se toca', validarEnlace('HTTPS://MAPS.APP.GOO.GL/AbC').url, 'https://maps.app.goo.gl/AbC');
  eq('los espacios de los extremos se recortan (como en el .gs)', validarEnlace('  ' + CORTO + LF).url, CORTO);
  eq('el punto final del host se quita (es el mismo host)', validarEnlace('https://maps.google.com./x').url, 'https://maps.google.com/x');
  eq('y también en mayúsculas y con puerto 443 escrito', validarEnlace('HTTPS://WWW.GOOGLE.COM.:443/maps').url, 'https://www.google.com/maps');
  eq('el 443 de siempre, escrito, se acepta', validarEnlace('https://maps.google.com:443/x').url, 'https://maps.google.com/x');
  eq('un host sin ruta recibe su «/»', validarEnlace('https://maps.app.goo.gl').url, 'https://maps.app.goo.gl/');
  eq('el fragmento se conserva', validarEnlace(CORTO + '#f').url, CORTO + '#f');
  eq('las letras con acento en la ruta se codifican', validarEnlace('https://www.google.com/maps/place/Café+Tacvba/@20.67,-103.34,17z').url,
     'https://www.google.com/maps/place/Caf%C3%A9+Tacvba/@20.67,-103.34,17z');
  eq('el host que devuelve es el normalizado', validarEnlace('HTTPS://WWW.GOOGLE.COM./maps').host, 'www.google.com');
  eq('lo canónico es idempotente: validarlo otra vez da lo mismo',
     LEGITIMOS.filter(u => validarEnlace(validarEnlace(u).url).url !== validarEnlace(u).url), []);
  eq('de las seis, cada una pasa', DOMINIOS_MAPS.map(h => esEnlaceDeMapas('https://' + h + '/x')), DOMINIOS_MAPS.map(() => true));
  eq('y cada una en mayúsculas también', DOMINIOS_MAPS.map(h => esEnlaceDeMapas('https://' + h.toUpperCase() + '/x')), DOMINIOS_MAPS.map(() => true));

  /* Un caso raro que SÍ se acepta y que no es una evasión: la diagonal invertida está en la RUTA
     y no en la autoridad, así que el host de verdad sigue siendo el permitido. */
  const rara = validarEnlace('https://maps.google.com/' + BS + '@evil.example');
  eq('una diagonal invertida en la ruta no cambia el host', [rara.ok, rara.host, hostReal(rara.url)], [true, 'maps.google.com', 'maps.google.com']);

  /* Todas las ligas https que el repositorio menciona en sus pruebas y cuyo host es uno de la
     lista: lo que el .gs aceptaba hoy y se escribe como un enlace normal. Se sacan del texto de
     los archivos, no se copian a mano. */
  const ARCHIVOS = ['geo.mjs', 'datos-de-entrega.mjs', 'puente-hoja.mjs'];
  const delRepo = new Set();
  for (const nombre of ARCHIVOS) {
    const texto = readFileSync(join(aqui, nombre), 'utf8');
    for (const m of texto.matchAll(/https:\/\/[^\s'"`)\]\\]+/g)) {
      const u = m[0].replace(/[,;.]+$/, '');
      const h = hostReal(u);
      if (h !== null && EN_LISTA(h) && /^https:\/\/[a-z0-9.-]+(?:[/?#]|$)/i.test(u)) delRepo.add(u);
    }
  }
  const SOLO_EJEMPLOS = u => /evil/.test(u);
  const lista = [...delRepo].filter(u => !SOLO_EJEMPLOS(u));
  const noPasan = lista.filter(u => !esEnlaceDeMapas(u));
  const gsNoPasan = lista.filter(u => !cargarGs(fuenteGs, googleContesta(LARGO)).expandir(u).ok);
  cierto('se encontraron ligas en las pruebas del repositorio (' + lista.length + ')', lista.length >= 15);
  eq('todas las del repositorio las acepta el .gs', gsNoPasan, []);
  eq('y todas las acepta maps.js', noPasan, []);
}

console.log('\n4. DIFERENCIAS DELIBERADAS CON EL .gs (lo de maps.js se comprueba; lo del .gs es informativo)');
{
  /* [liga, lo que dice maps.js, por qué]. La columna del .gs se calcula en vivo y se imprime. */
  const FILAS = [
    ['http://maps.google.com/x', false, 'solo https'],
    ['http://goo.gl/maps/abc', false, 'solo https (una liga vieja con http:// ya no se sigue; si hiciera falta, el cliente la sube a https antes de preguntar)'],
    ['https://maps.google.com:80/x', false, 'sin puerto'],
    ['https://maps.google.com:8443/x', false, 'sin puerto'],
    ['https://maps.google.com:x@evil.example/', false, 'el hueco'],
    ['https://maps.google.com./x', true, 'el punto final se normaliza (es el mismo host)'],
    ['https://maps.google.com:443/x', true, 'el 443 de siempre'],
    ['maps.app.goo.gl/abc', false, 'sin esquema (el .gs tampoco lo acepta, y `esAcortado` del cliente sí lo manda)'],
  ];
  for (const [u, esperado, porque] of FILAS) {
    const hoy = cargarGs(fuenteGs, googleContesta(LARGO)).expandir(u).ok;
    nota('«' + u + '»  .gs: ' + (hoy ? 'acepta' : 'rechaza') + '  ·  maps.js: ' + (esperado ? 'acepta' : 'rechaza') + '  ·  ' + porque);
    eq('maps.js, «' + u + '»', esEnlaceDeMapas(u), esperado);
  }
}

/* ===========================================================================
   5. EL INVARIANTE, CON ENTRADAS GENERADAS
   =========================================================================== */
console.log('\n5. EL INVARIANTE — «si se acepta, el host de verdad es de la lista»');
{
  let aceptadas = 0, rechazadas = 0;
  const rotas = [];
  const motivos = {};
  for (const s of CORPUS) {
    const v = validarEnlace(s);
    if (!v.ok) { rechazadas++; motivos[v.motivo] = (motivos[v.motivo] || 0) + 1; continue; }
    aceptadas++;
    let violacion = null;
    try {
      const canonica = new URL(v.url);
      const original = new URL(s.trim());          // lo que dijo la persona, por el analizador estándar
      if (canonica.protocol !== 'https:') violacion = 'esquema';
      else if (canonica.username || canonica.password) violacion = 'credenciales';
      else if (canonica.port) violacion = 'puerto';
      else if (!EN_LISTA(canonica.hostname)) violacion = 'host de la forma canónica fuera de la lista';
      else if (sinPunto(original.hostname) !== canonica.hostname) violacion = 'el texto original y lo que se pide apuntan a hosts distintos';
      else if (v.host !== canonica.hostname) violacion = 'host informado distinto del real';
      else if (new URL(v.url).href !== v.url) violacion = 'la forma canónica no es estable';
      else if (v.url.length > LIMITES.maxUrl) violacion = 'más larga que el tope';
    } catch (e) { violacion = 'lanzó ' + e.message; }
    if (violacion) rotas.push([s, violacion]);
  }
  nota(CORPUS.length + ' entradas: ' + aceptadas + ' aceptadas, ' + rechazadas + ' rechazadas. Motivos: ' +
       Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', '));
  eq('ninguna aceptada viola el invariante', rotas.slice(0, 3), []);
  cierto('el corpus tiene de las dos: aceptadas y rechazadas', aceptadas > 500 && rechazadas > 500);
  /* `no_es_texto` no puede salir de un corpus de cadenas: ese motivo lo cubre la tabla de arriba. */
  const sinSalir = ['vacio', 'muy_larga', 'espacios_o_control', 'no_es_url', 'esquema', 'credenciales', 'puerto', 'host_ip', 'host_idn',
    'host_no_permitido', 'autoridad_rara'].filter(m => !motivos[m]);
  eq('y el corpus hace salir todos los motivos de rechazo de las cadenas', sinSalir, []);

  /* La otra dirección: una liga cuyo host de verdad es de la lista y que está escrita normal tiene que pasar. */
  const normales = CORPUS.filter(s => /^https:\/\/[a-z0-9.-]+(?:[/?#]|$)/.test(s) && !/[\s\\@]/.test(s.split(/[/?#]/)[2] || '') &&
                                      DOMINIOS_MAPS.includes((s.match(/^https:\/\/([a-z0-9.-]+)/) || [])[1]) && /^[!-~]+$/.test(s) && s.length <= LIMITES.maxUrl);
  eq('lo escrito normal, con un host de la lista, se acepta siempre (' + normales.length + ' del corpus)', normales.filter(s => !esEnlaceDeMapas(s)), []);
}

/* ===========================================================================
   6. EXPANDIR, CON UN FETCH DE MENTIRAS
   =========================================================================== */

/* ---- los dobles ---- */
const cab = obj => ({
  get: n => { const k = Object.keys(obj).find(x => x.toLowerCase() === String(n).toLowerCase()); return k === undefined ? null : obj[k]; },
});
const resp = (estado, { ubicacion, cuerpo = null, tipo = 'basic', redirected } = {}) =>
  ({ status: estado, type: tipo, headers: cab(ubicacion ? { Location: ubicacion } : {}), body: cuerpo, redirected });
const redir = (a, estado = 302, extra = {}) => resp(estado, { ubicacion: a, ...extra });

/* Un cuerpo en flujo que cuenta lo que se le leyó y si lo cancelaron. `trozos` puede ser Infinity. */
function flujo(trozos, tamano = 1024) {
  const est = { leidos: 0, cancelado: false };
  let i = 0;
  const cuerpo = {
    getReader() {
      return {
        read: async () => {
          if (i >= trozos) return { done: true, value: undefined };
          i++; est.leidos += tamano;
          return { done: false, value: new Uint8Array(tamano) };
        },
        cancel: async () => { est.cancelado = true; },
      };
    },
    cancel: async () => { est.cancelado = true; },
  };
  return { cuerpo, est };
}

/* La red de mentiras. Anota todo lo que se le pide y marca como «rara» cualquier petición que
   NO debió salir, juzgada por el analizador estándar y no por el módulo que se prueba: que no
   sea https, que lleve usuario o puerto, que el host no sea de la lista, que el fetch no se
   haya llamado con `redirect:'manual'` o con GET. */
function red(responder) {
  const llamadas = [];
  const raras = [];
  const fetch = async (url, init = {}) => {
    llamadas.push({ url, init });
    let u = null;
    try { u = new URL(url); } catch (_) { /* queda null */ }
    const buena = u && u.protocol === 'https:' && !u.username && !u.password && !u.port && EN_LISTA(u.hostname);
    if (!buena) raras.push(String(url));
    if (init.redirect !== 'manual') raras.push('(sin redirect:manual) ' + url);
    if (init.method !== 'GET') raras.push('(no es GET) ' + url);
    if (!init.signal) raras.push('(sin signal) ' + url);
    return responder(url, init);
  };
  return { fetch, llamadas, raras, urls: () => llamadas.map(c => c.url) };
}
/* Una tabla url → qué contesta. Un texto es una 302 a esa dirección; un objeto es una respuesta
   completa; una función se llama en cada petición (para que cada una traiga su propio cuerpo). */
const deTabla = tabla => (url, init) => {
  if (!Object.prototype.hasOwnProperty.call(tabla, url)) throw new Error('la red de mentiras no conoce ' + url);
  const v = tabla[url];
  if (typeof v === 'function') return v(init);
  if (typeof v === 'string') return redir(v);
  return resp(v.estado, v);
};
const conTabla = tabla => red(deTabla(tabla));
/* Una red que contesta 200 a cualquier liga válida (para los barridos con entradas generadas). */
const redQueSiempreContesta = alRedirigir => red((url) => alRedirigir(url) || resp(200));

const NO_ES_MAPS = { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo se siguen ligas de Google Maps.' };
const SIN_RED = { ok: false, codigo: 'SIN_RED', mensaje: 'No se pudo seguir la liga.' };
const dormir = ms => new Promise(r => setTimeout(r, ms));
function dormirConSenal(ms, senal) {
  return new Promise((ok, no) => {
    const t = setTimeout(ok, ms);
    if (senal) senal.addEventListener('abort', () => { clearTimeout(t); no(Object.assign(new Error('abortado'), { name: 'AbortError' })); }, { once: true });
  });
}
const sinRaras = (que, n) => eq(que, n.raras, []);

console.log('\n6. EXPANDIR · saltos válidos, a mano');
{
  let n = conTabla({ [CORTO]: LARGO });
  let r = await expandir(CORTO, { fetch: n.fetch });
  eq('un salto a una página de Google: devuelve la liga larga', r, { ok: true, url: LARGO });
  eq('  y pidió solo la corta: la larga no se pide (igual que el .gs)', n.urls(), [CORTO]);
  eq('  con GET, redirect:manual y señal', [n.llamadas[0].init.method, n.llamadas[0].init.redirect, !!n.llamadas[0].init.signal], ['GET', 'manual', true]);
  sinRaras('  sin una sola petición rara', n);

  n = conTabla({ 'https://goo.gl/maps/dos': ['https://maps.app.goo.gl/intermedio'][0], 'https://maps.app.goo.gl/intermedio': 'https://www.google.com/maps?q=20.5230,-103.4470' });
  r = await expandir('https://goo.gl/maps/dos', { fetch: n.fetch });
  eq('dos saltos de acortador (goo.gl → maps.app.goo.gl → página): sale la liga larga', r, { ok: true, url: 'https://www.google.com/maps?q=20.5230,-103.4470' });
  eq('  se pidieron, en orden, los dos acortadores y nada más', n.urls(), ['https://goo.gl/maps/dos', 'https://maps.app.goo.gl/intermedio']);
  sinRaras('  sin una sola petición rara', n);

  n = conTabla({ 'https://goo.gl/a': 'https://goo.gl/b', 'https://goo.gl/b': 'https://g.co/c', 'https://g.co/c': 'https://maps.app.goo.gl/d', 'https://maps.app.goo.gl/d': LARGO });
  r = await expandir('https://goo.gl/a', { fetch: n.fetch });
  eq('tres saltos de acortador (el tope por omisión): llega', r, { ok: true, url: LARGO });
  eq('  cuatro peticiones', n.urls().length, 4);

  n = conTabla({ 'https://goo.gl/maps/rel': '/maps/abc', 'https://goo.gl/maps/abc': LARGO });
  r = await expandir('https://goo.gl/maps/rel', { fetch: n.fetch });
  eq('una Location relativa se resuelve contra la URL actual', [r, n.urls()], [{ ok: true, url: LARGO }, ['https://goo.gl/maps/rel', 'https://goo.gl/maps/abc']]);

  for (const estado of [301, 302, 303, 307, 308]) {
    n = conTabla({ [CORTO]: { estado, ubicacion: LARGO } });
    eq('una ' + estado + ' se sigue', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: LARGO });
  }
  for (const estado of [300, 304, 305]) {
    n = conTabla({ [CORTO]: { estado, ubicacion: LARGO } });
    eq('una ' + estado + ' no es «ve a esta otra»: se devuelve la misma liga', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: CORTO });
  }

  n = conTabla({ 'https://maps.app.goo.gl/x': 'https://WWW.Google.COM/maps/place/Foo/@20.6,-103.3,17z' });
  eq('el destino sale en su forma canónica', await expandir('https://maps.app.goo.gl/x', { fetch: n.fetch }), { ok: true, url: 'https://www.google.com/maps/place/Foo/@20.6,-103.3,17z' });

  n = conTabla({ 'https://maps.app.goo.gl/x': 'https://maps.google.com./?q=20.6,-103.3' });
  eq('un destino con punto final se normaliza', await expandir('https://maps.app.goo.gl/x', { fetch: n.fetch }), { ok: true, url: 'https://maps.google.com/?q=20.6,-103.3' });

  /* Lo que se pide es la forma canónica; lo que se devuelve cuando no hay a dónde seguir es lo que escribió la persona. */
  n = conTabla({ 'https://maps.app.goo.gl/AbC': { estado: 200 } });
  r = await expandir('  HTTPS://MAPS.APP.GOO.GL./AbC\n', { fetch: n.fetch });
  eq('sin redirección: devuelve lo que se mandó, recortado (el cliente lo reconoce como «de aquí no sale nada»)', r, { ok: true, url: 'HTTPS://MAPS.APP.GOO.GL./AbC' });
  eq('  y a Google se le pidió la forma canónica', n.urls(), ['https://maps.app.goo.gl/AbC']);

  /* La liga de la persona se pide aunque sea una página de Google: es lo que hacía el .gs. */
  n = conTabla({ 'https://www.google.com/maps?q=Foo': 'https://www.google.com/maps/place/Foo/@20.6,-103.3,17z' });
  eq('una liga que ya es de Google se pide una vez y se devuelve su Location', await expandir('https://www.google.com/maps?q=Foo', { fetch: n.fetch }),
     { ok: true, url: 'https://www.google.com/maps/place/Foo/@20.6,-103.3,17z' });
  eq('  sin pedir el destino', n.urls(), ['https://www.google.com/maps?q=Foo']);
  n = conTabla({ 'https://www.google.com/maps/place/Foo': { estado: 200, cuerpo: flujo(Infinity).cuerpo } });
  eq('una página de Google que contesta 200: la misma liga', await expandir('https://www.google.com/maps/place/Foo', { fetch: n.fetch }), { ok: true, url: 'https://www.google.com/maps/place/Foo' });
}

console.log('\n6. EXPANDIR · lo que no es redirección, y lo que falla');
{
  let n;
  for (const [que, def] of [
    ['200', { estado: 200 }], ['404', { estado: 404 }], ['403', { estado: 403 }],
    ['una 302 sin Location', { estado: 302 }], ['una 301 con Location vacía', { estado: 301, ubicacion: '   ' }],
  ]) {
    n = conTabla({ [CORTO]: def });
    eq(que + ': no hay a dónde seguir, se devuelve la misma liga (como el .gs)', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: CORTO });
  }
  for (const estado of [429, 500, 502, 503, 504, 599]) {
    n = conTabla({ [CORTO]: { estado, ubicacion: LARGO } });
    eq('una ' + estado + ' es SIN_RED (se reintenta), no un «ya no hay nada»', await expandir(CORTO, { fetch: n.fetch }), SIN_RED);
  }
  n = conTabla({ [CORTO]: { estado: 0, tipo: 'opaqueredirect' } });
  eq('una respuesta opaca (no hay Location que leer) es SIN_RED', await expandir(CORTO, { fetch: n.fetch }), SIN_RED);
  n = conTabla({ [CORTO]: { estado: 200, redirected: true } });
  eq('un fetch que siguió redirecciones por su cuenta (redirected) no es de fiar: SIN_RED', await expandir(CORTO, { fetch: n.fetch }), SIN_RED);
  n = conTabla({ [CORTO]: { estado: 302, ubicacion: LARGO, redirected: true } });
  eq('  ni aunque traiga una Location buena', await expandir(CORTO, { fetch: n.fetch }), SIN_RED);
  n = conTabla({ [CORTO]: { estado: 302, ubicacion: LARGO, redirected: false } });
  eq('  y `redirected:false` (lo normal) no estorba', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: LARGO });
  eq('el fetch que lanza (sin red) es SIN_RED', await expandir(CORTO, { fetch: async () => { throw new TypeError('fetch failed'); } }), SIN_RED);
  eq('el fetch que lanza sin ser async también', await expandir(CORTO, { fetch: () => { throw new Error('boom'); } }), SIN_RED);
  eq('una respuesta que no es una respuesta es SIN_RED', await expandir(CORTO, { fetch: async () => undefined }), SIN_RED);
  eq('una respuesta sin estado es SIN_RED', await expandir(CORTO, { fetch: async () => ({ headers: cab({}) }) }), SIN_RED);

  n = conTabla({ 'https://goo.gl/a': 'https://maps.app.goo.gl/b', 'https://maps.app.goo.gl/b': { estado: 503 } });
  eq('un 503 en el segundo salto también', await expandir('https://goo.gl/a', { fetch: n.fetch }), SIN_RED);

  n = conTabla({ 'https://goo.gl/a': 'https://maps.app.goo.gl/b', 'https://maps.app.goo.gl/b': { estado: 200 } });
  eq('un acortador que ya no redirige en el segundo salto: la última liga conocida', await expandir('https://goo.gl/a', { fetch: n.fetch }), { ok: true, url: 'https://maps.app.goo.gl/b' });
}

console.log('\n6. EXPANDIR · una dirección que no es de la lista, en el salto que sea, no se pide JAMÁS');
{
  let n;
  const EVIL = 'https://evil.example/x';

  n = conTabla({ 'https://maps.app.goo.gl/x': EVIL });
  eq('en el 1.er salto', await expandir('https://maps.app.goo.gl/x', { fetch: n.fetch }), NO_ES_MAPS);
  eq('  se pidió solo la liga de la persona', n.urls(), ['https://maps.app.goo.gl/x']);
  sinRaras('  y nada raro', n);

  n = conTabla({ 'https://goo.gl/a': 'https://maps.app.goo.gl/b', 'https://maps.app.goo.gl/b': EVIL });
  eq('en el 2.º salto', await expandir('https://goo.gl/a', { fetch: n.fetch }), NO_ES_MAPS);
  eq('  se pidieron las dos válidas y la de afuera no', n.urls(), ['https://goo.gl/a', 'https://maps.app.goo.gl/b']);
  sinRaras('  y nada raro', n);

  n = conTabla({ 'https://goo.gl/a': 'https://maps.app.goo.gl/b', 'https://maps.app.goo.gl/b': 'https://g.co/c', 'https://g.co/c': 'https://169.254.169.254/latest/meta-data/' });
  eq('en el 3.er salto (el servicio de metadatos)', await expandir('https://goo.gl/a', { fetch: n.fetch }), NO_ES_MAPS);
  eq('  se pidieron las tres válidas', n.urls(), ['https://goo.gl/a', 'https://maps.app.goo.gl/b', 'https://g.co/c']);
  sinRaras('  y nada raro', n);

  /* El redirector abierto de google.com: la lista permite www.google.com, que redirige a donde le
     digan (/url?q=…). Con un salto por llamada ya estaba contenido; aquí se vuelve a validar. */
  n = conTabla({ 'https://www.google.com/url?q=https://evil.example/&sa=D': EVIL });
  eq('el redirector abierto de www.google.com', await expandir('https://www.google.com/url?q=https://evil.example/&sa=D', { fetch: n.fetch }), NO_ES_MAPS);
  eq('  se pidió la liga de la persona y nada más', n.urls(), ['https://www.google.com/url?q=https://evil.example/&sa=D']);
  n = conTabla({ 'https://goo.gl/a': 'https://www.google.com/url?q=https://evil.example/', 'https://www.google.com/url?q=https://evil.example/': EVIL });
  eq('un acortador que apunta a ese redirector devuelve la liga de Google sin pedirla', await expandir('https://goo.gl/a', { fetch: n.fetch }),
     { ok: true, url: 'https://www.google.com/url?q=https://evil.example/' });
  eq('  y el cliente, al volver a preguntar con ella, topa con la lista', await expandir('https://www.google.com/url?q=https://evil.example/', { fetch: n.fetch }), NO_ES_MAPS);

  /* Locations hostiles, como primer salto y como segundo. */
  const HOSTILES = [
    ['una diagonal y una invertida (relativa para el ojo, absoluta para el analizador)', '/' + BS + 'evil.example/x'],
    ['protocolo relativo', '//evil.example/x'],
    ['dos invertidas', BS + BS + 'evil.example/x'],
    ['http a un host de la lista (bajar a texto claro)', 'http://www.google.com/maps/place/x'],
    ['http a un acortador', 'http://maps.app.goo.gl/x'],
    ['el hueco del .gs, ahora en una Location', 'https://maps.google.com:x@evil.example/'],
    ['usuario sobre un host de la lista', 'https://user@maps.google.com/'],
    ['puerto raro sobre un host de la lista', 'https://maps.google.com:8443/'],
    ['el servicio de metadatos', 'https://169.254.169.254/latest/meta-data/'],
    ['IPv6', 'https://[::1]/'],
    ['IP decimal', 'https://2130706433/'],
    ['metadatos de Google Cloud', 'https://metadata.google.internal/computeMetadata/v1/'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,x'],
    ['file', 'file:///etc/passwd'],
    ['subdominio falso', 'https://maps.google.com.evil.example/'],
    ['ftp', 'ftp://maps.google.com/'],
    ['ni siquiera una URL', 'https://'],
    ['una Location enorme', 'https://www.google.com/maps/' + 'a'.repeat(LIMITES.maxUrl + 10)],
    ['dos Location pegadas (así junta fetch dos cabeceras)', 'https://maps.app.goo.gl/b, https://evil.example/'],
  ];
  for (const [que, loc] of HOSTILES) {
    n = conTabla({ [CORTO]: loc });
    const r1 = await expandir(CORTO, { fetch: n.fetch });
    n.raras.length ? mal('1.er salto · ' + que + ': pidió algo raro ' + JSON.stringify(n.raras)) : eq('1.er salto · ' + que, [r1, n.urls()], [NO_ES_MAPS, [CORTO]]);
    n = conTabla({ 'https://goo.gl/a': CORTO, [CORTO]: loc });
    const r2 = await expandir('https://goo.gl/a', { fetch: n.fetch });
    n.raras.length ? mal('2.º salto · ' + que + ': pidió algo raro ' + JSON.stringify(n.raras)) : eq('2.º salto · ' + que, [r2, n.urls()], [NO_ES_MAPS, ['https://goo.gl/a', CORTO]]);
  }
}

console.log('\n6. EXPANDIR · bucles, cadenas largas y topes');
{
  let n = conTabla({ 'https://goo.gl/a': 'https://maps.app.goo.gl/b', 'https://maps.app.goo.gl/b': 'https://goo.gl/a' });
  eq('un bucle a → b → a', await expandir('https://goo.gl/a', { fetch: n.fetch }), NO_ES_MAPS);
  eq('  se corta al repetir, sin gastar los saltos (dos peticiones)', n.urls(), ['https://goo.gl/a', 'https://maps.app.goo.gl/b']);

  n = conTabla({ 'https://goo.gl/a': 'https://goo.gl/a' });
  eq('una liga que se manda a sí misma', [await expandir('https://goo.gl/a', { fetch: n.fetch }), n.urls().length], [NO_ES_MAPS, 1]);
  n = conTabla({ 'https://goo.gl/a': 'https://goo.gl/a#otro' });
  eq('lo mismo con solo otro fragmento (el fragmento no es otra dirección)', [await expandir('https://goo.gl/a', { fetch: n.fetch }), n.urls().length], [NO_ES_MAPS, 1]);
  n = conTabla({ 'https://goo.gl/a': 'https://GOO.GL./a' });
  eq('o con otra forma de escribir el mismo host', [await expandir('https://goo.gl/a', { fetch: n.fetch }), n.urls().length], [NO_ES_MAPS, 1]);

  /* Una cadena de acortadores más larga que el tope. */
  const cadena = largo => { const t = {}; for (let i = 0; i < largo; i++) t['https://goo.gl/c' + i] = i === largo - 1 ? LARGO : 'https://goo.gl/c' + (i + 1); return t; };
  n = conTabla(cadena(5));
  eq('cinco acortadores seguidos con el tope por omisión (3 saltos)', await expandir('https://goo.gl/c0', { fetch: n.fetch }), NO_ES_MAPS);
  eq('  se hicieron 4 peticiones: la primera más los 3 saltos', n.urls().length, 4);
  n = conTabla(cadena(5));
  eq('con maxSaltos 4 sí llega', await expandir('https://goo.gl/c0', { fetch: n.fetch, maxSaltos: 4 }), { ok: true, url: LARGO });
  n = conTabla(cadena(2));
  eq('con maxSaltos 0 no sigue acortadores', [await expandir('https://goo.gl/c0', { fetch: n.fetch, maxSaltos: 0 }), n.urls().length], [NO_ES_MAPS, 1]);
  n = conTabla({ [CORTO]: LARGO });
  eq('pero una página de Google sí se devuelve aunque maxSaltos sea 0', await expandir(CORTO, { fetch: n.fetch, maxSaltos: 0 }), { ok: true, url: LARGO });

  /* El tope duro: pedir «infinito» no quita el límite. */
  n = conTabla(cadena(40));
  eq('maxSaltos infinito se corta en el techo (10 saltos, 11 peticiones)', [await expandir('https://goo.gl/c0', { fetch: n.fetch, maxSaltos: Infinity }), n.urls().length], [NO_ES_MAPS, 11]);
  n = conTabla(cadena(40));
  eq('y uno absurdo, igual', [await expandir('https://goo.gl/c0', { fetch: n.fetch, maxSaltos: 1e12 }), n.urls().length], [NO_ES_MAPS, 11]);
  for (const raro of [-1, NaN, 'mucho', null, undefined, {}]) {
    n = conTabla(cadena(3));
    eq('un maxSaltos que no sirve (' + String(raro) + ') cae al de siempre', await expandir('https://goo.gl/c0', { fetch: n.fetch, maxSaltos: raro }), { ok: true, url: LARGO });
  }
}

console.log('\n6. EXPANDIR · el tiempo');
{
  /* Un fetch que se cuelga y NO atiende la señal: el reloj propio tiene que bastar. */
  let senal;
  let t0 = Date.now();
  let r = await expandir(CORTO, { fetch: (u, init) => { senal = init.signal; return new Promise(() => {}); }, tiempoMs: 40 });
  eq('un fetch que no contesta ni atiende la señal: SIN_RED', r, SIN_RED);
  cierto('  y no se quedó esperando (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 2000);
  cierto('  y cancelaron la petición en vuelo (la señal quedó abortada)', senal && senal.aborted === true);

  /* Uno que sí atiende la señal. */
  senal = null;
  r = await expandir(CORTO, { fetch: (u, init) => { senal = init.signal; return dormirConSenal(5000, init.signal); }, tiempoMs: 40 });
  eq('un fetch lento que atiende la señal: SIN_RED', r, SIN_RED);
  cierto('  y la señal quedó abortada', senal.aborted === true);

  /* Un reloj para TODA la cadena, no uno por salto: cada salto tarda 40 ms y el total permite 70. */
  /* goo.gl/a → goo.gl/b → goo.gl/c …, y cada respuesta tarda 40 ms. */
  const cadenaLenta = (u, init) => dormirConSenal(40, init.signal).then(() => redir('https://goo.gl/' + String.fromCharCode(u.charCodeAt(u.length - 1) + 1)));
  const n = red(cadenaLenta);
  t0 = Date.now();
  r = await expandir('https://goo.gl/a', { fetch: n.fetch, tiempoMs: 70, maxSaltos: 10 });
  eq('cada salto cabe, pero la suma no: SIN_RED', r, SIN_RED);
  cierto('  la cadena se cortó pronto (' + n.llamadas.length + ' peticiones; con 70 ms de reloj y 40 por salto caben dos, y tres ya sería otro reloj por salto)', n.llamadas.length <= 3);
  cierto('  y no tardó más de lo debido (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 2000);

  /* Un cuerpo que no termina nunca, de una redirección. */
  senal = null;
  r = await expandir(CORTO, {
    fetch: (u, init) => {
      senal = init.signal;
      return resp(302, { ubicacion: LARGO, cuerpo: { getReader: () => ({
        read: () => new Promise((ok, no) => init.signal.addEventListener('abort', () => no(new Error('abortado')), { once: true })),
        cancel: async () => {},
      }) } });
    },
    tiempoMs: 40,
  });
  eq('el cuerpo de una redirección que no termina también cuenta contra el reloj', r, SIN_RED);

  /* Lo que sí cabe, cabe: con tiempo de sobra y una red instantánea. */
  eq('con tiempo de sobra, sin problema', await expandir(CORTO, { fetch: conTabla({ [CORTO]: LARGO }).fetch, tiempoMs: 5000 }), { ok: true, url: LARGO });
  for (const raro of [-1, NaN, 'rápido', null, undefined]) {
    eq('un tiempoMs que no sirve (' + String(raro) + ') cae al de siempre (8 s) y la liga sale', await expandir(CORTO, { fetch: conTabla({ [CORTO]: LARGO }).fetch, tiempoMs: raro }), { ok: true, url: LARGO });
  }
  /* Y un fetch lento que SÍ termina a tiempo. */
  const lento = red((u, init) => dormirConSenal(15, init.signal).then(() => redir(LARGO)));
  eq('un fetch lento que sí llega a tiempo', await expandir(CORTO, { fetch: lento.fetch, tiempoMs: 5000 }), { ok: true, url: LARGO });

  /* El reloj se apaga en TODAS las salidas. Si no, cada llamada dejaría vivo un temporizador de
     ocho segundos y una Edge Function con mucho tráfico los iría juntando. Se cuentan los que
     quedan vivos (el `process.exit` del final taparía la fuga si solo se esperara a salir). */
  await dormir(5);
  eq('no queda ningún temporizador vivo después de tantas llamadas', process.getActiveResourcesInfo().filter(x => x === 'Timeout').length, 0);
}

console.log('\n6. EXPANDIR · los bytes');
{
  const KB = 1024;
  let f, n, r;

  f = flujo(20, 16 * KB);
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: f.cuerpo }) });
  r = await expandir(CORTO, { fetch: n.fetch, maxBytes: 32 * KB });
  eq('una redirección con un cuerpo de 320 KB y tope de 32 KB: SIN_RED', r, SIN_RED);
  eq('  se leyó hasta pasar el tope y ni un trozo más (3 trozos de 16 KB)', f.est.leidos, 48 * KB);
  cierto('  y se canceló el flujo para soltar la conexión', f.est.cancelado);

  f = flujo(2, 16 * KB);
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: f.cuerpo }) });
  eq('un cuerpo de exactamente el tope cabe', await expandir(CORTO, { fetch: n.fetch, maxBytes: 32 * KB }), { ok: true, url: LARGO });

  f = flujo(1, 200);
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: f.cuerpo }) });
  eq('el cuerpo de una redirección de verdad (unos cientos de bytes) cabe de sobra con el tope por omisión', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: LARGO });
  cierto('  y no se deja colgado: se cancela', f.est.cancelado);

  f = flujo(1, 1);
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: f.cuerpo }) });
  eq('con tope 0, un solo byte ya es de más', await expandir(CORTO, { fetch: n.fetch, maxBytes: 0 }), SIN_RED);
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: flujo(0).cuerpo }) });
  eq('  y un cuerpo vacío cabe', await expandir(CORTO, { fetch: n.fetch, maxBytes: 0 }), { ok: true, url: LARGO });

  n = conTabla({ [CORTO]: { estado: 302, ubicacion: LARGO, cuerpo: null } });
  eq('una redirección sin cuerpo (null) no estorba', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: LARGO });

  /* El tope duro: pedir un tope de gigabytes no lo quita. */
  f = flujo(80, 64 * KB);
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: f.cuerpo }) });
  eq('un maxBytes enorme se corta en el techo (4 MB)', await expandir(CORTO, { fetch: n.fetch, maxBytes: 1e12 }), SIN_RED);
  cierto('  sin leer más del techo y un trozo (' + f.est.leidos + ' bytes)', f.est.leidos <= 4 * 1024 * KB + 64 * KB);

  /* Lo que no es redirección: su cuerpo no se lee nunca. */
  f = flujo(Infinity, 64 * KB);
  n = conTabla({ [CORTO]: () => resp(200, { cuerpo: f.cuerpo }) });
  r = await expandir(CORTO, { fetch: n.fetch, maxBytes: 1 });
  eq('una página que contesta 200, con un cuerpo sin fin: no se lee y no es un error', r, { ok: true, url: CORTO });
  eq('  no se leyó ni un byte', f.est.leidos, 0);
  cierto('  y se canceló', f.est.cancelado);
  f = flujo(Infinity, 64 * KB);
  n = conTabla({ [CORTO]: () => resp(404, { cuerpo: f.cuerpo }) });
  await expandir(CORTO, { fetch: n.fetch });
  eq('una 404 con un cuerpo sin fin, tampoco se lee', [f.est.leidos, f.est.cancelado], [0, true]);

  /* Un cuerpo que se corta a medias: ya se tenía la cabecera. */
  n = conTabla({ [CORTO]: () => resp(302, { ubicacion: LARGO, cuerpo: { getReader: () => ({ read: async () => { throw new Error('conexión reiniciada'); }, cancel: async () => {} }) } }) });
  eq('un cuerpo que se corta no tira lo que ya dijo la cabecera', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: LARGO });
}

console.log('\n6. EXPANDIR · la entrada y las opciones');
{
  let raised = null;
  try { await expandir(CORTO); } catch (e) { raised = e; }
  cierto('sin fetch inyectado lanza TypeError (que se vea al cablear, no en producción)', raised instanceof TypeError && /fetch/.test(raised.message));
  raised = null;
  try { await expandir(CORTO, { fetch: 42 }); } catch (e) { raised = e; }
  cierto('con un fetch que no es una función, también', raised instanceof TypeError);
  raised = null;
  try { await expandir('https://evil.example/', {}); } catch (e) { raised = e; }
  cierto('y lanza aunque la liga sea mala (primero lo que es del programador)', raised instanceof TypeError);

  /* La entrada mala ni toca el fetch. */
  const entradas = ['', null, 123, ['https://maps.app.goo.gl/x'], 'https://maps.google.com:x@evil.example/', 'http://maps.app.goo.gl/x',
                    'https://evil.example/', 'file:///etc/passwd', 'https://127.0.0.1/', 'https://maps.app.goo.gl/x y'];
  for (const e of entradas) {
    const n = conTabla({});
    const r = await expandir(e, { fetch: n.fetch });
    eq('«' + (typeof e === 'string' ? e.slice(0, 44) : JSON.stringify(e)) + '»: DATO_INVALIDO y no se pidió nada', [r, n.llamadas.length], [NO_ES_MAPS, 0]);
  }

  /* Cada llamada devuelve un objeto nuevo, y no hay estado compartido. */
  const a = await expandir('', { fetch: conTabla({}).fetch });
  a.mensaje = 'tocado';
  eq('el resultado es un objeto nuevo en cada llamada', await expandir('', { fetch: conTabla({}).fetch }), NO_ES_MAPS);
  const varios = await Promise.all(Array.from({ length: 50 }, (_, i) => {
    const liga = 'https://maps.app.goo.gl/p' + i;
    return expandir(liga, { fetch: conTabla({ [liga]: 'https://www.google.com/maps/@20.' + i + ',-103.3,15z' }).fetch });
  }));
  eq('cincuenta a la vez no se mezclan', varios.map((r, i) => r.url === 'https://www.google.com/maps/@20.' + i + ',-103.3,15z'), Array(50).fill(true));
}

console.log('\n6. EXPANDIR · con las clases de verdad (Response y ReadableStream de la plataforma)');
{
  /* Lo que Deno y node entregan. Se construyen respuestas reales con 30x y se comprueba que el
     módulo lee `status`, `headers.get` y `body` de ellas igual que de los dobles. */
  const f1 = () => new Response(null, { status: 301, headers: { Location: 'https://maps.app.goo.gl/r2' } });
  const f2 = () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(300)); c.close(); } }), { status: 302, headers: { Location: LARGO } });
  let n = conTabla({ 'https://goo.gl/maps/r1': f1, 'https://maps.app.goo.gl/r2': f2 });
  eq('dos redirecciones reales, una con cuerpo', await expandir('https://goo.gl/maps/r1', { fetch: n.fetch }), { ok: true, url: LARGO });

  n = conTabla({ [CORTO]: () => new Response('<html>' + 'x'.repeat(200000) + '</html>', { status: 200 }) });
  eq('una página real que contesta 200: la misma liga', await expandir(CORTO, { fetch: n.fetch }), { ok: true, url: CORTO });

  n = conTabla({ [CORTO]: () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(64 * 1024)); } }), { status: 302, headers: { Location: LARGO } }) });
  eq('una redirección real con un cuerpo que nunca acaba: SIN_RED, y no se queda leyéndolo', await expandir(CORTO, { fetch: n.fetch, maxBytes: 100 * 1024 }), SIN_RED);

  n = conTabla({ [CORTO]: () => new Response(null, { status: 503 }) });
  eq('un 503 real', await expandir(CORTO, { fetch: n.fetch }), SIN_RED);
  n = conTabla({ [CORTO]: () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }) });
  eq('una redirección real a otro host', [await expandir(CORTO, { fetch: n.fetch }), n.urls()], [NO_ES_MAPS, [CORTO]]);
}

console.log('\n6. EXPANDIR · con el fetch REAL de node contra un servidor HTTP local (127.0.0.1, sin internet)');
{
  /* Los dobles de arriba dicen lo que el módulo hace con lo que se les ocurrió a quien los
     escribió. Esto comprueba lo que de verdad hace el `fetch` de la plataforma: que con
     `redirect:'manual'` entrega la 30x con su `Location` legible (y no una respuesta opaca),
     que cancelar el cuerpo suelta la conexión y que la señal corta una petición colgada.

     Un servidor de verdad contesta en nombre de Google: el `fetch` que se le inyecta al módulo
     solo cambia ADÓNDE conecta (a 127.0.0.1, por la ruta «/<host>/<camino>»), y antes de eso
     revisa, con el analizador estándar, que lo que se le pide sea de la lista. Las `Location`
     que el servidor manda siguen siendo ligas de Google, que el módulo valida como siempre. */
  const registro = { cerro: {}, escritos: {}, vistas: [] };
  const servidor = http.createServer((req, res) => {
    const partes = req.url.split('/');                          // ['', host, ...camino]
    const clave = partes[1] + '/' + partes.slice(2).join('/');
    registro.vistas.push(clave);
    const redirige = (estado, a) => { res.writeHead(estado, { Location: a, 'Content-Type': 'text/html' }); res.end('<html>Moved</html>'); };
    /* Un cuerpo que se escribe a chorros hasta que el cliente cuelga (o se acaban los 200 MB). */
    const chorro = (estado, cabeceras) => {
      res.writeHead(estado, cabeceras);
      let n = 0;
      const trozo = Buffer.alloc(1024 * 1024, 65);
      const t = setInterval(() => {
        if (res.destroyed || n >= 200) { clearInterval(t); if (!res.destroyed) res.end(); return; }
        n++; res.write(trozo); registro.escritos[clave] = n;
      }, 2);
      res.on('close', () => { clearInterval(t); registro.cerro[clave] = n; });
    };
    switch (clave) {
      case 'goo.gl/maps/dos': return redirige(301, 'https://maps.app.goo.gl/intermedio');
      case 'maps.app.goo.gl/intermedio': return redirige(302, 'https://www.google.com/maps?q=20.5230,-103.4470');
      case 'maps.app.goo.gl/malo': return redirige(302, 'https://maps.google.com:x@evil.example/');
      case 'maps.app.goo.gl/a-evil': return redirige(302, 'https://evil.example/x');
      case 'maps.app.goo.gl/enorme': return chorro(302, { Location: LARGO, 'Content-Type': 'text/html' });
      case 'maps.app.goo.gl/pagina': return chorro(200, { 'Content-Type': 'text/html' });
      case 'maps.app.goo.gl/503': res.writeHead(503); return res.end();
      /* Una redirección a OTRA ruta de este mismo servidor (no a Google de verdad): para que un fetch
         que siga solo no salga a internet. */
      case 'maps.app.goo.gl/sigue': return redirige(302, 'http://127.0.0.1:' + puerto + '/maps.app.goo.gl/destino-local');
      case 'maps.app.goo.gl/destino-local': res.writeHead(200); return res.end('ok');
      case 'goo.gl/bucle1': return redirige(302, 'https://maps.app.goo.gl/bucle2');
      case 'maps.app.goo.gl/bucle2': return redirige(302, 'https://goo.gl/bucle1');
      case 'maps.app.goo.gl/cuelga': req.on('close', () => { registro.cerro[clave] = true; }); return undefined;   // nunca contesta
      default: res.writeHead(404); return res.end();
    }
  });

  let puerto = 0;
  try {
    await new Promise((ok, no) => { servidor.once('error', no); servidor.listen(0, '127.0.0.1', ok); });
    puerto = servidor.address().port;
  } catch (e) {
    nota('no se pudo abrir un puerto local (' + (e && e.code) + '): se omite esta sección, y lo que prueba queda sin comprobar en esta máquina');
  }

  if (puerto) {
    const raras = [];
    const aLocal = (url, init) => {
      let u = null;
      try { u = new URL(url); } catch (_) { /* null */ }
      if (!u || u.protocol !== 'https:' || u.username || u.password || u.port || !EN_LISTA(u.hostname)) { raras.push(String(url)); throw new Error('petición rara: ' + url); }
      return fetch('http://127.0.0.1:' + puerto + '/' + u.hostname + u.pathname + u.search, init);   // el fetch REAL
    };
    const pedir = (liga, extra = {}) => expandir(liga, { fetch: aLocal, ...extra });

    let r = await pedir('https://goo.gl/maps/dos');
    eq('dos saltos con respuestas reales (301 y 302 con su Location)', r, { ok: true, url: 'https://www.google.com/maps?q=20.5230,-103.4470' });
    eq('  el servidor vio las dos ligas, en orden', registro.vistas, ['goo.gl/maps/dos', 'maps.app.goo.gl/intermedio']);

    registro.vistas.length = 0;
    r = await pedir('https://maps.app.goo.gl/malo');
    eq('el hueco del .gs servido como Location: DATO_INVALIDO', r, NO_ES_MAPS);
    r = await pedir('https://maps.app.goo.gl/a-evil');
    eq('y una Location a otro host', r, NO_ES_MAPS);
    eq('  el servidor solo vio las dos ligas de la persona y la petición rara no salió', [registro.vistas, raras], [['maps.app.goo.gl/malo', 'maps.app.goo.gl/a-evil'], []]);

    r = await pedir('https://goo.gl/bucle1');
    eq('un bucle de verdad', r, NO_ES_MAPS);
    r = await pedir('https://maps.app.goo.gl/503');
    eq('un 503 de verdad', r, SIN_RED);

    /* Un fetch que sigue redirecciones por su cuenta (alguien lo envolvió con `redirect:'follow'`):
       el de node marca `redirected` y el módulo no se fía. */
    const siguiendo = (url, init) => aLocal(url, { ...init, redirect: 'follow' });
    r = await expandir('https://maps.app.goo.gl/sigue', { fetch: siguiendo });
    eq('un fetch que sigue solo (redirect:follow) es SIN_RED: nadie revisó el salto', r, SIN_RED);
    r = await pedir('https://maps.app.goo.gl/sigue');
    eq('y con redirect:manual la misma ruta da la liga a donde manda (la del servidor local, que no es de Google)', r, NO_ES_MAPS);

    /* La redirección con un cuerpo de 200 MB: se lee hasta el tope y se cuelga. */
    r = await pedir('https://maps.app.goo.gl/enorme', { maxBytes: 64 * 1024 });
    eq('una redirección con un cuerpo gigante: SIN_RED', r, SIN_RED);
    await dormir(300);
    cierto('  y la conexión se soltó: el servidor sintió el cierre habiendo escrito ' + registro.cerro['maps.app.goo.gl/enorme'] + ' de 200 trozos',
           registro.cerro['maps.app.goo.gl/enorme'] !== undefined && registro.cerro['maps.app.goo.gl/enorme'] < 150);

    /* Una página que contesta 200 con un cuerpo gigante: no se lee. */
    r = await pedir('https://maps.app.goo.gl/pagina');
    eq('una página de 200 MB: la misma liga, sin descargarla', r, { ok: true, url: 'https://maps.app.goo.gl/pagina' });
    await dormir(300);
    cierto('  y el servidor sintió el cierre habiendo escrito ' + registro.cerro['maps.app.goo.gl/pagina'] + ' de 200 trozos',
           registro.cerro['maps.app.goo.gl/pagina'] !== undefined && registro.cerro['maps.app.goo.gl/pagina'] < 150);

    /* Una petición que nunca contesta: la señal la corta de verdad. */
    const t0 = Date.now();
    r = await pedir('https://maps.app.goo.gl/cuelga', { tiempoMs: 80 });
    eq('un servidor que no contesta: SIN_RED a tiempo (' + (Date.now() - t0) + ' ms)', r, SIN_RED);
    await dormir(200);
    eq('  y el servidor vio cortarse la petición (la señal llegó al fetch de verdad)', registro.cerro['maps.app.goo.gl/cuelga'], true);
    eq('  sin una sola petición rara en todo el apartado', raras, []);

    if (typeof servidor.closeAllConnections === 'function') servidor.closeAllConnections();
    await new Promise(ok => servidor.close(ok));
  }
}

console.log('\n6. EXPANDIR · el invariante, con Location generadas');
{
  /* Cada Location sale del mismo corpus (más formas relativas) y se sirve como primer salto de
     un acortador. Lo único que importa: la red de mentiras no recibe jamás una petición rara. */
  const locs = [...CORPUS.slice(0, 8000), '/' + BS + 'evil.example', '//evil.example', '/x', 'x', '?q=1', '#f', ''];
  let peticiones = 0, rarasTotal = 0, pedidasMas = 0;
  const ejemplos = [];
  for (const loc of locs) {
    const n = redQueSiempreContesta(url => (url === 'https://goo.gl/fz' ? redir(loc) : null));
    await expandir('https://goo.gl/fz', { fetch: n.fetch });
    peticiones += n.llamadas.length;
    if (n.llamadas.length > 1) pedidasMas++;
    if (n.raras.length) { rarasTotal += n.raras.length; if (ejemplos.length < 3) ejemplos.push([loc, n.raras]); }
  }
  nota(locs.length + ' Location generadas, ' + peticiones + ' peticiones en total, ' + pedidasMas + ' siguieron a un segundo salto');
  eq('ninguna petición rara', [rarasTotal, ejemplos], [0, []]);
  cierto('y el barrido sí llegó a seguir saltos (si no, no probaba nada)', pedidasMas > 50);
}

/* ===========================================================================
   7. EL MISMO CONTRATO QUE EL .gs, Y EL MISMO PIN EN EL CLIENTE DE VERDAD
   =========================================================================== */
console.log('\n7. EL CONTRATO: mismas respuestas que el .gs donde el .gs no tenía el hueco');
{
  for (const u of ['https://evil.example.com/x', 'http://169.254.169.254/latest/meta-data/', 'https://maps.app.goo.gl.evil.com/x', 'file:///etc/passwd', '',
                   'https://www.google.com.mx/maps', 'https://maps.google.com@evil.example/']) {
    const gs = cargarGs(fuenteGs, googleContesta(LARGO));
    const mio = await expandir(u, { fetch: conTabla({}).fetch });
    eq('«' + (u || '(vacío)').slice(0, 44) + '»: la misma respuesta, objeto por objeto', JSON.stringify(mio), JSON.stringify(gs.expandir(u)));
  }
  /* SIN_RED: Apps Script lanza cuando no hay red, y el .gs lo vuelve SIN_RED. */
  const gsSinRed = cargarGs(fuenteGs, () => { throw new Error('sin red'); });
  eq('sin red: la misma respuesta', JSON.stringify(await expandir(CORTO, { fetch: async () => { throw new Error('sin red'); } })), JSON.stringify(gsSinRed.expandir(CORTO)));
  /* Un salto a una página de Google: el .gs da `{ok:true,url:<Location>}`. */
  for (const destino of [LARGO, 'https://www.google.com/maps?q=20.5230,-103.4470', 'https://maps.google.com/?q=20.7214%2C-103.3918']) {
    const gs = cargarGs(fuenteGs, googleContesta(destino));
    const mio = await expandir(CORTO, { fetch: conTabla({ [CORTO]: destino }).fetch });
    eq('un salto a «' + destino.slice(0, 48) + '…»: la misma respuesta', JSON.stringify(mio), JSON.stringify(gs.expandir(CORTO)));
  }
  /* Sin redirección: el .gs devuelve la misma liga (`Location || u`). */
  const gsPlano = cargarGs(fuenteGs, googleContesta(''));
  eq('sin redirección: la misma liga, como en el .gs', JSON.stringify(await expandir(CORTO, { fetch: conTabla({ [CORTO]: { estado: 200 } }).fetch })), JSON.stringify(gsPlano.expandir(CORTO)));
  /* Y donde se aparta, a propósito. */
  const gs503 = cargarGs(fuenteGs, googleContesta(''));
  eq('un 503: el .gs dice «ok, la misma liga» (el cliente lo da por definitivo); maps.js dice SIN_RED', [gs503.expandir(CORTO).ok, (await expandir(CORTO, { fetch: conTabla({ [CORTO]: { estado: 503 } }).fetch })).codigo], [true, 'SIN_RED']);
}

console.log('\n7. EL CLIENTE DE VERDAD (Geo.resolverLink) — el mismo pin con el .gs de un salto que con maps.js de varios');
{
  const REDIRECCIONES = {
    [CORTO]: LARGO,
    'https://goo.gl/maps/dos': 'https://maps.app.goo.gl/intermedio',
    'https://maps.app.goo.gl/intermedio': 'https://www.google.com/maps?q=20.5230,-103.4470',
    'https://maps.app.goo.gl/busqueda': 'https://www.google.com/maps/search/Tacos+el+Guero',
    'https://maps.app.goo.gl/fuera': 'https://evil.example/x',
    'https://maps.app.goo.gl/camara': 'https://www.google.com/maps/place/Taller/@20.6597,-103.3496,17z',
  };
  const adaptadorDelGs = () => {
    const gs = cargarGs(fuenteGs, u => ({ getHeaders: () => (REDIRECCIONES[u] ? { Location: REDIRECCIONES[u] } : {}) }));
    return { llamar: async u => gs.expandir(u), pedidas: gs.pedidas };
  };
  const adaptadorDeMaps = () => {
    /* Una liga que no está en la tabla es una página: contesta 200, como el doble del .gs que no
       trae Location. (El cliente vuelve a preguntar con la última liga que recibió.) */
    const n = red(u => (REDIRECCIONES[u] ? redir(REDIRECCIONES[u]) : resp(200)));
    return { llamar: u => expandir(u, { fetch: n.fetch }), pedidas: n.llamadas, red: n };
  };
  const resumen = r => ({ ok: r.ok, motivo: r.motivo, codigo: r.codigo, lat: r.lat, lng: r.lng, fuente: r.fuente, exacta: r.exacta, url: r.url, largo: r.largo });

  for (const [que, liga, esperado] of [
    ['el corto de WhatsApp, un salto', CORTO, { ok: true, lat: 20.6551, lng: -103.3925, fuente: 'maps_pin' }],
    ['goo.gl → maps.app.goo.gl → página, dos saltos', 'https://goo.gl/maps/dos', { ok: true, lat: 20.523, lng: -103.447, fuente: 'maps_query' }],
    ['un corto que abre solo la cámara del mapa', 'https://maps.app.goo.gl/camara', { ok: true, lat: 20.6597, lng: -103.3496, fuente: 'maps_camara' }],
    ['un corto que abre una búsqueda sin coordenadas', 'https://maps.app.goo.gl/busqueda', { ok: false, motivo: 'sin_coord' }],
    ['un corto que lleva a un host que no es de Google', 'https://maps.app.goo.gl/fuera', { ok: false, motivo: 'sin_coord', codigo: 'DATO_INVALIDO' }],
  ]) {
    const a = adaptadorDelGs(), b = adaptadorDeMaps();
    const viejo = resumen(await resolverLink(liga, a.llamar));
    const nuevo = resumen(await resolverLink(liga, b.llamar));
    eq(que + ': el cliente saca lo mismo con las dos', nuevo, viejo);
    eq('  y es lo que se espera', Object.fromEntries(Object.entries(esperado).map(([k]) => [k, nuevo[k]])), esperado);
    nota(que + ': el .gs hizo ' + a.pedidas.length + ' petición(es) a Google, maps.js ' + b.pedidas.length);
    b.red && sinRaras('  y maps.js no pidió nada raro', b.red);
  }
  /* Sin red: el cliente lo deja pendiente con las dos. */
  const gsMudo = cargarGs(fuenteGs, () => { throw new Error('sin red'); });
  const viejo = resumen(await resolverLink(CORTO, async u => gsMudo.expandir(u)));
  const nuevo = resumen(await resolverLink(CORTO, u => expandir(u, { fetch: async () => { throw new Error('sin red'); } })));
  eq('sin red el cliente lo deja pendiente con las dos', [nuevo.motivo, nuevo.codigo, nuevo], [viejo.motivo, viejo.codigo, viejo]);
}

/* ===========================================================================
   8. EL MÓDULO NO USA NADA DE NODE
   =========================================================================== */
/* Los caracteres que no se ven: controles (menos tabulador y saltos de línea), DEL y los de
   0x80 a 0xA0, el guion blando, las marcas de dirección, los espacios de ancho cero, los
   separadores de línea y de párrafo, el BOM y, si se pide, las formas de ancho completo. Se
   mira el número y no se escribe una expresión regular con ellos: un carácter invisible dentro
   de otra expresión es justo el error que esto busca. */
const esInvisible = (c, tambienAnchoCompleto) => {
  const n = c.codePointAt(0);
  return (n < 32 && n !== 9 && n !== 10 && n !== 13) || (n >= 0x7f && n <= 0xa0) || n === 0xad || n === 0x61c || n === 0x180e ||
         (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff ||
         (tambienAnchoCompleto && n >= 0xff00 && n <= 0xffef);
};

console.log('\n8. SIN APIs EXCLUSIVAS DE NODE (corre igual en Deno)');
{
  const fuente = readFileSync(rutaMaps, 'utf8');
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  for (const [que, re] of [
    ['process', /\bprocess\b/], ['Buffer', /\bBuffer\b/], ['require', /\brequire\s*\(/], ['import', /(^|\n)\s*import\b|\bimport\s*\(/],
    ['node:', /node:/], ['fs', /\bfs\b/], ['Deno', /\bDeno\b/], ['globalThis', /\bglobalThis\b/], ['__dirname', /__dirname|__filename/],
    ['XMLHttpRequest', /XMLHttpRequest/], ['fetch global', /(^|[^.\w$])fetch\s*\(/],
  ]) {
    cierto('el código no menciona «' + que + '»', !re.test(sinComentarios));
  }
  const exportados = [...fuente.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  eq('exporta lo que dice el contrato', exportados.sort(), ['ACORTADORES', 'DOMINIOS_MAPS', 'LIMITES', 'esEnlaceDeMapas', 'expandir', 'validarEnlace']);

  /* Se corre en un contexto SIN `process`, `Buffer`, `require` ni `fetch`, con solo lo que
     Deno tiene: URL, AbortController y los temporizadores. */
  const desnudo = vm.createContext({ URL, AbortController, setTimeout, clearTimeout });
  eq('el contexto de prueba no tiene nada de node',
     vm.runInContext('[typeof process, typeof Buffer, typeof require, typeof fetch, typeof module].join()', desnudo),
     'undefined,undefined,undefined,undefined,undefined');
  const api = vm.runInContext(fuente.replace(/^export\s+/gm, '') + '\n;({ ' + exportados.join(', ') + ' })', desnudo);
  eq('corre sin nada de node: valida', [api.esEnlaceDeMapas(CORTO), api.esEnlaceDeMapas('https://maps.google.com:x@evil.example/')], [true, false]);
  eq('  y sigue el hueco del .gs a «credenciales»', api.validarEnlace('https://maps.google.com:x@evil.example/').motivo, 'credenciales');
  const n = conTabla({ 'https://goo.gl/maps/dos': 'https://maps.app.goo.gl/intermedio', 'https://maps.app.goo.gl/intermedio': LARGO });
  eq('  y expande', JSON.stringify(await api.expandir('https://goo.gl/maps/dos', { fetch: n.fetch })), JSON.stringify({ ok: true, url: LARGO }));
  eq('  y falla con SIN_RED sin lanzar', JSON.stringify(await api.expandir(CORTO, { fetch: async () => { throw new Error('x'); } })), JSON.stringify(SIN_RED));
  eq('  y con tiempo agotado', JSON.stringify(await api.expandir(CORTO, { fetch: () => new Promise(() => {}), tiempoMs: 30 })), JSON.stringify(SIN_RED));
  sinRaras('  y todo lo que pidió pasó la revisión independiente', n);

  /* El archivo no trae caracteres que no se ven: un U+00AD o un U+2028 dentro de una
     expresión regular es un error que nadie puede leer. */
  const invisibles = [...fuente].filter(c => esInvisible(c, false));
  eq('maps.js no trae caracteres invisibles ni separadores raros', invisibles.map(c => 'U+' + c.codePointAt(0).toString(16)), []);
  const delArchivoDePruebas = [...readFileSync(fileURLToPath(import.meta.url), 'utf8')].filter(c => esInvisible(c, true));
  eq('este archivo de pruebas tampoco (los casos raros se arman con su número)', delArchivoDePruebas.map(c => 'U+' + c.codePointAt(0).toString(16)), []);
}

console.log(fallos ? '\n' + fallos + ' FALLO(S) de ' + total : '\nTodo pasa. ' + total + ' comprobaciones.');
process.exit(fallos ? 1 : 0);
