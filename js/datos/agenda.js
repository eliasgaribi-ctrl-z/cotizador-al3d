/* ============================================================================
   La agenda: la única captura humana real del sistema.

   Todo lo demás en esta plataforma se deriva de algo que ya existía —el precio, las
   partidas, el tipo de trabajo, el material, la ubicación—. Aquí no: la fecha de
   instalación la sabe una persona y nadie más, y por eso este archivo se escribió con una
   sola obsesión, que es no pedir un segundo dato.

   Tres cosas que si se rompen la agenda deja de servir, cada una por su motivo:

   1. LA HORA PUEDE SER NULL, y eso NO es un formulario a medias. La fecha ya la escribe en
      Notion de todas formas (es la columna «Fecha Anticipo e Instalacion»); la hora
      muchas veces no se sabe cuando se cierra la venta, porque depende de que el cliente
      confirme o de que la plaza dé acceso. Volverla obligatoria tiene un solo efecto
      medible: que alguien invente «10:00» para poder guardar, y a partir de ahí la agenda
      dice cosas que nadie prometió. Sin hora, la agenda dice «sin hora» y el .ics sale
      como evento de todo el día. Es una respuesta, no un hueco.

   2. EL UID NO CAMBIA NUNCA, y al mover se sube `movida`, que es el SEQUENCE del .ics. Si
      el UID cambiara, el calendario del teléfono no movería el evento: crearía uno nuevo
      y dejaría el viejo colgado, y el instalador tendría dos citas para el mismo anuncio.
      Y si `movida` no subiera, el importador vería un evento que ya conoce con el mismo
      número de versión y no aplicaría el cambio: el archivo se importa «bien» y el
      calendario sigue diciendo la fecha vieja, que es la falla que nadie descubre hasta
      que alguien llega el día equivocado. Cancelar también sube `movida`, por lo mismo.

   3. EL SEMÁFORO ES LA PREGUNTA DE FABRICACIÓN MIRANDO EL MES: ¿llego o no llego? No es un
      adorno del calendario. Y contesta con el sesgo declarado de §9: preferimos el falso
      positivo. Un material que no se alcanzó a calcular cuenta como faltante, porque
      «no sé» y «sí hay» no son la misma respuesta cuando de eso depende salir a las siete
      de la mañana con la camioneta cargada.

   Dep: db, prefs, ui (fechas puras), stock/proyectos/sync (perezosos).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import { partesISO, hoyISO, fmtFecha, fmtFechaDia, fmtHora } from '../nucleo/ui.js';
import { diasEntre, ultimoDia } from '../nucleo/fechas.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/* `stock` importa `material`, que es el módulo más grande del proyecto, y `proyectos`
   importa esta agenda para agendar al ganar. Los dos se cargan cuando se usan: el estático
   de ida y vuelta sería un ciclo, y el semáforo no tiene por qué costar 60 KB de parseo a
   quien solo abrió el calendario a ver qué día es. */
async function mod(archivo) { try { return await import('./' + archivo + '.js'); } catch (_) { return null; } }

async function encolar(tipo, registro) {
  const S = await mod('sync');
  if (!S || typeof S.encolar !== 'function') return;
  try {
    await S.encolar({ id: DB.nuevoId('op'), tipo, almacen: 'instalaciones',
      registro_id: registro.id, datos: registro, esperado: null,
      ts: Date.now(), intentos: 0, ultimo_error: '' });
  } catch (_) { /* la instalación ya está guardada; la bandeja se recupera al bombear */ }
}

/* ============================================================================
   Vocabulario
   ============================================================================ */

/**
 * Las tres ventanas que existen de verdad.
 *
 * La nocturna no es una opción de catálogo: está en un proyecto real de su Notion, escrito
 * con estas palabras —«Instalacion nocturna, previamente armado en el taller»—, porque en
 * las plazas comerciales se instala cuando cierran. Y tiene una consecuencia técnica: la
 * alarma de «sal ya» pasa de −PT30M a −PT120M, que es lo que tarda cargar y cruzar
 * Guadalajara cuando la cita es a las once de la noche y el acceso se pierde si llegas
 * tarde.
 *
 * §4.5 listaba además `manana` y `tarde`. No se ofrecen: nada en el sistema las lee —el
 * .ics solo distingue si la alarma es la de dos horas o la de media—, y una opción que no
 * cambia ninguna consecuencia es la clase exacta de captura que §10 manda quitar. Se
 * siguen ACEPTANDO al leer para que un registro viejo o un respaldo restaurado no se
 * rechace, y se pintan como «de día».
 */
