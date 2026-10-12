/* ============================================================================
   ESPEJO — la función que mantiene la hoja de Google como espejo de solo lectura de la base.

   La dispara quien la programe (un cron externo cada pocos minutos, o un webhook de la base) con un
   POST y el secreto compartido. Lee lo que cambió en las vistas `espejo_ventas` y `espejo_abonos` con
   la llave de servicio, arma lotes y se los manda a la ruta `espejo` del Apps Script
   (puente/hoja-apps-script.gs). La lógica de qué mandar y cómo está en _shared/espejo.js; el cable
   con la base, en ./base.js; aquí está el orden de las cosas, los reintentos y lo que se hace cuando
   algo sale mal. Todo lo de Deno está en index.ts: este archivo se prueba en node.

   ENTRADA   POST con el secreto en la cabecera  x-espejo-secreto  (ESPEJO_SECRETO_FUNCION) y, si se quiere,
             un cuerpo JSON de a lo más 4 KB:
                 { "modo": "incremental" | "completo",        (por omisión incremental)
                   "flujos": ["ventas", "abonos"],            (por omisión los dos; en «completo» siempre los dos)
                   "accion": "sincronizar" | "estado" }       («estado» no toca la hoja: lee los cursores)
             Sin secreto, o con otro: 401, lo mismo siempre, sin decir qué faltó. config.toml le pone
             verify_jwt = false (como a todas): lo que la protege es este secreto, no un JWT.

   SALIDA    200 { ok: true, modo, parcial, flujos, rechazadas, enviados, … }   la hoja quedó al día
             o hasta donde alcanzó el tiempo (`parcial`: la siguiente corrida sigue; no se pierde nada).
             Si algo falló, la misma forma con ok:false, un `codigo` y el estado que toca:
               507 CAPACIDAD_AGOTADA   la hoja ya no tiene filas libres (hay que subir FIN)
               409 ESPEJO_APAGADO      la hoja no tiene MODO_ESPEJO = si · ESQUEMA_INCOMPLETO
               422 DATO_INVALIDO       la hoja rechazó un lote sin decir cuáles filas (no se manda nada más)
               502 SIN_RED             la hoja no contestó, o contestó una página · AUTENTICACION_HOJA
               502 BASE_NO_CONTESTA    la base no contestó
               503 CONFIGURACION       falta una variable de entorno (se dice su NOMBRE, nunca su valor)

   LO QUE NO SE PIERDE
     · El cursor avanza SOLO después de que la hoja confirmó (ok:true) cada lote de la página. Un fallo en
       cualquier punto deja el cursor donde estaba, y la siguiente corrida vuelve a mandar desde ahí: la ruta
       es idempotente, así que repetir cuesta tiempo y nada más.
     · Una fila que la hoja rechaza (un valor que no vale) no frena a las demás: se aparta, se anota en
       `espejo:rechazadas` con su razón, el cursor sigue y la siguiente corrida COMPLETA la vuelve a intentar.
     · Si la hoja se queda sin filas libres, la corrida se detiene en ese lote y lo dice con 507: el cursor
       queda antes de las ventas que no cupieron, y en cuanto se sube FIN se mandan solas.
     · Cada llamada a la hoja se reintenta (3 intentos, con espera) si falló por la red, por una página de
       Google, por un 5xx o porque la hoja estaba ocupada.

   LA RECONCILIACIÓN COMPLETA («modo»: «completo») es lo que corrige lo que ningún cursor ve: una celda
   editada a mano en una fila que la base no volvió a tocar, o un cambio que solo movió `instalaciones`.
   Empieza el cursor de cero (si no había una a medias) y manda todo; como no cabe siempre en una corrida,
   se reanuda sola: mientras `espejo:completo` diga «en_curso», cualquier corrida sigue donde iba.

   deps: { fetch, ahora, dormir?, entorno, base, limites?, registrar? }
         `fetch` es el que sale a internet y SOLO se usa hacia ESPEJO_URL (que tiene que ser de
         script.google.com); `base` es el puerto de ./base.js; `ahora()` da milisegundos.
   ============================================================================ */

