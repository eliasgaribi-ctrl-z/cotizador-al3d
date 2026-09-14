/* ============================================================================
   CONTROL — ventas, cobranza y bitácora. La pantalla de la dirección.

   Nació de una auditoría de septiembre de 2026 que encontró esto: la capa de datos ya sabía
   calcular la conversión cotización→venta, el valor del inventario y el libro de
   movimientos, y NINGUNA pantalla lo pintaba. El tablero contesta «qué hay en el taller y
   qué se atrasa»; nadie contestaba «cuánto vendimos este mes, cuánto hay en la calle sin
   cobrar, cuánto dejamos de vender y quién movió esto». Esa es esta pantalla.

   Tres pestañas, y las tres se apoyan en lo que ya existe:
     · VENTAS — lo vendido este mes contra el anterior, el pipeline valorizado (autorizadas
       sin decidir), lo perdido, la conversión, el ticket promedio; los últimos doce meses
       en barras; y la lista de proyectos filtrable por periodo, con su CSV completo.
     · POR COBRAR — la cartera: cada proyecto con saldo, de mayor a menor, con el mensaje de
       WhatsApp ya armado. El saldo es ESTIMADO (total menos anticipo pactado) mientras el
       puente no baje la fórmula de Notion, y la pantalla lo dice.
     · BITÁCORA — quién hizo qué y cuándo, en toda la plataforma. Se lee, no se edita.

   La ven dirección y pagos. Fabricación no la tiene en la barra: es la pantalla del dinero,
   y `veDinero()` es false para ese rol.

   La aritmética vive en js/datos/ventas.js, que es puro y tiene pruebas. Aquí solo se lee
   la base y se pinta.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Proy from '../datos/proyectos.js';
import * as Cot from '../datos/cotizador.js';
import * as Agenda from '../datos/agenda.js';
import * as Ventas from '../datos/ventas.js';
import * as Bitacora from '../datos/bitacora.js';
import { $, ico, esc, money, toast, vacio, segmento, chip, fmtFecha, linkWa, descargarArchivo,
         hoyISO } from '../nucleo/ui.js';
import { masMeses } from '../nucleo/fechas.js';

let cont = null;
let CTX = null;
let TAB = 'ventas';          // ventas | cobrar | bitacora — sobrevive a salir y volver
let PERIODO = '3m';          // mes | 3m | 12m | todo
let BUSCA = '';
let ENTIDAD = '';            // filtro de la bitácora
let BUSCA_BIT = '';
let D = null;                // lo leído

export async function montar(contenedor, ctx) {
  cont = contenedor;
  CTX = ctx;
  cont.addEventListener('click', alClic);
  cont.addEventListener('input', alEscribir);
  /* El pase de quien manda aquí —el asistente, el tablero—: «abre en Por cobrar». */
  const pase = (ctx && ctx.recibir) ? ctx.recibir() : null;
  if (pase && ['ventas', 'cobrar', 'bitacora'].includes(pase.tab)) TAB = pase.tab;

  if (!DB.estado().ok) {
    cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo', DB.motivoTexto());
    return;
  }
  if (CTX.acciones) {
    const acc = CTX.acciones('<button type="button" class="btn btn-gho pf-btn-corto" data-csv>' +
      ico('i-bajar') + ' Bajar CSV de proyectos</button>');
    if (acc) acc.addEventListener('click', alClic);
  }
  await recargar();
}

export function desmontar() {
  if (cont) { cont.removeEventListener('click', alClic); cont.removeEventListener('input', alEscribir); }
  cont = null; CTX = null; D = null;
}

/* ============================================================================
   Leer — todo local
   ============================================================================ */

