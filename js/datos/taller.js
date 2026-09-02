/* ============================================================================
   La ventana de taller — cuándo hay que empezar, cuándo tiene que estar listo, y si vas
   tarde. PURA: sin DOM, sin red, sin IndexedDB, sin reloj. Mismos argumentos, mismo objeto.

   Lo que había antes de esto: nada. Las ocho etapas de obra son un solo string sin fecha,
   el «Límite de fabricación» del cotizador es texto libre que la arquitectura prohíbe
   parsear —con razón: adivinar una fecha de «Viernes 15 de Agosto» es cómo se produce una
   agenda que dice cosas que nadie prometió—, y el único dato de calendario que existe es la
   fecha de instalación, que es la única captura humana real del sistema.

   Así que la ventana se cuenta HACIA ATRÁS desde esa fecha, con el plazo que el dueño dijo
   con estas palabras: «1 semana - 1.5 semanas - 2 semanas - 2.5 semanas - 3 o + semanas».
   Es el mismo select de «Tiempo de entrega» que él mismo diseñó en su copia de Notion y que
   nunca se llenó porque nadie tenía razón para llenarlo. Aquí no es un campo que abrir: el
   plazo se PROPONE desde el tipo de trabajo, que ya se deriva de las partidas sin que nadie
   lo teclee, y se corrige con un toque si alguien sabe que ese trabajo son tres semanas.
   Con cero captura funciona; con un toque, mejora. Es la prueba del campo vacío de §10.

   Tres cosas que este archivo NO hace, a propósito:

   1. No mueve la etapa. Devuelve la etapa en la que el proyecto DEBERÍA ir y la que tiene,
      una al lado de la otra; la diferencia es la pantalla, no una escritura. La política ya
      está en proyectos.js, en `emitirSalidasDerivadas`: «nadie cortó nada que la plataforma
      haya visto, y escribir "cortado" aquí sería inventar un hecho de obra».
   2. No cuenta días hábiles ni conoce un festivo. «Dos semanas» dicho por teléfono son
      catorce días del calendario, no doce hábiles: contar hábiles daría un número distinto
      del que se prometió, que es la peor clase de error porque nadie lo puede rastrear. Y una
      tabla de festivos es una lista que alguien teclea en enero y nunca más; cuando en 2027
      esté vacía, el conteo no falla: se corre y sigue devolviendo una fecha plausible.
   3. No inventa capacidad. No sabe cuánta gente hay en el taller ni cuántos trabajos caben
      a la vez, y no lo pregunta. Cuenta trabajos por día, que es un dato verdadero.

   Dep: nucleo/fechas (la aritmética), datos/proyectos (solo el vocabulario: ETAPAS y los
   siete tipos). Nada más, para que se pueda probar en node y para que agenda.js la pueda
   importar sin ciclo.
   ============================================================================ */

import { esISO, hoyISO, masDias, diasEntre } from '../nucleo/fechas.js';
import { ETAPAS, TIPOS_TRABAJO } from './proyectos.js';

/* ============================================================================
   El plazo — cinco cubos, en las palabras del dueño
   ============================================================================ */

/* Las etiquetas son sus palabras, no una traducción: «1.5 semanas» y no «semana y media»,
   igual que TIPOS_TRABAJO lleva «Rotulacion» sin acento porque así está en Notion.

   Semana y media son 10.5 días y dos y media son 17.5. SE REDONDEA HACIA ARRIBA: el plazo se
   usa hacia atrás desde la instalación, así que un plazo más largo hace empezar antes, y
   empezar antes avisa antes. Es el sesgo declarado del proyecto (§9): «preferimos el falso
   positivo. Un aviso de más cuesta diez segundos; uno de menos cuesta un día de
   instalación». Redondear a 10 empuja el arranque un día tarde, y eso se descubre el día de
   la instalación. Que nadie lo «arregle» a Math.round: la dirección del redondeo es la que
   hace que el taller arranque antes, siempre. */
export const PLAZOS = [
  { k: 1, semanas: 1,   dias: 7,  etiqueta: '1 semana',        corto: '1'  },
  { k: 2, semanas: 1.5, dias: 11, etiqueta: '1.5 semanas',     corto: '1½' },
  { k: 3, semanas: 2,   dias: 14, etiqueta: '2 semanas',       corto: '2'  },
  { k: 4, semanas: 2.5, dias: 18, etiqueta: '2.5 semanas',     corto: '2½' },
  { k: 5, semanas: 3,   dias: 21, etiqueta: '3 semanas o más', corto: '3+' },
];

