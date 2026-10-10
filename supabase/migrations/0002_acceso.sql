-- =====================================================================================================
-- 0002_acceso.sql — quién entra, con qué área, y los ayudantes que todas las RPC y políticas comparten
-- =====================================================================================================
-- Qué deja:
--   · la tabla `miembros` (acceso por CORREO: una invitación es una fila sin `usuario_id`; quitar el acceso no
--     borra la fila: `estado = 'baja'`, que es la evidencia y la única fuente de la señal `acceso_revocado`);
--   · las políticas de lectura de `empresas`, `bitacora` y `miembros` (las dos primeras tablas las creó 0001);
--   · los ayudantes del esquema `interno`: `empresas_donde`, `correo_verificado`, `ctx` (+ su tipo `contexto_t`),
--     `guardia_contrato`, `matriz_permisos`, `anotar` y `preambulo`;
--   · las RPC `mi_acceso`, `reclamar_acceso`, `miembro_alta`, `miembro_cambiar_area`, `miembro_baja` y
--     `version_contrato`.
--
-- Depende de: 0001.
--
-- Principios que se cumplen aquí (y que las pruebas de supabase/tests/acceso/ comprueban):
--   · La identidad verificada es `auth.users.email_confirmed_at is not null` y un JWT que NO sea anónimo.
--     Jamás `user_metadata.email_verified`: el propio usuario lo edita con `updateUser`.
--   · `acceso_revocado` sale SOLO de una fila `baja` de `miembros`. Nunca por una lista vacía de RLS, un error,
--     un JWT vencido o falta de señal: un falso «fuera» ya cerró una sesión de verdad una vez (DEC Q-09).
--   · Una baja o un cambio de área surte efecto en la SIGUIENTE petición: `empresas_donde()` y `ctx()` leen
--     `miembros` en cada consulta, así que un JWT todavía vigente (hasta 1 h) deja de leer y escribir en el acto.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. miembros
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.miembros (
  empresa_id   text not null references public.empresas (id),
  correo       text not null check (correo = lower(btrim(correo)) and correo ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  area         text not null check (area in ('direccion','fabricacion','pagos')),   -- `cliente` queda para la fase 6: sin políticas, no ve nada
  estado       text not null default 'invitado' check (estado in ('invitado','activo','baja')),
  usuario_id   uuid,                         -- auth.users.id; sin FK a propósito: borrar la cuenta no debe borrar la evidencia
  nota         text not null default '' check (length(nota) <= 500),
  invitado_por uuid,
  invitado_en  timestamptz not null default now(),
  reclamado_en timestamptz,
  baja_en      timestamptz,
  baja_por     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default clock_timestamp(),
  primary key (empresa_id, correo),
  constraint miembros_estado_coherente check (
       (estado = 'invitado' and usuario_id is null)
    or (estado = 'activo'   and usuario_id is not null)
    or (estado = 'baja')
  )
);
-- una persona (usuario) tiene UN área activa por empresa:
create unique index if not exists miembros_activo_uno   on public.miembros (empresa_id, usuario_id) where usuario_id is not null and estado = 'activo';
create index        if not exists miembros_por_usuario  on public.miembros (usuario_id) where usuario_id is not null;
create index        if not exists miembros_sync         on public.miembros (empresa_id, updated_at, correo);

drop trigger if exists miembros_tocar      on public.miembros;
drop trigger if exists miembros_sin_borrar on public.miembros;
create trigger miembros_tocar      before insert or update on public.miembros for each row execute function interno.tocar();
create trigger miembros_sin_borrar before delete          on public.miembros for each row execute function interno.sin_borrar();

alter table public.miembros enable row level security;
revoke all on public.miembros from public, anon, authenticated, service_role;
grant select on public.miembros to authenticated;
grant select, insert, update on public.miembros to service_role;

-- Realtime: la tabla entra a la publicación (lista cerrada) con su identidad de réplica por DEFAULT: en un DELETE viajaría solo la llave
-- primaria, nunca la fila vieja (con FULL sí). El evento es solo un AVISO: el cliente responde con una lectura incremental por cursor.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.miembros replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'miembros') then
    alter publication supabase_realtime add table public.miembros;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 2. Ayudantes de seguridad (esquema interno)
-- -----------------------------------------------------------------------------------------------------
-- Los que leen `miembros` son SECURITY DEFINER (el dueño salta su RLS) para no recursar: la política de
-- `miembros` no puede preguntarle a `miembros` con los privilegios de quien consulta.

