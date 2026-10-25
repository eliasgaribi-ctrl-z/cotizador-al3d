/* ============================================================================
   EL ENCHUFE DE SUPABASE — conecta la sombra (fase 3) y la lectura en vivo (fase 4). APAGADO.

   Este módulo no lo importa nadie de forma estática. `app.js` lo carga con import() SOLO si en
   este aparato están encendidos el interruptor general de Supabase y el de la sombra; Ajustes, solo
   para Dirección y con el general encendido. Apagado: ni se descarga, ni se ejecuta, ni pregunta
   nada a la red (pruebas/supabase-sombra.mjs lo comprueba).

   Lo que enchufa, y dónde:
     · la SOMBRA: el gancho `Sync.alSubir` (js/datos/sync.js) → la cola de js/datos/supa-sombra.js;
       se manda tras cada copia, cada minuto con la app a la vista y al volver la señal;
     · el CUADRE diario: una vez al día (día de México), con la sombra encendida y siendo Dirección,
       compara la hoja con la base (js/datos/supa-cuadre.js) y lo guarda; Ajustes enseña la racha;
     · la LECTURA EN VIVO: `Puente.fuenteDeLectura` (js/datos/puente.js) → js/datos/supa-vivo.js, y
       la suscripción de Realtime que avisa a la app que hay algo que bajar;
     · las IMÁGENES de las cotizaciones (js/datos/supa-imagenes.js): con la sombra, las del historial
       suben a Storage después de cada bombeo (al arrancar, cuando el cotizador guarda el historial y
       cada 15 minutos); con la lectura en vivo, la ventanilla `AL3D_NUBE` deja que el cotizador
       pida las que no están en este teléfono (`imagenes`: solo Dirección y Pagos) y que la ficha del
       proyecto enseñe las de una obra ganada (`obra`: Dirección y Fabricación, Q-02 bis). A Pagos no
       se le pone `obra`, a Fabricación no se le pone `imagenes`.
   `apagar()` lo desenchufa todo sin recargar: los ganchos vuelven a null, la ventanilla se quita y
   la app vuelve a ser la de siempre.

   CON LA BASE MANDANDO (paso 2 de docs/BASE-MANDA.md; `Supa.laBaseManda()`) la bandeja ya escribe y lee
   la base por su propio relevo (js/datos/supa-relevo.js). Entonces la sombra NO corre: copiaría a la base
   lo que ya está en la base, y una operación saldría dos veces. Ni se engancha, ni bombea su cola (lo
   que quedó en ella de antes del cambio se queda ahí, a la vista en Ajustes: mandarlo ahora podría pisar
   lo que ya se corrigió en la base), ni hace el cuadre contra la hoja. Lo que sí queda de aquí es lo que
   la lectura en vivo hacía para la bajada, y ya sin pedir la sombra: Realtime avisa cuándo bajar y la
   ventanilla de las imágenes. La FUENTE de las filas no se pone aquí: el relevo trae la suya.
   Esto lo arranca app.js al enchufar la bandeja a la base, con o sin los interruptores de la sombra.

   Y EL COTIZADOR, CON LA BASE MANDANDO (paso 4 de docs/BASE-MANDA.md). Sin pedir la sombra:
     · el HISTORIAL sube a la base (js/datos/supa-cotizaciones.js): al arrancar —la primera vez, todo: la
       subida única automática—, cuando el cotizador guarda (el evento 'storage' de sus claves), cada
       minuto con la app a la vista si quedó algo, y a los 15 minutos de todos modos; y la ventanilla le
       da al cotizador lo que cambió en la base (`cotizaciones`, `mezclar`; solo Dirección y Pagos);
     · las IMÁGENES de esas cotizaciones suben después de cada vuelta del historial (Pagos solo puede
       subir las de sus cotizaciones que ya están en la base: por eso van detrás);
     · los PRECIOS: la ventanilla lee y guarda la tabla de la base (`tarifas`, `guardarTarifas`; leer, las
       tres áreas; guardar, la base solo se lo deja a Dirección).
   El sello, la IA, Maps y Drive siguen en el Apps Script (decidido por Elías el 2026-10-25).
   ============================================================================ */

