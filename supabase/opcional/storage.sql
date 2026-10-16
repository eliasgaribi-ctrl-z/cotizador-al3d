-- =====================================================================================================
-- opcional/storage.sql — el bucket privado de las imágenes de las cotizaciones y sus políticas
-- =====================================================================================================
-- OPCIONAL y APARTE: no es una migración. Necesita el esquema `storage` de Supabase (no existe en PGlite) y se aplica a mano, en el Editor SQL del
-- proyecto (completo, de una vez), DESPUÉS de las migraciones 0001–0017. Es idempotente: se puede volver a aplicar, y cada vez deja el bucket y las
-- políticas exactamente como dice este archivo.
--
-- Por qué vive en `opcional/` y no es la migración 0018 (decidido el 2026-10-16): todo lo de `migrations/` corre también en PGlite, en cada prueba, y PGlite no
-- trae Storage. Una 0018 tendría que saltarse en silencio cuando falta `storage`, y entonces el arnés diría «verde» sin haber probado nada. Aquí, en cambio,
-- `supabase/tests/notario/imagenes-storage.mjs` aplica ESTE archivo sobre un sustituto mínimo de `storage` y prueba cada política, y la prueba de humo (bloque 11)
-- la repite en el proyecto real. Además, una función nueva en `interno` haría tronar la auditoría de 0011 (GR-08: lista cerrada) en cada migración que venga:
-- por eso este archivo NO crea ninguna función; las políticas usan solo lo que ya existe.
--
-- Qué guarda. Las imágenes de las cotizaciones (`al3d_cot_imgs` del teléfono: el plano de cada partida, los renders y la propuesta visual; JPEG de hasta
-- 1800 px). NO entran a la base: se suben desde el teléfono (js/datos/supa-imagenes.js) y `cotizaciones.datos` las referencia por id. Ruta de cada objeto:
--         <empresa>/<folio_global>/<id>.jpg           p. ej.  al3d/COT-0042-B@K7QM/img-mf1k2x-a8c3d0.jpg
-- Una imagen que comparten dos cotizaciones (una duplicada de otra) se sube UNA vez, en la carpeta de la más vieja; el teléfono la busca ahí.
--
-- Quién puede qué (DISENO.md §3.5 y DECISIONES Q-02, confirmada por Elías el 2026-10-16):
--   · LEER: quien puede VER ESA COTIZACIÓN. No se repite la regla: la política pregunta si existe la cotización de la carpeta CON LOS PERMISOS DE QUIEN LEE, y
--           así decide la RLS de `public.cotizaciones` (0008: `cotizaciones_sel_direccion` y `cotizaciones_sel_autor_pagos`): Dirección, todas; Pagos, las suyas
--           (`creado_por`); Fabricación, NINGUNA, porque las cotizaciones llevan precios. Si Q-02 cambia, las imágenes la siguen solas. Además Dirección lee
--           todo lo de su empresa aunque la cotización todavía no esté en la base (hoy la app no las sube: solo las fotos).
--   · SUBIR: el AUTOR de la cotización (Pagos, con la cotización ya en la base y a su nombre) o Dirección de esa empresa (cualquier carpeta de su empresa). Con
--           la forma exacta <empresa>/<folio_global>/<id>.jpg. Fabricación nunca: no ve la cotización.
--   · CAMBIAR (sobrescribir, mover) y BORRAR: solo Dirección de esa empresa. El teléfono nunca sobrescribe: una imagen es inmutable por su id (sube con
--           `upsert: false` y un «ya existe» es «ya estaba»).
--   · `anon` no tiene ninguna política: no ve nada, ni la lista de nombres. El bucket es PRIVADO: no hay URL pública; cada lectura es una URL firmada de vida
--           corta (60 s) o una descarga con sesión.
-- La empresa de la ruta se compara con `interno.empresas_donde(…)`, la MISMA función que usan las políticas de las tablas: quien es Dirección en una empresa y
-- Fabricación en otra recibe, en cada ruta, los privilegios de ESA empresa, y una baja surte efecto en la siguiente petición.
--
-- La purga de 0016 y las imágenes (decidido el 2026-10-16: se quedan, documentadas; NO se borran desde SQL). Cuando `interno.purgar_cotizaciones_no_ganadas`
-- borra una cotización, sus imágenes se quedan en el bucket. Por qué es lo más seguro:
--   · borrar la fila de `storage.objects` con SQL NO borra el archivo (queda huérfano en el almacenamiento, ocupando espacio, sin forma de encontrarlo;
--     según la versión, Storage incluso rechaza ese DELETE). Borrar de verdad es por la API de Storage, que pide una llave y una petición HTTP, y la purga
--     corre en pg_cron como el dueño de la base, sin red y sin secretos: así debe seguir;
--   · la privacidad no espera: en cuanto la cotización ya no existe, Pagos deja de ver sus imágenes (la política de lectura pregunta por ella). Solo Dirección
--     las sigue viendo, igual que antes;
--   · el teléfono solo sube imágenes del HISTORIAL, que son cotizaciones AUTORIZADAS, y la purga de 0016 protege toda cotización autorizada o con sello: lo
--     normal es que una imagen subida nunca quede huérfana.
-- Cómo ver y borrar las que sí queden: `supabase/README.md`, «Las imágenes de las cotizaciones (Storage)».
--
-- Lo que NO se probó contra Storage de verdad (PGlite no lo tiene): el servicio (subida, `upsert`, URLs firmadas) y la forma exacta de `storage.objects` en la
-- versión del proyecto. `supabase/tests/notario/imagenes-storage.mjs` prueba estas políticas contra un SUSTITUTO de `storage` (mismas columnas que usan y
-- `storage.foldername`); el bloque 11 de `prueba-de-humo.sql` las repite en el proyecto real.
-- =====================================================================================================

