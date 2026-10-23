// Los precios del cotizador en la nube (0019, decidido por Elías el 2026-10-23): `tarifas_leer`, `tarifas_guardar` y `tarifas_de`.
//
// Las mismas reglas que /guardar_tarifas del Apps Script (pruebas/tarifas.mjs las prueba allá): solo Dirección guarda, todo o
// nada, nunca se borra, lo que cambió lleva fecha y correo, un grupo entero oculto vuelve a enseñar su primer renglón, y la tabla
// que sale siempre trae completo el catálogo de fábrica. Lo lee cualquier área; quien no es de la empresa no ve nada.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, conCopia, una, contar, como, sql } from '../comun/semilla.js';
import { volcado } from '../comun/hoja-de-mentiras.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { sqlDeImportacion } from '../../../scripts/importador/sql.mjs';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const confirmada = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });
const guardar = (db, quien, filas) => llamar(confirmada(db, quien), 'tarifas_guardar', { p_filas: filas });
const leer = (db, quien) => llamar(sesionDe(db, db.u[quien]), 'tarifas_leer', {});
const fila = (t, g, k) => t.filas.find(f => f.grupo === g && f.clave === k);
const PEDIDO = [
  { grupo: 'material', clave: 'al-paint', nombre: 'Aluminio Blanco/Negro/Pintado', precio: 34, visible: true },
  { grupo: 'material', clave: 'acero', nombre: 'Acero Inoxidable', precio: 55, visible: false },
  { grupo: 'material', clave: 'xanod1', nombre: 'Aluminio anodizado', precio: 38, como: 'al-paint', visible: true },
  { grupo: 'recorte-extra', clave: 'sandwich', nombre: 'Complejidad del sándwich', precio: 7, visible: true },
];

describir('TA-01 la tabla vacía es la de fábrica, y la lee quien es de la empresa', () => {
  prueba('las tres áreas leen los 16 renglones de fábrica; quien no es de la empresa, no', async () => {
    const db = await plantilla();
    for (const q of ['dir', 'fab', 'pag']) {
      const r = await leer(db, q);
      igual([r.ok, r.tabla.filas.length, fila(r.tabla, 'material', 'al-paint').precio, fila(r.tabla, 'caja', 'nube').precio], [true, 16, 30, 4600], q);
    }
    igual((await leer(db, 'ext')).codigo, 'SIN_ACCESO');
    igual((await leer(db, 'baja')).codigo, 'ACCESO_REVOCADO');
  });
  prueba('`tarifas_de` (la de la función autorizar) da la misma tabla, y authenticated no la puede llamar', async () => {
    const db = await plantilla();
    const s = (await como(db, { rol: 'service_role' }).rpc('tarifas_de', { p_empresa: 'al3d' }))[0].tarifas_de;
    igual(s.filas.length, 16);
    await esperarError(sesionDe(db, db.u.dir).rpc('tarifas_de', { p_empresa: 'al3d' }), /permission denied|42501/i, 'authenticated no ejecuta tarifas_de');
  });
});

