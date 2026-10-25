/* ============================================================================
   PAGOS EN SUPABASE: lo que se manda a la base y cómo se lee lo que contesta.

   La segunda entrega de la pieza de Pagos (docs/DECISIONES-SUPABASE.md, Q-01 y §C): la base ya
   tiene las funciones de cobro, abono, reparto FIFO y corrección (supabase/migrations/0007 y
   0012); esto es lo que la pantalla necesita para llamarlas bien. Es PURO salvo las llamadas,
   que reciben el cliente de supabase-js como argumento: así pruebas/pagos-supa.mjs lo prueba con
   un doble, sin red y sin navegador. La pantalla está en js/mod/pagos-supa.js.

   Nada de aquí se carga con el interruptor de Supabase apagado: lo importa solo esa pantalla, y
   esa pantalla solo la importa Control con el interruptor encendido en este aparato.

   Las reglas que se cumplen aquí, ANTES de llamar (la base las vuelve a comprobar todas):
     · montos en pesos con 2 decimales a lo más: «12.345» no se redondea en silencio, se
       rechaza; «$1,234.5» es 1234.50. Se cuentan en CENTAVOS enteros y se mandan como el
       número decimal exacto (JSON «1234.5»), nunca como el resultado de una suma de flotantes;
     · los topes de la base: cobro y reparto menos de mil millones (0012, A-1), abono y
       corrección de abono menos de diez millones (0007). NaN, Infinity y «1e9» no son montos;
     · el op_id se genera UNA vez por formulario y se conserva en cada reintento: si la primera
       llamada sí llegó y se perdió la respuesta, la base contesta lo mismo y no suma dos veces
       (las tres operaciones acumulativas y la corrección de abono son idempotentes por op_id).
       Solo después de un asiento confirmado nace otro;
     · qué errores son SEGUROS (la base contestó y no escribió nada) y cuáles INCIERTOS (no hubo
       respuesta: puede que sí haya llegado). Un error incierto nunca dice «no se registró».

   CON LA BASE MANDANDO (paso 5 de docs/BASE-MANDA.md) esto deja de ser una prueba: es donde Pagos y
   Dirección cobran. Y se suma la VENTA SIN COTIZACIÓN (`alta_venta`, el menú «Registrar nueva venta» de
   la hoja): la base le da el V-### de su contador. Solo con la base mandando —con la hoja mandando habría
   dos contadores de V-###, el de la hoja y el de la base—, solo Dirección y Pagos (la matriz de 0017,
   `alta.alta_venta`), e idempotente por su id, que nace del op_id del formulario: reintentar una alta que
   sí llegó contesta «ya existía» con el MISMO folio.
   ============================================================================ */

export const TOPE_COBRO = 1e9;        // registrar_cobro, vista_previa_reparto, repartir_abono_fifo (0012)
export const TOPE_ABONO = 1e7;        // registrar_abono_comision y corregir_abono (0007)
export const TOPE_NOTA = 400;         // abonos.nota <= 500 (0012, M-3); el reparto le agrega «· Reparto P-### de $…»
/* Los borradores de la pantalla viven en el almacenamiento de la PESTAÑA (mueren con ella). */
export const CLAVE_BORRADOR = 'al3d_pf_pagos_borrador';

/** Las áreas (de la BASE, no de este aparato) que ven estas pantallas. */
export const AREAS = ['direccion', 'pagos'];

/* Lo que pide `alta_venta` (0006), con sus listas cerradas. Son copias: esta capa es pura y no importa
   js/datos/puente.js (que trae la base local consigo). pruebas/pagos-supa.mjs las compara con las de la
   plataforma (`CUENTAS` y `ESTATUS` de puente.js, `TIPOS_TRABAJO` de proyectos.js, `ENTREGAS` de entrega.js)
   y con las de la función de la base. */
export const CUENTAS = ['Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT'];
export const ESTATUS = ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO'];
export const TIPOS = ['Caja de luz con iluminacion', 'Caja de luz sin iluminacion', 'Letras 3D con iluminacion',
  'Letras 3D sin iluminacion', 'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial'];
export const ENTREGAS = ['instalacion', 'paqueteria', 'recoleccion'];
export const ENTREGA_NOMBRE = { instalacion: 'Instalación', paqueteria: 'Paquetería', recoleccion: 'Recolección en taller' };
/** La cuenta que no factura: con ella la base pone la venta sin IVA (`interno.normalizar_iva`). */
export const CUENTA_SIN_IVA = 'Elias BBVA';
export const TOPE_NOMBRE = 200;
export const TOPE_DIRECCION = 400;      // la del diálogo de la hoja
export const TOPE_LIGA = 2000;          // proyectos.maps_url (0012)

/* ============================================================================
   Montos
   ============================================================================ */

