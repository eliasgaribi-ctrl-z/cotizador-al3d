/* ============================================================================
   EL RELEVO DE LA BASE — con la empresa en modo 'base', la bandeja manda a Supabase y no a la hoja.

   Paso 2 de «la base manda» (docs/BASE-MANDA.md). Hasta aquí la hoja era la fuente: la bandeja
   (js/datos/sync.js) subía cada cambio por el puente (js/datos/puente.js, /empujar) y bajaba con
   /jalar; Supabase recibía una copia cada 3 horas y, en el aparato de Dirección, otra por la sombra.
   Con la empresa en modo 'base' (`empresas.modo`, 0024_modo.sql) la fuente es la base, y éste es el
   relevo que `sync` enchufa EN LUGAR del de la hoja, con su misma interfaz (la de la cabecera de
   sync.js; pruebas/supabase-relevo.mjs la compara miembro por miembro):

     · subir(ops): cada operación se traduce con el traductor de la sombra (js/datos/supa-traductor.js:
       una sola copia de cómo se le habla a la base) y su respuesta vuelve en el vocabulario que la
       bandeja ya sabe leer: ok; `definitivo` (se aparta con su razón y no traba a las de atrás); o un
       código que para el bombeo —`SIN_RED`, `ROL_SIN_PERMISO` sin `definitivo` (la sesión, el acceso),
       `DESCONOCIDO`— y la operación se queda, en su lugar, para la siguiente vuelta.
     · bajar(cursor): las filas armadas desde la base (`crearFuente` de js/datos/supa-vivo.js) pasan por
       las MISMAS reglas que las de la hoja —el récord de Control, el espejo del dinero, la regla de los
       sellos, la cita, la revisión— porque las procesa el relevo de la hoja con la base como su fuente
       de lectura (`Puente.fuenteDeLectura`), que es como ya leía la lectura en vivo. Nunca /jalar.
     · lo que no es de la bandeja —las carpetas de Drive y los links cortos de Maps— sigue en el Apps
       Script (docs/BASE-MANDA.md, «Lo que decide Elías», 2), que desde puente-sheets-16 deja pasar la
       sesión de la base a esos caminos: el teléfono no necesita además el permiso de Google de la hoja.

   UNA VENTA NUEVA. `ganar_proyecto` le da su V-### del contador de la base, y vuelve al teléfono como
   volvía el de la hoja: en `remoto.id_notion` de la respuesta y escrito en el proyecto
   (`notion_page_id`), sin encolar. El reintento es idempotente: con el mismo id y el mismo folio de
   cotización la base contesta «ya existía» con el MISMO V-###; las demás funciones lo son por `op_id`,
   por sello o porque el mismo valor no escribe nada (supabase/DISENO.md §7.4).

   EL DINERO. Lo que el área de esta cuenta no escribe (`permisos` de `mi_acceso`, la matriz de 0002) no
   se manda y se NOMBRA en `rechazadas`, como hacía la hoja con sus `escribibles`: Fabricación no corrige
   una venta ni da de alta una. Y no lo lee: la fuente no le pide ni una columna de dinero, y la RLS de la
   base se lo negaría igual (R1, supabase/DISENO.md §4.6).

   LOS GASTOS (paso 3, 0025_gastos.sql). Suben con `gasto_registrar` y `gasto_anular` (`traducirGasto`, solo
   de este relevo: la sombra no copia gastos), una operación por viaje, con su `op_id`; la base sigue la regla
   de /empujar_gastos (el mismo id no entra dos veces; la anulación sin su alta da de alta el gasto ya anulado).
   Los que se apartaron en el teléfono mientras la base no tenía a dónde (paso 2) vuelven solos a la cola en el
   siguiente bombeo (`sync.revivirSinDestino`) y entran una vez. Bajan de la tabla `gastos` en lugar de
   /jalar_gastos, con las reglas de la bajada de la hoja (js/datos/gastos.js): lo que espera en la bandeja no
   se pisa, lo que la base ya no trae se barre solo si este teléfono lo había visto allá, y una lectura vacía
   no barre un teléfono lleno. Solo para quien ve el dinero: a Fabricación ni se le piden.

   LO QUE NO LLEVA TODAVÍA. Las notas de una cita ya creada (la base pide el renglón nuevo, `anexo`), igual
   que con la sombra.

   QUIÉN LO ENCHUFA: js/app.js, solo cuando `laBaseManda()` (js/nucleo/supa.js): el interruptor de
   Supabase encendido en este aparato Y el último modo que dijo la base, 'base'. Con la hoja mandando ni
   se descarga. La sombra no corre con él: no hay nada que copiar a donde ya se escribió
   (js/datos/supa-enchufe.js).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import * as Puente from './puente.js';
import { traducir, traducirGasto, leerRespuesta, crearEscritor, ALMACEN } from './supa-traductor.js';
import { crearFuente, veDinero } from './supa-vivo.js';

export const AREAS = Object.freeze(['direccion', 'fabricacion', 'pagos']);
/** Lo que este relevo lleva a la base. Lo demás se aparta en el teléfono con su razón (`motivo`). */
export const LLEVA = Object.freeze(['proyectos', 'instalaciones', ...ALMACEN, 'gastos']);
/* Cuánto vale lo que la base dijo de esta cuenta antes de volver a preguntar: lo mismo que la vigilancia
   del acceso retirado (js/nucleo/supa.js, MS_VIGILAR). */
