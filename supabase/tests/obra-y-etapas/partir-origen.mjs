// Partir `origen` en obra y dinero (R1) — A.md §4.5, §5.14 y §10.16, casos PX-01..PX-04.
//
// `interno.partir_origen` recibe la copia congelada de la cotización CON todos sus precios y devuelve (obra, dinero):
//   obra   = lista blanca, la ven los tres roles (`proyectos.origen_obra`);
//   dinero = todo lo demás, solo Dirección y Pagos (`ventas_dinero.origen_dinero`).
// Un cliente que mande `origen` completo no puede filtrarlo: la base lo parte ella misma, y si la lista blanca tuviera un hueco
// (algo con precio que se cuela en la obra), ABORTA en vez de guardarlo.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, ORIGEN_COMPLETO } from '../comun/semilla.js';
import { sql } from '../arnes/arnes.mjs';

const base = dato(() => crearBaseDePruebas(), { limpiar: db => db.close() });
const partir = async origen => (await sql(await base(), `select (interno.partir_origen($1::jsonb)).obra as obra, (interno.partir_origen($1::jsonb)).dinero as dinero`, [JSON.stringify(origen)]))[0];

const PROHIBIDAS = ['tarifa', 'pu', '_lt', 'precioauth', 'neto', 'sub', 'anti', 'antimanual', 'itemsauth', 'huellaauth', 'sello', 'autorizador', 'fechaauth', 'nota', 'total', 'importe', 'precio', 'costo', 'subtotal', 'anticipo', 'liquidacion', 'comision', 'saldo'];
const claves = (v, acc = []) => { if (Array.isArray(v)) v.forEach(x => claves(x, acc)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.push(k); claves(x, acc); } return acc; };

describir('PX-01 una entrada completa', () => {
  prueba('la obra no trae NINGUNA clave de dinero a ningún nivel; las partidas conservan sus datos de taller', async () => {
    const { obra } = await partir(ORIGEN_COMPLETO);
    igual(claves(obra).filter(k => PROHIBIDAS.includes(k.toLowerCase())), []);
    igual(obra.items.map(i => i.id), [1, 2]);
    igual([obra.items[0].tipo, obra.items[0].altura, obra.items[0].n, obra.items[0].desc], ['caja', 30, 4, 'Caja de luz frontal']);
    igual([obra.proy, obra.cliente, obra.folio, obra.plazoK, obra.iva], ['Tacos Don Juan', 'Juan Pérez', 'COT-0001', 3, true]);
  });
  prueba('el dinero conserva precioAuth, itemsAuth, sello… y, por partida, _lt, pu y tarifa indexados por id', async () => {
    const { dinero } = await partir(ORIGEN_COMPLETO);
    igual([dinero.precioAuth, dinero.neto, dinero.sub, dinero.anti, dinero.itemsAuth, dinero.huellaAuth, dinero.autorizador], [6000, 6960, 6000, 3000, { 1: 1500 }, 'h1', 'dir@al3d.test']);
    igual(dinero.sello, { codigo: 'AAAA-BBBB-CCCC' });
    igual(dinero.items['1'], { _lt: 4200, pu: 1500, tarifa: 3900, opciones_fuera: { raiz: {}, d: [{ d: { pu: 1500, tarifa: 3900 }, precioOpcion: 1500 }, { d: { pu: 2100 } }] } },
          'lo que se quitó de la partida, y de sus opciones, queda en el dinero');
    igual(dinero.items['2'], { _lt: 1800, pu: 300, tarifa: 55 });
  });
  prueba('aiFile queda {name, type} (la url y los data URL van a Storage y no se guardan)', async () => {
    const { obra } = await partir({ ...ORIGEN_COMPLETO, aiFile: { name: 'a.png', type: 'image/png', url: 'https://x.invalid/a.png', dataUrl: 'data:image/png;base64,AAAA' } });
    igual(obra.aiFile, { name: 'a.png', type: 'image/png' });
  });
  prueba('las opciones llegan filtradas: solo activa y lista; cada opción solo k y d, y d con la misma lista blanca', async () => {
    const { obra } = await partir(ORIGEN_COMPLETO);
    const op = obra.items[0].opciones;
    igual(Object.keys(op).sort(), ['activa', 'lista']);
    igual(op.lista, [{ k: 'a', d: { id: 1, tipo: 'caja', altura: 30 } }, { k: 'b', d: { id: 1, tipo: 'caja', altura: 40 } }]);
  });
  prueba('lo que no está en la lista blanca de la raíz se va al dinero y NO se pierde (se puede reconstruir el origen completo)', async () => {
    const { obra, dinero } = await partir({ ...ORIGEN_COMPLETO, algoNuevo: { x: 1 }, reenviada: true });
    igual(dinero.algoNuevo, { x: 1 });
    igual(dinero.reenviada, true);
    cierto(!('algoNuevo' in obra));
    // toda clave del origen original está en la obra o en el dinero
    for (const k of Object.keys({ ...ORIGEN_COMPLETO, algoNuevo: 1, reenviada: 1 })) cierto(k in obra || k in dinero, k + ' se perdió');
  });
});

