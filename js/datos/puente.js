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
   El puente de hoy conoce una sola pestaña: `Ventas`. Así que este relevo lleva `proyectos`
   e `instalaciones` —las dos caras de la misma fila de venta— y NO lleva el almacén, el
   catálogo ni los avisos, porque todavía no existen las pestañas a las que irían.

   Lo que no lleva NO se descarta y NO se cuenta como pendiente de mandar: `sync.js` lo
   aparta con el motivo escrito. Descartarlo perdería el día que sí haya destino; contarlo
   como pendiente haría que Ajustes dijera «47 esperando» para siempre, y un contador que
   nunca baja se aprende a ignorar igual que un aviso rojo que no significa nada.

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
import { desdeVentaDeHoja } from './proyectos.js';
import * as Ingreso from '../nucleo/ingreso.js';

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
};

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
export const ALMACENES = ['proyectos', 'instalaciones'];

/** Lo que este relevo BAJA entero y de lo que la hoja es la única dueña: `sync.jalar` borra
 *  de estos almacenes, al cerrar un barrido completo, lo que la hoja ya no trajo. */
export const ESPEJOS = ['ventas_hoja'];

/* Cada uno con su frase entera y no con un sustantivo metido en una plantilla. La
   plantilla ya se escribió y ya salió mal: «Las listas de compra SE QUEDA en este
   dispositivo». Una frase armada con pegamento no concuerda en plural, y este texto lo lee
   una persona que está intentando entender por qué su cambio no salió. */
const NO_LLEVA = {
  movimientos:    'El libro del almacén se queda en este dispositivo hasta que exista su pestaña en la hoja.',
  materiales:     'El catálogo de material se queda en este dispositivo hasta que exista su pestaña en la hoja.',
  requerimientos: 'Las listas de compra se quedan en este dispositivo: se derivan de las partidas y se vuelven a calcular solas.',
  avisos:         'Los avisos se calculan al abrir la plataforma, en cada dispositivo. No viajan y no hace falta que viajen.',
  constantes:     'Las constantes del taller se quedan en este dispositivo.',
  geo:            'La caché de ubicaciones se queda en este dispositivo. Se vuelve a llenar sola.',
};

/** El texto que Ajustes pinta al lado de lo apartado. Sale de aquí para que la pantalla no
 *  invente una lista de almacenes que este archivo podría cambiar mañana. */
export function motivoSinDestino(almacen) {
  return 'El puente de hoy solo lleva la venta a la hoja. ' +
    (NO_LLEVA[almacen] || 'Eso se queda en este dispositivo hasta que exista su pestaña.');
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
 * cambió (`opts.campos`, que `proyectos.actualizar` anota). Lo que la plataforma sí es dueña
 * —etapa, dirección, ubicación, tipo, fechas de instalación, estatus y cuenta que aprieta
 * PAGOS— viaja siempre.
 *
 * @param {Object} p proyecto de §4.4
 * @param {Object|null} inst su instalación, si ya tiene fecha
 * @param {{alta?:boolean, campos?:string[]}} [opts] sin `opts` se manda todo (es un alta)
 * @returns {Object} nombre de propiedad de Notion -> valor
 */
export function aNotion(p, inst, opts) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const alta = o.alta === undefined ? true : !!o.alta;
  const campos = new Set(Array.isArray(o.campos) ? o.campos : []);
  const va = campo => alta || campos.has(campo);

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
  if (etapa) out[P.etapa] = etapa;

  if (ESTATUS.includes(p.estatus_notion)) out[P.estatus] = p.estatus_notion;
  if (CUENTAS.includes(p.cuenta))         out[P.cuenta]  = p.cuenta;

  out[P.direccion] = texto(p.dir_texto);
  /* Cero coma cero no es «no sabemos dónde está»: es la Isla Nula, en el Atlántico, y un
     pin ahí se ve igual de convincente que uno bueno. Es el mismo cordón que `geo.enRango`
     ya tiene del lado del mapa, y tiene que estar de los dos: un cero de relleno que se
     cuela a Notion queda en el libro mayor y de ahí nadie lo saca. Sin coordenada, vacío. */
  const la = Number(p.lat), ln = Number(p.lng);
  out[P.ubicacion] = (p.lat !== null && p.lng !== null && isFinite(la) && isFinite(ln) &&
                      Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0))
    ? la + ',' + ln : '';

  out[P.tipo] = Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo.slice() : [];

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
 */
