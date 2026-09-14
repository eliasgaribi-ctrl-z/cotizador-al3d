/* EL PUENTE DE LA HOJA, CORRIENDO DE VERDAD. Sin Google, sin cuenta, en node.

   Reemplaza a `pruebas/worker.mjs`, que probaba el Worker de Cloudflare contra una Notion
   de mentiras. El Worker ya no existe: el puente es un Apps Script y vive en
   `puente/hoja-apps-script.gs`.

   Ese archivo no es un módulo ES y no se puede importar, pero lo que de verdad importaba
   probar —la frontera de permisos y las validaciones que impiden inventar un valor de
   lista— es lógica pura: `armarCeldas` no toca la hoja, solo decide qué se escribe y qué
   se rechaza. Así que el archivo se evalúa en un contexto aparte y se prueban esas
   funciones directamente.

   Lo que esta prueba NO cubre, y antes sí: buscar la fila por folio antes de crear, que
   es lo que impide que un reintento tras una respuesta perdida acabe en dos ventas. Esa
   parte sí toca la hoja y necesitaría un doble de SpreadsheetApp entero.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

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
const ctx = vm.createContext({
  SpreadsheetApp: noImplementado, PropertiesService: noImplementado,
  Utilities: noImplementado, ScriptApp: noImplementado, MailApp: noImplementado,
  LockService: noImplementado, ContentService: noImplementado,
  HtmlService: noImplementado, Logger: noImplementado, console,
});
vm.runInContext(src, ctx);
const api = vm.runInContext(
  '({ armarCeldas, rutaExpandir, sinLoQueNoLeToca, PUENTE_ROLES, PUENTE_FORMULAS, COL,' +
  '   ESTATUS, CUENTAS, ETAPAS_OBRA, TIPOS_TRABAJO, DOMINIOS_MAPS,' +
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
    'Liquidacion': 0, 'Pago Pendiente': -7920, 'Comisiones': 1200,
    'Abono Comision': 0, 'Comision Restante': 1200, 'Cuenta ': 'Rul HSBC',
    'Fecha Liquidacion': '2026-09-14',
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
    eq('  con el pendiente intacto', r['Pago Pendiente'], -7920);
  }

  eq('quien ve el dinero son dos de tres',
     Object.keys(api.VE_EL_DINERO).filter(r => api.VE_EL_DINERO[r]).sort(),
     ['direccion', 'pagos']);
  /* Un rol sin entrada en la tabla NO ve el dinero: el default es cerrado. */
  eq('un rol desconocido tampoco lo ve',
     api.sinLoQueNoLeToca(espejo(), 'inventado')['Anticipo'], undefined);

  /* La versión cambia cuando cambia el contrato: es como se sabe si la hoja quedó vieja. */
  eq('la versión dice que el filtrado ya está', api.PUENTE_VERSION, 'puente-sheets-3');
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
