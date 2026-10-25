-- =====================================================================================================
-- opcional/constancias.sql — el bucket privado de las CONSTANCIAS DE SITUACIÓN FISCAL y sus políticas
-- =====================================================================================================
-- OPCIONAL y APARTE, por la misma razón que opcional/storage.sql: necesita el esquema `storage` de Supabase, que PGlite no trae, y todo lo de
-- `migrations/` corre también en PGlite en cada prueba. Se aplica a mano en el Editor SQL del proyecto (completo, de una vez), DESPUÉS de la
-- migración 0027 (la tabla `clientes_fiscales`). Es idempotente: cada vez deja el bucket y las políticas exactamente como dice este archivo.
-- Tampoco crea ninguna función: las políticas usan lo que ya existe (`interno.empresas_donde` y la RLS de `clientes_fiscales`).
-- `supabase/tests/dinero/constancias-storage.mjs` lo aplica sobre el sustituto de `storage` y prueba cada política; el bloque 14 de
-- `prueba-de-humo.sql` lo repite en el proyecto real.
--
-- Qué guarda (decidido por Elías el 2026-10-25, docs/DINERO-Y-FACTURAS.md): la constancia de situación fiscal de cada CLIENTE FISCAL, una por RFC,
-- en PDF o en foto (JPG, PNG o WebP), de hasta 5 MB. La sube el teléfono de Dirección o de Pagos (js/datos/facturas.js) y después le dice a la
-- base cuál es (`constancia_registrar`, 0027). Ruta de cada archivo:
--         <empresa>/<RFC>/csf-<id>.<pdf|jpg|png|webp>          p. ej.  al3d/ABC010203XY1/csf-3f9c2a7e-….pdf
-- Reemplazar la constancia es subir OTRA (otro id): la de antes se queda en el bucket, como evidencia, y la base apunta a la nueva.
--
-- Quién puede qué (Dirección y Pagos ven y suben las constancias; Fabricación no ve nada de esto, nunca):
--   · LEER: Dirección y Pagos de la empresa de la carpeta. Fabricación, ninguna. `anon`, nada (ni la lista de nombres). El bucket es PRIVADO:
--           cada lectura es una URL firmada de vida corta (la pide el teléfono al tocar «Ver constancia», 5 minutos) o una descarga con sesión.
--   · SUBIR: Dirección y Pagos, solo con la forma exacta de la ruta y solo en la carpeta de un RFC que YA es cliente fiscal de esa empresa (lo
--           pregunta a `clientes_fiscales` con los permisos de quien sube: su RLS es la de Dirección y Pagos). Una carpeta inventada no entra.
--   · CAMBIAR (sobrescribir, mover) y BORRAR: solo Dirección (desde el panel, si un archivo viejo estorba). El teléfono nunca sobrescribe: sube
--           con `upsert: false` y un id nuevo.
-- La empresa de la ruta se compara con `interno.empresas_donde(…)`, la MISMA función de las políticas de las tablas: una baja surte efecto en la
-- siguiente petición, y quien es Dirección en una empresa y Fabricación en otra recibe, en cada ruta, los privilegios de ESA empresa.
--
-- Cuánto ocupa: una constancia del SAT en PDF pesa de 100 a 300 KB; una foto del teléfono, de 1 a 4 MB. Con el GB del plan gratuito (que comparte
-- con las imágenes de las cotizaciones) caben miles. Para ver cuánto ocupa:
--   select count(*) as constancias, pg_size_pretty(sum((metadata ->> 'size')::bigint)) as peso from storage.objects where bucket_id = 'constancias-fiscales';
-- =====================================================================================================