/* El quinto cubo es un piso, no una medida. Un trabajo que de verdad tarda cinco semanas se
   va a ver tarde desde el principio, y eso es correcto: quiere decir que hay que ponerle
   fecha aparte, no que el número esté mal. */
export const PLAZO_TOPE_DIAS = 21;

/* Lo que se supone cuando no se reconoce ningún tipo: el mismo cubo que «Custome», y por la
   misma razón que está escrita en agenda.js para la duración: «de lo que no se sabe el
   nombre tampoco se sabe el tiempo». Difiere de `duracionSugerida`, que cae al medio: allá
   equivocarse produce una cita encimada que se ve en la rejilla; aquí produce un arranque
   tarde que se descubre el día de la instalación. Costos distintos, defaults distintos. */
export const PLAZO_DEFECTO = 4;

/** El renglón de PLAZOS para una k. NUNCA devuelve undefined ni NaN: lo que no es una k de
 *  1 a 5 —null, 0, 6, 'dos', NaN— cae al cubo por defecto. */
export function plazo(k) {
  const n = Number(k);
  return PLAZOS.find(p => p.k === n) || PLAZOS.find(p => p.k === PLAZO_DEFECTO);
}

/* ----- La propuesta -----
   El cubo base por tipo de trabajo sale de lo que cada uno lleva encima. El vinil y el
   recorte se cortan y se pegan: no hay armado ni cableado. Las letras y las cajas sin luz
   se cortan, se dobla el canto y se pegan. Con luz, la conexión es la mitad del tiempo (es
   la misma frase de MIN_POR_TIPO en agenda.js). Y el «Custome» hereda el más alto, porque
   de lo que no se sabe el nombre tampoco se sabe el tiempo.

   Son un punto de partida EDITABLE, no una medición: hoy `proyectos.etapa` no tiene fecha
   ni historial, así que no hay un solo dato de cuánto tardó cortar nada. El día que lo
   haya, esta tabla se calibra con él. */
const CUBO_POR_TIPO = {
  'Rotulacion de vinil':          1,
  'Recorte acrilico':             1,
  'Letras 3D sin iluminacion':    2,
  'Caja de luz sin iluminacion':  2,
  'Letras 3D con iluminacion':    3,
  'Caja de luz con iluminacion':  3,
  'Custome / Proyecto Especial':  4,
};

/* La lámina estándar del mercado mexicano mide 1.22 × 2.44 m; es el `largo_cm` de la
   semilla de material. Una pieza más larga que eso no cabe en una lámina: son dos paneles,
   una junta, alineación y refuerzo, y eso es tiempo real. El caso existe: «Andrey -
   Healthylicious, Medidas 1 m x 2.95 m» (docs/LO-QUE-YA-EXISTE.md). */
const LARGO_LAMINA_CM = 244;

/** La medida más larga de una partida, en cm. Letras y recorte cotizan por altura; caja y
 *  bastidor por ancho × alto. Lo que no trae medida da 0 y no sube nada. */
function ladoMayor(it) {
  if (!it || typeof it !== 'object') return 0;
  const n = x => (isFinite(Number(x)) && Number(x) > 0) ? Number(x) : 0;
  if (it.tipo === 'letras' || it.tipo === 'recorte') return n(it.altura);
  if (it.tipo === 'caja' || it.tipo === 'bastidor') return Math.max(n(it.ancho), n(it.alto));
  return 0;
}

/**
 * Propone el cubo. PURA. Nadie lo captura; se corrige con un toque.
 *
 * Manda el tipo más lento, y cada tipo distinto de más suma un cubo —dos trabajos en la
 * misma fachada no se hacen en paralelo: pasan por el mismo router—. Es la misma regla que
 * `duracionSugerida` usa para las horas de instalación, traducida a semanas. Y una pieza que
 * no cabe en la lámina suma otro. Tope: el quinto cubo.
 *
 * Lo que NO sube el plazo, a propósito: el número de letras. No hay un solo dato que diga a
 * partir de cuántas letras un trabajo tarda una semana más, y un umbral inventado aquí
 * acabaría siendo el valor del sistema.
 *
 * @param {string[]} tipos  `proyecto.tipo_trabajo`, los siete valores exactos
 * @param {Object[]} [items] `proyecto.origen.items`, solo para el tamaño de la pieza
 * @param {{largo_lamina_cm?:number}} [opts]
 * @returns {{k:number, razon:string}} `razon` nunca queda vacía: es la cadena auditable
 */
