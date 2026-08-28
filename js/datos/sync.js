/* ============================================================================
   EL ADAPTADOR DE SINCRONIZACIÓN.

   Su único trabajo en Fase 1 es que la Fase 3 no obligue a reescribir una línea de
   ningún módulo. Ninguna pantalla habla con un servidor: las pantallas llaman a las
   funciones de dominio, las funciones de dominio encolan aquí, y aquí —y solo aquí—
   vive todo lo que sabe que existe una red. La única pantalla que llama a este archivo
   directamente es Ajustes, para pegar la URL del puente y para el botón de bombear.

   EN FASE 1 NO HAY SERVIDOR, y se dice sin adornos:

   - `encolar()` SÍ escribe en el almacén 'pendientes' desde el primer día, aunque no
     haya a dónde mandarlo. La razón no es simetría: el día que se enchufe el puente, la
     bandeja ya trae la historia y no hay que escribir una migración que recorra tres
     almacenes adivinando qué se creó antes de que existiera la cola. Una bandeja vacía
     el día del estreno es un backfill; una bandeja llena es un bombeo.
   - `bombear()` sin puente configurado devuelve ok con motivo 'sin_puente'. NO es un
     error. Es el estado normal de Fase 1, y tratarlo como error llenaría la pantalla de
     avisos rojos que no significan nada, con el costo conocido: el usuario aprende a
     ignorar los avisos rojos y el día que uno importe tampoco lo va a leer.
   - `frescura()` existe con su forma FINAL desde hoy, aunque con un solo dispositivo
     siempre conteste «al día». Es lo que pinta la banda de «Fabricación no comparte
     desde el martes, lo que ves del almacén tiene 3 días». Si la función naciera en
     Fase 3, la banda se programaría en Fase 3 y la interfaz sí cambiaría.

   Nota de honestidad que va en el código y también en la pantalla: Notion no tiene
   comparación-e-intercambio. No hay If-Match, no hay ETag, no hay versión de página, no
   hay restricción de unicidad. El campo `esperado` de una operación ESTRECHA la ventana
   de sobrescritura, no la cierra. Por eso la interfaz dice «cambió en Notion mientras no
   tenías señal» y nunca «no se pierde nada».

   Donde la idempotencia sí es real es en 'movimientos', y es la que importa: el id lo
   genera el cliente, así que un reintento no resta el material dos veces.
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/* ============================================================================
   CONTRATO DEL WORKER DE FASE 3 — se escribe hoy para que el Worker se escriba después
   contra algo, y no al revés.

   El Worker se pega en el editor del navegador de Cloudflare. Sin node, sin wrangler,
   sin terminal. Guarda el secreto de Notion como *secret* del Worker, nunca en el
   cliente: la plataforma solo conoce la URL del Worker y su propio token de dispositivo.

   AUTENTICACIÓN — y aquí está la parte que importa de verdad:
     Todo va con `Authorization: Bearer <token de dispositivo>`. El Worker mapea
     token -> { rol, lista blanca de propiedades escribibles }. LA AUTORIDAD DE ESCRITURA
     VIVE AHÍ, no en la interfaz. Cambiar el segmento de rol en Ajustes da otro tablero,
     no da permisos: el token de FABRICACIÓN puede escribir movimientos y etapa de obra y
     el Worker le rechaza `precio_auth` con 403, aunque el teléfono diga «Dirección».
     Es la única frontera de verdad del sistema, y por eso es la única que está en el
     servidor.

   GET  /salud
     -> 200 {ok:true, ts, version, rol, escribibles:[...]}
        `escribibles` viene del token, no de lo que pidió el cliente: es lo que Ajustes
        pinta para que el usuario vea qué puede tocar este teléfono sin tener que
        probarlo rompiendo algo.
     -> 401 token desconocido. 503 Notion caído: {ok:false, mensaje} ya en español.

   POST /empujar   { ops: Operacion[] }        (de una en una; ver `bombear`)
     -> 200 { resultados: [ { id, ok:true, remoto? }
                          | { id, ok:false, codigo, mensaje, conflicto? } ] }
        `conflicto` es el registro remoto tal como está ahora. Se manda cuando el
        `esperado` de la operación no cuadra con lo que hay en Notion, y es lo que
        alimenta la pantalla de conflictos: sin el registro remoto en la respuesta, la
        pantalla solo podría decir «no se pudo» y el usuario no tendría qué comparar.
        Respeta y devuelve `Retry-After` en 429 y en 503.

   GET  /jalar?cursor=<opaco>&desde=<epoch ms>
     -> 200 { registros:[ {almacen, datos} ], cursor, hay_mas:boolean }
        El cursor es opaco a propósito: hoy es la marca de agua de `last_edited_time` de
        Notion, y si el cliente lo interpretara, cambiar de relevo obligaría a tocar el
        cliente. Se guarda tal cual y se devuelve tal cual.

   Aquí se documentaba un cuarto camino, `GET /expandir`, que resolvía un link corto de
   Google Maps del lado servidor. Se borró del Worker y no se sustituyó: no lo llamaba
   nadie —una definición y cero invocaciones— y era un `fetch` con `redirect: 'follow'`
   donde un tercero elegía los saltos, sin tope y sin reloj, alcanzable con cualquiera de
   los tres tokens. El link corto se sigue resolviendo como siempre: pidiéndole a la
   persona que lo abra y copie la dirección de la barra (js/mod/mapa.js).
   ============================================================================ */

