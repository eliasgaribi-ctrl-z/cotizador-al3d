/* Prueba de reglas.js. Corre en node porque `evaluar` es PURA: sin DOM, sin IndexedDB, sin
   red y con el «hoy» como parámetro. Eso es exactamente lo que permite probar «instalación
   mañana con material faltante» sin cambiarle la fecha al teléfono.
   Uso: node /tmp/probar-reglas.mjs                                                        */

import { evaluar, mensajeWa, REGLAS } from '../js/datos/reglas.js';
import { huellaDe } from '../js/datos/cotizador.js';

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

/* ---- 6b. A11: la venta que ya está en la hoja no se vuelve a copiar ----
   El incidente: el aviso solo sale con `pago_pendiente`, que es la fórmula de la hoja y solo
   existe cuando la fila ya está allá; aun así decía «Copia los datos para la hoja» y abría el
   botón que los pega en el primer renglón vacío. Seguirlo daba de alta la venta dos veces. */

const instalado = (o = {}) => ({ id: 'p9', folio_local: 'COT-0109', nombre: 'Óptica Lux - Caja',
  etapa: 'instalado', fecha_ganado: '2026-08-01', pago_pendiente: 6600, ...o });
const conCobro = p => evaluar({ ...estado, proyectos: [p],
  instalaciones: [{ id: 'i9', proyecto_id: p.id, fecha: '2026-08-15', estado: 'hecha' }] })
  .find(a => a.regla === 'A11_cobro');
const enHoja = conCobro(instalado({ notion_page_id: 'V-150' }));
cierto(!!enHoja && /ficha/.test(enHoja.detalle) && /COBRANDO/.test(enHoja.detalle) && !/Copia los datos/.test(enHoja.detalle),
  'con la fila en la hoja, A11 manda a poner COBRANDO en la ficha y no a copiar: ' + (enHoja && enHoja.detalle));
cierto(!!enHoja && !enHoja.acciones.some(x => x.tipo === 'tsv') && enHoja.acciones[0].tipo === 'estatus' &&
  enHoja.acciones[0].datos.estatus === 'COBRANDO',
  'y su acción no es la de copiar la fila: ' + (enHoja && enHoja.acciones.map(x => x.tipo).join(', ')));
const sinHoja = conCobro(instalado({ notion_page_id: null }));
cierto(!!sinHoja && /Copia los datos/.test(sinHoja.detalle) && sinHoja.acciones[0].tipo === 'tsv',
  'sin fila en la hoja sigue ofreciendo copiarla');
/* Con el estatus ya puesto no se vuelve a pedir: LIQUIDADO ya se cobró, y COBRANDO solo
   necesita el mensaje. `pago_pendiente` tarda una bajada en enterarse. */
cierto(!conCobro(instalado({ notion_page_id: 'V-150', estatus_notion: 'LIQUIDADO' })),
  'con LIQUIDADO en la hoja, A11 ya no sale');
const yaCobrando = conCobro(instalado({ notion_page_id: 'V-150', estatus_notion: 'COBRANDO' }));
cierto(!!yaCobrando && !yaCobrando.acciones.some(x => x.tipo === 'estatus') && yaCobrando.acciones[0].tipo === 'wa' &&
  !/pon su Estatus/.test(yaCobrando.detalle),
  'con COBRANDO ya puesto, A11 solo ofrece el mensaje: ' + (yaCobrando && yaCobrando.acciones.map(x => x.tipo).join(', ')));

/* ---- 6c. A12: una huella vieja, sin ordenar, no es una edición ----
   Las huellas selladas antes del 15 de septiembre de 2026 están en el orden de las partidas;
   la de hoy va ordenada. Compararlas con `===` hacía que todo proyecto viejo saliera como
   «se editó después de ganarse». */

const partidas = [{ id: 2, tipo: 'caja', ancho: 120, alto: 60, tarifa: 3900 },
                  { id: 1, tipo: 'letras', material: 'acero', altura: 40, n: 8 }];
const trozo = it => huellaDe({ items: [it] }).slice(2);
const huellaVieja = 'c|' + partidas.map(trozo).join(',');       // sin ordenar, como se sellaba
const ganado = { id: 'p8', folio_local: 'COT-0108', nombre: 'Gym - Letras', etapa: 'ganado',
  fecha_ganado: '2026-08-20', origen: { folio: 'COT-0108', items: partidas, huellaAuth: huellaVieja } };
