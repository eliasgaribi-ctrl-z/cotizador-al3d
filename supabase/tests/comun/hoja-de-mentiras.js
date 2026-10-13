// Hojas de mentiras para el importador (supabase/DISENO.md §10.15): volcados con la forma EXACTA que deja
// puente/volcado-para-importar.gs (las matrices de getValues(), las fechas como {$fecha, $hora, $ms}) y respaldos de teléfono
// como los de «Respaldo completo». Nada aquí es un dato real: nombres, teléfonos e importes son inventados.
import { oraculo, centavos } from './oraculo.js';

/** Una celda de fecha como la escribe el volcado (zona de la hoja: México, UTC−6). */
export const dia = f => (f ? { $fecha: f, $hora: '00:00', $ms: Date.parse(f + 'T06:00:00.000Z') } : '');

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI'];
export const ENCABEZADO_VENTAS = ['Folio', 'Proyecto', 'Estatus', 'Cuenta ', 'Tipo de trabajo', 'IVA', 'Precio Subtotal', 'Precio Neto ', 'Anticipo',
  'Liquidacion', 'Pago Pendiente', 'Fecha Anticipo e Instalacion', 'Fecha instalacion', 'Fecha Liquidacion', 'Días de cobro', 'Días de antigüedad',
  'Antigüedad', 'Comisiones', 'Abono Comision', 'Comision Restante', 'Pagos de comisión', 'Año', 'Mes', 'Revisar', 'Folio cotizacion',
  'Etapa de obra', 'Hora instalacion', 'Ubicacion', 'Direccion', 'Porcentaje comision', 'Telefono', 'Entrega', 'Notas', 'Plazo taller', 'Sellos'];

const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Una fila de «Ventas» (35 celdas). `o` lleva las celdas por letra (A, B, C…) y, con `abonos` (importes en texto), las fórmulas
 * H, K, R, S, T, U, X, O, V, W salen del ORÁCULO de BigInt: lo que la hoja calcularía, sin compartir código con la base.
 * G, I y J pueden ir como número o como texto; para el oráculo se usa su texto.
 */
export function filaVentas(o) {
  const c = Object.fromEntries(LETRAS.map(l => [l, '']));
  Object.assign(c, o.celdas || {});
  if (o.formulas !== false) {
    const g = String(c.G === '' ? 0 : c.G), i = String(c.I === '' ? 0 : c.I), j = String(c.J === '' ? 0 : c.J);
    const cuenta = c.D || null;
    const r = oraculo({ g, i_: i, j, iva: String(c.F).toLowerCase() === 'sí', cuenta, estatus: c.C, conFechaLiq: !!c.N, abonos: o.abonos || [] });
    const num = x => Number(centavos(x));
    Object.assign(c, { H: num(r.h), K: num(r.k), R: num(r.r), S: num(r.s), T: num(r.t), U: r.u, X: r.x });
    const L = c.L && c.L.$fecha, N = c.N && c.N.$fecha;
    c.O = L && N ? diasEntre(L, N) : '';
    c.V = L ? Number(L.slice(0, 4)) : '';
    c.W = L ? L.slice(0, 7) : '';
  }
  return LETRAS.map(l => c[l]);
}

/** El volcado completo. `p` = { ventas: [filas], abonos: [[A..F]], accesos: [[A..C]], autorizaciones: [[A..Q]], … } (sin encabezados). */
export function volcado(p = {}, extra = {}) {
  const con = (enc, filas) => [enc, ...(filas || [])];
  const pestanas = { 'Ventas': con(ENCABEZADO_VENTAS, p.ventas) };
  if (p.abonos) pestanas['Abonos comisión'] = con(['Folio', 'Proyecto', 'Importe', 'Fecha', 'Nota', 'Pago'], p.abonos);
  if (p.accesos) pestanas['Accesos'] = con(['Correo', 'Rol', 'Nota'], p.accesos);
  if (p.autorizaciones) pestanas['Autorizaciones'] = con(['Cuándo (ISO)', 'Folio', 'Proyecto', 'Cliente', 'Subtotal calculado', 'Precio autorizado (neto)', 'Total',
    'Ajuste %', 'Ajustes por partida', 'Huella', 'Autorizó', 'Solicitó', 'Código', 'Firma', 'Estado', 'Nota', 'Renglones'], p.autorizaciones);
  if (p.respaldo) pestanas['Ventas (respaldo)'] = con(ENCABEZADO_VENTAS, p.respaldo);
  if (p.bitacora) pestanas['Bitácora del puente'] = con(['Cuándo', 'Rol', 'Folio', 'Fila', 'Qué escribió', 'Nota'], p.bitacora);
  if (p.almacen) pestanas['Almacén'] = p.almacen;
  if (p.listas) pestanas['Listas de compra'] = p.listas;
  return { formato: 'al3d-volcado', version: 1, hecho: '2026-10-12T18:00:00.000Z', zona: 'America/Mexico_City', libro: 'Hoja de mentiras',
    puente_version: 'puente-sheets-14', almacen_secuencia: 0, pestanas, ...extra };
}

/** Un «Respaldo completo» de teléfono (js/app.js, respaldar): plataforma + cotizador. */
export function respaldoTelefono({ proyectos = [], instalaciones = [], movimientos = [], requerimientos = [], materiales = [], constantes = [],
  historial = null, folio = null } = {}) {
  const cot = {};
  if (historial) cot.al3d_historial = JSON.stringify(historial);
  if (folio !== null) cot.al3d_folio = String(folio);
  return { app: 'al3d-completo', formato: 1, fecha: '2026-10-12T18:00:00.000Z',
    plataforma: { app: 'al3d-plataforma', formato: 1, fecha: '2026-10-12T18:00:00.000Z',
      datos: { proyectos, instalaciones, movimientos, requerimientos, materiales, constantes } },
    cotizador: { app: 'al3d-cotizador', datos: cot } };
}

/** Un proyecto de teléfono con lo mínimo (los campos de js/datos/proyectos.js). */
export function proyectoTel(o) {
  return { empresa_id: 'al3d', folio_local: 'COT-0001', dispositivo: 'K7QM', folio_global: '', folio_hoja: '', de_hoja: false, nombre: 'Ana - Tacos Ana',
    contacto: 'Ana', negocio: 'Tacos Ana', tel: '', etapa: 'ganado', tipo_trabajo: [], fecha_ganado: '2026-09-01', compromiso_texto: '', dir_texto: '',
    entrecalles: '', maps_url: '', lat: null, lng: null, geo_fuente: '', ubicacion_pendiente: false, entrega: 'instalacion', plazo_k: null, notas: '',
    sub: null, neto: null, precio_auth: null, anti_pactado: null, iva: true, estatus_notion: null, cuenta: null, pct_comision: null, origen: null,
    sellos: {}, creado_en: 1_700_000_000_000, actualizado_en: 1_700_000_000_000, sync: 0, ...o };
}
