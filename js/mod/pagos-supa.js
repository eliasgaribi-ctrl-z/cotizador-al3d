/* ============================================================================
   REGISTRAR EN SUPABASE — las pantallas de Pagos (y Dirección).

   La interfaz que faltaba sobre las funciones de la base (docs/DECISIONES-SUPABASE.md, Q-01 y
   §C): registrar un cobro o fijar el anticipo, registrar un abono de comisión, repartir un
   depósito entre las comisiones pendientes (de la más antigua a la más nueva) y corregir. Los
   libros son solo-agregar: una corrección de abono es un renglón NUEVO; la de liquidación es un
   valor absoluto que la base anota en su bitácora con el valor de antes.

   Dónde vive: una pestaña más de Control, que Control SOLO pinta con el interruptor de Supabase
   encendido en este aparato (el de Ajustes, `al3d_pf_supa`). Apagado, Control tiene sus pestañas de
   siempre y este archivo ni se descarga. Los formularios solo salen con sesión de Supabase y con el
   área que diga LA BASE (Dirección o Pagos); el área de este aparato no da permisos. Fabricación no
   tiene Control, y si llegara, aquí no se pinta nada ni se pide una sola cifra.

   Dos modos, y los decide la EMPRESA (`empresas.modo`, docs/BASE-MANDA.md), no un interruptor de esta
   pestaña:
     · con la HOJA mandando es la prueba de siempre, «Registrar (Supabase)»: escribe en la base, la hoja
       sigue siendo la que manda y la pantalla lo dice («regístralo también allá»);
     · con la BASE mandando (paso 5) es «Cobros y abonos», donde de verdad se cobra: Dirección y Pagos
       la tienen sin encender nada más; ya no dice que se registre en la hoja (está en solo lectura);
       suma la VENTA SIN COTIZACIÓN (`alta_venta`: el V-### de la base); relee los saldos cuando otro
       teléfono registra algo (Realtime: el aviso `al3d-base-cambio` de js/datos/supa-enchufe.js) y al
       volver a la pestaña; y no ofrece «Apagar Supabase», que dejaría a este teléfono escribiendo en
       una hoja que ya no manda.

   Lo que la pantalla le garantiza a quien cobra:
     · pregunta antes de cada asiento, con el monto y lo que va a pasar; lo raro (un cobro de más, una
       venta ya liquidada, un reparto, que no se deshace) se pregunta con el botón de peligro;
     · el doble envío es imposible: el botón se apaga mientras va, y el op_id nace UNA vez por
       formulario y se reusa en cada reintento (js/datos/pagos-supa.js). Si no hubo respuesta,
       «Reintentar» manda lo mismo con el mismo op_id; cambiar los datos de un envío incierto
       pide confirmación porque el primero pudo haber llegado;
     · el reparto que se confirma es el que se vio: justo antes de preguntar se vuelve a calcular,
       y si otro teléfono abonó en medio se enseña el nuevo y no se manda nada;
     · lo escrito no se tira: cada tecla se guarda en un borrador de la pestaña (memoria y
       sessionStorage) y vuelve aunque Control se repinte o se recargue la página;
     · errores claros, junto a su campo (rojo, `role="alert"`, `aria-invalid`), y los de la
       base dicen si se registró algo o no.

   «DATOS DE LA VENTA» (paso 6, decidido por Elías el 2026-10-25): Dirección corrige el nombre, el
   subtotal, la cuenta, el estatus, la fecha de liquidación, el % pactado o el IVA de una venta, que
   antes solo se podía desde el Editor SQL. Solo con la base mandando y solo Dirección (Pagos y
   Fabricación ni ven la pestaña del formulario). Cada campo arranca con lo que tiene la base y se manda
   solo lo que cambió (`corregir_venta`); la pregunta dice de cuánto a cuánto y cómo quedan el neto, el
   saldo y la comisión, con el botón de peligro si cambia el dinero. Justo antes de preguntar se vuelve a
   leer la venta: si otro teléfono la cambió en medio, se enseña lo nuevo y no se manda nada; si la base
   ya tiene esos datos (el envío anterior sí llegó), tampoco. Queda una línea en la bitácora de la base
   (nivel dinero, con lo de antes) y otra en la de este teléfono (Control → Bitácora).
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';
import * as PS from '../datos/pagos-supa.js';
/* Quién manda, con la regla de supa.js (interruptor encendido Y el último modo oído en 'base'). Importarlo aquí no
   carga nada de más: esta pestaña solo existe con el interruptor encendido, y supa.js no baja supabase-js hasta
   que se le pide el cliente. */
