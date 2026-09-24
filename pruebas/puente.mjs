/* Prueba las funciones puras de datos/puente.js —los mapeos entre el proyecto de la
   plataforma y las propiedades de Notion— y, sobre todo, LA COHERENCIA CON EL WORKER.

   Esa segunda parte es la que justifica el archivo. `puente/worker.js` no se importa: se
   pega a mano en el editor de Cloudflare, así que su vocabulario está duplicado por
   necesidad, y una duplicación que nadie compara es una duplicación que se separa. Cuando
   se separe, Notion NO va a fallar: va a CREAR la opción que no conoce, y el esquema se
   ensucia una venta a la vez hasta que las siete vistas dejan de cuadrar. Esta prueba lee
   el Worker como texto y compara las listas.

   Corre:  node pruebas/puente.mjs   (o pruebas/correr.sh, que corre todas) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { P, ETAPA_A_NOTION, ETAPA_DESDE_NOTION, ESTATUS, CUENTAS, ALMACENES, ESPEJOS,
         aNotion, deNotion, instalacionANotion, ventaDeHoja, normalizarUrl, instrucciones,
         VERSION_ESPERADA, versionVieja, avisoVersion, motivoPerdida, mensajePerdida }
  from '../js/datos/puente.js';
import { TIPOS_TRABAJO, ETAPA_NOMBRE } from '../js/datos/proyectos.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v) => eq(que, !!v, true);

/* ---------------------------------------------------------------------------
   Un proyecto como lo guarda §4.4, con lo mínimo que el mapeo mira.
   --------------------------------------------------------------------------- */
const proy = (o = {}) => ({
  id: 'proy-1', folio_local: 'COT-0042', dispositivo: 'K7QM',
  folio_global: 'COT-0042@K7QM',
  nombre: 'Ale - Parentesis (Letras Luz)',
  etapa: 'ganado',
  tipo_trabajo: ['Letras 3D con iluminacion'],
  fecha_ganado: '2026-08-23',
  dir_texto: 'Av. Vallarta 1234, Guadalajara',
  lat: 20.6736, lng: -103.344,
  sub: 12000, neto: 13920, anti_pactado: 6000, iva: true,
  estatus_notion: 'FABRICACION', cuenta: 'Elias BBVA',
  notion_page_id: null, notion_estado: 'pendiente',
  actualizado_en: 1000, ...o,
});

console.log('\nEL PROYECTO, EN PROPIEDADES DE NOTION');
{
  const n = aNotion(proy(), null);
  eq('el nombre va al título',        n[P.proyecto], 'Ale - Parentesis (Letras Luz)');
  eq('el subtotal es número',         n[P.subtotal], 12000);
  eq('el IVA es booleano',            n[P.iva], true);
  eq('el anticipo es el pactado',     n[P.anticipo], 6000);
  eq('el folio lleva el dispositivo', n[P.folio], 'COT-0042@K7QM');
  eq('la etapa va con su nombre legible', n[P.etapa], 'Ganado');
  eq('el estatus pasa porque existe', n[P.estatus], 'FABRICACION');
  eq('la cuenta pasa porque existe',  n[P.cuenta], 'Elias BBVA');
  eq('la dirección va tal cual',      n[P.direccion], 'Av. Vallarta 1234, Guadalajara');
  eq('la ubicación es lat,lng',       n[P.ubicacion], '20.6736,-103.344');
  eq('el tipo de trabajo es lista',   n[P.tipo], ['Letras 3D con iluminacion']);
}

console.log('\nLO QUE NUNCA SE MANDA: las fórmulas y lo que captura quien cobra');
{
  const n = aNotion(proy({ pago_pendiente: 7920, comision_restante: 1200 }), null);
  for (const k of [P.neto, P.pendiente, P.comisiones, P.comRestante,
                   P.liquidacion, P.abonoCom, P.fechaLiq]) {
    eq('no manda «' + k.trim() + '»', n[k], undefined);
  }
  eq('«Fecha Comision» ya no está en el vocabulario: la hoja no la tiene', P.fechaCom, undefined);
}

console.log('\nEL DINERO SOLO VIAJA EN EL ALTA O CUANDO FUE LO QUE CAMBIÓ');
{
  /* La hoja es el libro mayor: ahí PAGOS corrige el anticipo a mano. Cada subida —mover la
     etapa, poner un pin— mandaba también el anticipo y el subtotal que este teléfono tenía
     guardados, y pisaba la corrección. */
  const alta = aNotion(proy({ pct_comision: 15 }), null, { alta: true, campos: [] });
  eq('en el alta va el nombre',     alta[P.proyecto], 'Ale - Parentesis (Letras Luz)');
  eq('en el alta va el subtotal',   alta[P.subtotal], 12000);
  eq('en el alta va el anticipo',   alta[P.anticipo], 6000);
  eq('en el alta va el IVA',        alta[P.iva], true);
  eq('en el alta va la fecha del anticipo', alta[P.fecha], '2026-08-23');
  eq('y el % pactado',              alta[P.pctCom], 15);

  const etapa = aNotion(proy({ etapa: 'cortado', pct_comision: 15 }), null, { alta: false, campos: ['etapa'] });
  eq('al mover la etapa NO va el nombre',    etapa[P.proyecto], undefined);
  eq('ni el subtotal',                        etapa[P.subtotal], undefined);
  eq('ni el anticipo',                        etapa[P.anticipo], undefined);
  eq('ni el IVA',                             etapa[P.iva], undefined);
  eq('ni la fecha del anticipo',              etapa[P.fecha], undefined);
  eq('ni el % de comisión',                   etapa[P.pctCom], undefined);
  eq('pero la etapa sí',                      etapa[P.etapa], 'Cortado');
  eq('y la dirección, que es de la plataforma', etapa[P.direccion], 'Av. Vallarta 1234, Guadalajara');
  eq('y el estatus que aprieta PAGOS',        etapa[P.estatus], 'FABRICACION');
  eq('y el folio, que es la llave',           etapa[P.folio], 'COT-0042@K7QM');

  const anti = aNotion(proy({ anti_pactado: 7000 }), null, { alta: false, campos: ['anti_pactado'] });
  eq('si lo que cambió fue el anticipo, ése sí va', anti[P.anticipo], 7000);
  eq('y solo ése: el subtotal no',                 anti[P.subtotal], undefined);

  const sinPct = aNotion(proy({ pct_comision: 0 }), null);
  eq('un % en cero no se manda: vacío en la hoja es «el de siempre»', sinPct[P.pctCom], undefined);
  eq('sin opts es un alta: va todo, como siempre', aNotion(proy(), null)[P.subtotal], 12000);
}

console.log('\nLAS DOS FECHAS, Y POR QUÉ NO SE PISAN');
{
  const sinInst = aNotion(proy(), null);
  eq('la del anticipo lleva el día que se ganó',
     sinInst[P.fecha], '2026-08-23');
  eq('sin instalación no se inventa una fecha de instalación',
     sinInst[P.fechaInst], undefined);

  const conInst = aNotion(proy(), { fecha: '2026-09-01', hora: '10:00', estado: 'confirmada' });
  eq('con instalación, la columna de instalación la lleva', conInst[P.fechaInst], '2026-09-01');
  /* La que se rompía: en la hoja la columna del anticipo es «Fecha anticipo» y de ella
     cuelgan los días de cobro y la antigüedad. Escribirle la instalación le movía la
     antigüedad a toda la cartera. */
  eq('y la del anticipo NO se pisa con la instalación', conInst[P.fecha], '2026-08-23');
  eq('la hora va aparte, como texto',           conInst[P.horaInst], '10:00');

  const fechaMala = aNotion(proy(), { fecha: '01/09/2026' });
  eq('una fecha que no es ISO no pasa: es el error que ya se arregló del otro lado',
     fechaMala[P.fechaInst], undefined);
  const sinGanado = aNotion(proy({ fecha_ganado: '23 ago 2026' }), null);
  eq('y una fecha en es-MX tampoco entra por la puerta de atrás',
     sinGanado[P.fecha], undefined);
}

console.log('\nLO QUE NO EXISTE EN LA BASE NO SE MANDA: pegarlo LO CREARÍA');
{
  const n = aNotion(proy({ estatus_notion: 'ANTICIPO', cuenta: 'Otra', etapa: 'inventada' }), null);
  eq('un estatus que no existe se queda fuera', n[P.estatus], undefined);
  eq('una cuenta que no existe se queda fuera', n[P.cuenta], undefined);
  eq('una etapa que no existe se queda fuera',  n[P.etapa], undefined);
  const nulos = aNotion(proy({ estatus_notion: null, cuenta: null }), null);
  eq('sin estatus todavía, no se manda vacío',  nulos[P.estatus], undefined);
  eq('sin cuenta todavía, no se manda vacía',   nulos[P.cuenta], undefined);
}

console.log('\nLA UBICACIÓN: cero coma cero NO es «no sabemos dónde está»');
{
  eq('sin coordenada va vacía',
     aNotion(proy({ lat: null, lng: null }), null)[P.ubicacion], '');
  eq('la Isla Nula no se manda como si fuera un pin',
     aNotion(proy({ lat: 0, lng: 0 }), null)[P.ubicacion], '');
  eq('una coordenada rota va vacía',
     aNotion(proy({ lat: 'x', lng: 'y' }), null)[P.ubicacion], '');
}

console.log('\nLAS OCHO ETAPAS, IDA Y VUELTA');
for (const [local, notion] of Object.entries(ETAPA_A_NOTION)) {
  eq(local + ' -> «' + notion + '» -> ' + local, ETAPA_DESDE_NOTION[notion], local);
}
eq('son las ocho de §4.4', Object.keys(ETAPA_A_NOTION),
   ['ganado', 'en_diseno', 'cortado', 'armado', 'listo', 'instalado', 'garantia', 'cancelado']);

console.log('\nLA INSTALACIÓN SOLA, CONTRA LA MISMA FILA');
{
  eq('una instalación con fecha manda la suya y la hora, no la del anticipo',
     instalacionANotion({ fecha: '2026-09-01', hora: '10:00' }),
     { 'Fecha instalacion': '2026-09-01', 'Hora instalacion': '10:00' });
  eq('sin hora todavía, la hora va vacía y no se inventa',
     instalacionANotion({ fecha: '2026-09-01', hora: null })['Hora instalacion'], '');
  eq('sin fecha no hay nada que mandar', instalacionANotion({ hora: '10:00' }), {});
  eq('null no revienta', instalacionANotion(null), {});
}

console.log('\nEL ESPEJO QUE BAJA: solo lo que es de Notion');
{
  const fila = {
    id_notion: 'pag-1', editado: '2026-08-24T10:00:00.000Z',
    'Folio cotizacion': 'COT-0042@K7QM',
    'Proyecto': 'OTRO NOMBRE QUE ALGUIEN ESCRIBIÓ EN NOTION',
    'Etapa de obra': 'Instalado',
    'Direccion': 'una dirección distinta',
    'Tipo de trabajo': ['Recorte acrilico'],
    'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC',
    'Pago Pendiente': 7920, 'Comision Restante': 1200, 'Precio Neto ': 13920,
    'Anticipo': 6500, 'Porcentaje comision': 12,
  };
  const p = deNotion(fila);
  eq('trae el id de la página',   p.notion_page_id, 'pag-1');
  eq('el estatus baja',           p.estatus_notion, 'COBRANDO');
  eq('la cuenta baja',            p.cuenta, 'Rul HSBC');
  eq('el pago pendiente baja, POSITIVO: lo que te deben', p.pago_pendiente, 7920);
  eq('la comisión restante baja', p.comision_restante, 1200);
  eq('el anticipo corregido en la hoja baja', p.anti_pactado, 6500);
  eq('y el % de comisión también',            p.pct_comision, 12);
  eq('queda marcado como enviado', p.notion_estado, 'enviado');

  /* Esto es lo que separa un espejo de una pelea por quién manda. De estos campos la dueña
     es la plataforma (§4.0) y no bajan aunque la fila los traiga. */
  for (const k of ['nombre', 'etapa', 'tipo_trabajo', 'dir_texto', 'sub', 'neto', 'lat', 'lng']) {
    eq('NO baja «' + k + '»: de ese la dueña es la plataforma', p[k], undefined);
  }

  /* El otro lado del filtrado de rol: a fabricación la hoja le manda la fila SIN los campos
     de dinero. `deNotion` no puede tratar un campo ausente como un cero, porque eso pintaría
     «ya no deben nada» en un proyecto que sí debe. */
  const sinDinero = { 'Folio cotizacion': 'COT-0007', id_notion: 'pag-1', 'Estatus': 'COBRANDO',
                      'Etapa de obra': 'Cortado', 'Direccion': 'Av. Vallarta 1234' };
  const f = deNotion(sinDinero);
  eq('la fila sin dinero sigue atando por folio', f.folio_global, 'COT-0007');
  eq('el pendiente queda sin tocar, no en cero',  f.pago_pendiente, undefined);
  eq('la comisión restante igual',                f.comision_restante, undefined);
  eq('el anticipo ausente tampoco se vuelve cero', f.anti_pactado, undefined);
  eq('la cuenta ausente no baja',                 f.cuenta, undefined);
  eq('el estatus, que no es dinero, sí baja',     f.estatus_notion, 'COBRANDO');

  eq('sin folio no hay nada que atar', deNotion({ id_notion: 'x', 'Estatus': 'COBRANDO' }), null);
  eq('null no revienta', deNotion(null), null);
  const raros = deNotion({ 'Folio cotizacion': 'COT-1@A', 'Estatus': 'INVENTADO', 'Cuenta ': 'Otra' });
  eq('un estatus que no existe no baja', raros.estatus_notion, undefined);
  eq('una cuenta que no existe no baja', raros.cuenta, undefined);
}