export const VENTANAS = ['dia', 'noche', 'madrugada'];
const VENTANAS_HEREDADAS = { manana: 'dia', tarde: 'dia' };

export const VENTANA_NOMBRE = { dia: 'De día', noche: 'De noche', madrugada: 'Madrugada' };
export const VENTANA_DESC = {
  dia: 'Horario normal de taller.',
  noche: 'Como en las plazas: se instala cuando cierran. La alarma de salir suena 2 horas antes.',
  madrugada: 'Antes de que abran. La alarma de salir suena 2 horas antes.',
};
/* Las dos que no son de día llevan la alarma larga. Se declara aquí y no en ics.js porque
   es una decisión de operación —cuánto tardan en llegar—, no del formato del archivo. */
export const VENTANA_ALARMA_LARGA = new Set(['noche', 'madrugada']);

export const ESTADOS = ['propuesta', 'confirmada', 'reagendada', 'hecha', 'cancelada'];
export const ESTADO_NOMBRE = {
  propuesta: 'Propuesta', confirmada: 'Confirmada', reagendada: 'Movida',
  hecha: 'Hecha', cancelada: 'Cancelada',
};

/** Las que siguen contando como una cita: una cancelada no ocupa el día ni pide material. */
const VIVAS = new Set(['propuesta', 'confirmada', 'reagendada', 'hecha']);

const ventanaDe = v => {
  const x = String(v || '').trim();
  if (VENTANAS.includes(x)) return x;
  return VENTANAS_HEREDADAS[x] || 'dia';
};

/* ============================================================================
   DURACIÓN — derivada, editable, cero captura
   ============================================================================ */

/* Minutos por tipo de trabajo, con los siete valores escritos como existen en Notion (sin
   acentos y con el «Custome» mal escrito, igual que en proyectos.js: corregirlo aquí sería
   inventar un octavo valor).

   De dónde salen los números: una caja con iluminación se cuelga, se nivela y se conecta, y
   la conexión es la mitad del tiempo; sin iluminación es colgar y nivelar. El vinil y el
   recorte se pegan. El «Custome» hereda el más alto porque de lo que no se sabe el nombre
   tampoco se sabe el tiempo, y quedarse corto en la agenda es lo que produce dos
   instalaciones encimadas.

   Son un punto de partida EDITABLE, y eso es la mitad del diseño: nadie tiene que llenar
   este campo para que la agenda sirva, y quien sepa que esta sí son tres horas lo cambia
   en el momento de agendar. */
const MIN_POR_TIPO = {
  'Caja de luz con iluminacion': 240,
  'Caja de luz sin iluminacion': 180,
  'Letras 3D con iluminacion': 240,
  'Letras 3D sin iluminacion': 180,
  'Rotulacion de vinil': 120,
  'Recorte acrilico': 120,
  'Custome / Proyecto Especial': 240,
};

/* El mismo mapa, por la llave de partida del cotizador. Quien tenga a mano `items[].tipo`
   —una pantalla que agenda antes de que el proyecto exista— no tiene que traducir. */
const MIN_POR_LLAVE = { caja: 240, letras: 240, recorte: 120, bastidor: 180, manual: 240 };

const DURACION_BASE = 180;   // el default de §4.5, y lo que dura una instalación normal
const DURACION_TOPE = 600;   // diez horas: más que eso no es una instalación, son dos días

/**
 * Duración propuesta, en minutos. PURA.
 *
 * Manda el trabajo más lento, y cada trabajo distinto de más suma media hora: dos letreros
 * en la misma fachada no son dos instalaciones, son una con más subidas al andamio. Se
 * redondea a media hora porque una agenda que dice «195 minutos» es una agenda que nadie
 * escribió a mano y se nota.
 *
 * @param {string[]|string} tipos los valores de `proyecto.tipo_trabajo`, o llaves de partida
 * @returns {number} minutos, nunca 0
 */
export function duracionSugerida(tipos) {
  const lista = Array.isArray(tipos) ? tipos : (tipos ? [tipos] : []);
  let base = 0, reconocidos = 0;
  for (const t of lista) {
    const k = String(t || '').trim();
    const m = MIN_POR_TIPO[k] !== undefined ? MIN_POR_TIPO[k] : MIN_POR_LLAVE[k.toLowerCase()];
    if (m === undefined) continue;
    reconocidos++;
    if (m > base) base = m;
  }
  if (!reconocidos) return DURACION_BASE;
  const total = base + Math.max(0, reconocidos - 1) * 30;
  return Math.min(DURACION_TOPE, Math.round(total / 30) * 30);
}