do $$ begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception 'Este archivo necesita el esquema storage de Supabase (storage.objects y storage.buckets): aplícalo en el proyecto real, no en una base común.';
  end if;
  if to_regprocedure('interno.empresas_donde(text[])') is null or to_regclass('public.cotizaciones') is null then
    raise exception 'Faltan las migraciones: aplica 0001–0017 antes que este archivo (interno.empresas_donde, public.cotizaciones).';
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 1. El bucket: PRIVADO, con tope de tamaño y solo imágenes
-- -----------------------------------------------------------------------------------------------------
-- 2 MB por objeto: el teléfono reduce cada imagen a 1800 px de lado como máximo en JPEG (calidad 0.86-0.9), lo que deja casi todas entre 150 y 700 KB; el
-- tope deja margen sin dejar subir cualquier cosa, y el teléfono ni lo intenta con una más pesada. Solo imagen (hoy todas son JPEG; png y webp quedan por si
-- el teléfono cambia). `public = false` se REPITE en el `do update`: aunque alguien lo haya vuelto público a mano, volver a aplicar este archivo lo cierra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizacion-imagenes', 'cotizacion-imagenes', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------------------------------
-- 2. Las políticas sobre storage.objects (solo para `authenticated`; `anon` no tiene ninguna)
-- -----------------------------------------------------------------------------------------------------
-- `storage.objects` ya trae RLS encendida en Supabase. Cada política se limita a ESTE bucket: no toca los de otros usos del proyecto.
-- `storage.foldername(name)` devuelve las carpetas de la ruta (sin el archivo): [1] = empresa, [2] = folio global.
-- La forma de la ruta, la misma que el teléfono arma (js/datos/supa-imagenes.js, `rutaDe`): empresa como `empresas.id`, folio global como
-- `cotizaciones.folio_global` y el id de la imagen de `al3d_cot_imgs` (img-<base36>-<6>), con .jpg.

drop policy if exists cotizacion_imagenes_leer    on storage.objects;
drop policy if exists cotizacion_imagenes_subir   on storage.objects;
drop policy if exists cotizacion_imagenes_cambiar on storage.objects;
drop policy if exists cotizacion_imagenes_borrar  on storage.objects;

