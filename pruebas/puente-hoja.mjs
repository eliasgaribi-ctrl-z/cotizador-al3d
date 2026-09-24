/* EL PUENTE DE LA HOJA, CORRIENDO DE VERDAD. Sin Google, sin cuenta, en node.

   Reemplaza a `pruebas/worker.mjs`, que probaba el Worker de Cloudflare contra una Notion
   de mentiras. El Worker ya no existe: el puente es un Apps Script y vive en
   `puente/hoja-apps-script.gs`.

   Ese archivo no es un módulo ES y no se puede importar, pero lo que de verdad importaba
   probar —la frontera de permisos y las validaciones que impiden inventar un valor de
   lista— es lógica pura: `armarCeldas` no toca la hoja, solo decide qué se escribe y qué
   se rechaza. Así que el archivo se evalúa en un contexto aparte y se prueban esas
   funciones directamente.

   Y desde septiembre de 2026 también corre lo que SÍ toca la hoja —buscar la fila antes de
   crear, reacomodar, el cobro del menú, la marca de folios, la realineación de Y:AD— contra
   una hoja de mentiras (`hojaDeMentiras`, más abajo): una cuadrícula con lo mínimo de
   SpreadsheetApp que el .gs usa. La auditoría de ese mes encontró siete defectos justo en
   esa parte, la que esta prueba decía no cubrir, y ninguno se veía leyendo el código.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { deNotion, ventaDeHoja, VERSION_ESPERADA } from '../js/datos/puente.js';
import { saldoDe, unificar, vendidoDe, resumenMensual } from '../js/datos/ventas.js';
import { desdeVentaDeHoja } from '../js/datos/proyectos.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'puente', 'hoja-apps-script.gs'), 'utf8');

/* Los servicios de Google no se tocan al cargar el archivo —no hay llamadas en el nivel
   de arriba— así que basta con que existan para que nada explote si algún día las hubiera. */
const noImplementado = new Proxy({}, { get: () => () => { throw new Error('servicio de Google no disponible en la prueba'); } });
/* `aplanarFila` sí se prueba ahora, y lo único de Google que toca es formatear una fecha. */
const Utilities = { formatDate: d => d.toISOString().slice(0, 10) };
const ctx = vm.createContext({
  SpreadsheetApp: noImplementado, PropertiesService: noImplementado,
  Utilities, ScriptApp: noImplementado, MailApp: noImplementado,
  LockService: noImplementado, ContentService: noImplementado,
  HtmlService: noImplementado, Logger: noImplementado, console,
});
vm.runInContext(src, ctx);
const api = vm.runInContext(
  '({ armarCeldas, rutaExpandir, sinLoQueNoLeToca, aplanarFila, PUENTE_ROLES, PUENTE_FORMULAS, COL,' +
  '   COL_FOLIO, ULTIMA_COL, HEAD, ESTATUS, CUENTAS, ETAPAS_OBRA, TIPOS_TRABAJO, DOMINIOS_MAPS,' +
  '   CAMPOS_DE_DINERO, VE_EL_DINERO, PUENTE_VERSION })',
  ctx);

console.log('\nLOS TRES ROLES — cambiar de tablero no da permisos');
{
  /* El caso que da nombre a todo: el teléfono de fabricación dice «Dirección» en su
     pantalla y manda un anticipo. El puente lo rechaza, y lo NOMBRA. */
  const r = api.armarCeldas({ 'Anticipo': 5000, 'Etapa de obra': 'Cortado' }, 'fabricacion');
  eq('fabricación escribe la etapa', r.celdas.map(c => c.col), [api.COL['Etapa de obra']]);
  eq('y el anticipo vuelve rechazado', r.rechazadas.map(x => x.nombre), ['Anticipo']);

  const p = api.armarCeldas({ 'Etapa de obra': 'Cortado', 'Liquidacion': 100 }, 'pagos');
  eq('pagos cobra', p.celdas.map(c => c.col), [api.COL['Liquidacion']]);
  eq('pero no mueve la obra', p.rechazadas.map(x => x.nombre), ['Etapa de obra']);

  const d = api.armarCeldas({ 'Anticipo': 1, 'Etapa de obra': 'Armado' }, 'direccion');
  eq('dirección puede las dos', d.celdas.length, 2);
  eq('y no rechaza nada', d.rechazadas.length, 0);

  eq('son tres roles', Object.keys(api.PUENTE_ROLES).sort(), ['direccion', 'fabricacion', 'pagos']);
}

console.log('\nLAS FÓRMULAS — se leen, no se escriben');
{
  for (const nombre of Object.keys(api.PUENTE_FORMULAS)) {
    const r = api.armarCeldas({ [nombre]: 123 }, 'direccion');
    eq('«' + nombre + '» se rechaza aunque venga de dirección', r.celdas.length, 0);
    cierto('  y dice por qué', r.rechazadas[0] && r.rechazadas[0].por.length > 10);
  }
}

console.log('\nLOS CAMPOS DE LISTA — un valor inventado se rechaza, no se crea');
{
  const casos = [
    ['Estatus', 'ENTREGADO', api.ESTATUS[0]],
    ['Cuenta ', 'Banco Nuevo', api.CUENTAS[0]],
    ['Etapa de obra', 'Casi listo', api.ETAPAS_OBRA[0]],
    ['Tipo de trabajo', 'Lo que sea', api.TIPOS_TRABAJO[0]],
  ];
  for (const [nombre, inventado, bueno] of casos) {
    const malo = api.armarCeldas({ [nombre]: inventado }, 'direccion');
    eq('«' + inventado + '» no entra en ' + nombre, malo.celdas.length, 0);
    cierto('  y se nombra el rechazo', malo.rechazadas[0] && malo.rechazadas[0].nombre === nombre);
    const ok = api.armarCeldas({ [nombre]: bueno }, 'direccion');
    eq('«' + bueno + '» sí entra', ok.celdas.length, 1);
  }
  /* El tipo de trabajo puede venir combinado, como el multi_select de antes. */
  const combo = api.armarCeldas(
    { 'Tipo de trabajo': [api.TIPOS_TRABAJO[0], api.TIPOS_TRABAJO[4]] }, 'direccion');
  eq('dos tipos se guardan separados por coma', combo.celdas[0].valor,
     api.TIPOS_TRABAJO[0] + ', ' + api.TIPOS_TRABAJO[4]);
  const comboMalo = api.armarCeldas(
    { 'Tipo de trabajo': [api.TIPOS_TRABAJO[0], 'Inventado'] }, 'direccion');
  eq('si uno de los dos es inventado, no entra ninguno', comboMalo.celdas.length, 0);
}

console.log('\nLAS FECHAS Y LOS NÚMEROS');
{
  const f = api.armarCeldas({ 'Fecha Liquidacion': '2026-09-14' }, 'direccion');
  /* instanceof no sirve: el Date lo construye el contexto del vm, que es otro realm. */
  cierto('una fecha ISO se vuelve Date',
         Object.prototype.toString.call(f.celdas[0].valor) === '[object Date]');
  const mala = api.armarCeldas({ 'Fecha Liquidacion': '14/09/2026' }, 'direccion');
  eq('una fecha en es-MX se rechaza', mala.celdas.length, 0);
  const vacia = api.armarCeldas({ 'Fecha Liquidacion': null }, 'direccion');
  eq('null borra la fecha', vacia.celdas[0].valor, '');

  const n = api.armarCeldas({ 'Precio Subtotal': 'mucho' }, 'direccion');
  eq('un subtotal que no es número se rechaza', n.celdas.length, 0);

  const si = api.armarCeldas({ 'IVA': true }, 'direccion');
  eq('el IVA se guarda como lo escribe la hoja', si.celdas[0].valor, 'Sí');
  const no = api.armarCeldas({ 'IVA': false }, 'direccion');
  eq('y el No también', no.celdas[0].valor, 'No');
}