/**
 * @typedef {{id:string, tipo:'crear'|'actualizar'|'apendice',
 *            almacen:string, entidad:string, registro_id:string, entidad_id:string,
 *            datos:Object, esperado:Object|null,
 *            ts:number, disp:string, intentos:number, ultimo_error:string,
 *            estado:'pendiente'|'conflicto', conflicto:Object|null, sync:0}} Operacion
 */

/**
 * @typedef {{nombre:string,
 *            salud:function():Promise<{ok:boolean, mensaje:string}>,
 *            subir:function(Operacion[]):Promise<Array<Object>>,
 *            bajar:function(string|null):Promise<{registros:Array<Object>, cursor:string|null}>,
 *            esquema:function():Promise<{ok:boolean, faltan:Array<Object>}>}} AdaptadorSync
 */

/* El almacén 'movimientos' es append-only y por eso no tiene conflictos posibles. No es
   una excusa para no resolverlos: es que la operación es «agregar un renglón al libro»,
   y dos dispositivos que agregan renglones distintos se fusionan sumando los dos. Un id
   repetido se DESCARTA, sin fusionar y sin sumar.

   Por qué el descarte importa tanto: el libro no guarda existencias, las deriva sumando
   sus renglones. Un libro que suma dos veces la misma entrada de 5 láminas dice que hay
   10, y entonces el semáforo del almacén dice «llego» el día que no llega, nadie compra,
   y el día de la instalación falta acrílico. Y como nadie borra renglones de un libro,
   el error no se corrige: se acumula. Un reintento tras un timeout, que es la cosa más
   normal del mundo con una red mala, alcanza para eso. */
const APPEND_ONLY = new Set(['movimientos']);

/* Tres almacenes no llevan la llave en 'id', y esto no es un detalle de estilo: buscar
   `datos.id` en un aviso devuelve undefined, y una fila que llega del puente sin llave se
   descarta en silencio. Los avisos dejarían de bajar y nadie sabría por qué. */
const LLAVE = { avisos: 'rid', constantes: 'clave', geo: 'q' };

/* Las marcas de sync viven en el propio almacén 'pendientes' bajo un id reservado con
   guion bajo, y no en localStorage, por dos razones. La primera: §4.2 congeló nueve
   claves y ninguna es esta, y agregar una décima a espaldas del documento es cómo se
   pierde el control de un contrato. La segunda: la marca tiene que morir con la bandeja.
   Si el usuario borra la base y la marca sobrevive en localStorage, el primer `jalar()`
   arranca con un cursor que apunta a un pasado que ya no está y se pierde todo lo que
   pasó antes de esa marca, en silencio.
   Todo lo que lee la bandeja filtra los ids con guion bajo. */
const ID_MARCAS = '_marcas';

const MSG = {
  SIN_PUENTE: 'Todavía no hay puente configurado. Lo que haces se guarda en este dispositivo.',
  SIN_RED: 'No hay señal. Se queda en la bandeja y se manda cuando vuelvas a tener.',
  NO_ENCONTRADO: 'Esa operación ya no está en la bandeja.',
  DATO_INVALIDO: 'Esa operación no tiene la forma que se esperaba.',
};

