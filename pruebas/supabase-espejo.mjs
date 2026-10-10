/* EL ESPEJO, CORRIENDO DE VERDAD. Sin Google, sin Supabase, en node.

   La hoja de Google queda como ESPEJO DE SOLO LECTURA de la base de datos (docs/DECISIONES-SUPABASE.md,
   Q-10 y Q-12). Son dos extremos y esta prueba corre los dos, y los corre JUNTOS:

     · la ruta `espejo` del Apps Script (puente/hoja-apps-script.gs), cargada en vm sobre la hoja de
       mentiras de pruebas/comun/ (la misma de pruebas/sincronizacion.mjs, con dos cosas más que se
       piden y no cambian nada si no se piden: `setNote` anota y `comoSheets` imita el apóstrofo);
     · la Edge Function (supabase/functions/espejo/) con sus dobles —una base que se porta como
       PostgREST, un `fetch` hacia la hoja que ES la hoja de mentiras, un reloj que se mueve solo—.

   Lo que se cuida, en este orden:
     1. El parche del /expandir: «https://maps.google.com:x@evil.example/» pasaba la lista blanca del .gs
        y UrlFetchApp conectaba a evil.example. Se reproduce con el código de antes y se cierra con el de ahora.
     2. Que las dos listas de columnas (la del .gs y la de la función) sean la misma, y que ninguna sea de fórmula.
     3. La puerta: secreto bueno, malo, ausente, corto; la misma respuesta siempre; en tiempo constante.
     4. Lo que la ruta escribe y lo que no: por folio y no por fila, solo columnas capturadas, solo lo que
        cambió, nunca una fórmula, nada parcial si no cabe, todo con el candado, con su marca y su bitácora.
     5. MODO_ESPEJO: con él los tres disparadores quedan inocuos; sin él, todo hace lo de siempre.
     6. La lógica pura de la función (cursor, solape, lotes) y su puerto a PostgREST.
     7. La función de punta a punta contra la ruta de verdad: el cursor solo avanza tras la confirmación,
        reintenta, aparta lo que la hoja rechaza, se detiene con CAPACIDAD_AGOTADA sin perder nada, y la
        reconciliación completa corrige lo que ningún cursor ve.

   Se corre con pruebas/correr.sh, como todas. Todas las claves de aquí son FALSAS y dicen que lo son. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';
import * as E from '../supabase/functions/_shared/espejo.js';
import { crearBaseEspejo, ErrorDeBase } from '../supabase/functions/espejo/base.js';
import {
  manejar, sincronizar, leerConfig, direccionDeLaHoja, estadoDelEspejo, respuestaDe, VARIABLES, CABECERA_SECRETO,
} from '../supabase/functions/espejo/handler.js';

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

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaGs = join(aqui, '..', 'puente', 'hoja-apps-script.gs');
const fuenteGs = readFileSync(rutaGs, 'utf8');

/* Claves de mentiras. Ninguna es una clave de verdad ni se parece a una. */
const SECRETO_HOJA = 'PRUEBA-FALSA-secreto-de-la-hoja-0123456789-NO-ES-REAL';
const SECRETO_FUNCION = 'PRUEBA-FALSA-secreto-de-la-funcion-9876543210-NO-ES-REAL';
const LLAVE_SERVICIO = 'PRUEBA-FALSA-llave-de-servicio-de-la-base-NO-ES-REAL';
const URL_HOJA = 'https://script.google.com/macros/s/AKfycbPRUEBA-FALSA-0123456789abcdef/exec';
const URL_BASE = 'https://prueba-falsa.supabase.test';
const TODOS_LOS_SECRETOS = [SECRETO_HOJA, SECRETO_FUNCION, LLAVE_SERVICIO];

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ===========================================================================
   1. EL PARCHE DEL /expandir
   =========================================================================== */
console.log('\n1. EL PARCHE DEL /expandir — el hueco reproducido y cerrado, cargando el .gs en vm');
{
  /* El .gs de antes, reconstruido: la línea nueva se cambia por la vieja. Sirve para demostrar que la prueba
     SÍ ve el hueco (si el código de antes ya lo cerrara, esta sección no probaría nada). */
  const LINEA_NUEVA = String.raw`var m = /^https?:\/\/([a-z0-9.-]+)(?=[\/?#]|$)/i.exec(u);`;
  const LINEA_VIEJA = String.raw`var m = /^https?:\/\/([^\/:?#]+)/i.exec(u);`;
  cierto('el .gs trae la línea nueva de expandirLiga_ (extrae el host con [a-z0-9.-] y exige «/», «?», «#» o el final)', fuenteGs.includes(LINEA_NUEVA));
  cierto('y ya no trae la vieja', !fuenteGs.includes(LINEA_VIEJA));
  const fuenteVieja = fuenteGs.replace(LINEA_NUEVA, LINEA_VIEJA);
  cierto('el .gs de antes (reconstruido) cambia exactamente esa línea', fuenteVieja !== fuenteGs && fuenteVieja.split(LINEA_VIEJA).length === 2);

  const LARGO = 'https://www.google.com/maps/place/Expo/@20.6543,-103.3901,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d20.6551!4d-103.3925';
  /* Una copia viva del .gs con un `UrlFetchApp` que anota cada dirección que le piden. */
  function cargar(fuente) {
    const pedidas = [];
    const ctx = vm.createContext({
      UrlFetchApp: { fetch(u) { pedidas.push(u); return { getHeaders: () => ({ Location: LARGO }) }; } },
      console,
    });
    vm.runInContext(fuente, ctx);
    return {
      pedidas,
      expandir(u) { ctx.__u = u; return JSON.parse(vm.runInContext('JSON.stringify(rutaExpandir_({ u: __u }))', ctx)); },
      lista: () => JSON.parse(vm.runInContext('JSON.stringify(DOMINIOS_MAPS)', ctx)),
    };
  }
  const hostReal = u => { try { return new URL(u).hostname.replace(/\.$/, ''); } catch (_) { return null; } };
  const gsNuevo = () => cargar(fuenteGs);
  const gsViejo = () => cargar(fuenteVieja);
  const LISTA = gsNuevo().lista();
  eq('la lista blanca es la de siempre, seis dominios, sin tocar', LISTA,
     ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com', 'g.co']);

  /* ── lo malicioso: el de antes lo deja pasar, el de ahora no sale a ningún lado ── */
  const MALOS = [
    'https://maps.google.com:x@evil.example/',                                   // el hallazgo
    'https://maps.google.com:@evil.example/',
    'https://maps.google.com:443@evil.example/',
    'https://www.google.com:x@169.254.169.254/latest/meta-data/',                // el servicio de metadatos de la nube
    'https://goo.gl:x@localhost:8080/admin',
    'https://maps.app.goo.gl:pass@evil.example:8443/x',
    'http://maps.google.com:x@evil.example/',
    'HTTPS://MAPS.GOOGLE.COM:x@EVIL.EXAMPLE/',
  ];
  for (const u of MALOS) {
    const v = gsViejo(); const rv = v.expandir(u);
    const n = gsNuevo(); const rn = n.expandir(u);
    cierto('antes: «' + u + '» pasaba la lista y se pedía a «' + hostReal(v.pedidas[0]) + '»',
           rv.ok === true && v.pedidas.length === 1 && !LISTA.includes(hostReal(v.pedidas[0])));
    eq('ahora: la rechaza sin pedir nada', [rn.ok, rn.codigo, n.pedidas.length], [false, 'DATO_INVALIDO', 0]);
  }

  /* ── lo que no es del «:x@» pero también debe quedar fuera: credenciales, puertos, caracteres raros ── */
  const FUERA = [
    'https://user:pass@maps.google.com/', 'https://user@www.google.com/maps', 'https://maps.google.com@evil.example/',
    'https://evil.example@maps.google.com/', 'https://a@b@maps.google.com/', 'https://@maps.google.com/',
    'https://maps.google.com:8443/maps', 'https://maps.google.com:80/maps', 'https://maps.google.com:/maps',
    'https://maps.google.com:443/maps',                                          // el puerto explícito, aunque sea el de siempre: se rechaza
    'https://maps.google.com\\@evil.example/', 'https://maps.google.com\\.evil.example/',
    'https://maps.google.com%2eevil.example/', 'https://maps.google.com%40evil.example/',
    'https://maps.google.com\t.evil.example/', 'https://maps.google.com\n.evil.example/',
    'https://maps.google.com .evil.example/', 'https://maps.google.com_evil/', 'https://maps.google.com;evil.example/',
    'https://maps.google.com.evil.example/', 'https://maps.app.goo.gl.evil.com/x', 'https://evilmaps.google.com/',
    'https://evil.maps.google.com/', 'https://maps.google.com./maps', 'https://[::1]/', 'https://127.0.0.1/',
    'https://0x7f000001/', 'https://2130706433/', 'https://maps.gооgle.com/',      // la «о» es cirílica
    'https://maps.google.com：x@evil.example/',                                    // los dos puntos de ancho completo
    'file:///etc/passwd', 'ftp://maps.google.com/', 'javascript:alert(1)', '//maps.google.com/', 'maps.google.com', '', '   ',
  ];
  const aceptadasDeMas = FUERA.filter(u => { const n = gsNuevo(); return n.expandir(u).ok === true || n.pedidas.length > 0; });
  eq('el .gs de ahora no acepta ninguna de las ' + FUERA.length + ' direcciones que no son un enlace limpio de Maps', aceptadasDeMas, []);

  /* ── lo legítimo: lo que se aceptaba, se sigue aceptando, y con el mismo resultado ── */
  const BUENOS = [
    'https://maps.app.goo.gl/AbCdEf123', 'https://maps.app.goo.gl/AbCdEf123?g_st=ic', 'https://goo.gl/maps/abcdEFGH1234',
    LARGO, 'https://www.google.com/maps?q=20.5230,-103.4470', 'https://www.google.com/maps/search/?api=1&query=20.67%2C-103.34',
    'https://maps.google.com/?q=20.7214%2C-103.3918', 'https://maps.google.com', 'https://maps.google.com?q=1', 'https://maps.google.com#x',
    'https://g.co/kgs/abc123', 'https://google.com/maps', 'https://www.google.com/maps/@20.6,-103.3,15z', 'http://maps.app.goo.gl/x',
    'http://goo.gl/maps/x', 'HTTPS://MAPS.GOOGLE.COM/maps', 'https://Maps.Google.Com/maps', '  https://maps.app.goo.gl/x  ',
    'https://maps.app.goo.gl/' + 'a'.repeat(300),
  ];
  const cambian = [];
  for (const u of BUENOS) {
    const v = gsViejo(); const rv = v.expandir(u);
    const n = gsNuevo(); const rn = n.expandir(u);
    if (JSON.stringify(rv) !== JSON.stringify(rn) || JSON.stringify(v.pedidas) !== JSON.stringify(n.pedidas) || rn.ok !== true) cambian.push(u);
  }
  eq('las ' + BUENOS.length + ' ligas buenas dan lo mismo que antes (respuesta y dirección pedida)', cambian, []);
  eq('y el contrato de la respuesta no cambia: {ok, url}', gsNuevo().expandir('https://maps.app.goo.gl/x'), { ok: true, url: LARGO });
  eq('y el de «no es Maps»', gsNuevo().expandir('https://evil.example/'), { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo se siguen ligas de Google Maps.' });
  eq('y el de «sin red» (UrlFetchApp que lanza)', (() => {
    const ctx = vm.createContext({ UrlFetchApp: { fetch() { throw new Error('sin red'); } }, console });
    vm.runInContext(fuenteGs, ctx);
    return JSON.parse(vm.runInContext('JSON.stringify(rutaExpandir_({ u: "https://maps.app.goo.gl/x" }))', ctx));
  })(), { ok: false, codigo: 'SIN_RED', mensaje: 'No se pudo seguir la liga.' });
  nota('cambio deliberado: «https://maps.google.com:443/…» (puerto explícito, aunque sea el de siempre) ya no pasa; nadie comparte una liga de Maps así');

  /* ── el invariante, con un corpus generado: si el .gs sale a la red, el host de verdad es de la lista ── */
  let semilla = 20261010;
  const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
  const de = a => a[Math.floor(azar() * a.length)];
  const CORPUS = [];
  const usuarios = ['', '', '', 'a@', 'maps.google.com:x@', ':@', '@', 'maps.google.com@', 'evil.example@', 'evil.example:443@', 'x:y@', '%40@', 'goo.gl:@'];
  const hosts = [...LISTA, ...LISTA, 'evil.example', 'maps.google.com.evil.example', 'evilmaps.google.com', 'foo.google.com', 'google.com..', '169.254.169.254', 'localhost'];
  const puertos = ['', '', '', '', ':443', ':80', ':8443', ':x', ':'];
  const restos = ['', '/', '/maps/place/x', '?q=1', '#f', '/x@evil.example', '/\\@evil.example', '@evil.example/', ':x@evil.example/', '%2f', '\t', '\n'];
  for (let i = 0; i < 12000; i++) CORPUS.push(de(['http://', 'https://', 'https://', 'HTTPS://']) + de(usuarios) + de(hosts) + de(puertos) + de(restos));
  const violaciones = fuente => {
    const g = cargar(fuente); const malas = [];
    for (const s of CORPUS) {
      g.pedidas.length = 0; g.expandir(s);
      if (g.pedidas.length) {
        const u = (() => { try { return new URL(g.pedidas[0]); } catch (_) { return null; } })();
        if (u && (!LISTA.includes(u.hostname.replace(/\.$/, '')) || u.username || u.password || u.port)) malas.push(g.pedidas[0]);
      }
    }
    return malas;
  };
  const vieja = violaciones(fuenteVieja), nueva = violaciones(fuenteGs);
  nota(CORPUS.length + ' entradas: el .gs de antes sale a un host de afuera (o con credenciales o puerto) en ' + vieja.length + '; el de ahora, en ' + nueva.length);
  cierto('con el código de antes el corpus SÍ encuentra el hueco (la prueba lo ve)', vieja.length > 0);
  eq('con el de ahora, jamás sale a un host que no sea de la lista, ni con usuario, ni con puerto', nueva, []);
}

/* ===========================================================================
   LA HOJA DE MENTIRAS, ARMADA PARA EL ESPEJO
   =========================================================================== */

const colDe = s => s.split('').reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0);
const letraDe = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const FORMULAS = [8, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];              // H, K y O:X
const CAPTURADAS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const dia = (a, m, d) => new Date(a, m - 1, d).getTime();

/* Una hoja de Ventas con las 35 columnas del puente (con los encabezados que hacen que el .gs las reconozca),
   «Abonos comisión» y la «Bitácora del puente» —que en la hoja viva ya existe—, y MODO_ESPEJO y el secreto puestos. */
function hoja({ modo = true, secreto = SECRETO_HOJA, sellos = false, bitacora = true, columnas = 35, props = {}, tokens = {} } = {}) {
  const p = { ...(modo ? { MODO_ESPEJO: 'si' } : {}), ...(secreto ? { ESPEJO_SECRETO: secreto } : {}), ...(sellos ? { ESPEJO_SELLOS: 'si' } : {}), ...props };
  const H = hojaDeMentiras({ columnas, comoSheets: true, props: p, tokens });
  for (const n of ['Proyecto', 'Telefono', 'Entrega', 'Notas', 'Plazo taller', 'Sellos']) if (H.C[n] <= columnas) H.v._g[1][H.C[n]] = n;
  H.abonos = H.ss.getSheetByName('Abonos comisión');
  H.bit = bitacora ? H.ss.insertSheet('Bitácora del puente') : null;
  /* La de la hoja viva ya tiene su encabezado: la primera anotación cae en el renglón 2, no en el 1. */
  if (H.bit) ['Cuándo', 'Rol', 'Folio', 'Fila', 'Qué escribió', 'Nota'].forEach((t, i) => { H.bit._g[1][i + 1] = t; });
  H.lote = (lote, extra = {}) => H.doPost(JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, lote, ...extra }));
  return H;
}

/* Una fila como la entrega la vista espejo_ventas: las llaves son las del diseño. */
const venta = (folio, o = {}) => ({
  a_folio: folio, b_proyecto: 'Ana - Café ' + folio, c_estatus: 'COBRANDO', d_cuenta: 'Rul HSBC', e_tipo: 'Letras 3D con iluminacion',
  f_iva: 'Sí', g_subtotal: 10000, i_anticipo: 5800, j_liquidacion: 0, l_fecha_anticipo: '2026-10-01', m_fecha_instalacion: '2026-10-20',
  n_fecha_liquidacion: null, y_folio_cotizacion: 'COT-' + folio.slice(2) + '@K7QM', z_etapa: 'Ganado', aa_hora: '10:00:00',
  ab_ubicacion: '20.6736,-103.344', ac_direccion: 'Av. Vallarta 1', ad_pct: 10, ae_telefono: '+52 1 33 1000 0000',
  af_entrega: 'Instalación', ag_notas: 'Pedir medidas', ah_plazo: '2 semanas', ai_sellos: '{"Etapa de obra":1760000000000}', ...o,
});
const grupo = (folio, abonos) => ({ a_folio: folio, abonos });
const abono = (c, d = '2026-10-05', e = '', f = null) => ({ c_importe: c, d_fecha: d, e_nota: e, f_pago: f });

/* Una fila escrita a mano en la hoja, con lo que Sheets guardaría: fechas como Date, la hora como texto. */
function ponFila(H, fila, it) {
  for (const [llave, col] of E.COLUMNAS_VENTAS) {
    if (!(llave in it)) continue;
    let x = it[llave];
    if (x === null) x = '';
    if (/^[lmn]_fecha/.test(llave) && x) { const [a, m, d] = x.split('-').map(Number); x = new Date(a, m - 1, d); }
    if (llave === 'aa_hora' && x) x = String(x).slice(0, 5);
    H.v._g[fila][col] = x;
  }
}
const quitarFila = (H, fila) => { for (let c = 1; c <= 35; c++) H.v._g[fila][c] = ''; };
/* Valores marcados en las columnas de fórmula: si el espejo las tocara, se vería. */
function centinelas(H, hasta = 310) {
  for (let r = 2; r <= hasta; r++) for (const c of FORMULAS) H.v._g[r][c] = 'F' + c + 'r' + r;
  H.abonos._g[2][2] = '=ARRAYFORMULA(NOMBRE)';       // la B de «Abonos comisión»
  for (let r = 3; r <= 12; r++) H.abonos._g[r][2] = 'B' + r;
}
const formulasDe = H => JSON.stringify([H.v._g.map(r => FORMULAS.map(c => r[c])), H.abonos._g.map(r => r[2])]);
/* La hoja entera como queda: valores, formatos, notas y bitácora. Para probar que NO se escribió nada. */
const foto = H => JSON.stringify({ v: H.v._g, vf: H.v._f, a: H.abonos._g, af: H.abonos._f, b: H.bit ? H.bit._g : null, n: [H.v._notas, H.abonos._notas], c: H.v._g[1].length });

/* Todo lo que se le escribe a la hoja, en orden: lo que pasa por setValue, setValues, setNumberFormat y setNote. */
function espiar(H) {
  const log = [];
  for (const h of [H.v, H.abonos, H.bit].filter(Boolean)) {
    const original = h.getRange;
    h.getRange = (...a) => {
      const R = original(...a);
      const geo = typeof a[0] === 'string' ? {} : { fila: a[0], col: a[1], n: a[2] || 1, m: a[3] || 1 };
      for (const m of ['setValue', 'setValues', 'setNumberFormat', 'setNote']) {
        const f = R[m];
        R[m] = (...x) => { log.push({ hoja: h.getName(), op: m, ...geo, arg: x[0] }); return f(...x); };
      }
      return R;
    };
  }
  return log;
}
/* Las escrituras de DATOS: ni la nota, ni la marca de la columna 36, ni la bitácora. */
const escrituras = log => log.filter(x => (x.op === 'setValue' || x.op === 'setValues') && x.hoja !== 'Bitácora del puente' && !(x.hoja === 'Ventas' && (x.col >= 36 || x.fila === 1)));
/* Las celdas de datos que cambiaron entre dos fotos (no cuenta la columna 36 de Ventas: es la marca de sincronización). */
const celdasQueCambiaron = (a, b) => {
  const A = JSON.parse(a), B = JSON.parse(b), out = [];
  for (const [nombre, hojaA] of [['v', A.v], ['a', A.a]]) {
    hojaA.forEach((fila, r) => fila.forEach((x, c) => {
      if (nombre === 'v' && c >= 36) return;
      if (JSON.stringify(x) !== JSON.stringify(B[nombre][r][c])) out.push(nombre + ':' + r + ':' + c);
    }));
  }
  return out;
};
const filaDeVenta = (H, folio) => H.fila(folio);
const leer = (H, folio, nombre) => H.celda(folio, nombre);
const abonosDe = (H, folio) => {
  const out = [];
  for (let r = 2; r <= 2000; r++) {
    const f = H.abonos._g[r];
    if (String(f[1]).trim().toUpperCase() !== folio) continue;
    const d = f[4];
    out.push([f[3], d && typeof d.getTime === 'function' ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : d, f[5], f[6], r]);
  }
  return out;
};
/* La hora como la deja Sheets cuando ya la volvió hora: el Date del día cero de Sheets (30/12/1899), en la zona de la hoja. */
const partesEn = (d, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
function horaComoSheets(texto, tz = 'America/Mexico_City') {
  const [h, m] = texto.split(':').map(Number);
  const supuesto = Date.UTC(1899, 11, 30, h, m, 0);
  const p = partesEn(new Date(supuesto), tz);
  return new Date(supuesto - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - supuesto));
}

/* ===========================================================================
   2. LAS COLUMNAS
   =========================================================================== */
console.log('\n2. LAS COLUMNAS — la del .gs y la de la función son la misma, y ninguna es de fórmula');
{
  const H = hoja();
  const delGs = H.run('espejoColumnasVentas_()');
  eq('espejoColumnasVentas_() del .gs es COLUMNAS_VENTAS de la función: mismas llaves, mismas columnas, mismo orden', delGs, E.COLUMNAS_VENTAS);
  const cols = delGs.map(c => c[1]);
  eq('ninguna es de fórmula (H, K ni O a X)', cols.filter(c => FORMULAS.includes(c)), []);
  eq('COLUMNAS_FORMULA de la función son H, K y O:X', E.COLUMNAS_FORMULA.map(colDe), FORMULAS);
  const bloques = H.run('bloquesCapturados(35)');
  eq('los bloques capturados del .gs son A:G, I:J, L:N y Y:AI', bloques, [[1, 7], [9, 10], [12, 14], [25, 35]]);
  eq('las columnas de la lista son EXACTAMENTE las capturadas: ninguna de más, ninguna de menos', [...cols].sort((a, b) => a - b), CAPTURADAS);
  for (const [llave, col] of delGs) if (llave.split('_')[0].toUpperCase() !== letraDe(col)) mal('«' + llave + '» no lleva la letra de su columna (' + letraDe(col) + ')');
  bien('cada llave empieza con la letra de su columna (a_folio = A, b_proyecto = B, … ai_sellos = AI)');
  eq('el .gs tiene un tipo para cada llave (ESPEJO_TIPOS)', H.run('Object.keys(ESPEJO_TIPOS)'), delGs.map(c => c[0]));
  eq('las posiciones salen de COL: moverlas allá las mueve acá', delGs.filter(([llave, col]) => llave !== 'a_folio' && !Object.values(H.C).includes(col)), []);
  eq('las columnas de la vista de abonos que se mandan son C, D, E y F (la B es el VLOOKUP del nombre)', E.COLUMNAS_ABONO, ['c_importe', 'd_fecha', 'e_nota', 'f_pago']);
  cierto('las listas de la función están congeladas', Object.isFrozen(E.COLUMNAS_VENTAS) && Object.isFrozen(E.COLUMNAS_VENTAS[0]) && Object.isFrozen(E.COLUMNAS_FORMULA) && Object.isFrozen(E.FLUJOS));
  eq('el .gs conoce las mismas letras de fórmula', H.run('ESPEJO_FORMULAS_VENTAS'), E.COLUMNAS_FORMULA);
  /* Una fila de la vista, a lo que viaja: solo las columnas capturadas. */
  const deLaVista = { empresa_id: 'al3d', updated_at: '2026-10-10T10:00:00.123456+00:00', dinero_updated_at: '2026-10-10T10:00:01+00:00', ...venta('V-001'), h_neto: 11600, x_revisar: '' };
  eq('de una fila de la vista solo viajan las columnas capturadas (ni empresa, ni horas, ni una fórmula)', Object.keys(E.filaDeVentas(deLaVista)), E.COLUMNAS_VENTAS.map(c => c[0]));
  eq('una llave que la vista no trae se omite (la ruta no toca esa columna); un null viaja y borra', (() => { const { ad_pct, ...sin } = venta('V-001', { ag_notas: null }); return E.filaDeVentas(sin); })().hasOwnProperty('ad_pct') + '/' + E.filaDeVentas(venta('V-001', { ag_notas: null })).ag_notas, 'false/null');
}

/* ===========================================================================
   3. LA PUERTA
   =========================================================================== */