const MS_CUENTA = 10 * 60 * 1000;
const MARCA_ALMACEN = 'al3d_pf_supa_vivo_alm';       // la misma que la lectura en vivo: el libro de la base, hasta dónde se vio

const t = v => (v === null || v === undefined) ? '' : String(v);

/* Cada uno con su frase entera, como en puente.js: la lee una persona que quiere saber por qué su cambio
   no salió, y una plantilla con el nombre del almacén pegado no concuerda. */
const NO_LLEVA = {
  avisos:     'Los avisos se calculan al abrir la plataforma, en cada dispositivo. No viajan y no hace falta que viajen.',
  constantes: 'Las constantes del taller se quedan en este dispositivo.',
  geo:        'La caché de ubicaciones se queda en este dispositivo. Se vuelve a llenar sola.',
};
export function motivo(almacen) {
  return NO_LLEVA[almacen] || 'La base no guarda eso desde la bandeja: se queda en este dispositivo.';
}

/* ============================================================================
   LO QUE LA BANDEJA LEE DE CADA RESPUESTA
   ============================================================================ */

/* Los «no» de la PUERTA de la base: esta cuenta, en este momento, no puede escribir nada. No son de la
   operación: con ellos las de atrás fallarían igual, así que paran el bombeo (sync.js lo hace con un
   ROL_SIN_PERMISO sin `definitivo`) y nada se aparta. */
const DE_LA_PUERTA = ['SIN_SESION', 'ACCESO_REVOCADO', 'SIN_ACCESO', 'EMPRESA_REQUERIDA', 'CLIENTE_VIEJO',
  'PGRST301', 'PGRST302', '42501'];

/**
 * El código con el que la bandeja trata un «reintentar» de la base. Los tres paran el bombeo —el orden
 * importa y lo de atrás fallaría igual—, cada uno con lo suyo: la red, la puerta, o algo que no se entiende.
 * El código de la base viaja aparte (`codigo_base`), para el que lea la bandeja. PURA.
 */
export function codigoDeLaBandeja(codigo, mensaje) {
  const c = t(codigo);
  if (DE_LA_PUERTA.includes(c)) return 'ROL_SIN_PERMISO';
  if (!c || c === 'SIN_RED' || /failed to fetch|network|fetch|timeout|abort/i.test(t(mensaje))) return 'SIN_RED';
  return 'DESCONOCIDO';
}

/** Lo que la bandeja recibe de una operación que no salió (`r` es lo que contestó el escritor). PURA. */
export function noSalio(id, r) {
  if (r.caso === 'rechazada') {
    return { id, ok: false, codigo: r.codigo, definitivo: true, mensaje: String(r.mensaje || r.codigo) + (r.rpc ? ' (' + r.rpc + ')' : '') };
  }
  return { id, ok: false, codigo: codigoDeLaBandeja(r.codigo, r.mensaje), codigo_base: t(r.codigo),
           mensaje: String(r.mensaje || 'La base no contestó.') };
}

/* Por qué esta cuenta no puede escribir ni leer ahora, en lo que la bandeja sabe leer. Nada de esto se
   aparta: se queda en la bandeja y sale cuando la cuenta pueda. */