-- Empresas donde la persona es miembro ACTIVO con alguna de las áreas dadas. Las políticas la llaman como
-- `empresa_id in (select interno.empresas_donde(…))`, sin correlación: Postgres la evalúa UNA vez por consulta
-- (`hashed SubPlan`) y no una vez por fila. Una política se evalúa con los privilegios de quien consulta, por eso
-- `authenticated` y `service_role` la ejecutan.
create or replace function interno.empresas_donde(p_areas text[]) returns setof text
language sql stable security definer set search_path = '' as $$
  select m.empresa_id from public.miembros m
   where m.usuario_id = auth.uid() and m.estado = 'activo' and m.area = any (p_areas)
$$;
revoke all on function interno.empresas_donde(text[]) from public, anon, authenticated, service_role;
grant execute on function interno.empresas_donde(text[]) to authenticated, service_role;

-- El correo con el que la persona entró, SOLO si Supabase lo verificó y la sesión no es anónima. «No anónimo» sale
-- del claim `is_anonymous` del JWT. NUNCA `user_metadata.email_verified`: el usuario lo edita con `updateUser`.
create or replace function interno.correo_verificado() returns text
language sql stable security definer set search_path = '' as $$
  select pg_catalog.lower(pg_catalog.btrim(u.email)) from auth.users u
   where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
revoke all on function interno.correo_verificado() from public, anon, authenticated, service_role;

-- Contexto de una RPC: empresa, área y MOTIVO. Aquí nace la señal explícita `acceso_revocado` (R8):
--   'ok' | 'sin_sesion' | 'sin_acceso' (nunca tuvo fila) | 'acceso_revocado' (tuvo y la fila quedó en 'baja') | 'empresa_requerida'
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'interno' and t.typname = 'contexto_t') then
    create type interno.contexto_t as (empresa_id text, area text, usuario_id uuid, motivo text);
  end if;
end $$;

create or replace function interno.ctx(p_empresa text default null) returns interno.contexto_t
language plpgsql stable security definer set search_path = '' as $$
declare r interno.contexto_t; v_uid uuid := auth.uid(); v_n int; v_e text; v_a text;
begin
  r.usuario_id := v_uid;
  if v_uid is null then r.motivo := 'sin_sesion'; return r; end if;
  if p_empresa is not null then
    select m.area into v_a from public.miembros m
     where m.usuario_id = v_uid and m.empresa_id = p_empresa and m.estado = 'activo';
    if v_a is not null then r.empresa_id := p_empresa; r.area := v_a; r.motivo := 'ok'; return r; end if;
  else
    select count(*), min(m.empresa_id), min(m.area) into v_n, v_e, v_a
      from public.miembros m where m.usuario_id = v_uid and m.estado = 'activo';
    if v_n = 1 then r.empresa_id := v_e; r.area := v_a; r.motivo := 'ok'; return r; end if;
    if v_n > 1 then r.motivo := 'empresa_requerida'; return r; end if;
  end if;
  -- la baja cuenta SOLO en la empresa que se pidió: una baja en OTRA empresa no revoca esta
  r.motivo := case when exists (select 1 from public.miembros m where m.usuario_id = v_uid and m.estado = 'baja'
                                   and (p_empresa is null or m.empresa_id = p_empresa))
                   then 'acceso_revocado' else 'sin_acceso' end;
  return r;
end $$;
revoke all on function interno.ctx(text) from public, anon, authenticated, service_role;

-- ---- Versión de contrato ---------------------------------------------------------------------------
-- Reemplaza a VERSION_ESPERADA y a los umbrales del puente. Cambia con una migración, que es cuando cambia el
-- contrato. Las RPC de escritura exigen la cabecera `x-al3d-contrato` >= `minimo`; un cliente viejo recibe
-- CLIENTE_VIEJO (no definitivo: la bandeja se detiene SIN descartar nada y la app pide actualizarse).
create or replace function public.version_contrato() returns jsonb language sql immutable set search_path = '' as $$
  select '{"actual": 1, "minimo": 1, "esquema": "al3d-1"}'::jsonb $$;
revoke all on function public.version_contrato() from public, anon, authenticated, service_role;
grant execute on function public.version_contrato() to authenticated;