console.log('\n3. LA PUERTA — un secreto compartido, la misma respuesta siempre y en tiempo constante');
{
  const TOKEN_DIR = 'd'.repeat(40);
  const base = () => hoja({ tokens: { [TOKEN_DIR]: 'direccion' } });
  const sinToken = base().doPost(JSON.stringify({ ruta: 'empujar' }));
  eq('lo que la puerta le contesta a quien no trae token (la referencia)', [sinToken.ok, sinToken.codigo], [false, 'ROL_SIN_PERMISO']);
  const lote = { ventas: [venta('V-001')] };
  const largo = SECRETO_HOJA.length;
  const INTENTOS = [
    ['sin secreto', {}], ['secreto vacío', { secreto: '' }], ['otro secreto', { secreto: 'otro' }],
    ['el secreto con la última letra cambiada', { secreto: SECRETO_HOJA.slice(0, -1) + 'X' }],
    ['el secreto con la primera letra cambiada', { secreto: 'X' + SECRETO_HOJA.slice(1) }],
    ['el secreto con una letra de menos', { secreto: SECRETO_HOJA.slice(0, -1) }],
    ['el secreto con una letra de más', { secreto: SECRETO_HOJA + 'x' }],
    ['el secreto en minúsculas', { secreto: SECRETO_HOJA.toLowerCase() }],
    ['el secreto con un espacio al final', { secreto: SECRETO_HOJA + ' ' }],
    ['un número', { secreto: 123456789 }], ['un arreglo', { secreto: [SECRETO_HOJA] }], ['un objeto', { secreto: { valor: SECRETO_HOJA } }],
    ['null', { secreto: null }], ['verdadero', { secreto: true }],
    ['el secreto en otra llave (token)', { token: SECRETO_HOJA }], ['el secreto en google_token', { google_token: SECRETO_HOJA }],
    ['el token de dispositivo de Dirección, sin secreto', { token: TOKEN_DIR }],
    ['el token de dispositivo en el lugar del secreto', { secreto: TOKEN_DIR }],
  ];
  for (const [que, extra] of INTENTOS) {
    const H = base(); const log = espiar(H); const antes = foto(H);
    const r = H.doPost(JSON.stringify({ ruta: 'espejo', ...extra, lote }));
    eq(que + ': contesta lo mismo que a quien no trae token (letra por letra), sin pistas', r, sinToken);
    cierto('  y no se tocó nada: ni una escritura, ni una nota, ni la bitácora', log.length === 0 && foto(H) === antes);
  }
  /* La propiedad del script: sin ella, o corta, nadie entra —ni con el valor «correcto»—. */
  for (const [que, props, dado] of [
    ['sin la propiedad ESPEJO_SECRETO', { secreto: '' }, SECRETO_HOJA],
    ['sin la propiedad y con secreto vacío (« » = « »)', { secreto: '' }, ''],
    ['con la propiedad de 31 caracteres, aunque se mande igual', { secreto: 'x'.repeat(31) }, 'x'.repeat(31)],
    ['con la propiedad de 5 caracteres, aunque se mande igual', { secreto: 'corta' }, 'corta'],
    ['con la propiedad en blanco', { secreto: '   ' }, '   '],
  ]) {
    const H = hoja(props); const log = espiar(H); const antes = foto(H);
    const r = H.doPost(JSON.stringify({ ruta: 'espejo', secreto: dado, lote }));
    eq(que + ': la misma respuesta, y nada escrito', [r, log.length === 0 && foto(H) === antes], [sinToken, true]);
  }
  {
    const H = hoja({ secreto: 'x'.repeat(32) }); const r = H.doPost(JSON.stringify({ ruta: 'espejo', secreto: 'x'.repeat(32), lote }));
    eq('con la propiedad de exactamente 32 caracteres sí entra', r.ok, true);
  }
  {
    const H = base(); const r = H.lote(lote);
    eq('con el secreto bueno y SIN token de dispositivo ni sesión de Google entra: no depende de los teléfonos', [r.ok, leer(H, 'V-001', 'Proyecto')], [true, 'Ana - Café V-001']);
  }
  {
    /* El secreto solo sirve en esta ruta, y el token de un teléfono no sirve en ésta. */
    const H = base();
    eq('el secreto del espejo NO abre /jalar', H.doPost(JSON.stringify({ ruta: 'jalar', token: SECRETO_HOJA })), sinToken);
    eq('ni /empujar', H.doPost(JSON.stringify({ ruta: 'empujar', token: SECRETO_HOJA, ops: [] })), sinToken);
    const conToken = H.doPost(JSON.stringify({ ruta: 'salud', token: TOKEN_DIR }));
    eq('y el token de Dirección sigue abriendo /salud, como siempre', [conToken.ok, conToken.rol], [true, 'direccion']);
  }
  {
    const H = hoja();
    eq('un GET no llega a ninguna parte (doGet no cambió)', H.run('doGet()'), JSON.stringify({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Este puente solo atiende POST.' }));
  }

  /* ── tiempo constante ── */
  const H = hoja();
  const contar = (a, b) => H.run('(function () { var n = 0, o = String.prototype.charCodeAt; String.prototype.charCodeAt = function (i) { n++; return o.call(this, i); };' +
    ' try { espejoIgual_(' + JSON.stringify(a) + ', ' + JSON.stringify(b) + '); } finally { String.prototype.charCodeAt = o; } return n; })()');
  const S = SECRETO_HOJA;
  const cuentas = [
    ['igual', contar(S, S)], ['difiere en la primera letra', contar(S, 'X' + S.slice(1))],
    ['difiere en la última', contar(S, S.slice(0, -1) + 'X')], ['difiere en todas', contar(S, 'X'.repeat(largo))],
    ['difiere en la de en medio', contar(S, S.slice(0, 20) + 'X' + S.slice(21))],
  ];
  eq('espejoIgual_ lee cada posición del texto más largo AUNQUE ya haya una diferencia: mismo trabajo se parezca o no',
     [...new Set(cuentas.map(c => c[1]))].length, 1);
  nota('lecturas de caracteres por comparación (' + cuentas.map(c => c[0] + ': ' + c[1]).join(' · ') + ')');
  cierto('con textos de distinto largo recorre el más largo (no se sale en cuanto uno se acaba)', contar(S, S + 'x') === contar(S + 'x', S) && contar(S, S + 'x') > contar(S, S));
  eq('espejoIgual_ da lo esperado: iguales, distintos, vacíos y no-texto', [
    H.run('espejoIgual_("abc", "abc")'), H.run('espejoIgual_("abc", "abd")'), H.run('espejoIgual_("abc", "ab")'), H.run('espejoIgual_("", "")'),
    H.run('espejoIgual_("", "a")'), H.run('espejoIgual_(null, "")'), H.run('espejoIgual_(undefined, undefined)'), H.run('espejoIgual_("año", "año")'),
    H.run('espejoIgual_("año", "ano")'), H.run('espejoIgual_(12, "12")'),
  ], [true, false, false, true, false, true, true, true, false, true]);
  /* El secreto nunca se compara con ===, ==, indexOf ni localeCompare. El único `=== 0` es el de «no hubo diferencia». */
  const fn = nombre => H.run(nombre + '.toString()');
  const igual = fn('espejoIgual_'), autent = fn('espejoAutenticado_'), ruta = fn('rutaEspejo_');
  cierto('espejoIgual_ no devuelve nada hasta después del ciclo (no hay un return que corte antes)', (igual.match(/\breturn\b/g) || []).length === 1);
  cierto('ni usa ==, ===, indexOf, includes, startsWith ni localeCompare sobre los textos', !/(?:\ba\b|\bb\b)\s*[!=]==?\s*(?:\ba\b|\bb\b)|indexOf|includes|startsWith|localeCompare/.test(igual));
  cierto('espejoAutenticado_ compara ANTES de mirar el largo (no hay camino corto para «no hay secreto»)', autent.indexOf('espejoIgual_(') > -1 && autent.indexOf('espejoIgual_(') < autent.indexOf('ESPEJO_SECRETO_MIN'));
  cierto('y rutaEspejo_ no compara el secreto por su cuenta', !/secreto\s*[!=]==?/.test(ruta) && /espejoAutenticado_\(cuerpo\)/.test(ruta));
  /* Y la misma comparación de la función. */
  const cuenta2 = (a, b) => { let n = 0; const o = String.prototype.charCodeAt; String.prototype.charCodeAt = function (i) { n++; return o.call(this, i); }; try { E.igualesEnTiempoConstante(a, b); } finally { String.prototype.charCodeAt = o; } return n; };
  eq('igualesEnTiempoConstante (la de la función) hace el mismo trabajo se parezcan o no', [...new Set([cuenta2(S, S), cuenta2(S, 'X' + S.slice(1)), cuenta2(S, S.slice(0, -1) + 'X'), cuenta2(S, 'Y'.repeat(largo))])].length, 1);
  const cuenta3 = (dado, esperado) => { let n = 0; const o = String.prototype.charCodeAt; String.prototype.charCodeAt = function (i) { n++; return o.call(this, i); }; try { E.secretoValido(dado, esperado); } finally { String.prototype.charCodeAt = o; } return n; };
  eq('y secretoValido —la que de verdad usa la puerta de la función— también: mismo trabajo se parezca o no, y aunque no haya secreto configurado', [...new Set([cuenta3(S, S), cuenta3('X' + S.slice(1), S), cuenta3(S.slice(0, -1) + 'X', S), cuenta3('Y'.repeat(largo), S)])].length, 1);
  eq('  (sin secreto configurado recorre lo que mandaron, no sale antes)', cuenta3(S, '') > 0, true);
  eq('y secretoValido exige el largo mínimo aunque sean iguales', [E.secretoValido(S, S), E.secretoValido('x'.repeat(31), 'x'.repeat(31)), E.secretoValido('', ''), E.secretoValido(S, undefined), E.secretoValido(undefined, undefined)], [true, false, false, false, false]);
}

/* Lo último que se le escribió a una celda (lo que se le pasó a setValue o a setValues), o undefined. */
const escritoEn = (log, hojaNombre, fila, col) => {
  let v;
  for (const x of log) {
    if ((x.op !== 'setValue' && x.op !== 'setValues') || x.hoja !== hojaNombre) continue;
    if (x.op === 'setValue') { if (x.fila === fila && x.col === col) v = x.arg; }
    else for (let i = 0; i < x.n; i++) for (let j = 0; j < x.m; j++) if (x.fila + i === fila && x.col + j === col) v = x.arg[i][j];
  }
  return v;
};
/* ¿Se puso el '@' a esa celda ANTES de escribirle? (el formato puesto después no sirve: Sheets ya volvió hora el «10:00») */
const formatoAntesDelValor = (log, hojaNombre, fila, col) => {
  const cubre = x => x.hoja === hojaNombre && x.fila <= fila && fila < x.fila + x.n && x.col <= col && col < x.col + x.m;
  const iFmt = log.findIndex(x => x.op === 'setNumberFormat' && x.arg === '@' && cubre(x));
  const iVal = log.findIndex(x => (x.op === 'setValue' || x.op === 'setValues') && cubre(x));
  return iFmt >= 0 && iVal >= 0 && iFmt < iVal;
};

/* ===========================================================================
   4. LA RUTA: POR FOLIO Y NO POR FILA
   =========================================================================== */
console.log('\n4. LA RUTA — por folio y no por fila, solo lo capturado, solo lo que cambió, nunca una fórmula');
{
  /* La hoja como la dejaba el reacomodo por estatus: la liquidada arriba, luego la de fabricación, luego la que cobra. */
  const H = hoja(); centinelas(H);
  ponFila(H, 2, venta('V-003', { c_estatus: 'LIQUIDADO', d_cuenta: 'Elias BBVA', f_iva: 'No' }));
  ponFila(H, 3, venta('V-001', { c_estatus: 'FABRICACION' }));
  ponFila(H, 4, venta('V-002'));
  const log = espiar(H); const antes = foto(H); const f0 = formulasDe(H);
  const filaV3 = JSON.stringify(H.v._g[2].slice(0, 36)), filaV2 = JSON.stringify(H.v._g[4].slice(0, 36));
  const r = H.lote({ id: 'prueba-1', modo: 'incremental', ventas: [venta('V-001', { c_estatus: 'LIQUIDADO', i_anticipo: 11600, j_liquidacion: 0 }), venta('V-004')] });
  eq('contesta ok', [r.ok, r.lote], [true, 'prueba-1']);
  eq('V-001 se puso al día EN SU FILA (la 3), aunque la hoja no esté en el orden de la base', [filaDeVenta(H, 'V-001'), leer(H, 'V-001', 'Estatus'), leer(H, 'V-001', 'Anticipo')], [3, 'LIQUIDADO', 11600]);
  eq('V-004, que no estaba, se dio de alta en la primera fila libre (la 5)', [filaDeVenta(H, 'V-004'), leer(H, 'V-004', 'Proyecto'), leer(H, 'V-004', 'Telefono')], [5, 'Ana - Café V-004', '+52 1 33 1000 0000']);
  eq('V-003 y V-002 —que no venían en el lote— no se tocaron', [JSON.stringify(H.v._g[2].slice(0, 36)) === filaV3, JSON.stringify(H.v._g[4].slice(0, 36)) === filaV2], [true, true]);
  eq('el resumen cuenta una nueva, una cambiada y ninguna igual', [r.ventas.recibidas, r.ventas.nuevas, r.ventas.cambiadas, r.ventas.sin_cambio], [2, 1, 1, 0]);
  const cambios = celdasQueCambiaron(antes, foto(H));
  const esperadas = ['v:3:3', 'v:3:9', ...CAPTURADAS.filter(c => c !== 14 && c !== 35).map(c => 'v:5:' + c)];
  eq('lo ÚNICO que cambió en la hoja: el estatus y el anticipo de V-001, y las celdas con dato de V-004', cambios.sort(), esperadas.sort());
  cierto('las columnas de fórmula (H, K, O:X) y la B de «Abonos comisión» quedaron EXACTAMENTE igual', formulasDe(H) === f0);
  cierto('y ninguna escritura cayó en una columna de fórmula ni en la columna 35 (los sellos)', escrituras(log).every(x => (x.m || 1) === 1 ? ![...FORMULAS, 35].includes(x.col) : ![...FORMULAS, 35].some(c => c >= x.col && c < x.col + x.m)));
  eq('V-001 conserva lo que la base no cambió (la cotización, el teléfono)', [leer(H, 'V-001', 'Folio cotizacion'), leer(H, 'V-001', 'Telefono')], ['COT-001@K7QM', '+52 1 33 1000 0000']);
  eq('las fechas son fechas (a medianoche, en la zona de la hoja), no texto', [leer(H, 'V-004', 'Fecha Anticipo e Instalacion').getTime(), leer(H, 'V-004', 'Fecha instalacion').getTime()], [dia(2026, 10, 1), dia(2026, 10, 20)]);
  eq('la fecha vacía queda vacía, y el cero que sí manda la base (liquidación) queda escrito', [leer(H, 'V-004', 'Fecha Liquidacion'), leer(H, 'V-004', 'Liquidacion')], ['', 0]);
  eq('la hora queda «HH:MM» (la base manda HH:MM:SS)', leer(H, 'V-004', 'Hora instalacion'), '10:00');
  eq('los sellos (AI) NO se escribieron (ESPEJO_SELLOS apagado): la fila nueva los deja vacíos y la que ya los tenía los conserva', [leer(H, 'V-004', 'Sellos'), leer(H, 'V-001', 'Sellos')], ['', '{"Etapa de obra":1760000000000}']);
  for (const [nombre, col] of [['la hora', 27], ['el teléfono', 31], ['las notas', 33]]) {
    cierto('el formato de texto («@») de ' + nombre + ' se puso ANTES de escribir el valor, en la fila nueva', formatoAntesDelValor(log, 'Ventas', 5, col));
  }

  /* ── la hoja se reacomoda otra vez: V-001 baja a la 6 y queda un hueco en la 3 ── */
  for (const c of CAPTURADAS) { H.v._g[6][c] = H.v._g[3][c]; H.v._g[3][c] = ''; }
  const log2 = espiar(H);
  const r2 = H.lote({ ventas: [venta('V-001', { c_estatus: 'COBRANDO', i_anticipo: 11600 }), venta('V-005')] });
  eq('V-001 se encuentra por su folio en la fila nueva (la 6) y no se confunde con nadie', [r2.ok, filaDeVenta(H, 'V-001'), leer(H, 'V-001', 'Estatus')], [true, 6, 'COBRANDO']);
  eq('V-005, nueva, usa el hueco de la fila 3 (la primera libre)', [filaDeVenta(H, 'V-005'), leer(H, 'V-005', 'Proyecto')], [3, 'Ana - Café V-005']);
  eq('lo escrito fue la celda de V-001 en la 6 y la fila 3 entera, nada en las demás', [...new Set(escrituras(log2).map(x => x.fila))].sort((a, b) => a - b), [3, 6]);

  /* ── el mismo lote otra vez: no se escribe NADA ── */
  const log3 = espiar(H); const antes3 = foto(H);
  const r3 = H.lote({ ventas: [venta('V-001', { c_estatus: 'COBRANDO', i_anticipo: 11600 }), venta('V-005')] });
  eq('idempotente: aplicar otra vez el mismo lote no escribe ni una celda de datos', [r3.ok, escrituras(log3).length, r3.ventas.celdas, r3.ventas.nuevas, r3.ventas.cambiadas, r3.ventas.sin_cambio], [true, 0, 0, 0, 0, 2]);
  eq('y la hoja de datos queda idéntica (solo se refresca la marca de sincronización)', celdasQueCambiaron(antes3, foto(H)), []);
}

{
  /* ── solo escribe lo que cambió: una celda, dos seguidas, dos separadas ── */
  const H = hoja();
  const casos = [
    ['una celda (el estatus)', { c_estatus: 'LIQUIDADO' }, [['setValue', 1, 3]]],
    ['dos celdas seguidas (estatus y cuenta) van en UN solo setValues', { c_estatus: 'LIQUIDADO', d_cuenta: 'Moni MPago' }, [['setValues', 2, 3]]],
    ['dos celdas separadas (estatus y anticipo) son dos escrituras', { c_estatus: 'REPARANDO', i_anticipo: 100 }, [['setValue', 1, 3], ['setValue', 1, 9]]],
    ['una celda de texto (notas)', { ag_notas: 'otra nota' }, [['setValue', 1, 33]]],
    ['tres celdas: dos seguidas y una aparte', { c_estatus: 'LIQUIDADO', d_cuenta: 'Moni MPago', i_anticipo: 100 }, [['setValues', 2, 3], ['setValue', 1, 9]]],
  ];
  for (const [que, cambio, esperado] of casos) {
    H.lote({ ventas: [venta('V-001')] });                       // cada caso parte de la venta como la manda la base
    const log = espiar(H);
    const r = H.lote({ ventas: [venta('V-001', cambio)] });
    eq(que, [r.ok, escrituras(log).map(x => [x.op, x.m || 1, x.col]), r.ventas.celdas], [true, esperado, Object.keys(cambio).length]);
  }
  H.lote({ ventas: [venta('V-001')] });
  const logT = espiar(H); H.lote({ ventas: [venta('V-001', { ag_notas: 'otra nota' })] });
  cierto('y la celda de texto lleva su «@» antes del valor también en un cambio', formatoAntesDelValor(logT, 'Ventas', 2, 33));
}

{
  /* ── lo que Sheets le haría a lo escrito no cuenta como cambio ── */
  const H = hoja(); ponFila(H, 2, venta('V-001'));
  H.v._g[2][27] = horaComoSheets('10:00');                   // la hora, ya vuelta hora por Sheets
  H.v._g[2][31] = 3312345678;                                // el teléfono, vuelto número
  H.v._g[2][2] = '  Ana - Café V-001  ';                     // espacios al borde
  H.v._g[2][1] = ' v-001 ';                                  // el folio en minúsculas y con espacios
  H.v._g[2][12] = new Date(2026, 9, 1, 15, 30);              // la fecha con hora (como la dejaba el puente)
  const log = espiar(H);
  const r = H.lote({ ventas: [venta('V-001', { ae_telefono: '3312345678' })] });
  eq('la hora vuelta hora, el teléfono vuelto número, espacios y minúsculas en el folio, y la fecha con hora: sin cambios', [r.ok, escrituras(log).length, r.ventas.sin_cambio], [true, 0, 1]);
  H.v._g[2][31] = '+52 1 33.1234.5678';                        // el mismo teléfono con puntos: lo que baja a los teléfonos ya sale limpio
  const log2 = espiar(H);
  const r2 = H.lote({ ventas: [venta('V-001', { ae_telefono: '+52 1 33 1234 5678' })] });
  eq('un teléfono con puntos en vez de espacios es el mismo teléfono (se lee limpio, como /jalar): sin cambios', [r2.ok, escrituras(log2).length, r2.ventas.sin_cambio], [true, 0, 1]);
}

{
  /* ── null borra, una llave que falta no toca ── */
  const H = hoja(); H.lote({ ventas: [venta('V-001')] });
  H.lote({ ventas: [venta('V-001', { ag_notas: null, ab_ubicacion: null, ad_pct: null, l_fecha_anticipo: null, aa_hora: null, ae_telefono: null, y_folio_cotizacion: null, af_entrega: null })] });
  eq('un null en la vista borra la celda (notas, ubicación, %, fecha, hora, teléfono, folio de cotización, entrega)',
     ['Notas', 'Ubicacion', 'Porcentaje comision', 'Fecha Anticipo e Instalacion', 'Hora instalacion', 'Telefono', 'Folio cotizacion', 'Entrega'].map(n => leer(H, 'V-001', n)), ['', '', '', '', '', '', '', '']);
  const log = espiar(H);
  H.lote({ ventas: [{ a_folio: 'V-001', b_proyecto: 'Ana - Café V-001', c_estatus: 'LIQUIDADO' }] });
  eq('y una fila que trae solo folio, nombre y estatus no toca NADA más: solo cambió el estatus', escrituras(log).map(x => [x.col]), [[3]]);
  eq('y lo demás sigue como estaba (la dirección, la etapa)', [leer(H, 'V-001', 'Direccion'), leer(H, 'V-001', 'Etapa de obra')], ['Av. Vallarta 1', 'Ganado']);
}

{
  /* ── el texto que la hoja volvería fórmula lleva su apóstrofo; el de las columnas en texto, no ── */
  const H = hoja(); centinelas(H); const log = espiar(H); const f0 = formulasDe(H);
  const peligrosa = '=HYPERLINK("http://evil.example","x")';
  const r = H.lote({ ventas: [venta('V-001', { b_proyecto: peligrosa, ac_direccion: '-pedir permiso', ab_ubicacion: '+20.6,-103.3', y_folio_cotizacion: '@menciona',
                                              ag_notas: '=suma\n- guion', ae_telefono: '+52 (33) 1234-5678', aa_hora: '9:05' })] });
  eq('el lote entra', r.ok, true);
  eq('el nombre que empieza con «=» se escribe con apóstrofo: texto, no fórmula', escritoEn(log, 'Ventas', 2, 2), "'" + peligrosa);
  eq('la dirección que empieza con «-»', escritoEn(log, 'Ventas', 2, 29), "'-pedir permiso");
  eq('la ubicación que empieza con «+»', escritoEn(log, 'Ventas', 2, 28), "'+20.6,-103.3");
  eq('el folio de cotización que empieza con «@»', escritoEn(log, 'Ventas', 2, 25), "'@menciona");
  eq('y en Sheets el apóstrofo no se guarda: la celda queda con el texto tal cual', [leer(H, 'V-001', 'Proyecto'), leer(H, 'V-001', 'Direccion')], [peligrosa, '-pedir permiso']);
  eq('las notas, en texto sin formato, van TAL CUAL (el apóstrofo se quedaría escrito en la nota)', [escritoEn(log, 'Ventas', 2, 33), leer(H, 'V-001', 'Notas')], ['=suma\n- guion', '=suma\n- guion']);
  eq('el teléfono, igual: tal cual, ya sin lo que no es teléfono', escritoEn(log, 'Ventas', 2, 31), '+52 (33) 1234-5678');
  eq('la hora «9:05» se escribe «09:05»', escritoEn(log, 'Ventas', 2, 27), '09:05');
  for (const [nombre, col] of [['la hora', 27], ['el teléfono', 31], ['las notas', 33]]) cierto('el «@» de ' + nombre + ' se puso antes del valor', formatoAntesDelValor(log, 'Ventas', 2, col));
  eq('y las celdas de texto quedaron en texto sin formato', [27, 31, 33].map(c => H.v._f[2][c]), ['@', '@', '@']);
  cierto('ninguna fórmula de la hoja se movió', formulasDe(H) === f0);
}

{
  /* ── dos filas con el mismo folio, una fila sin nombre que tiene su folio, restos de otra venta ── */
  const H = hoja();
  ponFila(H, 2, venta('V-001')); ponFila(H, 3, venta('V-001', { b_proyecto: 'La copia pegada' }));
  const r = H.lote({ ventas: [venta('V-001', { c_estatus: 'LIQUIDADO' })] });
  eq('con dos filas del mismo folio se pone al día la primera, la otra se deja y se avisa', [filaDeVenta(H, 'V-001'), H.v._g[2][3], H.v._g[3][3], r.ventas.duplicadas], [2, 'LIQUIDADO', 'COBRANDO', ['V-001']]);

  const G = hoja();
  ponFila(G, 2, venta('V-050')); G.v._g[2][2] = '';                          // alguien le borró el nombre pero quedó el folio
  const g = G.lote({ ventas: [venta('V-050')] });
  eq('una fila a la que le borraron el nombre pero conserva su folio se encuentra por el folio y recupera su nombre', [g.ok, filaDeVenta(G, 'V-050'), leer(G, 'V-050', 'Proyecto')], [true, 2, 'Ana - Café V-050']);

  /* Con todas las filas ocupadas menos dos —una limpia y una con restos de otra venta— la nueva usa la limpia, y
     la siguiente la de los restos, que se deja en blanco antes. */
  const R = hoja();
  for (let f = 2; f <= 310; f++) ponFila(R, f, venta('V-' + String(100 + f)));
  quitarFila(R, 310);
  quitarFila(R, 5); R.v._g[5][3] = 'REPARANDO'; R.v._g[5][9] = 999; R.v._g[5][26] = 'Armado'; R.v._g[5][1] = '';   // restos: sin nombre ni folio, con dinero y etapa
  const a1 = R.lote({ ventas: [venta('V-900', { c_estatus: null, z_etapa: null })] });
  eq('entre una fila vacía y una con restos de otra venta, la nueva va a la VACÍA (la 310)', [a1.ok, filaDeVenta(R, 'V-900')], [true, 310]);
  const a2 = R.lote({ ventas: [venta('V-901', { c_estatus: null, z_etapa: null, i_anticipo: 0 })] });
  eq('y la siguiente a la de los restos (la 5)', [a2.ok, filaDeVenta(R, 'V-901')], [true, 5]);
  eq('que se dejó en blanco antes: la venta nueva no hereda el estatus, la etapa ni el anticipo de nadie', [R.v._g[5][3], R.v._g[5][26], R.v._g[5][9]], ['', '', 0]);
  const a3 = R.lote({ ventas: [venta('V-902')] });
  eq('y ya no queda ninguna: la siguiente no cabe (CAPACIDAD_AGOTADA)', [a3.ok, a3.codigo], [false, 'CAPACIDAD_AGOTADA']);
}

/* ===========================================================================
   5. CAPACIDAD
   =========================================================================== */
console.log('\n5. CAPACIDAD — FIN manda: si no cabe, CAPACIDAD_AGOTADA y NADA escrito, ni lo que sí cabía');
{
  const llena = () => { const H = hoja(); centinelas(H); for (let f = 2; f <= 310; f++) ponFila(H, f, venta('V-' + String(1000 + f))); return H; };
  {
    const H = llena(); const log = espiar(H); const antes = foto(H);
    const r = H.lote({ ventas: [venta('V-1002', { c_estatus: 'LIQUIDADO' }), venta('V-9999')] });
    eq('con las 309 filas ocupadas, un lote con una venta nueva responde CAPACIDAD_AGOTADA', [r.ok, r.codigo, r.capacidad_agotada], [false, 'CAPACIDAD_AGOTADA', true]);
    eq('  dice cuál no cupo, cuántas libres hay y hasta dónde llega la hoja', [r.ventas.sin_lugar, r.ventas.libres, r.ventas.fin], [['V-9999'], 0, 310]);
    cierto('  y NO escribió nada: ni la venta nueva, ni el cambio de la que sí estaba, ni la marca, ni la nota, ni la bitácora', log.length === 0 && foto(H) === antes);
    const solo = H.lote({ ventas: [venta('V-1002', { c_estatus: 'LIQUIDADO' })] });
    eq('un lote solo de cambios a filas que ya están sí entra, aunque la hoja esté llena', [solo.ok, leer(H, 'V-1002', 'Estatus')], [true, 'LIQUIDADO']);
  }
  {
    const H = llena(); quitarFila(H, 310);
    const antes = foto(H);
    const dos = H.lote({ ventas: [venta('V-9001'), venta('V-9002')] });
    eq('con UNA fila libre, un lote con dos ventas nuevas no cabe: no entra ni la primera', [dos.ok, dos.codigo, dos.ventas.sin_lugar, foto(H) === antes], [false, 'CAPACIDAD_AGOTADA', ['V-9002'], true]);
    const una = H.lote({ ventas: [venta('V-9001')] });
    eq('con una nueva sí: va a la última fila (la 310) y la hoja queda llena', [una.ok, filaDeVenta(H, 'V-9001'), una.capacidad.ventas_libres], [true, 310, 0]);
    const otra = H.lote({ ventas: [venta('V-9001')] });
    eq('el mismo lote otra vez no necesita fila: ya está (se encuentra por el folio)', [otra.ok, otra.ventas.nuevas, otra.ventas.sin_cambio], [true, 0, 1]);
  }
  {
    /* «Abonos comisión» llega al renglón 2000. */
    const llenaAb = () => {
      const H = hoja(); centinelas(H);
      for (let r = 2; r <= 2000; r++) { H.abonos._g[r][1] = 'V-' + (2000 + r); H.abonos._g[r][3] = r; H.abonos._g[r][4] = new Date(2026, 9, 1); H.abonos._g[r][5] = 'n' + r; }
      return H;
    };
    const H = llenaAb(); const log = espiar(H); const antes = foto(H);
    const r = H.lote({ abonos: [grupo('V-1003', [abono(50)])] });
    eq('con los 1999 renglones de abonos ocupados, un folio con un abono nuevo responde CAPACIDAD_AGOTADA y no escribe', [r.ok, r.codigo, r.abonos.sin_lugar, r.abonos.libres, log.length === 0 && foto(H) === antes], [false, 'CAPACIDAD_AGOTADA', ['V-1003'], 0, true]);
    /* El renglón 7 es el único abono de V-2007: se manda con otro importe, y se reescribe en su lugar. */
    const corr = llenaAb().lote({ abonos: [grupo('V-2007', [abono(777, '2026-10-01', 'n7')])] });
    const G = llenaAb(); const logG = espiar(G); const rG = G.lote({ abonos: [grupo('V-2007', [abono(777, '2026-10-01', 'n7')])] });
    eq('un renglón que ya no corresponde se reescribe EN SU LUGAR aunque la pestaña esté llena (no pide fila libre)', [corr.ok, rG.ok, G.abonos._g[7][3], rG.abonos.reescritos, rG.abonos.agregados, escrituras(logG).map(x => [x.fila, x.col])], [true, true, 777, 1, 0, [[7, 3]]]);
  }
  {
    /* Las dos pestañas en el mismo lote: si una no cabe, no se escribe ninguna. */
    const H = llena();
    for (let r = 2; r <= 2000; r++) { H.abonos._g[r][1] = 'V-' + (2000 + r); H.abonos._g[r][3] = r; H.abonos._g[r][5] = 'n' + r; }
    const antes = foto(H); const log = espiar(H);
    const r = H.lote({ ventas: [venta('V-1002', { c_estatus: 'LIQUIDADO' })], abonos: [grupo('V-1003', [abono(50)])] });
    eq('ventas que caben y abonos que no: se rechaza TODO el lote (la venta no se pone al día)', [r.ok, r.codigo, log.length === 0 && foto(H) === antes], [false, 'CAPACIDAD_AGOTADA', true]);
  }
  {
    const H = hoja();
    const r = H.lote({ ventas: [venta('V-001'), venta('V-002')] });
    eq('la respuesta dice cuántas filas libres quedan (309 menos las 2 dadas de alta)', [r.ok, r.capacidad], [true, { fin: 310, ventas_libres: 307, abonos_libres: null }]);
  }
}

/* ===========================================================================
   6. UN LOTE QUE INTENTA ESCRIBIR FÓRMULAS, Y UN LOTE MAL ARMADO
   =========================================================================== */
console.log('\n6. LOS LOTES QUE NO VALEN — fórmulas, valores fuera de lista, tamaños: se rechaza el lote y no se escribe nada');
{
  const FORMULAS_LLAVES = ['h_neto', 'k_saldo', 'o_dias_cobro', 'p_dias', 'q_antiguedad', 'r_comision', 's_abonado', 't_restante', 'u_pagos', 'v_anio', 'w_mes', 'x_revisar', 'H', 'K', 'x', 'R_comision', 'S'];
  for (const llave of FORMULAS_LLAVES) {
    const H = hoja(); centinelas(H); const log = espiar(H); const antes = foto(H);
    const r = H.lote({ ventas: [venta('V-001'), venta('V-002', { [llave]: 11600 })] });
    cierto('una fila con la llave «' + llave + '» (columna de fórmula) tumba el lote: DATO_INVALIDO por «formulas», aunque la otra fila fuera buena, y no se escribió nada',
           r.ok === false && r.codigo === 'DATO_INVALIDO' && r.motivo === 'formulas' && log.length === 0 && foto(H) === antes);
  }
  {
    const H = hoja(); centinelas(H); const log = espiar(H); const antes = foto(H);
    const r1 = H.lote({ abonos: [{ ...grupo('V-001', [abono(10)]), b_proyecto: 'x' }] });
    const r2 = H.lote({ abonos: [grupo('V-001', [{ ...abono(10), b_proyecto: '=ARRAYFORMULA(1)' }])] });
    eq('en «Abonos comisión» la columna B es fórmula: una llave b_… (en el folio o en un abono) tumba el lote', [r1.motivo, r2.motivo, log.length === 0 && foto(H) === antes], ['formulas', 'formulas', true]);
  }
  /* Valores que no valen: cada uno rechaza el lote entero, dice QUÉ fila y por qué, y no escribe nada. */
  const MALAS = [
    ['un estatus que no es de la hoja', { c_estatus: 'EN PROCESO' }, 'no es un estatus'],
    ['una cuenta que no es de la hoja', { d_cuenta: 'Otro Banco' }, 'no es una cuenta'],
    ['un tipo de trabajo que no es de la lista', { e_tipo: 'Letras 3D, Dibujo' }, 'no son tipos'],
    ['un IVA que no es Sí ni No', { f_iva: 'quizá' }, 'IVA'],
    ['un subtotal que es una fórmula', { g_subtotal: '=1+1' }, 'subtotal'],
    ['un subtotal que no es número', { g_subtotal: 'mucho' }, 'subtotal'],
    ['un anticipo negativo', { i_anticipo: -5 }, 'negativo'],
    ['una liquidación infinita', { j_liquidacion: null }, 'número'],
    ['una fecha que no existe (31 de febrero)', { l_fecha_anticipo: '2026-02-31' }, 'fecha'],
    ['una fecha con otro formato', { m_fecha_instalacion: '20/10/2026' }, 'fecha'],
    ['una etapa que no es de la hoja', { z_etapa: 'Terminado' }, 'no es una etapa'],
    ['una hora que no es hora', { aa_hora: '25:99' }, 'hora'],
    ['un porcentaje fuera de 0 a 100', { ad_pct: 120 }, 'porcentaje'],
    ['una entrega que no es de la lista', { af_entrega: 'Dron' }, 'entrega'],
    ['un plazo que no es de los cinco', { ah_plazo: '9 semanas' }, 'plazo'],
    ['un nombre vacío', { b_proyecto: '   ' }, 'nombre'],
    ['un folio mal escrito', { a_folio: 'V-1' }, 'folio'],
    ['un folio de otra clase', { a_folio: 'COT-0001' }, 'folio'],
    ['un valor que es un objeto', { ac_direccion: { x: 1 } }, 'dato simple'],
    ['un valor que es una lista', { ac_direccion: ['a'] }, 'dato simple'],
    ['una llave que no es una columna', { zz_algo: 1 }, 'no es una columna'],
    ['una llave del dinero que no existe en la hoja (la comisión)', { pct_comision: 10 }, 'no es una columna'],
  ];
  for (const [que, cambio, porque] of MALAS) {
    const H = hoja(); centinelas(H); const log = espiar(H); const antes = foto(H);
    const r = H.lote({ ventas: [venta('V-002'), venta('V-001', cambio)] });
    const f = (r.rechazadas || [])[0] || {};
    cierto(que + ': el lote se rechaza, dice cuál fila y por qué («' + porque + '»), y no escribió nada ni de la fila buena',
           r.ok === false && r.codigo === 'DATO_INVALIDO' && r.rechazadas.length === 1 && f.flujo === 'ventas' && f.folio === (cambio.a_folio ? cambio.a_folio.toUpperCase() : 'V-001') && String(f.por).includes(porque) && log.length === 0 && foto(H) === antes);
  }
  {
    const H = hoja(); const log = espiar(H);
    const dos = H.lote({ ventas: [venta('V-001'), venta('V-001', { c_estatus: 'LIQUIDADO' })] });
    eq('el mismo folio dos veces en un lote se rechaza', [dos.ok, dos.rechazadas.map(x => x.por)], [false, ['el folio viene dos veces en el lote']]);
    const sinNombre = H.lote({ ventas: [{ a_folio: 'V-001', c_estatus: 'COBRANDO' }] });
    eq('una fila sin el nombre se rechaza (una fila sin nombre no existe en el libro)', [sinNombre.ok, sinNombre.rechazadas.map(x => x.por)], [false, ['falta el nombre del proyecto']]);
    const sinFolio = H.lote({ ventas: [{ b_proyecto: 'x' }, 7, null, 'V-001'] });
    eq('filas que no son objetos, o sin folio, se rechazan una por una', sinFolio.rechazadas.map(x => x.por), ['falta el folio', 'la fila no es un objeto', 'la fila no es un objeto', 'la fila no es un objeto']);
    cierto('y de todo eso no se escribió nada', log.length === 0);
    eq('«v-001» en minúsculas es el folio V-001 (se normaliza)', (() => { const G = hoja(); G.lote({ ventas: [venta('v-001')] }); return filaDeVenta(G, 'V-001'); })(), 2);
    eq('un lote sin ventas ni abonos, o sin lote, o con listas que no son listas', [
      H.lote(undefined).codigo, H.lote('texto').codigo, H.lote({ ventas: {} }).codigo, H.lote({ abonos: 'x' }).codigo, H.lote({ ventas: null, abonos: null }).ok,
    ], ['DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', true]);
    eq('más de 100 ventas en un lote se rechaza', H.lote({ ventas: Array.from({ length: 101 }, (_, i) => venta('V-' + String(100 + i))) }).codigo, 'DATO_INVALIDO');
    eq('y 100 sí entran', H.lote({ ventas: Array.from({ length: 100 }, (_, i) => venta('V-' + String(200 + i))) }).ok, true);
    eq('más de 400 renglones de abonos en un lote se rechaza', H.lote({ abonos: [grupo('V-001', Array.from({ length: 401 }, (_, i) => abono(i + 1)))] }).codigo, 'DATO_INVALIDO');
    const logAccion = espiar(H);
    eq('una acción que no existe se rechaza, aunque traiga un lote bueno, y no escribe nada', [H.doPost(JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, accion: 'borrar', lote: { ventas: [venta('V-777')] } })).codigo, escrituras(logAccion).length, H.celda('V-777', 'Proyecto')], ['DATO_INVALIDO', 0, undefined]);
  }
  {
    /* El tope del cuerpo es el de doPost, y no cambió: 64 KB. La función arma lotes que quepan. */
    const H = hoja();
    const lote = { ventas: Array.from({ length: 100 }, (_, i) => venta('V-' + String(300 + i))) };
    const cuerpo = JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, lote });
    cierto('un lote de 100 ventas completas pesa ' + cuerpo.length + ' caracteres, cabe en los 65 536 de la puerta y entra', cuerpo.length < 65536 && H.doPost(cuerpo).ok === true);
    const enorme = JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, lote: { ventas: [venta('V-001', { ag_notas: 'x'.repeat(70000) })] } });
    eq('un cuerpo de más de 64 KB lo rechaza la puerta de siempre, sin leer el secreto', H.doPost(enorme), { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo es demasiado grande.' });
  }
}

