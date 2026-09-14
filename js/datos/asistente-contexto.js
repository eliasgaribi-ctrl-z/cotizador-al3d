/* ============================================================================
   EL CONTEXTO DEL ASISTENTE — lo que la IA sabe del taller, y nada más.

   El asistente de la plataforma contesta preguntas sobre el negocio: qué va tarde, a
   quién se le cobra, qué comisiones ya se pueden abonar, cuánto se vendió. No sabe nada
   por sí mismo: lo único que sabe es lo que ESTE archivo arma a partir de los datos del
   dispositivo y le manda junto con la pregunta. Por eso todo lo de aquí es puro —listas
   entran, un objeto sale— y se prueba en node (pruebas/asistente.mjs).

   Tres decisiones que no son de gusto:

   · LO QUE VIAJA ES UN RESUMEN, NO LA BASE. Un proyecto entra como quince campos cortos, no
     como el registro completo con su `origen` congelado y sus coordenadas. Menos tokens, y
     sobre todo menos datos del cliente saliendo del teléfono: el teléfono y la dirección no
     viajan, el modelo no los necesita para contestar «¿quién nos debe?».
   · EL ROL MANDA. Para fabricación no hay importes en la plataforma, así que tampoco los
     hay en lo que se manda: `veDinero:false` quita totales, anticipos, saldos y comisiones
     ANTES de armar el texto. No se difuminan; no existen.
   · LAS REGLAS DEL NEGOCIO VAN ESCRITAS. Cómo se calcula una comisión y cuándo se abona
     está en el mensaje de sistema, sacado del mismo código que arma la fila de Notion
     (js/cotizador/venta.js): el modelo no tiene que adivinarlo y no puede inventarlo.
   ============================================================================ */

import { saldoDe, vendidoDe, etiquetaMes } from './ventas.js';
import { hoyISO, esISO, diasEntre } from '../nucleo/fechas.js';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const red2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;

const ETAPA = { ganado: 'ganado (sin empezar)', en_diseno: 'en diseño', cortado: 'cortado', armado: 'armado',
  listo: 'listo para instalar', instalado: 'instalado', garantia: 'en garantía', cancelado: 'no se dio' };

/* ----- La comisión, con la misma aritmética de la fila de Notion -----
   `copiarFilaVenta()` hace: comisión = redondeo(subtotal × % / 100); si el estatus es
   LIQUIDADO, «Abono Comisión» = comisión y «Comisión Restante» = 0; si no, al revés. La
   fórmula de verdad vive en Notion y baja como `comision_restante`; cuando existe, manda. */
export function comisionDe(p) {
  if (!p || p.etapa === 'cancelado') return { comision: 0, abonable: 0, restante: 0, deNotion: false };
  const pct = num(p.pct_comision);
  const sub = num(p.sub) || (num(p.iva === false ? vendidoDe(p) : vendidoDe(p) / 1.16));
  const comision = pct > 0 ? Math.round(sub * pct / 100) : 0;
  const liquidado = String(p.estatus_notion || '').toUpperCase() === 'LIQUIDADO';
  const cr = p.comision_restante;
  if (cr !== null && cr !== undefined && isFinite(Number(cr))) {
    const restante = Math.max(0, red2(cr));
    return { comision, abonable: liquidado ? restante : 0, restante, deNotion: true };
  }
  return { comision, abonable: liquidado ? comision : 0, restante: liquidado ? 0 : comision, deNotion: false };
}

