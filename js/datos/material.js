/* ============================================================================
   Catálogo de material, constantes de taller y DERIVACIÓN.

   Este archivo es la respuesta a la pregunta que el cotizador nunca contestó: «esto que
   acabamos de vender, ¿de qué se hace y cuánto hay que comprar?». Hasta hoy la respuesta
   vivía en la cabeza de una persona y en un mensaje de WhatsApp.

   Las tres reglas que gobiernan todo lo de abajo, porque romper cualquiera de las tres
   convierte la lista de compra en una mentira convincente:

   1. NUNCA se deriva material del importe. `m2Total()` del cotizador cobra
      `Math.max(m2, 1)`: una caja de 0.3 m² se COBRA como 1 m² y se FABRICA con 0.3.
      Aquí se usa el área REAL siempre. Y el `p *= 0.8` de `!it.luz` es dinero: para
      material, `luz:false` significa CERO módulos y CERO fuentes, no un 20 % menos.
   2. `showInPdf === false` NO filtra nada. Esas partidas se cobran agrupadas como
      «Conceptos adicionales» y se fabrican igual: llevan lámina, LED y tornillos.
   3. Todo campo se lee con default. La partida que crea la IA (`index.html:5905`) no trae
      `matAuto`, `textoAuto` ni `ilumTipo`; una lectura directa de `it.ilumTipo` pediría
      LED `undefined`.

   Y una regla de honestidad que vale tanto como las tres anteriores: NUNCA se devuelve 0
   en silencio. Si falta un número, la línea sale con `confianza:'requiere_dato'` y
   `requiere` dice cuál número falta, con la partida y la unidad. Un 0 silencioso es la
   forma más rápida de que alguien llegue al taller sin acrílico.

   Dep: db, catalogo-precios, prefs, sync (perezoso), stock (perezoso).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import { catalogos, cajaOf } from './catalogo-precios.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/* `sync.js` y `stock.js` se importan cuando se usan, no cuando este módulo se evalúa.
   Dos razones distintas y las dos reales: `stock.js` importa a este módulo —necesita las
   unidades de compra para validar un movimiento— y un import estático de vuelta sería un
   ciclo; y un `sync.js` roto o a medio desplegar no tiene por qué llevarse el catálogo de
   material entero, porque la escritura local ya ocurrió y encolar es lo único que puede
   fallar sin consecuencia para el usuario. */
async function modSync()  { try { return await import('./sync.js');  } catch (_) { return null; } }
async function modStock() { try { return await import('./stock.js'); } catch (_) { return null; } }

async function encolar(tipo, almacen, registro) {
  const S = await modSync();
  if (!S || typeof S.encolar !== 'function') return;
  try {
    await S.encolar({
      id: DB.nuevoId('op'), tipo, almacen,
      registro_id: registro[almacen === 'constantes' ? 'clave' : 'id'],
      datos: registro, esperado: null, ts: Date.now(), intentos: 0, ultimo_error: '',
    });
  } catch (_) { /* la escritura local ya está; la cola se recupera en el próximo bombeo */ }
}

/* ============================================================================
   Vocabulario congelado
   ============================================================================ */

/** Las seis que dijo el usuario. El empaquetado raro se expresa con medida + factor +
 *  min_compra, nunca inventando una unidad nueva: en cuanto existe «medio rollo» como
 *  unidad, dos personas suman cosas distintas con el mismo nombre. */
const UNIDADES_COMPRA = ['unidad', 'bolsa', 'caja', 'lamina', 'litro', 'metro'];
const UNIDADES_CONSUMO = ['m2', 'm', 'cm', 'pieza', 'litro'];

const U_TXT  = { m2: 'm²', m: 'm', cm: 'cm', pieza: 'pieza', litro: 'litro' };
const UC_TXT = { unidad: 'unidad', bolsa: 'bolsa', caja: 'caja',
                 lamina: 'lámina', litro: 'litro', metro: 'metro' };

/* Cómo se lee lo que el cotizador guarda en `unidad_consumo`. La semilla escribe unidades
   bonitas —«m²», «m de cordón», «m² limpiados»— y el esquema §4.6 congela cinco valores.
   Se normaliza al vocabulario y el matiz no se pierde: ya vive en `factor_origen`. */
const NORM_CONSUMO = {
  'm²': 'm2', 'm2': 'm2', 'm² limpiados': 'm2', 'm de cordón': 'm', 'm de cordon': 'm',
  'm': 'm', 'cm': 'cm', 'pieza': 'pieza', 'piezas': 'pieza', 'litro': 'litro',
};
const normConsumo = u => NORM_CONSUMO[String(u || '').trim()] || String(u || '').trim();

/* ----- El canto de una letra, por material de venta -----
   No es invención: `descTxt` (index.html:6037) imprime «Letras Individuales 3D: Caras en
   Acrílico, Cantos en {material}», y la página «¿Cómo Cotizar?» dice lo mismo. Dos
   fuentes independientes que coinciden, así que la cara es acrílico SIEMPRE y el material
   que el vendedor eligió es el del canto. */
const CANTO_POR_MAT = {
  'al-paint':  'fleje-al-pintado',
  'al-brush':  'fleje-al-brush',
  'acr-vol':   'fleje-al-pintado',
  'acr-vinil': 'fleje-al-pintado',
  'acero':     'fleje-inox',
};

/* El tope del cordón de plausibilidad, en cm de frente de anuncio. `PROMPT_IA`
   (index.html:5261) instruye textualmente «No importa si el corchete es vertical u
   horizontal: usa ese numero tal cual como centimetros». Para el precio da igual —la
   regla es $/cm × altura × n—; para el material es un error de un orden de magnitud, y
   este es el único lugar del sistema donde se puede notar. No es constante de taller: es
   un detector de captura, y meterlo en la pantalla de constantes invitaría a subirlo
   hasta que dejara de molestar. */
const TOPE_FRENTE_CM = 1200;

/* ============================================================================
   Respaldo del catálogo y de las constantes, dentro del código.

   `derivar()` es PURA y síncrona: no puede leer IndexedDB ni hacer fetch. Pero necesita el
   factor y la merma de cada material para poder decir «16.73 m ÷ 58.56 m/lámina = 0.29»,
   que es la mitad del valor de este módulo. Así que las cifras mínimas viven aquí.

   La fuente de la verdad sigue siendo `datos/semilla.json` para sembrar y la base para
   operar: `recalcular()` le pasa a `derivar()` las filas REALES, así que si alguien sube la
   merma del acrílico de 25 % a 31 %, gana su número, no éste. Esta tabla es lo que hace que
   la plataforma funcione el primer día, sin red y sin haber sembrado nada.
   Si cambias un factor, cámbialo en `datos/semilla.json`; esto es el respaldo.
   ============================================================================ */

const ORIGEN_RESPALDO = 'Valor de respaldo del código: no se pudo leer datos/semilla.json. ' +
  'VERIFICA con tu proveedor en la primera compra y escribe aquí de dónde salió.';

/* El orden importa: es el orden en que se pintan las líneas de un requerimiento, y una
   lista que cambia de orden entre dos aperturas se lee como si hubiera cambiado. */