/* ===========================================================================
   7. EL CANDADO, Y LO QUE PASA SI SE CAE A LA MITAD
   =========================================================================== */
console.log('\n7. EL CANDADO — atómica por lote, y una caída a la mitad se repara con el reintento');
{
  const candado = (H, { ocupado = false } = {}) => {
    const c = { espera: 0, liberado: 0 };
    H.ctx.LockService = { getScriptLock: () => ({ waitLock() { c.espera++; if (ocupado) throw new Error('ocupado'); }, tryLock() { c.espera++; return !ocupado; }, releaseLock() { c.liberado++; } }) };
    return c;
  };
  const silencio = H => { const errores = []; H.ctx.console = { ...console, error: (...a) => errores.push(a) }; return errores; };
  {
    const H = hoja(); const c = candado(H);
    const r = H.lote({ ventas: [venta('V-001')] });
    eq('un lote bueno toma el candado una vez y lo suelta', [r.ok, c.espera, c.liberado], [true, 1, 1]);
  }
  {
    const H = hoja(); const c = candado(H, { ocupado: true }); const log = espiar(H); const antes = foto(H);
    const r = H.lote({ ventas: [venta('V-001')] });
    eq('con el candado ocupado (una subida del puente, un formulario) contesta SIN_RED —se reintenta— y no escribe nada', [r.ok, r.codigo, log.length === 0 && foto(H) === antes, c.liberado], [false, 'SIN_RED', true, 0]);
  }
  {
    const H = hoja(); const c = candado(H);
    H.lote({ ventas: [venta('V-001')] });
    const r = H.lote({ ventas: [venta('V-001'), { ...venta('V-002'), c_estatus: 'NO' }] });
    eq('un lote que no vale se rechaza ANTES de pedir el candado (no hace esperar a nadie)', [r.ok, c.espera], [false, 1]);
    const llena = hoja(); const c2 = candado(llena);
    for (let f = 2; f <= 310; f++) ponFila(llena, f, venta('V-' + String(1000 + f)));
    llena.lote({ ventas: [venta('V-9999')] });
    eq('y uno que no cabe lo suelta al rechazarse', [c2.espera, c2.liberado], [1, 1]);
  }
  {
    /* Se cae a la mitad: la tercera escritura revienta (la cuota de Google, un tiempo agotado). */
    const A = hoja(); centinelas(A);
    const lote = { ventas: [venta('V-001'), venta('V-002'), venta('V-003')], abonos: [grupo('V-001', [abono(100), abono(200, '2026-10-06', 'segundo', 'P-001')])] };
    const limpia = hoja(); centinelas(limpia); limpia.lote(lote);
    const c = candado(A); const errores = silencio(A);
    let n = 0; const original = A.v.getRange;
    A.v.getRange = (...a) => { const R = original(...a); for (const m of ['setValue', 'setValues']) { const f = R[m]; R[m] = (...x) => { if (++n === 3) throw new Error('Exceeded maximum execution time'); return f(...x); }; } return R; };
    const r = A.lote(lote);
    eq('si la escritura se cae a la mitad lo dice (DESCONOCIDO, parcial) y no se hace el tonto', [r.ok, r.codigo, r.parcial], [false, 'DESCONOCIDO', true]);
    eq('  el candado se suelta aunque se haya caído', [c.espera, c.liberado], [1, 1]);
    cierto('  la excepción quedó en el registro del script y NO en la respuesta', errores.length === 1 && !JSON.stringify(r).includes('Exceeded'));
    cierto('  la hoja quedó a medias (la prueba de que el reintento tiene algo que reparar)', celdasQueCambiaron(foto(limpia), foto(A)).length > 0);
    A.v.getRange = original;
    const r2 = A.lote(lote);
    eq('el reintento del mismo lote termina de escribir', [r2.ok], [true]);
    eq('y la hoja de datos queda EXACTAMENTE como si el lote hubiera entrado de una vez (valores y formatos)', [celdasQueCambiaron(foto(limpia), foto(A)), JSON.stringify(limpia.v._f.map(f => f.slice(0, 36))) === JSON.stringify(A.v._f.map(f => f.slice(0, 36)))], [[], true]);
    eq('sin duplicar abonos', abonosDe(A, 'V-001').map(x => x[0]), [100, 200]);
  }
}

/* ===========================================================================
   8. LA MARCA
   =========================================================================== */
console.log('\n8. LA MARCA — la nota de «esto es un espejo», la última sincronización y la bitácora; ninguna pestaña nueva');
{
  const H = hoja(); let creadas = 0;
  const original = H.ss.insertSheet; H.ss.insertSheet = (...a) => { creadas++; return original(...a); };
  const antes = Date.now();
  const r = H.lote({ id: 'marca-1', modo: 'completo', ventas: [venta('V-001'), venta('V-002')], abonos: [grupo('V-001', [abono(100)])] });
  const nota = H.v._notas['1,1'];
  eq('el lote entra y la marca se escribió', [r.ok, r.marca], [true, true]);
  cierto('nota en la celda de encabezado de Ventas (A1): dice que es un espejo de solo lectura', /ESPEJO DE SOLO LECTURA/.test(nota));
  cierto('  dice que las ediciones manuales se pisan con el siguiente cambio', /Las ediciones manuales se pisan con el siguiente cambio/.test(nota));
  cierto('  dice dónde se edita y que las fórmulas siguen siendo de la hoja', /plataforma/.test(nota) && /H, K y O a X/.test(nota));
  cierto('  y trae la fecha y la hora de la última sincronización', /Última sincronización: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\./.test(nota));
  eq('la misma nota está en «Abonos comisión» (A1): también se espeja', H.abonos._notas['1,1'], nota);
  eq('la columna que sigue a la última del puente (AJ, la 36) se creó: Ventas tenía 35', H.v.getMaxColumns(), 36);
  eq('AJ1 dice qué es', H.v._g[1][36], 'Espejo · última sincronización');
  const marca = H.v._g[2][36];
  cierto('AJ2 es la fecha y hora de la sincronización (una fecha de verdad, de hace un instante)', typeof marca.getTime === 'function' && marca.getTime() >= antes - 1000 && marca.getTime() <= Date.now() + 1000);
  eq('  con formato de fecha y hora', H.v._f[2][36], 'dd/mm/yyyy HH:mm:ss');
  cierto('AJ3 dice cómo quedó («ok», que fue completa y el id del lote)', /^ok · completa · marca-1$/.test(H.v._g[3][36]));
  eq('NO se creó ninguna pestaña (ni la marca, ni la bitácora: ya existía)', [creadas, ['Espejo', 'Sincronización', 'Estado del espejo', 'Última sincronización', 'Bitácora del espejo', 'Log'].map(n => H.ss.getSheetByName(n))], [0, [null, null, null, null, null, null]]);
  cierto('la columna de la marca queda FUERA de A:AI (lo que se reacomoda, se filtra y baja a los teléfonos)', 36 > H.run('ULTIMA_COL') && H.run('espejoColMarca_()') === 36);

  /* La bitácora de siempre, con rol «espejo». */
  const filas = []; for (let f = 2; f <= H.bit.getLastRow(); f++) filas.push(H.bit._g[f].slice(1, 7));
  eq('la bitácora anotó cada fila nueva con su folio, su fila y «fila nueva»', filas.slice(0, 2).map(x => [x[1], x[2], x[3], x[5]]), [['espejo', 'V-001', 2, 'fila nueva'], ['espejo', 'V-002', 3, 'fila nueva']]);
  cierto('  y qué columnas escribió (la plataforma y el realineador leen ese texto por nombre de columna)', /Proyecto, Estatus, Cuenta, Tipo de trabajo, IVA, Precio Subtotal/.test(filas[0][4]) && !/Precio Neto|Pago Pendiente|Comisiones/.test(filas[0][4]));
  eq('  y los abonos del folio, en una sola línea', filas[2].slice(1, 6), ['espejo', 'V-001', 2, 'Abonos comisión: +1 ~0 -0', '']);
  const n0 = H.bit.getLastRow();
  H.lote({ ventas: [venta('V-001'), venta('V-002')], abonos: [grupo('V-001', [abono(100)])] });
  eq('un lote que no cambia nada NO anota nada en la bitácora (no la llena de ruido)', H.bit.getLastRow(), n0);
  H.lote({ ventas: [venta('V-002', { c_estatus: 'LIQUIDADO', i_anticipo: 1 })] });
  const ult = H.bit._g[H.bit.getLastRow()].slice(1, 7);
  eq('un cambio anota solo las columnas que cambiaron, y en la columna «Nota» lo que había antes (por si alguien editó a mano y hay que recuperarlo)', ult.slice(1, 6), ['espejo', 'V-002', 3, 'Estatus, Anticipo', 'antes: Estatus=COBRANDO · Anticipo=5800']);

  /* La marca se refresca en cada llamada, aunque no haya nada que escribir: es el latido. */
  await pausa(20);
  const log = espiar(H);
  const l = H.lote({});
  cierto('un lote vacío (el latido) no escribe datos, no anota en la bitácora y refresca la marca', l.ok === true && l.ventas === null && l.abonos === null && escrituras(log).length === 0 && H.v._g[2][36].getTime() > marca.getTime() && H.bit.getLastRow() === n0 + 1);
  eq('la última sincronización que dice la hoja es la del último latido', [H.run('(function () { return espejoEstado_().ultima_sincronizacion; })()') === H.v._g[2][36].toISOString()], [true]);
}
{
  const H = hoja({ bitacora: false }); let creadas = 0; const original = H.ss.insertSheet; H.ss.insertSheet = (...a) => { creadas++; return original(...a); };
  const r = H.lote({ ventas: [venta('V-001')] });
  eq('si la «Bitácora del puente» no existe, no se crea una: se sincroniza igual y se dice que no se anotó', [r.ok, r.bitacora, r.anotadas, creadas, H.ss.getSheetByName('Bitácora del puente')], [true, false, 0, 0, null]);
  const G = hoja({ columnas: 40 }); G.lote({ ventas: [venta('V-001')] });
  eq('y si Ventas ya tiene 36 o más columnas, no se le agregan', G.v.getMaxColumns(), 40);
}

/* ===========================================================================
   9. «ABONOS COMISIÓN»
   =========================================================================== */
