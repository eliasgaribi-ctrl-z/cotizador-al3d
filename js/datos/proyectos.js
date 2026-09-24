/* ============================================================================
   El proyecto: lo que no existía.

   Una cotización autorizada dice cuánto cuesta el trabajo. Que el trabajo SE HAYA
   VENDIDO no estaba escrito en ningún sistema —ni en el cotizador, ni en Notion, ni en
   Drive— y por eso los datos del cotizador nunca llegaban a ningún lado: faltaba el
   renglón que dice «esta sí se dio». Este módulo es ese renglón, y todo lo que cuelga de
   él: la agenda, el material, el mapa y la cobranza.

   Las cuatro decisiones que gobiernan el archivo, porque romper cualquiera rompe algo que
   hoy funciona:

   1. `origen` es una COPIA CONGELADA, nunca una referencia. Verificado:
      `guardarEnHistorial()` hace `arr[idx] = entry` —reemplaza la entrada completa— al
      reautorizar, al editar y al ocultar una partida del PDF, y `ts` se sobrescribe. Una
      referencia sería un proyecto cuyo material cambia solo, sin que nadie lo tocara. Es
      el mismo razonamiento por el que el propio cotizador congela `_lt` en cada partida.

   2. La ETAPA es de OBRA y el `Estatus` de Notion es de DINERO. Son dos ejes distintos y
      aquí no se mezclan nunca: `etapa` la mueve quien fabrica (ganado → cortado → armado
      → listo → instalado) y `estatus_notion` (REPARANDO, COBRANDO, FABRICACION,
      LIQUIDADO) es un espejo de solo lectura de lo que pasa con el cobro. Mezclarlos es
      exactamente cómo se corrompe una vista que ya funciona: la columna «FABRICACION» de
      Notion no quiere decir que algo esté cortado, quiere decir que ya se pagó el
      anticipo.

   3. Aquí no se recalcula dinero. Ni una multiplicación. El importe vendido viene
      congelado en la entrada del historial y se lee con `Cot.importeCongelado` y
      `Cot.totalVendido`. Y las fórmulas de Notion —`Pago Pendiente`, `Comision
      Restante`— se leen y NADIE MÁS las calcula: dos implementaciones de la misma fórmula
      divergen en semanas y el sistema empieza a dar dos respuestas, que es peor que no
      dar ninguna.

   4. `tipo_trabajo` se DERIVA. Es el campo que murió en Notion con 0 filas llenas de 142
      y es el criterio de éxito número 1 del proyecto. Nadie lo captura, nadie lo puede
      dejar vacío.

   Dep: db, prefs, cotizador, geo, ui (fechas), material/stock/agenda/sync (perezosos).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import * as Cot from './cotizador.js';
import { parseGmaps } from './geo.js';
import { hoyISO, partesISO } from '../nucleo/ui.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/* Los módulos que este importa de vuelta —material necesita el proyecto para derivar, y
   la agenda necesita el proyecto para agendar— se cargan cuando se usan, no cuando este
   se evalúa: un import estático de ida y vuelta es un ciclo. Y `stock` y `sync` se cargan
   así por la otra razón, que es de robustez: la escritura local ya ocurrió, y un módulo a
   medio desplegar no tiene por qué llevarse por delante el proyecto que sí se guardó. */
async function mod(archivo) { try { return await import('./' + archivo + '.js'); } catch (_) { return null; } }

/* `campos`: qué cambió, cuando se sabe. El relevo a la hoja lo lee para no reescribir el
   dinero y el nombre que esta operación no tocó. */
async function encolar(tipo, registro, campos) {
  const S = await mod('sync');
  if (!S || typeof S.encolar !== 'function') return;
  try {
    await S.encolar({ id: DB.nuevoId('op'), tipo, almacen: 'proyectos',
      registro_id: registro.id, datos: registro, esperado: null,
      campos: Array.isArray(campos) ? campos : null,
      ts: Date.now(), intentos: 0, ultimo_error: '' });
  } catch (_) { /* la escritura local ya está; la bandeja se recupera en el próximo bombeo */ }
}

/* La bitácora: quién hizo qué. Se anota DESPUÉS de escribir y dentro de un try, por lo mismo
   que la bandeja: una bitácora que no pudo escribirse no puede deshacer una venta. */
async function anotar(hecho) {
  const B = await mod('bitacora');
  if (!B || typeof B.anotar !== 'function') return;
  try { await B.anotar({ entidad: 'proyecto', ...hecho }); } catch (_) {}
}
const pesos = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ============================================================================
   Vocabulario congelado
   ============================================================================ */

/** Las ocho de §4.4. `garantia` y `cancelado` no están en la línea: son salidas del
 *  camino, no pasos de él, y por eso no viven en ORDEN. */
export const ETAPAS = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo',
                       'instalado', 'garantia', 'cancelado'];

/** El nombre de la columna del tablero. Vive aquí y no en la pantalla para que las tres
 *  pantallas que enseñan una etapa la llamen igual: «Listo» y «Terminado» en dos vistas
 *  del mismo dato es cómo alguien acaba preguntando si son dos cosas. */
export const ETAPA_NOMBRE = {
  ganado: 'Ganado', en_diseno: 'En diseño', cortado: 'Cortado', armado: 'Armado',
  listo: 'Listo para instalar', instalado: 'Instalado', garantia: 'En garantía',
  cancelado: 'No se dio',
};

/** El icono de cada etapa. Vive aquí y no en una pantalla por lo mismo que `ETAPA_NOMBRE`:
 *  tres vistas enseñan la etapa —la ficha del proyecto, el renglón del taller y el bloque de
 *  la estación en el Tablero— y con el icono escrito en cada una, dos de ellas acaban
 *  dibujando cosas distintas para el mismo hecho. */
export const ICO_ETAPA = {
  ganado: 'i-venta', en_diseno: 'i-lapiz', cortado: 'i-corte', armado: 'i-material',
  listo: 'i-check', instalado: 'i-pin', garantia: 'i-aviso', cancelado: 'i-cerrar',
};

/** La clase de color de `.pf-etapa`. Trae seis cajas de color y aquí hay ocho etapas:
 *  garantía y cancelado caen en `cerrado`, que es el gris de «archivado», que es lo que son:
 *  salidas del camino, no pasos de él. */
export const claseEtapa = e => (e === 'garantia' || e === 'cancelado') ? 'cerrado' : String(e || 'ganado');

/** El lugar de cada etapa en la línea del proceso. Se exporta porque el Tablero compara
 *  `ORDEN[etapa_real] < ORDEN[etapa_esperada]` para decir «2 atrasados», y porque la
 *  confirmación de «esto cruza corte» es `ORDEN[nueva] >= ORDEN.cortado`. Reescribir esa
 *  tabla en la vista sería tener dos órdenes del mismo proceso. */
export const ORDEN = { ganado: 0, en_diseno: 1, cortado: 2, armado: 3, listo: 4, instalado: 5 };
const VIVAS = ETAPAS.filter(e => e !== 'cancelado');

/* ----- Los siete valores, escritos EXACTAMENTE como existen -----
   Son el select multi-línea que el usuario ya diseñó en Notion. Van sin acentos porque así
   están escritos allá: «Rotulacion de vinil» con acento sería un OCTAVO valor para Notion,
   y el resultado de eso no es un error visible, es una vista que reporta la mitad. El
   `Custome` mal escrito también se respeta: corregirlo aquí es inventar una opción nueva.

   Y `tipo_trabajo` es un ARRAY a propósito. El single-select es exactamente donde murió la
   copia del esquema: un proyecto lleva letras Y bastidor, y con un solo valor la persona
   que captura tiene que elegir cuál de los dos miente menos. Nadie elige: lo deja vacío. */
export const TIPOS_TRABAJO = [
  'Caja de luz con iluminacion',
  'Caja de luz sin iluminacion',
  'Letras 3D con iluminacion',
  'Letras 3D sin iluminacion',
  'Rotulacion de vinil',
  'Recorte acrilico',
  'Custome / Proyecto Especial',
];

/* ============================================================================
   Las dos funciones PURAS. Sin DOM, sin red, sin IndexedDB.
   ============================================================================ */

/* ----- Una partida sin un solo dato capturado no describe ningún trabajo -----
 * El cotizador siembra cada partida nueva en `tipo:'letras'` con `luz:true` —hay que empezar
 * por algo— y esa plantilla viaja tal cual al historial si la cotización se autoriza con el
 * renglón todavía en blanco: el aviso de partidas sin terminar avisa, pero tiene su
 * «continuar de todos modos». Contarla le inventaba al proyecto un «Letras 3D con
 * iluminacion» que nadie vendió, y con él una etiqueta de más en el nombre y un cubo de más
 * en el plazo de taller, porque `plazoSugerido` suma uno por cada tipo distinto.
 *
 * Es la gemela de `itemVacio` (js/cotizador/ia.js), escrita aquí porque el cotizador es un
 * script clásico y no se puede importar. `pruebas/proyectos.mjs` comprueba que las dos miren
 * los mismos campos, igual que `pruebas/taller.mjs` ata las dos tablas de plazos.
 *
 * `material` cuenta solo si lo eligió una persona: el heredado lo pone la app (`matAuto`).
 * @param {Object} it
 * @returns {boolean}
 */
export function partidaEnBlanco(it) {
  if (!it || typeof it !== 'object') return true;
  const matPropio = !!it.material && !it.matAuto;
  return !String(it.desc || '').trim() && !it.altura && !it.n && !it.ancho && !it.alto &&
         !it.pu && !it.tarifa && !matPropio && !it.acab && !it.bas;
}

/**
 * Los siete valores de la copia de Notion, derivados de las partidas.
 *
 * ESTE es el campo que murió: `Tipo de proyecto` quedó lleno en 0 de 142 filas en tres
 * años de uso real. No por descuido —el usuario llenó a mano las columnas de dinero de
 * las 142— sino porque era un select que había que abrir y elegir después de haber
 * terminado el trabajo, cuando ya nadie tiene nada que ganar con llenarlo. Aquí se deriva
 * de `items[].tipo` + `luz` + `acab`, que son datos que YA existen porque de ellos sale el
 * precio que el cliente firmó. Se llena al 100 % y nadie lo toca. Es el criterio de éxito
 * número uno del proyecto y por eso es la función más comentada del archivo.
 *
 * Las tres decisiones de mapeo, y las tres son elecciones, no obviedades:
 *
 * - El `recorte` tipo sándwich lleva luz, pero no hay un octavo valor para «recorte con
 *   iluminación»: el eje «con/sin iluminación» solo existe para letras y caja en el
 *   vocabulario del usuario, así que sándwich y sencillo son los dos «Recorte acrilico».
 *   La iluminación de esa partida se lee en su descripción, que es de donde salió.
 * - El `bastidor` NO tiene valor propio entre los siete, y eso es un hueco del vocabulario,
 *   no del código. Cae en «Custome / Proyecto Especial», que es lo que un select sin la
 *   opción hace de todas formas. Inventar «Panel» aquí sería crear una opción que la base
 *   de Notion no tiene y que sus siete vistas no filtran. El nombre del proyecto sí lo
 *   nombra —«Panel Alucobond»—, que es donde el usuario ya lo escribía a mano.
 * - La `caja` se lee con `it.luz !== false`. En el cotizador el interruptor de luz solo se
 *   pinta para letras, así que una caja llega con el `true` de su plantilla y sale «con
 *   iluminacion», que es lo correcto: `descTxt` dice LED fría siempre. Pero el campo
 *   existe y está en `_CAMPOS_PRECIO`, así que si algún día se apaga, se respeta.
 *
 * PURA, sin efectos. Devuelve los valores sin repetir y en el orden canónico de
 * TIPOS_TRABAJO —no en el de las partidas— para que dos proyectos con las mismas partidas
 * en otro orden produzcan el mismo array y se puedan comparar.
 *
 * Las partidas EN BLANCO no cuentan: ver `partidaEnBlanco` aquí arriba.
 *
 * @param {Array<Object>} items partidas del historial
 * @returns {string[]} vacío si no hay ni una partida legible con algo capturado
 */
export function tiposDerivados(items) {
  if (!Array.isArray(items)) return [];
  const halla = new Set();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (partidaEnBlanco(it)) continue;
    const luz = it.luz !== false;   // default true: la partida de la IA no siempre lo trae
    switch (it.tipo) {
      case 'letras':
        halla.add(luz ? 'Letras 3D con iluminacion' : 'Letras 3D sin iluminacion'); break;
      case 'caja':
        halla.add(luz ? 'Caja de luz con iluminacion' : 'Caja de luz sin iluminacion'); break;
      case 'recorte':
        halla.add(it.acab === 'vinil' ? 'Rotulacion de vinil' : 'Recorte acrilico'); break;
      case 'bastidor':
      case 'manual':
      default:
        /* Un `tipo` que este archivo no conoce cae aquí a propósito. El día que el
           cotizador estrene un sexto tipo —el neón flex ya se vende y no está en ningún
           catálogo— el proyecto sale como «Custome / Proyecto Especial», que es verdad,
           en vez de salir sin tipo, que es el campo vacío otra vez. */
        halla.add('Custome / Proyecto Especial');
    }
  }
  return TIPOS_TRABAJO.filter(t => halla.has(t));
}

/* La etiqueta corta de UNA partida, para el paréntesis del nombre. Sale de la partida y no
   de los siete valores porque la convención real del usuario nombra la PIEZA: sus nombres
   dicen «(Panel Alucobond)» y «(Caja Luz Mostrador)», no «(Custome / Proyecto Especial)».
   El paréntesis es para reconocer el trabajo en una lista de doscientos. */
function etiquetaCorta(it) {
  if (!it || typeof it !== 'object') return '';
  const luz = it.luz !== false;
  switch (it.tipo) {
    case 'letras':   return luz ? 'Letras Luz' : 'Letras';
    case 'caja':     return luz ? 'Caja Luz' : 'Caja';
    case 'bastidor': return 'Panel ' + (it.bas === 'alucobond' ? 'Alucobond' : 'Lámina');
    case 'recorte':
      if (it.acab === 'vinil') return 'Vinil';
      return it.acab === 'sandwich' ? 'Recorte Luz' : 'Recorte';
    default:         return 'Especial';
  }
}

/* Si no hay partidas de dónde sacar la pieza —un origen manual, una fila importada de un
   CSV— se cae a los siete valores, que siempre están. */
const CORTO_DE_TIPO = {
  'Caja de luz con iluminacion': 'Caja Luz',
  'Caja de luz sin iluminacion': 'Caja',
  'Letras 3D con iluminacion':   'Letras Luz',
  'Letras 3D sin iluminacion':   'Letras',
  'Rotulacion de vinil':         'Vinil',
  'Recorte acrilico':            'Recorte',
  'Custome / Proyecto Especial': 'Especial',
};

const MAX_ETIQUETAS = 3;

/**
 * `${contacto} - ${negocio} (${tipoCorto})`, la convención REAL de su base de Notion.
 * Ejemplos suyos, tal cual: «Ale - Parentesis (Caja Luz Mostrador)»,
 * «Andrey - Healthylicious (Panel Alucobond)». El contacto sale de `origen.cliente` y el
 * negocio de `origen.proy`, que el cotizador ya exige como obligatorios.
 *
 * Se respeta la convención en vez de inventar un nombre «mejor» por una razón práctica:
 * el usuario va a tener las dos listas abiertas —esta y la de Notion— durante meses, y dos
 * convenciones de nombre para las mismas doscientas filas es lo que hace que nadie confíe
 * en que son el mismo proyecto.
 *
 * Y nunca devuelve cadena vacía: sin contacto y sin negocio usa el folio. Un renglón sin
 * nombre en una lista es un renglón que nadie abre.
 *
 * PURA, sin efectos.
 */
export function nombreDerivado(origen, tipos) {
  const o = origen && typeof origen === 'object' ? origen : {};
  const contacto = String(o.cliente || '').trim();
  const negocio  = String(o.proy || '').trim();

  let etiquetas = [];
  if (Array.isArray(o.items) && o.items.length) {
    for (const it of o.items) {
      /* La misma criba que `tiposDerivados`: un renglón en blanco metía «Letras Luz» en el
         paréntesis del nombre —«Ale - Parentesis (Vinil + Letras Luz)»— de un trabajo que
         solo lleva vinil. El paréntesis es para reconocer el trabajo en una lista de
         doscientos; nombrar una pieza que no existe es justo lo contrario. */
      if (partidaEnBlanco(it)) continue;
      const e = etiquetaCorta(it);
      if (e && !etiquetas.includes(e)) etiquetas.push(e);
    }
  }
  if (!etiquetas.length && Array.isArray(tipos)) {
    for (const t of tipos) {
      const e = CORTO_DE_TIPO[t];
      if (e && !etiquetas.includes(e)) etiquetas.push(e);
    }
  }
  /* Con más de tres piezas distintas el paréntesis se come el renglón en un teléfono. Se
     dicen las tres primeras y se cuenta el resto: «+2» avisa de que hay más sin fingir que
     no hay nada. */
  let cola = '';
  if (etiquetas.length > MAX_ETIQUETAS) {
    cola = ' +' + (etiquetas.length - MAX_ETIQUETAS);
    etiquetas = etiquetas.slice(0, MAX_ETIQUETAS);
  }
  const parte = etiquetas.join(' + ') + cola;

  let base;
  if (contacto && negocio) base = contacto + ' - ' + negocio;
  else base = contacto || negocio || String(o.folio || '').trim() || 'Sin nombre';

  return parte ? base + ' (' + parte + ')' : base;
}