do $$ begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception 'Este archivo necesita el esquema storage de Supabase (storage.objects y storage.buckets): aplícalo en el proyecto real, no en una base común.';
  end if;
  if to_regprocedure('interno.empresas_donde(text[])') is null or to_regclass('public.clientes_fiscales') is null then
    raise exception 'Faltan las migraciones: aplica 0001–0027 antes que este archivo (interno.empresas_donde, public.clientes_fiscales).';
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 1. El bucket: PRIVADO, con tope de 5 MB y solo PDF o imagen
-- -----------------------------------------------------------------------------------------------------
-- `public = false` se REPITE en el `do update`: aunque alguien lo haya vuelto público a mano, volver a aplicar este archivo lo cierra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('constancias-fiscales', 'constancias-fiscales', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------------------------------
-- 2. Las políticas sobre storage.objects (solo para `authenticated`; `anon` no tiene ninguna)
-- -----------------------------------------------------------------------------------------------------
-- Cada una se limita a ESTE bucket. `storage.foldername(name)`: [1] = empresa, [2] = RFC. La forma de la ruta es la que arma el teléfono
-- (`rutaDeConstancia` en js/datos/facturas.js) y la que vuelve a exigir `constancia_registrar`: el RFC con la forma del SAT, en mayúsculas.

drop policy if exists constancias_fiscales_leer    on storage.objects;
drop policy if exists constancias_fiscales_subir   on storage.objects;
drop policy if exists constancias_fiscales_cambiar on storage.objects;
drop policy if exists constancias_fiscales_borrar  on storage.objects;

-- LEER: Dirección y Pagos de esa empresa.
create policy constancias_fiscales_leer on storage.objects for select to authenticated
  using (bucket_id = 'constancias-fiscales'
         and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion', 'pagos'])));

-- SUBIR: Dirección y Pagos, con la forma exacta y en la carpeta de un RFC que ya es cliente fiscal de esa empresa. El `exists` corre con los
-- permisos de quien sube: la RLS de `clientes_fiscales` (Dirección y Pagos) ya lo limita a su empresa.
create policy constancias_fiscales_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'constancias-fiscales'
              and name ~ '^[a-z][a-z0-9_]{1,31}/[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]/csf-[A-Za-z0-9-]{8,64}\.(pdf|jpg|png|webp)$'
              and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion', 'pagos']))
              and exists (select 1 from public.clientes_fiscales c
                           where c.empresa_id = (storage.foldername(name))[1] and c.rfc = (storage.foldername(name))[2]));

-- CAMBIAR: solo Dirección, y sin sacar el objeto de su empresa ni de la forma de ruta.
create policy constancias_fiscales_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'constancias-fiscales'
         and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion'])))
  with check (bucket_id = 'constancias-fiscales'
              and name ~ '^[a-z][a-z0-9_]{1,31}/[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]/csf-[A-Za-z0-9-]{8,64}\.(pdf|jpg|png|webp)$'
              and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion'])));

-- BORRAR: solo Dirección (desde el panel o la API de Storage).
create policy constancias_fiscales_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'constancias-fiscales'
         and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion'])));


-- -----------------------------------------------------------------------------------------------------
-- 3. Comprobación al final: el bucket quedó privado y nada más lo abre
-- -----------------------------------------------------------------------------------------------------
-- Como en storage.sql: las políticas PERMISIVAS se suman, y una sola suelta (hecha a mano en el panel, o vieja) le abriría las constancias a quien no
-- debe —a Fabricación, por ejemplo—. Este archivo se detiene si el bucket no quedó privado, si otra política permisiva nombra este bucket, o si otra
-- política permisiva no mira `bucket_id` (valdría para TODOS los buckets, este incluido). Las restrictivas solo pueden cerrar: no se revisan.
do $$
declare v_publico boolean; v_ajenas text; v_sueltas text;
        v_nuestras constant text[] := array['constancias_fiscales_leer', 'constancias_fiscales_subir', 'constancias_fiscales_cambiar', 'constancias_fiscales_borrar'];
begin
  select b.public into v_publico from storage.buckets b where b.id = 'constancias-fiscales';
  if v_publico is distinct from false then
    raise exception 'AUDITORIA: el bucket constancias-fiscales debe ser privado y no lo es.';
  end if;
  select pg_catalog.string_agg(p.polname, ', ' order by p.polname) into v_ajenas
    from pg_policy p
   where p.polrelid = 'storage.objects'::regclass and p.polpermissive
     and not p.polname = any (v_nuestras)
     and (coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') like '%constancias-fiscales%'
          or coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') like '%constancias-fiscales%');
  if v_ajenas is not null then
    raise exception 'AUDITORIA: hay políticas de storage.objects que no son de este archivo y abren el bucket constancias-fiscales: %', v_ajenas;
  end if;
  select pg_catalog.string_agg(p.polname, ', ' order by p.polname) into v_sueltas
    from pg_policy p
   where p.polrelid = 'storage.objects'::regclass and p.polpermissive
     and not p.polname = any (v_nuestras)
     and coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') not like '%bucket_id%'
     and coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%bucket_id%';
  if v_sueltas is not null then
    raise exception 'AUDITORIA: hay políticas de storage.objects que no miran bucket_id (valen para todos los buckets, constancias-fiscales incluido): %', v_sueltas;
  end if;
end $$;