const a12 = hist => evaluar({ ...estado, proyectos: [ganado], instalaciones: [], historial: hist })
  .filter(a => a.regla === 'A12_huella');
cierto(huellaVieja !== huellaDe({ items: partidas }), 'la huella vieja de verdad no es igual, letra por letra, a la de hoy');
cierto(a12([{ folio: 'COT-0108', items: partidas, ts: dias(3) }]).length === 0,
  'la misma cotización con la huella vieja NO sale como editada');
cierto(a12([{ folio: 'COT-0108', items: [partidas[0], { ...partidas[1], altura: 50 }], ts: dias(3) }]).length === 1,
  'y una edición de verdad sí sale');

/* ---- 6d. A15: la venta y la hoja no cuadran ----
   Tres marcas de la capa de datos (ver js/datos/proyectos.js, «LA VENTA QUE LA HOJA YA NO
   TIENE»), una sola regla. La de una venta de aquí o una repetida es de Dirección: sus salidas
   cambian el libro del dinero o cuál es la venta. La de una tarjeta importada, de quien tenga el
   teléfono. Nada se borra solo; el aviso lleva a la ficha, que es donde se decide. */

const { avisoDeHoja } = await import('../js/datos/proyectos.js');
const desde = dias(4);
const perdidaPropia = { id: 'p20', folio_local: 'COT-0120', nombre: 'Café Luna - Letras', etapa: 'armado',
  fecha_ganado: '2026-08-01', notion_page_id: 'V-404', hoja_perdida: { motivo: 'borrada', folio: 'V-404', desde } };
const deOtra = { ...perdidaPropia, id: 'p21', nombre: 'Gym Fuerte - Caja', notion_page_id: 'V-407',
  hoja_perdida: { motivo: 'de_otra', folio: 'V-407', desde } };
const huerfana = { id: 'proy-hoja-V-300', de_hoja: true, folio_hoja: 'V-300', nombre: 'Taller Sur - Vinil', etapa: 'ganado',
  fecha_ganado: '2026-08-01', hoja_perdida: { motivo: 'no_bajo', folio: 'V-300', desde } };
const repetida = { id: 'proy-hoja-V-320', de_hoja: true, folio_hoja: 'V-320', nombre: 'Óptica Sol', etapa: 'cortado',
  fecha_ganado: '2026-08-01', duplicado_de: { id: 'p22', nombre: 'Óptica Sol - Caja Luz', folio: 'COT-0122@D7K2', folio_hoja: 'V-320',
    desde, por: ['la copia va en «Cortado» y la de este teléfono en «Ganado»'] } };
/* La venta de aquí que está en DOS filas de la hoja (`hoja_doble`): Dirección la volvió a dar de
   alta y alguien deshizo después el borrado de la vieja. Cuál sobra se borra en la hoja. */
const doble = { id: 'p24', folio_local: 'COT-0124', nombre: 'Kiosko Sol - Letras', etapa: 'armado', fecha_ganado: '2026-08-01',
  notion_page_id: 'V-500', hoja_doble: { folios: ['V-500', 'V-404'], desde } };
const yaDecididas = [{ ...huerfana, id: 'proy-hoja-V-301', hoja_perdida: null, fuera_de_hoja: desde },
                     { ...perdidaPropia, id: 'p23', etapa: 'cancelado' },
                     { ...doble, id: 'p25', hoja_doble: { folios: ['V-500'], desde } }];
const conHoja = rol => evaluar({ ...estado, rol, instalaciones: [], historial: [], existencias: [], faltantes: [],
  proyectos: [perdidaPropia, deOtra, huerfana, repetida, doble, ...yaDecididas] }).filter(a => a.regla === 'A15_hoja');
const a15 = conHoja('direccion');
cierto(a15.length === 5, 'A15 nombra las cinco marcadas y ninguna de las ya decididas (salieron ' + a15.length + ')');
const a15De = id => a15.find(a => a.entidad_id === id) || { titulo: '', detalle: '', acciones: [] };
cierto(/ya no está en la hoja/.test(a15De('p20').titulo) && /borró su fila V-404/.test(a15De('p20').detalle) &&
  /volver|vuelve a dar de alta/.test(a15De('p20').detalle),
  'la venta de este teléfono cuya fila se borró dice qué fila y qué se decide: ' + a15De('p20').detalle);