/* ============================================================================
   Fechas y horas
   ============================================================================ */

const esISO = x => !!partesISO(x);

/** 'HH:MM' normalizada, o null si no es una hora. `null` y `''` devuelven null sin queja:
 *  no poner hora es una respuesta válida y no tiene por qué parecer un error. */
function normHora(h) {
  if (h === null || h === undefined || h === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return undefined;                       // undefined = venía algo y no era una hora
  const H = +m[1], M = +m[2];
  if (H > 23 || M > 59) return undefined;
  return String(H).padStart(2, '0') + ':' + m[2];
}

/* `diasEntre` y `ultimoDia` viven en `nucleo/fechas.js`, con sus pruebas. Se piden contra un
   `hoy` que ENTRA y no contra el reloj, que es lo que deja probar el semáforo sin cambiarle
   la hora al teléfono. */
const p2 = n => String(n).padStart(2, '0');

/* ============================================================================
   Permisos (§8.3)
   ============================================================================ */

/* Dirección agenda y es la única que agenda. Fabricación PROPONE: se le deja guardar, pero
   la instalación queda en `propuesta` y dirección la confirma. No es seguridad —en fase 1
   cualquiera cambia su rol en Ajustes— es que la fecha que el cliente escuchó la dijo una
   sola persona, y si dos la mueven no hay forma de saber cuál es la que se prometió.
   Pagos no toca la agenda: no es su trabajo y un movimiento accidental aquí cuesta un día
   de camioneta. */
function permiso(accion) {
  const r = Prefs.rol();
  if (r === 'pagos') {
    return mal('ROL_SIN_PERMISO',
      accion + ' es de dirección. Si te toca a ti, cambia de rol en Ajustes.');
  }
  return null;
}

const estadoInicial = () => (Prefs.rol() === 'direccion' ? 'confirmada' : 'propuesta');

/* ============================================================================
   AGENDAR
   ============================================================================ */

/**
 * Agenda la instalación de un proyecto.
 *
 * @param {string} proyectoId
 * @param {{fecha:string, hora?:string|null, ventana?:string, duracion_min?:number, notas?:string}} datos
 * @returns {Promise<Resultado>} valor = la instalación
 */
export async function agendar(proyectoId, datos = {}) {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  const noPuede = permiso('Agendar');
  if (noPuede) return noPuede;

  const d = datos && typeof datos === 'object' ? datos : {};
  const id = String(proyectoId || '').trim();
  if (!id) return mal('DATO_INVALIDO', 'Falta decir de qué proyecto es la instalación.');

  const p = await DB.obtener('proyectos', id);
  if (!p) return mal('NO_ENCONTRADO', 'Ese proyecto ya no está en este dispositivo.');
  if (p.etapa === 'cancelado') {
    return mal('DATO_INVALIDO', p.nombre + ' está marcado como «no se dio». Si al final sí se dio, regrésalo antes de agendarlo.');
  }

  if (!esISO(d.fecha)) {
    return mal('DATO_INVALIDO', 'Falta el día de la instalación. Va como año-mes-día.');
  }
  const hora = normHora(d.hora);
  if (hora === undefined) {
    return mal('DATO_INVALIDO', 'Esa hora no se entiende. Va como 10:00, o déjala vacía si todavía no se sabe.');
  }

  /* Una instalación viva del mismo proyecto NO produce una segunda: se mueve la que ya
     existe. Dos citas vivas del mismo anuncio son un instalador saliendo dos veces, y como
     el .ics de cada una lleva su propio UID, el teléfono tampoco puede saber que una
     sobra. El caso llega solo: `drenarBuzon` reintenta, y alguien vuelve a darle al botón. */
  const previas = await listar({ proyecto_id: id });
  const viva = previas.find(i => VIVAS.has(i.estado));
  if (viva) {
    const igual = viva.fecha === d.fecha && (viva.hora || null) === hora &&
                  viva.ventana === ventanaDe(d.ventana);
    if (igual) return ok(viva);      // idempotente: el mismo toque dos veces no mueve nada
    return await reagendar(viva.id, {
      fecha: d.fecha, hora: hora, ventana: d.ventana,
      motivo: String(d.notas || '').trim() || 'Se volvió a agendar desde el proyecto.',
    });
  }

  const ahora = Date.now();
  const idInst = DB.nuevoId('inst');
  const fila = {
    id: idInst,
    empresa_id: Prefs.empresa(),
    proyecto_id: id,
    fecha: d.fecha,
    hora,
    ventana: ventanaDe(d.ventana),
    duracion_min: duracionValida(d.duracion_min, p),
    estado: estadoInicial(),
    movida: 0,
    /* El UID se arma del id de la instalación y se guarda: es el ancla del .ics para toda
       la vida del evento. Se guarda en vez de derivarse cada vez para que siga siendo el
       mismo aunque algún día cambie la forma de armarlo. */
    uid_ics: 'inst-' + idInst + '@al3d.mx',
    gcal_event_id: null,
    notas: String(d.notas || '').trim(),
    creado_en: ahora, actualizado_en: ahora, sync: 0,
  };

  const r = await DB.poner('instalaciones', fila);
  if (!r.ok) return r;
  await encolar('crear', r.valor);
  return ok(r.valor);
}

function duracionValida(v, proyecto) {
  const n = Number(v);
  if (isFinite(n) && n > 0) return Math.min(DURACION_TOPE, Math.round(n));
  return duracionSugerida(proyecto && proyecto.tipo_trabajo);
}

/* ============================================================================
   REAGENDAR
   ============================================================================ */

/**
 * Mueve una instalación CONSERVANDO EL UID y subiendo `movida`.
 *
 * `movida` es el SEQUENCE de iCalendar y por eso sube aquí y no en la pantalla: un
 * calendario que ya tiene el evento solo aplica el cambio si el número subió. El motivo se
 * apunta en `notas` con las dos fechas, porque «¿por qué se movió?» es la pregunta que se
 * hace tres semanas después y para entonces nadie se acuerda.
 *
 * @param {string} instId
 * @param {{fecha?:string, hora?:string|null, ventana?:string, duracion_min?:number, motivo?:string}} datos
 * @returns {Promise<Resultado>} valor = la instalación
 */
export async function reagendar(instId, datos = {}) {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  const noPuede = permiso('Mover una instalación');
  if (noPuede) return noPuede;

  const d = datos && typeof datos === 'object' ? datos : {};
  const i = await DB.obtener('instalaciones', String(instId || ''));
  if (!i) return mal('NO_ENCONTRADO', 'Esa instalación ya no está en este dispositivo.');

  const fecha = d.fecha === undefined || d.fecha === null || d.fecha === '' ? i.fecha : d.fecha;
  if (!esISO(fecha)) return mal('DATO_INVALIDO', 'La fecha nueva va como año-mes-día.');

  const hora = d.hora === undefined ? (i.hora || null) : normHora(d.hora);
  if (hora === undefined) {
    return mal('DATO_INVALIDO', 'Esa hora no se entiende. Va como 10:00, o déjala vacía si todavía no se sabe.');
  }
  const ventana = d.ventana === undefined ? ventanaDe(i.ventana) : ventanaDe(d.ventana);
  const duracion = d.duracion_min === undefined
    ? (Number(i.duracion_min) > 0 ? Number(i.duracion_min) : DURACION_BASE)
    : duracionValida(d.duracion_min, null);

  const cambio = fecha !== i.fecha || hora !== (i.hora || null) ||
                 ventana !== ventanaDe(i.ventana) || duracion !== Number(i.duracion_min);
  if (!cambio) return ok(i);   // nada que mover: subir SEQUENCE de gratis es ruido en el teléfono

  const motivo = String(d.motivo || '').trim();
  /* Solo se apunta el renglón cuando de verdad cambió el día o la hora: «se movió del 1 al
     1» es basura en un campo que alguien lee para entender qué pasó. */
  const renglon = (fecha !== i.fecha || hora !== (i.hora || null))
    ? 'Movida del ' + fmtFecha(i.fecha) + (i.hora ? ' ' + fmtHora(i.hora) : ' (sin hora)') +
      ' al ' + fmtFecha(fecha) + (hora ? ' ' + fmtHora(hora) : ' (sin hora)') +
      (motivo ? ': ' + motivo : '.')
    : motivo;

  const fila = {
    ...i,
    fecha, hora, ventana, duracion_min: duracion,
    /* `hecha` no vuelve a `reagendada`: una instalación que ya se hizo y se corrige de
       fecha sigue estando hecha. */
    estado: i.estado === 'hecha' ? 'hecha' : 'reagendada',
    movida: (Number(i.movida) || 0) + 1,
    uid_ics: i.uid_ics || ('inst-' + i.id + '@al3d.mx'),
    notas: [String(i.notas || '').trim(), renglon].filter(Boolean).join('\n'),
    actualizado_en: Date.now(),
    sync: 0,
  };

  const r = await DB.poner('instalaciones', fila);
  if (!r.ok) return r;
  await encolar('actualizar', r.valor);
  return ok(r.valor);
}

/* ============================================================================
   MARCAR y CANCELAR
   ============================================================================ */

/**
 * Cambia el estado. `hecha` es el que alimenta la etapa `instalado` del proyecto y la
 * cobranza; `cancelada` deja al proyecto otra vez sin fecha, y la regla A7 lo va a nombrar.
 * @returns {Promise<Resultado>} valor = la instalación
 */
export async function marcar(instId, estado, motivo = '') {
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());
  const e = String(estado || '').trim();
  if (!ESTADOS.includes(e)) {
    return mal('DATO_INVALIDO', 'Una instalación está propuesta, confirmada, movida, hecha o cancelada.');
  }
  const noPuede = permiso(e === 'cancelada' ? 'Cancelar una instalación' : 'Cambiar la agenda');
  if (noPuede) return noPuede;

  const i = await DB.obtener('instalaciones', String(instId || ''));
  if (!i) return mal('NO_ENCONTRADO', 'Esa instalación ya no está en este dispositivo.');
  if (i.estado === e) return ok(i);

  const nota = String(motivo || '').trim();
  const fila = {
    ...i,
    estado: e,
    /* Cancelar SUBE `movida`. El .ics de la cancelación va con el mismo UID y
       STATUS:CANCELLED, y si el SEQUENCE no subiera el calendario lo tomaría por un evento
       que ya conoce y no lo tacharía: el instalador saldría a una cita que no existe. */
    movida: e === 'cancelada' ? (Number(i.movida) || 0) + 1 : (Number(i.movida) || 0),
    uid_ics: i.uid_ics || ('inst-' + i.id + '@al3d.mx'),
    notas: [String(i.notas || '').trim(),
            nota ? ESTADO_NOMBRE[e] + ': ' + nota : ''].filter(Boolean).join('\n'),
    actualizado_en: Date.now(),
    sync: 0,
  };

  const r = await DB.poner('instalaciones', fila);
  if (!r.ok) return r;
  await encolar('actualizar', r.valor);
  return ok(r.valor);
}