/* ============================================================================
   Ganar
   ============================================================================ */

const esISO = s => !!partesISO(s);
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
/* «Vino un número», incluido el cero. Lo contrario de `||`, que confunde cero con ausencia. */
const trae = v => v !== undefined && v !== null && v !== '' && isFinite(Number(v));
/* Un cubo de plazo válido (entero de 1 a 5) o null. La tabla vive en datos/taller.js; aquí
   solo se valida la forma, para no importar el módulo entero por un rango. */
const plazoValido = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/* La copia congelada, con una sola cosa fuera: la imagen.

   `aiFile.url` es un data URL —la referencia visual que subió el cliente— y es el único
   dato grande de la entrada. Congelarlo aquí lo duplicaría en IndexedDB para siempre, y la
   cuota que se gastaría es la misma que `saveHistorial()` necesita para no ir soltando
   imágenes viejas cuando ya no cabe una cotización nueva. Se guardan el nombre y el tipo
   —que es lo que hace falta para decir «tiene arte»— y la imagen se lee del historial por
   folio, que es donde vive. Lo que protege al proyecto de que le cambien el material es
   congelar los NÚMEROS, y esos van completos. */
function congelar(entrada) {
  let copia;
  try { copia = JSON.parse(JSON.stringify(entrada)); } catch (_) { return null; }
  if (copia && copia.aiFile && typeof copia.aiFile === 'object') {
    copia.aiFile = { name: copia.aiFile.name || '', type: copia.aiFile.type || '', url: '' };
  }
  copia.fuente = copia.fuente || 'cotizador';
  return copia;
}

/* ============================================================================
   UN PROYECTO QUE NACIÓ EN LA HOJA, NO EN EL COTIZADOR

   Por qué existe, con el caso que lo pidió: en septiembre de 2026 la hoja tenía DIECISÉIS
   filas con estatus FABRICACION —trabajo vivo, cobrado a medias, en el taller— y el tablero
   de la plataforma decía «0 en el taller hoy» y «0 van tarde». No era un dato perdido: el
   puente, por diseño, no convertía filas de la hoja en proyectos. Solo espejaba el dinero
   sobre proyectos que YA existieran de este lado, atados por «Folio cotizacion».

   Esa decisión está escrita en js/datos/puente.js y era correcta para lo que miraba: las 199
   filas anteriores a la plataforma, sin partidas y sin material, habrían llenado el tablero
   de trabajos que nadie puede fabricar. Pero es la decisión equivocada para las que están
   VIVAS: una venta en fabricación es trabajo del taller, y si el tablero no la enseña, el
   tablero miente sobre el taller.

   ── Lo que este proyecto SÍ tiene y lo que NO ──────────────────────────────────
   Tiene lo que la hoja sabe: nombre, tipo de trabajo, el dinero, el estatus, la cuenta, la
   dirección y la fecha del anticipo. NO tiene partidas, ni material, ni medidas, ni origen,
   porque la hoja no las guarda. Eso se marca con `de_hoja: true` y con `origen: null`, y no
   es un detalle: hay pantallas que derivan cosas de las partidas, y una que le diga «dale
   recalcular material» a un trabajo que no tiene de dónde calcularlo manda a alguien a un
   botón que no puede funcionar.

   ── La etapa es «ganado», y es una respuesta, no un relleno ────────────────────
   La hoja no guarda etapa de obra: esa columna es de la plataforma y está vacía en las 214
   filas. `Estatus` es de DINERO —FABRICACION quiere decir «no está pagado»— y mezclar los
   dos ejes sería inventar. «Ganado» es literalmente lo que se sabe: el trabajo se vendió y
   nadie ha dicho en qué etapa va. Al no traer fecha de instalación caen en «Ganados sin
   fecha», que es el contador que pide justo lo que falta.

   ── El id es DETERMINISTA, y de eso depende que no se dupliquen ────────────────
   Sale del folio interno de la hoja (V-214), no de `DB.nuevoId()`. Cada barrido del puente
   vuelve a ver las mismas filas: con un id aleatorio, abrir la app tres veces daría tres
   proyectos del mismo trabajo, y el tablero contaría cuarenta y ocho donde hay dieciséis.
   ============================================================================ */

/** Quita el «(Tipo)» final y parte «Contacto - Negocio» en sus dos mitades. Conservador a
 *  propósito: si no hay separador, todo se queda como negocio y el contacto va vacío. Es
 *  mejor un contacto vacío que un nombre partido al azar, que es lo que se pinta en la
 *  ficha y lo que alguien lee para llamar por teléfono. */