let _adaptador = null;
let _bombeando = null;       /* La promesa del bombeo en curso. Ver `bombear`. */
let _ultimoError = '';

/* ---------------------------------------------------------------------------
   REGISTRO Y ESTADO
   --------------------------------------------------------------------------- */

/** Enchufa el relevo de Fase 3, o lo desenchufa con null. Lo llama app.js al arrancar si
 *  hay puente guardado, y Ajustes cuando el usuario pega la URL. */
export function registrar(adaptador) {
  _adaptador = (adaptador && typeof adaptador.subir === 'function') ? adaptador : null;
}

/** true cuando hay a dónde mandar. Es lo que decide si Ajustes pinta el botón de bombear
 *  o el texto de «un solo dispositivo». */
export function configurado() {
  return !!_adaptador && Prefs.hayPuente();
}

/** Alias de `configurado()`. El documento nombró esta función `disponible` en §5.11 y
 *  `configurado` en el encargo del módulo; las dos existen porque una firma que se
 *  renombra a mitad de una construcción en paralelo rompe al que ya la importó. */
export const disponible = configurado;

/** Instantáneo, sin red y sin await. Es lo que la banda de la barra superior consulta en
 *  cada pintada, y una banda no puede esperar una transacción. */
export function estado() {
  return {
    ok: configurado(),
    configurado: configurado(),
    adaptador: _adaptador ? String(_adaptador.nombre || 'puente') : '',
    bombeando: !!_bombeando,
    ultimo_error: _ultimoError,
    dispositivo: Prefs.dispositivo(),
  };
}

/* ---------------------------------------------------------------------------
   LA BANDEJA DE SALIDA
   --------------------------------------------------------------------------- */

const esMarca = r => !r || typeof r.id !== 'string' || r.id.charAt(0) === '_';

async function marcas() {
  const m = await DB.obtener('pendientes', ID_MARCAS);
  return {
    ultimo_envio: (m && Number(m.ultimo_envio)) || null,
    ultima_bajada: (m && Number(m.ultima_bajada)) || null,
    cursor: (m && m.cursor) || null,
    /* Sello del último dato visto de cada dispositivo. Es lo que hace que la banda pueda
       nombrar a quién le falta compartir en vez de decir «hay datos viejos». */
    vistos: (m && m.vistos && typeof m.vistos === 'object') ? m.vistos : {},
  };
}

async function ponerMarcas(parche) {
  const prev = await marcas();
  /* ts:0 para que el índice porTs la deje al principio y nunca se confunda con la
     operación más vieja de la bandeja, que es la primera que hay que mandar. */
  return DB.poner('pendientes', { ...prev, ...parche, id: ID_MARCAS, ts: 0 });
}

/**
 * Encola una operación. SIEMPRE devuelve ok si cupo en IndexedDB: la escritura local ya
 * ocurrió antes de llegar aquí, y fallar la mutación porque no hubo a dónde mandarla
 * sería mentirle a la pantalla sobre un dato que sí se guardó.
 *
 * Normaliza los dos vocabularios a propósito: §5.11 nombra los campos `almacen` y
 * `registro_id`, y el encargo del módulo los nombra `entidad` y `entidad_id`. Se guardan
 * los cuatro, apuntando a lo mismo. Cuesta veinte bytes por renglón y evita que dos
 * módulos construidos en paralelo dejen la bandeja mitad en un idioma y mitad en otro,
 * que es una migración de datos por una diferencia de palabras.
 *
 * @param {Object} op
 * @returns {Promise<Resultado>} valor = la operación tal como quedó guardada
 */
export async function encolar(op) {
  if (!op || typeof op !== 'object') return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);

  const almacen = String(op.almacen || op.entidad || '').trim();
  const registro_id = String(op.registro_id || op.entidad_id || '').trim();
  if (!almacen || !registro_id) return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);

  const tipo = ['crear', 'actualizar', 'apendice'].includes(op.tipo)
    ? op.tipo
    /* Un renglón del libro es siempre un apéndice, aunque quien lo encoló haya escrito
       'crear'. Si entrara como 'crear' al puente, el relevo intentaría fusionarlo. */
    : (APPEND_ONLY.has(almacen) ? 'apendice' : 'actualizar');

  const guardada = {
    id: op.id || DB.nuevoId('op'),
    tipo, almacen, entidad: almacen, registro_id, entidad_id: registro_id,
    datos: op.datos || {},
    /* `esperado` es la foto del registro remoto que el emisor creía que había. No cierra
       la ventana de sobrescritura —Notion no tiene con qué cerrarla—, la estrecha. */
    esperado: op.esperado || null,
    ts: Number(op.ts) > 0 ? Number(op.ts) : Date.now(),
    disp: op.disp || Prefs.dispositivo(),
    intentos: Number(op.intentos) > 0 ? Number(op.intentos) : 0,
    ultimo_error: String(op.ultimo_error || ''),
    estado: 'pendiente',
    conflicto: null,
    sync: 0,
  };

  return DB.poner('pendientes', guardada);
}

