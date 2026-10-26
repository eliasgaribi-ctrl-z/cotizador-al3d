/* ============================================================================
   FACTURAS — la pestaña de Control para las ventas fiscales (0027, 2026-10-25).

   Lo que pidió Elías: que las ventas que cobran en una cuenta fiscal —ConstruImagen (Constru BNT), Mónica
   (Moni MPago) y Tanit (Tatis BNT)— tengan «un apartado para ver la constancia de situación fiscal y dos
   checkbox: la factura por el anticipo y la factura por la liquidación del proyecto». Lo que decidió: la
   constancia es del CLIENTE (por RFC), no del proyecto; la ven, la suben y marcan las casillas Dirección y
   Pagos; Fabricación no ve nada de esto, nunca. Ver docs/DINERO-Y-FACTURAS.md.

   Dónde vive: una pestaña de Control que SOLO existe con la base mandando y para Dirección y Pagos (la decide
   `tabs()` de js/mod/control.js, que la carga con import() la primera vez que se abre). Con la hoja mandando
   este archivo ni se descarga. Lo que enseña lo lee de la BASE en vivo (js/datos/facturas.js), como «Cobros y
   abonos»: un RFC no se queda guardado en ningún teléfono. Si la base dice que el área no es Dirección ni Pagos,
   no se pide ni una fila.

   Tres vistas:
     · «Pendientes de factura» (la de entrada): las ventas fiscales del periodo a las que les falta la factura
       de lo que ya se cobró (el anticipo, la liquidación o las dos);
     · «Todas»: las ventas fiscales del periodo;
     · «Clientes»: cada RFC con su razón social, su constancia y sus ventas, y el alta de uno nuevo.
   Cada venta enseña su cliente fiscal (RFC y razón social), si su constancia está o falta (con «Ver», que la
   abre con una URL firmada de cinco minutos), y las dos casillas con quién y cuándo se marcaron. Marcar no
   pregunta; desmarcar sí, con el botón de peligro. El cliente y la constancia se cambian en un panel (la capa
   de siempre, `#pf-pide`): el RFC (con los que ya existen a la mano), la razón social si es nuevo, y la
   constancia en PDF o foto, de hasta 5 MB.

   Lo que se le garantiza a quien la usa (como en «Cobros y abonos»):
     · uno a la vez: mientras algo va, la casilla o el botón se apagan;
     · el op_id nace una vez por acción y se reusa al reintentar (la base contesta lo mismo y no escribe dos veces);
     · lo que no contestó la base se dice como incierto, nunca como «no se guardó»; y después de cada respuesta
       la lista se vuelve a leer, así que lo que se ve es lo que la base tiene;
     · si otro teléfono cambia el dinero (Realtime, `al3d-base-cambio`), la lista se relee cuando nadie escribe.
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';
import * as F from '../datos/facturas.js';
import { queMostrar } from '../datos/pagos-supa.js';
import { laBaseManda } from '../nucleo/supa.js';
import { $, esc, ico, money, toast, voz, segmento, confirmarPf, abrirCapa, cerrarCapa, hoyISO, vacio, fmtFecha } from '../nucleo/ui.js';

let _el = null;
let _vista = 'esperando';       // esperando | entrar | sin_permiso | lista (lo que dice queMostrar)
let _acceso = null;
let _datos = null;              // { ventas, clientes } leídos de la base, o null
let _msg = '';
let _leidasEn = 0;
let _cargando = null;
let _filtro = 'pendientes';     // pendientes | todas | clientes
let _periodo = '3m';            // mes | 3m | 12m | todo — el de la lista de Ventas de Control
let _busca = '';
let _enviando = new Map();      // las casillas que van: 'id|cual' → cómo van a quedar (se pintan así mientras la base contesta)
let _releer = false;
let _oye = false;
let _panel = null;              // el panel abierto en #pf-pide: { modo:'venta'|'cliente'|'nuevo', ventaId, rfc, opId, huella, ocupado, subida }
let _enlace = null;             // { ruta, url } — la constancia que no se pudo abrir sola: el enlace a la mano
let _espera = 0;
const MS_RELEER = 3000;
const AREA = { direccion: 'Dirección', pagos: 'Pagos', fabricacion: 'Fabricación' };
const PER = [{ v: 'mes', t: 'Este mes' }, { v: '3m', t: '3 meses' }, { v: '12m', t: '12 meses' }, { v: 'todo', t: 'Todo' }];
const nVentas = n => n + (n === 1 ? ' venta' : ' ventas');
/* El estatus de la venta en palabras y con su ficha de color, no el código de la base («FABRICACION»); y las fechas como en el resto
   de Control («22 oct 2026»), no unas «09/09/2026» junto a otras «22 oct 2026» (auditoría 2026-10-25, H-5). */