-- Guardia de contrato: PostgREST expone las cabeceras HTTP en el GUC `request.headers`.
create or replace function interno.guardia_contrato() returns jsonb language plpgsql stable set search_path = '' as $$
declare v_h text; v_min int := (public.version_contrato() ->> 'minimo')::int;      -- una sola fuente
begin
  v_h := (nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb) ->> 'x-al3d-contrato';
  if v_h is null or v_h !~ '^[0-9]{1,6}$' or v_h::int < v_min then
    return interno.err('CLIENTE_VIEJO', 'Actualiza la app y vuelve a intentarlo.', jsonb_build_object('minimo', v_min));
  end if;
  return null;
end $$;
revoke all on function interno.guardia_contrato() from public, anon, authenticated, service_role;

-- ---- El preámbulo común de TODA RPC de escritura para el cliente -------------------------------------
-- Contrato -> contexto -> área, EN ESE ORDEN y ANTES de leer una sola fila (así el error de rol es el mismo para un
-- proyecto que existe y para uno que no, y los mensajes no llevan valores). Devuelve (c, e): si `e` no es null,
-- la RPC debe devolverlo tal cual. Se corre con los privilegios del dueño (la RPC es SECURITY DEFINER), por eso
-- nadie más tiene EXECUTE.
create or replace function interno.preambulo(p_empresa text, p_areas text[], out c interno.contexto_t, out e jsonb)
language plpgsql stable set search_path = '' as $$
begin
  e := interno.guardia_contrato();
  if e is not null then return; end if;
  c := interno.ctx(p_empresa);
  if    c.motivo = 'acceso_revocado'  then e := interno.err('ACCESO_REVOCADO',   'Tu acceso a esta empresa ya no está activo.');
  elsif c.motivo = 'sin_acceso'       then e := interno.err('SIN_ACCESO',        'Esta cuenta no tiene acceso. Pídele a Dirección que te agregue.');
  elsif c.motivo = 'empresa_requerida' then e := interno.err('EMPRESA_REQUERIDA', 'Tienes acceso a varias empresas: indica con cuál trabajar.');
  elsif c.motivo <> 'ok' or c.area is null or not (c.area = any (p_areas)) then e := interno.err('ROL_SIN_PERMISO', 'No tienes permiso para esto.');
  end if;
end $$;
revoke all on function interno.preambulo(text, text[]) from public, anon, authenticated, service_role;

-- ---- La matriz de permisos: la fuente única (§5.1) -----------------------------------------------------
-- Las RPC la consultan (así la lista no se copia a mano en seis funciones) y `mi_acceso()` entrega al cliente la de su
-- área como `permisos` (reemplaza a `escribibles` de /salud). Una prueba compara tabla y comportamiento (RL-20).
--   proyecto_actualizar / corregir_venta : las propiedades que cada área puede escribir (no se puede escribir
--                                          dinero ni la etapa por `proyecto_actualizar`).
--   etapas       : etapas de origen y de destino que `mover_etapa` admite; Fabricación solo dentro de ganado…listo.
--   instalacion  : en qué estado crea la cita cada área (Pagos no toca la agenda).
--   alta         : quién puede ganar/descartar una cotización y dar de alta una venta.
--   ve_dinero    : si recibe filas de las tablas de dinero.
create or replace function interno.matriz_permisos() returns jsonb language sql immutable set search_path = '' as $$
  select '{
    "direccion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles",
                              "ubicacion_pendiente","contacto","negocio","tipo_trabajo","compromiso_texto","fecha_anticipo","origen"],
      "corregir_venta": ["nombre","subtotal","anticipo","liquidacion","cuenta","estatus","fecha_liquidacion","pct_comision","iva"],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia","cancelado"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia","cancelado"]},
      "instalacion": "confirmada",
      "alta": {"ganar_proyecto": true, "descartar_cotizacion": true, "alta_venta": true},
      "ve_dinero": true
    },
    "fabricacion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles","ubicacion_pendiente"],
      "corregir_venta": [],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo"]},
      "instalacion": "propuesta",
      "alta": {"ganar_proyecto": false, "descartar_cotizacion": false, "alta_venta": false},
      "ve_dinero": false
    },
    "pagos": {
      "proyecto_actualizar": ["notas","tel"],
      "corregir_venta": ["nombre","subtotal","anticipo","liquidacion","cuenta","estatus","fecha_liquidacion","pct_comision"],
      "etapas": {"origen": [], "destino": []},
      "instalacion": null,
      "alta": {"ganar_proyecto": false, "descartar_cotizacion": false, "alta_venta": true},
      "ve_dinero": true
    }
  }'::jsonb $$;
revoke all on function interno.matriz_permisos() from public, anon, authenticated, service_role;

