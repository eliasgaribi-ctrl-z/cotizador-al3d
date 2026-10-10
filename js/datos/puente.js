/* ============================================================================
   EL RELEVO DEL PUENTE — fase 3, del lado del navegador.

   `sync.js` congeló la interfaz `AdaptadorSync` en fase 1 justo para que este archivo se
   pudiera escribir después sin tocar una línea de ninguna pantalla. Este es ese archivo, y
   por eso es el ÚNICO de la plataforma que sabe dos cosas:

     1. que del otro lado hay un Apps Script publicado dentro de la hoja de finanzas, y
     2. cómo se llaman las propiedades del puente —el vocabulario que heredó de Notion y que
        el Apps Script traduce a columnas de la pestaña Ventas.

   Ningún módulo importa este. Lo enchufa `app.js` al arrancar y lo desenchufa Ajustes. Si
   mañana el relevo dejara de ser la hoja, se reescribe este archivo y nada más.

   ── Lo que este relevo LLEVA, y lo que no ──────────────────────────────────────
   La venta: `proyectos` e `instalaciones`, las dos caras de la misma fila de `Ventas`. Y desde
   puente-sheets-9 también el almacén: `movimientos` (el libro), `materiales` (el catálogo) y
   `requerimientos` (de donde sale la lista de compra), cada uno a su pestaña —«Almacén»,
   «Catálogo de material», «Listas de compra»— por sus dos caminos propios (/empujar_almacen y
   /jalar_almacen; ver `subirAlmacen` y `bajarAlmacen`). Hasta la 8 esos tres se apartaban en
   la bandeja de cada teléfono «hasta que exista su pestaña»; el primer bombeo contra una hoja
   que ya las tiene los reincorpora solos, en su orden (`sync.revivirSinDestino`).

   NO lleva los avisos (se calculan en cada teléfono), las constantes del taller ni la caché de
   ubicaciones. Lo que no lleva NO se descarta y NO se cuenta como pendiente de mandar: `sync.js`
   lo aparta con el motivo escrito. Descartarlo perdería el día que sí haya destino; contarlo
   como pendiente haría que Ajustes dijera «47 esperando» para siempre, y un contador que nunca
   baja se aprende a ignorar igual que un aviso rojo que no significa nada. Y lo mismo el
   almacén contra una hoja que todavía corre la 8 o una anterior: se aparta con su razón —«la hoja no tiene la
   pestaña»— y vuelve solo cuando la hoja se actualiza.

   ── Por qué no viaja `esperado` ────────────────────────────────────────────────
   El Worker sabe comparar contra `last_edited_time` y este relevo no se lo manda. No es
   olvido: un PATCH de Notion es POR PROPIEDAD, no por fila. Este relevo escribe la etapa,
   la dirección, la ubicación, el tipo de trabajo y las fechas —propiedades que nadie
   toca a mano en Notion— y NO escribe ninguna fórmula ni el neto. Un PATCH nuestro no
   puede pisar el dinero que alguien acaba de teclear allá, así que el control de
   concurrencia protegería contra un choque que no puede ocurrir, a cambio de un GET extra
   por operación y de un campo nuevo en el modelo congelado.

   Las dos excepciones son `Estatus` y `Cuenta `, y ahí gana el último: las manda el rol de
   PAGOS a propósito, apretando un botón, y lo que quiso decir es «pon esto».

   ── El espejo que baja, y por qué no crea proyectos ────────────────────────────
   `bajar()` NO convierte cada fila de la hoja en un proyecto. La hoja tiene tres años y 199
   filas anteriores a la plataforma: sin partidas, sin origen y sin material. Convertirlas
   llenaría el tablero de proyectos huecos que nadie puede fabricar. Sobre un PROYECTO solo
   se espeja el dinero de la fila que YA lo tiene de este lado, atada por `Folio cotizacion`.

   Lo que sí baja de TODAS las filas es el renglón del libro mayor, al almacén `ventas_hoja`
   (ver `ventaDeHoja`). Hasta septiembre de 2026 las filas sin proyecto aquí «se miraban y se
   dejaban donde estaban», y el récord de vendidas de Control era el de ESTE teléfono: lo
   registrado desde otro aparato o desde la propia hoja no sumaba. Ahora Control suma lo que
   la hoja dice; el tablero de obra sigue siendo solo de lo que tiene proyecto.
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import { desdeVentaDeHoja, marcarPerdidaEnLaHoja, revisarContraLaHoja, ataLaFila, foliosDeHoja, sumarSinMandar,
         telefonoLimpio, telefonoDe, tienePin, ubicacionDeHoja, SELLO_DE_CAMPO } from './proyectos.js';
import { PLAZOS } from './taller.js';
import { ENTREGAS, ENTREGA_NOMBRE, entregaDe, entregaDesdeHoja } from './entrega.js';
import * as Ingreso from '../nucleo/ingreso.js';
import { duracionSugerida } from './agenda.js';
import { fmtFecha, fmtHora, hoyISO } from '../nucleo/ui.js';

/* ============================================================================
   El vocabulario del puente. Son los nombres que heredó de Notion —con el espacio final
   incluido donde lo tenían— y que el Apps Script traduce a columnas de la pestaña Ventas.

   No se «limpian» los espacios de `Precio Neto ` y `Cuenta `: el mapa de columnas del otro
   lado busca por este nombre exacto, y cambiar uno aquí sin cambiarlo allá deja el campo
   fuera sin decir nada.

   Esta tabla y la del Apps Script tienen que decir lo mismo. Es la única duplicación a
   propósito del sistema, y existe porque el Apps Script no se importa: se pega en un editor.
   ============================================================================ */
export const P = {
  proyecto:    'Proyecto',
  subtotal:    'Precio Subtotal',
  iva:         'IVA',
  neto:        'Precio Neto ',           // fórmula
  anticipo:    'Anticipo',
  liquidacion: 'Liquidacion',
  abonoCom:    'Abono Comision',
  pendiente:   'Pago Pendiente',         // fórmula
  comisiones:  'Comisiones',             // fórmula
  comRestante: 'Comision Restante',      // fórmula
  /* «Fecha Comision» ya no está aquí: en la hoja no existe —la fecha de cada abono vive en la
     pestaña de abonos— y la prueba que la buscaba en el Apps Script pasaba porque el nombre
     aparece… en la lista de lo que ya no existe. */
  estatus:     'Estatus',
  cuenta:      'Cuenta ',                // con espacio final
  fecha:       'Fecha Anticipo e Instalacion',
  fechaLiq:    'Fecha Liquidacion',
  /* Las siete que la plataforma necesita y que se crean A MANO en Notion. */
  folio:       'Folio cotizacion',
  etapa:       'Etapa de obra',
  fechaInst:   'Fecha instalacion',
  horaInst:    'Hora instalacion',
  ubicacion:   'Ubicacion',
  direccion:   'Direccion',
  tipo:        'Tipo de trabajo',
  /* El % pactado con quien trajo el trabajo, en puntos (10 = 10 %). Columna AD de la hoja
     desde puente-sheets-4; antes la hoja cobraba 10 % fijo y el teléfono enseñaba otro. */
  pctCom:      'Porcentaje comision',
  /* El teléfono del cliente, columna AE desde puente-sheets-11. Lo leen y lo escriben los tres
     roles: fabricación llama para instalar y pagos cobra por WhatsApp. */
  tel:         'Telefono',
  /* Cómo sale el trabajo del taller, columna AF desde puente-sheets-12: «Instalación»,
     «Paquetería» o «Recolección en taller» (ENTREGA_A_HOJA). La leen los tres roles y la
     escriben dirección y fabricación. */
  entrega:     'Entrega',
  /* Las notas del proyecto y el plazo de taller, columnas AG y AH desde puente-sheets-14. Las
     notas las leen y escriben los tres roles; el plazo, dirección y fabricación. */
  notas:       'Notas',
  plazo:       'Plazo taller',
  /* Cuándo se cambió cada dato de la obra, columna AI (oculta) desde puente-sheets-14. No se
     escribe: la hoja la pone al día con los sellos que viajan aparte (`sellos` de la operación). */
  sellos:      'Sellos',
};

/** Los cinco plazos de taller como se escriben en la columna AH: las etiquetas de PLAZOS
 *  (js/datos/taller.js), en su orden. Letra por letra las de `PLAZOS_TALLER` del Apps Script:
 *  pruebas/puente.mjs compara las dos listas. */
export const PLAZO_A_HOJA = PLAZOS.map(x => x.etiqueta);
/** El cubo de la plataforma (1 a 5) en la etiqueta de la hoja, o '' (el propuesto). PURA. */
export function plazoAHoja(k) {
  const x = PLAZOS.find(p => p.k === Number(k));
  return x ? x.etiqueta : '';
}
/** Lo que dice la celda AH, en el cubo de la plataforma (1 a 5), o null. La misma lectura que
 *  `plazoDeCelda` del Apps Script: lo tecleado a mano se lee en semanas («2», «1½», «3+»). PURA. */
export function plazoDesdeHoja(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace('½', '.5').replace(',', '.');
  const m = /^(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 3) return 5;
  const i = [1, 1.5, 2, 2.5].indexOf(n);
  return i >= 0 ? i + 1 : null;
}

/** Las opciones de la columna AF, en el orden del desplegable. Son las de `ENTREGA_NOMBRE`
 *  (js/datos/entrega.js), y tienen que ser letra por letra las de `ENTREGAS` del Apps Script:
 *  pruebas/puente.mjs compara las dos listas. */
export const ENTREGA_A_HOJA = Object.fromEntries(ENTREGAS.map(k => [k, ENTREGA_NOMBRE[k]]));

/* Los cuatro estatus y las cinco cuentas, EN EL ORDEN DE LA HOJA: es el orden del
   desplegable de la columna D y C y del reporte «POR ESTATUS», y el mismo que enseña el
   modal de Registrar Venta del cotizador. Las pantallas de la plataforma importan estas dos
   listas —no tienen copia propia— y pruebas/replicas.mjs compara las cuatro copias que no se
   pueden importar (el Apps Script y el <select> del cotizador) con este orden. */
/** Los cuatro valores que de verdad existen en la columna Estatus de la hoja. */
export const ESTATUS = ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO'];
/** Las cinco cuentas que de verdad existen en `Cuenta `. */
export const CUENTAS = ['Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT'];
/** Los que mueve PAGOS: cobrar es pasar a cobrando o a liquidado. */
export const ESTATUS_DE_PAGOS = ['COBRANDO', 'LIQUIDADO'];
/* De los cuatro, los que son TRABAJO DEL TALLER. Es lo que decide qué fila de la hoja se
   importa como proyecto cuando no nació en el cotizador (ver `bajar()` al final). COBRANDO
   ya se hizo y solo falta cobrarlo —de eso vive Control, desde el récord— y LIQUIDADO está
   cerrado; las 199 filas históricas son casi todas liquidadas, y por eso importar «lo vivo»
   no llena el tablero: lo llena de lo que de verdad está en el taller.
   Va aquí, al lado del vocabulario, para que quien toque la lista de estatus vea esta. */
export const VIVAS_EN_TALLER = ['FABRICACION', 'REPARANDO'];
/* Las etapas de la línea del taller, antes de «Instalado»: de éstas sale sola una tarjeta
   importada cuando la hoja ya cobra su venta (ver `bajar()`). */
const EN_LA_LINEA = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo'];

/* Quita las llaves que no traen valor. Un `undefined` en un parche NO es «ponlo en nada»:
   `sync.fusionar` conserva lo que ya estaba cuando el campo no viene, y dejarlo pasar
   escribiría `undefined` encima de un dato bueno. */