export function porQueNo(a) {
  const estado = (a && a.estado) || 'desconocido';
  if (estado === 'sin_sesion') {
    return { codigo: 'ROL_SIN_PERMISO', codigo_base: 'SIN_SESION',
      mensaje: 'Este teléfono no ha entrado a la base: la empresa ya trabaja con ella. Entra con tu cuenta de Google en Ajustes → La base de datos y lo que está aquí se manda solo.' };
  }
  if (estado === 'desconocido') return { codigo: 'SIN_RED', codigo_base: t(a && a.codigo), mensaje: t(a && a.mensaje) || 'La base no contestó.' };
  const frases = {
    acceso_revocado: 'A esta cuenta se le retiró el acceso a la base. Lo de este teléfono se queda aquí, sin perderse.',
    sin_acceso: 'Esta cuenta no está dada de alta en la base: que Dirección la agregue en Ajustes → La base de datos, con ese mismo correo.',
    correo_no_verificado: 'Google no confirma el correo de esta cuenta, y sin eso la base no da acceso.',
    invitacion_pendiente: 'Esta cuenta tiene una invitación que no se pudo reclamar: sal de Supabase y vuelve a entrar.',
  };
  return { codigo: 'ROL_SIN_PERMISO', codigo_base: estado.toUpperCase(),
           mensaje: frases[estado] || 'La base no reconoce el área de esta cuenta.' };
}

/* ============================================================================
   LO QUE EL ÁREA ESCRIBE (como `filtrar` de puente.js con los `escribibles` de la hoja)
   ============================================================================ */

const POR = 'el área de esta cuenta no lo escribe en la base';

/**
 * Quita de las llamadas lo que el área de esta cuenta no escribe. Lo quitado se NOMBRA (`fuera`, la misma
 * forma que las `rechazadas` de la base: {nombre, por}). Sin `permisos` (una base que no los dijo) no se
 * quita nada: decide la base, que de todos modos tiene la última palabra. PURA.
 * @param {Array} llamadas las de `traducir`
 * @param {Object|null} permisos los de `mi_acceso` (interno.matriz_permisos() → el área)
 * @returns {{llamadas:Array, fuera:Array<{nombre:string, por:string}>, alta:boolean}}
 *   `alta`: era un alta que esta área no puede dar.
 */
export function porArea(llamadas, permisos) {
  const lista = Array.isArray(llamadas) ? llamadas : [];
  if (!permisos || typeof permisos !== 'object') return { llamadas: lista.slice(), fuera: [], alta: false };
  const quedan = [], fuera = [];
  let alta = false;
  for (const ll of lista) {
    if (ll.rpc === 'ganar_proyecto' || ll.rpc === 'descartar_cotizacion') {
      if (permisos.alta && permisos.alta[ll.rpc] === false) { alta = true; continue; }
      quedan.push(ll);
    } else if (ll.rpc === 'corregir_venta' || ll.rpc === 'proyecto_actualizar') {
      const deja = Array.isArray(permisos[ll.rpc]) ? permisos[ll.rpc] : null;
      if (!deja) { quedan.push(ll); continue; }
      const de = ll.rpc === 'corregir_venta' ? ll.args.p_cambios : ll.args.p_op.campos;
      const sigue = {};
      for (const [k, v] of Object.entries(de || {})) {
        if (deja.includes(k)) sigue[k] = v; else fuera.push({ nombre: k, por: POR });
      }
      if (!Object.keys(sigue).length) continue;
      quedan.push(ll.rpc === 'corregir_venta'
        ? { ...ll, args: { ...ll.args, p_cambios: sigue } }
        : { ...ll, args: { ...ll.args, p_op: { ...ll.args.p_op, campos: sigue } } });
    } else if (ll.rpc === 'mover_etapa') {
      const destinos = permisos.etapas && Array.isArray(permisos.etapas.destino) ? permisos.etapas.destino : null;
      if (destinos && !destinos.includes(ll.args.p_etapa)) { fuera.push({ nombre: 'etapa', por: POR }); continue; }
      quedan.push(ll);
    } else if (ll.rpc === 'instalacion_guardar') {
      if ('instalacion' in permisos && !permisos.instalacion) { fuera.push({ nombre: 'instalacion', por: POR }); continue; }
      quedan.push(ll);
    } else quedan.push(ll);
  }
  return { llamadas: quedan, fuera, alta };
}

/* ============================================================================
   EL RELEVO
   ============================================================================ */