async function leer() {
  const hoy = hoyISO();
  const proyectos = await Proy.listar({});
  const ganados = new Set(proyectos.map(p => p.folio_global));
  const sinDecidir = Cot.sinDecidir(ganados);
  const historial = Cot.historial();
  const inst = await Agenda.listar({ vivas: true });
  const fechaInst = new Map();
  for (const i of inst) {
    if (!i || !i.fecha) continue;
    const prev = fechaInst.get(i.proyecto_id);
    if (!prev || i.fecha < prev) fechaInst.set(i.proyecto_id, i.fecha);
  }
  const kpi = Ventas.indicadores(proyectos, sinDecidir, { hoy, valorDe: Cot.totalVendido });
  const meses = Ventas.resumenMensual(proyectos, { hoy, meses: 12 });
  const conv = Ventas.conversion(historial, proyectos, Prefs.dispositivo());
  const cartera = Ventas.porCobrar(proyectos);

  /* El almacén, solo para dirección: fabricación no entra aquí y pagos no compra. */
  let almacen = null;
  if (Prefs.esDireccion()) {
    try {
      const Stock = await import('../datos/stock.js');
      const [valor, minimo] = await Promise.all([Stock.valorInventario(), Stock.bajoMinimo()]);
      almacen = { valor, bajoMinimo: Array.isArray(minimo) ? minimo.length : 0 };
    } catch (_) { almacen = null; }
  }
  const bitacora = await Bitacora.listar({ limite: 400 });
  return { hoy, proyectos, sinDecidir, historial, fechaInst, kpi, meses, conv, cartera, almacen, bitacora };
}

async function recargar() {
  D = await leer();
  pintar();
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  if (!cont || !D) return;
  const tabs = segmento([
    { v: 'ventas', t: 'Ventas' },
    { v: 'cobrar', t: 'Por cobrar' + (D.kpi.porCobrar.n ? ' · ' + D.kpi.porCobrar.n : '') },
    { v: 'bitacora', t: 'Bitácora' },
  ], TAB, 'data-tab', 'Qué ver');

  let cuerpo;
  if (TAB === 'cobrar') cuerpo = pintarCobrar();
  else if (TAB === 'bitacora') cuerpo = pintarBitacora();
  else cuerpo = pintarVentas();

  cont.innerHTML = '<div class="ag-barra">' + tabs + '</div>' + cuerpo;
}

/* ----- Ventas ----- */
function pintarVentas() {
  const k = D.kpi;
  const c = [];
  c.push(cuenta(money(k.mes.total), 'Vendido en ' + k.mes.etiqueta, { dinero: true,
    em: k.mes.n + (k.mes.n === 1 ? ' proyecto' : ' proyectos') +
        (k.variacion === null ? '' : ' · ' + (k.variacion >= 0 ? '+' : '') + k.variacion + ' % vs ' + k.mesAnterior.etiqueta) }));
  c.push(cuenta(money(k.mesAnterior.total), 'Vendido en ' + k.mesAnterior.etiqueta,
    { em: k.mesAnterior.n + (k.mesAnterior.n === 1 ? ' proyecto' : ' proyectos') }));
  c.push(cuenta(money(k.pipeline.total), 'Autorizado sin decidir', { urge: k.pipeline.n > 0,
    em: k.pipeline.n + (k.pipeline.n === 1 ? ' cotización' : ' cotizaciones') }));
  c.push(cuenta(money(k.porCobrar.total), 'Por cobrar (estimado)', { urge: k.porCobrar.n > 0,
    em: k.porCobrar.n + (k.porCobrar.n === 1 ? ' proyecto con saldo' : ' proyectos con saldo') }));
  c.push(cuenta(D.conv.tasa === null ? '—' : D.conv.tasa + ' %', 'Conversión',
    { em: D.conv.ganadas + ' ganadas de ' + (D.conv.ganadas + D.conv.perdidas) + ' decididas' }));
  c.push(cuenta(money(k.perdidoMes.total), 'No se dio en ' + k.mes.etiqueta, { mal: k.perdidoMes.n > 0,
    em: k.perdidoMes.n + (k.perdidoMes.n === 1 ? ' cotización' : ' cotizaciones') }));

  const partes = ['<div class="pf-cuentas">' + c.join('') + '</div>'];

  partes.push(graficaMeses());

  if (D.almacen) partes.push(filaAlmacen());

  partes.push(listaProyectos());

  partes.push('<p class="pf-nota">«Vendido» suma el precio autorizado de los proyectos por la fecha en que se ganaron. ' +
    '«Por cobrar» es el total menos el anticipo pactado, cero si Notion ya dice LIQUIDADO: es una estimación local hasta que el puente ' +
    'baje la fórmula de Notion. El ticket promedio de los últimos doce meses es ' + esc(money(k.ticket)) +
    (k.ultimos12.n ? ' sobre ' + k.ultimos12.n + ' proyectos' : '') + '.</p>');
  return partes.join('');
}