/** La bandeja de salida en orden de emisión: sin los conflictos, sin lo que este relevo no
 *  sabe llevar y sin la marca. Lectura: nunca lanza, devuelve [] si la base no abrió. */
export async function pendientes() {
  const todas = await DB.listar('pendientes', { indice: 'porTs' });
  return todas.filter(o => !esMarca(o) && o.estado !== 'conflicto' && o.estado !== 'sin_destino');
}

/**
 * Lo que se apartó porque el relevo de hoy no tiene a dónde llevarlo.
 *
 * Ni se descarta ni se cuenta como pendiente, y las dos cosas son a propósito. Descartarlo
 * perdería la historia el día que sí exista la base del otro lado —que es justo lo que la
 * bandeja llena desde el primer día vino a comprar—. Contarlo como pendiente haría que
 * Ajustes dijera «47 esperando» para siempre, y un contador que nunca baja se aprende a
 * ignorar igual que un aviso rojo que no significa nada.
 *
 * Cada renglón trae en `ultimo_error` la razón escrita por el relevo, con el nombre del
 * almacén, para que la pantalla no tenga que inventar la lista.
 */
export async function sinDestino() {
  const todas = await DB.listar('pendientes', { indice: 'porTs' });
  return todas.filter(o => !esMarca(o) && o.estado === 'sin_destino');
}

/** Lo que se apartó porque el `esperado` no cuadró. Es la lista de la pantalla de
 *  conflictos, y por eso trae la operación completa: sin `datos` y sin `conflicto` no hay
 *  nada que comparar en pantalla. */
export async function conflictos() {
  const todas = await DB.listar('pendientes', { indice: 'porTs' });
  return todas.filter(o => !esMarca(o) && o.estado === 'conflicto');
}

/* ---------------------------------------------------------------------------
   BOMBEAR — subir la bandeja
   --------------------------------------------------------------------------- */

/**
 * Sube la bandeja DE UNA EN UNA, nunca en paralelo. No es prudencia: es que dos
 * operaciones sobre el mismo registro en vuelo al mismo tiempo hacen que gane la que
 * conteste después, que no es la que se emitió después. En serie, el orden de la bandeja
 * es el orden que llega.
 *
 * Respeta `Retry-After` y retrocede exponencialmente. Una operación cuyo `esperado` no
 * cuadra NO se aplica: se aparca como conflicto, con el registro remoto al lado.
 *
 * Sin puente: {ok:true, valor:{mandadas:0, motivo:'sin_puente'}}. Es el estado normal de
 * Fase 1, no un error.
 *
 * Devuelve Resultado y no el conteo pelón —§5.11 lo dibujó pelón— porque esta función
 * toca la red: la pantalla necesita distinguir «no hay puente» de «no hay señal» de «el
 * puente contestó 401», y un objeto de conteos no lo distingue. El `valor` trae los dos
 * juegos de nombres, el de §5.11 y el del encargo.
 *
 * @returns {Promise<Resultado>}
 */
export function bombear() {
  /* Va en una variable de módulo y no en un guardia con bandera booleana porque quien
     llegue segundo tiene que esperar el MISMO bombeo, no rebotar: la pantalla de ajustes
     y el bombeo automático al recuperar señal caen juntos más seguido de lo que parece,
     y rebotar dejaría la bandeja sin mandar hasta el siguiente evento. */
  if (_bombeando) return _bombeando;
  _bombeando = bombearDeVerdad().finally(() => { _bombeando = null; });
  return _bombeando;
}

const conteoVacio = extra => ({
  mandadas: 0, subidas: 0, fallidas: 0, conflictos: 0, pendientes: 0, sin_destino: 0, ...extra,
});