/* Las escrituras locales del relevo, con DB directo y sin encolar —encolar desde el relevo que está
   vaciando la cola es un bucle que se manda a sí mismo—: el folio que dio la base y el estado del envío,
   como `espejarLocal` de puente.js. */
async function espejarLocal(id, campos) {
  try {
    const p = await DB.obtener('proyectos', id);
    if (!p) return;
    await DB.poner('proyectos', { ...p, ...campos, actualizado_en: Date.now() });
  } catch (_) { /* la operación ya llegó a la base; no se pierde eso por no poder anotarlo aquí */ }
}

/* El proyecto VIVO al que apunta una operación (por su folio: la foto de la bandeja lo trae en null si se
   encoló antes del alta), como `proyectoVivo` de puente.js. Una de instalación sin su proyecto no tiene
   con qué encontrarse en la base. */
async function proyectoVivo(op) {
  const id = op.almacen === 'proyectos' ? (op.datos && op.datos.id) : (op.datos && op.datos.proyecto_id);
  if (!id) return null;
  let vivo = null;
  try { vivo = await DB.obtener('proyectos', id); } catch (_) { vivo = null; }
  if (vivo) return vivo;
  return op.almacen === 'proyectos' ? (op.datos || null) : null;
}

const foliosDe = p => ({ folio_global: t(p && p.folio_global), folio_hoja: t(p && (p.notion_page_id || p.folio_hoja)) });

/**
 * Arma el relevo.
 * @param {{cliente:function():Promise<Object>, haySesion:function():Promise<boolean>,
 *          acceso:function():Promise<Object>, lector:Object, fuente:Object,
 *          ahora?:function():number}} deps
 *   `cliente` da el cliente de supabase-js; `acceso` contesta como `Supa.acceso()` (estado, área,
 *   permisos); `lector` es un relevo de la hoja (`Puente.crear`) del que salen `bajar`, `despuesDeBajar` y
 *   las pasarelas al Apps Script; `fuente` es la de la base (`crearFuente`), que se le pone antes de bajar.
 */