export function plazoSugerido(tipos, items, opts = {}) {
  const lista = Array.isArray(tipos) ? tipos : (tipos ? [tipos] : []);
  const largoLamina = (isFinite(Number(opts.largo_lamina_cm)) && Number(opts.largo_lamina_cm) > 0)
    ? Number(opts.largo_lamina_cm) : LARGO_LAMINA_CM;

  let base = 0, lento = '', reconocidos = 0;
  for (const t of lista) {
    const k = String(t || '').trim();
    if (CUBO_POR_TIPO[k] === undefined) continue;
    reconocidos++;
    if (CUBO_POR_TIPO[k] > base) { base = CUBO_POR_TIPO[k]; lento = k; }
  }

  if (!reconocidos) {
    return { k: PLAZO_DEFECTO, razon: 'Sin tipo de trabajo reconocido → ' + plazo(PLAZO_DEFECTO).etiqueta +
             ', que es lo que se supone de lo que no se sabe qué es' };
  }

  let k = base;
  const partes = [lento + ' (' + plazo(base).etiqueta + ')'];
  if (reconocidos > 1) {
    k += reconocidos - 1;
    partes.push('+' + (reconocidos - 1) + ' cubo' + (reconocidos > 2 ? 's' : '') +
                ': hay ' + reconocidos + ' tipos de trabajo distintos');
  }
  const mayor = (Array.isArray(items) ? items : []).reduce((m, it) => Math.max(m, ladoMayor(it)), 0);
  if (mayor > largoLamina) {
    k += 1;
    partes.push('+1 cubo: la pieza mide ' + Math.round(mayor) + ' cm y la lámina ' + largoLamina + ', hay junta');
  }
  k = Math.min(PLAZOS.length, k);
  return { k, razon: partes.join(' ') + ' → ' + plazo(k).etiqueta };
}

/* ============================================================================
   Las dos constantes de tiempo, con su valor de repositorio
   ============================================================================ */

/* Viven en datos/semilla.json con su `origen` escrito, y en Material.CTS_BASE para que la
   pantalla de constantes las deje editar. Aquí el valor de repositorio, para que la función
   nunca multiplique por `undefined` si se llama sin constantes. */
export const CTS_TALLER = {
  PLAZO_COLCHON_DIAS: 1,      // el anuncio tiene que estar listo la víspera de instalar
  PLAZO_PROVEEDOR_DIAS: 3,    // lo que tarda en llegar el material. Es el DIAS_GRAVE de agenda.js
};
const LIM_TALLER = { PLAZO_COLCHON_DIAS: [0, 7], PLAZO_PROVEEDOR_DIAS: [0, 30] };

/* Un entero dentro de su rango, o el valor de repositorio. Una constante mal escrita no
   puede volverse un NaN a la mitad de una resta de fechas. */
function enteroSano(v, clave) {
  const n = Number(v);
  const [lo, hi] = LIM_TALLER[clave];
  if (!isFinite(n)) return CTS_TALLER[clave];
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/* ============================================================================
   La ventana
   ============================================================================ */

/* La etapa que sigue a cada una: es el hito contra el que se mide el atraso. `listo` sigue
   con `instalado`, que es la fecha real. Las que no están —garantia, cancelado, instalado—
   no tienen siguiente porque ya salieron del camino. */
const SIGUIENTE = { ganado: 'en_diseno', en_diseno: 'cortado', cortado: 'armado', armado: 'listo', listo: 'instalado' };
const ORDEN = ETAPAS.reduce((m, e, i) => { m[e] = i; return m; }, {});

/** La ventana vacía, con la forma completa: quien la lea no tiene que preguntar si existe
 *  cada campo. */
function vacia(p, P, fuente, razon, estado, texto) {
  return {
    proyecto_id: p && p.id || null, titulo: p && p.nombre || '',
    plazo_k: P.k, plazo_dias: P.dias, plazo_etiqueta: P.etiqueta, plazo_fuente: fuente, plazo_razon: razon,
    ancla: 'ninguna', instalacion: null, entrega_estimada: null,
    empezar: null, material: null, comprar: null, listo: null,
    hitos: { en_diseno: null, cortado: null, armado: null, listo: null, instalado: null },
    etapa_real: (p && p.etapa) || 'ganado', etapa_esperada: null,
    atraso_dias: 0, holgura_dias: 0, estado, texto,
  };
}

const fmtCorta = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return (+m[3]) + ' ' + MES[+m[2] - 1];
};