/** Un proyecto, en quince campos cortos. Sin teléfono, sin dirección, sin coordenadas. */
export function resumirProyecto(p, extra = {}) {
  const veDinero = extra.veDinero !== false;
  const v = extra.ventana || null;
  const inst = extra.instalacion || null;
  const o = {
    folio: p.folio_local || '',
    nombre: p.nombre || '',
    cliente: p.contacto || '',
    negocio: p.negocio || '',
    tipo: (p.tipo_trabajo || []).join(' + '),
    etapa: ETAPA[p.etapa] || p.etapa || '',
    ganado: p.fecha_ganado || '',
    instalacion: inst && inst.fecha ? inst.fecha + (inst.hora ? ' ' + inst.hora : '') + (inst.estado ? ' (' + inst.estado + ')' : '') : 'sin fecha',
  };
  if (v && v.estado && v.estado !== 'cancelado' && v.estado !== 'hecho') {
    o.taller = v.texto || v.estado;
    if (num(v.atraso_dias) > 0) o.atraso_dias = num(v.atraso_dias);
  }
  if (extra.material) o.material = extra.material;
  if (veDinero) {
    const c = comisionDe(p);
    o.vendido = vendidoDe(p);
    o.anticipo = num(p.anti_pactado);
    o.saldo_estimado = saldoDe(p);
    if (p.cuenta) o.cuenta = p.cuenta;
    if (p.estatus_notion) o.estatus_notion = p.estatus_notion;
    if (num(p.pct_comision) > 0) {
      o.pct_comision = num(p.pct_comision);
      o.comision = c.comision;
      o.comision_abonable_ya = c.abonable;
      o.comision_restante = c.restante;
      if (c.deNotion) o.comision_de_notion = true;
    }
  }
  if (p.notas) o.notas = String(p.notas).slice(0, 160);
  return o;
}

/**
 * El resumen completo que viaja con cada pregunta.
 *
 * @param {{hoy?:string, rol:string, veDinero:boolean, nombre?:string,
 *          proyectos:Object[], instalaciones?:Object[], ventanas?:Map|Object,
 *          materialDe?:Function, kpi?:Object, conversion?:Object, faltantes?:Object[],
 *          bajoMinimo?:Object[], avisos?:Object[], sinDecidir?:Object[], cola?:Object[],
 *          bitacora?:Object[], valorDe?:Function}} d
 */
