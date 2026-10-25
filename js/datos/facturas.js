/* ============================================================================
   LAS FACTURAS DE LAS VENTAS FISCALES — los clientes fiscales, su constancia y las dos casillas.

   Lo pidió Elías el 2026-10-25 (docs/DINERO-Y-FACTURAS.md): «que los pagos que se hacen a las cuentas
   fiscales, como Tanit, ConstruImagen y Mónica, tengan un apartado para ver la constancia de situación
   fiscal y dos checkbox: la factura por el anticipo y la factura por la liquidación del proyecto». Y
   decidió que la constancia es del CLIENTE (por RFC), no del proyecto, y que la ven, la suben y marcan
   las casillas Dirección y Pagos. Fabricación no ve nada de esto, nunca.

   La base (0027_dinero_y_facturas.sql) tiene la verdad y las reglas: `clientes_fiscales` (RFC, razón
   social y la ruta de la constancia en el bucket privado `constancias-fiscales`), `ventas_fiscales` (a
   qué RFC se factura cada venta y las dos casillas, con quién y cuándo) y sus cuatro funciones, todas
   idempotentes por op_id. Esto es lo que la pantalla (js/mod/facturas.js) necesita para usarlas bien:
   PURO salvo las llamadas, que reciben el cliente de supabase-js como argumento, como js/datos/pagos-supa.js
   (pruebas/facturas.mjs lo prueba con un doble, sin red).

   Nada de esto se guarda en el teléfono: la lista se lee de la base cada vez (al abrir la pestaña, al
   volver, después de cada toque y cuando el enchufe avisa que cambió el dinero). Un RFC o una razón
   social no se quedan en el `localStorage` de nadie.
   ============================================================================ */

import { CUENTAS_FISCALES, DE_QUIEN, desdeDelPeriodo } from './dinero-cuentas.js';
import { clasificar, nuevoOpId } from './pagos-supa.js';