console.log('\nEL ABONO DE COMISIÓN — ya no es una celda, es un renglón');
{
  const a = api.armarCeldas({ 'Abono Comision': 1500 }, 'pagos');
  eq('no se escribe ninguna celda', a.celdas.length, 0);
  eq('se marca como abono a agregar', a.abono, 1500);

  const cero = api.armarCeldas({ 'Abono Comision': 0 }, 'pagos');
  eq('un abono de cero se rechaza', cero.abono, null);

  const sinPermiso = api.armarCeldas({ 'Abono Comision': 1500 }, 'fabricacion');
  eq('fabricación no puede abonar comisiones', sinPermiso.abono, null);
  eq('y se le dice', sinPermiso.rechazadas.map(x => x.nombre), ['Abono Comision']);
}

console.log('\nTEXTO QUE ENTRA DE AFUERA — que no se vuelva fórmula');
{
  /* Una celda que empieza con «=» es una FÓRMULA. Si alguien mete
     =IMPORTXML(...) en la dirección de un proyecto, la hoja sale a internet
     sola, o lee otra pestaña y la escupe. Se le antepone un apóstrofo. */
  const trampas = ['=IMPORTXML("http://malo/", "//a")', '+1+1', '-1-1', '@SUM(A1)'];
  for (const t of trampas) {
    const r = api.armarCeldas({ 'Direccion': t }, 'direccion');
    cierto('«' + t.slice(0, 18) + '…» entra como texto, no como fórmula',
           String(r.celdas[0].valor).charAt(0) === "'");
  }
  const normal = api.armarCeldas({ 'Direccion': 'Av. Vallarta 1234' }, 'direccion');
  eq('una dirección normal no se toca', normal.celdas[0].valor, 'Av. Vallarta 1234');
}

console.log('\n/EXPANDIR — solo sale a Maps');
{
  const fuera = ['http://169.254.169.254/latest/meta-data/', 'https://evil.example.com/x',
                 'https://maps.app.goo.gl.evil.com/x', 'file:///etc/passwd', ''];
  for (const u of fuera) {
    const r = api.rutaExpandir({ u });
    eq('rechaza «' + (u || '(vacio)').slice(0, 34) + '»', r.ok, false);
  }
  cierto('la lista blanca incluye el dominio corto de Maps',
         api.DOMINIOS_MAPS.indexOf('maps.app.goo.gl') !== -1);
}

console.log('\nLO QUE BAJA — el rol tambien cierra la lectura, no solo la escritura');
{
  /* Antes cualquier token válido se bajaba el espejo del dinero completo. El teléfono
     de fabricación necesita la obra, no el importe: si lo pierde nadie lo extraña, y si
     se lo roban con el teléfono, no se llevan la cartera. */
  const espejo = () => ({
    id_notion: 'V-001', 'Proyecto': 'Anuncio X', 'Estatus': 'COBRANDO',
    'Etapa de obra': 'Cortado', 'Direccion': 'Av. Vallarta 1234',
    'Precio Subtotal': 12000, 'Precio Neto ': 13920, 'Anticipo': 6000,
    'Liquidacion': 0, 'Pago Pendiente': 7920, 'Comisiones': 1200,
    'Abono Comision': 0, 'Comision Restante': 1200, 'Cuenta ': 'Rul HSBC',
    'Fecha Liquidacion': '2026-09-14', 'Porcentaje comision': 10,
  });

  const fab = api.sinLoQueNoLeToca(espejo(), 'fabricacion');
  for (const c of api.CAMPOS_DE_DINERO) {
    eq('fabricación no recibe «' + c + '»', fab[c], undefined);
  }
  eq('pero sí recibe la obra', fab['Etapa de obra'], 'Cortado');
  eq('y el proyecto', fab['Proyecto'], 'Anuncio X');
  eq('y la dirección, que es a donde va', fab['Direccion'], 'Av. Vallarta 1234');
  /* El estatus no es una cifra: es la etiqueta que le dice a la obra qué ya se cobró. */
  eq('el estatus sí baja: es estado, no dinero', fab['Estatus'], 'COBRANDO');

  for (const rol of ['direccion', 'pagos']) {
    const r = api.sinLoQueNoLeToca(espejo(), rol);
    eq(rol + ' sí ve el dinero', Object.keys(r).length, Object.keys(espejo()).length);
    eq('  con el pendiente intacto', r['Pago Pendiente'], 7920);
  }

  eq('quien ve el dinero son dos de tres',
     Object.keys(api.VE_EL_DINERO).filter(r => api.VE_EL_DINERO[r]).sort(),
     ['direccion', 'pagos']);
  /* Un rol sin entrada en la tabla NO ve el dinero: el default es cerrado. */
  eq('un rol desconocido tampoco lo ve',
     api.sinLoQueNoLeToca(espejo(), 'inventado')['Anticipo'], undefined);

  /* La versión cambia cuando cambia el contrato: es como se sabe si la hoja quedó vieja.
     Se compara contra la que espera la plataforma y NO contra un número escrito aquí: con
     el número a mano, cada cambio de contrato dejaba esta prueba roja por estar al día, que
     es la clase de fallo que se aprende a ignorar. Que los dos lados digan lo mismo ya lo
     comprueba pruebas/puente.mjs; lo que se prueba aquí es que el saldo baja al derecho, y
     eso se prueba con el saldo, tres renglones más abajo. */
  eq('la versión de la hoja es la que la plataforma espera', api.PUENTE_VERSION, VERSION_ESPERADA);
  cierto('y ya no es ninguna de las que mandaban el saldo negado',
         !['puente-sheets-1', 'puente-sheets-2', 'puente-sheets-3'].includes(api.PUENTE_VERSION));
}