/** Cancelar es marcar, y existe por su nombre porque es lo que dice el botón. */
export async function cancelar(instId, motivo = '') {
  return await marcar(instId, 'cancelada', motivo);
}

/* ============================================================================
   LEER
   ============================================================================ */

/**
 * @param {{desde?:string, hasta?:string, estado?:string, estados?:string[],
 *          proyecto_id?:string, vivas?:boolean, conProyecto?:boolean}} [filtro]
 * @returns {Promise<Object[]>} vacío si la base no abrió. NUNCA lanza.
 */
export async function listar(filtro = {}) {
  const f = filtro && typeof filtro === 'object' ? filtro : {};
  let filas = await DB.listar('instalaciones');
  if (!filas.length) return [];

  if (f.proyecto_id) filas = filas.filter(i => i && i.proyecto_id === f.proyecto_id);
  if (f.estado) filas = filas.filter(i => i && i.estado === f.estado);
  if (Array.isArray(f.estados) && f.estados.length) {
    const s = new Set(f.estados);
    filas = filas.filter(i => i && s.has(i.estado));
  }
  /* Las canceladas NO se esconden solas. Quien pinta el mes pide `vivas:true`; quien
     pregunta «¿qué pasó con esta fecha?» necesita ver la lápida. Esconder una cancelación
     es lo mismo que no haberla guardado, y de ahí sale la llamada de «¿entonces sí van a
     venir?». */
  if (f.vivas) filas = filas.filter(i => VIVAS.has(i.estado));
  if (esISO(f.desde)) filas = filas.filter(i => String(i.fecha || '') >= f.desde);
  if (esISO(f.hasta)) filas = filas.filter(i => String(i.fecha || '') <= f.hasta);

  filas.sort(ordenDia);
  if (f.conProyecto) return await conProyectos(filas);
  return filas;
}

