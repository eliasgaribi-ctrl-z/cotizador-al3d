-- =====================================================================================================
-- 0016_plazos.sql — cuánto se guarda cada cosa en la nube (plazos de conservación)
-- =====================================================================================================
-- Elías decidió el 2026-10-16 (docs/DECISIONES-SUPABASE.md, «Plazos de conservación»):
--   1. Cotizaciones que NO se ganaron: se borran a los 8 MESES de su última actividad.
--   2. Bitácora: se conserva 1 AÑO; lo más viejo se borra.
--   3. Lo que se «borra» en la app (lápida `deleted_at`): se purga de verdad a los 30 DÍAS de marcado.
--   4. Respaldos semanales en Drive: los 8 más recientes (eso vive en la función `respaldo`, no aquí).
--   5. Libros de dinero (ventas, abonos, comisiones) y autorizaciones: NO se purgan nunca (contabilidad).
--
-- Qué deja:
--   · `interno.cotizacion_protegida(empresa, folio_global)`: la regla conservadora de «esto NO se toca» (ver abajo);
--   · `interno.purga_permitida(tabla, fila)` y una versión nueva de `interno.sin_borrar()`: el ÚNICO camino para borrar una fila de
--     negocio, explícito y acotado (ver «Cómo se borra algo que no se borra»);
--   · las purgas: `interno.purgar_bitacora`, `interno.purgar_cotizaciones_no_ganadas`, `interno.purgar_borrados` y la que corre todas,
--     `interno.purgar_plazos(p_ahora default now())`, que además deja una línea en la bitácora (nivel `direccion`) con lo que borró;
--   · la programación diaria con pg_cron (03:15 de México = 09:15 UTC) SI la extensión se puede habilitar. En Supabase se habilita
--     aquí mismo (`create extension if not exists pg_cron`). En PGlite (las pruebas) no existe: la migración lo detecta, avisa con un
--     NOTICE y sigue; las purgas quedan instaladas y se corren a mano (`select interno.purgar_plazos();`).
--
-- Quién las ejecuta: SOLO el dueño (`postgres`: el SQL Editor y el propio pg_cron, que corre el trabajo con el rol que lo programó).
-- Ni `service_role`, ni `authenticated`, ni `anon` (REVOKE a los cuatro; la auditoría de 0011 lo vigila con GR-01 y GR-08 y su lista
-- cerrada de `interno` no cambia). No son SECURITY DEFINER: corren con los privilegios de quien las llama, y solo el dueño tiene DELETE.
--
-- QUÉ CUENTA COMO «NO GANADA» (criterio conservador: ante la duda, se queda). Una cotización se borra a los 8 meses SOLO si NINGUNA
-- de estas es cierta (`interno.cotizacion_protegida`):
--   · su estado es `autorizada`, o tiene `autorizacion_id`, o `revocada_en`;
--   · existe CUALQUIER fila de `autorizaciones` con su folio global (vigente, superada o revocada: un sello firmado es evidencia de un PDF
--     impreso, aunque ya no valga);
--   · alguna de sus solicitudes quedó `autorizada` o apunta a un sello;
--   · existe un proyecto con su folio global que NO es una lápida pura: una venta (`folio_hoja`), una fila de la hoja o manual, cualquier
--     etapa distinta de `cancelado`, o una lápida con citas o requerimientos colgando;
--   · sus `hitos` dicen `venta` (el teléfono la marcó como vendida).
-- Lo que queda: `pendiente` sin resolver, `rechazada` y `retirada` (cancelada), sin sello y sin venta. Su «última actividad» es la más
-- reciente entre su `updated_at` (se mueve con cualquier cambio de datos o hitos), su `created_at`, el `updated_at` de sus solicitudes y
-- el de su lápida. Al borrarla se van con ella sus solicitudes (cola, no evidencia) y su lápida «No se dio» (un proyecto sin folio de
-- venta, sin dinero y sin obra): si no, el nombre y el teléfono del cliente se quedarían para siempre en la lápida.
--
-- LO BORRADO EN LA APP (30 días): hoy solo `cotizacion_guardar(borrar: true)` pone `deleted_at`, en `cotizaciones`. La purga cubre
-- también `cuaderno_notas` e `instalaciones` (tienen lápida aunque hoy ninguna RPC la ponga). Una cotización borrada que está
-- PROTEGIDA (ganada o con sello) NO se purga: la lápida se queda. `proyectos` y `ventas_dinero` también tienen `deleted_at` pero son
-- el LIBRO DE VENTAS: no se purgan nunca (decisión 5), como `abonos`, `autorizaciones`, el almacén y sus costos.
--
-- CÓMO SE BORRA ALGO QUE NO SE BORRA. Toda tabla de `public` lleva el trigger `sin_borrar` (GR-09 de la auditoría lo exige, por su
-- función exacta) y `service_role` no tiene DELETE (GR-06). Eso NO cambia. Lo que cambia es que `interno.sin_borrar()` deja pasar UNA
-- fila cuando se cumplen las tres cosas a la vez:
--   1. quien borra no es `anon`, `authenticated`, `service_role` ni `authenticator` (en la práctica: el dueño, dentro de una purga);
--   2. la purga marcó ESA tabla en la variable de transacción `al3d.purga` (`set_config(…, true)`: muere con la transacción y la purga la
--      limpia en cuanto termina su DELETE);
--   3. la fila cumple la regla de su tabla (`interno.purga_permitida`), revisada OTRA VEZ en el trigger, fila por fila: la bitácora solo si
--      su `ts` es anterior al corte que fijó la purga (`al3d.purga_corte`); una cotización, sus solicitudes y su lápida solo si la
--      cotización no está protegida; una lápida de cuaderno o de cita solo si su `deleted_at` es anterior al corte; cualquier otra tabla
--      (ventas_dinero, abonos, autorizaciones, almacén…), NUNCA.
-- El UPDATE sigue cerrado como siempre (`solo_agregar` en la bitácora, `autorizaciones_inmutable`, etc.): esto abre el borrado acotado
-- de la purga, no la edición. Y nadie fuera del dueño tiene el privilegio DELETE, así que la variable sola no le sirve a nadie más.
--
-- Realtime: las tablas publicadas tienen identidad de réplica DEFAULT (GR-05), así que el aviso de un DELETE lleva solo la llave primaria
-- (el folio global de la cotización, el id de la bitácora, el de la lápida): nunca la fila. Es el mismo residuo que justificó la regla A.6
-- (sin borrados duros desde la app); aquí se acepta porque lo borra el sistema, de noche, y ya era invisible para quien lo recibe.
--
-- Bordes: «a los 8 meses» quiere decir que una fila con EXACTAMENTE 8 meses (o 1 año, o 30 días) ya se borra (`<=`). Los meses son de
-- calendario (`interval '8 months'`). Todas las purgas aceptan `p_ahora` (por omisión `now()`) para probar los bordes sin esperar.
--
-- Depende de: 0001…0015. Idempotente (create or replace; cron.schedule con nombre reemplaza el trabajo). Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. Lo que no se toca: la regla conservadora de «cotización ganada o con sello»
-- -----------------------------------------------------------------------------------------------------
create or replace function interno.cotizacion_protegida(p_empresa text, p_folio_global text) returns boolean
language sql stable set search_path = '' as $$
  select
    -- la propia cotización: autorizada, con sello o revocada, o marcada como vendida en el teléfono
    exists (select 1 from public.cotizaciones c
             where c.empresa_id = p_empresa and c.folio_global = p_folio_global
               and (c.estado = 'autorizada' or c.autorizacion_id is not null or c.revocada_en is not null or c.hitos ? 'venta'))
    -- cualquier sello firmado con su folio, en cualquier estado
    or exists (select 1 from public.autorizaciones a where a.empresa_id = p_empresa and a.folio_global = p_folio_global)
    -- una solicitud que terminó en sello
    or exists (select 1 from public.solicitudes s
                where s.empresa_id = p_empresa and s.folio_global = p_folio_global and (s.estado = 'autorizada' or s.autorizacion_id is not null))
    -- un proyecto con su folio que no es una lápida pura (sin venta, sin obra colgando)
    or exists (select 1 from public.proyectos p
                where p.empresa_id = p_empresa and p.folio_global = p_folio_global
                  and (p.folio_hoja is not null or p.fuente <> 'cotizacion' or p.etapa is distinct from 'cancelado'
                       or exists (select 1 from public.ventas_dinero d  where d.empresa_id = p.empresa_id and d.proyecto_id = p.id)
                       or exists (select 1 from public.instalaciones i  where i.empresa_id = p.empresa_id and i.proyecto_id = p.id)
                       or exists (select 1 from public.requerimientos r where r.empresa_id = p.empresa_id and r.proyecto_id = p.id)))