console.log('\n9. LOS ABONOS — el conjunto de cada folio contra sus renglones; la columna B (el VLOOKUP) no se toca');
{
  const H = hoja(); centinelas(H);
  H.abonos._g[3][1] = 'V-020'; H.abonos._g[3][3] = 55; H.abonos._g[3][4] = new Date(2026, 8, 1); H.abonos._g[3][5] = 'de otro folio';
  H.abonos._g[4][3] = 5;                                                           // un renglón con importe y sin folio: de nadie
  const ajeno = JSON.stringify([H.abonos._g[3], H.abonos._g[4]]);
  const log = espiar(H); const f0 = formulasDe(H);
  const r = H.lote({ abonos: [grupo('V-014', [abono(100, '2026-10-05', ''), abono(200, '2026-10-06', '= trampa', 'P-001')])] });
  eq('dos abonos nuevos de un folio van a las primeras filas libres (la 2 y la 5: la 3 y la 4 están ocupadas)', [r.ok, abonosDe(H, 'V-014').map(x => x[4])], [true, [2, 5]]);
  eq('con su importe, su día, su nota y su pago', abonosDe(H, 'V-014').map(x => x.slice(0, 4)), [[100, '2026-10-05', '', ''], [200, '2026-10-06', '= trampa', 'P-001']]);
  eq('la nota que empieza con «=» se escribió con apóstrofo', escritoEn(log, 'Abonos comisión', 5, 5), "'= trampa");
  cierto('la columna B (el VLOOKUP del nombre) no se tocó ni una vez, y sus centinelas siguen', !log.some(x => x.hoja === 'Abonos comisión' && x.col <= 2 && 2 <= x.col + (x.m || 1) - 1 && x.op !== 'setNote') && formulasDe(H) === f0);
  cierto('el renglón de otro folio y el que no tiene folio quedaron como estaban', JSON.stringify([H.abonos._g[3], H.abonos._g[4]]) === ajeno);
  eq('el resumen', [r.abonos.folios, r.abonos.agregados, r.abonos.reescritos, r.abonos.borrados, r.abonos.sin_cambio], [1, 2, 0, 0, 0]);

  const log2 = espiar(H);
  const r2 = H.lote({ abonos: [grupo('V-014', [abono(100, '2026-10-05', ''), abono(200, '2026-10-06', '= trampa', 'P-001')])] });
  eq('idempotente: el mismo conjunto no escribe nada', [r2.ok, escrituras(log2).length, r2.abonos.sin_cambio, r2.abonos.agregados], [true, 0, 1, 0]);

  const r3 = H.lote({ abonos: [grupo('V-014', [abono(100, '2026-10-05', ''), abono(200, '2026-10-06', '= trampa', 'P-001'), abono(50.55, '2026-10-07', 'tercero')])] });
  eq('un abono nuevo del folio agrega UN renglón y deja los que ya estaban', [r3.abonos.agregados, abonosDe(H, 'V-014').map(x => x[0])], [1, [100, 200, 50.55]]);

  /* Alguien corrigió a mano el importe del primero: el conjunto de la base lo pisa, en su lugar. */
  H.abonos._g[2][3] = 999;
  const r4 = H.lote({ abonos: [grupo('V-014', [abono(100, '2026-10-05', ''), abono(200, '2026-10-06', '= trampa', 'P-001'), abono(50.55, '2026-10-07', 'tercero')])] });
  eq('una edición a mano se pisa EN SU RENGLÓN (no agrega uno nuevo ni deja los dos)', [r4.abonos.reescritos, r4.abonos.agregados, abonosDe(H, 'V-014').map(x => x[0]), abonosDe(H, 'V-014').map(x => x[4])], [1, 0, [100, 200, 50.55], [2, 5, 6]]);
  eq('  y la bitácora guarda lo que había (el 999), para poder recuperarlo', H.bit._g[H.bit.getLastRow()].slice(3, 7), ['V-014', 2, 'Abonos comisión: +0 ~1 -0', 'antes: fila 2 era 999 | 2026-10-05 |  | ']);

  /* Alguien tecleó un abono de más para ese folio. */
  H.abonos._g[8][1] = 'V-014'; H.abonos._g[8][3] = 1; H.abonos._g[8][4] = new Date(2026, 9, 9);
  const r5 = H.lote({ abonos: [grupo('V-014', [abono(100, '2026-10-05', ''), abono(200, '2026-10-06', '= trampa', 'P-001'), abono(50.55, '2026-10-07', 'tercero')])] });
  eq('un renglón de más de ese folio se deja en blanco (A, C, D, E y F; la B, que es el VLOOKUP, no)', [r5.abonos.borrados, abonosDe(H, 'V-014').length, H.abonos._g[8].slice(1, 7)], [1, 3, ['', 'B8', '', '', '', '']]);
  eq('  y lo que se vació también queda en la bitácora', H.bit._g[H.bit.getLastRow()].slice(3, 7), ['V-014', 8, 'Abonos comisión: +0 ~0 -1', 'antes: fila 8 se vació: 1 | 2026-10-09 |  | ']);
  eq('lo de otro folio y lo que no tiene folio, intacto', JSON.stringify([H.abonos._g[3], H.abonos._g[4]]), ajeno);

  /* Dos abonos idénticos son dos abonos: el conjunto se compara como conjunto, no como lista de únicos. */
  const M = hoja();
  M.lote({ abonos: [grupo('V-030', [abono(10), abono(10)])] });
  eq('dos abonos idénticos en la base son DOS renglones', abonosDe(M, 'V-030').length, 2);
  const m2 = M.lote({ abonos: [grupo('V-030', [abono(10)])] });
  eq('y si la base tiene uno solo, el renglón repetido de la hoja se deja en blanco', [m2.abonos.borrados, abonosDe(M, 'V-030').length], [1, 1]);
  const m3 = M.lote({ abonos: [grupo('V-030', [abono(10), abono(10), abono(10)])] });
  eq('y con tres, se agregan los dos que faltan (la hoja tenía uno)', [m3.abonos.agregados, abonosDe(M, 'V-030').length], [2, 3]);
}
{
  /* Lo que Sheets deja distinto de lo que se escribió no cuenta como cambio. */
  const H = hoja();
  H.abonos._g[2][1] = ' v-014 '; H.abonos._g[2][3] = 100; H.abonos._g[2][4] = new Date(2026, 9, 5, 18, 45); H.abonos._g[2][5] = ''; H.abonos._g[2][6] = '';
  const log = espiar(H);
  const r = H.lote({ abonos: [grupo('V-014', [abono(100, '2026-10-05')])] });
  eq('un abono con la fecha y la HORA de cuando lo puso el puente, y el folio con espacios y en minúsculas, es el mismo abono (cuenta el día)', [r.ok, escrituras(log).length, r.abonos.sin_cambio], [true, 0, 1]);
  H.abonos._g[2][3] = 0.1 + 0.2;
  const r2 = H.lote({ abonos: [grupo('V-014', [abono(0.3, '2026-10-05')])] });
  eq('0.30000000000000004 no es 0.3: se reescribe con lo que dice la base', [r2.abonos.reescritos, H.abonos._g[2][3]], [1, 0.3]);
  const N = hoja(); N.lote({ abonos: [grupo('V-050', [abono(70, null, null, null)])] });
  eq('un abono sin fecha, sin nota y sin pago se escribe sin ellos', abonosDe(N, 'V-050').map(x => x.slice(0, 4)), [[70, '', '', '']]);
  const O = hoja(); O.lote({ abonos: [grupo('V-040', [abono(1)]), grupo('V-020', [abono(2), abono(3)]), grupo('V-030', [abono(4)])] });
  eq('los folios se acomodan en orden de folio, para que la hoja se llene igual cada vez', [2, 3, 4, 5].map(r => O.abonos._g[r][1]), ['V-020', 'V-020', 'V-030', 'V-040']);
  const P = hoja();
  const tres = ['sin lista', { a_folio: 'V-001' }, { a_folio: 'V-001', abonos: [] }, { a_folio: 'V-1', abonos: [abono(1)] }, { a_folio: 'V-001', abonos: [abono(1)], extra: 1 },
    { a_folio: 'V-001', abonos: [{ ...abono(1), zz: 1 }] }, { a_folio: 'V-001', abonos: [abono('mucho')] }, { a_folio: 'V-001', abonos: [abono(1e7)] },
    { a_folio: 'V-001', abonos: [abono(1, '2026-13-01')] }, { a_folio: 'V-001', abonos: [abono(1, '2026-10-01', '', 'pago')] }, { a_folio: 'V-001', abonos: [7] }];
  const log3 = espiar(P);
  eq('abonos mal armados (folio sin lista, lista vacía, folio malo, llaves de más, importe, fecha, pago, no-objeto) se rechazan todos y no escriben nada',
     [tres.map(g => P.lote({ abonos: [g] }).codigo), log3.length], [Array(tres.length).fill('DATO_INVALIDO'), 0]);
  eq('un folio de abonos dos veces en el lote se rechaza', P.lote({ abonos: [grupo('V-001', [abono(1)]), grupo('V-001', [abono(2)])] }).rechazadas.map(x => x.por), ['el folio viene dos veces en el lote']);
}

/* ===========================================================================
   10. MODO_ESPEJO
   =========================================================================== */
console.log('\n10. MODO_ESPEJO — con él alEditar, normalizarIvaActivos y ordenarVentas quedan inocuos; sin él, todo hace lo de siempre');
{
  /* La hoja de un desorden conocido: IVA que la cuenta contradice, estatus fuera de orden y un renglón sin folio. Dos copias
     idénticas, una sin MODO_ESPEJO (la hoja de hoy) y otra con él. Cada paso se mide en las dos. */
  const armar = modo => {
    const H = hoja({ modo });
    ponFila(H, 2, venta('V-001', { c_estatus: 'COBRANDO', d_cuenta: 'Rul HSBC', f_iva: 'No' }));        // Rul HSBC factura: el IVA es «Sí»
    ponFila(H, 3, venta('V-002', { c_estatus: 'FABRICACION', d_cuenta: 'Elias BBVA', f_iva: 'Sí' }));  // Elias BBVA no factura: el IVA es «No»
    ponFila(H, 4, venta('V-003', { c_estatus: 'LIQUIDADO', d_cuenta: 'Rul HSBC', f_iva: 'No' }));      // liquidada: no se toca
    H.v._g[5][2] = 'Venta nueva tecleada a mano';
    return H;
  };
  const folios = H => H.v._g.slice(2, 6).map(r => r[1]);
  const iva = H => H.v._g.slice(2, 5).map(r => r[6]);
  const pasos = [
    ['normalizarIvaActivos corrige el IVA por cuenta (menos en lo liquidado)', H => H.run('normalizarIvaActivos(SpreadsheetApp.getActive().getSheetByName("Ventas"))'), iva, ['Sí', 'No', 'No'], ['No', 'Sí', 'No']],
    ['ordenarVentas acomoda por estatus (fabricación arriba, liquidado abajo)', H => H.run('ordenarVentas()'), folios, ['V-002', 'V-001', 'V-003', ''], ['V-001', 'V-002', 'V-003', '']],
    ['alEditar le pone folio a la venta tecleada a mano', H => { H.ctx.__e = { range: H.v.getRange(5, 2) }; H.run('alEditar(__e)'); }, folios, ['V-001', 'V-002', 'V-003', 'V-004'], ['V-001', 'V-002', 'V-003', '']],
    ['alEditar corrige el IVA cuando se cambia la cuenta', H => H.teclear('V-001', 'Cuenta ', 'Moni MPago'), iva, ['Sí', 'Sí', 'No'], ['No', 'Sí', 'No']],
    ['alEditar sella lo que se teclea en las columnas de la obra', H => H.teclear('V-001', 'Notas', 'una nota a mano'), H => /"Notas"/.test(H.v._g[2][35]), true, false],
    ['alEditar reacomoda al cambiar un estatus', H => H.teclear('V-003', 'Estatus', 'FABRICACION'), folios, ['V-003', 'V-002', 'V-001', ''], ['V-001', 'V-002', 'V-003', '']],
  ];
  for (const [que, paso, medir, siSinModo, siConModo] of pasos) {
    const sin = armar(false), con = armar(true);
    paso(sin); paso(con);
    eq('SIN MODO_ESPEJO (la hoja de hoy): ' + que, medir(sin), siSinModo);
    eq('CON MODO_ESPEJO: no pasa — ' + que, medir(con), siConModo);
  }
  {
    /* Con el modo puesto, las tres funciones SOLAS no escriben nada: ni una celda, ni un formato, ni una nota. */
    for (const [nombre, paso] of [['normalizarIvaActivos', H => H.run('normalizarIvaActivos(SpreadsheetApp.getActive().getSheetByName("Ventas"))')],
                                  ['ordenarVentas', H => H.run('ordenarVentas()')],
                                  ['alEditar', H => { H.ctx.__e = { range: H.v.getRange(5, 2) }; H.run('alEditar(__e)'); }]]) {
      const H = armar(true); const antes = foto(H); const log = espiar(H);
      paso(H);
      cierto('CON MODO_ESPEJO ' + nombre + ' no escribe NADA', foto(H) === antes && log.length === 0);
    }
    const H = armar(true);
    H.teclear('V-001', 'Cuenta ', 'Elias BBVA'); H.teclear('V-001', 'Notas', 'una nota a mano'); H.teclear('V-003', 'Estatus', 'FABRICACION');
    cierto('lo que la persona tecleó SÍ quedó (la prueba de que no es que la hoja de mentiras no haga nada)', H.v._g[2][4] === 'Elias BBVA' && H.v._g[2][33] === 'una nota a mano' && H.v._g[4][3] === 'FABRICACION');
    H.lote({ ventas: [venta('V-001', { c_estatus: 'COBRANDO', d_cuenta: 'Rul HSBC', f_iva: 'Sí', ag_notas: 'nota de la base' })] });
    eq('  y el siguiente cambio de la base lo pisa (así lo dice la nota de la hoja)', [H.v._g[2][4], H.v._g[2][33]], ['Rul HSBC', 'nota de la base']);
  }
  {
    /* Los valores de la propiedad. */
    const valores = [['si', true], ['sí', true], ['SI', true], [' Sí ', true], ['true', true], ['TRUE', true], ['1', true],
      ['no', false], ['0', false], ['', false], ['false', false], ['off', false], ['x', false], ['sii', false], ['verdadero', false]];
    const H0 = hoja({ modo: false });
    const lee = v => { H0.props.MODO_ESPEJO = v; return H0.run('modoEspejo_()'); };
    eq('«si», «sí», «true» y «1» (con cualquier mayúscula y espacios) encienden el modo; todo lo demás lo deja apagado', valores.map(([v]) => lee(v)), valores.map(([, e]) => e));
    delete H0.props.MODO_ESPEJO;
    eq('sin la propiedad, apagado (por omisión: la hoja de hoy)', H0.run('modoEspejo_()'), false);
    H0.ctx.PropertiesService = { getScriptProperties() { throw new Error('el servicio no contesta'); } };
    eq('si el servicio de propiedades no contesta, apagado: ante la duda, todo se comporta como siempre', H0.run('modoEspejo_()'), false);
    const mudo = hojaDeMentiras({ columnas: 35 }); mudo.ctx.PropertiesService = new Proxy({}, { get: () => () => { throw new Error('servicio de Google no disponible'); } });
    eq('y con un PropertiesService que no existe (los contextos de las otras pruebas) tampoco truena', mudo.run('modoEspejo_()'), false);
  }
  {
    /* Apagado, la ruta no escribe: una llamada por error no puede pisar la hoja viva. */
    const H = hoja({ modo: false }); const log = espiar(H); const antes = foto(H);
    const r = H.lote({ ventas: [venta('V-001')] });
    eq('sin MODO_ESPEJO la ruta se niega a escribir aunque traiga el secreto bueno (ESPEJO_APAGADO)', [r.ok, r.codigo, log.length === 0 && foto(H) === antes], [false, 'ESPEJO_APAGADO', true]);
    const e = H.doPost(JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, accion: 'estado' }));
    eq('pero «estado» sí contesta, y dice que no es un espejo', [e.ok, e.modo_espejo], [true, false]);
  }
}

/* ===========================================================================
   11. LOS SELLOS, LA HOJA VIEJA Y EL ESTADO
   =========================================================================== */
console.log('\n11. SELLOS (opcional), UNA HOJA SIN PREPARAR Y EL ESTADO');
{
  /* Las fechas se arman en la zona de la HOJA (Utilities.parseDate), no en la del proyecto del script (new Date): si fueran distintas la
     fecha se correría un día y se reescribiría en cada sincronización. */
  const H = hoja(); const llamadas = [];
  const parse = H.ctx.Utilities.parseDate;
  H.ctx.Utilities = { ...H.ctx.Utilities, parseDate: (t, tz, p) => { llamadas.push([t, tz, p]); return parse(t, tz, p); } };
  H.lote({ ventas: [venta('V-001')], abonos: [grupo('V-001', [abono(1, '2026-10-05')])] });
  eq('las fechas de la base se arman con parseDate, en la zona de la hoja y con el formato aaaa-mm-dd', llamadas, [['2026-10-01', 'America/Mexico_City', 'yyyy-MM-dd'], ['2026-10-20', 'America/Mexico_City', 'yyyy-MM-dd'], ['2026-10-05', 'America/Mexico_City', 'yyyy-MM-dd']]);
  eq('  y lo que sale es una fecha de verdad, del día que dice la base', [leer(H, 'V-001', 'Fecha Anticipo e Instalacion').getTime(), abonosDe(H, 'V-001')[0][1]], [dia(2026, 10, 1), '2026-10-05']);
  const G = hoja(); delete G.ctx.Utilities.parseDate;
  G.lote({ ventas: [venta('V-001')] });
  eq('si el servicio no tuviera parseDate, cae en la fecha de siempre y el lote entra', [G.celda('V-001', 'Proyecto'), leer(G, 'V-001', 'Fecha instalacion').getTime()], ['Ana - Café V-001', dia(2026, 10, 20)]);
}
{
  const H = hoja({ sellos: true }); const log = espiar(H);
  const r = H.lote({ ventas: [venta('V-001', { ai_sellos: '{"Plazo taller":1760000000002,"Etapa de obra":1760000000001,"Ubicacion":0,"x":5}' })] });
  eq('con ESPEJO_SELLOS = si los sellos se escriben en AI, en el orden de siempre y sin lo que no es sello', [r.ok, leer(H, 'V-001', 'Sellos')], [true, '{"Etapa de obra":1760000000001,"Plazo taller":1760000000002}']);
  cierto('  en texto sin formato, antes del valor', H.v._f[2][35] === '@' && formatoAntesDelValor(log, 'Ventas', 2, 35));
  const log2 = espiar(H); const r2 = H.lote({ ventas: [venta('V-001', { ai_sellos: '{"Etapa de obra":1760000000001,"Plazo taller":1760000000002}' })] });
  eq('el mismo contenido en otro orden de llaves no es un cambio', [r2.ok, escrituras(log2).length], [true, 0]);
  const r3 = H.lote({ ventas: [venta('V-001', { ai_sellos: null })] });
  eq('un null los borra', [r3.ok, leer(H, 'V-001', 'Sellos')], [true, '']);
  eq('un objeto (no solo texto) también vale', (() => { const G = hoja({ sellos: true }); G.lote({ ventas: [venta('V-001', { ai_sellos: { 'Etapa de obra': 5 } })] }); return leer(G, 'V-001', 'Sellos'); })(), '{"Etapa de obra":5}');
  eq('unos sellos que no son JSON se rechazan', hoja({ sellos: true }).lote({ ventas: [venta('V-001', { ai_sellos: 'no es json' })] }).rechazadas.map(x => x.por), ['los sellos no se pudieron leer']);
  const G = hoja(); G.lote({ ventas: [venta('V-001', { ai_sellos: 'no es json' })] });
  eq('apagado (por omisión) se ignoran sin leerlos: la columna AI no se toca', [G.celda('V-001', 'Proyecto'), leer(G, 'V-001', 'Sellos')], ['Ana - Café V-001', '']);
}
{
  const H = hoja({ columnas: 30 });
  const r = H.lote({ ventas: [venta('V-001')] });
  eq('una hoja que todavía no corrió «Preparar la hoja» (30 columnas) responde ESQUEMA_INCOMPLETO y no escribe', [r.ok, r.codigo, H.celda('V-001', 'Proyecto')], [false, 'ESQUEMA_INCOMPLETO', undefined]);
  const l = H.lote({});
  eq('el latido, en cambio, sí entra: no necesita columnas', l.ok, true);
  const G = hoja(); G.ss.deleteSheet(G.abonos);
  const a = G.lote({ abonos: [grupo('V-001', [abono(1)])] });
  eq('sin la pestaña «Abonos comisión», un lote con abonos responde ESQUEMA_INCOMPLETO; uno solo de ventas entra', [a.ok, a.codigo, G.lote({ ventas: [venta('V-001')] }).ok], [false, 'ESQUEMA_INCOMPLETO', true]);
  const K = hoja(); K.ss.deleteSheet(K.v);
  eq('sin la pestaña Ventas: NO_ENCONTRADO', K.lote({ ventas: [venta('V-001')] }).codigo, 'NO_ENCONTRADO');
}
{
  const H = hoja();
  H.lote({ ventas: [venta('V-001'), venta('V-002')], abonos: [grupo('V-001', [abono(1), abono(2)])] });
  H.abonos._g[9][3] = 5;                                      // un renglón de nadie (importe sin folio) también ocupa
  const e = H.doPost(JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, accion: 'estado' }));
  eq('«estado» cuenta lo ocupado y lo libre de cada pestaña, no escribe nada y dice la versión', [e.ok, e.version, e.fin, e.ventas, e.abonos, e.modo_espejo, e.sellos], [true, 'puente-sheets-14', 310, { ocupadas: 2, libres: 307 }, { ocupadas: 3, libres: 1996 }, true, false]);
  cierto('  y cuándo fue la última sincronización', Math.abs(Date.parse(e.ultima_sincronizacion) - Date.now()) < 5000);
  const log = espiar(H); H.doPost(JSON.stringify({ ruta: 'espejo', secreto: SECRETO_HOJA, accion: 'estado' }));
  eq('«estado» no escribe nada', log.length, 0);
  eq('con el secreto malo «estado» contesta lo mismo que todo', H.doPost(JSON.stringify({ ruta: 'espejo', secreto: 'x', accion: 'estado' })).codigo, 'ROL_SIN_PERMISO');
}

/* ===========================================================================
   12. LA LÓGICA PURA DE LA FUNCIÓN
   =========================================================================== */
