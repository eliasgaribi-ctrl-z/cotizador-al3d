/* ============================================================================
   ESPEJO — la lógica pura de la Edge Function `espejo`: de las vistas de la base de datos a los
   lotes que se le mandan a la ruta `espejo` del Apps Script (puente/hoja-apps-script.gs), y el
   cursor con el que se sabe qué ya se mandó.

   La hoja de Google queda como ESPEJO DE SOLO LECTURA de la base (docs/DECISIONES-SUPABASE.md,
   Q-10 y Q-12): la función lee dos vistas con la llave de servicio —`espejo_ventas` y
   `espejo_abonos`—, arma lotes y se los manda a la hoja con un secreto compartido. Este módulo es
   todo lo que no es red ni reloj; `supabase/functions/espejo/handler.js` es quien lo usa y quien
   conversa con la base y con la hoja.

   NO TIENE NADA DE NODE NI DE DENO. Ni entorno, ni `fetch`, ni reloj: recibe lo que necesita y
   devuelve datos. Corre igual en las dos y en las pruebas (pruebas/supabase-espejo.mjs).

   QUÉ SE DECIDIÓ AQUÍ, Y POR QUÉ

   · EL CURSOR ES (updated_at, id), CON UN SOLAPE DE 30 SEGUNDOS (docs/PLAN-SUPABASE.md, diseño A
     §7.2). `updated_at` lo pone la base al ESCRIBIR, pero la fila solo se ve al CONFIRMAR: una
     transacción lenta puede confirmar con una hora anterior a la de otra más nueva que la función
     ya vio. Por eso cada vuelta empieza 30 segundos antes del cursor guardado; releer lo ya mandado
     no cuesta nada, porque la ruta es idempotente. El cursor se guarda TAL CUAL lo dio la base
     (con sus microsegundos): pasarlo por un Date de JavaScript le quitaría tres cifras, y la
     comparación `updated_at = cursor` de la siguiente página dejaría de encontrar la fila.
   · `espejo_ventas` NO TRAE `id`: su desempate es el folio. Y trae DOS horas, la de la obra
     (`updated_at`) y la del dinero (`dinero_updated_at`), porque una venta cambia cuando cambia su
     proyecto o cuando cambia su dinero. Un solo cursor sobre una de las dos se perdería los cambios de
     la otra, así que son dos flujos con su cursor cada uno (`ventas` y `ventas_dinero`). Una venta
     que sale en los dos se manda dos veces, y no pasa nada. Lo que NO ve ninguno es un cambio que
     solo toque `instalaciones` (la fecha y la hora de la cita salen de ahí): la vista no expone su
     hora. Lo cubre la reconciliación completa, y si la vista llegara a exponer
     `instalacion_updated_at`, el flujo se agrega aquí con una línea (ver FLUJOS).
   · LOS ABONOS VIAJAN POR FOLIO, COMPLETOS. La hoja de abonos no tiene un id por renglón y la
     base no edita ni borra abonos, así que lo que se reconcilia es el CONJUNTO de abonos de un
     folio. Cuando el cursor ve un abono nuevo, la función lee todos los abonos de ese folio y manda
     el conjunto; la hoja agrega los que faltan y deja lo demás como está.
   · LOS LOTES TOPAN POR TAMAÑO. El cuerpo de la hoja se rechaza arriba de 64 KB (doPost), y las
     notas de una venta pueden pesar decenas de miles de caracteres: un lote se corta por número de
     filas Y por caracteres, y una fila que sola no cabe se reporta, no se manda. Los grupos de abonos
     cuentan además por los renglones que llevan dentro (la hoja rechaza más de 400 por lote).
   ============================================================================ */

/** Las columnas de la hoja «Ventas» que la base escribe, en el orden de la hoja: [llave de la vista
 *  `espejo_ventas`, número de columna]. Son las CAPTURADAS (A:G, I:J, L:N, Y:AI; `bloquesCapturados` del
 *  .gs). Faltan, a propósito, H, K y O:X: son fórmulas de la hoja y no se escriben nunca.
 *  pruebas/supabase-espejo.mjs la compara con `espejoColumnasVentas_()` del .gs. */