-- ---- anotar: escribe en la bitácora DENTRO de la transacción de la RPC ---------------------------------
-- El nivel, el título y el detalle los pone la RPC, nunca el cliente. Los títulos de nivel `general` no llevan
-- importes (Fabricación los lee). `p_ctx` es el contexto del preámbulo. `p_usuario_texto` es para las funciones de servicio
-- (la Edge Function `autorizar` llama sin sesión de la persona): ahí no hay `auth.uid()` y el correo lo dice quien llama.
create or replace function interno.anotar(p_ctx interno.contexto_t, p_nivel text, p_accion text, p_entidad text, p_entidad_id text, p_titulo text,
                                          p_detalle text default '', p_antes jsonb default null, p_despues jsonb default null,
                                          p_op_id text default null, p_resultado jsonb default null, p_usuario_texto text default null) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.bitacora (empresa_id, nivel, accion, entidad, entidad_id, titulo, detalle, antes, despues,
                               usuario_id, usuario_texto, rol, dispositivo, op_id, resultado)
  values (p_ctx.empresa_id, p_nivel, p_accion, p_entidad, coalesce(p_entidad_id, ''), pg_catalog.left(p_titulo, 200),
          pg_catalog.left(coalesce(p_detalle, ''), 600), p_antes, p_despues, p_ctx.usuario_id,
          coalesce(p_usuario_texto, interno.correo_verificado(), ''), coalesce(p_ctx.area, ''), 'srv', p_op_id, p_resultado);
end $$;
revoke all on function interno.anotar(interno.contexto_t, text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Políticas de lectura (todas `for select to authenticated`; nombre = <tabla>_sel_<áreas>)
-- -----------------------------------------------------------------------------------------------------
-- Cada condición compara el `empresa_id` DE LA FILA contra las empresas donde la persona es miembro con esa área:
-- quien es Dirección en una empresa y Fabricación en otra recibe, en cada fila, los privilegios de ESA empresa.
-- No hay políticas para `anon`. Escribir NO es cosa de políticas: authenticated no tiene INSERT/UPDATE/DELETE.

-- empresas (la creó 0001): cada miembro ve solo las suyas
drop policy if exists empresas_sel_todos on public.empresas;
create policy empresas_sel_todos on public.empresas for select to authenticated
  using (id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

-- miembros: Dirección ve todas las de su empresa; cada quien, SU fila (la baja incluida: así se entera de que salió)
drop policy if exists miembros_sel_propia    on public.miembros;
drop policy if exists miembros_sel_direccion on public.miembros;
create policy miembros_sel_propia    on public.miembros for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy miembros_sel_direccion on public.miembros for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));

-- bitacora (la creó 0001): visibilidad por NIVEL de la fila
drop policy if exists bitacora_sel_general   on public.bitacora;
drop policy if exists bitacora_sel_dinero    on public.bitacora;
drop policy if exists bitacora_sel_direccion on public.bitacora;
create policy bitacora_sel_general   on public.bitacora for select to authenticated
  using (nivel = 'general'   and empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy bitacora_sel_dinero    on public.bitacora for select to authenticated
  using (nivel = 'dinero'    and empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));
create policy bitacora_sel_direccion on public.bitacora for select to authenticated
  using (nivel = 'direccion' and empresa_id in (select interno.empresas_donde(array['direccion'])));


-- -----------------------------------------------------------------------------------------------------
-- 4. RPC de acceso
-- -----------------------------------------------------------------------------------------------------