console.log('\n12. LA LÓGICA PURA (_shared/espejo.js) — cursor, solape, consultas, lotes y lo que contesta la hoja');
{
  const TS = '2026-10-10T14:32:10.123456+00:00';
  eq('un cursor es «<hora>|<id>», con la hora tal cual la dio la base (con sus microsegundos)', E.leerCursor(TS + '|V-014'), { ts: TS, id: 'V-014' });
  eq('y se escribe igual que se leyó: ni una cifra se pierde', E.textoDeCursor(E.leerCursor(TS + '|V-014')), TS + '|V-014');
  eq('sin cursor, o con basura, es nulo (se empieza de cero)', ['', '   ', null, undefined, 'sin barra', '|x', 'no-es-hora|V-1', 42].map(E.leerCursor), Array(8).fill(null));
  eq('lo que sigue a la primera barra es el id, sea lo que sea', E.leerCursor(TS + '|a|b').id, 'a|b');
  eq('un cursor nulo se escribe vacío', E.textoDeCursor(null), '');

  const c = (ts, id) => ({ ts, id });
  eq('compararCursores: la hora manda', [E.compararCursores(c('2026-10-10T14:00:00Z', 'V-9'), c('2026-10-10T14:00:01Z', 'V-1')), E.compararCursores(c('2026-10-10T15:00:00+00:00', 'V-1'), c('2026-10-10T14:00:00Z', 'V-9'))], [-1, 1]);
  eq('  a la misma hora, los microsegundos (que un Date de JavaScript se come)', [E.compararCursores(c('2026-10-10T14:00:00.123456+00:00', 'a'), c('2026-10-10T14:00:00.123457+00:00', 'a')), E.compararCursores(c('2026-10-10T14:00:00.123457+00:00', 'a'), c('2026-10-10T14:00:00.123456+00:00', 'a'))], [-1, 1]);
  eq('  y a la misma hora exacta, el id: como texto en los folios, como número en los abonos',
     [E.compararCursores(c(TS, 'V-014'), c(TS, 'V-015')), E.compararCursores(c(TS, '9'), c(TS, '10'), true), E.compararCursores(c(TS, '9'), c(TS, '10'), false), E.compararCursores(c(TS, 'V-1'), c(TS, 'V-1'))], [-1, -1, 1, 0]);
  eq('  y un cursor nulo es el más viejo', [E.compararCursores(null, c(TS, 'a')), E.compararCursores(c(TS, 'a'), null), E.compararCursores(null, null)], [-1, 1, 0]);

  eq('el piso es el cursor menos 30 segundos, en ISO con milisegundos (lo que cualquier PostgREST entiende)', E.pisoDelCursor(c(TS, 'V-1')), '2026-10-10T14:31:40.123Z');
  eq('con otro solape', E.pisoDelCursor(c('2026-10-10T14:00:00Z', 'x'), 120_000), '2026-10-10T13:58:00.000Z');
  eq('sin cursor, o con uno que no es hora, no hay piso; y nunca pasa de la época', [E.pisoDelCursor(null), E.pisoDelCursor(c('basura', 'x')), E.pisoDelCursor(c('1970-01-01T00:00:10Z', 'x'))], [null, null, '1970-01-01T00:00:00.000Z']);
  eq('el solape es el del diseño: 30 segundos', E.LIMITES.solapeMs, 30_000);

  /* ── las consultas ── */
  eq('la primera página, sin cursor: todo, en orden de (hora, folio)', E.consultaDePagina('ventas', null, { empresa: 'al3d', limite: 40 }),
     'select=*&empresa_id=eq.al3d&order=updated_at.asc,a_folio.asc&limit=40');
  eq('con piso: solo lo posterior a ese instante (inclusive), con los «:» codificados', E.consultaDePagina('ventas', { piso: '2026-10-10T14:31:40.123Z' }, { empresa: 'al3d', limite: 40 }),
     'select=*&empresa_id=eq.al3d&updated_at=gte.2026-10-10T14%3A31%3A40.123Z&order=updated_at.asc,a_folio.asc&limit=40');
  const q = E.consultaDePagina('ventas', c(TS, 'V-014'), { empresa: 'al3d', limite: 40 });
  eq('con una fila exacta: (hora > ella) o (hora = ella y folio > el suyo)', q,
     'select=*&empresa_id=eq.al3d&or=(updated_at.gt.2026-10-10T14%3A32%3A10.123456%2B00%3A00,and(updated_at.eq.2026-10-10T14%3A32%3A10.123456%2B00%3A00,a_folio.gt.V-014))&order=updated_at.asc,a_folio.asc&limit=40');
  cierto('  y el «+» del huso horario va como %2B: sin codificar llegaría como un espacio y la comparación no encontraría nada', !/\+/.test(q));
  eq('el flujo del dinero ordena por su propia hora', E.consultaDePagina('ventas_dinero', c(TS, 'V-014'), { empresa: 'al3d', limite: 7 }).includes('dinero_updated_at.gt.') && E.consultaDePagina('ventas_dinero', null, { empresa: 'al3d' }).includes('order=dinero_updated_at.asc,a_folio.asc'), true);
  eq('el de abonos, por su id', E.consultaDePagina('abonos', c(TS, '123'), { empresa: 'al3d', limite: 40 }),
     'select=*&empresa_id=eq.al3d&or=(updated_at.gt.2026-10-10T14%3A32%3A10.123456%2B00%3A00,and(updated_at.eq.2026-10-10T14%3A32%3A10.123456%2B00%3A00,id.gt.123))&order=updated_at.asc,id.asc&limit=40');
  eq('la empresa se codifica', E.consultaDePagina('abonos', null, { empresa: 'a&b=c' }).includes('empresa_id=eq.a%26b%3Dc'), true);
  eq('el límite nunca baja de 1 ni lleva decimales', [E.consultaDePagina('ventas', null, { empresa: 'x', limite: 0 }).endsWith('limit=1'), E.consultaDePagina('ventas', null, { empresa: 'x', limite: 2.9 }).endsWith('limit=2')], [true, true]);
  let lanza = null; try { E.consultaDePagina('nada', null, { empresa: 'x' }); } catch (e) { lanza = e.message; }
  eq('un flujo que no existe lanza', lanza, 'flujo desconocido: nada');
  eq('los abonos de unos folios, por id, con un tramo desde el último visto', [E.consultaDeAbonosDeFolios(['V-001', 'V-002'], { empresa: 'al3d' }), E.consultaDeAbonosDeFolios(['V-001'], { empresa: 'al3d', limite: 10, despuesDe: 55 })],
     ['select=*&empresa_id=eq.al3d&a_folio=in.(V-001,V-002)&order=id.asc&limit=500', 'select=*&empresa_id=eq.al3d&a_folio=in.(V-001)&id=gt.55&order=id.asc&limit=10']);
  eq('los flujos son los del diseño: dos vistas y las claves de `contadores`', [E.FLUJOS.ventas.clave, E.FLUJOS.abonos.clave, E.FLUJOS.ventas.vista, E.FLUJOS.abonos.vista, E.FLUJOS.ventas.id, E.FLUJOS.abonos.id], ['espejo:ventas', 'espejo:abonos', 'espejo_ventas', 'espejo_abonos', 'a_folio', 'id']);
  eq('y el de dinero es el que cubre lo que el diseño no dice (la hora de `ventas_dinero`)', [E.FLUJOS.ventas_dinero.vista, E.FLUJOS.ventas_dinero.ts, E.GRUPOS.ventas], ['espejo_ventas', 'dinero_updated_at', ['ventas', 'ventas_dinero']]);

  /* ── los abonos, por folio ── */
  const filasAb = [
    { id: 10, a_folio: 'v-002 ', c_importe: 5, d_fecha: '2026-10-02', e_nota: 'x', f_pago: 'P-001' },
    { id: 9, a_folio: 'V-001', c_importe: 1, d_fecha: null, e_nota: null, f_pago: null },
    { id: 11, a_folio: 'V-001', c_importe: 2, d_fecha: '2026-10-03', e_nota: '', f_pago: undefined },
  ];
  eq('agruparAbonos: por folio (normalizado), en orden de llegada (por id, como NÚMERO: el 9 va antes que el 10), con lo que falte en su vacío', E.agruparAbonos(filasAb),
     [{ a_folio: 'V-001', abonos: [{ c_importe: 1, d_fecha: null, e_nota: '', f_pago: null }, { c_importe: 2, d_fecha: '2026-10-03', e_nota: '', f_pago: null }] },
      { a_folio: 'V-002', abonos: [{ c_importe: 5, d_fecha: '2026-10-02', e_nota: 'x', f_pago: 'P-001' }] }]);
  eq('y no deja pasar el id, ni el folio dentro de cada abono, ni la empresa', Object.keys(E.agruparAbonos([{ ...filasAb[0], empresa_id: 'al3d', updated_at: 'x' }])[0].abonos[0]), ['c_importe', 'd_fecha', 'e_nota', 'f_pago']);
  eq('folioDe lee el folio de una venta o de un grupo', [E.folioDe({ a_folio: ' v-007' }), E.folioDe(null), E.folioDe({})], ['V-007', '', '']);

  /* ── los lotes ── */
  const items = n => Array.from({ length: n }, (_, i) => ({ a_folio: 'V-' + String(100 + i), b_proyecto: 'x'.repeat(10) }));
  const l1 = E.armarLotes(items(95), { maxElementos: 40, maxCaracteres: 60000, sobrecarga: 400 });
  eq('por número de filas: 95 en lotes de 40, 40 y 15, en orden', [l1.lotes.map(l => l.length), l1.lotes.flat().map(x => x.a_folio).join() === items(95).map(x => x.a_folio).join(), l1.grandes.length], [[40, 40, 15], true, 0]);
  const pesados = Array.from({ length: 10 }, (_, i) => ({ a_folio: 'V-' + (100 + i), ag_notas: 'n'.repeat(1000) }));
  const l2 = E.armarLotes(pesados, { maxElementos: 40, maxCaracteres: 3500, sobrecarga: 400 });
  eq('por caracteres: con 1000 por fila y 3500 de tope, caben 2 por lote (400 de sobre)', [l2.lotes.map(l => l.length), l2.lotes.flat().length], [[2, 2, 2, 2, 2], 10]);
  const l3 = E.armarLotes([{ a_folio: 'V-1', ag_notas: 'a'.repeat(10) }, { a_folio: 'V-2', ag_notas: 'b'.repeat(9000) }, { a_folio: 'V-3', ag_notas: 'c'.repeat(10) }], { maxElementos: 40, maxCaracteres: 3000, sobrecarga: 400 });
  eq('una fila que ella sola no cabe sale aparte —no se manda— y las demás siguen', [l3.lotes.flat().map(x => x.a_folio), l3.grandes.map(x => x.a_folio)], [['V-1', 'V-3'], ['V-2']]);
  eq('sin nada, sin lotes', E.armarLotes([]), { lotes: [], grandes: [] });
  const grupos = n => Array.from({ length: n }, (_, i) => ({ a_folio: 'V-' + (100 + i), abonos: Array.from({ length: 100 }, () => ({ c_importe: 1 })) }));
  const l4 = E.armarLotes(grupos(10), { maxElementos: 40, maxCaracteres: 60000, sobrecarga: 400, filasDe: g => g.abonos.length, maxFilas: 350 });
  eq('los grupos de abonos se cuentan por los renglones que llevan dentro: con 100 por folio y 350 de tope, caben 3 por lote', [l4.lotes.map(l => l.length), l4.lotes.every(l => l.reduce((n, g) => n + g.abonos.length, 0) <= 350)], [[3, 3, 3, 1], true]);
  eq('un solo folio con más renglones que el tope sale aparte (la hoja no lo aceptaría)', E.armarLotes([{ a_folio: 'V-1', abonos: Array(400).fill({ c_importe: 1 }) }, { a_folio: 'V-2', abonos: [{ c_importe: 1 }] }], { filasDe: g => g.abonos.length, maxFilas: 350 }).grandes.map(g => g.a_folio), ['V-1']);
  eq('sin filasDe, el tope de renglones no cuenta (las ventas pesan una fila cada una)', E.armarLotes(items(95), { maxElementos: 40, maxFilas: 1 }).lotes.map(l => l.length), [40, 40, 15]);
  eq('el tope por omisión de la función queda debajo del de la hoja (400)', E.LIMITES.maxFilasAbonos < 400, true);

  /* Con el sobre real, ningún cuerpo pasa de lo que acepta la hoja (64 KB), aunque las filas pesen lo que pesen. */
  let sem = 7; const azar = () => { sem = (sem * 1664525 + 1013904223) >>> 0; return sem / 4294967296; };
  const surtido = Array.from({ length: 300 }, (_, i) => venta('V-' + String(1000 + i), { ag_notas: 'z'.repeat(Math.floor(azar() ** 3 * 20000)) }));
  const sobre = E.sobrecargaDelCuerpo(SECRETO_HOJA, { id: 'esp-20261010T150000-001', modo: 'completo' });
  const emp = E.armarLotes(surtido, { maxElementos: 40, maxCaracteres: E.LIMITES.maxCaracteres, sobrecarga: sobre });
  const pesos = emp.lotes.map(l => E.cuerpoDeLote({ secreto: SECRETO_HOJA, tipo: 'ventas', elementos: l, id: 'esp-20261010T150000-001', modo: 'completo' }).length);
  eq('300 ventas de pesos muy distintos (notas de 0 a 20 000 caracteres): ningún cuerpo pasa de 65 536 caracteres', [Math.max(...pesos) < 65536, emp.lotes.flat().length + emp.grandes.length], [true, 300]);
  nota(emp.lotes.length + ' lotes, el más pesado de ' + Math.max(...pesos) + ' caracteres; el tope de la hoja es 65 536 y el de la función ' + E.LIMITES.maxCaracteres);
  cierto('el tope de la función queda por debajo del de la hoja, con margen para el sobre', E.LIMITES.maxCaracteres + 400 < 65536 && E.sobrecargaDelCuerpo('s'.repeat(64)) < 1000);
  eq('el cuerpo de un lote: la ruta, el secreto y el lote con ventas o con abonos (el otro vacío)', [
    JSON.parse(E.cuerpoDeLote({ secreto: 's', tipo: 'ventas', elementos: [{ a_folio: 'V-1' }], id: 'i', modo: 'completo' })),
    JSON.parse(E.cuerpoDeLote({ secreto: 's', tipo: 'abonos', elementos: [{ a_folio: 'V-1', abonos: [] }] })),
    JSON.parse(E.cuerpoDeLote({ secreto: 's', tipo: '' })),
  ], [
    { ruta: 'espejo', secreto: 's', lote: { id: 'i', modo: 'completo', ventas: [{ a_folio: 'V-1' }], abonos: [] } },
    { ruta: 'espejo', secreto: 's', lote: { id: '', modo: 'incremental', ventas: [], abonos: [{ a_folio: 'V-1', abonos: [] }] } },
    { ruta: 'espejo', secreto: 's', lote: { id: '', modo: 'incremental', ventas: [], abonos: [] } },
  ]);

  /* ── lo que contesta la hoja ── */
  const clasif = (entrada) => { const r = E.clasificarRespuesta(entrada); return [r.clase, r.reintentable]; };
  eq('ok', clasif({ http: 200, json: { ok: true } }), ['ok', false]);
  eq('un error de red se reintenta', clasif({ error: new TypeError('fetch failed') }), ['red', true]);
  eq('la hoja ocupada (SIN_RED) se reintenta', clasif({ http: 200, json: { ok: false, codigo: 'SIN_RED' } }), ['hoja_ocupada', true]);
  eq('la caída a la mitad (DESCONOCIDO, parcial) se reintenta', clasif({ http: 200, json: { ok: false, codigo: 'DESCONOCIDO', parcial: true } }), ['fallo_parcial', true]);
  eq('la capacidad NO se reintenta (reintentar no la arregla)', [clasif({ http: 200, json: { ok: false, codigo: 'CAPACIDAD_AGOTADA' } }), clasif({ http: 200, json: { ok: false, capacidad_agotada: true } })], [['capacidad', false], ['capacidad', false]]);
  eq('un rechazo de datos, el modo apagado, el secreto y el esquema, tampoco', [
    clasif({ http: 200, json: { ok: false, codigo: 'DATO_INVALIDO' } }), clasif({ http: 200, json: { ok: false, codigo: 'ESPEJO_APAGADO' } }),
    clasif({ http: 200, json: { ok: false, codigo: 'ROL_SIN_PERMISO' } }), clasif({ http: 200, json: { ok: false, codigo: 'ESQUEMA_INCOMPLETO' } }), clasif({ http: 200, json: { ok: false, codigo: 'RARO' } }),
  ], [['invalido', false], ['apagado', false], ['autenticacion', false], ['esquema', false], ['otro', false]]);
  eq('una página de Google en vez de JSON: se reintenta si es un 5xx, un 429, un 408 o un 200; no si es otro 4xx', [500, 503, 429, 408, 200, 302, 401, 403, 404].map(http => clasif({ http, json: null })[1]), [true, true, true, true, true, true, false, false, false]);
  eq('el rechazo de DATO_INVALIDO trae la lista de filas (como mucho 50) y el motivo', (() => { const r = E.clasificarRespuesta({ http: 200, json: { ok: false, codigo: 'DATO_INVALIDO', motivo: 'formulas', rechazadas: Array.from({ length: 80 }, (_, i) => ({ folio: 'V-' + i })) } }); return [r.rechazadas.length, r.motivo]; })(), [50, 'formulas']);
  cierto('lo que dijo la hoja se acota: el mensaje no pasa de 300 caracteres', E.clasificarRespuesta({ http: 200, json: { ok: false, codigo: 'RARO', mensaje: 'x'.repeat(5000) } }).mensaje.length === 300);

  /* ── el módulo no usa nada de node ni de Deno ── */
  const fuente = readFileSync(join(aqui, '..', 'supabase', 'functions', '_shared', 'espejo.js'), 'utf8');
  const exportados = [...fuente.matchAll(/^export\s+(?:async\s+)?(?:const|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const desnudo = vm.createContext({});
  eq('el contexto de prueba no tiene nada de node', vm.runInContext('[typeof process, typeof Buffer, typeof require, typeof fetch, typeof Deno, typeof setTimeout].join()', desnudo), 'undefined,undefined,undefined,undefined,undefined,undefined');
  const api = vm.runInContext(fuente.replace(/^export\s+/gm, '') + '\n;({ ' + exportados.join(', ') + ' })', desnudo);
  eq('corre sin nada de node: cursor, piso, consulta y secreto dan lo mismo', [api.textoDeCursor(api.leerCursor(TS + '|V-1')), api.pisoDelCursor({ ts: TS, id: 'x' }), api.secretoValido(SECRETO_HOJA, SECRETO_HOJA), api.igualesEnTiempoConstante('a', 'b')], [TS + '|V-1', '2026-10-10T14:31:40.123Z', true, false]);
  eq('exporta lo que dice el contrato (y nada más)', exportados.sort(), ['CLAVE_COMPLETO', 'CLAVE_CORRIDA', 'CLAVE_RECHAZADAS', 'COLUMNAS_ABONO', 'COLUMNAS_FORMULA', 'COLUMNAS_VENTAS', 'FLUJOS', 'GRUPOS', 'LIMITES', 'SECRETO_MINIMO',
    'agruparAbonos', 'armarLotes', 'clasificarRespuesta', 'compararCursores', 'consultaDeAbonosDeFolios', 'consultaDePagina', 'cuerpoDeLote', 'filaDeVentas', 'folioDe', 'igualesEnTiempoConstante',
    'leerCursor', 'pisoDelCursor', 'secretoValido', 'sobrecargaDelCuerpo', 'textoDeCursor']);
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  cierto('el módulo no lee entorno ni reloj ni red (ni process, ni Deno, ni fetch, ni Date.now)', !/\b(process|Deno|fetch|XMLHttpRequest)\b|Date\.now|new Date\(\)/.test(sinComentarios));
  cierto('y no trae ningún secreto, llave ni dirección de verdad escrita', !/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|script\.google\.com|supabase\.co/.test(fuente));
}

/* ===========================================================================
   13. EL PUERTO A LA BASE, CONTRA UN POSTGREST DE MENTIRAS
   =========================================================================== */

/* Un PostgREST de mentiras: se porta como el de verdad en lo que esta función le pide —filtros eq/gt/gte/in, el `or=(…)` del
   cursor, el orden, el límite y el corte SILENCIOSO en max_rows (1000 de fábrica)— y apunta cada petición. La hora se compara
   con sus microsegundos, como Postgres, y un «+» sin codificar le llega como un espacio. */
function crearPostgrest({ ventas = [], abonos = [], contadores = new Map(), maxRows = 1000, llave = LLAVE_SERVICIO, ahora = () => Date.now() } = {}) {
  const pedidos = [];
  const COLS_HORA = new Set(['updated_at', 'dinero_updated_at']);
  const micros = v => {
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(String(v));
    if (!m) return null;
    return BigInt(Date.parse(m[1] + (m[3] === 'Z' ? 'Z' : m[3]))) * 1000n + BigInt((m[2] || '').padEnd(6, '0'));
  };
  const valor = (col, x) => (COLS_HORA.has(col) ? micros(x) : typeof x === 'number' ? Number(x) : String(x));
  const cmp = (col, a, b) => { const x = valor(col, a), y = valor(col, b); return x < y ? -1 : x > y ? 1 : 0; };
  const operador = (col, op, lit, fila) => {
    if (op === 'in') return lit.split(',').some(v => cmp(col, fila[col], v) === 0);
    const c = cmp(col, fila[col], lit);
    return { eq: c === 0, gt: c > 0, gte: c >= 0, lt: c < 0, lte: c <= 0 }[op];
  };
  const respuesta = (status, cuerpo) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const cab = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    pedidos.push({ metodo: init.method || 'GET', ruta: u.pathname, consulta: u.search, cab, cuerpo: init.body });
    if (cab.apikey !== llave) return respuesta(401, { code: 'PGRST301', message: 'JWT inválido' });
    const tabla = u.pathname.replace(/^.*\/rest\/v1\//, '');
    if (tabla === 'contadores') {
      if ((init.method || 'GET') === 'POST') {
        for (const f of JSON.parse(init.body)) contadores.set(f.empresa_id + '|' + f.clave + '|' + f.ventana, { ...f, updated_at: new Date(ahora()).toISOString() });
        return respuesta(201);
      }
      const claves = /^\((.*)\)$/.exec(u.searchParams.get('clave').replace(/^in\./, ''))[1].split(',');
      return respuesta(200, [...contadores.values()].filter(f => claves.includes(f.clave)));
    }
    const datos = tabla === 'espejo_ventas' ? ventas : tabla === 'espejo_abonos' ? abonos : null;
    if (!datos) return respuesta(404, { code: '42P01', message: 'no existe' });
    let filas = datos.slice();
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      if (k === 'or') {
        const m = /^\((\w+)\.gt\.(.+),and\((\w+)\.eq\.(.+),(\w+)\.gt\.(.+)\)\)$/.exec(v);
        if (!m || m[1] !== m[3] || m[2] !== m[4]) return respuesta(400, { code: 'PGRST100', message: 'or mal armado: ' + v });
        filas = filas.filter(f => operador(m[1], 'gt', m[2], f) || (operador(m[1], 'eq', m[2], f) && operador(m[5], 'gt', m[6], f)));
        continue;
      }
      const m = /^(eq|gt|gte|lt|lte|in)\.(.*)$/.exec(v);
      if (!m) return respuesta(400, { code: 'PGRST100', message: 'filtro raro: ' + k + '=' + v });
      const lit = m[1] === 'in' ? /^\((.*)\)$/.exec(m[2])[1] : m[2];
      filas = filas.filter(f => operador(k, m[1], lit, f));
    }
    const orden = (u.searchParams.get('order') || '').split(',').filter(Boolean).map(o => o.split('.'));
    filas.sort((a, b) => { for (const [col, dir] of orden) { const c = cmp(col, a[col], b[col]); if (c) return dir === 'desc' ? -c : c; } return 0; });
    const limite = Math.min(Number(u.searchParams.get('limit') || maxRows), maxRows);          // el corte en silencio
    return respuesta(200, filas.slice(0, limite));
  };
  return { fetch, pedidos, ventas, abonos, contadores };
}
const entornoBase = (extra = {}) => { const e = { SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_ROLE_KEY: LLAVE_SERVICIO, ...extra }; return n => e[n]; };

console.log('\n13. EL PUERTO A LA BASE (espejo/base.js) — las consultas, el cursor, la paginación y los errores');
{
  const T0 = Date.parse('2026-10-10T14:00:00Z');
  const ts = (seg, us = 0) => new Date(T0 + seg * 1000).toISOString().slice(0, 19) + '.' + String(us).padStart(6, '0') + '+00:00';
  const fila = (folio, seg, us = 0, o = {}) => ({ empresa_id: 'al3d', updated_at: ts(seg, us), dinero_updated_at: ts(seg, us), ...venta(folio), ...o });
  const ventas = [];
  for (let i = 0; i < 25; i++) ventas.push(fila('V-' + String(100 + i), i < 12 ? 5 : 6 + i));      // 12 con LA MISMA hora (los empates que parten una página)
  ventas.push(fila('V-300', 30, 1), fila('V-301', 30, 2));                                         // misma hora a la milésima, difieren en microsegundos
  ventas.push({ ...fila('V-400', 1), empresa_id: 'otra' });                                         // de otra empresa: no debe salir

  const pg = crearPostgrest({ ventas });
  const base = crearBaseEspejo({ entorno: entornoBase(), fetch: pg.fetch });
  const p1 = await base.leerPagina('ventas', null, 10);
  eq('la primera página: 10 filas, en orden de (hora, folio), sin las de otra empresa', [p1.length, p1.map(f => f.a_folio).slice(0, 3), p1.every(f => f.empresa_id === 'al3d')], [10, ['V-100', 'V-101', 'V-102'], true]);
  eq('la petición lleva la llave de servicio en apikey y en Authorization, a /rest/v1/espejo_ventas', [pg.pedidos[0].cab.apikey, pg.pedidos[0].cab.authorization, pg.pedidos[0].ruta, pg.pedidos[0].metodo], [LLAVE_SERVICIO, 'Bearer ' + LLAVE_SERVICIO, '/rest/v1/espejo_ventas', 'GET']);

  /* Recorrer TODO por páginas de 10, con el cursor exacto de la última fila de cada una: cada fila sale una vez, ni una de más ni una de menos. */
  const todas = []; let pos = null, paginas = 0;
  for (let vuelta = 0; vuelta < 20; vuelta++) {                    // con tope: si el cursor no avanzara, la prueba falla en vez de colgarse
    const f = await base.leerPagina('ventas', pos, 10); paginas++;
    todas.push(...f);
    if (f.length < 10) break;
    pos = { ts: f[f.length - 1].updated_at, id: f[f.length - 1].a_folio };
  }
  const esperados = ventas.filter(f => f.empresa_id === 'al3d').sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.a_folio < b.a_folio ? -1 : 1)).map(f => f.a_folio);
  eq('el cursor (hora, folio) recorre las 27 filas en ' + paginas + ' páginas de 10 SIN perder ni repetir ninguna, aunque 12 tengan la misma hora y se partan entre páginas', todas.map(f => f.a_folio), esperados);
  const despuesDe300 = await base.leerPagina('ventas', { ts: ts(30, 1), id: 'V-300' }, 10);
  eq('los microsegundos cuentan: después de (30 s, 000001) solo sale la de (30 s, 000002)', despuesDe300.map(f => f.a_folio), ['V-301']);
  const conPiso = await base.leerPagina('ventas', { piso: new Date(T0 + 29_000).toISOString() }, 10);
  eq('con piso, las que son de ese instante en adelante (inclusive: la de las 14:00:29 en punto entra)', conPiso.map(f => f.a_folio), ['V-123', 'V-124', 'V-300', 'V-301']);
  const gruesa = await base.leerPagina('ventas', null, 5000);
  eq('pedir más de lo que PostgREST da sin avisar (max_rows 1000) no rompe: da lo que hay', gruesa.length, 27);

  /* Los abonos de unos folios, por id y de 500 en 500: PostgREST corta en silencio en 1000. */
  const abonos = [];
  for (let i = 1; i <= 1250; i++) abonos.push({ empresa_id: 'al3d', id: i, updated_at: ts(i), a_folio: i % 5 === 0 ? 'V-002' : 'V-001', c_importe: i, d_fecha: '2026-10-01', e_nota: '', f_pago: null });
  abonos.push({ empresa_id: 'al3d', id: 5000, updated_at: ts(1), a_folio: 'V-009', c_importe: 1, d_fecha: null, e_nota: '', f_pago: null });
  const pa = crearPostgrest({ abonos }); const baseA = crearBaseEspejo({ entorno: entornoBase(), fetch: pa.fetch });
  const delFolio = await baseA.leerAbonosDeFolios(['V-001', 'V-002']);
  eq('los abonos de dos folios (1250) llegan TODOS aunque el servidor corte en 1000: se piden de 500 en 500 por id hasta que llega una página vacía', [delFolio.length, delFolio.map(f => f.id).slice(0, 3), delFolio.at(-1).id, pa.pedidos.length], [1250, [1, 2, 3], 1250, 4]);
  eq('y sin folios no se pregunta nada', [(await baseA.leerAbonosDeFolios([])).length, pa.pedidos.length], [0, 4]);

  /* Un servidor con `max_rows` MENOR que la página (se cambia en el panel de la API): una página corta no es la última. Si se
     la tomara por la última, el folio llegaría a la hoja con menos abonos de los que tiene, y la hoja deja en blanco lo que no venga. */
  const chicos = []; for (let i = 1; i <= 250; i++) chicos.push({ empresa_id: 'al3d', id: i, updated_at: ts(i), a_folio: 'V-001', c_importe: i, d_fecha: '2026-10-01', e_nota: '', f_pago: null });
  const pm = crearPostgrest({ abonos: chicos, maxRows: 100 }); const baseM = crearBaseEspejo({ entorno: entornoBase(), fetch: pm.fetch });
  const cortados = await baseM.leerAbonosDeFolios(['V-001']);
  eq('con max_rows = 100 en el servidor (menos que la página de 500) los 250 abonos del folio llegan TODOS, en orden, y sin repetir', [cortados.length, cortados.map(f => f.id).join() === chicos.map(f => f.id).join(), pm.pedidos.length], [250, true, 4]);
  eq('con un folio de pocos abonos se pregunta una vez de más (la página vacía) y nada se pierde', await (async () => { const px = crearPostgrest({ abonos: chicos.slice(0, 3) }); const r = await crearBaseEspejo({ entorno: entornoBase(), fetch: px.fetch }).leerAbonosDeFolios(['V-001']); return [r.length, px.pedidos.length]; })(), [3, 2]);
  /* Un servidor que ignorara el «id mayor que» devolvería la misma página una y otra vez: se corta con un error, no se cuelga ni se llena la memoria. */
  let vueltas = 0;
  const terco = async () => { vueltas++; return new Response(JSON.stringify(vueltas > 20 ? [] : chicos.slice(0, 5)), { status: 200, headers: { 'content-type': 'application/json' } }); };   // (a la vuelta 21 calla, para que un código sin la guarda falle en vez de colgarse)
  const baseT = crearBaseEspejo({ entorno: entornoBase(), fetch: terco });
  let errorT = null; try { await baseT.leerAbonosDeFolios(['V-001']); } catch (e) { errorT = e; }
  cierto('si la base repite la misma página, se corta con un ErrorDeBase (en la segunda vuelta) en vez de dar vueltas para siempre', errorT instanceof ErrorDeBase && vueltas === 2);

  /* El cursor vive en `contadores` (empresa '*', ventana ''). */
  const contadores = new Map([
    ['*|espejo:ventas|', { empresa_id: '*', clave: 'espejo:ventas', ventana: '', texto: ts(5) + '|V-105', updated_at: '2026-10-10T14:00:09.000Z' }],
    ['al3d|espejo:ventas|', { empresa_id: 'al3d', clave: 'espejo:ventas', ventana: '', texto: 'de otra empresa', updated_at: 'x' }],
    ['*|espejo:ventas|20261010', { empresa_id: '*', clave: 'espejo:ventas', ventana: '20261010', texto: 'de otra ventana', updated_at: 'x' }],
    ['*|ia:uno|20261010', { empresa_id: '*', clave: 'ia:uno', ventana: '20261010', texto: null, updated_at: 'x' }],
    ['*|espejo:abonos|', { empresa_id: '*', clave: 'espejo:abonos', ventana: '', texto: null, updated_at: '2026-10-10T14:00:09.000Z' }],
  ]);
  const pc = crearPostgrest({ contadores, ahora: () => T0 + 60_000 }); const baseC = crearBaseEspejo({ entorno: entornoBase(), fetch: pc.fetch });
  eq('leerCursores trae solo las filas del espejo con empresa «*» y ventana vacía; un texto nulo es vacío', await baseC.leerCursores(),
     { 'espejo:ventas': { texto: ts(5) + '|V-105', updated_at: '2026-10-10T14:00:09.000Z' }, 'espejo:abonos': { texto: '', updated_at: '2026-10-10T14:00:09.000Z' } });
  await baseC.guardarCursor('espejo:ventas', ts(9) + '|V-110');
  await baseC.guardarCursor('espejo:completo', 'en_curso|2026-10-10T14:00:00.000Z');
  const post = pc.pedidos.at(-1);
  eq('guardarCursor es un upsert por (empresa, clave, ventana), sin devolver la fila', [post.metodo, post.consulta, post.cab.prefer, post.cab['content-type'], JSON.parse(post.cuerpo)],
     ['POST', '?on_conflict=empresa_id,clave,ventana', 'resolution=merge-duplicates,return=minimal', 'application/json', [{ empresa_id: '*', clave: 'espejo:completo', ventana: '', texto: 'en_curso|2026-10-10T14:00:00.000Z' }]]);
  eq('y lo guardado se lee de vuelta (la hora de actualización la pone la base)', (await baseC.leerCursores())['espejo:ventas'], { texto: ts(9) + '|V-110', updated_at: new Date(T0 + 60_000).toISOString() });
  eq('las claves que pide son solo las del espejo', decodeURIComponent(pc.pedidos[0].consulta).match(/clave=in\.\(([^)]*)\)/)[1].split(','), ['espejo:ventas', 'espejo:ventas_dinero', 'espejo:abonos', 'espejo:completo', 'espejo:rechazadas', 'espejo:corrida']);

  /* Las llaves nuevas (sb_secret_…) no son JWT: solo van en apikey. */
  const LLAVE_NUEVA = 'sb_secret_PRUEBA_FALSA_NO_ES_REAL';
  const pn = crearPostgrest({ ventas, llave: LLAVE_NUEVA });
  const baseN = crearBaseEspejo({ entorno: entornoBase({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: LLAVE_NUEVA }) }), fetch: pn.fetch });
  await baseN.leerPagina('ventas', null, 3);
  eq('con una llave nueva (sb_secret_…) va solo en apikey; la antigua (JWT) iría en las dos', [pn.pedidos[0].cab.apikey, pn.pedidos[0].cab.authorization], [LLAVE_NUEVA, undefined]);

  /* Errores: lanzan ErrorDeBase con el estado y el código, nunca el cuerpo ni la llave. */
  const prueba = async (que, hacer, esperado) => {
    let e = null; try { await hacer(); } catch (x) { e = x; }
    eq(que, e && [e.name, e.status, e.codigo], esperado);
    cierto('  y su mensaje no trae la llave ni el cuerpo de la respuesta', !!e && !TODOS_LOS_SECRETOS.some(s => e.message.includes(s)) && !/JWT/.test(e.message));
    return e;
  };
  const malaLlave = crearBaseEspejo({ entorno: entornoBase({ SUPABASE_SERVICE_ROLE_KEY: 'otra-llave-falsa' }), fetch: crearPostgrest({ ventas }).fetch });
  await prueba('una llave que la base no acepta: ErrorDeBase 401 con el código de PostgREST', () => malaLlave.leerPagina('ventas', null, 1), ['ErrorDeBase', 401, 'PGRST301']);
  await prueba('una vista que no existe: 404', () => crearBaseEspejo({ entorno: entornoBase(), fetch: crearPostgrest({}).fetch }).leerPagina({ vista: 'no_existe', ts: 'updated_at', id: 'id' }, null, 1), ['ErrorDeBase', 404, '42P01']);
  await prueba('la red caída', () => crearBaseEspejo({ entorno: entornoBase(), fetch: async () => { throw new TypeError('fetch failed'); } }).leerPagina('ventas', null, 1), ['ErrorDeBase', 0, '']);
  await prueba('una respuesta que no es JSON', () => crearBaseEspejo({ entorno: entornoBase(), fetch: async () => new Response('<html>502</html>', { status: 200 }) }).leerPagina('ventas', null, 1), ['ErrorDeBase', 200, '']);
  await prueba('un 502 que no es JSON', () => crearBaseEspejo({ entorno: entornoBase(), fetch: async () => new Response('Bad gateway', { status: 502 }) }).leerCursores(), ['ErrorDeBase', 502, '']);
  const colgada = crearBaseEspejo({ entorno: entornoBase(), esperaMs: 30, fetch: (url, init) => new Promise((_, rechazar) => { init.signal.addEventListener('abort', () => rechazar(new Error('abortado'))); }) });
  const t0 = Date.now();
  await prueba('una base que no contesta se corta por tiempo (esperaMs), no cuelga la función', () => colgada.leerPagina('ventas', null, 1), ['ErrorDeBase', 0, '']);
  cierto('  y lo hizo a tiempo (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 1500);
  let faltaEnv = null; try { await crearBaseEspejo({ entorno: () => undefined, fetch: pg.fetch }).leerCursores(); } catch (e) { faltaEnv = [e.name, e.variables]; }
  eq('sin las variables de Supabase, falla con su NOMBRE (nunca un valor), no con un error de red', faltaEnv, ['ErrorDeEntorno', ['SUPABASE_URL', 'SUPABASE_SECRET_KEYS']]);
  let sinPuerto = null; try { crearBaseEspejo({}); } catch (e) { sinPuerto = e.constructor.name; }
  eq('y sin entorno ni fetch, al armarlo', sinPuerto, 'TypeError');
  cierto('ErrorDeBase es reconocible por nombre', esErrorDeBaseDePrueba(new ErrorDeBase('x')) && !esErrorDeBaseDePrueba(new Error('x')));
}
function esErrorDeBaseDePrueba(e) { return !!e && e.name === 'ErrorDeBase'; }