console.log('\nEL RÉCORD DE VENTAS: cada fila de la hoja, con o sin proyecto aquí');
{
  /* Una de las 199: anterior a la plataforma, sin folio de cotización y sin etapa de obra.
     `deNotion` la descarta —no hay proyecto que espejar— y hasta septiembre de 2026 ahí se
     acababa: el récord de vendidas de Control no la veía. */
  const historica = { id_notion: 'V-001', editado: null, 'Proyecto': 'Farmacia - Letras', 'Cuenta ': 'Elias BBVA',
    'Estatus': 'LIQUIDADO', 'Tipo de trabajo': ['Letras 3D con iluminacion'], 'IVA': true,
    'Precio Subtotal': 25000, 'Precio Neto ': 29000, 'Anticipo': 15000, 'Liquidacion': 14000, 'Pago Pendiente': 0,
    'Comisiones': 2500, 'Abono Comision': 2500, 'Comision Restante': 0, 'Porcentaje comision': null,
    'Fecha Anticipo e Instalacion': '2024-03-12', 'Fecha instalacion': '2024-03-28', 'Fecha Liquidacion': '2024-03-30',
    'Folio cotizacion': '', 'Etapa de obra': null, 'Hora instalacion': '', 'Ubicacion': '', 'Direccion': '' };
  eq('deNotion no tiene qué espejar', deNotion(historica), null);
  const v = ventaDeHoja(historica);
  eq('ventaDeHoja sí: el id es el folio interno de la hoja', v.id, 'hoja:V-001');
  eq('sin folio de cotización no ata a ningún proyecto, pero entra al récord', v.folio_cotizacion, '');
  eq('el nombre, la cuenta, el estatus y el tipo', [v.nombre, v.cuenta, v.estatus, v.tipo_trabajo],
     ['Farmacia - Letras', 'Elias BBVA', 'LIQUIDADO', ['Letras 3D con iluminacion']]);
  eq('el dinero, con las fórmulas tal como bajan',
     [v.sub, v.neto, v.anticipo, v.liquidacion, v.pago_pendiente, v.comisiones, v.abono_comision, v.comision_restante],
     [25000, 29000, 15000, 14000, 0, 2500, 2500, 0]);
  /* Vacía en la hoja, llega null —«alguien lo borró»—, que no es un cero ni un «no vino». */
  eq('el % vacío no se vuelve cero', v.pct_comision, null);
  eq('las tres fechas', [v.fecha_anticipo, v.fecha_instalacion, v.fecha_liquidacion], ['2024-03-12', '2024-03-28', '2024-03-30']);
  eq('sin etapa de obra queda null, no «ganado»', v.etapa, null);
  eq('el IVA', v.iva, true);

  const nueva = { ...historica, id_notion: 'V-201', 'Folio cotizacion': 'COT-0042@K7QM', 'Etapa de obra': 'Cortado',
                  'Estatus': 'INVENTADO', 'Cuenta ': 'Otra', 'Porcentaje comision': 12 };
  const n = ventaDeHoja(nueva);
  eq('con folio de cotización lo trae: es con lo que se enlaza al proyecto', n.folio_cotizacion, 'COT-0042@K7QM');
  eq('la etapa legible vuelve a su clave', n.etapa, 'cortado');
  eq('un estatus o una cuenta que no existen no bajan', [n.estatus, n.cuenta], [null, null]);
  eq('el % sí, cuando viene', n.pct_comision, 12);

  /* A fabricación la hoja le manda la fila sin las columnas de dinero: nada se vuelve cero. */
  const s = ventaDeHoja({ id_notion: 'V-7', 'Proyecto': 'X', 'Estatus': 'COBRANDO', 'Folio cotizacion': '' });
  eq('sin dinero no se inventan ceros', [s.neto, s.anticipo, s.pago_pendiente, s.sub], [undefined, undefined, undefined, undefined]);
  eq('sin nombre y sin folio no es una venta', ventaDeHoja({ id_notion: 'V-8', 'Proyecto': '' }), null);
  eq('null no revienta', ventaDeHoja(null), null);
  eq('el relevo declara qué almacén baja entero, para que sync borre lo que la hoja ya no trae', ESPEJOS, ['ventas_hoja']);
}

console.log('\nCOHERENCIA CON EL PUENTE — la duplicación que sí se compara');
{
  const aqui = dirname(fileURLToPath(import.meta.url));
  /* El puente ya no es un Worker de Cloudflare: es un Apps Script que vive dentro de la
     hoja. El archivo se versiona aquí para que esta prueba pueda compararlo, igual que
     antes comparaba el Worker. No se importa: es código de Apps Script, no un módulo. */
  const w = readFileSync(join(aqui, '..', 'puente', 'hoja-apps-script.gs'), 'utf8');

  const arreglo = nombre => {
    const m = new RegExp('(?:const|var) ' + nombre + '\\s*=\\s*(\\[[^\\]]*\\])').exec(w);
    if (!m) return null;
    return Function('"use strict";return ' + m[1])();
  };

  const etapasW = arreglo('ETAPAS_OBRA');
  cierto('el puente declara ETAPAS_OBRA', etapasW);
  eq('las ocho etapas del puente son las ocho del cliente, en el mismo orden',
     etapasW, Object.values(ETAPA_A_NOTION));

  /* EN EL MISMO ORDEN, no solo los mismos: el orden de la hoja es el del desplegable de la
     columna y el del reporte «POR ESTATUS», y la plataforma pinta sus chips con esta lista.
     Se comparaban ordenadas y así las cinco copias del sistema llegaron a tener cuatro
     órdenes distintos sin que nadie lo notara. */
  const estatusW = arreglo('ESTATUS');
  eq('los cuatro estatus coinciden, en el orden de la hoja', estatusW, ESTATUS);

  const cuentasW = arreglo('CUENTAS');
  eq('las cinco cuentas coinciden, en el orden de la hoja', cuentasW, CUENTAS);

  /* Los siete tipos de trabajo, VALOR POR VALOR: antes solo se contaba que fueran siete.
     El Apps Script los tiene dos veces (TIPOS para el desplegable, TIPOS_TRABAJO para
     validar lo que entra) y la plataforma una; las tres tienen que ser la misma lista. */
  const tiposW = arreglo('TIPOS_TRABAJO');
  const tiposDesplegable = arreglo('TIPOS');
  eq('los siete tipos del puente son los siete de la plataforma', tiposW, TIPOS_TRABAJO);
  eq('y el desplegable de la hoja usa los mismos siete', tiposDesplegable, TIPOS_TRABAJO);

  /* Las etapas: el nombre legible que enseña la plataforma es el que viaja a la hoja. */
  eq('ETAPA_NOMBRE y ETAPA_A_NOTION dicen lo mismo, etapa por etapa', ETAPA_NOMBRE, ETAPA_A_NOTION);

  /* Los nombres de propiedad, uno por uno, con el espacio final incluido. Es la clase de
     errata que no se ve leyendo: `Precio Neto ` sin su espacio apunta a otra columna. Se
     busca dentro del mapa COL y no en cualquier parte del archivo: «Fecha Comision» pasaba
     esta prueba apareciendo en la lista de lo que YA NO EXISTE. */
  const colW = /var COL = \{([\s\S]*?)\};/.exec(w);
  cierto('el puente declara COL', colW);
  for (const nombre of Object.values(P)) {
    cierto('la hoja tiene columna para «' + nombre + '»', colW && colW[1].includes("'" + nombre + "'"));
  }

  /* La versión: la que el .gs declara es la que la plataforma espera. Si alguien sube una
     sin la otra, «Probar» le diría al usuario que su hoja está vieja cuando no lo está, o
     al revés. */
  const versionW = /var PUENTE_VERSION = '([^']+)'/.exec(w);
  eq('el .gs del repo declara la versión que la plataforma espera', versionW && versionW[1], VERSION_ESPERADA);
  eq('una hoja con la versión anterior se detecta', versionVieja('puente-sheets-3'), true);
  eq('sin versión también', versionVieja(''), true);
  eq('la esperada no', versionVieja(VERSION_ESPERADA), false);
  cierto('y el aviso dice qué hacer', /Apps Script/.test(avisoVersion('puente-sheets-3')));
  eq('sin aviso cuando está al día', avisoVersion(VERSION_ESPERADA), '');
}

console.log('\nEL AVISO DE VERSIÓN DICE LO QUE FALLA CON ESA VERSIÓN (defecto 8)');
{
  /* El de antes le decía a una hoja en puente-sheets-4 que el saldo bajaba al revés —la 4 lo
     arregló— y callaba lo único que de verdad le faltaba: entrar con Google no da rol. */
  eq('la plataforma espera la 6', VERSION_ESPERADA, 'puente-sheets-6');
  eq('una hoja en la 5 es vieja', versionVieja('puente-sheets-5'), true);
  const a5 = avisoVersion('puente-sheets-5'), a4 = avisoVersion('puente-sheets-4'), a3 = avisoVersion('puente-sheets-3');
  cierto('a la 5 le dice lo de Y a AD', /Y a AD/.test(a5));
  cierto('y no le dice lo que la 4 y la 3 ya arreglaron', !/Google/.test(a5) && !/al revés/.test(a5));
  cierto('a la 4 le dice que entrar con Google no da rol', /entrar con Google no da rol/.test(a4));
  cierto('y no que el saldo baja al revés, que la 4 ya arregló', !/al revés/.test(a4));
  cierto('a la 3, lo del saldo, y lo de las que vienen después', /al revés/.test(a3) && /Google/.test(a3) && /Y a AD/.test(a3));
  /* Y ya no manda a pegar el .gs del repo encima sin mirar: el README dice que la copia
     que manda es la de la hoja, y que se compara antes. */
  cierto('los tres mandan a comparar antes de pegar', [a3, a4, a5].every(x => /compáralo/.test(x) && /Antes de pegar nada/.test(x)));
}

console.log('\nEL FOLIO DE COTIZACIÓN SOLO VIAJA SI LO HAY (defecto 4)');
{
  /* Un proyecto importado de la hoja: sin cotización detrás, con el folio de la hoja de
     folio_local. Mandaba «V-100» como folio de cotización y pisaba la llave de la fila. */
  const importado = proy({ id: 'proy-hoja-V-100', folio_local: 'V-100', folio_global: '', notion_page_id: 'V-100', de_hoja: true });
  const n = aNotion(importado, null, { alta: false, campos: ['etapa'] });
  eq('un proyecto importado no manda folio de cotización', Object.prototype.hasOwnProperty.call(n, P.folio), false);
  eq('pero sí su etapa', n[P.etapa], 'Ganado');
  eq('uno nacido en el cotizador sí lo manda', aNotion(proy(), null, { alta: false, campos: [] })[P.folio], 'COT-0042@K7QM');
}

console.log('\nLO QUE SE BORRA EN LA HOJA TAMBIÉN BAJA (defecto 11)');
{
  const { fusionar } = await import('../js/datos/sync.js');
  const fila = o => ({ id_notion: 'V-042', 'Proyecto': 'Ana - Cafe', 'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC', 'IVA': true,
    'Precio Subtotal': 10000, 'Precio Neto ': 11600, 'Anticipo': 5000, 'Liquidacion': 3000, 'Pago Pendiente': 3600,
    'Porcentaje comision': 15, 'Folio cotizacion': 'COT-0042@AAAA', 'Fecha Anticipo e Instalacion': '2026-09-01', ...o });
  const antes = { ...ventaDeHoja(fila({})), actualizado_en: 1000 };
  const despues = { ...ventaDeHoja(fila({ 'Liquidacion': null, 'Porcentaje comision': null, 'Pago Pendiente': 6600 })), actualizado_en: 2000 };
  eq('una celda vaciada llega como null, no como «no vino»', [despues.liquidacion, despues.pct_comision], [null, null]);
  const f = fusionar(antes, despues);
  eq('y el récord la borra: ya no enseña la liquidación ni el % viejos', [f.liquidacion, f.pct_comision, f.pago_pendiente], [null, null, 6600]);
  /* Lo que NO vino —fabricación no recibe el dinero— sigue sin tocarse. */
  const sinLlave = fila({}); delete sinLlave['Liquidacion'];
  eq('una llave que no vino sigue siendo «no vino»', ventaDeHoja(sinLlave).liquidacion, undefined);

  const p = deNotion(fila({ 'Porcentaje comision': null, 'Anticipo': null, 'Pago Pendiente': null }));
  eq('sobre el proyecto, el % borrado vuelve a «el de siempre» (0)', p.pct_comision, 0);
  eq('el anticipo borrado es cero', p.anti_pactado, 0);
  eq('y una fórmula vacía es null —«la hoja no lo sabe»—, nunca un cero', [Object.prototype.hasOwnProperty.call(p, 'pago_pendiente'), p.pago_pendiente], [true, null]);
  const fab = deNotion({ 'Folio cotizacion': 'COT-0007', id_notion: 'V-1', 'Estatus': 'COBRANDO' });
  eq('a fabricación, sin las llaves del dinero, no se le toca nada', ['pct_comision', 'anti_pactado', 'pago_pendiente'].filter(k => k in fab), []);
}