const MAT_BASE = [
  { id: 'acr-3mm', nombre: 'Acrílico blanco/opal 3 mm', familia: 'acrilico', unidad_compra: 'lamina', unidad_consumo: 'm2', medida: '1.22 × 2.44 m', factor: 2.9768, merma_pct: 0.25, largo_cm: 244, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'acr-6mm', nombre: 'Acrílico blanco 6 mm', familia: 'acrilico', unidad_compra: 'lamina', unidad_consumo: 'm2', medida: '1.22 × 2.44 m', factor: 2.9768, merma_pct: 0.25, largo_cm: 244, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'al-pintado', nombre: 'Lámina aluminio pintado', familia: 'aluminio', unidad_compra: 'lamina', unidad_consumo: 'm2', medida: '1.22 × 2.44 m', factor: 2.9768, merma_pct: 0.12, largo_cm: 244, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'al-brush', nombre: 'Lámina aluminio brush cepillado', familia: 'aluminio', unidad_compra: 'lamina', unidad_consumo: 'm2', medida: '1.22 × 2.44 m', factor: 2.9768, merma_pct: 0.12, largo_cm: 244, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'fleje-al-pintado', nombre: 'Fleje aluminio pintado 5 cm', familia: 'fleje', unidad_compra: 'metro', unidad_consumo: 'm', medida: 'rollo de 30 m', factor: 1, merma_pct: 0.12, largo_cm: 3000, ancho_cm: 5, min_compra: 30, min_stock: 0, fraccionable: false },
  { id: 'fleje-al-brush', nombre: 'Fleje aluminio brush 5 cm', familia: 'fleje', unidad_compra: 'metro', unidad_consumo: 'm', medida: 'rollo de 30 m', factor: 1, merma_pct: 0.12, largo_cm: 3000, ancho_cm: 5, min_compra: 30, min_stock: 0, fraccionable: false },
  { id: 'fleje-inox', nombre: 'Fleje acero inoxidable espejo 5 cm', familia: 'fleje', unidad_compra: 'lamina', unidad_consumo: 'm', medida: '1.22 × 2.44 m', factor: 58.56, merma_pct: 0.15, largo_cm: 244, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'lam-galv', nombre: 'Lámina galvanizada calibre 24', familia: 'lamina', unidad_compra: 'lamina', unidad_consumo: 'm2', medida: '1.22 × 2.44 m', factor: 2.9768, merma_pct: 0.10, largo_cm: 244, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'alucobond', nombre: 'Alucobond 4 mm', familia: 'lamina', unidad_compra: 'lamina', unidad_consumo: 'm2', medida: '1.25 × 2.50 m', factor: 3.125, merma_pct: 0.10, largo_cm: 250, ancho_cm: 125, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'vinil-corte', nombre: 'Vinil de corte', familia: 'vinil', unidad_compra: 'metro', unidad_consumo: 'm2', medida: 'rollo de 1.22 m de ancho', factor: 1.22, merma_pct: 0.20, largo_cm: null, ancho_cm: 122, min_compra: 1, min_stock: 0, fraccionable: true },
  { id: 'led-6500', nombre: 'Módulo LED 12 V 6500 K (luz fría)', familia: 'iluminacion', unidad_compra: 'caja', unidad_consumo: 'pieza', medida: 'caja de 100 módulos', factor: 100, merma_pct: 0.03, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'led-3000', nombre: 'Módulo LED 12 V 3000 K (luz cálida)', familia: 'iluminacion', unidad_compra: 'caja', unidad_consumo: 'pieza', medida: 'caja de 100 módulos', factor: 100, merma_pct: 0.03, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'fuente-60', nombre: 'Fuente 12 V 60 W', familia: 'iluminacion', unidad_compra: 'unidad', unidad_consumo: 'pieza', medida: '', factor: 1, merma_pct: 0, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'tubular-1', nombre: 'Tubular 1" calibre 18', familia: 'estructura', unidad_compra: 'unidad', unidad_consumo: 'cm', medida: 'tramo de 6 m', factor: 600, merma_pct: 0.08, largo_cm: 600, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'remache-18', nombre: 'Remache 1/8"', familia: 'herraje', unidad_compra: 'caja', unidad_consumo: 'pieza', medida: 'caja de 500', factor: 500, merma_pct: 0.03, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'pija-taquete', nombre: 'Taquete + pija 1/4 × 2"', familia: 'herraje', unidad_compra: 'bolsa', unidad_consumo: 'pieza', medida: 'bolsa de 100 juegos', factor: 100, merma_pct: 0.03, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'separador-20', nombre: 'Separador inox 20 mm', familia: 'herraje', unidad_compra: 'bolsa', unidad_consumo: 'pieza', medida: 'bolsa de 50', factor: 50, merma_pct: 0.03, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 0, fraccionable: false },
  { id: 'silicon', nombre: 'Silicón estructural', familia: 'consumible', unidad_compra: 'unidad', unidad_consumo: 'm', medida: 'cartucho', factor: 12, merma_pct: 0, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 1, fraccionable: false },
  { id: 'solvente', nombre: 'Limpiador / solvente', familia: 'consumible', unidad_compra: 'litro', unidad_consumo: 'm2', medida: '', factor: 25, merma_pct: 0, largo_cm: null, ancho_cm: null, min_compra: 1, min_stock: 2, fraccionable: true },
];

const ORDEN = MAT_BASE.reduce((m, x, i) => { m[x.id] = i; return m; }, {});
const MAPA_BASE = MAT_BASE.reduce((m, x) => { m[x.id] = x; return m; }, {});

/** Las 18 constantes de §6.1. Su derivación completa vive en datos/semilla.json; aquí solo
 *  el número, para que una fórmula nunca tenga que multiplicar por `undefined`. */
const CTS_BASE = {
  K_ANCHO_CAJA: 0.75, K_PERIM_recta: 4.0, K_PERIM_cursiva: 4.8, K_PERIM_compleja: 5.6,
  K_AREA_RECORTE: 0.95, APROV_NESTING_simple: 0.80, APROV_NESTING_irregular: 0.72,
  APROV_TIRAS: 0.90, PROF_CANTO_CM: 5.0, PROF_CAJA_CM: 15.0, MOD_POR_M2: 45,
  MOD_POR_M2_CAJA: 30, W_MODULO: 0.72, CAP_FUENTE_W: 60, DERATE_FUENTE: 0.80,
  TRAVESANO_CM: 60, REMACHE_CM: 15, SEPARADORES_LETRA: 4,
  /* Las dos de tiempo, que usa la ventana de taller (datos/taller.js). */
  PLAZO_COLCHON_DIAS: 1, PLAZO_PROVEEDOR_DIAS: 3,
};

const VERSION_BASE = 'c-2026-08';

/* Rangos de cordura de las constantes que, mal escritas, no fallan: rinden. Un
   aprovechamiento de 8 en vez de 0.8 divide el material por diez y la lista de compra
   sigue viéndose razonable hasta el día del corte. */
const LIMITES = {
  K_ANCHO_CAJA: [0.2, 2], K_PERIM_recta: [1, 20], K_PERIM_cursiva: [1, 20],
  K_PERIM_compleja: [1, 20], K_AREA_RECORTE: [0.2, 1],
  APROV_NESTING_simple: [0.1, 1], APROV_NESTING_irregular: [0.1, 1], APROV_TIRAS: [0.1, 1],
  PROF_CANTO_CM: [1, 60], PROF_CAJA_CM: [3, 80], MOD_POR_M2: [5, 400],
  MOD_POR_M2_CAJA: [5, 400], W_MODULO: [0.05, 20], CAP_FUENTE_W: [10, 600],
  DERATE_FUENTE: [0.3, 1], TRAVESANO_CM: [10, 300], REMACHE_CM: [3, 100],
  SEPARADORES_LETRA: [1, 20],
  PLAZO_COLCHON_DIAS: [0, 7], PLAZO_PROVEEDOR_DIAS: [0, 30],
};

/* ============================================================================
   Formato de números para la fórmula.

   Se formatea a mano y no con toLocaleString('es-MX') a propósito: esta cadena se compara
   en las pruebas y se lee en una orden de trabajo impresa, así que no puede depender de
   qué tanto ICU trajo el navegador ni del idioma del sistema.
   ============================================================================ */

function num(x, dec = 2) {
  const v = Number(x);
  if (!isFinite(v)) return '?';
  const neg = v < 0;
  const s = Math.abs(v).toFixed(dec);
  let [ent, fr] = s.split('.');
  if (fr) fr = fr.replace(/0+$/, '');
  ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '−' : '') + ent + (fr ? '.' + fr : '');
}
/** Los factores de 0 a 1 se escriben con dos decimales siempre: «0.90» se lee como
 *  proporción, «0.9» se lee como un número al que le faltó algo. */
const prop = x => (Number(x) || 0).toFixed(2);
/** Y un multiplicador entero lleva un decimal: «4.0 × altura», no «4 × altura». */
const mult = x => (Number.isInteger(Number(x)) ? Number(x).toFixed(1) : String(Number(x)));

const nn = (x, def = 0) => { const v = Number(x); return isFinite(v) ? v : def; };

/* ============================================================================
   Catálogo — lecturas y alta
   ============================================================================ */

/** @returns {Promise<Object[]>} vacío si la base no abrió. NUNCA lanza. */
export async function listarMateriales(filtro = {}) {
  const f = filtro || {};
  let filas = await DB.listar('materiales');
  if (!Array.isArray(filas)) filas = [];
  if (f.familia) filas = filas.filter(m => m.familia === f.familia);
  if (f.activo !== undefined) filas = filas.filter(m => !!m.activo === !!f.activo);
  return filas.sort((a, b) => {
    const oa = ORDEN[a.id], ob = ORDEN[b.id];
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });
}

/** @returns {Promise<Object|null>} */
export async function obtenerMaterial(id) {
  if (!id) return null;
  return await DB.obtener('materiales', String(id));
}

/**
 * Valida y guarda una fila del catálogo.
 * `factor_origen` es obligatorio y no vacío, y no es burocracia: es la única defensa
 * auditable contra un número inventado que en tres meses nadie puede rastrear. El día que
 * el corte salga corto, la pregunta va a ser «¿de dónde salió el 2.9768?».
 */
