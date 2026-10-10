// Función `verificar` (pública: la abre el QR de un PDF). Es el cable entre Supabase y handler.js, y
// nada más: aquí vive TODO lo que es de Deno (Deno.serve, Deno.env, el fetch de la plataforma); las
// reglas están en handler.js, que no sabe de Deno y se prueba en node.
// Ver pruebas/supabase-funciones.mjs. Sin sesión: config.toml le pone verify_jwt = false.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { crearClienteBase } from '../_shared/cliente.js';
import { manejar } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);
const fetchPlataforma = (...a: Parameters<typeof fetch>) => fetch(...a);
const clienteBase = crearClienteBase({ createClient, entorno, fetch: fetchPlataforma });

Deno.serve((peticion: Request) => manejar(peticion, {
  ahora: () => Date.now(),
  entorno,
  clienteBase,
}));