/* Lo apartado vuelve solo. Un relevo nuevo —o el mismo, enseñado a llevar el almacén— no
   obliga a nadie a apretar nada: en el primer bombeo, lo que este sí lleva se reincorpora
   a la cola en su orden original, porque `ts` nunca se tocó. */
async function revivirSinDestino() {
  if (!_adaptador || typeof _adaptador.lleva !== 'function') return 0;
  const apartadas = await sinDestino();
  let n = 0;
  for (const op of apartadas) {
    if (!_adaptador.lleva(op.almacen)) continue;
    await DB.poner('pendientes', { ...op, estado: 'pendiente', ultimo_error: '' });
    n++;
  }
  return n;
}

async function bombearDeVerdad() {
  if (configurado()) await revivirSinDestino();

  const cola = await pendientes();

  if (!configurado()) {
    /* Se cuenta lo que hay aunque no haya a dónde mandarlo: es el número que Ajustes
       pinta como «12 cambios esperando puente», y ver que el contador sube es lo que
       hace creíble que la bandeja de verdad está guardando. */
    return ok(conteoVacio({
      pendientes: cola.length, motivo: 'sin_puente', sin_adaptador: true,
      mensaje: MSG.SIN_PUENTE,
    }));
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return ok(conteoVacio({ pendientes: cola.length, motivo: 'sin_red', mensaje: MSG.SIN_RED }));
  }

  if (!cola.length) return ok(conteoVacio({ motivo: 'nada_que_mandar' }));

  let subidas = 0, fallidas = 0, enConflicto = 0, apartadas = 0;
  const rechazos = [];

  for (const op of cola) {
    /* Se pregunta ANTES de gastar una petición. Mandar al Worker una salida de acrílico
       para que conteste que no sabe qué hacer con ella es una vuelta de red por cada
       renglón del libro, cada vez que alguien aprieta bombear. */
    if (typeof _adaptador.lleva === 'function' && !_adaptador.lleva(op.almacen)) {
      await DB.poner('pendientes', {
        ...op, estado: 'sin_destino',
        ultimo_error: typeof _adaptador.motivo === 'function'
          ? _adaptador.motivo(op.almacen)
          : 'Este puente no lleva «' + op.almacen + '». Se queda en este dispositivo.',
      });
      apartadas++;
      continue;
    }

    let respuesta;
    try {
      const r = await _adaptador.subir([op]);
      respuesta = (Array.isArray(r) ? r : []).find(x => x && x.id === op.id) || null;
    } catch (e) {
      /* Un adaptador que lanza es un adaptador con un error de programación, no una red
         mala. Se trata igual: se para el bombeo. Seguir con la operación siguiente
         mandaría la número 8 antes que la 7 y rompería el orden, que es lo único que
         este bucle en serie estaba comprando. */
      _ultimoError = String((e && e.message) || 'el puente falló sin decir por qué');
      fallidas++;
      break;
    }

    if (respuesta && respuesta.ok) {
      /* Se guardó, pero puede que no entero. `rechazadas` trae las propiedades que el otro
         lado NO escribió y el motivo de cada una. Se acumula para que quien llamó al bombeo
         lo pueda decir: un «guardado» sobre una fila a medias es la falla más cara de este
         puente, porque nadie la busca. */
      if (Array.isArray(respuesta.rechazadas) && respuesta.rechazadas.length) {
        rechazos.push({ op: op.id, tipo: op.tipo || '', lista: respuesta.rechazadas });
      }
      await DB.borrar('pendientes', op.id);
      subidas++;
      continue;
    }

    const codigo = (respuesta && respuesta.codigo) || 'SIN_RED';

    if (codigo === 'CONFLICTO') {
      /* No se aplica y no se descarta: se aparca. Una sobrescritura silenciosa que nadie
         puede detectar después es peor que un renglón esperando en una pantalla. */
      await DB.poner('pendientes', {
        ...op, estado: 'conflicto',
        conflicto: (respuesta && respuesta.conflicto) || (respuesta && respuesta.remoto) || null,
        intentos: (op.intentos || 0) + 1,
        ultimo_error: 'cambió del otro lado mientras no tenías señal',
      });
      enConflicto++;
      continue;
    }

    await DB.poner('pendientes', {
      ...op,
      intentos: (op.intentos || 0) + 1,
      ultimo_error: String((respuesta && respuesta.mensaje) || codigo),
    });
    fallidas++;
    _ultimoError = String((respuesta && respuesta.mensaje) || codigo);

    /* Si fue la red o el puente, no tiene sentido intentar las otras 40: van a fallar
       igual y cada intento fallido sube el contador de reintentos de una operación que
       no tuvo la culpa, y con el retroceso exponencial eso la castiga por horas. */
    if (codigo === 'SIN_RED' || codigo === 'DESCONOCIDO') break;
  }

  if (subidas) await ponerMarcas({ ultimo_envio: Date.now() });

  const quedan = (await pendientes()).length;
  return ok({
    mandadas: subidas, subidas, fallidas, conflictos: enConflicto, pendientes: quedan,
    sin_destino: apartadas, rechazos,
    motivo: subidas ? (rechazos.length ? 'ok_incompleto' : 'ok') : (fallidas ? 'con_fallas' : 'ok'),
  });
}