-- LEER. El `exists` corre con los permisos de quien lee: la RLS de `public.cotizaciones` es la que decide (Q-02). Se evalúa por objeto y va por la llave
-- primaria de `cotizaciones` (empresa_id, folio_global).
create policy cotizacion_imagenes_leer on storage.objects for select to authenticated
  using (bucket_id = 'cotizacion-imagenes'
         and ((storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion']))
              or exists (select 1 from public.cotizaciones c
                          where c.empresa_id = (storage.foldername(name))[1]
                            and c.folio_global = (storage.foldername(name))[2])));

-- SUBIR. Dirección, en cualquier carpeta de su empresa; Pagos, solo en la de una cotización suya que ya esté en la base. Las condiciones de Pagos se escriben
-- aunque la RLS de `cotizaciones` ya las impone: si un día Q-02 deja LEER a más gente, subir no se abre con ella.
create policy cotizacion_imagenes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cotizacion-imagenes'
              and name ~ '^[a-z][a-z0-9_]{1,31}/[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}/[A-Za-z0-9_-]{1,64}\.jpg$'
              and ((storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion']))
                   or exists (select 1 from public.cotizaciones c
                               where c.empresa_id = (storage.foldername(name))[1]
                                 and c.folio_global = (storage.foldername(name))[2]
                                 and c.creado_por = (select auth.uid())
                                 and c.empresa_id in (select interno.empresas_donde(array['pagos'])))));

-- CAMBIAR: solo Dirección, y sin sacar el objeto de su empresa ni de la forma de ruta.
create policy cotizacion_imagenes_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'cotizacion-imagenes'
         and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion'])))
  with check (bucket_id = 'cotizacion-imagenes'
              and name ~ '^[a-z][a-z0-9_]{1,31}/[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}/[A-Za-z0-9_-]{1,64}\.jpg$'
              and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion'])));

-- BORRAR: solo Dirección (desde el panel o la API de Storage; ver arriba lo de la purga).
create policy cotizacion_imagenes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'cotizacion-imagenes'
         and (storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion'])));


-- -----------------------------------------------------------------------------------------------------
-- 3. Comprobación al final: el bucket quedó privado y nada más lo abre
-- -----------------------------------------------------------------------------------------------------
-- Las políticas PERMISIVAS se suman: una sola política suelta que deje pasar este bucket (hecha a mano en el panel, de otro uso, o una vieja) le abriría las
-- imágenes —con sus precios a la vista en el plano— a quien no debe, por ejemplo a Fabricación. Este archivo se detiene si:
--   · el bucket no quedó privado;
--   · otra política permisiva de `storage.objects` nombra este bucket (solo valen las cuatro de arriba);
--   · otra política permisiva de `storage.objects` no mira `bucket_id` (valdría para TODOS los buckets, este incluido).
-- Las restrictivas (`as restrictive`) solo pueden cerrar, así que no se revisan. Una política de OTRO bucket que sí mira su `bucket_id` no es asunto de aquí.
do $$
declare v_publico boolean; v_ajenas text; v_sueltas text;
begin
  select b.public into v_publico from storage.buckets b where b.id = 'cotizacion-imagenes';
  if v_publico is distinct from false then
    raise exception 'AUDITORIA: el bucket cotizacion-imagenes debe ser privado y no lo es.';
  end if;
  select pg_catalog.string_agg(p.polname, ', ' order by p.polname) into v_ajenas
    from pg_policy p
   where p.polrelid = 'storage.objects'::regclass and p.polpermissive
     and p.polname not in ('cotizacion_imagenes_leer', 'cotizacion_imagenes_subir', 'cotizacion_imagenes_cambiar', 'cotizacion_imagenes_borrar')
     and (coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') like '%cotizacion-imagenes%'
          or coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') like '%cotizacion-imagenes%');
  if v_ajenas is not null then
    raise exception 'AUDITORIA: hay políticas de storage.objects que no son de este archivo y abren el bucket cotizacion-imagenes: %', v_ajenas;
  end if;
  select pg_catalog.string_agg(p.polname, ', ' order by p.polname) into v_sueltas
    from pg_policy p
   where p.polrelid = 'storage.objects'::regclass and p.polpermissive
     and p.polname not in ('cotizacion_imagenes_leer', 'cotizacion_imagenes_subir', 'cotizacion_imagenes_cambiar', 'cotizacion_imagenes_borrar')
     and coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') not like '%bucket_id%'
     and coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%bucket_id%';
  if v_sueltas is not null then
    raise exception 'AUDITORIA: hay políticas de storage.objects que no miran bucket_id (valen para todos los buckets, cotizacion-imagenes incluido): %', v_sueltas;
  end if;
end $$;
