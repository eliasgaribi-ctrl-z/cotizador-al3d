// UNA SALIDA POR CORTE, con la base mandando y Material ENCENDIDO (auditoría 2026-10-26, T1-7).
//
// Cortar una venta de antes del cambio descontaba el material DOS veces en el libro compartido. Al marcar «Cortado» el teléfono encola la
// etapa y su salida, `mov-salida:<requerimiento de ESTE teléfono>` (js/datos/proyectos.js, `emitirSalidas`). La base conoce esa venta con
// otro id (`proy-hoja-V-###`, el de la copia de la hoja), así que:
//   · la etapa llega a `mover_etapa`, que cruza el corte y emite SU salida, `mov-salida:proy-hoja-V-###:<material>` (0006);
//   · el renglón del teléfono llega a `almacen_aplicar` con el `requerimiento_id` ya traducido por el relevo (`conProyectoDeLaBase`), pero
//     con SU id de siempre, que no es el de la base: entraba como otro renglón. Dos salidas para un requerimiento.
// El arreglo es del lado del teléfono (js/datos/supa-relevo.js): el id de la salida también se traduce, y los dos renglones son el mismo
// —la base contesta «ya estaba»—. Es el diseño de siempre (la salida es idempotente por `mov-salida:<id del requerimiento>`), con el id
// del requerimiento que la base conoce.
//
// Se prueba con el teléfono de VERDAD (supabase/tests/comun/telefono.js): la bandeja lleva lo que el teléfono encoló al cortar, no
// operaciones armadas a mano. Y con Material encendido: con el interruptor puesto (hoy) el teléfono no emite nada y la base tampoco
// (material-en-mantenimiento.mjs, al lado); esto es lo que corre el día que se encienda. pruebas/comun/material-encendido.mjs lo enciende
// al cargar js/datos/agenda.js, sin tocar el archivo: por eso va primero y los módulos de la app se cargan con import() en el teléfono.
//
//   SC-01  la venta de antes del cambio: la lista de compra sube con el id de la base; cortar deja UNA salida, con el id de la base, y la
//          línea consumida; la bandeja queda vacía (el renglón del teléfono es «ya estaba», no un error)
//   SC-02  una venta nueva (la base la conoce con el id del teléfono): una salida, como siempre
//   SC-03  abrir «Qué atender» a un día de la instalación saca la derivada, una vez: lo mismo que con el interruptor puesto NO pasa (MM-03)
import '../../../pruebas/comun/material-encendido.mjs';
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, llamar, sesionDe, sql, una, crearVenta } from '../comun/semilla.js';
import { montarTelefono, relevoDe, requerimiento, materialDelCatalogo, bandeja } from '../comun/telefono.js';

const base = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'modo_cambiar', { p_modo: 'base' });
  return db;
}, { limpiar: db => db.close() });
/* La base ANTES que el teléfono: PGlite mira si hay `window` al arrancar (y en un navegador busca su wasm por la red), y el
   teléfono lo pone. */
await base();
const T = await montarTelefono({ rol: 'fabricacion' });
/* El catálogo del teléfono (lo trae la semilla la primera vez que abre): el libro solo mueve lo que está en él. */
await T.DB.poner('materiales', materialDelCatalogo());
await T.DB.poner('materiales', materialDelCatalogo({ id: 'led-mod-6500', nombre: 'Módulo LED 6500K', familia: 'led', unidad_consumo: 'pieza',
  unidad_compra: 'bolsa', medida: 'bolsa de 100', factor: 100, fraccionable: false }));

const salidasDe = (db, req) => sql(db, `select id, requerimiento_id, cantidad::float8 as cantidad from public.almacen_movimientos
                                         where tipo = 'salida' and requerimiento_id = $1 order by id`, [req]);

/* La lista de compra que el teléfono calculó y encoló, como js/datos/material.js (`recalcular`). */
async function calcularMaterial(p, material = 'acr-3mm', cantidad = 2, unidad = 'lamina') {
  const r = requerimiento({ id: p.id + ':' + material, proyecto_id: p.id, material_id: material, cantidad_compra: cantidad, unidad_compra: unidad });
  await T.DB.poner('requerimientos', r);
  await T.S.encolar({ tipo: 'crear', almacen: 'requerimientos', registro_id: r.id, datos: r, campos: null });
  return r;
}