console.log('\nEL SALDO, DE LA CELDA AL TELÉFONO — la costura que nadie probaba');
{
  /* Hasta puente-sheets-3 `aplanarFila` NEGABA el saldo «con el signo de Notion» y la
     plataforma —que nunca pintó ese signo— hacía Math.max(0, saldo): toda la cartera se veía
     cobrada. Cada extremo tenía su prueba con su propio signo y nadie encadenaba los tres.
     Aquí se arma una fila como la lee la hoja, se aplana como lo hace el Apps Script, se baja
     como lo hace el relevo y se pregunta el saldo como lo hace Control. */
  const fila = new Array(api.ULTIMA_COL).fill('');
  const pon = (nombre, v) => { fila[api.COL[nombre] - 1] = v; };
  fila[api.COL_FOLIO - 1] = 'V-042';
  pon('Proyecto', 'Anuncio X'); pon('Estatus', 'COBRANDO'); pon('Cuenta ', 'Rul HSBC');
  pon('IVA', 'Sí'); pon('Precio Subtotal', 12000); pon('Precio Neto ', 13920);
  pon('Anticipo', 6000); pon('Liquidacion', 0);
  pon('Pago Pendiente', 7920);                       // como la fórmula K: neto − anticipo − liquidación
  pon('Comisiones', 1200); pon('Abono Comision', 0); pon('Comision Restante', 1200);
  /* La fecha se crea DENTRO del contexto: `aplanarFila` pregunta `instanceof Date`, y el Date
     de afuera es otra clase para el de adentro. En la hoja de verdad hay un solo realm. */
  pon('Fecha Anticipo e Instalacion', vm.runInContext('new Date(Date.UTC(2026, 7, 23))', ctx));
  pon('Folio cotizacion', 'COT-0042@K7QM'); pon('Etapa de obra', 'Instalado');
  pon('Tipo de trabajo', 'Letras 3D con iluminacion, Recorte acrilico');
  pon('Porcentaje comision', 15);

  const plano = api.aplanarFila(fila, 'America/Mexico_City');
  eq('el saldo sale de la hoja tal cual, positivo', plano['Pago Pendiente'], 7920);
  eq('igual que la comisión restante: mismo criterio para las dos fórmulas', plano['Comision Restante'], 1200);
  eq('la fecha baja en ISO', plano['Fecha Anticipo e Instalacion'], '2026-08-23');
  eq('el tipo de trabajo baja como lista', plano['Tipo de trabajo'], ['Letras 3D con iluminacion', 'Recorte acrilico']);
  eq('el % pactado baja', plano['Porcentaje comision'], 15);
  eq('el folio interno hace de id', plano.id_notion, 'V-042');

  const parche = deNotion(plano);
  eq('el relevo lo convierte en pago_pendiente', parche.pago_pendiente, 7920);
  eq('y trae el anticipo de la hoja', parche.anti_pactado, 6000);
  eq('y el % pactado', parche.pct_comision, 15);
  const proyecto = { etapa: 'instalado', neto: 13920, precio_auth: 13920, anti_pactado: 6000, ...parche };
  eq('y Control lee lo que se debe: los mismos 7,920', saldoDe(proyecto), 7920);
  eq('con la fila liquidada el saldo es cero aunque la celda diga otra cosa',
     saldoDe({ ...proyecto, estatus_notion: 'LIQUIDADO' }), 0);

  /* Y la columna nueva: quién puede escribirla y qué acepta. */
  eq('la columna del % está después de las cinco del puente', api.COL['Porcentaje comision'], 30);
  eq('y ULTIMA_COL la alcanza: si no, /jalar la dejaría fuera',
     api.ULTIMA_COL, Math.max(...Object.values(api.COL)));
  eq('dirección escribe el %', api.armarCeldas({ 'Porcentaje comision': 15 }, 'direccion').celdas.map(c => c.valor), [15]);
  eq('pagos también', api.armarCeldas({ 'Porcentaje comision': 12.5 }, 'pagos').celdas.map(c => c.valor), [12.5]);
  eq('fabricación no', api.armarCeldas({ 'Porcentaje comision': 15 }, 'fabricacion').rechazadas.map(x => x.nombre), ['Porcentaje comision']);
  eq('150 % se rechaza con su razón', api.armarCeldas({ 'Porcentaje comision': 150 }, 'direccion').rechazadas.map(x => x.por), ['el porcentaje va de 0 a 100']);
  eq('vacío borra la celda: vuelve al 10 % de siempre', api.armarCeldas({ 'Porcentaje comision': '' }, 'direccion').celdas.map(c => c.valor), ['']);
  cierto('y fabricación tampoco lo VE bajar', api.CAMPOS_DE_DINERO.indexOf('Porcentaje comision') !== -1);

  /* La guardia de idempotencia de mejorarTodo compara E1 contra el encabezado REAL. Decía
     'Tipo' —un nombre anterior al renombre, que nunca coincidía— y la segunda corrida
     insertaba otra columna en E: los datos de E en adelante se corrían uno a la derecha y
     COL seguía apuntando a los números viejos, con lo que el puente habría escrito la cuenta
     encima del estatus, sobre filas de dinero real.
     La hoja lo resuelve más fuerte que comparando contra HEAD[4]: si encuentra un encabezado
     que NO reconoce, lanza y no mueve nada. Eso es lo que se prueba —el nombre contra el que
     se compara, y que el caso desconocido no termine en un insertColumn—, no la forma exacta
     de escribirlo. */
  eq('HEAD[4] es el encabezado real de E', api.HEAD[4], 'Tipo de trabajo');
  cierto('y agregarColumnas se guarda contra ÉSE, no contra un nombre viejo',
         /e1 !== 'Tipo de trabajo'/.test(src) || /getValue\(\) !== HEAD\[4\]\)/.test(src));
  cierto('y ante un encabezado que no reconoce se detiene en vez de correr la hoja',
         /throw new Error\([^)]*No se movio nada/.test(src));
}

console.log('\nUNA DE LAS 199, DE LA CELDA AL RÉCORD DE CONTROL');
{
  /* La fila que hasta septiembre de 2026 no llegaba a ninguna pantalla: anterior a la
     plataforma, sin folio de cotización y sin etapa de obra. Se arma como la lee la hoja, se
     aplana como lo hace el Apps Script, se convierte como lo hace el relevo y se suma como lo
     hace Control. Tiene que dar el neto de la hoja, en el mes del anticipo, con saldo cero. */
  const fila = new Array(api.ULTIMA_COL).fill('');
  const pon = (nombre, v) => { fila[api.COL[nombre] - 1] = v; };
  fila[api.COL_FOLIO - 1] = 'V-001';
  pon('Proyecto', 'Farmacia Guadalajara - Letras'); pon('Estatus', 'LIQUIDADO'); pon('Cuenta ', 'Elias BBVA');
  pon('IVA', 'Sí'); pon('Precio Subtotal', 25000); pon('Precio Neto ', 29000);
  pon('Anticipo', 15000); pon('Liquidacion', 14000); pon('Pago Pendiente', 0);
  pon('Comisiones', 2500); pon('Abono Comision', 2500); pon('Comision Restante', 0);
  pon('Fecha Anticipo e Instalacion', vm.runInContext('new Date(Date.UTC(2024, 2, 12))', ctx));
  pon('Fecha Liquidacion', vm.runInContext('new Date(Date.UTC(2024, 2, 30))', ctx));
  pon('Tipo de trabajo', 'Letras 3D con iluminacion');

  const plano = api.aplanarFila(fila, 'America/Mexico_City');
  eq('la fila baja sin folio de cotización', plano['Folio cotizacion'], '');
  eq('deNotion no tiene proyecto que espejar', deNotion(plano), null);
  /* LA TRAMPA, escrita porque ya se cayó en ella. `bajar()` pedía el parche de `deNotion`
     ANTES de buscar el proyecto y hacía `continue` con su null. Como `deNotion` devuelve null
     exactamente cuando la fila no trae folio de cotización —que es LA condición de las filas
     que hay que importar— el camino de importación no se pisaba nunca: se escribió, pasó las
     pruebas de node, y en la hoja no apareció ni un proyecto. Lo atrapó mirar el tablero, no
     una prueba, porque `bajar()` solo lo cubre una de navegador y ésas no corren en Windows.
     Lo que se prueba aquí es el invariante que hace falta: que de una fila SIN folio de
     cotización se pueda sacar un proyecto, o sea que la decisión NO puede depender del
     parche. */
  cierto('y aun así de esa misma fila tiene que poder salir un proyecto: la decisión de ' +
         'importar no puede depender del parche de deNotion',
         !!desdeVentaDeHoja({ ...ventaDeHoja(plano), estatus: 'FABRICACION' }));
  const v = ventaDeHoja(plano);
  eq('pero ventaDeHoja la vuelve un renglón del récord, con el folio de la hoja de id', v.id, 'hoja:V-001');
  eq('con el neto de la hoja', v.neto, 29000);
  eq('y la fecha del anticipo', v.fecha_anticipo, '2024-03-12');
  const u = unificar([], [v]);
  eq('sin proyectos aquí, es una venta de la hoja', [u.de_hoja, u.enlazados], [1, 0]);
  eq('Control la suma por el neto', vendidoDe(u.ventas[0]), 29000);
  eq('con saldo cero porque la hoja dice LIQUIDADO', saldoDe(u.ventas[0]), 0);
  eq('en marzo de 2024', resumenMensual(u.ventas, { hoy: '2024-03-31', meses: 1 })[0].vendido, 29000);
  eq('y sin etapa: no es un proyecto y no lo finge', [u.ventas[0].de_hoja, u.ventas[0].etapa], [true, null]);

  /* A fabricación la hoja le quita el dinero antes de mandar la fila, y el renglón del récord
     tampoco lo inventa: la fila existe, el importe no. */
  const sinDinero = ventaDeHoja(api.sinLoQueNoLeToca(api.aplanarFila(fila, 'America/Mexico_City'), 'fabricacion'));
  eq('a fabricación le llega el renglón sin importe, no con cero', [sinDinero.nombre, sinDinero.neto, sinDinero.pago_pendiente],
     ['Farmacia Guadalajara - Letras', undefined, undefined]);
}