import { laBaseManda } from '../nucleo/supa.js';
import { esc, ico, toast, voz, segmento, confirmarPf, hoyISO } from '../nucleo/ui.js';

let _el = null;                 // el contenedor de ahora (Control lo recrea en cada repintado)
let _vista = 'esperando';       // lo que dice PS.queMostrar
let _acceso = null;
let _ventas = null;             // las ventas de la base, o null si no se han leído
let _ventasMsg = '';
let _leidasEn = 0;              // cuándo se leyeron (para no releer en cada repintado de Control)
let _cargando = null;
let _form = 'cobro';
let _b = null;                  // los borradores, uno por formulario
let _vp = null;                 // la vista previa del reparto { monto, filas, sobrante, … }
let _enviando = false;
let _preparando = false;        // el reparto se está volviendo a calcular antes de preguntar
let _releer = false;            // la base cambió mientras alguien escribía: se relee al soltar el campo
let _oyeLaBase = false;
let _sincronizar = null;        // la sincronización de la app (Control la pasa): una venta nueva baja en el acto
const _aviso = {};              // por formulario: { tono: 'ok'|'mal'|'av', texto, incierto }
let _foco = null;               // { id, ini, fin } del campo enfocado, para devolverlo tras un repintado

const NOMBRE = { cobro: 'Cobro o anticipo', abono: 'Abono de comisión', reparto: 'Repartir un depósito', correccion: 'Corregir',
  venta: 'Venta sin cotización', datos: 'Datos de la venta' };
const AREA = { direccion: 'Dirección', pagos: 'Pagos', fabricacion: 'Fabricación' };
const CAMPOS = ['proyecto', 'que', 'monto', 'fecha', 'nota', 'nombre', 'cuenta', 'estatus', 'tipos', 'subtotal', 'anticipo', 'cita',
  'tel', 'entrega', 'dir', 'maps', 'iva', 'fliq', 'pct', 'cambios'];
const MS_RELEER = 3000;