function sinIndefinidos(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/* ----- Las ocho etapas, con el nombre que se lee en Notion -----
   La etapa es de OBRA y el `Estatus` de Notion es de DINERO: son dos ejes y no se mezclan.
   Se manda el nombre legible y no el identificador interno porque del otro lado lo lee una
   persona en un tablero, y «en_diseno» en una vista de Notion es una fuga de programador.

   Este mapa y la lista de opciones de `Etapa de obra` del Worker tienen que coincidir
   EXACTAMENTE. Si no coinciden, Notion no falla: CREA la opción que le mandes, y el
   esquema se ensucia una venta a la vez sin que nadie lo note. Por eso el Worker valida
   contra su lista y rechaza lo que no esté. */
export const ETAPA_A_NOTION = {
  ganado:      'Ganado',
  en_diseno:   'En diseño',
  cortado:     'Cortado',
  armado:      'Armado',
  listo:       'Listo para instalar',
  instalado:   'Instalado',
  garantia:    'En garantía',
  cancelado:   'No se dio',
};
export const ETAPA_DESDE_NOTION = Object.fromEntries(
  Object.entries(ETAPA_A_NOTION).map(([k, v]) => [v, k]));

/** Lo que este relevo sabe llevar. `sync.js` lo consulta ANTES de gastar una petición. */
export const ALMACENES = ['proyectos', 'instalaciones', 'movimientos', 'materiales', 'requerimientos'];

/** Los del almacén: van a sus propias pestañas, en lotes, y solo a una hoja que las tenga.
 *  `sync` los agrupa en un viaje (`agrupa`), porque una compra recibida son diez renglones del
 *  libro y un recálculo diez líneas de la lista: de uno en uno, con el cupo de 60 peticiones por
 *  minuto de la hoja, una tanda atrasada se quedaba sin cupo a la mitad. */
export const DEL_ALMACEN = ['movimientos', 'materiales', 'requerimientos'];

/** Desde qué versión del puente existen las pestañas del almacén. */
export const VERSION_DEL_ALMACEN = 9;

/** Desde qué versión la hoja sabe del teléfono del cliente (columna AE). Con una anterior el
 *  teléfono no viaja: no se manda —la 10 lo rechazaría como «tu rol no lo escribe», que no es
 *  verdad— y no baja, porque la fila no lo trae. Todo lo demás sigue igual. */
export const VERSION_DEL_TELEFONO = 11;

/** Desde qué versión la hoja sabe de la entrega (columna AF). Con una anterior la entrega no
 *  viaja, con la misma regla que el teléfono con la 10: no se manda —la 11 la rechazaría como
 *  «tu rol no la escribe»— y no baja, porque la fila no la trae. */
export const VERSION_DE_LA_ENTREGA = 12;

/** Desde qué versión la hoja guarda las notas, el plazo de taller y los sellos de cada dato
 *  (columnas AG:AI) y decide quién gana por la hora de cada cambio. Con una anterior las notas y
 *  el plazo no viajan, y la etapa, la dirección y lo demás bajan como bajaban. */
export const VERSION_DE_LA_OBRA = 14;

/** Lo que este relevo BAJA entero y de lo que la hoja es la única dueña: `sync.jalar` borra
 *  de estos almacenes, al cerrar un barrido completo, lo que la hoja ya no trajo. */
export const ESPEJOS = ['ventas_hoja'];

/* Cada uno con su frase entera y no con un sustantivo metido en una plantilla. La
   plantilla ya se escribió y ya salió mal: «Las listas de compra SE QUEDA en este
   dispositivo». Una frase armada con pegamento no concuerda en plural, y este texto lo lee
   una persona que está intentando entender por qué su cambio no salió. */
const NO_LLEVA = {
  avisos:         'Los avisos se calculan al abrir la plataforma, en cada dispositivo. No viajan y no hace falta que viajen.',
  constantes:     'Las constantes del taller se quedan en este dispositivo.',
  geo:            'La caché de ubicaciones se queda en este dispositivo. Se vuelve a llenar sola.',
};
/* Los del almacén, contra una hoja que todavía corre un puente anterior al 9. */
const HOJA_SIN_PESTANA = {
  movimientos:    'El libro del almacén espera aquí: la hoja todavía corre un puente sin la pestaña «Almacén».',
  materiales:     'El catálogo de material espera aquí: la hoja todavía corre un puente sin la pestaña «Catálogo de material».',
  requerimientos: 'Las listas de compra esperan aquí: la hoja todavía corre un puente sin la pestaña «Listas de compra».',
};

/** El texto que Ajustes pinta al lado de lo apartado. Sale de aquí para que la pantalla no
 *  invente una lista de almacenes que este archivo podría cambiar mañana. */
export function motivoSinDestino(almacen) {
  if (HOJA_SIN_PESTANA[almacen]) {
    return HOJA_SIN_PESTANA[almacen] + ' Se manda solo en cuanto se actualice el Apps Script de la hoja (puente-sheets-' +
      VERSION_DEL_ALMACEN + ' o posterior). No se pierde nada.';
  }
  return 'El puente lleva a la hoja la venta, el almacén, el catálogo de material y las listas de compra. ' +
    (NO_LLEVA[almacen] || 'Eso se queda en este dispositivo hasta que exista su pestaña.');
}

/** El número de una versión del puente («puente-sheets-9» → 9), o 0. PURA. */
export function numeroDeVersion(version) {
  const m = /^puente-sheets-(\d+)$/.exec(String(version || '').trim());
  return m ? Number(m[1]) : 0;
}

/* ============================================================================
   LOS MAPEOS. Puros: sin red, sin base de datos y sin `Date.now()`, para que la prueba
   de node los pueda correr enteros. Todo lo que tiene que ver con la forma del dato de
   Notion está aquí y solo aquí.
   ============================================================================ */

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const esISO = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const texto = v => String(v == null ? '' : v);
/* Una celda de la fila que VINO vacía: la llave está y su valor es null o ''. No es lo mismo
   que una llave que no vino —la hoja le quita a fabricación las de dinero—: la vaciada es
   alguien que borró el dato en la hoja, y eso también tiene que llegar. */
const vaciada = (fila, k) => Object.prototype.hasOwnProperty.call(fila, k) && (fila[k] === null || fila[k] === '');

/**
 * Un proyecto de la plataforma, en propiedades de Notion.
 *
 * NO manda: `Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante` ni
 * `Fecha Comision`, que son fórmulas y el Worker las rechazaría con su razón; ni
 * `Liquidacion`, `Abono Comision` ni `Fecha Liquidacion`, que las captura quien cobra,
 * del lado de Notion, y que la plataforma no guarda.
 *
 * ── Qué viaja cuándo, y por qué no todo siempre ──
 * La hoja es el libro mayor del dinero (§4.0) y ahí PAGOS corrige a mano el anticipo, el
 * subtotal o el nombre del proyecto. Hasta septiembre de 2026 cada subida —mover la etapa,
 * poner un pin— mandaba también `Precio Subtotal`, `Anticipo`, `IVA` y `Proyecto` con lo que
 * este teléfono tenía guardado, y eso pisaba la corrección hecha allá: el saldo cambiaba sin
 * que nadie hubiera tocado dinero. Ahora esos cuatro y la fecha del anticipo viajan en el
 * ALTA (la fila no existe todavía) o cuando la operación dice que ese campo fue justo lo que
 * cambió (`opts.campos`, que `proyectos.actualizar` anota).
 *
 * Y lo mismo, desde septiembre de 2026, el estatus y la cuenta, la etapa, la dirección, la
 * ubicación y el tipo. Viajaban siempre, con el valor que este teléfono tenía al encolar, y
 * eso también pisaba: PAGOS marcaba LIQUIDADO en la hoja, Dirección movía una etapa antes de
 * su siguiente bajada, y el estatus regresaba al de antes —y con la cuenta, el IVA de la fila—;
 * fabricación movía la etapa de una tarjeta importada, que nace sin pin, y borraba la
 * ubicación de la fila; un teléfono que nunca bajó la etapa nueva la regresaba al editar una
 * nota. Ahora cada uno va cuando es lo que cambió. Una operación encolada por una versión
 * anterior no trae `campos` (null): de ésa no se sabe qué cambió, y sus campos de la
 * plataforma van como iban —el estatus y la cuenta no, que siempre llegaban con `campos`—.
 *
 * @param {Object} p proyecto de §4.4
 * @param {Object|null} inst su instalación, si ya tiene fecha
 * @param {{alta?:boolean, campos?:string[]|null}} [opts] sin `opts` se manda todo (es un alta)
 * @returns {Object} nombre de propiedad de Notion -> valor
 */
export function aNotion(p, inst, opts) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const alta = o.alta === undefined ? true : !!o.alta;
  const sabe = Array.isArray(o.campos);
  const campos = new Set(sabe ? o.campos : []);
  const va = campo => alta || campos.has(campo);
  const vaPropio = (...cs) => alta || !sabe || cs.some(c => campos.has(c));

  if (va('nombre'))       out[P.proyecto] = texto(p.nombre);
  if (va('sub'))          out[P.subtotal] = num(p.sub);
  if (va('iva'))          out[P.iva]      = p.iva !== false;
  if (va('anti_pactado')) out[P.anticipo] = num(p.anti_pactado);
  /* El % pactado. Cero o vacío no se manda: en la hoja, la celda vacía significa «el de
     siempre, 10 %», y un 0 escrito significaría que no hay comisión, que es otra cosa. */
  if (va('pct_comision') && num(p.pct_comision) > 0) out[P.pctCom] = num(p.pct_comision);

  /* El folio ata la fila al cotizador, y va con el dispositivo pegado: `al3d_folio` es un
     contador local, dos teléfonos emiten COT-0042 el mismo día y no son el mismo trabajo.
     Es también la llave con la que el espejo encuentra la fila al bajar.

     Solo viaja el `folio_global`, y solo si lo hay. Hasta septiembre de 2026 caía a
     `folio_local`, y un proyecto IMPORTADO de la hoja (`folio_global` vacío, `folio_local`
     = V-100) escribía «V-100» encima del COT-0042@AAAA de la fila: el teléfono que había
     vendido esa cotización dejaba de reconocer su venta, la importaba otra vez y Control la
     sumaba dos veces. La hoja ya tampoco deja pisar esa columna en un cambio. */
  if (texto(p.folio_global).trim()) out[P.folio] = texto(p.folio_global);

  const etapa = ETAPA_A_NOTION[p.etapa];
  if (etapa && vaPropio('etapa')) out[P.etapa] = etapa;

  if (va('estatus_notion') && ESTATUS.includes(p.estatus_notion)) out[P.estatus] = p.estatus_notion;
  if (va('cuenta') && CUENTAS.includes(p.cuenta))                 out[P.cuenta]  = p.cuenta;

  if (vaPropio('dir_texto')) out[P.direccion] = texto(p.dir_texto);
  /* Cero coma cero no es «no sabemos dónde está»: es la Isla Nula, en el Atlántico, y un
     pin ahí se ve igual de convincente que uno bueno. Es el mismo cordón que `geo.enRango`
     ya tiene del lado del mapa, y tiene que estar de los dos: un cero de relleno que se
     cuela a Notion queda en el libro mayor y de ahí nadie lo saca. Sin coordenada, vacío. */
  const la = Number(p.lat), ln = Number(p.lng);
  if (vaPropio('lat', 'lng')) out[P.ubicacion] = (p.lat !== null && p.lng !== null && isFinite(la) && isFinite(ln) &&
                      Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0))
    ? la + ',' + ln : '';

  if (vaPropio('tipo_trabajo')) out[P.tipo] = Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo.slice() : [];

  /* El teléfono del cliente (puente-sheets-11): el del proyecto, o el de la cotización si el
     proyecto no tiene uno propio, que es el que enseña la ficha. Vacío SOLO cuando la operación
     dice que lo que cambió fue el teléfono (alguien lo borró): en un alta o en un cambio de otra
     cosa, un vacío de aquí no es «bórralo», es «no lo sé», y le quitaría a la fila el que otro
     teléfono o una persona en la hoja ya le había puesto. */
  if (alta || !sabe || campos.has('tel')) {
    const tel = telefonoDe(p);
    if (tel || campos.has('tel')) out[P.tel] = tel;
  }

  /* La entrega (puente-sheets-12). Con la regla del teléfono, y por lo mismo: en un cambio de la
     entrega va siempre, también «Instalación» (alguien la regresó); en un alta, solo si NO es
     instalación, porque el alta puede caer en una fila que ya existía (la busca por folio) y ahí
     una persona pudo haber puesto «Paquetería» que un «Instalación» de oficio le borraría. Vacía
     en la hoja ya es instalación. Una operación de una versión anterior (sin `campos`) no la
     manda: ninguna la conocía. */
  if (alta || campos.has('entrega')) {
    const ent = entregaDe(p);
    if (ent !== 'instalacion' || campos.has('entrega')) out[P.entrega] = ENTREGA_A_HOJA[ent];
  }

  /* Las notas y el plazo de taller (puente-sheets-14), con la regla del teléfono: en un alta van
     si hay algo; en un cambio, cuando fueron lo que cambió —vacío también: alguien los borró—. Una
     operación de una versión anterior (sin `campos`) no los manda: ninguna los conocía. */
  if ((alta && texto(p.notas).trim()) || campos.has('notas')) out[P.notas] = texto(p.notas);
  if ((alta && plazoAHoja(p.plazo_k)) || campos.has('plazo_k')) out[P.plazo] = plazoAHoja(p.plazo_k);

  /* Las dos fechas, y por qué ya NO se pisan.
     Con Notion, `Fecha Anticipo e Instalacion` era una sola columna que significaba las dos
     cosas, y cuando había instalación se le ponía esa. En la hoja son dos columnas con dos
     significados y dos cuentas colgando: la L es «Fecha anticipo» —de ella salen los días
     de cobro (liquidación menos anticipo) y la antigüedad de lo que falta cobrar— y la M es
     «Fecha instalación». Seguir metiendo la instalación en la del anticipo le movía la
     antigüedad a toda la cartera y hacía que «días de cobro» contara desde el día que se
     instaló, no desde el que se cobró.

     Cada una lleva lo suyo: la del anticipo, el día en que se ganó; la de instalación, la
     de la instalación, y solo si está agendada. */
  if (va('fecha_ganado') && esISO(p.fecha_ganado)) out[P.fecha] = p.fecha_ganado;
  if (inst && esISO(inst.fecha)) {
    out[P.fechaInst] = inst.fecha;
    out[P.horaInst]  = texto(inst.hora);
  }

  return out;
}

/**
 * Una instalación, en propiedades de Notion. Va contra la MISMA fila del proyecto: en
 * Notion no hay una base de instalaciones y no hace falta, porque una venta tiene una
 * instalación y la fila ya tiene las columnas.
 *
 * `viva` es la instalación que manda en el proyecto (ver `instalacionDe` del relevo), cuando la
 * operación se sube. Hasta septiembre de 2026 se mandaba la de la operación tal cual, y una
 * CANCELADA escribía su fecha en la columna M como si siguiera en pie: nadie la vaciaba después,
 * y la antigüedad de la cobranza (P, que cuenta desde M) contaba desde una instalación que no
 * existe, a veces futura. Ahora, si el proyecto tiene otra viva —se reagendó—, va ésa; si ya
 * no tiene ninguna, la fecha y la hora se vacían.
 */
export function instalacionANotion(inst, viva) {
  if (viva !== undefined) {
    if (viva) return instalacionANotion(viva);
    if (inst && inst.estado === 'cancelada') return { [P.fechaInst]: '', [P.horaInst]: '' };
  }
  if (!inst || typeof inst !== 'object' || !esISO(inst.fecha)) return {};
  /* Solo la columna de instalación. La del anticipo es de la venta, no de la instalación:
     ver el comentario de las dos fechas en `aNotion`. */
  const out = {};
  out[P.fechaInst] = inst.fecha;
  out[P.horaInst]  = texto(inst.hora);
  return out;
}

/* ============================================================================
   QUIÉN GANA: EL CAMBIO MÁS RECIENTE, DATO POR DATO (puente-sheets-14)

   La regla, con ejemplos, está en puente/README.md («Quién gana»). En corto:
     · cada dato de la obra lleva la hora en que alguien lo cambió (el «sello»): aquí en
       `proyecto.sellos` (ver `sellar` en proyectos.js), en la hoja en la columna «Sellos»;
     · al subir, la hoja no escribe un dato si ya tiene uno con un sello más nuevo;
     · al bajar, este teléfono solo toma lo que en la hoja es más nuevo que lo suyo, nunca
       encima de un cambio suyo que todavía está en la bandeja, y una celda vacía solo borra si
       alguien la borró a propósito desde la plataforma (trae sello);
     · la fecha y la hora de instalación son un solo dato, la cita, y su sello es el de la
       instalación que la puso o la canceló (`selloDeInstalacion`).
   El dinero no está aquí: de ése la hoja es la dueña y baja siempre (`deNotion`).
   ============================================================================ */

/** La columna de la hoja de cada grupo de `proyecto.sellos`. */
const COLUMNA_DEL_SELLO = {
  etapa: P.etapa, notas: P.notas, plazo_k: P.plazo, tel: P.tel, dir_texto: P.direccion,
  ubicacion: P.ubicacion, entrega: P.entrega, instalacion: P.fechaInst,
};
const GRUPO_DE_COLUMNA = Object.fromEntries(Object.entries(COLUMNA_DEL_SELLO).map(([g, c]) => [c, g]));

/** Cuándo se cambió por última vez esta instalación, con la mano de alguien. La que bajó de la
 *  hoja guarda el sello de la hoja (`sello_hoja`) y la hora en que se escribió aquí
 *  (`sello_hoja_en`); si después alguien la tocó aquí, su `actualizado_en` ya es otro y manda ése.
 *  PURA. */
export function selloDeInstalacion(i) {
  if (!i || typeof i !== 'object') return 0;
  const a = Number(i.actualizado_en) || 0;
  if (Number(i.sello_hoja) > 0 && Number(i.sello_hoja_en) === a) return Number(i.sello_hoja);
  return a;
}

/**
 * Los sellos que viajan con una operación: para cada columna de la obra que va en `props`, cuándo
 * se cambió ese dato en este teléfono. Lo que no se sabe va en cero (no se manda), y la hoja lo
 * escribe solo donde ella tampoco sabe. PURA.
 * @param {Object} op la operación de la bandeja
 * @param {Object} props lo que se va a mandar (de `aNotion` o `instalacionANotion`)
 * @param {Object|null} inst la instalación cuyos datos van en props, si van
 * @returns {Object} columna → ms
 */
export function sellosDeLaOperacion(op, props, inst) {
  const out = {};
  const d = (op && op.datos) || {};
  const tiene = d.sellos && typeof d.sellos === 'object';
  const campos = new Set(Array.isArray(op && op.campos) ? op.campos : []);
  for (const col of Object.keys(props || {})) {
    let ms = 0;
    if (col === P.fechaInst || col === P.horaInst) ms = selloDeInstalacion(inst);
    else {
      const g = GRUPO_DE_COLUMNA[col];
      if (!g) continue;
      /* Una operación de antes de los sellos (`datos.sellos` no existe) cuenta con su propia hora
         para lo que dice que cambió; una de ahora, solo con lo que se selló: volver a guardar un
         dato que no cambió no lo vuelve el más reciente. */
      if (tiene) ms = Number(d.sellos[g]) || 0;
      else if (Object.keys(SELLO_DE_CAMPO).some(c => SELLO_DE_CAMPO[c] === g && campos.has(c))) ms = Number(op.ts) || 0;
    }
    if (ms > 0) out[col] = ms;
  }
  return out;
}

const mismoPin = (a, b) => Number(a).toFixed(6) === Number(b).toFixed(6);

/**
 * Lo que de la obra le toca a este proyecto de una fila que bajó, con la regla de arriba. PURA.
 * Solo para una fila que trae sus sellos (`venta.sellos`: una hoja con la columna AI); con una
 * anterior devuelve null y quien llama se queda con las reglas de antes.
 *
 * Un dato que en la hoja tiene valor pero no sello (escrito antes de los sellos) cuenta como
 * «antiquísimo»: le gana a lo que este teléfono tiene sin sello —así todos terminan viendo lo que
 * dice la hoja— y pierde contra cualquier cambio que alguien haya hecho desde entonces.
 *
 * @param {Object} venta el renglón de `ventaDeHoja`, con `sellos` (grupo → ms)
 * @param {Object} local el proyecto de este teléfono
 * @param {{ocupados?:Set<string>}} [o] los grupos con un cambio de este teléfono en la bandeja
 *        ('*' = todos)
 * @returns {{parche:Object, sellos:Object}|null}
 */
export function obraDeLaFila(venta, local, o = {}) {
  if (!venta || !local || !venta.sellos || typeof venta.sellos !== 'object') return null;
  const ocupados = o.ocupados instanceof Set ? o.ocupados : new Set();
  const ls = local.sellos && typeof local.sellos === 'object' ? local.sellos : {};
  const parche = {};
  const sellos = { ...ls };
  let cambio = false;

  const toma = (g, valorHoja, vacio, igual, aplicar, borrable) => {
    if (ocupados.has('*') || ocupados.has(g)) return;
    const explicito = Number(venta.sellos[g]) > 0;
    const hs = explicito ? Number(venta.sellos[g]) : (vacio ? 0 : 1);
    if (!(hs > (Number(ls[g]) || 0))) return;
    if (vacio && (!explicito || !borrable)) return;
    sellos[g] = hs;
    cambio = true;
    if (!igual) aplicar();
  };

  const et = venta.etapa || null;
  toma('etapa', et, !et, et === local.etapa, () => { parche.etapa = et; }, false);

  if (typeof venta.notas === 'string') {
    const n = venta.notas;
    toma('notas', n, !n.trim(), n === String(local.notas || ''), () => { parche.notas = n; }, true);
  }
  if (venta.plazo_k !== undefined) {
    const k = venta.plazo_k === null ? null : Number(venta.plazo_k);
    const lk = local.plazo_k === null || local.plazo_k === undefined ? null : Number(local.plazo_k);
    toma('plazo_k', k, k === null, k === lk, () => { parche.plazo_k = k; }, true);
  }
  if (typeof venta.telefono === 'string') {
    const t = venta.telefono;
    toma('tel', t, !t, t === telefonoDe(local), () => { parche.tel = t; }, true);
  }
  {
    const d = String(venta.direccion || '');
    toma('dir_texto', d, !d.trim(), d === String(local.dir_texto || ''), () => { parche.dir_texto = d; }, true);
  }
  {
    const u = ubicacionDeHoja(venta.ubicacion);
    const vacia = !String(venta.ubicacion || '').trim();
    const igual = u.lat !== null
      ? (tienePin(local) && mismoPin(u.lat, local.lat) && mismoPin(u.lng, local.lng))
      : (vacia ? !tienePin(local) : (!tienePin(local) && u.maps_url === String(local.maps_url || '').trim()));
    toma('ubicacion', venta.ubicacion, vacia, igual, () => {
      if (u.lat !== null) Object.assign(parche, { lat: u.lat, lng: u.lng, geo_fuente: u.geo_fuente },
                                         u.maps_url ? { maps_url: u.maps_url } : {});
      else Object.assign(parche, { lat: null, lng: null, geo_fuente: 'sin_ubicar' }, u.maps_url ? { maps_url: u.maps_url } : {});
    }, true);
  }
  if (typeof venta.entrega === 'string') {
    const e = venta.entrega;
    toma('entrega', e, !e, e === entregaDe(local), () => { parche.entrega = e; }, false);
  }
  return cambio ? { parche, sellos } : { parche: {}, sellos: null };
}

