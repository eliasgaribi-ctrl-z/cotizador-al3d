-- =====================================================================================================
-- 0023_agente.sql — el AGENTE DE VENTAS: las conversaciones con clientes, sus mensajes y la cola «Necesita tu decisión»
-- =====================================================================================================
-- Elías lo pidió el 2026-10-24: en enero entra a un despacho fiscal y AL3D tiene que seguir cotizando sin él encima. El agente
-- (supabase/functions/agente) atiende al cliente por el portal ahora y por WhatsApp después, llena la ficha de obra
-- (supabase/functions/_shared/ficha.js) y cotiza solo lo que el catálogo sabe cobrar y no lleva logotipo. Lo demás —logos, neón,
-- tótems, medidas sacadas de una foto, instalaciones altas o fuera de la zona, envíos— llega a Dirección con su razón escrita y
-- se decide en un toque desde el teléfono. Plan completo: docs/AGENTE-VENTAS.md.
--
-- CÓMO SE RECONOCE AL CLIENTE (sin cuenta y sin contraseña)
--   Cada conversación tiene un SECRETO al azar (32 bytes) que inventa la función y viaja en el link del portal (o, con WhatsApp,
--   sale del número). A la base solo llega su huella sha256, como con las pantallas del taller (0022): leer esta tabla no deja
--   hacerse pasar por un cliente, porque la función vuelve a sacar la huella de lo que recibe.
--
-- QUIÉN PUEDE QUÉ (la auditoría de 0011, al final, lo vuelve a comprobar)
--   · `agente_abrir`, `agente_leer`, `agente_guardar`: RPC de SERVICIO (solo la función). Ni anon ni la app.
--   · `agente_decidir`: RPC de cliente, y por dentro solo Dirección. Deja línea en la bitácora (nivel dinero: puede llevar precio).
--   · Las tres tablas: Dirección de la empresa las lee por RLS; la huella del secreto no sale hacia la app. Nadie escribe directo.
--   · Los mensajes son evidencia: no se editan ni se borran (`solo_agregar`, `sin_borrar`).
--
-- LOS TOPES (cada mensaje del cliente cuesta una llamada a la IA)
--   · 60 conversaciones nuevas por hora y empresa: nadie llena la tabla abriendo links.
--   · 80 mensajes del cliente por conversación en 24 h: una conversación que se cicla no se come la cuenta de la IA.
--
-- LO QUE NO HACE
--   · No calcula precios ni decide qué falta: eso es ficha.js en la función. La base guarda la ficha y la cotización como llegan
--     (con su tamaño acotado) y solo decide el ESTADO de la conversación.
--   · No crea el proyecto. Ganar sigue siendo `ganar_proyecto`, de Dirección, como hoy.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. Las tablas
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.agente_conversaciones (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  empresa_id      text not null references public.empresas (id),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),           -- sha256 del secreto del link
  canal           text not null default 'portal' check (canal in ('portal','whatsapp')),
  contacto        jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(contacto) = 'object' and pg_catalog.length(contacto::text) <= 2000),
  ficha           jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(ficha) = 'object' and pg_catalog.length(ficha::text) <= 20000),
  cotizacion      jsonb check (cotizacion is null or (pg_catalog.jsonb_typeof(cotizacion) = 'object' and pg_catalog.length(cotizacion::text) <= 20000)),
  estado          text not null default 'abierta' check (estado in ('abierta','con_direccion','cotizada','ganada','perdida')),
  ultimo_mensaje  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp()
);
create index if not exists agente_conversaciones_por_empresa on public.agente_conversaciones (empresa_id, estado, ultimo_mensaje desc);

