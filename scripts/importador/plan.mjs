/* ============================================================================
   EL PLAN DE IMPORTACIÓN — de la hoja y los teléfonos a las filas de la base.

   planear() toma el volcado de la hoja (puente/volcado-para-importar.gs) y los respaldos de los
   teléfonos, y devuelve las filas que irían a cada tabla, los contadores que hay que sembrar, la
   tabla de remapeo de ids y el REPORTE. No toca la base ni el disco: quien escribe el SQL es
   sql.mjs y quien lo corre es una persona.

   Las reglas son las de supabase/DISENO.md §3 (cobertura) y §3.5 (unión entre teléfonos), y
   las decisiones Q-14 y Q-15 de docs/DECISIONES-SUPABASE.md. La regla de fondo: NO DECIDE. Lo que
   la hoja o los teléfonos no dejan claro no se adivina: se reporta, y la fila espera (o entra con
   lo seguro y lo dudoso queda en `procedencia`, que la base guarda tal cual).

   Determinista: mismas entradas, mismo plan (para que una segunda corrida no cambie nada, IM-02).
   Sin reloj: lo único que depende del momento es lo que el SQL hace con now().
   ============================================================================ */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { col, texto, numero, fecha, hora, vacia, esFecha, filas, encabezados, limpioParaTexto } from './celdas.mjs';
import { plazoDesdeHoja, ETAPA_DESDE_NOTION } from '../../js/datos/puente.js';
import { telefonoLimpio, ubicacionDeHoja } from '../../js/datos/proyectos.js';
import { entregaDesdeHoja } from '../../js/datos/entrega.js';
import { verificar, dinero2, normalizarCodigo, canonDe, registroDeFila, CODIFICACIONES } from '../../supabase/functions/_shared/sello.js';

export const EMPRESA = 'al3d';

/* Por qué una autorización no entra en la copia diaria (lista cerrada: es lo único que se anota de ella, junto con su fila).
   Los tres primeros son los que manda la hoja (copiaVeredicto_ de puente/copia-diaria.gs); los demás, los de aquí. */
export const MOTIVOS_AUTORIZACION = Object.freeze(['firma_no_coincide', 'codigo_no_coincide', 'no_se_pudo_comprobar', 'sin_veredicto', 'veredicto_invalido',
  'texto_distinto', 'fila_mal_formada', 'dos_vigentes', 'sin_comprobacion', 'sin_clave_en_la_hoja', 'sin_codigo_gs']);

/** La comprobación de firmas que manda la hoja (`volcado.autorizaciones_comprobadas`), leída sin creerle la forma. */
export function leerVeredictos(x) {
  const no = (motivo, por) => ({ ok: false, motivo, por });
  if (!objeto(x) || x.version !== 1) {
    return no('sin_comprobacion', 'la hoja no mandó su comprobación de firmas (puente/copia-diaria.gs de antes del 2026-10-17): se pegan los archivos nuevos y entran solas');
  }
  if (x.sin === 'clave') return no('sin_clave_en_la_hoja', 'la hoja no tiene la clave del sello en sus propiedades (SELLO_AUTORIZACION): no pudo comprobar ninguna');
  if (x.sin === 'codigo') return no('sin_codigo_gs', 'la hoja no encontró las funciones del sello de Código.gs: no comprobó ninguna');
  if (!Array.isArray(x.filas)) return no('sin_comprobacion', 'la comprobación de firmas de la hoja no trae sus filas');
  const porFila = new Map();
  const repetidas = new Set();
  for (const v of x.filas) {
    if (!objeto(v) || !Number.isInteger(v.fila) || v.fila < 2) continue;
    if (porFila.has(v.fila)) repetidas.add(v.fila);
    porFila.set(v.fila, v);
  }
  for (const f of repetidas) porFila.delete(f);      // dos veredictos para la misma fila: no se le cree a ninguno
  return { ok: true, porFila };
}

/* Vocabularios cerrados de la base (CHECK). Duplicados a propósito: si la base cambia uno, la prueba lo atrapa. */
const ESTATUS = ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO'];
const CUENTAS = ['Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT'];
const TIPOS = ['Caja de luz con iluminacion', 'Caja de luz sin iluminacion', 'Letras 3D con iluminacion',
  'Letras 3D sin iluminacion', 'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial'];
const ETAPAS = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo', 'instalado', 'garantia', 'cancelado'];
const AREAS = ['direccion', 'fabricacion', 'pagos'];
const UNIDADES_COMPRA = ['unidad', 'bolsa', 'caja', 'lamina', 'litro', 'metro'];
/* Las claves de fábrica de cada grupo de tarifas (las de COT_TARIFAS_FABRICA del .gs y de interno.tarifas_fabrica() de 0019;
   pruebas/tarifas.mjs compara las tres). */
export const FABRICA_TARIFAS = Object.freeze({ material: ['al-paint', 'al-brush', 'acr-vol', 'acr-vinil', 'acero'], complejidad: ['recta', 'cursiva', 'compleja'],
  recorte: ['sencillo', 'vinil', 'sandwich'], 'recorte-extra': ['sandwich'], bastidor: ['lamina', 'alucobond'], caja: ['std', 'nube'] });
/* Las categorías de gasto, en el orden del desplegable: las de CATEGORIAS de js/datos/gastos.js, GASTO_CATEGORIAS del .gs y el CHECK
   de 0020 (pruebas/gastos.mjs compara las cuatro). Copia a propósito: gastos.js trae consigo la base y la bandeja del teléfono. */
export const CATEGORIAS_GASTO = Object.freeze(['Material', 'Mano de obra', 'Renta y servicios', 'Herramienta',
  'Transporte y gasolina', 'Publicidad', 'Comisiones y nómina', 'Otros']);
/* Por qué un renglón de «Gastos» no entra en la copia (lista cerrada: es lo único que se anota de él, junto con su fila). */
export const MOTIVOS_GASTO = Object.freeze(['sin_id', 'id_no_sirve', 'id_repetido', 'fecha_no_se_entiende', 'sin_concepto', 'monto_no_sirve']);
const NORM_CONSUMO = { 'm²': 'm2', 'm2': 'm2', 'm² limpiados': 'm2', 'm de cordón': 'm', 'm de cordon': 'm',
  'm': 'm', 'cm': 'cm', 'pieza': 'pieza', 'piezas': 'pieza', 'litro': 'litro' };
const TIPOS_MOV = ['entrada', 'salida', 'ajuste', 'conteo', 'merma', 'devolucion'];
const ORIGENES_MOV = ['derivado', 'manual', 'conteo', 'compra'];
const ESTADOS_REQ = ['calculado', 'apartado', 'comprado', 'consumido', 'descartado'];
const ESTADOS_INST = ['propuesta', 'confirmada', 'reagendada', 'hecha', 'cancelada'];

const RE_FOLIO_HOJA = /^V-\d{3,7}$/;
const RE_FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
const RE_ID = /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$/;
const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_TS_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RE_DISP = /^[A-Za-z0-9_-]{1,24}$/;

/* AI «Sellos» guarda {encabezado: ms}; la base, {grupo: ms} (DISENO.md §3.1). «Hora instalacion» comparte el de la fecha. */
const GRUPO_DE_ENCABEZADO = { 'Etapa de obra': 'etapa', 'Notas': 'notas', 'Plazo taller': 'plazo_k', 'Telefono': 'tel',
  'Direccion': 'dir_texto', 'Ubicacion': 'ubicacion', 'Entrega': 'entrega', 'Fecha instalacion': 'instalacion',
  'Hora instalacion': 'instalacion' };
/* Los datos de obra que se unen por sello (§3.5), con los campos de cada grupo. */
const GRUPOS_OBRA = { etapa: ['etapa'], notas: ['notas'], plazo_k: ['plazo_k'], tel: ['tel'], dir_texto: ['dir_texto'],
  ubicacion: ['maps_url', 'lat', 'lng', 'geo_fuente'], entrega: ['entrega'] };

/* Columnas de «Ventas» (DISENO.md §3.1). */
const V = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'R', 'S', 'T', 'V', 'W',
  'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI'].map(l => [l, col(l)]));

const sha = (s, n = 12) => createHash('sha256').update(String(s)).digest('hex').slice(0, n);
const md5 = s => createHash('md5').update(String(s)).digest('hex');
const ms = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0; };
const objeto = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const igualJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const numFolio = f => { const m = /^V-(\d+)$/.exec(String(f || '').trim().toUpperCase()); return m ? Number(m[1]) : 0; };

/* ============================================================================
   El reporte
   ============================================================================ */
function nuevoReporte() {
  const r = { rechazos: [], conflictos: [], avisos: [], fuera: [], no_importado: [], resumen: {} };
  r.rechazar = (donde, fila, que, por) => r.rechazos.push({ donde, fila, que, por });
  r.conflicto = (tema, que, detalle) => r.conflictos.push({ tema, que, detalle });
  r.avisar = (donde, fila, que, por) => r.avisos.push({ donde, fila, que, por });
  return r;
}

/* ============================================================================
   Los teléfonos
   ============================================================================ */

