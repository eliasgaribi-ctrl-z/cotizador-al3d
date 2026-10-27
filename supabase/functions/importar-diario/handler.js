/* ============================================================================
   IMPORTAR-DIARIO — la copia automática de cada madrugada: hoja → base, y su cuadre.

   Decidido por Elías el 2026-10-16 (docs/DECISIONES-SUPABASE.md, «Transición»): el equipo sigue
   capturando en la hoja, así que la nube se pone al día una vez al día con la hoja ENTERA, con el
   mismo importador de la fase 2. Cada corrida deja su renglón en `cuadre_diario` (0018) y Ajustes
   enseña «cuadró X de 7 días». El día que Elías diga: última copia, la hoja a solo lectura y el
   equipo pasa a la plataforma.

   ENTRADA   POST con el secreto en la cabecera  x-importar-secreto  (IMPORTAR_SECRETO, 32+ caracteres)
             y, de cuerpo, el volcado de la hoja en el formato de puente/volcado-para-importar.gs
             («al3d-volcado» v1), que arma y manda puente/copia-diaria.gs. Hasta 15 MB.
   SALIDA    200 { ok:true, id, fecha, aplicado, cuadra, diferencias, conflictos, rechazos, ventas, duracion_ms, motivo, modo,
                   autorizaciones:{ comprobadas, no_entran } }
                 aplicado:false cuando el plan trae conflictos o filas que no entran (motivo 'conflictos'; no se escribe nada; se
                 anota igual), o cuando la base manda (motivo 'modo_base': la copia ya solo cuadra)
                 modo: 'base' | 'hoja' | null, quién manda según la base; la hoja lo anota (copia-diaria.gs, puente-sheets-17)
             502 { ok:false, codigo:'BASE_RECHAZO', … , error:{codigo, tabla?, restriccion?} }  la copia tronó en la base y se
                 deshizo ENTERA; el fallo quedó anotado en cuadre_diario
             503 CONFIGURACION      falta IMPORTAR_SECRETO (o es corto) o SUPABASE_DB_URL: NO hace nada
             401 SIN_SESION         sin el secreto o con otro (siempre igual, no dice qué faltó)
             400/413 DATO_INVALIDO  el cuerpo no es un volcado, es viejo (más de 36 h) o pasa de 15 MB
             409 OCUPADA            otra copia está corriendo (candado en la base): esta no hizo nada
             502 BASE_NO_CONTESTA   ni siquiera se pudo anotar el fallo

   EL RESPALDO SEMANAL (decidido 2026-10-17 para que Elías no tenga que mover secretos; respaldo.js): con el MISMO
   secreto y el cuerpo { "formato": "al3d-pedir-respaldo", "version": 1 }, la función contesta la base entera:
             200 el archivo «al3d-respaldo-1» tal cual (application/json), con x-respaldo-nombre, x-respaldo-sha256,
                 x-respaldo-bytes y x-respaldo-filas; leído en una transacción de solo lectura (repeatable read)
             413 RESPALDO_GRANDE    pasa de 45 MB (UrlFetchApp no recibe más de 50): no se manda nada
             502 BASE_NO_CONTESTA   la base no contestó
   Lo pide y lo guarda en Drive puente/copia-diaria.gs (respaldarSemanal). No escribe nada en la base.

   Lo que NUNCA sale, ni en la respuesta ni en el registro: un nombre, un teléfono o un importe de un
   cliente (solo cuentas, folios V-### y columnas), el secreto y la dirección de la base (que lleva la
   contraseña).

   LAS AUTORIZACIONES (decidido 2026-10-17 para que Elías no tenga que mover secretos): la clave del sello
   no sale de las propiedades del script de la hoja. La hoja comprueba cada fila de «Autorizaciones» con
   ella (copia-diaria.gs, con las funciones de Código.gs que usa /verificar) y el volcado trae por fila
   { firma_ok, codificacion, canon }. Esta función —y solo ella, ya con el secreto comprobado— le pide al
   importador que crea ese veredicto (aceptarVeredictosDeLaHoja). Entran las firma_ok:true cuyo texto
   firmado es EXACTAMENTE el que se guarda; las demás se cuentan en `autorizaciones.no_entran` y en el
   renglón de cuadre_diario (número de fila y motivo), sin frenar la copia.

   deps: { ahora, entorno, semilla, abrirBase(url) → { transaccion, cerrar }, registrar? }
   ============================================================================ */

import { json, leerTexto, previa, registrar, sobreDeError } from '../_shared/http.js';
import { secretoValido } from '../_shared/respaldo.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { copiar, CopiaOcupada, ErrorDeCopia, errorSinDatos } from './copia.js';
import { esPedidoDeRespaldo, exportar, paquete, origenDe, RespaldoGrande, TOPE_RESPALDO } from './respaldo.js';