-- mi_acceso: «¿qué soy yo aquí?». La puede llamar CUALQUIER sesión (miembro o no) y NO exige el contrato: es lo
-- primero que pregunta la app al arrancar, incluso una versión vieja que debe enterarse de que está vieja.
--   estado: 'activo' | 'acceso_revocado' | 'invitacion_pendiente' | 'sin_acceso'
-- Jamás devuelve 'acceso_revocado' por una lista vacía de RLS, un error, un JWT vencido o falta de señal (esos casos
-- ni llegan a esta función): solo una fila `baja` de `miembros` lo dice.
create or replace function public.mi_acceso(p_empresa text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_estado text; v_emp jsonb; v_correo text; v_n_activo int; v_n_baja int;
        v_area text; v_contrato jsonb := public.version_contrato();
begin
  if v_uid is null then return interno.err('SIN_SESION', 'No hay sesión.'); end if;
  select count(*) filter (where estado = 'activo'), count(*) filter (where estado = 'baja') into v_n_activo, v_n_baja
    from public.miembros where usuario_id = v_uid;
  v_correo := interno.correo_verificado();
  v_estado := case when v_n_activo > 0 then 'activo'
                   when v_n_baja   > 0 then 'acceso_revocado'
                   when v_correo is not null
                        and exists (select 1 from public.miembros m where m.correo = v_correo and m.estado = 'invitado' and m.usuario_id is null)
                        then 'invitacion_pendiente'
                   else 'sin_acceso' end;
  select coalesce(jsonb_agg(jsonb_build_object('empresa_id', m.empresa_id, 'area', m.area, 'estado', m.estado) order by m.empresa_id), '[]'::jsonb)
    into v_emp from public.miembros m where m.usuario_id = v_uid;
  -- el área de la empresa elegida: la pedida, o la única donde está activo
  select m.area into v_area from public.miembros m
   where m.usuario_id = v_uid and m.estado = 'activo' and (p_empresa is null or m.empresa_id = p_empresa)
   order by m.empresa_id limit 1;
  if p_empresa is null and v_n_activo > 1 then v_area := null; end if;
  return jsonb_build_object('ok', true, 'estado', v_estado,
                            'usuario', jsonb_build_object('id', v_uid, 'correo', v_correo),
                            'empresas', v_emp,
                            'contrato', jsonb_build_object('actual', v_contrato -> 'actual', 'minimo', v_contrato -> 'minimo'),
                            'permisos', case when v_area is null then null else interno.matriz_permisos() -> v_area end);
end $$;
revoke all on function public.mi_acceso(text) from public, anon, authenticated, service_role;
grant execute on function public.mi_acceso(text) to authenticated;

-- reclamar_acceso: el primer ingreso con correo VERIFICADO vincula las invitaciones de ese correo (una por empresa).
-- Idempotente: si ya estaba vinculada, solo devuelve `mi_acceso()`. Si el correo ya pertenece a OTRA cuenta (la persona
-- recreó su cuenta de Google), no se pisa nada: ACCESO_CONFLICTO, y Dirección tiene que reactivarla.
create or replace function public.reclamar_acceso() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_correo text := interno.correo_verificado(); f record; v_n int := 0;
begin
  if auth.uid() is null then return interno.err('SIN_SESION', 'No hay sesión.'); end if;
  if v_correo is null then return jsonb_build_object('ok', true, 'estado', 'correo_no_verificado'); end if;     -- no vincula nada
  for f in update public.miembros set usuario_id = auth.uid(), estado = 'activo', reclamado_en = now()
            where correo = v_correo and estado = 'invitado' and usuario_id is null
        returning empresa_id, area loop
    perform interno.anotar(row(f.empresa_id, f.area, auth.uid(), 'ok')::interno.contexto_t, 'direccion', 'reclamo', 'miembro', v_correo,
                           'Reclamó su acceso ' || v_correo);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 and exists (select 1 from public.miembros m where m.correo = v_correo and m.estado = 'activo' and m.usuario_id <> auth.uid()) then
    return interno.err('ACCESO_CONFLICTO', 'Ese correo ya está vinculado a otra cuenta; que Dirección lo reactive.');
  end if;
  return public.mi_acceso();
end $$;
revoke all on function public.reclamar_acceso() from public, anon, authenticated, service_role;
grant execute on function public.reclamar_acceso() to authenticated;

-- miembro_alta: Dirección invita (o reactiva, o cambia el área) por correo. Normaliza el correo; `upsert` por correo.
create or replace function public.miembro_alta(p_correo text, p_area text, p_nota text default '', p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_correo text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_correo, ''))); f public.miembros; v_accion text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or p_area is null or p_area <> all (array['direccion','fabricacion','pagos']) then
    return interno.err('DATO_INVALIDO', 'Correo o área inválidos.'); end if;
  if length(coalesce(p_nota, '')) > 500 then return interno.err('DATO_INVALIDO', 'La nota es demasiado larga.'); end if;
  select * into f from public.miembros where empresa_id = (pre.c).empresa_id and correo = v_correo for update;
  if not found then
    insert into public.miembros (empresa_id, correo, area, estado, nota, invitado_por)
    values ((pre.c).empresa_id, v_correo, p_area, 'invitado', coalesce(p_nota, ''), auth.uid());
    v_accion := 'alta';
  else
    -- degradar al último Dirección activo dejaría la empresa sin quien dé altas: se prohíbe por cualquier camino
    if f.estado = 'activo' and f.area = 'direccion' and p_area <> 'direccion'
       and not exists (select 1 from public.miembros m where m.empresa_id = f.empresa_id and m.estado = 'activo'
                          and m.area = 'direccion' and m.correo <> f.correo) then
      return interno.err('DATO_INVALIDO', 'Debe quedar al menos un Dirección activo.');
    end if;
    if f.estado = 'invitado' then
      update public.miembros set area = p_area, nota = coalesce(p_nota, '') where empresa_id = f.empresa_id and correo = f.correo;
      v_accion := 'alta';
    elsif f.estado = 'activo' then
      update public.miembros set area = p_area where empresa_id = f.empresa_id and correo = f.correo;
      v_accion := 'cambio_area';
    else    -- 'baja': reactiva sin pedirle nada a la persona (con cuenta vinculada vuelve activo; si nunca entró, vuelve invitado)
      update public.miembros set estado = case when f.usuario_id is null then 'invitado' else 'activo' end,
                                 baja_en = null, baja_por = null, area = p_area
       where empresa_id = f.empresa_id and correo = f.correo;
      v_accion := 'reactivo';
    end if;
  end if;
  perform interno.anotar(pre.c, 'direccion', v_accion, 'miembro', v_correo, 'Acceso de ' || v_correo, '',
                         case when f.correo is null then null else jsonb_build_object('area', f.area, 'estado', f.estado) end,
                         jsonb_build_object('area', p_area));
  return jsonb_build_object('ok', true, 'accion', v_accion);