$$;
revoke all on function interno.cotizacion_protegida(text, text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. El único camino para borrar: `sin_borrar` con su excepción acotada
-- -----------------------------------------------------------------------------------------------------
-- La regla de cada tabla, revisada en el trigger fila por fila. Lo que no está aquí no se borra nunca.
create or replace function interno.purga_permitida(p_tabla text, p_fila jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare v_corte timestamptz := nullif(pg_catalog.current_setting('al3d.purga_corte', true), '')::timestamptz;
begin
  case p_tabla
    when 'bitacora' then
      return v_corte is not null and (p_fila ->> 'ts')::timestamptz <= v_corte;
    when 'cuaderno_notas', 'instalaciones' then
      return v_corte is not null and p_fila ->> 'deleted_at' is not null and (p_fila ->> 'deleted_at')::timestamptz <= v_corte;
    when 'cotizaciones' then
      return not interno.cotizacion_protegida(p_fila ->> 'empresa_id', p_fila ->> 'folio_global');
    when 'solicitudes' then
      return p_fila ->> 'autorizacion_id' is null and p_fila ->> 'estado' <> 'autorizada'
         and not interno.cotizacion_protegida(p_fila ->> 'empresa_id', p_fila ->> 'folio_global');
    when 'proyectos' then
      -- solo la lápida «No se dio» de una cotización no ganada: sin folio de venta (el CHECK proyectos_libro ya impide que una lápida
      -- tenga dinero) y sin nada colgando (cotizacion_protegida lo revisa)
      return p_fila ->> 'folio_hoja' is null and p_fila ->> 'fuente' = 'cotizacion' and p_fila ->> 'etapa' = 'cancelado'
         and p_fila ->> 'folio_global' is not null
         and not interno.cotizacion_protegida(p_fila ->> 'empresa_id', p_fila ->> 'folio_global');
    else
      return false;     -- ventas_dinero, abonos, autorizaciones, almacén, costos, miembros, empresas…: nunca
  end case;
end $$;
revoke all on function interno.purga_permitida(text, jsonb) from public, anon, authenticated, service_role;

-- La misma función de 0001 (GR-09 la busca por su firma exacta), con la excepción de la purga. Fuera de una purga se porta IGUAL que
-- siempre: el mismo error con el mismo texto.
create or replace function interno.sin_borrar() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_schema = 'public'
     and current_user::text not in ('anon', 'authenticated', 'service_role', 'authenticator')
     and coalesce(pg_catalog.current_setting('al3d.purga', true), '') = tg_table_name
     and interno.purga_permitida(tg_table_name, pg_catalog.to_jsonb(old)) then
    return old;
  end if;
  raise exception 'Las filas de % no se borran: use su baja logica', tg_table_name using errcode = 'P0001';
end $$;
revoke all on function interno.sin_borrar() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Las purgas
-- -----------------------------------------------------------------------------------------------------
-- Borra UNA cotización no ganada con sus solicitudes y su lápida. Si está protegida, no toca nada y contesta false. La fila se bloquea
-- primero: si algo la está tocando en ese momento, la purga espera y vuelve a revisar con lo ya confirmado.
create or replace function interno.purgar_cotizacion(p_empresa text, p_folio_global text) returns boolean
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.cotizaciones c where c.empresa_id = p_empresa and c.folio_global = p_folio_global for update;
  if not found or interno.cotizacion_protegida(p_empresa, p_folio_global) then return false; end if;
  perform pg_catalog.set_config('al3d.purga', 'solicitudes', true);
  delete from public.solicitudes s where s.empresa_id = p_empresa and s.folio_global = p_folio_global;
  perform pg_catalog.set_config('al3d.purga', 'proyectos', true);
  delete from public.proyectos p where p.empresa_id = p_empresa and p.folio_global = p_folio_global
                                   and p.folio_hoja is null and p.fuente = 'cotizacion' and p.etapa = 'cancelado';
  perform pg_catalog.set_config('al3d.purga', 'cotizaciones', true);
  delete from public.cotizaciones c where c.empresa_id = p_empresa and c.folio_global = p_folio_global;
  perform pg_catalog.set_config('al3d.purga', '', true);
  return true;
end $$;
revoke all on function interno.purgar_cotizacion(text, text) from public, anon, authenticated, service_role;

-- Plazo 2: la bitácora de más de 1 año (por `ts`, la hora del hecho). Devuelve cuántas filas borró.
create or replace function interno.purgar_bitacora(p_ahora timestamptz default now()) returns integer
language plpgsql set search_path = '' as $$
declare v_corte timestamptz := coalesce(p_ahora, now()) - interval '1 year'; v_n integer;
begin
  perform pg_catalog.set_config('al3d.purga_corte', v_corte::text, true);
  perform pg_catalog.set_config('al3d.purga', 'bitacora', true);
  delete from public.bitacora b where b.ts <= v_corte;
  get diagnostics v_n = row_count;
  perform pg_catalog.set_config('al3d.purga', '', true);
  perform pg_catalog.set_config('al3d.purga_corte', '', true);
  return v_n;
end $$;
revoke all on function interno.purgar_bitacora(timestamptz) from public, anon, authenticated, service_role;

-- Plazo 1: las cotizaciones no ganadas sin actividad en 8 meses. Cada una en su propio bloque: una que falle no detiene a las demás.
-- Devuelve {borradas, errores}.
create or replace function interno.purgar_cotizaciones_no_ganadas(p_ahora timestamptz default now()) returns jsonb
language plpgsql set search_path = '' as $$
declare v_corte timestamptz := coalesce(p_ahora, now()) - interval '8 months'; r record; v_n integer := 0; v_err jsonb := '[]'::jsonb;
begin
  for r in
    select c.empresa_id, c.folio_global
      from public.cotizaciones c
     where greatest(c.updated_at, c.created_at,
                    (select max(s.updated_at) from public.solicitudes s where s.empresa_id = c.empresa_id and s.folio_global = c.folio_global),
                    (select max(p.updated_at) from public.proyectos p  where p.empresa_id = c.empresa_id and p.folio_global = c.folio_global)) <= v_corte
       and not interno.cotizacion_protegida(c.empresa_id, c.folio_global)
     order by c.empresa_id, c.folio_global
  loop
    begin
      if interno.purgar_cotizacion(r.empresa_id, r.folio_global) then v_n := v_n + 1; end if;
    exception when others then
      v_err := v_err || pg_catalog.jsonb_build_object('empresa', r.empresa_id, 'folio_global', r.folio_global, 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200));
    end;
  end loop;
  return pg_catalog.jsonb_build_object('borradas', v_n, 'errores', v_err);
end $$;
revoke all on function interno.purgar_cotizaciones_no_ganadas(timestamptz) from public, anon, authenticated, service_role;

-- Plazo 3: lo marcado como borrado hace 30 días o más. Devuelve {cotizaciones, cuaderno_notas, instalaciones, errores}.
create or replace function interno.purgar_borrados(p_ahora timestamptz default now()) returns jsonb
language plpgsql set search_path = '' as $$
declare v_corte timestamptz := coalesce(p_ahora, now()) - interval '30 days'; r record; v_cot integer := 0; v_cua integer := 0; v_ins integer := 0;
        v_err jsonb := '[]'::jsonb;
begin
  -- cotizaciones borradas en la app y NO protegidas (una ganada o con sello se queda con su lápida)
  for r in select c.empresa_id, c.folio_global from public.cotizaciones c
            where c.deleted_at is not null and c.deleted_at <= v_corte and not interno.cotizacion_protegida(c.empresa_id, c.folio_global)
            order by c.empresa_id, c.folio_global loop
    begin
      if interno.purgar_cotizacion(r.empresa_id, r.folio_global) then v_cot := v_cot + 1; end if;
    exception when others then
      v_err := v_err || pg_catalog.jsonb_build_object('empresa', r.empresa_id, 'folio_global', r.folio_global, 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200));
    end;
  end loop;

  perform pg_catalog.set_config('al3d.purga_corte', v_corte::text, true);
  begin
    perform pg_catalog.set_config('al3d.purga', 'cuaderno_notas', true);
    delete from public.cuaderno_notas n where n.deleted_at is not null and n.deleted_at <= v_corte;
    get diagnostics v_cua = row_count;
  exception when others then
    v_err := v_err || pg_catalog.jsonb_build_object('tabla', 'cuaderno_notas', 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200));
  end;
  begin
    perform pg_catalog.set_config('al3d.purga', 'instalaciones', true);
    delete from public.instalaciones i where i.deleted_at is not null and i.deleted_at <= v_corte;
    get diagnostics v_ins = row_count;
  exception when others then
    v_err := v_err || pg_catalog.jsonb_build_object('tabla', 'instalaciones', 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200));
  end;
  perform pg_catalog.set_config('al3d.purga', '', true);
  perform pg_catalog.set_config('al3d.purga_corte', '', true);
  return pg_catalog.jsonb_build_object('cotizaciones', v_cot, 'cuaderno_notas', v_cua, 'instalaciones', v_ins, 'errores', v_err);
