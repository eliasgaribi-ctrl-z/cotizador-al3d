// La matriz de permisos contra el comportamiento — A.md §5.1 y §10.3, caso RL-20.
//
// `interno.matriz_permisos()` es la FUENTE ÚNICA de «quién puede escribir qué»: las RPC la consultan y `mi_acceso()` entrega al cliente la de su área como
// `permisos`. Esta prueba compara la tabla con lo que PASA de verdad: para cada (área, campo) se intenta `proyecto_actualizar` o `corregir_venta` y lo
// permitido/rechazado tiene que coincidir con la matriz, sin excepciones; lo mismo para las altas (`alta`), para lo que cada área ve (`ve_dinero`) y para
// lo que `mi_acceso()` le dice al teléfono.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, llamar, una, sql } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });
const AREAS = [['direccion', 'dir'], ['fabricacion', 'fab'], ['pagos', 'pag']];
const AHORA = () => Date.now();
const matriz = async db => (await una(db, `select interno.matriz_permisos() as m`)).m;

/** Un valor VÁLIDO para cada propiedad de proyecto_actualizar (el permiso se prueba sin que la validación estorbe). */
const VALOR_PA = {
  notas: 'nota', tel: '33 1111 2222', dir_texto: 'Calle 9', lat: 20.5, lng: -103.5, maps_url: 'https://maps.app.goo.gl/x', geo_fuente: 'maps_pin', entrega: 'paqueteria', plazo_k: 3, entrecalles: 'A y B',
  ubicacion_pendiente: true, contacto: 'Ana', negocio: 'Taller', tipo_trabajo: ['Rotulacion de vinil'], compromiso_texto: 'para el viernes', fecha_anticipo: '2026-10-01', origen: { items: [{ id: 1, tipo: 'caja' }] },
};
const VALOR_CV = { nombre: 'Nombre nuevo', subtotal: 1234.5, anticipo: 100, liquidacion: 0, cuenta: 'Elias BBVA', estatus: 'COBRANDO', fecha_liquidacion: '2026-10-01', pct_comision: 10, iva: true };
const SELLOS = () => ({ notas: AHORA(), tel: AHORA(), dir_texto: AHORA(), ubicacion: AHORA(), entrega: AHORA(), plazo_k: AHORA() });

/** La matriz tal como la fija el diseño (A.md §5.1). Las pruebas de abajo comparan COMPORTAMIENTO contra la tabla; esta fija la TABLA, para que un cambio de permisos sea un cambio visible aquí. */
const ETAPAS_TODAS = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo', 'instalado', 'garantia', 'cancelado'];
const MATRIZ_DEL_DISENO = {
  direccion: {
    proyecto_actualizar: ['notas', 'tel', 'dir_texto', 'lat', 'lng', 'maps_url', 'geo_fuente', 'entrega', 'plazo_k', 'entrecalles', 'ubicacion_pendiente', 'contacto', 'negocio', 'tipo_trabajo', 'compromiso_texto', 'fecha_anticipo', 'origen'],
    corregir_venta: ['nombre', 'subtotal', 'anticipo', 'liquidacion', 'cuenta', 'estatus', 'fecha_liquidacion', 'pct_comision', 'iva'],
    etapas: { origen: ETAPAS_TODAS, destino: ETAPAS_TODAS }, instalacion: 'confirmada', alta: { ganar_proyecto: true, descartar_cotizacion: true, alta_venta: true }, ve_dinero: true,
  },
  fabricacion: {
    proyecto_actualizar: ['notas', 'tel', 'dir_texto', 'lat', 'lng', 'maps_url', 'geo_fuente', 'entrega', 'plazo_k', 'entrecalles', 'ubicacion_pendiente'],
    corregir_venta: [], etapas: { origen: ETAPAS_TODAS.slice(0, 5), destino: ETAPAS_TODAS.slice(0, 5) }, instalacion: 'propuesta', alta: { ganar_proyecto: false, descartar_cotizacion: false, alta_venta: false }, ve_dinero: false,
  },
  pagos: {
    proyecto_actualizar: ['notas', 'tel'], corregir_venta: ['nombre', 'subtotal', 'anticipo', 'liquidacion', 'cuenta', 'estatus', 'fecha_liquidacion', 'pct_comision'],
    etapas: { origen: [], destino: [] }, instalacion: null, alta: { ganar_proyecto: false, descartar_cotizacion: false, alta_venta: true }, ve_dinero: true,
  },
};

