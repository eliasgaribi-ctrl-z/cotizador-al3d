// Función `respaldo` (exporta las tablas a un JSON y lo sube a Drive con una cuenta de servicio). Es el cable
// entre Supabase y handler.js, y nada más: aquí vive TODO lo que es de Deno (Deno.serve, Deno.env, el fetch de la
// plataforma, el reloj); las reglas están en handler.js y en _shared/respaldo.js, que no saben de Deno y se prueban
// en node con un fetch de mentiras (pruebas/supabase-respaldo.mjs). La dispara el flujo semanal de GitHub con el
// secreto de la cabecera x-respaldo-secreto: config.toml le pone verify_jwt = false, como a las demás.
import { manejar } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);
const fetchPlataforma = (...a: Parameters<typeof fetch>) => fetch(...a);

Deno.serve((peticion: Request) => manejar(peticion, {
  fetch: fetchPlataforma,
  ahora: () => Date.now(),
  entorno,
}));