const ESTATUS = { FABRICACION: ['En fabricación', 'nada'], REPARANDO: ['Reparando', 'nada'], COBRANDO: ['Cobrando', 'falta'], LIQUIDADO: ['Liquidada', 'ok'] };
const chipEstatus = e => { const x = ESTATUS[e]; return x ? '<span class="pf-sem ' + x[1] + ' fx-sem">' + esc(x[0]) + '</span>' : (e ? esc(e) : ''); };
/* `F.diaDe` da el día de México de una marca de tiempo como «DD/MM/AAAA»; aquí, con el mes en letras. */
const diaCorto = iso => { const d = F.diaDe(iso), m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d); return m ? fmtFecha(m[3] + '-' + m[2] + '-' + m[1]) : d; };
const empresa = () => (_acceso && _acceso.empresa) || 'al3d';
const hoy = () => { try { return hoyISO(); } catch (_) { return ''; } };

/* ============================================================================
   Lo que Control llama
   ============================================================================ */

/** El HTML de la pestaña con lo que ya se sabe (sin esperar a la red). */
export function html() {
  if (_vista === 'nada') return '';
  const cab = '<div class="card fx-card"><div class="card-h"><h2>' + ico('i-venta') + ' Facturas y constancias</h2></div><div class="card-b">' +
    '<p class="pf-nota">Las ventas que cobran en una cuenta fiscal —ConstruImagen (Constru BNT), Mónica (Moni MPago) y Tanit (Tatis BNT)—, ' +
    'con su cliente fiscal, su constancia de situación fiscal y las dos facturas. Lo ven Dirección y Pagos; se guarda en la base.</p>';
  let cuerpo;
  if (_vista === 'esperando') cuerpo = '<p class="pf-nota" role="status">Preguntando a la base quién eres…</p>';
  else if (_vista === 'entrar') cuerpo = '<p class="hintnote nota-av">Entra a la base con tu cuenta de Google (Ajustes → La base de datos) para ver las facturas.</p>' +
    '<div class="pf-acciones"><button type="button" class="btn btn-gho" data-fx-act="recargar">Volver a preguntar</button></div>';
  else if (_vista === 'sin_permiso') {
    const a = _acceso || {};
    cuerpo = '<p class="hintnote nota-av">' + (a.correo ? '<b>' + esc(a.correo) + '</b>' : 'Esta cuenta') +
      (a.estado === 'activo' ? ' es de ' + esc(AREA[a.area] || a.area || 'otra área') : ' no está activa en la base') +
      '. Las facturas son de Dirección y Pagos.</p><div class="pf-acciones"><button type="button" class="btn btn-gho" data-fx-act="recargar">Volver a preguntar</button></div>';
  } else cuerpo = htmlLista();
  return cab + cuerpo + '</div></div>';
}

/** Cuelga los oyentes del contenedor recién pintado y, si hace falta, lee la base. */
export function cablear(el) {
  if (!el) return;
  const nuevo = el !== _el;
  _el = el;
  if (nuevo) {
    el.addEventListener('click', alClic);
    el.addEventListener('change', alCambiar);
    el.addEventListener('input', alEscribir);
    el.addEventListener('focusout', () => { if (_releer) setTimeout(alCambiarLaBase, 0); });
  }
  if (!_oye) {
    _oye = true;
    try { globalThis.addEventListener('al3d-base-cambio', alCambiarLaBase); } catch (_) { /* sin ventana: las pruebas */ }
    const pide = $('pf-pide');
    if (pide) { pide.addEventListener('click', alClicPanel); pide.addEventListener('change', alCambiarPanel); pide.addEventListener('input', alEscribirPanel); }
  }
  if (!_cargando && (_vista === 'esperando' || (_vista === 'lista' && _datos === null))) cargar();
  else if (nuevo && _vista === 'lista' && !_cargando && Date.now() - _leidasEn > MS_RELEER) releer();
}

/** Control se va: se suelta el contenedor y el panel (los filtros se quedan para la siguiente visita). */
export function soltar() {
  _el = null;
  if (_panel) cerrarPanel();
  const pide = $('pf-pide');
  if (_oye && pide) { pide.removeEventListener('click', alClicPanel); pide.removeEventListener('change', alCambiarPanel); pide.removeEventListener('input', alEscribirPanel); }
  try { globalThis.removeEventListener('al3d-base-cambio', alCambiarLaBase); } catch (_) { /* nada */ }
  _oye = false;
  clearTimeout(_espera);
}

/* ============================================================================
   Leer
   ============================================================================ */