import * as Sync from './sync.js';
import * as Puente from './puente.js';
import * as Prefs from './prefs.js';
import * as Supa from '../nucleo/supa.js';
import { crearSombra, almacenIndexedDB, sombraEncendida, vivoEncendido } from './supa-sombra.js';
import { crearFuente, suscribir, todas } from './supa-vivo.js';
import { cuadrar, diaMx, racha, resumenCopiaDiaria } from './supa-cuadre.js';
import { crearImagenes, puedeImagenes, puedeVerObra, CLAVE_HISTORIAL } from './supa-imagenes.js';
import { crearCotizaciones, mezclar, puedeLeer as puedeLeerCotizaciones, CLAVE_HITOS, CLAVE_BORRADAS } from './supa-cotizaciones.js';

const MS_BOMBEO = 60 * 1000;
const MS_TRAS_COPIA = 2000;
const MS_RESPALDO_VIVO = 5 * 60 * 1000;      // con Realtime vivo, la base se relee igual cada 5 min (respaldo)
const MS_ENTRE_INTENTOS_DE_CUADRE = 30 * 60 * 1000;
const CLAVE_MARCA_ALMACEN = 'al3d_pf_supa_vivo_alm';
const MS_IMAGENES = 15 * 60 * 1000;          // sin cambios en el historial, las imágenes se revisan cada 15 min

let _almacen = null, _sombra = null, _canal = null, _fuente = null, _area = '', _empresa = 'al3d';
let _reloj = 0, _programado = 0, _sincronizar = null, _debeJalar = true, _ultimoJalar = 0, _estadoCanal = '';
let _avisarApp = null, _cuadreIntentadoEn = 0;
let _enBase = false;                         // la lectura en vivo de «la base manda»: Realtime sin fuente propia
let _imagenes = null, _imgSucias = true, _imgUltima = 0;
/* El historial del cotizador con la base mandando (paso 4): su reloj y su programado van aparte de los de la sombra. */
let _cotizaciones = null, _cotSucias = true, _cotUltima = 0, _relojBase = 0, _programadoBase = 0, _oyeBase = false;
let _cotEnCurso = null, _cotOtraVez = false;
const MS_COTIZACIONES = 15 * 60 * 1000;      // sin cambios en el historial, se revisa cada 15 min

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

async function acceso() {
  try { const a = await Supa.acceso(); if (a && a.estado === 'activo') { _area = a.area; _empresa = a.empresa || 'al3d'; } return a; }
  catch (_) { return { estado: 'desconocido' }; }
}

function almacen() { return _almacen || (_almacen = almacenIndexedDB()); }

function sombra() {
  return _sombra || (_sombra = crearSombra({ cliente: Supa.cliente, almacen: almacen() }));
}

/** Manda la cola de la sombra si hay sesión (y después, las imágenes que falten). Nunca lanza. */
export async function bombearSombra() {
  if (!sombraEncendida()) return { motivo: 'apagada' };
  if (Supa.laBaseManda()) return { motivo: 'modo_base' };
  if (!await Supa.haySesion()) return { motivo: 'sin_sesion' };
  const r = await sombra().bombear();
  cuadreDelDia().catch(() => {});
  subirImagenes().catch(() => {});
  return r;
}

/* ----- Las imágenes de las cotizaciones ----- */

function imagenes() {
  return _imagenes || (_imagenes = crearImagenes({ cliente: Supa.cliente, almacen: almacen(), area: () => _area, empresa: () => _empresa,
    anotar: ev => sombra().anotar(ev) }));
}

/**
 * Sube a Storage las imágenes del historial que falten. Sin `forzar`, solo si el historial cambió, si
 * la vuelta anterior dejó algo a medias o si pasaron 15 minutos. Nunca lanza.
 */
export async function subirImagenes(forzar = false) {
  /* Con la sombra, como siempre; con la base mandando, sin ella (paso 4). */
  if (!sombraEncendida() && !Supa.laBaseManda()) return { motivo: 'apagada' };
  if (!forzar && !_imgSucias && Date.now() - _imgUltima < MS_IMAGENES) return { motivo: 'al_dia' };
  if (!await Supa.haySesion()) return { motivo: 'sin_sesion' };
  if (!_area) await acceso();
  _imgUltima = Date.now();
  _imgSucias = false;
  const r = await imagenes().subir();
  /* Lo que quedó a medias (más de las que caben en una vuelta, o una red que falló) se sigue en la
     vuelta siguiente, al minuto; lo que espera algo de fuera, a los 15. */
  if (r.hay_mas || r.motivo === 'parada' && r.codigo !== 'TOPE') _imgSucias = true;
  return r;
}