export async function guardarMaterial(mat) {
  if (!mat || typeof mat !== 'object') return mal('DATO_INVALIDO', 'No llegó ningún material que guardar.');

  const id = String(mat.id || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!id) return mal('DATO_INVALIDO', 'Ponle una clave corta al material, como «acr-3mm».');
  const nombre = String(mat.nombre || '').trim();
  if (!nombre) return mal('DATO_INVALIDO', 'Ponle el nombre con el que lo pides al proveedor.');

  const unidad_compra = String(mat.unidad_compra || '').trim();
  if (!UNIDADES_COMPRA.includes(unidad_compra)) {
    return mal('DATO_INVALIDO', 'La unidad de compra tiene que ser una de estas seis: ' +
      UNIDADES_COMPRA.join(', ') + '.');
  }
  const unidad_consumo = normConsumo(mat.unidad_consumo);
  if (!UNIDADES_CONSUMO.includes(unidad_consumo)) {
    return mal('DATO_INVALIDO', 'La unidad de consumo tiene que ser m2, m, cm, pieza o litro.');
  }

  const factor = Number(mat.factor);
  if (!isFinite(factor) || factor <= 0) {
    return mal('DATO_INVALIDO', 'El factor tiene que ser mayor que cero: dice cuántos ' +
      (U_TXT[unidad_consumo] || unidad_consumo) + ' rinde una ' + (UC_TXT[unidad_compra] || unidad_compra) + '.');
  }
  const factor_origen = String(mat.factor_origen || '').trim();
  if (!factor_origen) {
    return mal('DATO_INVALIDO', 'Escribe de dónde salió el factor ' + num(factor, 4) +
      '. Sin eso, en tres meses nadie va a saber si el número está bien.');
  }

  const merma_pct = nn(mat.merma_pct, 0);
  if (merma_pct < 0 || merma_pct >= 1) {
    return mal('DATO_INVALIDO', 'La merma va entre 0 y 0.99: 0.25 significa que se echa a perder el 25 %.');
  }
  const min_compra = nn(mat.min_compra, 1);
  if (min_compra < 0) return mal('DATO_INVALIDO', 'El mínimo de compra no puede ser negativo.');
  const min_stock = nn(mat.min_stock, 0);
  if (min_stock < 0) return mal('DATO_INVALIDO', 'El mínimo de almacén no puede ser negativo.');
  const costo = (mat.costo_compra === null || mat.costo_compra === undefined || mat.costo_compra === '')
    ? null : Number(mat.costo_compra);
  if (costo !== null && (!isFinite(costo) || costo < 0)) {
    return mal('DATO_INVALIDO', 'El costo se deja vacío o se pone en pesos. Sin costos la plataforma sigue dando cantidades.');
  }

  const fila = {
    id, empresa_id: mat.empresa_id || Prefs.empresa(), nombre,
    familia: String(mat.familia || 'sin_familia').trim(),
    unidad_consumo, unidad_compra,
    medida: String(mat.medida || '').trim(),
    factor, factor_origen,
    largo_cm: mat.largo_cm === null || mat.largo_cm === undefined || mat.largo_cm === '' ? null : nn(mat.largo_cm, null),
    ancho_cm: mat.ancho_cm === null || mat.ancho_cm === undefined || mat.ancho_cm === '' ? null : nn(mat.ancho_cm, null),
    espesor: String(mat.espesor || '').trim(),
    merma_pct, fraccionable: !!mat.fraccionable, min_compra, min_stock,
    costo_compra: costo,
    proveedor: String(mat.proveedor || '').trim(),
    tel_proveedor: String(mat.tel_proveedor || '').trim(),
    activo: mat.activo === undefined ? true : !!mat.activo,
    sync: 0,
  };
  const r = await DB.poner('materiales', fila);
  if (r.ok) await encolar('actualizar', 'materiales', r.valor);
  return r;
}

/* ============================================================================
   Constantes
   ============================================================================ */

/** Las claves que empiezan con `_` no son constantes de taller: son el marcador de
 *  sembrado. Viven en el mismo almacén porque §4.2 congela las nueve claves de
 *  localStorage y ésta no es una de ellas. */
const esInterna = clave => String(clave || '').startsWith('_');

/**
 * @returns {Promise<Object>} {CLAVE: valor}, siempre con las 18. Una constante que falta
 * no puede volverse `NaN` a la mitad de una fórmula: se cae al valor del repositorio y la
 * pantalla de constantes muestra que nunca se confirmó.
 */
export async function constantes() {
  const filas = await DB.listar('constantes');
  const out = { ...CTS_BASE };
  for (const c of (filas || [])) {
    if (!c || esInterna(c.clave)) continue;
    const v = Number(c.valor);
    if (isFinite(v)) out[c.clave] = v;
  }
  return out;
}

/* La versión de las constantes se congela en cada requerimiento por la misma razón por la
   que el cotizador congela `_lt`: para poder contestar «¿con qué números se calculó esto?».
   Por eso la versión lleva la huella de los VALORES y no solo la etiqueta del mes: una
   versión que no cambia cuando alguien mueve la merma es peor que no tener versión,
   porque miente con formato de dato. */
function huellaValores(cts) {
  const txt = Object.keys(cts).sort().map(k => k + '=' + cts[k]).join(';');
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 5);
}

/** @returns {Promise<string>} 'c-2026-08.4kz1' */
export async function versionConstantes() {
  const filas = await DB.listar('constantes');
  let base = VERSION_BASE;
  for (const c of (filas || [])) {
    if (c && !esInterna(c.clave) && c.version) { base = String(c.version); break; }
  }
  return base + '.' + huellaValores(await constantes());
}

/**
 * Guarda una constante. `nota` es opcional a propósito: el bucle de calibración promete
 * «un toque» y pedir una justificación escrita para aceptar lo que el propio sistema
 * propuso convertiría ese toque en un formulario. Cuando no viene nota, se escribe una que
 * dice qué cambió, cuándo y quién: el rastro existe igual.
 */
export async function guardarConstante(clave, valor, nota) {
  const k = String(clave || '').trim();
  if (!k || esInterna(k)) return mal('DATO_INVALIDO', 'Falta el nombre de la constante.');
  if (CTS_BASE[k] === undefined) {
    return mal('DATO_INVALIDO', 'No existe la constante «' + k + '». Revisa el nombre: las que hay salen en la pantalla de constantes.');
  }
  const v = Number(valor);
  if (!isFinite(v)) return mal('DATO_INVALIDO', 'Escribe un número para ' + k + '.');
  const lim = LIMITES[k];
  if (lim && (v < lim[0] || v > lim[1])) {
    return mal('DATO_INVALIDO', k + ' va entre ' + num(lim[0], 2) + ' y ' + num(lim[1], 2) +
      '. Escribiste ' + num(v, 4) + ': con ese número el material calculado se iría por un orden de magnitud.');
  }

  const previo = await DB.obtener('constantes', k);
  const antes = previo && isFinite(Number(previo.valor)) ? Number(previo.valor) : CTS_BASE[k];
  const texto = String(nota || '').trim() || (
    Math.abs(antes - v) < 1e-12
      ? (previo && previo.nota) || 'Confirmada sin cambio.'
      : num(antes, 4) + ' → ' + num(v, 4) + ', cambiada por ' + Prefs.sello() + '. Ajuste sin razón escrita.'
  );

  const fila = {
    clave: k, valor: v,
    unidad: (previo && previo.unidad) || '',
    nota: texto,
    version: (previo && previo.version) || VERSION_BASE,
    actualizado_por: Prefs.sello(),
  };
  const r = await DB.poner('constantes', fila);
  if (r.ok) await encolar('actualizar', 'constantes', r.valor);
  return r;
}

/* ============================================================================
   Siembra
   ============================================================================ */

/* La ruta se resuelve contra `import.meta.url` y no contra el documento: `plataforma.html`
   está en la raíz hoy, pero un `fetch('../../datos/semilla.json')` se resuelve contra la
   URL de la PÁGINA, no contra la del módulo, así que el día que la plataforma se sirva
   desde un subdirectorio la siembra se rompería sin decir por qué. */
const RUTA_SEMILLA = new URL('../../datos/semilla.json', import.meta.url);

async function leerSemilla() {
  try {
    const res = await fetch(RUTA_SEMILLA, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j || !Array.isArray(j.materiales) || !Array.isArray(j.constantes)) throw new Error('forma');
    return { ...j, respaldo: false };
  } catch (_) {
    /* Sin semilla la plataforma no se queda muda: siembra los valores del código y lo dice
       en cada `factor_origen`. Es preferible un catálogo que se declara «de respaldo» a una
       pantalla de material vacía el primer día en el taller, sin señal. */
    return {
      version: 's-respaldo',
      materiales: MAT_BASE.map(m => ({ ...m, merma: m.merma_pct, factor_origen: ORIGEN_RESPALDO })),
      constantes: Object.keys(CTS_BASE).map(k => ({
        clave: k, valor: CTS_BASE[k], unidad: '',
        origen: 'Valor del repositorio. Su derivación completa está en datos/semilla.json, que no se pudo leer.',
      })),
      respaldo: true,
    };
  }
}

