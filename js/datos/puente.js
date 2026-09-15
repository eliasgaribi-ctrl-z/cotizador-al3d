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

   ── El espejo que baja, y por qué no crea filas ────────────────────────────────
   `bajar()` NO convierte cada fila de Notion en un proyecto. La base tiene tres años y 199
   filas anteriores a la plataforma: sin partidas, sin origen y sin material. Convertirlas
   llenaría el tablero de proyectos huecos que nadie puede fabricar. Solo se espeja la fila
   que YA tiene proyecto de este lado, atada por `Folio cotizacion`.
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';

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
  fechaCom:    'Fecha Comision',         // fórmula
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
};

/** Los cuatro valores que de verdad existen en la propiedad *status* de la base. */
export const ESTATUS = ['REPARANDO', 'COBRANDO', 'FABRICACION', 'LIQUIDADO'];
/** Las cinco cuentas que de verdad existen en `Cuenta `. */
export const CUENTAS = ['Moni MPago', 'Rul HSBC', 'Tatis BNT', 'Constru BNT', 'Elias BBVA'];

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

/**
 * Un proyecto de la plataforma, en propiedades de Notion.
 *
 * NO manda: `Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante` ni
 * `Fecha Comision`, que son fórmulas y el Worker las rechazaría con su razón; ni
 * `Liquidacion`, `Abono Comision` ni `Fecha Liquidacion`, que las captura quien cobra,
 * del lado de Notion, y que la plataforma no guarda.
 *
 * @param {Object} p proyecto de §4.4
 * @param {Object|null} inst su instalación, si ya tiene fecha
 * @returns {Object} nombre de propiedad de Notion -> valor
 */
export function aNotion(p, inst) {
  if (!p || typeof p !== 'object') return {};
  const out = {};

  out[P.proyecto] = texto(p.nombre);
  out[P.subtotal] = num(p.sub);
  out[P.iva]      = p.iva !== false;
  out[P.anticipo] = num(p.anti_pactado);

  /* El folio ata la fila al cotizador, y va con el dispositivo pegado: `al3d_folio` es un
     contador local, dos teléfonos emiten COT-0042 el mismo día y no son el mismo trabajo.
     Es también la llave con la que el espejo encuentra la fila al bajar. */
  out[P.folio] = texto(p.folio_global || p.folio_local);

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
  if (esISO(p.fecha_ganado)) out[P.fecha] = p.fecha_ganado;
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
  /* Las dos fórmulas. Bajan y jamás se calculan de este lado: dos implementaciones de la
     misma fórmula divergen en semanas y el sistema empieza a dar dos respuestas. */
  if (hay(fila[P.pendiente]))   parche.pago_pendiente = num(fila[P.pendiente]);
  if (hay(fila[P.comRestante])) parche.comision_restante = num(fila[P.comRestante]);

  return parche;
}

/* ============================================================================
   EL RELEVO
   ============================================================================ */

const MS_ESPERA = 15000;

/** Un error del relevo, con el código que `sync.js` entiende. */
function falla(codigo, mensaje) { const e = new Error(mensaje); e.codigo = codigo; return e; }

/**
 * Una petición al Worker. Devuelve `{estado, cuerpo}` y NUNCA lanza por un cuerpo raro:
 * lo que lanza es la red, y con el código que la bandeja sabe interpretar.
 */