/** Cuánto esperar antes del siguiente intento de una operación, en ms. Se exporta porque
 *  la pantalla de conflictos dice «vuelve a intentar en 4 minutos» y ese número tiene que
 *  ser el mismo que usa el bombeo, no una aproximación escrita a mano en la interfaz.
 *  Tope de una hora: más allá, un reintento cada tres horas se siente como una app
 *  rota, y el usuario tiene un botón de bombear para adelantarlo. */
export function esperaMs(intentos) {
  const n = Math.max(0, Math.trunc(Number(intentos) || 0));
  return Math.min(60 * 60 * 1000, 5000 * Math.pow(2, n));
}

/* ---------------------------------------------------------------------------
   JALAR — bajar lo de los demás
   --------------------------------------------------------------------------- */

/**
 * Baja lo que cambió del otro lado y lo fusiona. Devuelve Resultado por lo mismo que
 * `bombear`: es red, y «no hay puente» no es «no hay señal».
 * valor = {nuevos, actualizados, descartados, motivo}
 */
export async function jalar() {
  if (!configurado()) {
    return ok({ nuevos: 0, actualizados: 0, descartados: 0, motivo: 'sin_puente' });
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return mal('SIN_RED', MSG.SIN_RED);
  }

  const m = await marcas();
  let lote;
  try {
    lote = await _adaptador.bajar(m.cursor);
  } catch (e) {
    _ultimoError = String((e && e.message) || 'el puente no contestó');
    return mal('SIN_RED', MSG.SIN_RED);
  }

  const registros = (lote && Array.isArray(lote.registros)) ? lote.registros : [];
  let nuevos = 0, actualizados = 0, descartados = 0;
  const vistos = { ...m.vistos };

  for (const fila of registros) {
    const almacen = fila && String(fila.almacen || '');
    const datos = fila && fila.datos;
    if (!almacen || !DB.ALMACENES.includes(almacen) || !datos || typeof datos !== 'object') {
      descartados++;
      continue;
    }

    const id = datos[LLAVE[almacen] || 'id'];
    if (id === undefined || id === null || id === '') { descartados++; continue; }

    const local = await DB.obtener(almacen, id);

    if (APPEND_ONLY.has(almacen)) {
      /* Aquí está la idempotencia que sí es real. Un id ya presente se descarta sin
         mirar el contenido: el libro no se corrige, se le agregan renglones, así que
         volver a escribir el mismo renglón no puede ser una corrección legítima. */
      if (local) { descartados++; continue; }
      const r = await DB.poner(almacen, { ...datos, sync: 1 });
      if (r.ok) nuevos++; else descartados++;
      if (Number(datos.ts) > (vistos[datos.dispositivo] || 0) && datos.dispositivo) {
        vistos[datos.dispositivo] = Number(datos.ts);
      }
      continue;
    }

    const r = await DB.poner(almacen, local ? fusionar(local, datos) : { ...datos, sync: 1 });
    if (!r.ok) { descartados++; continue; }
    if (local) actualizados++; else nuevos++;

    const disp = datos.dispositivo || datos.disp;
    const sello = Number(datos.actualizado_en) || 0;
    if (disp && sello > (vistos[disp] || 0)) vistos[disp] = sello;
  }

  await ponerMarcas({
    ultima_bajada: Date.now(),
    cursor: (lote && lote.cursor) || null,
    vistos,
  });

  return ok({ nuevos, actualizados, descartados, motivo: 'ok' });
}