/** Para Ajustes. */
export async function estadoImagenes() {
  if (!sombraEncendida() && !Supa.laBaseManda()) return null;
  return imagenes().estado();
}

/* ----- El historial del cotizador, con la base mandando (paso 4) ----- */

function cotizaciones() {
  return _cotizaciones || (_cotizaciones = crearCotizaciones({ cliente: Supa.cliente, almacen: almacen(), area: () => _area,
    empresa: () => _empresa, disp: () => Prefs.dispositivo(), anotar: ev => sombra().anotar(ev) }));
}

/**
 * Sube a la base lo que cambió en el historial del cotizador y, detrás, sus imágenes. Solo con la base mandando. Sin `forzar`,
 * solo si el historial cambió, si la vuelta anterior dejó algo a medias o si pasaron 15 minutos. Nunca lanza.
 */
export function subirCotizaciones(forzar = false) {
  if (!Supa.laBaseManda()) return Promise.resolve({ motivo: 'hoja' });
  /* Una vuelta a la vez. Lo que el cotizador guarde mientras corre no se pierde: al terminar, otra vuelta. */
  if (_cotEnCurso) { _cotOtraVez = true; return _cotEnCurso; }
  if (!forzar && !_cotSucias && Date.now() - _cotUltima < MS_COTIZACIONES) return Promise.resolve({ motivo: 'al_dia' });
  _cotOtraVez = false;
  _cotEnCurso = (async () => {
    if (!await Supa.haySesion()) return { motivo: 'sin_sesion' };
    if (!_area) await acceso();
    /* Se entró a la base después de arrancar (Ajustes → Google): la ventanilla del cotizador y Realtime se ponen ahora, sin
       esperar a reabrir la app. */
    if (!_enBase && !_fuente && ['direccion', 'fabricacion', 'pagos'].includes(_area)) encenderVivo(true);
    _cotUltima = Date.now();
    _cotSucias = false;
    const r = await cotizaciones().subir();
    /* Lo que quedó a medias por red o sesión espera la vuelta del minuto; lo que no cupo en esta vuelta sigue enseguida; una
       lápida que todavía se puede deshacer, en cuanto se le acabe la ventana. */
    if (r.motivo === 'parada' || r.motivo === 'error') _cotSucias = true;
    if (r.hay_mas) _cotOtraVez = true;
    if (r.borrar_en > 0) programarBase(r.borrar_en + 1000);
    await subirImagenes(_imgSucias || r.subidas > 0 || r.actualizadas > 0).catch(() => {});
    return r;
  })().catch(e => ({ motivo: 'error', mensaje: String((e && e.message) || e) }))
    .finally(() => { _cotEnCurso = null; if (_cotOtraVez) { _cotSucias = true; programarBase(MS_TRAS_COPIA); } });
  return _cotEnCurso;
}

/** Para Ajustes: lo del historial en la base. Null con la hoja mandando. */
export async function estadoCotizaciones() {
  if (!Supa.laBaseManda()) return null;
  return cotizaciones().estado();
}

function programarBase(ms) {
  clearTimeout(_programadoBase);
  _programadoBase = setTimeout(() => { subirCotizaciones().catch(() => {}); }, ms);
}

/* El cotizador guardó (en su marco o en otra pestaña): su historial, sus hitos o una lápida. */
function alCambiarElCotizador(ev) {
  if (!Supa.laBaseManda()) return;
  if (!ev || !ev.key || [CLAVE_HISTORIAL, CLAVE_HITOS, CLAVE_BORRADAS].includes(ev.key)) {
    _cotSucias = true; _imgSucias = true;
    programarBase(MS_TRAS_COPIA);
  }
}

function arrancarCotizaciones() {
  if (!_relojBase) _relojBase = setInterval(() => { if (visible()) subirCotizaciones().catch(() => {}); }, MS_BOMBEO);
  if (!_oyeBase) {
    _oyeBase = true;
    try { globalThis.addEventListener('storage', alCambiarElCotizador); } catch (_) {}
    try { globalThis.addEventListener('online', () => { if (Supa.laBaseManda()) programarBase(MS_TRAS_COPIA); }); } catch (_) {}
  }
  _cotSucias = true;
  programarBase(MS_TRAS_COPIA);
}

function pararCotizaciones() {
  clearInterval(_relojBase); _relojBase = 0;
  clearTimeout(_programadoBase); _programadoBase = 0;
}

