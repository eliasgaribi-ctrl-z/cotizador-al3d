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

import { P, ETAPA_A_NOTION, ETAPA_DESDE_NOTION, ESTATUS, CUENTAS, ALMACENES,
         aNotion, deNotion, instalacionANotion, normalizarUrl, instrucciones,
         VERSION_ESPERADA, versionVieja, avisoVersion }
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
  cierto('las notas explican que la puerta es el token',
    ins.notas.some(n => /token/i.test(n) && /p(ú|u)blica|puerta/i.test(n)));

  eq('el relevo de hoy lleva la venta y su instalación, y nada más',
     ALMACENES, ['proyectos', 'instalaciones']);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
