/* ============================================================================
   PANTALLA — la TV del taller (pedida por Elías el 2026-10-24): las obras por etapa, las
   próximas instalaciones y quién va tarde. SIN DINERO, porque la ve todo el equipo.

   POST, con un cuerpo JSON (text/plain o application/json: la TV manda text/plain para no pedir
   preflight, y un navegador viejo de TV no siempre lo hace bien):
       { accion: 'pedir' }               → 200 { ok:true, secreto, codigo, vence }
       { accion: 'tablero', secreto }    → 200 { ok:true, estado:'pendiente', codigo, vence }
                                           200 { ok:true, estado:'vencida' | 'revocada' }
                                           200 { ok:true, estado:'activa', nombre, hoy, actualizado, estaciones, proximas, resumen }
                                           200 { ok:false, codigo:'NO_ENCONTRADO', … }  (esta TV ya no existe para la base)

   CÓMO SE VINCULA (ver supabase/migrations/0022_pantallas.sql, que es la otra mitad)
   Al pedir, ESTA función inventa el secreto (32 bytes al azar) y el código de 6 letras. El
   secreto se lo queda la TV; a la base solo le llega su huella sha256 (`pantalla_solicitar`).
   Dirección escribe el código en la app (`pantalla_aprobar`, con su sesión). Desde ahí la TV
   manda su secreto en cada vuelta; aquí se le saca la huella y se pregunta por ella
   (`pantalla_tablero`). El secreto viaja en el CUERPO, nunca en la dirección: una URL se queda en
   historiales y registros.

   LOS ATRASOS NO SE CALCULAN AQUÍ: los calcula `Taller.ventanaTaller()` de js/datos/taller.js,
   el MISMO archivo que usa el Tablero de la app (entra al paquete de desplegar/armar.mjs). Dos
   reglas para «¿va tarde?» darían dos respuestas, y la que se ve sería la que nadie probó. Esto
   solo arma lo que lee: el proyecto como lo ve la app, su instalación viva (la primera en el
   orden del día, como `Agenda.listar({vivas})`) y las dos constantes del plazo.

   LO QUE SALE HACIA LA TV, Y NADA MÁS: por obra, su nombre y negocio, la etapa, el estado de la
   ventana (a_tiempo, justo, tarde, no_llega, sin_fecha), los días de atraso, el texto en español
   que ya trae la ventana y la fecha de su instalación. La base ya no manda dinero (0022 lee solo
   columnas de Fabricación); las piezas de la cotización, que sí manda para el plazo sugerido, se
   quedan aquí.

   LA ORDEN DE TRABAJO (Elías, 2026-10-24: «que la hoja de fabricación del proyecto también aparezca»): de cada obra
   en diseño, corte o armado que trae su cotización en la nube, sus piezas con medidas (ver `pieza`), el límite de
   fabricación, la nota y el plano, con una liga FIRMADA de Storage de una hora (el bucket es privado). La TV la enseña
   rotando con el tablero. Sin precios: la base ya no los manda y `pieza` solo lee tipo, medidas y textos.

   deps: { ahora, clienteBase, entorno, azar?, firmar?, registrar? }  (`azar(n)` → Uint8Array; por omisión
         crypto.getRandomValues, que traen Deno y node. `firmar(bucket, ruta, segundos)` → la liga firmada o null;
         sin ella, las órdenes salen sin plano)
   ============================================================================ */

import { errorInterno, ipDeLaPeticion, json, leerTexto, previa, registrar, sobreDeError, textoDeError, crearLimitador } from '../_shared/http.js';
import { esErrorDeEntorno, secretosDelEntorno } from '../_shared/entorno.js';
import { ventanaTaller } from '../../../js/datos/taller.js';
import { ETAPAS, ETAPA_NOMBRE } from '../../../js/datos/proyectos.js';