describir('RL-20 la tabla misma', () => {
  prueba('RL-20 interno.matriz_permisos() es EXACTAMENTE la del diseño (A.md §5.1): Dirección todo; Fabricación solo obra y el rango ganado…listo; Pagos solo notas, teléfono y las correcciones de venta sin IVA; Pagos no mueve etapas ni agenda', async () => {
    const db = await plantilla();
    igual(await matriz(db), MATRIZ_DEL_DISENO);
  });
});

describir('RL-20 proyecto_actualizar: cada propiedad, por área, coincide con la matriz', () => {
  for (const [area, quien] of AREAS) {
    prueba(`RL-20 (${area}) las ${Object.keys(VALOR_PA).length} propiedades de proyecto_actualizar: las de la matriz se procesan (nunca «rechazadas por rol») y las demás se rechazan con el nombre de la propiedad`, async () => {
      const db = await plantilla(), m = await matriz(db), permitidas = m[area].proyecto_actualizar;
      for (const [campo, valor] of Object.entries(VALOR_PA)) {
        const campos = campo === 'lat' || campo === 'lng' ? { lat: VALOR_PA.lat, lng: VALOR_PA.lng } : { [campo]: valor };
        const r = await llamar(sesionDe(db, db.u[quien]), 'proyecto_actualizar', { p_op: { id: 'p2', campos, sellos: SELLOS() } });
        igual([campo, r.ok], [campo, true]);
        const porRol = r.rechazadas.filter(x => /el rol/.test(x.por)).map(x => x.nombre);
        const esperada = permitidas.includes(campo);
        igual([area, campo, porRol.includes(campo)], [area, campo, !esperada], esperada ? 'está en la matriz y se rechazó por rol' : 'NO está en la matriz y se aceptó');
        if (esperada) igual([area, campo, r.rechazadas.length], [area, campo, 0], 'con un valor válido y un sello nuevo no hay ningún rechazo');
        if (esperada) cierto(r.escritos.length + r.viejos.length > 0, `${campo}: se procesó`);
      }
      // la unión de lo que cada área puede: ninguna propiedad se quedó sin probar
      const universo = [...new Set(Object.values(m).flatMap(a => a.proyecto_actualizar))].sort();
      igual(Object.keys(VALOR_PA).sort(), universo, 'la prueba cubre TODAS las propiedades de la matriz');
    });
  }
});

describir('RL-20 corregir_venta: cada campo, por área, coincide con la matriz', () => {
  for (const [area, quien] of AREAS) {
    prueba(`RL-20 (${area}) los ${Object.keys(VALOR_CV).length} campos de corregir_venta: ${area === 'fabricacion' ? 'ROL_SIN_PERMISO en todos (la matriz es vacía)' : 'permitido o «rechazada» según la matriz'}`, async () => {
      const db = await plantilla(), m = await matriz(db), permitidos = m[area].corregir_venta;
      for (const [campo, valor] of Object.entries(VALOR_CV)) {
        const proyecto = campo === 'iva' ? 'p6' : 'p1';      // el IVA solo se cambia si la venta QUEDA liquidada o sin cuenta: p6 lo está
        const r = await llamar(sesionDe(db, db.u[quien]), 'corregir_venta', { p_proyecto: proyecto, p_cambios: { [campo]: valor } });
        if (area === 'fabricacion') { igual([campo, r.ok, r.codigo], [campo, false, 'ROL_SIN_PERMISO']); continue; }
        igual([campo, r.ok], [campo, true]);
        const rechazada = (r.rechazadas ?? []).find(x => x.nombre === campo);
        igual([area, campo, rechazada === undefined], [area, campo, permitidos.includes(campo)], rechazada ? 'rechazada: ' + rechazada.por : 'aceptada pero no está en la matriz');
      }
      igual(m.fabricacion.corregir_venta, [], 'Fabricación no corrige ventas');
      igual(Object.keys(VALOR_CV).sort(), [...new Set(Object.values(m).flatMap(a => a.corregir_venta))].sort(), 'la prueba cubre TODOS los campos de la matriz');
    });
  }
});