describir('SC-01 cortar una venta de antes del cambio', () => {
  prueba('la lista de compra sube con el id de la base; cortar deja UNA salida, con el id de la base; la bandeja queda vacía', async () => {
    const db = await base();
    cierto(T.Agenda.MATERIAL_EN_MANTENIMIENTO === false, 'el gancho encendió Material para esta prueba');
    await crearVenta(db, { folio: 'V-120', id: 'proy-hoja-V-120', fuente: 'cotizacion', estatus: 'FABRICACION', etapa: 'ganado' });
    const fg = (await una(db, "select folio_global from public.proyectos where id = 'proy-hoja-V-120'")).folio_global;
    /* En el teléfono que la ganó, la venta tiene el id de ESE teléfono, su folio de cotización y el V-### que le dio la hoja. */
    const p = { id: 'proy-k7a1b2', folio_global: fg, folio_local: 'COT-0061', dispositivo: 'K7QM', notion_page_id: 'V-120',
                nombre: 'Ana - Tacos El Güero (Letras)', etapa: 'ganado', fecha_ganado: '2026-10-20', sellos: {}, sync: 0 };
    await T.DB.poner('proyectos', p);
    await calcularMaterial(p);
    const { c } = await relevoDe(db, 'fab', T);
    await T.S.bombear();
    igual((await sql(db, "select id, estado from public.requerimientos where proyecto_id = 'proy-hoja-V-120'")),
      [{ id: 'proy-hoja-V-120:acr-3mm', estado: 'calculado' }], 'la línea sube con el id que la base conoce');

    const r = await T.Proy.avanzarEtapa(p.id, 'cortado');
    igual([r.ok, r.valor.movimientos], [true, 1], 'con Material encendido, el teléfono saca su salida');
    igual(await bandeja(T), ['proyectos:actualizar:proy-k7a1b2', 'movimientos:apendice:mov-salida:proy-k7a1b2:acr-3mm',
      'requerimientos:actualizar:proy-k7a1b2:acr-3mm'], 'lo que el teléfono encoló al cortar');
    await T.S.bombear();

    igual(await salidasDe(db, 'proy-hoja-V-120:acr-3mm'),
      [{ id: 'mov-salida:proy-hoja-V-120:acr-3mm', requerimiento_id: 'proy-hoja-V-120:acr-3mm', cantidad: -2 }], 'UNA salida, con el id de la base');
    igual((await una(db, "select count(*)::int as n from public.almacen_movimientos where tipo = 'salida'")).n, 1, 'y ninguna otra en el libro');
    igual(await una(db, "select p.etapa, q.estado from public.proyectos p join public.requerimientos q on q.proyecto_id = p.id where p.id = 'proy-hoja-V-120'"),
      { etapa: 'cortado', estado: 'consumido' });
    igual(await bandeja(T), [], 'la bandeja queda vacía: el renglón del teléfono es «ya estaba», no un error');
    cierto(c.llamadas.includes('mover_etapa') && c.llamadas.includes('almacen_aplicar'), JSON.stringify(c.llamadas));
  });
});

describir('SC-02 una venta nueva', () => {
  prueba('la base la conoce con el id del teléfono: una salida, como siempre', async () => {
    const db = await base();
    /* Ganada después del cambio: entra a la base con el id de este teléfono (ganar_proyecto, RE-01). */
    const p = { id: 'proy-n3w001', folio_global: 'COT-0070@K7QM', folio_local: 'COT-0070', dispositivo: 'K7QM', nombre: 'Luis - Óptica Sol (Caja)',
                contacto: 'Luis', negocio: 'Óptica Sol', etapa: 'ganado', fecha_ganado: '2026-10-25', sub: 8000, anti_pactado: 4640, iva: true,
                sellos: {}, sync: 0, notion_page_id: null };
    await T.DB.poner('proyectos', p);
    const d = await relevoDe(db, 'dir', T);
    await T.S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: p.id, datos: p, campos: null });
    await calcularMaterial(p, 'led-mod-6500', 3, 'bolsa');
    await T.S.bombear();
    await relevoDe(db, 'fab', T);
    const r = await T.Proy.avanzarEtapa(p.id, 'cortado');
    igual([r.ok, r.valor.movimientos], [true, 1]);
    await T.S.bombear();
    igual(await salidasDe(db, 'proy-n3w001:led-mod-6500'),
      [{ id: 'mov-salida:proy-n3w001:led-mod-6500', requerimiento_id: 'proy-n3w001:led-mod-6500', cantidad: -3 }]);
    igual(await bandeja(T), []);
    cierto(d.c.llamadas.includes('ganar_proyecto'));
  });
});

describir('SC-03 abrir «Qué atender» a un día de la instalación', () => {
  prueba('con Material encendido sale la derivada, una vez (la contraprueba de MM-03 en material-en-mantenimiento.mjs)', async () => {
    const db = await base();
    const hoy = (() => { const d = new Date(), p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
    const [a, m, d] = hoy.split('-').map(Number);
    const x = new Date(a, m - 1, d + 1), q = v => String(v).padStart(2, '0');
    const manana = x.getFullYear() + '-' + q(x.getMonth() + 1) + '-' + q(x.getDate());
    T.guardado.al3d_pf_rol = 'direccion';
    await relevoDe(db, 'dir', T);
    const p = { id: 'proy-sc03', folio_global: 'COT-0080@K7QM', folio_local: 'COT-0080', dispositivo: 'K7QM', nombre: 'Rosa - Pastelería Nube (Letras)',
                contacto: 'Rosa', negocio: 'Pastelería Nube', etapa: 'ganado', fecha_ganado: '2026-10-25', sub: 9000, anti_pactado: 5220, iva: true,
                sellos: {}, sync: 0, notion_page_id: null };
    await T.DB.poner('proyectos', p);
    await T.S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: p.id, datos: p, campos: null });
    await calcularMaterial(p, 'acr-3mm', 1);
    cierto((await T.Agenda.agendar(p.id, { fecha: manana, hora: '09:00' })).ok);
    await T.S.bombear();
    T.guardado.al3d_pf_rol = 'fabricacion';
    await relevoDe(db, 'fab', T);
    await T.Reglas.refrescar({ hoy });
    cierto((await bandeja(T)).includes('movimientos:apendice:mov-salida:proy-sc03:acr-3mm'), JSON.stringify(await bandeja(T)));
    await T.Reglas.refrescar({ hoy });
    await T.S.bombear();
    igual(await sql(db, "select id, origen from public.almacen_movimientos where proyecto_id = 'proy-sc03' and tipo = 'salida'"),
      [{ id: 'mov-salida:proy-sc03:acr-3mm', origen: 'derivado' }], 'una, aunque «Qué atender» se abrió dos veces');
  });
});

await resumen();
