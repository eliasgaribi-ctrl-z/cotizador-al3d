// Función `maps` (sigue un enlace corto de Google Maps). Es el cable entre Supabase y handler.js, y
// nada más: aquí vive TODO lo que es de Deno (Deno.serve, Deno.env, el fetch de la plataforma); las
// reglas están en handler.js y en _shared/maps.js, que no saben de Deno y se prueban en node.
// Ver pruebas/supabase-funciones.mjs. La sesión se comprueba en código: config.toml le pone
// verify_jwt = false (las llaves nuevas de Supabase no son JWT).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { crearClienteBase } from '../_shared/cliente.js';
import { crearLimitador } from '../_shared/http.js';
import { manejar } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);
const fetchPlataforma = (...a: Parameters<typeof fetch>) => fetch(...a);
const clienteBase = crearClienteBase({ createClient, entorno, fetch: fetchPlataforma });
const ahora = () => Date.now();
// El tope del .gs: 60 por minuto por persona. Contado en esta instancia (mejor esfuerzo): ver handler.js.
const limitador = crearLimitador({ ahora, maximo: 60, ventanaMs: 60_000 });

Deno.serve((peticion: Request) => manejar(peticion, {
  fetch: fetchPlataforma,
  ahora,
  entorno,
  clienteBase,
  limitador,
}));