/**
 * Una fila de Notion, en el parche de espejo que la plataforma guarda. SOLO campos de los
 * que Notion es dueño (§4.0): el dinero, su estatus, su cuenta y sus dos fórmulas.
 *
 * Nunca devuelve `nombre`, `etapa`, `tipo_trabajo` ni la dirección aunque la fila los
 * traiga: de esos la dueña es la plataforma, y dejarlos bajar convertiría un espejo en una
 * pelea por quién manda.
 *
 * @returns {Object|null} null si la fila no trae folio, que es la única llave que ata
 */
export function deNotion(fila) {
  if (!fila || typeof fila !== 'object') return null;
  const folio = texto(fila[P.folio]).trim();
  if (!folio) return null;

  const hay = v => v !== undefined && v !== null && v !== '';
  const parche = { folio_global: folio, notion_page_id: fila.id_notion || null,
                   notion_estado: 'enviado' };

  if (ESTATUS.includes(fila[P.estatus])) parche.estatus_notion = fila[P.estatus];
  if (CUENTAS.includes(fila[P.cuenta]))  parche.cuenta = fila[P.cuenta];
  /* El anticipo y el % de comisión también bajan: son celdas que PAGOS corrige a mano en la
     hoja, y hasta septiembre de 2026 esa corrección no llegaba nunca al teléfono, que seguía
     estimando el saldo con el anticipo viejo. La hoja es la dueña del dinero (§4.0).
     Y BORRAR también es corregir: una celda vaciada en la hoja llega como null, y se
     tomaba por «no vino» —el teléfono se quedaba con el % viejo—. Vacía no es ausente: la
     de fabricación sí llega sin la llave (ver `vaciada`). En el proyecto, sin anticipo es 0
     y el % vacío es 0, que es como el proyecto dice «el de siempre, 10 %». */
  if (hay(fila[P.anticipo])) parche.anti_pactado = num(fila[P.anticipo]);
  else if (vaciada(fila, P.anticipo)) parche.anti_pactado = 0;
  if (hay(fila[P.pctCom]))   parche.pct_comision = num(fila[P.pctCom]);
  else if (vaciada(fila, P.pctCom)) parche.pct_comision = 0;
  /* Las dos fórmulas. Bajan y jamás se calculan de este lado: dos implementaciones de la
     misma fórmula divergen en semanas y el sistema empieza a dar dos respuestas. El saldo
     llega con el signo de la hoja —positivo es lo que te deben—, que es el que `saldoDe`,
     el aviso «instalado con saldo» y el filtro de cobro esperan. Una fórmula vacía es null
     —«la hoja no lo sabe»—, nunca un cero, que diría «ya no deben nada». */
  if (hay(fila[P.pendiente]))   parche.pago_pendiente = num(fila[P.pendiente]);
  else if (vaciada(fila, P.pendiente)) parche.pago_pendiente = null;
  if (hay(fila[P.comRestante])) parche.comision_restante = num(fila[P.comRestante]);
  else if (vaciada(fila, P.comRestante)) parche.comision_restante = null;

  return parche;
}

/* ============================================================================
   EL RÉCORD DE VENTAS DE LA HOJA — cada fila, tenga o no proyecto aquí.

   `deNotion` espeja el dinero de una fila SOBRE el proyecto de este teléfono, y solo si lo
   hay. Eso dejaba fuera justo lo que Control necesita para decir «cuánto vendimos»: las
   filas capturadas desde otro teléfono, las dadas de alta en la propia hoja (⚡ AL3D →
   Registrar nueva venta) y las 199 anteriores a la plataforma.

   Esto es lo otro: la fila entera como registro del almacén `ventas_hoja`, con el folio
   interno de la hoja (V-042) de id. NO es un proyecto —no tiene partidas, ni material, ni
   entra al tablero de obra—: es el renglón del libro mayor tal como está allá, para
   sumarlo. `ventas.unificar` lo cruza con los proyectos locales por «Folio cotizacion».
   Puro: sin red, sin base y sin reloj, para que la prueba de node lo corra entero.
   ============================================================================ */
export function ventaDeHoja(fila) {
  if (!fila || typeof fila !== 'object') return null;
  const nombre = texto(fila[P.proyecto]).trim();
  const folioCot = texto(fila[P.folio]).trim();
  const folioHoja = texto(fila.id_notion).trim();
  /* Sin nombre y sin folio no es una venta: es un renglón vacío. */
  if (!nombre && !folioCot) return null;

  const hay = v => v !== undefined && v !== null && v !== '';
  const fecha = k => (esISO(fila[k]) ? String(fila[k]) : '');
  const v = {
    /* El folio interno de la hoja es el id estable: el nombre se corrige y el folio de
       cotización solo lo traen las filas que nacieron en el cotizador. */
    id: 'hoja:' + (folioHoja || folioCot || nombre),
    folio_hoja: folioHoja,
    folio_cotizacion: folioCot,
    nombre,
    cuenta: CUENTAS.includes(fila[P.cuenta]) ? fila[P.cuenta] : null,
    estatus: ESTATUS.includes(fila[P.estatus]) ? fila[P.estatus] : null,
    tipo_trabajo: Array.isArray(fila[P.tipo]) ? fila[P.tipo].map(texto).filter(Boolean) : [],
    iva: fila[P.iva] !== false,
    fecha_anticipo: fecha(P.fecha),
    fecha_instalacion: fecha(P.fechaInst),
    fecha_liquidacion: fecha(P.fechaLiq),
    /* La etapa de obra, si la fila la trae: las anteriores a la plataforma no la tienen, y
       ahí queda null —no «ganado»—, porque inventarle una etapa a una venta de hace dos
       años es lo que Control no debe hacer. */
    etapa: ETAPA_DESDE_NOTION[fila[P.etapa]] || null,
    direccion: texto(fila[P.direccion]),
    /* La columna AB tal cual: «lat,lng», o el link que la hoja no pudo leer. La lee
       `proyectos.ubicacionDeHoja`. */
    ubicacion: texto(fila[P.ubicacion]),
  };
  /* El teléfono, solo si la fila trae la llave: la hoja la manda desde puente-sheets-11 y solo
     si tiene la columna AE. Sin la llave no se escribe nada —`fusionar` conserva el de antes—;
     con la llave vacía es '' de verdad, y eso es lo que la revisión de la bajada usa para saber
     que a esa fila le falta el teléfono que este lado sí tiene. */
  if (Object.prototype.hasOwnProperty.call(fila, P.tel)) v.telefono = telefonoLimpio(fila[P.tel]);
  /* La entrega, con la misma regla (puente-sheets-12): sin la llave (hoja sin AF) no se escribe;
     con la celda vacía es '' —«la hoja no dice», que se lee instalación pero NO pisa lo de este
     lado— y la revisión de la bajada lo usa para mandar la que la fila no tiene. */
  if (Object.prototype.hasOwnProperty.call(fila, P.entrega)) v.entrega = entregaDesdeHoja(fila[P.entrega]);
  /* Las notas, el plazo y los sellos (puente-sheets-14): solo si la fila trae la columna de los
     sellos —una hoja con AG:AI—. Los sellos se guardan por dato de la plataforma (etapa, notas,
     tel…; la cita es `instalacion`), que es como los compara `obraDeLaFila`. */
  if (fila[P.sellos] && typeof fila[P.sellos] === 'object') {
    v.notas = texto(fila[P.notas]);
    v.plazo_k = plazoDesdeHoja(fila[P.plazo]);
    const s = {};
    for (const [col, ms] of Object.entries(fila[P.sellos])) {
      const g = GRUPO_DE_COLUMNA[col];
      if (g && Number(ms) > 0) s[g] = Number(ms);
    }
    v.sellos = s;
  }
  /* El dinero, SOLO si vino. A fabricación la hoja le manda la fila sin estas columnas, y
     un ausente no es un cero: `sync.fusionar` conserva lo que ya estaba cuando el campo no
     viene. Las fórmulas —neto, pendiente, comisiones— bajan y nunca se calculan aquí.
     Pero una celda que vino VACÍA sí se escribe, como null: es una liquidación capturada
     por error que alguien borró, o un % que volvió a «el de siempre». Con undefined,
     `fusionar` conservaba el número viejo y el récord seguía enseñando el borrado. */
  const D = { sub: P.subtotal, neto: P.neto, anticipo: P.anticipo, liquidacion: P.liquidacion,
              pago_pendiente: P.pendiente, comisiones: P.comisiones, abono_comision: P.abonoCom,
              comision_restante: P.comRestante, pct_comision: P.pctCom };
  for (const [k, col] of Object.entries(D)) {
    if (hay(fila[col])) v[k] = num(fila[col]);
    else if (vaciada(fila, col)) v[k] = null;
  }
  return v;
}

/* ============================================================================
   LA FECHA DE INSTALACIÓN QUE SE ESCRIBIÓ EN LA HOJA

   Hasta octubre de 2026 la fecha viajaba en un solo sentido: la agenda la escribía en la
   columna «Fecha instalacion» y nada la leía de regreso. Una fecha tecleada directo en la hoja
   se quedaba en el récord de Control y el Calendario no la veía nunca. Ahora baja, y MANDA LA
   HOJA (decisión de Elías, 2026-10-08): si el proyecto no tiene instalación se le agenda, y si
   tiene una con otra fecha u otra hora, se mueve a la de la hoja.

   Se mueve como mueve la agenda (`agenda.reagendar`): el mismo UID y `movida` + 1, porque si
   no, el .ics que ya está en el teléfono del instalador no se entera del cambio. Y se apunta
   en las notas que fue la hoja, que es lo que alguien va a preguntar después.

   Lo que NO hace, a propósito:
   - Una celda de fecha vacía no cancela nada. Vacía es también «todavía no se capturó», y
     cancelar una cita confirmada por un hueco en la hoja es peor que no enterarse.
   - Sin instalación, solo se agenda lo que está en la línea del taller y de hoy en adelante.
     Una fecha pasada en una venta de hace meses es historia, no una cita: agendarla llenaría
     el Calendario de instalaciones «sin marcar».
   - Una hora que no se entiende se ignora y se queda la que había; una hora ausente (la fila
     no trae la llave) también. Una hora VACÍA sí manda: es «sin hora».
   Puro: sin red, sin base y sin reloj (`o.hoy`, `o.ahora`, `o.nuevoId`).
   ============================================================================ */

/**
 * @param {Object} fila   la fila de la hoja (`datos` de /jalar)
 * @param {Object} proyecto el proyecto de este lado al que cae la fila
 * @param {Object[]} insts las instalaciones de ese proyecto en este teléfono
 * @param {{hoy:string, ahora:number, nuevoId:function():string, empresa?:string}} o
 * @returns {Object|null} la instalación a escribir, o null si no hay nada que cambiar
 */
export function instalacionDeHoja(fila, proyecto, insts, o = {}) {
  if (!fila || typeof fila !== 'object' || !proyecto) return null;
  const fecha = String(fila[P.fechaInst] || '');
  if (!esISO(fecha)) return null;
  if (proyecto.etapa === 'cancelado') return null;

  /* La hora: undefined = no cambia; null = sin hora; 'HH:MM' = ésa. */
  let hora;
  const crudo = fila[P.horaInst];
  if (crudo === null || (crudo !== undefined && String(crudo).trim() === '')) hora = null;
  else if (crudo !== undefined) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(crudo).trim());
    if (m && +m[1] <= 23 && +m[2] <= 59) hora = m[1].padStart(2, '0') + ':' + m[2];
  }

  const vivas = (Array.isArray(insts) ? insts : [])
    .filter(i => i && i.estado !== 'cancelada' && esISO(i.fecha))
    .sort((a, b) => (Number(b.actualizado_en) || 0) - (Number(a.actualizado_en) || 0));
  const viva = vivas[0];
  const ahora = Number(o.ahora) || 0;

  if (viva) {
    const horaNueva = hora === undefined ? (viva.hora || null) : hora;
    if (viva.fecha === fecha && (viva.hora || null) === horaNueva) return null;
    const cuando = (f, h) => fmtFecha(f) + (h ? ' ' + fmtHora(h) : ' (sin hora)');
    return {
      ...viva,
      fecha, hora: horaNueva,
      estado: viva.estado === 'hecha' ? 'hecha' : 'reagendada',
      movida: (Number(viva.movida) || 0) + 1,
      uid_ics: viva.uid_ics || ('inst-' + viva.id + '@al3d.mx'),
      notas: [String(viva.notas || '').trim(),
              'Movida del ' + cuando(viva.fecha, viva.hora) + ' al ' + cuando(fecha, horaNueva) +
              ': así quedó en la hoja.'].filter(Boolean).join('\n'),
      actualizado_en: ahora,
    };
  }

  if (!EN_LA_LINEA.includes(String(proyecto.etapa || ''))) return null;
  if (!esISO(o.hoy) || fecha < o.hoy) return null;
  const id = typeof o.nuevoId === 'function' ? o.nuevoId() : '';
  if (!id) return null;
  return {
    id,
    empresa_id: proyecto.empresa_id || o.empresa || '',
    proyecto_id: proyecto.id,
    fecha,
    hora: hora === undefined ? null : hora,
    ventana: 'dia',
    duracion_min: duracionSugerida(proyecto.tipo_trabajo),
    estado: 'confirmada',
    movida: 0,
    uid_ics: 'inst-' + id + '@al3d.mx',
    gcal_event_id: null,
    notas: 'Agendada desde la hoja.',
    creado_en: ahora, actualizado_en: ahora,
  };
}

/**
 * La cita de la hoja con su sello (puente-sheets-14): la misma regla de quién gana que el resto de
 * la obra. Se aplica solo si el sello de la fila es más nuevo que el último cambio de la cita en
 * este teléfono (`selloDeInstalacion`), y entonces la mueve, la crea —con las mismas condiciones de
 * `instalacionDeHoja`— o, con la fecha vacía, la CANCELA: es otro teléfono que la canceló. Lo que se
 * escribe guarda el sello de la hoja, para que la siguiente bajada no lo vuelva a tomar por nuevo.
 * Puro: sin red, sin base y sin reloj.
 * @returns {Object|null} la instalación a escribir, o null si no hay nada que cambiar
 */
export function citaDeHoja(fila, proyecto, insts, o = {}) {
  if (!fila || typeof fila !== 'object' || !proyecto) return null;
  const sellos = fila[P.sellos] && typeof fila[P.sellos] === 'object' ? fila[P.sellos] : {};
  const hs = Number(sellos[P.fechaInst]) || 0;
  const lista = Array.isArray(insts) ? insts : [];
  const ls = lista.reduce((m, i) => Math.max(m, selloDeInstalacion(i)), 0);
  if (!(hs > ls)) return null;
  const ahora = Number(o.ahora) || 0;
  const marca = x => (x ? { ...x, sello_hoja: hs, sello_hoja_en: x.actualizado_en } : null);

  if (esISO(String(fila[P.fechaInst] || ''))) return marca(instalacionDeHoja(fila, proyecto, lista, o));

  const viva = lista.filter(i => i && i.estado !== 'cancelada' && esISO(i.fecha))
    .sort((a, b) => (Number(b.actualizado_en) || 0) - (Number(a.actualizado_en) || 0))[0];
  if (!viva) return null;
  return marca({
    ...viva,
    estado: 'cancelada',
    /* Como `agenda.marcar`: cancelar sube `movida`, para que el .ics con el mismo UID tache la cita
       en el calendario del instalador en vez de dejarla viva. */
    movida: (Number(viva.movida) || 0) + 1,
    uid_ics: viva.uid_ics || ('inst-' + viva.id + '@al3d.mx'),
    notas: [String(viva.notas || '').trim(), 'Cancelada en otro dispositivo: así quedó en la hoja.'].filter(Boolean).join('\n'),
    actualizado_en: ahora,
  });
}

/* ============================================================================
   LA FILA QUE YA NO ESTÁ

   La hoja contesta NO_ENCONTRADO a un cambio por cuatro razones distintas y con el mismo
   código: la fila de esa venta se borró, la fila ya es de OTRA venta (su folio se repartió dos
   veces antes de que existiera la marca de folios), el alta no trae nombre, o el camino no
   existe. Las dos primeras son la misma pregunta para Dirección —esta venta no tiene fila—, con
   otra explicación, y las otras dos no tienen nada que ver. Se distinguen por el `motivo` si la
   hoja lo manda y, mientras no lo mande, por la frase, que es la de `unaOperacion` en el .gs.
   ============================================================================ */

/** Por qué la hoja ya no tiene la fila de esta venta, o '' si el rechazo es otra cosa. PURA.
 *  @returns {'borrada'|'de_otra'|''} */
export function motivoPerdida(res) {
  if (!res || res.codigo !== 'NO_ENCONTRADO') return '';
  const m = String(res.motivo || '').trim();
  if (m === 'borrada' || m === 'de_otra') return m;
  const t = String(res.mensaje || '');
  if (/ya es de otra venta/i.test(t)) return 'de_otra';
  if (/ya no está en la hoja/i.test(t)) return 'borrada';
  return '';
}

/* El consejo de la hoja —«vuelve a registrarla desde el cotizador»— no lleva a ningún lado:
   `proyectos.ganar` contesta DUPLICADO a una cotización que ya es proyecto. Se cambia por el
   camino que sí existe, que es la ficha del proyecto; lo de antes —qué fila, atada a qué— se
   conserva, porque es lo que explica qué pasó.
   Y el camino depende de qué proyecto es (`proy`, el que rebotó): Ajustes enseña este texto a
   cualquier rol, y el de la venta de aquí —«Dirección decide si se vuelve a dar de alta»— era
   falso para las otras dos. Una tarjeta IMPORTADA no se da de alta (no tiene cotización) y la
   decide quien tenga el teléfono, con los botones de su ficha; una lápida («No se dio») no se da
   de alta tampoco, y su salida es dejarla fuera de la hoja. */