function cuenta(valor, etiqueta, o = {}) {
  const cls = o.dinero ? ' dinero' : (o.mal ? ' mal' : (o.urge ? ' urge' : ''));
  return '<p class="pf-cuenta ct-cuenta' + cls + '"><b>' + esc(valor) + '</b>' + esc(etiqueta) +
    (o.em ? '<em>' + esc(o.em) + '</em>' : '') + '</p>';
}

/* Las barras de doce meses, en HTML y CSS y nada más: un `<i>` con su ancho en porcentaje del
   mes más alto. Sin librería, sin lienzo, y se imprime igual que se ve. Debajo de cada barra,
   el mes; a la derecha, el importe. Lo perdido va como una segunda barra más tenue. */
function graficaMeses() {
  const M = D.meses;
  const tope = Math.max(1, ...M.map(m => Math.max(m.vendido, m.perdido)));
  const filas = M.map(m => {
    const pv = Math.round(m.vendido / tope * 100), pp = Math.round(m.perdido / tope * 100);
    return '<div class="ct-mes' + (m.mes === D.hoy.slice(0, 7) ? ' actual' : '') + '">' +
      '<span class="ct-mes-t">' + esc(m.etiqueta) + '</span>' +
      '<span class="ct-barras" aria-hidden="true">' +
        '<i class="ct-b vendido" style="width:' + pv + '%"></i>' +
        (m.perdido > 0 ? '<i class="ct-b perdido" style="width:' + pp + '%"></i>' : '') +
      '</span>' +
      '<span class="ct-mes-v">' + esc(money(m.vendido)) +
        '<small>' + m.ganados + (m.ganados === 1 ? ' proyecto' : ' proyectos') +
        (m.perdidos ? ' · ' + m.perdidos + ' no se ' + (m.perdidos === 1 ? 'dio' : 'dieron') : '') + '</small></span>' +
    '</div>';
  }).join('');
  const total = M.reduce((s, m) => s + m.vendido, 0);
  return '<div class="card"><div class="card-h"><h2>' + ico('i-control') + ' Últimos doce meses</h2>' +
    '<span class="folio">' + esc(money(total)) + '</span></div>' +
    '<div class="card-b"><div class="ct-grafica">' + filas + '</div>' +
    '<p class="pf-nota ct-leyenda"><i class="ct-b vendido"></i> vendido &nbsp; <i class="ct-b perdido"></i> no se dio</p>' +
    '</div></div>';
}

function filaAlmacen() {
  const a = D.almacen;
  const v = a.valor || {};
  const conCosto = Number(v.con_costo) || 0, sinCosto = Number(v.sin_costo) || 0;
  const texto = conCosto
    ? 'Vale ' + money(v.total) + ' con el costo de ' + conCosto + (conCosto === 1 ? ' material' : ' materiales') +
      (sinCosto ? '; ' + sinCosto + ' no tienen costo capturado y no suman.' : '.')
    : 'Ningún material tiene costo capturado, así que el valor del almacén no se puede sumar. Se pone en el catálogo, uno por uno.';
  return '<div class="card"><div class="card-b">' +
    '<div class="pf-fila">' +
      '<span class="pf-fila-ico' + (a.bajoMinimo ? ' urge' : '') + '">' + ico('i-material') + '</span>' +
      '<div class="pf-fila-tx"><p class="pf-fila-t">El almacén' +
        (a.bajoMinimo ? ' <span class="pf-sem falta">' + a.bajoMinimo + ' bajo mínimo</span>' : '') + '</p>' +
      '<p class="pf-fila-d">' + esc(texto) + '</p></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-ir="material">Ver material</button></div>' +
    '</div></div></div>';
}

function proyectosDelPeriodo() {
  const hoy = D.hoy;
  let desde = null;
  if (PERIODO === 'mes') desde = hoy.slice(0, 7) + '-01';
  else if (PERIODO === '3m') desde = masMeses(hoy.slice(0, 7) + '-01', -2);
  else if (PERIODO === '12m') desde = masMeses(hoy.slice(0, 7) + '-01', -11);
  const q = plano(BUSCA);
  return D.proyectos.filter(p => {
    if (desde && String(p.fecha_ganado || '') < desde) return false;
    if (!q) return true;
    return plano([p.nombre, p.contacto, p.negocio, p.folio_local, p.cuenta, p.estatus_notion,
      (p.tipo_trabajo || []).join(' ')].join(' ')).includes(q);
  });
}