import { json, leerTexto, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, secretosDelEntorno } from '../_shared/entorno.js';
import {
  FLUJOS, GRUPOS, LIMITES, CLAVE_COMPLETO, CLAVE_RECHAZADAS, CLAVE_CORRIDA,
  secretoValido, leerCursor, textoDeCursor, compararCursores, pisoDelCursor, filaDeVentas, agruparAbonos,
  folioDe, sobrecargaDelCuerpo, armarLotes, cuerpoDeLote, clasificarRespuesta, SECRETO_MINIMO,
} from '../_shared/espejo.js';
import { esErrorDeBase } from './base.js';

/** Los nombres de las variables de entorno de esta función (los valores NUNCA salen). */
export const VARIABLES = Object.freeze({
  secretoFuncion: 'ESPEJO_SECRETO_FUNCION',   // el que presenta quien dispara la función (cabecera x-espejo-secreto)
  urlHoja: 'ESPEJO_URL',                      // la dirección /exec del Web App del Apps Script
  secretoHoja: 'ESPEJO_SECRETO',              // el de la ruta `espejo` del Apps Script (propiedad ESPEJO_SECRETO)
});
export const CABECERA_SECRETO = 'x-espejo-secreto';

const MAX_CUERPO = 4096;
const MODOS = ['incremental', 'completo'];
const ACCIONES = ['sincronizar', 'estado'];

/* ---------------------------------------------------------------------------
   CONFIGURACIÓN
   --------------------------------------------------------------------------- */

/** La dirección del Web App, o `{ ok:false }`. Solo https, solo script.google.com, sin usuario, contraseña ni
 *  puerto y con la forma de un despliegue (…/macros/s/<id>/exec): esta función sale a internet con lo que dice
 *  esta variable, y no tiene por qué salir a ningún otro lado. */
export function direccionDeLaHoja(texto) {
  let u;
  try { u = new URL(String(texto || '').trim()); } catch (_) { return { ok: false }; }
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com') return { ok: false };
  if (u.username !== '' || u.password !== '' || u.port !== '' || u.search !== '' || u.hash !== '') return { ok: false };
  if (!/^\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(u.pathname)) return { ok: false };
  return { ok: true, url: u.href };
}

/** Lo que la función necesita del entorno. `faltan` son NOMBRES de variables, nunca valores. */
export function leerConfig(entorno, limites) {
  const v = nombre => {
    try { const x = entorno(nombre); return typeof x === 'string' ? x : ''; } catch (_) { return ''; }
  };
  const faltan = [];
  const secretoFuncion = v(VARIABLES.secretoFuncion);
  const secretoHoja = v(VARIABLES.secretoHoja);
  const hoja = direccionDeLaHoja(v(VARIABLES.urlHoja));
  if (!hoja.ok) faltan.push(VARIABLES.urlHoja);
  if (secretoHoja.length < SECRETO_MINIMO) faltan.push(VARIABLES.secretoHoja);
  return { ...LIMITES, ...(limites || {}), secretoFuncion, secretoHoja, url: hoja.ok ? hoja.url : '', faltan };
}

/* ---------------------------------------------------------------------------
   LA RESPUESTA
   --------------------------------------------------------------------------- */

const CODIGO_DE = { capacidad: 'CAPACIDAD_AGOTADA', apagado: 'ESPEJO_APAGADO', esquema: 'ESQUEMA_INCOMPLETO',
                    invalido: 'DATO_INVALIDO', autenticacion: 'AUTENTICACION_HOJA', base: 'BASE_NO_CONTESTA' };
const STATUS_DE = { capacidad: 507, apagado: 409, esquema: 409, invalido: 422 };
const MENSAJE_DE = {
  capacidad: 'La hoja no tiene filas libres para todo lo que hay que mandar: sube FIN (y todos los $2:$310) y la siguiente corrida sigue sola.',
  apagado: 'La hoja todavía no es un espejo: falta MODO_ESPEJO = si en las propiedades del script.',
  esquema: 'A la hoja le faltan columnas o pestañas del puente: corre «Preparar la hoja para el puente».',
  invalido: 'La hoja rechazó un lote sin decir cuáles filas: no se manda nada más hasta revisarlo.',
  autenticacion: 'La hoja no aceptó el secreto (ESPEJO_SECRETO): no es el mismo que la propiedad del script.',
  base: 'La base no contestó.',
};