export function mensajePerdida(mensaje, proy) {
  const base = String(mensaje || '').replace(/\s*Si la venta sigue viva,[^]*$/, '').trim();
  const p = proy && typeof proy === 'object' ? proy : null;
  const importada = !!p && (p.de_hoja === true || String(p.id || '').startsWith('proy-hoja-'));
  const consejo = p && p.etapa === 'cancelado'
    ? 'Está como «No se dio»: en su ficha, ' + (importada ? 'quien tenga este teléfono' : 'Dirección') +
      ' la deja fuera de la hoja y deja de mandarse.'
    : importada
      ? 'Es una tarjeta importada de la hoja: en su ficha, quien tenga este teléfono decide si se quita del tablero o se queda.'
      : 'Dirección decide en la ficha del proyecto si se vuelve a dar de alta o se queda fuera de la hoja.';
  return (base ? base + ' ' : '') + consejo;
}

/* ----- La versión de la hoja que esta plataforma espera -----
   `salud` devuelve la versión del Apps Script publicado. Si la hoja se quedó con una
   implementación anterior, el contrato que este archivo asume no es el que corre allá, y
   Ajustes lo enseña con el aviso de abajo; la prueba de node comprueba que el .gs del repo
   diga esta versión.

   El aviso dice lo que falla CON ESA versión, no una lista fija. La de antes advertía del
   saldo al revés y del % de comisión a una hoja en puente-sheets-4, que ya los tenía
   arreglados, y callaba lo único que de verdad le faltaba: que ahí entrar con Google no da
   rol. Un aviso que dice cosas que no pasan se aprende a ignorar el día que sí importa. */
export const VERSION_ESPERADA = 'puente-sheets-14';
export function versionVieja(version) {
  const m = /^puente-sheets-(\d+)$/.exec(String(version || '').trim());
  const n = m ? Number(m[1]) : 0;
  const e = Number(/(\d+)$/.exec(VERSION_ESPERADA)[1]);
  return n < e;
}
/* Lo que falla con cada versión, de la más nueva a la más vieja. Una hoja vieja debe todo
   lo que se arregló después de ella: la 4 debe lo de la 4 y lo de la 5. Al subir
   VERSION_ESPERADA se agrega ADELANTE lo que todavía le falta a la que queda atrás. */
const FALLA_CON = [
  /* 13 */ 'cada teléfono ve su propia versión de la obra: la etapa intermedia (En diseño, Cortado, Armado, Listo), las notas, el plazo de taller y las correcciones del teléfono, la dirección y el pin que se hacen en otro dispositivo no llegan, y una cita movida o cancelada en otro no siempre se mueve aquí. Falta pegar el Apps Script puente-sheets-14 y correr «3 · Preparar la hoja para el puente»',
  /* 12 */ '«⚡ AL3D → Registrar nueva venta» de la hoja no pide el teléfono del cliente, cómo se entrega ni la dirección y el link de Maps: la venta que se registra allá llega a los teléfonos sin esos datos y sale en «Faltan datos» del Tablero. Lo demás funciona igual',
  /* 11 */ 'cómo se entrega cada trabajo (instalación, paquetería o recolección en taller) no viaja: esa versión no tiene la columna AF «Entrega», y cada teléfono se queda con la suya —sin perderse— hasta que la hoja se actualice y se corra «3 · Preparar la hoja para el puente»',
  /* 10 */ 'el teléfono del cliente no viaja: esa versión no tiene la columna AE «Telefono», y cada teléfono se queda con el suyo —sin perderse— hasta que la hoja se actualice y se corra «3 · Preparar la hoja para el puente»',
  /* 9 */ 'la ficha de cada proyecto no enseña los archivos de su carpeta en «Trabajos Pendientes» de Drive: esa versión no tiene el camino /carpetas',
  /* 8 */ 'el almacén, el catálogo de material y las listas de compra no viajan: esa versión no tiene sus pestañas, y se quedan esperando en cada teléfono —sin perderse— hasta que la hoja se actualice',
  /* 7 */ 'el QR de un PDF autorizado solo responde del total y del negocio, no de cada renglón: un PDF con los importes de las partidas cambiados pero el mismo total pasa por auténtico. Se autoriza y se verifica igual; lo que falta es que el sello firme los renglones',
  /* 6 */ 'nadie puede autorizar un precio —el cotizador ya no autoriza sin el sello de la hoja— ni solicitar autorización a dirección, y Cotizar con IA no tiene llaves: desde puente-sheets-7 viven en la hoja (⚡ AL3D → Preparar las autorizaciones selladas y ⚡ AL3D → Llaves de IA)',
  /* 5 */ 'al reacomodarse la hoja, las columnas Y a AD (folio de cotización, etapa, dirección) se quedaban en su renglón y la siguiente subida podía escribir una venta encima de otra; «Registrar un cobro» escribía LIQUIDADO en la cuenta; y un cambio contra una venta borrada creaba una fila sin nombre',
  /* 4 */ 'entrar con Google no da rol: esa versión no sabe de identidades, y un teléfono sin token de dispositivo se queda fuera',
  /* 3 */ 'el saldo por cobrar baja al revés y el % de comisión no llega a la hoja',
];
export function avisoVersion(version) {
  if (!versionVieja(version)) return '';
  const m = /^puente-sheets-(\d+)$/.exec(String(version || '').trim());
  const n = m ? Number(m[1]) : 0;
  const e = Number(/(\d+)$/.exec(VERSION_ESPERADA)[1]);
  /* De la versión de la hoja hacia atrás: la 5 debe lo de la 5; la 4, lo de la 4 y lo de la 5. */
  const faltan = FALLA_CON.slice(0, Math.max(1, Math.min(FALLA_CON.length, e - Math.max(n, 3))));
  return 'La hoja corre ' + (version ? '«' + version + '»' : 'una versión sin nombre') + ' y la plataforma espera «' +
    VERSION_ESPERADA + '». Con esa versión ' + faltan.slice().reverse().join('; además, ') + '. ' +
    'Para ponerla al día: en Apps Script baja primero el Código.gs de la hoja y compáralo con puente/hoja-apps-script.gs ' +
    '(puente/README.md, «Antes de pegar nada»), fusiona lo que tenga de más, pégalo e implementa una versión nueva; ' +
    'los pasos están en puente/DESPLIEGUE.md.';
}

/* ============================================================================
   EL RELEVO
   ============================================================================ */

const MS_ESPERA = 15000;

/** Un error del relevo, con el código que `sync.js` entiende. */
function falla(codigo, mensaje) { const e = new Error(mensaje); e.codigo = codigo; return e; }

/* ── El token de Google, renovado cuando caducó ──────────────────────────────────────
   Dura una hora y vive solo en memoria (js/nucleo/ingreso.js). Hasta septiembre de 2026
   solo se renovaba al arrancar y al reconectar: una hora después, en un teléfono que entró
   solo con Google, «Traer» de Control y los botones de Ajustes salían sin identidad y la
   hoja contestaba «Pégalo otra vez en Ajustes» —un token que ese teléfono nunca tuvo—.
   Ahora cada petición lo renueva si hace falta, con la misma regla que el arranque
   (js/app.js): hubo un ingreso en este aparato y el token ya no está vivo.

   Con dos topes. Cinco segundos: la renovación callada de Google abre y cierra una ventana,
   y si se queda esperando a la persona, la petición sale igual —con el token de dispositivo
   si lo hay—, en vez de colgar el bombeo. Y un intento por minuto: sin eso, un bombeo de
   cuarenta operaciones con Google caído serían cuarenta ventanas. */
const MS_RENOVAR = 5000;
const MS_ENTRE_RENOVACIONES = 60000;
let _renovadoEn = 0;

async function tokenDeGoogle() {
  if (Ingreso.dentro()) return Ingreso.token();
  if (!Ingreso.configurado() || !Ingreso.correo()) return '';
  if (Date.now() - _renovadoEn < MS_ENTRE_RENOVACIONES) return '';
  _renovadoEn = Date.now();
  let t = 0;
  try {
    await Promise.race([
      Ingreso.renovar(),
      new Promise(r => { t = setTimeout(r, MS_RENOVAR); }),
    ]);
  } catch (_) { /* renovar no lanza; y si lanzara, la petición sale con lo que haya */ }
  finally { if (t) clearTimeout(t); }
  return Ingreso.token();
}

/**
 * Una petición al Worker. Devuelve `{estado, cuerpo}` y NUNCA lanza por un cuerpo raro:
 * lo que lanza es la red, y con el código que la bandeja sabe interpretar.
 */
async function pedir(cfg, ruta, opciones = {}, espera = MS_ESPERA) {
  /* Antes del reloj de abajo: la renovación no le come los quince segundos a la petición. */
  const g = await tokenDeGoogle();
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  /* Sin tope, un puente que no contesta deja el bombeo colgado para siempre y la pantalla
     de Ajustes con el botón apretado. Quince segundos: Apps Script con la red de un
     teléfono en la calle tarda, pero no tanto. */
  const t = ctrl ? setTimeout(() => ctrl.abort(), espera) : 0;

  /* ── Todo va por POST, y el token va en el cuerpo ────────────────────────────────
     Apps Script no tiene dónde contestar un OPTIONS: un Web App solo expone doGet y
     doPost. Así que toda petición tiene que quedarse dentro de las «simples» de CORS,
     las que el navegador manda sin preflight — y `Authorization` no lo es.

     Quedaban dos lugares para el token: la URL o el cuerpo de un POST con text/plain.
     Va en el cuerpo. Un token en la URL se queda escrito en el historial del navegador,
     en los registros de cualquier proxy que lo vea pasar, y se va en la cabecera
     `Referer` si la página navega. En el cuerpo no le pasa nada de eso.

     Por eso lo que antes eran GET con cadena de consulta ahora son POST: lo que venía
     en `?cursor=` o `?u=` se dobla dentro del mismo cuerpo. */
  const [camino, consulta] = String(ruta).split('?');
  let cuerpo = {};
  if (opciones.body) {
    try { cuerpo = JSON.parse(opciones.body); } catch (_) { cuerpo = {}; }
  }
  if (consulta) {
    new URLSearchParams(consulta).forEach((valor, clave) => { cuerpo[clave] = valor; });
  }
  /* Las DOS puertas, y la hoja decide en ese orden: si viene la identidad de Google, el rol
     sale del correo; si no, del token de dispositivo. Van las dos en la misma petición a
     propósito —no se pregunta antes cuál usar— porque preguntar costaría una vuelta de red
     por operación y porque el token de Google puede haber caducado justo en el vuelo: que la
     hoja tenga el de reserva en la mano evita un rechazo que no le importa a nadie. */
  /* La ruta va PRIMERO en el JSON: la hoja solo abre el tope de 64 KB a un cuerpo que empieza
     por {"ruta":"ia", (doPost en puente/hoja-apps-script.gs). */
  cuerpo = Object.assign({ ruta: camino.replace(/^\/+/, '') }, cuerpo);
  if (g) cuerpo.google_token = g;
  if (cfg.token) cuerpo.token = cfg.token;

  let r;
  try {
    /* Se manda a la URL pelona, sin pegarle el camino: Apps Script contesta 404 a
       `/exec/salud` en un POST —`pathInfo` solo sirve en los GET— así que el camino
       viaja como un campo más del cuerpo. Probado contra la implementación real. */
    r = await fetch(cfg.url, {
      method: 'POST',
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify(cuerpo),
      /* text/plain a propósito: es uno de los tres tipos que no disparan preflight. */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      /* Apps Script siempre rebota de script.google.com a googleusercontent.com. */
      redirect: 'follow',
    });
  } catch (e) {
    /* El CORS mal puesto se ve igual que «no hay señal» desde JavaScript —la
       especificación no deja distinguirlos— así que el mensaje nombra las dos
       posibilidades en vez de mentir con una. */
    throw falla('SIN_RED', (e && e.name === 'AbortError')
      ? 'El puente no contestó en ' + Math.round(espera / 1000) + ' segundos. Lo que hiciste está guardado aquí y se manda solo.'
      : 'No se pudo llegar al puente. Puede ser que no haya señal, o que la implementación del Apps Script no esté publicada con acceso «Cualquier usuario».');
  } finally { if (t) clearTimeout(t); }

  let cuerpoRes = null;
  try { cuerpoRes = await r.json(); } catch (_) { cuerpoRes = null; }

  /* Un 2xx sin JSON no es el puente: es otra cosa que contestó en esa URL —la pantalla
     de inicio de sesión de Google, casi siempre, cuando la implementación quedó en
     «Solo yo»—. Antes se leía como éxito y «Probar» pintaba verde. */
  if (r.status < 400 && cuerpoRes === null) {
    throw falla('DESCONOCIDO', 'Esa URL contestó ' + r.status + ' pero no es el puente: no devolvió JSON. Si te mandó a la pantalla de Google, la implementación está en «Solo yo» y tiene que estar en «Cualquier usuario».');
  }

  /* Apps Script contesta 200 aunque haya fallado: el error viene dentro del JSON. Se
     traduce al estado que el resto del cliente ya sabía leer, para no tocar a quien
     llama ni a la bandeja. */
  const estado = (cuerpoRes && cuerpoRes.ok === false && cuerpoRes.codigo === 'ROL_SIN_PERMISO')
    ? 401 : r.status;

  if (estado === 401 || estado === 403) {
    throw falla('ROL_SIN_PERMISO', (cuerpoRes && cuerpoRes.mensaje) ||
      'Este teléfono no tiene un token válido del puente. Pégalo otra vez aquí abajo.');
  }
  if (estado >= 400 && !cuerpoRes) {
    throw falla('SIN_RED', 'El puente contestó ' + estado + ' sin decir por qué.');
  }
  return { estado, cuerpo: cuerpoRes || {} };
}

/**
 * Una pregunta suelta al puente, con la configuración de este aparato y las dos puertas —la
 * identidad de Google si está viva y el token de dispositivo si lo hay—. Es lo que usa el
 * cotizador empotrado a través de `window.AL3D` (js/mod/cotizador.js): el notario y la IA no
 * son almacenes que sincronizar, son preguntas con respuesta, y no pasan por la bandeja.
 *
 * Devuelve el cuerpo tal como lo contestó la hoja —`{ok:false, codigo, mensaje}` incluido— y
 * solo lanza por la red o por un rol sin permiso, con el código que `falla` pone.
 */
export async function hablar(ruta, cuerpo = {}, espera = MS_ESPERA) {
  const p = Prefs.puente();
  const cfg = { url: normalizarUrl(p.url), token: String(p.token || '') };
  if (!cfg.url) throw falla('DATO_INVALIDO', 'Este aparato no tiene la dirección del puente.');
  const r = await pedir(cfg, ruta, { method: 'POST', body: JSON.stringify(cuerpo) }, espera);
  return r.cuerpo;
}

/** La URL como la quiere `fetch`: sin barra final, para no pedir `//salud`; sin cadena de
 *  consulta ni almohadilla; y sin uno de los cinco caminos del puente pegado al final, porque
 *  el runbook enseña `…/esquema` como ejemplo y más de uno la pega tal cual: las peticiones
 *  iban a `/esquema/salud` y el Worker contestaba «Ese camino no existe», sin decir por qué. */