/* Lo que la ventanilla le contesta al cotizador: nunca lanza, siempre {ok, …}. */
const comoVentanilla = fn => Promise.resolve().then(fn).then(v => ({ ...(v || {}), ok: true }),
  e => ({ ok: false, codigo: (e && e.codigo) || 'SIN_RED', mensaje: Supa.mensajeDe(e) }));

/* La ventanilla (js/cotizador/imagenes.js, `_imgNube`, y la ficha de js/mod/proyectos.js): el marco del
   cotizador es del mismo origen y la busca en esta ventana. Existe SOLO con la lectura en vivo
   encendida, y lleva lo que el área puede: `imagenes` (el cotizador) para Dirección o Pagos, y `obra`
   (las de una obra ganada, Q-02 bis) para Dirección o Fabricación. Apagado, no existe y nadie pide nada. */
function ponerVentanilla() {
  const v = {};
  if (puedeImagenes(_area)) v.imagenes = ids => imagenes().bajar(ids);
  if (puedeVerObra(_area)) v.obra = folioGlobal => imagenes().deObra(folioGlobal);
  /* Con la base mandando (paso 4), lo del cotizador: los precios para las tres áreas, y el historial de la empresa solo para quien
     ve cotizaciones (Dirección todas, Pagos las suyas: la RLS). A Fabricación no se le pone `cotizaciones`: llevan precios. */
  if (_enBase && Supa.laBaseManda()) {
    if (['direccion', 'fabricacion', 'pagos'].includes(_area)) {
      v.tarifas = () => comoVentanilla(() => Supa.tarifasLeer());
      v.guardarTarifas = filas => comoVentanilla(() => Supa.tarifasGuardar(filas));
    }
    if (puedeLeerCotizaciones(_area)) {
      v.cotizaciones = desde => cotizaciones().bajar(desde);
      v.mezclar = mezclar;
    }
  }
  if (!Object.keys(v).length) { quitarVentanilla(); return; }
  globalThis.AL3D_NUBE = Object.freeze(v);
}
function quitarVentanilla() {
  try { delete globalThis.AL3D_NUBE; } catch (_) { globalThis.AL3D_NUBE = undefined; }
}

function programar(ms) {
  clearTimeout(_programado);
  _programado = setTimeout(() => { bombearSombra().catch(() => {}); }, ms);
}

/* ----- El cuadre ----- */

/** La hoja contra la base, ahora. Solo Dirección (la base y la hoja se lo niegan a los demás). */
export async function cuadrarAhora() {
  const a = await acceso();
  if (a.estado !== 'activo' || a.area !== 'direccion') {
    return { ok: false, mensaje: 'El cuadre lo hace una cuenta de Dirección con sesión en la base.' };
  }
  let hoja;
  try {
    const r = await Puente.hablar('jalar', {});
    if (!r || r.ok === false) return { ok: false, mensaje: (r && r.mensaje) || 'La hoja no contestó.' };
    hoja = (Array.isArray(r.registros) ? r.registros : []).map(f => Puente.ventaDeHoja((f && f.datos) || null)).filter(Boolean);
  } catch (e) { return { ok: false, mensaje: 'La hoja no contestó: ' + ((e && e.message) || e) }; }
  let base;
  try {
    const c = await Supa.cliente();
    base = await todas(() => c.from('ventas_calculadas')
      .select('a_folio, folio_global, g_subtotal, h_neto, i_anticipo, j_liquidacion, k_saldo, r_comision, s_abonado, t_restante')
      .eq('empresa_id', _empresa).order('a_folio'));
  } catch (e) { return { ok: false, mensaje: 'La base no contestó: ' + Supa.mensajeDe(e) }; }
  const res = cuadrar(hoja, base);
  const ts = Date.now();
  const guardado = { id: String(ts), ts, dia: diaMx(ts), cuadra: res.cuadra, resultado: res };
  try {
    await almacen().poner('cuadres', guardado);
    const lista = (await almacen().listar('cuadres')).sort((x, y) => x.ts - y.ts);
    for (const viejo of lista.slice(0, Math.max(0, lista.length - 60))) await almacen().borrar('cuadres', viejo.id);
  } catch (_) { /* el cuadre se enseña aunque no se guarde */ }
  try { await sombra().anotar({ tipo: 'cuadre', mensaje: res.cuadra ? 'cuadra' : 'NO cuadra' }); } catch (_) {}
  return { ok: true, ...guardado };
}

