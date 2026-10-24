// Función `pantalla`: la TV del taller. Es el cable entre Supabase y handler.js, y nada más: aquí vive TODO lo que es de Deno
// (Deno.serve, Deno.env, el fetch de la plataforma); las reglas están en handler.js, que no sabe de Deno y se prueba en node
// (pruebas/supabase-pantalla.mjs). Se despliega pegando desplegar/index.ts (el paquete con taller.js adentro), con
// «Verify JWT» APAGADO: la TV no tiene sesión; lo que la protege es su secreto (ver 0022_pantallas.sql).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { crearClienteBase } from '../_shared/cliente.js';
import { leerSupabaseServicio } from '../_shared/entorno.js';
import { manejar } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);
const fetchPlataforma = (...a: Parameters<typeof fetch>) => fetch(...a);
const clienteBase = crearClienteBase({ createClient, entorno, fetch: fetchPlataforma });

/* El plano de una orden de trabajo: una liga firmada del bucket privado, con la llave secreta. El cliente se arma la
   primera vez que hace falta (como en _shared/cliente.js) y sin sesión. Devuelve la liga o null. */
let almacen: ReturnType<typeof createClient> | null = null;
async function firmar(bucket: string, ruta: string, segundos: number) {
  if (!almacen) {
    const c = leerSupabaseServicio(entorno);
    almacen = createClient(c.url, c.llave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  const r = await almacen.storage.from(bucket).createSignedUrl(ruta, segundos);
  return r.error || !r.data ? null : r.data.signedUrl;
}

Deno.serve((peticion: Request) => manejar(peticion, {
  ahora: () => Date.now(),
  entorno,
  clienteBase,
  firmar,
}));