export function normalizarUrl(u) {
  let s = String(u || '').trim();
  try { const x = new URL(s); x.search = ''; x.hash = ''; s = x.href; } catch (_) {}
  return s.replace(/\/+(salud|esquema|jalar|empujar|expandir)\/*$/i, '').replace(/\/+$/, '');
}

/**
 * Arma el relevo. No toca la red al construirse: la primera petición es la que dice si el
 * token sirve, y construirlo en el arranque no puede depender de que haya señal.
 *
 * @param {{url:string, token:string}} cfg
 * @returns {Object} AdaptadorSync
 */
export function crear(cfg0) {
  const cfg = { url: normalizarUrl(cfg0 && cfg0.url), token: String((cfg0 && cfg0.token) || '') };
  /* Basta la DIRECCIÓN. El token de dispositivo dejó de ser obligatorio aquí el 20 de
     septiembre de 2026 y esa línea —`if (!cfg.url || !cfg.token) return null`— costó un
     bucle en producción que conviene dejar escrito: con la puerta de Google puesta, un
     teléfono nuevo entra con su cuenta y NO tiene token. El relevo devolvía null, la puerta
     no podía preguntarle a la hoja quién era, y la persona se quedaba dando vueltas entre
     «Entrar con Google» y la misma pantalla, con Google funcionando perfectamente.

     Cuál de las dos puertas se usa se decide EN CADA PETICIÓN, en `pedir()`: va el token de
     Google si lo hay y el del aparato si lo hay, y la hoja elige. Un relevo sin ninguna de
     las dos no es un error de construcción —es un teléfono que todavía no ha entrado— y lo
     que contesta la hoja en ese caso es `ROL_SIN_PERMISO` con su razón escrita, que es
     infinitamente más útil que un null silencioso. Quien decide si hay con qué sincronizar
     sigue siendo `Prefs.hayPuente()`, aguas arriba. */
  if (!cfg.url) return null;

  /* Lo que el Worker dijo que este token puede escribir. Se pide una vez y se recuerda:
     es la lista blanca del ROL, no una preferencia, y mandar propiedades que el token no
     puede escribir solo sirve para que el Worker las devuelva rechazadas. */
  let escribibles = null;

  /* Si la hoja tiene las pestañas del almacén: null mientras no se sabe, y entonces se intenta
     (lo que sabe es la propia hoja, en su primera respuesta); true o false en cuanto un /salud
     dice su versión, o en cuanto un camino del almacén contesta «Camino desconocido». Con false,
     `lleva` contesta que no y `sync` aparta lo del almacén con la razón —la hoja corre un
     puente anterior al 9— sin gastar una petición por renglón; con un /salud nuevo que diga 9 o
     más, el siguiente bombeo lo reincorpora solo. */
  let hojaSabeAlmacen = null;
  let sabidoEn = 0;
  /* La versión de la hoja en número, 0 mientras no se sabe. Decide si el teléfono viaja (ver
     VERSION_DEL_TELEFONO): con una hoja anterior a la 11, `subir` se lo quita a lo que manda. */
  let versionHoja = 0;
  const notarVersion = v => { if (v) { versionHoja = numeroDeVersion(v); hojaSabeAlmacen = versionHoja >= VERSION_DEL_ALMACEN; sabidoEn = Date.now(); } };
  const sabeTelefono = () => versionHoja >= VERSION_DEL_TELEFONO;
  const sabeEntrega = () => versionHoja >= VERSION_DE_LA_ENTREGA;
  const sabeObra = () => versionHoja >= VERSION_DE_LA_OBRA;
  /* Si alguna bajada ya trajo la columna de los sellos: la hoja corre la 14 Y ya corrió «Preparar
     la hoja». Es lo que deja revivir sola una nota o un plazo que la 14 rechazó por no tener
     todavía las columnas AG:AI (ver `revive`). */
  let hojaConObra = false;
  /* Si alguna bajada ya trajo la llave de la entrega: la hoja corre la 12 Y ya corrió «Preparar
     la hoja» (sin AF, la fila no la trae). Es lo que deja revivir sola una entrega que la 12
     rechazó por no tener la columna (ver `revive`): mientras no, revivirla era otro rechazo. */
  let hojaConEntrega = false;
  /* Un «no» caduca a los diez minutos. El relevo vive lo que dura la app abierta, y la hoja se
     puede actualizar a media mañana: sin esto, lo del almacén se quedaba apartado hasta volver a
     abrir la app. Volver a preguntar cuesta una petición cada diez minutos, no una por renglón. */
  const MS_VOLVER_A_PREGUNTAR = 10 * 60 * 1000;
  const sabeAlmacen = () => {
    if (hojaSabeAlmacen === false && Date.now() - sabidoEn > MS_VOLVER_A_PREGUNTAR) { hojaSabeAlmacen = null; escribibles = null; }
    return hojaSabeAlmacen;
  };
  const noSabe = () => { hojaSabeAlmacen = false; sabidoEn = Date.now(); };

  /* Lo más alto de la secuencia del almacén que trajo la última bajada, para guardarlo cuando
     `sync` ya escribió lo que bajó (ver `despuesDeBajar`). Antes no: si la escritura local se
     cayera a la mitad, la marca diría que esos renglones ya están aquí. */
  let almacenPorGuardar = null;

  async function asegurarEscribibles() {
    if (escribibles) return escribibles;
    const r = await pedir(cfg, '/salud');
    notarVersion(r.cuerpo.version);
    /* Solo se recuerda una lista de verdad. Un /salud que contestó 503 porque Notion está
       caído no trae `escribibles`, y cachear ese vacío dejaría a este teléfono mandando a
       ciegas el resto de la sesión: así, la siguiente subida vuelve a preguntar. */
    if (Array.isArray(r.cuerpo.escribibles)) escribibles = new Set(r.cuerpo.escribibles);
    return escribibles || new Set();
  }

  /* ── EL ALMACÉN: subir ───────────────────────────────────────────────────────────────
     Un viaje por lote, en el orden de la bandeja, y la hoja contesta operación por operación.
     Lo que reintentar no arregla —un rol que no escribe eso, un dato que la hoja no acepta— va
     `definitivo` y `sync` lo aparta sin parar a los demás; lo que es de la red o del candado
     ocupado, no: se queda en la cola y sale en el siguiente bombeo.

     Lo que se manda es la operación tal como quedó en la bandeja, con dos retoques:
       · sin `sync`, que es la marca local de «ya salió» y en la hoja no significa nada;
       · con el folio de la venta en la hoja (`folio_hoja`, V-042) si el registro cuelga de un
         proyecto que ya tiene fila. El `proyecto_id` es el de ESTE teléfono: en el de
         fabricación la misma venta es otra tarjeta, con otro id, y sin el folio su lista de
         compra no tendría cómo saber que esa línea es de su tarjeta (ver
         `stock.recolectarDemanda`). Y a quien lee la pestaña le dice de qué venta es. */
  const sinPestana = op => ({ id: op.id, ok: false, codigo: 'SIN_DESTINO', mensaje: motivoSinDestino(op.almacen) });

  async function paraLaHoja(op) {
    const datos = { ...(op.datos || {}) };
    delete datos.sync;
    let campos = Array.isArray(op.campos) ? op.campos.slice() : null;
    const pid = datos.proyecto_id;
    if (pid && !datos.folio_hoja) {
      let p = null;
      try { p = await DB.obtener('proyectos', pid); } catch (_) { p = null; }
      const fh = p ? texto(p.notion_page_id || p.folio_hoja).trim() : '';
      if (fh) {
        datos.folio_hoja = fh;
        if (campos && !campos.includes('folio_hoja')) campos.push('folio_hoja');
      }
    }
    return { id: op.id, almacen: op.almacen, tipo: op.tipo, registro_id: op.registro_id, datos, campos };
  }

  async function subirAlmacen(lista) {
    const DEFINITIVOS = ['ROL_SIN_PERMISO', 'NO_ENCONTRADO', 'DATO_INVALIDO'];
    sabeAlmacen();   // si el «no» caducó, el /salud de abajo vuelve a preguntar la versión
    try { await asegurarEscribibles(); } catch (e) {
      return lista.map(op => ({ id: op.id, ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message }));
    }
    if (hojaSabeAlmacen === false) return lista.map(sinPestana);

    const envio = [];
    for (const op of lista) envio.push(await paraLaHoja(op));
    let r;
    try {
      r = await pedir(cfg, '/empujar_almacen', { method: 'POST', body: JSON.stringify({ ops: envio }) });
    } catch (e) {
      return lista.map(op => ({ id: op.id, ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message }));
    }
    const c = r.cuerpo || {};
    if (c.ok === false) {
      /* «Camino desconocido»: una hoja anterior al 9 que no dijo su versión. Se aparta como si
         la hubiera dicho —la razón es la misma— y no como rechazo: no es culpa del renglón. */
      if (c.codigo === 'NO_ENCONTRADO') { noSabe(); return lista.map(sinPestana); }
      return lista.map(op => ({ id: op.id, ok: false, codigo: c.codigo || 'SIN_RED',
                                mensaje: c.mensaje || 'La hoja no pudo recibir el almacén.' }));
    }
    hojaSabeAlmacen = true;
    const res = Array.isArray(c.resultados) ? c.resultados : [];
    return lista.map(op => {
      const x = res.find(y => y && y.id === op.id);
      if (!x) return { id: op.id, ok: false, codigo: 'DESCONOCIDO', mensaje: 'La hoja contestó sin decir qué pasó con ese cambio.' };
      /* «Ya estaba» es éxito: es el reintento de algo que sí llegó, y es justo lo que evita que el
         libro reste dos veces. Lo que la hoja no escribió por ser más viejo que lo que ya tiene
         (`viejos`) tampoco es un rechazo: otro teléfono lo cambió después, y gana. */
      if (x.ok) return { id: op.id, ok: true, remoto: null, rechazadas: [], ya_estaba: !!x.ya_estaba };
      return { id: op.id, ok: false, codigo: x.codigo || 'DESCONOCIDO', definitivo: DEFINITIVOS.includes(x.codigo),
               mensaje: x.mensaje || 'La hoja rechazó el cambio.' };
    });
  }

  /* ── EL ALMACÉN: bajar ───────────────────────────────────────────────────────────────
     Lo que la hoja recibió después de la última secuencia que este teléfono vio. La secuencia
     la pone la hoja bajo su candado, uno más por cada fila escrita (ver la sección del almacén
     en el .gs), así que «lo que tenga más de N» es exactamente lo que falta, sin depender del
     reloj de nadie.

     Una vez por semana se pide todo desde cero: si algo se quedó sin bajar —una escritura local
     que falló, una fila corregida a mano en la hoja, que no cambia la secuencia—, ahí llega.
     Cuesta una respuesta grande por semana, y es lo que hace que un error no sea para siempre.

     Del libro, cada renglón tal cual: `sync.jalar` descarta el que ya está (el libro no se
     corrige). Del catálogo y de las listas, la fila con el sello de AHORA, porque la hoja es
     donde se juntan los cambios de todos, campo por campo: lo que acaba de bajar es lo más nuevo
     que hay, aunque el sello de quien lo editó sea más viejo que el de una copia de aquí. Con
     una excepción: si este teléfono tiene un cambio de ese registro esperando en la bandeja, la
     fila se salta esta vez. Bajarla le borraría en pantalla lo que la persona acaba de hacer;
     cuando ese cambio suba, la hoja lo junta y la fila vuelve a bajar ya con él. */
  const MS_SEMANA = 7 * 24 * 3600 * 1000;
  const ID_MARCA_ALMACEN = '_almacen_hoja';

  async function esperandoEnLaBandeja() {
    const s = new Set();
    let todas = [];
    try { todas = await DB.listar('pendientes'); } catch (_) { todas = []; }
    for (const o of (todas || [])) {
      if (!o || String(o.id || '').charAt(0) === '_' || !DEL_ALMACEN.includes(o.almacen)) continue;
      if (o.estado === 'pendiente' || o.estado === 'sin_destino' || !o.estado) s.add(o.almacen + '|' + String(o.registro_id || ''));
    }
    return s;
  }

  async function bajarAlmacen() {
    let marca = null;
    try { marca = await DB.obtener('pendientes', ID_MARCA_ALMACEN); } catch (_) { marca = null; }
    const completoEn = (marca && Number(marca.completo_en)) || 0;
    /* Una vuelta entera que no cupo en las veinte páginas sigue donde se quedó (`barriendo`):
       volver a cero cada vez no la terminaría nunca. */
    const siguiendo = !!(marca && marca.barriendo);
    const entera = siguiendo || !completoEn || Date.now() - completoEn > MS_SEMANA;
    let desde = (entera && !siguiendo) ? 0 : ((marca && Number(marca.desde)) || 0);
    const esperando = await esperandoEnLaBandeja();
    const out = [];
    let alguna = false, terminada = false;
    /* Veinte páginas de 1500 como tope: un teléfono nuevo contra años de libro. Lo que no
       alcance, sigue en la bajada siguiente desde donde se quedó. */
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      let r;
      try { r = await pedir(cfg, '/jalar_almacen', { method: 'POST', body: JSON.stringify({ desde }) }); }
      catch (_) { break; }
      const c = r.cuerpo || {};
      if (c.ok !== true) { if (c.codigo === 'NO_ENCONTRADO') noSabe(); break; }
      alguna = true;
      hojaSabeAlmacen = true;
      for (const x of (Array.isArray(c.registros) ? c.registros : [])) {
        const alm = x && String(x.almacen || '');
        const d = x && x.datos;
        if (!DEL_ALMACEN.includes(alm) || !d || typeof d !== 'object' || !d.id) continue;
        if (alm === 'movimientos') { out.push({ almacen: alm, datos: d }); continue; }
        if (esperando.has(alm + '|' + String(d.id))) continue;
        out.push({ almacen: alm, datos: { ...d, actualizado_en: Date.now() } });
      }
      const hasta = Number(c.hasta);
      if (isFinite(hasta) && hasta > desde) desde = hasta;
      if (!c.hay_mas) { terminada = true; break; }
    }
    if (alguna) {
      almacenPorGuardar = { desde, completo_en: (entera && terminada) ? Date.now() : completoEn,
                            barriendo: entera && !terminada };
    }
    return out;
  }

  async function guardarMarcaAlmacen(m) {
    /* En la bandeja y con id de guion bajo, como las marcas de `sync`: muere con ella. Si alguien
       borra la base, la marca se va también y la primera bajada pide todo desde cero. */
    try {
      await DB.poner('pendientes', { id: ID_MARCA_ALMACEN, ts: 0, desde: m.desde, completo_en: m.completo_en,
                                     barriendo: !!m.barriendo });
    } catch (_) {}
  }

  /** Quita del paquete lo que este rol no puede escribir. Lo quitado se NOMBRA. */
  function filtrar(props, permitidas) {
    const props2 = {}, fuera = [];
    for (const [k, v] of Object.entries(props)) {
      if (permitidas.size && !permitidas.has(k)) { fuera.push(k); continue; }
      props2[k] = v;
    }
    return { props: props2, fuera };
  }

  /**
   * El proyecto VIVO al que apunta una operación, no la foto que quedó en la bandeja.
   *
   * La diferencia es el `notion_page_id`, y no es teórica: la operación se encoló antes de
   * que existiera la fila en Notion, así que su foto lo trae en null para siempre. Leyendo
   * la foto, el segundo cambio de un proyecto pediría un ALTA en vez de un cambio, y sin la
   * búsqueda por folio del Worker eso serían dos ventas en la base del dinero.
   *
   * Los VALORES sí salen de la foto: es el estado en que estaba cuando se encoló, y mandar
   * el de ahora rompería el orden de la cola —dos cambios seguidos acabarían mandando dos
   * veces el último— que es lo único que el bucle en serie de `bombear` compró.
   */
  async function proyectoVivo(op) {
    const id = op.almacen === 'proyectos'
      ? (op.datos && op.datos.id)
      : (op.datos && op.datos.proyecto_id);
    if (!id) return null;
    const vivo = await DB.obtener('proyectos', id);
    /* Si ya no está de este lado, una operación de proyecto todavía puede irse con su foto
       —los datos van completos en ella—; una de instalación no, porque sin el proyecto no
       hay forma de saber a qué fila de Notion pertenece. */
    if (vivo) return vivo;
    return op.almacen === 'proyectos' ? (op.datos || null) : null;
  }

  async function instalacionDe(proyectoId) {
    const filas = await DB.listar('instalaciones',
      { indice: 'porProyecto', rango: rango(proyectoId), filtro: i => i && i.proyecto_id === proyectoId });
    if (!filas.length) return null;
    /* La que manda es la que no está cancelada y tiene fecha. Si hay varias —se reagendó—
       gana la más nueva, que es la que el calendario del teléfono también tiene. */
    const vivas = filas.filter(i => i.estado !== 'cancelada' && esISO(i.fecha));
    if (!vivas.length) return null;
    return vivas.sort((a, b) => (Number(b.actualizado_en) || 0) - (Number(a.actualizado_en) || 0))[0];
  }

  return {
    nombre: 'hoja',

    /** Los almacenes que este relevo sabe llevar. `sync.js` aparta el resto sin gastar red. Los
     *  del almacén, mientras no se sepa que la hoja NO tiene sus pestañas. */
    lleva(almacen) {
      if (!ALMACENES.includes(almacen)) return false;
      return !DEL_ALMACEN.includes(almacen) || sabeAlmacen() !== false;
    },
    /** Los que `sync` puede mandar juntos en un viaje (en su orden, hasta 25). */
    agrupa(almacen) { return DEL_ALMACEN.includes(almacen); },
    /** Si una operación apartada como «rechazada» vale la pena volver a mandarla, ya sin que
     *  nadie apriete nada (lo pregunta `sync` al empezar cada bombeo). Hoy, solo los cambios de
     *  puro teléfono que una hoja anterior a la 11 rechazó con «no puede escribir nada», en
     *  cuanto se sabe que la hoja ya corre la 11. Una vez por operación (`revivida_tel`): si la
     *  11 los vuelve a rechazar —la hoja todavía sin la columna AE— se quedan apartados con la
     *  razón nueva, y el teléfono llega igual por la revisión de la bajada.
     *  Si todavía no se sabe la versión —el bombeo empieza antes que cualquier subida— se
     *  pregunta a /salud una vez; solo cuando hay algo así apartado, no en cada bombeo. */
    async revive(op) {
      /* La entrega: solo cuando una bajada ya vio la columna AF. Devuelve el nombre de su marca,
         para que `sync` la anote y no le dé vueltas (ver `revivirRechazadas`). */
      if (esRechazoDeEntrega(op)) return hojaConEntrega ? 'revivida_entrega' : false;
      /* Las notas y el plazo (puente-sheets-14), igual: cuando una bajada ya vio las columnas AG:AI. */
      if (esRechazoDeObra(op)) return hojaConObra ? 'revivida_obra' : false;
      if (!esRechazoDeTelefono(op)) return false;
      if (!versionHoja) { try { await asegurarEscribibles(); } catch (_) { return false; } }
      return sabeTelefono();
    },
    motivo: motivoSinDestino,
    /** Los que baja enteros: `sync.jalar` borra lo que la hoja dejó de traer. */
    espejos: ESPEJOS.slice(),

    async salud() {
      try {
        const r = await pedir(cfg, '/salud');
        if (Array.isArray(r.cuerpo.escribibles)) escribibles = new Set(r.cuerpo.escribibles);
        if (r.cuerpo.ok === true) notarVersion(r.cuerpo.version);
        /* `ok === true` y no «distinto de false»: un JSON cualquiera sin `ok` no es el puente. */
        if (r.cuerpo.ok !== true) {
          /* El `codigo` viaja. Sin él, la puerta no puede distinguir «tu correo no está en la
             lista» —que es definitivo y hay que decirlo con esas palabras— de «no hubo red»,
             que es esperar. Las dos llegaban aquí como un `ok:false` idéntico. */
          return { ok: false, codigo: r.cuerpo.codigo || '',
                   mensaje: r.cuerpo.mensaje || 'Esa URL contesta, pero no como el puente: revisa que sea la del Worker.' };
        }
        return { ok: true, mensaje: 'El puente contesta y reconoce este teléfono.',
                 rol: r.cuerpo.rol || '', version: r.cuerpo.version || '',
                 escribibles: r.cuerpo.escribibles || [],
                 /* Por cuál de las dos puertas entró y con qué correo. La puerta
                    (js/nucleo/puerta.js) necesita las dos: un `via:'token'` significa que la
                    hoja reconoció al APARATO y no a la persona, y eso no da pase. */
                 via: r.cuerpo.via || 'token', correo: r.cuerpo.correo || '' };
      } catch (e) {
        return { ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message };
      }
    },

    async esquema() {
      try {
        const r = await pedir(cfg, '/esquema');
        const faltan = Array.isArray(r.cuerpo.faltan) ? r.cuerpo.faltan.slice() : [];
        /* La hoja dice si tiene la pestaña «Accesos» desde puente-sheets-5, y aquí se tiraba:
           «Revisar el esquema» decía que todo estaba bien en una hoja sin ella, y después
           ningún ingreso con Google daba rol. Viaja tal cual (`accesos`) y, para que la
           pantalla de hoy lo enseñe sin cambiar, entra también a la lista de lo que falta,
           con su nombre y lo que hay que correr. Solo con un `false` explícito: una hoja
           anterior no lo manda, y eso no es decir que falte. */
        const accesos = r.cuerpo.accesos !== false;
        if (!accesos) {
          faltan.push({ nombre: 'Accesos', tipo: 'pestaña', pestana: true,
            para: 'no es una columna: es la pestaña con el correo y el rol de cada persona. ' +
                  'Sin ella nadie entra con Google. La crea prepararHojaParaElPuente(), con el dueño de la hoja ya dentro' });
        }
        return { ok: r.cuerpo.ok !== false, faltan, accesos,
                 nota: r.cuerpo.nota || '', mensaje: r.cuerpo.mensaje || '' };
      } catch (e) {
        return { ok: false, faltan: [], codigo: e.codigo || 'SIN_RED', mensaje: e.message };
      }
    },

    /** Las cuatro líneas que del lado del navegador son imposibles. */
    async expandir(u) {
      try {
        const r = await pedir(cfg, '/expandir?u=' + encodeURIComponent(String(u || '')));
        /* Con el código de la hoja: `DATO_INVALIDO` (no es un dominio de Maps) es definitivo, y
           `SIN_RED` (la hoja no alcanzó a Google) se reintenta. Ver `Geo.resolverLink`. */
        return r.cuerpo.ok ? { ok: true, url: r.cuerpo.url }
                           : { ok: false, codigo: r.cuerpo.codigo || 'DATO_INVALIDO',
                               mensaje: r.cuerpo.mensaje || 'Ese link corto no llevó a ningún mapa.' };
      } catch (e) {
        return { ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message };
      }
    },

    /** Las subcarpetas de «Trabajos Pendientes» con sus archivos (puente-sheets-10). Una hoja
     *  anterior contesta «Camino desconocido.»: eso se dice como lo que es, la hoja vieja. */
    async carpetas() {
      try {
        const r = await pedir(cfg, '/carpetas');
        const c = r.cuerpo || {};
        if (c.ok) return { ok: true, raiz: String(c.raiz || ''), carpetas: Array.isArray(c.carpetas) ? c.carpetas : [] };
        if (c.codigo === 'NO_ENCONTRADO' && /camino desconocido/i.test(String(c.mensaje || ''))) {
          return { ok: false, codigo: 'HOJA_VIEJA', mensaje: 'La hoja todavía no lee la carpeta de Drive: falta pegarle el Apps Script puente-sheets-10.' };
        }
        return { ok: false, codigo: c.codigo || 'DESCONOCIDO', mensaje: (c.mensaje || 'La hoja no pudo leer la carpeta de Drive.') + (c.detalle ? ' Google dijo: ' + c.detalle : '') };
      } catch (e) {
        return { ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message };
      }
    },

    /** Le abre carpeta a un proyecto en «Trabajos Pendientes» (puente-sheets-10, solo Dirección).
     *  Si ya hay una con ese nombre, la hoja devuelve ésa y `creada` viene en false. */
    async crearCarpeta(nombre) {
      try {
        const r = await pedir(cfg, '/crear_carpeta', { body: JSON.stringify({ nombre: String(nombre || '') }) });
        const c = r.cuerpo || {};
        if (c.ok && c.carpeta) return { ok: true, creada: !!c.creada, carpeta: c.carpeta };
        if (c.codigo === 'NO_ENCONTRADO' && /camino desconocido/i.test(String(c.mensaje || ''))) {
          return { ok: false, codigo: 'HOJA_VIEJA', mensaje: 'La hoja todavía no abre carpetas: falta pegarle el Apps Script puente-sheets-10.' };
        }
        return { ok: false, codigo: c.codigo || 'DESCONOCIDO', mensaje: c.mensaje || 'La hoja no pudo abrir la carpeta.' };
      } catch (e) {
        return { ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message };
      }
    },

    /**
     * Sube. `sync.js` manda de una en una, así que este arreglo trae una y el bucle está
     * escrito para más por si eso cambia.
     */
    async subir(ops) {
      const lista = Array.isArray(ops) ? ops : [];
      /* Un lote del almacén (`sync` los arma con `agrupa`) va entero a su camino. */
      if (lista.length && lista.every(op => op && DEL_ALMACEN.includes(op.almacen))) return subirAlmacen(lista);
      const salida = [];

      let permitidas;
      try { permitidas = await asegurarEscribibles(); } catch (e) {
        /* Sin saber qué puede escribir este token no se manda nada: mandarlo a ciegas es
           cómo se crea una fila sin título en la base del dinero. */
        return lista.map(op => ({ id: op.id, ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message }));
      }

      /* ── `definitivo`: lo que reintentar no arregla ────────────────────────────────
         Un rechazo de ESTA operación —el rol no escribe nada de lo que trae, el alta no
         trae nombre, la venta ya no está en la hoja— se marca `definitivo`, y `sync.bombear`
         la aparta con su razón y sigue con la siguiente. Hasta septiembre de 2026 salía como
         un ROL_SIN_PERMISO pelón, igual al de un token que la hoja no reconoce, y el bombeo
         se paraba entero en ella: detrás se quedaban para siempre los cambios que sí se
         podían mandar. El ROL_SIN_PERMISO de la puerta (`pedir` lanza) no lleva la marca, y
         ése sí para el bombeo: con esa llave, las cuarenta darían lo mismo. */
      const DEFINITIVOS = ['ROL_SIN_PERMISO', 'NO_ENCONTRADO', 'DATO_INVALIDO'];
      let refrescada = false;

      for (const op of lista) {
        /* Uno del almacén suelto entre cambios de la venta: por su camino, y en su lugar. */
        if (op && DEL_ALMACEN.includes(op.almacen)) {
          const [x] = await subirAlmacen([op]);
          salida.push(x);
          if (x.codigo === 'SIN_RED') break;
          continue;
        }
        if (!this.lleva(op.almacen)) {
          salida.push({ id: op.id, ok: false, codigo: 'SIN_DESTINO', mensaje: motivoSinDestino(op.almacen) });
          continue;
        }

        const proy = await proyectoVivo(op);
        if (!proy) {
          salida.push({ id: op.id, ok: false, codigo: 'NO_ENCONTRADO', definitivo: true,
            mensaje: 'Esa operación apunta a un proyecto que ya no está en este dispositivo.' });
          continue;
        }

        const idNotion = proy.notion_page_id || null;
        /* Se decidió que esta venta se queda fuera de la hoja (`proyectos.dejarFueraDeLaHoja`): su
           fila ya no existe y ningún cambio tiene a dónde ir. No se gasta una petición, como con
           la lápida de abajo: sin esto, cada cambio de etapa rebotaba contra la hoja, se apartaba
           como rechazado y volvía a encender el aviso que se acababa de cerrar.
           Pero el cambio no se tira: se anota en el proyecto (`sin_mandar`) y, si la fila vuelve,
           la revisión de la bajada lo manda con el estado de hoy (ver
           `proyectos.revisarContraLaHoja`). Antes se daba por despachado y ya: el bombeo lo
           contaba como subido, la bandeja quedaba vacía y la fila que volvía se quedaba con la
           etapa vieja para siempre. `omitida` le dice a `sync` que no lo cuente como subido. */
        if (proy.fuera_de_hoja) {
          await anotarSinMandar(proy.id, op);
          salida.push({ id: op.id, ok: true, remoto: null, rechazadas: [], omitida: true });
          continue;
        }
        /* La fila a la que apunta ya es de OTRA venta, y este teléfono ya lo sabe: la hoja lo
           contestó, o Dirección lo dijo en la ficha al separar la copia repetida («No es la misma
           venta», ver `proyectos.noEsLaMisma`). En el segundo caso la hoja NO lo sabe —la fila no
           trae folio de cotización con qué comparar— y el cambio se escribiría en la venta de
           otro. No se manda: se aparta como el rebote que habría sido, y la ficha enseña las dos
           salidas. Si la fila vuelve a ser de esta venta, la bajada quita la marca (ver `bajar`). */
        const hp = proy.hoja_perdida;
        if (idNotion && hp && typeof hp === 'object' && hp.motivo === 'de_otra' && hp.folio === idNotion) {
          salida.push({ id: op.id, ok: false, codigo: 'NO_ENCONTRADO', definitivo: true, motivo: 'de_otra',
            mensaje: mensajePerdida('La fila ' + idNotion + ' de la hoja ya es de otra venta; este cambio no se mandó para no escribirlo en ella.', proy),
            conflicto: null });
          continue;
        }
        /* Una cotización que «no se dio» y nunca llegó a la hoja no es una venta: su lápida
           (etapa cancelado, con el subtotal y el anticipo de la cotización) se daba de alta
           como fila nueva, y el libro contaba un anticipo que nunca se cobró y una comisión
           pendiente. Sin fila, no hay nada que mandar; con fila, el cambio de etapa sí viaja. */
        if (!idNotion && op.almacen === 'proyectos' && proy.etapa === 'cancelado') {
          salida.push({ id: op.id, ok: true, remoto: null, rechazadas: [], omitida: true });
          continue;
        }
        let props, instEnviada = null;
        if (op.almacen === 'proyectos') {
          /* Alta si la fila no existe todavía; si ya existe, el dinero y el nombre solo van
             cuando la operación dice que eso fue lo que cambió. Ver aNotion. */
          instEnviada = await instalacionDe(proy.id);
          props = aNotion(op.datos, instEnviada,
                          { alta: !idNotion, campos: Array.isArray(op.campos) ? op.campos : null });
          /* Una hoja anterior a la 11 no tiene dónde poner el teléfono. Se le quita a lo que se
             manda, y un cambio que era SOLO el teléfono se despacha sin mandarse (`omitida`): la
             hoja de antes lo rechazaba como «de ese cambio, este teléfono no puede escribir
             nada», que es falso y se quedaba apartado para siempre. No se pierde: cuando la hoja
             corra la 11 y traiga la columna vacía, la revisión de la bajada lo manda (ver
             `proyectos.revisarContraLaHoja`). */
          /* Y lo mismo la entrega con una hoja anterior a la 12: se quita, y un cambio que era solo
             eso —o solo eso y el teléfono, con una hoja que tampoco sabe del teléfono— se despacha
             sin mandarse. La manda la revisión de la bajada cuando la fila traiga AF vacía. */
          const sinColumna = new Set();
          if (!sabeTelefono() && Object.prototype.hasOwnProperty.call(props, P.tel)) { delete props[P.tel]; sinColumna.add('tel'); }
          if (!sabeEntrega() && Object.prototype.hasOwnProperty.call(props, P.entrega)) { delete props[P.entrega]; sinColumna.add('entrega'); }
          /* Y las notas y el plazo con una hoja anterior a la 14, con la misma regla: la revisión de
             la bajada los manda cuando la fila traiga sus columnas vacías. */
          if (!sabeObra() && Object.prototype.hasOwnProperty.call(props, P.notas)) { delete props[P.notas]; sinColumna.add('notas'); }
          if (!sabeObra() && Object.prototype.hasOwnProperty.call(props, P.plazo)) { delete props[P.plazo]; sinColumna.add('plazo_k'); }
          if (sinColumna.size && Array.isArray(op.campos) && op.campos.length && op.campos.every(c => sinColumna.has(c))) {
            salida.push({ id: op.id, ok: true, remoto: null, rechazadas: [], omitida: true });
            continue;
          }
        } else {
          const viva = await instalacionDe(proy.id);
          props = instalacionANotion(op.datos, viva);
          /* La cita que va es la viva; si ya no hay ninguna, la cancelación de esta operación. */
          instEnviada = viva || op.datos;
        }

        let { props: enviables, fuera } = filtrar(props, permitidas);
        /* La lista de lo que este rol escribe se pide una vez por relevo. Si Dirección cambió
           el rol de esta persona en «Accesos» a media sesión, con la lista vieja el cambio se
           apartaba para siempre sin preguntarle a la hoja. Antes de apartarlo por rol, se
           vuelve a preguntar UNA vez por tanda. */
        const porRol = (!idNotion && !enviables[P.proyecto]) || !Object.keys(enviables).length;
        if (porRol && !refrescada) {
          refrescada = true; escribibles = null;
          try { permitidas = await asegurarEscribibles(); } catch (_) { /* se queda la de antes */ }
          ({ props: enviables, fuera } = filtrar(props, permitidas));
        }

        /* Un alta sin título crearía en la base del dinero una fila en blanco que nadie
           puede identificar después. Si este token no puede escribir `Proyecto`, el alta
           no se intenta: se dice de qué teléfono tiene que salir. */
        if (!idNotion && !enviables[P.proyecto]) {
          salida.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO', definitivo: true,
            mensaje: 'Este teléfono no puede dar de alta la venta en la hoja: su rol no escribe el nombre del proyecto. ' +
                     'Dala de alta desde el de Dirección y desde aquí ya podrás mover la obra.' });
          continue;
        }
        if (!Object.keys(enviables).length) {
          salida.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO', definitivo: true,
            mensaje: 'De ese cambio, este teléfono no puede escribir nada en la hoja: ' + fuera.join(', ') + '.' });
          continue;
        }

        /* El folio de cotización viaja también APARTE de los datos, como identidad y no como
           escritura: la hoja lo compara con el de la fila antes de escribir, para no escribir
           en otra venta que heredó ese folio de hoja. Aparte, porque fabricación no puede
           escribir esa columna y `filtrar` se la quita a los datos. */
        const fc = texto(proy.folio_global).trim();

        let r;
        try {
          r = await pedir(cfg, '/empujar', {
            method: 'POST',
            /* `sellos`: cuándo se cambió aquí cada dato de la obra que va (puente-sheets-14). Va
               aparte de los datos, y una hoja anterior lo ignora sin más. */
            body: JSON.stringify({ ops: [{ id: op.id, tipo: idNotion ? 'actualizar' : 'crear',
                                           id_notion: idNotion, datos: enviables,
                                           sellos: sellosDeLaOperacion(op, enviables, instEnviada),
                                           ...(fc ? { folio_cotizacion: fc } : {}) }] }),
          });
        } catch (e) {
          salida.push({ id: op.id, ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message });
          /* La red no se arregla en la siguiente operación del mismo lote. */
          break;
        }

        const res = (Array.isArray(r.cuerpo.resultados) ? r.cuerpo.resultados : [])
          .find(x => x && x.id === op.id);

        if (!res) {
          salida.push({ id: op.id, ok: false, codigo: 'DESCONOCIDO',
            mensaje: 'El puente contestó sin decir qué pasó con ese cambio.' });
          continue;
        }

        if (res.ok) {
          /* El id de la página se guarda AQUÍ y no en la próxima bajada, porque si no se
             guarda ahora la siguiente subida del mismo proyecto crearía una segunda fila.
             Se escribe sin volver a encolar: encolar aquí sería un bucle que se manda a sí
             mismo para siempre. */
          await espejarLocal(proy.id, {
            notion_page_id: (res.remoto && res.remoto.id_notion) || idNotion || null,
            notion_estado: 'enviado',
          });
          /* La lista SUBE. El Worker se toma el trabajo de devolver qué propiedades no
             escribió y por qué, y su propio comentario dice para qué: «una escritura que se
             descarta sin decirlo es la peor clase de falla — el usuario cree que guardó»
             (puente/worker.js:228). Aquí se quedaba en un console.warn, que en un teléfono
             no lo ve nadie: el proyecto se marcaba `enviado`, el renglón salía de la
             bandeja y la mitad de la fila no había llegado a Notion. */
          salida.push({ id: op.id, ok: true, remoto: res.remoto || null,
                        rechazadas: Array.isArray(res.rechazadas) ? res.rechazadas : [] });
          continue;
        }

        if (res.codigo !== 'CONFLICTO' && res.codigo !== 'SIN_RED') {
          await espejarLocal(proy.id, { notion_estado: 'fallido' });
        }
        /* NO_ENCONTRADO de la hoja es «esa venta ya no está» (o su fila ya es de otra): el id
           de la fila se QUEDA como está. Borrarlo haría que el siguiente cambio pidiera un
           alta y resucitara una venta que alguien borró a propósito.
           Lo que sí se hace es MARCARLO. Sin la marca, el proyecto seguía apuntando a la fila
           muerta, cada cambio se apartaba como rechazado para siempre y nadie tenía un botón
           para salir de ahí: la ficha lo enseña a Dirección con las dos salidas (ver
           `proyectos.volverADarDeAlta` y `proyectos.dejarFueraDeLaHoja`). Solo un cambio
           (`id_notion` en la mano) puede decir que la fila se perdió; un alta nunca tuvo fila. */
        const perdida = idNotion ? motivoPerdida(res) : '';
        if (perdida) {
          try { await marcarPerdidaEnLaHoja(proy.id, perdida, idNotion, res.mensaje || ''); } catch (_) { /* la marca es aviso; el rechazo se aparta igual */ }
        }
        salida.push({ id: op.id, ok: false, codigo: res.codigo || 'DESCONOCIDO',
                      definitivo: DEFINITIVOS.includes(res.codigo),
                      /* El porqué para la máquina: `sync` lo guarda en lo apartado
                         (`motivo_rechazo`) y `despuesDeBajar` lo vuelve a leer de ahí. */
                      ...(perdida ? { motivo: perdida } : {}),
                      mensaje: perdida ? mensajePerdida(res.mensaje, proy) : (res.mensaje || 'La hoja rechazó el cambio.'),
                      conflicto: res.conflicto || null });
      }

      return salida;
    },

    /**
     * Baja una página de filas. De CADA fila sale el renglón del libro mayor para
     * `ventas_hoja`; y de la que tiene proyecto de este lado, además, el parche de espejo
     * del dinero sobre ese proyecto. Ver la cabecera del archivo.
     */
    async bajar(cursor) {
      const r = await pedir(cfg, '/jalar' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      if (r.cuerpo.ok === false) throw falla(r.cuerpo.codigo || 'SIN_RED', r.cuerpo.mensaje || 'El puente no pudo leer la hoja.');

      const filas = Array.isArray(r.cuerpo.registros) ? r.cuerpo.registros : [];
      const registros = [];

      /* Los proyectos de ESTE teléfono por el folio de su fila (`notion_page_id`), leídos una vez
         por página y solo si hace falta. Es el tercer camino para encontrar a quién le cae una
         fila, y el que faltaba: una fila cuyo «Folio cotizacion» quedó vacío —o con la huella del
         defecto de septiembre de 2026, el folio de la propia hoja escrito ahí— no ataba por folio
         con el proyecto que la había dado de alta, y si estaba en FABRICACION se importaba COMO
         OTRO: la misma venta dos veces en el tablero y en Control. Un folio repetido en dos
         proyectos de aquí no ata a ninguno (false): ahí no se adivina.
         Van también por los folios que tuvieron antes (`folios_previos`, ver
         `proyectos.volverADarDeAlta`): la fila vieja que alguien restauró sigue siendo de esa venta. */
      let propios = null;
      const propioPorFila = async venta => {
        if (!venta || !venta.folio_hoja) return null;
        if (!propios) {
          /* Dos mapas: el folio de HOY manda sobre uno que otro proyecto tuvo antes. */
          propios = { hoy: new Map(), antes: new Map() };
          const poner = (m, k, p) => m.set(k, m.has(k) && m.get(k) !== p ? false : p);
          for (const p of await DB.listar('proyectos')) {
            if (!p || p.de_hoja || String(p.id || '').startsWith('proy-hoja-')) continue;
            const np = String(p.notion_page_id || '').trim();
            if (np) poner(propios.hoy, np, p);
            for (const k of foliosDeHoja(p)) if (k !== np) poner(propios.antes, k, p);
          }
        }
        const p = propios.hoy.has(venta.folio_hoja) ? propios.hoy.get(venta.folio_hoja) : propios.antes.get(venta.folio_hoja);
        if (!p) return null;
        /* Y solo si es seguro que es SU venta, con la misma regla con la que la revisión decide
           qué copia se junta sola (`proyectos.mismaVentaQueLaFila`): la fila trae su folio de
           cotización, o se llama igual, o ya se sabe que es suya. Que solo coincida el folio de
           la hoja no basta: es justo el folio que se repartió dos veces, y la fila puede ser de
           otra venta dada de alta a mano. Con eso bastaba, y a este proyecto le caía el saldo de
           la otra venta y su copia se juntaba con él. Si la regla no ata, la fila sigue su camino
           de siempre —su copia, o importarla— y la revisión la enseña como repetida para que
           Dirección decida.
           Una lápida («No se dio») tampoco se queda con una fila que la hoja trae VIVA
           (`proyectos.ataLaFila`). Por el nombre, o por haberla atado antes, no se sabe cuál de
           las dos dice la verdad, y atarla era decidir en silencio que la hoja se equivoca: la obra
           salía del tablero y su saldo del por cobrar de Control (`saldoDe` de un cancelado es
           cero). Antes de este tercer camino esa fila entraba como tarjeta viva y Control la
           cobraba; así sigue, y la revisión la enseña como repetida de la lápida para que
           Dirección decida (ver `proyectos.quitarDelTablero`). Con el folio de cotización en la
           fila es el primer camino, el de siempre, y no pasa por aquí. */
        const quien = ataLaFila(p, venta);
        return quien ? { p, quien } : null;
      };

      /* Las filas de ESTA página por su folio de hoja. La hoja manda todas en una respuesta
         desde puente-sheets-6, así que aquí están también las otras filas de una misma venta. */
      /* La fecha de instalación que baja (`instalacionDeHoja`). Las instalaciones y la bandeja
         se leen una vez por página y solo si alguna fila trae fecha. Un proyecto con un cambio
         todavía en la bandeja no se toca: la hoja aún no tiene la fecha que se acaba de agendar
         aquí, y aplicarle la vieja sería deshacerle a Dirección lo que acaba de hacer. */
      /* Los proyectos con un cambio todavía en la bandeja, leídos una vez por página y solo si
         alguien pregunta (la entrega que baja). */
      let bandeja = null;
      const leerBandeja = async () => {
        if (bandeja) return;
        /* Por proyecto, qué datos tiene esperando (puente-sheets-14: la regla es dato por dato).
           Un alta, o un cambio de una versión anterior que no dice qué cambió, aparta todos ('*'). */
        bandeja = new Map();
        const de = id => bandeja.get(id) || bandeja.set(id, new Set()).get(id);
        for (const op of await DB.listar('pendientes')) {
          if (!op || String(op.id || '').charAt(0) === '_' || op.estado !== 'pendiente') continue;
          if (op.almacen === 'proyectos') {
            const g = de(String(op.registro_id || (op.datos && op.datos.id) || ''));
            if (op.tipo === 'crear' || !Array.isArray(op.campos)) g.add('*');
            else for (const c of op.campos) if (SELLO_DE_CAMPO[c]) g.add(SELLO_DE_CAMPO[c]);
          }
          if (op.almacen === 'instalaciones' && op.datos) de(String(op.datos.proyecto_id || '')).add('instalacion');
        }
      };
      const enBandeja = async id => { await leerBandeja(); return bandeja.has(String(id)); };
      const ocupadosDe = async p => {
        await leerBandeja();
        const g = new Set(bandeja.get(String(p.id)) || []);
        /* Lo que se cambió mientras la venta estuvo fuera de la hoja y todavía no se manda
           (`sin_mandar`) tampoco se pisa: la revisión de esta misma bajada lo reenvía. */
        const sm = p.sin_mandar && Array.isArray(p.sin_mandar.campos) ? p.sin_mandar.campos : [];
        for (const c of sm) if (SELLO_DE_CAMPO[c]) g.add(SELLO_DE_CAMPO[c]);
        return g;
      };
      let agenda = null;
      const instDeHoja = async (datos, proyecto) => {
        /* Con sellos (puente-sheets-14) también baja la cita que alguien CANCELÓ: la fila trae la
           fecha vacía con su sello. Sin sellos, una fecha vacía no dice nada (ver arriba). */
        const conSello = !!(datos && datos[P.sellos] && Number(datos[P.sellos][P.fechaInst]) > 0);
        if (!datos || !proyecto || (!esISO(datos[P.fechaInst]) && !conSello)) return;
        if (!agenda) {
          agenda = { porProy: new Map(), enBandeja: new Set(), hechos: new Set() };
          for (const i of await DB.listar('instalaciones')) {
            if (!i || !i.proyecto_id) continue;
            const k = String(i.proyecto_id);
            if (!agenda.porProy.has(k)) agenda.porProy.set(k, []);
            agenda.porProy.get(k).push(i);
          }
          for (const op of await DB.listar('pendientes')) {
            if (!op || String(op.id || '').charAt(0) === '_' || op.estado !== 'pendiente') continue;
            if (op.almacen === 'proyectos') agenda.enBandeja.add(String(op.registro_id || (op.datos && op.datos.id) || ''));
            if (op.almacen === 'instalaciones' && op.datos) agenda.enBandeja.add(String(op.datos.proyecto_id || ''));
          }
        }
        const k = String(proyecto.id);
        if (agenda.enBandeja.has(k) || agenda.hechos.has(k)) return;
        const inst = conSello
          ? citaDeHoja(datos, proyecto, agenda.porProy.get(k) || [],
              { hoy: hoyISO(), ahora: Date.now(), nuevoId: () => DB.nuevoId('inst'), empresa: Prefs.empresa() })
          : instalacionDeHoja(datos, proyecto, agenda.porProy.get(k) || [],
              { hoy: hoyISO(), ahora: Date.now(), nuevoId: () => DB.nuevoId('inst'), empresa: Prefs.empresa() });
        if (!inst) return;
        agenda.hechos.add(k);   // la misma venta en dos filas: manda la primera
        registros.push({ almacen: 'instalaciones', datos: inst });
      };

      const ventasPagina = filas.map(f => ventaDeHoja((f && f.datos) || null));
      /* Una fila con la llave de la entrega dice que la hoja ya tiene AF (ver `revive`). */
      if (ventasPagina.some(v => v && typeof v.entrega === 'string')) hojaConEntrega = true;
      if (ventasPagina.some(v => v && v.sellos)) hojaConObra = true;
      const porFolioHoja = new Map();
      for (const v of ventasPagina) if (v && v.folio_hoja && !porFolioHoja.has(v.folio_hoja)) porFolioHoja.set(v.folio_hoja, v);

      for (const [i, fila] of filas.entries()) {
        const datos = (fila && fila.datos) || null;

        /* 1. El renglón del récord de ventas. Todas las filas, con o sin proyecto aquí. El
           sello es «ahora» para que en `sync.fusionar` gane siempre lo que acaba de bajar:
           de estas filas la dueña es la hoja y nadie las edita de este lado. */
        const venta = ventasPagina[i];
        if (venta) registros.push({ almacen: 'ventas_hoja', datos: { ...venta, actualizado_en: Date.now() } });

        /* 2. El proyecto de este lado, si lo hay, por los DOS caminos: el folio de cotización
           —la venta que nació en el cotizador de alguien— y, si no, el proyecto que este
           mismo relevo importó de esta misma fila en un barrido anterior. Sin el segundo,
           cada barrido volvería a crearlo y se perdería lo que el taller hubiera movido.

           Y el parche del dinero se calcula DESPUÉS de decidir si hay proyecto, no antes. Al
           revés estaba mal y costó el caso entero: `deNotion` devuelve null cuando la fila no
           trae «Folio cotizacion», que es exactamente la condición de las filas que hay que
           importar. Con el `continue` de ese null por delante, el camino de importación no se
           pisaba nunca: se escribió, se probó en node y en la hoja no apareció ni un
           proyecto. Lo que hay que buscar primero es el proyecto; el parche es para cuando ya
           se sabe a quién cae. */
        const parche = deNotion(datos);
        let local = (parche && parche.folio_global) ? await porFolioGlobal(parche.folio_global) : null;
        let porFila = null;
        if (!local && venta) {
          try { porFila = await propioPorFila(venta); } catch (_) { porFila = null; }
          if (porFila) local = porFila.p;
        }
        const idImportado = venta ? 'proy-hoja-' + venta.folio_hoja : '';
        if (!local && idImportado) {
          try { local = await DB.obtener('proyectos', idImportado); } catch (_) { local = null; }
        }

        /* Sin proyecto de este lado: si la venta está VIVA, se importa. Ver
           `proyectos.desdeVentaDeHoja` para por qué esto no existía y por qué ahora sí.

           Solo las vivas, y eso es la mitad de la decisión: FABRICACION y REPARANDO son
           trabajo del taller. COBRANDO ya se hizo y solo falta cobrarlo —Control lo lleva
           desde el récord, y ponerlo en el tablero de obra sería trabajo terminado pidiendo
           taller—, y LIQUIDADO está cerrado. Las 199 filas históricas son casi todas
           liquidadas: por eso importar «lo vivo» no llena el tablero, lo llena de las
           dieciséis que sí están en el taller. */
        if (!local) {
          if (venta && VIVAS_EN_TALLER.includes(String(venta.estatus || ''))) {
            const nuevo = desdeVentaDeHoja(venta);
            if (nuevo) {
              registros.push({ almacen: 'proyectos', datos: nuevo });
              try { await instDeHoja(datos, nuevo); } catch (_) { /* el proyecto ya bajó */ }
            }
          }
          continue;   // ya quedó en el récord; el parche de dinero no tiene a quién caerle
        }

        /* La misma venta en DOS filas: Dirección la volvió a dar de alta y alguien deshizo después
           el borrado de la fila vieja (o la metió otra vez a mano). Las dos le caen a este proyecto
           y, sin esto, cada bajada le cambiaba la fila en silencio —`notion_page_id` se quedaba con
           la última que se escribía— y la otra se congelaba, aunque fuera la de los cobros. Se
           queda con la que tenía, mientras esa siga en la hoja y siga siendo suya, y a la otra no
           se le aplica nada: su renglón ya quedó en el récord, y la revisión marca la venta
           (`hoja_doble`) para que Dirección decida en la hoja cuál sobra. Si la que tenía ya no
           está, ésta es la buena y la ata como siempre. */
        const suFila = String(local.notion_page_id || '').trim();
        if (venta && suFila && suFila !== venta.folio_hoja && !esImportadoLocal(local)) {
          const laOtra = porFolioHoja.get(suFila);
          if (laOtra && ataLaFila(local, laOtra)) continue;
        }

        /* Para un proyecto IMPORTADO no hay parche de `deNotion` —su fila no trae folio de
           cotización— y sin esto el dinero se congelaría en el del día que se importó: si
           PAGOS corrige el anticipo en la hoja, el tablero seguiría con el viejo. Se arma con
           lo que la hoja es dueña, y nada más: ni el nombre ni la etapa, que es lo único que
           el taller mueve de este lado y que no se puede pisar en cada bajada. */
        /* Una celda vaciada en la hoja baja como null (ver `ventaDeHoja`); en el proyecto el
           anticipo que no hay es 0 y el % vacío también, como en `deNotion`. */
        const aCero = x => (x === null ? 0 : x);
        /* Al proyecto de aquí encontrado por su fila le cae el espejo de SIEMPRE, el de
           `deNotion`, armado con su propio folio: sin «Folio cotizacion» en la fila, `parche` es
           null y caería en el de abajo, que es el de una tarjeta importada y le pisaría el precio
           firmado con el neto de la hoja. Y lleva `folio_hoja`, que es con lo que
           `ventas.unificar` lo ata a su renglón: sin él, Control lo contaba una vez como «solo
           aquí» y otra como fila de la hoja. */
        const deAqui = porFila ? deNotion({ ...datos, [P.folio]: local.folio_global }) : null;
        if (deAqui && venta.folio_hoja) deAqui.folio_hoja = venta.folio_hoja;
        /* Y la atadura se anota (`hoja_confirmada`), como la que confirma Dirección al juntar. Por
           el nombre se recalculaba en cada bajada, y el nombre es justo lo que PAGOS corrige en la
           hoja: con la corrección, la venta dejaba de estar atada, su fila volvía a entrar como
           OTRA tarjeta —repetida— y este proyecto dejaba de recibir su dinero. Recordarla solo
           tenía un riesgo, que el folio de la hoja se le repartiera después a otra venta, y eso ya
           no pasa con la marca de folios. Es una marca de este teléfono y baja con el espejo:
           `sync.jalar` la escribe sin encolar nada. */
        if (deAqui && venta.folio_hoja && porFila.quien !== 'confirmada') deAqui.hoja_confirmada = venta.folio_hoja;
        const aplicar = deAqui || parche || (venta ? sinIndefinidos({
          estatus_notion: venta.estatus || null,
          cuenta: venta.cuenta || null,
          sub: aCero(venta.sub), neto: aCero(venta.neto), precio_auth: aCero(venta.neto),
          anti_pactado: aCero(venta.anticipo),
          pago_pendiente: venta.pago_pendiente === undefined ? null : venta.pago_pendiente,
          comision_restante: venta.comision_restante === undefined ? null : venta.comision_restante,
          pct_comision: aCero(venta.pct_comision),
        }) : null);
        if (!aplicar) continue;

        /* Una tarjeta IMPORTADA cuya venta la hoja ya pasó a COBRANDO o LIQUIDADO: el trabajo se
           entregó. Su etapa no la mueve nadie más —nació en la hoja, no hay cotización ni
           instalación agendada que la empuje— y se quedaba en el tablero como «Ganado» para
           siempre: en octubre de 2026 eran ocho obras cobradas o cerradas pidiendo taller. Se
           pasa a «Instalado», solo de este lado (`sync.jalar` escribe sin encolar) y solo si
           seguía en la línea del taller: una que alguien ya movió a garantía o canceló, se queda. */
        /* Se decide al final, después de la etapa que baja de la hoja (`obraDeLaFila`): ver
           `cobradaEnLaLinea` abajo. */
        const cobradaEnLaLinea = !!(venta && esImportadoLocal(local) && ESTATUS_DE_PAGOS.includes(String(venta.estatus || '')));

        const editado = Date.parse((fila.datos && fila.datos.editado) || '') || 0;
        /* El sello se iguala al local a propósito, y esto es lo único astuto del archivo.
           `sync.fusionar` deja ganar al más nuevo, y el registro local se toca cada vez que
           alguien mueve la etapa. Sin esto, el espejo del dinero que acaba de bajar
           perdería contra un `pago_pendiente: null` local por el solo hecho de que alguien
           avanzó la obra hace un rato, y la cobranza se quedaría en blanco para siempre.
           De estos campos la dueña es Notion por definición (§4.0), así que ganan. */
        const sello = Math.max(editado, Number(local.actualizado_en) || 0);

        delete aplicar.folio_global;   // la llave era para encontrarlo, no para escribirlo
        /* La fila VINO: la venta está en la hoja, y un «ya no está» de antes es viejo —alguien
           la volvió a meter, o deshizo el borrado—. Ver `proyectos.avisoDeHoja`.
           Y lo mismo la decisión de dejarla fuera (`fuera_de_hoja`): se tomó para una fila que
           ya no existía. Si se quedaba puesta, `subir` seguía dando por despachado cada cambio
           sin mandarlo —el bombeo lo contaba como subido— y la fila viva nunca recibía la
           etapa; y a la tarjeta importada se le podía dar «Quitar del tablero» con su fila en
           la hoja, y la siguiente bajada la traía de nuevo sin las notas que tenía. */
        if (local.hoja_perdida) aplicar.hoja_perdida = null;
        if (local.fuera_de_hoja) aplicar.fuera_de_hoja = null;
        /* Lo que se cambió aquí mientras la fila no estaba y todavía no se manda (`sin_mandar`):
           la revisión de esta misma bajada lo reenvía (ver `proyectos.revisarContraLaHoja`), con
           el valor de aquí. Si el espejo lo pisaba antes con el de la fila —la cuenta, el estatus,
           el anticipo que la fila traía de antes—, se reenviaba justo ese valor viejo y la
           corrección no quedaba ni en el teléfono ni en la hoja. La fila lo recibe en el reenvío,
           y la bajada siguiente ya lo trae de allá. */
        const sinMandar = local.sin_mandar && Array.isArray(local.sin_mandar.campos) ? local.sin_mandar.campos : [];
        for (const k of sinMandar) if (SE_QUEDAN_HASTA_MANDARSE.has(k)) delete aplicar[k];
        /* El teléfono de la hoja (puente-sheets-11), SOLO si este proyecto no tiene ninguno —ni
           propio ni en la cotización, que es el que enseña la ficha—. Uno de aquí no se pisa con
           el de la fila, y menos con un vacío: el del teléfono que ganó la cotización es el que
           se le dio al cliente, y si la hoja tiene otro, lo decide una persona. */
        /* Con una hoja que ya guarda cuándo cambió cada dato (puente-sheets-14), la obra —la etapa,
           las notas, el plazo, el teléfono, la dirección, el pin y la entrega— baja con UNA regla:
           gana el cambio más reciente (`obraDeLaFila`). Lo de abajo, hasta el final del bloque,
           son las reglas de antes, para una hoja que todavía no tiene la columna de los sellos. */
        const obra = venta ? obraDeLaFila(venta, local, { ocupados: await ocupadosDe(local) }) : null;
        if (obra) {
          Object.assign(aplicar, obra.parche);
          if (obra.sellos) aplicar.sellos = obra.sellos;
        }
        const telHoja = !obra && venta && typeof venta.telefono === 'string' ? venta.telefono : '';
        if (telHoja && !telefonoDe(local)) aplicar.tel = telHoja;
        /* La entrega de la hoja (puente-sheets-12). Aquí, a diferencia del teléfono, MANDA LA
           HOJA cuando dice algo: «Paquetería» elegida en AF es una persona que ya sabe cómo sale
           ese trabajo, y este teléfono tiene que dejar de pedirle pin y de rotularlo instalación.
           Pero solo lo que dice: una celda vacía ('') no pisa nada —vacía es también «nadie la ha
           tocado»—, y un proyecto con un cambio todavía en la bandeja tampoco se toca: la hoja aún
           no tiene lo que se acaba de elegir aquí, y aplicarle la vieja lo desharía. */
        const entHoja = !obra && venta && typeof venta.entrega === 'string' ? venta.entrega : '';
        if (entHoja && entHoja !== entregaDe(local) && !(await enBandeja(local.id))) aplicar.entrega = entHoja;
        /* La dirección y la ubicación de la hoja, con la regla del teléfono: SOLO si este proyecto
           no tiene, y nunca con un cambio suyo en la bandeja. Las llena «Registrar nueva venta» de
           la hoja desde puente-sheets-13, o una persona a mano; la plataforma solo escribe AB y AC
           desde lo que ya tiene, así que una celda con algo y un proyecto vacío es alguien que la
           consiguió por otro lado. El link que la hoja no pudo leer baja como `maps_url`, y la
           sincronización le saca el pin. */
        if (!obra && venta && (venta.direccion || venta.ubicacion) && !(await enBandeja(local.id))) {
          if (venta.direccion && !String(local.dir_texto || '').trim()) aplicar.dir_texto = venta.direccion;
          if (venta.ubicacion && !tienePin(local)) {
            const u = ubicacionDeHoja(venta.ubicacion);
            if (u.lat !== null) Object.assign(aplicar, { lat: u.lat, lng: u.lng, geo_fuente: u.geo_fuente });
            if (u.maps_url && !String(local.maps_url || '').trim()) aplicar.maps_url = u.maps_url;
          }
        }
        /* La tarjeta importada ya cobrada, a «Instalado» (ver arriba), con la etapa que quedó: la de
           aquí, o la que acaba de bajar de la hoja. */
        if (cobradaEnLaLinea && EN_LA_LINEA.includes(String(aplicar.etapa || local.etapa || ''))) {
          aplicar.etapa = 'instalado';
        }
        registros.push({ almacen: 'proyectos', datos: { ...aplicar, id: local.id, actualizado_en: sello } });
        try { await instDeHoja(datos, { ...local, ...aplicar, id: local.id }); } catch (_) { /* el dinero ya bajó */ }
      }

      /* 3. El almacén, el catálogo y las listas de compra, de sus pestañas (puente-sheets-9).
         Después de la venta y en su propio try: si la hoja no los tiene o no contesta, lo de la
         venta ya bajó igual, y la marca del almacén no se mueve. Solo en la última página de la
         venta, que hoy es la única. */
      if (!r.cuerpo.hay_mas && sabeAlmacen() !== false) {
        try { for (const x of await bajarAlmacen()) registros.push(x); } catch (_) { /* la venta ya bajó */ }
      }

      return { registros, cursor: r.cuerpo.cursor || null, hay_mas: !!r.cuerpo.hay_mas };
    },

    /**
     * Lo llama `sync.jalar` al cerrar un barrido, con lo que bajó ya escrito. Traduce los ids
     * del récord que se vieron (`hoja:V-042`, ver `ventaDeHoja`) a folios de la hoja y deja que
     * `proyectos.revisarContraLaHoja` junte las copias repetidas y marque las tarjetas
     * importadas cuya fila ya no vino. Solo `completa` puede marcar: un barrido que arrancó a
     * medias no vio la primera parte, y lo que no vio no es lo que falta.
     *
     * `rechazadas` es lo apartado de la bandeja (`sync.rechazadas`). De ahí salen los rebotes
     * de «ya no está en la hoja» / «ya es de otra venta» que se apartaron ANTES de que existiera
     * la marca: lo apartado no se reintenta solo, y esas ventas —las que dieron origen a todo
     * esto— se quedaban sin aviso y sin botones hasta que alguien volviera a tocar la obra. Qué
     * rechazo es cuál lo sabe este archivo (`motivoPerdida`, que lee la frase de las hojas que
     * todavía no mandan `motivo`); si la bajada lo confirma, lo decide `revisarContraLaHoja`.
     */
    async despuesDeBajar(info) {
      /* Lo del almacén ya está escrito: ahora sí se guarda hasta dónde se vio. */
      if (almacenPorGuardar) {
        const m = almacenPorGuardar;
        almacenPorGuardar = null;
        await guardarMarcaAlmacen(m);
      }
      const ids =(info && info.vistos && Array.isArray(info.vistos.ventas_hoja)) ? info.vistos.ventas_hoja : [];
      const folios = new Set(ids.map(String).filter(x => x.startsWith('hoja:')).map(x => x.slice(5)));
      const rebotes = [];
      for (const o of (info && Array.isArray(info.rechazadas) ? info.rechazadas : [])) {
        const motivo = o ? motivoPerdida({ codigo: o.codigo_rechazo, motivo: o.motivo_rechazo, mensaje: o.ultimo_error }) : '';
        if (!motivo) continue;
        /* El cambio de una instalación también rebota contra la fila de su proyecto. */
        const id = o.almacen === 'instalaciones' ? (o.datos && o.datos.proyecto_id) : (o.registro_id || (o.datos && o.datos.id));
        if (id) rebotes.push({ id: String(id), motivo, mensaje: String(o.ultimo_error || '') });
      }
      const r = await revisarContraLaHoja({ folios, completa: !!(info && info.completa), rebotes });
      return r && r.ok ? r.valor : null;
    },
  };
}

