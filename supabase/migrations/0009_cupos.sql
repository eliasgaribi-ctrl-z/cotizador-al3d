-- =====================================================================================================
-- 0009_cupos.sql — lo que hoy es «estado del script» y una función sin estado no puede guardar (R11)
-- =====================================================================================================
-- Qué deja (todas SOLO para `service_role`: las llaman las Edge Functions; `authenticated` ni siquiera lee `contadores`):
--   · `ia_cuota`   — el tope de 200 consultas de IA por persona y por DÍA DE MÉXICO;
--   · `ia_turno`   — el turno de las llaves de IA (reemplaza a IA_ROTACION);
--   · `verificar_cupo` — el tope de /verificar: 30 por folio y 400 en total por ventana de 600 s, y 60 por IP;
--   · `contador_sembrar` — siembra un contador por ENCIMA de lo que ya tiene la hoja (V-###, P-###, la secuencia del almacén).
--
-- Depende de: 0001 (`contadores` y `interno.siguiente`).
--
-- Principio: una Edge Function o una RPC NO guardan estado. Todo lo que hoy es `PropertiesService`/`CacheService` vive en `contadores` y solo lo tocan
-- funciones `SECURITY DEFINER`. Es la única tabla sin el trigger `sin_borrar`: las ventanas vencidas se limpian SOLAS (borrado perezoso de hasta 20 filas
-- por llamada), no por `pg_cron` (que no se usa en el núcleo). Las funciones de este archivo escriben con los privilegios de su dueño, así que
-- `service_role` no necesita —ni tiene— DELETE sobre `contadores`.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. contador_sembrar
-- -----------------------------------------------------------------------------------------------------
-- `n := greatest(n, p_minimo)`: SOLO SUBE. Siembra `V` por encima del máximo de la hoja y de sus respaldos (antes de abrir escritura), `P` por encima del
-- máximo `P-###` de «Abonos comisión» y `alm` por encima de `ALMACEN_SECUENCIA`. Sembrar con un número menor no baja nada: la importación se puede repetir.
create or replace function public.contador_sembrar(p_empresa text, p_clave text, p_minimo bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if p_empresa is null or p_clave is null or pg_catalog.btrim(p_clave) = '' or p_minimo is null then return null; end if;
  insert into public.contadores as c (empresa_id, clave, ventana, n) values (p_empresa, p_clave, '', greatest(p_minimo, 0))
  on conflict (empresa_id, clave, ventana) do update set n = greatest(c.n, excluded.n), updated_at = clock_timestamp()
  returning c.n into v;
  return v;
end $$;
revoke all on function public.contador_sembrar(text, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.contador_sembrar(text, text, bigint) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. ia_cuota y ia_turno
-- -----------------------------------------------------------------------------------------------------
-- Hoy el día es GMT (`yyyyMMdd` en UTC) y por eso el tope de 200 se reinicia a las 18:00 de México. Aquí el día se cuenta en `America/Mexico_City`. La cuenta se
-- hace ANTES de llamar al proveedor y es atómica: `INSERT … ON CONFLICT DO UPDATE … WHERE n < tope` no actualiza (ni devuelve fila) cuando ya se llegó al tope,
-- así que el contador NUNCA pasa de 200 y la 201.ª recibe CUPO_AGOTADO (`transitorio: false`: no se arregla reintentando hoy). Cada persona tiene el suyo.
create or replace function public.ia_cuota(p_usuario uuid, p_limite int default 200, p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia text := interno.dia_mx(p_ahora); v_n bigint;
begin
  if p_usuario is null or p_limite is null or p_limite < 1 then return interno.err('DATO_INVALIDO', 'Falta el usuario o el tope.'); end if;
  delete from public.contadores where ctid in (                    -- limpieza perezosa: días de hace más de 3
    select x.ctid from public.contadores x where x.clave like 'ia:%' and x.ventana < interno.dia_mx(p_ahora - interval '3 days') limit 20);
  insert into public.contadores as c (empresa_id, clave, ventana, n) values ('*', 'ia:' || p_usuario::text, v_dia, 1)
  on conflict (empresa_id, clave, ventana) do update set n = c.n + 1, updated_at = clock_timestamp() where c.n < p_limite
  returning c.n into v_n;
  if v_n is null then
    return interno.err('CUPO_AGOTADO', 'Llegaste al tope de ' || p_limite || ' consultas de IA por hoy. Mañana se reinicia.',
                       pg_catalog.jsonb_build_object('transitorio', false, 'limite', p_limite, 'dia', v_dia));
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'usadas', v_n, 'limite', p_limite, 'dia', v_dia);
end $$;
revoke all on function public.ia_cuota(uuid, int, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.ia_cuota(uuid, int, timestamptz) to service_role;

-- El turno de las llaves de un proveedor (reemplaza a IA_ROTACION): 1, 2, … , 0, 1 (rota y vuelve).
create or replace function public.ia_turno(p_prov text, p_n int) returns int language sql security definer set search_path = '' as $$
  select (interno.siguiente('*', 'ia_turno:' || p_prov, '', 1) % greatest(p_n, 1))::int $$;
revoke all on function public.ia_turno(text, int) from public, anon, authenticated, service_role;
grant execute on function public.ia_turno(text, int) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. verificar_cupo
-- -----------------------------------------------------------------------------------------------------
-- Se conservan los topes de hoy: 30 por folio corto y 400 en total por ventana FIJA de 600 s (VERIFICAR_POR_FOLIO, VERIFICAR_EN_TOTAL), y se agregan dos cosas
-- que `CacheService` no podía: el folio se cuenta EN MAYÚSCULAS (hoy `cot-0042` y `COT-0042` son cubetas distintas y el tope por folio es burlable) y un tope
-- POR IP (60 por ventana; el hash lo manda la Edge Function desde `x-forwarded-for`; se omite si no hay IP). Se cuenta ANTES de buscar. Un fallo de la base NO
-- deja pasar: la Edge Function responde un error explícito (hoy `CacheService` falla abierto).
create or replace function public.verificar_cupo(p_folio_corto text, p_ahora timestamptz default now(), p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_w bigint := floor(extract(epoch from p_ahora) / 600)::bigint;
        v_k text   := 'ver:' || pg_catalog.left(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.upper(coalesce(p_folio_corto, '')), 'UTF8')), 'hex'), 24);
        n1 bigint; n2 bigint; n3 bigint := 0;
begin
  delete from public.contadores where ctid in (                    -- ventanas de hace más de 6 (1 h)
    select x.ctid from public.contadores x
     where x.clave like 'ver:%' and (case when x.ventana ~ '^[0-9]+$' then x.ventana::bigint end) < v_w - 6 limit 20);
  n1 := interno.siguiente('*', v_k,         v_w::text, 1);
  n2 := interno.siguiente('*', 'ver:total', v_w::text, 1);
  if p_ip is not null then
    n3 := interno.siguiente('*', 'ver:ip:' || pg_catalog.left(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ip, 'UTF8')), 'hex'), 24), v_w::text, 1);
  end if;
  if n1 <= 30 and n2 <= 400 and n3 <= 60 then return pg_catalog.jsonb_build_object('ok', true, 'n_folio', n1, 'n_total', n2); end if;     -- la 31.ª del folio y la 401.ª total se rechazan
  return interno.err('SIN_RED', 'Demasiadas consultas seguidas. Espera unos minutos.');
end $$;
revoke all on function public.verificar_cupo(text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.verificar_cupo(text, timestamptz, text) to service_role;
