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

async function encolar(tipo, registro) {
  const S = await mod('sync');
  if (!S || typeof S.encolar !== 'function') return;
  try {
    await S.encolar({ id: DB.nuevoId('op'), tipo, almacen: 'proyectos',
      registro_id: registro.id, datos: registro, esperado: null,
      ts: Date.now(), intentos: 0, ultimo_error: '' });
  } catch (_) { /* la escritura local ya está; la bandeja se recupera en el próximo bombeo */ }
}

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

const ORDEN = { ganado: 0, en_diseno: 1, cortado: 2, armado: 3, listo: 4, instalado: 5 };
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
 * @param {Array<Object>} items partidas del historial
 * @returns {string[]} vacío solo si no hay ni una partida legible
 */
export function tiposDerivados(items) {
  if (!Array.isArray(items)) return [];
  const halla = new Set();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
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

/* Arma el registro. Lo comparten `ganar` y `descartar` porque un proyecto descartado se
   deriva igual que uno ganado —el nombre, los tipos, el importe que se dejó de vender— y
   lo único que cambia es que no se le calcula material ni se le agenda nada. */
function armarProyecto(entrada, extra, etapa) {
  const origen = congelar(entrada);
  if (!origen) return null;

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
       recalcula, ni aquí ni en ningún otro lado de este archivo. */
    sub: num(extra.sub) || num(origen.sub),
    neto: num(extra.neto) || netoOrigen,
    precio_auth: Cot.totalVendido(origen),
    anti_pactado: num(extra.anti_pactado) || num(origen.anti),
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
 *          pct_comision?:number, disp?:string, fecha_ganado?:string}} [extra]
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
    const disp = Prefs.dispositivo();
    p = await yaExiste(Cot.folioGlobal(ref.folio, disp));
    if (!p) {
      /* Nunca fue proyecto: se crea la lápida. Trae su nombre, sus tipos y su importe
         derivados igual que uno ganado, porque «cuánto dejamos de vender este mes» es una
         pregunta que se hace y que hoy no tiene dónde leerse. */
      const nuevo = armarProyecto(ref, {}, 'cancelado');
      if (!nuevo) return mal('DATO_INVALIDO', 'No se pudo copiar esa cotización.');
      nuevo.notas = nota;
      const r = await DB.poner('proyectos', nuevo);
      if (!r.ok) return r;
      await encolar('crear', r.valor);
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
  if (f.sinUbicar) filas = filas.filter(p => p.lat === null || p.lng === null ||
                                             !isFinite(p.lat) || !isFinite(p.lng));
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
  await encolar('actualizar', r.valor);
  return ok(r.valor);
}

/* ============================================================================
   La etapa, y las salidas de material que cuelgan de ella
   ============================================================================ */

/* Hasta dónde mueve cada rol. Fabricación llega a 'listo' y no más: 'instalado' lo marca
   quien estuvo en la obra y de ahí cuelga la cobranza. Pagos no mueve obra: lo que mueve es
   `estatus_notion`, que es el otro eje. */
const TOPE_ROL = { direccion: null, fabricacion: 'listo', pagos: false };

function puedeMover(rol, etapa) {
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
  await encolar('actualizar', r.valor);

  let lineas = 0;
  const Mat = await mod('material');
  if (Mat && typeof Mat.recalcular === 'function') {
    const rm = await Mat.recalcular(r.valor.id);
    if (rm && rm.ok && rm.valor && Array.isArray(rm.valor.lineas)) lineas = rm.valor.lineas.length;
  }

  return ok({ proyecto: r.valor, cambio: antes !== ahora, lineas });
}