end $$;
revoke all on function interno.purgar_borrados(timestamptz) from public, anon, authenticated, service_role;

-- Cuántas filas purgables tiene cada empresa: la línea de la bitácora de cada una dice SOLO lo suyo (antes menos después).
create or replace function interno.conteo_purgable() returns jsonb language sql stable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_object_agg(e.id, pg_catalog.jsonb_build_object(
           'cotizaciones',   (select count(*) from public.cotizaciones   x where x.empresa_id = e.id),
           'solicitudes',    (select count(*) from public.solicitudes    x where x.empresa_id = e.id),
           'lapidas',        (select count(*) from public.proyectos      x where x.empresa_id = e.id and x.folio_hoja is null),
           'cuaderno_notas', (select count(*) from public.cuaderno_notas x where x.empresa_id = e.id),
           'instalaciones',  (select count(*) from public.instalaciones  x where x.empresa_id = e.id),
           'bitacora',       (select count(*) from public.bitacora       x where x.empresa_id = e.id))), '{}'::jsonb)
    from public.empresas e $$;
revoke all on function interno.conteo_purgable() from public, anon, authenticated, service_role;

-- Todas, en orden (primero lo borrado en la app, luego lo no ganado, al final la bitácora: la línea de esta corrida entra DESPUÉS y no
-- se borra a sí misma). Cada plazo en su bloque: uno que falle no detiene a los otros. Devuelve el resumen de toda la base y, en la
-- bitácora de CADA empresa donde se borró algo (o algo falló), deja una línea nivel `direccion` (solo Dirección la lee) con lo suyo.
create or replace function interno.purgar_plazos(p_ahora timestamptz default now()) returns jsonb
language plpgsql set search_path = '' as $$
declare v_ahora timestamptz := coalesce(p_ahora, now()); v_borr jsonb; v_cot jsonb; v_bit integer; v_err jsonb := '[]'::jsonb; v_res jsonb;
        v_antes jsonb := interno.conteo_purgable(); v_despues jsonb; e record; k text; v_dif jsonb; v_n integer; v_total integer; v_err_e jsonb;