export function instalacionANotion(inst) {
  if (!inst || typeof inst !== 'object' || !esISO(inst.fecha)) return {};
  /* Solo la columna de instalación. La del anticipo es de la venta, no de la instalación:
     ver el comentario de las dos fechas en `aNotion`. */
  const out = {};
  out[P.fechaInst] = inst.fecha;
  out[P.horaInst]  = texto(inst.hora);
  return out;
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
  };
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

/* ----- La versión de la hoja que esta plataforma espera -----
   `salud` devuelve la versión del Apps Script publicado. Si la hoja se quedó con una
   implementación anterior, el contrato que este archivo asume no es el que corre allá, y
   Ajustes lo enseña con el aviso de abajo; la prueba de node comprueba que el .gs del repo
   diga esta versión.

   El aviso dice lo que falla CON ESA versión, no una lista fija. La de antes advertía del
   saldo al revés y del % de comisión a una hoja en puente-sheets-4, que ya los tenía
   arreglados, y callaba lo único que de verdad le faltaba: que ahí entrar con Google no da
   rol. Un aviso que dice cosas que no pasan se aprende a ignorar el día que sí importa. */
export const VERSION_ESPERADA = 'puente-sheets-6';
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
async function pedir(cfg, ruta, opciones = {}) {
  /* Antes del reloj de abajo: la renovación no le come los quince segundos a la petición. */
  const g = await tokenDeGoogle();
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  /* Sin tope, un puente que no contesta deja el bombeo colgado para siempre y la pantalla
     de Ajustes con el botón apretado. Quince segundos: Apps Script con la red de un
     teléfono en la calle tarda, pero no tanto. */
  const t = ctrl ? setTimeout(() => ctrl.abort(), MS_ESPERA) : 0;

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
  if (g) cuerpo.google_token = g;
  if (cfg.token) cuerpo.token = cfg.token;
  cuerpo.ruta = camino.replace(/^\/+/, '');

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
      ? 'El puente no contestó en 15 segundos. Lo que hiciste está guardado aquí y se manda solo.'
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

  async function asegurarEscribibles() {
    if (escribibles) return escribibles;
    const r = await pedir(cfg, '/salud');
    /* Solo se recuerda una lista de verdad. Un /salud que contestó 503 porque Notion está
       caído no trae `escribibles`, y cachear ese vacío dejaría a este teléfono mandando a
       ciegas el resto de la sesión: así, la siguiente subida vuelve a preguntar. */
    if (Array.isArray(r.cuerpo.escribibles)) escribibles = new Set(r.cuerpo.escribibles);
    return escribibles || new Set();
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

    /** Los almacenes que este relevo sabe llevar. `sync.js` aparta el resto sin gastar red. */
    lleva(almacen) { return ALMACENES.includes(almacen); },
    motivo: motivoSinDestino,
    /** Los que baja enteros: `sync.jalar` borra lo que la hoja dejó de traer. */
    espejos: ESPEJOS.slice(),

    async salud() {
      try {
        const r = await pedir(cfg, '/salud');
        if (Array.isArray(r.cuerpo.escribibles)) escribibles = new Set(r.cuerpo.escribibles);
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
        return r.cuerpo.ok ? { ok: true, url: r.cuerpo.url }
                           : { ok: false, mensaje: r.cuerpo.mensaje || 'Ese link corto no llevó a ningún mapa.' };
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

      for (const op of lista) {
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
        let props;
        if (op.almacen === 'proyectos') {
          /* Alta si la fila no existe todavía; si ya existe, el dinero y el nombre solo van
             cuando la operación dice que eso fue lo que cambió. Ver aNotion. */
          props = aNotion(op.datos, await instalacionDe(proy.id),
                          { alta: !idNotion, campos: Array.isArray(op.campos) ? op.campos : [] });
        } else {
          props = instalacionANotion(op.datos);
        }

        const { props: enviables, fuera } = filtrar(props, permitidas);

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
            body: JSON.stringify({ ops: [{ id: op.id, tipo: idNotion ? 'actualizar' : 'crear',
                                           id_notion: idNotion, datos: enviables,
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
           alta y resucitara una venta que alguien borró a propósito. */
        salida.push({ id: op.id, ok: false, codigo: res.codigo || 'DESCONOCIDO',
                      definitivo: DEFINITIVOS.includes(res.codigo),
                      mensaje: res.mensaje || 'La hoja rechazó el cambio.', conflicto: res.conflicto || null });
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

      for (const fila of filas) {
        const datos = (fila && fila.datos) || null;

        /* 1. El renglón del récord de ventas. Todas las filas, con o sin proyecto aquí. El
           sello es «ahora» para que en `sync.fusionar` gane siempre lo que acaba de bajar:
           de estas filas la dueña es la hoja y nadie las edita de este lado. */
        const venta = ventaDeHoja(datos);
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
            if (nuevo) registros.push({ almacen: 'proyectos', datos: nuevo });
          }
          continue;   // ya quedó en el récord; el parche de dinero no tiene a quién caerle
        }

        /* Para un proyecto IMPORTADO no hay parche de `deNotion` —su fila no trae folio de
           cotización— y sin esto el dinero se congelaría en el del día que se importó: si
           PAGOS corrige el anticipo en la hoja, el tablero seguiría con el viejo. Se arma con
           lo que la hoja es dueña, y nada más: ni el nombre ni la etapa, que es lo único que
           el taller mueve de este lado y que no se puede pisar en cada bajada. */
        /* Una celda vaciada en la hoja baja como null (ver `ventaDeHoja`); en el proyecto el
           anticipo que no hay es 0 y el % vacío también, como en `deNotion`. */
        const aCero = x => (x === null ? 0 : x);
        const aplicar = parche || (venta ? sinIndefinidos({
          estatus_notion: venta.estatus || null,
          cuenta: venta.cuenta || null,
          sub: aCero(venta.sub), neto: aCero(venta.neto), precio_auth: aCero(venta.neto),
          anti_pactado: aCero(venta.anticipo),
          pago_pendiente: venta.pago_pendiente === undefined ? null : venta.pago_pendiente,
          comision_restante: venta.comision_restante === undefined ? null : venta.comision_restante,
          pct_comision: aCero(venta.pct_comision),
        }) : null);
        if (!aplicar) continue;

        const editado = Date.parse((fila.datos && fila.datos.editado) || '') || 0;
        /* El sello se iguala al local a propósito, y esto es lo único astuto del archivo.
           `sync.fusionar` deja ganar al más nuevo, y el registro local se toca cada vez que
           alguien mueve la etapa. Sin esto, el espejo del dinero que acaba de bajar
           perdería contra un `pago_pendiente: null` local por el solo hecho de que alguien
           avanzó la obra hace un rato, y la cobranza se quedaría en blanco para siempre.
           De estos campos la dueña es Notion por definición (§4.0), así que ganan. */
        const sello = Math.max(editado, Number(local.actualizado_en) || 0);

        delete aplicar.folio_global;   // la llave era para encontrarlo, no para escribirlo
        registros.push({ almacen: 'proyectos', datos: { ...aplicar, id: local.id, actualizado_en: sello } });
      }

      return { registros, cursor: r.cuerpo.cursor || null, hay_mas: !!r.cuerpo.hay_mas };
    },
  };
}

/* ----- Las dos escrituras locales del relevo -----
   Van con `DB` directo y no por `proyectos.parchar` por una razón concreta: `parchar`
   ENCOLA, y encolar desde el relevo que está vaciando la cola es un bucle que se manda a
   sí mismo para siempre. Lo que se escribe aquí son campos de los que la dueña es Notion
   —el id de la página y el estado del envío—, nunca un dato del negocio. */
async function espejarLocal(id, campos) {
  try {
    const p = await DB.obtener('proyectos', id);
    if (!p) return;
    await DB.poner('proyectos', { ...p, ...campos, actualizado_en: Date.now() });
  } catch (_) { /* la operación ya se mandó; no perder eso por no poder anotar el id */ }
}

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
