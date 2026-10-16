/* ============================================================================
   REGISTRAR EN SUPABASE — las pantallas de Pagos (y Dirección), APAGADAS.

   La interfaz que faltaba sobre las funciones de la base (docs/DECISIONES-SUPABASE.md, Q-01 y
   §C): registrar un cobro o fijar el anticipo, registrar un abono de comisión, repartir un
   depósito entre las comisiones pendientes (de la más antigua a la más nueva) y corregir. Los
   libros son solo-agregar: una corrección de abono es un renglón NUEVO; la de liquidación es un
   valor absoluto que la base anota en su bitácora con el valor de antes.

   Dónde vive: una pestaña más de Control, «Registrar (Supabase)», que Control SOLO pinta con el
   interruptor de Supabase encendido en este aparato (el de Ajustes, `al3d_pf_supa`). Apagado,
   Control tiene sus cuatro pestañas de siempre y este archivo ni se descarga. Los formularios
   solo salen con sesión de Supabase y con el área que diga LA BASE (Dirección o Pagos); el área
   de este aparato no da permisos. Fabricación no tiene Control, y si llegara, aquí no se pinta
   nada ni se pide una sola cifra.

   Lo que la pantalla le garantiza a quien cobra:
     · pregunta antes de cada asiento, con el monto y lo que va a pasar;
     · el doble envío es imposible: el botón se apaga mientras va, y el op_id nace UNA vez por
       formulario y se reusa en cada reintento (js/datos/pagos-supa.js). Si no hubo respuesta,
       «Reintentar» manda lo mismo con el mismo op_id; cambiar los datos de un envío incierto
       pide confirmación porque el primero pudo haber llegado;
     · lo escrito no se tira: cada tecla se guarda en un borrador de la pestaña (memoria y
       sessionStorage) y vuelve aunque Control se repinte o se recargue la página;
     · errores claros, junto a su campo (rojo, `role="alert"`, `aria-invalid`), y los de la
       base dicen si se registró algo o no.

   IMPORTANTE mientras dure la migración: esto escribe en la base de PRUEBAS, no en la hoja. La
   hoja sigue siendo la fuente de verdad (fase 3, doble escritura) y la pantalla lo dice.
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';
import * as PS from '../datos/pagos-supa.js';
import { esc, ico, toast, voz, segmento, confirmarPf, hoyISO } from '../nucleo/ui.js';

let _el = null;                 // el contenedor de ahora (Control lo recrea en cada repintado)
let _vista = 'esperando';       // lo que dice PS.queMostrar
let _acceso = null;
let _ventas = null;             // las ventas de la base, o null si no se han leído
let _ventasMsg = '';
let _cargando = null;
let _form = 'cobro';
let _b = null;                  // los borradores, uno por formulario
let _vp = null;                 // la vista previa del reparto { monto, filas, sobrante, … }
let _enviando = false;
const _aviso = {};              // por formulario: { tono: 'ok'|'mal'|'av', texto, incierto }
let _foco = null;               // { id, ini, fin } del campo enfocado, para devolverlo tras un repintado

const NOMBRE = { cobro: 'Cobro o anticipo', abono: 'Abono de comisión', reparto: 'Repartir un depósito', correccion: 'Corregir' };
const AREA = { direccion: 'Dirección', pagos: 'Pagos', fabricacion: 'Fabricación' };

/* ----- Los borradores ----- */
function ss() { try { return globalThis.sessionStorage || null; } catch (_) { return null; } }
function borradores() {
  if (_b) return _b;
  let g = null;
  try { g = JSON.parse(ss()?.getItem(PS.CLAVE_BORRADOR) || 'null'); } catch (_) { g = null; }
  _b = {};
  for (const t of PS.FORMULARIOS) {
    const x = g && g[t];
    _b[t] = (x && typeof x.opId === 'string' && x.opId && typeof x.campos === 'object')
      ? { tipo: t, opId: x.opId, campos: x.campos || {}, incierto: x.incierto || null } : PS.borradorNuevo(t);
  }
  if (g && PS.FORMULARIOS.includes(g._form)) _form = g._form;
  return _b;
}
function guardar() {
  try { ss()?.setItem(PS.CLAVE_BORRADOR, JSON.stringify({ ...borradores(), _form })); } catch (_) { /* sin almacenamiento: queda en memoria */ }
}

/* ============================================================================
   Lo que Control llama
   ============================================================================ */