/* ============================================================================
   LA HOJA DE MENTIRAS — el .gs entero, corriendo contra una cuadrícula.

   Lo mínimo de SpreadsheetApp, PropertiesService, CacheService, LockService y UrlFetchApp
   que usan /empujar, /jalar, ordenarVentas, los formularios del menú y la realineación. Cada
   llamada crea un contexto nuevo: nada se arrastra de un caso al siguiente.
   ============================================================================ */
function hojaDeMentiras({ candadoLibre = true, props = {}, google = [] } = {}) {
  const hojas = {};
  const candados = [];
  const colDe = s => s.split('').reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0);
  function nuevaHoja(nombre, filas = 330, cols = 30) {
    const g = [];
    for (let r = 0; r <= filas; r++) g.push(new Array(cols + 1).fill(''));
    const h = {
      _g: g, _oculta: false,
      getName: () => nombre, setName(n) { delete hojas[nombre]; nombre = n; hojas[n] = h; return h; },
      getMaxColumns: () => cols, getMaxRows: () => filas,
      getLastRow() { let u = 0; for (let r = 1; r <= filas; r++) if (g[r].some((v, i) => i > 0 && v !== '')) u = r; return u; },
      getRange(a, b, n, m) {
        if (typeof a === 'string') {
          const x = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a);
          const r1 = +x[2], c1 = colDe(x[1]), r2 = x[4] ? +x[4] : r1, c2 = x[3] ? colDe(x[3]) : c1;
          return rango(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
        }
        return rango(a, b, n || 1, m || 1);
      },
      deleteRows(ini, k) { g.splice(ini, k); for (let i = 0; i < k; i++) g.push(new Array(cols + 1).fill('')); },
      copyTo() { const c = nuevaHoja(nombre + ' (copia)', filas, cols); for (let r = 0; r <= filas; r++) c._g[r] = g[r].slice(); return c; },
      hideSheet() { h._oculta = true; return h; },
      setFrozenRows() {}, setColumnWidth() {}, insertColumnsAfter() {}, setActiveRange() {},
      insertRowsAfter(_d, k) { for (let i = 0; i < k; i++) g.push(new Array(cols + 1).fill('')); filas += k; },
    };
    function rango(r, c, n, m) {
      if (c + m - 1 > cols || r + n - 1 > filas) throw new Error('fuera de la hoja: ' + [r, c, n, m]);
      const R = {
        getValues: () => { const o = []; for (let i = 0; i < n; i++) o.push(g[r + i].slice(c, c + m)); return o; },
        setValues: v => { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) g[r + i][c + j] = v[i][j]; return R; },
        getValue: () => g[r][c], setValue: v => { g[r][c] = v; return R; },
      };
      for (const k of ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment'])
        R[k] = () => R;
      return R;
    }
    hojas[nombre] = h;
    return h;
  }
  const ss = {
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => nuevaHoja(n, 400, 8),
    deleteSheet: h => { delete hojas[h.getName()]; },
    getSpreadsheetTimeZone: () => 'America/Mexico_City',
    setActiveSheet() {}, toast() {},
  };
  const cache = new Map();
  const pedidasAGoogle = [];
  const ctx2 = vm.createContext({
    SpreadsheetApp: { getActive: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({
      tryLock: ms => { candados.push(ms); return candadoLibre; },
      waitLock: ms => { candados.push(ms); if (!candadoLibre) throw new Error('ocupado'); },
      releaseLock() {} }) },
    UrlFetchApp: { fetch: u => { pedidasAGoogle.push(u); const r = google.shift(); if (!r) throw new Error('sin red'); return r; } },
    ContentService: { createTextOutput: s => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
    Utilities: {
      formatDate: d => d.toISOString().slice(0, 10),
      computeDigest: (_a, s) => Array.from(Buffer.from(String(s))).slice(0, 32),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'sha' },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@al3d.mx' }) },
    console,
  });
  vm.runInContext(src, ctx2);
  const run = code => vm.runInContext(code, ctx2);
  const C = run('COL');
  const v = nuevaHoja('Ventas');
  nuevaHoja('Abonos comisión', 2100, 6);
  /* Una venta en la fila `r`: folio, y lo demás por nombre de columna del puente. */
  const pon = (r, folio, campos) => {
    v._g[r][1] = folio;
    for (const [k, x] of Object.entries(campos)) v._g[r][C[k]] = x;
  };
  const fila = folio => { for (let r = 2; r <= 310; r++) if (v._g[r][1] === folio) return r; return 0; };
  const celda = (folio, nombre) => { const r = fila(folio); return r ? v._g[r][C[nombre]] : undefined; };
  const empujar = (ops, rol) => run('rutaEmpujar(' + JSON.stringify({ ops }) + ', ' + JSON.stringify(rol) + ')');
  return { ss, hojas, v, C, pon, fila, celda, empujar, run, props, candados, cache, pedidasAGoogle, nuevaHoja };
}
const respuesta = (codigo, cuerpo) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(cuerpo) });