const enBase = () => laBaseManda();

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
  const base = enBase();
  const cab = '<div class="card pg-supa-card"><div class="card-h"><h2>' + ico('i-nube') + ' ' +
    (base ? 'Cobros y abonos' : 'Registrar en Supabase') + '</h2></div><div class="card-b">' +
    (base
      ? '<p class="hintnote nota-ok">Esto queda en la base y lo ven al momento los teléfonos de Dirección y Pagos. Un asiento no se ' +
        'borra: si algo quedó mal, se corrige con otro.</p>'
      : '<p class="hintnote nota-av">Esto escribe en <b>Supabase</b>, la base nueva, no en la hoja. La hoja sigue siendo la que manda: ' +
        'lo que registres aquí regístralo también allá.</p>');
  let cuerpo;
  if (_vista === 'esperando') cuerpo = '<p class="pf-nota" role="status">Preguntando a la base quién eres…</p>';
  else if (_vista === 'entrar') {
    cuerpo = '<p class="aj-p">Entra con tu cuenta de Google para que la base te reconozca.</p>' +
      '<div id="pg-google" class="aj-supa-google"></div>' +
      /* Con la base mandando no se ofrece apagar: este teléfono volvería a escribir en una hoja que ya no manda. */
      (base ? '' : '<div class="pf-acciones"><button type="button" class="btn btn-gho" data-pg-act="apagar">Apagar Supabase en este aparato</button></div>');
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

/**
 * Cuelga los oyentes del contenedor recién pintado y, si hace falta, pregunta a la base.
 * @param {Element} el
 * @param {{sincronizar?:function}} [o] la sincronización de la app, para que una venta nueva baje en el acto
 */
export function cablear(el, o = {}) {
  if (!el) return;
  if (o && typeof o.sincronizar === 'function') _sincronizar = o.sincronizar;
  const nuevo = el !== _el;
  _el = el;
  if (nuevo) {
    el.addEventListener('input', alEscribir);
    el.addEventListener('change', alEscribir);
    el.addEventListener('click', alClic);
    el.addEventListener('submit', alEnviar);
    el.addEventListener('focusin', ev => { const t = ev.target; if (t && t.id) _foco = { id: t.id, ini: selIni(t), fin: selFin(t) }; });
    el.addEventListener('focusout', () => { if (_releer) setTimeout(alCambiarLaBase, 0); });
  }
  /* Con la base mandando, otro teléfono puede cobrar mientras esta pestaña está abierta: el enchufe avisa
     (Realtime) y aquí se releen los saldos. Con la hoja mandando el aviso no llega y aquí no se relee nada. */
  if (!_oyeLaBase) {
    _oyeLaBase = true;
    try { globalThis.addEventListener('al3d-base-cambio', alCambiarLaBase); } catch (_) { /* sin ventana: las pruebas */ }
  }
  devolverFoco();
  if (_vista === 'entrar') pintarGoogle();
  if (!_cargando && (_vista === 'esperando' || (_vista === 'formularios' && _ventas === null))) cargar();
  /* Volver a la pestaña (o el remonte de Control tras una sincronización que trajo algo) relee los saldos. */
  else if (nuevo && enBase() && _vista === 'formularios' && !_cargando && Date.now() - _leidasEn > MS_RELEER) releer();
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
  _leidasEn = Date.now();
  if (r.ok) { _ventas = r.ventas; _ventasMsg = ''; } else { _ventas = _ventas || []; _ventasMsg = r.mensaje; }
}

/** Los saldos otra vez, sin volver a preguntar quién eres. */
function releer() {
  _releer = false;
  _cargando = (async () => { const Supa = await import('../nucleo/supa.js'); await leerVentas(Supa); })()
    .catch(() => { /* se queda lo de antes */ })
    .finally(() => { _cargando = null; repintar(); });
  return _cargando;
}

/* La base cambió (otro teléfono cobró, abonó o dio de alta una venta). Si alguien está escribiendo en un campo,
   se espera a que lo suelte: repintar le movería el cursor. Mientras se manda algo, también se espera. */
function alCambiarLaBase() {
  if (!enBase() || !_el || !_el.isConnected || _vista !== 'formularios') return;
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  const escribiendo = !!(a && _el.contains && _el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || ''));
  if (_enviando || _preparando || _cargando || escribiendo) { _releer = true; return; }
  releer();
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

/** Los formularios que se ven ahora: la venta sin cotización, solo con la base mandando y si la base la deja. */
const formularios = () => PS.formulariosDe({ baseManda: enBase(), acceso: _acceso });

function htmlFormularios() {
  const lista = formularios();
  if (!lista.includes(_form)) _form = 'cobro';
  const tabs = segmento(lista.map(v => ({ v, t: NOMBRE[v] })), _form, 'data-pg-form', 'Qué registrar');
  const aviso = _ventasMsg ? '<p class="hintnote nota-mal" role="alert">' + esc(_ventasMsg) + '</p>' : '';
  const quien = _acceso && _acceso.correo ? '<p class="pf-nota">Como <b>' + esc(_acceso.correo) + '</b> · ' + esc(AREA[_acceso.area] || '') + '</p>' : '';
  let f;
  if (_form === 'venta') f = formVenta();                         // no necesita las ventas de la base
  else if (_ventas === null) f = '<p class="pf-nota" role="status">Leyendo las ventas de la base…</p>';
  else if (_form === 'abono') f = formAbono();
  else if (_form === 'reparto') f = formReparto();
  else if (_form === 'correccion') f = formCorreccion();
  else if (_form === 'datos') f = formDatos();
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
    : t === 'datos' ? 'subtotal ' + PS.pesosDe(v.subtotal) + (v.cuenta ? ' · ' + v.cuenta : '')
    : 'saldo ' + PS.pesosDe(v.saldo) + ', comisión ' + PS.pesosDe(v.restante);
}
function detalleVenta(t, v) {
  if (!v) return '';
  /* Lo que la base tiene AHORA (se repinta cuando otro teléfono la cambia): contra esto se ve lo que se va a corregir. */
  if (t === 'datos') {
    return 'En la base: subtotal ' + PS.pesosDe(v.subtotal) + ' · ' + (v.iva ? 'con IVA' : 'sin IVA') + ' · neto ' + PS.pesosDe(v.neto) +
      ' · cuenta ' + esc(v.cuenta || 'sin cuenta') + ' · ' + esc(v.estatus || 'sin estatus') +
      (v.fechaLiquidacion ? ' · liquidada el ' + esc(v.fechaLiquidacion) : '') + (v.pct != null ? ' · ' + esc(String(v.pct)) + ' % pactado' : '') +
      '<br>Anticipo ' + PS.pesosDe(v.anticipo) + ' · liquidación ' + PS.pesosDe(v.liquidacion) + ' · saldo ' + PS.pesosDe(v.saldo) +
      ' · comisión ' + PS.pesosDe(v.comision) + ' (abonado ' + PS.pesosDe(v.abonado) + ')';
  }
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
    (o.largo ? ' maxlength="' + o.largo + '"' : '') + (o.pista ? ' placeholder="' + esc(o.pista) + '"' : '') +
    ' autocomplete="off" value="' + esc(valor == null ? '' : valor) + '"' +
    ' aria-describedby="' + idDe(t, k) + '-m' + (o.ayuda ? ' ' + idDe(t, k) + '-a' : '') + '">' +
    (o.ayuda ? '<p class="pf-nota pg-ayuda" id="' + idDe(t, k) + '-a">' + o.ayuda + '</p>' : '') + msg(t, k) + '</div>';
}

function campoLista(t, k, etiqueta, opciones, valor, vacio) {
  return '<div class="fld" data-pg-fld="' + k + '"><label for="' + idDe(t, k) + '">' + etiqueta + '</label>' +
    '<select id="' + idDe(t, k) + '" data-pg-campo="' + k + '" aria-describedby="' + idDe(t, k) + '-m">' +
    (vacio ? '<option value="">' + esc(vacio) + '</option>' : '') +
    opciones.map(o => '<option value="' + esc(o.v) + '"' + (o.v === valor ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') +
    '</select>' + msg(t, k) + '</div>';
}

function htmlAviso(t) {
  const a = _aviso[t];
  if (!a) return '<div class="pg-aviso" id="pg-' + t + '-aviso" tabindex="-1"></div>';
  const extra = a.incierto && borradores()[t].incierto
    ? '<div class="pf-acciones pg-incierto"><button type="submit" class="btn btn-pri">Reintentar con los mismos datos</button>' +
      '<button type="button" class="btn btn-gho" data-pg-act="olvidar">' + (t === 'datos' ? 'Empezar otra corrección' : 'Empezar otro asiento') + '</button></div>' : '';
  return '<div class="pg-aviso" id="pg-' + t + '-aviso" tabindex="-1"><p class="hintnote nota-' + a.tono + '"' +
    (a.tono === 'ok' ? ' role="status"' : ' role="alert"') + '>' + esc(a.texto) + '</p>' + extra + '</div>';
}

function boton(t, texto) {
  const ocupado = _enviando || _preparando;
  return '<div class="pf-acciones"><button type="submit" class="btn btn-pri" data-pg-enviar' + (ocupado ? ' disabled aria-busy="true"' : '') + '>' +
    (ocupado ? 'Enviando…' : texto) + '</button></div>';
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
    'Lo que sobra no se aplica. Un reparto no se deshace.</p>' +
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

/* Los datos de una venta (paso 6): solo Dirección, solo con la base mandando. Cada campo arranca con lo que la base tiene ahora
   (`PS.valoresDeLaVenta`) mientras no se toque; lo tocado se guarda en el borrador. Se manda solo lo que cambió. */
function formDatos() {
  const t = 'datos', c = borradores()[t].campos;
  const v = venta(c.proyecto);
  const ahora = PS.valoresDeLaVenta(v);
  const val = k => (c[k] !== undefined && c[k] !== null ? c[k] : (ahora[k] !== undefined ? ahora[k] : ''));
  const campos = !v ? '' :
    campoTexto(t, 'nombre', 'Nombre de la venta', val('nombre'), { largo: PS.TOPE_NOMBRE_VENTA }) +
    '<div class="pg-dos">' +
      campoTexto(t, 'subtotal', 'Subtotal (sin IVA)', val('subtotal'), { decimal: true, ayuda: 'El neto y la comisión (10 %) salen de él.' }) +
      campoLista(t, 'cuenta', 'Cuenta de cobro', PS.CUENTAS.map(x => ({ v: x, t: x })), val('cuenta'), v.cuenta ? '' : 'Sin cuenta') +
    '</div>' +
    '<p class="pf-nota" id="pg-datos-iva-nota">' + esc(notaIva(val('cuenta'))) + '</p>' +
    '<div class="pg-dos">' +
      campoLista(t, 'estatus', 'Estatus', PS.ESTATUS.map(x => ({ v: x, t: x })), val('estatus'), v.estatus ? '' : 'Sin estatus') +
      campoLista(t, 'iva', 'IVA', [{ v: 'si', t: 'Con IVA (16 %)' }, { v: 'no', t: 'Sin IVA' }], val('iva')) +
    '</div>' +
    '<p class="pf-nota">El IVA lo pone la cuenta; a mano, solo en una venta LIQUIDADA.</p>' +
    '<div class="pg-dos">' +
      campoTexto(t, 'fliq', 'Fecha de liquidación', val('fliq'), { tipo: 'date', max: hoy(), ayuda: 'Vacía: sin fecha.' }) +
      campoTexto(t, 'pct', '% de comisión pactado', val('pct'), { pista: '10', largo: 6,
        ayuda: 'Informativo: la comisión se calcula siempre al 10 % del subtotal. Vacío: sin porcentaje.' }) +
    '</div>';
  return '<form class="pg-form" data-pg-tipo="datos" novalidate>' +
    '<p class="pf-nota">Para lo que quedó mal en una venta: el nombre, el subtotal, la cuenta, el estatus, el IVA, la fecha de liquidación o el % ' +
    'pactado. Cada campo trae lo que tiene la base; se manda solo lo que cambies, y antes se pregunta con lo de antes y lo de después. El anticipo ' +
    'se fija en «Cobro o anticipo» y la liquidación en «Corregir».</p>' +
    selectVenta(t, c, () => 0) + campos + msg(t, 'cambios') +
    boton(t, 'Corregir la venta…') + htmlAviso(t) + '</form>';
}

/* La venta sin cotización (paso 5): lo mismo que pide «Registrar nueva venta» de la hoja, con las reglas de
   `alta_venta`. El IVA no se pregunta: lo decide la cuenta, como en la base. */
const notaIva = cuenta => !cuenta ? 'El IVA lo decide la cuenta: ' + PS.CUENTA_SIN_IVA + ' no lleva; las demás, sí (16 %).'
  : cuenta === PS.CUENTA_SIN_IVA ? 'Con esta cuenta la venta va sin IVA.' : 'Con esta cuenta la venta lleva IVA (16 %).';

function formVenta() {
  const t = 'venta', c = borradores()[t].campos;
  const entrega = PS.ENTREGAS.includes(c.entrega) ? c.entrega : '';
  const tipos = Array.isArray(c.tipos) ? c.tipos : [];
  return '<form class="pg-form" data-pg-tipo="venta" novalidate>' +
    '<p class="pf-nota">Una venta que no salió del cotizador (la de «Registrar nueva venta» de la hoja). La base le da el siguiente ' +
    'V-### y llega sola a todos los teléfonos.</p>' +
    campoTexto(t, 'nombre', 'Proyecto', c.nombre, { largo: PS.TOPE_NOMBRE, pista: 'Cliente - Negocio' }) +
    '<div class="pg-dos">' +
      campoLista(t, 'cuenta', 'Cuenta de cobro', PS.CUENTAS.map(x => ({ v: x, t: x })), c.cuenta || '', 'Elige la cuenta…') +
      campoLista(t, 'estatus', 'Estatus', PS.ESTATUS.map(x => ({ v: x, t: x })), c.estatus || 'FABRICACION') +
    '</div>' +
    '<p class="pf-nota" id="pg-venta-iva">' + esc(notaIva(c.cuenta)) + '</p>' +
    '<fieldset class="fld pg-tipos" data-pg-fld="tipos"><legend>Tipo de trabajo <small>(opcional; uno o varios)</small></legend>' +
      PS.TIPOS.map((x, i) => '<label class="pg-tipo"><input type="checkbox" id="' + idDe(t, 'tipos') + (i ? '-' + i : '') +
        '" data-pg-campo="tipos" value="' + esc(x) + '"' + (tipos.includes(x) ? ' checked' : '') + '> ' + esc(x) + '</label>').join('') +
      msg(t, 'tipos') + '</fieldset>' +
    '<div class="pg-dos">' +
      campoTexto(t, 'subtotal', 'Subtotal (sin IVA)', c.subtotal, { decimal: true }) +
      campoTexto(t, 'anticipo', 'Anticipo recibido', c.anticipo, { decimal: true, ayuda: 'Vacío es cero.' }) +
    '</div>' +
    '<div class="pg-dos">' +
      campoTexto(t, 'fecha', 'Fecha del anticipo', c.fecha, { tipo: 'date', max: hoy(), ayuda: 'Vacía es hoy.' }) +
      campoTexto(t, 'cita', 'Fecha de instalación', c.cita, { tipo: 'date', ayuda: 'Opcional.' }) +
    '</div>' +
    '<h3 class="aj-sub">Datos para la entrega</h3>' +
    '<div class="pg-dos">' +
      campoTexto(t, 'tel', 'Teléfono del cliente', c.tel, { tipo: 'tel', largo: 30, pista: '33 1234 5678', ayuda: '10 dígitos o más.' }) +
      campoLista(t, 'entrega', 'Cómo se entrega', PS.ENTREGAS.map(x => ({ v: x, t: PS.ENTREGA_NOMBRE[x] })), entrega, 'Elige…') +
    '</div>' +
    (entrega === 'recoleccion'
      ? '<p class="pf-nota">Lo recoge en el taller: no hace falta la dirección del cliente.</p>'
      : campoTexto(t, 'dir', entrega === 'paqueteria' ? 'Destino del envío' : 'Dirección', c.dir,
        { largo: PS.TOPE_DIRECCION, pista: 'Calle y número, colonia, ciudad', ayuda: 'Opcional: se puede completar después.' })) +
    (entrega === 'instalacion' ? campoTexto(t, 'maps', 'Liga de Maps (opcional)', c.maps, { largo: PS.TOPE_LIGA, pista: 'https://maps.app.goo.gl/…', ayuda: 'La de WhatsApp sirve.' }) : '') +
    boton(t, 'Registrar venta…') + htmlAviso(t) + '</form>';
}

/* ============================================================================
   Escribir, tocar y enviar
   ============================================================================ */

function formDe(n) { const f = n && n.closest && n.closest('form[data-pg-tipo]'); return f ? f.dataset.pgTipo : ''; }

function alEscribir(ev) {
  const t = ev.target, k = t && t.dataset && t.dataset.pgCampo, tipo = formDe(t);
  if (!k || !tipo) return;
  /* Otra venta en «Datos de la venta»: sus campos arrancan otra vez con lo que tiene la base (lo tecleado era de la otra). */
  if (tipo === 'datos' && k === 'proyecto') {
    if (borradores().datos.campos.proyecto === t.value) return;
    borradores().datos.campos = { proyecto: t.value };
    delete _aviso.datos;
    guardar(); repintar();
    return;
  }
  const c = borradores()[tipo].campos;
  const antes = c[k];
  if (k === 'liquidar') { c.liquidar = !!t.checked; c.liquidarTocado = true; }
  else if (k === 'tipos') {
    const l = Array.isArray(c.tipos) ? c.tipos.slice() : [];
    const i = l.indexOf(t.value);
    if (t.checked && i < 0) l.push(t.value);
    if (!t.checked && i >= 0) l.splice(i, 1);
    c.tipos = l;
  } else c[k] = t.value;
  limpiarError(t.closest('form'), tipo, k);
  if (tipo === 'reparto' && k === 'monto' && _vp) { _vp = null; const p = _el && _el.querySelector('#pg-reparto-previa'); if (p) p.innerHTML = ''; }
  if (k === 'proyecto') { const d = _el && _el.querySelector('#' + idDe(tipo, 'venta')); if (d) d.innerHTML = detalleVenta(tipo, venta(c.proyecto)); }
  if (tipo === 'cobro' && (k === 'monto' || k === 'proyecto') && !c.liquidarTocado) {
    const ck = _el && _el.querySelector('form[data-pg-tipo="cobro"] [data-pg-campo="liquidar"]');
    if (ck) ck.checked = PS.sugerirLiquidar(venta(c.proyecto), c.monto);
  }
  if (tipo === 'venta' && k === 'cuenta') { const n = _el && _el.querySelector('#pg-venta-iva'); if (n) n.textContent = notaIva(c.cuenta); }
  if (tipo === 'datos' && k === 'cuenta') { const n = _el && _el.querySelector('#pg-datos-iva-nota'); if (n) n.textContent = notaIva(c.cuenta); }
  guardar();
  /* La entrega decide qué se pide (dirección, destino o nada; la liga solo si se instala), como el diálogo de la hoja. */
  if (tipo === 'venta' && k === 'entrega' && antes !== c.entrega) repintar();
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
  else if (act === 'apagar' && !enBase()) {
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
  const datos = _form === 'datos';
  const si = await confirmarPf({ titulo: datos ? '¿Empezar otra corrección?' : '¿Empezar otro asiento?', peligro: true, si: 'Empezar otro', no: 'Cancelar',
    texto: datos
      ? 'No sabemos si la corrección anterior llegó. Antes de empezar otra, revisa lo que tiene la venta en la base (Volver a leer las ventas).'
      : 'No sabemos si el envío anterior llegó. Si llegó y vuelves a mandar lo mismo como asiento nuevo, quedará DOS veces. ' +
        'Antes revisa el saldo de la venta (Volver a leer las ventas).' });
  if (!si) return;
  const proyecto = borradores()[_form].campos.proyecto;
  borradores()[_form] = PS.borradorNuevo(_form);
  if (datos && proyecto) borradores().datos.campos.proyecto = proyecto;        // la venta sigue elegida, con lo que tiene la base
  delete _aviso[_form];
  guardar(); repintar();
}

function alEnviar(ev) {
  ev.preventDefault();
  const tipo = formDe(ev.target);
  if (tipo) enviarForm(tipo, ev.target);
}

/**
 * El reparto que se confirma es el que se vio: se vuelve a calcular justo antes de preguntar. Si otro teléfono
 * abonó en medio, cambia, se enseña el nuevo y no se manda nada. Devuelve true si se puede seguir.
 */
async function repartoAlDia(form, monto) {
  _preparando = true;
  let r;
  try {
    const Supa = await import('../nucleo/supa.js');
    r = await PS.vistaPrevia(await Supa.cliente(), monto);
  } catch (e) {
    r = { ok: false, mensaje: 'La base no contestó. Vuelve a tocar «Repartir…».' };
  } finally { _preparando = false; }
  if (!r.ok) { marcarError(form, 'reparto', 'monto', r.mensaje, true); return false; }
  if (PS.mismoReparto(_vp, r.data)) return true;
  _vp = r.data;
  _aviso.reparto = { tono: 'av', texto: 'El reparto cambió desde que lo viste (alguien registró un abono). Revisa el de ahora y vuelve a tocar «Repartir…». No se repartió nada.' };
  repintar();
  enfocar('#pg-reparto-aviso');
  return false;
}

async function enviarForm(tipo, form) {
  if (_enviando) return;                                              // el doble envío: uno a la vez
  if (_preparando) return;
  const b = borradores()[tipo];
  const c = { ...b.campos };
  const v = venta(c.proyecto);
  if (tipo === 'cobro' && !c.liquidarTocado) c.liquidar = PS.sugerirLiquidar(v, c.monto);
  if (tipo === 'correccion' && (!_acceso || _acceso.area !== 'direccion')) c.que = 'liquidacion';
  /* La venta, la de AHORA en cada armado: «Datos de la venta» la vuelve a leer antes de preguntar. */
  const armar = () => PS.plan(tipo, c, { opId: b.opId, hoy: hoy(), venta: venta(c.proyecto), area: _acceso && _acceso.area, vistaPrevia: _vp,
    baseManda: enBase(), ahora: Date.now() });
  let p = armar();
  for (const k of CAMPOS) limpiarError(form, tipo, k);
  /* Una corrección que se mandó sin respuesta y que la base ya tiene (la pantalla la releyó): sí llegó. */
  if (tipo === 'datos' && !p.ok && p.sinCambios && b.incierto) { yaEstaba(c, true); return; }
  if (!p.ok) {
    for (const [k, frase] of Object.entries(p.errores)) marcarError(form, tipo, k, frase, false);
    const campo = form.querySelector('#' + idDe(tipo, p.primero));
    if (campo) campo.focus(); else voz(p.errores[p.primero], true);
    return;
  }
  if (PS.opIdPara(b, p).cambio) {
    const si = await confirmarPf({ titulo: 'Cambiaste los datos de un envío que no sabemos si llegó', peligro: true,
      si: tipo === 'datos' ? 'Mandar la corrección nueva' : 'Mandarlo como asiento nuevo', no: 'Cancelar',
      texto: tipo === 'datos'
        ? 'Si la corrección anterior sí llegó, la venta ya tiene aquellos datos y esto la vuelve a corregir con los nuevos. Antes revisa lo que tiene la venta.'
        : 'Si el envío anterior sí llegó, esto registra OTRO asiento además de aquel. Antes revisa el saldo de la venta.' });
    if (!si) return;
    PS.renovar(b); guardar();
    p = armar();
  }
  /* El reintento de un envío incierto va con el MISMO op_id: si ya había llegado, la base contesta lo de la primera
     vez y no reparte ni suma otra vez. Solo un envío nuevo se vuelve a calcular antes de preguntar. */
  const reintento = !!b.incierto;
  if (tipo === 'reparto' && !reintento) {
    if (!await repartoAlDia(form, c.monto)) return;
    p = armar();
    if (!p.ok) return;
  }
  /* La corrección que se confirma es sobre lo que la base tiene AHORA (también en el reintento: así se sabe si el primero llegó). */
  if (tipo === 'datos') {
    const q = await datosAlDia(c, p);
    if (!q) return;
    p = q;
  }
  if (!await confirmarPf({ titulo: p.titulo, si: p.si, no: 'Cancelar', peligro: !!p.peligro,
    texto: (reintento ? 'Es el REINTENTO del envío anterior, con el mismo número de operación: si ya había llegado, no se registra otra vez. ' : '') + p.texto })) return;
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
  /* La venta corregida sigue elegida: se ve con lo que la base dejó (y se puede corregir otra cosa). */
  if (r.ok && tipo === 'datos') { borradores().datos.campos.proyecto = c.proyecto; anotarCorreccion(p, v); }
  _enviando = false;
  guardar();
  if (r.ok) {
    toast(_aviso[tipo].texto, 'ok', 4000);
    /* Una venta nueva baja a este teléfono en el acto (Proyectos, Control, la agenda); los demás la reciben por Realtime. */
    if (tipo === 'venta' && _sincronizar) { try { _sincronizar(); } catch (_) { /* la siguiente vuelta la trae */ } }
    /* Y una corregida, igual: el nombre, el subtotal o la cuenta de este teléfono se ponen al día sin esperar el aviso. */
    if (tipo === 'datos' && _sincronizar) { try { _sincronizar(); } catch (_) { /* la siguiente vuelta la trae */ } }
    try { const Supa = await import('../nucleo/supa.js'); await leerVentas(Supa); } catch (_) { /* se queda lo de antes */ }
  }
  repintar();
  enfocar('#pg-' + tipo + '-aviso');
  if (_releer) alCambiarLaBase();
}

/**
 * «Datos de la venta»: la corrección que se confirma es sobre lo que la base tiene AHORA. Se vuelve a leer la venta justo antes de
 * preguntar y se arma el plan otra vez (`PS.correccionAlDia`): si otro teléfono cambió en medio alguno de los campos que se corrigen, se
 * enseña lo nuevo y no se manda nada; si la base ya tiene lo que se quiere poner, tampoco (el envío anterior sí llegó, u otro teléfono puso
 * lo mismo). Sin poder leer, no se pregunta. Devuelve el plan de ahora, o null.
 */
async function datosAlDia(c, p) {
  _preparando = true;
  let leida = false;
  try {
    const Supa = await import('../nucleo/supa.js');
    await leerVentas(Supa);
    leida = !_ventasMsg;
  } catch (_) { leida = false; } finally { _preparando = false; }
  if (!leida) {
    _aviso.datos = { tono: 'mal', texto: 'La base no contestó y no se pudo revisar la venta antes de corregirla. Vuelve a tocar «Corregir la venta…». No se mandó nada.' };
    repintar(); enfocar('#pg-datos-aviso');
    return null;
  }
  const b = borradores().datos;
  const q = PS.plan('datos', c, { opId: b.opId, hoy: hoy(), venta: venta(c.proyecto), area: _acceso && _acceso.area, baseManda: enBase() });
  const al = PS.correccionAlDia(p, q);
  if (al === 'seguir') return q;
  if (al === 'ya_estaba') { yaEstaba(c, !!b.incierto); return null; }
  _aviso.datos = { tono: 'av', texto: 'La venta cambió en la base desde que la abriste (alguien la corrigió desde otro teléfono). Revisa lo que tiene ' +
    'ahora y vuelve a tocar «Corregir la venta…». No se mandó nada.' };
  repintar(); enfocar('#pg-datos-aviso');
  return null;
}

/* La base ya tiene lo que se quería poner: no se manda nada. Con un envío sin respuesta de por medio, es que sí llegó. */
function yaEstaba(c, llego) {
  borradores().datos = PS.borradorNuevo('datos');
  borradores().datos.campos.proyecto = c.proyecto;
  _aviso.datos = llego
    ? { tono: 'ok', texto: 'La corrección sí había llegado: la base ya tiene esos datos. No se mandó otra vez.' }
    : { tono: 'av', texto: 'La base ya tiene esos datos (alguien los corrigió igual desde otro teléfono). No se mandó nada.' };
  guardar(); repintar(); enfocar('#pg-datos-aviso');
}

/* La línea de este teléfono en Control → Bitácora (la de la base, con lo de antes, la escribe `corregir_venta`). Nunca estorba: si no se
   puede escribir, la corrección ya está en la base. */
async function anotarCorreccion(p, v) {
  try {
    const B = await import('../datos/bitacora.js');
    await B.anotar({ accion: 'cambio', entidad: 'proyecto', entidad_id: String(p.args.p_proyecto),
      titulo: 'Se corrigió ' + ((v && v.folio) || 'una venta') + (v && v.nombre ? ' · ' + v.nombre : ''),
      detalle: (p.lineas || []).join(' · ') + ' (en la base)', antes: p.antes, despues: p.despues });
  } catch (_) { /* la corrección ya está en la base */ }
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
