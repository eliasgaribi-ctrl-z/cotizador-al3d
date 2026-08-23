/* Prueba de reglas.js. Corre en node porque `evaluar` es PURA: sin DOM, sin IndexedDB, sin
   red y con el «hoy» como parámetro. Eso es exactamente lo que permite probar «instalación
   mañana con material faltante» sin cambiarle la fecha al teléfono.
   Uso: node /tmp/probar-reglas.mjs                                                        */

import { evaluar, mensajeWa, REGLAS } from '../js/datos/reglas.js';

const HOY = '2026-08-23';
const dias = n => new Date(2026, 7, 23 - n, 10, 30, 0).getTime();   // n días antes de HOY, local

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};

/* ---- El estado inventado: los cuatro casos que pide el encargo ---- */

const p1 = {
  id: 'p1', folio_local: 'COT-0101', folio_global: 'COT-0101@D7K2',
  nombre: 'Tacos Don Beto - Local 3 (Letras)', contacto: 'Beto Ramírez', negocio: 'Tacos Don Beto',
  tel: '3312345678', etapa: 'listo', fecha_ganado: '2026-08-10',
  tipo_trabajo: ['Letras 3D con iluminacion'], pago_pendiente: 0,
  dir_texto: 'Av. Vallarta 1234\nCol. Americana, Guadalajara', maps_url: 'https://maps.google.com/?q=20.67,-103.36',
};
const p2 = {
  id: 'p2', folio_local: 'COT-0105', folio_global: 'COT-0105@D7K2',
  nombre: 'Refaccionaria El Tornillo - Sucursal Sur (Caja)', contacto: 'Lupita Ruiz',
  negocio: 'Refaccionaria El Tornillo', etapa: 'ganado', fecha_ganado: '2026-08-20',
  tipo_trabajo: ['Caja de luz con iluminacion'], pago_pendiente: 0,
};

const i1 = {
  id: 'i1', proyecto_id: 'p1', fecha: '2026-08-24', hora: '09:00', ventana: 'dia',
  duracion_min: 240, estado: 'confirmada', movida: 0, uid_ics: 'inst-i1@al3d.mx',
};

const estado = {
  hoy: HOY,
  rol: 'direccion',
  proyectos: [p1, p2],
  instalaciones: [i1],
  requerimientos: [
    { id: 'p1:acr-3mm', proyecto_id: 'p1', material_id: 'acr-3mm', estado: 'calculado' },
    { id: 'p2:gal-cal22', proyecto_id: 'p2', material_id: 'gal-cal22', estado: 'calculado' },
  ],
  faltantes: [
    { material_id: 'acr-3mm', nombre: 'Acrílico blanco 3 mm', comprar: 1, unidad_compra: 'lamina',
      confianza: 'exacta', motivo: 'proyecto', proveedor: 'Plásticos GDL', tel_proveedor: '3312345678',
      proyectos: [{ id: 'p1', nombre: p1.nombre, fecha: '2026-08-24' }] },
    { material_id: 'gal-cal22', nombre: 'Lámina galvanizada cal. 22', comprar: 0, unidad_compra: 'lamina',
      confianza: 'exacta', motivo: 'proyecto', proveedor: '', tel_proveedor: '',
      proyectos: [{ id: 'p2', nombre: p2.nombre, fecha: null }] },
  ],
  existencias: [
    { material_id: 'led-mod-6500', nombre: 'Módulo LED 6500K', cantidad: 0.5, min_stock: 2,
      min_compra: 1, unidad_compra: 'bolsa', derivado: true, proveedor: 'Iluminación MX',
      tel_proveedor: '3339998877', sello: 'derivado · nunca contado' },
    { material_id: 'acr-3mm', nombre: 'Acrílico blanco 3 mm', cantidad: 0.2, min_stock: 0,
      unidad_compra: 'lamina', derivado: false, sello: 'contado el 12 ago por Omar' },
  ],
  historial: [
    { folio: 'COT-0107', ts: dias(9), cliente: 'Farmacia La Paz', proy: 'Fachada',
      neto: 24500, precioAuth: 24500, iva: true,
      items: [{ id: 1, tipo: 'letras', material: 'acrilico', altura: 40, n: 8, luz: true }] },
  ],
  cola: [],
  avisos: [],
  calibracion: [],
  dias_sin_respaldo: 2,
};

/* ---- 1. Los cuatro avisos, en orden ---- */

console.log('\n— evaluar() con rol dirección —');
const r = evaluar(estado);
for (const a of r) {
  console.log('  [' + a.tono + '] ' + a.regla + '  peso ' + a.peso + '  plazo ' + a.plazo);
  console.log('         ' + a.titulo);
  console.log('         ' + a.detalle);
  console.log('         rid: ' + a.rid + '  ·  acciones: ' + a.acciones.map(x => x.label).join(' / '));
}

console.log('\n— comprobaciones —');
cierto(r.length === 4, 'salen exactamente 4 avisos (salieron ' + r.length + ')');

const esperado = ['A8_material', 'A6_sin_decidir', 'A7_sin_fecha', 'A9_minimo'];
const obtenido = r.map(a => a.regla);
cierto(JSON.stringify(obtenido) === JSON.stringify(esperado),
  'el orden es ' + esperado.join(' → ') + '\n         obtenido: ' + obtenido.join(' → '));

cierto(r[0].tono === 'urge' && r[0].plazo === 1,
  'el faltante de la instalación de mañana es «urge» y su plazo es 1 día');