/** El cuadre del día, si todavía no hay uno de hoy. Solo con la sombra encendida. */
async function cuadreDelDia() {
  if (!sombraEncendida() || Supa.laBaseManda()) return;
  const hoy = diaMx(Date.now());
  const lista = await almacen().listar('cuadres').catch(() => []);
  if (lista.some(x => x.dia === hoy)) return;
  if (_area && _area !== 'direccion') return;
  /* Si la hoja o la base no contestan, se vuelve a intentar a la media hora, no cada minuto. */
  if (Date.now() - _cuadreIntentadoEn < MS_ENTRE_INTENTOS_DE_CUADRE) return;
  _cuadreIntentadoEn = Date.now();
  const r = await cuadrarAhora();
  if (!r.ok) { try { await sombra().anotar({ tipo: 'cuadre', mensaje: 'no se pudo: ' + r.mensaje }); } catch (_) {} }
}

/** Los cuadres guardados (los más nuevos primero) y la racha de días seguidos. */
export async function cuadres() {
  const lista = (await almacen().listar('cuadres').catch(() => [])).sort((a, b) => b.ts - a.ts);
  return { lista, racha: racha(lista), meta: 7 };
}

/**
 * La COPIA DIARIA hoja → nube (función importar-diario): lo último de `cuadre_diario` (0018), resumido para Ajustes
 * (cuadró X de 7 días, la racha y el último resultado). Solo la lee Dirección (RLS); null si todavía no hay ninguna corrida.
 * Lo pide Ajustes con la tarjeta de Supabase encendida y sesión; apagado, este módulo ni se carga.
 */
export async function cuadreDiario() {
  const c = await Supa.cliente();
  const { data, error } = await c.from('cuadre_diario').select('fecha, hecho_en, aplicado, cuadra, diferencias, conflictos, rechazos')
    .eq('empresa_id', _empresa).order('hecho_en', { ascending: false }).limit(60);
  if (error) throw new Error(Supa.mensajeDe(error));
  return resumenCopiaDiaria(data || [], diaMx(Date.now()));
}

/* ----- La lectura en vivo ----- */

/* `enBase`: con la base mandando, solo Realtime y la ventanilla; las filas las pone el relevo de la base. */
function encenderVivo(enBase = false) {
  if (_fuente || _enBase) return;
  _enBase = !!enBase;
  if (!enBase) {
    const marca = {
      leer: () => { try { return Number(localStorage.getItem(CLAVE_MARCA_ALMACEN)) || 0; } catch (_) { return 0; } },
      poner: v => { try { localStorage.setItem(CLAVE_MARCA_ALMACEN, String(v)); } catch (_) {} },
    };
    _fuente = crearFuente({ cliente: Supa.cliente, area: () => _area, empresa: _empresa, marca });
  }
  if (_fuente) Puente.fuenteDeLectura(_fuente);
  ponerVentanilla();
  _debeJalar = true;
  Supa.cliente().then(c => {
    if (!_fuente && !_enBase) return;
    /* Con la base mandando, también los gastos (0025): un gasto que otro teléfono captura o anula avisa como una venta. Con la hoja
       mandando no: esa bajada no los lee de la base. */
    _canal = suscribir(c, _area, () => { _debeJalar = true; if (_sincronizar) _sincronizar(); },
      { empresa: _empresa, gastos: _enBase, alEstado: e => { _estadoCanal = e; } });
  }).catch(() => {});
  if (_avisarApp) _avisarApp(lecturaEnVivo);
}

function apagarVivo() {
  Puente.fuenteDeLectura(null);
  quitarVentanilla();
  _fuente = null; _enBase = false;
  if (_canal) { _canal.cerrar(); _canal = null; }
  _estadoCanal = '';
  _debeJalar = true;
  if (_avisarApp) _avisarApp(null);
}

/** Lo que la app pregunta en cada vuelta de 30 s: ¿se salta la bajada? Solo con Realtime vivo, sin
 *  aviso pendiente y con una bajada hace menos de 5 minutos. */
export const lecturaEnVivo = {
  saltarJalar() {
    const ahora = Date.now();
    const salta = !!((_fuente || _enBase) && _canal && _canal.viva() && !_debeJalar && ahora - _ultimoJalar < MS_RESPALDO_VIVO);
    if (!salta) { _debeJalar = false; _ultimoJalar = ahora; }
    return salta;
  },
};