export const MAX_CUERPO = 2048;
/* Sin letras que se confundan en una TV vista de lejos (I, L, O, 0 y 1). Es la misma lista que el CHECK de 0022. */
export const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/* Las estaciones: las etapas de la línea, hasta «listo», como `ESTACIONES` de js/mod/tablero.js. */
export const ESTACIONES = ETAPAS.slice(0, ETAPAS.indexOf('listo') + 1);
/* El orden de las fichas de cada estación: lo que no llega primero y lo que no tiene fecha al final (`PESO` del Tablero). */
const PESO = { no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4 };
/* Las instalaciones que se anuncian: las que vienen, en las próximas dos semanas, y no más de ocho. */
const PROXIMAS_DIAS = 14, PROXIMAS_TOPE = 8;
const VIENEN = new Set(['propuesta', 'confirmada', 'reagendada']);
/* Las obras cuya ORDEN DE TRABAJO enseña la TV, rotando con el tablero (Elías, 2026-10-24: «en producción»). */
export const EN_PRODUCCION = ['en_diseno', 'cortado', 'armado'];
const TOPE_PIEZAS = 8;
/* El plano: de dónde y por cuánto tiempo vale la liga firmada (la TV pregunta cada minuto; se firma una vez y se reusa). */
export const BUCKET = 'cotizacion-imagenes';
const FIRMA_SEGUNDOS = 3600, FIRMA_REUSO_MS = 45 * 60 * 1000;
const ID_IMAGEN = /^[A-Za-z0-9_-]{1,64}$/;

/* Topes por IP, de mejor esfuerzo (ver crearLimitador): pedir código es raro; el tablero se pide cada minuto
   y, esperando aprobación, cada 5 s. */
const VENTANA_MS = 10 * 60 * 1000;

export function crearManejador() {
  let limPedir = null, limTablero = null;
  const firmadas = new Map();          // ruta → { url, hasta }: las ligas del plano, reusadas entre vueltas de la TV
  return async function manejar(peticion, deps) {
    const secretos = secretosDelEntorno(deps && deps.entorno);
    try {
      const previo = previa(peticion, { metodos: ['POST'] });
      if (previo) return previo;
      if (!limPedir) {
        limPedir = crearLimitador({ ahora: deps.ahora, maximo: 6, ventanaMs: VENTANA_MS });
        limTablero = crearLimitador({ ahora: deps.ahora, maximo: 240, ventanaMs: VENTANA_MS });
      }
      const t = await leerTexto(peticion, MAX_CUERPO);
      if (!t.ok) return json(peticion, 413, sobreDeError('DATO_INVALIDO', 'La petición es demasiado grande.', { definitivo: true }), { secretos });
      let cuerpo;
      try { cuerpo = JSON.parse(t.texto || '{}'); } catch (_) { cuerpo = null; }
      if (!cuerpo || typeof cuerpo !== 'object') return json(peticion, 400, sobreDeError('DATO_INVALIDO', 'Falta el cuerpo.', { definitivo: true }), { secretos });

      const ip = ipDeLaPeticion(peticion) || 'sin-ip';
      if (cuerpo.accion === 'pedir') {
        if (!await limPedir(ip)) return demasiadas(peticion, secretos);
        return await pedir(peticion, deps, secretos);
      }
      if (cuerpo.accion === 'tablero') {
        if (!await limTablero(ip)) return demasiadas(peticion, secretos);
        return await tablero(peticion, deps, secretos, cuerpo.secreto, firmadas);
      }
      return json(peticion, 400, sobreDeError('DATO_INVALIDO', 'No sé qué hacer con eso.', { definitivo: true }), { secretos });
    } catch (e) {
      const config = esErrorDeEntorno(e);
      registrar(deps, 'pantalla', 'error', config ? 'entorno' : 'inesperado', { detalle: textoDeError(e) }, secretos);
      if (config) return json(peticion, 503, sobreDeError('CONFIGURACION', 'La función no está configurada por completo.'), { secretos });
      return json(peticion, 500, errorInterno(), { secretos });
    }
  };
}

