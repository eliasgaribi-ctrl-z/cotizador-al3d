/* ============================================================================
   El almacén: el libro append-only, la existencia derivada y la lista de compra.

   Dos reglas gobiernan este archivo entero, y las dos son la razón por la que a este
   número se le puede creer dentro de seis meses:

   1. LA EXISTENCIA NO SE GUARDA. No hay un campo `cantidad` en el catálogo que alguien
      incremente. La existencia es el último `conteo` más la suma de todo lo que pasó
      después. Un número guardado se desincroniza en la primera salida que nadie registró
      y después ya nadie sabe cuándo empezó a mentir; una suma de deltas sobre un conteo se
      audita hacia atrás renglón por renglón, y cuando ya no cuadra se arregla contando
      otra vez, que es lo único que fabricación puede hacer sin que nadie le explique nada.

   2. EL LIBRO ES APPEND-ONLY. Un movimiento no se edita ni se borra: se corrige con otro
      movimiento de signo contrario, igual que una póliza no se tacha. Si el renglón malo
      se pudiera borrar, la existencia de la semana pasada dejaría de ser reproducible, y
      con ella la respuesta a «¿de dónde salió que faltaba una lámina?».

   Y una tercera que es de oficio más que de arquitectura: el redondeo vive AQUÍ, en
   `listaCompra`, y AGREGA ANTES DE REDONDEAR. Redondear por proyecto es cómo un almacén se
   llena de sobrantes y cómo la gente deja de creerle al sistema (§6.4).

   Dep: db, prefs, material, ui (tres funciones puras), sync (perezoso).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import * as Material from './material.js';
import { fmtFecha, plural, diasHasta, partesISO } from '../nucleo/ui.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/* `sync.js` se importa cuando se usa. La escritura local ya ocurrió cuando se llega aquí:
   encolar es lo único que puede fallar sin consecuencia para quien está en el taller. */
async function modSync() { try { return await import('./sync.js'); } catch (_) { return null; } }

async function encolar(mov) {
  const S = await modSync();
  if (!S || typeof S.encolar !== 'function') return;
  try {
    await S.encolar({
      id: DB.nuevoId('op'), tipo: 'apendice', almacen: 'movimientos',
      registro_id: mov.id, datos: mov, esperado: null,
      ts: Date.now(), intentos: 0, ultimo_error: '',
    });
  } catch (_) { /* el renglón ya está escrito; la cola se recupera en el próximo bombeo */ }
}

/* ============================================================================
   Vocabulario congelado (§4.7)
   ============================================================================ */

export const TIPOS = ['entrada', 'salida', 'ajuste', 'conteo', 'merma', 'devolucion'];
export const ORIGENES = ['derivado', 'manual', 'conteo', 'compra'];

/* El signo lo pone el tipo, no quien llama. Una fila que dice `tipo:'salida'` con
   `cantidad: 0.25` es un dedo que se olvidó del menos, y sin esta tabla ese olvido hace
   que el almacén CREZCA cada vez que la obra consume material: el error más caro posible,
   porque nunca se ve hasta que alguien va por una lámina que no está.
   `ajuste` y `conteo` valen 0 a propósito: en un ajuste el signo es el dato (material.js
   manda `-dif`, que puede ir para los dos lados) y un conteo no es un delta. */
const SIGNO = { entrada: 1, devolucion: 1, salida: -1, merma: -1, ajuste: 0, conteo: 0 };

const TIPO_TXT = {
  entrada: 'entrada', salida: 'salida', ajuste: 'ajuste',
  conteo: 'conteo', merma: 'merma', devolucion: 'devolución',
};

/* Un proyecto en estas etapas ya no pide material: lo que necesitaba, ya salió. */
const ETAPAS_CERRADAS = new Set(['instalado', 'garantia', 'cancelado']);

/* Un requerimiento en estos estados ya no se compra. `consumido` es el importante:
   ya salió del almacén y por lo tanto ya está restado de la existencia. Sumarlo otra vez
   a lo requerido es pedir dos veces lo mismo, que es literalmente la falla que §10
   describe cuando nadie registra la entrada. */
const REQ_SERVIDOS = new Set(['consumido', 'descartado']);

const TOL = 1e-9;
const nn = (x, def = 0) => { const v = Number(x); return isFinite(v) ? v : def; };
/* Seis decimales: por debajo de eso ya es basura de coma flotante, y `0.30000000000000004`
   en una pantalla de almacén hace que alguien deje de leer el resto del renglón. */
const red = x => Math.round((nn(x) + Number.EPSILON) * 1e6) / 1e6;
const red2 = x => Math.round((nn(x) + Number.EPSILON) * 100) / 100;
const PEOR = { exacta: 0, estimada: 1, requiere_dato: 2 };
const peorDe = (a, b) => (PEOR[b] > PEOR[a] ? b : a);

/* ----- Fechas y sellos -----
   De sello a fecha de calendario a mano. `new Date(ts).toISOString().slice(0,10)` daría el
   día UTC, y un conteo capturado a las siete de la noche en Guadalajara se leería como del
   día siguiente. Es el mismo error que ui.js evita al revés. */
