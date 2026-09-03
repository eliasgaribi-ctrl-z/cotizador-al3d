/* ============================================================================
   Las reglas: los avisos, sin tabla de programación.

   LA HONESTIDAD PRIMERO, porque si se lee al final ya se prometió algo que no es:

   A6 a A14 son REGLAS DE PANTALLA. Se evalúan cuando alguien abre la plataforma y en
   ningún otro momento. Si nadie la abre en cinco días, nadie las ve en cinco días. No hay
   cron y NO LO PUEDE HABER: una PWA estática no se despierta sola —no hay push sin un push
   service y un servidor, y el Periodic Background Sync es de Chrome y no promete nada— y un
   cron externo tampoco serviría, porque no puede crear un evento en el calendario personal
   del director sin un refresh token de servidor, que es justo lo que el token model de
   Google no da. Las que TIENEN que llegar a un teléfono son A1 a A5, y esas no viven aquí:
   son VALARM dentro del .ics que crea agenda.js, y las dispara el calendario del teléfono
   aunque esta app no se abra en un mes. Un .ics con RRULE es el cron del teléfono, y es la
   única automatización de verdad que existe sin infraestructura.

   Y EL SESGO ES EL FALSO POSITIVO, declarado y aplicado en cada regla: un aviso de más
   cuesta diez segundos de lectura; uno de menos cuesta un día de instalación. Donde el dato
   no alcanza para decidir, se avisa. «No se pudo calcular» se pinta como falta, no como
   listo.

   Dos cosas más que son de diseño y no de código:

   1. `evaluar` es PURA. Recibe todo ya leído y devuelve la lista. Sin DOM, sin IndexedDB,
      sin red y sin reloj: hasta el «hoy» entra como parámetro. Es la única forma de poder
      probar «instalación mañana con material faltante» sin cambiarle la fecha al teléfono,
      y sin eso estas nueve reglas no se prueban nunca.
   2. El `rid` es DETERMINISTA y es el dedupe. Reevaluar en cada apertura crea UN aviso, no
      diez, y dos dispositivos que descartan el mismo aviso producen uno. `dedupe_key` es la
      misma cadena a propósito: los dos nombres vienen de los dos diseños que se fusionaron,
      y tener dos llaves distintas —una para la pantalla y otra para el almacén— es cómo un
      aviso atendido reaparece al recargar.

   Dep: db, prefs, cotizador, ui (fechas y formato), stock/material/proyectos (perezosos).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import * as Cot from './cotizador.js';
import { diasEntre } from '../nucleo/fechas.js';
import { hoyISO, partesISO, fmtFecha, fmtFechaDia, fmtHora, money, cant, linkWa }
  from '../nucleo/ui.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

async function mod(archivo) { try { return await import('./' + archivo + '.js'); } catch (_) { return null; } }

/* ============================================================================
   Las nueve reglas, con su peso y su razón
   ============================================================================ */

/**
 * El catálogo. `peso` es el orden de «qué se rompe primero» hecho número, y cada uno lleva
 * escrito por qué está donde está: sin la tabla, el orden de la pantalla de Inicio sería el
 * orden en que se programaron las reglas, que no tiene nada que ver con lo que le urge a
 * nadie.
 *
 * `roles` es quién LO VE, y el primero de la lista es de quién es la acción. `alias` es el
 * nombre con R que §4.1 y §4.9 usan para las mismas reglas: el documento las nombró de dos
 * maneras y aquí se guardan las dos para que una pantalla escrita contra cualquiera de las
 * dos secciones encuentre lo que busca.
 */
export const REGLAS = {
  A6:  { id: 'A6_sin_decidir', alias: 'R1_sin_decidir', peso: 40,
         nombre: 'Cotización autorizada sin decidir',
         roles: ['direccion'],
         porque: 'Es el eslabón perdido. Sin este aviso los datos del cotizador no llegan a ningún lado, que es exactamente lo que pasa hoy.' },
  A7:  { id: 'A7_sin_fecha', alias: 'R3_sin_fecha', peso: 45,
         nombre: 'Proyecto ganado sin fecha',
         roles: ['direccion'],
         porque: 'Sin fecha no hay agenda, no hay alarmas del .ics y el mapa no puede filtrar por día.' },
  A8:  { id: 'A8_material', alias: 'R2_material', peso: 30,
         nombre: 'Falta material para una instalación',
         roles: ['fabricacion', 'direccion'],
         porque: 'Es la regla que convierte la agenda en una lista de compra.' },
  A9:  { id: 'A9_minimo', alias: 'R4_minimo', peso: 60,
         nombre: 'Material bajo mínimo',
         roles: ['fabricacion', 'direccion'],
         porque: 'El consumible que no se deriva por proyecto se repone por mínimo, como en cualquier taller.' },
  A10: { id: 'A10_paso', alias: 'R5_paso', peso: 20,
         nombre: 'Se pasó la instalación',
         roles: ['direccion'],
         porque: 'Una instalación que ya pasó y nadie marcó deja el almacén sin descontar y la cobranza sin arrancar.' },
  A11: { id: 'A11_cobro', alias: 'R7_cobro', peso: 50,
         nombre: 'Instalado con saldo',
         roles: ['pagos', 'direccion'],
         porque: 'El botón de copiar la fila para Notion ya existe y está probado en producción; lo que faltaba era acordarse de apretarlo.' },
  A12: { id: 'A12_huella', alias: 'R6_huella_cambio', peso: 25,
         nombre: 'La cotización cambió después de ganarse',
         roles: ['direccion'],
         porque: 'El material se calculó con las partidas de antes. Si cambiaron, lo que se va a fabricar ya no es lo que se cotizó.' },
  A13: { id: 'A13_constante', alias: 'R8_constante', peso: 80,
         nombre: 'Constante desviada',
         roles: ['fabricacion', 'direccion'],
         porque: 'Cinco correcciones en la misma dirección no son cinco errores: es una constante mal calibrada.' },
  A14: { id: 'A14_respaldo', alias: 'R9_respaldo', peso: 70,
         nombre: 'Sin respaldo',
         roles: ['direccion', 'fabricacion', 'pagos'],
         porque: 'Safari puede desalojar el almacenamiento de un sitio sin interacción reciente. El respaldo es la única defensa.' },
};