const demasiadas = (peticion, secretos) =>
  json(peticion, 429, sobreDeError('CUPO_AGOTADO', 'Demasiadas peticiones desde aquí. Espera unos minutos.', { transitorio: true }),
    { secretos, cabeceras: { 'Retry-After': '60' } });

const sinRed = (peticion, secretos) =>
  json(peticion, 503, sobreDeError('SIN_RED', 'La base no contestó.', { transitorio: true }), { secretos });

/* ----- Pedir un código ----- */
async function pedir(peticion, deps, secretos) {
  for (let intento = 0; intento < 4; intento++) {
    const secreto = base64url(azar(deps, 32));
    const codigo = codigoAlAzar(deps);
    const r = await deps.clienteBase.rpcServicio('pantalla_solicitar', { p_secreto_hash: await huella(secreto), p_codigo: codigo });
    if (r.error) {
      registrar(deps, 'pantalla', 'error', 'solicitar', { detalle: String(r.error.code || '') + ' ' + String(r.error.message || '') }, secretos);
      return sinRed(peticion, secretos);
    }
    const d = r.data || {};
    if (d.ok) return json(peticion, 200, { ok: true, secreto, codigo: d.codigo, vence: d.vence }, { secretos });
    if (d.codigo !== 'DUPLICADO') return json(peticion, d.codigo === 'CUPO_AGOTADO' ? 429 : 400, d, { secretos });
  }
  return sinRed(peticion, secretos);
}

/* ----- El tablero ----- */
async function tablero(peticion, deps, secretos, secreto, firmadas) {
  if (typeof secreto !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secreto)) {
    return json(peticion, 400, sobreDeError('DATO_INVALIDO', 'Falta el secreto de la pantalla.', { definitivo: true }), { secretos });
  }
  const r = await deps.clienteBase.rpcServicio('pantalla_tablero', { p_secreto_hash: await huella(secreto) });
  if (r.error) {
    registrar(deps, 'pantalla', 'error', 'tablero', { detalle: String(r.error.code || '') + ' ' + String(r.error.message || '') }, secretos);
    return sinRed(peticion, secretos);
  }
  const d = r.data || {};
  if (!d.ok) return json(peticion, 200, d, { secretos });
  if (d.estado === 'pendiente') return json(peticion, 200, { ok: true, estado: 'pendiente', codigo: d.codigo, vence: d.vence }, { secretos });
  if (d.estado !== 'activa') return json(peticion, 200, { ok: true, estado: d.estado }, { secretos });
  const v = vista(d);
  await firmarPlanos(v.ordenes, deps, firmadas || new Map(), secretos);
  return json(peticion, 200, v, { secretos });
}

/* Cambia la ruta de cada plano por una liga firmada de Storage (una hora), o null si no se pudo (la imagen todavía no
   está en la nube, o Storage no contestó): la TV enseña la orden sin plano y lo dice. Nunca hace fallar el tablero. */
async function firmarPlanos(ordenes, deps, firmadas, secretos) {
  const ahora = Number(deps.ahora());
  for (const o of ordenes) {
    const ruta = o.imagen_ruta;
    delete o.imagen_ruta;
    o.imagen = null;
    if (!ruta || typeof deps.firmar !== 'function') continue;
    const guardada = firmadas.get(ruta);
    if (guardada && guardada.hasta > ahora) { o.imagen = guardada.url; continue; }
    let url = null;
    try { url = await deps.firmar(BUCKET, ruta, FIRMA_SEGUNDOS); }
    catch (e) { registrar(deps, 'pantalla', 'aviso', 'firmar', { detalle: textoDeError(e) }, secretos); }
    if (typeof url === 'string' && /^https:\/\//.test(url)) {
      firmadas.set(ruta, { url, hasta: ahora + FIRMA_REUSO_MS });
      o.imagen = url;
    }
  }
}