function partirNombreDeHoja(nombre) {
  const limpio = String(nombre || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  const i = limpio.indexOf(' - ');
  if (i < 0) return { contacto: '', negocio: limpio };
  return { contacto: limpio.slice(0, i).trim(), negocio: limpio.slice(i + 3).trim() };
}

/**
 * Un renglón de `ventas_hoja` como proyecto de la plataforma. PURO: sin base, sin red y sin
 * reloj salvo los sellos, para que la prueba de node lo corra entero.
 *
 * @param {Object} venta el registro que deja `puente.ventaDeHoja`
 * @returns {Object|null} el proyecto, o null si la fila no alcanza para uno
 */
export function desdeVentaDeHoja(venta) {
  const v = venta && typeof venta === 'object' ? venta : null;
  if (!v) return null;
  const folioHoja = String(v.folio_hoja || '').trim();
  const nombre = String(v.nombre || '').trim();
  /* Sin folio interno no hay id estable, y sin id estable se duplica en cada barrido. Sin
     nombre no hay nada que enseñar en el tablero. Cualquiera de los dos que falte, no entra. */
  if (!folioHoja || !nombre) return null;

  const { contacto, negocio } = partirNombreDeHoja(nombre);
  /* La fecha del trabajo, en el orden en que la hoja la sabe: el anticipo es cuando se
     vendió, y es la que Control ya usa para los meses. */
  const fecha = [v.fecha_anticipo, v.fecha_instalacion, v.fecha_liquidacion]
    .find(f => esISO(f)) || hoyISO();
  const ahora = Date.now();

  return {
    id: 'proy-hoja-' + folioHoja,
    empresa_id: Prefs.empresa(),
    folio_local: folioHoja,
    dispositivo: 'hoja',
    /* Vacío a propósito: no hay cotización detrás. `folio_hoja` es lo que ata este proyecto
       a su renglón, y es lo que `ventas.unificar` mira para no contar la misma venta dos
       veces —una como proyecto y otra como fila—. */
    folio_global: '',
    folio_hoja: folioHoja,
    /* La marca. Todo lo que derive de partidas tiene que preguntarla antes. */
    de_hoja: true,
    nombre,
    contacto,
    negocio,
    tel: '',
    etapa: v.etapa || 'ganado',
    tipo_trabajo: Array.isArray(v.tipo_trabajo) ? v.tipo_trabajo.slice() : [],
    fecha_ganado: fecha,
    compromiso_texto: '',
    dir_texto: String(v.direccion || ''),
    entrecalles: '',
    maps_url: '',
    lat: null,
    lng: null,
    geo_fuente: 'sin_ubicar',
    sub: num(v.sub),
    neto: num(v.neto),
    /* `precio_auth` es lo que se cobra, y aquí lo que se cobra es el neto de la hoja: no hay
       cotización firmada con la que compararlo. */
    precio_auth: num(v.neto),
    anti_pactado: num(v.anticipo),
    iva: v.iva !== false,
    /* El folio interno ES el id del renglón para el puente (`id_notion`), así que ponerlo
       aquí es lo que hace que mover la etapa desde la plataforma escriba en la fila correcta
       en vez de crear una segunda. */
    notion_page_id: folioHoja,
    notion_estado: 'enviado',
    estatus_notion: v.estatus || null,
    cuenta: v.cuenta || null,
    pago_pendiente: v.pago_pendiente === undefined ? null : v.pago_pendiente,
    comision_restante: v.comision_restante === undefined ? null : v.comision_restante,
    pct_comision: num(v.pct_comision),
    plazo_k: null,
    /* Null y no un objeto vacío: `origen` es la copia congelada de la cotización, y un objeto
       vacío se leería como «hay cotización y no tiene partidas», que es otra cosa. */
    origen: null,
    notas: '',
    creado_en: ahora,
    actualizado_en: ahora,
    sync: 0,
  };
}

/* Arma el registro. Lo comparten `ganar` y `descartar` porque un proyecto descartado se
   deriva igual que uno ganado —el nombre, los tipos, el importe que se dejó de vender— y
   lo único que cambia es que no se le calcula material ni se le agenda nada. */
function armarProyecto(entrada, extra, etapa) {
  const origen = congelar(entrada);
  if (!origen) return null;
  /* La huella que viene del buzón es la del trabajo cuando SE GANÓ; la de la entrada es la
     de hoy, que puede ser posterior a una edición. Manda la del momento de ganar: es
     contra ella que `Cot.estadoOrigen` decide si el material calculado sigue valiendo. */
  const huella = String(extra.huella || '').trim();
  if (huella) origen.huellaAuth = huella;

  const disp = String(extra.disp || '').trim() || Prefs.dispositivo();
  const tipos = tiposDerivados(origen.items);
  const u = parseGmaps(origen.maps || '');
  /* `parseGmaps` devuelve `{corto:true}` para un maps.app.goo.gl, que desde el navegador
     es imposible de expandir. Eso no es una coordenada: el proyecto queda `sin_ubicar` y
     la pantalla del mapa le dice al usuario qué hacer con ese link. */
  const tieneCoord = !!(u && !u.corto && isFinite(u.lat) && isFinite(u.lng));

  const netoOrigen = num(origen.neto);
  return {
    id: DB.nuevoId('proy'),
    empresa_id: Prefs.empresa(),
    folio_local: String(origen.folio || ''),
    dispositivo: disp,
    folio_global: Cot.folioGlobal(origen.folio, disp),
    nombre: nombreDerivado(origen, tipos),
    contacto: String(origen.cliente || '').trim(),
    negocio: String(origen.proy || '').trim(),
    tel: String(origen.tel || '').trim(),
    etapa,
    tipo_trabajo: tipos,
    fecha_ganado: esISO(extra.fecha_ganado) ? extra.fecha_ganado : hoyISO(),
    /* El compromiso de entrega se guarda CRUDO y no se parsea nunca. `Q.entrega` es texto
       que una persona escribió para un cliente —«Viernes 15 de Agosto», «3 semanas después
       del anticipo»— y adivinar una fecha de ahí es cómo se produce una agenda que dice
       cosas que nadie prometió. La fecha real se captura una vez, en la agenda. */
    compromiso_texto: String(origen.entrega || ''),
    dir_texto: String(origen.dirRaw || origen.direccion || ''),
    entrecalles: String(origen.entrecalles || ''),
    maps_url: String(origen.maps || ''),
    lat: tieneCoord ? u.lat : null,
    lng: tieneCoord ? u.lng : null,
    geo_fuente: tieneCoord ? (u.fuente || 'maps_pin') : 'sin_ubicar',
    /* Dinero: se copia para poder pintarlo sin volver a abrir el historial. NO se
       recalcula, ni aquí ni en ningún otro lado de este archivo.
       Lo que el buzón TRAE manda, aunque sea cero: con `||`, un anticipo de $0 registrado a
       propósito caía al 50 % automático que el cotizador había propuesto, y el saldo salía
       bajo por ese importe. Cero es una respuesta; «no vino» es la ausencia del campo. */
    sub: trae(extra.sub) ? num(extra.sub) : num(origen.sub),
    neto: trae(extra.neto) ? num(extra.neto) : netoOrigen,
    precio_auth: Cot.totalVendido(origen),
    anti_pactado: trae(extra.anti_pactado) ? num(extra.anti_pactado) : num(origen.anti),
    iva: origen.iva !== false,
    /* Espejo de Notion. Solo lectura desde la plataforma, salvo lo que PAGOS captura. */
    notion_page_id: null,
    notion_estado: 'pendiente',
    estatus_notion: String(extra.estatus_notion || '').trim() || null,
    cuenta: String(extra.cuenta || '').trim() || null,
    /* Las dos fórmulas. Arrancan en null y SOLO las escribe lo que baje del puente: son
       columnas calculadas de Notion y aquí no se calculan jamás. */
    pago_pendiente: null,
    comision_restante: null,
    /* El porcentaje sí es un dato de entrada, no una fórmula —es lo que se pactó con quien
       trajo el trabajo— y viene del modal de Registrar Venta. Se guarda porque el buzón lo
       manda y tirarlo obligaría a volver a preguntarlo; la comisión que SALE de él la
       sigue calculando Notion. */
    pct_comision: num(extra.pct_comision),
    /* El plazo de taller, en cubos de 1 a 5 (ver datos/taller.js). `null` es el estado
       normal y significa «nadie lo tocó: manda el propuesto desde el tipo de trabajo». Es
       el mismo patrón de `cantidad_ajustada` en material y de `hora` en la instalación: la
       corrección humana gana cuando existe, y no se pide nunca. Si viene del buzón —el
       cotizador ya lo propone al capturar— se respeta. */
    plazo_k: plazoValido(extra.plazo_k),
    origen,
    notas: '',
    creado_en: Date.now(),
    actualizado_en: Date.now(),
    sync: 0,
  };
}

async function yaExiste(folioGlobal) {
  /* El rango usa el índice y el filtro es el cinturón: si `IDBKeyRange` no se pudo armar,
     `rango()` devuelve null y el cursor recorrería el índice completo, así que sin el
     filtro cualquier proyecto existente se leería como este mismo y toda venta nueva
     saldría DUPLICADO. Cuesta una comparación por fila y evita un no-guardado silencioso. */
  const filas = await DB.listar('proyectos', {
    indice: 'porFolio',
    rango: rango(folioGlobal),
    filtro: p => p && p.folio_global === folioGlobal,
  });
  return filas.length ? filas[0] : null;
}

/**
 * Crea el proyecto desde una entrada del historial. Congela `origen`, deriva nombre,
 * tipos y ubicación, y calcula el requerimiento de material.
 *
 * @param {Object} entradaHistorial
 * @param {{fecha_instalacion?:string, hora?:string, ventana?:string, sub?:number,
 *          neto?:number, anti_pactado?:number, cuenta?:string, estatus_notion?:string,
 *          pct_comision?:number, disp?:string, fecha_ganado?:string, plazo_k?:number,
 *          huella?:string}} [extra]
 * @returns {Promise<Resultado>} valor = el proyecto
 */
export async function ganar(entradaHistorial, extra = {}) {
  const e = entradaHistorial;
  if (!e || typeof e !== 'object' || !String(e.folio || '').trim()) {
    return mal('DATO_INVALIDO', 'Esa venta no dice de qué cotización salió.');
  }
  if (!Array.isArray(e.items) || !e.items.length) {
    return mal('DATO_INVALIDO', 'La cotización ' + e.folio + ' no tiene partidas. Ábrela en el cotizador y vuelve a autorizarla.');
  }
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  const x = extra && typeof extra === 'object' ? extra : {};
  const disp = String(x.disp || '').trim() || Prefs.dispositivo();
  const fg = Cot.folioGlobal(e.folio, disp);

  const previo = await yaExiste(fg);
  if (previo) {
    return mal('DUPLICADO', e.folio + ' ya está en la plataforma como «' + previo.nombre + '».');
  }

  const p = armarProyecto(e, x, 'ganado');
  if (!p) return mal('DATO_INVALIDO', 'No se pudo copiar esa cotización. Ábrela en el cotizador para ver si está completa.');

  const r = await DB.poner('proyectos', p);
  if (!r.ok) return r;
  await encolar('crear', r.valor);
  await anotar({ accion: 'gano', entidad_id: r.valor.id,
    titulo: (r.valor.nombre || r.valor.folio_local) + ' se ganó',
    detalle: (r.valor.folio_local || '') + ' · ' + pesos(r.valor.precio_auth || r.valor.neto) +
      (r.valor.anti_pactado ? ' · anticipo ' + pesos(r.valor.anti_pactado) : ''),
    despues: 'ganado' });

  /* El material se deriva después de guardar, y si falla NO se deshace el proyecto. El
     proyecto es el dato que no se puede volver a deducir de nada —«esta cotización se
     vendió» no está escrito en ningún otro sistema—; el requerimiento se recalcula con un
     botón cuando se quiera. Perder el irrecuperable por no poder calcular su acrílico
     sería tener las prioridades exactamente al revés. */
  const Mat = await mod('material');
  if (Mat && typeof Mat.recalcular === 'function') {
    try { await Mat.recalcular(r.valor.id); } catch (_) {}
  }

  /* La fecha de instalación viene del campo `rv-fecha` del modal de Registrar Venta, que ya
     existe y ya se llena: es la columna que el director teclea en Notion de todas formas.
     Si la agenda no la acepta, el proyecto se queda sin fecha y la regla A7 lo va a nombrar
     a las 48 horas. Es la degradación, no un silencio. */
  if (esISO(x.fecha_instalacion)) {
    const Ag = await mod('agenda');
    if (Ag && typeof Ag.agendar === 'function') {
      try {
        await Ag.agendar(r.valor.id, {
          fecha: x.fecha_instalacion,
          hora: x.hora || null,
          ventana: x.ventana || 'dia',
        });
      } catch (_) {}
    }
  }

  return ok(r.valor);
}

/**
 * «No se dio». Deja constancia de la decisión en vez de no dejar nada.
 *
 * Sin este renglón la tarjeta de «cotizaciones autorizadas sin decidir» resucita esa
 * cotización cada vez que alguien abre la app, porque su criterio es la AUSENCIA de un
 * proyecto con ese folio. Un aviso que vuelve después de que le dijiste que no es un aviso
 * que se aprende a ignorar, y ahí se pierde también el que sí importaba.
 *
 * Acepta la entrada del historial (simétrico con `ganar`), un id de proyecto o un folio.
 * @returns {Promise<Resultado>} valor = el proyecto en etapa 'cancelado'
 */
export async function descartar(ref, motivo = '') {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  if (Prefs.rol() !== 'direccion') {
    return mal('ROL_SIN_PERMISO', 'Solo Dirección decide si una cotización se dio o no.');
  }

  const nota = String(motivo || '').trim();
  let p = null;

  if (typeof ref === 'string' && ref) {
    p = await DB.obtener('proyectos', ref);
    if (!p) {
      const e = Cot.porFolio(ref);
      if (!e) return mal('NO_ENCONTRADO', 'No hay ni proyecto ni cotización con «' + ref + '».');
      return descartar(e, nota);
    }
  } else if (ref && typeof ref === 'object' && ref.folio) {
    /* Con el aparato que emitió la cotización, si la entrada lo trae: es la misma llave con
       la que `ganar` la habría guardado, y con la de este teléfono no se encontraría un
       proyecto ganado desde otro. */
    const disp = String(ref.disp || '').trim() || Prefs.dispositivo();
    p = await yaExiste(Cot.folioGlobal(ref.folio, disp));
    if (!p) {
      /* Nunca fue proyecto: se crea la lápida. Trae su nombre, sus tipos y su importe
         derivados igual que uno ganado, porque «cuánto dejamos de vender este mes» es una
         pregunta que se hace y que hoy no tiene dónde leerse. */
      const nuevo = armarProyecto(ref, { disp }, 'cancelado');
      if (!nuevo) return mal('DATO_INVALIDO', 'No se pudo copiar esa cotización.');
      nuevo.notas = nota;
      const r = await DB.poner('proyectos', nuevo);
      if (!r.ok) return r;
      await encolar('crear', r.valor);
      await anotar({ accion: 'descarto', entidad_id: r.valor.id,
        titulo: (r.valor.nombre || r.valor.folio_local) + ' no se dio',
        detalle: (r.valor.folio_local || '') + ' · ' + pesos(r.valor.precio_auth || r.valor.neto) +
          (nota ? ' · ' + nota : ''), despues: 'cancelado' });
      return ok(r.valor);
    }
  } else {
    return mal('DATO_INVALIDO', 'Falta decir qué se descarta.');
  }

  if (p.etapa === 'cancelado') return ok(p);
  const fila = { ...p, etapa: 'cancelado', sync: 0 };
  if (nota) fila.notas = (p.notas ? p.notas + '\n' : '') + nota;
  const r = await DB.poner('proyectos', fila);
  if (!r.ok) return r;
  await encolar('actualizar', r.valor);
  await anotar({ accion: 'descarto', entidad_id: p.id,
    titulo: (p.nombre || p.folio_local) + ' se canceló',
    detalle: 'Estaba en ' + (ETAPA_NOMBRE[p.etapa] || p.etapa) + (nota ? ' · ' + nota : ''),
    antes: p.etapa, despues: 'cancelado' });
  return ok(r.valor);
}

/* ============================================================================
   Leer
   ============================================================================ */

/* Sin acentos y en minúsculas, las dos cosas. Un buscador que no encuentra «parentesis»
   porque el negocio se escribió «Paréntesis» es un buscador que nadie vuelve a usar, y de
   ahí a bajar la lista con el dedo hasta encontrarlo hay un paso. */
const plano = s => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export async function obtener(id) {
  if (!id) return null;
  return DB.obtener('proyectos', id);
}

/* ----- ¿Este proyecto tiene punto en el mapa? -----
   Una sola respuesta para toda la app. La pregunta parece trivial y no lo es: un proyecto sin
   ubicar se guarda con `lat: null` (línea 361), y `Number(null)` es 0, así que la prueba
   ingenua `isFinite(Number(p.lat))` contesta que SÍ tiene pin. El Mapa ya lo había descubierto
   y traía su propia versión; el Tablero no, y por eso su botón «Ver la ruta en el mapa» decía
   «0 sin ubicar» mientras el Mapa, con los mismos datos, decía «3 sin ubicar». Dos cifras del
   mismo hecho que no cuadraban entre dos pantallas.
   El cero explícito también se rechaza: 0,0 es lo que sale de parsear dos ceros de relleno y
   cae en el Atlántico frente a Ghana, que es el pin en medio del océano que el Mapa existe
   para no pintar. */
const coord = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
export function tienePin(p) {
  if (!p) return false;
  const la = coord(p.lat), ln = coord(p.lng);
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
}

/**
 * @param {{etapa?:string, etapas?:string[], vivos?:boolean, desde?:string, hasta?:string,
 *          sinFecha?:boolean, sinUbicar?:boolean, conPendiente?:boolean, texto?:string}} [filtro]
 * @returns {Promise<Object[]>} vacío si la base no abrió. NUNCA lanza.
 */
export async function listar(filtro = {}) {
  const f = filtro && typeof filtro === 'object' ? filtro : {};

  /* Un solo valor de etapa usa el índice; una lista de etapas no, porque abrir un cursor
     por cada una y fusionar cuesta más que recorrer. */
  const opts = (f.etapa && !f.etapas)
    ? { indice: 'porEtapa', rango: rango(f.etapa) }
    : {};
  let filas = await DB.listar('proyectos', opts);
  if (!filas.length) return [];

  /* Los cancelados NO se esconden por su cuenta. Quien pinta el tablero pide `vivos:true`;
     quien pregunta «¿esta cotización ya se decidió?» necesita ver la lápida, y si `listar()`
     la escondiera, la tarjeta de «sin decidir» le volvería a preguntar por cada cotización
     que alguien ya rechazó. Esconder el descarte es lo mismo que no haberlo guardado. */
  if (f.vivos) filas = filas.filter(p => p.etapa !== 'cancelado');
  if (f.etapa && f.etapas) filas = filas.filter(p => p.etapa === f.etapa);
  if (Array.isArray(f.etapas) && f.etapas.length) {
    const s = new Set(f.etapas);
    filas = filas.filter(p => s.has(p.etapa));
  }
  if (esISO(f.desde)) filas = filas.filter(p => String(p.fecha_ganado || '') >= f.desde);
  if (esISO(f.hasta)) filas = filas.filter(p => String(p.fecha_ganado || '') <= f.hasta);
  if (f.sinUbicar) filas = filas.filter(p => !tienePin(p));
  if (f.conPendiente) filas = filas.filter(p => num(p.pago_pendiente) > 0);

  if (f.sinFecha) {
    /* «Sin fecha» es una pregunta sobre las instalaciones, no sobre el proyecto: el
       proyecto no guarda la fecha —la guarda la instalación, que es su dueña— y por eso
       hay que ir a leerlas. Una instalación cancelada no cuenta como fecha: si se canceló,
       el proyecto volvió a estar sin fecha y eso es justo lo que la tarjeta pregunta. */
    const inst = await DB.listar('instalaciones');
    const con = new Set(inst.filter(i => i && i.fecha && i.estado !== 'cancelada')
                            .map(i => i.proyecto_id));
    filas = filas.filter(p => !con.has(p.id));
  }

  const q = plano(f.texto).trim();
  if (q) {
    filas = filas.filter(p => plano([p.nombre, p.contacto, p.negocio, p.folio_local,
      p.tel, p.dir_texto, p.notas, (p.tipo_trabajo || []).join(' ')].join(' ')).includes(q));
  }

  /* Lo último que se ganó, primero. Con la misma fecha manda el sello, que sí distingue. */
  return filas.sort((a, b) =>
    String(b.fecha_ganado || '').localeCompare(String(a.fecha_ganado || '')) ||
    (b.creado_en || 0) - (a.creado_en || 0));
}

function rango(valor) {
  try { return IDBKeyRange.only(valor); } catch (_) { return null; }
}

/* ============================================================================
   Actualizar
   ============================================================================ */

/* Lo que este módulo deja escribir, y nada más. Un parche con un campo que no está aquí se
   rechaza completo en vez de aplicarse a medias: media escritura deja la pantalla
   enseñando un estado guardado que no se guardó, y eso no se descubre hasta que alguien
   recarga. */
const ESCRIBIBLES = new Set([
  'nombre', 'contacto', 'negocio', 'tel', 'notas', 'tipo_trabajo', 'compromiso_texto',
  'dir_texto', 'entrecalles', 'maps_url', 'lat', 'lng', 'geo_fuente', 'anti_pactado',
  'cuenta', 'estatus_notion', 'notion_page_id', 'notion_estado', 'pct_comision',
  'fecha_ganado', 'plazo_k', 'sync',
]);

/* Cada bloqueo con su razón escrita, porque el mensaje se le enseña a una persona que está
   intentando hacer su trabajo y «campo no permitido» no le dice qué hacer en su lugar. */
const BLOQUEADOS = {
  origen: 'El origen es la copia congelada de la cotización firmada y no se edita. Si la cotización cambió, usa «recalcular material».',
  folio_global: 'El folio identifica el proyecto y no se cambia: si cambiara, la plataforma dejaría de reconocer su cotización.',
  folio_local: 'El folio es el que el cliente tiene en la mano. Se cambia en el cotizador o en ningún lado.',
  creado_en: 'La fecha de creación es un hecho, no un dato editable.',
  id: 'El identificador no se cambia.',
  dispositivo: 'El dispositivo que ganó el proyecto es parte de su folio y no se reescribe.',
  empresa_id: 'La empresa se cambia en ajustes.',
  etapa: 'La etapa se mueve con «avanzar etapa»: al llegar a cortado salen los materiales del almacén, y un cambio directo dejaría el almacén sin descontar.',
  pago_pendiente: 'El pago pendiente es una fórmula de Notion. Se lee, nunca se escribe aquí: dos versiones de la misma fórmula empiezan a dar dos respuestas.',
  comision_restante: 'La comisión restante es una fórmula de Notion. Se lee, nunca se escribe aquí.',
  sub: 'El importe viene congelado de la cotización firmada. Para cambiarlo, reautoriza en el cotizador y usa «recalcular».',
  neto: 'El importe viene congelado de la cotización firmada. Para cambiarlo, reautoriza en el cotizador y usa «recalcular».',
  precio_auth: 'El precio autorizado es lo que una persona firmó. Se cambia autorizando otra vez en el cotizador.',
  iva: 'El IVA es parte de la cotización firmada y viaja con ella.',
};

/* Qué campos toca cada rol. No es seguridad —en fase 1 cualquiera cambia su rol— es ruido:
   que fabricación no mueva por accidente la cuenta de cobro y que pagos no mueva un pin. */
const CAMPOS_ROL = {
  direccion: null,   // todo lo escribible
  fabricacion: new Set(['notas', 'lat', 'lng', 'geo_fuente', 'maps_url', 'entrecalles', 'plazo_k', 'sync']),
  pagos: new Set(['notas', 'cuenta', 'estatus_notion', 'notion_page_id', 'notion_estado',
                  'pct_comision', 'sync']),
};

/**
 * Parche superficial. Rechaza `origen`, `folio_global`, `creado_en` y los campos de fórmula
 * de Notion.
 * @returns {Promise<Resultado>} valor = el proyecto guardado
 */
export async function actualizar(id, parche) {
  if (!id) return mal('DATO_INVALIDO', 'Falta decir qué proyecto se está cambiando.');
  if (!parche || typeof parche !== 'object') return mal('DATO_INVALIDO', 'No hay nada que cambiar.');
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');

  const rol = Prefs.rol();
  const permitidos = CAMPOS_ROL[rol];
  const campos = Object.keys(parche);
  if (!campos.length) return mal('DATO_INVALIDO', 'No hay nada que cambiar.');

  for (const k of campos) {
    if (BLOQUEADOS[k]) return mal('DATO_INVALIDO', BLOQUEADOS[k]);
    if (!ESCRIBIBLES.has(k)) return mal('DATO_INVALIDO', 'El campo «' + k + '» no se edita desde aquí.');
    if (permitidos && !permitidos.has(k)) {
      return mal('ROL_SIN_PERMISO', 'Con el rol de ' + (Prefs.ROL_NOMBRE[rol] || rol) +
        ' no se cambia «' + k + '». Cámbialo desde el dispositivo de Dirección.');
    }
  }

  const fila = { ...p };
  for (const k of campos) {
    let v = parche[k];
    if (k === 'lat' || k === 'lng') {
      /* null es una respuesta válida y significa «no sabemos dónde está», que es distinto
         de 0,0: ese par es una isla en el Atlántico y un pin ahí se ve igual de convincente
         que uno bueno. */
      v = (v === null || v === '' || !isFinite(Number(v))) ? null : Number(v);
    } else if (k === 'tipo_trabajo') {
      if (!Array.isArray(v)) return mal('DATO_INVALIDO', 'El tipo de trabajo es una lista, no un solo valor: un proyecto lleva letras Y bastidor.');
      v = TIPOS_TRABAJO.filter(t => v.includes(t));
      if (!v.length) return mal('DATO_INVALIDO', 'Ese tipo de trabajo no es uno de los siete de Notion.');
    } else if (k === 'anti_pactado' || k === 'pct_comision') {
      v = num(v);
    } else if (k === 'fecha_ganado') {
      if (!esISO(v)) return mal('DATO_INVALIDO', 'La fecha va como año-mes-día.');
    } else if (k === 'plazo_k') {
      /* Vacío o null es «vuelve al propuesto», y es una respuesta válida. Lo demás tiene que
         ser uno de los cinco cubos. */
      if (v === null || v === '' || v === undefined) v = null;
      else if (plazoValido(v) === null) {
        return mal('DATO_INVALIDO', 'El plazo es uno de los cinco: 1, 1.5, 2, 2.5 o 3+ semanas (1 a 5). Para volver al propuesto, déjalo vacío.');
      } else v = plazoValido(v);
    }
    fila[k] = v;
  }
  fila.sync = 0;

  const r = await DB.poner('proyectos', fila);
  if (!r.ok) return r;
  /* `sync` es plomería, no un cambio que alguien hizo. Lo demás sí se anota, con el valor de
     antes y el de después cuando el parche toca UN campo, que es como se escribe casi siempre
     (la cuenta, el estatus, el plazo). */
  const tocados = campos.filter(k => k !== 'sync');
  await encolar('actualizar', r.valor, tocados);
  if (tocados.length) {
    const uno = tocados.length === 1 ? tocados[0] : null;
    await anotar({ accion: 'cambio', entidad_id: p.id,
      titulo: (p.nombre || p.folio_local) + ': ' + (uno ? (CAMPO_NOMBRE[uno] || uno) : 'se cambiaron ' + tocados.length + ' datos'),
      detalle: uno
        ? textoValor(p[uno]) + ' → ' + textoValor(fila[uno])
        : tocados.map(k => CAMPO_NOMBRE[k] || k).join(', '),
      antes: uno ? (p[uno] === undefined ? null : p[uno]) : null,
      despues: uno ? (fila[uno] === undefined ? null : fila[uno]) : null });
  }
  return ok(r.valor);
}

/* Cómo se llama cada campo cuando se lee en la bitácora. Lo que no está aquí sale con su
   clave, que es peor pero no miente. */
const CAMPO_NOMBRE = {
  cuenta: 'cuenta de cobro', estatus_notion: 'estatus de Notion', plazo_k: 'plazo de taller',
  anti_pactado: 'anticipo pactado', pct_comision: '% de comisión', notas: 'notas',
  fecha_ganado: 'fecha en que se ganó', lat: 'ubicación', lng: 'ubicación', maps_url: 'link de Maps',
  geo_fuente: 'origen de la ubicación', entrecalles: 'entre calles', dir_texto: 'dirección',
  nombre: 'nombre', contacto: 'contacto', negocio: 'negocio', tel: 'teléfono',
  tipo_trabajo: 'tipo de trabajo', compromiso_texto: 'compromiso de entrega',
  notion_page_id: 'página de Notion', notion_estado: 'estado en Notion',
};
const textoValor = v => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'number') return String(v);
  return String(v).slice(0, 80);
};