function cargar() {
  _cargando = (async () => {
    const Supa = await import('../nucleo/supa.js');
    const encendido = Supa.encendido();
    const sesion = encendido ? await Supa.haySesion() : false;
    _acceso = sesion ? await Supa.acceso() : null;
    const v = queMostrar({ encendido, rolLocal: Prefs.rol(), sesion, acceso: _acceso });
    _vista = v === 'formularios' ? 'lista' : (v === 'esperando' ? 'sin_permiso' : v);
    if (_vista === 'lista') await leer(Supa);
  })().catch(e => { _vista = 'sin_permiso'; _acceso = { estado: 'desconocido', mensaje: String((e && e.message) || '') }; })
    .finally(() => { _cargando = null; repintar(); });
  return _cargando;
}
async function leer(Supa) {
  const r = await F.leer(await Supa.cliente(), empresa());
  _leidasEn = Date.now();
  if (r.ok) { _datos = { ventas: r.ventas, clientes: r.clientes }; _msg = ''; }
  else { _datos = _datos || { ventas: [], clientes: [] }; _msg = r.mensaje; }
  if (_panel) pintarPanel();
}
function releer() {
  _releer = false;
  _cargando = (async () => { const Supa = await import('../nucleo/supa.js'); await leer(Supa); })()
    .catch(() => { /* se queda lo de antes */ })
    .finally(() => { _cargando = null; repintar(); });
  return _cargando;
}
/* La base cambió (otro teléfono cobró o marcó algo). Si alguien escribe en el buscador, o algo va en camino, se espera. */
function alCambiarLaBase() {
  if (!laBaseManda() || !_el || !_el.isConnected || _vista !== 'lista') return;
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  const escribiendo = !!(a && _el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || '') && a.type !== 'checkbox');
  if (_enviando.size || _cargando || escribiendo || (_panel && _panel.ocupado)) { _releer = true; return; }
  releer();
}
function repintar() {
  if (!_el || !_el.isConnected) return;
  const a = document.activeElement;
  const enBusca = a && a.matches && a.matches('[data-fx-busca]') && _el.contains(a);
  const pos = enBusca ? a.selectionStart : null;
  _el.innerHTML = html();
  if (enBusca) { const b = _el.querySelector('[data-fx-busca]'); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch (_) {} } }
}

/* ============================================================================
   Pintar la lista
   ============================================================================ */

function htmlLista() {
  if (_datos === null) return '<p class="pf-nota" role="status">Leyendo las ventas fiscales de la base…</p>';
  const R = F.resumen(F.filtrar(_datos.ventas, { filtro: 'todas', periodo: _periodo, hoy: hoy() }));
  const quien = _acceso && _acceso.correo ? '<p class="pf-nota">Como <b>' + esc(_acceso.correo) + '</b> · ' + esc(AREA[_acceso.area] || '') + '</p>' : '';
  const cuentas = '<div class="pf-cuentas ct-tres fx-cuentas">' +
    '<p class="pf-cuenta ct-cuenta' + (R.pendientes ? ' urge' : '') + '"><b>' + R.pendientes + '</b><span class="pf-cuenta-t">Pendientes de factura</span>' +
      '<em>' + R.anticipo + ' del anticipo · ' + R.liquidacion + ' de la liquidación</em></p>' +
    '<p class="pf-cuenta ct-cuenta"><b>' + R.sinCliente + '</b><span class="pf-cuenta-t">Sin cliente fiscal</span><em>de ' + nVentas(R.n) + ' fiscales</em></p>' +
    '<p class="pf-cuenta ct-cuenta' + (R.sinConstancia ? ' urge' : '') + '"><b>' + R.sinConstancia + '</b><span class="pf-cuenta-t">Sin constancia</span><em>con cliente, sin su archivo</em></p>' +
  '</div>';
  const filtros = '<div class="ag-barra fx-barra">' +
    segmento([{ v: 'pendientes', t: 'Pendientes de factura' }, { v: 'todas', t: 'Todas' }, { v: 'clientes', t: 'Clientes' }], _filtro, 'data-fx-filtro', 'Qué ver') +
    (_filtro === 'clientes' ? '' : segmento(PER, _periodo, 'data-fx-periodo', 'Periodo (por la fecha del anticipo)')) +
    '<input type="search" class="ct-busca" data-fx-busca placeholder="' + (_filtro === 'clientes' ? 'Buscar por RFC, razón social o folio' : 'Buscar por nombre, folio, RFC o razón social') +
      '" value="' + esc(_busca) + '" aria-label="Buscar"></div>';
  const aviso = _msg ? '<p class="hintnote nota-mal" role="alert">' + esc(_msg) + '</p>' : '';
  const cuerpo = _filtro === 'clientes' ? htmlClientes() : htmlVentas();
  return quien + cuentas + filtros + aviso + cuerpo +
    '<div class="pf-acciones fx-pie"><button type="button" class="btn btn-gho" data-fx-act="recargar">Volver a leer la base</button></div>';
}