/* Por día, y dentro del día por hora. Las que no tienen hora van al final: no es que sean
   menos importantes, es que no se pueden intercalar sin inventar a qué hora son, y
   ponerlas primero las haría parecer las de más temprano. */
function ordenDia(a, b) {
  return String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
    (a.hora ? 0 : 1) - (b.hora ? 0 : 1) ||
    String(a.hora || '').localeCompare(String(b.hora || '')) ||
    (a.creado_en || 0) - (b.creado_en || 0);
}

/* El proyecto pegado a la instalación. La agenda sin el nombre del cliente es una lista de
   horas: lo que se lee en el calendario es «Tacos Don Beto», no un uuid. */
async function conProyectos(filas) {
  if (!filas.length) return [];
  const proys = await DB.listar('proyectos');
  const mapa = new Map((proys || []).map(p => [p.id, p]));
  return filas.map(i => {
    const p = mapa.get(i.proyecto_id) || null;
    return {
      ...i,
      proyecto: p,
      titulo: (p && (p.nombre || p.folio_local)) || 'Proyecto que ya no está',
      hora_txt: i.hora ? fmtHora(i.hora) : 'sin hora',
      dia_txt: fmtFechaDia(i.fecha),
    };
  });
}

/** Las instalaciones de un día, con su proyecto y su semáforo ya resuelto. */
export async function delDia(fecha, opts = {}) {
  if (!esISO(fecha)) return [];
  const filas = await listar({ desde: fecha, hasta: fecha, vivas: opts.incluirCanceladas !== true, conProyecto: true });
  if (!filas.length) return [];
  const ctx = await contextoMaterial();
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  return filas.map(i => ({ ...i, semaforo: dictamen([i], ctx, hoy) }));
}

