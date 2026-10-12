/* ============================================================================
   MAPS — seguir un enlace corto de Google Maps hasta el largo (reemplaza /expandir del Apps Script).

   Pide SESIÓN con acceso activo (cualquier área, como hoy: «cualquier rol, después de las puertas»).
   Lo difícil de esto —que un servidor que sale a internet con una dirección que le manda otro no
   sea un trampolín— está en _shared/maps.js (lista blanca, https sin usuario ni puerto, UN host
   permitido por salto, redirect:'manual', revalidar cada Location). Este archivo es el pegamento:
   la sesión (auth.js), el tope por persona, el cuerpo y el fetch de afuera.

   ENTRADA   POST con un cuerpo JSON {"u": "<liga>"} y  Authorization: Bearer <JWT de la persona>.
   SALIDA    la misma del .gs, tal cual, con HTTP 200 (el cliente lee `ok` y `codigo`):
               { ok: true,  url }                                               (la liga larga)
               { ok: false, codigo: 'DATO_INVALIDO', mensaje }    no es un enlace de Google Maps: definitivo
               { ok: false, codigo: 'SIN_RED', mensaje }          no se pudo seguir la liga, o demasiadas
                                                                  peticiones seguidas: se reintenta
             Sin sesión: 401 SIN_SESION. Sin acceso: 403 SIN_ACCESO / ACCESO_REVOCADO. Si no se
             puede confirmar la sesión: 503 (ver auth.js). Origen no permitido: 403; método que no
             es POST: 405. Las coordenadas no se sacan aquí: las lee el cliente con parseGmaps.

   EL TOPE POR PERSONA. El .gs contaba 60 peticiones por minuto por quien llamaba antes de llegar a
   /expandir, y maps.js lo deja dicho: esa parte se repone donde se cablee. Es `deps.limitador`
   (http.js → crearLimitador): contado en la memoria de la instancia, así que es de mejor esfuerzo
   (las funciones de Supabase no guardan estado entre instancias y el diseño no trae una RPC para
   este tope). Sin `limitador` no hay tope; cada index.ts lo trae.

   deps: { fetch, ahora, entorno, clienteBase, limitador?, registrar? }
         `fetch` es el que sale a internet; solo maps.js lo usa, y solo hacia hosts de la lista.
   ============================================================================ */

import { expandir } from '../_shared/maps.js';
import { exigirAcceso } from '../_shared/auth.js';
import { errorInterno, json, leerTexto, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { secretosDelEntorno } from '../_shared/entorno.js';

/* El .gs: 64 KB para todo lo que no es /ia; una liga de Maps mide menos de 4 KB (maps.js). */
const MAX_CUERPO = 64 * 1024;
const datoInvalido = mensaje => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje });
/* El texto del .gs para su tope por minuto. */
const MENSAJE_LIMITE = 'Demasiadas peticiones seguidas desde este teléfono. Espera un minuto.';

export async function manejar(peticion, deps) {
  const secretos = secretosDelEntorno(deps && deps.entorno);
  try {
    const previo = previa(peticion, { metodos: ['POST'] });
    if (previo) return previo;

    const acceso = await exigirAcceso(peticion, deps);
    if (!acceso.ok) {
      if (acceso.alerta) registrar(deps, 'maps', 'error', acceso.motivo, { detalle: acceso.detalle }, secretos);
      return json(peticion, acceso.status, acceso.cuerpo, { secretos });
    }

    if (typeof deps.limitador === 'function' && !(await deps.limitador(acceso.usuario.id))) {
      return json(peticion, 200, sobreDeError('SIN_RED', MENSAJE_LIMITE, { transitorio: true }), { secretos });
    }

    const t = await leerTexto(peticion, MAX_CUERPO);
    if (!t.ok) return json(peticion, 200, datoInvalido(t.motivo === 'demasiado_grande' ? 'El cuerpo es demasiado grande.' : 'El cuerpo no es JSON.'), { secretos });
    let cuerpo;
    try { cuerpo = JSON.parse(t.texto); }
    catch (_) { return json(peticion, 200, datoInvalido('El cuerpo no es JSON.'), { secretos }); }

    /* `u` que no es texto no es una liga: expandir() lo contesta DATO_INVALIDO sin tocar la red. */
    const u = cuerpo !== null && typeof cuerpo === 'object' ? cuerpo.u : undefined;
    return json(peticion, 200, await expandir(u, { fetch: deps.fetch }), { secretos });
  } catch (e) {
    registrar(deps, 'maps', 'error', 'inesperado', { detalle: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}