export function crearRelevo(deps) {
  const ahora = deps.ahora || (() => Date.now());
  const escritor = crearEscritor();
  const lector = deps.lector;

  /* Quién es esta cuenta para la base, recordado MS_CUENTA si está activa. Lo que no está activo se
     vuelve a preguntar en la siguiente vuelta: es lo que se arregla entrando. */
  let _cuenta = null, _cuentaEn = 0;
  async function cuenta(forzar = false) {
    if (!forzar && _cuenta && ahora() - _cuentaEn < MS_CUENTA) return _cuenta;
    let si = false;
    try { si = await deps.haySesion(); } catch (_) { si = false; }
    if (!si) { _cuenta = null; return { estado: 'sin_sesion' }; }
    let a;
    try { a = await deps.acceso(); } catch (e) { a = { estado: 'desconocido', mensaje: t(e && e.message) }; }
    if (a && a.estado === 'activo' && AREAS.includes(a.area)) { _cuenta = a; _cuentaEn = ahora(); return a; }
    _cuenta = null;
    return a || { estado: 'desconocido' };
  }

  /* La puerta de cada viaje: una cuenta activa con su área, y el cliente. */
  async function abrir() {
    const a = await cuenta();
    if (a.estado !== 'activo' || !AREAS.includes(a.area)) return { ok: false, ...porQueNo(a) };
    try { return { ok: true, a, c: await deps.cliente() }; }
    catch (e) { return { ok: false, codigo: 'SIN_RED', mensaje: t(e && e.message) || 'Supabase no cargó.' }; }
  }

  /* El id que la base conoce para el proyecto de una línea del almacén. La lista de compra lleva el id del
     proyecto EN el suyo (`<proyecto>:<material>`) y la base exige que el proyecto exista: una venta de antes
     del cambio la conoce la base como `proy-hoja-V-###` y este teléfono con el suyo. Se busca una vez por
     proyecto (por sus folios) y se recuerda. El libro (`movimientos`) no lo exige, pero se le pone el mismo
     para que la base sepa de qué venta salió el material. */
  async function conProyectoDeLaBase(c, op) {
    const d = op.datos || {};
    const pid = t(d.proyecto_id);
    if (!pid || (op.almacen !== 'requerimientos' && op.almacen !== 'movimientos') || pid.startsWith('proy-hoja-')) return op;
    let base = (escritor.resuelto(pid) || {}).id || null;
    if (!base) {
      let p = null;
      try { p = await DB.obtener('proyectos', pid); } catch (_) { p = null; }
      if (!p) return op;
      base = await escritor.resolver(c, pid, foliosDe(p)).catch(() => null);
    }
    if (!base || base === pid) return op;
    const datos = { ...d, proyecto_id: base };
    let registro = op.registro_id;
    if (op.almacen === 'requerimientos' && t(d.id).startsWith(pid + ':')) {
      datos.id = base + t(d.id).slice(pid.length);
      registro = datos.id;
    }
    if (op.almacen === 'movimientos' && t(d.requerimiento_id).startsWith(pid + ':')) {
      datos.requerimiento_id = base + t(d.requerimiento_id).slice(pid.length);
    }
    return { ...op, registro_id: registro, datos };
  }

  /* Un lote del almacén en UN viaje (`almacen_aplicar` acepta hasta 25 y contesta una por una, sin que una
     mala tumbe a las demás). */
  async function subirAlmacen({ c }, lista) {
    const envio = [];
    for (const op of lista) {
      const o2 = await conProyectoDeLaBase(c, op);
      envio.push(traducir(o2).llamadas[0].args.p_ops[0]);
    }
    let crudo;
    try { crudo = await c.rpc('almacen_aplicar', { p_ops: envio }); }
    catch (e) { return lista.map(op => noSalio(op.id, { caso: 'reintentar', codigo: 'SIN_RED', mensaje: t(e && e.message) })); }
    if (!crudo || crudo.error || !crudo.data || crudo.data.ok !== true) {
      const r = leerRespuesta('almacen_aplicar', crudo);
      return lista.map(op => noSalio(op.id, { ...r, rpc: 'almacen_aplicar' }));
    }
    const res = Array.isArray(crudo.data.resultados) ? crudo.data.resultados : [];
    return lista.map(op => {
      const x = res.find(y => y && y.id === op.id) || null;
      const r = leerRespuesta('almacen_aplicar', { data: { ok: true, resultados: x ? [x] : [] } });
      /* «Ya estaba» es éxito: es el reintento de algo que sí llegó, y es lo que evita que el libro reste dos veces. */
      if (r.caso === 'ok') return { id: op.id, ok: true, remoto: null, rechazadas: [], ya_estaba: r.detalle === 'ya_estaba' };
      return noSalio(op.id, { ...r, rpc: 'almacen_aplicar' });
    });
  }

  /* El V-### de una venta que la base acaba de dar de alta: el que contestó `ganar_proyecto`, o —si la base
     ya la tenía con OTRO id, la copia de la hoja— el de esa, buscada por su folio de cotización. */
  async function folioDelAlta(c, proy, r) {
    const g = (r.datos || []).find(x => x.rpc === 'ganar_proyecto');
    if (g && g.data && /^V-\d{3,7}$/.test(t(g.data.folio_hoja))) return t(g.data.folio_hoja);
    if (!g) return '';
    const ya = escritor.resuelto(t(proy.id));
    if (ya && ya.folio_hoja) return ya.folio_hoja;
    await escritor.resolver(c, t(proy.id), foliosDe(proy)).catch(() => null);
    return t((escritor.resuelto(t(proy.id)) || {}).folio_hoja);
  }

  /* Una operación de la venta o de su cita. */
  async function subirUna(p, op) {
    const proy = await proyectoVivo(op);
    if (!proy) {
      return { id: op.id, ok: false, codigo: 'NO_ENCONTRADO', definitivo: true,
               mensaje: 'Esa operación apunta a un proyecto que ya no está en este dispositivo.' };
    }
    /* Un alta que ya tiene V-### de la hoja (la hoja la aceptó justo antes del cambio y la copia todavía no la
       trajo) entra con ESE folio y no con uno nuevo del contador: la misma venta no puede tener dos. Una venta
       nueva no tiene ninguno, y la base le da el suyo. */
    const yaTiene = t(proy.notion_page_id);
    const tr = traducir(op, { folio_hoja: /^V-\d{3,7}$/.test(yaTiene) ? yaTiene : '' });
    /* Despachada sin mandar: no hay nada que la base guarde de ella (lo dice el traductor). */
    if (tr.omitir) return { id: op.id, ok: true, omitida: true, remoto: null, rechazadas: [] };
    const { llamadas, fuera, alta } = porArea(tr.llamadas, p.a.permisos);
    if (alta) {
      return { id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO', definitivo: true,
               mensaje: 'Este teléfono no puede dar de alta la venta en la base: su área no da de alta ventas. ' +
                        'Dala de alta desde el de Dirección y desde aquí ya podrás mover la obra.' };
    }
    if (!llamadas.length) {
      return { id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO', definitivo: true,
               mensaje: 'De ese cambio, este teléfono no puede escribir nada en la base: ' + fuera.map(x => x.nombre).join(', ') + '.' };
    }
    let r;
    try { r = await escritor.mandar(p.c, op, { llamadas, folios: foliosDe(proy) }); }
    catch (e) { r = { caso: 'reintentar', codigo: 'SIN_RED', mensaje: t(e && e.message) }; }

    if (r.caso === 'ok') {
      const folio = op.almacen === 'proyectos' && op.tipo === 'crear' ? await folioDelAlta(p.c, proy, r) : '';
      /* Lo que la base no escribió y por qué (un dato que no pasó su validación, un campo de otra área),
         junto con lo que no se mandó por el área: la bandeja lo acumula y la pantalla lo dice. */
      const rechazadas = fuera.concat(...(r.datos || []).map(x => (x.data && Array.isArray(x.data.rechazadas)) ? x.data.rechazadas : []));
      if (op.almacen === 'proyectos') {
        await espejarLocal(proy.id, { notion_page_id: folio || proy.notion_page_id || null, notion_estado: 'enviado' });
      }
      return { id: op.id, ok: true, remoto: folio ? { id_notion: folio } : null, rechazadas };
    }
    if (r.caso === 'rechazada' && op.almacen === 'proyectos') await espejarLocal(proy.id, { notion_estado: 'fallido' });
    return noSalio(op.id, r);
  }

  /* ── LOS GASTOS (paso 3) ─────────────────────────────────────────────────────────────────────── */

  /* Lo mismo que hacía el relevo de la hoja al subir uno (`marcarGastoEnHoja` de puente.js): `en_hoja` es «ya está en la fuente» —la
     hoja, o con la base mandando, la base— y `subido_en` desde cuándo. Es lo que deja barrer después lo que la base ya no trae sin barrer
     lo que nunca llegó (`gastos.porBarrer`), y va ANTES de que `sync` saque la operación de la bandeja: en ningún instante un gasto de
     aquí está sin operación y sin marca. Con DB directo y sin encolar, como `espejarLocal`. */
  async function marcarGasto(id) {
    try {
      const g = await DB.obtener('gastos', id);
      if (g) await DB.poner('gastos', { ...g, en_hoja: true, subido_en: ahora() });
    } catch (_) { /* sin la marca, la bajada lo trae igual; no se para el bombeo por ella */ }
  }

  /* Un gasto, en un viaje. Lo que el área no ve (Fabricación) ni se intenta: se aparta con su razón, como lo apartaba la hoja. */
  async function subirGasto(p, op) {
    if (!veDinero(p.a.area)) {
      return { id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO', definitivo: true,
               mensaje: 'Los gastos son dinero: los registran Dirección y Pagos, y esta cuenta es de ' + t(p.a.area) + '.' };
    }
    const tr = traducirGasto(op);
    if (tr.omitir) return { id: op.id, ok: true, omitida: true, remoto: null, rechazadas: [] };
    let r;
    try { r = await escritor.mandar(p.c, op, { llamadas: tr.llamadas }); }
    catch (e) { r = { caso: 'reintentar', codigo: 'SIN_RED', mensaje: t(e && e.message) }; }
    if (r.caso === 'ok') {
      await marcarGasto(t((op.datos && op.datos.id) || op.registro_id));
      /* «Ya estaba» es éxito: es el reintento de uno que sí llegó (o uno que la base ya tenía por la copia de la hoja). */
      return { id: op.id, ok: true, remoto: null, rechazadas: [], ya_estaba: /ya_estaba/.test(t(r.detalle)) };
    }
    return noSalio(op.id, r);
  }

  /* La bajada de los gastos, con las reglas de `bajarGastos` de puente.js: la tabla ENTERA (unos cientos de renglones al año), de cada
     uno la base es la dueña (sello de «ahora»), salvo el que tiene una operación todavía en la bandeja —para no deshacerle en pantalla a
     quien lo acaba de anular—; lo que ya no trae se barre al cerrar la bajada (`despuesDeBajar`). Y un candado más, el de las ventas: una
     lectura VACÍA con gastos de la base en este teléfono no barre nada (una RLS que contesta vacío no es «ya no hay gastos»). */
  let gastosVistos = null;
  async function bajarGastos() {
    if (!deps.fuente || typeof deps.fuente.gastos !== 'function') return [];
    const a = await cuenta();
    if (a.estado !== 'activo' || !veDinero(a.area)) return [];
    const G = await import('./gastos.js');
    const leidoEn = ahora();
    const r = await deps.fuente.gastos();
    if (!r || r.ok !== true || !Array.isArray(r.gastos)) return [];
    let enBandeja;
    try { enBandeja = G.idsEnLaBandeja(await DB.listar('pendientes')); } catch (_) { enBandeja = new Map(); }
    const lista = r.gastos.map(G.gastoDeBase).filter(Boolean);
    let barrer = r.completa !== false;
    if (barrer && !lista.length) {
      let vistos = 0;
      try { vistos = (await DB.listar('gastos')).filter(g => g && g.en_hoja === true).length; } catch (_) { vistos = 0; }
      if (vistos) barrer = false;
    }
    gastosVistos = barrer ? { ids: new Set(lista.map(g => g.id)), leidoEn } : null;
    const sello = ahora();
    return lista.filter(g => !enBandeja.has(g.id)).map(g => ({ almacen: 'gastos', datos: { ...g, en_hoja: true, actualizado_en: sello } }));
  }

  async function barrerGastos(vistos) {
    try {
      const G = await import('./gastos.js');
      const locales = await DB.listar('gastos');
      const enBandeja = G.idsEnLaBandeja(await DB.listar('pendientes'));
      let k = 0;
      for (const id of G.porBarrer(locales, vistos, enBandeja)) {
        const r = await DB.borrar('gastos', id);
        if (r && r.ok) k++;
      }
      return k;
    } catch (_) { return 0; }
  }

  /* Una respuesta que para el bombeo: lo que sigue del lote se queda como estaba. */
  const para = x => !!x && !x.ok && !x.definitivo && x.codigo !== 'SIN_DESTINO';

  /* La fuente de las filas, con dos candados que la lectura en vivo de Ajustes no necesitaba: una cuenta
     activa (sin ella la RLS contesta vacío, no error) y no tirar un récord lleno por una lectura vacía —un
     barrido completo sin filas borraría el récord de Control y marcaría todas las ventas como perdidas—. */
  const fuente = {
    async filas(cursor) {
      const a = await cuenta();
      if (a.estado !== 'activo') return { ok: false, ...porQueNo(a) };
      const r = await deps.fuente.filas(cursor);
      if (r && r.ok === true && Array.isArray(r.registros) && !r.registros.length) {
        let hay = 0;
        try { hay = await DB.contar('ventas_hoja'); } catch (_) { hay = 0; }
        if (Number(hay) > 0) return { ok: false, codigo: 'DESCONOCIDO', mensaje: 'La base contestó sin ninguna venta: no se toca nada de este teléfono.' };
      }
      return r;
    },
    async almacen(desde) {
      const a = await cuenta();
      if (a.estado !== 'activo') return { ok: false, ...porQueNo(a) };
      return deps.fuente.almacen(desde);
    },
  };

  return {
    nombre: 'base',
    lleva: almacen => LLEVA.includes(almacen),
    motivo,
    /* Lo que se sabe sin red de si un almacén tiene a dónde ir: con la base no depende de ninguna versión de la hoja. Los gastos también
       (0025): Control ya no dice «falta actualizar el puente». */
    sabe: almacen => LLEVA.includes(almacen),
    agrupa: almacen => ALMACEN.includes(almacen),
    espejos: Puente.ESPEJOS.slice(),
    /** Para Ajustes: la última cuenta que la base reconoció (sin red). */
    cuenta: () => (_cuenta ? { ..._cuenta } : null),
    /** La sesión de la base se fue (js/nucleo/supa.js avisa `al3d-supa-salio`): lo recordado de esta cuenta ya no vale, y la
     *  siguiente vuelta pregunta y dice «sin sesión» en vez de seguir mandando con lo de hace diez minutos (ES-5). */
    olvidarCuenta() { _cuenta = null; _cuentaEn = 0; },

    async subir(ops) {
      const lista = Array.isArray(ops) ? ops.filter(Boolean) : [];
      if (!lista.length) return [];
      const p = await abrir();
      if (!p.ok) return lista.map(op => ({ id: op.id, ok: false, codigo: p.codigo, codigo_base: p.codigo_base || '', mensaje: p.mensaje }));
      if (lista.every(op => ALMACEN.includes(op.almacen))) return subirAlmacen(p, lista);
      const salida = [];
      for (const op of lista) {
        let x;
        if (ALMACEN.includes(op.almacen)) [x] = await subirAlmacen(p, [op]);
        else if (op.almacen === 'gastos') x = await subirGasto(p, op);
        else if (!LLEVA.includes(op.almacen)) x = { id: op.id, ok: false, codigo: 'SIN_DESTINO', mensaje: motivo(op.almacen) };
        else x = await subirUna(p, op);
        salida.push(x);
        if (para(x)) break;
      }
      return salida;
    },

    async bajar(cursor) {
      /* La fuente de las filas es SIEMPRE la base, y se pone antes de cada bajada: la de `Puente` es una
         sola para todo el módulo, y la lectura en vivo de Ajustes la quita al apagarse. */
      Puente.fuenteDeLectura(fuente);
      gastosVistos = null;
      const r = await lector.bajar(cursor);
      /* Los gastos, en la última página y en su propio try, como en el relevo de la hoja: si la base no los da, lo de la venta ya bajó
         igual. (Con una fuente, el de la hoja no los pide: esa bajada promete no hablarle a la hoja.) */
      if (r && !r.hay_mas) {
        try {
          const g = await bajarGastos();
          if (g.length) r.registros = (Array.isArray(r.registros) ? r.registros : []).concat(g);
        } catch (_) { gastosVistos = null; }
      }
      return r;
    },
    async despuesDeBajar(info) {
      /* Los gastos que la base ya no trae, con lo que bajó ya escrito. */
      if (gastosVistos) {
        const v = gastosVistos;
        gastosVistos = null;
        await barrerGastos(v);
      }
      return lector.despuesDeBajar(info);
    },

    async salud() {
      const a = await cuenta(true);
      if (a.estado === 'activo') {
        return { ok: true, mensaje: 'La base contesta y reconoce esta cuenta.', rol: a.area, version: 'base',
                 escribibles: [], via: 'base', correo: t(a.correo) };
      }
      return { ok: false, ...porQueNo(a) };
    },
    async esquema() {
      return { ok: true, faltan: [], accesos: true, mensaje: '',
               nota: 'Con la base mandando no hay columnas que preparar: las tablas son las de supabase/migrations.' };
    },
    /* Lo que sigue en el Apps Script: Drive y los links cortos de Maps. */
    carpetas: () => lector.carpetas(),
    crearCarpeta: nombre => lector.crearCarpeta(nombre),
    expandir: u => lector.expandir(u),
  };
}