/* ============================================================================
   La etapa, y las salidas de material que cuelgan de ella
   ============================================================================ */

/* Hasta dónde mueve cada rol. Fabricación llega a 'listo' y no más: 'instalado' lo marca
   quien estuvo en la obra y de ahí cuelga la cobranza. Pagos no mueve obra: lo que mueve es
   `estatus_notion`, que es el otro eje. */
const TOPE_ROL = { direccion: null, fabricacion: 'listo', pagos: false };

/** Si este rol puede marcar esta etapa. Se exporta para que una pantalla pueda preguntar
 *  ANTES de pintar el botón, y así enseñar la razón en vez de un botón apagado. La política
 *  sigue viviendo aquí: `avanzarEtapa` la vuelve a preguntar y es la que manda. */
export function puedeMover(rol, etapa) {
  const tope = TOPE_ROL[rol];
  if (tope === null || tope === undefined) return true;
  if (tope === false) return false;
  const d = ORDEN[etapa], t = ORDEN[tope];
  return d !== undefined && t !== undefined && d <= t;
}

/**
 * Emite las salidas de material de un proyecto.
 *
 * La idempotencia NO es una bandera en el proyecto: es que el requerimiento quede en
 * `'consumido'`. Y se marca uno por uno, justo después de que su movimiento entró en el
 * libro, no todos al final: si la base se cierra a la mitad, lo que ya salió queda marcado
 * y el siguiente intento no lo resta dos veces. Un material restado dos veces es una lista
 * de compra que pide lo que ya está en el taller, y con eso el almacén deja de servir.
 *
 * @param {Object} p proyecto
 * @param {'derivado'|'manual'} origenMov de dónde salió la orden
 * @param {string} nota qué decir en el libro
 */
async function emitirSalidas(p, origenMov, nota) {
  const [Mat, St] = await Promise.all([mod('material'), mod('stock')]);
  if (!Mat || typeof Mat.requerimientos !== 'function') return { movimientos: 0, fallidos: 0 };
  if (!St || typeof St.mover !== 'function') return { movimientos: 0, fallidos: 0 };

  const reqs = await Mat.requerimientos(p.id);
  let movimientos = 0, fallidos = 0;

  for (const req of reqs) {
    if (!req || req.estado === 'consumido') continue;
    const cant = (req.cantidad_ajustada === null || req.cantidad_ajustada === undefined)
      ? num(req.cantidad_compra) : num(req.cantidad_ajustada);
    /* Una línea en cero no se emite, pero tampoco desaparece: se queda 'calculado' para
       que la pantalla de material la siga enseñando con su «requiere_dato». Un movimiento
       de cero solo ensucia el libro. */
    if (!(cant > 0)) continue;

    const rm = await St.mover({
      material_id: req.material_id,
      tipo: 'salida',
      /* Con signo, y negativo: una salida resta. La unidad viaja en la fila porque es lo
         que evita que una suma acumule metros donde se esperaban rollos. */
      cantidad: -cant,
      unidad_compra: req.unidad_compra,
      proyecto_id: p.id,
      requerimiento_id: req.id,
      origen: origenMov,
      nota,
    });
    if (!rm || !rm.ok) { fallidos++; continue; }

    movimientos++;
    const fila = { ...req, estado: 'consumido', sync: 0 };
    await DB.poner('requerimientos', fila);
    const S = await mod('sync');
    if (S && typeof S.encolar === 'function') {
      try {
        await S.encolar({ id: DB.nuevoId('op'), tipo: 'actualizar', almacen: 'requerimientos',
          registro_id: fila.id, datos: fila, esperado: null, ts: Date.now(),
          intentos: 0, ultimo_error: '' });
      } catch (_) {}
    }
  }
  return { movimientos, fallidos };
}

/**
 * Mueve la etapa. Al ALCANZAR 'cortado' emite las salidas de material del requerimiento,
 * una sola vez.
 *
 * «Alcanzar» y no «tocar», y la diferencia importa: §8.2 le da a fabricación el rango
 * `ganado → listo`, así que puede pasar de 'ganado' a 'listo' con un toque, y si la salida
 * solo se emitiera al escribir la palabra 'cortado' el almacén nunca se descontaría por el
 * camino más corto que la propia pantalla ofrece.
 *
 * @returns {Promise<Resultado>} valor = {proyecto, movimientos:number}
 */
export async function avanzarEtapa(id, etapa) {
  if (!id) return mal('DATO_INVALIDO', 'Falta decir qué proyecto avanza.');
  if (!ETAPAS.includes(etapa)) {
    return mal('DATO_INVALIDO', 'No existe la etapa «' + etapa + '». Son: ' +
      VIVAS.map(e => ETAPA_NOMBRE[e]).join(', ') + '.');
  }
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');

  const rol = Prefs.rol();
  /* Cancelar es la misma decisión que «no se dio» y pasa por la misma puerta, para que la
     lápida quede igual venga del tablero o de la tarjeta de sin decidir. Se le devuelve la
     forma que promete esta función: quien la llamó espera {proyecto, movimientos}. */
  if (etapa === 'cancelado') {
    const rc = await descartar(id, '');
    return rc.ok ? ok({ proyecto: rc.valor, movimientos: 0 }) : rc;
  }
  if (!puedeMover(rol, etapa)) {
    return mal('ROL_SIN_PERMISO', 'Con el rol de ' + (Prefs.ROL_NOMBRE[rol] || rol) +
      ' no se marca «' + (ETAPA_NOMBRE[etapa] || etapa) + '». Eso lo marca Dirección.');
  }
  /* Volver a tocar la etapa en la que ya está no es un error ni una escritura: es el doble
     toque de un dedo en un teléfono. Se contesta que sí y no se escribe nada. */
  if (p.etapa === etapa) return ok({ proyecto: p, movimientos: 0 });

  const antes = ORDEN[p.etapa];
  const ahora = ORDEN[etapa];
  const cruzaCorte = ahora !== undefined && ahora >= ORDEN.cortado &&
                     (antes === undefined || antes < ORDEN.cortado);

  const fila = { ...p, etapa, sync: 0 };
  const r = await DB.poner('proyectos', fila);
  if (!r.ok) return r;
  await encolar('actualizar', r.valor);

  let movimientos = 0;
  if (cruzaCorte) {
    const e = await emitirSalidas(r.valor, 'manual',
      'Salida al cortar ' + (p.folio_local || p.nombre) + ' · ' + Prefs.sello());
    movimientos = e.movimientos;
  }
  const retrocede = antes !== undefined && ahora !== undefined && ahora < antes;
  await anotar({ accion: 'etapa', entidad_id: p.id,
    titulo: (p.nombre || p.folio_local) + (retrocede ? ' regresó a ' : ' pasó a ') + (ETAPA_NOMBRE[etapa] || etapa),
    detalle: 'Estaba en ' + (ETAPA_NOMBRE[p.etapa] || p.etapa) +
      (movimientos ? ' · salieron ' + movimientos + (movimientos === 1 ? ' material' : ' materiales') + ' del almacén' : ''),
    antes: p.etapa, despues: etapa });
  return ok({ proyecto: r.valor, movimientos });
}

/**
 * LA DEGRADACIÓN DEFINIDA, y es lo que hace que este módulo no muera si nadie toca nunca
 * la etapa.
 *
 * El toque de «ya lo corté» es el único que puede no darse: fabricación tiene las manos
 * ocupadas y el teléfono en la mesa. Si de eso dependiera el descuento del almacén, el
 * almacén iría sobrando material para siempre y en tres semanas nadie volvería a creerle a
 * la lista de compra. Así que a un día de la instalación la plataforma da por hecho que el
 * material salió —porque salió: el anuncio se instala mañana— y emite las salidas con
 * `origen:'derivado'` y una nota que dice exactamente eso. El módulo no muere: se degrada
 * y lo dice, en el libro, donde no se puede confundir con un conteo.
 *
 * Lo que NO hace es mover la etapa. Nadie cortó nada que la plataforma haya visto, y
 * escribir 'cortado' aquí sería inventar un hecho de obra para justificar un movimiento de
 * almacén. Se mueve lo que se descuadra si no se mueve, y se dice de dónde salió.
 *
 * La llama `reglas.js` al evaluar. Idempotente: los requerimientos ya consumidos no se
 * vuelven a emitir, corra una vez o diez.
 *
 * @param {string} [hoy] 'YYYY-MM-DD', para poder probarla
 * @returns {Promise<Resultado>} valor = {proyectos, movimientos, sin_stock}
 */
export async function emitirSalidasDerivadas(hoy) {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  const dia = esISO(hoy) ? hoy : hoyISO();

  const inst = await DB.listar('instalaciones');
  /* Mañana o antes. «Antes» también, y a propósito: una instalación de ayer que nadie
     confirmó necesita el descuento más que la de mañana. El sesgo del sistema es el falso
     positivo —un movimiento derivado se corrige con un ajuste, un almacén que no descontó
     se descubre cuando falta material— y aquí se aplica. */
  const cercanas = inst.filter(i => i && esISO(i.fecha) && i.estado !== 'cancelada' &&
                                    diasHastaDesde(i.fecha, dia) <= 1);
  if (!cercanas.length) return ok({ proyectos: 0, movimientos: 0, sin_stock: 0 });

  let proyectos = 0, movimientos = 0, sinStock = 0;
  const vistos = new Set();

  for (const i of cercanas) {
    if (!i.proyecto_id || vistos.has(i.proyecto_id)) continue;
    vistos.add(i.proyecto_id);
    const p = await DB.obtener('proyectos', i.proyecto_id);
    if (!p || p.etapa === 'cancelado') continue;

    const e = await emitirSalidas(p, 'derivado',
      'Derivado, nunca confirmado: se instala ' + i.fecha + ' y nadie marcó el corte.');
    if (e.movimientos) { proyectos++; movimientos += e.movimientos; }
    sinStock += e.fallidos;
  }
  return ok({ proyectos, movimientos, sin_stock: sinStock });
}

/* `diasHasta` de ui.js mide contra el reloj de hoy. Aquí hace falta medir contra un día
   dado —para poder probar la degradación sin cambiarle la hora al teléfono— y la resta se
   hace sobre los campos, nunca con `new Date('2026-08-23')`, que se lee como UTC y en
   México devuelve el día anterior. */
function diasHastaDesde(iso, base) {
  const a = partesISO(iso), b = partesISO(base);
  if (!a || !b) return Infinity;
  const ta = Date.UTC(a.a, a.m - 1, a.d), tb = Date.UTC(b.a, b.m - 1, b.d);
  return Math.round((ta - tb) / 86400000);
}

/* ============================================================================
   Resincronizar
   ============================================================================ */

/**
 * Qué campos del dinero de la hoja movió un recálculo, con los nombres que `aNotion` entiende.
 * PURA, para que la prueba de node la corra.
 *
 * Solo los que CAMBIARON, y no los cuatro siempre: en la hoja PAGOS corrige a mano el
 * subtotal, el nombre o el anticipo, y un recálculo que no tocó el precio —se ocultó una
 * partida del PDF, se cambió una medida sin precio— no tiene por qué pisar esa corrección.
 * El anticipo se compara contra el de la COTIZACIÓN de antes y no contra el del proyecto:
 * el del proyecto puede ser justo el que PAGOS corrigió y bajó de la hoja, y compararlo con
 * el de la cotización lo mandaría de vuelta en cada recálculo.
 */
export function camposDelRecalculo(antes, despues) {
  const a = antes || {}, d = despues || {};
  const campos = [];
  if (String(a.nombre || '') !== String(d.nombre || '')) campos.push('nombre');
  if (num(a.sub) !== num(d.sub)) campos.push('sub');
  if ((a.iva !== false) !== (d.iva !== false)) campos.push('iva');
  if (num(a.origen && a.origen.anti) !== num(d.origen && d.origen.anti)) campos.push('anti_pactado');
  return campos;
}

/**
 * Recalcula con el origen de HOY. Es el botón del aviso R6: «COT-0007 se editó después de
 * ganarse; el material calculado ya no corresponde».
 *
 * Reemplaza la copia congelada por la entrada de hoy y vuelve a derivar nombre, tipos,
 * importes y material. Es la única puerta por la que el importe de un proyecto puede
 * cambiar, y por eso está: sin ella, corregir una cotización mal autorizada dejaría al
 * proyecto mostrando para siempre un número que ya nadie firma.
 *
 * Lo que NO pisa: `etapa`, `notas`, `plazo_k`, el espejo de Notion, y el pin si alguien lo
 * puso a mano. Un pin movido con el dedo es la única ubicación que un humano midió; volver
 * a sacarlo del link sería tirar el dato bueno y quedarse con el que ya había fallado. Y
 * `plazo_k` es de la misma clase: si fabricación dijo que son tres semanas, recalcular el
 * material no tiene por qué olvidarlo.
 *
 * @returns {Promise<Resultado>} valor = {proyecto, cambio:boolean, lineas:number}
 */
export async function resincronizar(id) {
  if (!id) return mal('DATO_INVALIDO', 'Falta decir qué proyecto se recalcula.');
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');

  const folio = (p.origen && p.origen.folio) || p.folio_local;
  const hoyEntrada = Cot.porFolio(folio);
  if (!hoyEntrada) {
    /* La entrada desapareció: alguien restauró un respaldo viejo o la borró del historial.
       El proyecto sigue completo —para eso se congeló— y no se toca. Sembrar lo que nunca
       nació es ayudar; reemplazar una copia buena por nada es no hacerle caso a nadie. */
    return mal('NO_ENCONTRADO', folio + ' ya no está en el historial de este dispositivo, así que no hay con qué recalcular. El proyecto se queda como está.');
  }
  if (!Array.isArray(hoyEntrada.items) || !hoyEntrada.items.length) {
    return mal('DATO_INVALIDO', folio + ' quedó sin partidas en el cotizador. Ábrela, complétala y vuelve a autorizarla.');
  }

  const origen = congelar(hoyEntrada);
  if (!origen) return mal('DATO_INVALIDO', 'No se pudo copiar la cotización de hoy.');

  const antes = Cot.huellaDe(p.origen || {});
  const ahora = Cot.huellaDe(origen);
  const tipos = tiposDerivados(origen.items);

  const fila = {
    ...p,
    origen,
    tipo_trabajo: tipos,
    nombre: nombreDerivado(origen, tipos),
    contacto: String(origen.cliente || '').trim() || p.contacto,
    negocio: String(origen.proy || '').trim() || p.negocio,
    tel: String(origen.tel || '').trim() || p.tel,
    compromiso_texto: String(origen.entrega || ''),
    dir_texto: String(origen.dirRaw || origen.direccion || '') || p.dir_texto,
    entrecalles: String(origen.entrecalles || '') || p.entrecalles,
    maps_url: String(origen.maps || '') || p.maps_url,
    sub: num(origen.sub),
    neto: num(origen.neto),
    precio_auth: Cot.totalVendido(origen),
    anti_pactado: num(origen.anti) || num(p.anti_pactado),
    iva: origen.iva !== false,
    sync: 0,
  };

  if (p.geo_fuente !== 'manual') {
    const u = parseGmaps(origen.maps || '');
    const tiene = !!(u && !u.corto && isFinite(u.lat) && isFinite(u.lng));
    fila.lat = tiene ? u.lat : p.lat;
    fila.lng = tiene ? u.lng : p.lng;
    fila.geo_fuente = tiene ? (u.fuente || 'maps_pin') : p.geo_fuente;
  }

  const r = await DB.poner('proyectos', fila);
  if (!r.ok) return r;
  /* Con `campos`, y los que cambiaron. Sin ellos `aNotion` no manda ni el nombre ni el dinero
     de una fila que ya existe (es su regla, ver puente.js): el proyecto enseñaba el precio
     nuevo y la hoja —el libro mayor— seguía cobrando el viejo, aunque este comentario ya
     llamaba a esto «la única puerta por la que el importe cambia». */
  await encolar('actualizar', r.valor, camposDelRecalculo(p, r.valor));

  let lineas = 0;
  const Mat = await mod('material');
  if (Mat && typeof Mat.recalcular === 'function') {
    const rm = await Mat.recalcular(r.valor.id);
    if (rm && rm.ok && rm.valor && Array.isArray(rm.valor.lineas)) lineas = rm.valor.lineas.length;
  }

  return ok({ proyecto: r.valor, cambio: antes !== ahora, lineas });
}