function htmlVentas() {
  const lista = F.filtrar(_datos.ventas, { filtro: _filtro, periodo: _periodo, hoy: hoy(), busca: _busca });
  if (!lista.length) {
    return vacio(_filtro === 'pendientes' ? 'Nada pendiente de factura' : 'Sin ventas fiscales en este periodo',
      _filtro === 'pendientes' ? 'Las ventas fiscales de este periodo ya tienen la factura de lo que se ha cobrado. Prueba con otro periodo o con «Todas».'
        : 'Cuando una venta cobre en Constru BNT, Moni MPago o Tatis BNT, aparece aquí. Prueba con otro periodo.');
  }
  return '<p class="pf-nota">' + esc(nVentas(lista.length)) + (_filtro === 'pendientes' ? ' con una factura pendiente' : '') + ', de la más nueva a la más vieja.</p>' +
    '<ul class="fx-lista">' + lista.map(filaVenta).join('') + '</ul>';
}

function filaVenta(v) {
  const csf = v.rfc ? (v.csf
    ? '<span class="pf-sem ok fx-sem">Constancia</span> <button type="button" class="fx-link" data-fx-ver="' + esc(v.csf.ruta) + '">Ver</button>' + enlace(v.csf.ruta)
    : '<span class="pf-sem falta fx-sem">Sin constancia</span>') : '';
  const cliente = v.rfc
    ? '<span class="fx-rfc">' + esc(v.rfc) + '</span>' + (v.razon ? ' · ' + esc(v.razon) : '') + ' ' + csf +
      ' <button type="button" class="fx-link" data-fx-panel="venta" data-fx-id="' + esc(v.id) + '">Cambiar</button>'
    : '<span class="pf-sem falta fx-sem">Sin cliente fiscal</span> <button type="button" class="fx-link" data-fx-panel="venta" data-fx-id="' + esc(v.id) + '">Asignar RFC</button>';
  return '<li class="fx-venta">' +
    '<div class="fx-cab"><span class="fx-nom">' + esc(v.nombre || 'Sin nombre') + '</span> <span class="folio">' + esc(v.folio) + '</span></div>' +
    '<p class="fx-meta">' + (v.estatus ? chipEstatus(v.estatus) + ' ' : '') + esc(v.cuenta) + (v.deQuien ? ' (' + esc(v.deQuien) + ')' : '') +
      ' · neto ' + esc(money(v.neto)) + '</p>' +
    '<p class="fx-cliente">' + cliente + '</p>' +
    '<div class="fx-casillas">' + casilla(v, 'anticipo') + casilla(v, 'liquidacion') + '</div>' +
  '</li>';
}

function casilla(v, cual) {
  const c = cual === 'anticipo' ? v.fa : v.fl;
  const monto = cual === 'anticipo' ? v.anticipo : v.liquidacion;
  const fecha = cual === 'anticipo' ? v.fechaAnticipo : v.fechaLiquidacion;
  const va = _enviando.has(v.id + '|' + cual);
  const marcada = va ? _enviando.get(v.id + '|' + cual) : c.marcada;
  const id = 'fx-c-' + cual + '-' + v.id.replace(/[^A-Za-z0-9_-]/g, '_');
  const falta = !marcada && monto > 0;
  const det = c.marcada ? 'hecha' + (c.por ? ' · ' + c.por : '') + (c.en ? ' · ' + diaCorto(c.en) : '')
    : (monto > 0 ? 'cobrado ' + money(monto) + (fecha ? ' · ' + fmtFecha(fecha) : '') : 'sin cobrar todavía');
  return '<label class="fx-casilla' + (marcada ? ' hecha' : '') + (falta ? ' falta' : '') + '" for="' + esc(id) + '">' +
    '<input type="checkbox" id="' + esc(id) + '" data-fx-marcar="' + cual + '" data-fx-id="' + esc(v.id) + '"' + (marcada ? ' checked' : '') + (va ? ' disabled aria-busy="true"' : '') + '>' +
    '<span class="fx-casilla-t">' + (cual === 'anticipo' ? 'Factura del anticipo' : 'Factura de la liquidación') + '<small>' + esc(va ? 'guardando…' : det) + '</small></span></label>';
}

function enlace(ruta) {
  return _enlace && _enlace.ruta === ruta
    ? ' <a class="fx-link" href="' + esc(_enlace.url) + '" target="_blank" rel="noopener noreferrer">Abrir la constancia (5 min)</a>' : '';
}