/* ===========================================================================
   14. LA FUNCIÓN DE PUNTA A PUNTA, CONTRA LA RUTA DE VERDAD
   =========================================================================== */
console.log('\n14. LA FUNCIÓN DE PUNTA A PUNTA — la base de mentiras, la función y la ruta real del .gs sobre la hoja de mentiras');

const RELOJ0 = Date.parse('2026-10-10T15:00:00Z');
const hora = (seg, us = 0) => new Date(RELOJ0 + seg * 1000).toISOString().slice(0, 19) + '.' + String(us).padStart(6, '0') + '+00:00';
const filaVista = (folio, seg, o = {}) => ({ empresa_id: 'al3d', updated_at: hora(seg), dinero_updated_at: hora(seg), ...venta(folio), ...o });
const abVista = (id, folio, seg, imp, o = {}) => ({ empresa_id: 'al3d', id, updated_at: hora(seg), a_folio: folio, c_importe: imp, d_fecha: '2026-10-05', e_nota: '', f_pago: null, ...o });
const MUNDOS = [];                                              // para revisar al final que ningún secreto salió en una respuesta ni en el registro

/* El mundo: la base (un PostgREST de mentiras con sus vistas), la hoja (la ruta de verdad sobre la hoja de mentiras), el reloj
   (que solo se mueve cuando algo tarda) y la función con todo inyectado. `guion(n, cuerpo)` decide, para la llamada n a la hoja,
   si en vez de contestar de verdad pasa otra cosa. */
function mundo({ ventas = [], abonos = [], hojaOpts = {}, limites = {}, latenciaMs = 0, envExtra = {}, base: baseExterna = null } = {}) {
  const reloj = { t: RELOJ0 };
  const H = hoja(hojaOpts);
  const pg = crearPostgrest({ ventas, abonos, ahora: () => reloj.t });
  const entorno = n => ({ SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_ROLE_KEY: LLAVE_SERVICIO, ESPEJO_SECRETO_FUNCION: SECRETO_FUNCION, ESPEJO_URL: URL_HOJA, ESPEJO_SECRETO: SECRETO_HOJA, ...envExtra })[n];
  const w = { H, pg, reloj, llamadas: [], esperas: [], logs: [], respuestas: [], guion: null, entorno };
  w.base = baseExterna || crearBaseEspejo({ entorno, fetch: pg.fetch });
  w.fetchHoja = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    w.llamadas.push({ url, init, cuerpo });
    reloj.t += latenciaMs;
    const forzada = w.guion ? w.guion(w.llamadas.length, cuerpo, H, init) : null;
    if (forzada) return forzada();
    return new Response(JSON.stringify(H.doPost(init.body)), { status: 200 });
  };
  w.deps = { fetch: w.fetchHoja, ahora: () => reloj.t, dormir: async ms => { w.esperas.push(ms); reloj.t += ms; }, entorno, base: w.base, limites, registrar: (nivel, linea) => w.logs.push(linea) };
  w.cfg = () => leerConfig(entorno, limites);
  w.correr = (pedido = {}) => sincronizar(w.deps, w.cfg(), pedido);
  w.cursor = clave => (pg.contadores.get('*|' + clave + '|') || {}).texto;
  w.http = async (cabeceras, cuerpo, metodo = 'POST') => {
    const r = await manejar(new Request('https://funcion.test/functions/v1/espejo', { method: metodo, headers: cabeceras, ...(cuerpo !== undefined && metodo !== 'GET' ? { body: cuerpo } : {}) }), w.deps);
    const texto = await r.text();
    w.respuestas.push(texto);
    return { status: r.status, texto, json: (() => { try { return JSON.parse(texto); } catch (_) { return null; } })(), cab: r.headers };
  };
  w.autorizado = (cuerpo) => w.http({ [CABECERA_SECRETO]: SECRETO_FUNCION }, cuerpo);
  MUNDOS.push(w);
  return w;
}
const codigoHttp = r => respuestaDe(r).status;
const lanzaRed = () => () => { throw new TypeError('fetch failed'); };
const pagina = (texto, status = 200) => () => new Response(texto, { status });
const jsonDe = (o, status = 200) => () => new Response(JSON.stringify(o), { status });

{
  /* ── la carga inicial ── */
  const ventas = [filaVista('V-001', -600), filaVista('V-002', -500), filaVista('V-003', -400), filaVista('V-004', -300), filaVista('V-005', -200)];
  const abonos = [abVista(1, 'V-001', -590, 100), abVista(2, 'V-001', -580, 200), abVista(3, 'V-002', -450, 50), abVista(4, 'V-004', -290, 75), abVista(5, 'V-004', -280, 25), abVista(6, 'V-004', -270, 10)];
  const w = mundo({ ventas, abonos, limites: { tamPagina: 2 } }); centinelas(w.H);
  const f0 = formulasDe(w.H);
  const r = await w.correr();
  eq('la primera corrida (sin cursor) lo manda todo, página por página, y sale bien', [r.ok, r.modo, r.parcial, r.error], [true, 'incremental', false, null]);
  eq('  las cinco ventas están en la hoja, cada una con sus datos', [1, 2, 3, 4, 5].map(i => leer(w.H, 'V-00' + i, 'Proyecto')), [1, 2, 3, 4, 5].map(i => 'Ana - Café V-00' + i));
  eq('  y los abonos de cada folio, completos y sin repetirse (V-004 llegó en dos páginas)', ['V-001', 'V-002', 'V-004'].map(f => abonosDe(w.H, f).map(x => x[0])), [[100, 200], [50], [75, 25, 10]]);
  cierto('  las fórmulas no se tocaron', formulasDe(w.H) === f0);
  eq('  ventas: 3 páginas (2, 2 y 1 filas) y 3 lotes; abonos: 4 páginas (la última, vacía) y 3 lotes; cada flujo quedó al día',
     [r.flujos.ventas.paginas, r.flujos.ventas.lotes, r.flujos.abonos.paginas, r.flujos.abonos.lotes, r.flujos.ventas.alDia, r.flujos.ventas_dinero.alDia, r.flujos.abonos.alDia], [3, 3, 4, 3, true, true, true]);
  eq('  el cursor de cada flujo quedó en la ÚLTIMA fila, con la hora tal cual la dio la base', [w.cursor('espejo:ventas'), w.cursor('espejo:ventas_dinero'), w.cursor('espejo:abonos')], [hora(-200) + '|V-005', hora(-200) + '|V-005', hora(-270) + '|6']);
  eq('  la reconciliación completa NO se marca (no se pidió ni había una a medias)', w.cursor('espejo:completo'), undefined);
  const corrida = JSON.parse(w.cursor('espejo:corrida'));
  eq('  y se anotó cómo quedó la corrida (para «estado»)', [corrida.ok, corrida.modo, corrida.parcial, corrida.error, corrida.ultimo_ok === corrida.t], [true, 'incremental', false, null, true]);
  eq('  cada llamada a la hoja fue un POST de texto, a la dirección de ESPEJO_URL, con el secreto y un id de lote que dice la hora y el número', [
    w.llamadas.every(l => l.url === URL_HOJA), w.llamadas.every(l => l.init.method === 'POST' && l.init.redirect === 'follow' && l.init.headers['Content-Type'] === 'text/plain;charset=utf-8'),
    w.llamadas.every(l => l.cuerpo.ruta === 'espejo' && l.cuerpo.secreto === SECRETO_HOJA), /^esp-20261010T150000-001$/.test(w.llamadas[0].cuerpo.lote.id), w.llamadas.length,
  ], [true, true, true, true, 9]);
  eq('  y lo que se mandó son SOLO las columnas capturadas (ni empresa, ni horas, ni una fórmula)', [...new Set(w.llamadas.flatMap(l => l.cuerpo.lote.ventas.flatMap(v => Object.keys(v))))].sort(), E.COLUMNAS_VENTAS.map(c => c[0]).sort());

  /* ── nada nuevo: lo que cae dentro del solape se vuelve a mandar y no cambia nada ── */
  const log = espiar(w.H); const antes = foto(w.H); const c0 = [w.cursor('espejo:ventas'), w.cursor('espejo:abonos')];
  w.llamadas.length = 0; const n0 = w.pg.pedidos.length;
  const r2 = await w.correr();
  eq('la segunda corrida, sin cambios, relee SOLO lo que cae en los 30 segundos del solape (la última venta en cada flujo de ventas y los tres abonos del final), y no escribe ni una celda de datos', [r2.ok, w.llamadas.length, escrituras(log).length, celdasQueCambiaron(antes, foto(w.H))], [true, 4, 0, []]);
  eq('  el cursor no se movió (ni hacia atrás)', [w.cursor('espejo:ventas'), w.cursor('espejo:abonos')], c0);
  const primeraDeVentas = decodeURIComponent(w.pg.pedidos.slice(n0).find(p => p.ruta.endsWith('espejo_ventas')).consulta);
  eq('  y pidió desde el piso: el cursor menos 30 s (14:56:40 - 30 s)', primeraDeVentas.match(/&updated_at=gte.([^&]*)/)[1], '2026-10-10T14:56:10.000Z');

  /* ── una venta cambia ── */
  w.pg.ventas.find(f => f.a_folio === 'V-002').c_estatus = 'LIQUIDADO'; w.pg.ventas.find(f => f.a_folio === 'V-002').updated_at = hora(10);
  w.llamadas.length = 0;
  const log3 = espiar(w.H);
  const r3 = await w.correr();
  eq('un cambio en la obra de V-002 (su hora avanza) llega a SU fila y solo a ella', [r3.ok, leer(w.H, 'V-002', 'Estatus'), filaDeVenta(w.H, 'V-002'), [...new Set(escrituras(log3).map(x => x.fila))]], [true, 'LIQUIDADO', 3, [3]]);
  eq('  y el cursor de ventas avanzó a esa fila', w.cursor('espejo:ventas'), hora(10) + '|V-002');
  eq('  mientras el del dinero, que no vio nada nuevo, no se movió', w.cursor('espejo:ventas_dinero'), hora(-200) + '|V-005');

  /* ── cambia SOLO el dinero: lo ve el flujo de la hora del dinero ── */
  const v3 = w.pg.ventas.find(f => f.a_folio === 'V-003'); v3.i_anticipo = 9999; v3.dinero_updated_at = hora(20);
  const r4 = await w.correr();
  eq('un cambio que solo toca ventas_dinero (la hora de la obra no se mueve) lo atrapa el flujo del dinero', [r4.ok, leer(w.H, 'V-003', 'Anticipo'), w.cursor('espejo:ventas_dinero')], [true, 9999, hora(20) + '|V-003']);
  cierto('  y el de la obra no lo vio (por eso hacen falta los dos flujos)', w.cursor('espejo:ventas') === hora(10) + '|V-002');

  /* ── un abono nuevo en un folio que ya tenía ── */
  w.pg.abonos.push(abVista(7, 'V-002', 30, 25));
  w.llamadas.length = 0;
  const r5 = await w.correr();
  eq('un abono nuevo de V-002 llega y se agrega UNA vez (la base manda el conjunto del folio: el viejo ya estaba)', [r5.ok, abonosDe(w.H, 'V-002').map(x => x[0]), abonosDe(w.H, 'V-004').map(x => x[0])], [true, [50, 25], [75, 25, 10]]);
  eq('  y el cursor de abonos avanzó', w.cursor('espejo:abonos'), hora(30) + '|7');
  const grupoEnviado = w.llamadas.flatMap(l => l.cuerpo.lote.abonos).find(g => g.a_folio === 'V-002');
  eq('  se mandó el CONJUNTO del folio (los dos abonos), no solo el nuevo', grupoEnviado.abonos.map(a => a.c_importe), [50, 25]);

  /* ── el solape: una fila que confirmó tarde, con hora anterior al cursor ── */
  const cursorAntes = w.cursor('espejo:ventas');
  w.pg.ventas.push(filaVista('V-006', 0));                      // 10 s ANTES del cursor (hora(10)): confirmó tarde, dentro del solape
  w.pg.ventas.push(filaVista('V-007', -60));                    // 70 s antes: fuera del solape
  const r6 = await w.correr();
  eq('una fila que confirmó tarde con una hora 10 s anterior al cursor SÍ se atrapa (el solape de 30 s)', [r6.ok, leer(w.H, 'V-006', 'Proyecto')], [true, 'Ana - Café V-006']);
  eq('  una de 70 s antes NO la ve ninguna corrida incremental (de eso se encarga la completa)', leer(w.H, 'V-007', 'Proyecto'), undefined);
  eq('  y el cursor no retrocedió por haber releído una más vieja', w.cursor('espejo:ventas'), cursorAntes);

  /* ── a mano en la hoja: ninguna corrida incremental lo ve; la completa lo corrige ── */
  w.H.v._g[filaDeVenta(w.H, 'V-001')][3] = 'REPARANDO';         // alguien cambió el estatus de V-001 en la hoja
  w.H.v._g[filaDeVenta(w.H, 'V-001')][10] = 123;                // y la liquidación
  w.H.abonos._g[9][1] = 'V-001'; w.H.abonos._g[9][3] = 31; w.H.abonos._g[9][4] = new Date(2026, 9, 9);   // y le sumó un abono a V-001
  const r7 = await w.correr();
  eq('lo que alguien edita a mano en una fila que la base no vuelve a tocar NO lo corrige una corrida incremental', [r7.ok, leer(w.H, 'V-001', 'Estatus'), leer(w.H, 'V-001', 'Liquidacion'), abonosDe(w.H, 'V-001').length], [true, 'REPARANDO', 123, 3]);
  const llamadasAntes = w.llamadas.length; w.llamadas.length = 0;
  const cursoresAntes = [w.cursor('espejo:ventas'), w.cursor('espejo:abonos')];
  const rc = await w.correr({ modo: 'completo' });
  eq('la reconciliación COMPLETA sí: devuelve la fila a lo que dice la base, y quita el abono de más', [rc.ok, rc.modo, leer(w.H, 'V-001', 'Estatus'), leer(w.H, 'V-001', 'Liquidacion'), abonosDe(w.H, 'V-001').map(x => x[0])], [true, 'completo', 'COBRANDO', 0, [100, 200]]);
  eq('  la completa trae también lo que ningún cursor veía (la de 70 s antes)', leer(w.H, 'V-007', 'Proyecto'), 'Ana - Café V-007');
  eq('  no corre el flujo del dinero (el de la obra, desde cero, ya cubre todas las filas)', Object.keys(rc.flujos), ['ventas', 'abonos']);
  cierto('  empezó de cero y terminó: la reconciliación quedó «listo» y los cursores están otra vez en lo último', /^listo|2026-10-10T15:/.test(w.cursor('espejo:completo')) && w.cursor('espejo:ventas') === hora(10) + '|V-002');
  cierto('  y ese lote lleva «modo: completo»', w.llamadas.every(l => l.cuerpo.lote.modo === 'completo'));
  eq('  la nota de AJ3 de la hoja dice que fue completa', /^ok · completa/.test(w.H.v._g[3][36]), true);
}

{
  /* ── el cursor solo avanza después de que la hoja confirmó ── */
  const ventas = [filaVista('V-001', -600), filaVista('V-002', -500), filaVista('V-003', -400), filaVista('V-004', -300), filaVista('V-005', -200)];
  const w = mundo({ ventas, limites: { tamPagina: 2 } });
  w.guion = n => (n >= 2 && n <= 4 ? lanzaRed() : null);          // la 2.ª página (llamadas 2, 3 y 4 = los tres intentos) no llega a la hoja
  const r = await w.correr({ flujos: ['ventas'] });
  eq('si la hoja no contesta en los tres intentos de la 2.ª página, la corrida falla con SIN_RED (502) y lo dice', [r.ok, r.error.clase, respuestaDe(r).status, respuestaDe(r).cuerpo.codigo, respuestaDe(r).cuerpo.transitorio, w.llamadas.length], [false, 'red', 502, 'SIN_RED', true, 4]);
  eq('  se esperó entre intentos 1 s y 3 s', w.esperas, [1000, 3000]);
  eq('  el cursor se quedó donde estaba: en la última fila de la página que SÍ se confirmó (V-002)', w.cursor('espejo:ventas'), hora(-500) + '|V-002');
  eq('  la hoja tiene lo confirmado y nada más', [1, 2, 3].map(i => leer(w.H, 'V-00' + i, 'Proyecto') !== undefined), [true, true, false]);
  w.guion = null; w.llamadas.length = 0;
  const r2 = await w.correr({ flujos: ['ventas'] });
  eq('en cuanto la hoja vuelve, la siguiente corrida sigue desde ahí: no se perdió nada y el cursor llega al final', [r2.ok, [1, 2, 3, 4, 5].map(i => leer(w.H, 'V-00' + i, 'Proyecto') !== undefined), w.cursor('espejo:ventas')], [true, [true, true, true, true, true], hora(-200) + '|V-005']);
  cierto('  (el error de la primera quedó anotado y el de la segunda no)', JSON.parse(w.cursor('espejo:corrida')).error === null && JSON.parse(w.cursor('espejo:corrida')).ok === true);
}
{
  /* ── el cursor nunca retrocede: una corrida que relee el solape y se cae a la mitad no deja el cursor más atrás ── */
  const ventas = [filaVista('V-001', -30), filaVista('V-002', -20), filaVista('V-003', -10)];            // las tres dentro de los 30 s del solape
  const w = mundo({ ventas, limites: { tamPagina: 2, intentos: 1 } });
  await w.correr({ flujos: ['ventas'] });
  const antes = w.cursor('espejo:ventas');
  w.guion = n => (n >= 2 ? lanzaRed() : null);                                                           // la 2.ª página de la corrida siguiente no llega
  w.llamadas.length = 0;                                                                                // (n cuenta las llamadas desde aquí)
  const r = await w.correr({ flujos: ['ventas'] });
  eq('la corrida siguiente relee las tres (el solape), confirma la 1.ª página, se cae en la 2.ª, y el cursor NO retrocede a la última fila de la 1.ª', [antes, r.ok, w.cursor('espejo:ventas')], [hora(-10) + '|V-003', false, hora(-10) + '|V-003']);
}
{
  /* ── la hoja aplicó el lote pero la respuesta se perdió: el reintento no duplica ── */
  const w = mundo({ ventas: [filaVista('V-001', -100)], abonos: [abVista(1, 'V-001', -90, 100), abVista(2, 'V-001', -80, 200)], limites: { tamPagina: 5 } });
  w.guion = (n, cuerpo, H, init) => (n === 1 ? () => { H.doPost(init.body); throw new TypeError('fetch failed'); } : null);    // la llamada 1 (los abonos) se aplica y la respuesta se pierde
  const r = await w.correr({ flujos: ['abonos'] });
  eq('la hoja aplicó el lote y la respuesta se perdió: el reintento lo manda otra vez y NO duplica los abonos', [r.ok, w.llamadas.length, abonosDe(w.H, 'V-001').map(x => x[0])], [true, 2, [100, 200]]);
}

{
  /* ── cada tipo de respuesta de la hoja ── */
  const caso = async (que, guion, esperado, extra = {}) => {
    const w = mundo({ ventas: [filaVista('V-001', -100)], limites: { tamPagina: 5, ...extra } });
    w.guion = guion;
    const r = await w.correr({ flujos: ['ventas'] });
    const rr = respuestaDe(r);
    eq(que, [r.ok, rr.status, r.ok ? null : rr.cuerpo.codigo, w.llamadas.length, w.esperas, w.cursor('espejo:ventas')], esperado(w));
    return { w, r };
  };
  await caso('dos fallos de red y a la tercera sale: 3 llamadas del flujo de la obra y 1 del del dinero, esperando 1 s y 3 s, y el cursor avanza', n => (n <= 2 ? lanzaRed() : null), () => [true, 200, null, 4, [1000, 3000], hora(-100) + '|V-001']);
  await caso('una página de Google (200 sin JSON) tres veces: se reintenta y falla SIN_RED, sin mover el cursor', () => pagina('<html>Servicio no disponible</html>'), () => [false, 502, 'SIN_RED', 3, [1000, 3000], undefined]);
  await caso('un 503 tres veces: igual', () => pagina('x', 503), () => [false, 502, 'SIN_RED', 3, [1000, 3000], undefined]);
  await caso('un 404 (la dirección del despliegue está mal) NO se reintenta', () => pagina('no existe', 404), () => [false, 502, 'SIN_RED', 1, [], undefined]);
  await caso('la hoja ocupada (SIN_RED) tres veces: se reintenta y falla', () => jsonDe({ ok: false, codigo: 'SIN_RED', mensaje: 'ocupada' }), () => [false, 502, 'SIN_RED', 3, [1000, 3000], undefined]);
  await caso('la caída a la mitad (DESCONOCIDO) se reintenta; a la segunda sale', n => (n === 1 ? jsonDe({ ok: false, codigo: 'DESCONOCIDO', parcial: true }) : null), () => [true, 200, null, 3, [1000], hora(-100) + '|V-001']);
  await caso('el secreto no aceptado (ROL_SIN_PERMISO) NO se reintenta: AUTENTICACION_HOJA y el cursor sin moverse', () => jsonDe({ ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'x' }), () => [false, 502, 'AUTENTICACION_HOJA', 1, [], undefined]);
  await caso('la hoja que no es espejo (ESPEJO_APAGADO): 409 y nada reintentado', () => jsonDe({ ok: false, codigo: 'ESPEJO_APAGADO', mensaje: 'x' }), () => [false, 409, 'ESPEJO_APAGADO', 1, [], undefined]);
  await caso('la hoja sin preparar (ESQUEMA_INCOMPLETO): 409', () => jsonDe({ ok: false, codigo: 'ESQUEMA_INCOMPLETO', mensaje: 'x' }), () => [false, 409, 'ESQUEMA_INCOMPLETO', 1, [], undefined]);
  await caso('un solo intento si así se configura (intentos: 1)', () => lanzaRed(), () => [false, 502, 'SIN_RED', 1, [], undefined], { intentos: 1 });
}
{
  const w = mundo({ ventas: [filaVista('V-001', -100)], hojaOpts: { modo: false }, limites: { tamPagina: 5 } });
  const r = await w.correr({ flujos: ['ventas'] });
  eq('con la hoja de verdad SIN MODO_ESPEJO la función se entera (409 ESPEJO_APAGADO) y la hoja queda intacta', [r.ok, respuestaDe(r).status, r.error.clase, w.H.celda('V-001', 'Proyecto')], [false, 409, 'apagado', undefined]);
  const w2 = mundo({ ventas: [filaVista('V-001', -100)], envExtra: { ESPEJO_SECRETO: 'x'.repeat(40) }, limites: { tamPagina: 5 } });
  const r2 = await w2.correr({ flujos: ['ventas'] });
  eq('con un ESPEJO_SECRETO que no es el de la hoja, la hoja contesta lo de siempre y la función dice AUTENTICACION_HOJA (502), sin reintentar', [r2.ok, respuestaDe(r2).status, respuestaDe(r2).cuerpo.codigo, w2.llamadas.length], [false, 502, 'AUTENTICACION_HOJA', 1]);
}