/** El HTML de la pestaña con lo que ya se sabe (sin esperar a la red). */
export function html() {
  borradores();
  if (_vista === 'nada') return '';
  const cab = '<div class="card pg-supa-card"><div class="card-h"><h2>' + ico('i-nube') + ' Registrar en Supabase (pruebas)</h2></div><div class="card-b">' +
    '<p class="hintnote nota-av">Esto escribe en la base <b>de pruebas</b>, no en la hoja. La hoja sigue siendo la que manda: ' +
    'lo que registres aquí regístralo también allá.</p>';
  let cuerpo;
  if (_vista === 'esperando') cuerpo = '<p class="pf-nota" role="status">Preguntando a la base quién eres…</p>';
  else if (_vista === 'entrar') {
    cuerpo = '<p class="aj-p">Entra con tu cuenta de Google para que la base te reconozca.</p>' +
      '<div id="pg-google" class="aj-supa-google"></div>' +
      '<div class="pf-acciones"><button type="button" class="btn btn-gho" data-pg-act="apagar">Apagar Supabase en este aparato</button></div>';
  } else if (_vista === 'sin_permiso') {
    const a = _acceso || {};
    const quien = a.correo ? '<b>' + esc(a.correo) + '</b>' : 'Esta cuenta';
    cuerpo = '<p class="hintnote nota-av">' + quien +
      (a.estado === 'activo' ? ' es de ' + esc(AREA[a.area] || a.area || 'otra área') : ' no está activa en la base') +
      '. Registrar cobros y abonos es de Pagos y Dirección.' + (a.mensaje ? ' ' + esc(a.mensaje) : '') + '</p>' +
      '<div class="pf-acciones"><button type="button" class="btn btn-gho" data-pg-act="recargar">Volver a preguntar</button></div>';
  } else cuerpo = htmlFormularios();
  return cab + cuerpo + '</div></div>';
}

/** Cuelga los oyentes del contenedor recién pintado y, si hace falta, pregunta a la base. */
export function cablear(el) {
  if (!el) return;
  const nuevo = el !== _el;
  _el = el;
  if (nuevo) {
    el.addEventListener('input', alEscribir);
    el.addEventListener('change', alEscribir);
    el.addEventListener('click', alClic);
    el.addEventListener('submit', alEnviar);
    el.addEventListener('focusin', ev => { const t = ev.target; if (t && t.id) _foco = { id: t.id, ini: selIni(t), fin: selFin(t) }; });
  }
  devolverFoco();
  if (_vista === 'entrar') pintarGoogle();
  if (!_cargando && (_vista === 'esperando' || (_vista === 'formularios' && _ventas === null))) cargar();
}

/** Control se va: se olvida el contenedor (el estado y los borradores se quedan). */
export function soltar() { _el = null; }

/* ============================================================================
   Leer: sesión, área y ventas
   ============================================================================ */

function cargar() {
  _cargando = (async () => {
    const Supa = await import('../nucleo/supa.js');
    const encendido = Supa.encendido();
    const sesion = encendido ? await Supa.haySesion() : false;
    _acceso = sesion ? await Supa.acceso() : null;
    _vista = PS.queMostrar({ encendido, rolLocal: Prefs.rol(), sesion, acceso: _acceso });
    if (_vista === 'esperando') _vista = 'sin_permiso';           // la base no contestó con un estado: no se adivina
    if (_vista === 'formularios') await leerVentas(Supa);
  })().catch(e => { _vista = 'sin_permiso'; _acceso = { estado: 'desconocido', mensaje: String((e && e.message) || '') }; })
    .finally(() => { _cargando = null; repintar(); });
  return _cargando;
}

async function leerVentas(Supa) {
  const r = await PS.leerVentas(await Supa.cliente());
  if (r.ok) { _ventas = r.ventas; _ventasMsg = ''; } else { _ventas = _ventas || []; _ventasMsg = r.mensaje; }
}

function repintar() {
  if (!_el || !_el.isConnected) return;
  _el.innerHTML = html();
  devolverFoco();
  if (_vista === 'entrar') pintarGoogle();
}

