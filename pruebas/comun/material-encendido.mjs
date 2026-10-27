/* EL DÍA QUE SE ENCIENDA MATERIAL — para las pruebas que tienen que correr el código de verdad con el
   interruptor único APAGADO (auditoría 2026-10-26, T1-7).

   Material está en mantenimiento: `export const MATERIAL_EN_MANTENIMIENTO = true;` en js/datos/agenda.js,
   y con eso nada sale del almacén (js/datos/proyectos.js, `materialEnMantenimiento`), «Qué atender» no
   saca avisos de material y el relevo le avisa a la base. Pero lo que hace el almacén con Material
   ENCENDIDO —una sola salida por requerimiento, que dos teléfonos no resten dos veces, que una venta de
   antes del cambio salga con el id de la base— sigue teniendo que probarse, porque es lo que va a correr
   el día que se encienda. Un gancho en el código de la app solo para las pruebas sería una puerta trasera
   en producción; esto no toca la app: le pide a node que, al CARGAR js/datos/agenda.js, lo lea con el
   interruptor apagado. Todo lo demás es el mismo archivo, renglón por renglón.

   Se importa ANTES de cargar cualquier módulo de js/: las importaciones estáticas de una prueba se
   cargan juntas, antes de correr nada, así que los módulos de la app se piden con `await import()`
   después de esta línea (como ya lo hacen las pruebas del teléfono). Si el renglón del interruptor ya
   no dice lo que dice hoy, la carga truena: una prueba que cree que encendió Material y no lo hizo es
   peor que una que no corre.

   Vive en pruebas/comun/ y no en pruebas/: correr.sh corre todo *.mjs de pruebas/, y esto no es una
   prueba. */
import { register } from 'node:module';

const GANCHO = `
const RENGLON = 'export const MATERIAL_EN_MANTENIMIENTO = true;';
export async function load(url, contexto, siguiente) {
  const r = await siguiente(url, contexto);
  if (!/\\/js\\/datos\\/agenda\\.js(\\?.*)?$/.test(url)) return r;
  const fuente = typeof r.source === 'string' ? r.source : new TextDecoder().decode(r.source);
  if (!fuente.includes(RENGLON)) throw new Error('pruebas/comun/material-encendido.mjs: js/datos/agenda.js ya no dice «' + RENGLON + '»');
  return { ...r, source: fuente.replace(RENGLON, 'export const MATERIAL_EN_MANTENIMIENTO = false;') };
}
`;
register('data:text/javascript,' + encodeURIComponent(GANCHO));