/* ============================================================================
   LA VENTA QUE LA HOJA YA NO TIENE, Y LA QUE ESTÁ DOS VECES

   Tres casos que se quedaban para siempre sin salida, con la misma decisión del dueño para
   los tres: nada se borra ni se archiva solo. Se marca, se avisa, y en la ficha está el botón
   que hace lo correcto (quién lo aprieta, en `soloDireccion`). La única excepción es la copia
   repetida que no tiene NADA propio y que es, sin duda, la misma venta (el caso 3): juntarla
   no es borrar una venta, es quitar la segunda tarjeta de una sola, con todo lo que colgaba de
   ella ya pasado a la primera.

   1. La venta de ESTE teléfono cuya fila alguien borró en la hoja. El proyecto guarda el
      folio de una fila muerta (`notion_page_id`), cada cambio rebota como NO_ENCONTRADO y se
      aparta como rechazado, y el consejo de la hoja —«vuelve a registrarla desde el
      cotizador»— no lleva a ningún lado: `ganar` contesta DUPLICADO. El folio NO se borra
      solo (ver puente.js: el siguiente cambio pediría un alta y resucitaría una venta que
      alguien quitó a propósito); se marca `hoja_perdida` y Dirección elige entre volver a
      darla de alta y dejarla fuera.
   2. La tarjeta que el puente IMPORTÓ de una fila viva (`proy-hoja-V-…`) y cuya fila ya no
      viene. Se marca igual, pero solo después de una bajada COMPLETA: una a medias no dice
      qué filas faltan, dice qué filas no se alcanzaron a leer.
   3. La copia importada de una venta que este teléfono YA tenía como suya —antes de los
      arreglos de septiembre de 2026 pasaba, y Control la contaba dos veces—. Si juntarlas no
      pierde nada (`loQueSePerderia` vacío) Y es seguro que es la misma venta
      (`mismaVentaQueLaFila`: la fila trae el folio de cotización de la de aquí, o su mismo
      nombre), se juntan solas: lo que colgaba de la copia pasa al proyecto de verdad y la
      copia se va. Si algo se perdería, o si lo único en común es el folio de la hoja —que
      pudo repartirse dos veces—, se marca `duplicado_de` y espera a Dirección.
   4. La venta de este teléfono que está en DOS filas de la hoja: Dirección la volvió a dar de
      alta y después alguien deshizo el borrado de la vieja. La bajada se queda con la fila que
      tenía, se marca `hoja_doble` y Dirección borra en la hoja la que sobra.

   Las marcas son de ESTE teléfono y no viajan: se escriben con `DB` directo, sin encolar,
   por lo mismo que las del relevo (ver `espejarLocal` en puente.js). No son un dato del
   negocio: son «la hoja y este teléfono no cuadran aquí». Por eso lo que se decide de una
   tarjeta IMPORTADA cuya fila ya no está lo puede decidir quien tenga el teléfono en la mano
   (ver `soloDireccion`): nadie lo puede decidir desde otro.
   ============================================================================ */

/* La tarjeta que nació de una fila de la hoja y no de una cotización. Las dos señas, por si un
   respaldo viejo trae la una sin la otra. */
const esImportado = p => !!p && (p.de_hoja === true || String(p.id || '').startsWith('proy-hoja-'));

/**
 * Qué aviso de la hoja lleva el proyecto: 'repetida', 'perdida', 'doble', 'fuera' o ''. Una
 * sola respuesta para la ficha, la tarjeta del tablero y la cuenta de la pestaña (la regla de
 * «Qué atender» lleva su copia en reglas.js, que no importa este archivo, y pruebas/reglas.mjs
 * comprueba que digan lo mismo). Una lápida («No se dio») no avisa: ya se decidió.
 * 'doble' es la venta de aquí que está en DOS filas de la hoja (`hoja_doble`, ver
 * `revisarContraLaHoja`): pasa cuando Dirección la vuelve a dar de alta y alguien deshace
 * después el borrado de la fila vieja.
 * PURA.
 */
export function avisoDeHoja(p) {
  if (!p || p.etapa === 'cancelado') return '';
  if (p.duplicado_de && typeof p.duplicado_de === 'object') return 'repetida';
  if (p.hoja_perdida && typeof p.hoja_perdida === 'object') return 'perdida';
  if (p.hoja_doble && typeof p.hoja_doble === 'object' && Array.isArray(p.hoja_doble.folios) && p.hoja_doble.folios.length > 1) return 'doble';
  if (p.fuera_de_hoja) return 'fuera';
  return '';
}

/**
 * La marca de «ya no está en la hoja». Si ya estaba la MISMA —mismo motivo, misma fila—
 * devuelve la de antes, con su fecha: el aviso dice desde cuándo, y cada cambio que rebota
 * no puede volver a empezar la cuenta. PURA.
 * @param {Object|null} previa  la que el proyecto ya trae
 * @param {'borrada'|'de_otra'|'no_bajo'} motivo
 */
export function marcaPerdida(previa, motivo, folio, mensaje, ahora) {
  const f = String(folio || '').trim();
  if (previa && typeof previa === 'object' && previa.motivo === motivo && previa.folio === f) return previa;
  return { motivo: String(motivo || ''), folio: f, desde: Number(ahora) || 0,
           mensaje: String(mensaje || '').slice(0, 300) };
}

/**
 * Las tarjetas importadas cuya fila no vino en una bajada COMPLETA. PURA.
 *
 * Sin un solo folio visto no se devuelve nada, y es a propósito: una hoja que contestó «ok» con
 * cero filas no es una hoja vacía —la de verdad trae tres años de ventas—, es una lectura que
 * salió mal, y marcarlas todas sería avisar dieciséis veces de algo que no pasó. Lo que Dirección ya decidió dejar
 * (`fuera_de_hoja`) no se vuelve a preguntar, y la lápida tampoco.
 * @param {Object[]} proyectos
 * @param {Set<string>|string[]} folios  los folios de la hoja (V-042) que trajo la bajada
 */
export function huerfanasDeLaHoja(proyectos, folios) {
  const vistos = folios instanceof Set ? folios : new Set((Array.isArray(folios) ? folios : []).map(String));
  if (!vistos.size) return [];
  return (Array.isArray(proyectos) ? proyectos : []).filter(p =>
    esImportado(p) && p.etapa !== 'cancelado' && !p.fuera_de_hoja &&
    String(p.folio_hoja || '').trim() && !vistos.has(String(p.folio_hoja).trim()));
}

/* El nombre, para compararlo: sin acentos, sin mayúsculas y sin espacios de más. Nada más
   agresivo —quitar el «(Tipo)» del final o la puntuación— porque dos ventas del mismo cliente
   se llaman igual salvo por el tipo, y ésas son justo las que no hay que confundir. */
const nombreParaComparar = s => plano(s).replace(/\s+/g, ' ').trim();

/**
 * Qué tan seguro es que la fila `venta` (un renglón de `ventas_hoja`) sea la venta del
 * proyecto `p` de este teléfono. PURA. La usan el tercer camino de `bajar` en puente.js —a
 * quién le cae el dinero de la fila— y `repetidasDeLaHoja` —qué se junta solo—, y tienen que
 * decir lo mismo: si la bajada ata la fila a un proyecto y la revisión no, o al revés, la
 * copia se queda en el tablero sin que nadie la refresque, o se junta con quien no es.
 *
 *   'folio'       la fila trae en «Folio cotizacion» el folio global de `p`. Es la llave.
 *   'nombre'      la fila no trae folio de cotización (o trae la huella del defecto, su propio
 *                 folio de hoja), su folio de hoja es el `notion_page_id` de `p` y se llama igual.
 *   'confirmada'  lo mismo, sin el nombre, pero ya se sabe que es la misma (`hoja_confirmada`):
 *                 lo dijo Dirección (ver `juntar`), o la bajada la ató una vez por su nombre y lo
 *                 anotó (ver `bajar` en puente.js). El nombre se corrige en la hoja y no baja, y
 *                 sin la nota la corrección desataba la venta en la siguiente bajada.
 *   'debil'       solo coincide el folio de la hoja. Es exactamente el caso del folio que se
 *                 repartió dos veces antes de la marca de folios: la fila puede ser de otra
 *                 venta que se dio de alta a mano, sin folio de cotización. No ata sola.
 *   ''            no es: la fila dice ser de OTRA cotización, o no tiene nada que ver.
 *
 * El folio de la hoja de `p` es el de hoy (`notion_page_id`) o uno que tuvo antes de que
 * Dirección la volviera a dar de alta (`folios_previos`, ver `volverADarDeAlta`): si alguien
 * deshace el borrado de la fila vieja, ésa sigue siendo de esta venta. Sin eso, la fila
 * restaurada sin folio de cotización entraba como OTRA tarjeta, y nada decía que la venta
 * estaba dos veces en la hoja.
 * @returns {'folio'|'nombre'|'confirmada'|'debil'|''}
 */
export function mismaVentaQueLaFila(p, venta) {
  if (!p || !venta) return '';
  const fh = String(venta.folio_hoja || '').trim();
  const fc = String(venta.folio_cotizacion || '').trim();
  if (fc && fc !== fh) return fc === String(p.folio_global || '') ? 'folio' : '';
  if (!fh || !foliosDeHoja(p).has(fh)) return '';
  if (String(p.hoja_confirmada || '') === fh) return 'confirmada';
  const n = nombreParaComparar(p.nombre);
  if (n && n === nombreParaComparar(venta.nombre)) return 'nombre';
  return 'debil';
}

/** Los folios de la hoja que son de `p`: el de hoy y los que tuvo antes. PURA. */
export function foliosDeHoja(p) {
  const out = new Set();
  if (!p) return out;
  const hoy = String(p.notion_page_id || '').trim();
  if (hoy) out.add(hoy);
  for (const f of (Array.isArray(p.folios_previos) ? p.folios_previos : [])) {
    const x = String(f || '').trim();
    if (x) out.add(x);
  }
  return out;
}

/**
 * Si la bajada le echa la fila `venta` al proyecto de aquí `p`, y por qué, o '' si no. PURA. Es la
 * regla del primer camino de `bajar` en puente.js (la fila trae su folio de cotización) y la del
 * tercero (por el folio de su fila, con `mismaVentaQueLaFila`), en un solo lugar: la usan la
 * bajada, para decidir a quién le cae el dinero, y la revisión, para saber cuántas filas de la
 * hoja son de la misma venta (ver `hoja_doble` en `revisarContraLaHoja`). Una lápida («No se
 * dio») no se queda con una fila que la hoja trae viva salvo por su folio de cotización (ver el
 * porqué en `bajar`).
 * @returns {'folio'|'nombre'|'confirmada'|''}
 */
export function ataLaFila(p, venta) {
  if (!p || !venta || esImportado(p)) return '';
  const quien = mismaVentaQueLaFila(p, venta);
  if (quien !== 'folio' && quien !== 'nombre' && quien !== 'confirmada') return '';
  if (quien !== 'folio' && p.etapa === 'cancelado' && venta.etapa !== 'cancelado') return '';
  return quien;
}

/**
 * La fila dice ser de OTRA cotización: trae un folio de cotización que no es la huella del
 * defecto (su propio folio de hoja) ni el de `p`. PURA. Una venta de aquí que se ató a esa fila
 * por el nombre (`folio_hoja`, `hoja_confirmada`) ya no es suya: la limpia `revisarContraLaHoja`,
 * y `ventas.unificar` no la ata por el folio de la hoja mientras tanto.
 */
export function filaDeOtraCotizacion(p, venta) {
  if (!p || !venta) return false;
  const fc = String(venta.folio_cotizacion || '').trim();
  return !!fc && fc !== String(venta.folio_hoja || '').trim() && fc !== String(p.folio_global || '');
}

/**
 * La nota de lo que no se mandó a la hoja (`sin_mandar`), con estas operaciones sumadas. PURA.
 * Guarda desde cuándo y qué campos cambiaron, no las operaciones: cuando la fila vuelve se manda
 * UNA con el estado de hoy (la etapa, la dirección, el estatus, la cuenta y la instalación viajan
 * siempre), y los campos son para que el nombre y el dinero que sí cambiaron viajen también (ver
 * `aNotion`) y para que la bajada que trae la fila de vuelta no los pise con el valor viejo de la
 * fila antes de mandarlos (ver `bajar`). La de una instalación no suma campos pero sí deja la
 * nota: el reenvío lleva la fecha de la instalación viva.
 * La escriben el relevo, con el cambio que no mandó porque la venta está fuera de la hoja, y
 * `dejarFueraDeLaHoja`, con lo que ya había rebotado.
 */
export function sumarSinMandar(previa, ops, ahora) {
  const pv = previa && typeof previa === 'object' ? previa : null;
  const campos = new Set(pv && Array.isArray(pv.campos) ? pv.campos.map(String) : []);
  for (const op of (Array.isArray(ops) ? ops : [])) {
    if (op && op.almacen === 'proyectos' && Array.isArray(op.campos)) for (const c of op.campos) campos.add(String(c));
  }
  return { desde: (pv && Number(pv.desde)) || Number(ahora) || 0, campos: [...campos] };
}

/**
 * Las tarjetas importadas que repiten una venta de este teléfono. PURA.
 *
 * Candidato es cualquier proyecto de aquí que `mismaVentaQueLaFila` no descarta, incluido el
 * 'debil': ése no se junta solo, pero sí se enseña, porque es la misma venta dos veces en el
 * tablero O dos ventas con un folio repetido, y eso solo lo sabe quien las conoce. Lo que
 * Dirección ya dijo que NO es la misma (`distinta_de`, ver `noEsLaMisma`) no se vuelve a
 * preguntar. Sin la fila en el espejo no se decide nada: sin ella no hay con qué comparar.
 * @param {Object[]} proyectos
 * @param {Object[]} ventas  los renglones de `ventas_hoja`
 * @returns {Array<{copia:Object, real:Object|null, candidatos:Object[], identidad:string, venta:Object}>}
 *          `real` es null si hay más de un candidato: ahí no se adivina cuál es; `venta` es la
 *          fila, que `loQueSePerderia` necesita para saber qué trajo la copia de la hoja
 */
export function repetidasDeLaHoja(proyectos, ventas) {
  const P = (Array.isArray(proyectos) ? proyectos : []).filter(Boolean);
  const porFolio = new Map();
  for (const v of (Array.isArray(ventas) ? ventas : [])) {
    const fh = String((v && v.folio_hoja) || '').trim();
    if (fh && !porFolio.has(fh)) porFolio.set(fh, v);
  }
  const propios = P.filter(p => !esImportado(p));
  const out = [];
  for (const copia of P) {
    if (!esImportado(copia) || copia.etapa === 'cancelado') continue;
    const fh = String(copia.folio_hoja || '').trim();
    const v = fh ? porFolio.get(fh) : null;
    if (!v) continue;
    const distintas = new Set(Array.isArray(copia.distinta_de) ? copia.distinta_de.map(String) : []);
    const candidatos = propios.filter(p => !distintas.has(String(p.id)) && mismaVentaQueLaFila(p, v));
    if (!candidatos.length) continue;
    const real = candidatos.length === 1 ? candidatos[0] : null;
    out.push({ copia, real, candidatos, identidad: real ? mismaVentaQueLaFila(real, v) : '', venta: v });
  }
  return out;
}

/* Lo que ni con el permiso de Dirección se junta: la instalación de las dos dejaría dos fechas
   para una sola obra, el material de la copia se sumaría al del proyecto, y una lápida no es a
   dónde mover una obra viva. */
const IMPIDEN_JUNTAR = new Set(['cancelada', 'instalaciones', 'material']);

