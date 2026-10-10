// Función `espejo` (mantiene la hoja de Google como espejo de solo lectura de la base). Es el cable
// entre Supabase y handler.js, y nada más: aquí vive TODO lo que es de Deno (Deno.serve, Deno.env, el
// fetch de la plataforma, el reloj); las reglas están en handler.js, en base.js y en _shared/espejo.js,
// que no saben de Deno y se prueban en node. Ver pruebas/supabase-espejo.mjs. A quien la dispara
// (un cron externo o un webhook de la base) la protege el secreto de la cabecera x-espejo-secreto,
// que handler.js compara en código: config.toml le pone verify_jwt = false, como a las demás.
import { crearBaseEspejo } from './base.js';
import { manejar } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);
const fetchPlataforma = (...a: Parameters<typeof fetch>) => fetch(...a);
const base = crearBaseEspejo({ entorno, fetch: fetchPlataforma, empresa: entorno('ESPEJO_EMPRESA') || 'al3d' });

Deno.serve((peticion: Request) => manejar(peticion, {
  fetch: fetchPlataforma,
  ahora: () => Date.now(),
  dormir: (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)),
  entorno,
  base,
}));