/* Los cortes, todos juntos y con su razón, porque son las cifras que alguien va a querer
   mover cuando la pantalla le avise de más o de menos. */
const DIAS_SIN_DECIDIR = 7;    // §9. A los 7 exactos ya avisa: «más de 7» y «7» no se distinguen
const DIAS_SIN_DECIDIR_URGE = 21;  // tres semanas: la venta ya se enfrió y hay que llamar o cerrarla
const DIAS_SIN_FECHA = 2;      // las 48 h de §9
const DIAS_SIN_FECHA_URGE = 7;
const DIAS_MATERIAL = 14;      // la ventana de la lista de compra
const DIAS_GRAVE = 3;          // el mismo −P3D de la alarma A1: con menos, ya no se compra, se mueve la fecha
const DIAS_PASADA = 2;         // §9
const DIAS_COBRO = 3;          // §9
const DIAS_RESPALDO = 9;       // §9
const MUESTRAS_CALIBRACION = 5;
const DESVIACION_CALIBRACION = 0.15;

const TONO_ORDEN = { urge: 0, av: 1, info: 2 };
/* La pantalla habla de tonos y el almacén de §4.9 habla de severidades. Es la misma cosa
   dicha dos veces en el documento; el mapeo vive aquí para que no lo invente cada pantalla. */
const SEVERIDAD = { urge: 'urgente', av: 'aviso', info: 'info' };

/* ============================================================================
   Fechas: puras, contra el `hoy` que entra
   ============================================================================ */

const esISO = x => !!partesISO(x);

/* `diasEntre` viene de `nucleo/fechas.js`. Aquí se pide siempre contra el `hoy` que ENTRA y
   no contra el reloj: `cuando()` y `diasHasta()` de ui.js miden contra el día del
   dispositivo, que es lo correcto para pintar una tarjeta y lo incorrecto para una función
   que se tiene que poder probar. */

/** Sello epoch → 'YYYY-MM-DD' LOCAL. Con `toISOString().slice(0,10)` una cotización
 *  autorizada a las siete de la noche se contaría como del día siguiente. */