/* ----- Las escrituras locales del relevo -----
   Van con `DB` directo y no por `proyectos.parchar` por una razón concreta: `parchar`
   ENCOLA, y encolar desde el relevo que está vaciando la cola es un bucle que se manda a
   sí mismo para siempre. Lo que se escribe aquí son campos de los que la dueña es Notion
   —el id de la página y el estado del envío— o notas del propio relevo, nunca un dato del
   negocio. */
async function espejarLocal(id, campos) {
  try {
    const p = await DB.obtener('proyectos', id);
    if (!p) return;
    await DB.poner('proyectos', { ...p, ...campos, actualizado_en: Date.now() });
  } catch (_) { /* la operación ya se mandó; no perder eso por no poder anotar el id */ }
}

/* Lo que no se mandó porque la venta está fuera de la hoja. Se acumula desde cuándo
   y qué campos cambiaron, no las operaciones: cuando la fila vuelva se manda UNA con el estado de
   hoy (la etapa, la dirección y la instalación viajan siempre), y los campos son para que el
   nombre o el dinero que sí cambiaron viajen también (ver `aNotion`) y para que la bajada no los
   pise antes de mandarlos (ver `bajar`). La forma es la de `proyectos.sumarSinMandar`, que
   comparte con lo que ya había rebotado al «Dejarla». */
