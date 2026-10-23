/* ============================================================================
   AUTORIZAR — Dirección autoriza el precio de una cotización y sale el sello firmado
   (reemplaza /autorizar del Apps Script, rutaAutorizar_ de puente/hoja-apps-script.gs).

   APAGADA mientras la hoja sea la fuente de verdad (docs/ESTADO-SUPABASE.md): existe, se prueba con
   dobles y contra el .gs real, y nadie la llama todavía.

   ENTRADA   POST con la sesión de Google de la persona (Authorization: Bearer <jwt>) y el cuerpo de
             siempre: { folio: 'COT-0042-B@K7QM', cotizacion: {proyecto, cliente, iva, subtotal, items},
                        precioAuth?, itemsAuth?: {id: importe}, nota?, empresa? }
             `empresa` solo hace falta si la persona es Dirección en más de una.
   SALIDA    lo que contestaba el .gs, con el mismo JSON:
               200 { ok:true, sello:{codigo, correo, ts, huella, subCalc, precioAuth, itemsAuth, total, nota, renglones} }
               200 { ok:true, sello:{…el vigente…}, repetida:true }       (la MISMA decisión otra vez: no escribe nada)
               200 { ok:false, codigo:'DATO_INVALIDO' | 'CATALOGO_DESINCRONIZADO', mensaje, … }   (lo del .gs, tal cual)
             y lo propio de una función:
               401 SIN_SESION · 403 SIN_ACCESO / ACCESO_REVOCADO / ROL_SIN_PERMISO (no es Dirección)   (auth.js)
               400 EMPRESA_REQUERIDA (Dirección en varias empresas y sin `empresa`)
               503 CONFIGURACION (falta SELLO_AUTORIZACION o las variables de Supabase: se dice su NOMBRE)
               503 SIN_RED (la base no contestó; transitorio) · 500 DESCONOCIDO

   EL ORDEN, que es el del .gs donde importa:
     1. origen, preflight y método (http.js);  2. la sesión: Dirección ACTIVA (auth.js, mi_acceso);
     3. la clave: sin SELLO_AUTORIZACION no se sigue (el .gs inventaba una; aquí nunca);
     4. el cuerpo (tope 512 KB) y la decisión pura (_shared/autorizar.js: limpiar, recalcular el precio
        con el catálogo del servidor, ajustes, total, renglones);
     5. la hora (`ts`, del reloj de la función, como new Date().toISOString() del .gs) y la firma con
        sello.js en la codificación REAL de Apps Script (ascii-?);
     6. la escritura: SOLO por la RPC `registrar_autorizacion` (0008, solo service_role). Ella toma el
        candado del folio, decide si es la misma decisión (repetida), supera la vigente anterior, guarda
        lo firmado VERBATIM, crea o actualiza la cotización y resuelve la solicitud pendiente. La base no
        tiene la clave: revalida todo lo demás (Dirección activa de esa empresa, el correo, las formas).

   NINGÚN SECRETO SALE: ni la clave ni la llave secreta de Supabase (json() y registrar() las esconden),
   y la firma solo sale como su código (que es lo que va impreso).

   deps: { ahora, entorno, clienteBase, registrar? }   (clienteBase: el puerto de _shared/cliente.js)
   ============================================================================ */

import { errorInterno, json, leerTexto, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, leerSelloClave, secretosDelEntorno } from '../_shared/entorno.js';
import { exigirAcceso } from '../_shared/auth.js';
import { sellar, tsIso, ErrorDeSello } from '../_shared/sello.js';
import { argumentosDeRegistro, prepararAutorizacion, selloDeRespuesta } from '../_shared/autorizar.js';
import { FABRICA, mapasDeTarifas } from '../_shared/precio.js';

export const MAX_CUERPO = 512 * 1024;
const datoInvalido = mensaje => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje });

/* La empresa donde la persona es Dirección ACTIVA: la que pidió (si lo es ahí) o la única. */
export function empresaDeDireccion(acceso, pedida) {
  const mias = (Array.isArray(acceso && acceso.empresas) ? acceso.empresas : [])
    .filter(e => e && e.estado === 'activo' && e.area === 'direccion' && typeof e.empresa_id === 'string')
    .map(e => e.empresa_id);
  if (typeof pedida === 'string' && pedida !== '') return mias.includes(pedida) ? { ok: true, empresa: pedida } : { ok: false, codigo: 'ROL_SIN_PERMISO' };
  if (mias.length === 1) return { ok: true, empresa: mias[0] };
  return mias.length ? { ok: false, codigo: 'EMPRESA_REQUERIDA' } : { ok: false, codigo: 'ROL_SIN_PERMISO' };
}

