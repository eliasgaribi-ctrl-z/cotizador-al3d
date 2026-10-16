// Función `importar-diario` (la copia de cada madrugada: el volcado de la hoja → la base, y su cuadre en cuadre_diario). Es el
// cable entre Supabase y handler.js, y nada más: aquí vive TODO lo que es de Deno (Deno.serve, Deno.env, el reloj) y el driver de
// Postgres; las reglas están en handler.js, copia.js y el importador (scripts/importador), que se prueban en node y con PGlite
// (pruebas/supabase-importar-diario.mjs, supabase/tests/sync-e-importacion/importar-diario.mjs). La dispara el Apps Script de la
// hoja (puente/copia-diaria.gs) con el secreto de la cabecera x-importar-secreto: config.toml le pone verify_jwt = false.
// Sin CLI: desplegar/index.ts es este mismo código en UN archivo, para pegarlo en el editor del panel (desplegar/armar.mjs lo arma).
import postgres from 'npm:postgres@3.4.5';
import semilla from '../../../datos/semilla.json' with { type: 'json' };
import { basePostgres } from './base.js';
import { manejar } from './handler.js';

const entorno = (nombre: string) => Deno.env.get(nombre);

Deno.serve((peticion: Request) => manejar(peticion, {
  ahora: () => Date.now(),
  entorno,
  semilla,
  abrirBase: (url: string) => basePostgres(postgres, url),
}));