/** Del resultado de una corrida al estado HTTP y al cuerpo. */
export function respuestaDe(r) {
  if (r.ok) return { status: 200, cuerpo: r };
  const clase = r.error ? r.error.clase : '';
  const codigo = CODIGO_DE[clase] || 'SIN_RED';
  const mensaje = r.error && r.error.mensaje ? r.error.mensaje : (MENSAJE_DE[clase] || 'La hoja no contestó.');
  const extra = { ...(clase === 'capacidad' ? { capacidad_agotada: true } : {}), ...(codigo === 'SIN_RED' ? { transitorio: true } : {}) };
  return { status: STATUS_DE[clase] || 502, cuerpo: { ...r, ...sobreDeError(codigo, mensaje, extra) } };
}

/* ---------------------------------------------------------------------------
   LA CORRIDA
   --------------------------------------------------------------------------- */

const compacto = ms => new Date(ms).toISOString().replace(/[-:.]/g, '').slice(0, 15);
const SUMABLES = ['nuevas', 'cambiadas', 'sin_cambio', 'celdas', 'agregados', 'reescritos', 'borrados'];

function sumar(salida, resultadoLote) {
  for (const parte of [resultadoLote.ventas, resultadoLote.abonos]) {
    if (!parte) continue;
    for (const k of SUMABLES) if (typeof parte[k] === 'number') salida.hoja[k] = (salida.hoja[k] || 0) + parte[k];
  }
}

const llaveDe = (flujo, folio) => flujo.tipo + ':' + String(folio || '').trim().toUpperCase();

function rechazar(ctx, flujo, folio, por) {
  ctx.rechazadas.set(llaveDe(flujo, folio), { g: flujo.tipo, f: String(folio || '').trim().toUpperCase().slice(0, 30), p: String(por || '').slice(0, 100) });
  ctx.rechazadasCambiaron = true;
}
function quitarRechazo(ctx, flujo, folio) {
  if (ctx.rechazadas.delete(llaveDe(flujo, folio))) ctx.rechazadasCambiaron = true;
}

/** Una llamada a la hoja, con sus reintentos. Devuelve la clasificación de la respuesta (clasificarRespuesta) o
 *  `{ clase: 'presupuesto' }` si no alcanzó el tiempo. Los reintentos son seguros: la ruta es idempotente. */
async function llamarHoja(ctx, cuerpo) {
  const { cfg, deps } = ctx;
  let ultima = null;
  for (let intento = 1; intento <= cfg.intentos; intento++) {
    const espera = Math.min(cfg.esperaPorLlamadaMs, cfg.limiteDuroMs - (ctx.ahora() - ctx.t0));
    if (ctx.vencido() || espera < 2_000) return { clase: 'presupuesto', reintentable: false };
    let entrada;
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), espera);
    try {
      const res = await deps.fetch(cfg.url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo, redirect: 'follow', signal: ctrl.signal,
      });
      const texto = await res.text();
      let cuerpoJson = null;
      try { cuerpoJson = JSON.parse(texto); } catch (_) { /* una página de Google, no JSON */ }
      entrada = { http: res.status, json: cuerpoJson };
    } catch (e) {
      entrada = { error: e };
    } finally { clearTimeout(reloj); }
    const c = clasificarRespuesta(entrada);
    if (c.clase === 'ok' || !c.reintentable) return c;
    ultima = c;
    if (intento < cfg.intentos) {
      const pausa = cfg.esperasMs[Math.min(intento - 1, cfg.esperasMs.length - 1)] || 1_000;
      if (ctx.restante() <= pausa) break;
      await ctx.dormir(pausa);
    }
  }
  return { ...(ultima || { clase: 'red', mensaje: 'sin respuesta' }), agotado: true };
}

/** Manda un lote. Si la hoja rechaza FILAS (DATO_INVALIDO con la lista), las aparta, anota su razón y vuelve a
 *  mandar el resto: una fila mala no frena a las demás. Cualquier otro rechazo sube como `fallo`. */