export function armarResumen(d) {
  const hoy = esISO(d.hoy) ? d.hoy : hoyISO();
  const veDinero = d.veDinero !== false;
  const P = (d.proyectos || []).filter(Boolean);
  const instDe = new Map();
  for (const i of (d.instalaciones || [])) {
    if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
  }
  const ventanaDe = id => {
    const V = d.ventanas;
    if (!V) return null;
    if (typeof V.get === 'function') return V.get(id) || null;
    return V[id] || null;
  };
  const vivos = P.filter(p => p.etapa !== 'cancelado');
  const cancelados = P.filter(p => p.etapa === 'cancelado');
  /* Lo abierto primero y lo instalado después; dentro, lo más reciente arriba. Tope para
     que un taller de tres años no mande trescientos renglones: lo instalado viejo se
     resume en una cuenta. */
  const abiertos = vivos.filter(p => p.etapa !== 'instalado' && p.etapa !== 'garantia');
  const cerrados = vivos.filter(p => p.etapa === 'instalado' || p.etapa === 'garantia')
    .sort((a, b) => String(b.fecha_ganado || '').localeCompare(String(a.fecha_ganado || '')));
  const TOPE_CERRADOS = 40;
  const lista = abiertos.concat(cerrados.slice(0, TOPE_CERRADOS)).map(p => resumirProyecto(p, {
    veDinero, ventana: ventanaDe(p.id), instalacion: instDe.get(p.id) || null,
    material: typeof d.materialDe === 'function' ? d.materialDe(p.id) : undefined,
  }));

  const out = {
    hoy,
    rol: d.rol || '',
    quien: d.nombre || '',
    ve_dinero: veDinero,
    proyectos: lista,
    proyectos_instalados_fuera_de_la_lista: Math.max(0, cerrados.length - TOPE_CERRADOS),
    no_se_dieron: {
      total: cancelados.length,
      ultimos: cancelados.slice(0, 10).map(p => ({ folio: p.folio_local || '', nombre: p.nombre || '',
        fecha: p.fecha_ganado || '', motivo: String(p.notas || '').slice(0, 120),
        ...(veDinero ? { importe: vendidoDe(p) } : {}) })),
    },
    instalaciones_proximas: (d.instalaciones || []).filter(i => i && i.fecha && i.fecha >= hoy)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).slice(0, 15)
      .map(i => ({ fecha: i.fecha, hora: i.hora || '', estado: i.estado || '',
        proyecto: (P.find(p => p.id === i.proyecto_id) || {}).nombre || i.proyecto_id })),
    material_por_comprar: (d.faltantes || []).filter(l => l && num(l.comprar) > 0).slice(0, 25)
      .map(l => ({ material: l.nombre || l.material_id || '', comprar: num(l.comprar), unidad: l.unidad_compra || '',
        para: Array.isArray(l.proyectos) ? l.proyectos.map(x => (x && (x.nombre || x.proyecto_id)) || x).filter(Boolean).slice(0, 4).join(', ') : '',
        fecha: l.fecha || '', confianza: l.confianza || '' })),
    bajo_minimo: (d.bajoMinimo || []).slice(0, 20).map(m => ({ material: m.nombre || m.material_id || '',
      hay: num(m.cantidad), unidad: m.unidad_compra || '', minimo: num(m.min_stock), proveedor: m.proveedor || '' })),
    avisos: (d.avisos || []).slice(0, 20).map(a => ({ titulo: a.titulo || '', cuando: a.cuando || '',
      ...(veDinero || !/\$/.test(a.detalle || '') ? { detalle: String(a.detalle || '').slice(0, 200) } : {}) })),
    ultimos_movimientos: (d.bitacora || []).slice(0, 25).map(b => ({
      cuando: fechaHora(b.ts), quien: b.sello || b.usuario || '', que: b.titulo || '' })),
  };

  if (veDinero) {
    const k = d.kpi || null;
    if (k) {
      out.ventas = {
        [k.mes.etiqueta]: { proyectos: k.mes.n, vendido: k.mes.total },
        [k.mesAnterior.etiqueta]: { proyectos: k.mesAnterior.n, vendido: k.mesAnterior.total },
        variacion_pct: k.variacion,
        ultimos_12_meses: k.ultimos12,
        ticket_promedio: k.ticket,
        autorizado_sin_decidir: k.pipeline,
        no_se_dio_este_mes: k.perdidoMes,
        por_cobrar_estimado: { proyectos: k.porCobrar.n, total: k.porCobrar.total },
      };
    }
    if (d.conversion) out.conversion = d.conversion;
    const com = vivos.map(p => ({ p, c: comisionDe(p) })).filter(x => x.c.comision > 0);
    out.comisiones = {
      abonables_ya: com.filter(x => x.c.abonable > 0).map(x => ({ folio: x.p.folio_local, nombre: x.p.nombre,
        comision: x.c.abonable, pct: num(x.p.pct_comision), estatus_notion: x.p.estatus_notion || '' })),
      pendientes_de_liquidar: com.filter(x => x.c.abonable <= 0 && x.c.restante > 0).map(x => ({ folio: x.p.folio_local,
        nombre: x.p.nombre, comision: x.c.restante, pct: num(x.p.pct_comision), estatus_notion: x.p.estatus_notion || '',
        saldo_del_cliente: saldoDe(x.p) })),
      total_abonable_ya: red2(com.reduce((s, x) => s + x.c.abonable, 0)),
      total_pendiente: red2(com.reduce((s, x) => s + (x.c.abonable > 0 ? 0 : x.c.restante), 0)),
    };
    out.cotizaciones_autorizadas_sin_decidir = (d.sinDecidir || []).slice(0, 20).map(e => ({
      folio: e.folio, cliente: e.cliente || '', proyecto: e.proy || '',
      total: typeof d.valorDe === 'function' ? d.valorDe(e) : num(e.neto),
      dias: e.ts ? Math.max(0, Math.round((Date.parse(hoy + 'T12:00:00') - Number(e.ts)) / 86400000)) : null }));
  } else {
    out.cotizaciones_autorizadas_sin_decidir = (d.sinDecidir || []).length;
  }
  out.esperando_precio = (d.cola || []).length;
  return out;
}