describir('PX-02 caja_forma la calcula el cliente: la base NO la deriva de la tarifa', () => {
  prueba('una partida con tarifa=3900 y SIN caja_forma: la obra queda sin tarifa y sin caja_forma (nulo)', async () => {
    const { obra, dinero } = await partir({ proy: 'X', items: [{ id: 1, tipo: 'caja', tarifa: 3900, altura: 30 }] });
    igual(obra.items[0], { id: 1, tipo: 'caja', altura: 30 });
    cierto(!('caja_forma' in obra.items[0]), 'no hay caja_forma');
    igual(dinero.items['1'], { tarifa: 3900 });
  });
  prueba('caja_forma se conserva solo si es un texto de ≤ 20 caracteres', async () => {
    const forma = async v => (await partir({ items: [{ id: 1, caja_forma: v }] })).obra.items[0];
    igual(await forma('std'), { id: 1, caja_forma: 'std' });
    igual(await forma('x'.repeat(20)), { id: 1, caja_forma: 'x'.repeat(20) });
    igual(await forma('x'.repeat(21)), { id: 1 }, '21 caracteres: se descarta');
    igual(await forma(3900), { id: 1 }, 'un número (¿una tarifa disfrazada?): se descarta');
    igual(await forma({ tarifa: 3900 }), { id: 1 }, 'un objeto: se descarta');
    igual(await forma(null), { id: 1 });
  });
});

describir('PX-03 idempotencia', () => {
  prueba('partir otra vez la parte de obra no la cambia (y no inventa dinero)', async () => {
    const { obra } = await partir(ORIGEN_COMPLETO);
    const otra = await partir(obra);
    igual(otra.obra, obra);
    igual(otra.dinero, {}, 'no queda nada que mover al dinero');
  });
});

describir('la postcondición: un hueco en la lista blanca ABORTA en vez de guardar un precio', () => {
  prueba('renders (que se copia entero) con una clave de dinero → P0001 «la lista blanca está incompleta»', async () => {
    await esperarError(partir({ proy: 'X', renders: [{ name: 'r.png', precio: 99 }], items: [] }), /lista blanca/);
    await esperarError(partir({ proy: 'X', propuesta: { primera: 1, total: 5 }, items: [] }), /lista blanca/);
  });
  prueba('un origen que no es un objeto → 22023; partidas que no son objeto se omiten; sin items, items = []', async () => {
    await esperarError(partir([1, 2]), '22023');
    await esperarError(partir('texto'), '22023');
    igual((await partir({ proy: 'X', items: [1, 'a', null, { id: 7 }] })).obra.items, [{ id: 7 }]);
    igual((await partir({ proy: 'X' })).obra.items, []);
  });
  prueba('una partida sin id va al dinero indexada por su posición («#n»)', async () => {
    const { dinero } = await partir({ items: [{ tipo: 'a', pu: 5 }] });
    igual(dinero.items['#1'], { pu: 5 });
  });
});

describir('los ayudantes solo_claves y sin_claves', () => {
  prueba('solo_claves se queda con las claves dadas; sin_claves las quita; ambos devuelven {} si no hay nada', async () => {
    const db = await base();
    const r = (await sql(db, `select interno.solo_claves('{"a":1,"b":2,"c":3}', array['a','c']) as s, interno.sin_claves('{"a":1,"b":2,"c":3}', array['a','c']) as n,
                                     interno.solo_claves('{}', array['a']) as v1, interno.sin_claves('{}', array['a']) as v2, interno.solo_claves('{"a":1}', array['z']) as v3`))[0];
    igual([r.s, r.n, r.v1, r.v2, r.v3], [{ a: 1, c: 3 }, { b: 2 }, {}, {}, {}]);
  });
});

await resumen();