async function enviarLote(ctx, flujo, elementos, salida) {
  const { cfg } = ctx;
  for (let ronda = 0; ronda <= cfg.rondasDeAislamiento; ronda++) {
    if (!elementos.length) return { ok: true };
    const id = 'esp-' + compacto(ctx.t0) + '-' + String(++ctx.nLote).padStart(3, '0');
    const c = await llamarHoja(ctx, cuerpoDeLote({ secreto: cfg.secretoHoja, tipo: flujo.tipo, elementos, id, modo: ctx.modo }));
    if (c.clase === 'ok') {
      sumar(salida, c.resultado);
      salida.lotes++;
      ctx.enviados += elementos.length;
      for (const e of elementos) quitarRechazo(ctx, flujo, folioDe(e));
      return { ok: true };
    }
    if (c.clase === 'presupuesto') return { parcial: true };
    if (c.clase === 'invalido' && c.rechazadas.length) {
      const malos = new Set(c.rechazadas.map(x => String((x && x.folio) || '').trim().toUpperCase()));
      const quedan = elementos.filter(e => !malos.has(folioDe(e)));
      if (quedan.length < elementos.length) {
        for (const x of c.rechazadas) rechazar(ctx, flujo, x && x.folio, x && x.por);
        elementos = quedan;
        continue;
      }
    }
    return { fallo: c };
  }
  return { fallo: { clase: 'invalido', codigo: 'DATO_INVALIDO', mensaje: 'La hoja siguió rechazando filas después de apartarlas.', reintentable: false } };
}

/** Corta la página en lotes (por filas y por caracteres) y los manda en orden. */
async function enviarElementos(ctx, flujo, elementos, salida) {
  const { cfg } = ctx;
  const sobre = sobrecargaDelCuerpo(cfg.secretoHoja, { id: 'esp-00000000T000000-000', modo: ctx.modo });
  const deAbonos = flujo.tipo === 'abonos';
  const { lotes, grandes } = armarLotes(elementos, {
    maxElementos: cfg.tamPagina, maxCaracteres: cfg.maxCaracteres, sobrecarga: sobre,
    ...(deAbonos ? { filasDe: g => g.abonos.length, maxFilas: cfg.maxFilasAbonos } : {}),
  });
  for (const g of grandes) rechazar(ctx, flujo, folioDe(g), 'la fila pesa demasiado para un lote');
  for (const lote of lotes) {
    const r = await enviarLote(ctx, flujo, lote, salida);
    if (r.parcial || r.fallo) return r;
  }
  return { ok: true };
}

/* Lo que de un fallo de la hoja se queda en la respuesta: la clase, el código y el mensaje, y lo que ayuda a arreglarlo
   (qué filas no cupieron, qué filas rechazó). Nunca el cuerpo entero de lo que contestó la hoja. */
function errorPublico(c, flujo) {
  const e = { clase: c.clase, codigo: c.codigo || '', mensaje: String(c.mensaje || '').slice(0, 300), flujo };
  if (c.agotado) e.agotado = true;
  const d = c.detalle || {};
  if (c.clase === 'capacidad') e.capacidad = { ventas: d.ventas || null, abonos: d.abonos || null };
  if (c.clase === 'invalido') { e.motivo = c.motivo || ''; e.rechazadas = (c.rechazadas || []).slice(0, 20); }
  return e;
}

const foliosDe = filas => [...new Set(filas.map(f => String(f.a_folio ?? '').trim().toUpperCase()).filter(Boolean))];