console.log('\nEL RELEVO CONTRA UN PUENTE DE MENTIRAS (defectos 3, 5, 8 y 9)');
{
  /* `fetch` de mentiras que contesta como el Apps Script. En node no hay IndexedDB y el
     relevo lo sabe: la foto de la operación hace de proyecto vivo. */
  const pedidas = [];
  let empujar = () => ({ ok: true, resultados: [] });
  let esquema = { ok: true, faltan: [] };
  const escribibles = { fabricacion: ['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion'],
                        pagos: ['Anticipo', 'Liquidacion', 'Abono Comision', 'Estatus', 'Cuenta ', 'Fecha Liquidacion', 'Porcentaje comision'] };
  globalThis.fetch = async (url, init) => {
    const c = JSON.parse(init.body);
    pedidas.push(c);
    const rol = c.token === 'f'.repeat(40) ? 'fabricacion' : 'pagos';
    const cuerpo = c.ruta === 'salud' ? { ok: true, rol, escribibles: escribibles[rol], version: VERSION_ESPERADA }
      : c.ruta === 'esquema' ? esquema
      : c.ruta === 'empujar' ? empujar(c) : { ok: false, codigo: 'NO_ENCONTRADO' };
    return { status: 200, json: async () => cuerpo };
  };
  const { crear } = await import('../js/datos/puente.js');
  const fab = crear({ url: 'https://puente.test/exec', token: 'f'.repeat(40) });
  const pag = crear({ url: 'https://puente.test/exec', token: 'p'.repeat(40) });
  const op = (id, datos, campos) => ({ id, almacen: 'proyectos', tipo: 'actualizar', datos, campos: campos || ['etapa'] });

  /* 5 · Lo que reintentar no arregla se marca, para que el bombeo lo aparte y siga. */
  const [alta] = await fab.subir([{ ...op('op-alta', proy({ notion_page_id: null })), tipo: 'crear' }]);
  eq('un alta desde un rol que no escribe el nombre: ROL_SIN_PERMISO…', alta.codigo, 'ROL_SIN_PERMISO');
  eq('…marcado definitivo: el bombeo la aparta y sigue', alta.definitivo, true);
  const [nada] = await pag.subir([op('op-nada', proy({ notion_page_id: 'V-201', estatus_notion: null, cuenta: null }))]);
  eq('un cambio del que el rol no escribe nada, también definitivo', [nada.codigo, nada.definitivo], ['ROL_SIN_PERMISO', true]);

  empujar = c => ({ ok: true, resultados: [{ id: c.ops[0].id, ok: false, codigo: 'NO_ENCONTRADO',
                                             mensaje: 'La venta V-003 ya no está en la hoja: alguien borró su fila.' }] });
  const [borrada] = await fab.subir([op('op-borrada', proy({ notion_page_id: 'V-003' }))]);
  eq('una venta que la hoja ya no tiene (3): NO_ENCONTRADO definitivo, con la razón de la hoja',
     [borrada.codigo, borrada.definitivo, /ya no está en la hoja/.test(borrada.mensaje)], ['NO_ENCONTRADO', true, true]);
  const enviada = pedidas.filter(x => x.ruta === 'empujar').pop().ops[0];
  eq('el folio de cotización viaja aparte, como identidad, aunque fabricación no pueda escribirlo',
     [enviada.folio_cotizacion, Object.prototype.hasOwnProperty.call(enviada.datos, P.folio)], ['COT-0042@K7QM', false]);

  empujar = c => ({ ok: true, resultados: [{ id: c.ops[0].id, ok: false, codigo: 'DESCONOCIDO', mensaje: 'Ya no hay filas libres' }] });
  const [llena] = await fab.subir([op('op-llena', proy({ notion_page_id: 'V-003' }))]);
  eq('una hoja llena no es culpa de la operación: no se marca', !!llena.definitivo, false);
  empujar = () => ({ ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Token desconocido' });
  const [puerta] = await fab.subir([op('op-puerta', proy({ notion_page_id: 'V-003' }))]);
  eq('la llave que la hoja no reconoce tampoco: ésa sí para el bombeo', [puerta.codigo, !!puerta.definitivo], ['ROL_SIN_PERMISO', false]);

  /* 8 · «Revisar el esquema» dice cuando falta la pestaña «Accesos». */
  esquema = { ok: true, faltan: [], accesos: false };
  const e1 = await fab.esquema();
  eq('sin «Accesos», el esquema lo dice', e1.accesos, false);
  cierto('y la pantalla de hoy lo enseña en la lista de lo que falta', e1.faltan.some(x => x.nombre === 'Accesos' && /prepararHojaParaElPuente/.test(x.para)));
  esquema = { ok: true, faltan: [] };
  const e2 = await fab.esquema();
  eq('una hoja que no dice nada de «Accesos» no se da por incompleta', [e2.accesos, e2.faltan.length], [true, 0]);

  /* 9 · El token de Google caducado se renueva en la petición, no solo al arrancar. Se ve
     por el guion de Google que `Ingreso.renovar()` intenta cargar. */
  const guiones = [];
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: s => { guiones.push(s.src); setTimeout(() => s.onerror && s.onerror(), 0); } },
  };
  await fab.salud();
  eq('sin haber entrado nunca con Google, no se intenta renovar', guiones.length, 0);
  const guardado = { al3d_pf_ingreso: JSON.stringify({ correo: 'ana@al3d.mx' }) };
  globalThis.localStorage = { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); }, removeItem: k => { delete guardado[k]; } };
  const antes = pedidas.length;
  const s1 = await fab.salud();
  eq('con un ingreso hecho y el token caducado, la petición lo renueva primero', guiones.filter(u => /accounts\.google\.com\/gsi/.test(u)).length, 1);
  eq('y si Google no contesta, la petición sale igual con lo que haya', [s1.ok, pedidas.length], [true, antes + 1]);
  await fab.salud();
  eq('un intento por minuto: la siguiente no vuelve a abrir ventana', guiones.length, 1);
}


console.log('\nDETALLES QUE ROMPEN EN LA CALLE');
{
  eq('la URL pierde la barra final o se pediría //salud',
     normalizarUrl('https://puente-al3d.x.workers.dev/'), 'https://puente-al3d.x.workers.dev');
  eq('y los espacios de un pegado con dedo gordo',
     normalizarUrl('  https://x.workers.dev//  '), 'https://x.workers.dev');
  eq('la URL del runbook, pegada con su /esquema, queda en la raíz del Worker',
     normalizarUrl('https://puente-al3d.x.workers.dev/esquema'), 'https://puente-al3d.x.workers.dev');
  eq('y una cadena de consulta o una almohadilla pegadas del navegador se van',
     normalizarUrl('https://x.workers.dev/?utm=1#salud'), 'https://x.workers.dev');

  const ins = instrucciones();
  cierto('los pasos llevan a la hoja y no a Cloudflare',
    ins.pasos.some(p => /Apps Script/i.test(p)) &&
    ins.pasos.some(p => /Tokens del puente/i.test(p)) &&
    !ins.pasos.some(p => /Cloudflare|workers\.dev|NOTION_TOKEN/i.test(p)));
  cierto('y avisan del ajuste que rompe todo si queda mal',
    ins.pasos.some(p => /Cualquier usuario/.test(p)));
  /* La puerta normal es Google desde puente-sheets-5; los pasos decían que era el token. */
  cierto('los pasos dicen que se entra con Google y que el rol sale de «Accesos»',
    ins.pasos.some(p => /Entrar con Google/.test(p)) && ins.pasos.some(p => /«Accesos»/.test(p)));
  cierto('y el token de dispositivo es la salida de emergencia, no la entrada',
    ins.pasos.some(p => /Tokens del puente/.test(p) && /emergencia/i.test(p)));
  cierto('las notas explican dónde está la puerta: Google, y el token de reserva',
    ins.notas.some(n => /token/i.test(n) && /p(ú|u)blica|puerta/i.test(n) && /Google/.test(n)));

  eq('el relevo de hoy lleva la venta y su instalación, y nada más',
     ALMACENES, ['proyectos', 'instalaciones']);
}