/**
 * Lo que enseña la TV, a partir de lo que mandó `pantalla_tablero`. Pura: la prueba la llama directo.
 * @param {{nombre, hoy, actualizado, constantes, obras:Array, instalaciones:Array}} d
 */
export function vista(d) {
  const hoy = String(d.hoy || '');
  const cts = d.constantes || {};
  const obras = Array.isArray(d.obras) ? d.obras : [];
  const insts = (Array.isArray(d.instalaciones) ? d.instalaciones : []).slice().sort(ordenDia);

  /* La instalación viva de cada obra: la primera en el orden del día (la base ya quitó canceladas y borradas). */
  const instDe = new Map();
  for (const i of insts) if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);

  const fichas = obras.map(o => {
    const p = { id: o.id, nombre: o.nombre, etapa: o.etapa, tipo_trabajo: Array.isArray(o.tipo_trabajo) ? o.tipo_trabajo : [],
                fecha_ganado: o.fecha_ganado || null, plazo_k: o.plazo_k ?? null, origen: o.origen || null };
    const inst = instDe.get(o.id) || null;
    const v = ventanaTaller(p, inst, { hoy, cts });
    return {
      id: String(o.id), titulo: String(o.nombre || ''), negocio: String(o.negocio || ''), etapa: o.etapa,
      estado: v.estado, atraso_dias: v.atraso_dias || 0, texto: v.texto || '',
      instalacion: inst ? { fecha: inst.fecha, hora: inst.hora || null } : null,
    };
  });

  const estaciones = ESTACIONES.map(etapa => ({
    etapa, nombre: ETAPA_NOMBRE[etapa] || etapa,
    fichas: fichas.filter(f => f.etapa === etapa).sort((a, b) =>
      (PESO[a.estado] ?? 9) - (PESO[b.estado] ?? 9) ||
      String((a.instalacion && a.instalacion.fecha) || '9999').localeCompare(String((b.instalacion && b.instalacion.fecha) || '9999')) ||
      a.titulo.localeCompare(b.titulo, 'es')),
  }));

  const porId = new Map(obras.map(o => [o.id, o]));
  const limite = masDias(hoy, PROXIMAS_DIAS);
  const proximas = insts
    .filter(i => VIENEN.has(i.estado) && i.fecha >= hoy && i.fecha <= limite && porId.has(i.proyecto_id))
    .slice(0, PROXIMAS_TOPE)
    .map(i => ({ fecha: i.fecha, hora: i.hora || null, ventana: i.ventana || 'dia', confirmada: i.estado === 'confirmada',
                 titulo: String(porId.get(i.proyecto_id).nombre || ''), negocio: String(porId.get(i.proyecto_id).negocio || '') }));

  /* Las órdenes de trabajo de lo que está en producción, en el orden del tablero (estación, luego PESO). Solo las que
     traen piezas: una obra que entró por la hoja no tiene cotización en la nube y no hay orden que enseñar. */
  const ordenes = [];
  for (const e of estaciones) {
    if (!EN_PRODUCCION.includes(e.etapa)) continue;
    for (const f of e.fichas) {
      const o = porId.get(f.id) || {}, origen = o.origen && typeof o.origen === 'object' ? o.origen : {};
      const items = (Array.isArray(origen.items) ? origen.items : []).filter(x => x && typeof x === 'object');
      if (!items.length) continue;
      const plano = items.map(x => x.plano).find(x => typeof x === 'string' && ID_IMAGEN.test(x)) ||
                    (Array.isArray(origen.renders) ? origen.renders : []).find(x => typeof x === 'string' && ID_IMAGEN.test(x)) || null;
      ordenes.push({
        id: f.id, titulo: f.titulo, negocio: f.negocio, etapa: f.etapa, etapa_nombre: e.nombre, estado: f.estado, texto: f.texto,
        limite: String(origen.entrega || '').trim(), nota: String(origen.notaCliente || '').trim(),
        piezas: items.slice(0, TOPE_PIEZAS).map(pieza), mas_piezas: Math.max(0, items.length - TOPE_PIEZAS),
        imagen_ruta: plano && d.empresa && o.folio_global ? d.empresa + '/' + o.folio_global + '/' + plano + '.jpg' : null,
      });
    }
  }

  return {
    ok: true, estado: 'activa', nombre: String(d.nombre || ''), hoy, actualizado: d.actualizado || null,
    resumen: { obras: fichas.length, tarde: fichas.filter(f => f.estado === 'tarde' || f.estado === 'no_llega').length,
               justo: fichas.filter(f => f.estado === 'justo').length },
    estaciones, proximas, ordenes,
  };
}