export const VARIABLES = Object.freeze({ secreto: 'IMPORTAR_SECRETO', base: 'SUPABASE_DB_URL' });
export const CABECERA_SECRETO = 'x-importar-secreto';
/* Lo que acompaña al respaldo (en minúsculas: así llegan por HTTP/2; el .gs las busca sin distinguir). Ninguna lleva datos. */
export const CABECERAS_RESPALDO = Object.freeze({ nombre: 'x-respaldo-nombre', sha256: 'x-respaldo-sha256', bytes: 'x-respaldo-bytes', filas: 'x-respaldo-filas' });
export const SECRETO_MINIMO = 32;
export const MAX_CUERPO = 15 * 1024 * 1024;
export const VIGENCIA_MS = 36 * 3600 * 1000;       // un volcado de hace más de 36 horas no se aplica (un reenvío viejo pisaría lo nuevo)
export const ADELANTO_MS = 10 * 60 * 1000;          // ni uno «del futuro» (relojes)
const FUNCION = 'importar-diario';

const leerVar = (entorno, n) => { try { const x = entorno(n); return typeof x === 'string' ? x : ''; } catch (_) { return ''; } };

/* Lo que no puede salir: el secreto, la dirección de la base entera y su contraseña (también como viene escrita en la dirección). */
function secretosDeEsta(entorno) {
  const s = [];
  const sec = leerVar(entorno, VARIABLES.secreto);
  if (sec.length >= 8) s.push(sec);
  const url = leerVar(entorno, VARIABLES.base);
  if (url.length >= 8) {
    s.push(url);
    try { const u = new URL(url); if (u.password) { s.push(u.password); try { s.push(decodeURIComponent(u.password)); } catch (_) { /* tal cual basta */ } } }
    catch (_) { /* sin forma de URL, basta con la cadena entera */ }
  }
  return s;
}

/** ¿Es un volcado que se puede aplicar? null si sí; si no, por qué (sin citar su contenido). */
export function problemaDelVolcado(v, ahoraMs) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.formato !== 'al3d-volcado' || v.version !== 1) {
    return 'El cuerpo no es un volcado «al3d-volcado» versión 1 (el que arma puente/copia-diaria.gs).';
  }
  if (!v.pestanas || typeof v.pestanas !== 'object' || !Array.isArray(v.pestanas['Ventas']) || !v.pestanas['Ventas'].length) {
    return 'El volcado no trae la pestaña «Ventas».';
  }
  const hecho = Date.parse(String(v.hecho || ''));
  if (!Number.isFinite(hecho)) return 'El volcado no dice cuándo se hizo.';
  if (ahoraMs - hecho > VIGENCIA_MS) return 'El volcado tiene más de 36 horas: no se aplica (volvería la base a como estaba la hoja entonces).';
  if (hecho - ahoraMs > ADELANTO_MS) return 'El volcado dice que se hizo en el futuro: revisa el reloj.';
  return null;
}