/* El verbo de cada etapa esperada, para el texto. Dice lo que hay que HACER, no el nombre
   del estado: «hay que cortar» y no «cortado». */
const VERBO = { en_diseno: 'ponerlo en diseño', cortado: 'cortar', armado: 'armar', listo: 'dejarlo listo', instalado: 'instalar' };
const PARTICIPIO = { en_diseno: 'en diseño', cortado: 'cortado', armado: 'armado', listo: 'listo', instalado: 'instalado' };

/**
 * LA función. Cuándo hay que EMPEZAR, cuándo tiene que estar el MATERIAL, cuándo tiene que
 * estar LISTO, en qué etapa DEBERÍA ir hoy, y si va tarde y por cuántos días.
 *
 * Se ancla en la instalación cuando existe y cuenta hacia ATRÁS: es el único caso que
 * produce fechas que alguien prometió. Sin instalación, se ancla en `fecha_ganado` y cuenta
 * hacia ADELANTE, y devuelve `entrega_estimada` —que NO se guarda en ningún registro y no se
 * llama `fecha`: en cuanto se guardara alguien la leería como una promesa—. Sin ninguna de
 * las dos, no inventa nada. Y NUNCA se ancla en hoy: un plan que se mueve cada vez que
 * alguien abre la app no es un plan, es un número plausible que cambia.
 *
 * El plazo se parte en tres tramos parejos entre empezar y listo —diseño, corte, armado—.
 * Parejos porque un reparto desigual afirmaría un conocimiento que no existe: la etapa no
 * tiene fecha ni historial, así que no hay dato de cuánto tardó nada. Es una suposición
 * declarada; la primera vez que fabricación corrija una, se sabrá cuál es de verdad.
 *
 * @param {Object} p        el proyecto: {id, nombre, etapa, tipo_trabajo, fecha_ganado, plazo_k, origen:{items}}
 * @param {Object|null} inst la instalación viva del proyecto, o null
 * @param {{hoy?:string, cts?:Object}} [opts] `hoy` para poder probar; `cts` = Material.constantes()
 * @returns {VentanaTaller}
 */