create table if not exists public.agente_mensajes (
  id               bigint generated always as identity primary key,
  empresa_id       text not null references public.empresas (id),
  conversacion_id  uuid not null references public.agente_conversaciones (id),
  de               text not null check (de in ('cliente','agente','direccion')),
  texto            text not null check (btrim(texto) <> '' and length(texto) <= 4000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default clock_timestamp()
);
create index if not exists agente_mensajes_por_conversacion on public.agente_mensajes (conversacion_id, id);

-- Una decisión pendiente por conversación a la vez: si el cliente agrega algo mientras Dirección no contesta, se le suman las
-- razones a la misma tarjeta en vez de llenarle el teléfono de tarjetas.
create table if not exists public.agente_decisiones (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  empresa_id       text not null references public.empresas (id),
  conversacion_id  uuid not null references public.agente_conversaciones (id),
  razones          jsonb not null check (pg_catalog.jsonb_typeof(razones) = 'array' and pg_catalog.jsonb_array_length(razones) between 1 and 20),
  resumen          text not null default '' check (length(resumen) <= 600),           -- lo que pidió el cliente, en una línea
  estado           text not null default 'pendiente' check (estado in ('pendiente','aprobada','corregida','descartada')),
  precio           numeric(12,2) check (precio is null or precio >= 0),               -- el que pone Dirección, si lo pone
  nota             text not null default '' check (length(nota) <= 600),              -- lo que Dirección le manda decir al cliente
  resuelta_por     uuid,
  resuelta_en      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default clock_timestamp(),
  constraint agente_decisiones_resuelta check ((estado = 'pendiente') = (resuelta_en is null))
);
create unique index if not exists agente_decisiones_una_pendiente on public.agente_decisiones (conversacion_id) where estado = 'pendiente';
create index if not exists agente_decisiones_por_empresa on public.agente_decisiones (empresa_id, estado, created_at desc);

drop trigger if exists agente_conversaciones_tocar on public.agente_conversaciones;
drop trigger if exists agente_conversaciones_sin_borrar on public.agente_conversaciones;
drop trigger if exists agente_mensajes_tocar on public.agente_mensajes;
drop trigger if exists agente_mensajes_sin_borrar on public.agente_mensajes;
drop trigger if exists agente_mensajes_solo_agregar on public.agente_mensajes;
drop trigger if exists agente_decisiones_tocar on public.agente_decisiones;
drop trigger if exists agente_decisiones_sin_borrar on public.agente_decisiones;
create trigger agente_conversaciones_tocar      before insert or update on public.agente_conversaciones for each row execute function interno.tocar();
create trigger agente_conversaciones_sin_borrar before delete           on public.agente_conversaciones for each row execute function interno.sin_borrar();
create trigger agente_mensajes_tocar            before insert or update on public.agente_mensajes       for each row execute function interno.tocar();
create trigger agente_mensajes_sin_borrar       before delete           on public.agente_mensajes       for each row execute function interno.sin_borrar();
create trigger agente_mensajes_solo_agregar     before update           on public.agente_mensajes       for each row execute function interno.solo_agregar();
create trigger agente_decisiones_tocar          before insert or update on public.agente_decisiones     for each row execute function interno.tocar();
create trigger agente_decisiones_sin_borrar     before delete           on public.agente_decisiones     for each row execute function interno.sin_borrar();

alter table public.agente_conversaciones enable row level security;
alter table public.agente_mensajes       enable row level security;
alter table public.agente_decisiones     enable row level security;
revoke all on public.agente_conversaciones from public, anon, authenticated, service_role;
revoke all on public.agente_mensajes       from public, anon, authenticated, service_role;
revoke all on public.agente_decisiones     from public, anon, authenticated, service_role;
-- Dirección lee lo suyo; la huella del secreto no sale hacia la app.
grant select (id, empresa_id, canal, contacto, ficha, cotizacion, estado, ultimo_mensaje, created_at, updated_at) on public.agente_conversaciones to authenticated;
grant select on public.agente_mensajes   to authenticated;
grant select on public.agente_decisiones to authenticated;
-- La función escribe por las RPC (SECURITY DEFINER); el respaldo semanal lee. Sin DELETE, como todas.
grant select, insert, update on public.agente_conversaciones to service_role;
grant select, insert         on public.agente_mensajes       to service_role;
grant select, insert, update on public.agente_decisiones     to service_role;
drop policy if exists agente_conversaciones_sel_direccion on public.agente_conversaciones;
create policy agente_conversaciones_sel_direccion on public.agente_conversaciones for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
drop policy if exists agente_mensajes_sel_direccion on public.agente_mensajes;
create policy agente_mensajes_sel_direccion on public.agente_mensajes for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
drop policy if exists agente_decisiones_sel_direccion on public.agente_decisiones;
create policy agente_decisiones_sel_direccion on public.agente_decisiones for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
-- M-6: sin estadísticas en la huella ni en el texto de los clientes.
alter table public.agente_conversaciones alter column token_hash set statistics 0;
alter table public.agente_mensajes alter column texto set statistics 0;


-- -----------------------------------------------------------------------------------------------------
-- 2. Abrir una conversación (la función, cuando alguien entra al portal o escribe por primera vez)
-- -----------------------------------------------------------------------------------------------------
create or replace function public.agente_abrir(p_empresa text, p_token_hash text, p_canal text default 'portal', p_contacto jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_recientes int;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return interno.err('DATO_INVALIDO', 'Falta la huella de la conversación.'); end if;
  if coalesce(p_canal, '') not in ('portal', 'whatsapp') then return interno.err('DATO_INVALIDO', 'Canal desconocido.'); end if;
  if p_contacto is null or pg_catalog.jsonb_typeof(p_contacto) <> 'object' or pg_catalog.length(p_contacto::text) > 2000 then
    return interno.err('DATO_INVALIDO', 'El contacto no tiene la forma de siempre.');
  end if;
  if not exists (select 1 from public.empresas where id = p_empresa and activa) then return interno.err('NO_ENCONTRADO', 'Esa empresa no existe.'); end if;
  select pg_catalog.count(*) into v_recientes from public.agente_conversaciones
   where empresa_id = p_empresa and created_at > pg_catalog.now() - interval '1 hour';
  if v_recientes >= 60 then return interno.err('CUPO_AGOTADO', 'Hay demasiadas conversaciones nuevas. Prueba en unos minutos.'); end if;
  if exists (select 1 from public.agente_conversaciones where token_hash = p_token_hash) then return interno.err('DUPLICADO', 'Esa conversación ya existe.'); end if;
  insert into public.agente_conversaciones (empresa_id, token_hash, canal, contacto) values (p_empresa, p_token_hash, p_canal, p_contacto)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.agente_abrir(text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.agente_abrir(text, text, text, jsonb) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Leer una conversación (la función, antes de contestar)
-- -----------------------------------------------------------------------------------------------------
-- Los últimos 30 mensajes bastan para que la IA siga el hilo: la ficha ya trae todo lo que se sabe. `mensajes_cliente_24h` deja a
-- la función negarse ANTES de gastar una llamada a la IA. `decision` es la última, para que el agente le diga al cliente lo que
-- Dirección contestó.
create or replace function public.agente_leer(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.agente_conversaciones;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return interno.err('DATO_INVALIDO', 'Falta la huella de la conversación.'); end if;
  select * into c from public.agente_conversaciones where token_hash = p_token_hash;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa conversación no existe.'); end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'id', c.id, 'empresa', c.empresa_id, 'canal', c.canal, 'estado', c.estado,
    'contacto', c.contacto, 'ficha', c.ficha, 'cotizacion', c.cotizacion,
    'mensajes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('de', m.de, 'texto', m.texto, 'en', m.created_at) order by m.id)
                            from (select * from public.agente_mensajes where conversacion_id = c.id order by id desc limit 30) m), '[]'::jsonb),
    'mensajes_cliente_24h', (select pg_catalog.count(*) from public.agente_mensajes
                              where conversacion_id = c.id and de = 'cliente' and created_at > pg_catalog.now() - interval '24 hours'),
    'decision', (select pg_catalog.jsonb_build_object('id', d.id, 'estado', d.estado, 'razones', d.razones, 'precio', d.precio, 'nota', d.nota)
                   from public.agente_decisiones d where d.conversacion_id = c.id order by d.created_at desc limit 1),
    -- Las últimas diez, para que la función reconozca lo que Dirección YA decidió aunque después se haya abierto otra tarjeta.
    'decisiones', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'estado', d.estado, 'razones', d.razones, 'precio', d.precio, 'nota', d.nota)
                                                       order by d.created_at desc)
                              from (select * from public.agente_decisiones where conversacion_id = c.id order by created_at desc limit 10) d), '[]'::jsonb));