/* Los datos de la venta que la ficha deja escribir y que no son dinero de la fila. Una copia los
   trae de la hoja al importarse, pero después se editan en ella como en cualquier proyecto
   —fabricación anota las entrecalles, Dirección el teléfono del cliente o una dirección
   corregida— y la junta borra la copia con ellos. Cada uno con su nombre para leerlo en la ficha. */
const DATOS_DE_LA_VENTA = [
  ['nombre', 'el nombre'], ['contacto', 'el contacto'], ['negocio', 'el negocio'],
  ['tel', 'el teléfono del cliente'], ['dir_texto', 'la dirección'], ['entrecalles', 'las entrecalles'],
  ['maps_url', 'el link de Maps'], ['compromiso_texto', 'el compromiso'], ['tipo_trabajo', 'el tipo de trabajo'],
];
/* El valor para comparar. El tipo, solo con los siete que existen: es lo único que `actualizar`
   deja escribir, así que un tipo desconocido no es algo que la junta pudiera conservar. */
const valorDeDato = (p, k) => (k === 'tipo_trabajo'
  ? TIPOS_TRABAJO.filter(t => Array.isArray(p[k]) && p[k].includes(t)).join(' | ')
  : String(p[k] == null ? '' : p[k]).replace(/\s+/g, ' ').trim());
const listaEnFrase = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : xs.join(''));

/**
 * Los datos de la venta que la copia tiene y que juntarla con la de aquí perdería (o que pasarían
 * a la de aquí, si ésta no los tiene). PURA.
 *
 * Lo que la copia trajo de la hoja y la hoja conserva no se pierde: el nombre de la fila se queda
 * en la fila (la de aquí solo lo manda cuando lo cambia, ver `aNotion`), y el contacto y el
 * negocio de una copia son ese nombre partido en dos (`partirNombreDeHoja`). Lo demás sí: el
 * teléfono, las entrecalles, el link y el compromiso nacen vacíos en la copia, así que los escribió
 * alguien aquí; y la dirección y el tipo de trabajo los manda la de aquí en CADA cambio, así que
 * una dirección corregida en la copia —aunque ya haya llegado a la fila— la pisa la de aquí con la
 * vieja en cuanto alguien mueve la etapa.
 * @param {Object|null} venta  la fila de `ventas_hoja`; sin ella, el nombre de la copia cuenta
 * @returns {{faltan:string[], distintos:string[]}}  claves: las que la de aquí tiene vacías, y las
 *          que tiene con otro valor
 */
function datosPropiosDeLaCopia(c, r, venta) {
  const deLaFila = partirNombreDeHoja(c.nombre);
  const faltan = [], distintos = [];
  for (const [k] of DATOS_DE_LA_VENTA) {
    const cv = valorDeDato(c, k), rv = valorDeDato(r, k);
    if (!cv) continue;
    const cmp = (k === 'nombre' || k === 'contacto' || k === 'negocio') ? nombreParaComparar : (s => s);
    if (cmp(cv) === cmp(rv)) continue;
    if (k === 'nombre' && venta && cmp(cv) === cmp(venta.nombre)) continue;
    if ((k === 'contacto' || k === 'negocio') && cmp(cv) === cmp(deLaFila[k])) continue;
    (rv ? distintos : faltan).push(k);
  }
  return { faltan, distintos };
}
const nombreDeDato = k => (DATOS_DE_LA_VENTA.find(d => d[0] === k) || [k, k])[1];

/**
 * Lo que la copia tiene y el proyecto de aquí no, y que juntarlas perdería. Vacío quiere decir
 * que se pueden juntar solas sin perder nada. PURA.
 *
 * Se mira lo que se mueve DE ESTE LADO —la etapa, las notas, el pin, el plazo— y los datos de la
 * venta que se editan en la ficha (ver `datosPropiosDeLaCopia`), no el dinero de la fila, que es
 * el mismo para las dos porque es la misma fila. Hasta aquí los datos no se miraban, y la copia
 * a la que el taller le anotó las entrecalles, o Dirección el teléfono del cliente o una
 * dirección corregida, se juntaba sola y se borraba con ellos: la regla del dueño solo deja
 * juntar sin preguntar lo que no pierde nada. Una etapa de la copia que va DETRÁS no se pierde: el
 * proyecto ya pasó por ahí.
 *
 * Y lo primero, antes que perder algo: que no sea la misma venta. Con `identidad` 'debil' (ver
 * `mismaVentaQueLaFila`) juntarlas le pasaría a este proyecto la instalación de otra venta y su
 * fila le echaría encima el dinero de la otra; eso no lo decide la revisión sola.
 *
 * El texto de cada renglón dice lo que de verdad pasa al apretar «Juntar» (`juntar` con
 * `arrastrar`): las notas se suman, y el pin, el plazo y los datos pasan solo si la de aquí no
 * tiene los suyos. Si los tiene, se quedan los de aquí, y el texto lo dice: la confirmación de la
 * ficha lee estos renglones y no puede prometer que pasa algo que se va a perder.
 *
 * `venta` es la fila. Con ella se sabe además si una lápida de aquí está en duda: la de aquí dice
 * «No se dio» y la fila no (clave 'viva'), y ahí quitar la copia no es la salida (ver
 * `quitarDelTablero`).
 * @param {{instCopia?:Object[], instReal?:Object[], reqCopia?:Object[], identidad?:string, venta?:Object}} [ctx]
 * @returns {Array<{clave:string, texto:string}>}
 */
export function loQueSePerderia(copia, real, ctx = {}) {
  const c = copia || {}, r = real || {};
  const x = ctx && typeof ctx === 'object' ? ctx : {};
  const venta = x.venta && typeof x.venta === 'object' ? x.venta : null;
  const por = [];
  if (x.identidad === 'debil') {
    por.push({ clave: 'identidad', texto: 'la fila no trae folio de cotización y no se llama como la de este teléfono: hay que confirmar que es la misma venta' });
  }
  if (r.etapa === 'cancelado') {
    por.push({ clave: 'cancelada', texto: 'la de este teléfono está como «No se dio»' });
    if (venta && venta.etapa !== 'cancelado') {
      por.push({ clave: 'viva', texto: 'y la hoja no: su fila sigue viva, sin «No se dio»' });
    }
  } else if (c.etapa && c.etapa !== r.etapa && c.etapa !== 'ganado') {
    const oc = ORDEN[c.etapa], or = ORDEN[r.etapa];
    if (oc === undefined || or === undefined || oc > or) {
      por.push({ clave: 'etapa', texto: 'la copia va en «' + (ETAPA_NOMBRE[c.etapa] || c.etapa) +
        '» y la de este teléfono en «' + (ETAPA_NOMBRE[r.etapa] || r.etapa) + '»' });
    }
  }
  const nc = String(c.notas || '').trim();
  if (nc && !String(r.notas || '').includes(nc)) {
    por.push({ clave: 'notas', texto: 'la copia tiene notas que la de este teléfono no tiene' });
  }
  if (tienePin(c) && !(tienePin(r) && Number(r.lat) === Number(c.lat) && Number(r.lng) === Number(c.lng))) {
    por.push({ clave: 'pin', texto: tienePin(r)
      ? 'la copia tiene otra ubicación, distinta de la de este teléfono: al juntarlas se queda la de este teléfono y la de la copia se pierde'
      : 'la copia tiene una ubicación que la de este teléfono no tiene' });
  }
  const pk = plazoValido(c.plazo_k);
  if (pk !== null && pk !== plazoValido(r.plazo_k)) {
    por.push({ clave: 'plazo', texto: plazoValido(r.plazo_k) !== null
      ? 'la copia tiene otro plazo de taller: al juntarlas se queda el de este teléfono y el de la copia se pierde'
      : 'la copia tiene su propio plazo de taller' });
  }
  const datos = datosPropiosDeLaCopia(c, r, venta);
  if (datos.faltan.length) {
    por.push({ clave: 'datos', texto: 'la copia tiene datos que la de este teléfono no tiene (' +
      listaEnFrase(datos.faltan.map(nombreDeDato)) + '): al juntarlas pasan a la de este teléfono' });
  }
  if (datos.distintos.length) {
    por.push({ clave: 'datos_distintos', texto: 'la copia no coincide con la de este teléfono en ' +
      listaEnFrase(datos.distintos.map(nombreDeDato)) + ': al juntarlas se quedan los datos de este teléfono y los de la copia se pierden' });
  }
  const viva = i => i && i.estado !== 'cancelada';
  if ((x.instCopia || []).some(viva) && (x.instReal || []).some(viva)) {
    por.push({ clave: 'instalaciones', texto: 'las dos tienen instalación agendada' });
  }
  if ((x.reqCopia || []).length) {
    por.push({ clave: 'material', texto: 'la copia tiene material calculado a su nombre' });
  }
  return por;
}

/* ----- Las escrituras de las marcas -----
   Siempre releyendo el registro y parchando encima, nunca con la foto que se leyó al empezar:
   la revisión de abajo toca el mismo proyecto por dos lados (la marca de repetida y la de
   perdida) y la segunda escritura, con la foto vieja, devolvía la primera a como estaba. */
async function parcharMarca(id, parche) {
  const p = await DB.obtener('proyectos', id);
  if (!p) return null;
  const r = await DB.poner('proyectos', { ...p, ...parche });
  return r.ok ? r.valor : null;
}

/* Las operaciones de la bandeja que cuelgan de un proyecto. `sync` se carga aquí también de
   forma perezosa (ver `mod`): si no está, no hay bandeja que limpiar. */
async function descartarOps(proyectoId, estados) {
  const S = await mod('sync');
  if (!S || typeof S.descartarDelProyecto !== 'function') return 0;
  try {
    const r = await S.descartarDelProyecto(proyectoId, estados);
    return r && r.ok ? Number(r.valor.descartadas) || 0 : 0;
  } catch (_) { return 0; }
}

const porProyecto = (almacen, id) => DB.listar(almacen,
  { indice: 'porProyecto', rango: rango(id), filtro: x => x && x.proyecto_id === id });

/**
 * La hoja contestó que la fila de esta venta ya no está (o que ya es de otra). Lo llama el
 * relevo al apartar el rechazo. Solo marca si el proyecto sigue apuntando a ESA fila: si una
 * bajada ya lo volvió a atar a otra, o Dirección lo dejó fuera, el rebote es viejo.
 * @returns {Promise<Object|null>} el proyecto como quedó, o null si no se marcó
 */
export async function marcarPerdidaEnLaHoja(id, motivo, folio, mensaje) {
  if (!id || !DB.estado().ok) return null;
  const p = await DB.obtener('proyectos', id);
  if (!p || p.fuera_de_hoja || String(p.notion_page_id || '') !== String(folio || '')) return null;
  const m = marcaPerdida(p.hoja_perdida, motivo, folio, mensaje, Date.now());
  if (m === p.hoja_perdida) return p;
  const r = await DB.poner('proyectos', { ...p, hoja_perdida: m });
  return r.ok ? r.valor : null;
}

/* Dirección dijo que la fila `folioHoja` ES la venta de `real`. Se anota en el proyecto
   (`hoja_confirmada`, una marca de este teléfono como las otras) porque sin eso la decisión
   duraba una bajada: si la fila no trae folio de cotización ni se llama igual, el tercer camino
   de `bajar` no la ata a `real` (ver `mismaVentaQueLaFila`), la vuelve a importar como tarjeta
   nueva y la revisión la vuelve a enseñar como repetida. */
async function confirmarFila(real, folioHoja) {
  const fh = String(folioHoja || '').trim();
  if (!real || !fh || String(real.notion_page_id || '') !== fh || real.hoja_confirmada === fh) return;
  await parcharMarca(real.id, { hoja_confirmada: fh });
}

/* Junta la copia en el proyecto de verdad: lo que colgaba de ella —instalaciones, movimientos
   del almacén— pasa a apuntar al proyecto, sus operaciones apartadas se tiran (eran cambios a
   la misma fila, y la copia deja de existir) y la copia se va. Con `arrastrar` —lo aprieta
   Dirección, ya vio el porqué—, lo que la copia tenía de más y sí se puede llevar pasa al
   proyecto por la puerta de siempre, `actualizar`, que lo encola y lo anota: las notas se
   suman, y el pin, el plazo y los datos de la venta (el teléfono, la dirección, las
   entrecalles…) solo si la de aquí no tiene los suyos (si los tiene, se quedan los de aquí;
   `loQueSePerderia` ya lo dijo así). Y la fila queda confirmada como suya. */
async function juntar(copia, real, arrastrar) {
  if (arrastrar) {
    const parche = {};
    const nc = String(copia.notas || '').trim();
    if (nc && !String(real.notas || '').includes(nc)) {
      parche.notas = (String(real.notas || '').trim() ? String(real.notas).trim() + '\n' : '') + nc;
    }
    if (tienePin(copia) && !tienePin(real)) {
      parche.lat = copia.lat; parche.lng = copia.lng; parche.geo_fuente = copia.geo_fuente || 'manual';
      if (!String(real.maps_url || '').trim() && String(copia.maps_url || '').trim()) parche.maps_url = copia.maps_url;
    }
    if (plazoValido(copia.plazo_k) !== null && plazoValido(real.plazo_k) === null) parche.plazo_k = copia.plazo_k;
    for (const k of datosPropiosDeLaCopia(copia, real, null).faltan) {
      parche[k] = k === 'tipo_trabajo' ? TIPOS_TRABAJO.filter(t => copia.tipo_trabajo.includes(t)) : copia[k];
    }
    if (Object.keys(parche).length) {
      const ra = await actualizar(real.id, parche);
      if (!ra.ok) return ra;
    }
    await confirmarFila(await DB.obtener('proyectos', real.id), copia.folio_hoja);
  }
  const [insts, movs] = await Promise.all([porProyecto('instalaciones', copia.id), porProyecto('movimientos', copia.id)]);
  for (const i of insts) {
    const r = await DB.poner('instalaciones', { ...i, proyecto_id: real.id });
    if (!r.ok) return r;
  }
  for (const m of movs) {
    const r = await DB.poner('movimientos', { ...m, proyecto_id: real.id });
    if (!r.ok) return r;
  }
  await descartarOps(copia.id, ['rechazada', 'pendiente']);
  const rb = await DB.borrar('proyectos', copia.id);
  if (!rb.ok) return rb;
  await anotar({ accion: 'junto', entidad_id: real.id,
    titulo: (real.nombre || real.folio_local) + ': se juntó la copia importada de ' + (copia.folio_hoja || 'la hoja'),
    detalle: 'Era la misma venta dos veces en el tablero' +
      (insts.length || movs.length ? ' · pasaron ' + insts.length + ' instalación(es) y ' + movs.length + ' movimiento(s)' : '') });
  return ok({ instalaciones: insts.length, movimientos: movs.length });
}

/**
 * Lo de este lado contra lo que acaba de bajar. Lo llama el relevo cuando cierra un barrido
 * de la hoja (ver `despuesDeBajar` en puente.js), con el barrido ya escrito en la base.
 *
 * Las repetidas se revisan siempre; las perdidas, solo con `completa`. Una copia con cambios
 * todavía en la bandeja se deja para la siguiente: juntarla ahora mandaría después esos cambios
 * con la foto de una tarjeta que ya no existe.
 *
 * `rebotes` son los cambios de las ventas de ESTE teléfono que ya estaban apartados con «ya no
 * está en la hoja» / «ya es de otra venta» (los junta `despuesDeBajar` en puente.js). La marca
 * nace cuando un cambio rebota, y lo apartado no se reintenta solo: las ventas que se atoraron
 * antes de que existiera la marca —las que dieron origen a todo esto— se quedaban sin aviso y
 * sin botones hasta que alguien volviera a tocar la obra. Pero un rebote puede ser viejo (la
 * fila volvió), así que solo marca lo que esta bajada COMPLETA confirma: la fila borrada no
 * vino, y la que era de otra venta sigue atada a otra cotización.
 * @param {{folios:Set<string>|string[], completa:boolean,
 *          rebotes?:Array<{id:string, motivo:string, mensaje:string}>}} info
 * @returns {Promise<Resultado>} valor = {juntadas, repetidas, perdidas, cambios}
 */
