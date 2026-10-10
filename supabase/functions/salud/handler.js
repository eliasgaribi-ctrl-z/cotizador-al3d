/* ============================================================================
   SALUD — «¿estás vivo?», para los que vigilan y para que el proyecto no se pause.

   GET (o HEAD) público, sin sesión y sin datos de negocio, jamás:
       salud            →  200 { ok: true, servicio: 'al3d', hora: '<ISO>' }
       salud?db=1       →  lo mismo y, además, una lectura mínima de la base con la llave de
                           servicio:  200 { …, db: 'ok' }
                           Si la base no contesta: 503 { ok: false, codigo, mensaje, servicio, hora,
                           db: 'error' } (SIN_RED, o CONFIGURACION si falta una variable).

   Para qué sirve el `?db=1`. El plan gratuito de Supabase pausa el proyecto tras una semana sin
   actividad (verificado el 2026-10-10 en supabase.com/pricing), y una llamada a una función que
   no toca la base no cuenta. Con `?db=1` quien la vigile (un cron, un monitor de disponibilidad)
   le da trabajo de verdad a la base. La lectura es `select id from empresas limit 1`: no vuelve
   NADA de eso en la respuesta, solo si contestó.

   ES MÁS BARATA QUE TODO LO DEMÁS Y NO PIDE SESIÓN a propósito: lo que tiene que decir cualquiera
   que pregunte es solo «sí». Lo que NO dice, ni con ?db=1: qué variables hay o faltan, versiones,
   nombres de tablas ni de proyectos. Un fallo de configuración se dice «CONFIGURACION» a secas y
   el detalle (el nombre de la variable) va al registro de la función.

   deps: { ahora, clienteBase, entorno, registrar? }  (ver _shared/cliente.js y _shared/entorno.js)
   ============================================================================ */

import { errorInterno, json, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, secretosDelEntorno } from '../_shared/entorno.js';

export async function manejar(peticion, deps) {
  const secretos = secretosDelEntorno(deps && deps.entorno);
  try {
    const previo = previa(peticion, { metodos: ['GET', 'HEAD'] });
    if (previo) return previo;
    const hora = new Date(deps.ahora()).toISOString();
    const base = { ok: true, servicio: 'al3d', hora };
    if (new URL(peticion.url).searchParams.get('db') !== '1') return json(peticion, 200, base, { secretos });

    /* La lectura mínima. Cualquier cosa que no sea «contestó sin error» es un 503, no un «ok». */
    let r, causa = null;
    try { r = await deps.clienteBase.leerMinimo(); }
    catch (e) { causa = e; }
    if (causa === null && r && !r.error) return json(peticion, 200, { ...base, db: 'ok' }, { secretos });

    const config = causa !== null && esErrorDeEntorno(causa);
    registrar(deps, 'salud', 'error', config ? 'entorno' : 'base_no_contesta',
      { detalle: causa !== null ? textoDeError(causa) : String((r && r.error && (r.error.code + ' ' + r.error.message)) || 'sin respuesta') }, secretos);
    const cuerpo = config
      ? sobreDeError('CONFIGURACION', 'La función no está configurada por completo.')
      : sobreDeError('SIN_RED', 'La base no contestó.', { transitorio: true });
    return json(peticion, 503, { ...cuerpo, servicio: 'al3d', hora, db: 'error' }, { secretos });
  } catch (e) {
    registrar(deps, 'salud', 'error', 'inesperado', { detalle: textoDeError(e) }, secretos);
    return json(peticion, 500, errorInterno(), { secretos });
  }
}
