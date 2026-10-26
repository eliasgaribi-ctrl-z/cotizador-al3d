/* ============================================================================
   QUIÉN MANDA EL ROL: la hoja o la base (paso 5 de docs/BASE-MANDA.md).

   Desde que se entra con Google el rol no sale de este aparato: lo dice el pase (js/datos/prefs.js,
   `pase()`). Con la hoja mandando el pase lo da la hoja (la pestaña «Accesos»); con la base mandando lo
   da la base (`mi_acceso`, y js/nucleo/puerta.js lo guarda con `de: 'base'`). Ajustes y la barra de
   arriba dicen quién lo manda junto al candado del rol; hasta el paso 5 decían «la hoja» siempre.

   Va aparte de prefs.js a propósito: prefs.js entra en los paquetes de dos funciones de Supabase
   (`pantalla` e `importar-diario`, ver su `desplegar/armar.mjs`), y cambiarlo pediría volver a
   pegarlas en el panel sin que cambiara nada de lo que hacen.
   ============================================================================ */

import { pase, ROL_LO_MANDA_LA_HOJA } from './prefs.js';

export const ROL_LO_MANDA_LA_BASE =
  'Tu rol lo decide la base (Supabase), no este teléfono. Para cambiarlo, Dirección cambia ' +
  'tu área en Ajustes → La base de datos → Personas y se aplica la próxima vez que abras la app.';

/** true cuando el pase de ahora lo dio LA BASE: el rol es el área de `mi_acceso`, no el renglón de «Accesos». */
export function rolDeLaBase() {
  const p = pase();
  return !!p && p.de === 'base';
}

/** Para el candado del rol: «lo manda la hoja» o «lo manda la base». */
export const rolLoManda = () => (rolDeLaBase() ? 'la base' : 'la hoja');

/** La nota larga de dónde se cambia el rol. */
export const notaDelRol = () => (rolDeLaBase() ? ROL_LO_MANDA_LA_BASE : ROL_LO_MANDA_LA_HOJA);