export const COLUMNAS_VENTAS = Object.freeze([
  ['a_folio', 1], ['b_proyecto', 2], ['c_estatus', 3], ['d_cuenta', 4], ['e_tipo', 5], ['f_iva', 6],
  ['g_subtotal', 7], ['i_anticipo', 9], ['j_liquidacion', 10], ['l_fecha_anticipo', 12],
  ['m_fecha_instalacion', 13], ['n_fecha_liquidacion', 14], ['y_folio_cotizacion', 25], ['z_etapa', 26],
  ['aa_hora', 27], ['ab_ubicacion', 28], ['ac_direccion', 29], ['ad_pct', 30], ['ae_telefono', 31],
  ['af_entrega', 32], ['ag_notas', 33], ['ah_plazo', 34], ['ai_sellos', 35],
].map(c => Object.freeze(c)));

/** Las columnas de fórmula de «Ventas». Ninguna llave de la vista lleva estas letras. */
export const COLUMNAS_FORMULA = Object.freeze(['H', 'K', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X']);

/** Lo que de un abono se manda: las columnas capturadas de «Abonos comisión» (A, C, D, E, F; la B es fórmula). */
export const COLUMNAS_ABONO = Object.freeze(['c_importe', 'd_fecha', 'e_nota', 'f_pago']);

/** Los flujos que la función recorre. Cada uno es una vista con su cursor `(ts, id)` y la fila de
 *  `contadores` donde vive (`empresa_id = '*'`, `ventana = ''`; docs, diseño A §8). `tipo` dice qué
 *  clase de lote arma. Agregar un flujo es agregar un renglón (y su clave a GRUPOS). */
export const FLUJOS = Object.freeze({
  ventas:        Object.freeze({ vista: 'espejo_ventas', clave: 'espejo:ventas',        ts: 'updated_at',        id: 'a_folio', tipo: 'ventas' }),
  ventas_dinero: Object.freeze({ vista: 'espejo_ventas', clave: 'espejo:ventas_dinero', ts: 'dinero_updated_at', id: 'a_folio', tipo: 'ventas' }),
  abonos:        Object.freeze({ vista: 'espejo_abonos', clave: 'espejo:abonos',        ts: 'updated_at',        id: 'id',      tipo: 'abonos', idNumerico: true }),
});

/** Lo que significa pedir «ventas» o «abonos»: los flujos que se recorren, en este orden. */
export const GRUPOS = Object.freeze({
  ventas: Object.freeze(['ventas', 'ventas_dinero']),
  abonos: Object.freeze(['abonos']),
});

/** Dónde se guarda el estado de la reconciliación completa («en_curso|<ISO>» o «listo|<ISO>»), los folios
 *  que la hoja rechazó (una lista JSON) y el resumen de la última corrida (JSON). Son filas de
 *  `contadores`, como los cursores (`empresa_id = '*'`, `ventana = ''`); `texto` es lo que importa. */
export const CLAVE_COMPLETO = 'espejo:completo';
export const CLAVE_RECHAZADAS = 'espejo:rechazadas';
export const CLAVE_CORRIDA = 'espejo:corrida';

/** Valores por omisión. Ninguno es secreto. `maxCaracteres` queda por debajo de los 65 536 con los que
 *  doPost rechaza un cuerpo; `solapeMs` es el del diseño. */
export const LIMITES = Object.freeze({
  solapeMs: 30_000,
  tamPagina: 40,
  maxCaracteres: 60_000,
  maxFilasAbonos: 350,
  presupuestoMs: 100_000,
  intentos: 3,
  esperasMs: Object.freeze([1_000, 3_000]),
  esperaPorLlamadaMs: 60_000,
  limiteDuroMs: 140_000,
  rondasDeAislamiento: 3,
  maxPaginas: 500,
  maxRechazadas: 20,
});

/** El secreto más corto que se acepta, de los dos lados. */
export const SECRETO_MINIMO = 32;

/* ---------------------------------------------------------------------------
   SECRETO COMPARTIDO
   --------------------------------------------------------------------------- */

/** Igualdad de dos textos sin salir en la primera diferencia: recorre SIEMPRE el más largo y junta las
 *  diferencias, para que lo que tarda no diga en qué posición falla. Es la misma de `espejoIgual_` en el .gs. */
export function igualesEnTiempoConstante(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  const largo = Math.max(x.length, y.length);
  let dif = x.length ^ y.length;
  for (let i = 0; i < largo; i++) dif |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

/** ¿`dado` es el secreto `esperado`? Compara SIEMPRE, aunque falte el esperado, y después exige el largo
 *  mínimo: «no hay secreto configurado» y «es otro» no se distinguen ni por lo que tarda ni por lo que
 *  se contesta. */
export function secretoValido(dado, esperado) {
  const igual = igualesEnTiempoConstante(esperado, dado);
  return igual && String(esperado ?? '').length >= SECRETO_MINIMO;
}

/* ---------------------------------------------------------------------------
   DE LA VISTA A LAS FILAS DEL LOTE
   --------------------------------------------------------------------------- */

/** Una fila de `espejo_ventas` como la espera la ruta: SOLO las columnas capturadas, con las llaves de la
 *  vista. Lo demás (`empresa_id`, las horas) es del cursor y no viaja. Una llave que la vista no trae se
 *  omite —la ruta no toca esa columna—; un `null` viaja, y borra la celda. */
export function filaDeVentas(fila) {
  const out = {};
  for (const [llave] of COLUMNAS_VENTAS) {
    if (fila[llave] !== undefined) out[llave] = fila[llave];
  }
  return out;
}

const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Las filas de `espejo_abonos` de uno o varios folios, agrupadas por folio y en el orden de `id` (el de
 *  llegada), como las espera la ruta: `{ a_folio, abonos: [{ c_importe, d_fecha, e_nota, f_pago }] }`. Los
 *  folios salen en el orden en que aparecen sus primeros abonos. */
export function agruparAbonos(filas) {
  const ordenadas = [...filas].sort((p, q) => comparar(Number(p.id), Number(q.id)));
  const porFolio = new Map();
  for (const f of ordenadas) {
    const folio = String(f.a_folio ?? '').trim().toUpperCase();
    if (!porFolio.has(folio)) porFolio.set(folio, { a_folio: folio, abonos: [] });
    porFolio.get(folio).abonos.push({
      c_importe: f.c_importe,
      d_fecha: f.d_fecha ?? null,
      e_nota: f.e_nota ?? '',
      f_pago: f.f_pago ?? null,
    });
  }
  return [...porFolio.values()];
}

/** El folio con el que la ruta reconoce un elemento del lote (una venta o un grupo de abonos). */
export function folioDe(elemento) {
  return String((elemento && elemento.a_folio) ?? '').trim().toUpperCase();
}

/* ---------------------------------------------------------------------------
   LOTES
   --------------------------------------------------------------------------- */

/** Cuántos caracteres pesa el cuerpo de un lote VACÍO (el sobre: la ruta, el secreto, el id y las
 *  listas) más un margen. Lo que el packer le suma son las filas. */
export function sobrecargaDelCuerpo(secreto, lote = {}) {
  return JSON.stringify({ ruta: 'espejo', secreto: secreto ?? '', lote: { id: '', modo: 'incremental', ventas: [], abonos: [], ...lote } }).length + 200;
}

/** Corta los elementos en lotes de a lo más `maxElementos` filas y `maxCaracteres` caracteres de cuerpo.
 *  Respeta el orden. Un elemento que él solo no cabe en ningún lote sale aparte, en `grandes`: no se
 *  manda, se reporta (la hoja rechazaría el cuerpo entero).
 *
 *  Los grupos de abonos pesan por lo que llevan DENTRO: la hoja rechaza un lote con más de 400 renglones de
 *  abonos, y cuarenta folios con doce abonos cada uno ya son 480. `filasDe(elemento)` dice cuántos renglones
 *  trae y `maxFilas` es el tope por lote. */
export function armarLotes(elementos, { maxElementos = LIMITES.tamPagina, maxCaracteres = LIMITES.maxCaracteres, sobrecarga = 400, filasDe = null, maxFilas = Infinity } = {}) {
  const lotes = [];
  const grandes = [];
  let actual = [];
  let tam = sobrecarga;
  let filas = 0;
  for (const el of elementos) {
    const t = JSON.stringify(el).length + 1;
    const n = filasDe ? filasDe(el) : 0;
    if (sobrecarga + t > maxCaracteres || n > maxFilas) { grandes.push(el); continue; }
    if (actual.length && (actual.length >= maxElementos || tam + t > maxCaracteres || filas + n > maxFilas)) {
      lotes.push(actual);
      actual = [];
      tam = sobrecarga;
      filas = 0;
    }
    actual.push(el);
    tam += t;
    filas += n;
  }
  if (actual.length) lotes.push(actual);
  return { lotes, grandes };
}

/** El cuerpo que se le manda a la hoja. `tipo` dice si los elementos son ventas o grupos de abonos; con
 *  una lista vacía es el latido: no escribe nada y deja la marca de «última sincronización». */
export function cuerpoDeLote({ secreto, tipo, elementos = [], id = '', modo = 'incremental' }) {
  const lote = { id, modo, ventas: [], abonos: [] };
  if (tipo === 'ventas') lote.ventas = elementos;
  else if (tipo === 'abonos') lote.abonos = elementos;
  return JSON.stringify({ ruta: 'espejo', secreto, lote });
}

/* ---------------------------------------------------------------------------
   CURSOR
   --------------------------------------------------------------------------- */

/** `'<ts>|<id>'` → `{ ts, id }`, o `null` si no hay cursor (empezar de cero). El id es lo que sigue al primer «|». */
export function leerCursor(texto) {
  const s = String(texto ?? '').trim();
  const i = s.indexOf('|');
  if (i < 1) return null;
  const ts = s.slice(0, i);
  if (Number.isNaN(Date.parse(ts))) return null;
  return { ts, id: s.slice(i + 1) };
}

export function textoDeCursor(cursor) {
  return cursor ? cursor.ts + '|' + cursor.id : '';
}

/** Compara dos cursores: primero por hora (por el INSTANTE, no por el texto: «+00:00» y «Z» son lo mismo) y
 *  después por id —como número si el flujo lo es—. Devuelve -1, 0 o 1. Un cursor nulo es el más viejo. */
export function compararCursores(a, b, idNumerico = false) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const ta = Date.parse(a.ts), tb = Date.parse(b.ts);
  if (ta !== tb) return ta < tb ? -1 : 1;
  /* Misma hora a la milésima: el texto manda si difieren las microsegundos. */
  if (a.ts !== b.ts) return comparar(a.ts, b.ts);
  return idNumerico ? comparar(Number(a.id), Number(b.id)) : comparar(String(a.id), String(b.id));
}

/** El instante desde el que se vuelve a leer: el cursor menos el solape. En ISO con milisegundos, que es lo
 *  que cualquier PostgREST entiende; al redondear hacia abajo solo se lee de más. */
export function pisoDelCursor(cursor, solapeMs = LIMITES.solapeMs) {
  if (!cursor) return null;
  const t = Date.parse(cursor.ts);
  if (Number.isNaN(t)) return null;
  return new Date(Math.max(0, t - solapeMs)).toISOString();
}

/** La consulta (el query string, SIN el signo de interrogación) de UNA página de un flujo.
 *
 *  `pos` es dónde va: `null` (desde el principio), `{ piso }` (la primera vuelta de una corrida: solo
 *  filas posteriores a ese instante) o `{ ts, id }` (la fila exacta con la que acabó la página anterior:
 *  `ts > pos.ts` o `ts = pos.ts` y `id > pos.id`). Los valores se codifican: un «+» del huso horario sin
 *  codificar llega como espacio. El piso es inclusivo (`>=`): el solape ya es de sobra, y que la fila
 *  justo en el borde se relea no cuesta nada. */
export function consultaDePagina(flujo, pos, { empresa, limite = LIMITES.tamPagina } = {}) {
  const f = typeof flujo === 'string' ? FLUJOS[flujo] : flujo;
  if (!f) throw new Error('flujo desconocido: ' + flujo);
  const e = encodeURIComponent;
  const partes = ['select=*', 'empresa_id=eq.' + e(empresa)];
  if (pos && pos.piso) {
    partes.push(f.ts + '=gte.' + e(pos.piso));
  } else if (pos) {
    partes.push('or=(' + f.ts + '.gt.' + e(pos.ts) + ',and(' + f.ts + '.eq.' + e(pos.ts) + ',' + f.id + '.gt.' + e(pos.id) + '))');
  }
  partes.push('order=' + f.ts + '.asc,' + f.id + '.asc', 'limit=' + Math.max(1, Math.floor(limite)));
  return partes.join('&');
}

/** La consulta de los abonos de unos folios, en el orden de llegada. */
export function consultaDeAbonosDeFolios(folios, { empresa, limite = 500, despuesDe = null } = {}) {
  const e = encodeURIComponent;
  const partes = ['select=*', 'empresa_id=eq.' + e(empresa), 'a_folio=in.(' + folios.map(e).join(',') + ')'];
  if (despuesDe !== null && despuesDe !== undefined) partes.push('id=gt.' + e(despuesDe));
  partes.push('order=id.asc', 'limit=' + Math.max(1, Math.floor(limite)));
  return partes.join('&');
}

/* ---------------------------------------------------------------------------
   LO QUE CONTESTA LA HOJA
   --------------------------------------------------------------------------- */

/** Lee la respuesta de la ruta `espejo` (o su falta) y dice qué hacer con ella.
 *
 *  `entrada`: `{ http, json, error }` —el estado HTTP, el cuerpo ya leído como JSON (o `null` si no lo era) y
 *  el error de red, si lo hubo—. Devuelve `{ clase, reintentable, codigo, mensaje, ... }`:
 *    ok · red · hoja_ocupada · fallo_parcial · capacidad · invalido · apagado · autenticacion · esquema ·
 *    http · no_json · otro.
 *  Solo se reintenta lo que puede salir bien la próxima vez; un rechazo de la hoja no. */
export function clasificarRespuesta({ http = 0, json = null, error = null } = {}) {
  if (error) return { clase: 'red', reintentable: true, mensaje: String((error && error.message) || error).slice(0, 200) };
  if (json && typeof json === 'object') {
    if (json.ok === true) return { clase: 'ok', reintentable: false, resultado: json };
    const codigo = String(json.codigo || '');
    const base = { codigo, mensaje: String(json.mensaje || '').slice(0, 300), detalle: json };
    if (codigo === 'SIN_RED') return { ...base, clase: 'hoja_ocupada', reintentable: true };
    if (codigo === 'DESCONOCIDO') return { ...base, clase: 'fallo_parcial', reintentable: true };
    if (codigo === 'CAPACIDAD_AGOTADA' || json.capacidad_agotada === true) return { ...base, clase: 'capacidad', reintentable: false };
    if (codigo === 'DATO_INVALIDO') {
      return { ...base, clase: 'invalido', reintentable: false,
               rechazadas: Array.isArray(json.rechazadas) ? json.rechazadas.slice(0, 50) : [], motivo: json.motivo || '' };
    }
    if (codigo === 'ESPEJO_APAGADO') return { ...base, clase: 'apagado', reintentable: false };
    if (codigo === 'ROL_SIN_PERMISO') return { ...base, clase: 'autenticacion', reintentable: false };
    if (codigo === 'ESQUEMA_INCOMPLETO') return { ...base, clase: 'esquema', reintentable: false };
    return { ...base, clase: 'otro', reintentable: false };
  }
  /* Sin JSON: Apps Script contestó una página (cuota agotada, error interno, una redirección a un inicio de
     sesión). Un 5xx, un 429 o un 408 se reintentan; un 4xx no es de la hoja ocupada sino de la dirección o
     de los permisos del despliegue. */
  if (http >= 500 || http === 429 || http === 408) return { clase: 'http', reintentable: true, mensaje: 'HTTP ' + http };
  if (http >= 400) return { clase: 'http', reintentable: false, mensaje: 'HTTP ' + http };
  return { clase: 'no_json', reintentable: true, mensaje: 'La hoja no contestó JSON (HTTP ' + http + ').' };
}