/** Recorre un flujo desde su cursor, página por página: lee, manda, y SOLO entonces guarda el cursor. */
async function correrFlujo(ctx, nombre) {
  const { cfg, base } = ctx;
  const f = FLUJOS[nombre];
  const salida = { paginas: 0, lotes: 0, elementos: 0, hoja: {}, alDia: false, parcial: false, error: null, cursor: null };
  let guardado = leerCursor((ctx.cursores[f.clave] || {}).texto);
  let pos = guardado ? { piso: pisoDelCursor(guardado, cfg.solapeMs) } : null;
  for (;;) {
    /* Sin tiempo, o con más páginas de las que una corrida tiene por qué leer (una base que no respetara el
       cursor daría vueltas para siempre): se detiene, y la siguiente sigue donde quedó el cursor. */
    if (ctx.vencido() || salida.paginas >= cfg.maxPaginas) { salida.parcial = true; ctx.parcial = true; break; }
    const filas = await base.leerPagina(f, pos, cfg.tamPagina);
    salida.paginas++;
    if (!filas.length) { salida.alDia = true; break; }
    const elementos = f.tipo === 'ventas'
      ? filas.map(filaDeVentas)
      : agruparAbonos(await base.leerAbonosDeFolios(foliosDe(filas)));
    salida.elementos += elementos.length;
    if (elementos.length) {
      const r = await enviarElementos(ctx, f, elementos, salida);
      if (r.parcial) { salida.parcial = true; ctx.parcial = true; break; }
      if (r.fallo) { salida.error = errorPublico(r.fallo, nombre); break; }
    }
    /* La página entera está confirmada: ahora sí avanza el cursor, y nunca hacia atrás. */
    const ultima = filas[filas.length - 1];
    const nuevo = { ts: String(ultima[f.ts]), id: String(ultima[f.id]) };
    if (compararCursores(nuevo, guardado, !!f.idNumerico) > 0) {
      await base.guardarCursor(f.clave, textoDeCursor(nuevo));
      guardado = nuevo;
    }
    salida.cursor = textoDeCursor(guardado);
    pos = { ts: nuevo.ts, id: nuevo.id };
    if (filas.length < cfg.tamPagina) { salida.alDia = true; break; }
  }
  if (!salida.cursor && guardado) salida.cursor = textoDeCursor(guardado);
  return salida;
}

const leerJson = texto => { try { return JSON.parse(texto); } catch (_) { return null; } };

/** Una corrida: lee los cursores, recorre los flujos pedidos, manda un latido si no hubo nada que mandar, y deja
 *  anotado cómo quedó todo. NO lanza por lo que contesta la hoja: lo devuelve en `error`. */
export async function sincronizar(deps, cfg, { modo = 'incremental', flujos = ['ventas', 'abonos'] } = {}) {
  const ahora = () => Number(deps.ahora());
  const dormir = deps.dormir || (ms => new Promise(r => setTimeout(r, ms)));
  const t0 = ahora();
  const ctx = {
    deps, cfg, base: deps.base, ahora, dormir, t0, modo, nLote: 0, enviados: 0, parcial: false, cursores: {},
    rechazadas: new Map(), rechazadasCambiaron: false,
    vencido: () => ahora() - t0 >= cfg.presupuestoMs,
    restante: () => cfg.presupuestoMs - (ahora() - t0),
  };
  const pedidos = modo === 'completo' ? ['ventas', 'abonos'] : flujos;
  const aRecorrer = pedidos.flatMap(g => GRUPOS[g]).filter(n => modo !== 'completo' || n !== 'ventas_dinero');
  const resultado = { ok: true, modo, parcial: false, inicio: new Date(t0).toISOString(), duracion_ms: 0, flujos: {},
                      enviados: 0, latido: false, rechazadas: [], error: null };
  try {
    ctx.cursores = await ctx.base.leerCursores();
    for (const x of leerJson((ctx.cursores[CLAVE_RECHAZADAS] || {}).texto) || []) {
      if (x && x.g && x.f) ctx.rechazadas.set(x.g + ':' + x.f, x);
    }
    const estadoCompleto = String((ctx.cursores[CLAVE_COMPLETO] || {}).texto || '').split('|')[0];

    /* «Completo» empieza de cero salvo que ya haya una a medias: así una que no cupo en una corrida se reanuda. */
    if (modo === 'completo' && estadoCompleto !== 'en_curso') {
      for (const n of aRecorrer) { await ctx.base.guardarCursor(FLUJOS[n].clave, ''); ctx.cursores[FLUJOS[n].clave] = { texto: '' }; }
      await ctx.base.guardarCursor(CLAVE_COMPLETO, 'en_curso|' + resultado.inicio);
      ctx.cursores[CLAVE_COMPLETO] = { texto: 'en_curso|' + resultado.inicio };
    }

    for (const n of aRecorrer) {
      if (ctx.vencido()) { ctx.parcial = true; break; }
      const salida = await correrFlujo(ctx, n);
      resultado.flujos[n] = salida;
      if (salida.error) {
        if (!resultado.error) resultado.error = salida.error;
        /* Lo que es de los datos o de la capacidad de UN flujo no impide correr los demás; lo que es de la hoja o
           de la red, sí: seguiría fallando igual. */
        if (salida.error.clase !== 'capacidad' && salida.error.clase !== 'invalido') break;
      }
    }

    /* Sin nada que mandar, un latido: la hoja pone su «última sincronización» y se comprueba el camino entero
       (dirección, secreto y MODO_ESPEJO) en cada corrida. */
    if (!resultado.error && !ctx.parcial && ctx.enviados === 0) {
      const c = await llamarHoja(ctx, cuerpoDeLote({ secreto: cfg.secretoHoja, tipo: '', elementos: [], id: 'latido-' + compacto(t0), modo }));
      resultado.latido = true;
      if (c.clase === 'presupuesto') ctx.parcial = true;
      else if (c.clase !== 'ok') resultado.error = errorPublico(c, 'latido');
    }

    resultado.parcial = ctx.parcial;
    resultado.enviados = ctx.enviados;
    resultado.rechazadas = [...ctx.rechazadas.values()].slice(0, 50).map(x => ({ flujo: x.g, folio: x.f, por: x.p }));
    resultado.ok = !resultado.error;

    /* Quedó al día en todos los flujos que se corrieron: la reconciliación completa, si había una en curso, terminó. */
    const todosAlDia = aRecorrer.every(n => resultado.flujos[n] && resultado.flujos[n].alDia);
    if (resultado.ok && todosAlDia && (modo === 'completo' || estadoCompleto === 'en_curso')) {
      await ctx.base.guardarCursor(CLAVE_COMPLETO, 'listo|' + new Date(ahora()).toISOString());
    }
  } catch (e) {
    if (esErrorDeBase(e)) {
      resultado.ok = false;
      resultado.error = { clase: 'base', codigo: 'BASE_NO_CONTESTA', mensaje: textoDeError(e) };
    } else throw e;
  }

  /* La ficha de la corrida. Si no se puede guardar, la corrida ya hecha no se deshace. */
  resultado.duracion_ms = ahora() - t0;
  try {
    if (ctx.rechazadasCambiaron) {
      const lista = [...ctx.rechazadas.values()].slice(0, cfg.maxRechazadas);
      await ctx.base.guardarCursor(CLAVE_RECHAZADAS, lista.length ? JSON.stringify(lista) : '');
    }
    const anterior = leerJson((ctx.cursores[CLAVE_CORRIDA] || {}).texto) || {};
    await ctx.base.guardarCursor(CLAVE_CORRIDA, JSON.stringify({
      t: new Date(ahora()).toISOString(), ok: resultado.ok, modo, enviados: resultado.enviados, parcial: resultado.parcial,
      ultimo_ok: resultado.ok ? new Date(ahora()).toISOString() : (anterior.ultimo_ok || null),
      error: resultado.error ? { codigo: resultado.error.codigo || resultado.error.clase, mensaje: String(resultado.error.mensaje || '').slice(0, 200) } : null,
    }));
  } catch (_) { /* la ficha es informativa */ }
  return resultado;
}