const pesos = c => {
  const neg = c < 0, a = Math.abs(c);
  const ent = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + '$' + ent + '.' + String(a % 100).padStart(2, '0');
};
/** Centavos enteros a «$1,234.50», sin depender del idioma del navegador. */
export const pesosDeCentavos = pesos;
/** Un importe de la base (número o texto) a «$1,234.50». */
export function pesosDe(n) {
  const v = Number(n);
  return isFinite(v) ? pesos(Math.round(v * 100)) : '—';
}

/**
 * Lee un monto escrito por una persona.
 * @param {string} texto  «1234.5», «$1,234.50», «1 234»…
 * @param {{tope?:number, negativo?:boolean, cero?:boolean}} o  `negativo`: se admite con signo
 *        (la corrección de un abono); `cero`: se admite cero (un valor absoluto, como la
 *        liquidación corregida).
 * @returns {{ok:true, valor:number, centavos:number, texto:string} | {ok:false, mensaje:string}}
 */
export function leerMonto(texto, o = {}) {
  const tope = o.tope || TOPE_COBRO;
  let s = String(texto == null ? '' : texto).trim().replace(/[\s ]/g, '').replace(/^\$/, '');
  if (!s) return { ok: false, mensaje: 'Escribe el monto.' };
  let neg = false;
  if (/^[-−]/.test(s)) { neg = true; s = s.slice(1).replace(/^\$/, ''); }
  if (neg && !o.negativo) return { ok: false, mensaje: 'El monto va en positivo.' };
  /* Comas solo como separador de miles, bien puestas («1,234,567.50»); un punto decimal. */
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, mensaje: 'Escribe solo el número, en pesos: por ejemplo 1500 o 1,500.50.' };
  const dec = m[2] || '';
  if (dec.length > 2) return { ok: false, mensaje: 'Los montos llevan a lo más dos decimales (los centavos).' };
  const ent = m[1].replace(/,/g, '');
  if (ent.length > 12) return { ok: false, mensaje: 'Ese monto es demasiado grande.' };
  const c = (Number(ent) * 100 + Number((dec + '00').slice(0, 2))) * (neg ? -1 : 1);
  if (!Number.isSafeInteger(c)) return { ok: false, mensaje: 'Ese monto es demasiado grande.' };
  if (c === 0 && !o.cero) return { ok: false, mensaje: o.negativo ? 'La corrección no puede ser de cero.' : 'El monto tiene que ser mayor a cero.' };
  if (Math.abs(c) >= Math.round(tope * 100)) return { ok: false, mensaje: 'El monto tiene que ser menor a ' + pesos(Math.round(tope * 100)) + '.' };
  return { ok: true, valor: c / 100, centavos: c, texto: pesos(c) };
}

/* ============================================================================
   Fechas y notas
   ============================================================================ */

/**
 * La fecha del asiento: vacía es HOY de México (la pone la base); si se escribe, «AAAA-MM-DD»,
 * una fecha que exista y que no sea posterior a `hoy` (un cobro no se registra por adelantado).
 */