/**
 * El mes completo, un renglón por día, para pintar la rejilla sin que la pantalla tenga que
 * calcular nada.
 *
 * Devuelve TODOS los días del mes, incluso los vacíos, y a propósito: con un objeto indexado
 * por fecha, el día sin instalaciones devuelve `undefined` y ahí es donde una rejilla se
 * rompe con «no se puede leer .length de undefined» el mes que no hay nada agendado.
 *
 * El material se lee UNA vez para el mes entero. Preguntarle al almacén treinta veces
 * seguidas es lo que vuelve un calendario en un celular una pantalla que tarda.
 *
 * @param {string|number} anioOMes 'YYYY-MM' o el año
 * @param {number} [mes] 1-12 si el primero fue el año
 * @returns {Promise<{anio:number, mes:number, desde:string, hasta:string,
 *                    dias:Array<Object>, total:number}>}
 */
export async function delMes(anioOMes, mes) {
  let a, m;
  const txt = String(anioOMes == null ? '' : anioOMes);
  const mm = /^(\d{4})-(\d{2})$/.exec(txt);
  if (mm) { a = +mm[1]; m = +mm[2]; }
  else { a = Number(anioOMes); m = Number(mes); }
  if (!isFinite(a) || !isFinite(m) || m < 1 || m > 12) {
    const p = partesISO(hoyISO());
    a = p.a; m = p.m;
  }

  const desde = a + '-' + p2(m) + '-01';
  const hasta = a + '-' + p2(m) + '-' + p2(ultimoDia(a, m));
  const filas = await listar({ desde, hasta, conProyecto: true });
  const ctx = await contextoMaterial();
  const hoy = hoyISO();

  const porDia = new Map();
  for (const i of filas) {
    if (!porDia.has(i.fecha)) porDia.set(i.fecha, []);
    porDia.get(i.fecha).push(i);
  }

  const dias = [];
  for (let d = 1; d <= ultimoDia(a, m); d++) {
    const iso = a + '-' + p2(m) + '-' + p2(d);
    const todas = porDia.get(iso) || [];
    const vivas = todas.filter(i => VIVAS.has(i.estado));
    dias.push({
      fecha: iso, dia: d, hoy: iso === hoy,
      instalaciones: todas, vivas: vivas.length,
      semaforo: dictamen(vivas, ctx, hoy),
    });
  }
  return { anio: a, mes: m, desde, hasta, dias, total: filas.length };
}

/* ============================================================================
   EL SEMÁFORO — ¿llego o no llego?
   ============================================================================ */

/* La lista de compra se pide SIN tope de días. El `hastaDias` de `Stock.listaCompra` es
   para la lista de compra —lo que hay que ir a comprar esta semana—, y aquí la pregunta es
   por un día concreto que puede estar a dos meses. Diez años cubren cualquier agenda real
   y de todas formas el corte lo pone la instalación que se está mirando. */
const SIN_TOPE_DIAS = 3650;