async function pintarGoogle() {
  const caja = _el && _el.querySelector('#pg-google');
  if (!caja || caja.dataset.listo) return;
  caja.dataset.listo = '1';
  const Supa = await import('../nucleo/supa.js');
  Supa.botonDeGoogle(caja, r => {
    if (r.ok) toast('Dentro de Supabase', 'ok', 2500); else toast(r.mensaje, 'err', 6000);
    _vista = 'esperando'; _ventas = null; repintar(); cargar();
  }).catch(e => toast(Supa.mensajeDe(e), 'err', 6000));
}

/* ============================================================================
   Pintar los formularios
   ============================================================================ */

const venta = id => (_ventas || []).find(v => v.id === id) || null;
const idDe = (t, k) => 'pg-' + t + '-' + k;
const msg = (t, k) => '<p class="pf-de-err pg-err" id="' + idDe(t, k) + '-m" role="alert" hidden></p>';

function htmlFormularios() {
  const tabs = segmento(PS.FORMULARIOS.map(v => ({ v, t: NOMBRE[v] })), _form, 'data-pg-form', 'Qué registrar');
  const aviso = _ventasMsg ? '<p class="hintnote nota-mal" role="alert">' + esc(_ventasMsg) + '</p>' : '';
  const quien = _acceso && _acceso.correo ? '<p class="pf-nota">Como <b>' + esc(_acceso.correo) + '</b> · ' + esc(AREA[_acceso.area] || '') + '</p>' : '';
  let f;
  if (_ventas === null) f = '<p class="pf-nota" role="status">Leyendo las ventas de la base…</p>';
  else if (_form === 'abono') f = formAbono();
  else if (_form === 'reparto') f = formReparto();
  else if (_form === 'correccion') f = formCorreccion();
  else f = formCobro();
  return quien + '<div class="ag-barra pg-tabs">' + tabs + '</div>' + aviso + f +
    '<div class="pf-acciones pg-pie"><button type="button" class="btn btn-gho" data-pg-act="recargar">Volver a leer las ventas</button></div>';
}

function selectVenta(t, campos, orden) {
  const lista = (_ventas || []).slice().sort(orden);
  const op = lista.map(v => '<option value="' + esc(v.id) + '"' + (v.id === campos.proyecto ? ' selected' : '') + '>' +
    esc(v.folio + ' · ' + v.nombre + ' — ' + etiquetaVenta(t, v)) + '</option>').join('');
  return '<div class="fld" data-pg-fld="proyecto"><label for="' + idDe(t, 'proyecto') + '">Venta</label>' +
    '<select id="' + idDe(t, 'proyecto') + '" data-pg-campo="proyecto" aria-describedby="' + idDe(t, 'proyecto') + '-m">' +
    '<option value="">' + (lista.length ? 'Elige la venta…' : 'No hay ventas en la base') + '</option>' + op + '</select>' +
    msg(t, 'proyecto') + '<p class="pf-nota pg-venta" id="' + idDe(t, 'venta') + '">' + detalleVenta(t, venta(campos.proyecto)) + '</p></div>';
}
function etiquetaVenta(t, v) {
  return t === 'cobro' ? 'saldo ' + PS.pesosDe(v.saldo) : t === 'abono' ? 'comisión por pagar ' + PS.pesosDe(v.restante)
    : 'saldo ' + PS.pesosDe(v.saldo) + ', comisión ' + PS.pesosDe(v.restante);
}
function detalleVenta(t, v) {
  if (!v) return '';
  const cobro = 'Neto ' + PS.pesosDe(v.neto) + ' · anticipo ' + PS.pesosDe(v.anticipo) + ' · liquidación ' + PS.pesosDe(v.liquidacion) +
    ' · saldo ' + PS.pesosDe(v.saldo) + (v.estatus ? ' · ' + esc(v.estatus) : '');
  const com = 'Comisión ' + PS.pesosDe(v.comision) + ' · abonado ' + PS.pesosDe(v.abonado) + ' · por pagar ' + PS.pesosDe(v.restante);
  return t === 'cobro' ? cobro : t === 'abono' ? com : cobro + '<br>' + com;
}
const conSaldo = (a, b) => (b.saldo > 0.004) - (a.saldo > 0.004);
const conComision = (a, b) => (b.restante > 0.004) - (a.restante > 0.004);