async function anotarSinMandar(id, op) {
  try {
    const p = await DB.obtener('proyectos', id);
    if (!p) return;
    await DB.poner('proyectos', { ...p, sin_mandar: sumarSinMandar(p.sin_mandar, [op], Date.now()) });
  } catch (_) { /* sin la nota, el cambio se queda aquí como antes; no se para el bombeo por ella */ }
}

/* Los campos del espejo que este teléfono también escribe y manda (ver `aNotion`): la cuenta y el
   estatus que aprieta PAGOS, y el anticipo, el % y el subtotal que corrige Dirección. Son los que
   la bajada no pisa mientras estén en `sin_mandar`. El resto del espejo —las fórmulas, el id de
   la fila— baja siempre. */
const SE_QUEDAN_HASTA_MANDARSE = new Set(['estatus_notion', 'cuenta', 'anti_pactado', 'pct_comision', 'sub', 'entrega']);

/** Un cambio de puro teléfono que la hoja rechazó y que no se ha vuelto a intentar. PURA.
 *  Los de antes de la 11 salían de la plataforma con `campos: ['tel']` —ningún cambio de
 *  teléfono se mandaba todavía— y la hoja contestaba que ese teléfono no podía escribir nada. */
export function esRechazoDeTelefono(op) {
  return !!op && op.estado === 'rechazada' && op.almacen === 'proyectos' && !op.revivida_tel &&
    Array.isArray(op.campos) && op.campos.length > 0 && op.campos.every(c => c === 'tel');
}
/** Lo mismo para la entrega (puente-sheets-12): un cambio de pura entrega que una hoja en la 12
 *  sin la columna AF rechazó («falta correr Preparar la hoja»). Una vez (`revivida_entrega`). PURA. */