function listaProyectos() {
  const lista = proyectosDelPeriodo();
  const vivos = lista.filter(p => p.etapa !== 'cancelado');
  const total = vivos.reduce((s, p) => s + Ventas.vendidoDe(p), 0);
  const filtros = segmento([
    { v: 'mes', t: 'Este mes' }, { v: '3m', t: '3 meses' }, { v: '12m', t: '12 meses' }, { v: 'todo', t: 'Todo' },
  ], PERIODO, 'data-periodo', 'Periodo');
  const filas = lista.length
    ? lista.map(filaProyecto).join('')
    : vacio('Nada en este periodo', 'Cuando una cotización se marque como ganada, aparece aquí con su importe.');
  return '<div class="card"><div class="card-h"><h2>' + ico('i-proyectos') + ' Proyectos' +
      ' <span class="folio">' + vivos.length + '</span></h2>' +
      '<span class="ct-total">' + esc(money(total)) + '</span></div>' +
    '<div class="card-b">' +
      '<div class="ag-barra">' + filtros +
        '<input type="search" class="ct-busca" placeholder="Buscar por nombre, folio, cuenta o estatus" value="' + esc(BUSCA) + '" data-busca aria-label="Buscar proyectos"></div>' +
      filas +
    '</div></div>';
}

const ETAPA_CLASE = e => Proy.claseEtapa(e);

function filaProyecto(p) {
  const saldo = Ventas.saldoDe(p);
  const cancelado = p.etapa === 'cancelado';
  return '<div class="pf-fila ct-fila">' +
    '<span class="pf-fila-ico' + (cancelado ? '' : (saldo > 0 ? ' urge' : ' bien')) + '">' +
      ico(Proy.ICO_ETAPA[p.etapa] || 'i-proyectos') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(p.nombre || p.folio_local) + '</p>' +
      '<p class="pf-fila-d">' + esc(p.folio_local || '') + ' · ' + esc(fmtFecha(p.fecha_ganado) || 'sin fecha') +
        ' · <span class="pf-etapa ' + ETAPA_CLASE(p.etapa) + '">' + esc(cancelado ? 'No se dio' : (Proy.ETAPA_NOMBRE[p.etapa] || p.etapa)) + '</span>' +
        (p.cuenta ? ' · ' + esc(p.cuenta) : '') + (p.estatus_notion ? ' · ' + esc(p.estatus_notion) : '') +
      '</p>' +
    '</div>' +
    '<div class="ct-monto' + (cancelado ? ' cancelado' : '') + '">' + esc(money(Ventas.vendidoDe(p))) +
      (!cancelado && saldo > 0 ? '<small>saldo ' + esc(money(saldo)) + '</small>' : '') +
      (!cancelado && saldo <= 0 ? '<small>cobrado</small>' : '') +
    '</div>' +
    '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-abrir="' + esc(p.id) + '">Abrir</button></div>' +
  '</div>';
}

/* ----- Por cobrar ----- */
function pintarCobrar() {
  const k = D.kpi;
  const entregados = D.cartera.filter(x => x.entregado);
  const c = [
    cuenta(money(k.porCobrar.total), 'Por cobrar (estimado)', { dinero: true,
      em: k.porCobrar.n + (k.porCobrar.n === 1 ? ' proyecto' : ' proyectos') }),
    cuenta(money(entregados.reduce((s, x) => s + x.saldo, 0)), 'Ya instalado y sin liquidar', { urge: entregados.length > 0,
      em: entregados.length + (entregados.length === 1 ? ' proyecto' : ' proyectos') }),
    cuenta(money(k.porCobrar.anticipos), 'Anticipos pactados', { em: 'de los proyectos vivos' }),
  ];
  const filas = D.cartera.length
    ? D.cartera.map(filaCobro).join('')
    : vacio('No hay saldos pendientes', 'Cada proyecto vivo tiene su anticipo igual al total, o Notion ya lo marcó como liquidado.');
  return '<div class="pf-cuentas">' + c.join('') + '</div>' +
    '<div class="card"><div class="card-h"><h2>' + ico('i-venta') + ' Cartera' +
      ' <span class="folio">' + D.cartera.length + '</span></h2></div>' +
    '<div class="card-b">' + filas + '</div></div>' +
    '<p class="pf-nota">Primero lo instalado: ese trabajo ya se entregó y ese dinero ya debía estar cobrado. El saldo es el ' +
    'total vendido menos el anticipo pactado; si el puente de Notion baja el pago pendiente, manda ese número y aquí se marca ' +
    'como «de Notion». Marcar LIQUIDADO en la ficha del proyecto lo saca de esta lista.</p>';
}