/** Un respaldo de teléfono, completo («al3d-completo») o solo de la plataforma, en una forma común. */
export function leerTelefono(t, i) {
  const r = objeto(t && t.respaldo) || {};
  const plat = r.app === 'al3d-completo' ? objeto(r.plataforma) || {} : r;
  const datos = objeto(plat.datos) || {};
  const cot = r.app === 'al3d-completo' ? objeto(objeto(r.cotizador) && r.cotizador.datos) || {} : {};
  const json = (s, def) => { try { const v = JSON.parse(s); return v ?? def; } catch (_) { return def; } };
  const lista = a => (Array.isArray(a) ? a.filter(x => x && typeof x === 'object') : []);
  const historial = lista(typeof cot.al3d_historial === 'string' ? json(cot.al3d_historial, []) : cot.al3d_historial);
  const tel = {
    etiqueta: String((t && t.etiqueta) || 'telefono-' + (i + 1)),
    proyectos: lista(datos.proyectos), instalaciones: lista(datos.instalaciones), materiales: lista(datos.materiales),
    movimientos: lista(datos.movimientos), requerimientos: lista(datos.requerimientos), constantes: lista(datos.constantes),
    historial,
    hitos: objeto(typeof cot.al3d_hitos === 'string' ? json(cot.al3d_hitos, {}) : cot.al3d_hitos) || {},
    folio: Number(String(cot.al3d_folio ?? '').replace(/\D/g, '')) || 0,
  };
  /* El aparato: el que se dijo al correr el script; si no, el que firma sus cotizaciones; si no, el que ganó sus proyectos. */
  const votos = new Map();
  const votar = d => { if (RE_DISP.test(d || '') && d !== 'hoja') votos.set(d, (votos.get(d) || 0) + 1); };
  for (const e of historial) votar(e.disp || String((e.sello && e.sello.folio) || '').split('@')[1]);
  if (!votos.size) for (const p of tel.proyectos) votar(p.dispositivo);
  const elegido = [...votos.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  tel.disp = RE_DISP.test((t && t.disp) || '') ? t.disp : (elegido ? elegido[0] : '');
  tel.disp_inferido = !(t && t.disp);
  return tel;
}

/* ============================================================================
   planear()
   ============================================================================ */

/**
 * @param {{volcado: object, telefonos?: Array<{etiqueta?: string, disp?: string, respaldo: object}>,
 *          clave?: string|null, semilla?: object|null, empresa?: string, aceptarVeredictosDeLaHoja?: boolean}} entrada
 *   clave    la clave del sello (SELLO_AUTORIZACION), leída del entorno por quien llama. Sin ella las
 *            autorizaciones no se importan: no se puede comprobar que la fila sea lo que se firmó.
 *   aceptarVeredictosDeLaHoja  SOLO la función `importar-diario` (autenticada con IMPORTAR_SECRETO): sin clave, cree la
 *            comprobación que la hoja hizo con la suya (`volcado.autorizaciones_comprobadas`; ver la sección 11).
 *   semilla  datos/semilla.json (por omisión, el del repositorio).
 */
export async function planear(entrada) {
  const empresa = entrada.empresa || EMPRESA;
  const vol = objeto(entrada.volcado);
  if (!vol || vol.formato !== 'al3d-volcado') throw new Error('El volcado no es de volcarParaImportar (falta formato «al3d-volcado»).');
  const P = objeto(vol.pestanas) || {};
  const rep = nuevoReporte();
  const tels = (entrada.telefonos || []).map(leerTelefono);
  const T = { proyectos: [], ventas_dinero: [], abonos: [], miembros: [], instalaciones: [], materiales: [], almacen_costos: [],
    requerimientos: [], almacen_movimientos: [], constantes: [], cotizaciones: [], autorizaciones: [], tarifas: [], gastos: [] };
  const esperado = [];
  const remapeo = {};
  const ref = (donde, fila) => `${donde}!${fila}`;

  /* ----- 1. «Ventas»: cada fila, leída y validada (§3.1) ----- */
  const ventas = [];
  const vistos = new Map();
  for (const { fila, celdas } of filas(P['Ventas'])) {
    const c = l => celdas[V[l]];
    const nombre = texto(c('B')).trim();
    if (!nombre) continue;                                      // B vacía: la fila no existe (como /jalar)
    const folio = texto(c('A')).trim().toUpperCase();
    if (!RE_FOLIO_HOJA.test(folio)) { rep.rechazar('Ventas', fila, 'A «Folio»', `«${texto(c('A'))}» no es un folio V-###`); continue; }
    const g = numero(c('G')), i = numero(c('I')), j = numero(c('J'));
    const malos = [];
    if (!g.ok) malos.push('G «Precio Subtotal» trae texto');
    if (!i.ok || i.n < 0) malos.push('I «Anticipo» ' + (i.ok ? 'es negativo' : 'trae texto'));
    if (!j.ok || j.n < 0) malos.push('J «Liquidacion» ' + (j.ok ? 'es negativo' : 'trae texto'));
    if (g.ok && Math.abs(g.n) >= 1e9) malos.push('G «Precio Subtotal» pasa del tope de la base');
    if ((i.ok && i.n >= 1e9) || (j.ok && j.n >= 1e9)) malos.push('I o J pasan del tope de la base');
    if (malos.length) { rep.rechazar('Ventas', fila, folio, malos.join('; ') + ': la fila espera a que se arregle la hoja'); continue; }
    const v = { fila, folio, nombre, celdas, g: g.n, i: i.n, j: j.n, celdasRaras: {} };
    if (vistos.has(folio)) vistos.get(folio).push(v); else vistos.set(folio, [v]);
    ventas.push(v);
  }
  for (const [folio, lista] of vistos) {
    if (lista.length > 1) {
      rep.conflicto('folio repetido en Ventas', folio, 'filas ' + lista.map(x => x.fila).join(', ') + ': no se importa ninguna hasta que la hoja diga cuál es');
      for (const x of lista) x.descartada = true;
    }
  }

  /* ----- 2. Los proyectos de los teléfonos, por llave (§3.5) ----- */
  const copias = [];                                            // {tel, p} de todos los teléfonos
  for (const tel of tels) for (const p of tel.proyectos) if (p.id) copias.push({ tel, p });
  const porGlobal = new Map(), porHoja = new Map();
  for (const x of copias) {
    const fg = String(x.p.folio_global || '').trim(), fh = String(x.p.folio_hoja || '').trim().toUpperCase();
    if (RE_FOLIO_GLOBAL.test(fg)) (porGlobal.get(fg) || porGlobal.set(fg, []).get(fg)).push(x);
    if (RE_FOLIO_HOJA.test(fh)) (porHoja.get(fh) || porHoja.set(fh, []).get(fh)).push(x);
    for (const marca of ['hoja_perdida', 'duplicado_de', 'hoja_doble', 'fuera_de_hoja']) {
      if (x.p[marca]) rep.fuera.push({ telefono: x.tel.etiqueta, id: x.p.id, marca, valor: x.p[marca], nombre: x.p.nombre || '' });
    }
  }
  const usadas = new Set();

  /* El id canónico de un grupo de copias: el del teléfono que emitió el folio; si no, el más viejo; si no hay, el de la hoja. */
  const canonico = (grupo, fg, folio) => {
    const propias = grupo.filter(x => !x.p.de_hoja && !String(x.p.id).startsWith('proy-hoja-'));
    const disp = fg ? fg.split('@')[1] : '';
    const delEmisor = propias.filter(x => x.p.dispositivo === disp).sort((a, b) => ms(a.p.creado_en) - ms(b.p.creado_en) || (a.p.id < b.p.id ? -1 : 1))[0];
    if (delEmisor) return delEmisor.p.id;
    const viejo = propias.slice().sort((a, b) => (ms(a.p.creado_en) || Infinity) - (ms(b.p.creado_en) || Infinity) || (a.p.id < b.p.id ? -1 : 1))[0];
    if (viejo) return viejo.p.id;
    return folio ? 'proy-hoja-' + folio : grupo[0].p.id;
  };

  /* ----- 3. Cada fila de Ventas → proyecto + ventas_dinero (§3.0, §3.1) ----- */
  const proyectoDeFolio = new Map();
  const ygUsados = new Map();
  const idsDeFilas = new Set();
  for (const v of ventas) {
    if (v.descartada) continue;
    const c = l => v.celdas[V[l]];
    const { folio, fila } = v;
    const procedencia = { fila_hoja: fila, celdas: {} };
    const raro = (l, valor) => { procedencia.celdas[l] = valor; };

    // Y: folio de cotización (el «Y = V-nnn» de sept-2026 se ignora)
    const yTxt = texto(c('Y')).trim();
    let y = RE_FOLIO_GLOBAL.test(yTxt) && yTxt.toUpperCase() !== folio ? yTxt : null;
    if (yTxt && !y) raro('Y', yTxt);

    if (y && ygUsados.has(y)) {
      rep.conflicto('folio de cotización en dos filas', y, `filas ${ygUsados.get(y)} y ${fila}: la segunda entra sin folio de cotización`);
      raro('Y', yTxt); y = null;
    }
    // Copias de teléfono: por Y y por folio de la hoja. Una copia que ya se unió a otra fila no se une a dos.
    const grupoTodo = [...new Set([...(y ? porGlobal.get(y) || [] : []), ...(porHoja.get(folio) || [])])];
    const grupo = grupoTodo.filter(x => !usadas.has(x));
    if (grupo.length < grupoTodo.length) {
      rep.conflicto('copia de teléfono que apunta a dos filas', folio, grupoTodo.filter(x => usadas.has(x)).map(x => `${x.tel.etiqueta}:${x.p.id}`).join(', ') +
        ' ya se unió a otra fila: esta entra sin ella');
    }
    const globalesDelGrupo = [...new Set(grupo.map(x => String(x.p.folio_global || '').trim()).filter(f => RE_FOLIO_GLOBAL.test(f)))];
    if (globalesDelGrupo.length > 1) {
      rep.conflicto('copias con folios de cotización distintos', folio, globalesDelGrupo.join(' vs ') + ': se importa la fila de la hoja sin unirla a ningún teléfono');
    }
    let unibles = globalesDelGrupo.length > 1 ? [] : grupo;
    let conCotizacion = unibles.some(x => !x.p.de_hoja && RE_FOLIO_GLOBAL.test(String(x.p.folio_global || '')));
    if (!y && conCotizacion) {
      y = globalesDelGrupo[0];
      if (ygUsados.has(y)) {
        rep.conflicto('folio de cotización en dos filas', y, `filas ${ygUsados.get(y)} y ${fila}: la segunda entra sin unirse al teléfono`);
        y = null; unibles = []; conCotizacion = false;
      } else if (yTxt) rep.avisar('Ventas', fila, folio, `Y «${yTxt}» no es el folio de la cotización del teléfono (${y}): se usa el del teléfono`);
    }
    // el id: nunca dos filas con el mismo (el dinero va por proyecto: la segunda pisaría el de la primera)
    if (unibles.length && idsDeFilas.has(canonico(unibles, conCotizacion ? y : null, folio))) {
      rep.conflicto('dos filas para el mismo proyecto de teléfono', folio, `${canonico(unibles, conCotizacion ? y : null, folio)} ya es de otra fila: esta entra sola`);
      unibles = []; conCotizacion = false;
    }
    if (y) ygUsados.set(y, fila);

    // Clasificación (§3.0)
    const estatusTxt = texto(c('C')).trim();
    const estatus = ESTATUS.includes(estatusTxt) ? estatusTxt : null;
    if (estatusTxt && !estatus) raro('C', estatusTxt);
    let fuente = 'hoja', historica;
    if (y && conCotizacion) { fuente = 'cotizacion'; historica = false; }
    else if (estatus === 'FABRICACION' || estatus === 'REPARANDO') historica = false;
    else historica = !y;

    const id = unibles.length ? canonico(unibles, fuente === 'cotizacion' ? y : null, folio) : 'proy-hoja-' + folio;
    if (!RE_ID.test(id)) { rep.rechazar('Ventas', fila, folio, `el id «${id}» no es válido para la base`); continue; }
    for (const x of unibles) { usadas.add(x); if (x.p.id !== id) remapeo[x.p.id] = id; }
    idsDeFilas.add(id);

    // Campos de la fila
    const cuentaTxt = texto(c('D')).trim();
    const cuenta = CUENTAS.includes(cuentaTxt) ? cuentaTxt : null;
    if (cuentaTxt && !cuenta) raro('D', cuentaTxt);
    const tiposTxt = texto(c('E')).split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    const tipo_trabajo = tiposTxt.filter(t => TIPOS.includes(t));
    if (tiposTxt.length !== tipo_trabajo.length) raro('E', texto(c('E')));
    const ivaTxt = texto(c('F')).trim();
    const iva = ivaTxt.toLowerCase() === 'sí';
    if (ivaTxt !== 'Sí' && ivaTxt !== 'No') rep.avisar('Ventas', fila, folio, `F «IVA» dice «${ivaTxt}» (se lee como ${iva ? 'Sí' : 'No'})`);
    const fechaDe = (l, nombreCol) => {
      const f = fecha(c(l));
      if (f && typeof f === 'object') { rep.avisar('Ventas', fila, folio, `${l} «${nombreCol}» tiene texto («${f.texto}»), no una fecha: queda vacía`); raro(l, f.texto); return null; }
      return f;
    };
    const fecha_anticipo = fechaDe('L', 'Fecha Anticipo');
    const fechaInst = fechaDe('M', 'Fecha instalacion');
    const fecha_liquidacion = fechaDe('N', 'Fecha Liquidacion');
    const etapaTxt = texto(c('Z')).trim();
    let etapa = ETAPA_DESDE_NOTION[etapaTxt] || null;
    if (etapaTxt && !etapa) raro('Z', etapaTxt);
    if (!etapa && !historica) etapa = 'ganado';
    const ubic = ubicacionDeHoja(texto(c('AB')));
    if (ubic.lat === 0 && ubic.lng === 0) { raro('AB', texto(c('AB'))); Object.assign(ubic, { lat: null, lng: null, geo_fuente: 'sin_ubicar' }); }
    if (texto(c('AB')).trim() && ubic.lat === null && !ubic.maps_url) raro('AB', texto(c('AB')));
    const telCrudo = texto(c('AE'));
    const tel = telefonoLimpio(telCrudo);
    if (telCrudo.trim() && tel !== telCrudo.trim()) rep.avisar('Ventas', fila, folio, `AE «Telefono» «${telCrudo}» se guarda como «${tel}»`);
    const entTxt = texto(c('AF')).trim();
    const entrega = entregaDesdeHoja(entTxt) || null;
    if (entTxt && !entrega) raro('AF', entTxt);
    const pct = numero(c('AD'));
    const pct_comision = pct.ok && !pct.vacia && pct.n >= 0 && pct.n <= 100 ? pct.n : null;
    if (!pct.vacia && pct_comision === null) raro('AD', texto(c('AD')));
    let sellosHoja = {};
    const aiTxt = texto(c('AI')).trim();
    if (aiTxt) {
      let ai = null; try { ai = JSON.parse(aiTxt); } catch (_) { /* abajo */ }
      if (objeto(ai)) {
        for (const [k, val] of Object.entries(ai)) {
          const gr = GRUPO_DE_ENCABEZADO[k], n = ms(val);
          if (gr && n) sellosHoja[gr] = Math.max(sellosHoja[gr] || 0, n);
        }
      } else raro('AI', aiTxt);
    }
    const hoja = {
      tel, etapa, notas: texto(c('AG')), plazo_k: plazoDesdeHoja(texto(c('AH'))), dir_texto: texto(c('AC')),
      maps_url: ubic.maps_url, lat: ubic.lat, lng: ubic.lng, geo_fuente: ubic.geo_fuente, entrega,
    };

    // La unión con los teléfonos: obra por sello; dinero, siempre la hoja (§3.5)
    const proyectoTel = unibles.find(x => x.p.id === id) || unibles.find(x => !x.p.de_hoja) || unibles[0] || null;
    const obra = { ...hoja };
    const sellos = { ...sellosHoja };
    if (unibles.length) {
      for (const [grupoObra, campos] of Object.entries(GRUPOS_OBRA)) {
        let gana = { sello: sellosHoja[grupoObra] || 0, de: 'hoja', vals: Object.fromEntries(campos.map(k => [k, hoja[k]])) };
        for (const x of unibles) {
          const s = ms(objeto(x.p.sellos) && x.p.sellos[grupoObra]);
          const vals = Object.fromEntries(campos.map(k => [k, valorDeTelefono(x.p, k)]));
          if (!igualJSON(vals, gana.vals)) {
            if (s > gana.sello) {
              rep.conflicto('obra distinta entre copias', folio, `${grupoObra}: gana ${x.tel.etiqueta} (sello ${s}) sobre ${gana.de} (sello ${gana.sello})`);
              gana = { sello: s, de: x.tel.etiqueta, vals };
            } else if (s === gana.sello && s > 0) {
              rep.conflicto('obra distinta con el mismo sello', folio, `${grupoObra}: ${x.tel.etiqueta} y ${gana.de} con sello ${s}; se queda ${gana.de}`);
            } else {
              rep.avisar('Ventas', fila, folio, `${grupoObra}: ${x.tel.etiqueta} tiene otro valor pero un sello más viejo; se queda ${gana.de}`);
            }
          }
          if (s > (sellos[grupoObra] || 0)) sellos[grupoObra] = s;
        }
        Object.assign(obra, gana.vals);
      }
      for (const x of unibles) {
        const s = ms(objeto(x.p.sellos) && x.p.sellos.instalacion);
        if (s > (sellos.instalacion || 0)) sellos.instalacion = s;
      }
      // dinero: manda la hoja; donde el teléfono dice otra cosa, se reporta
      for (const x of unibles) {
        const p = x.p, dif = [];
        if (p.sub !== undefined && p.sub !== null && Number(p.sub) !== v.g) dif.push(`subtotal ${p.sub} vs G ${v.g}`);
        if (p.anti_pactado !== undefined && p.anti_pactado !== null && Number(p.anti_pactado) !== v.i) dif.push(`anticipo ${p.anti_pactado} vs I ${v.i}`);
        if (p.cuenta && p.cuenta !== cuenta) dif.push(`cuenta ${p.cuenta} vs D ${cuenta}`);
        if (p.estatus_notion && p.estatus_notion !== estatus) dif.push(`estatus ${p.estatus_notion} vs C ${estatus}`);
        if (typeof p.iva === 'boolean' && p.iva !== iva) dif.push(`IVA ${p.iva ? 'Sí' : 'No'} vs F ${iva ? 'Sí' : 'No'}`);
        if (dif.length) rep.avisar('Ventas', fila, folio, `${x.tel.etiqueta} tiene otro dinero (manda la hoja): ${dif.join('; ')}`);
      }
    }

    const pt = proyectoTel && proyectoTel.p;
    let nombreFinal = v.nombre;
    if (pt && String(pt.nombre || '').trim() && String(pt.nombre).trim() !== v.nombre) { nombreFinal = String(pt.nombre).trim(); raro('B', v.nombre); }
    const partes = pt && (pt.contacto || pt.negocio) ? { contacto: String(pt.contacto || ''), negocio: String(pt.negocio || '') } : partirNombre(nombreFinal);
    if (!Object.keys(procedencia.celdas).length) delete procedencia.celdas;
    /* Una venta viva sin «Etapa de obra» en la hoja entra como «ganado» (la base no deja una viva sin etapa), y se dice: la lectura en
       vivo (js/datos/supa-vivo.js) la enseña sin etapa, como la hoja, mientras siga en «ganado» (2026-10-24). */
    if (!historica && !ETAPA_DESDE_NOTION[etapaTxt] && obra.etapa === hoja.etapa) procedencia.etapa_vacia = true;
    if (unibles.length) procedencia.telefonos = [...new Set(unibles.map(x => x.tel.etiqueta))];
    if (pt && ms(pt.actualizado_en)) procedencia.actualizado_ms = ms(pt.actualizado_en);
    for (const k of ['hoja_perdida', 'duplicado_de', 'hoja_doble', 'fuera_de_hoja']) if (pt && pt[k]) (procedencia.marcas ||= {})[k] = pt[k];

    const proyecto = {
      id, empresa_id: empresa, folio_hoja: folio, folio_global: fuente === 'cotizacion' || (!historica && y) ? y : null,
      folio_local: fuente === 'cotizacion' && pt ? String(pt.folio_local || folio) : folio,
      dispositivo: fuente === 'cotizacion' && pt && RE_DISP.test(String(pt.dispositivo || '')) ? pt.dispositivo : 'hoja',
      fuente, historica, nombre: nombreFinal, contacto: partes.contacto, negocio: partes.negocio,
      tel: obra.tel, etapa: obra.etapa && ETAPAS.includes(obra.etapa) ? obra.etapa : (historica ? null : 'ganado'),
      tipo_trabajo: tipo_trabajo.length || !pt ? tipo_trabajo : (Array.isArray(pt.tipo_trabajo) ? pt.tipo_trabajo.filter(t => TIPOS.includes(t)) : []),
      fecha_anticipo, compromiso_texto: pt ? String(pt.compromiso_texto || '') : '', dir_texto: obra.dir_texto,
      entrecalles: pt ? String(pt.entrecalles || '') : '', maps_url: obra.maps_url || '', lat: obra.lat ?? null, lng: obra.lng ?? null,
      geo_fuente: obra.geo_fuente || '', ubicacion_pendiente: !!(pt && pt.ubicacion_pendiente), entrega: obra.entrega || null,
      plazo_k: obra.plazo_k || null, notas: obra.notas || '', estatus, iva,
      fecha_instalacion_hist: historica ? fechaInst : null,
      sellos, origen: fuente === 'cotizacion' && pt && objeto(pt.origen) ? pt.origen : null,
      procedencia, creado_ms: pt ? ms(pt.creado_en) : 0,
    };
    acotarProyecto(proyecto, rep, 'Ventas!' + fila);
    T.proyectos.push(proyecto);
    proyectoDeFolio.set(folio, proyecto);

    const neto = numero(c('H'));
    T.ventas_dinero.push({
      proyecto_id: id, empresa_id: empresa, subtotal: v.g, anticipo: v.i, liquidacion: v.j, cuenta, fecha_liquidacion, pct_comision,
      precio_auth: fuente === 'cotizacion' && pt && Number.isFinite(Number(pt.precio_auth)) && pt.precio_auth !== null ? Number(pt.precio_auth) : (neto.ok && !neto.vacia ? neto.n : null),
      origen: proyecto.origen,
      venta_local: pt && (pt.sub !== undefined || pt.neto !== undefined) ? { sub: pt.sub ?? null, neto: pt.neto ?? null } : null,
      /* Un importe VACÍO en la hoja entra como 0 (la columna no admite null y las fórmulas lo leen igual), y se dice cuál: «sin capturar»
         no es «cero» para el teléfono, que con un 0 pisaría el anticipo pactado. La lectura en vivo lo regresa vacío (2026-10-24). */
      procedencia: { fila_hoja: fila, ...(['G', 'I', 'J'].some(l => vacia(c(l))) ? { vacias: ['G', 'I', 'J'].filter(l => vacia(c(l))) } : {}) },
    });
    // la cita: en las vivas, una instalación; en las históricas ya quedó en fecha_instalacion_hist
    if (!historica && fechaInst) {
      const selloTel = Math.max(0, ...unibles.map(x => ms(objeto(x.p.sellos) && x.p.sellos.instalacion)));
      proyecto._citaHoja = { fecha: fechaInst, hora: hora(c('AA')), sello: sellosHoja.instalacion || 0, selloTel };
    }

    esperado.push({ folio, h: c('H'), k: c('K'), r: c('R'), s: c('S'), t: c('T'), x: c('X'), o: c('O'), v: c('V'), w: c('W') });
  }

  /* ----- 4. Proyectos de teléfono que no están en la hoja ----- */
  const sinHoja = new Map();
  for (const x of copias) {
    if (usadas.has(x)) continue;
    const fh = String(x.p.folio_hoja || '').trim().toUpperCase();
    if (RE_FOLIO_HOJA.test(fh)) {
      rep.fuera.push({ telefono: x.tel.etiqueta, id: x.p.id, marca: 'su venta no está en la hoja', valor: fh, nombre: x.p.nombre || '' });
      continue;
    }
    const fg = String(x.p.folio_global || '').trim();
    const llave = RE_FOLIO_GLOBAL.test(fg) ? fg : 'id:' + x.p.id;
    (sinHoja.get(llave) || sinHoja.set(llave, []).get(llave)).push(x);
  }
  for (const [llave, grupo] of sinHoja) {
    const fg = llave.startsWith('id:') ? null : llave;
    const canceladas = grupo.every(x => x.p.etapa === 'cancelado');
    if (fg && canceladas) {
      // la lápida: una cotización ganada y después descartada, sin renglón en el libro
      const id = canonico(grupo, fg, null);
      for (const x of grupo) if (x.p.id !== id) remapeo[x.p.id] = id;
      const p = (grupo.find(x => x.p.id === id) || grupo[0]).p;
      if (!RE_ID.test(id)) { rep.rechazar('teléfonos', id, 'proyecto', 'id no válido para la base'); continue; }
      T.proyectos.push({
        id, empresa_id: empresa, folio_hoja: null, folio_global: fg, folio_local: String(p.folio_local || ''),
        dispositivo: RE_DISP.test(String(p.dispositivo || '')) ? p.dispositivo : fg.split('@')[1], fuente: 'cotizacion', historica: false,
        nombre: String(p.nombre || fg).trim() || fg, contacto: String(p.contacto || ''), negocio: String(p.negocio || ''),
        tel: telefonoLimpio(p.tel), etapa: 'cancelado', tipo_trabajo: Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo.filter(t => TIPOS.includes(t)) : [],
        fecha_anticipo: /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha_ganado || '')) ? p.fecha_ganado : null,
        compromiso_texto: String(p.compromiso_texto || ''), dir_texto: String(p.dir_texto || ''), entrecalles: String(p.entrecalles || ''),
        maps_url: String(p.maps_url || ''), lat: Number.isFinite(p.lat) ? p.lat : null, lng: Number.isFinite(p.lng) ? p.lng : null,
        geo_fuente: String(p.geo_fuente || ''), ubicacion_pendiente: !!p.ubicacion_pendiente, entrega: ['instalacion', 'paqueteria', 'recoleccion'].includes(p.entrega) ? p.entrega : null,
        plazo_k: [1, 2, 3, 4, 5].includes(p.plazo_k) ? p.plazo_k : null, notas: String(p.notas || ''), estatus: null, iva: p.iva !== false,
        fecha_instalacion_hist: null, sellos: sellosValidos(p.sellos), origen: objeto(p.origen), procedencia: { telefonos: [...new Set(grupo.map(x => x.tel.etiqueta))], lapida: true },
        creado_ms: ms(p.creado_en),
      });
      acotarProyecto(T.proyectos.at(-1), rep, 'teléfonos');
    } else {
      for (const x of grupo) {
        rep.fuera.push({ telefono: x.tel.etiqueta, id: x.p.id, marca: 'fuera de la hoja (sin folio V-###)', valor: x.p.folio_global || '', nombre: x.p.nombre || '' });
      }
    }
  }
  const idsImportados = new Set(T.proyectos.map(p => p.id));
  const canon = idLocal => {
    const i = remapeo[idLocal] || idLocal;
    return idsImportados.has(i) ? i : null;
  };

  /* ----- 5. Instalaciones (§3.5, Q-15): una viva por proyecto; UID canónico = la de mayor `movida` ----- */
  const instPorId = new Map();
  for (const tel of tels) {
    for (const ins of tel.instalaciones) {
      if (!ins.id) continue;
      const prev = instPorId.get(ins.id);
      if (!prev || (Number(ins.movida) || 0) > (Number(prev.ins.movida) || 0) ||
          ((Number(ins.movida) || 0) === (Number(prev.ins.movida) || 0) && ms(ins.actualizado_en) > ms(prev.ins.actualizado_en))) {
        instPorId.set(ins.id, { ins, tel });
      }
    }
  }
  const instPorProyecto = new Map();
  for (const { ins, tel } of instPorId.values()) {
    const pid = canon(ins.proyecto_id);
    if (!pid) { rep.rechazar('instalaciones', ins.id, tel.etiqueta, `su proyecto «${ins.proyecto_id}» no se importa`); continue; }
    if (!RE_ID.test(ins.id)) { rep.rechazar('instalaciones', ins.id, tel.etiqueta, 'id no válido para la base'); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ins.fecha || ''))) { rep.rechazar('instalaciones', ins.id, tel.etiqueta, `fecha «${ins.fecha}» no válida`); continue; }
    const fila = {
      id: ins.id, empresa_id: empresa, proyecto_id: pid, fecha: ins.fecha, hora: hora(ins.hora),
      ventana: ['dia', 'noche', 'madrugada'].includes(ins.ventana) ? ins.ventana : 'dia',
      duracion_min: Number.isInteger(ins.duracion_min) && ins.duracion_min >= 1 && ins.duracion_min <= 600 ? ins.duracion_min : 180,
      estado: ESTADOS_INST.includes(ins.estado) ? ins.estado : 'confirmada', movida: Math.max(0, Number(ins.movida) || 0),
      notas: String(ins.notas || '').slice(0, 20000), procedencia: { telefono: tel.etiqueta }, creado_ms: ms(ins.creado_en), _act: ms(ins.actualizado_en),
    };
    (instPorProyecto.get(pid) || instPorProyecto.set(pid, []).get(pid)).push(fila);
  }
  for (const p of T.proyectos) {
    const lista = instPorProyecto.get(p.id) || [];
    const vivas = lista.filter(x => x.estado !== 'cancelada').sort((a, b) => b.movida - a.movida || b._act - a._act || (a.id < b.id ? -1 : 1));
    if (vivas.length > 1) {
      rep.conflicto('dos citas vivas para un proyecto', p.folio_hoja || p.id,
        `se queda ${vivas[0].id} (movida ${vivas[0].movida}); ${vivas.slice(1).map(x => x.id).join(', ')} quedan canceladas sin tocar el calendario`);
      for (const x of vivas.slice(1)) { x.estado = 'cancelada'; x.procedencia.fusionada_en = vivas[0].id; }
    }
    const cita = p._citaHoja; delete p._citaHoja;
    if (cita) {
      const viva = vivas[0];
      if (!viva) {
        lista.push({ id: 'hoja-' + p.folio_hoja, empresa_id: empresa, proyecto_id: p.id, fecha: cita.fecha, hora: cita.hora, ventana: 'dia',
          duracion_min: 180, estado: 'confirmada', movida: 0, notas: 'Agendada desde la hoja.', procedencia: { hoja: true }, creado_ms: 0, _act: 0 });
      } else if (viva.fecha !== cita.fecha || (viva.hora || null) !== (cita.hora || null)) {
        if (cita.sello > cita.selloTel || (cita.sello === 0 && cita.selloTel === 0)) {
          rep.conflicto('cita distinta entre la hoja y el teléfono', p.folio_hoja, `gana la hoja (${cita.fecha} ${cita.hora || ''}) sobre ${viva.fecha} ${viva.hora || ''}`);
          viva.fecha = cita.fecha; viva.hora = cita.hora;
        } else {
          rep.conflicto('cita distinta entre la hoja y el teléfono', p.folio_hoja, `gana el teléfono (${viva.fecha} ${viva.hora || ''}) sobre la hoja ${cita.fecha} ${cita.hora || ''}`);
        }
      }
    }
    for (const x of lista) { delete x._act; T.instalaciones.push(x); }
  }

  /* ----- 6. Materiales, costos y constantes ----- */
  const semilla = entrada.semilla === undefined ? JSON.parse(readFileSync(new URL('../../datos/semilla.json', import.meta.url), 'utf8')) : entrada.semilla;
  const mats = new Map();                                       // id → {fila, editado, costo:{importe, sello}|undefined}
  const ponerMaterial = (m, editado, donde, costo) => {
    const id = String(m.id || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) { if (id) rep.rechazar('materiales', id, donde, 'clave no válida para la base'); return; }
    const uc = NORM_CONSUMO[String(m.unidad_consumo || '').trim()] || null;
    const ucompra = UNIDADES_COMPRA.includes(m.unidad_compra) ? m.unidad_compra : null;
    const factor = Number(m.factor);
    if (!uc || !ucompra || !(factor > 0)) { rep.rechazar('materiales', id, donde, 'unidad o factor no válidos'); return; }
    const merma = Number(m.merma_pct !== undefined ? m.merma_pct : m.merma) || 0;
    const fila = {
      empresa_id: empresa, id, nombre: String(m.nombre || id), familia: String(m.familia || 'sin_familia'), unidad_compra: ucompra,
      unidad_consumo: uc, medida: String(m.medida || ''), factor, factor_origen: String(m.factor_origen || ''),
      largo_cm: numONull(m.largo_cm), ancho_cm: numONull(m.ancho_cm), espesor: String(m.espesor || ''),
      merma_pct: merma >= 0 && merma < 1 ? merma : 0, fraccionable: !!m.fraccionable && m.fraccionable !== 'FALSE',
      min_compra: Math.max(0, Number(m.min_compra) || 0), min_stock: Math.max(0, Number(m.min_stock) || 0),
      proveedor: String(m.proveedor || ''), tel_proveedor: String(m.tel_proveedor || ''), activo: m.activo === undefined || m.activo === '' ? true : !!m.activo && m.activo !== 'FALSE',
      sellos: { ...(objeto(m.sellos) || {}), _editado: editado }, procedencia: { de: donde }, creado_ms: ms(m.creado_en),
    };
    const prev = mats.get(id);
    if (!prev || editado > prev.fila.sellos._editado) mats.set(id, { fila, costo: costo !== undefined ? costo : prev && prev.costo });
    else if (costo !== undefined && (!prev.costo || costo.sello > prev.costo.sello)) prev.costo = costo;
  };
  for (const m of (semilla && semilla.materiales) || []) ponerMaterial(m, 1, 'semilla');
  for (const tel of tels) for (const m of tel.materiales) {
    ponerMaterial(m, ms(m.actualizado_en) || 1, tel.etiqueta,
      m.costo_compra === undefined ? undefined : { importe: numONull(m.costo_compra), sello: ms(m.actualizado_en) });
  }
  const cat = P['Catálogo de material'];
  if (cat) {
    const h = encabezados(cat), k = n => h.indexOf(n);
    for (const { fila, celdas } of filas(cat)) {
      const v = n => (k(n) >= 0 ? celdas[k(n)] : '');
      const id = texto(v('Clave')).replace(/^'/, '').trim();
      if (!id) continue;
      let sellosM = {}; try { sellosM = objeto(JSON.parse(texto(v('Sellos')) || '{}')) || {}; } catch (_) { /* vacío */ }
      const editado = ms(v('Editado')) || 1;
      const costoCelda = v('Costo de compra');
      ponerMaterial({
        id, nombre: texto(v('Nombre')), familia: texto(v('Familia')), unidad_compra: texto(v('Unidad de compra')), unidad_consumo: texto(v('Unidad de consumo')),
        medida: texto(v('Medida')), factor: numero(v('Factor')).n, factor_origen: texto(v('De dónde sale el factor')), largo_cm: vacia(v('Largo (cm)')) ? null : numero(v('Largo (cm)')).n,
        ancho_cm: vacia(v('Ancho (cm)')) ? null : numero(v('Ancho (cm)')).n, espesor: texto(v('Espesor')), merma_pct: numero(v('Merma')).n,
        fraccionable: v('Fraccionable') === true || texto(v('Fraccionable')).toUpperCase() === 'TRUE', min_compra: numero(v('Mínimo de compra')).n,
        min_stock: numero(v('Mínimo de almacén')).n, proveedor: texto(v('Proveedor')), tel_proveedor: texto(v('Teléfono del proveedor')),
        activo: v('Activo') === '' ? true : v('Activo') === true || texto(v('Activo')).toUpperCase() === 'TRUE', sellos: sellosM, creado_en: v('Creado'),
      }, editado, 'Catálogo de material!' + fila,
      sellosM.costo_compra || !vacia(costoCelda) ? { importe: vacia(costoCelda) ? null : numero(costoCelda).n, sello: ms(sellosM.costo_compra) || editado } : undefined);
    }
  }
  for (const { fila, costo } of mats.values()) {
    T.materiales.push(fila);
    if (costo) T.almacen_costos.push({ empresa_id: empresa, material_id: fila.id, movimiento_id: null, importe: costo.importe, sello: costo.sello });
  }
  const ctes = new Map();
  for (const tel of tels) for (const c of tel.constantes) {
    const clave = String(c.clave || '');
    if (!/^[A-Za-z0-9_]{1,64}$/.test(clave) || clave === '_semilla' || !Number.isFinite(Number(c.valor))) continue;
    const prev = ctes.get(clave);
    if (!prev || ms(c.actualizado_en) > prev.act) {
      if (prev && Number(prev.fila.valor) !== Number(c.valor)) rep.conflicto('constante distinta entre teléfonos', clave, `${prev.fila.valor} vs ${c.valor}: gana la más reciente (${tel.etiqueta})`);
      ctes.set(clave, { act: ms(c.actualizado_en), fila: { empresa_id: empresa, clave, valor: Number(c.valor), unidad: String(c.unidad || ''), nota: String(c.nota || ''),
        version: String(c.version || ''), actualizado_por: String(c.actualizado_por || '') } });
    }
  }
  for (const { fila } of ctes.values()) T.constantes.push(fila);

  /* ----- Las tarifas (pestaña «Tarifas», 23-oct-2026): los precios que Dirección cambió desde el cotizador ----- */
  /* Entran tal cual las guardó el .gs (cotMezclarTarifas_), con la regla con la que él las lee (cotFilaLimpia_): lo que no se
     entiende se queda fuera con un AVISO —no con un rechazo: una celda tocada a mano en esa pestaña no debe frenar la copia de las
     ventas— y ese precio queda el de fábrica, que es lo que cobra la hoja con ese renglón. */
  const tar = P['Tarifas'];
  if (tar) {
    const h = encabezados(tar), k = n => h.indexOf(n), vistas = new Set();
    for (const { fila, celdas } of filas(tar)) {
      const v = n => (k(n) >= 0 ? celdas[k(n)] : '');
      const grupo = texto(v('Grupo')).trim(), clave = texto(v('Clave')).trim();
      if (!grupo && !clave) continue;
      const fab = FABRICA_TARIFAS[grupo];
      const gratis = grupo === 'complejidad' || grupo === 'recorte-extra';
      const p = numero(v('Precio'));
      const nombre = texto(v('Nombre')).replace(/[<>&"`]/g, '').trim().slice(0, 60), como = fab && fab.includes(clave) ? '' : texto(v('Se fabrica como')).trim();
      let por = '';
      if (!fab || !/^[a-z0-9-]{2,24}$/.test(clave)) por = 'grupo o clave que no sirven';
      else if (vistas.has(grupo + '|' + clave)) por = 'la clave viene dos veces';
      else if (!p.ok || p.vacia || p.n < 0 || (!gratis && p.n <= 0) || p.n > 1000000) por = 'el precio no sirve';
      else if (!fab.includes(clave) && (gratis || !fab.includes(como))) por = 'un renglón nuevo sin «se fabrica como» de fábrica';
      else if (!nombre) por = 'sin nombre';
      if (por) { rep.avisar('Tarifas', fila, clave || '?', por + ': se queda el de fábrica'); continue; }
      vistas.add(grupo + '|' + clave);
      const vis = v('Visible'), act = v('Actualizado');
      const actMs = esFecha(act) ? Date.parse(act.$fecha + (act.$hora ? 'T' + act.$hora : '')) : Date.parse(texto(act));
      T.tarifas.push({ empresa_id: empresa, grupo, clave, nombre, precio: Math.round(p.n * 100) / 100, como,
        visible: grupo === 'recorte-extra' || (grupo === 'complejidad' && clave === 'recta') || !(vis === false || /^(false|no|0)$/i.test(texto(vis).trim())),
        orden: numero(v('Orden')).ok ? Math.trunc(numero(v('Orden')).n) : 0, detalle: texto(v('Detalle')).slice(0, 120),
        actualizado_por: texto(v('Por')).slice(0, 120), actualizado_ms: ms(actMs) });
    }
  }

  /* ----- Los gastos (pestaña «Gastos», puente-sheets-15; a la nube desde el 2026-10-24, 0020) ----- */
  /* Se leen como los lee el teléfono (`gastoDeHoja` de js/datos/gastos.js): la categoría que no está en la lista es «Otros», un monto
     tecleado como texto se lee, una fecha «23/10/2026» también, y la cuenta se queda como venga. Lo que la base no acepta (sin id, un
     id repetido, sin día, sin concepto, un monto que no es mayor que cero) se queda fuera con su fila y su motivo —en `no_importado`,
     como las autorizaciones: no frena la copia de las ventas— y la hoja manda: lo que cambió allá pisa lo de aquí.
     `gastosEnHoja` son TODOS los ids de la pestaña, entren o no: el SQL le pone lápida solo a lo que ya no está en ella. Sin la pestaña
     en el volcado (un copia-diaria.gs de antes del 2026-10-24, o una hoja que todavía no la tiene) o sin su columna «ID» es null: no se
     sabe qué hay en la hoja y no se toca ningún gasto de la base. */
  let gastosEnHoja = null;
  const gas = P['Gastos'];
  if (Array.isArray(gas) && !encabezados(gas).includes('ID')) {
    const n = filas(gas).filter(x => x.celdas.some(c => !vacia(c))).length;
    if (n) rep.no_importado.push({ que: 'Gastos', n, por: 'la pestaña «Gastos» no tiene la columna «ID»: no se lee y no se toca ningún gasto de la base' });
  } else if (Array.isArray(gas)) {
    gastosEnHoja = [];
    const h = encabezados(gas), k = n => h.indexOf(n);
    const leidos = [], fuera = [], veces = new Map();
    for (const { fila, celdas } of filas(gas)) {
      const v = n => (k(n) >= 0 ? celdas[k(n)] : '');
      const id = texto(v('ID')).trim();
      if (!id) {
        // un renglón sin ID y sin concepto ni monto es un renglón vacío o una nota (como gastoFilas_ del .gs)
        if (texto(v('Concepto')).trim() || !vacia(v('Monto'))) fuera.push({ fila, motivo: 'sin_id' });
        continue;
      }
      gastosEnHoja.push(id);
      veces.set(id, (veces.get(id) || 0) + 1);
      const fecha = diaDeGasto(v('Fecha'));
      const concepto = sinApostrofo(texto(v('Concepto'))).trim().slice(0, 200);
      const monto = montoDeGasto(v('Monto'));
      const catHoja = texto(v('Categoría')).trim();
      const categoria = categoriaDeGasto(catHoja);
      const anulado = siNoDeGasto(v('Anulado'));
      const motivo = !RE_ID_GASTO.test(id) ? 'id_no_sirve' : !fecha ? 'fecha_no_se_entiende' : !concepto ? 'sin_concepto'
        : !(monto > 0 && monto <= 10000000) ? 'monto_no_sirve' : null;
      leidos.push({ fila, id, motivo, g: {
        empresa_id: empresa, id, fecha, concepto, categoria, monto, cuenta: texto(v('Cuenta')).trim().slice(0, 60),
        folio: sinApostrofo(texto(v('Folio del proyecto'))).trim().slice(0, 40), registro_por: sinApostrofo(texto(v('Registró'))).trim().slice(0, 200),
        registrado_ms: msDeCelda(v('Registrado el')), anulado, anulo: anulado ? sinApostrofo(texto(v('Anuló'))).trim().slice(0, 200) : '',
        anulado_ms: anulado ? msDeCelda(v('Anulado el')) : 0, subio: sinApostrofo(texto(v('Subió'))).trim().slice(0, 200), fila_hoja: fila,
        procedencia: catHoja && catHoja !== categoria ? { categoria_hoja: catHoja.slice(0, 60) } : {},
      } });
    }
    for (const x of leidos) {
      const motivo = veces.get(x.id) > 1 ? 'id_repetido' : x.motivo;    // dos renglones con el mismo id: no se decide cuál es
      if (motivo) fuera.push({ fila: x.fila, motivo }); else T.gastos.push(x.g);
    }
    if (fuera.length) {
      fuera.sort((a, b) => a.fila - b.fila);
      const motivos = {};
      for (const x of fuera) motivos[x.motivo] = (motivos[x.motivo] || 0) + 1;
      rep.no_importado.push({ que: 'Gastos', n: fuera.length, por: 'renglones de la pestaña «Gastos» que la base no acepta: se quedan en la hoja y no frenan la copia (' +
        Object.entries(motivos).map(([m, n]) => m + ' ' + n).join(', ') + ')', filas: fuera.map(x => x.fila), motivos });
    }
  }

  /* ----- 7. Requerimientos: (proyecto canónico, material) único (§3.5, M03 H7) ----- */
  const proyectoDeVenta = f => { const p = proyectoDeFolio.get(String(f || '').trim().toUpperCase()); return p ? p.id : null; };
  const reqs = new Map();
  const rangoReq = e => ({ consumido: 3, comprado: 2 }[e] || 1);
  const ponerReq = (r, donde, venta, sello) => {
    const pid = canon(r.proyecto_id) || proyectoDeVenta(venta);
    const mat = String(r.material_id || '').trim();
    if (!pid || !mat) { rep.rechazar('requerimientos', r.id || '?', donde, pid ? 'sin material' : `su proyecto «${r.proyecto_id || venta || ''}» no se importa`); return; }
    const ucompra = UNIDADES_COMPRA.includes(r.unidad_compra) ? r.unidad_compra : null;
    if (!ucompra) { rep.rechazar('requerimientos', r.id || '?', donde, `unidad de compra «${r.unidad_compra}» no válida`); return; }
    const fila = {
      empresa_id: empresa, id: pid + ':' + mat, proyecto_id: pid, material_id: mat, cantidad_consumo: Number(r.cantidad_consumo) || 0,
      unidad_consumo: String(r.unidad_consumo || ''), cantidad_compra: Math.max(0, Number(r.cantidad_compra) || 0), unidad_compra: ucompra,
      partidas: Array.isArray(r.partidas) ? r.partidas : [], formula: String(r.formula || ''), confianza: String(r.confianza || 'estimada'),
      requiere: String(r.requiere || ''), constantes_version: String(r.constantes_version || ''),
      cantidad_ajustada: r.cantidad_ajustada === null || r.cantidad_ajustada === undefined || r.cantidad_ajustada === '' ? null : Math.max(0, Number(r.cantidad_ajustada) || 0),
      motivo_ajuste: String(r.motivo_ajuste || ''), ajustado_por: String(r.ajustado_por || ''), ajustado_ms: ms(r.ajustado_en ?? r.ajustado_ms),
      estado: ESTADOS_REQ.includes(r.estado) ? r.estado : 'calculado', sellos: { ...(objeto(r.sellos) || {}), _editado: sello },
      procedencia: { de: donde, ...(r.id && r.id !== pid + ':' + mat ? { id_local: r.id } : {}), ...(r.proyecto_id && r.proyecto_id !== pid ? { proyecto_id_local: r.proyecto_id } : {}) },
      creado_ms: ms(r.creado_en),
    };
    if (fila.cantidad_compra >= 1e7 || (fila.cantidad_ajustada ?? 0) >= 1e7) { rep.rechazar('requerimientos', fila.id, donde, 'cantidad fuera del tope de la base'); return; }
    if (fila.formula.length === 2000) rep.avisar('requerimientos', fila.id, donde, '«Cómo se calculó» mide exactamente 2000: pudo truncarse en la hoja');
    const prev = reqs.get(fila.id);
    if (!prev) { reqs.set(fila.id, fila); return; }
    const a = [rangoReq(fila.estado), sello], b = [rangoReq(prev.estado), prev.sellos._editado];
    const gana = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
    const empate = a[0] === b[0] && a[1] === b[1];
    if (empate && !igualJSON({ ...fila, procedencia: 0, sellos: 0, creado_ms: 0 }, { ...prev, procedencia: 0, sellos: 0, creado_ms: 0 })) {
      rep.conflicto('requerimiento duplicado sin ganador', fila.id, `${prev.procedencia.de} y ${donde}: mismo estado (${fila.estado}) y mismo sello; se queda ${prev.procedencia.de}`);
    } else if (!empate) {
      rep.avisar('requerimientos', fila.id, donde, `duplicado con ${prev.procedencia.de}: se queda ${gana ? donde : prev.procedencia.de} (${gana ? fila.estado : prev.estado})`);
    }
    if (gana) reqs.set(fila.id, fila);
  };
  for (const tel of tels) for (const r of tel.requerimientos) ponerReq(r, tel.etiqueta, r.folio_hoja, ms(r.actualizado_en) || 1);
  const listas = P['Listas de compra'];
  if (listas) {
    const h = encabezados(listas), k = n => h.indexOf(n);
    for (const { fila, celdas } of filas(listas)) {
      const v = n => (k(n) >= 0 ? celdas[k(n)] : '');
      if (vacia(v('Material'))) continue;
      let partidas = []; try { partidas = JSON.parse(texto(v('Partidas')) || '[]'); } catch (_) { /* vacías */ }
      let sellosR = {}; try { sellosR = objeto(JSON.parse(texto(v('Sellos')) || '{}')) || {}; } catch (_) { /* vacíos */ }
      ponerReq({
        id: texto(v('Id')), proyecto_id: texto(v('Proyecto (id)')), material_id: texto(v('Material')).replace(/^'/, ''), cantidad_compra: numero(v('Cantidad')).n,
        unidad_compra: texto(v('Unidad')), cantidad_ajustada: vacia(v('Corrección')) ? null : numero(v('Corrección')).n, estado: texto(v('Estado')),
        confianza: texto(v('Confianza')), requiere: texto(v('Le falta')), formula: texto(v('Cómo se calculó')), cantidad_consumo: numero(v('Consumo')).n,
        unidad_consumo: texto(v('Unidad de consumo')), partidas, motivo_ajuste: texto(v('Por qué se corrigió')), ajustado_por: texto(v('Corrigió')),
        ajustado_ms: ms(v('Corregido')), constantes_version: texto(v('Constantes')), sellos: sellosR, creado_en: v('Creado'),
      }, 'Listas de compra!' + fila, texto(v('Venta')), ms(v('Editado')) || 1);
    }
  }
  T.requerimientos.push(...reqs.values());

  /* ----- 8. Movimientos del almacén: por id; las salidas derivadas, una por (venta, material) (§3.3, X-02) ----- */
  const movs = new Map();
  const ponerMov = (m, donde, venta) => {
    const id = String(m.id || '').trim();
    const tipo = TIPOS_MOV.includes(m.tipo) ? m.tipo : null, origen = ORIGENES_MOV.includes(m.origen) ? m.origen : null;
    const cantidad = Number(m.cantidad), ts = ms(m.ts);
    const ucompra = UNIDADES_COMPRA.includes(m.unidad_compra) ? m.unidad_compra : null;
    const signoOk = tipo && ((['entrada', 'devolucion'].includes(tipo) && cantidad > 0) || (['salida', 'merma'].includes(tipo) && cantidad < 0) ||
      (tipo === 'conteo' && cantidad >= 0) || (tipo === 'ajuste' && cantidad !== 0));
    if (!id || id.length > 200 || !tipo || !origen || !ucompra || !Number.isFinite(cantidad) || Math.abs(cantidad) > 1e7 || !ts || !signoOk || !String(m.material_id || '').trim()) {
      rep.rechazar('almacen_movimientos', id || '?', donde, 'renglón incompleto o con signo que no corresponde a su tipo'); return;
    }
    const pidLocal = String(m.proyecto_id || '');
    const pid = canon(pidLocal) || proyectoDeVenta(venta);
    const reqLocal = String(m.requerimiento_id || '');
    const fila = {
      empresa_id: empresa, id, material_id: String(m.material_id).trim(), tipo, cantidad, unidad_compra: ucompra, origen,
      nota: String(m.nota || '').slice(0, 500), usuario: String(m.usuario || '').slice(0, 200), rol: String(m.rol || ''), dispositivo: String(m.dispositivo || ''),
      proyecto_id: pid, requerimiento_id: reqLocal ? (pid ? pid + ':' + String(m.material_id).trim() : reqLocal) : null,
      firma: String(m.sello ?? m.firma ?? '').slice(0, 200), ts,
      procedencia: { de: donde, ...(pidLocal && pidLocal !== pid ? { proyecto_id_local: pidLocal } : {}), ...(m.secuencia_hoja ? { secuencia_hoja: m.secuencia_hoja } : {}),
        ...(m.subio ? { subio: m.subio } : {}) },
      creado_ms: ms(m.creado_en ?? m.llego), costo: m.costo_total === undefined || m.costo_total === null || m.costo_total === '' ? undefined : numONull(m.costo_total),
    };
    if (String(m.nota || '').length > 500 || String(m.usuario || '').length > 200) rep.avisar('almacen_movimientos', id, donde, 'nota o usuario recortados al tope de la base');
    const prev = movs.get(id);
    if (prev && !igualJSON({ ...prev, procedencia: 0, creado_ms: 0 }, { ...fila, procedencia: 0, creado_ms: 0 })) {
      rep.conflicto('movimiento con el mismo id y distinto contenido', id, `${prev.procedencia.de} y ${donde}: se queda el primero`);
    }
    if (!prev) movs.set(id, fila);
  };
  for (const tel of tels) for (const m of tel.movimientos) ponerMov(m, tel.etiqueta, m.folio_hoja);
  const alm = P['Almacén'];
  if (alm) {
    const h = encabezados(alm), k = n => h.indexOf(n);
    for (const { fila, celdas } of filas(alm)) {
      const v = n => (k(n) >= 0 ? celdas[k(n)] : '');
      if (vacia(v('Id'))) continue;
      ponerMov({
        id: texto(v('Id')), material_id: texto(v('Material')).replace(/^'/, ''), tipo: texto(v('Tipo')), cantidad: numero(v('Cantidad')).n,
        unidad_compra: texto(v('Unidad')), origen: texto(v('Origen')), nota: texto(v('Nota')), usuario: texto(v('Quién')), rol: texto(v('Rol')),
        dispositivo: texto(v('Dispositivo')), proyecto_id: texto(v('Proyecto (id)')), requerimiento_id: texto(v('Requerimiento')),
        costo_total: vacia(v('Costo total')) ? undefined : numero(v('Costo total')).n, firma: texto(v('Firma')), ts: v('Sello'),
        secuencia_hoja: numero(v('Secuencia')).n || undefined, subio: texto(v('Subió')), llego: esFecha(v('Llegó')) ? v('Llegó').$ms : v('Llegó'),
      }, 'Almacén!' + fila, texto(v('Venta')));
    }
  }
  // las salidas derivadas repetidas entre teléfonos: una por (venta, material), la de menor ts
  const derivadas = new Map();
  for (const m of [...movs.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))) {
    if (m.tipo !== 'salida' || m.origen !== 'derivado' || !m.proyecto_id) continue;
    const llave = m.proyecto_id + '|' + m.material_id;
    if (derivadas.has(llave)) {
      rep.conflicto('salida de material repetida', llave, `${m.id} (${m.procedencia.de}) repite a ${derivadas.get(llave)}: no se importa`);
      movs.delete(m.id);
    } else derivadas.set(llave, m.id);
  }
  const ordenMov = (a, b) => (a.procedencia.secuencia_hoja || Infinity) - (b.procedencia.secuencia_hoja || Infinity) || a.ts - b.ts || (a.id < b.id ? -1 : 1);
  for (const m of [...movs.values()].sort(ordenMov)) {
    const { costo, ...fila } = m;
    T.almacen_movimientos.push(fila);
    if (costo !== undefined) T.almacen_costos.push({ empresa_id: empresa, material_id: null, movimiento_id: m.id, importe: costo, sello: m.ts });
  }

  /* ----- 9. «Abonos comisión» (§3.2) ----- */
  const ocurrencias = new Map();
  let maxP = 0;
  for (const { fila, celdas } of filas(P['Abonos comisión'])) {
    const folio = texto(celdas[0]).trim().toUpperCase();
    if (!folio && vacia(celdas[2])) continue;
    const imp = numero(celdas[2]);
    if (!RE_FOLIO_HOJA.test(folio)) { rep.rechazar('Abonos comisión', fila, 'A «Folio»', `«${texto(celdas[0])}» no es un folio V-###`); continue; }
    if (!imp.ok || imp.vacia || Math.abs(imp.n) >= 1e7) { rep.rechazar('Abonos comisión', fila, folio, `C «Importe» «${texto(celdas[2])}» no es un importe válido`); continue; }
    const f = fecha(celdas[3]);
    const nota = texto(celdas[4]), pagoTxt = texto(celdas[5]).trim().toUpperCase();
    const pago_id = /^P-\d{3,}$/.test(pagoTxt) ? pagoTxt : null;
    if (pagoTxt && !pago_id) rep.avisar('Abonos comisión', fila, folio, `F «Pago» «${pagoTxt}» no es un P-### y queda vacío`);
    if (pago_id) maxP = Math.max(maxP, Number(pago_id.slice(2)));
    const tipo = imp.n < 0 ? 'correccion' : (imp.n > 0 && pago_id && /^reparto/i.test(nota.trim()) ? 'reparto' : 'historico');
    const procedencia = { fila_hoja: fila };
    if (f && typeof f === 'object') { procedencia.fecha_texto = f.texto; rep.avisar('Abonos comisión', fila, folio, 'D «Fecha» es texto: el abono queda sin fecha'); }
    else if (esFecha(celdas[3]) && celdas[3].$hora && celdas[3].$hora !== '00:00') procedencia.hora_original = celdas[3].$hora;
    if (nota.length > 500) { procedencia.nota_completa = nota; rep.avisar('Abonos comisión', fila, folio, 'la nota pasa de 500 caracteres: se recorta y la completa queda en procedencia'); }
    if (!proyectoDeFolio.has(folio)) rep.avisar('Abonos comisión', fila, folio, 'el folio no tiene fila en Ventas: el abono se importa igual (suma donde hoy suma)');
    const base = [folio, imp.n, typeof f === 'string' ? f : '', nota, pago_id || ''].join('|');
    const n = (ocurrencias.get(base) || 0) + 1; ocurrencias.set(base, n);
    T.abonos.push({ empresa_id: empresa, folio_hoja: folio, importe: imp.n, fecha: typeof f === 'string' ? f : null, nota: nota.slice(0, 500), pago_id, tipo,
      op_id: 'hoja:abono:' + sha(base, 16) + ':' + n, procedencia });
  }

  /* ----- 10. «Accesos» → miembros (§3.4) ----- */
  const correos = new Map();
  for (const { fila, celdas } of filas(P['Accesos'])) {
    const correo = texto(celdas[0]).trim().toLowerCase(), area = texto(celdas[1]).trim().toLowerCase();
    if (!RE_CORREO.test(correo) || !AREAS.includes(area)) continue;   // la fila de ayuda de A4, renglones a medias
    if (correos.has(correo)) { rep.avisar('Accesos', fila, correo, `repetido (ya estaba en la fila ${correos.get(correo)}): gana la primera, como en la hoja`); continue; }
    correos.set(correo, fila);
    T.miembros.push({ empresa_id: empresa, correo, area, nota: texto(celdas[2]).slice(0, 500) });
  }
  if (!T.miembros.some(m => m.area === 'direccion')) rep.avisar('Accesos', '-', '-', 'no hay nadie de Dirección: sin uno activo nadie podrá dar altas');

  /* ----- 11. «Autorizaciones» (§3.4): cada fila se verifica antes de entrar -----
     Dos maneras de comprobar la firma, y solo dos:
       · con la clave (`entrada.clave`, la de la línea de comandos): se recalcula aquí con sello.js;
       · sin la clave, con el VEREDICTO DE LA HOJA (decidido 2026-10-17 para que Elías no tenga que mover secretos): la copia
         diaria (puente/copia-diaria.gs) comprueba cada fila DENTRO de la hoja con la clave del script y las funciones de
         Código.gs que usa /verificar, y manda por fila { firma_ok, codificacion, canon } en `volcado.autorizaciones_comprobadas`
         —nunca la clave—. Solo se acepta si quien llama lo pide con `aceptarVeredictosDeLaHoja: true`, y eso lo hace únicamente
         la función autenticada `importar-diario` (secreto IMPORTAR_SECRETO); el importador de línea de comandos no lo pasa, así
         que un volcado con veredictos que llegue por ahí sigue necesitando la clave. Una fila entra solo si la hoja dijo
         firma_ok:true Y el texto firmado que se guardaría (canonDe de sello.js sobre la fila tal como va a la base) es
         EXACTAMENTE el que la hoja comprobó: así lo guardado es lo firmado y /verificar de Supabase lo puede recalcular cuando
         tenga la clave.
     En la copia diaria lo que no entra NO frena la copia (no es «rechazo» ni «conflicto»: Q-14 dice que no se decide, y la
     fila espera en la hoja): va a no_importado con su número de fila y su motivo (MOTIVOS_AUTORIZACION). */
  const auts = [];
  const pestAut = P['Autorizaciones'];
  const filasAut = filas(pestAut).filter(x => !vacia(x.celdas[1]));
  const conVeredicto = !entrada.clave && entrada.aceptarVeredictosDeLaHoja === true;
  const veredictos = conVeredicto ? leerVeredictos(vol.autorizaciones_comprobadas) : null;
  const fuera = [];
  const noEntra = (fila, folio, motivo, por) => {
    if (conVeredicto) fuera.push({ fila, folio, motivo, por });
    else rep.rechazar('Autorizaciones', fila, folio, por + ': no entra y se queda en la hoja congelada');
  };
  if (filasAut.length && !entrada.clave && !conVeredicto) {
    rep.no_importado.push({ que: 'Autorizaciones', n: filasAut.length, por: 'falta la clave del sello (AL3D_SELLO_CLAVE): sin ella no se puede comprobar que cada fila sea lo que se firmó' });
  } else if (filasAut.length && conVeredicto && !veredictos.ok) {
    rep.no_importado.push({ que: 'Autorizaciones', n: filasAut.length, por: veredictos.por, motivos: { [veredictos.motivo]: filasAut.length } });
  } else {
    for (const { fila, celdas } of filasAut) {
      const t = i => texto(celdas[i]);
      let ts = celdas[0];
      if (esFecha(ts)) { rep.avisar('Autorizaciones', fila, t(1), 'A «Cuándo (ISO)» llegó como fecha y no como texto: se reconstruye y puede no cuadrar'); ts = new Date(ts.$ms).toISOString(); }
      const reg = {
        folio_global: t(1), ts_iso: String(ts ?? ''), proyecto: t(2), cliente: t(3), sub_calc_txt: dinero2(Number(celdas[4])), precio_auth_txt: dinero2(Number(celdas[5])),
        total_txt: dinero2(Number(celdas[6])), ajuste_pct: numero(celdas[7]).ok && !vacia(celdas[7]) ? numero(celdas[7]).n : null, items_auth: t(8), huella: t(9),
        autorizo: t(10).trim().toLowerCase(), solicito: t(11), codigo: '', firma: t(13).trim().toLowerCase(), estado: t(14).trim(), nota: t(15).slice(0, 500), renglones: t(16),
        fila_hoja: fila,
      };
      const cod = normalizarCodigo(t(12));
      reg.codigo = cod.length === 12 ? cod.slice(0, 4) + '-' + cod.slice(4, 8) + '-' + cod.slice(8) : t(12);
      if (!['vigente', 'superada', 'revocada'].includes(reg.estado)) { rep.avisar('Autorizaciones', fila, reg.folio_global, `estado «${reg.estado}» se lee como superada, como en la hoja`); reg.estado = 'superada'; }
      const malo = !RE_FOLIO_GLOBAL.test(reg.folio_global) ? 'folio sin aparato' : !RE_TS_ISO.test(reg.ts_iso) ? 'la hora no es ISO' : !/^[0-9a-f]{64}$/.test(reg.firma) ? 'firma mal formada'
        : reg.codigo.replace(/-/g, '') !== reg.firma.slice(0, 12).toUpperCase() ? 'el código no es el inicio de la firma' : !reg.autorizo ? 'falta quién autorizó' : null;
      if (malo) { noEntra(fila, reg.folio_global, 'fila_mal_formada', malo); continue; }
      /* La fila tal como la guardaría la base: es lo que se firma (sello.js) y lo que /verificar recalculará. */
      const filaFirmada = { folio_global: reg.folio_global, ts_iso: reg.ts_iso, proyecto: reg.proyecto, sub_calc: reg.sub_calc_txt, precio_auth: reg.precio_auth_txt,
        total: reg.total_txt, items_auth: reg.items_auth, huella: reg.huella, autorizo: reg.autorizo, renglones: reg.renglones, codigo: reg.codigo, firma: reg.firma, estado: reg.estado };
      if (!conVeredicto) {
        let r;
        try { r = await verificar(filaFirmada, entrada.clave); } catch (e) { r = { valida: false, motivo: e.message }; }
        if (!r.valida) { rep.rechazar('Autorizaciones', fila, reg.folio_global, `la firma no cuadra (${r.motivo}): no entra y se queda en la hoja congelada`); continue; }
        reg.codificacion = r.codificacion === 'ascii' ? 'utf-8' : r.codificacion;
        auts.push(reg);
        continue;
      }
      const v = veredictos.porFila.get(fila);
      let canon = null;
      try { canon = canonDe(registroDeFila(filaFirmada)); } catch (_) { canon = null; }
      if (!v) { noEntra(fila, reg.folio_global, 'sin_veredicto', 'la hoja no dijo si su firma cuadra'); continue; }
      if (v.firma_ok !== true) {
        const m = MOTIVOS_AUTORIZACION.includes(v.motivo) ? v.motivo : 'firma_no_coincide';
        noEntra(fila, reg.folio_global, m, `la hoja dice que su firma no cuadra (${m})`); continue;
      }
      if (!CODIFICACIONES.includes(v.codificacion) || typeof v.canon !== 'string') { noEntra(fila, reg.folio_global, 'veredicto_invalido', 'el veredicto de la hoja no tiene la forma esperada'); continue; }
      if (canon === null || v.canon !== canon) {
        noEntra(fila, reg.folio_global, 'texto_distinto', 'lo que se guardaría no es EXACTAMENTE el texto que la hoja comprobó (se firmaría una cosa y se guardaría otra)'); continue;
      }
      reg.codificacion = v.codificacion;
      auts.push(reg);
    }
    // una sola vigente por folio (índice de la base): la de la fila más reciente. En la copia diaria no se decide: el folio espera en la hoja.
    const porFolio = new Map();
    for (const a of auts) (porFolio.get(a.folio_global) || porFolio.set(a.folio_global, []).get(a.folio_global)).push(a);
    for (const [fg, lista] of porFolio) {
      const vig = lista.filter(a => a.estado === 'vigente');
      if (vig.length <= 1) continue;
      if (conVeredicto) {
        for (const a of lista) { noEntra(a.fila_hoja, fg, 'dos_vigentes', 'su folio tiene dos autorizaciones vigentes en la hoja: se decide en la hoja'); auts.splice(auts.indexOf(a), 1); }
        continue;
      }
      rep.conflicto('dos autorizaciones vigentes', fg, `filas ${vig.map(a => a.fila_hoja).join(', ')}: queda vigente la ${vig.at(-1).fila_hoja}, las demás como superadas`);
      for (const a of vig.slice(0, -1)) a.estado = 'superada';
    }
    if (fuera.length) {
      fuera.sort((a, b) => a.fila - b.fila);
      const motivos = {};
      for (const x of fuera) motivos[x.motivo] = (motivos[x.motivo] || 0) + 1;
      rep.no_importado.push({ que: 'Autorizaciones', n: fuera.length, por: 'la copia diaria no las importa y se quedan en la hoja (no frenan la copia): ' +
        Object.entries(motivos).map(([k, n]) => k + ' ' + n).join(', '), filas: fuera.map(x => x.fila), motivos, detalle: fuera });
    }
    T.autorizaciones.push(...auts.map(a => ({ empresa_id: empresa, ...a, origen: 'importada_hoja', clave_id: 'k1' })));
  }

  /* ----- 12. Cotizaciones: el historial de cada teléfono (§3.5) y los talones de «Autorizaciones» ----- */
  const cots = new Map();
  for (const tel of tels) {
    for (const e of tel.historial) {
      const folio = String(e.folio || '').trim();
      if (!/^[A-Za-z0-9-]{1,24}$/.test(folio)) { rep.rechazar('cotizaciones', folio || '?', tel.etiqueta, 'folio no válido'); continue; }
      let disp = String(e.disp || '').trim(), inferido = false;
      if (!RE_DISP.test(disp)) disp = String((e.sello && e.sello.folio) || '').split('@')[1] || '';
      if (!RE_DISP.test(disp)) { disp = tel.disp; inferido = true; }
      if (!RE_DISP.test(disp)) { disp = 'HIST' + md5(folio + '|' + (e.cliente || '') + '|' + (e.fecha || '')).slice(0, 6); inferido = true; }
      const fg = folio + '@' + disp;
      const hitos = objeto(tel.hitos[folio]) || {};
      const fila = { empresa_id: empresa, folio_global: fg, folio, disp, estado: 'autorizada', datos: e, hitos,
        procedencia: { telefonos: [tel.etiqueta], ...(inferido ? { disp_inferido: true } : {}) } };
      if (inferido) rep.avisar('cotizaciones', fg, tel.etiqueta, 'la cotización no dice de qué aparato es: se le puso ' + disp + ' (pide el id del aparato en Ajustes)');
      const prev = cots.get(fg);
      if (!prev) { cots.set(fg, fila); continue; }
      prev.procedencia.telefonos.push(tel.etiqueta);
      if (!igualJSON(prev.datos, e)) rep.conflicto('cotización distinta entre teléfonos', fg, `${prev.procedencia.telefonos[0]} y ${tel.etiqueta}: se queda la del primero`);
    }
    if (tel.disp && tel.folio) T._folioCot = [...(T._folioCot || []), { disp: tel.disp, n: tel.folio }];
  }
  for (const a of T.autorizaciones) {
    if (cots.has(a.folio_global)) continue;
    const [folio, disp] = a.folio_global.split('@');
    cots.set(a.folio_global, { empresa_id: empresa, folio_global: a.folio_global, folio, disp, estado: 'autorizada',
      datos: { proy: a.proyecto, cliente: a.cliente, subtotal: Number(a.sub_calc_txt), huellaAuth: a.huella, items: [] }, hitos: {},
      procedencia: { stub: 'Autorizaciones', fila_hoja: a.fila_hoja }, solicito: a.solicito });
  }
  T.cotizaciones.push(...cots.values());

  /* ----- 13. Contadores (§3.1 col. A, §5.13) ----- */
  let maxV = 0;
  for (const nombre of ['Ventas', 'Ventas (respaldo)', 'Ventas (antes de realinear)']) for (const { celdas } of filas(P[nombre])) maxV = Math.max(maxV, numFolio(texto(celdas[0])));
  for (const { celdas } of filas(P['Bitácora del puente'])) maxV = Math.max(maxV, numFolio(texto(celdas[2])));
  for (const { celdas } of filas(P['Abonos comisión'])) maxV = Math.max(maxV, numFolio(texto(celdas[0])));
  let maxAlm = Number(vol.almacen_secuencia) || 0;
  for (const m of T.almacen_movimientos) maxAlm = Math.max(maxAlm, Number(m.procedencia.secuencia_hoja) || 0);
  const contadores = [{ clave: 'V', n: maxV }, { clave: 'P', n: maxP }, { clave: 'alm', n: maxAlm }];
  const folioCot = new Map();
  for (const x of T._folioCot || []) folioCot.set(x.disp, Math.max(folioCot.get(x.disp) || 0, x.n));
  for (const c of T.cotizaciones) {
    const n = Number((/(\d+)/.exec(c.folio) || [])[1]) || 0;
    if (!c.procedencia.stub) folioCot.set(c.disp, Math.max(folioCot.get(c.disp) || 0, n));
  }
  delete T._folioCot;
  for (const [disp, n] of [...folioCot].sort()) contadores.push({ clave: 'folio_cot:' + disp, n });

  /* ----- 14. Lo que esta versión del importador todavía NO lleva, dicho con su cuenta ----- */
  const cuenta = nombre => filas(P[nombre]).filter(x => x.celdas.some(v => !vacia(v))).length;
  if (cuenta('Solicitudes de autorización')) rep.no_importado.push({ que: 'Solicitudes de autorización', n: cuenta('Solicitudes de autorización'), por: 'esta versión no las importa (son peticiones en curso; se vuelven a pedir en la plataforma)' });
  if (cuenta('Bitácora del puente')) rep.no_importado.push({ que: 'Bitácora del puente', n: cuenta('Bitácora del puente'), por: 'esta versión no la importa (es historia; queda en la hoja congelada)' });
  for (const tel of tels) {
    const otros = ['proyectos', 'instalaciones', 'materiales', 'movimientos', 'requerimientos', 'constantes'].reduce((a, k) => a + tel[k].length, 0);
    if (!otros && !tel.historial.length) rep.avisar('teléfonos', tel.etiqueta, '-', 'el respaldo no trae nada: ¿es el archivo correcto?');
  }

  // limpieza de NUL en textos (la base no los guarda)
  for (const [tabla, lista] of Object.entries(T)) {
    for (const f of lista) {
      for (const [k, val] of Object.entries(f)) {
        if (typeof val === 'string') { const l = limpioParaTexto(val); if (l.tenia) { f[k] = l.s; rep.avisar(tabla, f.id || f.folio_hoja || f.folio_global || '?', k, 'traía un carácter NUL: se quitó'); } }
      }
    }
  }

  rep.resumen = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length]));
  rep.resumen.filas_de_ventas_leidas = ventas.length;
  rep.resumen.historicas = T.proyectos.filter(p => p.historica).length;
  rep.resumen.con_cotizacion = T.proyectos.filter(p => p.fuente === 'cotizacion').length;
  rep.resumen.telefonos = tels.map(t => ({ etiqueta: t.etiqueta, disp: t.disp, disp_inferido: t.disp_inferido, proyectos: t.proyectos.length, cotizaciones: t.historial.length }));
  delete rep.rechazar; delete rep.conflicto; delete rep.avisar;
  return { empresa, tablas: T, contadores, esperado, remapeo, reporte: rep, gastos_en_hoja: gastosEnHoja };
}