function filaDesdeSemilla(s) {
  const um = normConsumo(s.unidad_consumo);
  return {
    id: String(s.id), empresa_id: Prefs.empresa(), nombre: String(s.nombre || s.id),
    familia: String(s.familia || 'sin_familia'),
    unidad_consumo: UNIDADES_CONSUMO.includes(um) ? um : 'pieza',
    unidad_compra: UNIDADES_COMPRA.includes(s.unidad_compra) ? s.unidad_compra : 'unidad',
    medida: String(s.medida || ''),
    factor: nn(s.factor, 1),
    factor_origen: String(s.factor_origen || ORIGEN_RESPALDO),
    largo_cm: s.largo_cm === null || s.largo_cm === undefined ? null : nn(s.largo_cm, null),
    ancho_cm: s.ancho_cm === null || s.ancho_cm === undefined ? null : nn(s.ancho_cm, null),
    espesor: String(s.espesor || ''),
    /* La semilla escribe `merma`; el esquema §4.6 dice `merma_pct`. Se aceptan las dos y se
       guarda la del esquema: es la que lee la conversión a unidad de compra. */
    merma_pct: nn(s.merma_pct !== undefined ? s.merma_pct : s.merma, 0),
    fraccionable: !!s.fraccionable,
    min_compra: nn(s.min_compra, 1), min_stock: nn(s.min_stock, 0),
    costo_compra: s.costo_compra === undefined ? null : s.costo_compra,
    proveedor: String(s.proveedor || ''), tel_proveedor: String(s.tel_proveedor || ''),
    activo: s.activo === undefined ? true : !!s.activo, sync: 0,
  };
}

/**
 * Siembra catálogo y constantes. IDEMPOTENTE y NO PISA lo que el usuario ya editó.
 *
 * Y no resucita lo que alguien borró: sembrar lo que nunca nació es ayudar, revivir lo que
 * alguien acaba de borrar es no hacerle caso. Por eso se lleva la lista de lo ya sembrado
 * en `_semilla` y no se decide solo por «¿está en la base?»: sin esa lista, borrar el
 * alucobond del catálogo lo hacía reaparecer en la siguiente apertura, para siempre.
 */
export async function sembrar() {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  const marca = await DB.obtener('constantes', '_semilla') || {};
  const yaMat = new Set(Array.isArray(marca.ids) ? marca.ids : []);
  const yaCte = new Set(Array.isArray(marca.claves) ? marca.claves : []);

  const [mats, ctes] = await Promise.all([DB.listar('materiales'), DB.listar('constantes')]);
  for (const m of (mats || [])) yaMat.add(m.id);
  for (const c of (ctes || [])) if (!esInterna(c.clave)) yaCte.add(c.clave);

  const s = await leerSemilla();

  const nuevosMat = (s.materiales || [])
    .filter(m => m && m.id && !yaMat.has(String(m.id)))
    .map(filaDesdeSemilla);

  const nuevasCte = (s.constantes || [])
    .filter(c => c && c.clave && !esInterna(c.clave) && !yaCte.has(String(c.clave)))
    .map(c => ({
      clave: String(c.clave), valor: nn(c.valor, 0), unidad: String(c.unidad || ''),
      nota: String(c.origen || c.nota || ''),
      version: String(s.version_constantes || VERSION_BASE),
      actualizado_por: '',
    }));

  if (nuevosMat.length) {
    const r = await DB.ponerVarios('materiales', nuevosMat);
    if (!r.ok) return r;
  }
  if (nuevasCte.length) {
    const r = await DB.ponerVarios('constantes', nuevasCte);
    if (!r.ok) return r;
  }

  const rMarca = await DB.poner('constantes', {
    clave: '_semilla', valor: 0,
    nota: 'Lo que ya se sembró alguna vez, para no revivir lo que alguien borró a propósito.' +
      (s.respaldo ? ' Sembrado con los valores del código: datos/semilla.json no se pudo leer.' : ''),
    version: String(s.version || 's-2026-08'),
    ids: [...yaMat, ...nuevosMat.map(m => m.id)],
    claves: [...yaCte, ...nuevasCte.map(c => c.clave)],
  });
  if (!rMarca.ok) return rMarca;

  return ok({ materiales: nuevosMat.length, constantes: nuevasCte.length, respaldo: !!s.respaldo });
}

/* ============================================================================
   EL NÚCLEO: derivar()

   PURA. Sin DOM, sin red, sin IndexedDB, sin `Date.now()`. Se prueba sola en node y por eso
   se puede confiar en ella: es el único cálculo del sistema cuyo error se paga en pesos y
   en un viaje al proveedor a media mañana.
   ============================================================================ */

const PEOR = { exacta: 0, estimada: 1, requiere_dato: 2 };
const peorDe = (a, b) => (PEOR[b] > PEOR[a] ? b : a);

/**
 * @param {Array<Object>} items   partidas (historial.items o Q.items)
 * @param {Object} cts            el objeto de constantes()
 * @param {Object} cat            catalogos() del cotizador
 * @param {Object} [mats]         mapa {id: materialDeLaBase}. Si no viene, la tabla del
 *                                código: así `derivar()` sigue siendo pura y probable.
 * @returns {{lineas:Array<Object>, sinMaterial:number[], avisos:string[]}}
 */
export function derivar(items, cts, cat, mats) {
  const C = { ...CTS_BASE, ...(cts || {}) };
  const K = cat || catalogos();
  const M = mats && Object.keys(mats).length ? mats : MAPA_BASE;
  const lista = Array.isArray(items) ? items : [];

  const acum = new Map();
  const sinMaterial = [];
  const avisos = [];

  /** Registra consumo de un material. `expr` es la cuenta con los números puestos: se
   *  pinta tal cual, porque un número que no se puede auditar no se corrige nunca. */
  const pedir = (materialId, consumo, expr, it, conf, requiere) => {
    const c = nn(consumo, 0);
    const cf = conf || 'estimada';
    if (c <= 0 && cf !== 'requiere_dato') return;   // luz:false no pide LED, y no es un error
    let a = acum.get(materialId);
    if (!a) {
      a = { consumo: 0, partes: [], partidas: [], confianza: 'exacta', requiere: [] };
      acum.set(materialId, a);
    }
    a.consumo += c;
    a.partes.push({ id: it && it.id, expr });
    if (it && it.id !== undefined && !a.partidas.includes(it.id)) a.partidas.push(it.id);
    a.confianza = peorDe(a.confianza, cf);
    const rq = String(requiere || '').trim();
    if (rq && !a.requiere.includes(rq)) a.requiere.push(rq);
  };

  /** ¿Cabe la pieza en la hoja? Se compara la DIMENSIÓN MAYOR contra el largo del material,
   *  no el área: dos piezas de 0.4 m² caben en una lámina de 2.97 m² y una de 2.95 m de
   *  largo no cabe en una hoja de 2.44 m, por más que el área alcance de sobra. */
  const revisarCorte = (materialId, mayorCm, it) => {
    const m = M[materialId];
    if (!m || !m.largo_cm || !(mayorCm > 0)) return;
    if (mayorCm <= nn(m.largo_cm, 0)) return;
    avisos.push('Partida ' + etiqueta(it) + ': la pieza mide ' + num(mayorCm / 100, 2) +
      ' m y ' + (m.nombre || materialId) + ' mide ' + num(nn(m.largo_cm, 0) / 100, 2) +
      ' m: hay junta, o hay que pedir hoja más larga (el mercado tiene de 3.05 m).');
  };

  for (const it of lista) {
    if (!it || typeof it !== 'object') continue;
    const tipo = String(it.tipo || '').trim();

    /* Una partida oculta del PDF se cobra agrupada como «Conceptos adicionales» y se
       fabrica igual. Se dice, porque quien lea la orden de trabajo no la va a ver en la
       cotización que trae en la mano y va a pensar que sobra material. */
    if (it.showInPdf === false && tipo !== 'manual') {
      avisos.push('Partida ' + etiqueta(it) + ' no sale en el PDF del cliente, pero se fabrica: su material está contado.');
    }

    if (tipo === 'letras')        derLetras(it, C, pedir, revisarCorte, avisos);
    else if (tipo === 'recorte')  derRecorte(it, C, pedir, revisarCorte, avisos);
    else if (tipo === 'bastidor') derBastidor(it, C, pedir, revisarCorte, avisos);
    else if (tipo === 'caja')     derCaja(it, C, K, pedir, revisarCorte, avisos);
    else {
      /* Manual es «instalación, viáticos, rotulación vehicular u otros» según el propio
         PROMPT_IA (index.html:5279). Cero material, y se dice con palabras en vez de
         desaparecer de la pantalla. */
      if (it.id !== undefined) sinMaterial.push(it.id);
    }
  }

  const lineas = [];
  for (const [materialId, a] of acum) {
    lineas.push(armarLinea(materialId, a, M));
  }
  lineas.sort((x, y) => {
    const ox = ORDEN[x.material_id], oy = ORDEN[y.material_id];
    return (ox === undefined ? 99 : ox) - (oy === undefined ? 99 : oy);
  });

  return { lineas, sinMaterial, avisos };
}

const etiqueta = it => (it && it.id !== undefined ? String(it.id) : '?');