export function esRechazoDeEntrega(op) {
  return !!op && op.estado === 'rechazada' && op.almacen === 'proyectos' && !op.revivida_entrega &&
    Array.isArray(op.campos) && op.campos.length > 0 && op.campos.every(c => c === 'entrega');
}
/** Lo mismo para las notas y el plazo (puente-sheets-14): un cambio de solo eso que una hoja en la
 *  14 sin las columnas AG:AI rechazó. Una vez (`revivida_obra`). PURA. */
export function esRechazoDeObra(op) {
  return !!op && op.estado === 'rechazada' && op.almacen === 'proyectos' && !op.revivida_obra &&
    Array.isArray(op.campos) && op.campos.length > 0 && op.campos.every(c => c === 'notas' || c === 'plazo_k');
}
const esImportadoLocal = p => !!p && (p.de_hoja === true || String(p.id || '').startsWith('proy-hoja-'));

/* El rango usa el índice y el filtro es el cinturón, igual que en `proyectos.yaExiste`: si
   `IDBKeyRange` no se pudo armar, `rango()` devuelve null y el cursor recorrería el índice
   entero, así que sin el filtro CUALQUIER proyecto se leería como este y el espejo del
   dinero de una venta caería encima de otra. */
function rango(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  try { return IDBKeyRange.only(valor); } catch (_) { return null; }
}

async function porFolioGlobal(fg) {
  const filas = await DB.listar('proyectos',
    { indice: 'porFolio', rango: rango(fg), filtro: p => p && p.folio_global === fg });
  return filas.length ? filas[0] : null;
}

/* ============================================================================
   LOS PASOS PARA MONTARLO

   Van aquí y no en la pantalla de Ajustes, por lo mismo que los de Calendar viven en
   `gcal.js`: el día que cambie el nombre de una variable del Worker tiene que cambiar en
   el mismo archivo donde está el código que la usa. Dos copias de un tutorial es una copia
   mintiendo, y en un mes nadie sabe cuál.

   El detalle largo —el runbook de errores, el porqué de cada decisión— vive en
   `puente/README.md`. Esto son los pasos, en el orden en que se hacen.
   ============================================================================ */

export function instrucciones() {
  return {
    titulo: 'Conectar la hoja',
    minutos: 10,
    /* Desde puente-sheets-5 la puerta normal es la cuenta de Google y el rol sale de la
       pestaña «Accesos»; estos pasos decían todavía que la única entrada era pegar un token
       de dispositivo. El token se queda, y se dice qué es: la salida de emergencia. */
    pasos: [
      'Abre la hoja «Finanzas AL3D — Ventas y Comisiones» en Google Sheets.',
      'Menú Extensiones → Apps Script. Ahí vive el puente: es código que corre DENTRO de la hoja, con los permisos de su dueño. Antes de pegar código nuevo, baja el que tiene la hoja y compáralo (puente/README.md, «Antes de pegar nada»).',
      'Botón Implementar → Nueva implementación → Aplicación web.',
      'Ejecutar como: Yo. Es lo que le da acceso a la hoja sin pedirle nada a los teléfonos.',
      'Quién tiene acceso: Cualquier usuario. Si queda en «Solo yo», el teléfono recibe la pantalla de Google en vez de datos, y «Probar» te lo dice con esas palabras.',
      'Si la URL que termina en /exec no es la que la plataforma ya trae de fábrica, pégala aquí abajo. Si es la misma, deja el campo vacío.',
      'En la hoja, pestaña «Accesos»: un renglón por persona, con su correo de Google y su rol (direccion, fabricacion o pagos). La crea prepararHojaParaElPuente(), con el dueño de la hoja ya dentro.',
      'En cada teléfono: «Entrar con Google» con ese correo. No hay que pegar nada: el rol lo pone la hoja.',
      'Dale a «Probar». Tiene que contestar en verde y decirte qué rol reconoció y con qué correo.',
      'Dale a «Revisar el esquema». Si le falta alguna columna a la hoja, o la pestaña «Accesos», te lo lista con su nombre y su tipo.',
      'Solo para emergencias: menú ⚡ AL3D → Tokens del puente. Un token de dispositivo pegado aquí abajo sirve el día que Google no conteste; se manda por donde se mandan las llaves, no por el chat del grupo.',
    ],
    notas: [
      'Ya no hay token de Notion ni Worker de Cloudflare. El Worker existía solo para esconder un token que daba escritura total sobre todo Notion; con el dinero en la hoja no hay secreto que esconder, y el puente corre dentro de la propia hoja.',
      'La dirección del puente es pública —cualquiera puede tocar la puerta— y la puerta es quién eres: el puente le pregunta a Google de quién es tu token y busca tu correo en «Accesos». El token de dispositivo es la otra llave, la de emergencia. Sin ninguna de las dos, el puente contesta que no y nada más. Alrededor hay tres candados más: todo entra por POST con la llave en el cuerpo (nunca en una URL), hay tope de 60 peticiones por minuto por persona, y toda escritura queda anotada en una bitácora dentro de la hoja.',
      'El rol sale de la hoja, no de la pantalla. Cambiar el segmento de rol en Ajustes te da otro tablero, no te da permisos: quien está en «Accesos» como fabricación sigue sin poder tocar el dinero.',
      'Si el puente se cae, no pasa nada: la plataforma sigue funcionando con lo que tiene en el teléfono, y el botón «Copiar datos para la hoja» del cotizador sigue siendo el camino manual. Ese botón no se retira nunca.',
    ],
  };
}

/**
 * El relevo de este dispositivo, o null si todavía no hay puente pegado en Ajustes.
 * Lo llama `app.js` al arrancar y Ajustes al guardar.
 */
export function desdePrefs() {
  const cfg = Prefs.puente();
  /* Basta la dirección: la puerta puede ser el token de dispositivo o el ingreso de Google,
     y cuál de las dos se usa se decide en cada petición (ver `pedir`). `Prefs.hayPuente`
     lleva la misma regla y es la que apaga la sincronización cuando no hay ninguna. */
  return (cfg && cfg.url) ? crear(cfg) : null;
}