export async function manejar(peticion, deps) {
  const secretos = secretosDelEntorno(deps && deps.entorno);
  const responder = (status, cuerpo) => json(peticion, status, cuerpo, { secretos });
  try {
    const previo = previa(peticion, { metodos: ['POST'] });
    if (previo) return previo;

    /* 2. Dirección activa, antes de leer nada. */
    const acceso = await exigirAcceso(peticion, deps, { areas: ['direccion'] });
    if (!acceso.ok) {
      if (acceso.alerta) registrar(deps, 'autorizar', 'error', acceso.motivo, { detalle: acceso.detalle }, secretos);
      return responder(acceso.status, acceso.cuerpo);
    }

    /* 3. La clave. */
    let clave;
    try { clave = leerSelloClave(deps.entorno); }
    catch (e) {
      if (!esErrorDeEntorno(e)) throw e;
      registrar(deps, 'autorizar', 'error', 'entorno', { detalle: e.message }, secretos);
      return responder(503, sobreDeError('CONFIGURACION', e.message));
    }

    /* 4. El cuerpo y la decisión. Lo que el .gs contestaba con 200 sigue con 200. */
    const t = await leerTexto(peticion, MAX_CUERPO);
    if (!t.ok) return responder(200, datoInvalido(t.motivo === 'demasiado_grande' ? 'El cuerpo es demasiado grande.' : 'El cuerpo no es JSON.'));
    let cuerpo;
    try { cuerpo = JSON.parse(t.texto); } catch (_) { return responder(200, datoInvalido('El cuerpo no es JSON.')); }
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return responder(200, datoInvalido('El folio no se entiende.'));

    const emp = empresaDeDireccion(acceso.acceso, cuerpo.empresa);
    if (!emp.ok) {
      return emp.codigo === 'EMPRESA_REQUERIDA'
        ? responder(400, sobreDeError('EMPRESA_REQUERIDA', 'Eres Dirección en varias empresas: indica con cuál autorizas.'))
        : responder(403, sobreDeError('ROL_SIN_PERMISO', 'Solo Dirección de esa empresa autoriza un precio.'));
    }
    const correo = String(acceso.usuario.correo || '').trim().toLowerCase();
    if (!correo) return responder(403, sobreDeError('ROL_SIN_PERMISO', 'Tu cuenta no tiene un correo verificado: no se puede firmar a tu nombre.'));

    /* 4b. Los precios de esa empresa (0019, `tarifas_de`). Si la tabla no llega —falta la migración, la base no contesta— se
       cobra con el catálogo de fábrica y se anota: un precio editado que aquí no se conoce sale como «no cuadra»
       (CATALOGO_DESINCRONIZADO), nunca como un sello con otro importe. */
    let mapas = FABRICA;
    try {
      const t = await deps.clienteBase.rpcServicio('tarifas_de', { p_empresa: emp.empresa });
      if (t && !t.error && t.data && typeof t.data === 'object') mapas = mapasDeTarifas(t.data);
      else registrar(deps, 'autorizar', 'aviso', 'tarifas_no_llegaron', { detalle: t && t.error ? String(t.error.code) + ' ' + textoDeError(t.error) : 'sin datos' }, secretos);
    } catch (e) {
      if (esErrorDeEntorno(e)) {
        registrar(deps, 'autorizar', 'error', 'entorno', { detalle: e.message }, secretos);
        return responder(503, sobreDeError('CONFIGURACION', e.message));
      }
      registrar(deps, 'autorizar', 'aviso', 'tarifas_no_llegaron', { detalle: textoDeError(e) }, secretos);
    }

    const prep = prepararAutorizacion(cuerpo, correo, mapas);
    if (!prep.ok) return responder(200, prep);

    /* 5. La hora y la firma (ascii-?, la de Apps Script). Un texto que una columna `text` no guarda tal cual no se firma. */
    prep.r.ts = tsIso(deps.ahora());
    let sello;
    try { sello = await sellar(prep.r, clave); }
    catch (e) {
      if (e instanceof ErrorDeSello && e.codigo === 'REGISTRO_INVALIDO') {
        return responder(200, datoInvalido('La cotización trae un texto que no se puede guardar tal cual (un carácter cortado a la mitad). Corrige el nombre del proyecto o la descripción y vuelve a intentarlo.'));
      }
      throw e;
    }

    /* 6. La escritura, solo por la RPC. */
    let r;
    try { r = await deps.clienteBase.rpcServicio('registrar_autorizacion', argumentosDeRegistro({ empresa: emp.empresa, usuarioId: acceso.usuario.id, prep, sello })); }
    catch (e) {
      if (esErrorDeEntorno(e)) {
        registrar(deps, 'autorizar', 'error', 'entorno', { detalle: e.message }, secretos);
        return responder(503, sobreDeError('CONFIGURACION', e.message));
      }
      registrar(deps, 'autorizar', 'error', 'base_no_contesta', { detalle: textoDeError(e) }, secretos);
      return responder(503, sobreDeError('SIN_RED', 'No se pudo guardar la autorización. Vuelve a intentarlo.', { transitorio: true }));
    }
    if (r.error) {
      const config = ['42501', 'PGRST202', 'PGRST300'].includes(String(r.error.code || ''));
      registrar(deps, 'autorizar', 'error', config ? 'rpc_no_disponible' : 'rpc_error', { detalle: String(r.error.code) + ' ' + textoDeError(r.error) }, secretos);
      return config
        ? responder(503, sobreDeError('CONFIGURACION', 'La base no tiene registrar_autorizacion disponible para la función (¿falta la migración 0008 o su GRANT?).'))
        : responder(503, sobreDeError('SIN_RED', 'No se pudo guardar la autorización. Vuelve a intentarlo.', { transitorio: true }));
    }
    const d = r.data;
    if (!d || typeof d !== 'object') {
      registrar(deps, 'autorizar', 'error', 'rpc_forma', { detalle: 'registrar_autorizacion devolvió algo que no es un objeto' }, secretos);
      return responder(500, errorInterno());
    }
    if (d.ok !== true) return responder(d.codigo === 'ROL_SIN_PERMISO' ? 403 : 200, d);      // la base revalidó y dijo que no
    if (d.repetida === true) return responder(200, { ok: true, sello: d.sello, repetida: true });
    return responder(200, { ok: true, sello: selloDeRespuesta(prep.r, sello.codigo, prep.nota) });
  } catch (e) {
    registrar(deps, 'autorizar', 'error', 'inesperado', { detalle: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}