async function pedir(cfg, ruta, opciones = {}) {
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
  cuerpo.token = cfg.token;
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
  if (!cfg.url || !cfg.token) return null;

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
    nombre: 'notion',

    /** Los almacenes que este relevo sabe llevar. `sync.js` aparta el resto sin gastar red. */
    lleva(almacen) { return ALMACENES.includes(almacen); },
    motivo: motivoSinDestino,

    async salud() {
      try {
        const r = await pedir(cfg, '/salud');
        if (Array.isArray(r.cuerpo.escribibles)) escribibles = new Set(r.cuerpo.escribibles);
        /* `ok === true` y no «distinto de false»: un JSON cualquiera sin `ok` no es el puente. */
        if (r.cuerpo.ok !== true) {
          return { ok: false, mensaje: r.cuerpo.mensaje || 'Esa URL contesta, pero no como el puente: revisa que sea la del Worker.' };
        }
        return { ok: true, mensaje: 'El puente contesta y reconoce este teléfono.',
                 rol: r.cuerpo.rol || '', version: r.cuerpo.version || '',
                 escribibles: r.cuerpo.escribibles || [] };
      } catch (e) {
        return { ok: false, codigo: e.codigo || 'SIN_RED', mensaje: e.message };
      }
    },

    async esquema() {
      try {
        const r = await pedir(cfg, '/esquema');
        return { ok: r.cuerpo.ok !== false, faltan: Array.isArray(r.cuerpo.faltan) ? r.cuerpo.faltan : [],
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

      for (const op of lista) {
        if (!this.lleva(op.almacen)) {
          salida.push({ id: op.id, ok: false, codigo: 'SIN_DESTINO', mensaje: motivoSinDestino(op.almacen) });
          continue;
        }

        const proy = await proyectoVivo(op);
        if (!proy) {
          salida.push({ id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
            mensaje: 'Esa operación apunta a un proyecto que ya no está en este dispositivo.' });
          continue;
        }

        let props;
        if (op.almacen === 'proyectos') {
          props = aNotion(op.datos, await instalacionDe(proy.id));
        } else {
          props = instalacionANotion(op.datos);
        }

        const idNotion = proy.notion_page_id || null;
        const { props: enviables, fuera } = filtrar(props, permitidas);

        /* Un alta sin título crearía en la base del dinero una fila en blanco que nadie
           puede identificar después. Si este token no puede escribir `Proyecto`, el alta
           no se intenta: se dice de qué teléfono tiene que salir. */
        if (!idNotion && !enviables[P.proyecto]) {
          salida.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
            mensaje: 'Este teléfono no puede dar de alta la venta en la hoja: su token no escribe el nombre del proyecto. ' +
                     'Dala de alta desde el de Dirección y desde aquí ya podrás mover la obra.' });
          continue;
        }
        if (!Object.keys(enviables).length) {
          salida.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
            mensaje: 'De ese cambio, este teléfono no puede escribir nada en la hoja: ' + fuera.join(', ') + '.' });
          continue;
        }

        let r;
        try {
          r = await pedir(cfg, '/empujar', {
            method: 'POST',
            body: JSON.stringify({ ops: [{ id: op.id, tipo: idNotion ? 'actualizar' : 'crear',
                                           id_notion: idNotion, datos: enviables }] }),
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
        salida.push({ id: op.id, ok: false, codigo: res.codigo || 'DESCONOCIDO',
                      mensaje: res.mensaje || 'La hoja rechazó el cambio.', conflicto: res.conflicto || null });
      }

      return salida;
    },

    /**
     * Baja una página de filas y las convierte en parches de espejo. Lo que no tiene
     * proyecto de este lado se descarta a propósito: ver la cabecera del archivo.
     */
    async bajar(cursor) {
      const r = await pedir(cfg, '/jalar' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      if (r.cuerpo.ok === false) throw falla(r.cuerpo.codigo || 'SIN_RED', r.cuerpo.mensaje || 'El puente no pudo leer la hoja.');

      const filas = Array.isArray(r.cuerpo.registros) ? r.cuerpo.registros : [];
      const registros = [];

      for (const fila of filas) {
        const parche = deNotion((fila && fila.datos) || null);
        if (!parche) continue;

        const local = await porFolioGlobal(parche.folio_global);
        if (!local) continue;   // fila anterior a la plataforma: se mira y se deja donde está

        const editado = Date.parse((fila.datos && fila.datos.editado) || '') || 0;
        /* El sello se iguala al local a propósito, y esto es lo único astuto del archivo.
           `sync.fusionar` deja ganar al más nuevo, y el registro local se toca cada vez que
           alguien mueve la etapa. Sin esto, el espejo del dinero que acaba de bajar
           perdería contra un `pago_pendiente: null` local por el solo hecho de que alguien
           avanzó la obra hace un rato, y la cobranza se quedaría en blanco para siempre.
           De estos campos la dueña es Notion por definición (§4.0), así que ganan. */
        const sello = Math.max(editado, Number(local.actualizado_en) || 0);

        delete parche.folio_global;   // la llave era para encontrarlo, no para escribirlo
        registros.push({ almacen: 'proyectos', datos: { ...parche, id: local.id, actualizado_en: sello } });
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
    pasos: [
      'Abre la hoja «Finanzas AL3D — Ventas y Comisiones» en Google Sheets.',
      'Menú Extensiones → Apps Script. Ahí vive el puente: es código que corre DENTRO de la hoja, con los permisos de su dueño.',
      'Botón Implementar → Nueva implementación → Aplicación web.',
      'Ejecutar como: Yo. Es lo que le da acceso a la hoja sin pedirle nada a los teléfonos.',
      'Quién tiene acceso: Cualquier usuario. Si queda en «Solo yo», el teléfono recibe la pantalla de Google en vez de datos, y «Probar» te lo dice con esas palabras.',
      'Copia la URL que termina en /exec y pégala aquí abajo.',
      'De vuelta en la hoja: menú ⚡ AL3D → Tokens del puente. Ahí están los tres, uno por teléfono.',
      'Pega aquí abajo el que le toca a ESTE teléfono, y manda los otros dos a sus dueños por donde se mandan las llaves, no por el chat del grupo.',
      'Dale a «Probar». Tiene que contestar en verde y decirte qué rol reconoció para este teléfono.',
      'Dale a «Revisar el esquema». Si le falta alguna columna a la hoja, te la lista con su nombre y su tipo.',
    ],
    notas: [
      'Ya no hay token de Notion ni Worker de Cloudflare. El Worker existía solo para esconder un token que daba escritura total sobre todo Notion; con el dinero en la hoja no hay secreto que esconder, y el puente corre dentro de la propia hoja.',
      'La dirección del puente es pública —cualquiera puede tocar la puerta— y la puerta es el token. Sin uno válido, el puente contesta que no y nada más. Alrededor hay tres candados más: todo entra por POST con el token en el cuerpo (nunca en una URL), hay tope de 60 peticiones por minuto por token, y toda escritura queda anotada en una bitácora dentro de la hoja.',
      'El rol es del token, no de la pantalla. Cambiar el segmento de rol en Ajustes te da otro tablero, no te da permisos: el token de fabricación sigue sin poder tocar el dinero.',
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
  return (cfg && cfg.url && cfg.token) ? crear(cfg) : null;
}