cierto(/ya es de otra venta/.test(a15De('p21').detalle), 'la que ya es de otra venta lo dice con esas palabras, no como borrada');
cierto(/ya no está en la hoja/.test(a15De('proy-hoja-V-300').titulo) && /quita del tablero/.test(a15De('proy-hoja-V-300').detalle) &&
  /No se quitó sola/.test(a15De('proy-hoja-V-300').detalle),
  'la tarjeta importada huérfana: no se quitó sola, se decide en su ficha');
cierto(/dos veces/.test(a15De('proy-hoja-V-320').titulo) && /Óptica Sol - Caja Luz/.test(a15De('proy-hoja-V-320').detalle) &&
  /Cortado/.test(a15De('proy-hoja-V-320').detalle),
  'la repetida nombra a la de este teléfono y por qué no se juntó sola');
/* La que solo coincide en el folio de la hoja no se afirma como la misma: puede ser una venta de
   otro con el folio repartido dos veces. */
const aDudosa = evaluar({ ...estado, rol: 'direccion', instalaciones: [], historial: [], existencias: [], faltantes: [],
  proyectos: [{ ...repetida, duplicado_de: { ...repetida.duplicado_de, claves: ['identidad'] } }] }).find(a => a.regla === 'A15_hoja') || { detalle: '' };
cierto(/parece la misma venta/.test(aDudosa.detalle) && /dos ventas con el mismo folio/.test(aDudosa.detalle) && !/ es la misma venta/.test(aDudosa.detalle),
  'la repetida por confirmar dice «parece», no «es»: ' + aDudosa.detalle);
cierto(/dos veces en la hoja/.test(a15De('p24').titulo) && /V-500 y V-404/.test(a15De('p24').detalle) &&
  /le manda sus cambios a V-500/.test(a15De('p24').detalle) && /borra la que sobra/.test(a15De('p24').detalle),
  'la venta en dos filas dice cuáles, a cuál manda y qué se hace en la hoja: ' + a15De('p24').detalle);
cierto(a15.every(a => a.acciones.length === 1 && a.acciones[0].tipo === 'abrir_proyecto' &&
  a.acciones[0].datos.proyecto_id === a.entidad_id), 'su única acción es abrir la ficha de ESE proyecto');
cierto(a15De('p20').cuando === 'hace 4 días', 'y dice desde cuándo: ' + a15De('p20').cuando);
/* La tarjeta importada vive sobre todo en el teléfono del taller, y las marcas no viajan: lo que
   Dirección decida en el suyo no llega ahí. Ese aviso lo ve quien tiene el teléfono; los de una
   venta de aquí o una repetida, que deciden la hoja o cuál es la venta, siguen siendo de Dirección. */
const a15Fab = conHoja('fabricacion'), a15Pag = conHoja('pagos');
cierto(a15Fab.map(a => a.entidad_id).join() === 'proy-hoja-V-300' && a15Pag.map(a => a.entidad_id).join() === 'proy-hoja-V-300',
  'fabricación y pagos ven la tarjeta importada cuya fila ya no vino, y nada más: ' + a15Fab.map(a => a.entidad_id) + ' / ' + a15Pag.map(a => a.entidad_id));
cierto(a15Fab.every(a => a.acciones.length === 1 && a.acciones[0].tipo === 'abrir_proyecto'), 'y con el mismo botón: abrir su ficha, donde la quita o la deja');
cierto(!a15.concat(a15Fab).some(a => /\$|\d{1,3},\d{3}/.test(a.titulo + a.detalle)), 'y no lleva ni un peso');
/* La regla lleva su copia de `avisoDeHoja` (no importa proyectos.js): las dos tienen que decir
   lo mismo de cada proyecto, o la regla avisaría de una ficha que no enseña nada. */
const todas = [perdidaPropia, deOtra, huerfana, repetida, doble, ...yaDecididas];
cierto(todas.every(p => ['perdida', 'repetida', 'doble'].includes(avisoDeHoja(p)) === a15.some(a => a.entidad_id === p.id)),
  'A15 y `avisoDeHoja` dicen lo mismo de cada proyecto');

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