/* ----- Arrancar y apagar ----- */

/**
 * Lo llama app.js (solo con los interruptores encendidos) y Ajustes al encender algo.
 * @param {{sincronizar?:function(), avisarApp?:function(Object|null)}} [o]
 */
export async function arrancar(o = {}) {
  if (o.sincronizar) _sincronizar = o.sincronizar;
  if (o.avisarApp) _avisarApp = o.avisarApp;
  if (Supa.laBaseManda()) return arrancarBase();
  pararCotizaciones();                          // con la hoja mandando, el historial no sube (paso 4)
  if (_enBase) apagarVivo();                    // la empresa volvió a la hoja: fuera lo de la base
  if (!sombraEncendida()) { apagar(); return { sombra: false, vivo: false }; }

  /* La copia se guarda aunque todavía no haya sesión: nada de lo que la hoja aceptó se pierde, y
     sale en cuanto se entre a la base. Con la base mandando no se copia nada (ver la cabecera): el
     gancho se quita al cambiar de modo, y si una vuelta lo alcanza a medias, no encola. */
  Sync.alSubir(async (op, respuesta) => {
    if (Supa.laBaseManda()) return;
    await sombra().encolar(op, respuesta); programar(MS_TRAS_COPIA);
  });
  if (!_reloj) {
    _reloj = setInterval(() => { if (visible()) bombearSombra().catch(() => {}); }, MS_BOMBEO);
    try { globalThis.addEventListener('online', () => programar(MS_TRAS_COPIA)); } catch (_) {}
    /* El cotizador guardó el historial (en su marco o en otra pestaña): puede haber imágenes nuevas. */
    try { globalThis.addEventListener('storage', ev => { if (!ev.key || ev.key === CLAVE_HISTORIAL) _imgSucias = true; }); } catch (_) {}
  }
  _imgSucias = true;

  const haySesion = await Supa.haySesion();
  if (haySesion) await acceso();
  if (vivoEncendido() && haySesion && ['direccion', 'fabricacion', 'pagos'].includes(_area)) encenderVivo();
  else apagarVivo();
  programar(MS_TRAS_COPIA);
  return { sombra: true, vivo: !!_fuente };
}

/* La base manda: Realtime y la ventanilla con el área que dice la base; la sombra, quieta. */
async function arrancarBase() {
  Sync.alSubir(null);
  clearInterval(_reloj); _reloj = 0;
  clearTimeout(_programado);
  if (_fuente) apagarVivo();                    // la lectura en vivo de pruebas traía su propia fuente
  const haySesion = await Supa.haySesion();
  if (haySesion) await acceso();
  if (haySesion && ['direccion', 'fabricacion', 'pagos'].includes(_area)) encenderVivo(true);
  else apagarVivo();
  /* El historial del cotizador y sus imágenes (paso 4): la vuelta espera sola a que haya sesión. */
  arrancarCotizaciones();
  return { sombra: false, vivo: _enBase, base: true };
}

/** Desenchufa todo. La cola de la sombra se queda guardada (sale si se vuelve a encender). */
export function apagar() {
  Sync.alSubir(null);
  apagarVivo();
  pararCotizaciones();
  clearInterval(_reloj); _reloj = 0;
  clearTimeout(_programado);
}

/** Para la tarjeta de Ajustes. */
export async function estado() {
  const s = sombraEncendida() ? await sombra().estado() : { pendientes: 0, rechazadas: 0, ultimo_error: '' };
  return { sombra: sombraEncendida(), vivo: !!_fuente || _enBase, vivoPedido: vivoEncendido(), area: _area,
           canal: _estadoCanal, leeDeLaBase: Puente.leeDeOtraFuente() || _enBase, base: Supa.laBaseManda(), ...s };
}
export async function registro(n) { return sombraEncendida() ? sombra().registro(n) : []; }
export async function reintentarRechazadas() {
  const k = await sombra().reintentarRechazadas();
  const i = sombraEncendida() || Supa.laBaseManda() ? await imagenes().reintentarApartadas().catch(() => 0) : 0;
  const c = Supa.laBaseManda() ? await cotizaciones().reintentarApartadas().catch(() => 0) : 0;
  _imgSucias = true;
  if (Supa.laBaseManda()) { _cotSucias = true; programarBase(100); } else programar(100);
  return k + i + c;
}