function campoTexto(t, k, etiqueta, valor, o = {}) {
  return '<div class="fld" data-pg-fld="' + k + '"><label for="' + idDe(t, k) + '">' + etiqueta + '</label>' +
    '<input type="' + (o.tipo || 'text') + '" id="' + idDe(t, k) + '" data-pg-campo="' + k + '"' +
    (o.decimal ? ' inputmode="decimal" placeholder="$0.00"' : '') + (o.max ? ' max="' + esc(o.max) + '"' : '') +
    (o.largo ? ' maxlength="' + o.largo + '"' : '') + ' autocomplete="off" value="' + esc(valor == null ? '' : valor) + '"' +
    ' aria-describedby="' + idDe(t, k) + '-m' + (o.ayuda ? ' ' + idDe(t, k) + '-a' : '') + '">' +
    (o.ayuda ? '<p class="pf-nota pg-ayuda" id="' + idDe(t, k) + '-a">' + o.ayuda + '</p>' : '') + msg(t, k) + '</div>';
}

function htmlAviso(t) {
  const a = _aviso[t];
  if (!a) return '<div class="pg-aviso" id="pg-' + t + '-aviso" tabindex="-1"></div>';
  const extra = a.incierto && borradores()[t].incierto
    ? '<div class="pf-acciones pg-incierto"><button type="submit" class="btn btn-pri">Reintentar con los mismos datos</button>' +
      '<button type="button" class="btn btn-gho" data-pg-act="olvidar">Empezar otro asiento</button></div>' : '';
  return '<div class="pg-aviso" id="pg-' + t + '-aviso" tabindex="-1"><p class="hintnote nota-' + a.tono + '"' +
    (a.tono === 'ok' ? ' role="status"' : ' role="alert"') + '>' + esc(a.texto) + '</p>' + extra + '</div>';
}

function boton(t, texto) {
  return '<div class="pf-acciones"><button type="submit" class="btn btn-pri" data-pg-enviar' + (_enviando ? ' disabled aria-busy="true"' : '') + '>' +
    (_enviando ? 'Enviando…' : texto) + '</button></div>';
}
const hoy = () => { try { return hoyISO(); } catch (_) { return ''; } };

function formCobro() {
  const t = 'cobro', c = borradores()[t].campos, modo = c.modo === 'anticipo' ? 'anticipo' : 'cobro';
  const v = venta(c.proyecto);
  const liquidar = c.liquidarTocado ? !!c.liquidar : PS.sugerirLiquidar(v, c.monto);
  return '<form class="pg-form" data-pg-tipo="cobro" novalidate>' +
    segmento([{ v: 'cobro', t: 'Cobro (se suma)' }, { v: 'anticipo', t: 'Anticipo (total)' }], modo, 'data-pg-modo', 'Qué es') +
    selectVenta(t, c, conSaldo) +
    campoTexto(t, 'monto', modo === 'anticipo' ? 'Anticipo total de la venta' : 'Monto cobrado', c.monto, {
      decimal: true, ayuda: modo === 'anticipo' ? 'Es el anticipo COMPLETO, no lo que se agrega: reemplaza al de ahora.' : 'En pesos, con centavos si los hay. Se suma a la liquidación.' }) +
    (modo === 'cobro'
      ? campoTexto(t, 'fecha', 'Fecha del cobro', c.fecha, { tipo: 'date', max: hoy(), ayuda: 'Vacía es hoy.' }) +
        '<div class="fld pg-check"><label><input type="checkbox" data-pg-campo="liquidar"' + (liquidar ? ' checked' : '') + '> ' +
        'Marcar la venta como LIQUIDADA</label><p class="pf-nota">Se marca sola cuando con este cobro el saldo queda en ceros.</p></div>'
      : '') +
    boton(t, modo === 'anticipo' ? 'Fijar anticipo…' : 'Registrar cobro…') + htmlAviso(t) + '</form>';
}

function formAbono() {
  const t = 'abono', c = borradores()[t].campos;
  return '<form class="pg-form" data-pg-tipo="abono" novalidate>' + selectVenta(t, c, conComision) +
    campoTexto(t, 'monto', 'Monto del abono', c.monto, { decimal: true, ayuda: 'En positivo y menos de $10,000,000.00.' }) +
    campoTexto(t, 'fecha', 'Fecha', c.fecha, { tipo: 'date', max: hoy(), ayuda: 'Vacía es hoy.' }) +
    campoTexto(t, 'nota', 'Nota (opcional)', c.nota, { largo: PS.TOPE_NOTA }) +
    boton(t, 'Registrar abono…') + htmlAviso(t) + '</form>';
}