begin
  begin v_borr := interno.purgar_borrados(v_ahora);
  exception when others then v_err := v_err || pg_catalog.jsonb_build_object('plazo', 'borrados', 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200)); end;
  begin v_cot := interno.purgar_cotizaciones_no_ganadas(v_ahora);
  exception when others then v_err := v_err || pg_catalog.jsonb_build_object('plazo', 'cotizaciones', 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200)); end;
  begin v_bit := interno.purgar_bitacora(v_ahora);
  exception when others then v_err := v_err || pg_catalog.jsonb_build_object('plazo', 'bitacora', 'error', sqlstate || ' ' || pg_catalog.left(sqlerrm, 200)); end;

  v_err := v_err || coalesce(v_borr -> 'errores', '[]'::jsonb) || coalesce(v_cot -> 'errores', '[]'::jsonb);
  v_res := pg_catalog.jsonb_build_object(
    'ahora', v_ahora,
    'cotizaciones_no_ganadas', coalesce((v_cot ->> 'borradas')::integer, 0),
    'borrados', pg_catalog.jsonb_build_object('cotizaciones', coalesce((v_borr ->> 'cotizaciones')::integer, 0),
                                              'cuaderno_notas', coalesce((v_borr ->> 'cuaderno_notas')::integer, 0),
                                              'instalaciones', coalesce((v_borr ->> 'instalaciones')::integer, 0)),
    'bitacora', coalesce(v_bit, 0),
    'errores', v_err);

  -- La línea de cada empresa: la diferencia de SUS conteos, y solo los errores suyos (o los que no son de ninguna en particular).
  v_despues := interno.conteo_purgable();
  for e in select x.id from public.empresas x order by x.id loop
    v_dif := '{}'::jsonb; v_total := 0;
    for k in select pg_catalog.jsonb_object_keys(coalesce(v_antes -> e.id, '{}'::jsonb)) loop
      v_n := (v_antes -> e.id ->> k)::integer - coalesce((v_despues -> e.id ->> k)::integer, 0);
      v_dif := v_dif || pg_catalog.jsonb_build_object(k, v_n);
      v_total := v_total + v_n;
    end loop;
    select coalesce(pg_catalog.jsonb_agg(x.v), '[]'::jsonb) into v_err_e
      from pg_catalog.jsonb_array_elements(v_err) x(v) where not (x.v ? 'empresa') or x.v ->> 'empresa' = e.id;
    if v_total > 0 or pg_catalog.jsonb_array_length(v_err_e) > 0 then
      insert into public.bitacora (empresa_id, nivel, accion, entidad, entidad_id, titulo, detalle, despues, usuario_texto, rol, dispositivo)
      values (e.id, 'direccion', 'purgo', 'sistema', 'plazos',
              pg_catalog.left('Plazos de conservación: ' || v_total || ' fila(s) borrada(s)'
                              || case when pg_catalog.jsonb_array_length(v_err_e) > 0 then ', con ' || pg_catalog.jsonb_array_length(v_err_e) || ' error(es)' else '' end, 200),
              'Cotizaciones no ganadas (8 meses, con sus solicitudes y lápidas), borrados de la app (30 días) y bitácora (1 año).',
              pg_catalog.jsonb_build_object('ahora', v_ahora, 'borradas', v_dif, 'errores', v_err_e), 'sistema (plazos)', 'sistema', 'srv');
    end if;
  end loop;
  return v_res;
