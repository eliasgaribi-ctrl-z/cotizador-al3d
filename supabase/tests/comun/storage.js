// Un SUSTITUTO MÍNIMO del esquema `storage` de Supabase para PGlite. Módulo de AYUDA: es `.js` y no `.mjs` para que correr.sh no lo lance como prueba.
//
//   import { SUSTITUTO_STORAGE, TEXTO_STORAGE } from '../comun/storage.js';
//   await sql(db, SUSTITUTO_STORAGE); await sql(db, TEXTO_STORAGE);
//
// ESTO NO ES STORAGE: son las dos tablas con las columnas que usan las políticas de `supabase/opcional/storage.sql` (y la prueba de humo), la función
// `storage.foldername` copiada de su definición y los privilegios que Supabase les da (la RLS decide). Sirve para probar las POLÍTICAS, no el servicio
// (subida, `upsert`, URLs firmadas), ni la forma exacta de `storage.objects` en la versión del proyecto real.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SUSTITUTO_STORAGE = `
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(),
                                unique (bucket_id, name));
  create function storage.foldername(name text) returns text[] language plpgsql as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;      -- en Supabase la función es ejecutable por los tres
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;                    -- como en Supabase: la RLS decide
  grant select on storage.buckets to anon, authenticated, service_role;
  insert into storage.buckets (id, name, public) values ('otros', 'otros', true);       -- un bucket ajeno, PÚBLICO, que storage.sql no debe tocar
`;

/** El texto de `supabase/opcional/storage.sql`. */
export const TEXTO_STORAGE = readFileSync(fileURLToPath(new URL('../../opcional/storage.sql', import.meta.url)), 'utf8');
