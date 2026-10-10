-- =====================================================================================================
-- opcional/storage.sql — el bucket privado de las imágenes de las cotizaciones y sus políticas
-- =====================================================================================================
-- OPCIONAL y APARTE: no es una migración. Necesita el esquema `storage` de Supabase (no existe en PGlite) y se aplica UNA vez, a mano, en el SQL Editor del
-- proyecto (o con `supabase db execute`), DESPUÉS de las migraciones 0001–0011. Es idempotente: se puede volver a aplicar.
--
-- Qué guarda. Las imágenes de las cotizaciones (`al3d_cot_imgs` del teléfono: planos, renders y propuestas; JPEG de hasta 1800 px, ~600 KB) NO entran a la base:
-- se suben desde el teléfono a este bucket, y `cotizaciones.datos` las referencia por id. Ruta de cada objeto:
--         <empresa>/<folio_global>/<id>.jpg           p. ej.  al3d/COT-0042-B@K7QM/img-17.jpg
-- La PRIMERA carpeta de la ruta es la empresa y es lo único que las políticas miran: así una empresa nueva no necesita ninguna política nueva.
--
-- Quién puede qué (A.md §3.5):
--   · LEER:  cualquier miembro ACTIVO de la empresa del prefijo (Dirección, Fabricación o Pagos). El bucket es PRIVADO: no hay URL pública; cada lectura es una URL
--            firmada de vida corta o una descarga autenticada. `anon` no tiene ninguna política: no ve nada, ni siquiera la lista de nombres.
--   · SUBIR: cualquier miembro activo, solo dentro del prefijo de SU empresa y con la forma <empresa>/<folio_global>/<archivo> (tres niveles). Las imágenes se
--            suben ANTES de que exista la cotización en la base (la subida única las acusa por registro), así que la política no puede exigir la cotización.
--   · CAMBIAR o BORRAR un objeto: quien lo subió (su `owner`) o Dirección de esa empresa.
-- La empresa de la ruta se compara con `interno.empresas_donde(…)`, la MISMA función que usan las políticas de las tablas: quien es Dirección en una empresa y
-- Fabricación en otra recibe, en cada ruta, los privilegios de ESA empresa. Se evalúa una vez por consulta (subconsulta sin correlación), no una vez por objeto.
--
-- Lo que NO se probó contra Storage de verdad (PGlite no lo tiene): la forma exacta de las columnas de `storage.objects` en la versión del proyecto y el comportamiento
-- del servicio de Storage (subida con `upsert`, URLs firmadas). `supabase/tests/notario/imagenes-storage.mjs` prueba estas políticas contra un SUSTITUTO mínimo de
-- `storage` (mismas columnas y `storage.foldername`), y no sustituye al proyecto de pruebas: ahí hay que repetirlo (EX-* de A.md §10.17).
-- =====================================================================================================

do $$ begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception 'Este archivo necesita el esquema storage de Supabase (storage.objects y storage.buckets): aplícalo en el proyecto real, no en una base común.';
  end if;
  if to_regprocedure('interno.empresas_donde(text[])') is null then
    raise exception 'Faltan las migraciones: aplica 0001–0011 antes que este archivo (interno.empresas_donde).';
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 1. El bucket: PRIVADO, con tope de tamaño y solo imágenes
-- -----------------------------------------------------------------------------------------------------
-- 2 MB por objeto (la imagen más pesada que se espera pesa ~600 KB: el tope deja margen sin dejar subir cualquier cosa) y solo imagen. Si el teléfono manda otro
-- formato (webp, png) se agrega aquí; no es una regla de negocio, es una perilla. `public = false` se REPITE en el `do update`: aunque alguien lo haya vuelto
-- público a mano, volver a aplicar este archivo lo cierra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizacion-imagenes', 'cotizacion-imagenes', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------------------------------
-- 2. Las políticas sobre storage.objects (solo para `authenticated`; `anon` no tiene ninguna)
-- -----------------------------------------------------------------------------------------------------
-- `storage.objects` ya trae RLS encendida en Supabase. Cada política se limita a ESTE bucket: no toca los de otros usos del proyecto.
-- `storage.foldername(name)` devuelve las carpetas de la ruta (sin el archivo): [1] = empresa, [2] = folio global.

drop policy if exists cotizacion_imagenes_leer   on storage.objects;
drop policy if exists cotizacion_imagenes_subir  on storage.objects;
drop policy if exists cotizacion_imagenes_cambiar on storage.objects;
drop policy if exists cotizacion_imagenes_borrar on storage.objects;

create policy cotizacion_imagenes_leer on storage.objects for select to authenticated
  using (bucket_id = 'cotizacion-imagenes'
         and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion', 'fabricacion', 'pagos'])));

create policy cotizacion_imagenes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cotizacion-imagenes'
              and pg_catalog.array_length(storage.foldername(name), 1) = 2
              and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion', 'fabricacion', 'pagos'])));

-- Cambiar (sobrescribir con `upsert`) y borrar: quien subió el objeto, o Dirección de esa empresa. `owner_id` es la columna vigente de Storage y `owner` la
-- anterior (se miran las dos: según la versión del proyecto una u otra viene llena).
create policy cotizacion_imagenes_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'cotizacion-imagenes'
         and ((select auth.uid())::text in (owner_id, owner::text)
              or (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion']))))
  with check (bucket_id = 'cotizacion-imagenes'
              and pg_catalog.array_length(storage.foldername(name), 1) = 2
              and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion', 'fabricacion', 'pagos'])));

create policy cotizacion_imagenes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'cotizacion-imagenes'
         and ((select auth.uid())::text in (owner_id, owner::text)
              or (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion']))));


-- -----------------------------------------------------------------------------------------------------
-- 3. Comprobación al final: el bucket quedó privado y ninguna política suya admite a `anon`
-- -----------------------------------------------------------------------------------------------------
-- Si algo de lo anterior no quedó como se dijo (un bucket público de antes, una política suelta de otro uso que nombra este bucket para `anon` o PUBLIC), este
-- archivo se detiene: unas imágenes de clientes abiertas al mundo es justo lo que este bucket existe para impedir.
do $$
declare v_publico boolean; v_abiertas text;
begin
  select b.public into v_publico from storage.buckets b where b.id = 'cotizacion-imagenes';
  if v_publico is distinct from false then
    raise exception 'AUDITORIA: el bucket cotizacion-imagenes debe ser privado y no lo es.';
  end if;
  select pg_catalog.string_agg(p.polname, ', ') into v_abiertas
    from pg_policy p
   where p.polrelid = 'storage.objects'::regclass
     and (p.polroles = '{0}'::oid[] or exists (select 1 from pg_roles r where r.oid = any (p.polroles) and r.rolname = 'anon'))
     and (pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%cotizacion-imagenes%' or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%cotizacion-imagenes%');
  if v_abiertas is not null then
    raise exception 'AUDITORIA: hay políticas de storage.objects abiertas a anon/PUBLIC que nombran el bucket cotizacion-imagenes: %', v_abiertas;
  end if;
end $$;