cierto(r[0].rid === 'A8_material:p1:2026-08-24', 'el rid de A8 lleva proyecto y fecha: ' + r[0].rid);
cierto(r[1].rid === 'A6_sin_decidir:COT-0107', 'el rid de A6 lleva el folio: ' + r[1].rid);
cierto(/9 días/.test(r[1].titulo), 'A6 dice cuántos días lleva sin decidirse');
cierto(r[2].rid === 'A7_sin_fecha:p2', 'el rid de A7 lleva el proyecto: ' + r[2].rid);
cierto(r[3].rid === 'A9_minimo:led-mod-6500', 'el rid de A9 lleva el material: ' + r[3].rid);

/* ---- 2. Ningún dedupe_key repetido, y es el mismo rid ---- */

const llaves = r.map(a => a.dedupe_key);
cierto(new Set(llaves).size === llaves.length, 'ningún dedupe_key se repite');
cierto(r.every(a => a.dedupe_key === a.rid), 'dedupe_key y rid son la misma cadena');
cierto(r.every(a => a.roles.includes('direccion')), 'todos los avisos son de un rol que los ve');
cierto(r.every(a => a.acciones.length > 0), 'todo aviso trae al menos una acción que hacer');

/* ---- 3. Idempotencia: correr diez veces produce los mismos rids ---- */

const otra = evaluar(estado).map(a => a.rid).join('|');
const diez = Array.from({ length: 10 }, () => evaluar(estado).map(a => a.rid).join('|'));
cierto(diez.every(x => x === otra), 'correr diez veces produce exactamente los mismos avisos');

/* ---- 4. Lo atendido no resucita ---- */

const conAtendido = evaluar({
  ...estado,
  avisos: [{ rid: 'A6_sin_decidir:COT-0107', estado: 'atendido' },
           { rid: 'A9_minimo:led-mod-6500', estado: 'postergado', postergado_hasta: '2026-09-01' }],
});
cierto(conAtendido.length === 2 && !conAtendido.some(a => a.regla === 'A6_sin_decidir'),
  'un aviso atendido no vuelve, y uno postergado se calla hasta su día (quedaron ' + conAtendido.length + ')');

/* ---- 5. Fabricación no ve dinero ni ve lo que no es suyo ---- */

const fab = evaluar({ ...estado, rol: 'fabricacion' });
cierto(fab.map(a => a.regla).join(',') === 'A8_material,A9_minimo',
  'fabricación ve solo material y almacén: ' + fab.map(a => a.regla).join(', '));
cierto(!fab.some(a => /\$/.test(a.titulo + a.detalle)),
  'a fabricación no se le pinta ni un importe');
cierto(evaluar({ ...estado, rol: 'direccion' }).some(a => /\$/.test(a.detalle)),
  'a dirección sí se le pinta el importe de la cotización sin decidir');

/* ---- 6. El estado vacío no truena ---- */

cierto(evaluar({}).length === 0, 'un estado vacío devuelve [] y no lanza');
cierto(evaluar(null).length === 0, 'evaluar(null) devuelve [] y no lanza');
cierto(evaluar({ proyectos: [null, undefined], hoy: 'ayer' }).length === 0,
  'basura en la entrada devuelve [] y no lanza');

/* ---- 7. Los mensajes de WhatsApp ---- */

console.log('\n— mensajeWa(orden_instalador) —');
const orden = mensajeWa('orden_instalador', { proyecto: p1, instalacion: i1, tel: '3311112222' });
console.log(orden.texto.split('\n').map(l => '  | ' + l).join('\n'));
cierto(/Av. Vallarta 1234, Col. Americana/.test(orden.texto), 'la orden lleva la dirección en una línea');
cierto(/Mapa: https/.test(orden.texto), 'la orden lleva el link del mapa');
cierto(/Buscar a: Beto Ramírez · 3312345678/.test(orden.texto), 'la orden dice a quién buscar y su teléfono');
cierto(/09:00|9:00/.test(orden.texto), 'la orden lleva la hora');
cierto(!/\$/.test(orden.texto), 'la orden del instalador no lleva ni un peso');
cierto(orden.url.startsWith('https://wa.me/523311112222?text='), 'la url es de wa.me con lada 52');

const conf = mensajeWa('confirmar_cliente', { proyecto: p1, instalacion: i1 });
cierto(/Tacos Don Beto/.test(conf.texto) && /lun 24 ago 2026/.test(conf.texto),
  'el mensaje al cliente nombra el negocio y el día');
const sinHora = mensajeWa('confirmar_cliente', { proyecto: p1, instalacion: { ...i1, hora: null } });
cierto(/en el transcurso del día/.test(sinHora.texto),
  'sin hora, el mensaje al cliente no inventa una hora');
const pedir = mensajeWa('pedir_material',
  { proveedor: 'Plásticos GDL', tel: '3312345678', fecha: '2026-08-24', faltantes: estado.faltantes });
cierto(/1 lámina de Acrílico blanco 3 mm/.test(pedir.texto), 'el mensaje al proveedor dice cantidad y unidad');
const dia = mensajeWa('comparte_dia', { nombre: 'Omar', tel: '3300000000', instalaciones: [{ titulo: p1.nombre, hora: '09:00' }] });
cierto(/cómo va el día/.test(dia.texto) && /Tacos Don Beto/.test(dia.texto),
  'el mensaje a fabricación pide el avance y lista lo del día');
cierto(mensajeWa('lo_que_sea', {}).texto === '', 'una clase que no existe devuelve texto vacío, no un mensaje a medias');

console.log('\n— catálogo de reglas —');
console.log('  ' + Object.keys(REGLAS).join(' ') + '  (' + Object.keys(REGLAS).length + ' reglas de pantalla)');

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'todo pasó') + '\n');
process.exit(fallas ? 1 : 0);