export function ventanaTaller(p, inst, opts = {}) {
  p = p || {};
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const cts = opts.cts || {};
  const colchon = enteroSano(cts.PLAZO_COLCHON_DIAS, 'PLAZO_COLCHON_DIAS');
  const proveedor = enteroSano(cts.PLAZO_PROVEEDOR_DIAS, 'PLAZO_PROVEEDOR_DIAS');

  /* 1. El plazo. La corrección humana SIEMPRE gana, como `cantidad_ajustada` en material. */
  const kElegido = Number.isInteger(Number(p.plazo_k)) && Number(p.plazo_k) >= 1 && Number(p.plazo_k) <= PLAZOS.length
    ? Number(p.plazo_k) : null;
  const sug = plazoSugerido(p.tipo_trabajo, p.origen && p.origen.items);
  const P = plazo(kElegido !== null ? kElegido : sug.k);
  const fuente = kElegido !== null ? 'elegido' : 'derivado';
  const razon = kElegido !== null ? 'Elegido a mano' : sug.razon;

  /* 2. Lo que no se calcula. */
  if (p.etapa === 'cancelado') return vacia(p, P, fuente, razon, 'cancelado', 'No se dio. No hay taller que planear.');

  /* 3. El ancla, en este orden, y ninguna se inventa. Una instalación cancelada no cuenta
        como fecha: es la misma regla de `Proyectos.listar({sinFecha})`. */
  const instViva = inst && esISO(inst.fecha) && inst.estado !== 'cancelada' ? inst : null;
  let ancla, D = null, base;
  if (instViva) { ancla = 'instalacion'; D = instViva.fecha; }
  else if (esISO(p.fecha_ganado)) { ancla = 'ganado'; base = p.fecha_ganado; }
  else return vacia(p, P, fuente, razon, 'sin_fecha', 'Sin fecha de instalación y sin fecha de venta: no hay de dónde contar.');

  /* 4. Los hitos. `util` son los días que quedan para trabajar entre empezar y listo, ya
        quitado el colchón. Se mide entre las dos fechas y no se supone: con un colchón tan
        largo como el plazo, «listo» caería ANTES de «empezar», y de ahí salía un armado
        posterior al listo. Si el colchón se come el plazo, listo se queda en empezar —el
        mismo día— y los tres tramos se aplastan ahí. Es lo que la prueba de monotonía exige. */
  let empezar, listo, entregaEstimada = null;
  if (ancla === 'instalacion') {
    empezar = masDias(D, -P.dias);
    listo = masDias(D, -colchon);
    if (listo < empezar) listo = empezar;
  } else {
    empezar = base;
    listo = masDias(base, Math.max(0, P.dias - colchon));
    entregaEstimada = masDias(base, P.dias);                   // se DICE, no se escribe en ningún lado
  }
  const util = diasEntre(empezar, listo);
  const t1 = Math.round(util / 3), t2 = Math.round(util * 2 / 3);
  const hitos = { en_diseno: empezar, cortado: masDias(empezar, t1), armado: masDias(empezar, t2),
                  listo, instalado: ancla === 'instalacion' ? D : null };  // la fecha real NUNCA se corre
  const comprar = masDias(hitos.cortado, -proveedor);          // puede caer antes de empezar, y es correcto

  const salida = {
    proyecto_id: p.id || null, titulo: p.nombre || '',
    plazo_k: P.k, plazo_dias: P.dias, plazo_etiqueta: P.etiqueta, plazo_fuente: fuente, plazo_razon: razon,
    ancla, instalacion: D, entrega_estimada: entregaEstimada,
    empezar: hitos.en_diseno, material: hitos.cortado, comprar, listo: hitos.listo, hitos,
    etapa_real: p.etapa || 'ganado', etapa_esperada: null, atraso_dias: 0, holgura_dias: 0,
    estado: 'a_tiempo', texto: '',
  };

  /* 5. Lo que ya se hizo no se regaña. Una instalación marcada `hecha` manda sobre una etapa
        que se quedó en `armado`: `hecha` no es una fecha del plan, es un hecho que alguien
        registró con el dedo. */
  if (p.etapa === 'instalado' || p.etapa === 'garantia' || (instViva && instViva.estado === 'hecha')) {
    salida.estado = 'hecho'; salida.etapa_esperada = 'instalado'; salida.texto = 'Ya se instaló.';
    return salida;
  }

  /* 6. La etapa que DEBERÍA ir hoy. Es una comparación, jamás una escritura. */
  const esperada = hoy < hitos.en_diseno ? 'ganado'
                 : hoy >= hitos.listo   ? 'listo'
                 : hoy < hitos.cortado  ? 'en_diseno'
                 : hoy < hitos.armado   ? 'cortado'
                 : 'armado';
  salida.etapa_esperada = esperada;

  /* 7. El atraso: cuántos días lleva pasado el hito de la etapa que SIGUE a la real. */
  const sig = SIGUIENTE[p.etapa || 'ganado'];
  const lim = sig ? hitos[sig] : null;
  const d = lim ? diasEntre(lim, hoy) : null;        // + = ya pasó
  salida.atraso_dias = d !== null && d > 0 ? d : 0;
  salida.holgura_dias = d !== null && d <= 0 ? -d : 0;
  const noLlega = salida.atraso_dias > 0 && hoy > hitos.listo &&
                  (ORDEN[p.etapa] === undefined || ORDEN[p.etapa] < ORDEN.listo);
  salida.estado = salida.atraso_dias > 0 ? (noLlega ? 'no_llega' : 'tarde')
                : salida.holgura_dias === 0 ? 'justo' : 'a_tiempo';

  /* 8. El texto, ya escrito. */
  const sinFecha = ancla === 'ganado' ? ' No hay fecha de instalación; esto cuenta desde el día que se ganó.' : '';
  if (salida.estado === 'no_llega') {
    salida.texto = 'Debía estar listo el ' + fmtCorta(hitos.listo) + ' y sigue ' + (PARTICIPIO[p.etapa] || 'sin empezar') +
      '. O se termina hoy, o hay que mover la fecha con el cliente.' + sinFecha;
  } else if (salida.estado === 'tarde') {
    salida.texto = 'Va ' + salida.atraso_dias + ' día' + (salida.atraso_dias === 1 ? '' : 's') + ' tarde: debía estar ' +
      (PARTICIPIO[sig] || sig) + ' desde el ' + fmtCorta(lim) + '.' + sinFecha;
  } else if (salida.estado === 'justo') {
    salida.texto = 'Hoy toca ' + (VERBO[sig] || sig) + '.' + sinFecha;
  } else {
    salida.texto = lim ? 'Va a tiempo. Toca ' + (VERBO[sig] || sig) + ' el ' + fmtCorta(lim) + '.' + sinFecha
                       : 'Va a tiempo.' + sinFecha;
  }
  return salida;
}