function isoDeSello(ts) {
  const d = new Date(nn(ts)), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** «12 ago», y con año solo si no es este: «12 ago 2026» en agosto de 2026 es ruido. */
function fechaCorta(iso) {
  const txt = fmtFecha(iso), p = partesISO(iso);
  if (!p) return '';
  return p.a === new Date().getFullYear() ? txt.replace(' ' + p.a, '') : txt;
}

/* Quien llame desde una pantalla tiene una fecha de calendario; quien llame desde una
   regla tiene un sello. Se aceptan las dos. Y la conversión es a las 00:00 LOCALES, no con
   `new Date('2026-08-23')`, que es medianoche UTC y aquí metería los movimientos de la
   tarde del 22. */
function selloDe(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  if (isFinite(n) && n > 0) return n;
  const p = partesISO(x);
  return p ? new Date(p.a, p.m - 1, p.d, 0, 0, 0, 0).getTime() : null;
}

/* Los rangos van en try: en un navegador sin IndexedDB `IDBKeyRange` no existe, y una
   lectura no puede lanzar. Sin rango, `listar` recorre el índice completo y el filtro de
   abajo hace el resto. */
function rangoMaterial(id) {
  try { return IDBKeyRange.bound([String(id), -Infinity], [String(id), Infinity]); }
  catch (_) { return null; }
}
function rangoIgual(v) {
  try { return IDBKeyRange.only(v); } catch (_) { return null; }
}

/** Orden canónico del libro: por tiempo, y con el id como desempate para que dos
 *  dispositivos que escriben en el mismo milisegundo lean la misma historia. */
const ordenLibro = (a, b) => (nn(a.ts) - nn(b.ts)) || String(a.id).localeCompare(String(b.id));

/* ============================================================================
   EXISTENCIA — el último conteo más lo que pasó después
   ============================================================================ */

/**
 * El cálculo, aislado y puro para poder probarlo con un array a mano.
 *
 * El conteo es un ANCLA ABSOLUTA, no un delta: reinicia la suma. Un movimiento con el
 * MISMO ts que el conteo no entra (la suma es de `ts` estrictamente mayor), porque el
 * conteo es una aserción de lo que estaba en el estante en ese instante y contarlo otra
 * vez sería contar dos veces lo que la persona ya vio.
 */
function calcularExistencia(movs) {
  const filas = (movs || []).filter(m => m && typeof m === 'object').sort(ordenLibro);
  let ancla = null;
  for (const m of filas) if (m.tipo === 'conteo') ancla = m;   // ordenados: el último gana

  let cantidad = 0, posteriores = 0;
  if (ancla) {
    cantidad = nn(ancla.cantidad);
    for (const m of filas) {
      if (m.tipo === 'conteo') continue;
      if (nn(m.ts) > nn(ancla.ts)) { cantidad += nn(m.cantidad); posteriores++; }
    }
  } else {
    for (const m of filas) {
      if (m.tipo === 'conteo') continue;
      cantidad += nn(m.cantidad); posteriores++;
    }
  }
  return { cantidad: red(cantidad), ancla, posteriores, renglones: filas.length };
}

/** El sello de frescura, ya escrito para leerse. Es lo que hace que nadie confunda un
 *  número contado con un número derivado, que es la diferencia entre confiar y verificar. */
function selloFrescura(c) {
  if (!c.ancla) {
    return c.renglones
      ? 'derivado · nunca contado'
      : 'sin movimientos · nunca contado';
  }
  const quien = String(c.ancla.usuario || '').trim();
  let s = 'contado el ' + fechaCorta(isoDeSello(c.ancla.ts)) + (quien ? ' por ' + quien : '');
  if (c.posteriores) s += ' · ' + c.posteriores + (c.posteriores === 1 ? ' movimiento' : ' movimientos') + ' después';
  return s;
}

function filaExistencia(mat, movs) {
  const c = calcularExistencia(movs);
  const iso = c.ancla ? isoDeSello(c.ancla.ts) : null;
  const d = iso ? diasHasta(iso) : null;
  /* `edad_dias` es el nombre de §5.6 y `frescura_dias` el que usa la pantalla de material:
     es el mismo número y se devuelven los dos, porque cambiarle el nombre a uno de los dos
     lados solo lograría que la pantalla pintara `undefined` días. */
  const edad = d === null ? null : Math.max(0, -d);
  return {
    material_id: mat.id,
    existe: true,
    nombre: mat.nombre || mat.id,
    familia: mat.familia || '',
    unidad_compra: mat.unidad_compra || 'unidad',
    cantidad: c.cantidad,
    ultimo_conteo: c.ancla ? nn(c.ancla.ts) : null,
    ultimo_conteo_fecha: iso,
    contado_por: c.ancla ? String(c.ancla.usuario || '') : '',
    edad_dias: edad,
    frescura_dias: edad,
    derivado: !c.ancla,
    movimientos_posteriores: c.posteriores,
    renglones: c.renglones,
    sello: selloFrescura(c),
    min_stock: nn(mat.min_stock, 0),
    min_compra: nn(mat.min_compra, 1),
    fraccionable: !!mat.fraccionable,
    proveedor: mat.proveedor || '',
    tel_proveedor: mat.tel_proveedor || '',
    /* Para fabricación el costo NO SE PINTA (§8.4), y la forma más segura de que un número
       no se pinte es que no salga de la capa de datos. No se difumina: no está. */
    costo_compra: Prefs.veDinero() && mat.costo_compra !== null && mat.costo_compra !== undefined
      ? nn(mat.costo_compra) : null,
  };
}

/** El hueco: un material que el libro menciona pero que ya no está en el catálogo.
 *  Se devuelve igual, con `existe:false`, porque esconderlo haría que su existencia
 *  desapareciera de la pantalla sin que nadie hubiera decidido nada. */
function huecoExistencia(id) {
  return {
    material_id: String(id), existe: false, nombre: String(id), familia: '',
    unidad_compra: 'unidad', cantidad: 0, ultimo_conteo: null, ultimo_conteo_fecha: null,
    contado_por: '', edad_dias: null, frescura_dias: null, derivado: true,
    movimientos_posteriores: 0, renglones: 0,
    sello: 'este material ya no está en el catálogo',
    min_stock: 0, min_compra: 1, fraccionable: false,
    proveedor: '', tel_proveedor: '', costo_compra: null,
  };
}

/**
 * Existencia de UN material. Nunca lanza, nunca devuelve undefined.
 * @returns {Promise<Object>} la fila de existencia; `existe:false` si el material ya no está
 */
export async function existencia(materialId) {
  const id = String(materialId || '').trim();
  if (!id) return huecoExistencia('');
  const mat = await Material.obtenerMaterial(id);
  let movs = await DB.listar('movimientos', { indice: 'porMaterial', rango: rangoMaterial(id) });
  movs = (movs || []).filter(m => m && m.material_id === id);
  if (!mat) {
    const h = huecoExistencia(id);
    const c = calcularExistencia(movs);
    return { ...h, cantidad: c.cantidad, renglones: c.renglones };
  }
  return filaExistencia(mat, movs);
}

/**
 * Una fila por material activo, con lo comprometido al lado. Una sola pasada por el libro:
 * diecinueve consultas indexadas serían más elegantes y bastante más lentas en un celular.
 *
 * `comprometido` va aquí porque es la diferencia entre «tengo 3 láminas» y «tengo 3 láminas
 * y dos ya tienen dueño», y esa distinción es la que evita prometer material dos veces.
 * @returns {Promise<Object[]>}
 */
export async function existencias() {
  const [mats, movs, comp] = await Promise.all([
    Material.listarMateriales({ activo: true }),
    DB.listar('movimientos'),
    mapaComprometido(),
  ]);
  const porMat = new Map();
  for (const m of (movs || [])) {
    if (!m || !m.material_id) continue;
    if (!porMat.has(m.material_id)) porMat.set(m.material_id, []);
    porMat.get(m.material_id).push(m);
  }
  return (mats || []).map(mat => {
    const f = filaExistencia(mat, porMat.get(mat.id) || []);
    const c = red(comp.get(mat.id) || 0);
    return { ...f, comprometido: c, libre: red(f.cantidad - c) };
  });
}

/* ============================================================================
   MOVER — el apéndice
   ============================================================================ */

/** Un movimiento humano no lo escribe el rol de pagos (§8.4). Los `derivado` sí pasan:
 *  la degradación de §10 emite las salidas a `fecha − 1 día` con quien tenga la app
 *  abierta, y si ese día quien abre es pagos, el almacén no puede quedarse sin descontar
 *  por una razón de organigrama. El rol no es seguridad; es no pedirle a alguien un toque
 *  que no le toca. */
function permiso(origen) {
  if (origen === 'derivado') return null;
  if (Prefs.rol() === 'pagos') {
    return mal('ROL_SIN_PERMISO',
      'El almacén lo mueve fabricación o dirección. Si te toca a ti, cambia de rol en Ajustes.');
  }
  return null;
}

/**
 * El apéndice de verdad. `mover()` lo envuelve con la validación que la interfaz necesita;
 * `contar()` entra por aquí porque un conteo de 0 es un dato («no queda nada») mientras que
 * un delta de 0 no es nada.
 */
async function apendice(mov, opts = {}) {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  if (!mov || typeof mov !== 'object') return mal('DATO_INVALIDO', 'No llegó ningún movimiento que registrar.');

  const tipo = String(mov.tipo || '').trim();
  if (!TIPOS.includes(tipo)) {
    return mal('DATO_INVALIDO', 'Un movimiento del almacén es entrada, salida, ajuste, conteo, merma o devolución.');
  }
  const origen = ORIGENES.includes(mov.origen) ? mov.origen : 'manual';
  const noPuede = permiso(origen);
  if (noPuede) return noPuede;

  const id = String(mov.material_id || '').trim();
  const mat = opts.material || await Material.obtenerMaterial(id);
  if (!mat) return mal('NO_ENCONTRADO', 'Ese material no está en el catálogo. Dalo de alta antes de moverlo.');

  const cantidad = Number(mov.cantidad);
  if (!isFinite(cantidad)) {
    return mal('DATO_INVALIDO', 'Escribe cuánto, en ' + plural(mat.unidad_compra) + '. Media lámina es 0.5.');
  }
  if (!opts.permitirCero && Math.abs(cantidad) <= TOL) {
    return mal('DATO_INVALIDO', 'Un movimiento de 0 no cambia nada. Escribe la cantidad que entró o salió.');
  }

  /* La unidad viaja en la fila para poder auditar (§4.7). Si no viene se copia del
     material; si viene distinta se rechaza, porque un renglón que dice «metro» donde el
     material se compra por «lámina» envenena la suma para siempre y después no hay forma
     de saber cuál de las dos era la verdad. */
  const unidad = String(mov.unidad_compra || mat.unidad_compra || '').trim();
  if (unidad !== mat.unidad_compra) {
    return mal('DATO_INVALIDO',
      mat.nombre + ' se compra por ' + (mat.unidad_compra || 'unidad') +
      ', y ese movimiento viene en ' + unidad + '. Los dos números no se pueden sumar.');
  }

  const signo = SIGNO[tipo];
  const fila = {
    id: mov.id || DB.nuevoId('mov'),
    empresa_id: Prefs.empresa(),
    material_id: mat.id,
    tipo,
    cantidad: red(signo === 0 ? cantidad : signo * Math.abs(cantidad)),
    unidad_compra: mat.unidad_compra,
    proyecto_id: mov.proyecto_id || null,
    requerimiento_id: mov.requerimiento_id || null,
    origen,
    costo_total: mov.costo_total === undefined || mov.costo_total === null || !isFinite(Number(mov.costo_total))
      ? null : red2(mov.costo_total),
    nota: String(mov.nota || '').trim(),
    /* El sello lo pone esta capa y NUNCA quien llama. Un `ts` que viene de fuera es la
       puerta por la que entra un movimiento fechado antes del último conteo, que
       desaparecería de la suma sin decir nada. Un respaldo entra por DB.importar, que
       fusiona por id y no pasa por aquí. */
    ts: Date.now(),
    usuario: Prefs.nombre(),
    rol: Prefs.rol(),
    dispositivo: Prefs.dispositivo(),
    /* §4.7 guarda usuario, rol y dispositivo por separado para poder agrupar; `sello` es la
       misma información ya escrita para leerse, y se congela con el renglón porque quien lo
       firmó puede cambiar de nombre o de rol mañana y el renglón de ayer no debe cambiar
       con él. */
    sello: Prefs.sello(),
    sync: 0,
  };

  const r = await DB.poner('movimientos', fila);
  if (!r.ok) return r;
  await encolar(r.valor);
  return ok(r.valor);
}

/**
 * Apéndice puro: agrega un renglón al libro. Nunca edita ni borra nada.
 * Rechaza cantidad 0 y unidad distinta a la del material. Sella ts, usuario, rol y
 * dispositivo. Falla: DATO_INVALIDO, NO_ENCONTRADO, ROL_SIN_PERMISO, SIN_ESPACIO.
 * @returns {Promise<Resultado>} valor = el movimiento sellado
 */
export async function mover(mov) {
  return await apendice(mov);
}

/* ============================================================================
   CONTAR y ACEPTAR EL DERIVADO
   ============================================================================ */

/**
 * Un conteo físico: la única aserción absoluta del sistema. Reinicia la suma.
 *
 * Si hay movimientos con `ts` posterior al del conteo —dos dispositivos, o un reloj
 * atrasado— el resultado lo dice en `valor.movimientos_posteriores` para que la pantalla
 * lo enseñe. Esconderlo sería la forma más rápida de que alguien cuente 3, lea 2.5 y deje
 * de contar para siempre.
 * @returns {Promise<Resultado>} valor = {movimiento, antes, ahora, movimientos_posteriores, sello}
 */
export async function contar(materialId, cantidad, nota) {
  const id = String(materialId || '').trim();
  const mat = await Material.obtenerMaterial(id);
  if (!mat) return mal('NO_ENCONTRADO', 'Ese material no está en el catálogo. Dalo de alta antes de contarlo.');

  const c = Number(cantidad);
  if (!isFinite(c)) {
    return mal('DATO_INVALIDO', 'Escribe cuántas ' + plural(mat.unidad_compra) +
      ' hay. Puede llevar decimales: media lámina es 0.5.');
  }
  if (c < 0) {
    return mal('DATO_INVALIDO', 'No se puede contar menos que nada. Si lo que había ya no está, cuenta 0.');
  }

  const antes = await existencia(id);
  const r = await apendice({
    material_id: id, tipo: 'conteo', cantidad: c, unidad_compra: mat.unidad_compra,
    origen: 'conteo', nota: String(nota || '').trim(),
  }, { material: mat, permitirCero: true });
  if (!r.ok) return r;

  const ahora = await existencia(id);
  return ok({
    movimiento: r.valor,
    antes: antes.cantidad,
    ahora: ahora.cantidad,
    diferencia: red(c - antes.cantidad),
    movimientos_posteriores: ahora.movimientos_posteriores,
    sello: ahora.sello,
  });
}

/**
 * «Así está»: graba un conteo con la cantidad que YA estaba derivada, sin teclear.
 *
 * Este botón es la diferencia entre que el conteo del día 1 exista y que no exista. Sin él
 * el conteo mensual son diecinueve números capturados a mano en un almacén, y eso no se
 * hace nunca: se hace una vez, con ganas, y al mes siguiente ya no. Con él, fabricación
 * teclea solo los que no cuadran y acepta el resto de un toque, que es el mismo trabajo que
 * ya hace al pasar la vista por el estante.
 */
export async function aceptarDerivado(materialId) {
  const e = await existencia(materialId);
  if (!e.existe) return mal('NO_ENCONTRADO', 'Ese material no está en el catálogo.');
  if (e.cantidad < -TOL) {
    /* Aceptar un negativo sería firmar un imposible. Y es justo el caso donde el conteo
       vale más: el libro ya está descuadrado y el número de la persona lo arregla. */
    return mal('DATO_INVALIDO',
      'El libro dice ' + e.cantidad + ' ' + plural(e.unidad_compra) +
      ', que no puede ser. Cuenta cuántas hay de verdad: ese número arregla el descuadre.');
  }
  return await contar(materialId, e.cantidad,
    'Así está: se aceptó la cantidad derivada sin teclearla.');
}

/* ============================================================================
   COMPROMETIDO y DEMANDA
   ============================================================================ */

/**
 * Recolecta lo que los proyectos piden, agrupado por material y SIN REDONDEAR.
 * Es la base común de `comprometido()` y de `listaCompra()`: un solo camino para que las
 * dos pantallas no puedan contradecirse.
 *
 * @param {{hastaDias?:number|null, soloAgendados?:boolean}} opts
 */
async function recolectarDemanda(opts = {}) {
  const hastaDias = opts.hastaDias === undefined ? null : opts.hastaDias;
  const soloAgendados = !!opts.soloAgendados;

  const [proys, insts, reqs] = await Promise.all([
    DB.listar('proyectos'), DB.listar('instalaciones'), DB.listar('requerimientos'),
  ]);

  /* La fecha que exige el material es la instalación MÁS PRÓXIMA del proyecto. Una
     reagendada cancelada no cuenta: si contara, un proyecto movido a diciembre seguiría
     pidiendo su lámina para el martes. */
  const fechaDe = new Map();
  for (const i of (insts || [])) {
    if (!i || !i.proyecto_id || !i.fecha || i.estado === 'cancelada') continue;
    const prev = fechaDe.get(i.proyecto_id);
    if (!prev || i.fecha < prev) fechaDe.set(i.proyecto_id, i.fecha);
  }

  const abiertos = new Map();
  for (const p of (proys || [])) {
    if (!p || !p.id || ETAPAS_CERRADAS.has(p.etapa)) continue;
    const fecha = fechaDe.get(p.id) || null;
    if (soloAgendados && !fecha) continue;
    /* Un proyecto ganado SIN fecha entra igual. No tener fecha no es no necesitar
       material: es que el cliente todavía no contesta, y se va a fabricar de todas formas.
       §9 lo dice sin rodeos: preferimos el falso positivo. Una lámina de más en la lista
       cuesta diez segundos de lectura; una de menos cuesta un día de instalación. */
    if (fecha !== null && hastaDias !== null) {
      const d = diasHasta(fecha);
      if (d !== null && d > hastaDias) continue;
    }
    abiertos.set(p.id, {
      id: p.id,
      nombre: p.nombre || p.folio_local || p.folio_global || 'Proyecto sin nombre',
      folio: p.folio_local || '',
      etapa: p.etapa || '',
      fecha,
    });
  }

  const out = new Map();
  for (const r of (reqs || [])) {
    if (!r || !r.material_id) continue;
    if (REQ_SERVIDOS.has(r.estado)) continue;
    const pr = abiertos.get(r.proyecto_id);
    if (!pr) continue;

    /* La corrección humana SIEMPRE gana (§4.8). Si fabricación dijo que fueron 1.5
       láminas, la lista de compra pide 1.5, no lo que la fórmula creía. */
    const pedido = (r.cantidad_ajustada === null || r.cantidad_ajustada === undefined)
      ? nn(r.cantidad_compra) : nn(r.cantidad_ajustada);
    const confianza = r.confianza || 'estimada';
    /* Una línea en 0 se calla, salvo si le falta un dato: esa sí sale, con su pregunta.
       Un 0 silencioso es cómo alguien llega al taller sin acrílico. */
    if (pedido <= TOL && confianza !== 'requiere_dato') continue;

    if (!out.has(r.material_id)) {
      out.set(r.material_id, {
        requerido: 0, proyectos: [], fecha: null,
        confianza: 'exacta', requiere: '', requerimientos: [],
      });
    }
    const d = out.get(r.material_id);
    d.requerido += pedido;
    d.requerimientos.push(r.id);
    d.confianza = peorDe(d.confianza, confianza);
    if (!d.requiere && r.requiere) d.requiere = String(r.requiere);
    if (!d.proyectos.some(x => x.id === pr.id)) {
      d.proyectos.push({ id: pr.id, nombre: pr.nombre, folio: pr.folio, fecha: pr.fecha });
    }
    if (pr.fecha && (!d.fecha || pr.fecha < d.fecha)) d.fecha = pr.fecha;
  }

  for (const d of out.values()) {
    d.requerido = red(d.requerido);
    /* Primero lo que se instala primero; lo que no tiene fecha, al final. */
    d.proyectos.sort((a, b) => String(a.fecha || '9999-99-99').localeCompare(String(b.fecha || '9999-99-99')));
  }
  return out;
}

/** Mapa material_id -> cantidad comprometida por proyectos AGENDADOS y no consumida. */
async function mapaComprometido() {
  const d = await recolectarDemanda({ soloAgendados: true, hastaDias: null });
  const m = new Map();
  for (const [id, v] of d) m.set(id, v.requerido);
  return m;
}

/**
 * Lo que ya está pedido por proyectos con instalación agendada y todavía no se consumió.
 * Es la diferencia entre «tengo 3 láminas» y «tengo 3 láminas y dos ya tienen dueño»: sin
 * este número, la misma lámina se le promete a dos clientes y el segundo se enoja el
 * jueves a las ocho de la mañana.
 * @returns {Promise<number>} 0 si nada la pide
 */
export async function comprometido(materialId) {
  const id = String(materialId || '').trim();
  if (!id) return 0;
  const m = await mapaComprometido();
  return red(m.get(id) || 0);
}

/* ============================================================================
   LISTA DE COMPRA — donde vive el redondeo
   ============================================================================ */

/**
 * El redondeo, PURO y solo. Se exporta aparte porque es el único cálculo de este archivo
 * cuyo error se paga en dinero y en un almacén lleno de sobrantes, y porque así se prueba
 * en node sin base de datos.
 *
 * Recibe el faltante YA AGREGADO de todos los proyectos. Ese detalle es la función entera:
 * dos proyectos que piden 0.484 y 0.700 láminas con 0.5 en el almacén son UNA lámina
 * agregando primero, y DOS redondeando por proyecto. La segunda cifra es cómo un almacén
 * se llena de retazos que nadie vuelve a usar y cómo la gente deja de creerle al sistema.
 *
 * `min_compra` es el mínimo del proveedor: no se venden 4 remaches, se vende la bolsa de 30.
 * `fraccionable` significa que un retazo sí sirve, así que se redondea a cuartos de unidad
 * de compra en vez de a unidades enteras.
 *
 * @param {number} faltante  ya agregado, en unidad de compra
 * @param {{fraccionable?:boolean, min_compra?:number}} material
 * @returns {number} cuánto comprar, en unidad de compra
 */
export function cuantoComprar(faltante, material) {
  const f = Number(faltante);
  if (!isFinite(f) || f <= TOL) return 0;
  const m = material || {};
  const min = Math.max(0, nn(m.min_compra, 0));
  /* La tolerancia va ANTES de multiplicar: sin ella, un faltante que la coma flotante deja
     en 0.5000000000000001 pide tres cuartos de lámina en vez de media. */
  const bruto = m.fraccionable
    ? Math.ceil((f - TOL) * 4) / 4
    : Math.ceil(f - TOL);
  return red(Math.max(min, bruto));
}

/**
 * Lo que hay que comprar. AGREGA TODOS los proyectos abiertos ANTES de redondear.
 *
 * `hastaDias` (14 por omisión) se mide contra la fecha de instalación. Un proyecto sin
 * fecha entra siempre: ver el comentario de `recolectarDemanda`.
 *
 * Se devuelven también las líneas cubiertas, con `comprar:0`. «Faltan 0 — hay 2.4 láminas,
 * esto usa 0.54» es la respuesta a la pregunta que alguien se hizo; una lista que solo
 * enseña faltantes obliga a ir a otra pantalla a confirmar que lo demás sí está, y esa
 * segunda pantalla no se abre.
 *
 * @param {{hastaDias?:number}} filtro
 * @returns {Promise<Object[]>} ordenadas por la fecha que las exige
 */
export async function listaCompra(filtro = {}) {
  const h = Number(filtro && filtro.hastaDias);
  const hastaDias = isFinite(h) && h >= 0 ? h : 14;

  const [mats, movs, demanda] = await Promise.all([
    Material.listarMateriales({}),
    DB.listar('movimientos'),
    recolectarDemanda({ hastaDias }),
  ]);

  const catalogo = new Map((mats || []).map(m => [m.id, m]));
  const porMat = new Map();
  for (const m of (movs || [])) {
    if (!m || !m.material_id) continue;
    if (!porMat.has(m.material_id)) porMat.set(m.material_id, []);
    porMat.get(m.material_id).push(m);
  }

  /* Dos razones para estar en la lista: lo piden los proyectos, o el material cayó por
     debajo de su mínimo de reposición. Lo segundo es lo que resuelve los consumibles de
     §6.7: derivar 0.02 L de solvente por proyecto es precisión falsa, y el solvente se
     repone por mínimo, como en cualquier taller. */
  const ids = new Set(demanda.keys());
  for (const m of (mats || [])) if (m && m.activo && nn(m.min_stock) > 0) ids.add(m.id);

  const veDinero = Prefs.veDinero();
  const filas = [];
  for (const id of ids) {
    const mat = catalogo.get(id);
    const d = demanda.get(id) || { requerido: 0, proyectos: [], fecha: null, confianza: 'exacta', requiere: '', requerimientos: [] };
    const exi = mat ? filaExistencia(mat, porMat.get(id) || []) : huecoExistencia(id);

    /* Un material que un requerimiento pide y que ya no está en el catálogo no se puede
       redondear: no se sabe si es fraccionable ni cuál es el mínimo del proveedor. Sale con
       la pregunta escrita en vez de con un número inventado. */
    const confianza = mat ? d.confianza : 'requiere_dato';
    const requiere = mat ? d.requiere
      : 'Da de alta «' + id + '» en el catálogo de material: sin su unidad de compra no se sabe cuánto pedir.';

    const minStock = nn(exi.min_stock, 0);
    /* El mínimo es el piso que se quiere CONSERVAR después de servir lo pedido, así que se
       suma al requerido. Con `min_stock:0` —el default de las diecinueve filas de la
       semilla— esto es exactamente la fórmula de §6.4, ni un decimal distinto. */
    const objetivo = red(d.requerido + minStock);
    const faltante = Math.max(0, red(objetivo - exi.cantidad));
    const comprar = mat ? cuantoComprar(faltante, exi) : 0;

    const motivo = d.requerido > TOL
      ? (minStock > 0 ? 'proyecto+minimo' : 'proyecto')
      : 'minimo';

    filas.push({
      material_id: id,
      material: mat || null,
      nombre: exi.nombre,
      familia: exi.familia,
      unidad_compra: exi.unidad_compra,
      requerido: d.requerido,
      min_stock: minStock,
      disponible: exi.cantidad,
      faltante,
      comprar,
      /* Los tres nombres de §5.6. El sufijo `_consumo` de ese contrato es un resto de una
         versión anterior: los tres números están en UNIDAD DE COMPRA, como manda §6.4,
         porque son los que se redondean y los que se le dicen al proveedor. Se dejan como
         alias para que una pantalla escrita contra el contrato no pinte `undefined`. */
      requerido_consumo: d.requerido,
      disponible_consumo: exi.cantidad,
      faltante_consumo: faltante,
      motivo,
      proyectos: d.proyectos,
      fecha: d.fecha,
      confianza,
      requiere,
      derivado: exi.derivado,
      sello: exi.sello,
      proveedor: exi.proveedor,
      tel_proveedor: exi.tel_proveedor,
      costo_compra: veDinero ? exi.costo_compra : null,
      costo: veDinero && exi.costo_compra !== null ? red2(comprar * exi.costo_compra) : null,
    });
  }

  /* Se compra primero lo que se instala primero. Lo que ya está cubierto baja, porque el
     papel que se lleva al proveedor tiene que empezar por lo que hay que pedir. */
  filas.sort((a, b) =>
    (b.comprar > TOL ? 1 : 0) - (a.comprar > TOL ? 1 : 0) ||
    String(a.fecha || '9999-99-99').localeCompare(String(b.fecha || '9999-99-99')) ||
    String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return filas;
}

/**
 * «Recibí lo de la lista»: un movimiento `entrada` por material, en UNA sola transacción.
 *
 * Es el único toque que se le pide a fabricación al recibir, y por eso es todo-o-nada: si
 * la mitad de las entradas se guardara y la otra mitad no, el almacén quedaría en un estado
 * que nadie puede describir y el siguiente conteo cargaría con el error. Ya recibe el
 * material y ya firma la remisión; esto es el mismo gesto una vez más.
 *
 * `costo_total` es opcional y por línea: sin costos la plataforma da CANTIDADES, que es el
 * 80 % del valor (§6.7).
 * @param {Array<{material_id:string, cantidad:number, costo_total?:number, nota?:string, proyecto_id?:string}>} lineas
 * @returns {Promise<Resultado>} valor = {movimientos, materiales, costo_total}
 */
export async function recibirCompra(lineas) {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  if (!Array.isArray(lineas) || !lineas.length) {
    return mal('DATO_INVALIDO', 'No hay nada que recibir. Marca lo que llegó y vuelve a darle.');
  }
  const noPuede = permiso('compra');
  if (noPuede) return noPuede;

  const ts = Date.now();
  const sello = Prefs.sello();
  const empresa = Prefs.empresa();
  const movs = [];
  let costoTotal = null;

  for (const l of lineas) {
    if (!l || typeof l !== 'object') return mal('DATO_INVALIDO', 'Una de las líneas de la compra no trae nada.');
    const id = String(l.material_id || '').trim();
    const mat = await Material.obtenerMaterial(id);
    if (!mat) {
      return mal('NO_ENCONTRADO', 'No se recibió nada: «' + (id || 'sin material') +
        '» no está en el catálogo. Dalo de alta y vuelve a intentar.');
    }
    const c = Number(l.cantidad);
    if (!isFinite(c) || c <= TOL) {
      return mal('DATO_INVALIDO', 'No se recibió nada: falta cuántas ' + plural(mat.unidad_compra) +
        ' llegaron de ' + mat.nombre + '.');
    }
    const costo = l.costo_total === undefined || l.costo_total === null || !isFinite(Number(l.costo_total))
      ? null : red2(l.costo_total);
    if (costo !== null) costoTotal = red2(nn(costoTotal) + costo);

    movs.push({
      id: DB.nuevoId('mov'), empresa_id: empresa, material_id: mat.id,
      tipo: 'entrada', cantidad: red(Math.abs(c)), unidad_compra: mat.unidad_compra,
      proyecto_id: l.proyecto_id || null, requerimiento_id: null,
      origen: 'compra', costo_total: costo,
      nota: String(l.nota || 'Recibido de la lista de compra').trim(),
      ts, usuario: Prefs.nombre(), rol: Prefs.rol(), dispositivo: Prefs.dispositivo(),
      sello, sync: 0,
    });
  }

  const r = await DB.ponerVarios('movimientos', movs);
  if (!r.ok) return r;
  for (const m of movs) await encolar(m);

  return ok({
    movimientos: movs.length,
    materiales: movs.map(m => m.material_id),
    costo_total: costoTotal,
  });
}

/* ============================================================================
   Avisos y valor
   ============================================================================ */

/**
 * Lo que cayó por debajo de su mínimo de reposición. `min_stock:0` significa «no avises»
 * y es el default de las diecinueve filas: nadie tiene que llenar este campo para que la
 * plataforma sirva, y quien lo llene recibe el aviso de A9 con el WhatsApp del proveedor
 * ya armado.
 */
export async function bajoMinimo() {
  const exis = await existencias();
  return exis
    .filter(e => nn(e.min_stock) > 0 && e.cantidad < nn(e.min_stock) - TOL)
    .map(e => ({
      ...e,
      faltante_minimo: red(nn(e.min_stock) - e.cantidad),
      mensaje: e.nombre + ': quedan ' + e.cantidad + ' ' + plural(e.unidad_compra) +
        ' y el mínimo es ' + e.min_stock + '.' +
        (e.derivado ? ' Y nunca se ha contado, así que puede ser peor.' : ''),
    }))
    /* Primero el más hundido: la fracción del mínimo, no la diferencia absoluta. Faltar
       media lámina de un mínimo de una es más urgente que faltar 5 remaches de 30. */
    .sort((a, b) => (a.cantidad / nn(a.min_stock, 1)) - (b.cantidad / nn(b.min_stock, 1)));
}

/**
 * El libro, filtrado. Devuelve los renglones tal como están: es el libro, no una vista.
 * `desde` acepta un sello epoch o una fecha 'YYYY-MM-DD'.
 * El límite por omisión es 200 porque tres años de libro en una pantalla de celular no se
 * leen y sí se pagan en memoria.
 */
export async function movimientos(filtro = {}) {
  const f = filtro || {};
  const mid = f.material_id ? String(f.material_id) : '';
  const pid = f.proyecto_id ? String(f.proyecto_id) : '';
  const desde = selloDe(f.desde);
  const limite = nn(f.limite, 0) > 0 ? nn(f.limite) : 200;

  let filas;
  if (mid) filas = await DB.listar('movimientos', { indice: 'porMaterial', rango: rangoMaterial(mid) });
  else if (pid) filas = await DB.listar('movimientos', { indice: 'porProyecto', rango: rangoIgual(pid) });
  else filas = await DB.listar('movimientos');

  filas = (filas || []).filter(m => {
    if (!m) return false;
    if (mid && m.material_id !== mid) return false;
    if (pid && m.proyecto_id !== pid) return false;
    if (desde !== null && nn(m.ts) < desde) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    return true;
  });
  /* Lo último primero: quien abre el libro está buscando qué pasó hace un rato. */
  filas.sort((a, b) => ordenLibro(b, a));
  return filas.slice(0, limite);
}

/** Cómo se lee un renglón del libro en una línea. Puro, para la pantalla de movimientos. */
export function textoMovimiento(mov) {
  if (!mov) return '';
  const c = nn(mov.cantidad);
  const signo = c > 0 ? '+' : (c < 0 ? '−' : '');
  const t = TIPO_TXT[mov.tipo] || mov.tipo || '';
  const u = plural(mov.unidad_compra);
  return (mov.tipo === 'conteo' ? 'conteo: ' + Math.abs(c) + ' ' + u
                                : t + ' ' + signo + Math.abs(c) + ' ' + u) +
    (mov.usuario ? ' · ' + mov.usuario : '') +
    (mov.nota ? ' · ' + mov.nota : '');
}

/**
 * Valor del inventario, y `null` cuando no hay con qué calcularlo.
 *
 * `null`, NO 0. Un 0 dice «no tienes nada» y es mentira; `null` dice «no hay costos», que
 * es la verdad. Sin costos la plataforma da CANTIDADES, que es el 80 % del valor y el
 * motivo por el que `costo_compra` es opcional en las diecinueve filas (§6.7 y §10).
 *
 * Para fabricación también devuelve `null`: los importes no se pintan (§8.4), y la forma
 * más segura de que un número no se pinte es que no salga de la capa de datos.
 * @returns {Promise<Object|null>} {total, con_costo, sin_costo, parcial, mensaje} | null
 */
export async function valorInventario() {
  if (!Prefs.veDinero()) return null;
  const exis = await existencias();
  let total = 0, conCosto = 0, sinCosto = 0;
  for (const e of exis) {
    if (e.costo_compra === null || e.costo_compra === undefined) {
      if (Math.abs(e.cantidad) > TOL) sinCosto++;
      continue;
    }
    conCosto++;
    total += e.cantidad * nn(e.costo_compra);
  }
  if (!conCosto) return null;
  return {
    total: red2(total),
    materiales: exis.length,
    con_costo: conCosto,
    sin_costo: sinCosto,
    parcial: sinCosto > 0,
    /* El mensaje no trae pesos: formatear dinero es de la pantalla, que ya tiene money(). */
    mensaje: sinCosto
      ? 'Es el valor de ' + conCosto + ' materiales. A otros ' + sinCosto +
        ' que sí tienen existencia les falta el costo de compra.'
      : 'Es el valor de los ' + conCosto + ' materiales con costo capturado.',
  };
}