function fechaHora(ts) {
  const d = new Date(Number(ts) || 0);
  if (!isFinite(d.getTime()) || !ts) return '';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** El mensaje de sistema: quién es, qué sabe, qué reglas aplica y qué no puede hacer. */
export function promptSistema(resumen) {
  const hoy = resumen.hoy || hoyISO();
  const dinero = resumen.ve_dinero !== false;
  return [
    'Eres el asistente del taller de AL3D (Anuncios Luminosos 3D, Guadalajara): un negocio que fabrica e instala letras 3D, recorte de acrílico, bastidores y cajas de luz. Tres personas lo trabajan: dirección vende y autoriza precios, fabricación compra material y arma, pagos cobra anticipos y liquidaciones.',
    'Hoy es ' + hoy + '. Te habla ' + (resumen.quien ? resumen.quien + ', ' : '') + 'con el rol de ' + (resumen.rol || 'dirección') + '.',
    '',
    'REGLAS:',
    '1. Contesta SOLO con los datos del bloque DATOS. Si algo no está ahí, dilo con claridad («eso no está en la plataforma») en vez de suponerlo. Nunca inventes importes, fechas ni nombres.',
    '2. Responde en español de México, corto y directo. Si hay varios renglones (proyectos, saldos, comisiones), usa una lista con viñetas y pon el importe al final de cada renglón. Termina con una sola recomendación concreta cuando aplique.',
    '3. Los importes van en pesos mexicanos con formato $12,345.00.',
    '4. No puedes cambiar nada: eres de solo lectura. Si te piden hacer algo (marcar liquidado, abonar una comisión, mover una fecha), di en qué pantalla de la plataforma se hace: la etapa, el estatus de Notion y la cuenta se cambian en la ficha del proyecto (Proyectos); las fechas en Calendario; el material en Material; las ventas, la cartera y la bitácora se ven en Control. Los abonos de comisión y los pagos se registran en la base «Ventas - AL3D» de Notion, que es el libro mayor; la plataforma solo lo espeja.',
    dinero ? '5. COMISIONES: la comisión de un proyecto es subtotal × porcentaje pactado (redondeada a pesos). Se ABONA cuando el proyecto queda LIQUIDADO en Notion; mientras no, es «comisión restante». En DATOS ya vienen calculadas: `comision_abonable_ya` es lo que ya se puede pagar hoy y `comision_restante` lo que espera a que el cliente liquide. Cuando `comision_de_notion` es true, el número viene de la fórmula de Notion y manda.'
           : '5. Este rol no ve importes: no menciones dinero ni comisiones, ni aunque te pregunten; di que eso lo ve dirección o pagos.',
    dinero ? '6. SALDOS: `saldo_estimado` es total vendido menos anticipo pactado, y cero si Notion ya dice LIQUIDADO. Es una estimación local: no sabe de abonos intermedios. Dilo cuando importe («saldo estimado»).' : '',
    '7. TALLER: `taller` describe la ventana de fabricación contada hacia atrás desde la instalación (empezar → cortar → armar → listo); `atraso_dias` son los días que ese trabajo va tarde. «no se dio» es una cotización que el cliente no aceptó.',
    '8. Si la pregunta es ambigua, contesta lo más probable y ofrece la otra lectura en una línea. No repitas la pregunta ni saludes; ve al dato.',
    '',
    'DATOS (JSON):',
    JSON.stringify(resumen),
  ].filter(l => l !== '').join('\n');
}

/* ----- El texto del modelo, a HTML seguro -----
   La respuesta es lo único que entra de fuera del dispositivo. Se escapa TODO primero y
   después se permiten cuatro cosas: negritas, cursivas, viñetas y saltos de línea. Nada de
   enlaces ni de marcado crudo: un modelo con un mal día no puede meter un <script>. */
export function mdLite(texto) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let enLista = false;
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    /* La cursiva con guion bajo, que es la que escriben la mitad de los modelos. Solo entre
       límites de palabra: un `folio_global` a media palabra se queda como está. */
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  for (const raw of lineas) {
    const l = raw.trimEnd();
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (m) {
      if (!enLista) { out.push('<ul>'); enLista = true; }
      out.push('<li>' + inline(m[1]) + '</li>');
      continue;
    }
    if (enLista) { out.push('</ul>'); enLista = false; }
    if (!l.trim()) continue;
    const h = /^#{1,3}\s+(.*)$/.exec(l);
    out.push(h ? '<p><b>' + inline(h[1]) + '</b></p>' : '<p>' + inline(l) + '</p>');
  }
  if (enLista) out.push('</ul>');
  return out.join('');
}