{
  /* ── CAPACIDAD_AGOTADA: se detiene, no pierde nada, y los demás flujos siguen ── */
  const nuevas = [filaVista('V-9001', -100), filaVista('V-9002', -90), filaVista('V-9003', -80)];
  const w = mundo({ ventas: nuevas, abonos: [abVista(1, 'V-1002', -50, 77)], limites: { tamPagina: 2 } });
  for (let f = 2; f <= 310; f++) ponFila(w.H, f, venta('V-' + String(1000 + f)));
  const antes = foto(w.H);
  const r = await w.correr();
  const rr = respuestaDe(r);
  eq('con la hoja llena, la corrida se detiene con 507 CAPACIDAD_AGOTADA y lo dice con todas sus letras', [r.ok, rr.status, rr.cuerpo.codigo, rr.cuerpo.capacidad_agotada, r.error.clase], [false, 507, 'CAPACIDAD_AGOTADA', true, 'capacidad']);
  eq('  dice cuáles ventas no cupieron y cuántas filas libres hay', [r.error.capacidad.ventas.sin_lugar, r.error.capacidad.ventas.libres, r.error.capacidad.ventas.fin], [['V-9001', 'V-9002'], 0, 310]);
  eq('  no escribió ninguna de las ventas nuevas, y el cursor de ventas ni se movió (no hay nada confirmado)', [w.H.celda('V-9001', 'Proyecto'), w.H.celda('V-9002', 'Proyecto'), w.cursor('espejo:ventas')], [undefined, undefined, undefined]);
  eq('  los abonos —otro flujo— siguieron y quedaron al día (la capacidad de una pestaña no frena la otra)', [r.flujos.abonos.alDia, abonosDe(w.H, 'V-1002').map(x => x[0]), w.cursor('espejo:abonos')], [true, [77], hora(-50) + '|1']);
  cierto('  y las filas de ventas siguen exactamente como estaban', celdasQueCambiaron(antes, foto(w.H)).every(c => c.startsWith('a:')));
  /* Se sube FIN (aquí: se liberan filas) y la siguiente corrida manda lo que faltaba, sola. */
  for (const f of [300, 301, 302]) quitarFila(w.H, f);
  const r2 = await w.correr();
  eq('en cuanto hay filas libres la siguiente corrida manda lo que no cupo, SIN que nadie lo pida', [r2.ok, ['V-9001', 'V-9002', 'V-9003'].map(f => w.H.celda(f, 'Proyecto') !== undefined), w.cursor('espejo:ventas')], [true, [true, true, true], hora(-80) + '|V-9003']);
}

{
  /* ── una fila que la hoja rechaza no frena a las demás ── */
  const ventas = [filaVista('V-001', -400), filaVista('V-002', -300), filaVista('V-003', -200, { c_estatus: 'EN PROCESO' }), filaVista('V-004', -100)];
  const w = mundo({ ventas, limites: { tamPagina: 4 } });
  const r = await w.correr({ flujos: ['ventas'] });
  eq('una venta con un estatus que no existe en la hoja se aparta; las otras tres entran y la corrida sale ok', [r.ok, [1, 2, 3, 4].map(i => w.H.celda('V-00' + i, 'Proyecto') !== undefined)], [true, [true, true, false, true]]);
  eq('  se dice cuál fue y por qué, en la respuesta', r.rechazadas.map(x => [x.flujo, x.folio, /no es un estatus/.test(x.por)]), [['ventas', 'V-003', true]]);
  eq('  el cursor avanzó POR ENCIMA de la rechazada (no se atora)', w.cursor('espejo:ventas'), hora(-100) + '|V-004');
  eq('  y quedó anotada en la base (espejo:rechazadas), para «estado» y para la próxima', JSON.parse(w.cursor('espejo:rechazadas')).map(x => [x.g, x.f]), [['ventas', 'V-003']]);
  /* Se corrige el dato en la base: su hora avanza y la siguiente corrida la manda. */
  const v3 = w.pg.ventas.find(f => f.a_folio === 'V-003'); v3.c_estatus = 'COBRANDO'; v3.updated_at = hora(5);
  const r2 = await w.correr({ flujos: ['ventas'] });
  eq('al corregir el dato en la base la siguiente corrida la manda y la quita de las rechazadas', [r2.ok, w.H.celda('V-003', 'Proyecto'), r2.rechazadas, w.cursor('espejo:rechazadas')], [true, 'Ana - Café V-003', [], '']);
  /* El mismo dato malo en el flujo del dinero también se aparta una sola vez. */
  const w2 = mundo({ ventas: [filaVista('V-001', -100, { d_cuenta: 'Otro Banco' })], limites: { tamPagina: 4 } });
  const rb = await w2.correr();
  eq('la misma fila mala, vista por los dos flujos de ventas, es UNA rechazada', [rb.ok, rb.rechazadas.length, rb.flujos.ventas.alDia, rb.flujos.ventas_dinero.alDia], [true, 1, true, true]);
  /* Un rechazo global (sin decir cuáles filas) sí detiene el flujo, y no se manda nada más de él. */
  const w3 = mundo({ ventas: [filaVista('V-001', -100)], abonos: [abVista(1, 'V-001', -90, 5)], limites: { tamPagina: 4 } });
  w3.guion = (n, cuerpo) => (cuerpo.lote.ventas.length ? jsonDe({ ok: false, codigo: 'DATO_INVALIDO', motivo: 'formulas', mensaje: 'El lote intenta escribir columnas de fórmula.' }) : null);
  const rg = await w3.correr();
  eq('un DATO_INVALIDO sin lista de filas (por ejemplo «formulas») detiene ese flujo con 422, y el cursor no avanza', [rg.ok, respuestaDe(rg).status, rg.error.clase, rg.error.motivo, w3.cursor('espejo:ventas')], [false, 422, 'invalido', 'formulas', undefined]);
  eq('  los abonos, que son otro flujo, siguen', [rg.flujos.abonos.alDia, abonosDe(w3.H, 'V-001').length], [true, 1]);
  const w4 = mundo({ ventas: [filaVista('V-001', -100)], limites: { tamPagina: 4 } });
  w4.guion = () => jsonDe({ ok: false, codigo: 'DATO_INVALIDO', rechazadas: [{ flujo: 'ventas', folio: 'V-777', por: 'no es de este lote' }] });
  const r4 = await w4.correr({ flujos: ['ventas'] });
  eq('si la hoja rechaza un folio que no está en el lote no se puede apartar nada: falla con 422 (no entra en un ciclo)', [r4.ok, respuestaDe(r4).status, w4.llamadas.length], [false, 422, 2]);
}

{
  /* ── el tiempo ── */
  const ventas = Array.from({ length: 6 }, (_, i) => filaVista('V-' + String(100 + i), -600 + i * 60));
  const w = mundo({ ventas, limites: { tamPagina: 1, presupuestoMs: 4000 }, latenciaMs: 1500 });
  const r = await w.correr({ flujos: ['ventas'] });
  eq('con 1.5 s por llamada y un presupuesto de 4 s la corrida para a tiempo, sin error, y dice que quedó parcial', [r.ok, r.parcial, respuestaDe(r).status, w.llamadas.length, r.flujos.ventas.parcial], [true, true, 200, 3, true]);
  eq('  lo confirmado quedó en la hoja y el cursor lo sabe; lo que falta, no', [[0, 1, 2, 3].map(i => w.H.celda('V-' + (100 + i), 'Proyecto') !== undefined), w.cursor('espejo:ventas')], [[true, true, true, false], hora(-600 + 2 * 60) + '|V-102']);
  const r2 = await w.correr({ flujos: ['ventas'] });
  const r3 = await w.correr({ flujos: ['ventas'] });
  eq('las siguientes corridas siguen donde se quedó el cursor, y la hoja termina completa', [r2.ok, r3.ok, ventas.every((f, i) => w.H.celda('V-' + (100 + i), 'Proyecto') !== undefined)], [true, true, true]);
}
{
  /* ── la reconciliación completa que no cabe en una corrida se reanuda sola ── */
  const ventas = Array.from({ length: 8 }, (_, i) => filaVista('V-' + String(100 + i), -900 + i * 60));
  const w = mundo({ ventas, limites: { tamPagina: 2, presupuestoMs: 4000 }, latenciaMs: 1500 });
  for (let f = 2; f <= 9; f++) ponFila(w.H, f, venta('V-' + String(100 + f - 2), { c_estatus: 'REPARANDO' }));       // la hoja entera está «desviada»
  const r = await w.correr({ modo: 'completo', flujos: ['ventas'] });
  eq('una completa que no cabe en el presupuesto termina parcial, ok, y queda marcada «en_curso»', [r.ok, r.parcial, /^en_curso\|2026-10-10T15:00:00/.test(w.cursor('espejo:completo'))], [true, true, true]);
  const cursorMedio = w.cursor('espejo:ventas');
  cierto('  con los cursores donde alcanzó (no se quedaron en cero): tres páginas de dos', !!cursorMedio && cursorMedio.endsWith('|V-105'));
  w.llamadas.length = 0;
  const r2 = await w.correr({ modo: 'completo', flujos: ['ventas'] });
  cierto('  la SIGUIENTE petición completa NO vuelve a empezar de cero: sigue desde el cursor (su primer lote no es el primero)', r2.ok === true && w.llamadas.length >= 1 && !w.llamadas[0].cuerpo.lote.ventas.some(v => v.a_folio === 'V-100'));
  let r3 = r2; for (let i = 0; i < 3 && /^en_curso/.test(w.cursor('espejo:completo')); i++) r3 = await w.correr({ modo: 'completo', flujos: ['ventas'] });
  eq('hasta que termina: «listo», y toda la hoja quedó como la base', [/^listo\|/.test(w.cursor('espejo:completo')), ventas.every((f, i) => leer(w.H, 'V-' + (100 + i), 'Estatus') === 'COBRANDO')], [true, true]);
  w.llamadas.length = 0;
  const r4 = await w.correr({ modo: 'completo', flujos: ['ventas'] });
  cierto('  y una completa NUEVA, ya terminada la anterior, vuelve a empezar de cero (su primer lote trae la primera venta)', r4.ok === true && w.llamadas.length > 0 && w.llamadas[0].cuerpo.lote.ventas.some(v => v.a_folio === 'V-100'));
}

{
  /* ── la base falla ── */
  const w = mundo({ ventas: [filaVista('V-001', -100)] });
  const mala = { ...w.base, leerPagina: async () => { throw new ErrorDeBase('La base contestó 503', { status: 503 }); } };
  w.deps.base = mala;
  const r = await w.correr();
  eq('si la base no contesta: BASE_NO_CONTESTA (502), no se llamó a la hoja y no se tocó ningún cursor', [r.ok, r.error.clase, respuestaDe(r).status, respuestaDe(r).cuerpo.codigo, w.llamadas.length, [...w.pg.contadores.keys()].filter(k => k.includes('espejo:ventas|'))], [false, 'base', 502, 'BASE_NO_CONTESTA', 0, []]);
  const w2 = mundo({ ventas: [filaVista('V-001', -100)], abonos: [abVista(1, 'V-001', -90, 5)] });
  const sana = w2.base; let fallar = true;
  w2.deps.base = { ...sana, guardarCursor: async (c, t) => { if (fallar && c.startsWith('espejo:ventas')) throw new ErrorDeBase('x'); return sana.guardarCursor(c, t); } };
  const r2 = await w2.correr({ flujos: ['ventas'] });
  eq('si la base falla al guardar el cursor, la hoja ya tiene el lote pero el cursor NO avanza: se repite y no pasa nada', [r2.ok, r2.error.clase, leer(w2.H, 'V-001', 'Proyecto'), w2.cursor('espejo:ventas')], [false, 'base', 'Ana - Café V-001', undefined]);
  fallar = false;
  const r3 = await w2.correr({ flujos: ['ventas'] });
  eq('  la siguiente corrida lo repite sin duplicar nada y deja el cursor', [r3.ok, leer(w2.H, 'V-001', 'Proyecto'), w2.cursor('espejo:ventas')], [true, 'Ana - Café V-001', hora(-100) + '|V-001']);
}

{
  /* ── el tamaño: lotes que caben en los 64 KB de la hoja ── */
  const ventas = Array.from({ length: 12 }, (_, i) => filaVista('V-' + String(100 + i), -600 + i * 10, { ag_notas: String.fromCharCode(65 + i).repeat(20000) }));
  const w = mundo({ ventas, limites: { tamPagina: 40 } });
  const r = await w.correr({ flujos: ['ventas'] });
  const pesos = w.llamadas.map(l => JSON.stringify(l.cuerpo).length);
  eq('12 ventas con notas de 20 000 caracteres (240 000 en total) se mandan en lotes de a lo más 2: ningún cuerpo pasa de 65 536', [r.ok, Math.max(...pesos) < 65536, w.llamadas.length >= 12], [true, true, true]);
  eq('  y las doce notas llegaron enteras a la hoja', ventas.map((f, i) => (leer(w.H, 'V-' + (100 + i), 'Notas') || '').length), Array(12).fill(20000));
  const w2 = mundo({ ventas: [filaVista('V-001', -100), filaVista('V-002', -90, { ag_notas: 'x'.repeat(70000) }), filaVista('V-003', -80)], limites: { tamPagina: 40 } });
  const r2 = await w2.correr({ flujos: ['ventas'] });
  eq('una fila que ella sola pesa más de lo que cabe en un lote se aparta y se reporta; las otras entran, y el cursor sigue', [r2.ok, r2.rechazadas.map(x => [x.folio, x.por]), w2.H.celda('V-001', 'Proyecto') !== undefined, w2.H.celda('V-003', 'Proyecto') !== undefined, w2.cursor('espejo:ventas')],
     [true, [['V-002', 'la fila pesa demasiado para un lote']], true, true, hora(-80) + '|V-003']);
}

{
  /* ── muchos abonos por folio: la hoja rechaza más de 400 renglones por lote, y la función no se los manda ── */
  const abonos = []; let id = 0;
  for (let f = 0; f < 12; f++) for (let k = 0; k < 40; k++) abonos.push(abVista(++id, 'V-' + String(100 + f), -900 + id, 10 + k, { e_nota: 'abono ' + k }));
  const w = mundo({ abonos, limites: { tamPagina: 500 } });
  const r = await w.correr({ flujos: ['abonos'] });
  const filasPorLote = w.llamadas.map(l => l.cuerpo.lote.abonos.reduce((n, g) => n + g.abonos.length, 0));
  eq('12 folios con 40 abonos cada uno (480 renglones en una sola página) se mandan en lotes de a lo más 350 renglones: la hoja no rechaza ninguno', [r.ok, Math.max(...filasPorLote) <= 350, filasPorLote.length, r.error], [true, true, 2, null]);
  eq('  y los 480 abonos están en la hoja, doce folios completos', [Array.from({ length: 12 }, (_, f) => abonosDe(w.H, 'V-' + (100 + f)).length), r.rechazadas], [Array(12).fill(40), []]);
}

{
  /* ── sin nada que mandar: el latido ── */
  const w = mundo({ limites: { tamPagina: 5 } });
  const r = await w.correr();
  eq('con la base vacía no hay nada que mandar: un latido (lote vacío) que verifica el camino y deja la marca', [r.ok, r.enviados, r.latido, w.llamadas.length, w.llamadas[0].cuerpo.lote], [true, 0, true, 1, { id: 'latido-20261010T150000', modo: 'incremental', ventas: [], abonos: [] }]);
  cierto('  y la hoja puso su marca de última sincronización', typeof w.H.v._g[2][36].getTime === 'function' && /^ok ·/.test(w.H.v._g[3][36]));
  const w2 = mundo({ limites: { tamPagina: 5 } }); w2.guion = () => lanzaRed();
  const r2 = await w2.correr();
  eq('si el latido no llega, la corrida falla: así se nota que la hoja no contesta aunque no haya cambios', [r2.ok, r2.error.flujo, respuestaDe(r2).status, w2.llamadas.length], [false, 'latido', 502, 3]);
}

{
  /* ── los dos flujos que se piden ── */
  const w = mundo({ ventas: [filaVista('V-001', -100)], abonos: [abVista(1, 'V-001', -90, 5)] });
  const r = await w.correr({ flujos: ['abonos'] });
  eq('se puede pedir solo uno de los flujos', [Object.keys(r.flujos), w.H.celda('V-001', 'Proyecto'), abonosDe(w.H, 'V-001').length], [['abonos'], undefined, 1]);
  const r2 = await w.correr({ flujos: ['ventas'] });
  eq('  o el otro', [Object.keys(r2.flujos), w.H.celda('V-001', 'Proyecto')], [['ventas', 'ventas_dinero'], 'Ana - Café V-001']);
}

/* ===========================================================================
   15. LA PUERTA HTTP DE LA FUNCIÓN
   =========================================================================== */
console.log('\n15. LA PUERTA HTTP — el secreto de la función, el cuerpo, la configuración y que ningún secreto salga');
{
  const ventas = [filaVista('V-001', -100)];
  const bueno = { [CABECERA_SECRETO]: SECRETO_FUNCION };
  const w0 = mundo({ ventas, limites: { tamPagina: 5 } });
  const referencia = { ok: false, codigo: 'SIN_SESION', mensaje: 'No autorizado.', definitivo: false };

  const get = await w0.http(bueno, undefined, 'GET');
  eq('un GET (o cualquier método que no sea POST) es 405, con Allow', [get.status, get.cab.get('allow'), get.json.codigo], [405, 'POST, OPTIONS', 'DATO_INVALIDO']);
  const pf = await w0.http({ origin: 'https://eliasgaribi-ctrl-z.github.io', 'access-control-request-method': 'POST' }, undefined, 'OPTIONS');
  eq('el preflight de un origen de la lista contesta 204 (lo de siempre de las funciones)', [pf.status, pf.cab.get('access-control-allow-origin')], [204, 'https://eliasgaribi-ctrl-z.github.io']);
  const raro = await w0.http({ ...bueno, origin: 'https://evil.example' }, '{}');
  eq('un origen de navegador que no es de la lista, 403, aunque traiga el secreto', [raro.status, raro.json.codigo, w0.llamadas.length], [403, 'ORIGEN_NO_PERMITIDO', 0]);

  const SIN = [
    ['sin cabecera', {}], ['cabecera vacía', { [CABECERA_SECRETO]: '' }], ['otro valor', { [CABECERA_SECRETO]: 'otro' }],
    ['el secreto con una letra de más', { [CABECERA_SECRETO]: SECRETO_FUNCION + 'x' }], ['con una de menos', { [CABECERA_SECRETO]: SECRETO_FUNCION.slice(0, -1) }],
    ['con la primera cambiada', { [CABECERA_SECRETO]: 'X' + SECRETO_FUNCION.slice(1) }], ['en minúsculas', { [CABECERA_SECRETO]: SECRETO_FUNCION.toLowerCase() }],
    ['el secreto de la HOJA en lugar del de la función', { [CABECERA_SECRETO]: SECRETO_HOJA }],
    ['la llave de servicio de la base', { [CABECERA_SECRETO]: LLAVE_SERVICIO }],
    ['el secreto en Authorization (no es la cabecera)', { authorization: 'Bearer ' + SECRETO_FUNCION }],
    ['el secreto en apikey', { apikey: SECRETO_FUNCION }],
  ];
  for (const [que, cab] of SIN) {
    const w = mundo({ ventas, limites: { tamPagina: 5 } });
    const r = await w.http(cab, '{}');
    eq(que + ': 401, siempre el mismo cuerpo, sin pistas, y no se tocó ni la base ni la hoja', [r.status, r.json, w.llamadas.length, w.pg.pedidos.length], [401, referencia, 0, 0]);
  }
  for (const [que, env, dado] of [
    ['sin la variable ESPEJO_SECRETO_FUNCION', { ESPEJO_SECRETO_FUNCION: '' }, SECRETO_FUNCION],
    ['con la variable corta (5 caracteres), aunque se mande igual', { ESPEJO_SECRETO_FUNCION: 'corta' }, 'corta'],
    ['con la variable de 31 caracteres, aunque se mande igual', { ESPEJO_SECRETO_FUNCION: 'x'.repeat(31) }, 'x'.repeat(31)],
    ['sin la variable y con la cabecera vacía', { ESPEJO_SECRETO_FUNCION: '' }, ''],
  ]) {
    const w = mundo({ ventas, envExtra: env, limites: { tamPagina: 5 } });
    const r = await w.http({ [CABECERA_SECRETO]: dado }, '{}');
    eq(que + ': la misma respuesta, no hay forma de distinguir «no está configurado» de «es otro»', [r.status, r.json, w.llamadas.length], [401, referencia, 0]);
  }
  /* La comparación es en tiempo constante: es la misma función que ya se probó contra el .gs. */
  cierto('handler.js compara el secreto con secretoValido (tiempo constante), no con ===', /secretoValido\(/.test(readFileSync(join(aqui, '..', 'supabase', 'functions', 'espejo', 'handler.js'), 'utf8')) && !/CABECERA_SECRETO\)[^;\n]*===/.test(readFileSync(join(aqui, '..', 'supabase', 'functions', 'espejo', 'handler.js'), 'utf8')));

  /* ── con el secreto bueno ── */
  const w = mundo({ ventas, abonos: [abVista(1, 'V-001', -90, 5)], limites: { tamPagina: 5 } });
  const r = await w.autorizado('');
  eq('con el secreto y sin cuerpo: sincroniza (incremental, los dos flujos) y contesta 200 con el resumen', [r.status, r.json.ok, r.json.modo, Object.keys(r.json.flujos), w.H.celda('V-001', 'Proyecto'), abonosDe(w.H, 'V-001').length], [200, true, 'incremental', ['ventas', 'ventas_dinero', 'abonos'], 'Ana - Café V-001', 1]);
  eq('  y la respuesta trae el resumen de cada flujo', [r.json.flujos.ventas.alDia, r.json.flujos.abonos.lotes, r.json.rechazadas, r.json.error, r.json.parcial, typeof r.json.duracion_ms], [true, 1, [], null, false, 'number']);
  eq('  nunca el contenido de las ventas, ni importes, ni nombres', [/Café|5800|10000|Vallarta|\+52/.test(r.texto)], [false]);
  cierto('  y las cabeceras: JSON, sin caché', /application\/json/.test(r.cab.get('content-type')) && r.cab.get('cache-control') === 'no-store');
  const rc = await w.autorizado('{"modo":"completo"}');
  eq('con {"modo":"completo"} corre la reconciliación completa', [rc.status, rc.json.modo, Object.keys(rc.json.flujos)], [200, 'completo', ['ventas', 'abonos']]);
  const rf = await mundo({ ventas, abonos: [abVista(1, 'V-001', -90, 5)], limites: { tamPagina: 5 } }).autorizado('{"flujos":["abonos"]}');
  eq('con {"flujos":["abonos"]} solo uno', Object.keys(rf.json.flujos), ['abonos']);

  for (const [que, cuerpo, mensaje] of [
    ['un cuerpo que no es JSON', '{', 'El cuerpo no es JSON.'],
    ['un cuerpo que es una lista', '[]', 'El cuerpo es un objeto JSON.'],
    ['un cuerpo que es un texto', '"completo"', 'El cuerpo es un objeto JSON.'],
    ['una llave que no es de la función', '{"secreto":"x"}', 'El cuerpo solo admite «modo», «flujos» y «accion».'],
    ['un modo que no existe', '{"modo":"total"}', 'El modo es «incremental» o «completo».'],
    ['una acción que no existe', '{"accion":"borrar"}', 'La acción es «sincronizar» o «estado».'],
    ['flujos que no existen', '{"flujos":["ventas","otros"]}', 'Los flujos son «ventas» y «abonos».'],
    ['flujos vacíos', '{"flujos":[]}', 'Los flujos son «ventas» y «abonos».'],
    ['flujos que no son lista', '{"flujos":"ventas"}', 'Los flujos son «ventas» y «abonos».'],
    ['un cuerpo demasiado grande', '{"modo":"' + 'x'.repeat(5000) + '"}', 'El cuerpo es demasiado grande.'],
  ]) {
    const x = mundo({ ventas, limites: { tamPagina: 5 } });
    const rr = await x.autorizado(cuerpo);
    eq(que + ': 400 con su razón, sin sincronizar', [rr.status, rr.json.codigo, rr.json.mensaje, x.llamadas.length], [400, 'DATO_INVALIDO', mensaje, 0]);
  }

  /* ── «estado» ── */
  const e = await w.autorizado('{"accion":"estado"}');
  eq('«estado» lee los cursores de la base y contesta 200', [e.status, e.json.ok], [200, true]);
  const nLlamadas = w.llamadas.length; await w.autorizado('{"accion":"estado"}');
  eq('  ni una llamada a la hoja', w.llamadas.length, nLlamadas);
  eq('  dice dónde va cada cursor, cuándo se movió, la reconciliación completa, lo rechazado y cómo terminó la última corrida', [Object.keys(e.json.flujos), e.json.flujos.ventas.cursor, typeof e.json.flujos.ventas.actualizado, /^(listo|en_curso)$/.test(e.json.completo.estado), e.json.rechazadas, e.json.corrida.ok, typeof e.json.ahora], [['ventas', 'ventas_dinero', 'abonos'], hora(-100) + '|V-001', 'string', true, [], true, 'string']);
  const sinSecreto = await w.http({}, '{"accion":"estado"}');
  eq('«estado» también pide el secreto', [sinSecreto.status, sinSecreto.json], [401, referencia]);
  const sinConfig = mundo({ envExtra: { ESPEJO_URL: '', ESPEJO_SECRETO: '' } });
  eq('«estado» no necesita la dirección ni el secreto de la hoja (solo la base)', (await sinConfig.autorizado('{"accion":"estado"}')).status, 200);

  /* ── la configuración que falta: se dice su NOMBRE, nunca un valor, y no se llama a nadie ── */
  const BUENA = URL_HOJA;
  const faltas = [
    ['sin ESPEJO_URL', { ESPEJO_URL: '' }, ['ESPEJO_URL']],
    ['sin ESPEJO_SECRETO', { ESPEJO_SECRETO: '' }, ['ESPEJO_SECRETO']],
    ['con un ESPEJO_SECRETO de 31 caracteres', { ESPEJO_SECRETO: 'x'.repeat(31) }, ['ESPEJO_SECRETO']],
    ['sin ninguna de las dos', { ESPEJO_URL: '', ESPEJO_SECRETO: '' }, ['ESPEJO_URL', 'ESPEJO_SECRETO']],
    ['con una dirección http en vez de https', { ESPEJO_URL: BUENA.replace('https:', 'http:') }, ['ESPEJO_URL']],
    ['con una dirección que no es de script.google.com', { ESPEJO_URL: 'https://evil.example/macros/s/AKfycbPRUEBA-FALSA-0123456789abcdef/exec' }, ['ESPEJO_URL']],
    ['con una dirección con usuario y contraseña', { ESPEJO_URL: BUENA.replace('https://', 'https://u:p@') }, ['ESPEJO_URL']],
    ['con una dirección con puerto', { ESPEJO_URL: BUENA.replace('.com/', '.com:8443/') }, ['ESPEJO_URL']],
    ['con un despliegue de prueba (/dev), que no es el de la gente', { ESPEJO_URL: BUENA.replace('/exec', '/dev') }, ['ESPEJO_URL']],
    ['con una dirección con parámetros', { ESPEJO_URL: BUENA + '?x=1' }, ['ESPEJO_URL']],
    ['con un identificador demasiado corto', { ESPEJO_URL: 'https://script.google.com/macros/s/corto/exec' }, ['ESPEJO_URL']],
  ];
  for (const [que, env, nombres] of faltas) {
    const x = mundo({ ventas, envExtra: env, limites: { tamPagina: 5 } });
    const rr = await x.autorizado('{}');
    eq(que + ': 503 CONFIGURACION que nombra la variable, y no se llamó a nadie', [rr.status, rr.json.codigo, nombres.every(n => rr.json.mensaje.includes(n)), x.llamadas.length, x.pg.pedidos.length], [503, 'CONFIGURACION', true, 0, 0]);
    cierto('  y el mensaje no trae ningún valor (ni la dirección ni el secreto)', !TODOS_LOS_SECRETOS.some(s => rr.texto.includes(s)) && !rr.texto.includes('AKfycb') && !rr.texto.includes('xxxxxxxx'));
  }
  eq('direccionDeLaHoja acepta la de siempre y la de una cuenta de Workspace', [direccionDeLaHoja(URL_HOJA).ok, direccionDeLaHoja('https://script.google.com/a/macros/al3d.mx/s/AKfycbPRUEBA-FALSA-0123456789abcdef/exec').ok, direccionDeLaHoja('  ' + URL_HOJA + '  ').ok], [true, true, true]);
  eq('y nada más', ['', null, undefined, 42, 'script.google.com', 'https://script.google.com/', 'ftp://script.google.com/macros/s/AKfycbPRUEBA-FALSA-0123456789abcdef/exec', 'https://script.google.com.evil.example/macros/s/AKfycbPRUEBA-FALSA-0123456789abcdef/exec',
    'https://script.googleusercontent.com/macros/echo?x=1'].map(u => direccionDeLaHoja(u).ok), Array(9).fill(false));
  eq('leerConfig nombra solo variables', (() => { const c = leerConfig(() => undefined); return [c.faltan, c.url, c.secretoFuncion, c.secretoHoja]; })(), [['ESPEJO_URL', 'ESPEJO_SECRETO'], '', '', '']);
  eq('los nombres de las variables de la función son los de la documentación', VARIABLES, { secretoFuncion: 'ESPEJO_SECRETO_FUNCION', urlHoja: 'ESPEJO_URL', secretoHoja: 'ESPEJO_SECRETO' });
  eq('y la cabecera del secreto', CABECERA_SECRETO, 'x-espejo-secreto');

  /* ── qué estado HTTP corresponde a cada cosa ── */
  const e1 = clase => respuestaDe({ ok: false, error: { clase, mensaje: 'm' } });
  eq('estados: capacidad 507, apagado y esquema 409, rechazo de datos 422, y lo demás de la hoja o la base 502', ['capacidad', 'apagado', 'esquema', 'invalido', 'autenticacion', 'base', 'red', 'http', 'no_json', 'hoja_ocupada', 'fallo_parcial'].map(c => e1(c).status), [507, 409, 409, 422, 502, 502, 502, 502, 502, 502, 502]);
  eq('y su código: el de siempre de cada clase; la capacidad lleva además la marca capacidad_agotada y lo de la red, transitorio', [e1('capacidad').cuerpo.codigo, e1('capacidad').cuerpo.capacidad_agotada, e1('red').cuerpo.codigo, e1('red').cuerpo.transitorio, e1('autenticacion').cuerpo.codigo, e1('base').cuerpo.codigo], ['CAPACIDAD_AGOTADA', true, 'SIN_RED', true, 'AUTENTICACION_HOJA', 'BASE_NO_CONTESTA']);
  eq('un resultado ok es 200 y tal cual', respuestaDe({ ok: true, x: 1 }), { status: 200, cuerpo: { ok: true, x: 1 } });

  /* ── un secreto que se cuela en un error no sale ── */
  const w2 = mundo({ ventas, limites: { tamPagina: 5, intentos: 1 } });
  w2.guion = () => () => { throw new Error('falló la llamada con ' + SECRETO_HOJA + ' hacia ' + URL_HOJA + ' usando ' + LLAVE_SERVICIO); };
  const rs = await w2.autorizado('{}');
  eq('si el error de una biblioteca cita el secreto, la dirección o la llave, la respuesta los esconde («[oculto]»)', [rs.status, TODOS_LOS_SECRETOS.concat([URL_HOJA]).some(s => rs.texto.includes(s)), rs.texto.includes('[oculto]')], [502, false, true]);
  cierto('  y el registro tampoco los trae', !w2.logs.some(l => TODOS_LOS_SECRETOS.concat([URL_HOJA]).some(s => l.includes(s))));
  cierto('el registro de la función son líneas JSON con el evento y números (nunca filas ni importes)', w.logs.length > 0 && w.logs.every(l => { const o = JSON.parse(l); return o.funcion === 'espejo' && typeof o.evento === 'string'; }));
}