console.log('\nLA FILA QUE YA NO ESTÁ: cuál NO_ENCONTRADO es cuál');
{
  /* Las frases son las de `unaOperacion` en puente/hoja-apps-script.gs. Cuatro rechazos con el
     mismo código, y solo dos quieren decir «esta venta no tiene fila». */
  const borrada = { codigo: 'NO_ENCONTRADO', mensaje: 'La venta V-404 ya no está en la hoja: alguien borró su fila. Este cambio no se escribió en ninguna otra. Si la venta sigue viva, vuelve a registrarla desde el cotizador.' };
  const otra = { codigo: 'NO_ENCONTRADO', mensaje: 'La fila V-407 de la hoja ya es de otra venta (atada a COT-9999@OTRO, y este cambio es de COT-0407@TEST). Este cambio no se escribió en ninguna otra. Si la venta sigue viva, vuelve a registrarla desde el cotizador.' };
  eq('la fila borrada', motivoPerdida(borrada), 'borrada');
  eq('la fila que ya es de otra venta NO es «borrada»', motivoPerdida(otra), 'de_otra');
  eq('el campo de máquina manda, si la hoja lo trae', motivoPerdida({ codigo: 'NO_ENCONTRADO', motivo: 'de_otra', mensaje: 'x' }), 'de_otra');
  eq('el alta sin nombre no es una fila perdida (dice «todavía no está»)',
     motivoPerdida({ codigo: 'NO_ENCONTRADO', mensaje: 'Esta venta todavía no está en la hoja y este cambio no trae el nombre del proyecto.' }), '');
  eq('ni el camino desconocido, ni otro código', [motivoPerdida({ codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' }),
     motivoPerdida({ codigo: 'DESCONOCIDO', mensaje: 'ya no está en la hoja' })], ['', '']);
  const m = mensajePerdida(otra.mensaje);
  cierto('el consejo que no lleva a ningún lado se cambia por la ficha, y se queda qué pasó',
    !/registrarla desde el cotizador/.test(m) && /ficha del proyecto/.test(m) && /atada a COT-9999@OTRO/.test(m));
  /* La hoja de puente-sheets-6 con el arreglo: manda `motivo` y el consejo nuevo. */
  const nueva = { codigo: 'NO_ENCONTRADO', motivo: 'borrada', mensaje: 'La venta V-404 ya no está en la hoja: alguien borró su fila. Este cambio no se escribió en ninguna otra. Si la venta sigue viva, Dirección la vuelve a dar de alta desde la ficha del proyecto en la plataforma.' };
  const mn = mensajePerdida(nueva.mensaje);
  eq('la hoja nueva: el motivo manda, y el consejo sale una sola vez',
     [motivoPerdida(nueva), (mn.match(/Dirección/g) || []).length, /alguien borró su fila/.test(mn)], ['borrada', 1, true]);
  /* El consejo depende de qué rebotó: Ajustes lo enseña a cualquier rol, y «Dirección decide si
     se vuelve a dar de alta» es falso para una tarjeta importada (no se da de alta, la decide
     quien tenga el teléfono) y para una lápida (su salida es dejarla fuera). */
  const mi = mensajePerdida(borrada.mensaje, { id: 'proy-hoja-V-610', de_hoja: true, etapa: 'armado' });
  cierto('a una tarjeta importada le dice lo que sí puede hacer quien tiene el teléfono: ' + mi,
    /quien tenga este teléfono/.test(mi) && /quita del tablero/.test(mi) && !/dar de alta/.test(mi) && /alguien borró su fila/.test(mi));
  const ml = mensajePerdida(borrada.mensaje, { id: 'proy-A', etapa: 'cancelado' });
  cierto('a una lápida, que Dirección la deja fuera de la hoja: ' + ml, /No se dio/.test(ml) && /Dirección la deja fuera de la hoja/.test(ml) && !/dar de alta/.test(ml));
  eq('y a la venta de aquí, el de siempre', mensajePerdida(borrada.mensaje, { id: 'proy-A', etapa: 'armado' }), mensajePerdida(borrada.mensaje));
}

/* ---------------------------------------------------------------------------
   LA VENTA QUE LA HOJA YA NO TIENE — el camino entero, contra una base de mentira.

   Lo que aquí se prueba vive ENTRE módulos: el relevo aparta el rechazo y marca el proyecto,
   `sync.jalar` cierra el barrido y le pide al relevo la revisión, y `proyectos` junta o marca.
   Probarlo por piezas dejaba justo el hueco que costó el caso. Node no trae IndexedDB y la de
   pruebas/respaldo.mjs no sabe de índices ni de cursores, que es lo que `DB.listar` usa; esta
   sí, con el orden de llaves de IndexedDB (números antes que textos) porque la bandeja se
   manda en el orden del índice `porTs`.
   --------------------------------------------------------------------------- */
function idbConIndices() {
  const almacenes = new Map();   // nombre → { keyPath, indices: Map(nombre → campo), datos: Map }
  const llave = (v, c) => (Array.isArray(c) ? c.map(k => v[k]) : v[c]);
  const valida = k => (Array.isArray(k) ? k.every(valida) : (typeof k === 'string' || (typeof k === 'number' && !Number.isNaN(k))));
  const cmp = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  class Tx extends EventTarget {
    constructor() { super(); this.error = null; this._pend = 0; this._fin = false; setTimeout(() => this._revisar(), 0); }
    _revisar() {
      if (this._pend || this._fin) return;
      this._fin = true;
      const ev = new Event('complete'); this.dispatchEvent(ev); if (this.oncomplete) this.oncomplete(ev);
    }
    _paso(p, hacer) {
      this._pend++;
      setTimeout(() => {
        p.result = hacer();
        if (p.onsuccess) p.onsuccess({ target: p });
        this._pend--; setTimeout(() => this._revisar(), 0);
      }, 0);
      return p;
    }
    objectStore(n) { return vista(this, almacenes.get(n), null); }
  }
  function vista(tx, a, indice) {
    const campo = indice ? a.indices.get(indice) : a.keyPath;
    const filas = (rango, dir) => {
      let xs = [...a.datos.values()].filter(v => valida(llave(v, campo)));
      if (rango && 'only' in rango) xs = xs.filter(v => cmp(llave(v, campo), rango.only) === 0);
      xs.sort((x, y) => cmp(llave(x, campo), llave(y, campo)) || cmp(llave(x, a.keyPath), llave(y, a.keyPath)));
      return dir === 'prev' ? xs.reverse() : xs;
    };
    return {
      get: k => tx._paso({}, () => (a.datos.has(k) ? structuredClone(a.datos.get(k)) : undefined)),
      put: v => tx._paso({}, () => { a.datos.set(llave(v, a.keyPath), structuredClone(v)); return llave(v, a.keyPath); }),
      delete: k => tx._paso({}, () => { a.datos.delete(k); }),
      clear: () => tx._paso({}, () => { a.datos.clear(); }),
      count: r => tx._paso({}, () => filas(r).length),
      index: i => vista(tx, a, i),
      openCursor(rango, dir) {
        const xs = filas(rango, dir);
        let i = 0;
        const p = {};
        const siguiente = () => tx._paso(p, () => (i < xs.length
          ? { value: structuredClone(xs[i]), continue: () => { i++; siguiente(); } } : null));
        siguiente();
        return p;
      },
    };
  }
  const db = {
    objectStoreNames: { contains: n => almacenes.has(n) },
    createObjectStore(n, { keyPath }) {
      const a = { keyPath, indices: new Map(), datos: new Map() };
      almacenes.set(n, a);
      return { indexNames: { contains: i => a.indices.has(i) }, createIndex: (i, c) => a.indices.set(i, c) };
    },
    transaction: () => new Tx(),
    close() {},
  };
  return {
    open() {
      const p = {};
      setTimeout(() => { p.result = db; if (p.onupgradeneeded) p.onupgradeneeded({ oldVersion: 0 }); p.onsuccess(); }, 0);
      return p;
    },
  };
}

console.log('\nLA VENTA QUE LA HOJA YA NO TIENE: el camino entero, con base');
{
  globalThis.window = globalThis;
  globalThis.indexedDB = idbConIndices();
  globalThis.IDBKeyRange = { only: v => ({ only: v }) };
  const guardado = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'TEST',
                     al3d_pf_puente: JSON.stringify({ url: 'https://puente.test/exec', token: 'd'.repeat(40) }) };
  globalThis.localStorage = { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); },
                              removeItem: k => { delete guardado[k]; } };

  /* La hoja de mentiras: las filas que manda /jalar, y qué contesta /empujar a cada cambio. */
  const H = { filas: [], empujadas: [], borradas: new Set(), deOtra: new Set(), siguiente: 500, jalar: null };
  const ESC_DIR = ['Proyecto', 'Precio Subtotal', 'IVA', 'Anticipo', 'Liquidacion', 'Abono Comision', 'Estatus', 'Cuenta ',
    'Fecha Anticipo e Instalacion', 'Fecha Liquidacion', 'Folio cotizacion', 'Etapa de obra', 'Fecha instalacion',
    'Hora instalacion', 'Ubicacion', 'Direccion', 'Tipo de trabajo', 'Porcentaje comision'];
  const responder = op => {
    if (op.id_notion && H.borradas.has(op.id_notion)) return { id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
      mensaje: 'La venta ' + op.id_notion + ' ya no está en la hoja: alguien borró su fila. Este cambio no se escribió en ninguna otra. Si la venta sigue viva, vuelve a registrarla desde el cotizador.' };
    if (op.id_notion && H.deOtra.has(op.id_notion)) return { id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
      mensaje: 'La fila ' + op.id_notion + ' de la hoja ya es de otra venta (atada a COT-9999@OTRO, y este cambio es de ' + op.folio_cotizacion + '). Este cambio no se escribió en ninguna otra. Si la venta sigue viva, vuelve a registrarla desde el cotizador.' };
    if (!op.id_notion) return { id: op.id, ok: true, remoto: { id_notion: 'V-' + (H.siguiente++) }, rechazadas: [] };
    return { id: op.id, ok: true, remoto: { id_notion: op.id_notion }, rechazadas: [] };
  };
  globalThis.fetch = async (url, init) => {
    const c = JSON.parse(init.body);
    let cuerpo;
    if (c.ruta === 'salud') cuerpo = { ok: true, rol: 'direccion', escribibles: ESC_DIR, version: VERSION_ESPERADA };
    else if (c.ruta === 'jalar') cuerpo = H.jalar ? H.jalar(c) : { ok: true, cursor: null, hay_mas: false,
      registros: H.filas.map(d => ({ almacen: 'proyectos', datos: d })) };
    else if (c.ruta === 'empujar') { H.empujadas.push(c.ops[0]); cuerpo = { ok: true, resultados: [responder(c.ops[0])] }; }
    else cuerpo = { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' };
    return { status: 200, json: async () => cuerpo };
  };
  const fila = (id, nombre, o = {}) => ({ id_notion: id, editado: null, 'Proyecto': nombre, 'Cuenta ': 'Elias BBVA',
    'Estatus': 'FABRICACION', 'Tipo de trabajo': ['Letras 3D con iluminacion'], 'IVA': true, 'Precio Subtotal': 10000,
    'Precio Neto ': 11600, 'Anticipo': 5000, 'Liquidacion': null, 'Pago Pendiente': 6600, 'Comisiones': 1000,
    'Abono Comision': 0, 'Comision Restante': 1000, 'Porcentaje comision': null, 'Fecha Anticipo e Instalacion': '2026-09-01',
    'Fecha instalacion': null, 'Fecha Liquidacion': null, 'Folio cotizacion': '', 'Etapa de obra': null,
    'Hora instalacion': '', 'Ubicacion': '', 'Direccion': 'Av. Siempre Viva 1', ...o });

  const DB = await import('../js/datos/db.js');
  const S = await import('../js/datos/sync.js');
  const Proy = await import('../js/datos/proyectos.js');
  const Agenda = await import('../js/datos/agenda.js');
  const { crear } = await import('../js/datos/puente.js');
  eq('la base de mentira abre', await DB.abrir(), true);
  S.registrar(crear({ url: 'https://puente.test/exec', token: 'd'.repeat(40) }));
  eq('y la bandeja está enchufada a la hoja', S.configurado(), true);

  const propio = (id, fg, np, o = {}) => ({ id, folio_local: fg.split('@')[0], dispositivo: 'TEST', folio_global: fg,
    nombre: 'Venta ' + fg, contacto: 'Ana', negocio: 'Café', etapa: 'ganado', tipo_trabajo: ['Letras 3D con iluminacion'],
    fecha_ganado: '2026-09-01', dir_texto: 'Av. Siempre Viva 1', lat: null, lng: null, sub: 10000, neto: 11600,
    precio_auth: 11600, anti_pactado: 5000, iva: true, notion_page_id: np, notion_estado: 'enviado',
    estatus_notion: 'FABRICACION', cuenta: 'Elias BBVA', pago_pendiente: null, comision_restante: null,
    pct_comision: 0, plazo_k: null, notas: '', origen: { folio: fg.split('@')[0], items: [] }, ...o });
  const cambio = async (id, campos) => {
    const p = await DB.obtener('proyectos', id);
    await S.encolar({ tipo: 'actualizar', almacen: 'proyectos', registro_id: id, datos: p, campos, ts: Date.now() });
  };
  const deProyecto = async id => (await S.rechazadas()).filter(o => o.registro_id === id);
  const jalarTodo = async () => { let r, n = 0; do { r = await S.jalar(); n++; } while (r.ok && r.valor.hay_mas && n < 5); return r; };

  /* ── 1 · La venta de este teléfono cuya fila se borró ── */
  await DB.poner('proyectos', propio('proy-A', 'COT-0404@TEST', 'V-404'));
  H.borradas.add('V-404');
  await cambio('proy-A', ['etapa']);
  const b1 = await S.bombear();
  let a = await DB.obtener('proyectos', 'proy-A');
  eq('el rebote se aparta como rechazado, como siempre', [b1.valor.rechazadas, (await deProyecto('proy-A')).length], [1, 1]);
  eq('con su porqué para la máquina guardado al lado del código', (await deProyecto('proy-A'))[0].motivo_rechazo, 'borrada');
  eq('y el proyecto queda MARCADO: por qué, qué fila', [a.hoja_perdida && a.hoja_perdida.motivo, a.hoja_perdida && a.hoja_perdida.folio],
     ['borrada', 'V-404']);
  eq('con el folio de la fila muerta intacto: borrarlo resucitaría una venta quitada a propósito', a.notion_page_id, 'V-404');
  cierto('lo apartado ya no dice «vuelve a registrarla desde el cotizador», que lleva a DUPLICADO, sino la ficha',
    (await deProyecto('proy-A')).every(o => !/desde el cotizador/.test(o.ultimo_error) && /ficha del proyecto/.test(o.ultimo_error)));
  const desdeA = a.hoja_perdida.desde;
  await cambio('proy-A', ['notas']);
  await S.bombear();
  a = await DB.obtener('proyectos', 'proy-A');
  eq('un segundo rebote no reinicia la fecha del aviso', [a.hoja_perdida.desde, (await deProyecto('proy-A')).length], [desdeA, 2]);

  guardado.al3d_pf_rol = 'fabricacion';
  eq('volver a darla de alta es de Dirección', (await Proy.volverADarDeAlta('proy-A')).codigo, 'ROL_SIN_PERMISO');
  guardado.al3d_pf_rol = 'direccion';
  const re = await Proy.volverADarDeAlta('proy-A');
  a = await DB.obtener('proyectos', 'proy-A');
  const colaA = (await S.pendientes()).filter(o => o.registro_id === 'proy-A');
  eq('«Volver a darla de alta»: se olvida la fila muerta y se quita la marca', [re.ok, a.notion_page_id, a.hoja_perdida], [true, null, null]);
  eq('lo apartado de ese proyecto se tira, y queda UN alta en la bandeja', [(await deProyecto('proy-A')).length, colaA.map(o => o.tipo)], [0, ['crear']]);
  const antesAlta = H.empujadas.length;
  await S.bombear();
  const alta = H.empujadas.slice(antesAlta).find(o => o.folio_cotizacion === 'COT-0404@TEST') || {};
  eq('sale como alta, sin id de fila y con TODOS los datos (nombre, subtotal, anticipo)',
     [alta.tipo, alta.id_notion, !!(alta.datos && alta.datos['Proyecto']), alta.datos && alta.datos['Precio Subtotal'], alta.datos && alta.datos['Anticipo']],
     ['crear', null, true, 10000, 5000]);
  eq('y el proyecto queda atado a su fila nueva', (await DB.obtener('proyectos', 'proy-A')).notion_page_id, 'V-500');

  /* ── 1b · «Dejarla fuera de la hoja», y la fila que ya es de otra venta ── */
  await DB.poner('proyectos', propio('proy-B', 'COT-0406@TEST', 'V-406'));
  H.borradas.add('V-406');
  await cambio('proy-B', ['etapa']);
  await S.bombear();
  const fuera = await Proy.dejarFueraDeLaHoja('proy-B');
  let b = await DB.obtener('proyectos', 'proy-B');
  eq('«Dejarla fuera»: se queda aquí, sin marca, con su fila vieja y sin lo apartado',
     [fuera.ok, !!b.fuera_de_hoja, b.hoja_perdida, b.notion_page_id, (await deProyecto('proy-B')).length], [true, true, null, 'V-406', 0]);
  const antesFuera = H.empujadas.length;
  /* Mientras está fuera, alguien mueve la obra. */
  await DB.poner('proyectos', { ...b, etapa: 'cortado' });
  await cambio('proy-B', ['etapa']);
  const bf = await S.bombear();
  b = await DB.obtener('proyectos', 'proy-B');
  eq('y sus cambios ya no se mandan ni rebotan: el aviso no vuelve',
     [H.empujadas.length - antesFuera, (await deProyecto('proy-B')).length, b.hoja_perdida, (await S.pendientes()).filter(o => o.registro_id === 'proy-B').length],
     [0, 0, null, 0]);
  /* Pero no se tira ni se cuenta como mandado: antes el bombeo decía «Se mandó 1 operación» y el
     cambio se perdía para siempre. */
  eq('el bombeo no lo cuenta como mandado, y el proyecto anota qué quedó sin mandar',
     [bf.valor.subidas, bf.valor.omitidas, b.sin_mandar && b.sin_mandar.campos], [0, 1, ['etapa']]);
  /* Alguien restaura la fila, con su folio y su folio de cotización. La decisión de dejarla
     fuera era para una fila que ya no existía: la bajada la quita, y el siguiente cambio SÍ
     llega a la hoja. Si se quedaba, el bombeo lo contaba como subido sin mandarlo. */
  H.borradas.delete('V-406');
  H.filas = [fila('V-406', 'Venta COT-0406@TEST', { 'Folio cotizacion': 'COT-0406@TEST', 'Pago Pendiente': 777 })];
  const rv = await jalarTodo();
  b = await DB.obtener('proyectos', 'proy-B');
  eq('la fila vuelve: baja su dinero y se quita «fuera de la hoja»', [b.notion_page_id, b.pago_pendiente, b.fuera_de_hoja || null],
     ['V-406', 777, null]);
  /* Y lo que se cambió mientras estuvo fuera sale solo, con la etapa de hoy: la confirmación de
     «Dejarla» lo promete. Sin esto la fila viva se quedaba con la etapa vieja para siempre. */
  const antesVuelta = H.empujadas.length;
  const bv = await S.bombear();
  eq('lo cambiado mientras estuvo fuera llega a su fila con la etapa de hoy, y la nota se va',
     [rv.valor.revision && rv.valor.revision.reenviadas, bv.valor.subidas,
      H.empujadas.slice(antesVuelta).map(o => [o.id_notion, o.datos && o.datos['Etapa de obra']]),
      (await DB.obtener('proyectos', 'proy-B')).sin_mandar || null],
     [1, 1, [['V-406', 'Cortado']], null]);
  const antesSig = H.empujadas.length;
  await cambio('proy-B', ['etapa']);
  const bs = await S.bombear();
  eq('y el siguiente cambio llega a la hoja, a su fila', [bs.valor.subidas, H.empujadas.length - antesSig,
     (H.empujadas[H.empujadas.length - 1] || {}).id_notion], [1, 1, 'V-406']);
  await jalarTodo();
  eq('y una bajada más no lo vuelve a mandar', (await S.pendientes()).filter(o => o.registro_id === 'proy-B').length, 0);
  H.filas = [];

  await DB.poner('proyectos', propio('proy-C', 'COT-0407@TEST', 'V-407'));
  H.deOtra.add('V-407');
  await cambio('proy-C', ['etapa']);
  await S.bombear();
  eq('la fila que ya es de otra venta se marca como tal, no como borrada',
     ((await DB.obtener('proyectos', 'proy-C')).hoja_perdida || {}).motivo, 'de_otra');

  /* ── 2 · La tarjeta importada cuya fila se borró: solo una bajada COMPLETA marca ── */
  H.filas = [fila('V-300', 'Taller Sur - Vinil'), fila('V-301', 'Papelería Norte - Letras'), fila('V-302', 'Farmacia Centro - Caja')];
  await jalarTodo();
  eq('la bajada importa las tres filas vivas como tarjetas',
     await Promise.all(['V-300', 'V-301', 'V-302'].map(async f => !!(await DB.obtener('proyectos', 'proy-hoja-' + f)))), [true, true, true]);
  const marcada = async f => ((await DB.obtener('proyectos', 'proy-hoja-' + f)) || {}).hoja_perdida || null;

  H.filas = H.filas.filter(x => x.id_notion !== 'V-300');
  /* Una primera página que dice que hay más: el barrido no ha cerrado. */
  H.jalar = c => (c.cursor ? { ok: true, cursor: null, hay_mas: false, registros: H.filas.slice(1).map(d => ({ almacen: 'proyectos', datos: d })) }
                           : { ok: true, cursor: '3', hay_mas: true, registros: H.filas.slice(0, 1).map(d => ({ almacen: 'proyectos', datos: d })) });
  const r1 = await S.jalar();
  eq('una página a medias NO marca nada (no dice qué falta, dice qué no se leyó)', [r1.ok, r1.valor.hay_mas, await marcada('V-300')], [true, true, null]);
  H.jalar = () => ({ ok: false, codigo: 'SIN_RED', mensaje: 'La hoja no contestó.' });
  const r2 = await S.jalar();
  eq('una bajada que falla tampoco', [r2.ok, await marcada('V-300')], [false, null]);
  /* Un barrido que arrancó a medias —un cursor sin barrido anotado, de una versión anterior—
     cierra, pero no vio la primera parte. */
  await DB.poner('pendientes', { id: '_marcas', ts: 0, cursor: '3', barrido: null });
  H.jalar = () => ({ ok: true, cursor: null, hay_mas: false, registros: H.filas.map(d => ({ almacen: 'proyectos', datos: d })) });
  const r3 = await S.jalar();
  eq('ni uno que cerró pero empezó a medias', [r3.ok, r3.valor.completa, await marcada('V-300')], [true, true, null]);
  H.jalar = () => ({ ok: true, cursor: null, hay_mas: false, registros: [] });
  await S.jalar();
  eq('ni una hoja que contestó «ok» con cero filas', await marcada('V-300'), null);
  H.jalar = null;
  const r4 = await S.jalar();
  const m300 = await marcada('V-300');
  eq('una bajada COMPLETA sí: la tarjeta de V-300 queda marcada, no borrada',
     [r4.valor.revision && r4.valor.revision.perdidas, m300 && m300.motivo, m300 && m300.folio, !!(await DB.obtener('proyectos', 'proy-hoja-V-300'))],
     [1, 'no_bajo', 'V-300', true]);
  eq('las que sí vinieron no se marcan', [await marcada('V-301'), await marcada('V-302')], [null, null]);

  H.filas.push(fila('V-300', 'Taller Sur - Vinil'));
  await jalarTodo();
  eq('si la fila vuelve, la marca se va sola', await marcada('V-300'), null);
  H.filas = H.filas.filter(x => !['V-300', 'V-301'].includes(x.id_notion));
  await jalarTodo();
  eq('y si se vuelve a ir, se vuelve a marcar', [!!(await marcada('V-300')), !!(await marcada('V-301'))], [true, true]);

  /* Las tarjetas importadas viven sobre todo en el teléfono del taller, y las marcas no viajan:
     lo que Dirección decida en el suyo no llega aquí. Quitarla o dejarla lo decide quien tiene
     ESTE teléfono; aquí, fabricación. */
  guardado.al3d_pf_rol = 'fabricacion';
  await DB.poner('instalaciones', { id: 'inst-300', proyecto_id: 'proy-hoja-V-300', fecha: '2026-10-01', estado: 'confirmada' });
  const q1 = await Proy.quitarDelTablero('proy-hoja-V-300');
  eq('«Quitar del tablero» no quita la que tiene una instalación a su nombre, y dice por qué',
     [q1.ok, q1.codigo, /1 instalación/.test(q1.mensaje || ''), !!(await DB.obtener('proyectos', 'proy-hoja-V-300'))], [false, 'EN_USO', true, true]);
  const q2 = await Proy.quitarDelTablero('proy-hoja-V-301');
  eq('la que no tiene nada colgando, sí, y desde el teléfono de fabricación', [q2.ok, await DB.obtener('proyectos', 'proy-hoja-V-301')], [true, null]);
  eq('una tarjeta cuya venta sigue en la hoja no se quita: volvería en la siguiente bajada',
     (await Proy.quitarDelTablero('proy-hoja-V-302')).codigo, 'DATO_INVALIDO');
  eq('pero lo que decide la hoja sigue siendo de Dirección: dejar fuera una venta de aquí',
     (await Proy.dejarFueraDeLaHoja('proy-C')).codigo, 'ROL_SIN_PERMISO');
  const dj = await Proy.dejarFueraDeLaHoja('proy-hoja-V-300');
  await jalarTodo();
  const t300 = await DB.obtener('proyectos', 'proy-hoja-V-300');
  eq('«Dejarla» (fabricación también): se queda en el tablero y la siguiente bajada completa ya no la vuelve a marcar',
     [dj.ok, !!t300.fuera_de_hoja, t300.hoja_perdida], [true, true, null]);
  /* Mientras está «dejada», el taller —quien mueve la etapa— la pasa a «Listo». No sale a la hoja
     (su fila no está), pero tampoco se pierde. */
  await DB.poner('proyectos', { ...t300, etapa: 'listo', notas: 'el cliente pidió otro color' });
  await cambio('proy-hoja-V-300', ['etapa']);
  const antes300 = H.empujadas.length;
  const b300 = await S.bombear();
  eq('en el teléfono del taller, el cambio de una tarjeta «dejada» no sale ni se cuenta como mandado',
     [H.empujadas.length - antes300, b300.valor.subidas, !!(await DB.obtener('proyectos', 'proy-hoja-V-300')).sin_mandar], [0, 0, true]);
  /* La fila vuelve: «Dejarla» era para una fila que ya no estaba. La bajada lo quita, y ya no se
     puede quitar del tablero: la siguiente bajada la traería de nuevo, sin sus notas. */
  H.filas.push(fila('V-300', 'Taller Sur - Vinil'));
  await jalarTodo();
  const v300 = await DB.obtener('proyectos', 'proy-hoja-V-300');
  eq('la fila vuelve: se quita «Dejarla» y la marca, y las notas se quedan', [v300.fuera_de_hoja || null, v300.hoja_perdida, v300.notas],
     [null, null, 'el cliente pidió otro color']);
  const antesV300 = H.empujadas.length;
  await S.bombear();
  eq('y el «Listo» que se movió mientras tanto llega a su fila viva',
     H.empujadas.slice(antesV300).map(o => [o.id_notion, o.datos && o.datos['Etapa de obra']]), [['V-300', 'Listo para instalar']]);
  /* Cancelarla es lo único que la aplicación puede hacer con ella (no hay cómo borrarla), y una
     cancelada ya no la detiene: aquí se niega por su fila, que está en la hoja. */
  eq('su instalación se cancela desde la Agenda', (await Agenda.cancelar('inst-300')).ok, true);
  const q3 = await Proy.quitarDelTablero('proy-hoja-V-300');
  eq('y ya no se quita del tablero: su fila está en la hoja', [q3.codigo, !!(await DB.obtener('proyectos', 'proy-hoja-V-300'))], ['DATO_INVALIDO', true]);
  guardado.al3d_pf_rol = 'direccion';

  /* ── 3 · La misma venta dos veces: propia + copia importada ── */
  /* La que se junta sola: su fila trae el folio de cotización de la de aquí, y la copia no
     tiene nada que la de aquí no tenga. Lo que colgaba de la copia pasa al proyecto. */
  /* Cada copia se importó de su fila, con el nombre que la fila sigue trayendo: un nombre que ya
     no es el de la fila cuenta como dato propio de la copia (ver `loQueSePerderia`). */
  const copia = (fh, nombre, o = {}) => ({ ...Proy.desdeVentaDeHoja(ventaDeHoja(fila(fh, nombre))), ...o });
  await DB.poner('proyectos', propio('proy-D', 'COT-0310@TEST', 'V-310'));
  await DB.poner('proyectos', copia('V-310', 'Venta COT-0310'));
  await DB.poner('instalaciones', { id: 'inst-310', proyecto_id: 'proy-hoja-V-310', fecha: '2026-10-02', estado: 'confirmada' });
  await DB.poner('movimientos', { id: 'mov-310', proyecto_id: 'proy-hoja-V-310', material_id: 'acr-3mm', cantidad: -1, ts: 1 });
  /* La que NO: su fila no trae folio de cotización (el tercer camino, por el folio de la fila,
     con el mismo nombre que la de aquí) y la copia va más adelantada que la de aquí. */
  await DB.poner('proyectos', propio('proy-E', 'COT-0320@TEST', 'V-320'));
  await DB.poner('proyectos', copia('V-320', 'Venta COT-0320@TEST', { etapa: 'cortado', notas: 'llamar antes de ir' }));
  /* Una fila con la huella del defecto y sin copia todavía: no se importa como otra. */
  await DB.poner('proyectos', propio('proy-F', 'COT-0330@TEST', 'V-330'));
  /* Una fila cuyo folio de hoja coincide con el de un proyecto de aquí pero está atada a OTRA
     cotización: es otra venta, se importa, y no se junta con nadie. */
  await DB.poner('proyectos', propio('proy-G', 'COT-0340@TEST', 'V-340'));
  /* El folio que se repartió dos veces, con la celda de cotización vacía: la fila V-510 era de
     Ana, alguien la borró, y el folio se le dio a Luis, que se dio de alta a mano. El teléfono ya
     tenía importada la tarjeta de Luis, con su instalación. Solo coincide el folio de la hoja:
     NO es seguro que sea la misma venta, y juntarla le daría a Ana la obra y el saldo de Luis. */
  await DB.poner('proyectos', propio('proy-ANA', 'COT-0510@TEST', 'V-510', { nombre: 'Ana - Café (Letras)' }));
  await DB.poner('proyectos', Proy.desdeVentaDeHoja(ventaDeHoja(fila('V-510', 'Luis - Taller'))));
  await DB.poner('instalaciones', { id: 'inst-510', proyecto_id: 'proy-hoja-V-510', fecha: '2026-10-05', estado: 'confirmada' });
  /* Lo mismo sin copia todavía, y con otro nombre en la hoja: se importa, y Dirección dice que sí
     es la misma. */
  await DB.poner('proyectos', propio('proy-H', 'COT-0350@TEST', 'V-350', { nombre: 'Hugo - Barbería (Letras)' }));
  /* La copia repetida de una lápida («No se dio»): no se puede juntar, y no tenía salida. Su fila
     la trae VIVA (FABRICACION, con saldo): la hoja y este teléfono no dicen lo mismo. */
  await DB.poner('proyectos', propio('proy-L', 'COT-0360@TEST', 'V-360', { nombre: 'Lupita - Florería', etapa: 'cancelado' }));
  await DB.poner('proyectos', copia('V-360', 'Florería Lupita'));
  /* Otra lápida, sin copia todavía, cuya fila viva se llama igual que ella: el tercer camino la
     ataba por el nombre y la obra salía del tablero y del por cobrar. */
  await DB.poner('proyectos', propio('proy-R', 'COT-0365@TEST', 'V-365', { nombre: 'Rosa - Florería', etapa: 'cancelado' }));
  /* Las dos con su pin y su plazo, distintos: al juntarlas se quedan los de aquí. */
  await DB.poner('proyectos', propio('proy-P', 'COT-0370@TEST', 'V-370', { lat: 20.6, lng: -103.3, plazo_k: 5 }));
  await DB.poner('proyectos', copia('V-370', 'Venta COT-0370@TEST', { lat: 20.71, lng: -103.41, plazo_k: 2 }));
  /* La misma venta, con su mismo nombre, y en la copia se escribieron datos de la venta: el taller
     anotó las entrecalles, y Dirección el teléfono del cliente y una dirección corregida, que ya
     llegó a la fila. Juntarla sola los borraba, y el siguiente cambio de la de aquí le escribía a
     la fila la dirección vieja encima de la corregida. */
  await DB.poner('proyectos', propio('proy-Q', 'COT-0380@TEST', 'V-380', { nombre: 'Café Luna - Letras' }));
  await DB.poner('proyectos', copia('V-380', 'Café Luna - Letras'));
  guardado.al3d_pf_rol = 'fabricacion';
  eq('fabricación anota las entrecalles en la copia', (await Proy.actualizar('proy-hoja-V-380', { entrecalles: 'entre Juárez y Morelos, portón verde' })).ok, true);
  guardado.al3d_pf_rol = 'direccion';
  eq('Dirección le pone el teléfono del cliente y corrige la dirección',
     (await Proy.actualizar('proy-hoja-V-380', { tel: '33 1234 5678', dir_texto: 'Calle Real 250, local 3' })).ok, true);
  const antes380 = H.empujadas.length;
  await S.bombear();
  eq('y la dirección corregida llega a la fila V-380', H.empujadas.slice(antes380).filter(o => o.id_notion === 'V-380').map(o => o.datos['Direccion']).pop(),
     'Calle Real 250, local 3');
  H.filas.push(fila('V-310', 'Venta COT-0310', { 'Folio cotizacion': 'COT-0310@TEST' }), fila('V-320', 'Venta COT-0320@TEST'),
               fila('V-330', 'Venta COT-0330@TEST', { 'Folio cotizacion': 'V-330', 'Pago Pendiente': 4321 }),
               fila('V-340', 'Otra venta', { 'Folio cotizacion': 'COT-9999@OTRO', 'Pago Pendiente': 999 }),
               fila('V-510', 'Luis - Taller', { 'Pago Pendiente': 3333 }),
               fila('V-350', 'Hugo Barbería Centro', { 'Pago Pendiente': 2222 }),
               fila('V-360', 'Florería Lupita'), fila('V-365', 'Rosa - Florería', { 'Pago Pendiente': 6600 }),
               fila('V-370', 'Venta COT-0370@TEST'),
               fila('V-380', 'Café Luna - Letras', { 'Direccion': 'Calle Real 250, local 3' }));
  const r5 = await jalarTodo();
  const [i310, m310] = [await DB.obtener('instalaciones', 'inst-310'), await DB.obtener('movimientos', 'mov-310')];
  eq('la copia que no pierde nada se junta sola: su instalación y su movimiento pasan al proyecto, y la copia se va',
     [r5.valor.revision && r5.valor.revision.juntadas, i310.proyecto_id, m310.proyecto_id, await DB.obtener('proyectos', 'proy-hoja-V-310')],
     [1, 'proy-D', 'proy-D', null]);
  const c320 = await DB.obtener('proyectos', 'proy-hoja-V-320');
  eq('la que perdería algo NO se borra: se marca repetida, con la de aquí y el porqué',
     [!!c320, c320 && c320.duplicado_de && c320.duplicado_de.id, c320 && /Cortado/.test((c320.duplicado_de.por || []).join(' '))],
     [true, 'proy-E', true]);
  eq('la de aquí se ata a su fila por el folio de la hoja, para que Control la cuente una vez',
     (await DB.obtener('proyectos', 'proy-E')).folio_hoja, 'V-320');
  const f330 = await DB.obtener('proyectos', 'proy-F');
  eq('una fila con la huella del defecto y su mismo nombre le cae a la de aquí (con su saldo) y NO se importa como otra',
     [await DB.obtener('proyectos', 'proy-hoja-V-330'), f330.pago_pendiente, f330.precio_auth], [null, 4321, 11600]);
  const g340 = await DB.obtener('proyectos', 'proy-G');
  eq('la fila atada a otra cotización no le cae a la de aquí aunque el folio de hoja coincida, y se importa aparte sin marca',
     [g340.pago_pendiente, !!(await DB.obtener('proyectos', 'proy-hoja-V-340')), ((await DB.obtener('proyectos', 'proy-hoja-V-340')) || {}).duplicado_de || null],
     [null, true, null]);

  const c380 = await DB.obtener('proyectos', 'proy-hoja-V-380');
  const por380 = ((c380 && c380.duplicado_de && c380.duplicado_de.por) || []).join(' | ');
  eq('la copia con datos escritos aquí (entrecalles, teléfono, dirección corregida) NO se junta sola ni se borra',
     [!!c380, c380 && c380.duplicado_de && c380.duplicado_de.id, c380 && c380.duplicado_de.claves], [true, 'proy-Q', ['datos', 'datos_distintos']]);
  cierto('y el porqué dice cuáles pasan y cuál se queda: ' + por380,
    /el teléfono del cliente y las entrecalles\): al juntarlas pasan/.test(por380) && /en la dirección: al juntarlas se quedan los datos de este teléfono/.test(por380));
  const j380 = await Proy.juntarConLaDeAqui('proy-hoja-V-380');
  const q380 = await DB.obtener('proyectos', 'proy-Q');
  eq('«Juntar»: el teléfono y las entrecalles pasan a la de aquí, y la dirección se queda la de aquí, como dijo',
     [j380.ok, await DB.obtener('proyectos', 'proy-hoja-V-380'), q380.tel, q380.entrecalles, q380.dir_texto],
     [true, null, '33 1234 5678', 'entre Juárez y Morelos, portón verde', 'Av. Siempre Viva 1']);
  await S.bombear();   // lo que «Juntar» encoló en la de aquí sale ya: las cuentas de abajo son de otras filas

  /* El folio repartido dos veces: nada se junta ni se borra solo, y el dinero de Luis no cae en Ana. */
  const luis = await DB.obtener('proyectos', 'proy-hoja-V-510');
  const ana = await DB.obtener('proyectos', 'proy-ANA');
  eq('solo coincide el folio de la hoja: la tarjeta de Luis NO se junta sola con la de Ana ni se borra, y su instalación sigue siendo suya',
     [!!luis, (await DB.obtener('instalaciones', 'inst-510')).proyecto_id], [true, 'proy-hoja-V-510']);
  eq('y a Ana no le cae el saldo de la fila de Luis, ni se ata a ella', [ana.pago_pendiente, ana.folio_hoja || null], [null, null]);
  eq('se marca repetida, y el porqué dice que hay que confirmar que es la misma venta',
     [luis && luis.duplicado_de && luis.duplicado_de.id, luis && (luis.duplicado_de.claves || []).includes('identidad'),
      luis && /confirmar que es la misma venta/.test((luis.duplicado_de.por || []).join(' '))], ['proy-ANA', true, true]);
  eq('la tarjeta de Luis sigue recibiendo el dinero de su fila', luis && luis.pago_pendiente, 3333);

  /* Lo decide Dirección, y solo Dirección: cuál de dos proyectos es la venta. */
  guardado.al3d_pf_rol = 'fabricacion';
  eq('fabricación no junta, no separa ni quita una repetida',
     [(await Proy.juntarConLaDeAqui('proy-hoja-V-510')).codigo, (await Proy.noEsLaMisma('proy-hoja-V-510')).codigo,
      (await Proy.quitarDelTablero('proy-hoja-V-510')).codigo], ['ROL_SIN_PERMISO', 'ROL_SIN_PERMISO', 'ROL_SIN_PERMISO']);
  guardado.al3d_pf_rol = 'direccion';
  eq('«No es la misma venta» no se ofrece cuando la fila sí es de la de aquí (su mismo nombre)',
     (await Proy.noEsLaMisma('proy-hoja-V-320')).codigo, 'DATO_INVALIDO');
  const ne = await Proy.noEsLaMisma('proy-hoja-V-510');
  const antesAna = H.empujadas.length;
  await jalarTodo();
  const luis2 = await DB.obtener('proyectos', 'proy-hoja-V-510');
  const ana2 = await DB.obtener('proyectos', 'proy-ANA');
  eq('«No es la misma venta»: la tarjeta de Luis se queda como la de SU venta, y la siguiente bajada no la vuelve a preguntar',
     [ne.ok, luis2 && luis2.duplicado_de, luis2 && luis2.pago_pendiente], [true, null, 3333]);
  eq('y la de Ana queda sin fila, con las dos salidas: «ya es de otra venta»',
     [ana2.hoja_perdida && ana2.hoja_perdida.motivo, ana2.hoja_perdida && ana2.hoja_perdida.folio, Proy.avisoDeHoja(ana2)], ['de_otra', 'V-510', 'perdida']);
  await cambio('proy-ANA', ['etapa']);
  await S.bombear();
  eq('y su siguiente cambio NO se escribe en la fila de Luis (la hoja no lo sabría: no tiene folio de cotización): se aparta',
     [H.empujadas.length - antesAna, (await deProyecto('proy-ANA')).length], [0, 1]);

  /* La otra salida: Dirección dice que sí es la misma. «Juntar» ata la fila a la de aquí para
     las siguientes bajadas, aunque no traiga su folio ni su nombre. */
  const c350 = await DB.obtener('proyectos', 'proy-hoja-V-350');
  eq('sin copia todavía y con otro nombre: se importa, y queda repetida por confirmar',
     [!!c350, c350 && (c350.duplicado_de.claves || []).includes('identidad'), (await DB.obtener('proyectos', 'proy-H')).pago_pendiente],
     [true, true, null]);
  const j350 = await Proy.juntarConLaDeAqui('proy-hoja-V-350');
  await jalarTodo();
  const h350 = await DB.obtener('proyectos', 'proy-H');
  eq('«Juntar» con la identidad por confirmar: la copia se va, y desde la siguiente bajada la fila es de la de aquí',
     [j350.ok, await DB.obtener('proyectos', 'proy-hoja-V-350'), h350.hoja_confirmada, h350.folio_hoja, h350.pago_pendiente],
     [true, null, 'V-350', 'V-350', 2222]);

  /* La copia de una lápida: no se junta (a una venta que no se dio no se le mueve una obra). Y
     mientras su fila la traiga VIVA tampoco se quita: la hoja y este teléfono dicen cosas
     distintas de la misma venta, y quitarla le daba la razón a la lápida sin preguntar —su fila
     quedaba atada a ella, la obra salía del tablero y su saldo del por cobrar de Control—. */
  const V = await import('../js/datos/ventas.js');
  const porCobrarDe = async fh => {
    const u = V.unificar(await DB.listar('proyectos'), await DB.listar('ventas_hoja'));
    return V.porCobrar(u.ventas).filter(x => x.proyecto.folio_hoja === fh).reduce((s, x) => s + x.saldo, 0);
  };
  const c360 = await DB.obtener('proyectos', 'proy-hoja-V-360');
  eq('la copia de la lápida queda repetida, con su fila viva, y «Juntar» se niega', [c360 && c360.duplicado_de.claves,
     (await Proy.juntarConLaDeAqui('proy-hoja-V-360')).codigo], [['identidad', 'cancelada', 'viva'], 'EN_USO']);
  const q360v = await Proy.quitarDelTablero('proy-hoja-V-360');
  eq('con su fila viva, «Quitar» se niega y dice las dos salidas de verdad',
     [q360v.codigo, /trae esta obra viva/.test(q360v.mensaje || ''), /márcala «No se dio» también en la hoja/.test(q360v.mensaje || ''),
      /regrésala a su etapa/.test(q360v.mensaje || ''), !!(await DB.obtener('proyectos', 'proy-hoja-V-360'))],
     ['DATO_INVALIDO', true, true, true, true]);
  await jalarTodo();
  eq('y Control sigue cobrando la obra viva: su saldo no sale del por cobrar', await porCobrarDe('V-360'), 6600);
  /* La lápida que se llama igual que su fila viva: la bajada ya no la ata por el nombre. Antes le
     echaba la fila, y la obra que la hoja trae en FABRICACION desaparecía del tablero y de Control. */
  const r365 = await DB.obtener('proyectos', 'proy-R');
  const c365 = await DB.obtener('proyectos', 'proy-hoja-V-365');
  eq('una lápida no se queda con la fila viva que se llama como ella: la obra entra como tarjeta, repetida de la lápida',
     [r365.folio_hoja || null, r365.pago_pendiente, !!c365, c365 && c365.duplicado_de && c365.duplicado_de.id, c365 && c365.duplicado_de.claves],
     [null, null, true, 'proy-R', ['cancelada', 'viva']]);
  eq('y su saldo se sigue contando en Control', await porCobrarDe('V-365'), 6600);
  /* Si no se dio, se marca también en la hoja. Con eso las dos dicen lo mismo, y la copia ya se
     puede quitar. */
  const i360 = H.filas.findIndex(x => x.id_notion === 'V-360');
  H.filas[i360] = { ...H.filas[i360], 'Etapa de obra': 'No se dio' };
  await jalarTodo();
  eq('con la fila marcada «No se dio» en la hoja, la marca ya no dice «viva»',
     (((await DB.obtener('proyectos', 'proy-hoja-V-360')) || {}).duplicado_de || {}).claves, ['identidad', 'cancelada']);
  /* Con una obra agendada a su nombre no se quita, y no se le dice que la junte (se negaría):
     la obra viva pone en duda el «No se dio». */
  await DB.poner('instalaciones', { id: 'inst-360', proyecto_id: 'proy-hoja-V-360', fecha: '2026-10-09', estado: 'propuesta' });
  const q360a = await Proy.quitarDelTablero('proy-hoja-V-360');
  eq('con una instalación a su nombre, no se quita, no manda a juntarla con la lápida y dice la salida de verdad',
     [q360a.codigo, /No se dio/.test(q360a.mensaje || ''), /Júntala/.test(q360a.mensaje || ''), /cancélala en la Agenda/.test(q360a.mensaje || ''),
      /dice la verdad/.test(q360a.mensaje || '')], ['EN_USO', true, false, true, false]);
  /* La que la persona cancela desde la Agenda —la aplicación no tiene cómo borrarla— ya no es
     obra viva: la copia se quita y la cancelación se queda en la agenda, como lo que es. */
  eq('se cancela desde la Agenda', (await Agenda.cancelar('inst-360')).ok, true);
  const q360 = await Proy.quitarDelTablero('proy-hoja-V-360');
  await jalarTodo();
  eq('pero sí se quita del tablero, y la siguiente bajada NO la vuelve a importar (su fila queda de la lápida)',
     [q360.ok, await DB.obtener('proyectos', 'proy-hoja-V-360'), (await DB.obtener('proyectos', 'proy-L')).folio_hoja], [true, null, 'V-360']);
  eq('y su instalación cancelada se queda en la agenda', ((await DB.obtener('instalaciones', 'inst-360')) || {}).estado, 'cancelada');

  /* Las dos con pin y plazo: el porqué dice lo que de verdad pasa al juntar. */
  const c370 = await DB.obtener('proyectos', 'proy-hoja-V-370');
  const por370 = ((c370 && c370.duplicado_de && c370.duplicado_de.por) || []).join(' | ');
  cierto('con dos pines y dos plazos distintos, el porqué dice que se quedan los de aquí y los de la copia se pierden: ' + por370,
    /otra ubicación.*se queda la de este teléfono/.test(por370) && /otro plazo.*se queda el de este teléfono/.test(por370));
  const j370 = await Proy.juntarConLaDeAqui('proy-hoja-V-370');
  const p370 = await DB.obtener('proyectos', 'proy-P');
  eq('y juntar hace eso: el pin y el plazo de aquí', [j370.ok, p370.lat, p370.lng, p370.plazo_k], [true, 20.6, -103.3, 5]);

  const j = await Proy.juntarConLaDeAqui('proy-hoja-V-320');
  const e320 = await DB.obtener('proyectos', 'proy-E');
  eq('«Juntar con…»: la copia se va, sus notas pasan a la de aquí, y la etapa NO (moverla descuenta material)',
     [j.ok, await DB.obtener('proyectos', 'proy-hoja-V-320'), /llamar antes de ir/.test(e320.notas || ''), e320.etapa], [true, null, true, 'ganado']);
  await jalarTodo();
  eq('y la siguiente bajada no la vuelve a importar', await DB.obtener('proyectos', 'proy-hoja-V-320'), null);

  /* La venta que la bajada ató por su nombre se queda atada: el nombre es justo lo que PAGOS
     corrige en la hoja, y con la corrección la misma venta volvía a entrar como otra tarjeta y la
     de aquí dejaba de recibir su dinero. */
  eq('la atadura por el nombre se anota en la de aquí', (await DB.obtener('proyectos', 'proy-F')).hoja_confirmada, 'V-330');
  const i330 = H.filas.findIndex(x => x.id_notion === 'V-330');
  H.filas[i330] = { ...H.filas[i330], 'Proyecto': 'Café Luna Centro - Letras 3D', 'Pago Pendiente': 1111 };
  await jalarTodo();
  eq('con el nombre corregido en la hoja sigue siendo su venta: no entra como otra tarjeta, y su dinero le sigue cayendo',
     [await DB.obtener('proyectos', 'proy-hoja-V-330'), (await DB.obtener('proyectos', 'proy-F')).pago_pendiente], [null, 1111]);

  /* ── 4 · Lo que ya estaba atorado antes de la marca ──
     Un cambio que rebotó con la frase vieja de la hoja y se quedó apartado. Lo apartado no se
     reintenta solo: sin esto, la venta se quedaba sin aviso y sin botones para siempre. */
  const viejo = (id, proyId, np) => ({ id, tipo: 'actualizar', almacen: 'proyectos', registro_id: proyId, entidad: 'proyectos',
    entidad_id: proyId, datos: { id: proyId }, campos: ['etapa'], ts: 5, disp: 'TEST', intentos: 1, estado: 'rechazada',
    codigo_rechazo: 'NO_ENCONTRADO', sync: 0,
    ultimo_error: 'La venta ' + np + ' ya no está en la hoja: alguien borró su fila. Este cambio no se escribió en ninguna otra. Si la venta sigue viva, vuelve a registrarla desde el cotizador.' });
  await DB.poner('proyectos', propio('proy-V', 'COT-0470@TEST', 'V-470'));
  await DB.poner('pendientes', viejo('op-vieja-470', 'proy-V', 'V-470'));
  /* Y uno viejo cuya fila ya volvió: el rebote no dice nada de hoy. */
  await DB.poner('proyectos', propio('proy-W', 'COT-0480@TEST', 'V-480'));
  await DB.poner('pendientes', viejo('op-vieja-480', 'proy-W', 'V-480'));
  /* Y uno cuya frase alguien reescribió en la hoja: lo que se lee es el motivo guardado. */
  await DB.poner('proyectos', propio('proy-X', 'COT-0490@TEST', 'V-490'));
  await DB.poner('pendientes', { ...viejo('op-vieja-490', 'proy-X', 'V-490'), motivo_rechazo: 'borrada',
    ultimo_error: 'Fila V-490: no existe.' });
  H.filas.push(fila('V-480', 'Venta COT-0480@TEST', { 'Folio cotizacion': 'COT-0480@TEST' }));
  H.jalar = c => (c.cursor ? { ok: true, cursor: null, hay_mas: false, registros: H.filas.slice(1).map(d => ({ almacen: 'proyectos', datos: d })) }
                           : { ok: true, cursor: '9', hay_mas: true, registros: H.filas.slice(0, 1).map(d => ({ almacen: 'proyectos', datos: d })) });
  await S.jalar();
  eq('una página a medias no marca lo atorado', (await DB.obtener('proyectos', 'proy-V')).hoja_perdida || null, null);
  H.jalar = null;
  await jalarTodo();
  const v470 = await DB.obtener('proyectos', 'proy-V');
  eq('la bajada COMPLETA confirma que su fila no está: la venta atorada queda marcada, con su aviso',
     [v470.hoja_perdida && v470.hoja_perdida.motivo, v470.hoja_perdida && v470.hoja_perdida.folio, Proy.avisoDeHoja(v470)], ['borrada', 'V-470', 'perdida']);
  eq('la de la fila que volvió no se marca', (await DB.obtener('proyectos', 'proy-W')).hoja_perdida || null, null);
  eq('y la de la frase reescrita se marca por su motivo guardado',
     ((await DB.obtener('proyectos', 'proy-X')).hoja_perdida || {}).motivo, 'borrada');
  const re470 = await Proy.volverADarDeAlta('proy-V');
  eq('y ya tiene salida: «Volver a darla de alta» tira lo apartado y encola el alta',
     [re470.ok, (await deProyecto('proy-V')).length, (await S.pendientes()).filter(o => o.registro_id === 'proy-V').map(o => o.tipo)], [true, 0, ['crear']]);
  await S.bombear();   // el alta sale ya: las cuentas de abajo son de otras filas

  /* ── 5 · Lo que se cambió mientras la fila no estaba, y la venta que vuelve dos veces ── */
  const aFila = (fh, desde) => H.empujadas.slice(desde).filter(o => o.id_notion === fh);
  const ponerFila = (fh, o) => { const i = H.filas.findIndex(x => x.id_notion === fh); H.filas[i] = { ...H.filas[i], ...o }; };

  /* 5a · Fuera de la hoja, Dirección corrige la cuenta y el anticipo. La fila vuelve como estaba:
     la bajada no le pisa al proyecto lo que todavía no se manda, y el reenvío lo lleva. Antes el
     espejo de la fila le devolvía la cuenta y el anticipo viejos, y eso era lo que se reenviaba:
     la corrección no quedaba ni en el teléfono ni en la hoja. */
  guardado.al3d_pf_rol = 'direccion';
  await DB.poner('proyectos', propio('proy-B2', 'COT-0408@TEST', 'V-408'));
  H.borradas.add('V-408');
  await cambio('proy-B2', ['etapa']);
  await S.bombear();
  eq('5a · la fila se borró: el cambio rebota y Dirección deja la venta fuera', (await Proy.dejarFueraDeLaHoja('proy-B2')).ok, true);
  eq('5a · mientras está fuera, Dirección corrige la cuenta y el anticipo', (await Proy.actualizar('proy-B2', { cuenta: 'Rul HSBC', anti_pactado: 7000 })).ok, true);
  await S.bombear();
  H.borradas.delete('V-408');
  H.filas.push(fila('V-408', 'Venta COT-0408@TEST', { 'Folio cotizacion': 'COT-0408@TEST', 'Anticipo': 5000, 'Cuenta ': 'Elias BBVA' }));
  const a408 = H.empujadas.length;
  await jalarTodo();
  const b408 = await DB.obtener('proyectos', 'proy-B2');
  eq('5a · la fila vuelve con lo de antes, y la bajada NO le pisa al proyecto lo que todavía no se mandó',
     [b408.fuera_de_hoja || null, b408.cuenta, b408.anti_pactado], [null, 'Rul HSBC', 7000]);
  await S.bombear();
  eq('5a · y el reenvío le lleva a su fila la cuenta y el anticipo nuevos',
     aFila('V-408', a408).map(o => [o.datos['Cuenta '], o.datos['Anticipo']]), [['Rul HSBC', 7000]]);
  ponerFila('V-408', { 'Cuenta ': 'Rul HSBC', 'Anticipo': 7000 });

  /* 5b · Lo que YA rebotó, en la venta de aquí: con la fila borrada, Dirección corrige el anticipo;
     rebota, y es justo lo que enciende la marca. «Dejarla fuera» lo tiraba, y cuando la fila volvía
     la bajada le ponía al proyecto el anticipo viejo: el nuevo ya no existía en ningún lado. */
  await DB.poner('proyectos', propio('proy-B3', 'COT-0409@TEST', 'V-409'));
  H.borradas.add('V-409');
  eq('5b · con la fila ya borrada, Dirección corrige el anticipo', (await Proy.actualizar('proy-B3', { anti_pactado: 8000 })).ok, true);
  await S.bombear();
  eq('5b · rebota y la venta se marca', [(await deProyecto('proy-B3')).length, ((await DB.obtener('proyectos', 'proy-B3')).hoja_perdida || {}).motivo],
     [1, 'borrada']);
  eq('5b · «Dejarla fuera de la hoja»', (await Proy.dejarFueraDeLaHoja('proy-B3')).ok, true);
  const b409 = await DB.obtener('proyectos', 'proy-B3');
  eq('5b · lo que rebotó sale de lo apartado, pero se guarda para cuando vuelva la fila',
     [(await deProyecto('proy-B3')).length, b409.sin_mandar && b409.sin_mandar.campos], [0, ['anti_pactado']]);
  H.borradas.delete('V-409');
  H.filas.push(fila('V-409', 'Venta COT-0409@TEST', { 'Folio cotizacion': 'COT-0409@TEST', 'Anticipo': 5000 }));
  const a409 = H.empujadas.length;
  await jalarTodo();
  await S.bombear();
  eq('5b · la fila vuelve: el anticipo corregido llega a ella, y en el teléfono se queda',
     [aFila('V-409', a409).map(o => o.datos['Anticipo']), (await DB.obtener('proyectos', 'proy-B3')).anti_pactado], [[8000], 8000]);
  ponerFila('V-409', { 'Anticipo': 8000 });

  /* 5c · Lo mismo en la tarjeta importada, en el teléfono del taller: la obra se mueve con la fila
     recién borrada, rebota, y el taller aprieta «Dejarla». La confirmación promete que, si la fila
     vuelve, se manda sola con lo cambiado; antes la etapa que rebotó no llegaba nunca. */
  H.filas.push(fila('V-620', 'Taller Norte - Vinil'));
  await jalarTodo();
  guardado.al3d_pf_rol = 'fabricacion';
  H.filas = H.filas.filter(x => x.id_notion !== 'V-620'); H.borradas.add('V-620');
  eq('5c · fabricación mueve la obra de la tarjeta importada cuya fila se acaba de borrar', (await Proy.avanzarEtapa('proy-hoja-V-620', 'armado')).ok, true);
  await S.bombear();
  const ap620 = await deProyecto('proy-hoja-V-620');
  eq('5c · rebota y la tarjeta se marca', [ap620.length, ((await DB.obtener('proyectos', 'proy-hoja-V-620')).hoja_perdida || {}).motivo], [1, 'borrada']);
  cierto('5c · y lo apartado (lo que Ajustes enseña) le dice a quien tiene el teléfono lo que sí puede hacer: ' + (ap620[0] || {}).ultimo_error,
    ap620.length && /quien tenga este teléfono/.test(ap620[0].ultimo_error) && !/dar de alta/.test(ap620[0].ultimo_error));
  eq('5c · «Dejarla»', (await Proy.dejarFueraDeLaHoja('proy-hoja-V-620')).ok, true);
  H.borradas.delete('V-620'); H.filas.push(fila('V-620', 'Taller Norte - Vinil'));
  const a620 = H.empujadas.length;
  await jalarTodo();
  await S.bombear();
  eq('5c · la fila vuelve, y le llega la etapa que había rebotado', aFila('V-620', a620).map(o => o.datos['Etapa de obra']), ['Armado']);

  /* 5d · «Quitar del tablero» justo después del rebote, antes de la siguiente bajada completa: su
     renglón sigue en el récord, pero lo más nuevo que se sabe de la fila es que la hoja dijo que no
     está. Antes contestaba «su fila está otra vez en la hoja», que era falso. */
  H.filas.push(fila('V-630', 'Papelería Luna - Caja'));
  await jalarTodo();
  H.filas = H.filas.filter(x => x.id_notion !== 'V-630'); H.borradas.add('V-630');
  await Proy.avanzarEtapa('proy-hoja-V-630', 'armado');
  await S.bombear();
  eq('5d · el cambio rebota y la tarjeta queda marcada, con su renglón todavía en el récord',
     [Proy.avisoDeHoja(await DB.obtener('proyectos', 'proy-hoja-V-630')), !!(await DB.obtener('ventas_hoja', 'hoja:V-630'))], ['perdida', true]);
  const q630 = await Proy.quitarDelTablero('proy-hoja-V-630');
  eq('5d · y «Quitar del tablero» la quita (fabricación), con lo que tenía apartado',
     [q630.ok, await DB.obtener('proyectos', 'proy-hoja-V-630'), (await deProyecto('proy-hoja-V-630')).length], [true, null, 0]);
  await jalarTodo();
  eq('5d · la siguiente bajada no la vuelve a traer', await DB.obtener('proyectos', 'proy-hoja-V-630'), null);
  /* La red de antes se queda: una marca más vieja que la última bajada completa, con la fila en el
     récord, quiere decir que la fila volvió. */
  const f631 = fila('V-631', 'Ferretería Sur - Letras');
  await DB.poner('proyectos', { ...Proy.desdeVentaDeHoja(ventaDeHoja(f631)), hoja_perdida: { motivo: 'borrada', folio: 'V-631', desde: 1, mensaje: '' } });
  await DB.poner('ventas_hoja', { ...ventaDeHoja(f631), actualizado_en: Date.now() });
  eq('5d · pero con la fila en el récord y una marca de antes de la última bajada completa, no se quita',
     (await Proy.quitarDelTablero('proy-hoja-V-631')).codigo, 'DATO_INVALIDO');
  await DB.borrar('proyectos', 'proy-hoja-V-631'); await DB.borrar('ventas_hoja', 'hoja:V-631');

  /* 5e · La instalación CANCELADA ya no la ata al tablero. La aplicación no tiene cómo borrarla
     (`Agenda.cancelar` solo la marca), y contarla dejaba la tarjeta para siempre con un botón que
     nunca funcionaba, y un «júntalas» que para ella no existe. */
  guardado.al3d_pf_rol = 'direccion';
  H.filas.push(fila('V-640', 'Óptica Norte - Vinil'));
  await jalarTodo();
  const ag640 = await Agenda.agendar('proy-hoja-V-640', { fecha: '2026-10-12', hora: '10:00' });
  await S.bombear();
  H.filas = H.filas.filter(x => x.id_notion !== 'V-640');
  await jalarTodo();
  eq('5e · su fila no vino en una bajada completa: marcada', Proy.avisoDeHoja(await DB.obtener('proyectos', 'proy-hoja-V-640')), 'perdida');
  guardado.al3d_pf_rol = 'fabricacion';
  const q640v = await Proy.quitarDelTablero('proy-hoja-V-640');
  eq('5e · con la instalación viva no se quita, y dice la salida que existe (cancelarla o dejarla), no «júntalas»',
     [q640v.codigo, /cancélala en la Agenda/.test(q640v.mensaje || ''), /déjala/.test(q640v.mensaje || ''), /júnta/i.test(q640v.mensaje || '')],
     ['EN_USO', true, true, false]);
  eq('5e · se cancela desde la Agenda', (await Agenda.cancelar(ag640.valor.id)).ok, true);
  const q640 = await Proy.quitarDelTablero('proy-hoja-V-640');
  eq('5e · con la instalación cancelada, sí se quita; la cancelación se queda en la agenda',
     [q640.ok, await DB.obtener('proyectos', 'proy-hoja-V-640'), ((await DB.obtener('instalaciones', ag640.valor.id)) || {}).estado], [true, null, 'cancelada']);
  guardado.al3d_pf_rol = 'direccion';

  /* 5f · «Juntar» con algo de la copia todavía en la bandeja: Dirección agenda la instalación en
     la copia (sin mandar todavía) y aprieta «Juntar». Se tiraba lo pendiente y la fecha no llegaba
     a la hoja; ahora espera, como la junta sola, y lo dice. */
  const f650 = fila('V-650', 'Café Sol - Letras', { 'Etapa de obra': 'Armado' });
  await DB.poner('proyectos', propio('proy-J', 'COT-0650@TEST', 'V-650', { nombre: 'Café Sol - Letras' }));
  await DB.poner('proyectos', { ...Proy.desdeVentaDeHoja(ventaDeHoja(f650)), etapa: 'armado' });
  H.filas.push(f650);
  await jalarTodo();
  eq('5f · la copia va más adelante: repetida, no se junta sola', ((await DB.obtener('proyectos', 'proy-hoja-V-650')).duplicado_de || {}).claves, ['etapa']);
  const ag650 = await Agenda.agendar('proy-hoja-V-650', { fecha: '2026-10-02', hora: '10:00' });
  const j650a = await Proy.juntarConLaDeAqui('proy-hoja-V-650');
  eq('5f · con la instalación todavía en la bandeja, «Juntar» espera y dice qué falta',
     [j650a.codigo, /esperando en la bandeja/.test(j650a.mensaje || ''), !!(await DB.obtener('proyectos', 'proy-hoja-V-650')),
      (await S.pendientes()).filter(o => o.almacen === 'instalaciones' && o.datos && o.datos.proyecto_id === 'proy-hoja-V-650').length],
     ['EN_USO', true, true, 1]);
  const a650 = H.empujadas.length;
  await S.bombear();
  const j650 = await Proy.juntarConLaDeAqui('proy-hoja-V-650');
  eq('5f · ya mandada, se juntan: la fecha llegó a su fila y la instalación pasa a la de aquí',
     [j650.ok, aFila('V-650', a650).some(o => o.datos && o.datos['Fecha instalacion'] === '2026-10-02'),
      ((await DB.obtener('instalaciones', ag650.valor.id)) || {}).proyecto_id], [true, true, 'proy-J']);

  /* 5g · La venta que vuelve DOS veces a la hoja: su fila se borró, Dirección la volvió a dar de
     alta y después PAGOS deshizo el borrado. Las dos filas traen su folio de cotización. Antes la
     bajada le cambiaba la fila en silencio, nada lo avisaba y Control la contaba dos veces. */
  await DB.poner('proyectos', propio('proy-K', 'COT-0660@TEST', 'V-660', { nombre: 'Kiosko Sol - Letras' }));
  const f660 = fila('V-660', 'Kiosko Sol - Letras', { 'Folio cotizacion': 'COT-0660@TEST', 'Liquidacion': 6600, 'Pago Pendiente': 0 });
  H.filas.push(f660);
  await jalarTodo();
  H.filas = H.filas.filter(x => x.id_notion !== 'V-660'); H.borradas.add('V-660');
  await cambio('proy-K', ['etapa']);
  await S.bombear();
  eq('5g · la fila se borra, el cambio rebota y Dirección la vuelve a dar de alta', (await Proy.volverADarDeAlta('proy-K')).ok, true);
  await S.bombear();
  const k1 = await DB.obtener('proyectos', 'proy-K');
  const n660 = k1.notion_page_id;
  eq('5g · queda en una fila nueva, y la vieja se anota como suya', [!!n660 && n660 !== 'V-660', k1.folios_previos], [true, ['V-660']]);
  H.filas.push(fila(n660, 'Kiosko Sol - Letras', { 'Folio cotizacion': 'COT-0660@TEST', 'Pago Pendiente': 6600 }));
  await jalarTodo();
  H.borradas.delete('V-660'); H.filas.push(f660);
  await jalarTodo();
  const k2 = await DB.obtener('proyectos', 'proy-K');
  eq('5g · PAGOS deshace el borrado: la venta está en dos filas, se queda con la que tenía y se marca para Dirección',
     [k2.notion_page_id, k2.hoja_doble && k2.hoja_doble.folios, Proy.avisoDeHoja(k2)], [n660, [n660, 'V-660'], 'doble']);
  eq('5g · y Control la cuenta una vez', V.unificar(await DB.listar('proyectos'), await DB.listar('ventas_hoja')).ventas
    .filter(x => /Kiosko Sol/.test(x.nombre || '')).map(x => x.id), ['proy-K']);
  const a660 = H.empujadas.length;
  await cambio('proy-K', ['etapa']);
  await S.bombear();
  eq('5g · sus cambios siguen yendo a la fila que tenía', [aFila(n660, a660).length, aFila('V-660', a660).length], [1, 0]);
  /* Dirección borra en la hoja la que sobra —la nueva, que no tiene la liquidación—: la marca se
     va sola y la venta se ata a la que queda. Nada se borró de este lado. */
  H.filas = H.filas.filter(x => x.id_notion !== n660);
  await jalarTodo();
  const k3 = await DB.obtener('proyectos', 'proy-K');
  eq('5g · Dirección borra en la hoja la que sobra: la marca se va y la venta se ata a la que queda',
     [k3.notion_page_id, k3.hoja_doble || null, Proy.avisoDeHoja(k3), k3.pago_pendiente], ['V-660', null, '', 0]);

  /* 5h · Lo mismo con una venta atada a su fila por el NOMBRE (la fila no trae folio de
     cotización): la fila vieja restaurada entraba como OTRA tarjeta, sin marca, y Control contaba
     la venta dos veces. */
  await DB.poner('proyectos', propio('proy-M', 'COT-0670@TEST', 'V-670', { nombre: 'Mercería Luz - Letras' }));
  const f670 = fila('V-670', 'Mercería Luz - Letras', { 'Pago Pendiente': 6600 });
  H.filas.push(f670);
  await jalarTodo();
  eq('5h · atada a su fila por el nombre', (await DB.obtener('proyectos', 'proy-M')).hoja_confirmada, 'V-670');
  H.filas = H.filas.filter(x => x.id_notion !== 'V-670'); H.borradas.add('V-670');
  await cambio('proy-M', ['etapa']);
  await S.bombear();
  eq('5h · se borra y Dirección la vuelve a dar de alta', (await Proy.volverADarDeAlta('proy-M')).ok, true);
  await S.bombear();
  const n670 = (await DB.obtener('proyectos', 'proy-M')).notion_page_id;
  H.filas.push(fila(n670, 'Mercería Luz - Letras', { 'Folio cotizacion': 'COT-0670@TEST', 'Pago Pendiente': 6600 }));
  await jalarTodo();
  H.borradas.delete('V-670'); H.filas.push(f670);
  await jalarTodo();
  const m2 = await DB.obtener('proyectos', 'proy-M');
  eq('5h · la fila vieja vuelve: no entra como OTRA tarjeta, y la venta queda marcada en dos filas',
     [!!(await DB.obtener('proyectos', 'proy-hoja-V-670')), m2.notion_page_id, m2.hoja_doble && m2.hoja_doble.folios, Proy.avisoDeHoja(m2)],
     [false, n670, [n670, 'V-670'], 'doble']);
  eq('5h · y Control la cuenta una vez', V.unificar(await DB.listar('proyectos'), await DB.listar('ventas_hoja')).ventas
    .filter(x => /Mercería Luz/.test(x.nombre || '')).map(x => x.id), ['proy-M']);

  /* 5i · La venta que se ató por el nombre a una fila que después dice ser de OTRA cotización
     (PAGOS escribió ahí el folio de la venta de otro teléfono). La bajada ya no la ata, pero le
     quedaban `folio_hoja` y `hoja_confirmada`, y Control le echaba la venta del otro. */
  await DB.poner('proyectos', propio('proy-O', 'COT-0680@TEST', 'V-680', { nombre: 'Óptica Luna - Letras' }));
  H.filas.push(fila('V-680', 'Óptica Luna - Letras', { 'Pago Pendiente': 6600 }));
  await jalarTodo();
  const o1 = await DB.obtener('proyectos', 'proy-O');
  eq('5i · atada a su fila por el nombre', [o1.folio_hoja, o1.hoja_confirmada], ['V-680', 'V-680']);
  ponerFila('V-680', { 'Folio cotizacion': 'COT-0777@OTRO', 'Precio Subtotal': 40000, 'Precio Neto ': 46400, 'Anticipo': 20000, 'Pago Pendiente': 26400 });
  await jalarTodo();
  const o2 = await DB.obtener('proyectos', 'proy-O');
  eq('5i · la fila dice ser de otra cotización: la de aquí suelta sus notas de esa fila y queda «ya es de otra venta»',
     [o2.folio_hoja || null, o2.hoja_confirmada || null, o2.hoja_perdida && o2.hoja_perdida.motivo, Proy.avisoDeHoja(o2)], [null, null, 'de_otra', 'perdida']);
  eq('5i · y Control cuenta las dos ventas, cada una con su importe', V.unificar(await DB.listar('proyectos'), await DB.listar('ventas_hoja')).ventas
    .filter(x => /Óptica Luna/.test(x.nombre || '')).map(x => [x.id, x.neto]).sort(), [['proy-O', 11600], ['proy-hoja-V-680', 46400]]);

  /* 5j · «No se dio» sobre una venta marcada: la ficha deja de avisar (lápida), el «No se dio»
     también rebota, y lo apartado le decía a Dirección que la diera de alta —cosa que a una lápida
     no se le hace—. Su salida es dejarla fuera de la hoja, y si la fila vuelve, le llega el «No se dio». */
  await DB.poner('proyectos', propio('proy-N', 'COT-0710@TEST', 'V-710', { nombre: 'Nevería Sol - Letras' }));
  H.borradas.add('V-710');
  await cambio('proy-N', ['etapa']);
  await S.bombear();
  eq('5j · Dirección aprieta «No se dio» en la venta marcada', (await Proy.descartar('proy-N')).ok, true);
  await S.bombear();
  const apN = await deProyecto('proy-N');
  cierto('5j · el «No se dio» también rebota, y lo apartado ya no manda a darla de alta sino a dejarla fuera: ' + ((apN[1] || {}).ultimo_error || ''),
    apN.length === 2 && /Dirección la deja fuera de la hoja/.test(apN[1].ultimo_error) && !/vuelve a dar de alta/.test(apN[1].ultimo_error));
  const fN = await Proy.dejarFueraDeLaHoja('proy-N');
  eq('5j · «Dejarla fuera» le sirve a la lápida: lo apartado sale de Ajustes y se guarda',
     [fN.ok, (await deProyecto('proy-N')).length, !!(await DB.obtener('proyectos', 'proy-N')).sin_mandar], [true, 0, true]);
  H.borradas.delete('V-710'); H.filas.push(fila('V-710', 'Nevería Sol - Letras', { 'Folio cotizacion': 'COT-0710@TEST' }));
  const a710 = H.empujadas.length;
  await jalarTodo();
  await S.bombear();
  eq('5j · y si su fila vuelve, le llega el «No se dio»', aFila('V-710', a710).map(o => o.datos['Etapa de obra']), ['No se dio']);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