function formReparto() {
  const t = 'reparto', c = borradores()[t].campos;
  return '<form class="pg-form" data-pg-tipo="reparto" novalidate>' +
    '<p class="pf-nota">Un depósito de comisión se reparte entre las comisiones pendientes, de la venta más antigua a la más nueva. ' +
    'Lo que sobra no se aplica.</p>' +
    campoTexto(t, 'monto', 'Monto del depósito', c.monto, { decimal: true }) +
    '<div class="pf-acciones"><button type="button" class="btn btn-gho" data-pg-act="previa">Ver el reparto</button></div>' +
    '<div id="pg-reparto-previa">' + htmlPrevia() + '</div>' +
    campoTexto(t, 'fecha', 'Fecha', c.fecha, { tipo: 'date', max: hoy(), ayuda: 'Vacía es hoy.' }) +
    campoTexto(t, 'nota', 'Nota (opcional)', c.nota, { largo: PS.TOPE_NOTA }) +
    boton(t, 'Repartir…') + htmlAviso(t) + '</form>';
}
function htmlPrevia() {
  if (!_vp) return '';
  const filas = Array.isArray(_vp.filas) ? _vp.filas : [];
  if (!filas.length) return '<p class="hintnote nota-av">No hay comisiones pendientes que abonar.</p>';
  return '<div class="pg-tabla-caja" tabindex="0" role="region" aria-label="Reparto calculado"><table class="pg-tabla"><caption>Reparto de ' + PS.pesosDe(_vp.monto) + '</caption><thead><tr><th scope="col">Venta</th>' +
    '<th scope="col">Pendiente</th><th scope="col">Se abona</th><th scope="col">Queda</th></tr></thead><tbody>' +
    filas.map(x => '<tr><th scope="row">' + esc(x.folio) + ' <small>' + esc(x.nombre || '') + '</small></th><td>' + PS.pesosDe(x.pend) +
      '</td><td><b>' + PS.pesosDe(x.abono) + '</b></td><td>' + PS.pesosDe(x.queda) + '</td></tr>').join('') +
    '</tbody></table></div>' + (Number(_vp.sobrante) > 0.004 ? '<p class="pf-nota">Sobran ' + PS.pesosDe(_vp.sobrante) + ' que no se aplican.</p>' : '');
}

function formCorreccion() {
  const t = 'correccion', c = borradores()[t].campos;
  const esDir = _acceso && _acceso.area === 'direccion';
  const que = c.que === 'liquidacion' || !esDir ? 'liquidacion' : 'abono';
  const opciones = (esDir ? [{ v: 'abono', t: 'Abono de comisión' }] : []).concat([{ v: 'liquidacion', t: 'Liquidación de la venta' }]);
  return '<form class="pg-form" data-pg-tipo="correccion" novalidate>' +
    '<p class="pf-nota">Nada se borra. Un abono se corrige con un renglón nuevo (en negativo para restar); la liquidación se ' +
    'corrige escribiendo el total correcto, y la base guarda el valor de antes en su bitácora.' +
    (esDir ? '' : ' Corregir abonos de comisión es solo de Dirección.') + '</p>' +
    segmento(opciones, que, 'data-pg-que', 'Qué corregir') + selectVenta(t, c, conComision) +
    (que === 'abono'
      ? campoTexto(t, 'monto', 'Importe de la corrección', c.monto, { decimal: true, ayuda: 'Con signo menos para restar, por ejemplo -500.' }) +
        campoTexto(t, 'fecha', 'Fecha', c.fecha, { tipo: 'date', max: hoy(), ayuda: 'Vacía es hoy.' }) +
        campoTexto(t, 'nota', 'Por qué se corrige', c.nota, { largo: PS.TOPE_NOTA })
      : campoTexto(t, 'monto', 'Liquidación total correcta', c.monto, { decimal: true, ayuda: 'El total cobrado después del anticipo, no la diferencia.' })) +
    boton(t, que === 'abono' ? 'Asentar corrección…' : 'Corregir liquidación…') + htmlAviso(t) + '</form>';
}

/* ============================================================================
   Escribir, tocar y enviar
   ============================================================================ */

function formDe(n) { const f = n && n.closest && n.closest('form[data-pg-tipo]'); return f ? f.dataset.pgTipo : ''; }