function htmlClientes() {
  const lista = F.filtrarClientes(_datos.clientes, _busca);
  const nuevo = '<div class="ct-gas-acc"><button type="button" class="btn btn-pri pf-btn-corto" data-fx-panel="nuevo">' + ico('i-mas') + ' Nuevo cliente fiscal</button></div>';
  if (!lista.length) return nuevo + vacio(_datos.clientes.length ? 'Nada con esa búsqueda' : 'Todavía no hay clientes fiscales',
    _datos.clientes.length ? 'Prueba con otra palabra.' : 'Se dan de alta al asignarle el RFC a una venta fiscal, o aquí con «Nuevo cliente fiscal».');
  return nuevo + '<ul class="fx-lista">' + lista.map(c => '<li class="fx-venta fx-cli">' +
    '<div class="fx-cab"><span class="fx-nom">' + esc(c.razon || 'Sin razón social') + '</span> <span class="fx-rfc">' + esc(c.rfc) + '</span></div>' +
    '<p class="fx-meta">' + (c.nVentas ? esc(nVentas(c.nVentas)) + ': ' + esc(c.ventas.slice(0, 6).join(', ')) + (c.ventas.length > 6 ? '…' : '') : 'sin ventas ligadas') + '</p>' +
    '<p class="fx-cliente">' + (c.csf
      ? '<span class="pf-sem ok fx-sem">Constancia</span> subida ' + esc(diaCorto(c.csf.subida)) + (c.csf.subio ? ' por ' + esc(c.csf.subio) : '') +
        ' <button type="button" class="fx-link" data-fx-ver="' + esc(c.csf.ruta) + '">Ver</button>' + enlace(c.csf.ruta)
      : '<span class="pf-sem falta fx-sem">Sin constancia</span>') +
      ' <button type="button" class="fx-link" data-fx-panel="cliente" data-fx-rfc="' + esc(c.rfc) + '">' + (c.csf ? 'Cambiar' : 'Subir constancia') + '</button></p>' +
    '</li>').join('') + '</ul>';
}

/* ============================================================================
   Tocar: filtros, casillas, ver la constancia
   ============================================================================ */

function alClic(ev) {
  const t = ev.target;
  const f = t.closest('[data-fx-filtro]');
  if (f) { _filtro = f.dataset.fxFiltro; repintar(); return; }
  const p = t.closest('[data-fx-periodo]');
  if (p) { _periodo = p.dataset.fxPeriodo; repintar(); return; }
  const a = t.closest('[data-fx-act]');
  if (a && a.dataset.fxAct === 'recargar') { _datos = null; _vista = 'esperando'; repintar(); cargar(); return; }
  const ver = t.closest('[data-fx-ver]');
  if (ver) { verConstancia(ver.dataset.fxVer); return; }
  const pa = t.closest('[data-fx-panel]');
  if (pa) abrirPanel(pa.dataset.fxPanel, pa.dataset.fxId || '', pa.dataset.fxRfc || '');
}

function alEscribir(ev) {
  const t = ev.target;
  if (!t || !t.matches || !t.matches('[data-fx-busca]')) return;
  _busca = t.value;
  clearTimeout(_espera);
  _espera = setTimeout(repintar, 220);
}

function alCambiar(ev) {
  const t = ev.target;
  if (!t || !t.matches || !t.matches('input[data-fx-marcar]')) return;
  marcar(t);
}

async function marcar(t) {
  const v = _datos && _datos.ventas.find(x => x.id === t.dataset.fxId);
  const cual = t.dataset.fxMarcar, quiere = t.checked, clave = (v ? v.id : '') + '|' + cual;
  if (!v || _enviando.has(clave)) { t.checked = !quiere; return; }
  const p = F.planMarcar(v, cual, quiere, F.nuevoOpId());
  if (!p.ok) { if (!p.sinCambio) t.checked = !quiere; return; }
  if (!p.sinPregunta) {
    t.checked = !quiere;                                         // hasta que conteste la pregunta, se queda como estaba
    if (!await confirmarPf({ titulo: p.titulo, texto: p.texto, si: p.si, no: 'Dejarla marcada', peligro: true })) return;
  }
  _enviando.set(clave, quiere);
  repintar();
  let r;
  try { const Supa = await import('../nucleo/supa.js'); r = await F.enviar(await Supa.cliente(), p); }
  catch (e) { r = { ok: false, incierto: true, mensaje: F.mensajeDe(p.rpc, { ok: false, incierto: true }) }; }
  _enviando.delete(clave);
  if (r.ok) {
    const que = cual === 'anticipo' ? 'del anticipo' : 'de la liquidación';
    voz((quiere ? 'Factura ' + que + ' marcada en ' : 'Factura ' + que + ' desmarcada en ') + v.folio);
  } else toast(r.mensaje, r.incierto ? '' : 'err', 6000);
  await releer();
}