/* ----- Conversión a unidad de compra (§6.4) -----

   consumo_con_merma = consumo / (1 - merma)
   cantidad_compra   = consumo_con_merma / factor      FRACCIONARIA, y se guarda así.

   EL REDONDEO NO VIVE AQUÍ. Vive en `stock.listaCompra()`, que agrega TODOS los proyectos
   abiertos ANTES de redondear. Dos proyectos que piden 0.484 y 0.700 láminas con 0.5 en el
   almacén son UNA lámina agregada y DOS redondeando por proyecto, y la segunda cifra es
   exactamente cómo un almacén se llena de sobrantes hasta que nadie vuelve a creerle al
   sistema. Redondear aquí sería cómodo —la línea se vería «limpia»— y ese es todo el
   argumento que tiene a favor. */
function armarLinea(materialId, a, M) {
  const m = M[materialId] || MAPA_BASE[materialId] || null;
  const uc = normConsumo(m ? m.unidad_consumo : 'pieza') || 'pieza';
  const ucompra = (m && m.unidad_compra) || 'unidad';
  const merma = m ? nn(m.merma_pct, 0) : 0;
  const factor = m ? nn(m.factor, 0) : 0;

  let confianza = a.confianza;
  const requiere = a.requiere.slice();

  const uT = U_TXT[uc] || uc;
  let formula = a.partes.length === 1
    ? a.partes[0].expr
    : a.partes.map(p => 'P' + p.id + ': ' + p.expr).join('  +  ') + '  =  ' + num(a.consumo) + ' ' + uT;

  let conMerma = a.consumo;
  if (merma > 0 && merma < 1) {
    conMerma = a.consumo / (1 - merma);
    formula += ' ÷ ' + prop(1 - merma) + ' merma = ' + num(conMerma) + ' ' + uT;
  }

  let compra = 0;
  if (factor > 0) {
    compra = conMerma / factor;
    if (factor !== 1) {
      formula += ' ÷ ' + num(factor, 4) + ' ' + uT + '/' + (UC_TXT[ucompra] || ucompra) +
        ' = ' + num(compra);
    }
  } else {
    /* Sin factor no hay traducción posible de consumo a compra, y devolver 0 sería decir
       «no hace falta comprar nada». Se nombra el número que falta. */
    confianza = 'requiere_dato';
    const falta = 'el factor de ' + ((m && m.nombre) || materialId) + ': cuántos ' + uT +
      ' rinde una ' + (UC_TXT[ucompra] || ucompra);
    if (!requiere.includes(falta)) requiere.push(falta);
    formula += ' ÷ (falta el factor)';
  }

  return {
    material_id: materialId,
    cantidad_consumo: redondearCalculo(conMerma),
    unidad_consumo: uc,
    cantidad_compra: redondearCalculo(compra),
    unidad_compra: ucompra,
    partidas: a.partidas.slice(),
    formula,
    confianza,
    requiere: requiere.join(' · '),
  };
}

/* Seis decimales no es redondeo de compra: es cortar la basura binaria de 0.30000000000000004
   para que dos dispositivos que calculan lo mismo guarden la misma cifra y el sync no vea un
   cambio donde no hubo ninguno. */
const redondearCalculo = x => Math.round((nn(x, 0) + Number.EPSILON) * 1e6) / 1e6;

/* ============================================================================
   Receta por tipo (§6.3)
   ============================================================================ */

function derLetras(it, C, pedir, revisarCorte, avisos) {
  const altura = nn(it.altura, 0);
  const n = nn(it.n, 0);
  const comp = String(it.comp || 'recta');
  const material = String(it.material || '');
  const ilum = (it.ilumTipo || 'fria') === 'calida' ? 'led-3000' : 'led-6500';

  /* Sin altura o sin cuántas son no hay receta: se pide UNA línea que nombre el dato que
     falta y se para ahí. Antes salían seis líneas en cero diciendo todas lo mismo, y una
     pantalla que repite seis veces la misma falta se lee como seis problemas. */
  let conf = 'estimada';
  let requiere = '';
  let faltaBase = false;
  if (!(altura > 0)) { conf = 'requiere_dato'; faltaBase = true; requiere = 'la altura de las letras de la partida ' + etiqueta(it) + ', en cm'; }
  else if (!(n > 0)) { conf = 'requiere_dato'; faltaBase = true; requiere = 'cuántas letras son en la partida ' + etiqueta(it); }

  /* El ancho. El escalador YA mide el ancho y lo tira: `scAgregarPartida` usa solo `m.cm` y
     lo escribe en `it.altura`, sin importar si el corchete era horizontal. Con
     `it.anchoMedido` presente el ancho es un dato y la confianza sube sin preguntarle nada
     a nadie; sin él, sale del factor de caja y hay que decirlo. */
  const medido = nn(it.anchoMedido, 0) > 0 && n > 0;
  const W = medido ? nn(it.anchoMedido, 0) / n : altura * nn(C.K_ANCHO_CAJA, 0.75);
  const confAncho = conf === 'requiere_dato' ? conf : (medido ? 'exacta' : 'estimada');

  /* El cordón de plausibilidad. Si el frente del anuncio pasa de 12 m, lo más probable es
     que el número que se capturó como altura fuera el ANCHO del letrero: 8 letras de 300 cm
     de alto son un edificio, y 300 cm de ancho total son un letrero normal. Es una
     confirmación, no un bloqueo, y solo aparece en las partidas raras. */
  let confPlaus = confAncho, reqPlaus = requiere;
  if (!medido && altura > 0 && n > 0) {
    const frente = altura * nn(C.K_ANCHO_CAJA, 0.75) * n;
    if (frente > TOPE_FRENTE_CM) {
      confPlaus = 'requiere_dato';
      reqPlaus = '¿los ' + num(altura, 0) + ' cm de la partida ' + etiqueta(it) +
        ' son de alto o de ancho? Con ' + num(n, 0) + ' letras serían ' + num(frente / 100, 1) +
        ' m de frente de anuncio';
    }
  }

  const caja_m2 = altura * W * n / 10000;
  const aprov = comp === 'recta' ? nn(C.APROV_NESTING_simple, 0.8) : nn(C.APROV_NESTING_irregular, 0.72);
  const cara_m2 = aprov > 0 ? caja_m2 / aprov : 0;

  /* Cara de acrílico SIEMPRE, y sobre el área de CAJA ENVOLVENTE, no sobre el área de tinta
     del glifo: el hueco de una «O» no se reutiliza con confianza. Calcular sobre el trazo
     sub-compra acrílico de forma sistemática cerca de un 40 %, y ninguna merma razonable
     cierra ese hueco. El grosor sale de la altura: arriba de 40 cm el de 3 mm se pandea. */
  const caraId = altura > 40 ? 'acr-6mm' : 'acr-3mm';
  const exprCara = num(altura, 0) + 'cm alto × ' + num(W) + 'cm ancho (' +
    (medido ? 'medido' : prop(nn(C.K_ANCHO_CAJA, 0.75)) + ' de la altura') + ') × ' + num(n, 0) +
    ' = ' + num(caja_m2) + ' m² ÷ ' + prop(aprov) + ' aprov = ' + num(cara_m2) + ' m²';
  pedir(caraId, cara_m2, exprCara, it, confPlaus, reqPlaus);
  revisarCorte(caraId, Math.max(altura, W), it);
  if (faltaBase) return;

  /* El vinil de «Acrílico + Vinil» va sobre la cara ya cortada: misma superficie. */
  if (material === 'acr-vinil') {
    pedir('vinil-corte', cara_m2, exprCara + ' de vinil sobre la cara', it, confPlaus, reqPlaus);
  }

  /* Canto. `comp` es complejidad de CORTE: más horas de CNC y cero material adicional; lo
     único que cambia es el aprovechamiento del nesting y el perímetro del contorno. */
  const kPerim = nn(C['K_PERIM_' + comp], nn(C.K_PERIM_recta, 4));
  const perim_cm = kPerim * altura * n;
  const canto_m = nn(C.APROV_TIRAS, 0.9) > 0 ? (perim_cm / 100) / nn(C.APROV_TIRAS, 0.9) : 0;
  const cantoId = CANTO_POR_MAT[material] || '';
  if (cantoId) {
    const exprCanto = mult(kPerim) + ' × ' + num(altura, 0) + 'cm × ' + num(n, 0) + ' = ' +
      num(perim_cm, 0) + ' cm = ' + num(perim_cm / 100) + ' m ÷ ' + prop(nn(C.APROV_TIRAS, 0.9)) +
      ' aprov = ' + num(canto_m) + ' m';
    pedir(cantoId, canto_m, exprCanto, it, conf, requiere);
  } else {
    avisos.push('Partida ' + etiqueta(it) + ': no dice de qué material son las letras, así que no se puede pedir el canto. Elige el material en la cotización y recalcula.');
  }

  /* LED. `luz:false` es CERO módulos y CERO fuentes: el `p *= 0.8` del cotizador es un
     descuento de precio, no menos luz. Y `ilumTipo` elige la FILA del catálogo, no la
     cantidad: son dos claves distintas y hasta hoy nadie sabía cuál pedir hasta abrir
     la caja en el taller. */
  if (it.luz) {
    const mod = Math.ceil(caja_m2 * nn(C.MOD_POR_M2, 45));
    const exprMod = num(caja_m2) + ' m² × ' + num(nn(C.MOD_POR_M2, 45), 0) + ' mód/m² = ' +
      num(mod, 0) + ' pieza';
    pedir(ilum, mod, exprMod, it, confPlaus, reqPlaus);

    const utiles = nn(C.CAP_FUENTE_W, 60) * nn(C.DERATE_FUENTE, 0.8);
    const fte = utiles > 0 ? Math.ceil(mod * nn(C.W_MODULO, 0.72) / utiles) : 0;
    const exprFte = num(mod, 0) + ' mód × ' + num(nn(C.W_MODULO, 0.72)) + ' W = ' +
      num(mod * nn(C.W_MODULO, 0.72)) + ' W ÷ ' + num(utiles) + ' W útiles (' +
      num(nn(C.CAP_FUENTE_W, 60), 0) + ' × ' + prop(nn(C.DERATE_FUENTE, 0.8)) + ') = ' +
      num(fte, 0) + ' pieza';
    pedir('fuente-60', fte, exprFte, it, confPlaus, reqPlaus);
  }

  const sep = nn(C.SEPARADORES_LETRA, 4) * n;
  pedir('separador-20', sep, num(nn(C.SEPARADORES_LETRA, 4), 0) + ' pza/letra × ' +
    num(n, 0) + ' letras = ' + num(sep, 0) + ' pieza', it, conf, requiere);

  pedir('silicon', perim_cm / 100, num(perim_cm, 0) + ' cm de contorno = ' +
    num(perim_cm / 100) + ' m de cordón', it, conf, requiere);

  /* El solvente sale de la receta aunque §6.7 avise que derivar 0.02 L es precisión falsa.
     Las dos cosas son verdad: la cuenta se hace porque está en la receta y porque tener la
     cifra a la vista es gratis, y quien de verdad compra solvente es el mínimo de
     reposición de `stock.bajoMinimo()`, no esta línea. */
  pedir('solvente', cara_m2, num(cara_m2) + ' m² a limpiar', it, conf, requiere);
}