function alEscribir(ev) {
  const t = ev.target, k = t && t.dataset && t.dataset.pgCampo, tipo = formDe(t);
  if (!k || !tipo) return;
  const c = borradores()[tipo].campos;
  if (k === 'liquidar') { c.liquidar = !!t.checked; c.liquidarTocado = true; }
  else c[k] = t.value;
  limpiarError(t.closest('form'), tipo, k);
  if (tipo === 'reparto' && k === 'monto' && _vp) { _vp = null; const p = _el && _el.querySelector('#pg-reparto-previa'); if (p) p.innerHTML = ''; }
  if (k === 'proyecto') { const d = _el && _el.querySelector('#' + idDe(tipo, 'venta')); if (d) d.innerHTML = detalleVenta(tipo, venta(c.proyecto)); }
  if (tipo === 'cobro' && (k === 'monto' || k === 'proyecto') && !c.liquidarTocado) {
    const ck = _el && _el.querySelector('form[data-pg-tipo="cobro"] [data-pg-campo="liquidar"]');
    if (ck) ck.checked = PS.sugerirLiquidar(venta(c.proyecto), c.monto);
  }
  guardar();
}

async function alClic(ev) {
  const t = ev.target;
  const f = t.closest('[data-pg-form]');
  if (f) { _form = f.dataset.pgForm; guardar(); repintar(); enfocar('[data-pg-form="' + _form + '"]'); return; }
  const m = t.closest('[data-pg-modo]');
  if (m) { borradores().cobro.campos.modo = m.dataset.pgModo; guardar(); repintar(); enfocar('[data-pg-modo="' + m.dataset.pgModo + '"]'); return; }
  const q = t.closest('[data-pg-que]');
  if (q) { borradores().correccion.campos.que = q.dataset.pgQue; guardar(); repintar(); enfocar('[data-pg-que="' + q.dataset.pgQue + '"]'); return; }
  const a = t.closest('[data-pg-act]');
  if (!a) return;
  const act = a.dataset.pgAct;
  if (act === 'recargar') { _ventas = null; _vista = 'esperando'; repintar(); cargar(); }
  else if (act === 'previa') verPrevia();
  else if (act === 'olvidar') olvidar();
  else if (act === 'apagar') {
    const Supa = await import('../nucleo/supa.js');
    await Supa.salir(); Supa.encender(false);
    toast('Supabase apagado en este aparato', 'ok', 2500);
    location.reload();
  }
}

async function verPrevia() {
  const c = borradores().reparto.campos;
  const r0 = PS.leerMonto(c.monto, { tope: PS.TOPE_COBRO });
  const form = _el && _el.querySelector('form[data-pg-tipo="reparto"]');
  if (!r0.ok) { marcarError(form, 'reparto', 'monto', r0.mensaje, true); return; }
  const Supa = await import('../nucleo/supa.js');
  const r = await PS.vistaPrevia(await Supa.cliente(), c.monto);
  if (!r.ok) { marcarError(form, 'reparto', 'monto', r.mensaje, true); return; }
  _vp = r.data;
  const p = _el && _el.querySelector('#pg-reparto-previa');
  if (p) p.innerHTML = htmlPrevia();
  const n = Array.isArray(_vp.filas) ? _vp.filas.length : 0;
  voz(n ? 'Reparto calculado: ' + n + (n === 1 ? ' comisión' : ' comisiones') : 'No hay comisiones pendientes que abonar.');
}

async function olvidar() {
  const si = await confirmarPf({ titulo: '¿Empezar otro asiento?', peligro: true, si: 'Empezar otro', no: 'Cancelar',
    texto: 'No sabemos si el envío anterior llegó. Si llegó y vuelves a mandar lo mismo como asiento nuevo, quedará DOS veces. ' +
      'Antes revisa el saldo de la venta (Volver a leer las ventas).' });
  if (!si) return;
  borradores()[_form] = PS.borradorNuevo(_form);
  delete _aviso[_form];
  guardar(); repintar();
}

function alEnviar(ev) {
  ev.preventDefault();
  const tipo = formDe(ev.target);
  if (tipo) enviarForm(tipo, ev.target);
}