/* ============================================================================
   EL DE ESTE APARATO
   ============================================================================ */

/**
 * El relevo de la base con lo de este aparato: la sesión de Supabase, la fuente de la base y, para Drive y
 * los links de Maps, el Apps Script de siempre. Lo llama js/app.js al enchufar la bandeja.
 * @param {Object} Supa el módulo js/nucleo/supa.js (se pasa para no cargarlo dos veces)
 */
export function desdeSupa(Supa) {
  const g = Supa.modoGuardado() || {};
  const marca = {
    leer: () => { try { return Number(globalThis.localStorage.getItem(MARCA_ALMACEN)) || 0; } catch (_) { return 0; } },
    poner: v => { try { globalThis.localStorage.setItem(MARCA_ALMACEN, String(v)); } catch (_) {} },
  };
  let relevo = null;
  /* El área de la fuente es la de la cuenta que la base reconoció en esta sesión; sin ella, la última que
     dijo (lo guardado): las dos son de la base, nunca de la pestaña «Accesos» de la hoja. */
  const fuente = crearFuente({ cliente: Supa.cliente, empresa: g.empresa || 'al3d', marca,
    area: () => ((relevo && relevo.cuenta()) || Supa.modoGuardado() || {}).area || '' });
  relevo = crearRelevo({ cliente: Supa.cliente, haySesion: Supa.haySesion, acceso: Supa.acceso,
    lector: Puente.crear(Prefs.puente(), { tokenDeLaBase: Supa.tokenDeSesion }), fuente });
  return relevo;
}