/* ===========================================================================
   16. EL CABLE CON DENO (index.ts), PROBADO EN NODE
   =========================================================================== */
console.log('\n16. index.ts — el cable con Deno, probado en node con un Deno de mentiras');
{
  const rutaIndex = join(aqui, '..', 'supabase', 'functions', 'espejo', 'index.ts');
  const fuente = readFileSync(rutaIndex, 'utf8');
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('index.ts importa solo base.js y handler.js, y arma Deno.serve una vez', [[...fuente.matchAll(/^import .* from '([^']+)';/gm)].map(m => m[1]), (fuente.match(/Deno\.serve\(/g) || []).length], [['./base.js', './handler.js'], 1]);
  cierto('lee el entorno con Deno.env.get y no trae ninguna dirección, llave ni secreto escritos', /Deno\.env\.get\(nombre\)/.test(sinComentarios) && !/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|script\.google\.com|supabase\.co|https?:\/\//.test(sinComentarios));
  cierto('y es TypeScript que node lee quitándole los tipos (sin enum, ni namespace, ni propiedades de parámetro)', !/\benum\b|\bnamespace\b|constructor\s*\([^)]*\b(private|public|protected|readonly)\b/.test(sinComentarios));
  if (typeof globalThis.Deno !== 'undefined') {
    nota('esta corrida es en Deno de verdad (' + globalThis.Deno.version.deno + '): no se le pone un Deno de mentiras; index.ts se comprueba con «deno check»');
  } else if (!process.features || !process.features.typescript) {
    nota('NO VERIFICADO: este node (' + process.version + ') no lee TypeScript; index.ts no se corrió');
  } else {
    let atiende = null;
    const respaldo = { Deno: globalThis.Deno, fetch: globalThis.fetch };
    const reloj = { t: RELOJ0 };
    const H = hoja();
    const pg = crearPostgrest({ ventas: [filaVista('V-001', -100), filaVista('V-002', -90)], abonos: [abVista(1, 'V-001', -80, 5)], ahora: () => Date.now() });
    const variables = { SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_ROLE_KEY: LLAVE_SERVICIO, ESPEJO_SECRETO_FUNCION: SECRETO_FUNCION, ESPEJO_URL: URL_HOJA, ESPEJO_SECRETO: SECRETO_HOJA };
    const salidas = [];
    globalThis.Deno = { env: { get: n => variables[n] }, serve: fn => { atiende = fn; } };
    globalThis.fetch = async (url, init) => {
      salidas.push(String(url));
      if (String(url).startsWith(URL_BASE)) return pg.fetch(url, init);
      if (String(url) === URL_HOJA) return new Response(JSON.stringify(H.doPost(init.body)), { status: 200 });
      throw new Error('salió a una dirección que no es ni la base ni la hoja: ' + url);
    };
    try {
      await import(pathToFileUrl(rutaIndex) + '?prueba=' + Date.now());
      eq('al cargar, index.ts le entrega a Deno.serve un manejador', typeof atiende, 'function');
      const mal = await atiende(new Request('https://x.test/functions/v1/espejo', { method: 'POST', headers: { 'x-espejo-secreto': 'mal' } }));
      eq('con otro secreto: 401', [mal.status, (await mal.json()).codigo], [401, 'SIN_SESION']);
      /* En Deno el registro de la función va a console.log (Logs de Supabase): se recoge para mirarlo. */
      const lineas = []; const logOriginal = console.log; console.log = (...x) => lineas.push(x.join(' '));
      let bien2;
      try { bien2 = await atiende(new Request('https://x.test/functions/v1/espejo', { method: 'POST', headers: { 'x-espejo-secreto': SECRETO_FUNCION }, body: '{}' })); }
      finally { console.log = logOriginal; }
      const cuerpo = await bien2.json();
      cierto('el registro de la función (una línea JSON en los Logs de Supabase) dice el evento y números, sin secretos ni filas', lineas.length === 1 && JSON.parse(lineas[0]).evento === 'corrida' && !TODOS_LOS_SECRETOS.concat([URL_HOJA]).some(x => lineas[0].includes(x)) && !/Café|Vallarta/.test(lineas[0]));
      eq('con el secreto bueno corre de punta a punta por el cable de verdad (entorno de Deno, fetch de la plataforma, la hoja)', [bien2.status, cuerpo.ok, H.celda('V-002', 'Proyecto'), abonosDe(H, 'V-001').length], [200, true, 'Ana - Café V-002', 1]);
      eq('y solo salió a la base y a la hoja', [...new Set(salidas.map(u => u.startsWith(URL_BASE) ? 'base' : u === URL_HOJA ? 'hoja' : 'otra'))].sort(), ['base', 'hoja']);
      eq('la base se llamó con la llave de servicio del entorno, a /rest/v1/', [pg.pedidos.every(p => p.cab.apikey === LLAVE_SERVICIO && p.ruta.startsWith('/rest/v1/'))], [true]);
    } finally {
      if (respaldo.Deno === undefined) delete globalThis.Deno; else globalThis.Deno = respaldo.Deno;
      globalThis.fetch = respaldo.fetch;
    }
  }
}
function pathToFileUrl(ruta) { return new URL('file:///' + ruta.replace(/\\/g, '/')).href; }

/* ===========================================================================
   17. NINGÚN SECRETO SALIÓ
   =========================================================================== */
console.log('\n17. NINGÚN SECRETO SALIÓ — ni en una respuesta ni en el registro, en todo lo que corrió arriba');
{
  const todo = MUNDOS.flatMap(m => [...m.logs, ...m.respuestas]).join('\n');
  eq('de ' + MUNDOS.length + ' mundos de prueba, ni una respuesta ni una línea del registro trae un secreto, una llave o la dirección de la hoja', TODOS_LOS_SECRETOS.concat([URL_HOJA]).filter(s => todo.includes(s)), []);
  const cuerpos = MUNDOS.filter(m => m.entorno('ESPEJO_SECRETO') === SECRETO_HOJA).flatMap(m => m.llamadas.map(l => JSON.stringify(l.cuerpo)));
  cierto('lo que se le manda a la hoja lleva el secreto de la HOJA (es su puerta) y nunca el de la función ni la llave de servicio', cuerpos.every(c => c.includes(SECRETO_HOJA) && !c.includes(SECRETO_FUNCION) && !c.includes(LLAVE_SERVICIO)));
  const fuenteGsSinSecretos = !/PRUEBA-FALSA|prueba-falsa/.test(fuenteGs);
  cierto('el .gs, el handler, la base y el módulo compartido no traen ninguno de los valores de prueba (son solo de este archivo)', fuenteGsSinSecretos && ['espejo/handler.js', 'espejo/base.js', 'espejo/index.ts', '_shared/espejo.js'].every(f => !/PRUEBA-FALSA|prueba-falsa/.test(readFileSync(join(aqui, '..', 'supabase', 'functions', f), 'utf8'))));
  cierto('y en el .gs solo viven los NOMBRES de las propiedades (ESPEJO_SECRETO, MODO_ESPEJO, ESPEJO_SELLOS), con su valor leído de las propiedades del script', /var PROP_ESPEJO_SECRETO = 'ESPEJO_SECRETO';/.test(fuenteGs) && /getScriptProperties\(\)\.getProperty\(nombre\)/.test(fuenteGs));
}

/* ===========================================================================
   18. EL CONTRATO CON LA BASE
   =========================================================================== */
console.log('\n18. EL CONTRATO CON LA BASE — supabase/migrations/ y config.toml contra lo que esperan el .gs y la función (solo texto: aquí no hay Postgres)');
{
  const leerRepo = (...partes) => { try { return readFileSync(join(aqui, '..', ...partes), 'utf8'); } catch (_) { return null; } };
  const sinComentarios = sql => sql.replace(/--[^\r\n]*/g, '');
  const comillas = t => [...t.matchAll(/'([^']*)'/g)].map(x => x[1]);
  const ordenadas = lista => [...lista].sort();
  const m0010 = leerRepo('supabase', 'migrations', '0010_sync_espejo.sql');
  const m0003 = leerRepo('supabase', 'migrations', '0003_proyectos.sql');
  const m0001 = leerRepo('supabase', 'migrations', '0001_fundacion.sql');
  const toml = leerRepo('supabase', 'config.toml');

  /* Lo que la hoja acepta, sacado del .gs cargado en vm (sin Apps Script: solo se definen funciones y constantes). */
  const gs = vm.createContext({ console });
  vm.runInContext(fuenteGs, gs);
  const constantes = JSON.parse(vm.runInContext('JSON.stringify({ ESTATUS: ESTATUS, CUENTAS: CUENTAS, TIPOS_TRABAJO: TIPOS_TRABAJO, ETAPAS_OBRA: ETAPAS_OBRA, ENTREGAS: ENTREGAS, PLAZOS_TALLER: PLAZOS_TALLER })', gs));
  const acepta = (columna, valor) => { gs.__c = columna; gs.__v = valor; return vm.runInContext('espejoNormalizar_(__c, __v, "America/Mexico_City").ok', gs) === true; };

  if (!m0010) {
    nota('NO VERIFICADO: no está supabase/migrations/0010_sync_espejo.sql en este árbol; no se contrastaron las vistas del espejo');
  } else {
    const limpia = sinComentarios(m0010);
    const cuerpoVista = nombre => { const i = limpia.indexOf('create or replace view public.' + nombre); return i < 0 ? '' : limpia.slice(i, limpia.indexOf(';', i)); };
    const aliases = t => [...t.matchAll(/\bas\s+([a-z_][a-z0-9_]*)\s*(?=,|\r?\n|$)/gi)].map(x => x[1]);
    const vV = cuerpoVista('espejo_ventas');
    const vA = cuerpoVista('espejo_abonos');
    cierto('la migración 0010 crea las dos vistas del espejo', vV !== '' && vA !== '');

    /* ── las columnas ── */
    const aliasV = aliases(vV);
    cierto('espejo_ventas trae la empresa y las DOS horas (la del proyecto y la del dinero): son las de los cursores', /select\s+p\.empresa_id,\s*p\.updated_at,\s*d\.updated_at\s+as\s+dinero_updated_at\b/i.test(vV));
    eq('las columnas de espejo_ventas, en su orden, son las de COLUMNAS_VENTAS del módulo compartido (y las del .gs)', aliasV.filter(a => a !== 'dinero_updated_at'), E.COLUMNAS_VENTAS.map(c => c[0]));
    const aliasA = aliases(vA);
    cierto('espejo_abonos trae la empresa, el id y la hora', /select\s+a\.empresa_id,\s*a\.id,\s*a\.updated_at\b/i.test(vA));
    eq('y las columnas de los abonos son a_folio + las de COLUMNAS_ABONO', aliasA, ['a_folio', ...E.COLUMNAS_ABONO]);
    const columnas = { espejo_ventas: ['empresa_id', 'updated_at', ...aliasV], espejo_abonos: ['empresa_id', 'id', 'updated_at', ...aliasA] };
    eq('cada flujo lee de su vista la hora y el desempate que dice FLUJOS, y la empresa que filtra la consulta',
       Object.values(E.FLUJOS).map(f => [columnas[f.vista] ? columnas[f.vista].includes(f.ts) : false, columnas[f.vista] ? columnas[f.vista].includes(f.id) : false, columnas[f.vista] ? columnas[f.vista].includes('empresa_id') : false]),
       Object.values(E.FLUJOS).map(() => [true, true, true]));
    cierto('las dos vistas son solo de service_role (nadie más ve el dinero) y están en el esquema public, el que sirve PostgREST',
           /revoke all on public\.espejo_ventas, public\.espejo_abonos from public, anon, authenticated(, service_role)?;/i.test(limpia)
           && /grant select on public\.espejo_ventas, public\.espejo_abonos to service_role;/i.test(limpia));

    /* ── los valores: todo lo que la base puede mandar, la hoja lo acepta ── */
    const entre = (t, desde) => { const m = new RegExp('case\\s+' + desde + '\\s+([\\s\\S]*?)\\bend\\b', 'i').exec(t); return m ? [...m[1].matchAll(/then\s+'([^']*)'/gi)].map(x => x[1]) : []; };
    const etapas = entre(vV, 'p\\.etapa'), entregas = entre(vV, 'p\\.entrega'), plazos = entre(vV, 'p\\.plazo_k');
    eq('las etapas que emite la vista son EXACTAMENTE las ETAPAS_OBRA del .gs', ordenadas(etapas), ordenadas(constantes.ETAPAS_OBRA));
    eq('las formas de entrega que emite la vista son las ENTREGAS del .gs', ordenadas(entregas), ordenadas(constantes.ENTREGAS));
    eq('los plazos de taller que emite la vista son los PLAZOS_TALLER del .gs', ordenadas(plazos), ordenadas(constantes.PLAZOS_TALLER));
    cierto('y la ruta del espejo acepta cada uno de esos valores (y el vacío)',
           etapas.every(v => acepta('z_etapa', v)) && entregas.every(v => acepta('af_entrega', v)) && plazos.every(v => acepta('ah_plazo', v))
           && acepta('z_etapa', null) && acepta('af_entrega', '') && acepta('ah_plazo', ''));
    cierto('el IVA sale como «Sí» o «No», que es lo que la ruta acepta', /case when p\.iva then 'Sí' else 'No' end\s+as f_iva/i.test(vV) && acepta('f_iva', 'Sí') && acepta('f_iva', 'No'));
    if (m0003) {
      const t3 = sinComentarios(m0003);
      const estatusBase = comillas((/\bestatus\s+text\s+check\s*\(\s*estatus\s+in\s*\(([^)]*)\)/i.exec(t3) || [])[1] || '');
      const cuentasBase = comillas((/\bcuenta\s+text\s+check\s*\(\s*cuenta\s+in\s*\(([^)]*)\)/i.exec(t3) || [])[1] || '');
      const tiposBase = comillas((/tipo_trabajo\s*<@\s*array\[([^\]]*)\]/i.exec(t3) || [])[1] || '');
      eq('los estatus que permite la base son los ESTATUS del .gs', ordenadas(estatusBase), ordenadas(constantes.ESTATUS));
      eq('las cuentas que permite la base son las CUENTAS del .gs', ordenadas(cuentasBase), ordenadas(constantes.CUENTAS));
      eq('los tipos de trabajo que permite la base son los TIPOS_TRABAJO del .gs', ordenadas(tiposBase), ordenadas(constantes.TIPOS_TRABAJO));
      cierto('y la ruta acepta cada estatus, cada cuenta, cada tipo (solo y en la lista «A, B» que arma la vista) y el vacío',
             estatusBase.every(v => acepta('c_estatus', v)) && cuentasBase.every(v => acepta('d_cuenta', v)) && tiposBase.every(v => acepta('e_tipo', v))
             && acepta('e_tipo', tiposBase.join(', ')) && acepta('c_estatus', null) && acepta('d_cuenta', null) && acepta('e_tipo', ''));
      /* Los números: lo que la base permite, la hoja lo acepta; lo que la base prohíbe, la hoja lo rechaza. */
      cierto('el subtotal «puede ser negativo» en la base y la ruta lo acepta; el anticipo y la liquidación no pueden (check >= 0) y la ruta tampoco',
             /subtotal\s+numeric not null default 0,/i.test(t3) && acepta('g_subtotal', -250.5) && acepta('g_subtotal', 0)
             && /anticipo\s+numeric not null default 0 check \(anticipo\s*>=\s*0\)/i.test(t3) && /liquidacion\s+numeric not null default 0 check \(liquidacion\s*>=\s*0\)/i.test(t3)
             && !acepta('i_anticipo', -1) && !acepta('j_liquidacion', -1) && acepta('i_anticipo', 0) && acepta('j_liquidacion', 1234.56));
      cierto('el porcentaje de comisión va de 0 a 100 en la base y en la ruta; el teléfono, con los caracteres que la base deja (dígitos, espacio, + ( ) -)',
             /pct_comision\s+numeric check \(pct_comision between 0 and 100\)/i.test(t3) && acepta('ad_pct', 0) && acepta('ad_pct', 100) && !acepta('ad_pct', 100.01) && !acepta('ad_pct', -1)
             && /tel !~ '\[\^0-9 \+\(\)-\]'/.test(t3) && acepta('ae_telefono', '+52 (33) 1234-5678'));
      cierto('los abonos: el importe va de -10 millones a 10 millones sin tocarlos, el pago es P-### y el folio V-### (las mismas formas que valida la ruta)',
             /importe\s+numeric not null check \(abs\(importe\) < 10000000\)/i.test(t3) && /folio_hoja\s+text not null check \(folio_hoja ~ '\^V-\[0-9\]\{3,7\}\$'\)/i.test(t3) && /pago_id\s+text check \(pago_id ~ '\^P-\[0-9\]\{3,\}\$'\)/i.test(t3));
    } else {
      nota('NO VERIFICADO: no está supabase/migrations/0003_proyectos.sql; no se contrastaron estatus, cuentas, tipos ni los topes de los números');
    }
  }

  /* ── el cursor vive en `contadores` ── */
  if (!m0001) nota('NO VERIFICADO: no está supabase/migrations/0001_fundacion.sql; no se contrastó la tabla contadores');
  else {
    const t1 = sinComentarios(m0001);
    const tabla = (/create table if not exists public\.contadores\s*\(([\s\S]*?)\n\);/i.exec(t1) || [])[1] || '';
    cierto('contadores tiene las columnas que lee y escribe base.js (empresa_id, clave, ventana, texto) con la llave primaria (empresa_id, clave, ventana)',
           /\bempresa_id\s+text\s+not null/i.test(tabla) && /\bclave\s+text\s+not null/i.test(tabla) && /\bventana\s+text\s+not null default ''/i.test(tabla) && /\btexto\s+text\b/i.test(tabla)
           && /primary key\s*\(\s*empresa_id\s*,\s*clave\s*,\s*ventana\s*\)/i.test(tabla));
    cierto('y la fila de empresa «*» no tiene llave foránea, y service_role puede leer, insertar y actualizar (el upsert del cursor)',
           !/references/i.test(tabla) && /grant select, insert, update on public\.contadores to service_role;/i.test(t1));
    cierto('el upsert de base.js usa EXACTAMENTE esas tres columnas como on_conflict',
           readFileSync(join(aqui, '..', 'supabase', 'functions', 'espejo', 'base.js'), 'utf8').includes('on_conflict=empresa_id,clave,ventana'));
  }

  /* ── la configuración de la CLI ── */
  if (!toml) nota('NO VERIFICADO: no está supabase/config.toml');
  else {
    cierto('config.toml le quita a `espejo` la verificación de JWT (la dispara un cron con un secreto, no una persona con sesión)', /\[functions\.espejo\]\s*\r?\n\s*verify_jwt\s*=\s*false/.test(toml));
    cierto('y la API sirve el esquema public, donde están las dos vistas', /^\s*schemas\s*=\s*\[\s*"public"\s*\]/m.test(toml));
    const mr = /^\s*max_rows\s*=\s*(\d+)/m.exec(toml);
    nota('max_rows de config.toml: ' + (mr ? mr[1] : 'no está') + '. La lectura de abonos no depende de él (pide hasta que llega una página vacía); la de ventas avanza con el cursor, así que tampoco se pierde nada si fuera menor');
  }
}

/* ===========================================================================
   LO QUE ESTA PRUEBA NO PUEDE VERIFICAR
   =========================================================================== */
console.log('\nNO VERIFICADO (la hoja de mentiras y los dobles tienen estos límites):');
nota('las fórmulas ARRAYFORMULA de la hoja (H, K, R, T, S, U…, el Tablero, la cobranza): la hoja de mentiras no las evalúa, así que no se comprueba que se recalculen sobre lo que el espejo escribió; solo que el espejo no las toca');
nota('qué hace Sheets de verdad con cada valor escrito (un texto que parece fecha o número, el apóstrofo en una celda con formato, las validaciones de lista, el formato de las fechas): aquí se imita solo el apóstrofo');
nota('el candado de verdad (LockService con otra ejecución en paralelo), las cuotas y el tiempo de Apps Script, y cuánto tarda de verdad cada lote en una hoja de 309 filas');
nota('el Web App publicado: la redirección 302 de script.google.com a script.googleusercontent.com, la versión desplegada, el «Ejecutar como» y el «Quién tiene acceso»');
nota('PostgREST de verdad: se imitan eq/gt/gte/in, or=(…and(…)), order, limit y el corte de max_rows; no se comprueba contra el servicio real (ni las llaves nuevas sb_secret_ en apikey, ni el upsert con on_conflict)');
nota('las vistas espejo_ventas y espejo_abonos contra una base de verdad: la sección 18 compara el TEXTO de la migración 0010 (nombres y orden de columnas, listas de valores, permisos) con lo que esperan el .gs y la función, pero nadie ejecutó ese SQL (aquí no hay Postgres): no se probó que la vista corra ni lo que PostgREST devuelve (el formato de la hora con microsegundos, el numeric como número)');
nota(typeof globalThis.Deno !== 'undefined'
  ? 'el runtime de Supabase: esta corrida es en Deno ' + globalThis.Deno.version.deno + ', pero no es el de las Edge Functions; no se midió su límite de 150 s por petición, los 2 s de CPU ni el cuerpo máximo. index.ts: «deno check supabase/functions/espejo/index.ts»'
  : 'Deno de verdad: aquí index.ts se corre en node (quitándole los tipos) con un Deno de mentiras. Con Deno: «deno run -A pruebas/supabase-espejo.mjs» y «deno check supabase/functions/espejo/index.ts». Lo de Supabase (150 s por petición, 2 s de CPU, el cuerpo máximo) no se midió');
nota('el cron o el webhook que dispara la función, y el despliegue: config.toml SÍ trae [functions.espejo] con verify_jwt = false (sección 18), pero no se desplegó nada ni se probó contra la plataforma');

/* @@FIN@@ */
console.log(fallos ? '\n' + fallos + ' FALLO(S) de ' + total : '\nTodo pasa. ' + total + ' comprobaciones.');
process.exit(fallos ? 1 : 0);