/**
 * Fusión: gana el más reciente, campo por campo.
 *
 * Con la granularidad que de verdad hay, y decir que hay más sería mentira: no existe un
 * sello por campo en ninguna parte —Notion no lo da y el esquema de §4 no lo guarda—,
 * solo `actualizado_en` por registro. Así que «campo por campo» se implementa
 * superponiendo los campos del registro más nuevo sobre los del más viejo: un campo que
 * solo trae el viejo sobrevive, y uno que traen los dos lo gana el nuevo.
 *
 * Lo que esto compra, y no es poco: FABRICACIÓN mueve `etapa` y no toca el dinero,
 * PAGOS mueve `cuenta` y no toca la etapa. Con reemplazo de registro completo, el que
 * subiera segundo borraría el cambio del otro sin que nada lo notara. Con superposición,
 * los dos cambios quedan.
 *
 * Lo que NO compra: si los dos editaron el MISMO campo, se pierde el del más viejo. Eso
 * es exactamente lo que la pantalla de conflictos existe para mostrar, y por qué la
 * operación viaja con `esperado`.
 */
export function fusionar(local, remoto) {
  const a = local || {}, b = remoto || {};
  const tL = Number(a.actualizado_en) || 0;
  const tR = Number(b.actualizado_en) || 0;
  const viejo = tR >= tL ? a : b;
  const nuevo = tR >= tL ? b : a;

  const salida = { ...viejo };
  for (const k of Object.keys(nuevo)) {
    /* undefined no es un valor: es un campo que el otro lado no mandó. Sobrescribir con
       undefined borraría el dato del viejo con nada, que es la peor de las dos. */
    if (nuevo[k] !== undefined) salida[k] = nuevo[k];
  }
  salida.actualizado_en = Math.max(tL, tR);
  salida.creado_en = Math.min(...[a.creado_en, b.creado_en].map(x => Number(x) || Infinity));
  if (!Number.isFinite(salida.creado_en)) salida.creado_en = salida.actualizado_en;
  salida.sync = 1;
  return salida;
}

/* ---------------------------------------------------------------------------
   CONFLICTOS
   --------------------------------------------------------------------------- */

/**
 * Resuelve un conflicto apartado.
 *  - 'mio':  se reencola tal cual, con el `esperado` actualizado a lo que hay del otro
 *            lado. Sin actualizarlo, el puente lo volvería a rechazar por lo mismo y el
 *            botón «que gane el mío» sería un botón que no hace nada.
 *  - 'suyo': se aplica el registro remoto encima del local y la operación se descarta.
 *            No se fusiona: el usuario ya vio las dos versiones y eligió una.
 * @returns {Promise<Resultado>}
 */
export async function resolver(opId, quien) {
  const op = await DB.obtener('pendientes', opId);
  if (!op || esMarca(op)) return mal('NO_ENCONTRADO', MSG.NO_ENCONTRADO);
  if (quien !== 'mio' && quien !== 'suyo') return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);

  if (quien === 'mio') {
    const r = await DB.poner('pendientes', {
      ...op, estado: 'pendiente', esperado: op.conflicto || op.esperado,
      conflicto: null, intentos: 0, ultimo_error: '',
    });
    return r.ok ? ok({ reencolada: true }) : r;
  }

  const remoto = op.conflicto;
  if (!remoto || typeof remoto !== 'object') {
    /* Sin la versión remota no hay nada que aplicar. Se descarta la operación, que es lo
       que el usuario pidió, y se dice qué pasó en vez de fingir que se aplicó algo. */
    await DB.borrar('pendientes', op.id);
    return ok({ aplicado: false, descartada: true });
  }

  const r = await DB.poner(op.almacen, { ...remoto, sync: 1 });
  if (!r.ok) return r;
  await DB.borrar('pendientes', op.id);
  return ok({ aplicado: true, descartada: true });
}

/* ---------------------------------------------------------------------------
   FRESCURA — la banda
   --------------------------------------------------------------------------- */

/* Cuándo un dato de otro dispositivo deja de ser «al día». Dos días y no uno: en este
   negocio hay fines de semana en que nadie abre la app, y una banda que grita el lunes
   por la mañana en todos los teléfonos es una banda que se aprende a ignorar. */