/* ============================================================================
   La carga de un día
   ============================================================================ */

/** En qué etapa está una ventana en una fecha, por sus hitos. */
function etapaEn(fecha, hitos) {
  if (fecha < hitos.cortado) return 'en_diseno';
  if (fecha < hitos.armado) return 'cortado';
  if (fecha < hitos.listo) return 'armado';
  return 'listo';
}

/**
 * Cuántos trabajos tienen este día dentro de su ventana, y de esos cuáles ARRANCAN y cuáles
 * deben quedar LISTOS. Eso es aritmética sobre datos que existen. Lo que no se puede saber
 * —si el día está lleno— no se dice: no hay porcentaje de ocupación ni semáforo de carga,
 * porque no existe en ningún sistema cuánta gente hay ni cuántos trabajos caben.
 *
 * `total` y `sin_fecha` son dos números con dos significados y ninguno finge ser el otro:
 * uno es trabajo con día prometido, el otro es trabajo ganado al que nadie le puso fecha y
 * cuyo reloj ya está corriendo (es lo que persigue la regla A7, visible en la rejilla).
 *
 * Un día vacío devuelve la carga vacía con `texto:'Taller libre.'`, nunca undefined: por lo
 * mismo que `delMes` devuelve el arreglo denso.
 *
 * @param {string} fecha ISO
 * @param {VentanaTaller[]} ventanas
 */
export function cargaDeDia(fecha, ventanas) {
  const out = { fecha: esISO(fecha) ? fecha : null, total: 0,
                por_etapa: { en_diseno: 0, cortado: 0, armado: 0, listo: 0 },
                empiezan: [], listos: [], sin_fecha: 0, texto: 'Taller libre.' };
  if (!esISO(fecha) || !Array.isArray(ventanas)) return out;

  for (const v of ventanas) {
    if (!v || v.estado === 'cancelado' || v.estado === 'hecho') continue;
    if (!v.empezar || !v.listo) continue;
    if (fecha < v.empezar || fecha > v.listo) continue;
    if (v.ancla === 'ganado') { out.sin_fecha++; continue; }   // hipótesis: no entra en total
    out.total++;
    out.por_etapa[etapaEn(fecha, v.hitos)]++;
    const quien = { id: v.proyecto_id, titulo: v.titulo };
    if (fecha === v.empezar) out.empiezan.push(quien);
    if (fecha === v.listo) out.listos.push(quien);
  }

  if (out.total || out.sin_fecha) {
    const partes = [];
    if (out.total) partes.push(out.total + ' en el taller');
    for (const q of out.empiezan) partes.push('arranca ' + (q.titulo || 'uno sin nombre'));
    for (const q of out.listos) partes.push('debe quedar listo ' + (q.titulo || 'uno sin nombre'));
    if (out.sin_fecha) partes.push(out.sin_fecha + ' ganado' + (out.sin_fecha === 1 ? '' : 's') + ' sin fecha con el reloj corriendo');
    out.texto = partes.join(' · ') + '.';
  }
  return out;
}