async function verConstancia(ruta) {
  if (!ruta) return;
  /* La ventana se abre YA, dentro del toque: abrirla después de esperar a la red la bloquea el navegador del iPhone. Si aun así no se
     abre, se deja el enlace a la mano, junto al botón, para tocarlo. */
  let w = null;
  try { w = window.open('', '_blank'); } catch (_) { w = null; }
  const Supa = await import('../nucleo/supa.js');
  const r = await F.urlDeConstancia(await Supa.cliente(), ruta);
  if (!r.ok) { if (w) try { w.close(); } catch (_) {} toast(r.mensaje, 'err', 5000); return; }
  if (w) { try { w.opener = null; w.location.replace(r.url); return; } catch (_) { /* cae al enlace */ } }
  _enlace = { ruta, url: r.url };
  repintar();
  if (_panel) pintarPanel();
  toast('Toca «Abrir la constancia»: el navegador no la abrió solo.', '', 4000);
}

/* ============================================================================
   El panel del cliente fiscal (en la capa #pf-pide)
   ============================================================================ */

function abrirPanel(modo, ventaId, rfc) {
  if (!_datos) return;
  _panel = { modo, ventaId, rfc, opId: F.nuevoOpId(), huella: '', ocupado: false, subida: null, error: '', abierto: false };
  pintarPanel();
  abrirCapa('pf-pide', { hist: true });
  _panel.abierto = true;
}
function cerrarPanel() {
  _panel = null;
  const capa = $('pf-pide');
  if (capa && capa.querySelector('.fx-panel')) { cerrarCapa('pf-pide'); capa.innerHTML = ''; }       // solo si lo que hay es este panel
}
const ventaDelPanel = () => (_panel && _panel.ventaId && _datos ? _datos.ventas.find(x => x.id === _panel.ventaId) || null : null);
const clienteDe = rfc => (_datos && rfc ? _datos.clientes.find(c => c.rfc === rfc) || null : null);

function pintarPanel() {
  const capa = $('pf-pide');
  if (!capa || !_panel) return;
  /* La capa es de todas las pantallas: si ya se cerró (Escape, el atrás del teléfono) o ahora tiene el formulario de otro (el de un gasto),
     este panel ya no existe y no se escribe encima de nada. */
  if (_panel.abierto && !(capa.classList && capa.classList.contains('show') && capa.querySelector('.fx-panel'))) { _panel = null; return; }
  const v = ventaDelPanel();
  const modo = _panel.modo;
  const rfcActual = modo === 'venta' ? (v ? v.rfc : '') : _panel.rfc;
  const cli = clienteDe(rfcActual);
  const titulo = modo === 'venta' ? 'Cliente fiscal de ' + (v ? v.folio : 'la venta') : modo === 'nuevo' ? 'Nuevo cliente fiscal' : 'Cliente fiscal ' + _panel.rfc;
  const ocupado = _panel.ocupado;
  const campoRfc = modo === 'cliente' ? '' :
    '<div class="fld"><label for="fx-rfc">RFC</label><input type="text" id="fx-rfc" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" list="fx-rfcs"' +
      ' placeholder="ABC010203XY1" value="' + esc(modo === 'venta' ? (v && v.rfc) || '' : '') + '"' + (ocupado ? ' disabled' : '') + '></div>' +
    '<datalist id="fx-rfcs">' + _datos.clientes.map(c => '<option value="' + esc(c.rfc) + '">' + esc(c.razon) + '</option>').join('') + '</datalist>';
  const razonVal = modo === 'cliente' ? (cli ? cli.razon : '') : '';
  const campoRazon = '<div class="fld"><label for="fx-razon">Razón social' + (modo === 'venta' ? ' <small>(solo si el RFC es nuevo)</small>' : '') + '</label>' +
    '<input type="text" id="fx-razon" autocomplete="off" maxlength="' + F.TOPE_RAZON + '" placeholder="Como viene en la constancia" value="' + esc(razonVal) + '"' + (ocupado ? ' disabled' : '') + '>' +
    '<p class="pf-nota" id="fx-razon-nota">' + esc(notaRazon(modo === 'venta' ? (v && v.rfc) || '' : '')) + '</p></div>';
  const constancia = rfcActual && cli ? htmlConstancia(cli) : (modo === 'venta' ? '<p class="pf-nota">La constancia se sube cuando la venta ya tiene su RFC.</p>' : '');
  const quitar = modo === 'venta' && v && v.rfc ? '<button type="button" class="btn btn-gho fx-quitar" data-fx="quitar"' + (ocupado ? ' disabled' : '') + '>Quitar el cliente</button>' : '';
  capa.innerHTML = '<div class="pf-panel fx-panel" aria-labelledby="fx-titulo">' +
    '<div class="pf-panel-h"><h2 id="fx-titulo">' + esc(titulo) + '</h2>' +
      '<button type="button" class="pf-cerrar" data-fx="cerrar" aria-label="Cerrar">' + ico('i-cerrar') + '</button></div>' +
    '<div class="pf-panel-b">' +
      (v ? '<p class="pf-fila-d">' + esc(v.nombre) + ' · ' + esc(v.cuenta) + (v.deQuien ? ' (' + esc(v.deQuien) + ')' : '') + '</p>' : '') +
      campoRfc + campoRazon +
      '<p class="hintnote nota-mal" id="fx-error" role="alert"' + (_panel.error ? '' : ' hidden') + '>' + esc(_panel.error) + '</p>' +
      constancia +
    '</div>' +
    '<div class="pf-panel-f">' + quitar +
      '<button type="button" class="btn btn-gho" data-fx="cerrar">Cerrar</button>' +
      '<button type="button" class="btn btn-pri" data-fx="guardar"' + (ocupado ? ' disabled aria-busy="true"' : '') + '>' + (ocupado ? 'Guardando…' : 'Guardar') + '</button>' +
    '</div></div>';
}
function notaRazon(rfcEscrito) {
  const r = F.rfcLimpio(rfcEscrito);
  const c = clienteDe(r);
  return c ? 'Ya está dado de alta: ' + c.razon + '.' : (r && !F.rfcProblema(r) ? 'RFC nuevo: escribe su razón social.' : '');
}
function htmlConstancia(cli) {
  const s = _panel.subida;
  const estado = cli.csf
    ? '<p class="fx-csf-t"><span class="pf-sem ok fx-sem">Constancia</span> subida ' + esc(diaCorto(cli.csf.subida)) + (cli.csf.subio ? ' por ' + esc(cli.csf.subio) : '') +
      ' <button type="button" class="fx-link" data-fx="ver" data-fx-ruta="' + esc(cli.csf.ruta) + '">Ver</button>' + enlace(cli.csf.ruta) + '</p>'
    : '<p class="fx-csf-t"><span class="pf-sem falta fx-sem">Sin constancia</span> de ' + esc(cli.rfc) + '</p>';
  const reintento = s && s.incierto ? '<p class="hintnote nota-av" role="status">' + esc(s.mensaje) + '</p>' +
    '<div class="pf-acciones"><button type="button" class="btn btn-pri" data-fx="reintentar">Reintentar</button></div>' : '';
  return '<div class="fx-csf"><h3 class="aj-sub">Constancia de situación fiscal</h3>' + estado + reintento +
    '<label class="btn btn-gho fx-subir' + (_panel.ocupado ? ' apagado' : '') + '">' + ico('i-subir') + ' ' + (cli.csf ? 'Subir otra (la reemplaza)' : 'Subir la constancia') +
      '<input type="file" class="fx-archivo" data-fx-archivo accept="' + F.ACEPTA + '"' + (_panel.ocupado ? ' disabled' : '') + '></label>' +
    '<p class="pf-nota">PDF o foto (JPG, PNG o WebP), de hasta 5 MB. La de antes se queda guardada en la base.</p></div>';
}