export function leerFecha(texto, hoy) {
  const s = String(texto == null ? '' : texto).trim();
  if (!s) return { ok: true, valor: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return { ok: false, mensaje: 'La fecha va como día, mes y año.' };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return { ok: false, mensaje: 'Esa fecha no existe.' };
  if (+m[1] < 2000) return { ok: false, mensaje: 'Esa fecha es demasiado vieja.' };
  if (hoy && s > hoy) return { ok: false, mensaje: 'La fecha no puede ser posterior a hoy.' };
  return { ok: true, valor: s };
}

export function leerNota(texto, o = {}) {
  const s = String(texto == null ? '' : texto).trim();
  if (o.obligatoria && !s) return { ok: false, mensaje: 'Una corrección se explica: escribe por qué.' };
  if (s.length > TOPE_NOTA) return { ok: false, mensaje: 'La nota es muy larga: ' + TOPE_NOTA + ' letras a lo más.' };
  return { ok: true, valor: s };
}

/** La fecha de instalación de una venta nueva: puede ser futura (es cuándo se va a instalar). Vacía, sin cita. */
export function leerFechaCita(texto) {
  const s = String(texto == null ? '' : texto).trim();
  if (!s) return { ok: true, valor: null };
  const r = leerFecha(s, '');
  if (!r.ok) return r;
  if (+s.slice(0, 4) > 2100) return { ok: false, mensaje: 'Esa fecha está demasiado lejos.' };
  return r;
}

/** El teléfono del cliente, limpio como lo limpia la base (`interno.telefono_limpio`): con 10 dígitos o más. */
export function leerTelefono(texto) {
  const s = String(texto == null ? '' : texto).replace(/[^\d +()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).trim();
  const dig = (s.match(/\d/g) || []).length;
  if (!dig) return { ok: false, mensaje: 'Falta el teléfono del cliente.' };
  if (dig < 10) return { ok: false, mensaje: 'Ese teléfono no tiene los 10 dígitos.' };
  return { ok: true, valor: s };
}

/** Un texto libre con tope. `obligatorio`: vacío no. */
function leerTexto(texto, tope, o = {}) {
  const s = String(texto == null ? '' : texto).trim();
  if (o.obligatorio && !s) return { ok: false, mensaje: o.falta || 'Falta este dato.' };
  if (s.length > tope) return { ok: false, mensaje: 'Es muy largo: ' + tope + ' letras a lo más.' };
  return { ok: true, valor: s };
}

/** La liga de Maps (opcional): una dirección web, como la que se manda por WhatsApp. */
export function leerLiga(texto) {
  const s = String(texto == null ? '' : texto).trim();
  if (!s) return { ok: true, valor: '' };
  if (!/^https?:\/\/\S+$/i.test(s)) return { ok: false, mensaje: 'Pega la liga completa de Maps (empieza con https://).' };
  if (s.length > TOPE_LIGA) return { ok: false, mensaje: 'Esa liga es demasiado larga.' };
  return { ok: true, valor: s };
}

/* ============================================================================
   El op_id: uno por formulario
   ============================================================================ */

export function nuevoOpId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return 'pf-' + c.randomUUID();
  const a = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return 'pf-' + [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}

export const FORMULARIOS = ['cobro', 'abono', 'reparto', 'correccion', 'venta'];
/** Los que solo existen con la base mandando: con la hoja, la venta sin cotización se da de alta en la hoja. */
export const SOLO_CON_LA_BASE = ['venta'];

/**
 * Los formularios que se enseñan. Con la hoja mandando, los cuatro de siempre. Con la base, además la venta
 * sin cotización, si la base dice que el área la puede dar de alta (`permisos.alta.alta_venta` de `mi_acceso`;
 * sin permisos, Dirección y Pagos, como la matriz de 0017).
 */
export function formulariosDe({ baseManda, acceso } = {}) {
  const lista = FORMULARIOS.filter(t => !SOLO_CON_LA_BASE.includes(t));
  if (baseManda && puedeDarDeAlta(acceso)) lista.push('venta');
  return lista;
}
export function puedeDarDeAlta(acceso) {
  const a = acceso || {};
  if (a.estado !== 'activo' || !AREAS.includes(a.area)) return false;
  const alta = a.permisos && a.permisos.alta;
  return alta && typeof alta === 'object' ? alta.alta_venta === true : true;
}

/** Un formulario en blanco, con su op_id ya nacido. */
export function borradorNuevo(tipo) {
  return { tipo, opId: nuevoOpId(), campos: {}, incierto: null };
}

/**
 * Lo que se manda, sin el op_id: si después de un envío INCIERTO cambia, ese op_id ya no puede
 * usarse para lo nuevo (la base devolvería lo de antes como si fuera esto). En una venta nueva, sin
 * sus sellos (la hora de la captura: cambian en cada intento y no son un dato).
 */
export function huella(plan) {
  if (!plan) return '';
  const a = { ...plan.args }; delete a.p_op_id;
  if (a.p_op && typeof a.p_op === 'object') { a.p_op = { ...a.p_op }; delete a.p_op.sellos; }
  return plan.rpc + ':' + JSON.stringify(a, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v));
}

/** El id de la venta nueva: sale del op_id del formulario, así el reintento es la MISMA venta. */
export const idDeAlta = opId => 'alta-' + String(opId || '').replace(/^pf-/, '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 100);

/**
 * ¿Con qué op_id se manda `plan` desde `b`?
 *   · si no hubo envío incierto, o lo de ahora es lo mismo que se mandó: el MISMO op_id
 *     (reintentar no suma dos veces);
 *   · si cambió algo después de un envío incierto: hay que preguntar, porque el primero pudo
 *     haber llegado. `cambio: true` y quien llama decide (y llama a `renovar`).
 */
export function opIdPara(b, plan) {
  if (b.incierto && b.incierto !== huella(plan)) return { opId: b.opId, cambio: true };
  return { opId: b.opId, cambio: false };
}
export function renovar(b) { b.opId = nuevoOpId(); b.incierto = null; return b; }

/** Después de la respuesta: confirmado → formulario nuevo; incierto → se recuerda qué se mandó. */
export function despuesDeEnviar(b, plan, r) {
  if (r.ok) return borradorNuevo(b.tipo);
  if (r.incierto) b.incierto = huella(plan);
  return b;
}

/* ============================================================================
   Qué se manda (cada formulario es un plan: la función y sus argumentos)
   ============================================================================ */

/**
 * Valida lo capturado y arma la llamada. No llama a nada.
 * @param {'cobro'|'abono'|'reparto'|'correccion'|'venta'} tipo
 * @param {Object} c  los campos del formulario (texto, como vienen de la pantalla)
 * @param {{opId:string, hoy?:string, venta?:Object, area?:string, vistaPrevia?:Object, baseManda?:boolean, ahora?:number}} o
 *        `baseManda`: la venta sin cotización solo sale con la base mandando; `ahora`: el sello de lo que se captura en ella.
 * @returns {{ok:true, rpc:string, args:Object, titulo:string, texto:string, si:string, peligro?:boolean} |
 *           {ok:false, errores:Object<string,string>, primero:string}}
 */
export function plan(tipo, c = {}, o = {}) {
  const err = {};
  const v = o.venta || null;
  const pide = (k, r) => { if (!r.ok) err[k] = r.mensaje; return r.ok ? r.valor : null; };
  const pideVenta = () => { if (!c.proyecto || !v) err.proyecto = 'Elige la venta.'; };

  if (tipo === 'cobro') {
    pideVenta();
    const modo = c.modo === 'anticipo' ? 'anticipo' : 'cobro';
    if (modo === 'anticipo') {
      const n = pide('monto', leerMonto(c.monto, { tope: TOPE_COBRO, cero: true }));
      if (Object.keys(err).length) return fallo(err);
      return {
        ok: true, rpc: 'corregir_venta', args: { p_proyecto: c.proyecto, p_cambios: { anticipo: n } },
        titulo: '¿Fijar el anticipo de ' + v.folio + '?',
        texto: v.nombre + '. El anticipo pasa de ' + pesosDe(v.anticipo) + ' a ' + pesosDe(n) +
          ' (es el anticipo TOTAL de la venta, no se suma al de antes). Queda en la bitácora con el valor anterior.',
        si: 'Fijar anticipo',
      };
    }
    const n = pide('monto', leerMonto(c.monto, { tope: TOPE_COBRO }));
    const f = pide('fecha', leerFecha(c.fecha, o.hoy));
    if (Object.keys(err).length) return fallo(err);
    const liquidar = c.liquidar === true || c.liquidar === 'si';
    /* La liquidación es ACUMULATIVA: un cobro de más no se nota hasta que alguien cuadra. Se acepta (la base
       también: «Cobrado de más»), pero la pregunta lo dice con la cifra y el botón se pinta de peligro. */
    const saldoC = Math.round(Number(v.saldo || 0) * 100), nC = Math.round(n * 100);
    const demas = nC - saldoC > 0 ? nC - Math.max(saldoC, 0) : 0;
    const yaLiq = String(v.estatus || '') === 'LIQUIDADO';
    return {
      ok: true, rpc: 'registrar_cobro',
      args: { p_proyecto: c.proyecto, p_monto: n, p_fecha: f, p_liquidar: liquidar, p_op_id: o.opId },
      titulo: '¿Registrar un cobro de ' + pesosDe(n) + '?',
      texto: v.folio + ' · ' + v.nombre + '. Se suma a la liquidación (' + pesosDe(v.liquidacion) + ' → ' +
        pesosDe((Math.round(Number(v.liquidacion || 0) * 100) + nC) / 100) + ')' +
        (f ? ', con fecha ' + f : ', con fecha de hoy') + '. ' +
        (liquidar ? 'La venta queda LIQUIDADA.' : 'El estatus de la venta no cambia.') +
        (demas ? ' OJO: es más que el saldo (' + pesosDe(Math.max(saldoC, 0) / 100) + '): quedaría cobrada de más por ' + pesosDe(demas / 100) + '.' : '') +
        (yaLiq ? ' OJO: la venta ya está LIQUIDADA.' : '') +
        ' Un cobro no se borra: si te equivocas, se corrige con otro asiento.',
      si: 'Registrar cobro',
      peligro: !!(demas || yaLiq),
    };
  }

  if (tipo === 'abono') {
    pideVenta();
    const n = pide('monto', leerMonto(c.monto, { tope: TOPE_ABONO }));
    const f = pide('fecha', leerFecha(c.fecha, o.hoy));
    const nota = pide('nota', leerNota(c.nota));
    if (Object.keys(err).length) return fallo(err);
    return {
      ok: true, rpc: 'registrar_abono_comision',
      args: { p_proyecto: c.proyecto, p_monto: n, p_fecha: f, p_nota: nota, p_op_id: o.opId },
      titulo: '¿Registrar un abono de comisión de ' + pesosDe(n) + '?',
      texto: v.folio + ' · ' + v.nombre + '. Le quedaba ' + pesosDe(v.restante) + ' de comisión por pagar' +
        (f ? '; fecha ' + f : '; fecha de hoy') + '. El abono queda en el libro y no se borra.',
      si: 'Registrar abono',
    };
  }

  if (tipo === 'reparto') {
    const n = pide('monto', leerMonto(c.monto, { tope: TOPE_COBRO }));
    const f = pide('fecha', leerFecha(c.fecha, o.hoy));
    const nota = pide('nota', leerNota(c.nota));
    if (Object.keys(err).length) return fallo(err);
    const vp = o.vistaPrevia;
    /* El reparto solo se manda sobre una vista previa del MISMO monto: lo que se confirma es lo
       que se vio. (La base recalcula al escribir; si en medio cambió algo, la respuesta lo dice.) */
    if (!vp || Math.round(Number(vp.monto) * 100) !== Math.round(n * 100)) return fallo({ monto: 'Primero toca «Ver el reparto» con este monto.' });
    const filas = Array.isArray(vp.filas) ? vp.filas : [];
    if (!filas.length) return fallo({ monto: 'No hay comisiones pendientes que abonar.' });
    return {
      ok: true, rpc: 'repartir_abono_fifo',
      args: { p_monto: n, p_fecha: f, p_nota: nota, p_op_id: o.opId },
      titulo: '¿Repartir ' + pesosDe(n) + ' entre ' + filas.length + (filas.length === 1 ? ' comisión?' : ' comisiones?'),
      texto: 'De la más antigua a la más nueva: ' + filas.slice(0, 4).map(x => x.folio + ' ' + pesosDe(x.abono)).join(', ') +
        (filas.length > 4 ? ' y ' + (filas.length - 4) + ' más' : '') + '.' +
        (Number(vp.sobrante) > 0.004 ? ' Sobran ' + pesosDe(vp.sobrante) + ', que NO se aplican.' : '') +
        ' Todos los renglones llevan el mismo número de pago y NO se pueden deshacer: un error se corrige con otro ' +
        'renglón, uno por venta, y eso solo lo hace Dirección.',
      si: 'Repartir',
      peligro: true,
    };
  }

  if (tipo === 'venta') {
    /* Con la hoja mandando, NO: la base le daría un V-### de su contador y la hoja otro del suyo. */
    if (!o.baseManda) return fallo({ tipo: 'Con la hoja mandando, una venta sin cotización se registra en la hoja («Registrar nueva venta»): aquí saldría con otro V-###.' });
    if (o.area && !AREAS.includes(o.area)) return fallo({ tipo: 'Dar de alta una venta es de Dirección y Pagos.' });
    const nombre = pide('nombre', leerTexto(c.nombre, TOPE_NOMBRE, { obligatorio: true, falta: 'Falta el nombre del proyecto.' }));
    if (!CUENTAS.includes(c.cuenta)) err.cuenta = 'Elige la cuenta de cobro.';
    const estatus = c.estatus || 'FABRICACION';
    if (!ESTATUS.includes(estatus)) err.estatus = 'Ese estatus no existe.';
    const tipos = Array.isArray(c.tipos) ? TIPOS.filter(x => c.tipos.includes(x)) : [];
    if (Array.isArray(c.tipos) && c.tipos.some(x => !TIPOS.includes(x))) err.tipos = 'Uno de los tipos de trabajo no existe.';
    const sub = String(c.subtotal == null ? '' : c.subtotal).trim() ? pide('subtotal', leerMonto(c.subtotal, { tope: TOPE_COBRO }))
      : pide('subtotal', { ok: false, mensaje: 'Falta el subtotal.' });
    const anti = String(c.anticipo == null ? '' : c.anticipo).trim() ? pide('anticipo', leerMonto(c.anticipo, { tope: TOPE_COBRO, cero: true })) : 0;
    const fecha = pide('fecha', leerFecha(c.fecha, o.hoy));
    const cita = pide('cita', leerFechaCita(c.cita));
    const tel = pide('tel', leerTelefono(c.tel));
    const entrega = ENTREGAS.includes(c.entrega) ? c.entrega : '';
    if (!entrega) err.entrega = 'Falta decir cómo se entrega.';
    const dir = entrega === 'recoleccion' ? '' : pide('dir', leerTexto(c.dir, TOPE_DIRECCION));
    const liga = entrega === 'instalacion' ? pide('maps', leerLiga(c.maps)) : '';
    if (Object.keys(err).length) return fallo(err);
    const iva = c.cuenta !== CUENTA_SIN_IVA;
    const subC = Math.round(sub * 100), antiC = Math.round(anti * 100);
    const netoC = iva ? Math.round(subC * 116 / 100) : subC;      // interno.neto: round(subtotal × 1.16, 2)
    const ahora = Number(o.ahora) || 0;
    const op = { id: idDeAlta(o.opId), nombre, cuenta: c.cuenta, estatus, tipo_trabajo: tipos, subtotal: sub, anticipo: anti,
      tel, entrega, dir_texto: dir || '', maps_url: liga || '' };
    if (fecha) op.fecha_anticipo = fecha;
    if (cita) op.fecha_instalacion = cita;
    /* Lo de la entrega es el dato más nuevo de esa venta, como lo sella el diálogo de la hoja (`sellarFila_`). */
    if (ahora > 0) {
      op.sellos = { tel: ahora, entrega: ahora };
      if (dir) op.sellos.dir_texto = ahora;
      if (liga) op.sellos.ubicacion = ahora;
    }
    return {
      ok: true, rpc: 'alta_venta', args: { p_op: op },
      titulo: '¿Registrar la venta «' + nombre + '»?',
      texto: 'Cuenta ' + c.cuenta + (iva ? ' (con IVA)' : ' (sin IVA)') + ' · subtotal ' + pesosDe(sub) + (iva ? ' → neto ' + pesosDe(netoC / 100) : '') +
        ' · anticipo ' + pesosDe(anti) + (fecha ? ' del ' + fecha : ' de hoy') + ' · ' + estatus + ' · ' + ENTREGA_NOMBRE[entrega] +
        (cita ? ', se instala el ' + cita : '') + '. La base le da el siguiente V-###.' +
        (antiC > netoC ? ' OJO: el anticipo es más que el neto.' : '') +
        ' Una venta no se borra: si algo quedó mal, Dirección la corrige.',
      si: 'Registrar venta',
      peligro: antiC > netoC,
    };
  }

  if (tipo === 'correccion') {
    pideVenta();
    const que = c.que === 'liquidacion' ? 'liquidacion' : 'abono';
    if (que === 'abono') {
      if (o.area && o.area !== 'direccion') err.que = 'Corregir un abono de comisión solo lo puede hacer Dirección.';
      const n = pide('monto', leerMonto(c.monto, { tope: TOPE_ABONO, negativo: true }));
      const f = pide('fecha', leerFecha(c.fecha, o.hoy));
      const nota = pide('nota', leerNota(c.nota, { obligatoria: true }));
      if (Object.keys(err).length) return fallo(err);
      return {
        ok: true, rpc: 'corregir_abono',
        args: { p_proyecto: c.proyecto, p_monto: n, p_nota: nota, p_fecha: f, p_op_id: o.opId },
        titulo: '¿Asentar una corrección de ' + pesosDe(n) + '?',
        texto: v.folio + ' · ' + v.nombre + '. Es un renglón NUEVO en el libro de abonos (' +
          (n < 0 ? 'resta' : 'suma') + ' ' + pesosDe(Math.abs(n)) + '); los renglones de antes no se tocan. Nota: «' + nota + '».',
        si: 'Asentar corrección',
      };
    }
    const n = pide('monto', leerMonto(c.monto, { tope: TOPE_COBRO, cero: true }));
    if (Object.keys(err).length) return fallo(err);
    return {
      ok: true, rpc: 'corregir_venta', args: { p_proyecto: c.proyecto, p_cambios: { liquidacion: n } },
      titulo: '¿Corregir la liquidación de ' + v.folio + '?',
      texto: v.nombre + '. La liquidación TOTAL pasa de ' + pesosDe(v.liquidacion) + ' a ' + pesosDe(n) +
        '. Queda en la bitácora con el valor anterior.',
      si: 'Corregir liquidación',
    };
  }
  return fallo({ tipo: 'Ese formulario no existe.' });
}

function fallo(errores) {
  const orden = ['tipo', 'proyecto', 'que', 'modo', 'nombre', 'cuenta', 'estatus', 'tipos', 'subtotal', 'anticipo', 'monto', 'fecha', 'cita',
    'tel', 'entrega', 'dir', 'maps', 'nota'];
  const primero = orden.find(k => errores[k]) || Object.keys(errores)[0];
  return { ok: false, errores, primero };
}

/** ¿Marcar LIQUIDADO por omisión? Solo si con este cobro el saldo queda en ceros. */
export function sugerirLiquidar(venta, monto) {
  const m = leerMonto(monto);
  if (!venta || !m.ok) return false;
  return Math.round(Number(venta.saldo || 0) * 100) - m.centavos <= 0;
}

/* ============================================================================
   La respuesta: segura o incierta, y en palabras
   ============================================================================ */

/* SQLSTATE: cinco caracteres. Un error así es de la transacción, que se deshizo completa. */
const esSqlstate = c => /^[0-9A-Z]{5}$/.test(String(c || '')) && !/^PGRST/.test(String(c || ''));

/**
 * Clasifica lo que devolvió `rpc()` (o lo que lanzó).
 * @returns {{ok:true, data:Object} | {ok:false, incierto:boolean, codigo:string, mensaje:string}}
 */
export function clasificar(rpcNombre, res, lanzado) {
  if (lanzado) return incierto(lanzado);
  const { data, error } = res || {};
  if (error) {
    const code = String(error.code || '');
    const msg = String(error.message || '');
    const st = Number(error.status || (res && res.status) || 0);
    if (/^PGRST3/.test(code) || /jwt/i.test(msg)) return seguro('SIN_SESION', rpcNombre);
    if (code === 'PGRST202') return seguro('SIN_FUNCION', rpcNombre);
    if (/^PGRST/.test(code)) return seguro('PETICION', rpcNombre, msg);
    if (code === '23514' || code === '22003') return seguro('FUERA_DE_LIMITE', rpcNombre);
    if (esSqlstate(code)) return seguro('BASE', rpcNombre, msg);
    if (st >= 400 && st < 500) return seguro('PETICION', rpcNombre, msg);
    return incierto(error);
  }
  if (!data || typeof data !== 'object') return incierto({ message: 'respuesta vacía' });
  if (data.ok === false) return seguro(String(data.codigo || ''), rpcNombre, String(data.mensaje || ''));
  /* corregir_venta contesta ok:true aunque rechace el campo: si no escribió nada, es un error. */
  if (Array.isArray(data.rechazadas) && data.rechazadas.length && Array.isArray(data.escritos) && !data.escritos.length) {
    return seguro('RECHAZADO', rpcNombre, String((data.rechazadas[0] && data.rechazadas[0].por) || ''));
  }
  return { ok: true, data };
}

const NADA = ' No se registró nada.';
function seguro(codigo, rpcNombre, mensaje) {
  return { ok: false, incierto: false, codigo, mensaje: mensajeDe(codigo, rpcNombre, mensaje) };
}
function incierto(e) {
  return {
    ok: false, incierto: true, codigo: 'SIN_RESPUESTA',
    mensaje: 'La base no contestó' + (/fetch|network|red/i.test(String((e && e.message) || '')) ? ' (sin señal)' : '') +
      '. Puede que sí se haya registrado: toca «Reintentar» con los mismos datos y, si ya había llegado, no se suma dos veces.',
  };
}

/** El código de la base (o el nuestro) en palabras para la pantalla. */
export function mensajeDe(codigo, rpcNombre, mensaje) {
  switch (codigo) {
    case 'DATO_INVALIDO': return (mensaje || 'La base no aceptó el dato.') + NADA;
    case 'RECHAZADO': return 'La base no aceptó el cambio' + (mensaje ? ': ' + mensaje : '') + '.' + NADA;
    case 'NO_ENCONTRADO': return 'Esa venta no está en la base de Supabase (puede que todavía no se haya importado de la hoja).' + NADA;
    case 'ROL_SIN_PERMISO':
      return (rpcNombre === 'corregir_abono' ? 'Corregir un abono de comisión solo lo puede hacer Dirección.'
        : rpcNombre === 'alta_venta' ? 'Dar de alta una venta es de Dirección y Pagos.'
        : 'Tu área no puede registrar esto: es de Pagos y Dirección.') + NADA;
    case 'SIN_ACCESO': case 'ACCESO_REVOCADO': case 'EMPRESA_REQUERIDA':
      return (mensaje || 'La base no te reconoce en esta empresa.') + NADA;
    case 'CLIENTE_VIEJO': return 'Esta versión de la app ya no es la que espera la base: actualízala y vuelve a intentarlo.' + NADA;
    case 'SIN_SESION': return 'Tu sesión de Supabase venció: vuelve a entrar con Google.' + NADA;
    case 'SIN_FUNCION': return 'La base no tiene esta función todavía (falta aplicar una migración).' + NADA;
    case 'FUERA_DE_LIMITE': return 'La base rechazó el importe: está fuera de sus límites.' + NADA;
    case 'BASE': case 'PETICION': return 'La base rechazó la operación' + (mensaje ? ' (' + mensaje + ')' : '') + '.' + NADA;
    default: return (mensaje || 'La base no aceptó la operación.') + NADA;
  }
}

/* ============================================================================
   Las llamadas (con el cliente de supabase-js que se les dé)
   ============================================================================ */

/** Manda un plan ya confirmado. Nunca lanza: devuelve lo que `clasificar` dice. */
export async function enviar(cliente, p) {
  let res, lanzado = null;
  try { res = await cliente.rpc(p.rpc, p.args); } catch (e) { lanzado = e || { message: 'error' }; }
  return clasificar(p.rpc, res, lanzado);
}

/** El reparto calculado, sin escribir. */
export async function vistaPrevia(cliente, montoTexto) {
  const m = leerMonto(montoTexto, { tope: TOPE_COBRO });
  if (!m.ok) return { ok: false, incierto: false, codigo: 'DATO_INVALIDO', mensaje: m.mensaje };
  const r = await enviar(cliente, { rpc: 'vista_previa_reparto', args: { p_monto: m.valor } });
  if (!r.ok) return r.incierto ? { ...r, mensaje: 'La base no contestó. Vuelve a tocar «Ver el reparto».' } : r;
  return { ok: true, data: { ...r.data, monto: m.valor } };
}

const COLUMNAS = 'proyecto_id,a_folio,b_proyecto,c_estatus,h_neto,i_anticipo,j_liquidacion,k_saldo,r_comision,s_abonado,t_restante';
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const numFolio = f => { const m = /(\d+)$/.exec(String(f || '')); return m ? Number(m[1]) : -1; };

/** Las ventas de la base (la vista de fórmulas: a Fabricación la RLS no le da ni una fila). */
export async function leerVentas(cliente) {
  let res;
  try { res = await cliente.from('ventas_calculadas').select(COLUMNAS); }
  catch (e) { return { ok: false, mensaje: 'Sin conexión con Supabase. Revisa la señal.' }; }
  if (res.error) return { ok: false, mensaje: 'No se pudieron leer las ventas de la base (' + (res.error.message || res.error.code || 'error') + ').' };
  return { ok: true, ventas: normalizarVentas(res.data) };
}

export function normalizarVentas(filas) {
  return (Array.isArray(filas) ? filas : []).filter(x => x && x.proyecto_id && x.a_folio).map(x => ({
    id: String(x.proyecto_id), folio: String(x.a_folio), nombre: String(x.b_proyecto || ''), estatus: String(x.c_estatus || ''),
    neto: num(x.h_neto), anticipo: num(x.i_anticipo), liquidacion: num(x.j_liquidacion), saldo: num(x.k_saldo),
    comision: num(x.r_comision), abonado: num(x.s_abonado), restante: num(x.t_restante),
  })).sort((a, b) => numFolio(b.folio) - numFolio(a.folio));
}

/* ============================================================================
   Quién ve qué
   ============================================================================ */

/**
 * Qué enseña la pestaña. Sin el interruptor, NADA (la pestaña ni existe). Fabricación en este
 * aparato, NADA. Sin sesión, el botón para entrar. Con sesión, lo que diga la BASE del área: solo
 * Dirección y Pagos ven los formularios (el área de este aparato no da permisos).
 * @returns {'nada'|'entrar'|'esperando'|'sin_permiso'|'formularios'}
 */
export function queMostrar({ encendido, rolLocal, sesion, acceso } = {}) {
  if (!encendido || rolLocal === 'fabricacion') return 'nada';
  if (sesion === null || sesion === undefined) return 'esperando';
  if (!sesion) return 'entrar';
  if (!acceso) return 'esperando';
  if (acceso.estado === 'activo' && AREAS.includes(acceso.area)) return 'formularios';
  return 'sin_permiso';
}

/** Lo que se dice cuando la base confirmó el asiento. */
export function resumen(p, data, venta) {
  const d = data || {}, f = venta ? venta.folio : '';
  const rep = d.repetida ? ' Ya estaba registrado: no se sumó otra vez.' : '';
  if (p.rpc === 'registrar_cobro') {
    return 'Cobro registrado en ' + f + '. Liquidación ' + pesosDe(d.liquidacion) + ', saldo ' + pesosDe(d.saldo) +
      (d.en_ceros ? ' (en ceros)' : '') + '; estatus ' + (d.estatus || '—') + '.';
  }
  if (p.rpc === 'corregir_venta') {
    const v = d.venta || {};
    return 'anticipo' in (p.args.p_cambios || {}) ? 'Anticipo de ' + f + ': ' + pesosDe(v.anticipo) + '.'
      : 'Liquidación de ' + f + ': ' + pesosDe(v.liquidacion) + '.';
  }
  if (p.rpc === 'registrar_abono_comision' || p.rpc === 'corregir_abono') {
    return (p.rpc === 'corregir_abono' ? 'Corrección asentada en ' : 'Abono registrado en ') + f + '. Abonado ' + pesosDe(d.abonado) +
      ', comisión por pagar ' + pesosDe(d.restante) + '.' + rep;
  }
  if (p.rpc === 'repartir_abono_fifo') {
    const n = Array.isArray(d.repartido) ? d.repartido.length : 0;
    return 'Reparto ' + (d.pago_id || '') + ': ' + pesosDe(d.repartido_total) + ' en ' + n + (n === 1 ? ' comisión' : ' comisiones') +
      (Number(d.sobrante) > 0.004 ? '; sobraron ' + pesosDe(d.sobrante) + ' sin aplicar' : '') + '.' + rep;
  }
  if (p.rpc === 'alta_venta') {
    const nombre = (p.args && p.args.p_op && p.args.p_op.nombre) || '';
    return 'Venta registrada en la base — ' + (d.folio_hoja || 'sin folio') + (nombre ? ': ' + nombre : '') + '.' +
      (d.ya_existia ? ' Ya estaba registrada: no se creó otra.' : '');
  }
  return 'Listo.';
}

/**
 * ¿La vista previa de ahora reparte lo MISMO que la que se vio? Mismas ventas, en el mismo orden, con el mismo
 * abono, y el mismo sobrante. Si otro teléfono abonó en medio, no: hay que enseñar la nueva antes de repartir
 * (el reparto no se deshace).
 */
export function mismoReparto(a, b) {
  const filas = x => (x && Array.isArray(x.filas) ? x.filas : []).map(y => String(y.folio) + '=' + Math.round(Number(y.abono) * 100));
  const cent = x => Math.round(Number((x && x.sobrante) || 0) * 100);
  if (!a || !b) return false;
  return Math.round(Number(a.monto) * 100) === Math.round(Number(b.monto) * 100) &&
    filas(a).join('|') === filas(b).join('|') && cent(a) === cent(b);
}

/** El nombre de la pestaña de Control: con la base mandando es donde se cobra; con la hoja, la prueba. */
export const nombreDeLaPestana = baseManda => (baseManda ? 'Cobros y abonos' : 'Registrar (Supabase)');
