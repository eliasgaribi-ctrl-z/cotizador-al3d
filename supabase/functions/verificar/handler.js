/* ============================================================================
   VERIFICAR — la ruta pública que abre el QR de un PDF (reemplaza /verificar del Apps Script).

   PÚBLICA: no pide sesión ni token, la abre el teléfono de cualquiera. Por eso este archivo es
   pegamento de una sola cosa: sacar lo que hace falta del mundo (el cuerpo, la IP, la clave, la
   base) y dárselo a verificarPublico() de _shared/verificar.js, que decide y arma la respuesta. De
   aquí no sale ni una decisión de negocio, y la forma de lo que se contesta está fijada ALLÁ, una
   sola vez.

   ENTRADA   POST con un cuerpo JSON {"f": "<folio>", "c": "<código>"} (como sea el Content-Type:
             el cliente manda text/plain; otros campos, como `ruta`, se ignoran).
   SALIDA    verificar.html lee solo `ok`, `estado`, `mensaje` y los siete datos públicos:
               { ok: true, estado: 'autentica'|'superada'|'revocada', folio, fecha, total, proyecto, renglones }
               { ok: true, estado: 'no_autentica' }                          (papel falso o mal copiado)
               { ok: false, codigo: 'SIN_RED', mensaje }          HTTP 429   (cupo; con Retry-After)
               { ok: false, codigo: 'CONFIGURACION', mensaje }    HTTP 503   (falta la clave, la base no contesta…)
               { ok: false, codigo: 'DESCONOCIDO', mensaje }      HTTP 500   (un error que no se esperaba)
             Es lo que contestaba rutaVerificar_ del .gs, byte por byte (JSON.stringify del mismo
             objeto: lo prueba pruebas/supabase-funciones.mjs contra el .gs real). Lo único distinto
             es que aquí hay código HTTP de verdad (el .gs contestaba 200 siempre) y que lo que
             falla del lado nuestro es un error explícito: la página lo pinta como «Espera un
             momento». Ver verificar.js.
             Un cuerpo que no se puede leer, que pesa de más o que no es JSON se contesta como el
             .gs: 200 { ok:false, codigo:'DATO_INVALIDO', mensaje }. Un origen que no es de la
             plataforma, 403; un método que no es POST, 405.

   EL ERROR QUE NO SE PUEDE COMETER (crítico C-27). Decirle a un cliente que su PDF legítimo es
   falso porque a la función le falta la clave o la base no contestó. Aquí, lo que falta del lado
   de la función —SELLO_AUTORIZACION, las variables de Supabase, la base, el cupo— es SIEMPRE un
   503 explícito con el mensaje de verificar.js (que dice que no quiere decir que la cotización
   sea falsa), y el detalle, el nombre de lo que falta, va al registro de la función. «No se
   halló una fila con ese folio y ese código» sí es no_autentica: es el papel falso.

   LO QUE HACE ESTE ARCHIVO, en el orden en que pasa:
     1. origen, preflight y método (http.js);  2. el cuerpo, con tope de 64 KB como el .gs;
     3. verificarPublico(), con estas dependencias:
          clave        SELLO_AUTORIZACION del entorno. Falta → verificarPublico contesta 503.
          contarCupo   UNA llamada a la RPC verificar_cupo por consulta (las dos ventanas, por folio y
                       total, y el tope por IP los pone la base; ver A.md §8.2). verificarPublico
                       pregunta dos veces (por folio y total) y las dos comparten esa llamada, para no
                       contar la misma consulta doble. Una consulta de forma inválida, o con la
                       configuración rota, ni llega a contar: lo decide verificarPublico, como el .gs.
          leerFilas    la RPC autorizacion_para_verificar (solo service_role). Las filas traen su
                       `codificacion`, y verificar() de sello.js recalcula la firma con LA DE CADA FILA
                       (decisión C-13): aquí NO se le pasa `codificaciones`, que solo valdría para
                       las filas que no traen la suya.
     4. lo que falle del lado de la función se convierte en 503 CONFIGURACION (ver arriba). El cupo
        NO falla abierto: si verificar_cupo no contesta, no se contesta la consulta (A.md §8.2).

   deps: { ahora, clienteBase, entorno, registrar? }
   ============================================================================ */

import { LIMITES_VERIFICAR, MENSAJE_CONFIGURACION, validarPeticion, verificarPublico } from '../_shared/verificar.js';
import { errorInterno, ipDeLaPeticion, json, leerTexto, previa, registrar, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, leerSelloClave, secretosDelEntorno } from '../_shared/entorno.js';

/* Los textos y el tope de los que el .gs contestaba con 200, con su misma forma (sin `definitivo`). */
const MAX_CUERPO = 64 * 1024;
const datoInvalido = mensaje => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje });
const GRANDE = 'El cuerpo es demasiado grande.';
const NO_JSON = 'El cuerpo no es JSON.';
const CLAVE_TOTAL = 'v__total';      // la que verificar.js le pone al contador del total (clavesDeCupo)

/* La RPC del cupo, UNA vez por consulta. Devuelve { permitido, nFolio, nTotal }; lanza si la base no
   contestó o contestó algo que no se entiende (y entonces no se contesta la consulta). */