/* Tres días es el corte de «grave», y no es un número redondo elegido por bonito: es el
   mismo −P3D de la alarma A1 del .ics, que es lo que el usuario tarda en conseguir material
   con sus proveedores. Con menos de eso, un faltante ya no se resuelve comprando: se
   resuelve moviendo la fecha, y esa llamada la tiene que hacer alguien hoy. */
const DIAS_GRAVE = 3;

/**
 * Lee una vez lo que el semáforo necesita: qué falta, por proyecto, y de qué proyectos
 * hay material calculado.
 */
export async function contextoMaterial() {
  const ctx = { faltantes: new Map(), conReq: new Set(), leido: false };

  const reqs = await DB.listar('requerimientos');
  for (const r of (reqs || [])) {
    if (r && r.proyecto_id && r.estado !== 'descartado') ctx.conReq.add(r.proyecto_id);
  }

  const S = await mod('stock');
  if (!S || typeof S.listaCompra !== 'function') return ctx;
  let filas = [];
  try { filas = await S.listaCompra({ hastaDias: SIN_TOPE_DIAS }) || []; }
  catch (_) { return ctx; }
  ctx.leido = true;

  for (const f of filas) {
    if (!f) continue;
    /* Falta lo que hay que comprar, y también lo que no se pudo calcular por falta de un
       dato: `requiere_dato` con 0 no es «no falta nada», es «no sé», y el sesgo de §9 dice
       que eso se cuenta como faltante. */
    const falta = Number(f.comprar) > 0 || f.confianza === 'requiere_dato';
    if (!falta) continue;
    for (const p of (f.proyectos || [])) {
      if (!p || !p.id) continue;
      if (!ctx.faltantes.has(p.id)) ctx.faltantes.set(p.id, []);
      ctx.faltantes.get(p.id).push({
        material_id: f.material_id, nombre: f.nombre,
        comprar: Number(f.comprar) || 0, unidad_compra: f.unidad_compra,
        confianza: f.confianza, requiere: f.requiere || '',
        proveedor: f.proveedor || '', tel_proveedor: f.tel_proveedor || '',
      });
    }
  }
  return ctx;
}

/**
 * El dictamen, ya con todo leído. Se separa de la lectura porque es la parte que se prueba
 * sola y la que se corre treinta veces para pintar un mes.
 * @param {Object[]} instalaciones las vivas del día (o la sola que se preguntó)
 */
export function dictamen(instalaciones, ctx, hoy) {
  const insts = (instalaciones || []).filter(Boolean);
  if (!insts.length) {
    return { estado: 'ok', codigo: 'sin_agenda', faltantes: [], dias: null,
             instalaciones: 0, texto: 'Nada agendado.' };
  }

  const dias = insts.reduce((min, i) => {
    const d = diasEntre(hoy, i.fecha);
    return d === null ? min : (min === null ? d : Math.min(min, d));
  }, null);

  const faltantes = [];
  const vistos = new Set();
  const sinCalcular = [];
  for (const i of insts) {
    const pid = i.proyecto_id;
    if (!pid) continue;
    if (!ctx.conReq.has(pid)) {
      sinCalcular.push(i.titulo || pid);
      continue;
    }
    for (const f of (ctx.faltantes.get(pid) || [])) {
      const k = f.material_id;
      if (vistos.has(k)) continue;
      vistos.add(k);
      faltantes.push(f);
    }
  }

  /* Un proyecto sin material calculado se pinta como falta, no como listo. «No se ha
     calculado» y «ya está todo» son la misma cara verde si se confunden, y la diferencia
     se descubre a las siete de la mañana. */
  if (sinCalcular.length) {
    return {
      estado: dias !== null && dias <= DIAS_GRAVE ? 'grave' : 'falta',
      codigo: 'sin_calcular', faltantes, dias, instalaciones: insts.length,
      texto: 'No se ha calculado el material de ' + sinCalcular[0] +
        (sinCalcular.length > 1 ? ' y ' + (sinCalcular.length - 1) + ' más' : '') +
        '. Ábrelo y dale «recalcular material».',
    };
  }

  if (!faltantes.length) {
    /* Sin haber podido leer el almacén no se dice «está todo»: se dice que no se sabe. */
    if (!ctx.leido) {
      return { estado: 'falta', codigo: 'sin_calcular', faltantes: [], dias,
               instalaciones: insts.length,
               texto: 'No se pudo leer el almacén, así que no se sabe si está el material.' };
    }
    return { estado: 'ok', codigo: 'cubierto', faltantes: [], dias, instalaciones: insts.length,
             texto: 'El material está.' };
  }

  const grave = dias !== null && dias <= DIAS_GRAVE;
  const primero = faltantes[0];
  const resto = faltantes.length - 1;
  const cuando = dias === null ? '' :
    dias < 0 ? ' — era ' + fmtFecha(insts[0].fecha) :
    dias === 0 ? ' — se instala hoy' :
    dias === 1 ? ' — se instala mañana' : ' — se instala en ' + dias + ' días';

  return {
    estado: grave ? 'grave' : 'falta',
    codigo: 'falta', faltantes, dias, instalaciones: insts.length,
    texto: 'Falta ' + primero.nombre + (resto > 0 ? ' y ' + resto + ' material' + (resto > 1 ? 'es' : '') + ' más' : '') + cuando + '.',
  };
}