function derRecorte(it, C, pedir, revisarCorte, avisos) {
  const altura = nn(it.altura, 0);
  const n = nn(it.n, 0);
  const acab = String(it.acab || '');
  const ilum = (it.ilumTipo || 'fria') === 'calida' ? 'led-3000' : 'led-6500';

  let conf = 'estimada', requiere = '', faltaBase = false;
  if (!(altura > 0)) { conf = 'requiere_dato'; faltaBase = true; requiere = 'la altura de las piezas de la partida ' + etiqueta(it) + ', en cm'; }
  else if (!(n > 0)) { conf = 'requiere_dato'; faltaBase = true; requiere = 'cuántas piezas son en la partida ' + etiqueta(it); }
  else if (altura * n > TOPE_FRENTE_CM) {
    /* El mismo cordón que en letras y por el mismo motivo: el corchete del escalador no
       distingue alto de ancho, y una pieza de recorte llena casi todo su cuadro, así que su
       ancho es del orden de su altura. */
    conf = 'requiere_dato';
    requiere = '¿los ' + num(altura, 0) + ' cm de la partida ' + etiqueta(it) +
      ' son de alto o de ancho? Con ' + num(n, 0) + ' piezas serían ' + num(altura * n / 100, 1) + ' m de frente';
  }
  if (!acab) {
    avisos.push('Partida ' + etiqueta(it) + ': falta el acabado del recorte (sencillo, vinil o sándwich). Se calculó como sencillo.');
  }
  if (it.recComp) {
    avisos.push('Partida ' + etiqueta(it) + ': el recorte lleva complejidad. Son más horas de corte y cero material extra.');
  }

  const aprov = nn(C.APROV_NESTING_irregular, 0.72);
  const caja_m2 = nn(C.K_AREA_RECORTE, 0.95) * altura * altura * n / 10000;
  const base_m2 = aprov > 0 ? caja_m2 / aprov : 0;
  /* El cuadro de una pieza de recorte se supone cuadrado —una silueta llena casi todo su
     cuadro envolvente— y el supuesto va declarado en la cuenta: «0.95 × 30cm × 30cm × 4». */
  const exprBase = prop(nn(C.K_AREA_RECORTE, 0.95)) + ' × ' + num(altura, 0) + 'cm × ' +
    num(altura, 0) + 'cm × ' + num(n, 0) + ' = ' + num(caja_m2) + ' m² ÷ ' + prop(aprov) +
    ' aprov = ' + num(base_m2) + ' m²';

  if (acab === 'vinil') {
    /* Rotulación de vinil: no hay acrílico. Cobrarlo como recorte y pedir acrílico sería
       comprar una lámina para pegar una calca. */
    pedir('vinil-corte', base_m2, exprBase, it, conf, requiere);
    revisarCorte('vinil-corte', altura, it);
  } else {
    const capas = acab === 'sandwich' ? 2 : 1;
    const acrId = altura > 40 ? 'acr-6mm' : 'acr-3mm';
    const acr_m2 = base_m2 * capas;
    pedir(acrId, acr_m2, exprBase + (capas === 2 ? ' × 2 caras del sándwich = ' + num(acr_m2) + ' m²' : ''),
      it, conf, requiere);
    revisarCorte(acrId, altura, it);
  }

  if (acab === 'sandwich' && !faltaBase) {
    const mod = Math.ceil(caja_m2 * nn(C.MOD_POR_M2, 45));
    pedir(ilum, mod, num(caja_m2) + ' m² × ' + num(nn(C.MOD_POR_M2, 45), 0) + ' mód/m² = ' +
      num(mod, 0) + ' pieza', it, conf, requiere);

    /* §6.3 escribe aquí «ceil(mod × 0.72 / 48)» con los números a mano. Se usan las
       constantes, que valen justo eso: si alguien cambia la capacidad de la fuente en la
       pantalla de constantes y este renglón siguiera con el 48 pegado, la pantalla estaría
       mintiendo sobre lo que el sistema hace. */
    const utiles = nn(C.CAP_FUENTE_W, 60) * nn(C.DERATE_FUENTE, 0.8);
    const fte = utiles > 0 ? Math.ceil(mod * nn(C.W_MODULO, 0.72) / utiles) : 0;
    pedir('fuente-60', fte, num(mod, 0) + ' mód × ' + num(nn(C.W_MODULO, 0.72)) + ' W ÷ ' +
      num(utiles) + ' W útiles = ' + num(fte, 0) + ' pieza', it, conf, requiere);

    const sep = 4 * n;
    pedir('separador-20', sep, '4 pza/pieza × ' + num(n, 0) + ' = ' + num(sep, 0) + ' pieza', it, conf, requiere);
  }
}

function derBastidor(it, C, pedir, revisarCorte, avisos) {
  const ancho = nn(it.ancho, 0), alto = nn(it.alto, 0);
  let conf = 'exacta', requiere = '', faltaBase = false;
  if (!(ancho > 0) || !(alto > 0)) {
    conf = 'requiere_dato'; faltaBase = true;
    requiere = 'el ancho y el alto del bastidor de la partida ' + etiqueta(it) + ', en cm';
  }

  /* ÁREA REAL, no la cobrada. El cotizador cobra `max(m2, 1)` en bastidor y en caja de luz:
     un bastidor de 0.6 m² se cobra como 1 m² y se fabrica con 0.6. Comprar por el área
     cobrada es comprar de más en cada trabajo chico del año. */
  const m2 = ancho * alto / 10000;
  const aprov = nn(C.APROV_NESTING_simple, 0.8);
  const panel = aprov > 0 ? m2 / aprov : 0;

  const panelId = it.bas === 'alucobond' ? 'alucobond' : 'lam-galv';
  if (!it.bas) {
    avisos.push('Partida ' + etiqueta(it) + ': no dice si el bastidor es de lámina o de alucobond. Se calculó con lámina galvanizada.');
  }
  pedir(panelId, panel, num(ancho, 0) + ' × ' + num(alto, 0) + ' cm = ' + num(m2) +
    ' m² ÷ ' + prop(aprov) + ' aprov = ' + num(panel) + ' m²', it, conf, requiere);
  revisarCorte(panelId, Math.max(ancho, alto), it);
  if (faltaBase) return;

  const perim = 2 * (ancho + alto);
  const trav = nn(C.TRAVESANO_CM, 60) > 0
    ? Math.floor(Math.max(ancho, alto) / nn(C.TRAVESANO_CM, 60)) * Math.min(ancho, alto) : 0;
  pedir('tubular-1', perim + trav, '2 × (' + num(ancho, 0) + ' + ' + num(alto, 0) + ') = ' +
    num(perim, 0) + ' cm de marco + ' + num(Math.floor(Math.max(ancho, alto) / nn(C.TRAVESANO_CM, 60)), 0) +
    ' travesaños × ' + num(Math.min(ancho, alto), 0) + ' cm = ' + num(perim + trav, 0) + ' cm',
    it, conf, requiere);

  const rem = nn(C.REMACHE_CM, 15) > 0 ? Math.ceil(perim / nn(C.REMACHE_CM, 15)) : 0;
  pedir('remache-18', rem, num(perim, 0) + ' cm ÷ ' + num(nn(C.REMACHE_CM, 15), 0) +
    ' cm por remache = ' + num(rem, 0) + ' pieza', it, conf, requiere);

  /* Seis pijas por m² de bastidor. No está en las 18 constantes de §6.1 y no se inventa una
     décimonovena por un número que nadie va a calibrar: va con su cuenta a la vista. */
  const pijas = Math.ceil(m2 * 6);
  pedir('pija-taquete', pijas, num(m2) + ' m² × 6 pijas/m² = ' + num(pijas, 0) + ' pieza', it, conf, requiere);
}