end $$;
revoke all on function public.agente_leer(text) from public, anon, authenticated, service_role;
grant execute on function public.agente_leer(text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 4. Guardar una vuelta (la función, después de contestar)
-- -----------------------------------------------------------------------------------------------------
-- Una vuelta = lo que dijo el cliente, lo que contestó el agente, la ficha como quedó, la cotización si la hubo y las razones para
-- Dirección si las hay. Todo en una transacción: no queda un mensaje sin su ficha ni una ficha sin su mensaje.
-- El estado lo decide aquí la base, no la función: con razones va a Dirección; con cotización, cotizada; si no, abierta. Una
-- conversación ganada o perdida no cambia de estado por un mensaje nuevo.
create or replace function public.agente_guardar(p_token_hash text, p_texto_cliente text, p_texto_agente text, p_ficha jsonb,
                                                 p_cotizacion jsonb default null, p_razones jsonb default '[]'::jsonb, p_resumen text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.agente_conversaciones; v_n int; v_decision uuid; v_estado text;
        v_cli text := pg_catalog.btrim(coalesce(p_texto_cliente, ''));
        v_age text := pg_catalog.btrim(coalesce(p_texto_agente, ''));
        v_raz jsonb := coalesce(p_razones, '[]'::jsonb);
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return interno.err('DATO_INVALIDO', 'Falta la huella de la conversación.'); end if;
  if p_ficha is null or pg_catalog.jsonb_typeof(p_ficha) <> 'object' or pg_catalog.length(p_ficha::text) > 20000 then
    return interno.err('DATO_INVALIDO', 'La ficha no tiene la forma de siempre.');
  end if;
  if p_cotizacion is not null and (pg_catalog.jsonb_typeof(p_cotizacion) <> 'object' or pg_catalog.length(p_cotizacion::text) > 20000) then
    return interno.err('DATO_INVALIDO', 'La cotización no tiene la forma de siempre.');
  end if;
  if pg_catalog.jsonb_typeof(v_raz) <> 'array' or pg_catalog.jsonb_array_length(v_raz) > 20 then return interno.err('DATO_INVALIDO', 'Las razones son una lista.'); end if;
  if pg_catalog.length(v_cli) > 4000 or pg_catalog.length(v_age) > 4000 then return interno.err('DATO_INVALIDO', 'El mensaje es demasiado largo.'); end if;
  select * into c from public.agente_conversaciones where token_hash = p_token_hash for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa conversación no existe.'); end if;
  if v_cli <> '' then
    select pg_catalog.count(*) into v_n from public.agente_mensajes
     where conversacion_id = c.id and de = 'cliente' and created_at > pg_catalog.now() - interval '24 hours';
    if v_n >= 80 then return interno.err('CUPO_AGOTADO', 'Esta conversación llegó a su límite de hoy.'); end if;
    insert into public.agente_mensajes (empresa_id, conversacion_id, de, texto) values (c.empresa_id, c.id, 'cliente', v_cli);
  end if;
  if v_age <> '' then
    insert into public.agente_mensajes (empresa_id, conversacion_id, de, texto) values (c.empresa_id, c.id, 'agente', v_age);
  end if;
  if pg_catalog.jsonb_array_length(v_raz) > 0 then
    update public.agente_decisiones set razones = v_raz, resumen = pg_catalog.left(coalesce(p_resumen, ''), 600)
     where conversacion_id = c.id and estado = 'pendiente' returning id into v_decision;
    if v_decision is null then
      insert into public.agente_decisiones (empresa_id, conversacion_id, razones, resumen)
      values (c.empresa_id, c.id, v_raz, pg_catalog.left(coalesce(p_resumen, ''), 600)) returning id into v_decision;
    end if;
  end if;
  v_estado := case when c.estado in ('ganada', 'perdida') then c.estado
                   when pg_catalog.jsonb_array_length(v_raz) > 0 then 'con_direccion'
                   when p_cotizacion is not null then 'cotizada'
                   else 'abierta' end;
  update public.agente_conversaciones
     set ficha = p_ficha, cotizacion = coalesce(p_cotizacion, cotizacion), estado = v_estado, ultimo_mensaje = pg_catalog.now()
   where id = c.id;
  return pg_catalog.jsonb_build_object('ok', true, 'estado', v_estado, 'decision', v_decision);
end $$;
revoke all on function public.agente_guardar(text, text, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.agente_guardar(text, text, text, jsonb, jsonb, jsonb, text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 5. Decidir (Dirección, desde el teléfono)
-- -----------------------------------------------------------------------------------------------------
-- aprobar   → «sí, cotízalo así»: la conversación pasa a cotizada; con precio, ese precio manda.
-- corregir  → con otro precio o con una nota para el cliente (al menos una de las dos).
-- descartar → «esto no lo hacemos»: la conversación queda perdida.
-- La nota, si la hay, entra como mensaje «de Dirección»: el cliente la ve en el portal y el agente la usa en su siguiente vuelta.
create or replace function public.agente_decidir(p_id uuid, p_accion text, p_precio numeric default null, p_nota text default '', p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; d public.agente_decisiones; v_estado text; v_conv text;
        v_nota text := pg_catalog.left(pg_catalog.btrim(coalesce(p_nota, '')), 600);
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if coalesce(p_accion, '') not in ('aprobar', 'corregir', 'descartar') then return interno.err('DATO_INVALIDO', 'La acción es aprobar, corregir o descartar.'); end if;
  if p_precio is not null and (p_precio < 0 or p_precio > 10000000) then return interno.err('DATO_INVALIDO', 'Ese precio no se ve bien.'); end if;
  if p_accion = 'corregir' and p_precio is null and v_nota = '' then return interno.err('DATO_INVALIDO', 'Para corregir pon el precio o una nota para el cliente.'); end if;
  select * into d from public.agente_decisiones where id = p_id and empresa_id = (pre.c).empresa_id for update;
  if not found then return interno.err('NO_ENCONTRADO', 'No existe esa decisión.'); end if;
  if d.estado <> 'pendiente' then return pg_catalog.jsonb_build_object('ok', true, 'sin_cambio', true, 'estado', d.estado); end if;
  v_estado := case p_accion when 'aprobar' then 'aprobada' when 'corregir' then 'corregida' else 'descartada' end;
  v_conv   := case p_accion when 'descartar' then 'perdida' else 'cotizada' end;
  update public.agente_decisiones set estado = v_estado, precio = p_precio, nota = v_nota, resuelta_por = auth.uid(), resuelta_en = pg_catalog.now()
   where id = d.id;
  update public.agente_conversaciones
     set estado = case when estado in ('ganada', 'perdida') then estado else v_conv end,
         cotizacion = case when p_precio is null then cotizacion
                           else coalesce(cotizacion, '{}'::jsonb) || pg_catalog.jsonb_build_object('precio_direccion', p_precio) end
   where id = d.conversacion_id;
  if v_nota <> '' then
    insert into public.agente_mensajes (empresa_id, conversacion_id, de, texto) values (d.empresa_id, d.conversacion_id, 'direccion', v_nota);
  end if;
  perform interno.anotar(pre.c, 'dinero', 'decision', 'cotizacion', 'agente:' || d.id::text,
                         'Agente de ventas: ' || v_estado, pg_catalog.left(d.resumen, 600),
                         pg_catalog.jsonb_build_object('estado', 'pendiente'),
                         pg_catalog.jsonb_build_object('estado', v_estado, 'precio', p_precio));
  return pg_catalog.jsonb_build_object('ok', true, 'estado', v_estado);
end $$;
revoke all on function public.agente_decidir(uuid, text, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.agente_decidir(uuid, text, numeric, text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 6. La auditoría de 0011 con las cuatro RPC del agente en sus listas cerradas (lo demás, idéntico a 0022)
-- -----------------------------------------------------------------------------------------------------
create or replace function interno.auditoria() returns text[]
language plpgsql stable set search_path = '' as $$
declare
  c_cliente     constant text[] := array['agente_decidir','almacen_aplicar','alta_venta','cancelar_solicitud','comisiones_cobradas','constante_guardar','corregir_abono','corregir_venta','cotizacion_guardar',
                                         'cuaderno_guardar','descartar_cotizacion','emitir_salidas_derivadas','estado_solicitudes','ganar_proyecto','instalacion_guardar','mi_acceso','miembro_alta',
                                         'miembro_baja','miembro_cambiar_area','mover_etapa','pantalla_aprobar','pantalla_revocar','proyecto_actualizar','rechazar_solicitud','reclamar_acceso','registrar_abono_comision','registrar_cobro',
                                         'repartir_abono_fifo','revocar_autorizacion','solicitar','subida_unica','tarifas_guardar','tarifas_leer','version_contrato','vista_previa_reparto'];
  c_servicio    constant text[] := array['agente_abrir','agente_guardar','agente_leer','autorizacion_para_verificar','contador_sembrar','cuadre_hoja','ia_cuota','ia_turno','pantalla_solicitar','pantalla_tablero','registrar_autorizacion','tarifas_de','verificar_cupo'];
  c_int_cliente constant text[] := array['comision','empresas_donde','hoy_mx','neto'];
  c_int_servicio constant text[] := array['comision','contiene_dinero','empresas_donde','hoy_mx','neto','sellos_validos'];
  c_vistas_cli  constant text[] := array['comisiones_pendientes','ventas_calculadas'];
  c_publicadas  constant text[] := array['abonos','almacen_costos','almacen_movimientos','bitacora','constantes','cotizaciones','instalaciones','materiales','miembros','proyectos',
                                         'requerimientos','solicitudes','ventas_dinero'];
  v text[] := '{}'; r record; t text;
begin
  -- ---- GR-03: toda tabla de `public` con RLS; `contadores` sin NINGUNA política (denegado por defecto) ---------------------------------------------
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1 loop
    v := v || format('GR-03 la tabla public.%I no tiene RLS encendida', r.relname);
  end loop;
  for r in select p.polname, c.relname from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'contadores' order by 1 loop
    v := v || format('GR-03 public.contadores no debe tener políticas y tiene «%s»', r.polname);
  end loop;

  -- ---- GR-01 y GR-07: funciones de `public` e `interno` ---------------------------------------------------------------------------------------------
  for r in select n.nspname, p.proname, p.oid, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'interno') and p.prokind in ('f', 'p')
              and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
              -- Las funciones de DISPARADOR DE EVENTO no son una puerta: Postgres las rechaza si alguien intenta llamarlas como RPC
              -- («trigger functions can only be called as triggers»). Con «RLS automático» encendido en el proyecto, Supabase instala una
              -- así en `public` (`rls_auto_enable`); lo descubrió la primera corrida de esta auditoría contra el proyecto real de pruebas
              -- (2026-10-10), que abortó por ella. Solo se exime el tipo `event_trigger`: una función `trigger` nuestra sí se audita.
              and p.prorettype <> 'pg_catalog.event_trigger'::regtype
            order by 1, 2, 4 loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      v := v || format('GR-01 la función %s.%s(%s) es ejecutable por anon/PUBLIC (falta su REVOKE)', r.nspname, r.proname, r.args);
    end if;
    if r.prosecdef and not coalesce(r.proconfig, '{}') @> array['search_path=""'] then
      v := v || format('GR-07 la función SECURITY DEFINER %s.%s(%s) no fija search_path = ''''', r.nspname, r.proname, r.args);
    end if;
    -- ---- GR-02: qué ejecuta cada rol en `public` ----------------------------------------------------------------------------------------------
    if r.nspname = 'public' then
      if r.proname = any (c_cliente) then
        if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de cliente public.%s(%s) no es ejecutable por authenticated (falta su GRANT)', r.proname, r.args);
        end if;
      elsif r.proname = any (c_servicio) then
        if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de servicio public.%s(%s) es ejecutable por authenticated: solo service_role la llama', r.proname, r.args);
        end if;
        if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de servicio public.%s(%s) no es ejecutable por service_role (falta su GRANT)', r.proname, r.args);
        end if;
      else
        v := v || format('GR-02 la función public.%s(%s) no está en las listas cerradas (RPC de cliente o de servicio): decide a quién pertenece y agrégala', r.proname, r.args);
        if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la función public.%s(%s) es ejecutable por authenticated y no es una RPC de cliente', r.proname, r.args);
        end if;
      end if;
    else
      -- ---- GR-08: el esquema `interno` ------------------------------------------------------------------------------------------------------
      if has_function_privilege('authenticated', r.oid, 'EXECUTE') and not r.proname = any (c_int_cliente) then
        v := v || format('GR-08 la función interno.%s(%s) es ejecutable por authenticated y no es de las cuatro que usan las políticas', r.proname, r.args);
      end if;
      if has_function_privilege('service_role', r.oid, 'EXECUTE') and not r.proname = any (c_int_servicio) then
        v := v || format('GR-08 la función interno.%s(%s) es ejecutable por service_role y no es de las seis permitidas', r.proname, r.args);
      end if;
      if r.proname = any (c_int_cliente) and not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
        v := v || format('GR-08 interno.%s(%s) debe ser ejecutable por authenticated: la evalúan las políticas y la vista', r.proname, r.args);
      end if;
    end if;
  end loop;
  if has_schema_privilege('anon', 'interno', 'USAGE') or has_schema_privilege('anon', 'interno', 'CREATE') then
    v := v || 'GR-08 anon tiene privilegios sobre el esquema interno'::text;
  end if;
  foreach t in array array['authenticated', 'service_role'] loop
    if not has_schema_privilege(t, 'interno', 'USAGE') then v := v || format('GR-08 %s no tiene USAGE sobre el esquema interno (las políticas y las vistas no corren)', t); end if;
    if has_schema_privilege(t, 'interno', 'CREATE') then v := v || format('GR-08 %s puede CREAR objetos en el esquema interno', t); end if;
  end loop;
  foreach t in array array['anon', 'authenticated'] loop
    if has_schema_privilege(t, 'public', 'CREATE') then v := v || format('GR-06 %s puede CREAR objetos en el esquema public', t); end if;
  end loop;

  -- ---- GR-04: toda vista con security_invoker (si no, corre con los privilegios de su dueño y SALTA la RLS); nada materializado en `public` -------------
  for r in select c.relname, c.relkind, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1 loop
    if r.relkind = 'm' then
      v := v || format('GR-04 public.%I es una vista MATERIALIZADA: PostgREST la expondría sin RLS', r.relname);
    elsif not coalesce(r.reloptions, '{}') && array['security_invoker=true', 'security_invoker=on', 'security_invoker=1'] then
      v := v || format('GR-04 la vista public.%I no tiene security_invoker = true: saltaría la RLS de sus tablas', r.relname);
    end if;
  end loop;

  -- ---- GR-05: Realtime = lista cerrada, y ninguna con la fila vieja completa ------------------------------------------------------------------------
  for r in select pt.tablename from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' order by 1 loop
    if not r.tablename = any (c_publicadas) then v := v || format('GR-05 public.%I está publicada en supabase_realtime y no es de las 13 de la lista cerrada', r.tablename); end if;
  end loop;
  foreach t in array c_publicadas loop
    if not exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = t) then
      v := v || format('GR-05 public.%I debe estar publicada en supabase_realtime', t);
    end if;
  end loop;
  for r in select c.relname, c.relreplident from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relreplident <> 'd'
              and exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = c.relname) order by 1 loop
    v := v || format('GR-05 public.%I está publicada con replica identity «%s» (full/index): un DELETE llevaría la fila vieja a quien no la puede leer', r.relname, r.relreplident);
  end loop;

  -- ---- GR-06: privilegios sobre tablas, vistas y secuencias de `public` -----------------------------------------------------------------------------
  --   anon: NADA. authenticated: solo SELECT, y en tablas solo donde hay política; en vistas, solo las dos de fórmulas. service_role: sin DELETE ni TRUNCATE.
  for r in select c.oid, c.relname, c.relkind, exists (select 1 from pg_policy p where p.polrelid = c.oid) as con_politica
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') order by 2 loop
    if has_table_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or has_any_column_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, REFERENCES') then
      v := v || format('GR-06 anon tiene privilegios sobre public.%I (debe tener ninguno)', r.relname);
    end if;
    if has_any_column_privilege('authenticated', r.oid, 'INSERT') then v := v || format('GR-06 authenticated puede INSERTAR en public.%I: se escribe solo por RPC', r.relname); end if;
    if has_any_column_privilege('authenticated', r.oid, 'UPDATE') then v := v || format('GR-06 authenticated puede ACTUALIZAR public.%I: se escribe solo por RPC', r.relname); end if;
    if has_table_privilege('authenticated', r.oid, 'DELETE') then v := v || format('GR-06 authenticated puede BORRAR en public.%I', r.relname); end if;
    if has_table_privilege('authenticated', r.oid, 'TRUNCATE, REFERENCES, TRIGGER') then v := v || format('GR-06 authenticated tiene TRUNCATE/REFERENCES/TRIGGER sobre public.%I', r.relname); end if;
    if has_any_column_privilege('authenticated', r.oid, 'SELECT') then
      if r.relkind in ('r', 'p') and not r.con_politica then
        v := v || format('GR-06 authenticated puede leer public.%I y la tabla no tiene ninguna política (la RLS la deja cerrada: el GRANT sobra)', r.relname);
      elsif r.relkind in ('v', 'm', 'f') and not r.relname = any (c_vistas_cli) then
        v := v || format('GR-06 authenticated puede leer la vista public.%I y no es de las dos de fórmulas', r.relname);
      end if;
    elsif r.relkind in ('v') and r.relname = any (c_vistas_cli) then
      v := v || format('GR-06 authenticated debe poder leer la vista public.%I (la usa el teléfono)', r.relname);
    end if;
    if has_table_privilege('service_role', r.oid, 'DELETE, TRUNCATE') then
      v := v || format('GR-06 service_role puede BORRAR en public.%I: nada de negocio se borra (BYPASSRLS salta la RLS, no los privilegios, y este no se le da)', r.relname);
    end if;
  end loop;
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'interno') and c.relkind = 'S' order by 2 loop
    if has_sequence_privilege('anon', r.oid, 'USAGE, SELECT, UPDATE') or has_sequence_privilege('authenticated', r.oid, 'USAGE, SELECT, UPDATE') then
      v := v || format('GR-06 anon o authenticated tienen privilegios sobre la secuencia %I', r.relname);
    end if;
  end loop;

  -- ---- GR-09: nada de negocio se borra: toda tabla de `public` (salvo `contadores`, que limpia sus ventanas vencidas, y `pantallas` (0022), que borra
  --      los CÓDIGOS de vinculación que vencieron hace más de un día: una TV que pidió código y nadie aprobó no es negocio) lleva su trigger `sin_borrar` ----
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in ('contadores', 'pantallas')
              and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal and g.tgenabled <> 'D' and g.tgfoid = 'interno.sin_borrar()'::regprocedure)
            order by 1 loop
    v := v || format('GR-09 la tabla public.%I no tiene su trigger sin_borrar (o está desactivado)', r.relname);
  end loop;

  return v;
end $$;
-- Solo la lee quien administra (el dueño y los superusuarios): ningún rol de la aplicación la ejecuta (GR-08).
revoke all on function interno.auditoria() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0023): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