function alEscribirPanel(ev) {
  if (!_panel || !ev.target) return;
  if (ev.target.id === 'fx-rfc') {
    const n = $('fx-razon-nota'); if (n) n.textContent = notaRazon(ev.target.value);
    const r = $('fx-razon'); const c = clienteDe(F.rfcLimpio(ev.target.value));
    if (r) { r.disabled = !!c; r.placeholder = c ? c.razon : 'Como viene en la constancia'; }
  }
  const e = $('fx-error'); if (e) e.hidden = true;
}

async function alClicPanel(ev) {
  const b = ev.target.closest('[data-fx]');
  if (!b || !_panel) return;
  ev.preventDefault();
  const que = b.dataset.fx;
  if (que === 'cerrar') { cerrarPanel(); return; }
  if (que === 'ver') { verConstancia(b.dataset.fxRuta); return; }
  if (_panel.ocupado) return;
  if (que === 'guardar') guardarPanel();
  else if (que === 'quitar') quitarCliente();
  else if (que === 'reintentar' && _panel.subida) subir(null);
}

function alCambiarPanel(ev) {
  const t = ev.target;
  if (!_panel || !t || !t.matches || !t.matches('input[data-fx-archivo]')) return;
  const f = t.files && t.files[0];
  t.value = '';
  if (f) subir(f);
}

/* Mandar lo del panel: un plan con el op_id del panel; si el anterior no contestó y lo de ahora es otra cosa, otro op_id (los valores son
   absolutos: mandar lo nuevo no suma nada a lo viejo). */
async function mandar(p) {
  const huella = p.rpc + ':' + JSON.stringify({ ...p.args.p_op, op_id: '' });
  if (_panel.huella && _panel.huella !== huella) _panel.opId = F.nuevoOpId();
  p.args.p_op.op_id = _panel.opId;
  _panel.ocupado = true; _panel.error = ''; pintarPanel();
  let r;
  try { const Supa = await import('../nucleo/supa.js'); r = await F.enviar(await Supa.cliente(), p); }
  catch (e) { r = { ok: false, incierto: true, mensaje: F.mensajeDe(p.rpc, { ok: false, incierto: true }) }; }
  if (!_panel) return r;
  _panel.ocupado = false;
  if (r.ok) { _panel.opId = F.nuevoOpId(); _panel.huella = ''; }
  else { _panel.huella = r.incierto ? huella : ''; _panel.error = r.mensaje; }
  return r;
}