describir('TA-02 guardar: solo Dirección, todo o nada, nunca borra', () => {
  prueba('Fabricación y Pagos no guardan', async () => conCopia(plantilla, async db => {
    for (const q of ['fab', 'pag']) igual((await guardar(db, q, PEDIDO)).codigo, 'ROL_SIN_PERMISO', q);
    igual(await contar(confirmada(db, 'dir'), 'tarifas'), 0);
  }));
  prueba('Dirección guarda: cuenta los cambios, firma con su correo, y lo que no vino se queda de fábrica', async () => conCopia(plantilla, async db => {
    const r = await guardar(db, 'dir', PEDIDO);
    igual([r.ok, r.cambios, r.tabla.filas.length], [true, 4, 17]);
    const a = fila(r.tabla, 'material', 'al-paint');
    igual([a.precio, a.por, a.fabrica, !!a.actualizado], [34, 'dir@al3d.test', true, true]);
    igual([fila(r.tabla, 'material', 'acero').visible, fila(r.tabla, 'material', 'xanod1').como, fila(r.tabla, 'material', 'xanod1').detalle],
          [false, 'al-paint', 'LED posterior (cálida/fría)']);
    igual(fila(r.tabla, 'material', 'al-brush').precio, 35, 'lo que no vino: el de fábrica');
    igual(r.tabla.por, 'dir@al3d.test');
    const b = await una(db, `select count(*)::int as n from public.bitacora where entidad = 'constante' and entidad_id = 'tarifas'`);
    igual(b.n, 1, 'queda en la bitácora');
    /* Guardar lo mismo otra vez no es un cambio. */
    igual((await guardar(db, 'dir', PEDIDO)).cambios, 0);
    /* Fabricación ya lee los precios nuevos. */
    igual(fila((await leer(db, 'fab')).tabla, 'material', 'al-paint').precio, 34);
  }));
  prueba('un renglón malo frena TODO el guardado, con su razón', async () => conCopia(plantilla, async db => {
    const malos = [
      [[{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 0 }], /precio/],
      [[{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 'treinta' }], /precio/],
      [[{ grupo: 'material', clave: 'al-paint', nombre: ' ', precio: 30 }], /nombre/],
      [[{ grupo: 'material', clave: 'Mi Material', nombre: 'X', precio: 30, como: 'al-paint' }], /clave/],
      [[{ grupo: 'material', clave: 'xnuevo', nombre: 'Nuevo', precio: 30 }], /fabrica/],
      [[{ grupo: 'complejidad', clave: 'xrara', nombre: 'Rara', precio: 3, como: 'recta' }], /no se agregan/],
      [[{ grupo: 'neon', clave: 'flex', nombre: 'Neón', precio: 30 }], /grupo/],
      [[PEDIDO[0], PEDIDO[0]], /dos veces/],
      [[PEDIDO[0], { grupo: 'material', clave: 'al-brush', nombre: 'Brush', precio: -1 }], /precio/],
    ];
    for (const [p, re] of malos) {
      const r = await guardar(db, 'dir', p);
      cierto(r.ok === false && r.codigo === 'DATO_INVALIDO' && re.test(r.mensaje), JSON.stringify(r));
    }
    igual(await contar(confirmada(db, 'dir'), 'tarifas'), 0, 'ni el renglón bueno del último pedido se escribió');
    igual((await guardar(db, 'dir', { no: 'es arreglo' })).codigo, 'DATO_INVALIDO');
  }));
  prueba('nadie borra un renglón: ni Dirección por la API ni el rol de servicio', async () => conCopia(plantilla, async db => {
    await guardar(db, 'dir', PEDIDO);
    await esperarError(confirmada(db, 'dir').query(`delete from public.tarifas where clave = 'xanod1'`), /permission denied|42501/i);
    await esperarError(como(db, { rol: 'service_role', confirmar: true }).query(`delete from public.tarifas where clave = 'xanod1'`), /permission denied|no se borran|42501/i);
    igual(await contar(confirmada(db, 'dir'), 'tarifas'), 4);
  }));
  prueba('ocultar un grupo entero deja el primero a la vista; ocultar uno solo, no toca los demás', async () => conCopia(plantilla, async db => {
    const todos = (await leer(db, 'dir')).tabla.filas.filter(f => f.grupo === 'bastidor').map(f => ({ ...f, visible: false }));
    const r = await guardar(db, 'dir', todos);
    igual(r.tabla.filas.filter(f => f.grupo === 'bastidor' && f.visible).map(f => f.clave), ['lamina']);
    const r2 = await guardar(db, 'dir', [{ grupo: 'material', clave: 'acero', nombre: 'Acero Inoxidable', precio: 55, visible: false }]);
    igual(r2.tabla.filas.filter(f => f.grupo === 'material' && f.visible).length, 4, 'con los otros cuatro de fábrica sin renglón, el acero se queda oculto');
  }));
});

describir('TA-03 la tabla cruza de empresa nunca', () => {
  prueba('Dirección de «otra» no ve ni cambia los precios de al3d', async () => conCopia(plantilla, async db => {
    await guardar(db, 'dir', PEDIDO);
    igual(await contar(sesionDe(db, db.u.otra), 'tarifas'), 0, 'por RLS no ve los renglones de al3d');
    const r = await guardar(db, 'otra', [{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 99 }]);
    igual(r.ok, true);
    igual(fila((await leer(db, 'dir')).tabla, 'material', 'al-paint').precio, 34, 'el de al3d no cambió');
  }));
});

describir('TA-04 la copia diaria trae la pestaña «Tarifas» de la hoja', () => {
  prueba('lo bueno entra, lo que no se entiende se avisa (sin frenar la copia) y la segunda vez no cambia nada', async () => conCopia(plantilla, async db => {
    const v = volcado({ ventas: [], tarifas: [
      ['material', 'al-paint', 'Aluminio Blanco/Negro/Pintado', 34, '', true, 0, 'LED posterior (cálida/fría)', '2026-10-23T18:00:00.000Z', 'dir@al3d.test'],
      ['material', 'xanod1', 'Aluminio anodizado', 38, 'al-paint', true, 5, 'LED posterior (cálida/fría)', '2026-10-23T18:00:00.000Z', 'dir@al3d.test'],
      ['material', 'acero', 'Acero Inoxidable', 55, '', false, 4, '', '', ''],
      ['material', 'xraro', 'Raro', 50, 'no-existe', true, 6, '', '', ''],
      ['bastidor', 'lamina', 'Lámina', 'mucho', '', true, 0, '', '', ''],
    ] });
    const plan = await planear({ volcado: v });
    igual(plan.reporte.rechazos, [], 'nada se rechaza: la copia de las ventas sigue');
    igual(plan.reporte.avisos.filter(a => a.donde === 'Tarifas').map(a => a.que), ['xraro', 'lamina']);
    const prim = await sql(db, sqlDeImportacion(plan));
    cierto(JSON.stringify(prim).includes('"tarifas"'), 'la primera copia sí anota las altas de tarifas');
    const t = (await leer(db, 'fab')).tabla;
    igual([fila(t, 'material', 'al-paint').precio, fila(t, 'material', 'xanod1').como, fila(t, 'material', 'acero').visible, fila(t, 'bastidor', 'lamina').precio, !!fila(t, 'material', 'xraro')],
          [34, 'al-paint', false, 950, false]);
    igual(fila(t, 'material', 'al-paint').por, 'dir@al3d.test');
    const otra = await sql(db, sqlDeImportacion(await planear({ volcado: v })));
    cierto(!JSON.stringify(otra).includes('"tarifas"'), 'la segunda copia no cambia ningún renglón de tarifas');
  }));
});

await resumen();