export const BUCKET = 'constancias-fiscales';
export const TOPE_CONSTANCIA = 5 * 1024 * 1024;      // = file_size_limit del bucket (opcional/constancias.sql) y el tope de `constancia_registrar`
export const SEGUNDOS_URL = 300;                      // la URL firmada para VER una constancia: cinco minutos
export const TOPE_RAZON = 300;                        // clientes_fiscales.razon_social
/** Los tipos que acepta el bucket, con la extensión de su ruta (la misma tabla que `constancia_registrar`). */
export const TIPOS = Object.freeze({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
export const ACEPTA = Object.keys(TIPOS).join(',');
export const FILTROS = Object.freeze(['pendientes', 'todas', 'clientes']);
export { nuevoOpId };

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const plano = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ============================================================================
   El RFC y la razón social — las mismas reglas que `interno.rfc_limpio` y `interno.rfc_problema` de 0027
   ============================================================================ */

/** En mayúsculas (la ñ también) y sin espacios, puntos, diagonales ni guiones. '' si no trae nada. */
export const rfcLimpio = t => String(t == null ? '' : t).replace(/[\s./-]/g, '').toUpperCase();

const GENERICOS = ['XAXX010101000', 'XEXX010101000'];
/** Qué tiene de malo un RFC ya limpio, en una frase; null si sirve. */
export function rfcProblema(rfc) {
  const r = String(rfc || '');
  if (!r) return 'Falta el RFC.';
  if (!/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]$/.test(r)) {
    return 'Ese RFC no tiene la forma del SAT: 3 o 4 letras, la fecha (AAMMDD) y la homoclave de 3, sin espacios (por ejemplo ABC010203XY1).';
  }
  if (GENERICOS.includes(r)) return 'Ese es el RFC genérico (público en general o extranjero): no es un cliente con constancia de situación fiscal.';
  const m = /^[A-ZÑ&]{3,4}(\d\d)(\d\d)(\d\d)/.exec(r);
  const a = 2000 + Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (mes < 1 || mes > 12 || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return 'La fecha de ese RFC no existe (las seis cifras son AAMMDD).';
  return null;
}
export function leerRfc(t) {
  const r = rfcLimpio(t), mal = rfcProblema(r);
  return mal ? { ok: false, mensaje: mal } : { ok: true, valor: r };
}
export function leerRazon(t) {
  const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  if (!s) return { ok: false, mensaje: 'Falta la razón social, como viene en la constancia.' };
  if (s.length > TOPE_RAZON) return { ok: false, mensaje: 'La razón social es demasiado larga (' + TOPE_RAZON + ' letras a lo más).' };
  return { ok: true, valor: s };
}

/* ============================================================================
   La constancia: el archivo que se sube
   ============================================================================ */

const POR_EXTENSION = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * ¿Sirve este archivo como constancia? PDF o foto (JPG, PNG o WebP) de hasta 5 MB. Un navegador que no dice el tipo se juzga por
 * la extensión. Una foto HEIC del iPhone no la acepta el bucket: se dice cómo sacarla en JPG.
 * @param {{type?:string, size?:number, name?:string}} f
 * @returns {{ok:true, tipo:string, ext:string, bytes:number} | {ok:false, mensaje:string}}
 */
export function validarConstancia(f) {
  if (!f || typeof f !== 'object') return { ok: false, mensaje: 'Elige el archivo de la constancia.' };
  const ext = (/\.([a-z0-9]+)$/i.exec(String(f.name || '')) || [])[1];
  const tipo = TIPOS[f.type] ? f.type : (!f.type && ext ? POR_EXTENSION[ext.toLowerCase()] || '' : '');
  if (/heic|heif/i.test(String(f.type || '') + ' ' + String(ext || ''))) {
    return { ok: false, mensaje: 'Esa foto está en HEIC, el formato del iPhone, y no se puede abrir en todos lados. Sube el PDF de la constancia, o una captura de pantalla de ella.' };
  }
  if (!tipo) return { ok: false, mensaje: 'La constancia va en PDF o en foto (JPG, PNG o WebP).' };
  const bytes = Number(f.size);
  if (!(bytes > 0)) return { ok: false, mensaje: 'Ese archivo está vacío.' };
  if (bytes > TOPE_CONSTANCIA) return { ok: false, mensaje: 'La constancia pesa ' + (Math.round(bytes / 104857.6) / 10) + ' MB: el tope es de 5 MB. El PDF del SAT pesa mucho menos.' };
  return { ok: true, tipo, ext: TIPOS[tipo], bytes };
}

/** Un id para la ruta de una constancia (una por subida: reemplazar es subir otra). */
export function idDeConstancia() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const a = new Uint8Array(12);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}
/** <empresa>/<RFC>/csf-<id>.<ext>: la forma que exigen la política de subir del bucket y `constancia_registrar`. */
export const rutaDeConstancia = (empresa, rfc, ext, id) => String(empresa) + '/' + String(rfc) + '/csf-' + String(id) + '.' + String(ext);

/* ============================================================================
   La lista: las ventas fiscales con su cliente, su constancia y sus casillas
   ============================================================================ */

const fecha = x => (x instanceof Date ? (isFinite(x) ? x.toISOString().slice(0, 10) : '') : (/^\d{4}-\d{2}-\d{2}/.test(String(x || '')) ? String(x).slice(0, 10) : ''));
const instante = x => (x instanceof Date ? (isFinite(x) ? x.toISOString() : '') : (x ? String(x) : ''));
const numFolio = f => { const m = /(\d+)$/.exec(String(f || '')); return m ? Number(m[1]) : -1; };

/** El renglón de un cliente fiscal como lo usa la pantalla. */
export function clienteDe(c) {
  if (!c || !c.rfc) return null;
  return { rfc: String(c.rfc), razon: String(c.razon_social || ''),
    csf: c.csf_ruta ? { ruta: String(c.csf_ruta), tipo: String(c.csf_tipo || ''), bytes: num(c.csf_bytes) || null, subida: instante(c.csf_subida_en), subio: String(c.csf_subio || '') } : null };
}

/**
 * Junta lo que se leyó de la base: las ventas de una cuenta fiscal (de `ventas_calculadas`, sin las canceladas), su renglón de
 * `ventas_fiscales` (si lo tiene) y el cliente de cada RFC. Un cliente con varias ventas es UN cliente con una constancia. PURA.
 * @returns {{ventas:Object[], clientes:Object[]}}
 */
export function armarLista(calculadas, fiscales, clientes) {
  const porRfc = new Map();
  for (const c of (Array.isArray(clientes) ? clientes : [])) { const x = clienteDe(c); if (x) porRfc.set(x.rfc, { ...x, ventas: [] }); }
  const vf = new Map((Array.isArray(fiscales) ? fiscales : []).filter(x => x && x.proyecto_id).map(x => [String(x.proyecto_id), x]));
  const ventas = [];
  for (const x of (Array.isArray(calculadas) ? calculadas : [])) {
    if (!x || !x.proyecto_id || !x.a_folio || !CUENTAS_FISCALES.includes(x.d_cuenta) || x.etapa === 'cancelado') continue;
    const f = vf.get(String(x.proyecto_id)) || {};
    const rfc = f.rfc ? String(f.rfc) : '';
    const cli = rfc ? porRfc.get(rfc) || { rfc, razon: '', csf: null, ventas: [] } : null;
    const v = {
      id: String(x.proyecto_id), folio: String(x.a_folio), nombre: String(x.b_proyecto || ''), cuenta: x.d_cuenta, deQuien: DE_QUIEN[x.d_cuenta] || '',
      estatus: String(x.c_estatus || ''), neto: num(x.h_neto), anticipo: num(x.i_anticipo), liquidacion: num(x.j_liquidacion), saldo: num(x.k_saldo),
      fechaAnticipo: fecha(x.l_fecha_anticipo), fechaLiquidacion: fecha(x.n_fecha_liquidacion),
      rfc, razon: cli ? cli.razon : '', csf: cli ? cli.csf : null,
      fa: { marcada: f.factura_anticipo === true, por: String(f.factura_anticipo_por || ''), en: instante(f.factura_anticipo_en) },
      fl: { marcada: f.factura_liquidacion === true, por: String(f.factura_liquidacion_por || ''), en: instante(f.factura_liquidacion_en) },
    };
    v.pendientes = pendientesDe(v);
    if (cli && !porRfc.has(rfc)) porRfc.set(rfc, cli);
    ventas.push(v);
  }
  /* Lo más nuevo arriba (el V-### es cronológico), como «Cobros y abonos»; y las ventas de cada cliente, en ese mismo orden. */
  ventas.sort((a, b) => numFolio(b.folio) - numFolio(a.folio));
  for (const v of ventas) if (v.rfc) porRfc.get(v.rfc).ventas.push(v.folio);
  const lista = [...porRfc.values()].map(c => ({ ...c, nVentas: c.ventas.length }))
    .sort((a, b) => a.razon.localeCompare(b.razon, 'es') || a.rfc.localeCompare(b.rfc));
  return { ventas, clientes: lista };
}

/** Qué falta facturar de una venta: el anticipo si se cobró y no tiene su factura; la liquidación, igual. PURA. */
export function pendientesDe(v) {
  return { anticipo: num(v && v.anticipo) > 0 && !(v.fa && v.fa.marcada), liquidacion: num(v && v.liquidacion) > 0 && !(v.fl && v.fl.marcada) };
}
const pendiente = v => v.pendientes.anticipo || v.pendientes.liquidacion;

/**
 * Las ventas que se enseñan: «pendientes» (las que deben una factura) o «todas», del periodo (por la fecha del anticipo, como la
 * lista de Ventas de Control) y con lo que se buscó (nombre, folio, RFC, razón social, cuenta). PURA.
 */
export function filtrar(ventas, o = {}) {
  const desde = desdeDelPeriodo(o.periodo, o.hoy);
  const q = plano(o.busca).trim();
  return (Array.isArray(ventas) ? ventas : []).filter(v => {
    if (o.filtro === 'pendientes' && !pendiente(v)) return false;
    if (desde && !(v.fechaAnticipo && v.fechaAnticipo >= desde)) return false;
    if (!q) return true;
    return plano([v.nombre, v.folio, v.rfc, v.razon, v.cuenta, v.deQuien].join(' ')).includes(q);
  });
}
export function filtrarClientes(clientes, busca) {
  const q = plano(busca).trim();
  return (Array.isArray(clientes) ? clientes : []).filter(c => !q || plano([c.rfc, c.razon, ...(c.ventas || [])].join(' ')).includes(q));
}

/** Las cuentas de arriba de la pestaña. PURA. */
export function resumen(ventas) {
  const l = Array.isArray(ventas) ? ventas : [];
  return {
    n: l.length,
    pendientes: l.filter(pendiente).length,
    anticipo: l.filter(v => v.pendientes.anticipo).length,
    liquidacion: l.filter(v => v.pendientes.liquidacion).length,
    sinCliente: l.filter(v => !v.rfc).length,
    sinConstancia: l.filter(v => v.rfc && !v.csf).length,
  };
}

/* ============================================================================
   Lo que se manda (cada acción es un plan: la función y sus argumentos, con su op_id)
   ============================================================================ */

/**
 * Ligar una venta a un RFC (o quitárselo, con el RFC vacío). Si el RFC no es cliente todavía, pide la razón social: la base lo da de alta
 * en el mismo viaje. `clientes` es la lista leída (para saber si el RFC ya existe).
 */
export function planLigar(venta, rfcTexto, razonTexto, clientes, opId) {
  if (!venta) return { ok: false, errores: { rfc: 'Elige la venta.' } };
  if (!String(rfcTexto || '').trim()) {
    if (!venta.rfc) return { ok: false, sinCambio: true, errores: { rfc: 'Escribe el RFC del cliente.' } };
    return { ok: true, rpc: 'venta_cliente_fiscal', args: { p_op: { op_id: opId, proyecto_id: venta.id, rfc: '' } },
      titulo: '¿Quitarle el cliente fiscal a ' + venta.folio + '?', texto: venta.nombre + '. Deja de estar ligada a ' + venta.rfc +
        (venta.razon ? ' (' + venta.razon + ')' : '') + '. El cliente y su constancia no se borran; las casillas de factura se quedan como están.',
      si: 'Quitar', peligro: true };
  }
  const r = leerRfc(rfcTexto);
  if (!r.ok) return { ok: false, errores: { rfc: r.mensaje } };
  if (r.valor === venta.rfc) return { ok: false, sinCambio: true, errores: { rfc: 'La venta ya está ligada a ese RFC.' } };
  const existe = (Array.isArray(clientes) ? clientes : []).find(c => c.rfc === r.valor);
  const op = { op_id: opId, proyecto_id: venta.id, rfc: r.valor };
  if (!existe) {
    const z = leerRazon(razonTexto);
    if (!z.ok) return { ok: false, errores: { razon: z.mensaje + ' (Ese RFC todavía no está dado de alta.)' } };
    op.razon_social = z.valor;
  }
  return { ok: true, rpc: 'venta_cliente_fiscal', args: { p_op: op }, sinPregunta: true,
    titulo: 'Cliente fiscal de ' + venta.folio, texto: '', si: 'Guardar' };
}

/** Dar de alta un cliente fiscal o cambiarle la razón social. */
export function planCliente(rfcTexto, razonTexto, clientes, opId) {
  const r = leerRfc(rfcTexto), z = leerRazon(razonTexto), errores = {};
  if (!r.ok) errores.rfc = r.mensaje;
  if (!z.ok) errores.razon = z.mensaje;
  if (Object.keys(errores).length) return { ok: false, errores };
  const existe = (Array.isArray(clientes) ? clientes : []).find(c => c.rfc === r.valor);
  if (existe && existe.razon === z.valor) return { ok: false, sinCambio: true, errores: { razon: 'Ese cliente ya tiene esa razón social.' } };
  return { ok: true, rpc: 'cliente_fiscal_guardar', args: { p_op: { op_id: opId, rfc: r.valor, razon_social: z.valor } }, sinPregunta: true,
    titulo: existe ? 'Razón social de ' + r.valor : 'Cliente fiscal ' + r.valor, texto: '', si: 'Guardar' };
}

/**
 * Marcar o desmarcar una casilla. Marcar no pregunta (es el uso normal, y se deshace); desmarcar sí, con el botón de peligro: borra quién
 * y cuándo se marcó (la bitácora de la base lo conserva).
 */
export function planMarcar(venta, cual, marcada, opId) {
  if (!venta || !['anticipo', 'liquidacion'].includes(cual)) return { ok: false, errores: { casilla: 'Esa casilla no existe.' } };
  const actual = cual === 'anticipo' ? venta.fa : venta.fl;
  const nombre = cual === 'anticipo' ? 'la factura del anticipo' : 'la factura de la liquidación';
  if (!!(actual && actual.marcada) === !!marcada) return { ok: false, sinCambio: true, errores: {} };
  const p = { ok: true, rpc: 'venta_factura_marcar', args: { p_op: { op_id: opId, proyecto_id: venta.id, cual, marcada: !!marcada } } };
  if (marcada) return { ...p, sinPregunta: true, titulo: '', texto: '', si: '' };
  return { ...p, peligro: true, si: 'Desmarcar', titulo: '¿Desmarcar ' + nombre + ' de ' + venta.folio + '?',
    texto: venta.nombre + '. Estaba marcada' + (actual.por ? ' por ' + actual.por : '') + (actual.en ? ' el ' + diaDe(actual.en) : '') +
      '. Vuelve a quedar pendiente; la bitácora de la base guarda que se marcó y que se desmarcó.' };
}
/** «25/10/2026» de un instante ISO, en la hora de México. */
export function diaDe(iso) {
  const t = Date.parse(String(iso || ''));
  if (!isFinite(t)) return '';
  const d = new Date(t - 6 * 3600 * 1000);
  return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
}

/** Lo que se le dice a la base después de subir el archivo: que ES la constancia del RFC. */
export function planConstancia(rfc, ruta, archivo, opId) {
  return { ok: true, rpc: 'constancia_registrar', args: { p_op: { op_id: opId, rfc, ruta, tipo: archivo.tipo, bytes: archivo.bytes } }, sinPregunta: true };
}

/* ============================================================================
   Las llamadas (con el cliente de supabase-js que se les dé)
   ============================================================================ */

const NADA = ' No se guardó nada.';
/** El código de la base en palabras para esta pantalla (la base ya manda la frase de lo que no aceptó). */
export function mensajeDe(rpc, r) {
  if (r.ok) return '';
  if (r.incierto) return 'La base no contestó: puede que sí se haya guardado. Toca «Reintentar»: si ya había llegado, no se guarda dos veces.';
  if (r.codigo === 'ROL_SIN_PERMISO') return (rpc === 'cuentas_disponibles_guardar' ? 'Cambiar las cuentas disponibles es de Dirección.' : 'Esto es de Dirección y Pagos.') + NADA;
  return String(r.mensaje || 'La base no aceptó el cambio.').replace(/\s*No se registró nada\.$/, '').trim() + NADA;
}

/** Manda un plan. Nunca lanza: {ok, data} o {ok:false, incierto, codigo, mensaje}. */
export async function enviar(cliente, p) {
  let res, lanzado = null;
  try { res = await cliente.rpc(p.rpc, p.args); } catch (e) { lanzado = e || { message: 'error' }; }
  const r = clasificar(p.rpc, res, lanzado);
  return r.ok ? r : { ...r, mensaje: mensajeDe(p.rpc, r) };
}

const PAGINA = 500;
async function todas(armar) {
  const out = [];
  for (let desde = 0; desde < 100000; desde += PAGINA) {
    const { data, error } = await armar().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const l = Array.isArray(data) ? data : [];
    out.push(...l);
    if (l.length < PAGINA) break;
  }
  return out;
}
const COLS_VENTA = 'proyecto_id,a_folio,b_proyecto,c_estatus,d_cuenta,h_neto,i_anticipo,j_liquidacion,k_saldo,l_fecha_anticipo,n_fecha_liquidacion,etapa';
const COLS_FISCAL = 'proyecto_id,rfc,factura_anticipo,factura_anticipo_por,factura_anticipo_en,factura_liquidacion,factura_liquidacion_por,factura_liquidacion_en';
const COLS_CLIENTE = 'rfc,razon_social,csf_ruta,csf_tipo,csf_bytes,csf_subida_en,csf_subio';

/** Lo que enseña la pestaña, leído de la base (la RLS decide: a Fabricación no le daría ni una fila). */
export async function leer(cliente, empresa) {
  try {
    const [calc, fisc, cli] = await Promise.all([
      todas(() => cliente.from('ventas_calculadas').select(COLS_VENTA).eq('empresa_id', empresa).in('d_cuenta', CUENTAS_FISCALES.slice()).order('proyecto_id')),
      todas(() => cliente.from('ventas_fiscales').select(COLS_FISCAL).eq('empresa_id', empresa).order('proyecto_id')),
      todas(() => cliente.from('clientes_fiscales').select(COLS_CLIENTE).eq('empresa_id', empresa).order('rfc')),
    ]);
    return { ok: true, ...armarLista(calc, fisc, cli) };
  } catch (e) {
    const m = String((e && (e.message || e.code)) || '');
    if (/ventas_fiscales|clientes_fiscales|does not exist|PGRST205|schema cache/i.test(m)) {
      return { ok: false, mensaje: 'La base todavía no tiene los clientes fiscales (falta aplicar la migración 0027).' };
    }
    return { ok: false, mensaje: /fetch|network|red/i.test(m) ? 'Sin conexión con la base. Revisa la señal.' : 'No se pudieron leer las facturas de la base (' + m + ').' };
  }
}

/**
 * Sube el archivo al bucket y le dice a la base que ES la constancia del RFC. Dos pasos: si el segundo no contesta, la subida ya está y
 * el reintento (con el mismo op_id y la misma ruta) solo repite el registro.
 * @param {{empresa:string, rfc:string, archivo:Blob, valido:{tipo,ext,bytes}, id?:string, opId:string, yaSubido?:string}} o
 * @returns {Promise<{ok:true, ruta:string, data:Object} | {ok:false, incierto?:boolean, mensaje:string, ruta?:string}>}
 */
export async function subirConstancia(cliente, o) {
  const ruta = o.yaSubido || rutaDeConstancia(o.empresa, o.rfc, o.valido.ext, o.id || idDeConstancia());
  if (!o.yaSubido) {
    let r;
    try { r = await cliente.storage.from(BUCKET).upload(ruta, o.archivo, { contentType: o.valido.tipo, upsert: false, cacheControl: '60' }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) {
      const m = String(r.error.message || r.error.error || '');
      if (/bucket not found/i.test(m)) return { ok: false, mensaje: 'La base todavía no tiene el lugar de las constancias (falta aplicar supabase/opcional/constancias.sql).' };
      if (/row-level security|unauthorized|403/i.test(m)) return { ok: false, mensaje: 'La base no dejó subir la constancia: el RFC tiene que ser un cliente fiscal y tú, de Dirección o Pagos.' };
      if (/too large|exceeded|413/i.test(m)) return { ok: false, mensaje: 'La constancia pesa de más (5 MB a lo más).' };
      if (/mime|type/i.test(m)) return { ok: false, mensaje: 'La constancia va en PDF o en foto (JPG, PNG o WebP).' };
      return { ok: false, mensaje: 'No se pudo subir la constancia' + (/fetch|network/i.test(m) ? ': sin señal.' : ' (' + m + ').') + ' Vuelve a intentarlo.' };
    }
  }
  const p = planConstancia(o.rfc, ruta, o.valido, o.opId);
  const r = await enviar(cliente, p);
  return r.ok ? { ok: true, ruta, data: r.data } : { ...r, ruta };
}

/** La URL firmada (cinco minutos) para ver una constancia. */
export async function urlDeConstancia(cliente, ruta) {
  let s;
  try { s = await cliente.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_URL); } catch (e) { s = { error: e }; }
  if (s && !s.error && s.data && s.data.signedUrl) return { ok: true, url: s.data.signedUrl };
  const m = String((s && s.error && (s.error.message || s.error.error)) || '');
  return { ok: false, mensaje: /not found|404/i.test(m) ? 'La constancia no está en el bucket: vuelve a subirla.'
    : /fetch|network/i.test(m) ? 'Sin señal: no se pudo abrir la constancia.' : 'No se pudo abrir la constancia (' + (m || 'sin respuesta') + ').' };
}