/** El estado de la función sin tocar la hoja: dónde van los cursores, la reconciliación completa y lo rechazado. */
export async function estadoDelEspejo(deps) {
  const cursores = await deps.base.leerCursores();
  const flujos = {};
  for (const [n, f] of Object.entries(FLUJOS)) {
    const c = cursores[f.clave];
    flujos[n] = { cursor: c && c.texto ? c.texto : null, actualizado: c ? c.updated_at : null };
  }
  const [estado, desde] = String((cursores[CLAVE_COMPLETO] || {}).texto || '').split('|');
  return {
    ok: true, ahora: new Date(Number(deps.ahora())).toISOString(), flujos,
    completo: { estado: estado || null, desde: desde || null },
    rechazadas: (leerJson((cursores[CLAVE_RECHAZADAS] || {}).texto) || []).map(x => ({ flujo: x.g, folio: x.f, por: x.p })),
    corrida: leerJson((cursores[CLAVE_CORRIDA] || {}).texto),
  };
}

/* ---------------------------------------------------------------------------
   LA PUERTA HTTP
   --------------------------------------------------------------------------- */

const SIN_SESION = () => sobreDeError('SIN_SESION', 'No autorizado.');
const datoInvalido = mensaje => sobreDeError('DATO_INVALIDO', mensaje);