function isoDeSello(ts) {
  const n = Number(ts);
  if (!isFinite(n) || n <= 0) return '';
  const d = new Date(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** «hoy», «mañana», «hace 9 días». Igual que `cuando()` de ui.js pero anclado al `hoy` que
 *  entra, que es de lo que depende que estas reglas se puedan probar. */
function frase(dias) {
  if (dias === null || dias === undefined) return '';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? 'en ' + dias + ' días' : 'hace ' + (-dias) + ' días';
}

const num = x => { const n = Number(x); return isFinite(n) ? n : 0; };

/* Las seis unidades de compra de §4.6, en singular y con su acento. `cant()` de ui.js sabe
   pluralizar, pero para uno usa la llave cruda —«1 lamina»— y el singular acentuado no está
   exportado en ningún módulo: vive como constante privada de material.js. Seis renglones
   aquí cuestan menos que importar los 63 KB de material.js en un archivo cuya única
   necesidad es escribir bien un renglón de WhatsApp. Y sí importa: «1 láminas» delata que el
   mensaje lo armó un programa, y a partir de ahí todo el texto se lee con menos confianza. */
const UC_UNO = { unidad: 'unidad', bolsa: 'bolsa', caja: 'caja',
                 lamina: 'lámina', litro: 'litro', metro: 'metro' };
const cuanto = (n, u) => (Math.abs(num(n)) === 1 ? cant(n) + ' ' + (UC_UNO[u] || u) : cant(n, u));
const ETAPAS_CERRADAS = new Set(['instalado', 'garantia', 'cancelado']);
const INST_VIVAS = new Set(['propuesta', 'confirmada', 'reagendada', 'hecha']);

/* ============================================================================
   EVALUAR — la función pura
   ============================================================================ */

/** Normaliza la entrada: cualquier cosa que falte es una lista vacía, nunca un reventón. */
function normalizar(e) {
  const E = e && typeof e === 'object' ? e : {};
  const arr = x => (Array.isArray(x) ? x.filter(Boolean) : []);
  return {
    proyectos: arr(E.proyectos),
    instalaciones: arr(E.instalaciones),
    requerimientos: arr(E.requerimientos),
    existencias: arr(E.existencias),
    faltantes: arr(E.faltantes),
    historial: arr(E.historial),
    cola: arr(E.cola),
    avisos: arr(E.avisos),
    calibracion: arr(E.calibracion),
    dias_sin_respaldo: E.dias_sin_respaldo === null || E.dias_sin_respaldo === undefined
      ? null : num(E.dias_sin_respaldo),
    hoy: esISO(E.hoy) ? E.hoy : hoyISO(),
    rol: E.rol || null,
    veDinero: E.veDinero === undefined ? E.rol !== 'fabricacion' : !!E.veDinero,
    dispositivo: E.dispositivo || '',
  };
}

/**
 * Evalúa las nueve reglas de pantalla. PURA.
 *
 * @param {{proyectos?:Object[], instalaciones?:Object[], requerimientos?:Object[],
 *          existencias?:Object[], faltantes?:Object[], historial?:Object[], cola?:Object[],
 *          avisos?:Object[], calibracion?:Object[], dias_sin_respaldo?:number|null,
 *          hoy?:string, rol?:string, dispositivo?:string}} estado
 * @returns {Object[]} avisos ordenados por lo que se rompe primero, filtrados por rol y sin
 *                     los que alguien ya atendió, descartó o postergó
 */
export function evaluar(estado) {
  const E = normalizar(estado);
  const out = [];
  a6(E, out); a7(E, out); a8(E, out); a9(E, out); a10(E, out);
  a11(E, out); a12(E, out); a13(E, out); a14(E, out);
  return ordenar(vigentes(out, E));
}

/** El aviso, con los campos de la pantalla y los de §4.9 en el mismo objeto: así
 *  `refrescar` persiste sin inventar nada y la pantalla pinta sin traducir nada. */
function aviso(clave, sufijo, campos) {
  const R = REGLAS[clave];
  const rid = R.id + (sufijo ? ':' + sufijo : '');
  const tono = campos.tono || 'av';
  return {
    rid,
    dedupe_key: rid,
    regla: R.id,
    tono,
    titulo: campos.titulo || R.nombre,
    detalle: campos.detalle || '',
    cuando: campos.cuando || '',
    roles: campos.roles || R.roles,
    acciones: campos.acciones || [],
    /* `plazo` son los días que faltan para que truene; se usa para desempatar dentro del
       mismo peso y para que la pantalla pueda pintar el chip de «mañana». */
    plazo: campos.plazo === undefined ? 0 : campos.plazo,
    peso: R.peso,
    entidad: campos.entidad || '',
    entidad_id: campos.entidad_id || '',
    severidad: SEVERIDAD[tono] || 'aviso',
    vence: campos.vence || '',
    estado: 'pendiente',
  };
}

/* Lo que la persona ya decidió no se vuelve a preguntar. Un aviso que reaparece después de
   que le dijiste que no es un aviso que se aprende a ignorar, y ahí se pierde también el
   que sí importaba. */
function vigentes(lista, E) {
  const guardados = new Map(E.avisos.map(a => [a.rid, a]));
  return lista.filter(a => {
    if (E.rol && !a.roles.includes(E.rol)) return false;
    const g = guardados.get(a.rid);
    if (!g) return true;
    if (g.estado === 'atendido' || g.estado === 'descartado') return false;
    if (g.estado === 'postergado' && esISO(g.postergado_hasta) && g.postergado_hasta > E.hoy) return false;
    return true;
  });
}

/* Primero el tono, luego el peso de la tabla, luego lo que truena antes. El `rid` al final
   para que dos avisos empatados salgan siempre en el mismo orden: una lista que se
   reordena sola entre dos aperturas parece una lista que cambió. */
function ordenar(lista) {
  return lista.sort((a, b) =>
    (TONO_ORDEN[a.tono] - TONO_ORDEN[b.tono]) ||
    (a.peso - b.peso) ||
    (num(a.plazo) - num(b.plazo)) ||
    String(a.rid).localeCompare(String(b.rid)));
}

/* ============================================================================
   A6 — EL ESLABÓN PERDIDO, HECHO VISIBLE
   ============================================================================ */

/**
 * Cotización autorizada hace más de 7 días de la que nadie dijo si se ganó o no.
 *
 * Esta es LA regla. El evento «esta cotización se vendió» no existe hoy en ningún sistema:
 * `copiarFilaVenta()` arma la fila de 15 columnas, la manda al portapapeles y no persiste
 * nada, así que la única huella de una venta es lo que alguien haya pegado a mano en Notion.
 * Por eso `Tipo de proyecto` quedó en 0 de 142 filas y por eso los datos del cotizador
 * —partidas, medidas, materiales, el precio firmado— nunca llegan a la operación.
 *
 * El cruce es local y no cuesta nada: el historial de cotizaciones autorizadas contra la
 * AUSENCIA de un proyecto con ese folio. Y los descartados cuentan como decididos: para
 * eso existe `Proyectos.descartar`, para que «No se dio» deje constancia y esta regla no
 * resucite la pregunta cada vez que alguien abre la app.
 *
 * Se compara por folio visible y no por `folio_global`. El historial que se lee es el de
 * ESTE dispositivo, así que el folio ya es único aquí; y si un respaldo trajo un proyecto de
 * otro teléfono con el mismo número, el peor caso es un aviso de más, que es el lado del
 * que este sistema se equivoca a propósito.
 */
function a6(E, out) {
  const decididos = new Set();
  for (const p of E.proyectos) {
    if (p.folio_local) decididos.add(String(p.folio_local));
    if (p.folio_global) decididos.add(Cot.folioVisible(p.folio_global));
  }

  for (const e of E.historial) {
    const folio = String(e.folio || '').trim();
    if (!folio || decididos.has(folio)) continue;
    /* Un borrador no es una cotización autorizada: todavía no tiene precio bueno y no hay
       nada que decidir. */
    if (e.estado && e.estado !== 'autorizada') continue;

    const dia = isoDeSello(e.ts);
    const dias = dia ? diasEntre(dia, E.hoy) : null;
    if (dias === null || dias < DIAS_SIN_DECIDIR) continue;

    const total = Cot.totalVendido(e);
    const quien = [e.cliente, e.proy].filter(Boolean).join(' — ') || 'sin cliente';
    const prop = Cot.propuestaDe(folio);
    const diaProp = prop ? isoDeSello(prop.primera) : null;
    const diasProp = diaProp ? diasEntre(diaProp, E.hoy) : null;

    out.push(aviso('A6', folio, {
      tono: dias >= DIAS_SIN_DECIDIR_URGE ? 'urge' : 'av',
      titulo: folio + ' se autorizó ' + frase(-dias) + ' y nadie dijo si se ganó',
      /* Si ya se le hizo la propuesta, se dice: no es lo mismo «lleva nueve días
         autorizada» que «lleva nueve días autorizada y siete desde que le mandaste el
         documento». La segunda ya es una llamada al cliente, no una decisión pendiente. */
      detalle: quien + (E.veDinero && total > 0 ? ' · ' + money(total) : '') +
        (prop ? '. Le mandaste propuesta ' + frase(-diasProp) : '') +
        '. Si se ganó, se convierte en proyecto con su material y su fecha; si no, queda la constancia y no se vuelve a preguntar.',
      cuando: frase(-dias),
      plazo: -dias,          // lo más viejo primero: llevan más tiempo sin decidirse
      entidad: 'cotizacion', entidad_id: folio,
      acciones: [
        { label: 'Se ganó', tipo: 'ganar', datos: { folio } },
        { label: 'No se dio', tipo: 'descartar', datos: { folio } },
      ],
    }));
  }
}

/* ============================================================================
   A7 — ganado sin fecha
   ============================================================================ */

function a7(E, out) {
  const conFecha = new Set();
  for (const i of E.instalaciones) {
    if (i.fecha && INST_VIVAS.has(i.estado)) conFecha.add(i.proyecto_id);
  }
  for (const p of E.proyectos) {
    if (!p.id || ETAPAS_CERRADAS.has(p.etapa)) continue;
    if (conFecha.has(p.id)) continue;
    const dias = diasEntre(p.fecha_ganado, E.hoy);
    if (dias === null || dias < DIAS_SIN_FECHA) continue;

    out.push(aviso('A7', p.id, {
      tono: dias >= DIAS_SIN_FECHA_URGE ? 'urge' : 'av',
      titulo: (p.nombre || p.folio_local || 'Proyecto') + ' se ganó ' + frase(-dias) + ' y sigue sin fecha',
      detalle: 'Sin fecha no hay alarmas en el teléfono, la lista de compra no sabe para cuándo y el mapa no lo puede filtrar. La hora se puede dejar en blanco.',
      cuando: frase(-dias),
      plazo: -dias,
      entidad: 'proyecto', entidad_id: p.id,
      acciones: [{ label: 'Poner fecha', tipo: 'agendar', datos: { proyecto_id: p.id } }],
    }));
  }
}

/* ============================================================================
   A8 — falta material para una instalación
   ============================================================================ */

/**
 * Lo que convierte la agenda en una lista de compra: por cada instalación de los próximos
 * catorce días, qué material de esos proyectos sale con faltante en la lista agregada.
 *
 * `faltantes` son las filas de `Stock.listaCompra`, que AGREGA TODOS los proyectos antes de
 * redondear. Eso significa que un proyecto puede salir nombrado aquí porque, sumado con los
 * demás, ya no alcanza la lámina: es la respuesta correcta —la lámina es una sola— y es
 * también el lado del falso positivo.
 */
function a8(E, out) {
  const conReq = new Set();
  for (const r of E.requerimientos) {
    if (r.proyecto_id && r.estado !== 'descartado') conReq.add(r.proyecto_id);
  }

  /* Faltante por proyecto. `comprar > 0` es lo que hay que ir a comprar; `requiere_dato` con
     0 no es «no falta nada», es «no sé», y eso también se avisa. */
  const porProyecto = new Map();
  for (const f of E.faltantes) {
    const falta = num(f.comprar) > 0 || f.confianza === 'requiere_dato';
    if (!falta) continue;
    for (const p of (f.proyectos || [])) {
      if (!p || !p.id) continue;
      if (!porProyecto.has(p.id)) porProyecto.set(p.id, []);
      porProyecto.get(p.id).push(f);
    }
  }

  const proys = new Map(E.proyectos.map(p => [p.id, p]));

  for (const i of E.instalaciones) {
    if (!i.fecha || !INST_VIVAS.has(i.estado) || i.estado === 'hecha') continue;
    const dias = diasEntre(E.hoy, i.fecha);
    if (dias === null || dias < 0 || dias > DIAS_MATERIAL) continue;

    const p = proys.get(i.proyecto_id);
    if (!p || ETAPAS_CERRADAS.has(p.etapa)) continue;
    const nombre = p.nombre || p.folio_local || 'Proyecto';
    const grave = dias <= DIAS_GRAVE;
    const base = {
      cuando: frase(dias), plazo: dias,
      entidad: 'proyecto', entidad_id: p.id, vence: i.fecha,
    };

    /* Material nunca calculado: es falta, no es «ya está». La cara verde de un proyecto sin
       requerimiento y la de uno cubierto son idénticas si se confunden, y la diferencia se
       descubre a las siete de la mañana con la camioneta cargada a medias. */
    if (!conReq.has(p.id)) {
      out.push(aviso('A8', p.id + ':' + i.fecha, {
        ...base,
        tono: grave ? 'urge' : 'av',
        titulo: nombre + ' se instala ' + frase(dias) + ' y no tiene material calculado',
        detalle: 'Ábrelo y dale «recalcular material». Mientras no esté calculado, la lista de compra no lo incluye.',
        acciones: [{ label: 'Recalcular material', tipo: 'recalcular', datos: { proyecto_id: p.id } }],
      }));
      continue;
    }

    const faltan = porProyecto.get(p.id) || [];
    if (!faltan.length) continue;

    const lista = faltan.map(f => (num(f.comprar) > 0
      ? cuanto(f.comprar, f.unidad_compra) + ' de ' + f.nombre
      : f.nombre + ' (falta un dato para saber cuánto)')).join(', ');

    out.push(aviso('A8', p.id + ':' + i.fecha, {
      ...base,
      tono: grave ? 'urge' : 'av',
      titulo: 'Falta material y ' + nombre + ' se instala ' + frase(dias),
      detalle: lista + '.' + (grave ? ' Con tres días o menos ya no se compra a tiempo: o se consigue hoy, o se mueve la fecha.' : ''),
      acciones: [
        { label: 'Ver lista de compra', tipo: 'ir', datos: { ruta: 'material' } },
        { label: 'Pedir por WhatsApp', tipo: 'wa',
          datos: { clase: 'pedir_material', faltantes: faltan, fecha: i.fecha,
                   tel: (faltan[0] && faltan[0].tel_proveedor) || '',
                   proveedor: (faltan[0] && faltan[0].proveedor) || '' } },
      ],
    }));
  }
}

/* ============================================================================
   A9 — bajo mínimo
   ============================================================================ */

/* `min_stock:0` significa «no avises» y es el default de las diecinueve filas de la
   semilla: nadie tiene que llenar ese campo para que la plataforma sirva. Quien lo llene
   recibe este aviso con el WhatsApp del proveedor ya armado, y quien no, no lo ve nunca. */
function a9(E, out) {
  for (const x of E.existencias) {
    const min = num(x.min_stock);
    if (min <= 0) continue;
    const hay = num(x.cantidad);
    if (hay >= min) continue;

    const id = x.material_id || x.id;
    if (!id) continue;

    out.push(aviso('A9', String(id), {
      tono: 'av',
      titulo: (x.nombre || id) + ' está bajo mínimo',
      /* «Quedan -1.47 unidades» es aritméticamente correcto y se lee como un error del
         programa. Si el libro está bajo cero, lo que hay que decir es que no hay nada y que
         el libro está incompleto, no un número negativo. */
      detalle: (hay > 0
        ? 'Quedan ' + cuanto(hay, x.unidad_compra) + ' y el mínimo es ' + min + '.'
        : 'No queda nada' + (hay < 0 ? ' (y el libro va ' + cuanto(-hay, x.unidad_compra) + ' abajo)' : '') +
          ' y el mínimo es ' + min + '.') +
        (x.derivado ? ' Y nunca se ha contado, así que puede ser peor.' : ''),
      cuando: x.sello || '',
      plazo: 0,
      entidad: 'material', entidad_id: String(id),
      acciones: x.tel_proveedor
        ? [{ label: 'Pedirle a ' + (x.proveedor || 'el proveedor'), tipo: 'wa',
             datos: { clase: 'pedir_material', tel: x.tel_proveedor, proveedor: x.proveedor || '',
                      faltantes: [{ nombre: x.nombre, comprar: Math.max(min - hay, num(x.min_compra) || 1),
                                    unidad_compra: x.unidad_compra }] } }]
        : [{ label: 'Ver almacén', tipo: 'ir', datos: { ruta: 'material' } }],
    }));
  }
}

/* ============================================================================
   A10 — se pasó la instalación
   ============================================================================ */

function a10(E, out) {
  const proys = new Map(E.proyectos.map(p => [p.id, p]));
  for (const i of E.instalaciones) {
    if (!i.fecha || i.estado === 'cancelada' || i.estado === 'hecha') continue;
    const dias = diasEntre(i.fecha, E.hoy);
    if (dias === null || dias < DIAS_PASADA) continue;
    const p = proys.get(i.proyecto_id);
    if (!p || p.etapa === 'instalado' || p.etapa === 'cancelado' || p.etapa === 'garantia') continue;

    out.push(aviso('A10', i.id, {
      tono: 'av',
      titulo: (p.nombre || 'Una instalación') + ' era ' + fmtFecha(i.fecha) + ' y sigue sin marcarse',
      detalle: 'Si ya se instaló, márcalo: de ahí arranca la cobranza. Si no se pudo, muévela para que la agenda diga la verdad.',
      cuando: frase(-dias),
      plazo: -dias,
      entidad: 'instalacion', entidad_id: i.id,
      acciones: [
        { label: 'Ya se instaló', tipo: 'marcar_hecha', datos: { inst_id: i.id, proyecto_id: p.id } },
        { label: 'Mover fecha', tipo: 'reagendar', datos: { inst_id: i.id } },
      ],
    }));
  }
}

/* ============================================================================
   A11 — instalado con saldo
   ============================================================================ */

/* `pago_pendiente` es una FÓRMULA DE NOTION. Se lee y no se calcula: dos versiones de la
   misma fórmula empiezan a dar dos respuestas y la que no es la de Notion es la que está
   mal, porque es la que nadie cobra. */
function a11(E, out) {
  const ultima = new Map();
  for (const i of E.instalaciones) {
    if (!i.fecha || i.estado === 'cancelada') continue;
    const prev = ultima.get(i.proyecto_id);
    if (!prev || i.fecha > prev) ultima.set(i.proyecto_id, i.fecha);
  }

  for (const p of E.proyectos) {
    if (p.etapa !== 'instalado') continue;
    const saldo = num(p.pago_pendiente);
    if (saldo <= 0) continue;
    const fecha = ultima.get(p.id) || p.fecha_ganado;
    const dias = diasEntre(fecha, E.hoy);
    if (dias === null || dias < DIAS_COBRO) continue;

    out.push(aviso('A11', p.id, {
      tono: 'av',
      titulo: (p.nombre || p.folio_local || 'Proyecto') + ' se instaló ' + frase(-dias) + ' y tiene saldo',
      detalle: (E.veDinero ? 'Quedan ' + money(saldo) + ' por cobrar. ' : '') +
        'Copia la fila para Notion con Estatus COBRANDO y mándale el mensaje.',
      cuando: frase(-dias),
      plazo: -dias,
      entidad: 'proyecto', entidad_id: p.id,
      acciones: [
        { label: 'Copiar fila para Notion', tipo: 'tsv', datos: { proyecto_id: p.id, estatus: 'COBRANDO' } },
        { label: 'Cobrar por WhatsApp', tipo: 'wa',
          datos: { clase: 'cobrar', tel: p.tel, contacto: p.contacto, negocio: p.negocio,
                   pago_pendiente: saldo } },
      ],
    }));
  }
}

/* ============================================================================
   A12 — la huella cambió
   ============================================================================ */

/* Verificado: `guardarEnHistorial` hace `arr[idx]=entry` al reautorizar, al editar y al
   ocultar una partida del PDF, y sobrescribe el `ts`. Por eso el proyecto guarda una COPIA
   congelada y no una referencia; y por eso hace falta este aviso, que es lo único que
   conecta las dos versiones.
   Si la entrada DESAPARECIÓ del historial no se avisa: el proyecto sigue completo —para eso
   se congeló— y no hay nada que la persona pueda hacer al respecto. Un aviso sin acción es
   ruido. */
function a12(E, out) {
  if (!E.historial.length) return;
  const hoyPorFolio = new Map();
  for (const e of E.historial) if (e.folio) hoyPorFolio.set(String(e.folio), e);

  for (const p of E.proyectos) {
    if (!p.origen || ETAPAS_CERRADAS.has(p.etapa)) continue;
    const folio = String(p.origen.folio || p.folio_local || '');
    const entrada = hoyPorFolio.get(folio);
    if (!entrada) continue;
    const antes = p.origen.huellaAuth || Cot.huellaDe(p.origen);
    if (!antes) continue;
    if (antes === Cot.huellaDe(entrada)) continue;

    out.push(aviso('A12', p.id, {
      tono: 'av',
      titulo: folio + ' se editó después de ganarse',
      detalle: 'El material calculado ya no corresponde a lo que dice la cotización de hoy. Recalcular reemplaza la copia congelada y vuelve a derivar el material; dejarlo así conserva lo que se firmó.',
      cuando: '',
      plazo: 0,
      entidad: 'proyecto', entidad_id: p.id,
      acciones: [
        { label: 'Recalcular material', tipo: 'resincronizar', datos: { proyecto_id: p.id } },
        { label: 'Dejar como está', tipo: 'descartar_aviso', datos: { proyecto_id: p.id } },
      ],
    }));
  }
}

/* ============================================================================
   A13 — constante desviada
   ============================================================================ */

/* El bucle de §6.7: cada corrección de fabricación alimenta la calibración, así que el
   trabajo de corregir ARREGLA el sistema en vez de solo parchear un proyecto. Cinco
   muestras es el mínimo para no perseguir un caso raro; 15 % es la desviación a partir de la
   cual la constante ya está costando material. */
function a13(E, out) {
  for (const c of E.calibracion) {
    if (num(c.muestras) < MUESTRAS_CALIBRACION) continue;
    const razon = num(c.razon);
    if (!razon || Math.abs(razon - 1) < DESVIACION_CALIBRACION) continue;
    const clave = c.constante_sugerida || c.familia;
    if (!clave) continue;
    const pct = Math.round((razon - 1) * 100);

    out.push(aviso('A13', String(clave), {
      tono: 'info',
      titulo: (c.constante_sugerida || ('El cálculo de ' + c.familia)) +
        ' se está quedando ' + (pct > 0 ? 'corto' : 'largo') + ' ' + Math.abs(pct) + '%',
      detalle: c.muestras + ' correcciones dicen lo mismo. Valor actual ' + c.valor_actual +
        ', sugerido ' + c.valor_sugerido + '. Cambiarlo mejora todos los cálculos que siguen.',
      cuando: '',
      plazo: 0,
      entidad: 'constante', entidad_id: String(clave),
      acciones: [{ label: 'Actualizar la constante', tipo: 'constante',
                   datos: { clave: c.constante_sugerida || '', valor: c.valor_sugerido } }],
    }));
  }
}

/* ============================================================================
   A14 — sin respaldo
   ============================================================================ */

/* El `rid` lleva el día a propósito. Si no lo llevara, «después» sería «nunca»: quien
   descarte el aviso una vez no lo volvería a ver aunque pasen tres semanas más sin
   respaldar. Con el día, descartarlo lo calla hoy y vuelve mañana si sigue faltando. */
function a14(E, out) {
  const d = E.dias_sin_respaldo;
  if (d === null || d < DIAS_RESPALDO) return;
  out.push(aviso('A14', E.hoy, {
    tono: 'av',
    titulo: d >= 9000 ? 'Nunca has respaldado la plataforma' : 'Llevas ' + d + ' días sin respaldar',
    detalle: 'El respaldo de la plataforma es un archivo aparte del de las cotizaciones. Si el teléfono borra los datos del sitio, esto es lo único que los trae de vuelta.',
    cuando: '',
    plazo: 0,
    entidad: 'dispositivo', entidad_id: 'respaldo',
    acciones: [{ label: 'Respaldar ahora', tipo: 'respaldar', datos: {} }],
  }));
}

/* ============================================================================
   REFRESCAR — lo único de este archivo que toca la base
   ============================================================================ */

/**
 * Lee todo, evalúa y persiste lo nuevo. Devuelve los avisos vigentes del rol de este
 * dispositivo.
 *
 * De paso corre la degradación de §10: a un día de la instalación, si nadie marcó el corte,
 * las salidas de material se emiten como `derivado` y el almacén lo dice en su sello. Va
 * aquí porque es lo que corre «al abrir», que es el único momento que existe sin servidor.
 *
 * NUNCA lanza: si algo falla devuelve lo que alcanzó a calcular, o [].
 */
export async function refrescar(opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  try {
    const P = await mod('proyectos');
    if (P && typeof P.emitirSalidasDerivadas === 'function') {
      try { await P.emitirSalidasDerivadas(hoy); } catch (_) {}
    }

    const [proyectos, instalaciones, requerimientos, guardados] = await Promise.all([
      DB.listar('proyectos'), DB.listar('instalaciones'),
      DB.listar('requerimientos'), DB.listar('avisos'),
    ]);

    const S = await mod('stock');
    const existencias = S && S.existencias ? await S.existencias().catch(() => []) : [];
    const faltantes = S && S.listaCompra
      ? await S.listaCompra({ hastaDias: DIAS_MATERIAL }).catch(() => []) : [];
    const M = await mod('material');
    const calibracion = M && M.calibracion ? await M.calibracion().catch(() => []) : [];

    const lista = evaluar({
      proyectos, instalaciones, requerimientos, existencias, faltantes,
      historial: Cot.historial(), cola: Cot.cola(),
      avisos: guardados, calibracion,
      /* `diasSinRespaldo()` devuelve null cuando NUNCA se respaldó, y ahí hay que decidir:
         un dispositivo recién instalado y uno con tres meses de trabajo sin respaldo se ven
         igual desde esa función. Se avisa solo si ya hay algo que perder. Regañar a alguien
         el día que abre la app por primera vez es cómo se enseña a ignorar los avisos. */
      dias_sin_respaldo: Prefs.diasSinRespaldo() === null
        ? (proyectos.length ? 9999 : null) : Prefs.diasSinRespaldo(),
      hoy, rol: Prefs.rol(), veDinero: Prefs.veDinero(),
      dispositivo: Prefs.dispositivo(),
    });

    await persistir(lista, guardados);
    return lista;
  } catch (_) {
    return [];
  }
}

/* Se guarda el aviso para que `atender` y `postergar` tengan dónde escribir la decisión, y
   NO se encola en sync: un aviso se recalcula solo en cada dispositivo con los datos que
   ese dispositivo ya tiene, así que mandarlo por el puente sería mandar una conclusión en
   vez de un hecho. Lo que sí viaja es que alguien lo atendió, porque eso no se puede
   recalcular. Ver `atender`. */
async function persistir(lista, guardados) {
  const previos = new Map((guardados || []).map(a => [a.rid, a]));
  const nuevos = [];
  for (const a of lista) {
    const g = previos.get(a.rid);
    if (g && g.titulo === a.titulo && g.severidad === a.severidad) continue;
    nuevos.push({
      rid: a.rid, regla: a.regla,
      entidad: a.entidad, entidad_id: a.entidad_id,
      rol: a.roles[0] || '',
      titulo: a.titulo, cuerpo: a.detalle,
      severidad: a.severidad,
      vence: a.vence || '',
      estado: g ? g.estado : 'pendiente',
      postergado_hasta: g ? (g.postergado_hasta || null) : null,
      gcal_event_id: g ? (g.gcal_event_id || null) : null,
      visto_en: g ? num(g.visto_en) : 0,
      resuelto_en: g ? num(g.resuelto_en) : 0,
      sync: 0,
    });
  }
  if (nuevos.length) await DB.ponerVarios('avisos', nuevos);
}

/* ============================================================================
   ATENDER y POSTERGAR
   ============================================================================ */

async function decidir(rid, parche, msgFalta) {
  const id = String(rid || '').trim();
  if (!id) return mal('DATO_INVALIDO', msgFalta);
  if (!DB.estado().ok) return mal('DB_NO_DISPONIBLE', DB.motivoTexto());

  /* Si el aviso todavía no está guardado se crea con lo que se sabe. La decisión de una
     persona no se puede perder porque el renglón que la iba a guardar no existía: sin esto,
     atender un aviso recién calculado no lo callaría y volvería a aparecer al recargar. */
  const previo = await DB.obtener('avisos', id);
  const fila = {
    ...(previo || { rid: id, regla: id.split(':')[0], entidad: '', entidad_id: '',
                    rol: '', titulo: '', cuerpo: '', severidad: 'aviso', vence: '',
                    postergado_hasta: null, gcal_event_id: null, visto_en: 0, resuelto_en: 0 }),
    ...parche,
    sync: 0,
  };
  const r = await DB.poner('avisos', fila);
  if (!r.ok) return r;

  const S = await mod('sync');
  if (S && typeof S.encolar === 'function') {
    try {
      await S.encolar({ id: DB.nuevoId('op'), tipo: 'actualizar', almacen: 'avisos',
        registro_id: fila.rid, datos: r.valor, esperado: null,
        ts: Date.now(), intentos: 0, ultimo_error: '' });
    } catch (_) { /* ya está escrito aquí; la bandeja se recupera al bombear */ }
  }
  return ok(r.valor);
}

/** «Ya lo hice». El aviso no vuelve, salvo que la regla lo vuelva a producir con otro rid. */
export async function atender(rid) {
  return await decidir(rid, { estado: 'atendido', resuelto_en: Date.now() },
    'Falta decir qué aviso se atendió.');
}

/** «No hoy». Vuelve solo el día que se pidió. */
export async function postergar(rid, hasta) {
  if (!esISO(hasta)) {
    return mal('DATO_INVALIDO', 'Di para qué día lo dejamos, como año-mes-día.');
  }
  return await decidir(rid, { estado: 'postergado', postergado_hasta: hasta },
    'Falta decir qué aviso se posterga.');
}

/** «Ya lo vi y no quiero verlo otra vez». */
export async function descartar(rid) {
  return await decidir(rid, { estado: 'descartado', resuelto_en: Date.now() },
    'Falta decir qué aviso se descarta.');
}

/* ============================================================================
   LOS CUATRO MENSAJES DE WHATSAPP
   ============================================================================ */

/* `wa.me` es un `<a>`: cero infraestructura, funciona en los tres teléfonos y no necesita
   que nadie tenga cuenta de nada. Solo lleva TEXTO —no adjunta archivos—, así que el .ics y
   el respaldo van por `navigator.share({files})` y no por aquí.

   El mensaje del INSTALADOR es el que más importa y es el que está más completo: el
   instalador NO tiene acceso a la app por decisión del director, así que este texto ES su
   interfaz. Si le falta la dirección, el link del mapa, la hora o a quién buscar, alguien
   va a tener que contestar el teléfono a las ocho de la mañana. Y no lleva NI UN PESO: el
   precio no es asunto de quien instala. */

const saludo = n => (n ? 'Hola, ' + String(n).trim().split(/\s+/)[0] + '. ' : 'Buen día. ');

const cuandoTexto = (fecha, hora) =>
  fmtFechaDia(fecha) + (hora ? ' a las ' + fmtHora(hora) : ', en el transcurso del día');

function lineasFaltantes(faltantes) {
  return (Array.isArray(faltantes) ? faltantes : []).map(f => {
    const c = num(f.comprar);
    return '• ' + (c > 0 ? cuanto(c, f.unidad_compra) + ' de ' : '') + (f.nombre || f.material_id || '');
  }).join('\n');
}

/**
 * @param {'confirmar_cliente'|'orden_instalador'|'pedir_material'|'comparte_dia'|'cobrar'} clase
 * @param {Object} datos
 * @returns {{texto:string, url:string}} `url` vacía si no hay teléfono: el texto sirve igual
 *          porque se copia y se pega, y devolver null obligaría a la pantalla a decidir dos
 *          veces qué hacer con el mismo mensaje.
 */
export function mensajeWa(clase, datos = {}) {
  const d = datos && typeof datos === 'object' ? datos : {};
  const p = d.proyecto && typeof d.proyecto === 'object' ? d.proyecto : d;
  const i = d.instalacion && typeof d.instalacion === 'object' ? d.instalacion : d;
  let texto = '';

  if (clase === 'confirmar_cliente') {
    texto = saludo(d.contacto || p.contacto) +
      'Le confirmo la instalación de ' + (d.negocio || p.negocio || 'su anuncio') +
      ' el ' + cuandoTexto(i.fecha || d.fecha, i.hora || d.hora) + '.\n' +
      'Llegamos con todo listo del taller. ¿Nos confirma que va a haber acceso y quién nos recibe?\n' +
      '— AL3D';

  } else if (clase === 'orden_instalador') {
    const L = ['ORDEN DE TRABAJO — ' + fmtFechaDia(i.fecha || d.fecha)];
    L.push('Hora: ' + (i.hora ? fmtHora(i.hora) : 'sin definir todavía, te confirmo temprano'));
    if (i.ventana && i.ventana !== 'dia') L.push('Es instalación de ' + (i.ventana === 'noche' ? 'noche' : 'madrugada') + '.');
    L.push('');
    L.push('Negocio: ' + (p.negocio || p.nombre || 'sin nombre'));
    L.push('Buscar a: ' + (p.contacto || 'quien esté encargado') + (p.tel ? ' · ' + p.tel : ''));
    if (p.dir_texto) L.push('Dirección: ' + String(p.dir_texto).replace(/\s*\n\s*/g, ', '));
    if (p.entrecalles) L.push('Entre calles: ' + p.entrecalles);
    if (p.maps_url) L.push('Mapa: ' + p.maps_url);
    L.push('');
    L.push('Qué se instala:');
    const items = (p.origen && Array.isArray(p.origen.items)) ? p.origen.items : [];
    if (items.length) {
      for (const it of items.slice(0, 8)) L.push('• ' + Cot.descPartida(it));
      if (items.length > 8) L.push('• y ' + (items.length - 8) + ' más');
    } else if (Array.isArray(p.tipo_trabajo) && p.tipo_trabajo.length) {
      for (const t of p.tipo_trabajo) L.push('• ' + t);
    } else {
      L.push('• (ver conmigo antes de salir)');
    }
    const dur = num(i.duracion_min);
    if (dur > 0) L.push('', 'Tiempo estimado: ' + (dur >= 60 ? Math.round(dur / 60 * 10) / 10 + ' h' : dur + ' min'));
    if (i.notas) L.push('Notas: ' + i.notas);
    L.push('', 'Cualquier cosa me marcas.');
    texto = L.join('\n');

  } else if (clase === 'pedir_material') {
    const lista = lineasFaltantes(d.faltantes);
    const dias = d.fecha ? diasEntre(hoyISO(), d.fecha) : null;
    texto = saludo(d.proveedor) + '¿Tiene disponible esto?\n' +
      (lista || '• (ver lista)') + '\n' +
      (d.fecha ? 'Lo necesito para el ' + fmtFecha(d.fecha) +
        (dias !== null ? ' (' + frase(dias) + ')' : '') + '.\n' : '') +
      '¿Me confirma precio y si lo tiene en existencia?';

  } else if (clase === 'comparte_dia') {
    const insts = Array.isArray(d.instalaciones) ? d.instalaciones : [];
    const L = [saludo(d.nombre) + '¿Me compartes cómo va el día? Qué quedó listo y qué falta.'];
    if (insts.length) {
      L.push('', 'Lo de hoy:');
      for (const x of insts) {
        L.push('• ' + (x.titulo || x.nombre || 'Instalación') +
          (x.hora ? ' — ' + fmtHora(x.hora) : ' — sin hora'));
      }
    }
    if (d.pendiente) L.push('', 'Pendiente: ' + d.pendiente);
    texto = L.join('\n');

  } else if (clase === 'cobrar') {
    /* El saldo viene de la fórmula de Notion y se pega tal cual. Aquí no se resta nada. */
    const saldo = num(d.pago_pendiente !== undefined ? d.pago_pendiente : p.pago_pendiente);
    texto = saludo(d.contacto || p.contacto) +
      'Le comparto el saldo de ' + (d.negocio || p.negocio || 'su trabajo') + ': ' +
      money(saldo) + '.\n' +
      '¿Le mando los datos de la cuenta o prefiere efectivo?\n— AL3D';
  }

  if (!texto) return { texto: '', url: '' };
  const tel = d.tel || p.tel || '';
  return { texto, url: tel ? linkWa(tel, texto) : '' };
}