end $$;
revoke all on function interno.purgar_plazos(timestamptz) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 4. La programación diaria (pg_cron), si se puede
-- -----------------------------------------------------------------------------------------------------
-- En Supabase: habilita pg_cron (el dueño `postgres` puede) y programa `al3d-plazos` todos los días a las 09:15 UTC (03:15 en México).
-- `cron.schedule` con nombre REEMPLAZA el trabajo si ya existía: volver a aplicar no lo duplica. Para verlo:
--     select jobid, jobname, schedule, command, active from cron.job where jobname = 'al3d-plazos';
--     select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'al3d-plazos') order by start_time desc limit 5;
-- Para apagarlo sin tocar las funciones:  select cron.unschedule('al3d-plazos');
-- En PGlite (las pruebas) pg_cron no existe: se avisa con NOTICE y la migración sigue; ahí las purgas se corren a mano.
do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'PLAZOS: pg_cron no está disponible aquí (% %). Las purgas quedan instaladas pero SIN programar: córrelas a mano con «select interno.purgar_plazos();».', sqlstate, sqlerrm;
    return;
  end;
  execute $q$select cron.schedule('al3d-plazos', '15 9 * * *', 'select interno.purgar_plazos()')$q$;
  raise notice 'PLAZOS: programado «al3d-plazos» con pg_cron, todos los días a las 09:15 UTC (03:15 en México).';
end $cron$;


-- -----------------------------------------------------------------------------------------------------
-- 5. La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0016): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