function filaCobro(x) {
  const p = x.proyecto;
  const texto = 'Hola' + (p.contacto ? ' ' + p.contacto : '') + ', le escribimos de AL3D.\n' +
    'Le comparto el saldo de ' + (p.negocio || p.nombre || 'su trabajo') + ': ' + money(x.saldo) + '.\n' +
    '¿Le mando los datos de la cuenta o prefiere efectivo?\n— AL3D';
  return '<div class="pf-fila ct-fila">' +
    '<span class="pf-fila-ico' + (x.entregado ? ' mal' : ' urge') + '">' + ico(x.entregado ? 'i-check' : 'i-reloj') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(p.nombre || p.folio_local) + '</p>' +
      '<p class="pf-fila-d">' + esc(p.folio_local || '') + ' · <span class="pf-etapa ' + ETAPA_CLASE(p.etapa) + '">' +
        esc(Proy.ETAPA_NOMBRE[p.etapa] || p.etapa) + '</span>' +
        ' · vendido ' + esc(money(Ventas.vendidoDe(p))) + ' · anticipo ' + esc(money(p.anti_pactado)) +
        (p.cuenta ? ' · ' + esc(p.cuenta) : '') + (p.estatus_notion ? ' · ' + esc(p.estatus_notion) : '') +
        (x.deNotion ? ' · saldo de Notion' : '') +
      '</p>' +
    '</div>' +
    '<div class="ct-monto saldo">' + esc(money(x.saldo)) + '<small>por cobrar</small></div>' +
    '<div class="pf-fila-acc">' +
      (p.tel ? '<a class="btn-wa" href="' + esc(linkWa(p.tel, texto)) + '" target="_blank" rel="noopener">' + ico('i-wa') + ' Cobrar</a>' : '') +
      '<button type="button" class="btn btn-gho pf-btn-corto" data-abrir="' + esc(p.id) + '">Abrir</button>' +
    '</div>' +
  '</div>';
}

/* ----- Bitácora ----- */
function pintarBitacora() {
  const q = plano(BUSCA_BIT);
  const lista = D.bitacora.filter(b => (!ENTIDAD || b.entidad === ENTIDAD) &&
    (!q || plano([b.titulo, b.detalle, b.sello, b.usuario].join(' ')).includes(q)));
  const chips = '<div class="chips">' +
    chip('Todo', !ENTIDAD, 'data-entidad=""') +
    Bitacora.ENTIDADES.filter(e => D.bitacora.some(b => b.entidad === e))
      .map(e => chip(Bitacora.ENTIDAD_NOMBRE[e] || e, ENTIDAD === e, 'data-entidad="' + esc(e) + '"')).join('') +
    '</div>';
  const filas = lista.length
    ? agruparPorDia(lista).map(g => '<p class="ag-grupo">' + esc(g.dia) + '<span class="n">' + g.filas.length + '</span></p>' +
        g.filas.map(filaBitacora).join('')).join('')
    : vacio(D.bitacora.length ? 'Nada con ese filtro' : 'La bitácora empieza hoy',
        D.bitacora.length ? 'Prueba con otra palabra o quita el filtro.'
          : 'Desde esta versión, cada cambio en un proyecto, la agenda, el catálogo o el almacén se anota aquí con quién lo hizo y a qué hora. Lo de antes no se puede reconstruir.');
  return '<div class="card"><div class="card-h"><h2>' + ico('i-historial') + ' Bitácora' +
      ' <span class="folio">' + D.bitacora.length + '</span></h2></div>' +
    '<div class="card-b">' +
      '<div class="ag-barra">' + chips +
        '<input type="search" class="ct-busca" placeholder="Buscar por nombre, quién o qué" value="' + esc(BUSCA_BIT) + '" data-busca-bit aria-label="Buscar en la bitácora"></div>' +
      filas +
    '</div></div>' +
    '<p class="pf-nota">La bitácora es memoria, no candado: en esta fase cualquiera cambia su nombre y su rol en Ajustes. ' +
    'Lo que sí garantiza es que un cambio no pasa sin dejar renglón. Entra al respaldo con lo demás; se enseñan los últimos 400.</p>';
}

