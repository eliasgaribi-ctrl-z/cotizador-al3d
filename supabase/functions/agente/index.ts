// Función `agente` (el agente de ventas: atiende a los clientes desde el portal, y desde WhatsApp cuando llegue el número
// nuevo). Es el cable entre Supabase y handler.js, y nada más: aquí vive TODO lo que es de Deno (Deno.serve, Deno.env, el fetch
// de la plataforma); las reglas están en handler.js, _shared/agente.js y _shared/ficha.js, que no saben de Deno y se prueban en
// node (pruebas/agente-logica.mjs). Sin sesión: el cliente no tiene cuenta, lo reconoce el secreto de su link (verify_jwt = false).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { crearClienteBase } from '../_shared/cliente.js';
import { crearManejador } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);
const fetchPlataforma = (...a: Parameters<typeof fetch>) => fetch(...a);
const clienteBase = crearClienteBase({ createClient, entorno, fetch: fetchPlataforma });

Deno.serve(crearManejador({
  fetch: fetchPlataforma,
  ahora: () => Date.now(),
  entorno,
  clienteBase,
}));