function leerPedido(texto) {
  if (texto.trim() === '') return { ok: true, pedido: { modo: 'incremental', flujos: ['ventas', 'abonos'], accion: 'sincronizar' } };
  let c;
  try { c = JSON.parse(texto); } catch (_) { return { ok: false, mensaje: 'El cuerpo no es JSON.' }; }
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return { ok: false, mensaje: 'El cuerpo es un objeto JSON.' };
  for (const k of Object.keys(c)) {
    if (k !== 'modo' && k !== 'flujos' && k !== 'accion') return { ok: false, mensaje: 'El cuerpo solo admite «modo», «flujos» y «accion».' };
  }
  const modo = c.modo === undefined ? 'incremental' : c.modo;
  const accion = c.accion === undefined ? 'sincronizar' : c.accion;
  const flujos = c.flujos === undefined ? ['ventas', 'abonos'] : c.flujos;
  if (!MODOS.includes(modo)) return { ok: false, mensaje: 'El modo es «incremental» o «completo».' };
  if (!ACCIONES.includes(accion)) return { ok: false, mensaje: 'La acción es «sincronizar» o «estado».' };
  if (!Array.isArray(flujos) || !flujos.length || !flujos.every(x => x === 'ventas' || x === 'abonos')) {
    return { ok: false, mensaje: 'Los flujos son «ventas» y «abonos».' };
  }
  return { ok: true, pedido: { modo, accion, flujos: [...new Set(flujos)] } };
}

export async function manejar(peticion, deps) {
  const entorno = (deps && deps.entorno) || (() => undefined);
  /* Lo que no puede salir en una respuesta ni en el registro: lo de siempre (las llaves de Supabase), los dos secretos
     del espejo y la dirección del despliegue de la hoja (con ella y el secreto se llama a la ruta). */
  const secretos = [...secretosDelEntorno(entorno), ...[VARIABLES.secretoFuncion, VARIABLES.secretoHoja, VARIABLES.urlHoja].map(n => { try { return entorno(n); } catch (_) { return undefined; } })]
    .filter(s => typeof s === 'string' && s.length >= 8);
  try {
    const previo = previa(peticion, { metodos: ['POST'] });
    if (previo) return previo;

    const cfg = leerConfig(entorno, deps && deps.limites);
    /* La puerta: el secreto de la función, en tiempo constante. Falte, esté mal o sea corto, es la misma respuesta. */
    if (!secretoValido(peticion.headers.get(CABECERA_SECRETO) || '', cfg.secretoFuncion)) {
      return json(peticion, 401, SIN_SESION(), { secretos });
    }

    const t = await leerTexto(peticion, MAX_CUERPO);
    if (!t.ok) return json(peticion, 400, datoInvalido(t.motivo === 'demasiado_grande' ? 'El cuerpo es demasiado grande.' : 'El cuerpo no se pudo leer.'), { secretos });
    const p = leerPedido(t.texto);
    if (!p.ok) return json(peticion, 400, datoInvalido(p.mensaje), { secretos });

    if (p.pedido.accion === 'estado') {
      return json(peticion, 200, await estadoDelEspejo(deps), { secretos });
    }
    if (cfg.faltan.length) {
      registrar(deps, 'espejo', 'error', 'entorno', { faltan: cfg.faltan }, secretos);
      return json(peticion, 503, sobreDeError('CONFIGURACION', 'La función no está configurada por completo: ' + cfg.faltan.join(', ') + '.'), { secretos });
    }

    const r = await sincronizar(deps, cfg, p.pedido);
    registrar(deps, 'espejo', r.ok ? 'info' : 'error', 'corrida', {
      ok: r.ok, modo: r.modo, parcial: r.parcial, enviados: r.enviados, ms: r.duracion_ms, rechazadas: r.rechazadas.length,
      ...(r.error ? { clase: r.error.clase, codigo: r.error.codigo } : {}),
    }, secretos);
    const { status, cuerpo } = respuestaDe(r);
    return json(peticion, status, cuerpo, { secretos });
  } catch (e) {
    const config = esErrorDeEntorno(e);
    registrar(deps, 'espejo', 'error', config ? 'entorno' : 'inesperado', { detalle: textoDeError(e) }, secretos);
    return config
      ? json(peticion, 503, sobreDeError('CONFIGURACION', 'La función no está configurada por completo.'), { secretos })
      : json(peticion, 500, sobreDeError('DESCONOCIDO', 'La función falló procesando eso.'), { secretos });
  }
}