export async function revisarContraLaHoja(info = {}) {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  const [proys, ventas, insts, reqs, pend] = await Promise.all([
    DB.listar('proyectos'), DB.listar('ventas_hoja'), DB.listar('instalaciones'),
    DB.listar('requerimientos'), DB.listar('pendientes'),
  ]);
  const ahora = Date.now();
  const deProy = (lista, id) => lista.filter(x => x && x.proyecto_id === id);
  const conBandeja = new Set();
  for (const o of pend) {
    if (!o || String(o.id || '').charAt(0) === '_' || o.estado !== 'pendiente') continue;
    if (o.almacen === 'proyectos') conBandeja.add(String(o.registro_id || (o.datos && o.datos.id) || ''));
    if (o.almacen === 'instalaciones' && o.datos) conBandeja.add(String(o.datos.proyecto_id || ''));
  }

  let juntadas = 0, repetidas = 0, perdidas = 0, cambios = 0;
  const vistas = new Set();     // las copias que siguen siendo repetidas, juntadas o no
  const idas = new Set();       // las que se juntaron: ya no existen

  for (const { copia, real, candidatos, identidad, venta } of repetidasDeLaHoja(proys, ventas)) {
    vistas.add(copia.id);
    if (conBandeja.has(copia.id)) continue;
    const por = real
      ? loQueSePerderia(copia, real, { instCopia: deProy(insts, copia.id), instReal: deProy(insts, real.id),
                                       reqCopia: deProy(reqs, copia.id), identidad, venta })
      : [{ clave: 'varias', texto: 'hay ' + candidatos.length + ' proyectos de este teléfono con esa misma venta' }];
    if (!por.length) {
      const r = await juntar(copia, real, false);
      if (r.ok) { juntadas++; cambios++; idas.add(copia.id); }
      continue;
    }
    const previa = copia.duplicado_de && typeof copia.duplicado_de === 'object' ? copia.duplicado_de : null;
    const marca = { id: real ? real.id : '', nombre: real ? String(real.nombre || real.folio_local || '') : '',
                    folio: real ? String(real.folio_global || '') : '', folio_hoja: String(copia.folio_hoja || ''),
                    desde: (previa && previa.id === (real ? real.id : '') && previa.desde) || ahora,
                    por: por.map(x => x.texto), claves: por.map(x => x.clave) };
    if (!previa || JSON.stringify({ ...previa, desde: 0 }) !== JSON.stringify({ ...marca, desde: 0 })) {
      if (await parcharMarca(copia.id, { duplicado_de: marca })) cambios++;
    }
    repetidas++;
  }
  /* La que dejó de ser repetida —se borró el proyecto de aquí, la hoja corrigió su folio— ya no
     se enseña como tal. */
  for (const p of proys) {
    if (p && p.duplicado_de && !vistas.has(p.id) && await parcharMarca(p.id, { duplicado_de: null })) cambios++;
  }

  const folios = info && info.folios instanceof Set ? info.folios
    : new Set((info && Array.isArray(info.folios) ? info.folios : []).map(String));
  const ventaDe = new Map(ventas.filter(v => v && v.folio_hoja).map(v => [String(v.folio_hoja), v]));

  /* La venta de aquí que la bajada ató a su fila por el nombre (`folio_hoja`, `hoja_confirmada`)
     y cuya fila hoy dice ser de OTRA cotización: PAGOS escribió ahí el folio de la venta de otro
     teléfono, o la realineación de Y:AD lo devolvió. La bajada ya no la ata (ver
     `mismaVentaQueLaFila`), pero las dos notas se quedaban para siempre, y con `folio_hoja`
     `ventas.unificar` seguía atando este proyecto a esa fila: Control contaba dos veces la venta
     del otro —una con el nombre de ésta— y ésta dejaba de contarse. Se quitan, y si es la fila a
     la que apunta, se marca como la que la hoja contestaría «ya es de otra venta» (lo haría en
     el siguiente cambio: compara el folio de cotización). Nada se borra: si la fila vuelve a ser
     suya, la bajada la vuelve a atar y quita la marca. */
  for (const p of proys) {
    if (!p || esImportado(p) || idas.has(p.id)) continue;
    const parche = {};
    for (const k of ['folio_hoja', 'hoja_confirmada']) {
      const v = p[k] ? ventaDe.get(String(p[k]).trim()) : null;
      if (v && filaDeOtraCotizacion(p, v)) parche[k] = null;
    }
    if (!Object.keys(parche).length) continue;
    const fh = String(p.notion_page_id || '').trim();
    const v = fh ? ventaDe.get(fh) : null;
    if (v && filaDeOtraCotizacion(p, v) && !p.fuera_de_hoja) {
      parche.hoja_perdida = marcaPerdida(p.hoja_perdida, 'de_otra', fh,
        'La fila ' + fh + ' de la hoja ya es de otra venta (trae el folio de cotización ' + String(v.folio_cotizacion).trim() + ').', ahora);
    }
    if (await parcharMarca(p.id, parche)) cambios++;
  }

  /* La misma venta en DOS filas de la hoja. Pasa cuando Dirección la vuelve a dar de alta
     (`volverADarDeAlta`) y después alguien deshace el borrado de la fila vieja: las dos traen su
     folio de cotización, o la vieja es la que tuvo (`folios_previos`). La bajada ya no le cambia
     la fila en silencio (ver `bajar` en puente.js: se queda con la que tenía), pero la otra se
     quedaba congelada —y puede ser justo la que tiene los cobros— sin que nada lo dijera, y
     Control la contaba dos veces. Se marca (`hoja_doble`), la ficha y «Qué atender» se lo dicen a
     Dirección, y `ventas.unificar` la cuenta una vez. Qué fila sobra lo decide Dirección en la
     hoja; aquí no se borra nada. Solo con una bajada COMPLETA: una a medias todavía trae en
     `ventas_hoja` filas que la hoja ya no tiene. Quitarla, sí siempre: con menos de dos no hay
     nada que avisar. */
  const conSuFolio = new Map();   // folio de cotización → sus filas; una venta tiene uno solo
  for (const v of ventas) {
    const fc = v && String(v.folio_cotizacion || '').trim();
    if (fc && v.folio_hoja) (conSuFolio.get(fc) || conSuFolio.set(fc, []).get(fc)).push(v);
  }
  for (const p of proys) {
    if (!p || esImportado(p) || idas.has(p.id)) continue;
    /* Las candidatas son las que traen su folio de cotización y las de sus folios de hoja; de ésas,
       las que la bajada le echaría (`ataLaFila`). */
    const candidatas = [...(conSuFolio.get(String(p.folio_global || '')) || []),
                        ...[...foliosDeHoja(p)].map(f => ventaDe.get(f)).filter(Boolean)];
    const suyas = [...new Set(candidatas.filter(v => ataLaFila(p, v)).map(v => String(v.folio_hoja)))];
    const previa = p.hoja_doble && typeof p.hoja_doble === 'object' ? p.hoja_doble : null;
    if (suyas.length < 2) {
      if (previa && await parcharMarca(p.id, { hoja_doble: null })) cambios++;
      continue;
    }
    if (!(info && info.completa)) continue;
    const np = String(p.notion_page_id || '').trim();
    const orden = suyas.includes(np) ? [np, ...suyas.filter(f => f !== np).sort()] : suyas.sort();
    if (previa && JSON.stringify(previa.folios) === JSON.stringify(orden)) continue;
    if (await parcharMarca(p.id, { hoja_doble: { folios: orden, desde: (previa && previa.desde) || ahora } })) cambios++;
  }

  /* Lo que se cambió mientras la venta estuvo fuera de la hoja (`sin_mandar`, lo anota `subir` en
     puente.js al no mandarlo, y `dejarFueraDeLaHoja` con lo que ya había rebotado). Si su fila
     volvió —la bajada ya le quitó `fuera_de_hoja`, y esta misma bajada la vio—, se manda ahora,
     con la etapa, la instalación y los datos de HOY: sin esto la fila viva se quedaba para siempre
     con la etapa de antes, y la confirmación de «Dejarla» prometía que se volvía a mandar sola. Se
     encola aquí y no en el relevo, que es quien vacía la bandeja: encolar desde ahí es un bucle.
     Una sola operación, con los campos que cambiaron (el nombre y el dinero solo viajan cuando
     fueron lo que cambió, ver `aNotion`). Y con el valor de AQUÍ: la bajada que trajo la fila de
     vuelta no les aplicó el espejo (ver `bajar` en puente.js); sin eso se reenviaba el valor viejo
     que la fila acababa de bajar, y la corrección no quedaba ni en el teléfono ni en la hoja. */
  let reenviadas = 0;
  for (const p of proys) {
    if (!p || !p.sin_mandar || idas.has(p.id) || p.fuera_de_hoja || p.hoja_perdida) continue;
    const fh = String(p.notion_page_id || '').trim();
    if (!fh || !folios.has(fh)) continue;
    const hoy = await DB.obtener('proyectos', p.id);
    if (!hoy || hoy.fuera_de_hoja || hoy.hoja_perdida || !hoy.sin_mandar) continue;
    const campos = Array.isArray(hoy.sin_mandar.campos) ? hoy.sin_mandar.campos.map(String) : [];
    const limpio = await parcharMarca(p.id, { sin_mandar: null });
    if (!limpio) continue;
    await encolar('actualizar', limpio, campos);
    reenviadas++; cambios++;
  }

  if (info && info.completa) {
    for (const p of huerfanasDeLaHoja(proys.filter(x => x && !idas.has(x.id)), folios)) {
      if (p.hoja_perdida && p.hoja_perdida.folio === String(p.folio_hoja)) continue;
      if (await parcharMarca(p.id, { hoja_perdida: marcaPerdida(null, 'no_bajo', p.folio_hoja,
        'La hoja ya no trae la fila ' + p.folio_hoja + '.', ahora) })) { perdidas++; cambios++; }
    }

    /* Lo apartado de antes (ver arriba). Cuenta la fila a la que el proyecto apunta HOY, y el
       rebote tiene que nombrarla: si nombra otra, fue contra una fila que ya no es la suya. Las
       tarjetas importadas no pasan por aquí: a ésas ya las marca la bajada, arriba. */
    const porId = new Map(proys.filter(Boolean).map(p => [p.id, p]));
    const yaVistos = new Set();
    for (const rb of (Array.isArray(info.rebotes) ? info.rebotes : [])) {
      const p = rb && porId.get(String(rb.id));
      if (!p || yaVistos.has(p.id) || esImportado(p) || p.fuera_de_hoja) continue;
      const fh = String(p.notion_page_id || '').trim();
      if (!fh || !nombraFolio(rb.mensaje, fh)) continue;
      const v = ventaDe.get(fh);
      const fc = v ? String(v.folio_cotizacion || '').trim() : '';
      const motivo = !folios.has(fh) ? 'borrada'
        : (rb.motivo === 'de_otra' && fc && fc !== fh && fc !== String(p.folio_global || '')) ? 'de_otra' : '';
      if (!motivo) continue;
      yaVistos.add(p.id);
      const m = marcaPerdida(p.hoja_perdida, motivo, fh, rb.mensaje, ahora);
      if (m !== p.hoja_perdida && await parcharMarca(p.id, { hoja_perdida: m })) cambios++;
    }
  }
  return ok({ juntadas, repetidas, perdidas, reenviadas, cambios });
}

/* ¿El texto nombra ESE folio, y no uno que lo contiene? «V-47» está dentro de «V-470». */
function nombraFolio(texto, folio) {
  const t = String(texto || ''), f = String(folio || '');
  if (!f) return false;
  for (let i = t.indexOf(f); i >= 0; i = t.indexOf(f, i + 1)) {
    if (!/[\w-]/.test(t.charAt(i - 1)) && !/[\w-]/.test(t.charAt(i + f.length))) return true;
  }
  return false;
}

/* Las decisiones de la venta son de Dirección: cambian qué hay en el libro del dinero (darla de
   alta otra vez), qué deja de mandarse (dejarla fuera) y cuál de dos proyectos es la venta
   (juntar, quitar la copia repetida, decir que no es la misma).
   Las de una tarjeta IMPORTADA cuya fila ya no está —quitarla del tablero, dejarla— no: esa
   tarjeta es una copia de este teléfono, sin cotización detrás, y las marcas no viajan. Vive
   sobre todo en el teléfono del taller, que es donde el puente importa lo que está en
   fabricación, y lo que Dirección decida en el suyo no llega ahí: con `soloDireccion` se
   quedaba para siempre en el tablero de fabricación, con su etiqueta roja y un «eso lo decide
   Dirección» que no podía cumplirse. Para ésas basta `conBase`. */
function conBase() {
  return DB.estado().ok ? null : mal('DB_NO_DISPONIBLE', DB.motivoTexto());
}
function soloDireccion() {
  const no = conBase(); if (no) return no;
  if (Prefs.rol() !== 'direccion') return mal('ROL_SIN_PERMISO', 'Eso lo decide Dirección, con su cuenta en este teléfono: lo que se decide en otro no llega aquí.');
  return null;
}

/**
 * «Volver a darla de alta en la hoja». Para la venta de ESTE teléfono cuya fila se borró (o
 * que Dirección había dejado fuera): se olvida el folio de la fila muerta y se encola UN alta
 * completa —`aNotion` la arma con todo porque el proyecto ya no tiene fila—. Lo que estaba
 * apartado o esperando de ese proyecto se tira antes, porque el alta lleva el estado de hoy de
 * todo eso; dejarlo saldría detrás como altas repetidas con fotos viejas.
 *
 * La hoja no duplica: antes de crear busca por «Folio cotizacion», y si alguien ya había
 * vuelto a meter la venta a mano, el alta cae en esa fila.
 * @returns {Promise<Resultado>} valor = el proyecto
 */
export async function volverADarDeAlta(id) {
  const no = soloDireccion(); if (no) return no;
  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  if (esImportado(p)) {
    return mal('DATO_INVALIDO', 'Esta tarjeta se importó de la hoja: no tiene cotización con la que volver a darla de alta. Si la venta sigue viva, regístrala desde el cotizador que la vendió.');
  }
  if (!p.hoja_perdida && !p.fuera_de_hoja) {
    return mal('DATO_INVALIDO', 'Esta venta no está marcada como fuera de la hoja: no hay nada que volver a dar de alta.');
  }
  if (p.etapa === 'cancelado') {
    return mal('DATO_INVALIDO', 'Este proyecto está como «No se dio»: no es una venta que dar de alta.');
  }
  await descartarOps(p.id, ['rechazada', 'pendiente']);
  /* Y sin `sin_mandar`: lo que se cambió mientras estuvo fuera ya va en el alta.
     La fila muerta no se olvida del todo: se guarda en `folios_previos`. Si alguien deshace
     después su borrado, esa fila sigue siendo de esta venta (ver `mismaVentaQueLaFila`), y la
     venta queda en DOS filas: la bajada no le cambia la fila en silencio y la revisión lo avisa
     (`hoja_doble`). Sin la nota, una fila vieja sin folio de cotización volvía como OTRA
     tarjeta, sin marca. `folio_hoja` sí se va: es la fila con la que Control la ataba, y ya no
     es la suya. */
  const vieja = String(p.notion_page_id || (p.hoja_perdida && p.hoja_perdida.folio) || '').trim();
  const previos = [...new Set([...(Array.isArray(p.folios_previos) ? p.folios_previos.map(String) : []), vieja].filter(Boolean))];
  const fila = { ...p, notion_page_id: null, notion_estado: 'pendiente', hoja_perdida: null, fuera_de_hoja: null,
                 sin_mandar: null, folio_hoja: null, folios_previos: previos, sync: 0 };
  const r = await DB.poner('proyectos', fila);
  if (!r.ok) return r;
  await encolar('crear', r.valor);
  await anotar({ accion: 'hoja_alta', entidad_id: p.id,
    titulo: (p.nombre || p.folio_local) + ' se volvió a dar de alta en la hoja',
    detalle: 'Su fila ' + ((p.hoja_perdida && p.hoja_perdida.folio) || p.notion_page_id || '') + ' ya no estaba en la hoja' });
  return ok(r.valor);
}

/**
 * «Dejarla fuera de la hoja» (la venta de este teléfono) y «Dejarla» (la tarjeta importada).
 * El proyecto se queda aquí y la marca se quita. El folio de la fila se queda como está
 * —borrarlo resucitaría la venta en el siguiente cambio— y `fuera_de_hoja` es lo que hace que el
 * relevo ya no mande nada de este proyecto, ni la revisión lo vuelva a marcar: sin eso, el
 * siguiente cambio de etapa volvía a rebotar y a encender el aviso. Lo que se cambie mientras
 * tanto no se tira: el relevo lo anota en el proyecto (`sin_mandar`). Si la fila vuelve, la
 * bajada quita `fuera_de_hoja` (ver `bajar` en puente.js) y la revisión manda esos cambios con
 * el estado de hoy (ver `revisarContraLaHoja`).
 * Y lo que YA rebotó tampoco se tira sin más: casi siempre es justo el cambio que encendió la
 * marca (la etapa que el taller movió, el anticipo que Dirección corrigió). Sale de lo apartado
 * —reintentarlo solo lo haría rebotar— pero se anota en `sin_mandar` antes, con la misma forma
 * que el relevo (`sumarSinMandar`), y viaja con los demás si la fila vuelve. Antes se tiraba, y
 * la confirmación de «Dejarla» prometía lo contrario.
 * La de una venta de aquí es de Dirección; «Dejarla», la de una tarjeta importada, la puede
 * decidir cualquiera en su teléfono (ver `soloDireccion`).
 * @returns {Promise<Resultado>} valor = el proyecto
 */