async function guardarPanel() {
  const val = id => { const e = $(id); return e ? String(e.value || '') : ''; };
  const v = ventaDelPanel();
  let p;
  if (_panel.modo === 'venta') p = F.planLigar(v, val('fx-rfc'), val('fx-razon'), _datos.clientes, _panel.opId);
  else p = F.planCliente(_panel.modo === 'cliente' ? _panel.rfc : val('fx-rfc'), val('fx-razon'), _datos.clientes, _panel.opId);
  if (!p.ok) {
    if (p.sinCambio && _panel.modo !== 'venta') { cerrarPanel(); return; }
    _panel.error = Object.values(p.errores || {})[0] || 'Revisa los datos.';
    pintarPanel();
    const campo = $(p.errores && p.errores.razon && !p.errores.rfc ? 'fx-razon' : 'fx-rfc') || $('fx-razon');
    if (campo) { try { campo.focus(); } catch (_) {} }
    voz(_panel.error, true);
    return;
  }
  const r = await mandar(p);
  if (!_panel) return;
  if (!r.ok) { pintarPanel(); return; }
  const d = r.data || {};
  if (_panel.modo === 'venta') toast(d.sin_cambio ? 'Sin cambios' : (v ? v.folio : 'La venta') + ' se factura a ' + d.rfc + (d.cliente_creado ? ' (cliente nuevo)' : ''), 'ok', 3600);
  else toast(d.sin_cambio ? 'Sin cambios' : d.creado ? 'Cliente fiscal ' + d.rfc + ' dado de alta' : 'Razón social de ' + d.rfc + ' guardada', 'ok', 3600);
  /* Un cliente recién dado de alta sigue en el panel para subir su constancia. */
  if (_panel.modo === 'nuevo' && d.rfc) { _panel.modo = 'cliente'; _panel.rfc = d.rfc; }
  await releer();
  pintarPanel();
}

async function quitarCliente() {
  const v = ventaDelPanel();
  const p = F.planLigar(v, '', '', _datos.clientes, _panel.opId);
  if (!p.ok) return;
  if (!await confirmarPf({ titulo: p.titulo, texto: p.texto, si: p.si, no: 'Cancelar', peligro: true })) return;
  if (!_panel) return;
  const r = await mandar(p);
  if (!_panel) return;
  if (!r.ok) { pintarPanel(); return; }
  toast('Se quitó el cliente fiscal de ' + (v ? v.folio : 'la venta'), 'ok', 3200);
  await releer();
  pintarPanel();
}

/* Subir la constancia: primero el archivo al bucket, después decirle a la base que es la del RFC. Si lo segundo no contestó, el reintento
   repite SOLO lo segundo, con la misma ruta y el mismo op_id. */
async function subir(archivo) {
  const v = ventaDelPanel();
  const rfc = _panel.modo === 'venta' ? (v ? v.rfc : '') : _panel.rfc;
  if (!rfc) return;
  let s = _panel.subida;
  if (archivo) {
    const valido = F.validarConstancia(archivo);
    if (!valido.ok) { _panel.error = valido.mensaje; pintarPanel(); voz(valido.mensaje, true); return; }
    s = { archivo, valido, opId: F.nuevoOpId(), ruta: '', incierto: false, mensaje: '' };
  }
  if (!s) return;
  _panel.subida = s; _panel.ocupado = true; _panel.error = ''; pintarPanel();
  let r;
  try {
    const Supa = await import('../nucleo/supa.js');
    r = await F.subirConstancia(await Supa.cliente(), { empresa: empresa(), rfc, archivo: s.archivo, valido: s.valido, opId: s.opId, yaSubido: s.ruta || '' });
  } catch (e) { r = { ok: false, incierto: true, mensaje: F.mensajeDe('constancia_registrar', { ok: false, incierto: true }) }; }
  if (!_panel) return;
  _panel.ocupado = false;
  if (r.ruta) s.ruta = r.ruta;
  if (r.ok) {
    _panel.subida = null;
    toast('Constancia de ' + rfc + ' guardada' + (r.data && r.data.reemplaza ? ': reemplaza la anterior' : ''), 'ok', 3600);
    await releer();
  } else if (r.incierto) { s.incierto = true; s.mensaje = r.mensaje; }
  else { _panel.subida = null; _panel.error = r.mensaje; }
  pintarPanel();
}