/* ============================================================================
   Ayudantes
   ============================================================================ */

/** El valor de un campo de obra en un proyecto de teléfono, como lo guardaría la base. */
function valorDeTelefono(p, k) {
  const v = p[k];
  if (k === 'tel') return telefonoLimpio(v);
  if (k === 'lat' || k === 'lng') return pinValido(p.lat, p.lng) ? v : null;
  if (k === 'plazo_k') return [1, 2, 3, 4, 5].includes(v) ? v : null;
  if (k === 'entrega') return ['instalacion', 'paqueteria', 'recoleccion'].includes(v) ? v : null;
  if (k === 'etapa') return ETAPAS.includes(v) ? v : null;
  return v === undefined || v === null ? '' : String(v);
}

const pinValido = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Lo que la base no acepta (CHECK de 0003 y 0012) se recorta o se vacía ANTES del SQL, y se dice: una sola fila así tumbaría todo su lote. */
function acotarProyecto(p, rep, donde) {
  if (!pinValido(p.lat, p.lng)) {
    if (p.lat !== null || p.lng !== null) rep.avisar('proyectos', p.folio_hoja || p.id, donde, `el pin «${p.lat},${p.lng}» no es válido: queda sin pin`);
    p.lat = null; p.lng = null;
  }
  for (const [k, tope] of [['nombre', 2000], ['contacto', 2000], ['negocio', 2000], ['dir_texto', 2000], ['notas', 40000], ['maps_url', 2000], ['geo_fuente', 200]]) {
    if (typeof p[k] === 'string' && p[k].length > tope) {
      (p.procedencia.recortado ||= {})[k] = p[k];
      p[k] = p[k].slice(0, tope);
      rep.avisar('proyectos', p.folio_hoja || p.id, donde, `${k} pasa de ${tope} caracteres: se recorta y el texto completo queda en procedencia`);
    }
  }
}