/* ----- Un renglón de la orden de trabajo -----
   La impresa la arma el cotizador (js/cotizador/entrega.js: `desc`, `med` y la columna «Pzas.» con `piezasDe` de
   js/cotizador/nucleo.js). Esas viven dentro del generador del PDF, que es un guion de página con su catálogo, así que
   aquí va la versión CORTA con las MISMAS reglas: el mismo nombre por tipo, las mismas medidas y las mismas piezas, y el
   mismo «Ojo» si el cliente todavía no elige entre opciones. Lo que no trae es el nombre de catálogo del material y del
   acabado. pruebas/supabase-pantalla.mjs compara estas reglas con las del cotizador. */
const TITULO = { letras: 'Letras Individuales 3D', recorte: 'Recorte de Acrílico', bastidor: 'Bastidor para Letras 3D', caja: 'Caja de Luz' };
const cifra = v => { const x = Number(v); return isFinite(x) ? x : 0; };

export function pieza(it) {
  const tipo = it.tipo, detalle = [];
  if (tipo === 'letras') detalle.push(it.luz ? 'Con iluminación LED ' + (it.ilumTipo === 'calida' ? 'cálida (3000K)' : 'fría (6500K)') : 'Sin iluminación');
  if (tipo === 'caja') detalle.push('Caras en acrílico con iluminación LED fría');
  if (typeof it.desc === 'string' && it.desc.trim()) detalle.push(it.desc.trim());
  const op = it.opciones;
  if (op && typeof op === 'object' && Array.isArray(op.lista) && op.lista.length >= 2) detalle.push('Ojo: el cliente aún no elige entre ' + op.lista.length + ' opciones');
  const medidas = tipo === 'letras' ? cifra(it.altura) + 'cm alt.'
                : tipo === 'recorte' ? cifra(it.altura) + 'cm × pieza'
                : (tipo === 'bastidor' || tipo === 'caja') ? cifra(it.ancho) + '×' + cifra(it.alto) + ' cm' : '—';
  const piezas = (tipo === 'letras' || tipo === 'recorte') ? cifra(it.n || 0) : (tipo === 'bastidor' || tipo === 'caja') ? 1 : cifra(it.pz || 1);
  return { titulo: TITULO[tipo] || detalle.shift() || '—', detalle: detalle.join('. '), medidas, piezas };
}

/* El orden del día de js/datos/agenda.js (`ordenDia`): por fecha, las que tienen hora antes, por hora. */
function ordenDia(a, b) {
  return String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
    (a.hora ? 0 : 1) - (b.hora ? 0 : 1) ||
    String(a.hora || '').localeCompare(String(b.hora || ''));
}

function masDias(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return f.toISOString().slice(0, 10);
}

/* ----- El azar y la huella ----- */
function azar(deps, n) {
  if (deps && typeof deps.azar === 'function') return deps.azar(n);
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/* Seis letras sin sesgo: se descarta el byte que caería en la parte de 256 que no reparte parejo. */
function codigoAlAzar(deps) {
  let codigo = '';
  const tope = 256 - (256 % ALFABETO.length);
  while (codigo.length < 6) {
    for (const b of azar(deps, 12)) {
      if (b < tope && codigo.length < 6) codigo += ALFABETO[b % ALFABETO.length];
    }
  }
  return codigo;
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function huella(texto) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

export const manejar = crearManejador();