function agruparPorDia(lista) {
  const grupos = [];
  let ult = null;
  for (const b of lista) {
    const d = new Date(Number(b.ts) || 0);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dia = iso === D.hoy ? 'Hoy' : (iso === masDia(D.hoy, -1) ? 'Ayer' : fmtFecha(iso));
    if (!ult || ult.dia !== dia) { ult = { dia, filas: [] }; grupos.push(ult); }
    ult.filas.push(b);
  }
  return grupos;
}

function masDia(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const ICONO_ACCION = {
  gano: 'i-venta', descarto: 'i-cerrar', etapa: 'i-taller', cambio: 'i-lapiz', agendo: 'i-agenda',
  reagendo: 'i-agenda', marco: 'i-check', cancelo: 'i-cerrar', guardo: 'i-guardar', conteo: 'i-material',
  compra: 'i-camion', restauro: 'i-subir',
};

function filaBitacora(b) {
  const d = new Date(Number(b.ts) || 0);
  const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const tono = b.accion === 'descarto' || b.accion === 'cancelo' ? ' mal' : (b.accion === 'gano' || b.accion === 'marco' ? ' bien' : '');
  return '<div class="pf-fila ct-bit">' +
    '<span class="pf-fila-ico' + tono + '">' + ico(ICONO_ACCION[b.accion] || 'i-lapiz') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(b.titulo) + '</p>' +
      (b.detalle ? '<p class="pf-fila-d">' + esc(b.detalle) + '</p>' : '') +
      '<p class="pf-fila-d ct-quien"><b>' + esc(b.sello || b.usuario || 'Sin nombre') + '</b> · ' + hora +
        ' · ' + esc(Bitacora.ENTIDAD_NOMBRE[b.entidad] || b.entidad) + '</p>' +
    '</div>' +
    (b.entidad === 'proyecto' && b.entidad_id
      ? '<div class="pf-fila-acc"><button type="button" class="btn btn-gho pf-btn-corto" data-abrir="' + esc(b.entidad_id) + '">Abrir</button></div>'
      : '') +
  '</div>';
}

/* ============================================================================
   Eventos
   ============================================================================ */

function alClic(ev) {
  const t = ev.target;
  const tab = t.closest('[data-tab]');
  if (tab) { TAB = tab.dataset.tab; pintar(); return; }
  const per = t.closest('[data-periodo]');
  if (per) { PERIODO = per.dataset.periodo; pintar(); return; }
  const ent = t.closest('[data-entidad]');
  if (ent) { ENTIDAD = ent.dataset.entidad || ''; pintar(); return; }
  const ir = t.closest('[data-ir]');
  if (ir && CTX && CTX.ir) { CTX.ir(ir.dataset.ir); return; }
  const abrir = t.closest('[data-abrir]');
  if (abrir && CTX && CTX.pasar) { CTX.pasar('proyectos', { proyecto_id: abrir.dataset.abrir }); return; }
  if (t.closest('[data-csv]')) { bajarCSV(); }
}

let _espera = 0;
function alEscribir(ev) {
  const t = ev.target;
  if (!t) return;
  const esProy = t.matches('[data-busca]'), esBit = t.matches('[data-busca-bit]');
  if (!esProy && !esBit) return;
  if (esProy) BUSCA = t.value; else BUSCA_BIT = t.value;
  clearTimeout(_espera);
  /* Se repinta con un respiro: repintar la lista en cada tecla tira el foco del campo. Al
     repintar se le devuelve, con el cursor al final. */
  _espera = setTimeout(() => {
    pintar();
    const campo = cont && cont.querySelector(esProy ? '[data-busca]' : '[data-busca-bit]');
    if (campo) { campo.focus(); try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch (_) {} }
  }, 220);
}

function bajarCSV() {
  if (!D) return;
  const lista = D.proyectos;
  if (!lista.length) { toast('Todavía no hay proyectos que exportar', '', 2600); return; }
  const csv = Ventas.csvProyectos(lista, D.fechaInst);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  if (descargarArchivo(csv, 'al3d-proyectos-' + sello + '.csv', 'text/csv;charset=utf-8')) {
    toast(lista.length + (lista.length === 1 ? ' proyecto exportado' : ' proyectos exportados') + ' a CSV, con saldo, cuenta y estatus', 'ok', 3600);
  }
}

const plano = s => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Se referencian para que quien lea el módulo sepa que el segmento del `$` existe. */
void $;