async function enviarForm(tipo, form) {
  if (_enviando) return;                                              // el doble envío: uno a la vez
  const b = borradores()[tipo];
  const c = { ...b.campos };
  const v = venta(c.proyecto);
  if (tipo === 'cobro' && !c.liquidarTocado) c.liquidar = PS.sugerirLiquidar(v, c.monto);
  if (tipo === 'correccion' && (!_acceso || _acceso.area !== 'direccion')) c.que = 'liquidacion';
  const armar = () => PS.plan(tipo, c, { opId: b.opId, hoy: hoy(), venta: v, area: _acceso && _acceso.area, vistaPrevia: _vp });
  let p = armar();
  for (const k of ['proyecto', 'monto', 'fecha', 'nota', 'que']) limpiarError(form, tipo, k);
  if (!p.ok) {
    for (const [k, frase] of Object.entries(p.errores)) marcarError(form, tipo, k, frase, false);
    const campo = form.querySelector('#' + idDe(tipo, p.primero));
    if (campo) campo.focus(); else voz(p.errores[p.primero], true);
    return;
  }
  if (PS.opIdPara(b, p).cambio) {
    const si = await confirmarPf({ titulo: 'Cambiaste los datos de un envío que no sabemos si llegó', peligro: true,
      si: 'Mandarlo como asiento nuevo', no: 'Cancelar',
      texto: 'Si el envío anterior sí llegó, esto registra OTRO asiento además de aquel. Antes revisa el saldo de la venta.' });
    if (!si) return;
    PS.renovar(b); guardar();
    p = armar();
  }
  if (!await confirmarPf({ titulo: p.titulo, texto: p.texto, si: p.si, no: 'Cancelar' })) return;
  if (_enviando) return;
  _enviando = true;
  const btn = form.querySelector('[data-pg-enviar]');
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Enviando…'; }
  let r;
  try {
    const Supa = await import('../nucleo/supa.js');
    r = await PS.enviar(await Supa.cliente(), p);
  } catch (e) {
    r = PS.clasificar(p.rpc, null, e);
  }
  borradores()[tipo] = PS.despuesDeEnviar(b, p, r);
  _aviso[tipo] = r.ok ? { tono: 'ok', texto: PS.resumen(p, r.data, v) }
    : { tono: r.incierto ? 'av' : 'mal', texto: r.mensaje, incierto: r.incierto };
  if (r.ok && tipo === 'reparto') _vp = null;
  _enviando = false;
  guardar();
  if (r.ok) {
    toast(_aviso[tipo].texto, 'ok', 4000);
    try { const Supa = await import('../nucleo/supa.js'); await leerVentas(Supa); } catch (_) { /* se queda lo de antes */ }
  }
  repintar();
  enfocar('#pg-' + tipo + '-aviso');
}

/* ----- Errores junto a su campo (como «Datos para la entrega»: rojo, con marca, aria-invalid) ----- */
function marcarError(form, tipo, k, frase, enfocarlo) {
  if (!form) { toast(frase, 'err', 5000); return; }
  const m = form.querySelector('#' + idDe(tipo, k) + '-m');
  const fld = form.querySelector('[data-pg-fld="' + k + '"]');
  const el = form.querySelector('#' + idDe(tipo, k));
  if (!m) { toast(frase, 'err', 5000); return; }
  m.hidden = false; m.textContent = frase;
  if (fld) fld.classList.add('falta');
  if (el) { el.setAttribute('aria-invalid', 'true'); if (enfocarlo) el.focus(); }
}
function limpiarError(form, tipo, k) {
  if (!form) return;
  const m = form.querySelector('#' + idDe(tipo, k) + '-m');
  if (m) { m.hidden = true; m.textContent = ''; }
  const fld = form.querySelector('[data-pg-fld="' + k + '"]');
  if (fld) fld.classList.remove('falta');
  const el = form.querySelector('#' + idDe(tipo, k));
  if (el) el.removeAttribute('aria-invalid');
}

/* ----- El foco sobrevive a los repintados de Control ----- */
const selIni = t => { try { return t.selectionStart; } catch (_) { return null; } };
const selFin = t => { try { return t.selectionEnd; } catch (_) { return null; } };
function devolverFoco() {
  if (!_el || !_foco) return;
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;               // alguien más tiene el foco
  const t = _el.querySelector('#' + CSS.escape(_foco.id));
  if (!t) return;
  try { t.focus({ preventScroll: true }); if (_foco.ini != null) t.setSelectionRange(_foco.ini, _foco.fin); } catch (_) { /* no todos los campos tienen selección */ }
}
function enfocar(sel) {
  const t = _el && _el.querySelector(sel);
  if (t) { try { t.focus({ preventScroll: false }); } catch (_) {} }
}