/**
 * ¿Llega el material? LA pregunta de fabricación mirando el mes.
 *
 * Acepta lo que quien pregunta tenga a mano: una fecha 'YYYY-MM-DD' (todas las
 * instalaciones vivas de ese día), el id de una instalación, o la instalación misma.
 *
 * @param {string|Object} fechaOInstalacion
 * @returns {Promise<{estado:'ok'|'falta'|'grave', codigo:string, faltantes:Object[],
 *                    dias:number|null, instalaciones:number, texto:string}>}
 */
export async function semaforo(fechaOInstalacion, opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  let insts = [];

  if (fechaOInstalacion && typeof fechaOInstalacion === 'object') {
    insts = [fechaOInstalacion];
  } else if (esISO(fechaOInstalacion)) {
    insts = await listar({ desde: fechaOInstalacion, hasta: fechaOInstalacion, vivas: true, conProyecto: true });
  } else {
    const i = await DB.obtener('instalaciones', String(fechaOInstalacion || ''));
    if (i) insts = [i];
  }

  /* Con el título pegado, porque el texto del dictamen nombra el proyecto y «No se ha
     calculado el material de 8f3a-…» no le dice nada a nadie. */
  if (insts.length === 1 && !insts[0].titulo) insts = await conProyectos(insts);

  const ctx = await contextoMaterial();
  return dictamen(insts.filter(i => VIVAS.has(i.estado) || !i.estado), ctx, hoy);
}

/* ============================================================================
   El .ics
   ============================================================================ */

/**
 * Traduce una instalación al objeto que `nucleo/ics.js` espera. Vive aquí y no en la
 * pantalla porque el UID y el SEQUENCE son de este módulo: si el mapeo estuviera en la
 * interfaz, cada pantalla que exporte un .ics podría equivocarse por su cuenta y el
 * síntoma —eventos duplicados en el teléfono de alguien más— no se ve desde aquí.
 *
 * PURA. Sin dinero: el .ics se comparte con el instalador y con fabricación.
 */
export function paraIcs(inst, proyecto) {
  const i = inst || {}, p = proyecto || {};
  const titulo = p.nombre || p.folio_local || 'Instalación';
  const ventana = ventanaDe(i.ventana);

  const linea = [];
  if (Array.isArray(p.tipo_trabajo) && p.tipo_trabajo.length) linea.push('Se instala: ' + p.tipo_trabajo.join(', '));
  if (p.contacto) linea.push('Buscar a: ' + p.contacto + (p.tel ? ' · ' + p.tel : ''));
  linea.push(i.hora ? 'Hora: ' + fmtHora(i.hora) : 'Sin hora todavía: confírmala antes del día.');
  if (ventana !== 'dia') linea.push('Ventana: ' + (VENTANA_NOMBRE[ventana] || ventana));
  if (p.entrecalles) linea.push('Entre calles: ' + p.entrecalles);
  if (p.maps_url) linea.push('Mapa: ' + p.maps_url);
  if (i.notas) linea.push(i.notas);

  return {
    uid: i.uid_ics || ('inst-' + (i.id || '') + '@al3d.mx'),
    fecha: i.fecha, hora: i.hora || null,
    duracion_min: Number(i.duracion_min) > 0 ? Number(i.duracion_min) : DURACION_BASE,
    summary: 'Instalación · ' + titulo,
    description: linea.join('\n'),
    location: [String(p.dir_texto || '').replace(/\s*\n\s*/g, ', '), p.entrecalles]
      .filter(Boolean).join(' — '),
    secuencia: Number(i.movida) || 0,
    estado: i.estado || 'confirmada',
    ventana,
  };
}