console.log('\nEL REACOMODO — Y:AD viajan con su fila (defecto 1)');
{
  /* El caso de la auditoría: la venta nueva entra en FABRICACION, el reacomodo la sube a la
     fila 2, y hasta puente-sheets-5 su «Folio cotizacion» se quedaba abajo, pegado a la
     venta liquidada que bajó a su renglón. El alta de la plataforma, que busca por ese folio,
     escribía después el nombre y el dinero de la nueva ENCIMA de la liquidada. */
  const H = hojaDeMentiras();
  H.pon(2, 'V-003', { 'Proyecto': 'Ana - Cafe', 'Estatus': 'FABRICACION', 'Cuenta ': 'Rul HSBC', 'Precio Subtotal': 20000 });
  H.pon(3, 'V-002', { 'Proyecto': 'Beto - Taller', 'Estatus': 'COBRANDO', 'Cuenta ': 'Moni MPago', 'Precio Subtotal': 15000 });
  H.pon(4, 'V-001', { 'Proyecto': 'Carla - Farmacia', 'Estatus': 'LIQUIDADO', 'Cuenta ': 'Elias BBVA', 'Precio Subtotal': 9000 });
  /* Centinelas en las columnas de fórmula: el reacomodo no las toca nunca. */
  for (let r = 2; r <= 4; r++) { H.v._g[r][8] = 'H' + r; H.v._g[r][11] = 'K' + r; H.v._g[r][15] = 'O' + r; }
  const cot = { 'Proyecto': 'Dani - Gym', 'Precio Subtotal': 30000, 'IVA': true, 'Anticipo': 15000, 'Estatus': 'FABRICACION',
                'Cuenta ': 'Rul HSBC', 'Folio cotizacion': 'COT-0042@K7QM', 'Etapa de obra': 'Ganado', 'Direccion': 'Av. Patria 100' };
  const r1 = H.empujar([{ id: 'COT-0042@K7QM', datos: cot }], 'direccion');
  eq('la venta del cotizador entra con folio nuevo', r1.resultados[0].remoto.id_notion, 'V-004');
  eq('y después del reacomodo su folio de cotización sigue en SU fila', H.celda('V-004', 'Folio cotizacion'), 'COT-0042@K7QM');
  eq('con su dirección', H.celda('V-004', 'Direccion'), 'Av. Patria 100');
  eq('y la liquidada no se quedó con nada de ella', H.celda('V-001', 'Folio cotizacion'), '');
  const alta = { 'Proyecto': 'Dani - Gym', 'Folio cotizacion': 'COT-0042@K7QM', 'Etapa de obra': 'Ganado', 'Ubicacion': '20.67,-103.4' };
  const r2 = H.empujar([{ id: 'op-plat', tipo: 'crear', id_notion: null, datos: alta }], 'direccion');
  eq('el alta de la plataforma encuentra la MISMA fila, no la de otra venta', r2.resultados[0].remoto.id_notion, 'V-004');
  eq('y la liquidada sigue siendo Carla', H.celda('V-001', 'Proyecto'), 'Carla - Farmacia');
  eq('las columnas de fórmula no se movieron ni una celda', [2, 3, 4, 5].map(r => [H.v._g[r][8], H.v._g[r][11], H.v._g[r][15]]),
     [['H2', 'K2', 'O2'], ['H3', 'K3', 'O3'], ['H4', 'K4', 'O4'], ['', '', '']]);

  /* Una hoja anterior al puente tiene 24 columnas: el reacomodo no puede pedirle la 30. */
  const Vieja = hojaDeMentiras();
  const corta = Vieja.nuevaHoja('Ventas', 330, 24);
  corta._g[2][1] = 'V-001'; corta._g[2][2] = 'X'; corta._g[2][3] = 'LIQUIDADO';
  corta._g[3][1] = 'V-002'; corta._g[3][2] = 'Y'; corta._g[3][3] = 'FABRICACION';
  let truena = null;
  try { Vieja.run('ordenarVentas(SpreadsheetApp.getActive().getSheetByName("Ventas"))'); } catch (e) { truena = e.message; }
  eq('en una hoja de 24 columnas el reacomodo no truena', truena, null);
  eq('y reacomoda', [corta._g[2][1], corta._g[3][1]], ['V-002', 'V-001']);
}

console.log('\nREGISTRAR UN COBRO — LIQUIDADO va en el estatus, no en la cuenta (defecto 2)');
{
  /* Con Y:AD ya realineadas: antes de eso ordenarVentas no mueve filas (ver el bloque de la
     realineación, al final). */
  const H = hojaDeMentiras({ props: { PUENTE_Y_AD_ALINEADAS: '2026-09-24' } });
  /* Sin reacomodar todavía: la que se cobra está arriba de una en fabricación. */
  H.pon(2, 'V-007', { 'Proyecto': 'Ana - Cafe', 'Estatus': 'COBRANDO', 'Cuenta ': 'Elias BBVA', 'IVA': 'No',
                      'Precio Subtotal': 10000, 'Anticipo': 5000 });
  H.pon(3, 'V-008', { 'Proyecto': 'Otra', 'Estatus': 'FABRICACION', 'Cuenta ': 'Rul HSBC' });
  H.v._g[2][11] = 5000;   // K, la fórmula del saldo
  const msg = H.run(`guardarCobro({ folio: 'V-007', monto: '5000', fecha: '2026-09-23', liquidar: true })`);
  eq('el estatus queda LIQUIDADO', H.celda('V-007', 'Estatus'), 'LIQUIDADO');
  eq('y la cuenta sigue siendo la cuenta', H.celda('V-007', 'Cuenta '), 'Elias BBVA');
  H.run('normalizarIvaActivos(SpreadsheetApp.getActive().getSheetByName("Ventas"))');
  eq('la siguiente subida ya no le cambia el IVA: no hay saldo fantasma', H.celda('V-007', 'IVA'), 'No');
  eq('se reacomodó: la liquidada bajó', [H.fila('V-008'), H.fila('V-007')], [2, 3]);
  cierto('el formulario tomó el candado', H.candados.length > 0);
  cierto('y contesta con el saldo', /registrado en V-007/.test(msg));
  const H2 = hojaDeMentiras();
  H2.pon(2, 'V-001', { 'Proyecto': 'X', 'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC' });
  H2.v._g[2][11] = 100;
  eq('la lista de saldos del formulario lee el estatus de C, no la cuenta', H2.run('listaSaldos()[0].estatus'), 'COBRANDO');
}

console.log('\nNINGUNA FILA SIN NOMBRE Y NINGÚN FOLIO REPETIDO (defecto 3)');
{
  const H = hojaDeMentiras();
  H.pon(2, 'V-001', { 'Proyecto': 'Ana - Cafe', 'Estatus': 'LIQUIDADO' });
  /* V-002 existía y alguien borró su fila. El teléfono mueve la etapa de su proyecto. */
  const r = H.empujar([{ id: 'op1', tipo: 'actualizar', id_notion: 'V-002',
    datos: { 'Folio cotizacion': 'COT-0002@K7QM', 'Etapa de obra': 'Cortado', 'Direccion': 'Calle 1' } }], 'direccion');
  eq('un cambio contra una venta borrada vuelve NO_ENCONTRADO', r.resultados[0].codigo, 'NO_ENCONTRADO');
  cierto('y lo dice con el folio', /La venta V-002 ya no está en la hoja/.test(r.resultados[0].mensaje));
  eq('y NO crea ninguna fila', H.v._g[3].slice(1, 31).filter(x => x !== '').length, 0);

  /* PAGOS registra una venta desde el cotizador: no puede escribir el nombre. */
  const p = H.empujar([{ id: 'COT-0007@PAG1', datos: { 'Proyecto': 'Beto', 'Estatus': 'LIQUIDADO', 'Cuenta ': 'Elias BBVA',
    'Liquidacion': 6600, 'Folio cotizacion': 'COT-0007@PAG1' } }], 'pagos');
  eq('un alta sin permiso para el nombre vuelve NO_ENCONTRADO', p.resultados[0].codigo, 'NO_ENCONTRADO');
  cierto('y dice de qué teléfono tiene que salir', /Dala de alta desde Dirección/.test(p.resultados[0].mensaje));
  eq('y tampoco deja dinero en una fila sin nombre', H.v._g[3].slice(1, 31).filter(x => x !== '').length, 0);

  const n = H.empujar([{ id: 'op3', datos: { 'Proyecto': 'Caro - Gym', 'Folio cotizacion': 'COT-0100@DIR1' } }], 'direccion');
  eq('la venta nueva no recibe el folio de la borrada: la marca ya sabía de V-002', n.resultados[0].remoto.id_notion, 'V-003');

  /* La última venta se borra, y la marca sigue arriba. */
  H.v._g[H.fila('V-003')].fill('');
  const n2 = H.empujar([{ id: 'op4', datos: { 'Proyecto': 'Dani', 'Folio cotizacion': 'COT-0200@DIR1' } }], 'direccion');
  eq('borrar la última venta no devuelve su folio al montón', n2.resultados[0].remoto.id_notion, 'V-004');
  eq('la marca vive en las propiedades del script', H.props.FOLIO_MAS_ALTO, '4');

  /* Un folio que ya se había repartido dos veces ANTES de la marca: la fila con ese folio
     es otra venta. El teléfono de fabricación no puede escribir «Folio cotizacion», así que
     lo manda aparte, como identidad. */
  H.pon(9, 'V-009', { 'Proyecto': 'Eva - Nueva', 'Estatus': 'FABRICACION', 'Folio cotizacion': 'COT-0300@DIR1' });
  const op5 = [{ id: 'op5', tipo: 'actualizar', id_notion: 'V-009', folio_cotizacion: 'COT-0077@FAB2',
    datos: { 'Etapa de obra': 'Armado', 'Direccion': 'Calle Vieja 9' } }];
  /* Sin realinear, «Folio cotizacion» todavía puede estar en la fila de otra venta: el cambio
     espera (no se aparta para siempre) y no se busca por esa columna. */
  eq('sin realinear Y:AD, el cambio atado a otra cotización espera', H.empujar(op5, 'fabricacion').resultados[0].codigo, 'ESPERA_REALINEAR');
  eq('y no escribe nada', [H.celda('V-009', 'Direccion'), H.celda('V-009', 'Etapa de obra')], ['', '']);
  H.props.PUENTE_Y_AD_ALINEADAS = '2026-09-24';
  const f = H.empujar(op5, 'fabricacion');
  eq('si la fila con ese folio está atada a OTRA cotización, no se escribe ahí', f.resultados[0].codigo, 'NO_ENCONTRADO');
  eq('y la venta de esa fila queda intacta', [H.celda('V-009', 'Direccion'), H.celda('V-009', 'Etapa de obra')], ['', '']);

  /* Una fila libre con restos de otra venta: se prefiere una vacía, y la que se usa se limpia. */
  const L = hojaDeMentiras();
  L.pon(2, 'V-001', { 'Proyecto': 'Ana', 'Estatus': 'COBRANDO' });
  L.v._g[3][L.C['Estatus']] = 'LIQUIDADO'; L.v._g[3][L.C['Liquidacion']] = 6600; L.v._g[3][L.C['Folio cotizacion']] = 'COT-X';
  eq('la fila libre es la primera VACÍA, no la que tiene restos', L.run('primeraFilaLibre(SpreadsheetApp.getActive().getSheetByName("Ventas"))'), 4);
  L.v._g[3][8] = 'fórmula';
  L.run('limpiarFila(SpreadsheetApp.getActive().getSheetByName("Ventas"), 3)');
  eq('limpiar una fila borra lo capturado', [L.v._g[3][L.C['Estatus']], L.v._g[3][L.C['Liquidacion']], L.v._g[3][L.C['Folio cotizacion']]], ['', '', '']);
  eq('y no toca las fórmulas', L.v._g[3][8], 'fórmula');
}