describir('RL-20 las altas, lo que se ve y lo que le dice mi_acceso() al teléfono', () => {
  prueba('RL-20 alta: ganar_proyecto, descartar_cotizacion y alta_venta con una operación vacía dan ROL_SIN_PERMISO exactamente a quien la matriz dice que no; a los demás los frena su validación (DATO_INVALIDO)', async () => {
    const db = await plantilla(), m = await matriz(db);
    for (const [area, quien] of AREAS) {
      for (const rpc of ['ganar_proyecto', 'descartar_cotizacion', 'alta_venta']) {
        const r = await llamar(sesionDe(db, db.u[quien]), rpc, { p_op: {} });
        const puede = m[area].alta[rpc];
        igual([area, rpc, r.codigo], [area, rpc, puede ? 'DATO_INVALIDO' : 'ROL_SIN_PERMISO']);
      }
    }
  });
  prueba('RL-20 ve_dinero: quien la matriz dice que ve dinero recibe filas de ventas_dinero y de la vista; quien no, cero', async () => {
    const db = await plantilla(), m = await matriz(db);
    for (const [area, quien] of AREAS) {
      const n = (await sesionDe(db, db.u[quien]).query(`select (select count(*)::int from public.ventas_dinero) as a, (select count(*)::int from public.ventas_calculadas) as b, (select count(*)::int from public.abonos) as c`))[0];
      igual([area, n.a > 0, n.b > 0, n.c > 0], [area, m[area].ve_dinero, m[area].ve_dinero, m[area].ve_dinero]);
    }
  });
  prueba('RL-20 la cita: la que crea cada área (confirmada, propuesta o ninguna) coincide con la matriz', async () => {
    const db = await plantilla(), m = await matriz(db);
    for (const [area, quien] of AREAS) {
      const x = await sesionDe(db, db.u[quien]).transaccion(async t => {
        const r = (await t.rpc('instalacion_guardar', { p_op: { id: 'cita-' + area, proyecto_id: 'p2', fecha: '2026-11-05', hora: '10:00', ventana: 'dia', duracion_min: 120, sello: AHORA() } }))[0].instalacion_guardar;
        return { r, estado: (await t.query(`select estado from public.instalaciones where id = $1`, ['cita-' + area]))[0]?.estado ?? null };
      });
      if (m[area].instalacion === null) igual([area, x.r.ok, x.r.codigo, x.estado], [area, false, 'ROL_SIN_PERMISO', null]);
      else igual([area, x.r.ok, x.estado], [area, true, m[area].instalacion]);
    }
  });
  prueba('RL-20 mi_acceso().permisos es EXACTAMENTE la fila de la matriz de su área (lo que el teléfono pinta es lo que la base impone)', async () => {
    const db = await plantilla(), m = await matriz(db);
    for (const [area, quien] of AREAS) {
      const a = await llamar(sesionDe(db, db.u[quien]), 'mi_acceso', {});
      igual([area, a.estado, a.empresas.find(e => e.empresa_id === 'al3d').area], [area, 'activo', area]);
      igual(a.permisos, m[area], area);
    }
    const sinAcceso = await llamar(sesionDe(db, db.u.ext), 'mi_acceso', {});
    igual(sinAcceso.permisos ?? null, null, 'sin acceso no recibe matriz');
  });
});

await resumen();