end $$;
revoke all on function public.miembro_alta(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.miembro_alta(text, text, text, text) to authenticated;

-- miembro_cambiar_area: surte efecto en la SIGUIENTE petición de esa persona.
create or replace function public.miembro_cambiar_area(p_correo text, p_area text, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_correo text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_correo, ''))); f public.miembros;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if p_area is null or p_area <> all (array['direccion','fabricacion','pagos']) then return interno.err('DATO_INVALIDO', 'Área inválida.'); end if;
  select * into f from public.miembros where empresa_id = (pre.c).empresa_id and correo = v_correo for update;
  if not found or f.estado = 'baja' then return interno.err('NO_ENCONTRADO', 'No existe ese miembro.'); end if;
  if f.area = p_area then return jsonb_build_object('ok', true, 'sin_cambio', true); end if;
  if f.estado = 'activo' and f.area = 'direccion' and p_area <> 'direccion'
     and not exists (select 1 from public.miembros m where m.empresa_id = f.empresa_id and m.estado = 'activo' and m.area = 'direccion' and m.correo <> f.correo) then
    return interno.err('DATO_INVALIDO', 'Debe quedar al menos un Dirección activo.'); end if;
  update public.miembros set area = p_area where empresa_id = f.empresa_id and correo = f.correo;
  perform interno.anotar(pre.c, 'direccion', 'cambio_area', 'miembro', v_correo, 'Cambio de área de ' || v_correo, '',
                         jsonb_build_object('area', f.area), jsonb_build_object('area', p_area));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.miembro_cambiar_area(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.miembro_cambiar_area(text, text, text) to authenticated;

-- miembro_baja: NO borra la fila (es la evidencia y la señal `acceso_revocado`). El último Dirección activo no se
-- puede dar de baja: nadie podría volver a dar altas.
create or replace function public.miembro_baja(p_correo text, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_correo text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_correo, ''))); f public.miembros;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  select * into f from public.miembros where empresa_id = (pre.c).empresa_id and correo = v_correo for update;
  if not found then return interno.err('NO_ENCONTRADO', 'No existe ese miembro.'); end if;
  if f.estado = 'baja' then return jsonb_build_object('ok', true, 'sin_cambio', true); end if;
  if f.estado = 'activo' and f.area = 'direccion'
     and not exists (select 1 from public.miembros m where m.empresa_id = f.empresa_id and m.estado = 'activo' and m.area = 'direccion' and m.correo <> f.correo) then
    return interno.err('DATO_INVALIDO', 'Debe quedar al menos un Dirección activo.'); end if;
  update public.miembros set estado = 'baja', baja_en = now(), baja_por = auth.uid() where empresa_id = f.empresa_id and correo = f.correo;
  perform interno.anotar(pre.c, 'direccion', 'baja', 'miembro', v_correo, 'Baja de ' || v_correo, '',
                         jsonb_build_object('area', f.area, 'estado', f.estado), jsonb_build_object('estado', 'baja'));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.miembro_baja(text, text) from public, anon, authenticated, service_role;
grant execute on function public.miembro_baja(text, text) to authenticated;