console.log('\n«FOLIO COTIZACION» NO SE PISA EN UN CAMBIO (defecto 4, del lado de la hoja)');
{
  const H = hojaDeMentiras({ props: { PUENTE_Y_AD_ALINEADAS: '2026-09-24' } });
  H.pon(2, 'V-100', { 'Proyecto': 'Dani - Gym', 'Estatus': 'FABRICACION', 'Folio cotizacion': 'COT-0042@AAAA' });
  /* El teléfono que IMPORTÓ la fila, con el cliente de antes: manda su folio de hoja. */
  const r = H.empujar([{ id: 'opB', tipo: 'actualizar', id_notion: 'V-100',
    datos: { 'Folio cotizacion': 'V-100', 'Etapa de obra': 'En diseño' } }], 'direccion');
  eq('el cambio entra', r.resultados[0].ok, true);
  eq('pero la llave de la cotización se queda', H.celda('V-100', 'Folio cotizacion'), 'COT-0042@AAAA');
  eq('y lo que no se escribió se nombra', r.resultados[0].rechazadas.map(x => x.nombre), ['Folio cotizacion']);
  eq('la etapa sí', H.celda('V-100', 'Etapa de obra'), 'En diseño');
  const otro = H.empujar([{ id: 'opC', tipo: 'actualizar', id_notion: 'V-100', datos: { 'Folio cotizacion': 'COT-9999@ZZZZ' } }], 'direccion');
  eq('un cambio atado a OTRA cotización no se escribe en esta fila', otro.resultados[0].codigo, 'NO_ENCONTRADO');
  eq('y la llave sigue siendo la de la fila', H.celda('V-100', 'Folio cotizacion'), 'COT-0042@AAAA');
  /* Una fila ya ensuciada por el defecto (su llave dice su propio folio) no deja fuera al
     teléfono dueño de la cotización: la suya entra y la repara. */
  H.pon(3, 'V-101', { 'Proyecto': 'Eli', 'Estatus': 'FABRICACION', 'Folio cotizacion': 'V-101' });
  const rep = H.empujar([{ id: 'opA', tipo: 'actualizar', id_notion: 'V-101',
    datos: { 'Folio cotizacion': 'COT-0050@AAAA', 'Etapa de obra': 'Cortado' } }], 'direccion');
  eq('una llave que dice el folio de la propia fila no cuenta como llave', rep.resultados[0].ok, true);
  eq('y la de verdad la repara', H.celda('V-101', 'Folio cotizacion'), 'COT-0050@AAAA');
}

console.log('\nLO QUE VUELVE DE /EMPUJAR — el rol cierra también la respuesta (defecto 6)');
{
  const H = hojaDeMentiras();
  H.pon(2, 'V-001', { 'Proyecto': 'Ana - Cafe', 'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC', 'Precio Subtotal': 20000,
                      'Precio Neto ': 23200, 'Anticipo': 10000, 'Pago Pendiente': 13200, 'Comisiones': 2000 });
  const r = H.empujar([{ id: 'x', tipo: 'actualizar', id_notion: 'V-001', datos: { 'Etapa de obra': 'Cortado' } }], 'fabricacion');
  const rem = r.resultados[0].remoto;
  eq('fabricación mueve la etapa', rem['Etapa de obra'], 'Cortado');
  eq('y de vuelta no le llega ni una cifra', api.CAMPOS_DE_DINERO.filter(c => rem[c] !== undefined), []);
  eq('pero sí el folio, que es con lo que se ata', rem.id_notion, 'V-001');
  const d = H.empujar([{ id: 'y', tipo: 'actualizar', id_notion: 'V-001', datos: { 'Etapa de obra': 'Armado' } }], 'direccion');
  eq('dirección sí recibe el dinero', d.resultados[0].remoto['Pago Pendiente'], 13200);
}

console.log('\nENTRAR CON GOOGLE — un tropiezo de Google no se guarda como un «no» (defecto 7)');
{
  const tok = 'ya29.' + 'x'.repeat(60);
  const aud = vm.runInContext('PUENTE_CLIENT_IDS[0]', ctx);
  const bueno = respuesta(200, { aud, email: 'ana@al3d.mx', email_verified: 'true' });
  const H = hojaDeMentiras({ google: [respuesta(503, { error: 'backendError' }), bueno] });
  const acc = H.nuevaHoja('Accesos', 20, 3);
  acc._g[1] = ['', 'Correo', 'Rol', 'Nota']; acc._g[2] = ['', 'ana@al3d.mx', 'pagos', ''];
  eq('con un 503 de Google no entra', H.run('identidadDelIngreso(' + JSON.stringify(tok) + ')'), null);
  eq('pero cuatro segundos después, con Google de vuelta, sí', H.run('JSON.stringify(identidadDelIngreso(' + JSON.stringify(tok) + '))'),
     JSON.stringify({ correo: 'ana@al3d.mx', rol: 'pagos' }));
  eq('porque la segunda vez sí le preguntó a Google', H.pedidasAGoogle.length, 2);

  const M = hojaDeMentiras({ google: [respuesta(401, { error: 'invalid_token' }), bueno] });
  M.run('identidadDelIngreso(' + JSON.stringify(tok) + ')');
  M.run('identidadDelIngreso(' + JSON.stringify(tok) + ')');
  eq('un 401 sí es un «no» de verdad y se guarda: la segunda vez no se pregunta', M.pedidasAGoogle.length, 1);
  const Q = hojaDeMentiras({ google: [respuesta(429, {}), bueno] });
  Q.nuevaHoja('Accesos', 20, 3)._g[2] = ['', 'ana@al3d.mx', 'pagos', ''];
  Q.run('identidadDelIngreso(' + JSON.stringify(tok) + ')');
  eq('un 429 tampoco se guarda', Q.run('!!identidadDelIngreso(' + JSON.stringify(tok) + ')'), true);
}

