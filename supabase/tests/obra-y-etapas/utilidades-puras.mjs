// Utilidades PURAS de la fundación (0001) — las que las RPC de obra comparten y que se prueban sin tablas:
//   · la compuerta de sellos (`interno.compuerta`, `interno.sello_valido`): SE-21, SE-22 y los valores de SE-17;
//   · `telefono_limpio` (SE-12), `sellos_validos`, `contiene_dinero` (PX-04), `orden_etapa`, `folio_texto`, `ahora_ms`.
//
// Se llaman como superusuario: las `interno.*` no las ejecuta ningún otro rol (salvo las que usan políticas/CHECK, que
// la auditoría de auditoria/ comprueba). Todas son `immutable` o `stable`: no leen ni escriben tablas.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas } from '../comun/semilla.js';
import { sql } from '../arnes/arnes.mjs';

const base = dato(() => crearBaseDePruebas(), { limpiar: db => db.close() });
const uno = async (consulta, params) => { const f = await sql(await base(), consulta, params); return f[0]; };
const valor = async (expresion, params) => (await uno(`select ${expresion} as v`, params)).v;

describir('SE-21 interno.compuerta: la tabla de verdad de §5.4, las 32 combinaciones', () => {
  // el reglamento, escrito aparte de la implementación: (1) un sello MÁS NUEVO ya guardado gana (el empate NO);
  // (2) vaciar sin sello no borra; (3) etapa y entrega jamás se vacían; (4) el sello guardado solo sube.
  const esperado = ({ tiene, llega, vacio, borrable }) => {
    if (tiene > 0 && llega < tiene) return ['viejo', tiene];
    if (vacio && llega === 0) return ['rechazar', tiene];
    if (vacio && !borrable) return ['rechazar', tiene];
    return ['escribir', Math.max(tiene, llega)];
  };
  prueba('todas las combinaciones de tiene ∈ {0, 100}, llega ∈ {0, 50, 100, 200}, vacío y borrable', async () => {
    const ahora = 1_760_000_000_000;
    let n = 0;
    for (const tiene of [0, 100]) for (const llega of [0, 50, 100, 200]) for (const vacio of [false, true]) for (const borrable of [false, true]) {
      const r = await uno(`select * from interno.compuerta($1::bigint, $2::jsonb, 'notas', $3::bigint, $4, $5)`,
                          [tiene, JSON.stringify(llega === 0 ? { otra: 5 } : { notas: llega }), ahora, vacio, borrable]);
      const [accion, sello] = esperado({ tiene, llega, vacio, borrable });
      igual([r.accion, Number(r.sello_nuevo)], [accion, sello], JSON.stringify({ tiene, llega, vacio, borrable }));
      n++;
    }
    igual(n, 32);
  });
  prueba('los tres motivos (cuando no se escribe) son los del .gs', async () => {
    const m = async (tiene, op, vacio, borrable) => (await uno(`select motivo from interno.compuerta($1::bigint, $2::jsonb, 'etapa', 1760000000000, $3, $4)`, [tiene, JSON.stringify(op), vacio, borrable])).motivo;
    igual(await m(100, { etapa: 50 }, false, true), 'ya tenía un cambio más reciente');
    igual(await m(0, {}, true, true), 'vacío sin sello no borra');
    igual(await m(0, { etapa: 300 }, true, false), 'este dato no se puede vaciar');
    igual(await m(0, { etapa: 300 }, false, false), null, 'cuando escribe no hay motivo');
  });
  prueba('el empate ESCRIBE (la comparación es estricta, como en el .gs) y el sello no baja', async () => {
    const r = await uno(`select * from interno.compuerta(100, '{"notas": 100}', 'notas', 1760000000000, false, true)`);
    igual([r.accion, Number(r.sello_nuevo)], ['escribir', 100]);
  });
  prueba('un valor no vacío con llega=0 y tiene=0 escribe y NO crea sello (SE-15)', async () => {
    const r = await uno(`select * from interno.compuerta(null, '{"notas": 0}', 'notas', 1760000000000, false, true)`);
    igual([r.accion, Number(r.sello_nuevo)], ['escribir', 0]);
  });
  prueba('con tiene>0 y llega=0 (clave ausente) es viejo (SE-16)', async () => {
    const r = await uno(`select * from interno.compuerta(100, '{"tel": 5}', 'notas', 1760000000000, false, true)`);
    igual(r.accion, 'viejo');
  });
});

describir('SE-22 y SE-17 interno.sello_valido', () => {
  const AHORA = 1_760_000_000_000;
  const sv = async x => Number(await valor(`interno.sello_valido($1::jsonb, ${AHORA}::bigint)`, [x === undefined ? null : JSON.stringify(x)]));
  prueba('null, {}, [], true, «NaN», «Infinity», «-1», «abc», -5 y 0 → 0', async () => {
    for (const x of [undefined, null, {}, [], true, 'NaN', 'Infinity', '-Infinity', '-1', 'abc', '', -5, 0, '0']) igual(await sv(x), 0, JSON.stringify(x));
  });
  prueba('«250», 250 y 250.9 → 250 (floor); un texto numérico cuenta como número', async () => {
    for (const x of ['250', 250, 250.9, '250.9']) igual(await sv(x), 250, JSON.stringify(x));
  });
  prueba('se acota a ahora + 10 min: ahora + 1 h → ahora + 600 000; ahora + 9 min se respeta', async () => {
    igual(await sv(AHORA + 3_600_000), AHORA + 600_000);
    igual(await sv(AHORA + 540_000), AHORA + 540_000);
    igual(await sv(AHORA), AHORA);
  });
});

