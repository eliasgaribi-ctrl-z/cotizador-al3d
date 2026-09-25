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
import { hoyISO, esISO, diasEntre, MES_CORTO } from '../nucleo/fechas.js';

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
    /* El id es para los botones «Abrir» de las respuestas locales. No viaja a la IA:
       `promptSistema` lo quita al serializar. */
    id: p.id || '',
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
        proyecto: (P.find(p => p.id === i.proyecto_id) || {}).nombre || i.proyecto_id,
        folio: (P.find(p => p.id === i.proyecto_id) || {}).folio_local || '', id: i.proyecto_id || '' })),
    /* Las que ya pasaron y nadie marcó hecha ni cancelada: es la lista que el tablero llama
       «ya pasaron y nadie las marcó», y es la pregunta que sigue a «¿qué se instala?». */
    instalaciones_vencidas_sin_marcar: (d.instalaciones || [])
      .filter(i => i && i.fecha && i.fecha < hoy && ['propuesta', 'confirmada', 'reagendada'].includes(i.estado))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).slice(0, 15)
      .map(i => ({ fecha: i.fecha, estado: i.estado || '',
        proyecto: (P.find(p => p.id === i.proyecto_id) || {}).nombre || i.proyecto_id,
        folio: (P.find(p => p.id === i.proyecto_id) || {}).folio_local || '', id: i.proyecto_id || '' })),
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
      abonables_ya: com.filter(x => x.c.abonable > 0).map(x => ({ id: x.p.id, folio: x.p.folio_local, nombre: x.p.nombre,
        comision: x.c.abonable, pct: num(x.p.pct_comision), estatus_notion: x.p.estatus_notion || '' })),
      pendientes_de_liquidar: com.filter(x => x.c.abonable <= 0 && x.c.restante > 0).map(x => ({ id: x.p.id, folio: x.p.folio_local,
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
    '4. No puedes cambiar nada: eres de solo lectura. Si te piden hacer algo (marcar liquidado, abonar una comisión, mover una fecha), di en qué pantalla de la plataforma se hace: la etapa, el estatus de cobro y la cuenta se cambian en la ficha del proyecto (Proyectos); las fechas en Calendario; el material en Material; las ventas, la cartera y la bitácora se ven en Control. Los abonos de comisión y los pagos se registran en la hoja «Finanzas AL3D — Ventas y Comisiones», que es el libro mayor; la plataforma solo la espeja, y el récord de ventas que ves en DATOS es el de esa hoja más lo que solo está en este dispositivo.',
    dinero ? '5. COMISIONES: la comisión de un proyecto es subtotal × porcentaje pactado (redondeada a pesos). Se ABONA cuando el proyecto queda LIQUIDADO en la hoja; mientras no, es «comisión restante». En DATOS ya vienen calculadas: `comision_abonable_ya` es lo que ya se puede pagar hoy y `comision_restante` lo que espera a que el cliente liquide. Cuando `comision_de_notion` es true, el número viene de la fórmula de la hoja y manda.'
           : '5. Este rol no ve importes: no menciones dinero ni comisiones, ni aunque te pregunten; di que eso lo ve dirección o pagos.',
    dinero ? '6. SALDOS: `saldo_estimado` es el saldo que calcula la hoja cuando la venta está allá; si no, total vendido menos anticipo pactado, y cero si la hoja ya dice LIQUIDADO. El estimado no sabe de abonos intermedios: dilo cuando importe («saldo estimado»).' : '',
    '7. TALLER: `taller` describe la ventana de fabricación contada hacia atrás desde la instalación (empezar → cortar → armar → listo); `atraso_dias` son los días que ese trabajo va tarde. «no se dio» es una cotización que el cliente no aceptó.',
    '8. Si la pregunta es ambigua, contesta lo más probable y ofrece la otra lectura en una línea. No repitas la pregunta ni saludes; ve al dato.',
    '',
    'DATOS (JSON):',
    JSON.stringify(resumen, (k, v) => (k === 'id' ? undefined : v)),
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

/* ----- Los proveedores de IA -----
   Las llaves ya no viven en los teléfonos: están en la hoja, y la pregunta sale por el puente
   (rutaIA en puente/hoja-apps-script.gs). Aquí solo queda el orden —el mismo que el cotizador,
   AI_PROVS en js/cotizador/ia.js— y el modelo de cada uno, que es de la lista blanca de la hoja.
   pruebas/replicas.mjs compara las dos copias. */
export const PROVEEDORES = ['qwen', 'deepseek', 'gemini'];
export const PROVEEDOR_NOMBRE = { qwen: 'Qwen', deepseek: 'DeepSeek', gemini: 'Gemini' };
export const MODELO_DEFECTO = { qwen: 'qwen3.7-flash', deepseek: 'deepseek-flash', gemini: 'gemini-3.1-flash-lite' };

/** La cadena de intentos. `estado` es lo que /salud dice que tiene llave en la hoja
 *  ({qwen:true,…}); sin saberlo todavía se intenta con todos y la hoja dice «sin llave». */
export function cadenaIA(estado) {
  return PROVEEDORES.filter(p => !estado || estado[p]).map(p => ({ prov: p, model: MODELO_DEFECTO[p] }));
}

/* Para la etiqueta del mes en las sugerencias. */
export const mesActualEtiqueta = (hoy = hoyISO()) => etiquetaMes(String(hoy).slice(0, 7));

/* ============================================================================
   RESPUESTAS LOCALES — las siete preguntas de siempre, contestadas aquí y sin red.

   La auditoría del asistente encontró que todo pasaba por la IA, incluidas preguntas que
   tienen respuesta EXACTA en los datos del dispositivo: qué comisiones son abonables, quién
   debe, qué va tarde. Mandar eso a un modelo es pagar latencia y cuota —y sacar datos del
   teléfono— para recibir de vuelta una lista que ya estaba armada. Peor: un modelo puede
   sumarla mal. Así que las preguntas con respuesta calculable se contestan de este lado,
   con la misma aritmética de la pantalla de Control, al instante y también sin señal ni
   llave. La IA queda para lo que de verdad la necesita: una pregunta con matices, un
   «¿y si…?», una redacción.

   Cada respuesta es texto en el mismo Markdown chico que pinta `mdLite`, para que una
   respuesta local y una de la IA se vean iguales en el hilo.
   ============================================================================ */

export const INTENCIONES = {
  hoy:         { titulo: 'Resumen de hoy',                          pregunta: '¿Cómo va el taller hoy?' },
  comisiones:  { titulo: 'Comisiones abonables',                    pregunta: '¿Qué comisiones ya se pueden abonar y cuánto suman?', dinero: true },
  cobranza:    { titulo: 'Quién nos debe',                          pregunta: '¿Quién nos debe y cuánto?', dinero: true },
  tarde:       { titulo: 'Qué va tarde',                            pregunta: '¿Qué va tarde en el taller y por cuántos días?' },
  semana:      { titulo: 'Instalaciones de la semana',              pregunta: '¿Qué se instala esta semana?' },
  ventas:      { titulo: 'Ventas del mes',                          pregunta: '¿Cuánto vendimos este mes contra el anterior?', dinero: true },
  material:    { titulo: 'Material por comprar',                    pregunta: '¿Qué material falta comprar y para qué proyecto?' },
  sin_decidir: { titulo: 'Cotizaciones sin decidir',                pregunta: '¿Qué cotizaciones autorizadas siguen sin decidir?' },
};

/* ----- Qué pregunta escrita cae en qué respuesta local -----
   Sin acentos y en minúsculas, y por PUNTAJE: cada intención tiene palabras fuertes (valen 2)
   y débiles (valen 1); gana la que más suma, y solo si suma al menos 2. Así «¿qué debe la
   óptica?» cae en cobranza aunque «óptica» no diga nada, y «material de la cotización
   pendiente» no se va a material solo por la primera palabra. Lo que suene a condicional,
   consejo o redacción va a la IA aunque nombre una comisión: «¿si liquidan mañana cuánto
   tocaría?» no es la lista de abonables. Se prueba con las frases que la gente escribe. */
const plano = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SENAS = {
  comisiones:  { fuertes: [/comision/], debiles: [/abon/, /pagar(le|les)?\b/, /porcentaje/] },
  cobranza:    { fuertes: [/\bdeb(e|en|emos|es)\b/, /cobr/, /saldo/, /adeud/, /cartera/, /por pagar/, /pendiente de pago/, /liquid/],
                 debiles: [/cliente/, /anticipo/, /falta(n)? pagar/, /quien/] },
  tarde:       { fuertes: [/tarde/, /atras/, /retras/, /demor/, /vencid/], debiles: [/taller/, /dias/, /urgente/, /apurad/] },
  semana:      { fuertes: [/instala/, /agenda/, /calendario/, /\bcita/, /entrega/], debiles: [/semana/, /manana/, /hoy/, /cuando/, /fecha/, /proxim/] },
  ventas:      { fuertes: [/vend/, /venta/, /factur/, /ingres/, /conversion/], debiles: [/\bmes\b/, /cuanto/, /llevamos/, /hicimos/, /anterior/, /pipeline/] },
  material:    { fuertes: [/material/, /compr/, /almacen/, /inventario/, /stock/, /acrilic/, /lamina/, /\bled\b/, /fuente/, /vinil/, /aluminio/],
                 debiles: [/falta/, /minimo/, /pedir/, /proveedor/, /surtir/] },
  sin_decidir: { fuertes: [/sin decidir/, /autorizad/, /sin (respuesta|contestar|decision)/, /no (han|ha) (decidido|contestado|respondido)/, /se gano|no se dio/],
                 debiles: [/cotizaci/, /pendiente/, /cliente/, /prospect/] },
  hoy:         { fuertes: [/como va\b/, /resumen/, /panorama/, /estado (del|de el) taller/, /que hay\b/, /como estamos/, /como vamos/, /novedades/],
                 debiles: [/hoy/, /taller/, /todo/] },
};
const PARA_LA_IA = /\b(si |cuando |cuando\b|por que|porque|como (le|se|les) |deberia|conviene|recomiend|explica|explicame|compara|que pasa|redact|escribe|escribeme|mensaje|dime como|opinas|sugier|estrateg|analiz|ayudame a)/;

function puntajes(texto) {
  const t = ' ' + plano(texto).replace(/[¿?¡!.,;:()]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const out = [];
  for (const [intent, s] of Object.entries(SENAS)) {
    let n = 0;
    for (const re of s.fuertes) if (re.test(t)) n += 2;
    for (const re of s.debiles) if (re.test(t)) n += 1;
    if (n) out.push({ intent, n });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** La intención de una pregunta escrita, o null si hay que preguntarle a la IA. */
export function detectarIntencion(texto) {
  const t = String(texto || '').trim();
  if (!t || t.length > 160) return null;
  if (PARA_LA_IA.test(' ' + plano(t) + ' ')) return null;
  const ps = puntajes(t);
  if (!ps.length || ps[0].n < 2) return null;
  /* Un empate entre dos intenciones es una pregunta ambigua: mejor sugerir que adivinar. */
  if (ps.length > 1 && ps[1].n === ps[0].n && ps[0].n < 4) return null;
  return ps[0].intent;
}

/** Hasta tres intenciones parecidas, para el «¿quisiste decir…?» cuando no hay IA. */
export function sugerirIntenciones(texto) {
  const ps = puntajes(texto).filter(p => p.n >= 1).slice(0, 3).map(p => p.intent);
  return ps.length ? ps : ['hoy', 'cobranza', 'tarde'];
}

const pesos = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cuenta = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
const sinDinero = 'Con tu rol no se ven importes. Eso lo contesta dirección o pagos desde su dispositivo.';
const fechaCorta = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Number(m[3]) + ' ' + (MES_CORTO[Number(m[2]) - 1] || m[2]) : String(iso || '');
};

/* Las acciones que acompañan a una respuesta local: la pantalla que toca, y los proyectos
   que nombra, para abrirlos con un toque. `tipo` es lo que entiende el panel:
   'ir' (una ruta), 'pasar' (una ruta con dato), 'proyecto' (la ficha), 'link' (fuera). */
/* La hoja de finanzas. Es la misma para los tres teléfonos y no cambia: el id es el de
   «Finanzas AL3D — Ventas y Comisiones». Antes aquí vivía una página de Notion que ya no
   existe, y el asistente la seguía ofreciendo como si llevara a algún lado. */
const HOJA_FINANZAS = 'https://docs.google.com/spreadsheets/d/1tTU_FXBlvl29diKaXQjSkxq3J9bWcQE6dx9xPSKKjHs/edit';
const accProyectos = (lista, max = 6) => lista.filter(p => p && p.id).slice(0, max)
  .map(p => ({ tipo: 'proyecto', id: p.id, label: (p.folio ? p.folio + ' · ' : '') + String(p.nombre || p.proyecto || '').split(' - ')[0].slice(0, 28) }));

/**
 * La respuesta local a una intención: `{texto, acciones}`. `null` si la intención no existe.
 * El texto va en Markdown chico y siempre termina con lo que se puede HACER; las acciones
 * son los botones para hacerlo sin salir a buscar.
 */
export function respuestaLocal(intent, r) {
  const texto = responderLocal(intent, r);
  if (texto === null) return null;
  return { texto, acciones: accionesDe(intent, r) };
}

function accionesDe(intent, r) {
  const dinero = r.ve_dinero !== false;
  const P = r.proyectos || [];
  switch (intent) {
    case 'comisiones': {
      if (!dinero) return [];
      const c = r.comisiones || { abonables_ya: [], pendientes_de_liquidar: [] };
      return [{ tipo: 'link', href: HOJA_FINANZAS, label: 'Comisiones en la hoja' },
        ...accProyectos(c.abonables_ya.concat(c.pendientes_de_liquidar), 5)];
    }
    case 'cobranza': {
      if (!dinero) return [];
      const con = P.filter(p => Number(p.saldo_estimado) > 0)
        .sort((a, b) => (Number(b.etapa === 'instalado') - Number(a.etapa === 'instalado')) || (b.saldo_estimado - a.saldo_estimado));
      return [{ tipo: 'pasar', ruta: 'control', dato: { tab: 'cobrar' }, label: 'Ver la cartera' }, ...accProyectos(con, 5)];
    }
    case 'tarde': {
      const tarde = P.filter(p => Number(p.atraso_dias) > 0).sort((a, b) => b.atraso_dias - a.atraso_dias);
      return [{ tipo: 'ir', ruta: 'hoy', label: 'Ver el Tablero' }, ...accProyectos(tarde, 5)];
    }
    case 'semana': {
      const prox = (r.instalaciones_proximas || []).concat(r.instalaciones_vencidas_sin_marcar || []);
      return [{ tipo: 'pasar', ruta: 'agenda', dato: { dia: r.hoy, vista: 'semana' }, label: 'Ver la semana' },
        ...accProyectos(prox.map(i => ({ id: i.id, folio: i.folio, nombre: i.proyecto })), 5)];
    }
    case 'ventas': return dinero ? [{ tipo: 'pasar', ruta: 'control', dato: { tab: 'ventas' }, label: 'Ver Control' }] : [];
    case 'material': return [{ tipo: 'ir', ruta: 'material', label: 'Ver la lista de compra' }];
    case 'sin_decidir': {
      const s = r.cotizaciones_autorizadas_sin_decidir;
      return (Array.isArray(s) ? s.length : s) ? [{ tipo: 'ir', ruta: 'proyectos', label: 'Decidir en Proyectos' }] : [];
    }
    case 'hoy': {
      const acc = [{ tipo: 'ir', ruta: 'hoy', label: 'Ver el Tablero' }];
      if (dinero) acc.push({ tipo: 'pasar', ruta: 'control', dato: { tab: 'ventas' }, label: 'Ver Control' });
      acc.push({ tipo: 'ir', ruta: 'atender', label: 'Qué atender' });
      return acc;
    }
    default: return [];
  }
}

/**
 * La respuesta local a una intención, en Markdown chico. `null` si la intención no existe.
 * Siempre termina con lo que se puede HACER, en la plataforma o en Notion.
 */
export function responderLocal(intent, r) {
  if (!r || !INTENCIONES[intent]) return null;
  const dinero = r.ve_dinero !== false;
  const P = r.proyectos || [];
  switch (intent) {
    case 'comisiones': {
      if (!dinero) return sinDinero;
      const c = r.comisiones || { abonables_ya: [], pendientes_de_liquidar: [], total_abonable_ya: 0, total_pendiente: 0 };
      const out = [];
      if (c.abonables_ya.length) {
        out.push('**Se pueden abonar ya: ' + pesos(c.total_abonable_ya) + '** en ' + cuenta(c.abonables_ya.length, 'proyecto liquidado', 'proyectos liquidados') + '.');
        for (const x of c.abonables_ya) out.push('- ' + x.folio + ' · ' + x.nombre + ' · ' + x.pct + ' % · **' + pesos(x.comision) + '**');
      } else {
        out.push('**Hoy no hay ninguna comisión abonable.** Una comisión se abona cuando el proyecto queda LIQUIDADO en la hoja, y ninguno con comisión lo está.');
      }
      if (c.pendientes_de_liquidar.length) {
        out.push('');
        out.push('Esperan a que el cliente liquide: ' + cuenta(c.pendientes_de_liquidar.length, 'proyecto', 'proyectos') + ' por **' + pesos(c.total_pendiente) + '**.');
        for (const x of c.pendientes_de_liquidar.slice(0, 8)) {
          out.push('- ' + x.folio + ' · ' + x.nombre + ' · ' + pesos(x.comision) + (x.saldo_del_cliente > 0 ? ' (el cliente debe ' + pesos(x.saldo_del_cliente) + ')' : '') + (x.estatus_notion ? ' · ' + x.estatus_notion : ''));
        }
        if (c.pendientes_de_liquidar.length > 8) out.push('- … y ' + (c.pendientes_de_liquidar.length - 8) + ' más');
      }
      out.push('');
      out.push(c.abonables_ya.length
        ? 'Registra el abono con ⚡ AL3D → Registrar abono de comisión en la hoja. La plataforma solo lo espeja.'
        : 'Cuando un cliente liquide, marca LIQUIDADO en la ficha del proyecto y aquí aparece como abonable.');
      return out.join('\n');
    }
    case 'cobranza': {
      if (!dinero) return sinDinero;
      const con = P.filter(p => Number(p.saldo_estimado) > 0)
        .sort((a, b) => (Number(b.etapa === 'instalado') - Number(a.etapa === 'instalado')) || (b.saldo_estimado - a.saldo_estimado));
      if (!con.length) return '**Nadie debe.** Todos los proyectos vivos tienen el anticipo igual al total o ya están liquidados en la hoja.';
      const total = con.reduce((s, p) => s + Number(p.saldo_estimado), 0);
      const inst = con.filter(p => p.etapa === 'instalado');
      const out = ['**Por cobrar: ' + pesos(total) + '** en ' + cuenta(con.length, 'proyecto', 'proyectos') +
        (inst.length ? ', ' + cuenta(inst.length, 'ya instalado', 'ya instalados') + ' (' + pesos(inst.reduce((s, p) => s + Number(p.saldo_estimado), 0)) + ').' : '.')];
      for (const p of con.slice(0, 10)) {
        out.push('- ' + p.folio + ' · ' + p.nombre + ' · **' + pesos(p.saldo_estimado) + '**' +
          (p.etapa === 'instalado' ? ' · ya instalado' : ' · ' + p.etapa) + (p.estatus_notion ? ' · ' + p.estatus_notion : ''));
      }
      if (con.length > 10) out.push('- … y ' + (con.length - 10) + ' más');
      out.push('');
      out.push('El saldo es el total menos el anticipo pactado (estimado; no sabe de abonos intermedios). En **Control → Por cobrar** cada renglón trae el WhatsApp de cobro ya escrito.');
      return out.join('\n');
    }
    case 'tarde': {
      const tarde = P.filter(p => Number(p.atraso_dias) > 0).sort((a, b) => b.atraso_dias - a.atraso_dias);
      const enTaller = P.filter(p => p.taller).length;
      if (!tarde.length) return '**Nada va tarde.** ' + (enTaller ? cuenta(enTaller, 'trabajo está', 'trabajos están') + ' en el taller y todos dentro de su ventana.' : 'No hay trabajos en el taller ahora.');
      const out = ['**' + cuenta(tarde.length, 'trabajo va', 'trabajos van') + ' tarde:**'];
      for (const p of tarde) out.push('- ' + p.folio + ' · ' + p.nombre + ' · **' + cuenta(p.atraso_dias, 'día', 'días') + '** · ' + (p.taller || p.etapa) + (p.instalacion && p.instalacion !== 'sin fecha' ? ' · instala ' + fechaCorta(p.instalacion) : ''));
      out.push('');
      out.push('Si el atraso es real, avanza la etapa desde el **Tablero**; si la fecha ya no se sostiene, muévela en **Calendario** o corrige el plazo con la ficha del renglón.');
      return out.join('\n');
    }
    case 'semana': {
      const hoy = r.hoy || hoyISO();
      const fin = masDiasISO(hoy, 6);
      const prox = (r.instalaciones_proximas || []).filter(i => i.fecha <= fin);
      const venc = r.instalaciones_vencidas_sin_marcar || [];
      const out = [];
      if (prox.length) {
        out.push('**' + cuenta(prox.length, 'instalación', 'instalaciones') + ' de hoy al ' + fechaCorta(fin) + ':**');
        for (const i of prox) out.push('- ' + fechaCorta(i.fecha) + (i.hora ? ' ' + i.hora : '') + ' · ' + i.proyecto + (i.folio ? ' (' + i.folio + ')' : '') + ' · ' + i.estado);
      } else {
        out.push('**No hay instalaciones agendadas de hoy al ' + fechaCorta(fin) + '.**');
      }
      if (venc.length) {
        out.push('');
        out.push('Ya pasaron y nadie las marcó (' + venc.length + '):');
        for (const i of venc) out.push('- ' + fechaCorta(i.fecha) + ' · ' + i.proyecto + (i.folio ? ' (' + i.folio + ')' : ''));
        out.push('');
        out.push('Márcalas como hechas o cancélalas en **Calendario**; mientras, el proyecto sigue contando como pendiente de instalar.');
      }
      return out.join('\n');
    }
    case 'ventas': {
      if (!dinero) return sinDinero;
      const v = r.ventas;
      if (!v) return 'Todavía no hay ventas registradas en la plataforma.';
      const claves = Object.keys(v).filter(k => v[k] && typeof v[k] === 'object' && 'vendido' in v[k]);
      const [actual, anterior] = claves;
      const out = [];
      if (actual) out.push('**' + actual + ': ' + pesos(v[actual].vendido) + '** en ' + cuenta(v[actual].proyectos, 'proyecto', 'proyectos') + '.');
      if (anterior) out.push('- ' + anterior + ': ' + pesos(v[anterior].vendido) + ' en ' + cuenta(v[anterior].proyectos, 'proyecto', 'proyectos') +
        (v.variacion_pct === null || v.variacion_pct === undefined ? '' : ' → ' + (v.variacion_pct >= 0 ? '+' : '') + v.variacion_pct + ' % este mes'));
      if (v.autorizado_sin_decidir) out.push('- Autorizado sin decidir: ' + pesos(v.autorizado_sin_decidir.total) + ' en ' + cuenta(v.autorizado_sin_decidir.n, 'cotización', 'cotizaciones'));
      if (v.no_se_dio_este_mes && v.no_se_dio_este_mes.n) out.push('- No se dio este mes: ' + pesos(v.no_se_dio_este_mes.total) + ' en ' + cuenta(v.no_se_dio_este_mes.n, 'cotización', 'cotizaciones'));
      if (v.ultimos_12_meses) out.push('- Últimos 12 meses: ' + pesos(v.ultimos_12_meses.total) + ' en ' + cuenta(v.ultimos_12_meses.n, 'proyecto', 'proyectos') + (v.ticket_promedio ? ' · ticket promedio ' + pesos(v.ticket_promedio) : ''));
      if (r.conversion && r.conversion.tasa !== null && r.conversion.tasa !== undefined) out.push('- Conversión: ' + r.conversion.tasa + ' % (' + r.conversion.ganadas + ' ganadas de ' + (r.conversion.ganadas + r.conversion.perdidas) + ' decididas)');
      out.push('');
      out.push('«Vendido» suma el precio autorizado por la fecha en que se ganó cada proyecto. Los doce meses en barras están en **Control → Ventas**.');
      return out.join('\n');
    }
    case 'material': {
      const comprar = r.material_por_comprar || [];
      const minimo = r.bajo_minimo || [];
      if (!comprar.length && !minimo.length) return '**No hay nada que comprar.** El material de los proyectos abiertos está cubierto y nada está bajo su mínimo.';
      const out = [];
      if (comprar.length) {
        out.push('**' + cuenta(comprar.length, 'material por comprar', 'materiales por comprar') + ':**');
        for (const l of comprar) out.push('- **' + l.comprar + ' ' + l.unidad + '** de ' + l.material + (l.para ? ' · para ' + l.para : '') + (l.fecha ? ' · se necesita el ' + fechaCorta(l.fecha) : '') + (l.confianza === 'estimada' ? ' · estimado' : ''));
      }
      if (minimo.length) {
        out.push('');
        out.push('Bajo mínimo (' + minimo.length + '):');
        for (const m of minimo) out.push('- ' + m.material + ' · hay ' + m.hay + (m.unidad ? ' ' + m.unidad : '') + ', mínimo ' + m.minimo + (m.proveedor ? ' · ' + m.proveedor : ''));
      }
      out.push('');
      out.push('La lista completa, con cantidades redondeadas a lo que vende el proveedor, está en **Material → Por comprar**; se imprime y se marca como recibida ahí.');
      return out.join('\n');
    }
    case 'sin_decidir': {
      const s = r.cotizaciones_autorizadas_sin_decidir;
      if (typeof s === 'number') return s ? '**' + cuenta(s, 'cotización autorizada sigue', 'cotizaciones autorizadas siguen') + ' sin decidir.** Dirección decide si se ganó o no desde Proyectos.' : '**No hay cotizaciones sin decidir.**';
      if (!s || !s.length) return '**No hay cotizaciones autorizadas sin decidir.** Cada una ya es proyecto o ya se marcó como «no se dio».';
      const total = s.reduce((a, e) => a + Number(e.total || 0), 0);
      const out = ['**' + cuenta(s.length, 'cotización autorizada', 'cotizaciones autorizadas') + ' sin decidir, ' + pesos(total) + ' en juego:**'];
      for (const e of s) out.push('- ' + e.folio + ' · ' + (e.cliente ? e.cliente + ' — ' : '') + e.proyecto + ' · ' + pesos(e.total) + (e.dias !== null && e.dias !== undefined ? ' · ' + cuenta(e.dias, 'día', 'días') : ''));
      out.push('');
      out.push('Mientras no se diga si se ganó, no hay proyecto, ni material, ni fecha. Se decide con «Se ganó» / «No se dio» en **Proyectos** o en el **Tablero**.');
      return out.join('\n');
    }
    case 'hoy': {
      const d = resumenDelDia(r);
      const out = ['**Hoy, ' + fechaCorta(r.hoy) + ':**'];
      out.push('- En el taller: ' + cuenta(d.enTaller, 'trabajo', 'trabajos') + (d.tarde ? ', **' + cuenta(d.tarde, 'va', 'van') + ' tarde**' : ', ninguno tarde'));
      out.push('- Instalaciones de aquí a 7 días: ' + d.semana + (d.vencidas ? ' · **' + cuenta(d.vencidas, 'pasó sin marcarse', 'pasaron sin marcarse') + '**' : ''));
      if (dinero) {
        out.push('- Por cobrar: **' + pesos(d.porCobrar) + '** en ' + cuenta(d.conSaldo, 'proyecto', 'proyectos'));
        out.push('- Comisiones abonables ya: ' + (d.comisionAbonable > 0 ? '**' + pesos(d.comisionAbonable) + '**' : 'ninguna'));
        if (d.sinDecidir) out.push('- Autorizadas sin decidir: ' + cuenta(d.sinDecidir, 'cotización', 'cotizaciones') + ' por ' + pesos(d.sinDecidirTotal));
      } else if (d.sinDecidir) out.push('- Autorizadas sin decidir: ' + cuenta(d.sinDecidir, 'cotización', 'cotizaciones'));
      if (d.comprar) out.push('- Material por comprar: ' + cuenta(d.comprar, 'renglón', 'renglones') + (d.bajoMinimo ? ' · ' + d.bajoMinimo + ' bajo mínimo' : ''));
      if (d.avisos.length) { out.push(''); out.push('Lo que truena antes:'); for (const a of d.avisos) out.push('- ' + a); }
      return out.join('\n');
    }
    default: return null;
  }
}

/** Los cinco números del encabezado del asistente. Puro, desde el resumen. */
export function resumenDelDia(r) {
  const P = (r && r.proyectos) || [];
  const hoy = (r && r.hoy) || hoyISO();
  const fin = masDiasISO(hoy, 6);
  const conSaldo = P.filter(p => Number(p.saldo_estimado) > 0);
  const sd = r && r.cotizaciones_autorizadas_sin_decidir;
  return {
    enTaller: P.filter(p => p.taller).length,
    tarde: P.filter(p => Number(p.atraso_dias) > 0).length,
    semana: ((r && r.instalaciones_proximas) || []).filter(i => i.fecha <= fin).length,
    vencidas: ((r && r.instalaciones_vencidas_sin_marcar) || []).length,
    porCobrar: conSaldo.reduce((s, p) => s + Number(p.saldo_estimado), 0),
    conSaldo: conSaldo.length,
    comisionAbonable: (r && r.comisiones && r.comisiones.total_abonable_ya) || 0,
    sinDecidir: Array.isArray(sd) ? sd.length : (Number(sd) || 0),
    sinDecidirTotal: Array.isArray(sd) ? sd.reduce((s, e) => s + Number(e.total || 0), 0) : 0,
    comprar: ((r && r.material_por_comprar) || []).length,
    bajoMinimo: ((r && r.bajo_minimo) || []).length,
    avisos: ((r && r.avisos) || []).slice(0, 3).map(a => a.titulo + (a.cuando ? ' · ' + a.cuando : '')),
  };
}

function masDiasISO(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
void diasEntre;