console.log('\nEL CANDADO — toda escritura sobre Ventas lo toma (defecto 10)');
{
  const H = hojaDeMentiras();
  H.pon(2, 'V-001', { 'Proyecto': 'Ana', 'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC' });
  H.v._g[2][11] = 100;
  const antes = H.candados.length;
  H.run(`guardarVenta({ proyecto: 'Beto', cuenta: 'Rul HSBC', estatus: 'FABRICACION', iva: 'Sí', subtotal: '100' })`);
  H.run(`guardarAbono({ folio: 'V-001', monto: '10' })`);
  cierto('guardarVenta y guardarAbono toman el candado', H.candados.length >= antes + 2);
  eq('el formulario de venta usa la misma marca de folios que el puente', H.celda('V-002', 'Proyecto'), 'Beto');

  const O = hojaDeMentiras({ candadoLibre: false });
  O.pon(2, 'V-001', { 'Proyecto': 'Ana', 'Estatus': 'COBRANDO' });
  let dijo = '';
  try { O.run(`guardarVenta({ proyecto: 'Beto', cuenta: 'Rul HSBC', estatus: 'FABRICACION', iva: 'Sí', subtotal: '100' })`); }
  catch (e) { dijo = e.message; }
  cierto('con el puente escribiendo, el formulario dice por qué no entra', /ocupada con otra escritura/.test(dijo));
  eq('y no escribió nada', O.fila('V-002'), 0);
  const e = O.run(`(function () { var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
    h.getRange(3, 2).setValue('Caro');
    alEditar({ range: { getSheet: function () { return h; }, getColumn: function () { return 2; }, getNumColumns: function () { return 1; },
                        getRow: function () { return 3; }, getNumRows: function () { return 1; } } });
    return h.getRange(3, 1).getValue(); })()`);
  eq('alEditar con el candado ocupado no reparte folio (lo pone la siguiente edición)', e, '');
}

console.log('\n/JALAR — la hoja entera en una página (defecto 12)');
{
  const H = hojaDeMentiras();
  for (let i = 1; i <= 120; i++) H.pon(i + 1, 'V-' + String(i).padStart(3, '0'), { 'Proyecto': 'Venta ' + i, 'Estatus': 'LIQUIDADO' });
  const j = H.run('rutaJalar({}, "direccion")');
  eq('ciento veinte filas en una sola respuesta', j.registros.length, 120);
  eq('sin página siguiente: un reacomodo a media bajada ya no deja una fuera', [j.hay_mas, j.cursor], [false, null]);
}