export async function manejar(peticion, deps) {
  const inicio = Number(deps.ahora());
  const secretos = secretosDeEsta(deps && deps.entorno);
  const responder = (status, cuerpo) => json(peticion, status, cuerpo, { secretos });
  let base = null;
  try {
    const previo = previa(peticion, { metodos: ['POST'] });
    if (previo) return previo;

    /* 1. Sin secreto configurado no se hace NADA: ni se lee el cuerpo ni se abre la base. */
    const esperado = leerVar(deps.entorno, VARIABLES.secreto);
    if (esperado.length < SECRETO_MINIMO) {
      registrar(deps, FUNCION, 'error', 'sin_secreto_configurado', { variable: VARIABLES.secreto }, secretos);
      return responder(503, sobreDeError('CONFIGURACION', 'Falta configurar ' + VARIABLES.secreto + ' (32 caracteres o más) en los secretos de la función: no se hizo nada.',
        { variables: [VARIABLES.secreto] }));
    }
    if (!secretoValido(peticion.headers.get(CABECERA_SECRETO), esperado)) return responder(401, sobreDeError('SIN_SESION', 'No autorizado.'));
    const url = leerVar(deps.entorno, VARIABLES.base);
    if (!/^postgres(?:ql)?:\/\/\S+$/.test(url)) {
      registrar(deps, FUNCION, 'error', 'configuracion', { variables: [VARIABLES.base] }, secretos);
      return responder(503, sobreDeError('CONFIGURACION', 'Falta ' + VARIABLES.base + ' (la pone Supabase en cada función): no se hizo nada.', { variables: [VARIABLES.base] }));
    }

    /* 2. El volcado. */
    const t = await leerTexto(peticion, MAX_CUERPO);
    if (!t.ok) return responder(t.motivo === 'demasiado_grande' ? 413 : 400, sobreDeError('DATO_INVALIDO', t.motivo === 'demasiado_grande' ? 'El volcado pasa de 15 MB.' : 'No se pudo leer el cuerpo.'));
    let volcado;
    try { volcado = JSON.parse(t.texto); } catch (_) { return responder(400, sobreDeError('DATO_INVALIDO', 'El cuerpo no es JSON.')); }

    /* 2 bis. ¿El pedido del respaldo semanal (respaldarSemanal de copia-diaria.gs)? La base entera, en un JSON, y nada más (respaldo.js). */
    if (esPedidoDeRespaldo(volcado)) {
      base = deps.abrirBase(url);
      let p;
      try {
        p = await paquete({ ...(await exportar(base)), ahoraMs: inicio, origen: origenDe(leerVar(deps.entorno, 'SUPABASE_URL')) });
      } catch (e) {
        if (e instanceof RespaldoGrande) {
          registrar(deps, FUNCION, 'error', 'respaldo_grande', { tope_mb: TOPE_RESPALDO / 1048576 }, secretos);
          return responder(413, sobreDeError('RESPALDO_GRANDE', 'El respaldo pasa de ' + (TOPE_RESPALDO / 1048576) + ' MB y UrlFetchApp no lo recibe: no se mandó nada. ' +
            'Toca la alternativa de la función respaldo (supabase/README.md).'));
        }
        registrar(deps, FUNCION, 'error', 'respaldo_base', { error: errorSinDatos(e) }, secretos);
        return responder(502, sobreDeError('BASE_NO_CONTESTA', 'La base no contestó al leer el respaldo: no se mandó nada.', { transitorio: true }));
      }
      /* Al registro, solo cuentas: el respaldo lleva datos de clientes. */
      registrar(deps, FUNCION, 'info', 'respaldo', { bytes: p.bytes.byteLength, filas: p.filas, duracion_ms: Math.max(0, Number(deps.ahora()) - inicio) }, secretos);
      return new Response(p.bytes, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        [CABECERAS_RESPALDO.nombre]: p.nombre, [CABECERAS_RESPALDO.sha256]: p.sha256, [CABECERAS_RESPALDO.bytes]: String(p.bytes.byteLength), [CABECERAS_RESPALDO.filas]: String(p.filas) } });
    }

    const malo = problemaDelVolcado(volcado, inicio);
    if (malo) return responder(400, sobreDeError('DATO_INVALIDO', malo));

    /* 3. El plan: el MISMO del importador de la fase 2, sin teléfonos y sin la clave del sello. Las autorizaciones entran con el
          veredicto que la hoja calculó con SU clave (copia-diaria.gs): esta función es la única que lo acepta, y solo después de
          comprobar el secreto (decidido 2026-10-17 para que Elías no tenga que mover secretos). */
    let plan;
    try { plan = await planear({ volcado, telefonos: [], clave: null, semilla: deps.semilla, aceptarVeredictosDeLaHoja: true }); }
    catch (_) { return responder(400, sobreDeError('DATO_INVALIDO', 'El importador no pudo leer el volcado.')); }

    /* 4. La copia y su cuadre, en la base. */
    base = deps.abrirBase(url);
    const r = await copiar({ base, plan, volcado, ahora: deps.ahora, inicio });
    const sinAut = (plan.reporte.no_importado || []).find(x => x.que === 'Autorizaciones');
    const res = { id: r.id, fecha: r.fecha, aplicado: r.aplicado, cuadra: r.cuadra, diferencias: r.diferencias, conflictos: r.conflictos,
      rechazos: r.rechazos, ventas: (plan.reporte.resumen || {}).filas_de_ventas_leidas || 0, duracion_ms: r.duracion_ms,
      autorizaciones: { comprobadas: plan.tablas.autorizaciones.length, no_entran: sinAut ? Number(sinAut.n) || 0 : 0 } };
    registrar(deps, FUNCION, r.error ? 'error' : 'info', 'copia', { ...res, ...(r.error ? { error: r.error } : {}) }, secretos);
    if (r.error) {
      return responder(502, { ...sobreDeError('BASE_RECHAZO', 'La base rechazó la copia y se deshizo entera: no se escribió nada. El fallo quedó anotado en cuadre_diario.'),
        ...res, error: r.error });
    }
    /* `modo` (puente-sheets-17): quién manda, para que la hoja lo anote (copia-diaria.gs → fijarModoEmpresa_). Y el motivo de no aplicar
       ya no es siempre «conflictos»: con la base mandando es lo esperado, y la línea del registro de la hoja lo dice así (auditoría
       2026-10-26, T1-2 y T1-4). */
    const modo = r.modo === 'base' || r.modo === 'hoja' ? r.modo : null;
    return responder(200, { ok: true, ...res, modo, motivo: r.aplicado ? null : modo === 'base' ? 'modo_base' : 'conflictos' });
  } catch (e) {
    if (e instanceof CopiaOcupada) return responder(409, sobreDeError('OCUPADA', 'Ya hay una copia en curso: esta no hizo nada.'));
    if (e instanceof ErrorDeCopia) {
      registrar(deps, FUNCION, 'error', 'base', { error: e.error }, secretos);
      return responder(502, sobreDeError('BASE_NO_CONTESTA', 'La base no contestó: no se escribió nada.', { transitorio: true }));
    }
    /* Lo inesperado: solo su tipo. El mensaje puede citar un valor del volcado. */
    registrar(deps, FUNCION, 'error', 'inesperado', { tipo: String((e && e.name) || typeof e).slice(0, 40) }, secretos);
    return responder(500, sobreDeError('DESCONOCIDO', 'La copia falló por algo que no se esperaba.'));
  } finally {
    if (base && typeof base.cerrar === 'function') { try { await base.cerrar(); } catch (_) { /* ya estaba cerrada */ } }
  }
}
