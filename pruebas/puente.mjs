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
         aNotion, deNotion, instalacionANotion, normalizarUrl, tokensNuevos,
         instrucciones, DS_VENTAS }
  from '../js/datos/puente.js';

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
  for (const k of [P.neto, P.pendiente, P.comisiones, P.comRestante, P.fechaCom,
                   P.liquidacion, P.abonoCom, P.fechaLiq]) {
    eq('no manda «' + k.trim() + '»', n[k], undefined);
  }
}

console.log('\nLAS DOS FECHAS, Y POR QUÉ SON DOS');
{
  const sinInst = aNotion(proy(), null);
  eq('sin instalación, la columna vieja lleva el día que se ganó',
     sinInst[P.fecha], '2026-08-23');
  eq('sin instalación no se inventa una fecha de instalación',
     sinInst[P.fechaInst], undefined);

  const conInst = aNotion(proy(), { fecha: '2026-09-01', hora: '10:00', estado: 'confirmada' });
  eq('con instalación, la nueva la lleva',      conInst[P.fechaInst], '2026-09-01');
  eq('y la vieja también, o su calendario se queda vacío', conInst[P.fecha], '2026-09-01');
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
  eq('una instalación con fecha manda las tres',
     instalacionANotion({ fecha: '2026-09-01', hora: '10:00' }),
     { 'Fecha instalacion': '2026-09-01', 'Fecha Anticipo e Instalacion': '2026-09-01', 'Hora instalacion': '10:00' });
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
  };
  const p = deNotion(fila);
  eq('trae el id de la página',   p.notion_page_id, 'pag-1');
  eq('el estatus baja',           p.estatus_notion, 'COBRANDO');
  eq('la cuenta baja',            p.cuenta, 'Rul HSBC');
  eq('el pago pendiente baja',    p.pago_pendiente, 7920);
  eq('la comisión restante baja', p.comision_restante, 1200);
  eq('queda marcado como enviado', p.notion_estado, 'enviado');

  /* Esto es lo que separa un espejo de una pelea por quién manda. De estos campos la dueña
     es la plataforma (§4.0) y no bajan aunque la fila los traiga. */
  for (const k of ['nombre', 'etapa', 'tipo_trabajo', 'dir_texto', 'sub', 'neto', 'lat', 'lng']) {
    eq('NO baja «' + k + '»: de ese la dueña es la plataforma', p[k], undefined);
  }

  eq('sin folio no hay nada que atar', deNotion({ id_notion: 'x', 'Estatus': 'COBRANDO' }), null);
  eq('null no revienta', deNotion(null), null);
  const raros = deNotion({ 'Folio cotizacion': 'COT-1@A', 'Estatus': 'INVENTADO', 'Cuenta ': 'Otra' });
  eq('un estatus que no existe no baja', raros.estatus_notion, undefined);
  eq('una cuenta que no existe no baja', raros.cuenta, undefined);
}

console.log('\nCOHERENCIA CON EL WORKER — la duplicación que sí se compara');
{
  const aqui = dirname(fileURLToPath(import.meta.url));
  const w = readFileSync(join(aqui, '..', 'puente', 'worker.js'), 'utf8');

  /** Saca un literal de arreglo del texto del Worker. Sin importarlo: es un módulo de
   *  Cloudflare y sus constantes no se exportan. */
  const arreglo = nombre => {
    const m = new RegExp('const ' + nombre + '\\s*=\\s*(\\[[^\\]]*\\])').exec(w);
    if (!m) return null;
    return Function('"use strict";return ' + m[1])();
  };
  const conjunto = nombre => {
    const m = new RegExp('const ' + nombre + '\\s*=\\s*new Set\\((\\[[^\\]]*\\])\\)').exec(w);
    if (!m) return null;
    return Function('"use strict";return ' + m[1])();
  };

  const etapasW = arreglo('ETAPAS');
  cierto('el Worker declara ETAPAS', etapasW);
  eq('las ocho etapas del Worker son las ocho del cliente, en el mismo orden',
     etapasW, Object.values(ETAPA_A_NOTION));

  const estatusW = conjunto('ESTATUS');
  eq('los cuatro estatus coinciden', estatusW, ESTATUS);

  const cuentasW = conjunto('CUENTAS');
  eq('las cinco cuentas coinciden', cuentasW, CUENTAS);

  const tiposW = arreglo('TIPOS');
  cierto('el Worker declara TIPOS', tiposW);
  eq('son siete', tiposW && tiposW.length, 7);

  /* Los nombres de propiedad, uno por uno, con el espacio final incluido. Es la clase de
     erratas que no se ve leyendo: `Precio Neto ` sin su espacio crea una columna nueva y
     vacía al lado de la que tiene tres años de datos. */
  for (const [clave, nombre] of Object.entries(P)) {
    if (['folio', 'etapa', 'fechaInst', 'horaInst', 'ubicacion', 'direccion', 'tipo'].includes(clave)) {
      cierto('el Worker conoce «' + nombre + '»', w.includes("'" + nombre + "'"));
    } else {
      cierto('P.' + clave + ' es «' + nombre + '» de los dos lados',
        new RegExp(clave + ":\\s*'" + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'").test(w));
    }
  }

  cierto('el data source por omisión es el mismo', w.includes(DS_VENTAS));
}

console.log('\nDETALLES QUE ROMPEN EN LA CALLE');
{
  eq('la URL pierde la barra final o se pediría //salud',
     normalizarUrl('https://puente-al3d.x.workers.dev/'), 'https://puente-al3d.x.workers.dev');
  eq('y los espacios de un pegado con dedo gordo',
     normalizarUrl('  https://x.workers.dev//  '), 'https://x.workers.dev');

  const t = tokensNuevos();
  eq('son tres roles', Object.keys(t.tokens), ['direccion', 'fabricacion', 'pagos']);
  const mapa = JSON.parse(t.json);
  eq('el JSON de TOKENS va del token al rol', Object.values(mapa).sort(),
     ['direccion', 'fabricacion', 'pagos']);
  eq('tres tokens distintos', new Set(Object.keys(mapa)).size, 3);

  const ins = instrucciones();
  cierto('los pasos nombran las cuatro variables del Worker',
    ['NOTION_TOKEN', 'TOKENS', 'DS_VENTAS', 'ORIGENES']
      .every(v => ins.pasos.some(p => p.includes(v))));

  eq('el relevo de hoy lleva la venta y su instalación, y nada más',
     ALMACENES, ['proyectos', 'instalaciones']);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