console.log('\nLA COPIA PEGADA CON SU FOLIO (defecto 13)');
{
  const H = hojaDeMentiras();
  H.pon(2, 'V-001', { 'Proyecto': 'Ana', 'Estatus': 'COBRANDO', 'Folio cotizacion': 'COT-1@A' });
  H.pon(3, 'V-002', { 'Proyecto': 'Beto', 'Estatus': 'COBRANDO' });
  /* Se copia la fila 2 entera, con su folio, a la 4. */
  H.v._g[4] = H.v._g[2].slice();
  H.v._g[4][H.C['Proyecto']] = 'Ana (la copia)';   // para reconocerla después del reacomodo
  H.run(`(function () { var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
    alEditar({ range: { getSheet: function () { return h; }, getColumn: function () { return 1; }, getNumColumns: function () { return 30; },
                        getRow: function () { return 4; }, getNumRows: function () { return 1; } } }); })()`);
  eq('la original conserva su folio', H.celda('V-001', 'Proyecto'), 'Ana');
  eq('la copia recibe uno nuevo', H.celda('V-003', 'Proyecto'), 'Ana (la copia)');
  eq('y ya no hay dos filas con el mismo folio', H.v._g.slice(2, 6).map(f => f[1]).filter(Boolean).sort(), ['V-001', 'V-002', 'V-003']);
  eq('la copia tampoco se queda con el folio de cotización de la original', [H.celda('V-001', 'Folio cotizacion'), H.celda('V-003', 'Folio cotizacion')], ['COT-1@A', '']);
  const x = H.run('formulasVentas.toString()');
  cierto('y la columna «Revisar» avisa de un folio repetido que se escape', /Folio repetido/.test(x) && /COUNTIF\(/.test(x));
}

console.log('\nLA HOJA QUE YA QUEDÓ REVUELTA — se realinea una vez, desde la bitácora');
{
  /* Se arma a mano el estado que dejaba puente-sheets-5: tres subidas anotadas en la bitácora
     con su fila, y después un reacomodo que movió A:N y dejó Y:AD donde estaban. */
  const H = hojaDeMentiras();
  const bit = H.nuevaHoja('Bitácora del puente', 50, 6);
  let b = 1;
  const anota = (folio, filaEntonces, campos, nota) => { b++; bit._g[b] = ['', 'hoy', 'direccion', folio, filaEntonces, campos, nota || '']; };
  // Así estaban al escribirse:
  H.pon(2, 'V-001', { 'Proyecto': 'Ana', 'Estatus': 'LIQUIDADO', 'Folio cotizacion': 'COT-1@A', 'Etapa de obra': 'Instalado', 'Direccion': 'Dir Ana' });
  anota('V-001', 2, 'Proyecto, Folio cotizacion, Etapa de obra, Direccion', 'fila nueva');
  H.pon(3, 'V-002', { 'Proyecto': 'Beto', 'Estatus': 'COBRANDO', 'Folio cotizacion': 'COT-2@A', 'Direccion': 'Dir Beto' });
  anota('V-002', 3, 'Proyecto, Folio cotizacion, Direccion', 'fila nueva');
  H.pon(4, 'V-003', { 'Proyecto': 'Caro', 'Estatus': 'FABRICACION', 'Folio cotizacion': 'COT-3@A', 'Direccion': 'Dir Caro' });
  anota('V-003', 4, 'Proyecto, Folio cotizacion, Direccion', 'fila nueva');
  // El reacomodo de antes: A:N se mueven (Caro arriba, Ana abajo), Y:AD no.
  const an = r => H.v._g[r].slice(1, 15);
  const [a2, a4] = [an(2), an(4)];
  for (let c = 1; c <= 14; c++) { H.v._g[2][c] = a4[c - 1]; H.v._g[4][c] = a2[c - 1]; }
  // Y después fabricación movió la etapa de Ana, que ya estaba en la fila 4:
  H.v._g[4][H.C['Etapa de obra']] = 'En garantía';
  anota('V-001', 4, 'Etapa de obra');
  // Una celda que nadie anotó, y una de una venta que ya no existe:
  H.v._g[3][H.C['Ubicacion']] = '20.6,-103.3';
  H.v._g[5][H.C['Direccion']] = 'Dir fantasma';
  anota('V-009', 5, 'Direccion');
  // El respaldo de mejorarTodo, de cuando V-003 se llamaba de otra forma:
  const resp = H.nuevaHoja('Ventas (respaldo)', 330, 30);
  resp._g[2][1] = 'V-003'; resp._g[2][2] = 'Carla';

  eq('antes de realinear, Caro (fila 2) trae la llave de Ana', H.celda('V-003', 'Folio cotizacion'), 'COT-1@A');
  /* Mientras no se realinea, el reacomodo NO mueve filas: mover A:X sin Y:AD es lo que las
     revolvió, y moverlas todas borraría la pista de la bitácora. Ana pasa a REPARANDO y se
     queda en la fila 4. */
  H.v._g[4][H.C['Estatus']] = 'REPARANDO';
  H.run('ordenarVentas(SpreadsheetApp.getActive().getSheetByName("Ventas"))');
  eq('mientras no se realinea, no se reacomoda nada',
     [H.fila('V-001'), H.v._g[3][H.C['Folio cotizacion']]], [4, 'COT-2@A']);

  let sinVista = null;
  try { H.run('realinearColumnasDelPuente()'); } catch (e) { sinVista = e.message; }
  cierto('sin vista previa, realinear no aplica nada', /vista previa/.test(sinVista || '') &&
         H.celda('V-003', 'Folio cotizacion') === 'COT-1@A' && !H.props.PUENTE_Y_AD_ALINEADAS);

  const vista = H.run('revisarColumnasDelPuente()');
  cierto('la vista previa dice cuánto movería y no escribe en Ventas',
         /Vista previa/.test(vista) && H.celda('V-003', 'Folio cotizacion') === 'COT-1@A' && !H.props.PUENTE_Y_AD_ALINEADAS);

  const r = H.empujar([{ id: 'op', tipo: 'actualizar', id_notion: 'V-002', datos: { 'Etapa de obra': 'Armado' } }], 'direccion');
  eq('una subida ya no realinea sola: escribe por el folio de la hoja', [r.resultados[0].ok, H.celda('V-003', 'Folio cotizacion')], [true, 'COT-1@A']);
  /* La subida cambió la hoja: la vista previa de antes ya no vale y hay que volver a verla. */
  let vieja = null;
  try { H.run('realinearColumnasDelPuente()'); } catch (e) { vieja = e.message; }
  cierto('con la hoja cambiada desde la vista previa, tampoco', vieja === null
    ? !!H.props.PUENTE_Y_AD_ALINEADAS   // si la propuesta no cambió, aplicarla es lo correcto
    : /cambió/.test(vieja) && !H.props.PUENTE_Y_AD_ALINEADAS);
  if (!H.props.PUENTE_Y_AD_ALINEADAS) {
    H.run('revisarColumnasDelPuente()');
    H.run('realinearColumnasDelPuente()');
  }
  eq('Caro recupera su folio de cotización', H.celda('V-003', 'Folio cotizacion'), 'COT-3@A');
  eq('y su dirección', H.celda('V-003', 'Direccion'), 'Dir Caro');
  eq('Ana recupera los suyos', [H.celda('V-001', 'Folio cotizacion'), H.celda('V-001', 'Direccion')], ['COT-1@A', 'Dir Ana']);
  eq('con la etapa MÁS NUEVA que se le escribió, no la primera', H.celda('V-001', 'Etapa de obra'), 'En garantía');
  eq('Caro no hereda la etapa de Ana', H.celda('V-003', 'Etapa de obra'), '');
  eq('Beto, que el reacomodo de antes bajó, recupera su llave y trae su cambio', [H.celda('V-002', 'Folio cotizacion'), H.celda('V-002', 'Etapa de obra')], ['COT-2@A', 'Armado']);
  /* Se quedó en su renglón —el 3, el de Beto al realinear— y de ahí viaja con esa venta. */
  eq('lo que nadie anotó se queda en su renglón', H.celda('V-002', 'Ubicacion'), '20.6,-103.3');
  cierto('lo de la venta que ya no existe sale de Ventas', !H.v._g.some(f => f.includes('Dir fantasma')));
  const rev = H.ss.getSheetByName('Revisión Y-AD');
  cierto('y todo queda en la pestaña de revisión', rev && rev._g.some(f => f.includes('Dir fantasma')) &&
         rev._g.some(f => f.includes('COT-3@A')) && rev._g.some(f => f.includes('20.6,-103.3')));
  cierto('la revisión enseña la venta que cambió de nombre desde el respaldo', rev && rev._g.some(f => f.includes('Carla') && f.includes('Caro')));
  cierto('hay copia de Ventas de antes de realinear', !!H.ss.getSheetByName('Ventas (antes de realinear)'));
  cierto('y queda anotado que ya se hizo', !!H.props.PUENTE_Y_AD_ALINEADAS);
  cierto('a mano ya no vuelve a correr', /Ya estaba hecho/.test(H.run('realinearColumnasDelPuente()')));
  /* Y de aquí en adelante, Y:AD viajan con su fila. */
  H.empujar([{ id: 'op2', tipo: 'actualizar', id_notion: 'V-002', datos: {} }], 'direccion');
  const beto = H.fila('V-002');
  H.run(`(function () { var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
    h.getRange(${beto}, 3).setValue('FABRICACION'); ordenarVentas(h); })()`);
  eq('ya realineada, la que sube se lleva su llave, y la que baja la suya',
     [beto, H.fila('V-002'), H.celda('V-002', 'Folio cotizacion'), H.fila('V-001'), H.celda('V-001', 'Folio cotizacion')],
     [4, 3, 'COT-2@A', 4, 'COT-1@A']);
}

console.log('\nDATOS MALOS QUE NO DEBEN PASAR (revisión de puente-sheets-6)');
{
  const H = hojaDeMentiras({ props: { PUENTE_Y_AD_ALINEADAS: '2026-09-24' } });
  eq('«V-Infinity» no es un folio', H.run('numeroDeFolio("V-Infinity")'), -1);
  eq('«V-1e999» tampoco', H.run('numeroDeFolio("V-1e999")'), -1);
  eq('«V-042» sí', H.run('numeroDeFolio("V-042")'), 42);
  H.pon(2, 'V-001', { 'Proyecto': 'Ana', 'Estatus': 'COBRANDO' });
  H.empujar([{ id: 'x1', tipo: 'actualizar', id_notion: 'V-Infinity', datos: { 'Etapa de obra': 'Armado' } }], 'fabricacion');
  cierto('preguntar por «V-Infinity» no sube la marca de folios', !/Infinity/.test(String(H.props.FOLIO_MAS_ALTO || '')));
  const n = H.empujar([{ id: 'x2', datos: { 'Proyecto': 'Beto', 'Folio cotizacion': 'COT-2@B' } }], 'direccion');
  eq('y la venta nueva recibe un folio normal', n.resultados[0].remoto.id_notion, 'V-002');

  const lap = H.empujar([{ id: 'x3', datos: { 'Proyecto': 'Hugo - Restaurante', 'Etapa de obra': 'No se dio',
    'Precio Subtotal': 40000, 'Anticipo': 23200, 'Folio cotizacion': 'COT-9@H' } }], 'direccion');
  eq('una cotización que no se dio no se da de alta', lap.resultados[0].ok, false);
  eq('y no deja fila', H.fila('V-003'), 0);

  /* Un texto que empieza con «=» se escribió protegido con apóstrofo; el reacomodo lo lee sin
     él. Al reescribirlo tiene que volver a protegerse, o se vuelve fórmula. */
  H.pon(3, 'V-002', { 'Proyecto': 'Beto', 'Estatus': 'FABRICACION', 'Direccion': '=IMPORTXML("x")' });
  H.run('ordenarVentas(SpreadsheetApp.getActive().getSheetByName("Ventas"))');
  eq('al reacomodar, un texto con «=» se vuelve a escribir como texto', H.celda('V-002', 'Direccion'), "'=IMPORTXML(\"x\")");
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