export async function dejarFueraDeLaHoja(id) {
  const base = conBase(); if (base) return base;
  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  if (!esImportado(p)) { const no = soloDireccion(); if (no) return no; }
  if (!p.hoja_perdida) return mal('DATO_INVALIDO', 'Esta venta sigue en la hoja: no hay nada que dejar fuera.');
  const ahora = Date.now();
  /* Primero se anota y después se tira: si la escritura falla, lo apartado sigue donde estaba. */
  const apartadas = await opsDelProyecto(p.id, ['rechazada']);
  const sinMandar = apartadas.length ? sumarSinMandar(p.sin_mandar, apartadas, ahora) : (p.sin_mandar || null);
  const r = await DB.poner('proyectos', { ...p, hoja_perdida: null, fuera_de_hoja: ahora, sin_mandar: sinMandar });
  if (!r.ok) return r;
  const guardadas = apartadas.length ? await descartarOps(p.id, ['rechazada']) : 0;
  await anotar({ accion: 'hoja_fuera', entidad_id: p.id,
    titulo: (p.nombre || p.folio_local) + (esImportado(p) ? ' se queda en el tablero sin su fila de la hoja' : ' se queda fuera de la hoja'),
    detalle: 'Su fila ' + (p.hoja_perdida.folio || '') + ' ya no estaba en la hoja' +
      (guardadas ? ' · ' + guardadas + ' cambio(s) que habían rebotado se guardan para mandarse si la fila vuelve' : '') });
  return ok(r.valor);
}

/* Lo de la bandeja que cuelga de un proyecto, sin tirarlo (ver `sync.delProyecto`). */
async function opsDelProyecto(proyectoId, estados) {
  const S = await mod('sync');
  if (!S || typeof S.delProyecto !== 'function') return [];
  try { return await S.delProyecto(proyectoId, estados); } catch (_) { return []; }
}

/* ¿La hoja dijo que la fila de esta tarjeta ya no está DESPUÉS de la última bajada completa? La
   marca de un rebote (o la decisión de «Dejarla», que viene detrás de ella) es entonces lo más
   nuevo que este teléfono sabe de esa fila, y su renglón en `ventas_hoja` es de antes: una bajada
   que la hubiera visto después le habría quitado la marca (ver `bajar` en puente.js). */
async function marcaMasNuevaQueLaBajada(p) {
  const cuando = Number((p.hoja_perdida && p.hoja_perdida.desde) || p.fuera_de_hoja) || 0;
  if (!cuando) return false;
  const S = await mod('sync');
  let completa = 0;
  try { completa = Number(S && typeof S.estadoBajada === 'function' ? (await S.estadoBajada()).completa : 0) || 0; } catch (_) { completa = 0; }
  return cuando > completa;
}

/**
 * «Quitar del tablero». Solo la tarjeta IMPORTADA de la hoja —la venta de este teléfono se
 * marca «No se dio», que deja constancia—, y solo en dos casos, porque en cualquier otro la
 * siguiente bajada la volvería a traer como nueva, sin las notas que tenía:
 *   · su fila ya no está: marcada, y sin renglón en el récord de ventas (`ventas_hoja`). Un
 *     aviso que se quedó puesto no basta: la fila pudo volver.
 *   · es la copia repetida de una venta de aquí (lo decide Dirección). Quitarla es decir «es la
 *     misma venta»: su fila queda confirmada como del proyecto de aquí (`confirmarFila`) y la
 *     bajada ya no la importa. Es la salida de la copia que no se puede juntar —la de aquí es
 *     una lápida, «No se dio»— y no tiene nada suyo. Pero solo si la fila también dice «No se
 *     dio»: si la hoja trae la obra viva, las dos dicen cosas distintas de la misma venta, y
 *     quitar la copia no decide cuál tiene razón. La bajada no ata una fila viva a una lápida
 *     (ver `bajar` en puente.js), así que la copia volvía en la siguiente, sin sus notas; y
 *     cuando sí la ataba, el saldo de una obra viva salía del por cobrar de Control.
 * Y NO se quita si algo de este teléfono la nombra: una instalación que no esté cancelada, un
 * movimiento del almacén o material calculado se quedarían apuntando a nada, y el libro del
 * almacén no se corrige borrando.
 * @returns {Promise<Resultado>} valor = {id}
 */
export async function quitarDelTablero(id) {
  const base = conBase(); if (base) return base;
  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  if (!esImportado(p)) {
    return mal('DATO_INVALIDO', 'Solo se quitan del tablero las tarjetas importadas de la hoja. Una venta de este teléfono se marca «No se dio».');
  }
  const aviso = avisoDeHoja(p);
  let real = null;
  if (aviso === 'repetida') {
    const no = soloDireccion(); if (no) return no;
    real = p.duplicado_de.id ? await DB.obtener('proyectos', p.duplicado_de.id) : null;
    if (!real) {
      return mal('NO_ENCONTRADO', 'No se sabe de cuál venta de este teléfono es copia: ' +
        (p.duplicado_de.por && p.duplicado_de.por[0] ? p.duplicado_de.por[0] : 'el proyecto de aquí ya no está') + '.');
    }
    const fila = real.etapa === 'cancelado' && p.folio_hoja ? await DB.obtener('ventas_hoja', 'hoja:' + p.folio_hoja) : null;
    if (fila && fila.etapa !== 'cancelado') {
      const suyo = real.nombre || real.folio_local;
      return mal('DATO_INVALIDO', 'No se quitó: «' + suyo + '» está como «No se dio», pero la hoja trae esta obra viva en su fila ' +
        p.folio_hoja + '. Quitar la copia no decide cuál de las dos tiene razón. Si no se dio, márcala «No se dio» también en la hoja ' +
        '(columna «Etapa de obra»), y con la siguiente bajada ya se puede quitar. Si la obra sigue, abre «' + suyo +
        '» y regrésala a su etapa: deja de estar como «No se dio» y las dos se pueden juntar.');
    }
  } else if (aviso === 'perdida' || aviso === 'fuera') {
    /* Su renglón en el récord no basta para negarse: la marca de un rebote nace ANTES de que una
       bajada completa quite de `ventas_hoja` la fila borrada, y ahí el renglón es lo viejo y el
       «ya no está» de la hoja lo nuevo. Decir «está otra vez en la hoja» era falso, y la tarjeta
       no tenía cómo quitarse hasta la siguiente bajada. */
    const fila = p.folio_hoja ? await DB.obtener('ventas_hoja', 'hoja:' + p.folio_hoja) : null;
    if (fila && !(await marcaMasNuevaQueLaBajada(p))) {
      return mal('DATO_INVALIDO', 'Su fila ' + p.folio_hoja + ' está otra vez en la hoja: quitarla del tablero la volvería a traer en la próxima bajada.');
    }
  } else {
    return mal('DATO_INVALIDO', 'Su venta sigue en la hoja: quitarla del tablero la volvería a traer en la próxima bajada.');
  }
  const [insts, movs, reqs] = await Promise.all([porProyecto('instalaciones', id), porProyecto('movimientos', id),
                                                  porProyecto('requerimientos', id)]);
  /* Una instalación CANCELADA no es obra viva (la misma regla que `loQueSePerderia`), y la
     aplicación no tiene cómo borrarla: `Agenda.cancelar` solo la marca. Contarla dejaba la
     tarjeta para siempre en el tablero, con un botón que nunca funcionaba. Se queda en la agenda
     como lo que es, una cancelación, y la bitácora dice que su tarjeta se fue. */
  const vivas = insts.filter(i => i && i.estado !== 'cancelada');
  const canceladas = insts.length - vivas.length;
  const cuelga = [];
  if (vivas.length) cuelga.push(vivas.length === 1 ? '1 instalación' : vivas.length + ' instalaciones');
  if (movs.length) cuelga.push(movs.length === 1 ? '1 movimiento del almacén' : movs.length + ' movimientos del almacén');
  if (reqs.length) cuelga.push('material calculado');
  if (cuelga.length) {
    const suyo = real ? '«' + (real.nombre || real.folio_local) + '»' : '';
    const cancela = vivas.length ? 'Si esa instalación ya no va, cancélala en la Agenda y vuelve a intentarlo. ' : '';
    return mal('EN_USO', 'No se quitó: tiene ' + cuelga.join(', ') + ' a su nombre, y quitarla los dejaría sin proyecto. ' +
      /* Sin la de aquí no hay con quién juntarla: la tarjeta cuya fila ya no vino nunca queda
         como repetida. Sus dos salidas son las que la ficha tiene. */
      (!real ? cancela + (aviso === 'fuera' ? 'Si no, se queda en el tablero, como ya se decidió.' : 'Si no, déjala en el tablero.')
        /* Una lápida no recibe obras (IMPIDEN_JUNTAR): con una obra a nombre de la copia, el «No
           se dio» de aquí está en duda. Eso no se resuelve borrando, y se dice qué sí lo resuelve. */
        : real.etapa === 'cancelado'
          ? suyo + ' está como «No se dio» y no recibe obras. ' + cancela +
            'Si la obra sigue, abre ' + suyo + ' y regrésala a su etapa: deja de estar como «No se dio» y las dos se pueden juntar.'
          : 'Júntala con ' + suyo + ', que se los lleva.'));
  }
  if (real) await confirmarFila(real, p.folio_hoja);
  await descartarOps(id, ['rechazada', 'pendiente']);
  const r = await DB.borrar('proyectos', id);
  if (!r.ok) return r;
  await anotar({ accion: 'quito', entidad_id: id,
    titulo: (p.nombre || p.folio_local) + ' se quitó del tablero',
    detalle: 'Tarjeta importada de ' + (p.folio_hoja || 'la hoja') +
      (real ? ' · era copia de ' + (real.nombre || real.folio_local) : ' · su fila ya no estaba en la hoja') +
      (canceladas ? ' · ' + (canceladas === 1 ? 'su instalación cancelada se queda' : 'sus ' + canceladas + ' instalaciones canceladas se quedan') + ' en la agenda, sin tarjeta' : '') });
  return ok({ id });
}

/**
 * «No es la misma venta». La copia repetida cuya fila solo coincide con la de aquí en el folio
 * de la hoja (`mismaVentaQueLaFila` 'debil'): Dirección dice que son dos ventas —el folio se
 * repartió dos veces— y la copia se queda como la tarjeta de SU venta, sin marca. Se anota a
 * quién NO repite (`distinta_de`) para que la siguiente bajada no la vuelva a preguntar. Con
 * una identidad fuerte no se ofrece: si la fila trae el folio de cotización o el nombre de la de
 * aquí, la bajada ya le echa su dinero a la de aquí, y decir que es otra no lo cambiaría.
 *
 * Y la de aquí se queda sin fila: la fila a la que apunta es de otra venta. Se marca como la
 * que la hoja contesta «ya es de otra venta», con sus dos salidas en la ficha, y el relevo deja
 * de mandarle cambios a esa fila (ver `subir` en puente.js). La hoja no lo sabe —la fila no trae
 * folio de cotización con qué comparar— y los escribiría en la venta de otro.
 * @returns {Promise<Resultado>} valor = la copia
 */
export async function noEsLaMisma(id) {
  const no = soloDireccion(); if (no) return no;
  const copia = await DB.obtener('proyectos', id);
  if (!copia) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  const d = copia.duplicado_de && typeof copia.duplicado_de === 'object' ? copia.duplicado_de : null;
  if (!esImportado(copia) || !d || !d.id) return mal('DATO_INVALIDO', 'Esta tarjeta no está marcada como copia de otra.');
  if (!(Array.isArray(d.claves) && d.claves.includes('identidad'))) {
    return mal('DATO_INVALIDO', 'Su fila trae el folio de cotización o el nombre de «' + (d.nombre || 'la de aquí') + '»: es la misma venta. Júntalas, o quita esta copia.');
  }
  const distinta = [...new Set([...(Array.isArray(copia.distinta_de) ? copia.distinta_de : []), d.id])];
  const r = await parcharMarca(copia.id, { duplicado_de: null, distinta_de: distinta });
  if (!r) return mal('DESCONOCIDO', 'No se pudo guardar la decisión en este teléfono.');
  const real = await DB.obtener('proyectos', d.id);
  const fh = String(copia.folio_hoja || '').trim();
  if (real && fh && String(real.notion_page_id || '') === fh && !real.fuera_de_hoja) {
    await parcharMarca(real.id, { hoja_perdida: marcaPerdida(real.hoja_perdida, 'de_otra', fh,
      'Dirección dijo en este teléfono que la fila ' + fh + ' de la hoja ya es de otra venta («' +
      (copia.nombre || copia.folio_local || fh) + '»).', Date.now()) });
  }
  await anotar({ accion: 'no_es_la_misma', entidad_id: copia.id,
    titulo: (copia.nombre || copia.folio_local) + ' no es la misma venta que ' + (d.nombre || d.id),
    detalle: 'Las dos traían el folio de hoja ' + (copia.folio_hoja || '') + ' · se quedan como dos ventas' });
  return ok(r);
}

/**
 * «Juntar con …». La copia repetida que no se juntó sola porque algo se perdería, o porque no
 * era seguro que fuera la misma venta: Dirección ya vio el porqué y dijo que sí. Las notas de la
 * copia se suman a las del proyecto; su pin y su plazo pasan solo si el proyecto no tiene los
 * suyos —si los tiene, se quedan los de aquí, y `loQueSePerderia` ya lo dijo así en la ficha—.
 * La etapa NO, porque moverla descuenta material del almacén (`avanzarEtapa`) y eso se hace a
 * mano. Y la fila queda confirmada como del proyecto (`confirmarFila`): desde la siguiente
 * bajada su dinero le cae a él. Lo que ni así se junta está en IMPIDEN_JUNTAR.
 * @returns {Promise<Resultado>} valor = {instalaciones, movimientos}
 */
export async function juntarConLaDeAqui(id) {
  const no = soloDireccion(); if (no) return no;
  const copia = await DB.obtener('proyectos', id);
  if (!copia) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  const d = copia.duplicado_de && typeof copia.duplicado_de === 'object' ? copia.duplicado_de : null;
  if (!esImportado(copia) || !d) return mal('DATO_INVALIDO', 'Esta tarjeta no está marcada como repetida.');
  const real = d.id ? await DB.obtener('proyectos', d.id) : null;
  if (!real) {
    return mal('NO_ENCONTRADO', 'No se sabe con cuál juntarla: ' + (d.por && d.por[0] ? d.por[0] : 'el proyecto de este teléfono ya no está') + '.');
  }
  const [instCopia, instReal, reqCopia] = await Promise.all([porProyecto('instalaciones', copia.id),
    porProyecto('instalaciones', real.id), porProyecto('requerimientos', copia.id)]);
  const traba = loQueSePerderia(copia, real, { instCopia, instReal, reqCopia }).filter(x => IMPIDEN_JUNTAR.has(x.clave));
  if (traba.length) {
    return mal('EN_USO', 'No se juntaron: ' + traba.map(x => x.texto).join('; ') + '. ' +
      (traba.some(x => x.clave === 'instalaciones') ? 'Cancela una de las dos instalaciones y vuelve a intentarlo.' : ''));
  }
  /* Lo que la copia tiene esperando en la bandeja —una instalación recién agendada, un cambio
     sin señal— se tiraría con ella (`juntar` limpia sus operaciones), y la instalación pasa a la
     de aquí sin encolar nada: la fecha no llegaba a la hoja hasta el siguiente cambio. La junta
     sola espera por lo mismo (`conBandeja` en `revisarContraLaHoja`); ésta también, y lo dice. */
  const esperando = await opsDelProyecto(copia.id, ['pendiente']);
  if (esperando.length) {
    return mal('EN_USO', 'No se juntaron todavía: esta copia tiene ' +
      (esperando.length === 1 ? '1 cambio' : esperando.length + ' cambios') + ' esperando en la bandeja para mandarse a su fila ' +
      (copia.folio_hoja || '') + ', y juntarlas ahora lo' + (esperando.length === 1 ? '' : 's') + ' tiraría. ' +
      'Deja que salga' + (esperando.length === 1 ? '' : 'n') + ' —Ajustes → «Mandar lo que está pendiente», con señal— y vuelve a intentarlo.');
  }
  return juntar(copia, real, true);
}