describir('SE-12 interno.telefono_limpio (réplica de telefonoLimpio del Apps Script)', () => {
  const tl = t => valor(`interno.telefono_limpio($1)`, [t]);
  prueba('«abc» → inválido (NULL); vacío → vacío (borrar); NULL → NULL', async () => {
    igual(await tl('abc'), null);
    igual(await tl(''), '');
    igual(await tl('   '), '');
    igual(await tl(null), null);
  });
  prueba('«33 1234 5678» y «+52 (33) 1234-5678» pasan tal cual', async () => {
    igual(await tl('33 1234 5678'), '33 1234 5678');
    igual(await tl('+52 (33) 1234-5678'), '+52 (33) 1234-5678');
  });
  prueba('lo que no es dígito, espacio, + ( ) o - se vuelve espacio, se colapsa y se recorta; con al menos un dígito', async () => {
    igual(await tl('tel: 33.1234.5678 ext 9'), '33 1234 5678 9');
    igual(await tl('  33--12  '), '33--12');
    igual(await tl('((('), null, 'sin dígitos no es un teléfono');
  });
  prueba('40 caracteres se recortan a 30', async () => {
    const largo = '3'.repeat(40);
    igual((await tl(largo)).length, 30);
  });
});

describir('sellos_validos (el CHECK de proyectos.sellos)', () => {
  const sv = j => valor(`interno.sellos_validos($1::jsonb)`, [JSON.stringify(j)]);
  prueba('un objeto con claves de los 8 grupos y enteros >= 0 es válido; el objeto vacío también', async () => {
    igual(await sv({}), true);
    igual(await sv({ etapa: 1, notas: 0, plazo_k: 5, tel: 9, dir_texto: 10, ubicacion: 11, entrega: 12, instalacion: 1_760_000_000_000 }), true);
  });
  prueba('clave desconocida, negativo, fracción, texto o algo que no es objeto → inválido', async () => {
    for (const j of [{ otra: 1 }, { etapa: -1 }, { etapa: 1.5 }, { etapa: '5' }, { etapa: null }, [], 'x', 5, null]) igual(await sv(j), false, JSON.stringify(j));
  });
});

describir('PX-04 contiene_dinero (el doble candado de proyectos.origen_obra)', () => {
  const cd = j => valor(`interno.contiene_dinero($1::jsonb)`, [JSON.stringify(j)]);
  prueba('detecta cada clave de dinero a cualquier nivel, en objetos y en arreglos, sin importar mayúsculas', async () => {
    const claves = ['tarifa', 'pu', '_lt', 'precioAuth', 'neto', 'sub', 'anti', 'antiManual', 'itemsAuth', 'huellaAuth', 'sello', 'autorizador',
                    'fechaAuth', 'nota', 'total', 'importe', 'precio', 'costo', 'subtotal', 'anticipo', 'liquidacion', 'comision', 'saldo'];
    for (const k of claves) {
      igual(await cd({ [k]: 1 }), true, k);
      igual(await cd({ items: [{ id: 1, opciones: { lista: [{ d: { [k.toUpperCase()]: 1 } }] } }] }), true, 'anidada ' + k);
    }
  });
  prueba('una entrada de obra sin precios no se marca', async () => {
    igual(await cd({ folio: 'COT-1', proy: 'Tacos', items: [{ id: 1, tipo: 'caja', altura: 30, n: 2, desc: 'Letras' }], aiFile: { name: 'a.png', type: 'image/png' } }), false);
    igual(await cd({}), false);
    igual(await cd([]), false);
    igual(await cd({ x: null, y: [1, 'a', null] }), false);
  });
});

describir('orden_etapa, folio_texto y ahora_ms', () => {
  prueba('las seis etapas de taller tienen orden 0..5; garantía, cancelado y lo desconocido, NULL', async () => {
    const o = e => valor(`interno.orden_etapa($1)`, [e]);
    igual([await o('ganado'), await o('en_diseno'), await o('cortado'), await o('armado'), await o('listo'), await o('instalado')], [0, 1, 2, 3, 4, 5]);
    igual([await o('garantia'), await o('cancelado'), await o('xyz'), await o(null)], [null, null, null, null]);
  });
  prueba('folio_texto no trunca: V-001, V-999, V-1000, V-123456 (lpad solo trunca)', async () => {
    const f = (p, n) => valor(`interno.folio_texto($1, $2::bigint)`, [p, n]);
    igual([await f('V', 1), await f('V', 999), await f('V', 1000), await f('P', 12), await f('V', 123456)], ['V-001', 'V-999', 'V-1000', 'P-012', 'V-123456']);
  });
  prueba('ahora_ms está en milisegundos de epoch (13 dígitos) y avanza', async () => {
    const a = Number(await valor(`interno.ahora_ms()`)), b = Number(await valor(`interno.ahora_ms()`));
    cierto(String(a).length === 13 && b >= a, 'ahora_ms = ' + a);
    cierto(Math.abs(a - Date.now()) < 60_000, 'cerca del reloj de node');
  });
});

await resumen();