function sellosValidos(s) {
  const o = {};
  for (const [k, v] of Object.entries(objeto(s) || {})) if (['etapa', 'notas', 'plazo_k', 'tel', 'dir_texto', 'ubicacion', 'entrega', 'instalacion'].includes(k) && ms(v)) o[k] = ms(v);
  return o;
}

function numONull(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

/* ----- Una celda de «Gastos», leída como la lee el teléfono (`categoriaDe`, `fechaDeCelda`, `montoDe` y `siNo` de js/datos/gastos.js;
   pruebas/gastos.mjs las compara con estas). Copias a propósito: gastos.js trae consigo la base y la bandeja del teléfono. ----- */
const RE_ID_GASTO = /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,79}$/;     // el CHECK de 0020
const planoGasto = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
/* Lo que el puente escribe con apóstrofo para que Sheets no lo vuelva fórmula (gastoTexto_ del .gs) se lee sin él (gastoDeTexto_). */
const sinApostrofo = s => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

/** La categoría de la lista que le corresponde («material», «Transporte y Gasolina»…); lo que no es ninguna, «Otros». */
export function categoriaDeGasto(v) {
  const p = planoGasto(v);
  return (p && CATEGORIAS_GASTO.find(c => planoGasto(c) === p)) || 'Otros';
}