const HORAS_VIEJO = 48;

/**
 * Lo que alimenta la banda de «Fabricación no comparte desde el martes, lo que ves del
 * almacén tiene 3 días». SIN RED, instantáneo: solo lee las marcas locales. Una banda que
 * pidiera red no se pintaría cuando más importa, que es justo cuando no hay red.
 *
 * En Fase 1, con un solo dispositivo, contesta al_dia:true, dispositivos:[] y texto:''.
 * La interfaz que la consume ya está programada y la Fase 3 no la toca.
 *
 * El objeto trae los nombres de §5.11 (ultimo_envio, ultima_bajada, pendientes,
 * edad_horas, mensaje) y los del encargo (al_dia, dispositivos, texto), apuntando a lo
 * mismo: `texto` y `mensaje` son la misma cadena.
 */
export async function frescura() {
  const [m, cola] = await Promise.all([marcas(), pendientes()]);

  const vacia = {
    al_dia: true, dispositivos: [], texto: '', mensaje: '',
    ultimo_envio: m.ultimo_envio, ultima_bajada: m.ultima_bajada,
    pendientes: cola.length, edad_horas: null,
  };

  if (!configurado()) return vacia;

  const ahora = Date.now();

  /* PRIMERO hacia adentro, y por eso va antes que la revisión de los demás.
     `frescura()` solo se preguntaba si los OTROS teléfonos llevaban días sin compartir.
     Nunca si ESTE lleva días sin poder mandar. Con el token vencido, el Worker caído o el
     dominio fuera de ORIGENES, todas las operaciones fallan, se quedan en la bandeja con su
     `ultimo_error`, y lo primero que se leía al abrir la plataforma era «Al día». Es la
     peor clase de aviso: el que dice que todo está bien mientras la cola crece. Y es lo que
     más caro sale aquí, porque el que lo lee deja de respaldar. */
  const err = String(estado().ultimo_error || '');
  const envio = Number(m.ultimo_envio) || 0;
  const horasSinEnviar = envio ? Math.floor((ahora - envio) / 3600000) : null;
  if (cola.length && (err || horasSinEnviar === null || horasSinEnviar >= HORAS_VIEJO)) {
    const n = cola.length;
    const cuanto = horasSinEnviar === null
      ? 'todavía no ha salido nada de este teléfono'
      : `van ${Math.max(1, Math.round(horasSinEnviar / 24))} día(s) desde el último envío`;
    const texto = `Este teléfono no ha podido mandar ${n} ${n === 1 ? 'cambio' : 'cambios'}: ` +
      cuanto + (err ? ` (${err})` : '') + '. Lo que capturaste aquí no lo ve nadie más todavía.';
    return {
      al_dia: false, dispositivos: [], texto, mensaje: texto, atascado: true,
      ultimo_envio: m.ultimo_envio, ultima_bajada: m.ultima_bajada,
      pendientes: n, edad_horas: horasSinEnviar,
    };
  }

  const atrasados = Object.keys(m.vistos)
    .filter(d => d && d !== Prefs.dispositivo())
    .map(d => ({ disp: d, ts: Number(m.vistos[d]) || 0 }))
    .map(x => ({ ...x, horas: Math.floor((ahora - x.ts) / 3600000) }))
    .filter(x => x.horas >= HORAS_VIEJO)
    .sort((a, b) => b.horas - a.horas);

  if (!atrasados.length) return vacia;

  const peor = atrasados[0];
  const dias = Math.max(1, Math.round(peor.horas / 24));
  /* Se nombra el dispositivo y se dice la edad en días, no en horas: «hace 73 horas» hay
     que dividirlo mentalmente para saber si importa. Y el texto dice qué está viejo, no
     que la sincronización falló: al que ve la pantalla le importa el almacén. */
  const texto = atrasados.length === 1
    ? `El dispositivo ${peor.disp} no comparte desde hace ${dias} ${dias === 1 ? 'día' : 'días'}. Lo que ves de él puede estar viejo.`
    : `${atrasados.length} dispositivos no comparten desde hace días. Lo que ves de ellos puede estar viejo.`;

  return {
    al_dia: false, dispositivos: atrasados, texto, mensaje: texto,
    ultimo_envio: m.ultimo_envio, ultima_bajada: m.ultima_bajada,
    pendientes: cola.length, edad_horas: peor.horas,
  };
}