function derCaja(it, C, K, pedir, revisarCorte, avisos) {
  const ancho = nn(it.ancho, 0), alto = nn(it.alto, 0);
  const tarifa = nn(it.tarifa, 0);

  let conf = 'exacta', requiere = '', faltaBase = false;
  if (!(ancho > 0) || !(alto > 0)) {
    conf = 'requiere_dato'; faltaBase = true;
    requiere = 'el ancho y el alto de la caja de luz de la partida ' + etiqueta(it) + ', en cm';
  }
  /* La tarifa dice la forma: la de silueta desperdicia más que la cuadrada. Una tarifa que
     no está en el catálogo es un precio a mano —pasa— y entonces la geometría es la
     estándar y se dice que el número es estimado. */
  const cajaCat = (K.CAJAS || []).find(c => Number(c.tarifa) === tarifa) || cajaOf(tarifa);
  if (!cajaCat && conf !== 'requiere_dato') conf = 'estimada';
  if (!cajaCat) {
    avisos.push('Partida ' + etiqueta(it) + ': la tarifa de la caja no está en el catálogo, así que se calculó con la geometría estándar.');
  }
  const silueta = tarifa >= 4600;
  const aprov = silueta ? nn(C.APROV_NESTING_irregular, 0.72) : nn(C.APROV_NESTING_simple, 0.8);

  const m2 = ancho * alto / 10000;
  const cara = aprov > 0 ? m2 / aprov : 0;
  const exprCara = num(ancho, 0) + ' × ' + num(alto, 0) + ' cm = ' + num(m2) + ' m² ÷ ' +
    prop(aprov) + ' aprov' + (silueta ? ' (silueta)' : '') + ' = ' + num(cara) + ' m²';

  /* Cara de 6 mm y no de 3 mm: una cara de caja de luz se pandea con el calor y con su
     propio peso, y la que se ve pandeada es la de una caja, no la de una letra. */
  pedir('acr-6mm', cara, exprCara, it, conf, requiere);
  revisarCorte('acr-6mm', Math.max(ancho, alto), it);
  if (faltaBase) return;

  const perim = 2 * (ancho + alto);
  const marco = nn(C.APROV_TIRAS, 0.9) > 0
    ? (perim * nn(C.PROF_CAJA_CM, 15) / 10000) / nn(C.APROV_TIRAS, 0.9) : 0;
  pedir('lam-galv', cara + marco, exprCara + ' de trasera + ' + num(perim, 0) + ' cm × ' +
    num(nn(C.PROF_CAJA_CM, 15), 0) + ' cm de fondo ÷ ' + prop(nn(C.APROV_TIRAS, 0.9)) +
    ' aprov = ' + num(marco) + ' m² de marco = ' + num(cara + marco) + ' m²', it, conf, requiere);
  revisarCorte('lam-galv', Math.max(ancho, alto), it);

  pedir('tubular-1', perim, '2 × (' + num(ancho, 0) + ' + ' + num(alto, 0) + ') = ' +
    num(perim, 0) + ' cm de bastidor interno', it, conf, requiere);

  /* Caja de luz: SIEMPRE fría. Lo dice `descTxt` (index.html:6034) y no depende de
     `ilumTipo`, que en caja el cotizador no pinta. */
  const mod = Math.ceil(m2 * nn(C.MOD_POR_M2_CAJA, 30));
  pedir('led-6500', mod, num(m2) + ' m² × ' + num(nn(C.MOD_POR_M2_CAJA, 30), 0) +
    ' mód/m² (los 15 cm de fondo difunden más) = ' + num(mod, 0) + ' pieza', it, conf, requiere);

  const utiles = nn(C.CAP_FUENTE_W, 60) * nn(C.DERATE_FUENTE, 0.8);
  const fte = utiles > 0 ? Math.ceil(mod * nn(C.W_MODULO, 0.72) / utiles) : 0;
  pedir('fuente-60', fte, num(mod, 0) + ' mód × ' + num(nn(C.W_MODULO, 0.72)) + ' W ÷ ' +
    num(utiles) + ' W útiles = ' + num(fte, 0) + ' pieza', it, conf, requiere);

  pedir('silicon', perim / 100, num(perim, 0) + ' cm de perímetro = ' + num(perim / 100) +
    ' m de cordón', it, conf, requiere);
}

/* ============================================================================
   Persistencia del requerimiento
   ============================================================================ */

const rangoPor = (indice, valor) => (typeof IDBKeyRange !== 'undefined')
  ? { indice, rango: IDBKeyRange.only(valor) } : null;

/** @returns {Promise<Object[]>} los requerimientos vivos de un proyecto. NUNCA lanza. */
export async function requerimientos(proyectoId) {
  if (!proyectoId) return [];
  const r = rangoPor('porProyecto', proyectoId);
  const filas = await DB.listar('requerimientos',
    r || { filtro: x => x && x.proyecto_id === proyectoId });
  /* Los descartados se quedan en la base —traen la corrección humana que alimenta la
     calibración— pero no se pintan: una línea que ya no se necesita, en una lista de lo que
     hay que comprar, se compra. */
  return (filas || []).filter(x => x && x.estado !== 'descartado').sort((a, b) => {
    const oa = ORDEN[a.material_id], ob = ORDEN[b.material_id];
    return (oa === undefined ? 99 : oa) - (ob === undefined ? 99 : ob);
  });
}

/**
 * Deriva el material del proyecto y lo persiste.
 *
 * Preserva `cantidad_ajustada` —la corrección humana SIEMPRE gana sobre la fórmula— y no
 * toca nada que ya esté 'comprado' o 'consumido': el material ya salió del almacén o ya se
 * pagó, y recalcularlo hacia atrás dejaría el libro cuadrando contra un plan que cambió.
 * @returns {Promise<Resultado>} valor = {lineas, preservadas, sinMaterial, avisos}
 */
export async function recalcular(proyectoId) {
  if (!proyectoId) return mal('DATO_INVALIDO', 'Falta decir de qué proyecto.');
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  const p = await DB.obtener('proyectos', proyectoId);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  const items = (p.origen && Array.isArray(p.origen.items)) ? p.origen.items : [];
  if (!items.length) {
    return mal('DATO_INVALIDO', 'El proyecto no trae partidas, así que no hay de qué derivar material.');
  }

  const cts = await constantes();
  const version = await versionConstantes();
  const mats = await listarMateriales();
  const mapa = (mats || []).reduce((m, x) => { m[x.id] = x; return m; }, {});

  const d = derivar(items, cts, catalogos(), mapa);

  const previos = await DB.listar('requerimientos',
    rangoPor('porProyecto', proyectoId) || { filtro: x => x && x.proyecto_id === proyectoId });
  const antes = new Map((previos || []).map(x => [x.id, x]));

  const ahora = Date.now();
  const empresa_id = p.empresa_id || Prefs.empresa();
  const escribir = [];
  const vivos = new Set();
  let preservadas = 0;

  for (const l of d.lineas) {
    const id = proyectoId + ':' + l.material_id;
    vivos.add(id);
    const a = antes.get(id);
    if (a && (a.estado === 'comprado' || a.estado === 'consumido')) { preservadas++; continue; }
    escribir.push({
      id, empresa_id, proyecto_id: proyectoId, material_id: l.material_id,
      cantidad_consumo: l.cantidad_consumo, unidad_consumo: l.unidad_consumo,
      cantidad_compra: l.cantidad_compra, unidad_compra: l.unidad_compra,
      partidas: l.partidas, formula: l.formula,
      confianza: l.confianza, requiere: l.requiere,
      constantes_version: version,
      cantidad_ajustada: a && a.cantidad_ajustada !== undefined ? a.cantidad_ajustada : null,
      motivo_ajuste: (a && a.motivo_ajuste) || '',
      ajustado_por: (a && a.ajustado_por) || '',
      ajustado_en: (a && a.ajustado_en) || 0,
      estado: a && a.estado === 'apartado' ? 'apartado' : 'calculado',
      creado_en: (a && a.creado_en) || ahora,
      sync: 0,
    });
  }

  /* Lo que ya no se necesita se marca 'descartado', no se borra. Si alguien corrigió esa
     línea a mano, esa corrección es la única medición real que tiene el sistema de cuánto
     rinde el material: borrarla sería tirar el único dato medido para ahorrar una fila. */
  for (const a of (previos || [])) {
    if (vivos.has(a.id)) continue;
    if (a.estado === 'comprado' || a.estado === 'consumido') { preservadas++; continue; }
    if (a.estado === 'descartado') continue;
    escribir.push({ ...a, estado: 'descartado', sync: 0 });
  }

  if (escribir.length) {
    const r = await DB.ponerVarios('requerimientos', escribir);
    if (!r.ok) return r;
    for (const reg of escribir) await encolar('actualizar', 'requerimientos', reg);
  }

  return ok({ lineas: d.lineas, preservadas, sinMaterial: d.sinMaterial, avisos: d.avisos });
}