async function pedirCupo(deps, folioCorto, ip) {
  const args = { p_folio_corto: folioCorto };
  if (ip) args.p_ip = ip;
  const r = await deps.clienteBase.rpcServicio('verificar_cupo', args);
  if (r.error) throw new Error('verificar_cupo: ' + r.error.code + ' ' + r.error.message);
  const d = r.data;
  if (d && d.ok === true && Number.isInteger(d.n_folio) && Number.isInteger(d.n_total) && d.n_folio >= 1 && d.n_total >= 1) {
    return { permitido: true, nFolio: d.n_folio, nTotal: d.n_total };
  }
  /* Cupo agotado: la base contesta SIN_RED con el texto de hoy. No dice cuál de las tres cuentas
     fue (folio, total o IP), y no hace falta. */
  if (d && d.ok === false && d.codigo === 'SIN_RED') return { permitido: false };
  throw new Error('verificar_cupo contestó algo que no se entiende.');
}

export async function manejar(peticion, deps) {
  const secretos = secretosDelEntorno(deps && deps.entorno);
  try {
    const previo = previa(peticion, { metodos: ['POST'] });
    if (previo) return previo;

    /* 2. El cuerpo. Lo que el .gs contestaba con 200 sigue con 200. */
    const t = await leerTexto(peticion, MAX_CUERPO);
    if (!t.ok) return json(peticion, 200, datoInvalido(t.motivo === 'demasiado_grande' ? GRANDE : NO_JSON), { secretos });
    let cuerpo;
    try { cuerpo = JSON.parse(t.texto); }
    catch (_) { return json(peticion, 200, datoInvalido(NO_JSON), { secretos }); }

    /* 3. La clave. Sin ella verificarPublico contesta el 503, antes de contar ningún cupo. */
    let clave;
    try { clave = leerSelloClave(deps.entorno); } catch (_) { clave = undefined; }

    /* Lo que va mal del lado de la función, para contestar «no disponible» y no lo que diga
       verificarPublico (que, si el contador falla, deja pasar). */
    let incidente = null;
    const falla = (motivo, e) => { if (!incidente) incidente = { motivo, detalle: textoDeError(e), config: esErrorDeEntorno(e) }; };

    const p = validarPeticion(cuerpo);              // la misma validación, pura; sin ella el cupo no se pide
    const ip = ipDeLaPeticion(peticion);
    let cupo = null;
    const contarCupo = async claveDeLaCuenta => {
      if (!cupo) cupo = pedirCupo(deps, p.folioCorto, ip);
      let c;
      try { c = await cupo; } catch (e) { falla('cupo_no_disponible', e); throw e; }
      /* Rechazada: la cuenta del folio pasa del tope (31) y la del total no; verificarPublico decide. */
      if (!c.permitido) return claveDeLaCuenta === CLAVE_TOTAL ? 1 : LIMITES_VERIFICAR.porFolio + 1;
      return claveDeLaCuenta === CLAVE_TOTAL ? c.nTotal : c.nFolio;
    };
    const leerFilas = async ({ folio, codigo }) => {
      if (incidente) throw new Error('no se lee: ' + incidente.motivo);
      let r;
      try { r = await deps.clienteBase.rpcServicio('autorizacion_para_verificar', { p_folio: folio, p_codigo: codigo }); }
      catch (e) { falla('lectura_no_disponible', e); throw e; }
      if (r.error || !r.data || r.data.ok !== true || !Array.isArray(r.data.filas)) {
        const e = new Error('autorizacion_para_verificar: ' + (r.error ? r.error.code + ' ' + r.error.message : 'contestó algo que no se entiende.'));
        falla('lectura_no_disponible', e);
        throw e;
      }
      return r.data.filas;
    };

    const r = await verificarPublico(cuerpo, { clave, leerFilas, contarCupo, ahora: deps.ahora });

    /* 4. Lo que falló de nuestro lado se dice como configuración, no como «error interno» ni, jamás,
       como «no auténtica». `r.cupoNoDisponible` lo anota verificarPublico cuando el contador falla
       POR LA CAUSA QUE SEA (la RPC, o hasta un reloj roto dentro de su bloque del cupo) y lo deja pasar:
       aquí no se deja pasar nada que no se haya contado. */
    const sinCupo = r.cupoNoDisponible !== undefined;
    if (incidente !== null || sinCupo || r.motivo === 'origen_no_disponible') {
      const motivo = incidente ? incidente.motivo : (sinCupo ? 'cupo_no_disponible' : r.motivo);
      const detalle = incidente ? incidente.detalle : (sinCupo ? r.cupoNoDisponible : r.detalle);
      registrar(deps, 'verificar', 'error', motivo, { detalle, config: !!(incidente && incidente.config) }, secretos);
      return json(peticion, 503, { ok: false, codigo: 'CONFIGURACION', mensaje: MENSAJE_CONFIGURACION }, { secretos });
    }
    if (r.alerta) {
      registrar(deps, 'verificar', 'error', r.motivo, { status: r.status, detalle: r.detalle, cupoNoDisponible: r.cupoNoDisponible }, secretos);
    }
    const cabeceras = r.status === 429 && Number.isFinite(r.reintentarEnSeg) ? { 'Retry-After': String(r.reintentarEnSeg) } : undefined;
    return json(peticion, r.status, r.cuerpo, { secretos, cabeceras });
  } catch (e) {
    registrar(deps, 'verificar', 'error', 'inesperado', { detalle: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}