/* ----- Las llaves del cotizador, leídas y nunca escritas -----
   El cotizador guarda las API keys ofuscadas en `al3d_kxs_<proveedor>` (XOR con una sal y
   base64, ver js/cotizador/ia.js) y el proveedor y modelo elegidos en `ai_provider` y
   `ai_model_<proveedor>`. Aquí se leen con la misma receta. La plataforma NO escribe ninguna
   de estas claves: la key se pega una vez, en el cotizador, y sirve para las dos apps. */
const KSALT = 'al3d·key·v1';
const kxor = s => { let o = ''; for (let i = 0; i < s.length; i++) o += String.fromCharCode(s.charCodeAt(i) ^ KSALT.charCodeAt(i % KSALT.length)); return o; };
const unpack = v => { try { return kxor(atob(String(v))); } catch (_) { return ''; } };

export const PROVEEDORES = ['gemini', 'groq', 'openrouter'];
export const PROVEEDOR_NOMBRE = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };
export const MODELO_DEFECTO = { gemini: 'gemini-2.5-flash', groq: 'meta-llama/llama-4-scout-17b-16e-instruct', openrouter: 'meta-llama/llama-4-scout:free' };

export function llavesDe(prov, almacen) {
  const get = k => { try { return almacen.getItem(k); } catch (_) { return null; } };
  const v = get('al3d_kxs_' + prov);
  if (v) {
    try { const a = JSON.parse(unpack(v)); if (Array.isArray(a)) return a.filter(Boolean).map(String); } catch (_) {}
  }
  const una = unpack(get('al3d_kx_' + prov) || '') || get('ai_key_' + prov) || (prov === 'gemini' ? get('ai_key') : '') || '';
  return una ? [String(una)] : [];
}

/** La cadena de intentos: el proveedor elegido con sus keys, y después los demás que tengan. */
export function cadenaIA(almacen) {
  const get = k => { try { return almacen.getItem(k); } catch (_) { return null; } };
  const elegido = PROVEEDORES.includes(get('ai_provider')) ? get('ai_provider') : 'gemini';
  const orden = [elegido].concat(PROVEEDORES.filter(p => p !== elegido));
  const out = [];
  for (const p of orden) {
    const ks = llavesDe(p, almacen);
    const modelo = get('ai_model_' + p) || (p === 'gemini' ? get('ai_model') : '') || MODELO_DEFECTO[p];
    for (const k of ks) out.push({ prov: p, model: modelo, key: k });
  }
  return out;
}

/* Para la etiqueta del mes en las sugerencias. */
export const mesActualEtiqueta = (hoy = hoyISO()) => etiquetaMes(String(hoy).slice(0, 7));
void diasEntre;