/** 'aaaa-mm-dd' de una celda de fecha, de un ISO o de un «23/10/2026» tecleado; '' si no es un día que exista entre 2000 y 2100. */
export function diaDeGasto(v) {
  const s = texto(v).trim();
  let iso = '';
  if (s.length === 10 || /^\d{4}-\d{2}-\d{2}T/.test(s)) iso = s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!p) return '';
  const [a, me, d] = [Number(p[1]), Number(p[2]), Number(p[3])];
  const ok = a >= 2000 && a <= 2100 && me >= 1 && me <= 12 && d >= 1 && d <= new Date(Date.UTC(a, me, 0)).getUTCDate();
  return ok ? iso : '';
}

/** El monto en pesos, redondeado a centavos: un número, o lo que se tecleó («$1,234.50»). Negativo, vacío o basura son 0. */
export function montoDeGasto(v) {
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? r2(v) : 0;
  const s = texto(v);
  if (/^\s*[-−]/.test(s)) return 0;
  const limpio = s.replace(/[^\d.]/g, '');
  const i = limpio.indexOf('.');
  const t = i < 0 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? r2(n) : 0;
}

/** «Sí», true, «TRUE», «x», «anulado» o 1 son sí; lo demás, no. */
export function siNoDeGasto(v) {
  if (v === true) return true;
  return ['si', 'true', 'x', 'anulado', '1'].includes(planoGasto(v));
}

/** Los milisegundos de una celda de fecha y hora (o de un número); 0 si no hay. */
const msDeCelda = v => (esFecha(v) ? ms(v.$ms) : typeof v === 'number' ? ms(v) : 0);

/** `partirNombreDeHoja` (js/datos/proyectos.js): quita el «(Tipo)» final y parte en el primer « - ». */
export function partirNombre(nombre) {
  const limpio = String(nombre || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  const i = limpio.indexOf(' - ');
  if (i < 0) return { contacto: '', negocio: limpio };
  return { contacto: limpio.slice(0, i).trim(), negocio: limpio.slice(i + 3).trim() };
}