/**
 * La corrección humana. Es lo que hace que ninguna constante sea un campo obligatorio: el
 * sistema arranca con los valores del repositorio, se equivoca a la vista, y cada
 * corrección le enseña cuánto se equivocó.
 *
 * El movimiento de 'ajuste' solo se emite si el material YA se consumió. Si el
 * requerimiento sigue en 'calculado', nada salió del almacén todavía y un ajuste sería un
 * descuadre inventado: la corrección se guarda y la salida futura ya sale con el número
 * bueno.
 * @returns {Promise<Resultado>} valor = {requerimiento, movimiento, razon}
 */
export async function ajustar(reqId, cantidadReal, motivo) {
  if (!reqId) return mal('DATO_INVALIDO', 'Falta decir qué línea se está corrigiendo.');
  const req = await DB.obtener('requerimientos', reqId);
  if (!req) return mal('NO_ENCONTRADO', 'Esa línea ya no existe. Recalcula el material del proyecto.');

  const real = Number(cantidadReal);
  const uc = UC_TXT[req.unidad_compra] || req.unidad_compra || 'unidades';
  if (!isFinite(real) || real < 0) {
    return mal('DATO_INVALIDO', 'Escribe cuánto se usó de verdad, en ' + uc + '. Puede llevar decimales: media lámina es 0.5.');
  }

  const calculado = nn(req.cantidad_compra, 0);
  const previa = (req.cantidad_ajustada === null || req.cantidad_ajustada === undefined)
    ? calculado : nn(req.cantidad_ajustada, calculado);
  const dif = real - previa;

  const fila = {
    ...req,
    cantidad_ajustada: redondearCalculo(real),
    motivo_ajuste: String(motivo || '').trim(),
    ajustado_por: Prefs.sello(),
    ajustado_en: Date.now(),
    sync: 0,
  };
  const r = await DB.poner('requerimientos', fila);
  if (!r.ok) return r;
  await encolar('actualizar', 'requerimientos', r.valor);

  let movimiento = null;
  if (req.estado === 'consumido' && Math.abs(dif) > 1e-9) {
    const St = await modStock();
    if (St && typeof St.mover === 'function') {
      /* El signo: usar MÁS de lo planeado es más material que salió del almacén, y una
         salida es negativa. Por eso la cantidad del movimiento es `-dif` y no `dif`. */
      const rm = await St.mover({
        material_id: req.material_id, tipo: 'ajuste', cantidad: -dif,
        unidad_compra: req.unidad_compra, proyecto_id: req.proyecto_id,
        requerimiento_id: req.id, origen: 'manual',
        nota: 'Ajuste de ' + num(previa, 4) + ' a ' + num(real, 4) + ' ' + uc +
          (fila.motivo_ajuste ? '. ' + fila.motivo_ajuste : ''),
      });
      if (rm && rm.ok) movimiento = rm.valor;
      else if (rm && rm.mensaje) {
        /* La corrección ya quedó guardada; lo que no se pudo fue mover el almacén. Se dice
           así, en ese orden, porque quien lo lea va a querer saber qué sí pasó. */
        return mal(rm.codigo || 'DESCONOCIDO', 'La corrección quedó guardada, pero el almacén no se movió: ' + rm.mensaje);
      }
    }
  }

  return ok({ requerimiento: r.valor, movimiento, razon: calculado > 0 ? real / calculado : null });
}

/* ============================================================================
   El bucle de calibración

   Cada corrección de fabricación es una medición: real ÷ calculado. Con cinco de la misma
   familia y una desviación media de más del 15 %, ya no es mala suerte, es un factor mal
   puesto, y el sistema propone el número nuevo en vez de esperar a que alguien lo deduzca.

   Cinco y 15 % no son adorno: con dos muestras se propone ruido, y una desviación del 8 %
   la absorbe la merma. Si nadie toca nunca la propuesta, la plataforma sigue funcionando
   con los valores del repositorio y con su error a la vista, que es el punto entero.
   ============================================================================ */

const MIN_MUESTRAS = 5;
const DESVIACION_MIN = 0.15;

/* Qué constante gobierna cada familia, y en qué sentido. Es la palanca que la pantalla de
   constantes puede mover de un toque; la merma de la fila del catálogo es la otra y se
   edita en el catálogo, donde su derivación está escrita. */
const PALANCA = {
  acrilico:    { clave: 'APROV_NESTING_simple',    sentido: 'divide' },
  aluminio:    { clave: 'APROV_NESTING_simple',    sentido: 'divide' },
  lamina:      { clave: 'APROV_NESTING_simple',    sentido: 'divide' },
  fleje:       { clave: 'APROV_TIRAS',             sentido: 'divide' },
  vinil:       { clave: 'APROV_NESTING_irregular', sentido: 'divide' },
  iluminacion: { clave: 'MOD_POR_M2',              sentido: 'multiplica' },
  herraje:     { clave: 'SEPARADORES_LETRA',       sentido: 'multiplica' },
  estructura:  { clave: 'TRAVESANO_CM',            sentido: 'divide' },
  consumible:  null,
};
const ENTERAS = new Set(['MOD_POR_M2', 'MOD_POR_M2_CAJA', 'SEPARADORES_LETRA',
                         'TRAVESANO_CM', 'REMACHE_CM', 'CAP_FUENTE_W']);

/** @returns {Promise<Object[]>} [{familia, muestras, razon, constante_sugerida, valor_actual, valor_sugerido, mensaje}] */
export async function calibracion() {
  const [reqs, mats, cts] = await Promise.all([
    DB.listar('requerimientos'), DB.listar('materiales'), constantes(),
  ]);
  const familiaDe = id => {
    const m = (mats || []).find(x => x.id === id) || MAPA_BASE[id];
    return (m && m.familia) || 'sin_familia';
  };

  const grupos = new Map();
  for (const r of (reqs || [])) {
    if (!r || r.cantidad_ajustada === null || r.cantidad_ajustada === undefined) continue;
    const calc = nn(r.cantidad_compra, 0);
    const real = nn(r.cantidad_ajustada, 0);
    if (calc <= 0) continue;   // sin calculado no hay razón que medir, y 0 no se divide
    const f = familiaDe(r.material_id);
    if (!grupos.has(f)) grupos.set(f, []);
    grupos.get(f).push(real / calc);
  }

  const out = [];
  for (const [familia, razones] of grupos) {
    if (razones.length < MIN_MUESTRAS) continue;
    const razon = razones.reduce((s, x) => s + x, 0) / razones.length;
    if (Math.abs(razon - 1) <= DESVIACION_MIN) continue;

    const pal = PALANCA[familia] || null;
    const pct = Math.round(Math.abs(razon - 1) * 100);
    const rinde = razon > 1
      ? 'rinde ' + pct + ' % menos de lo calculado'
      : 'rinde ' + pct + ' % más de lo calculado';

    let clave = null, actual = null, sugerido = null;
    if (pal && cts[pal.clave] !== undefined) {
      clave = pal.clave;
      actual = cts[clave];
      let v = pal.sentido === 'divide' ? actual / razon : actual * razon;
      const lim = LIMITES[clave];
      if (lim) v = Math.min(Math.max(v, lim[0]), lim[1]);
      sugerido = ENTERAS.has(clave) ? Math.round(v) : Math.round(v * 1e4) / 1e4;
    }

    out.push({
      familia, muestras: razones.length,
      razon: Math.round(razon * 1e4) / 1e4,
      constante_sugerida: clave, valor_actual: actual, valor_sugerido: sugerido,
      mensaje: 'El material de ' + familia + ' ' + rinde + ' en las últimas ' +
        razones.length + ' correcciones.' +
        (clave ? ' Cambiar ' + clave + ' de ' + num(actual, 4) + ' a ' + num(sugerido, 4) + '.'
               : ' No hay constante que lo gobierne: súbele la merma en el catálogo.'),
    });
  }

  return out.sort((a, b) => Math.abs(b.razon - 1) - Math.abs(a.razon - 1));
}
