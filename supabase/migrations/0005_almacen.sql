-- =====================================================================================================
-- 0005_almacen.sql — el catálogo de material, las listas de compra, el libro del almacén y las constantes del taller
-- =====================================================================================================
-- Qué deja:
--   · `materiales` (catálogo; sellos POR CAMPO), `requerimientos` (listas de compra), `almacen_movimientos` (el LIBRO, append-only),
--     `almacen_costos` (la única cifra de dinero del almacén, aparte) y `constantes` (las constantes del taller, por empresa);
--   · sus triggers, índices, políticas RLS y privilegios;
--   · las RPC `almacen_aplicar` (+ `interno.almacen_una`) y `constante_guardar`.
--
-- Depende de: 0001 (utilidades, `siguiente`, compuerta), 0002 (`empresas_donde`, preámbulo) y 0003 (`proyectos`).
--
-- El almacén NO es CRUD: el .gs hace ~60 reglas de escritura (permiso por área, validación por tipo, «un cambio atrasado no pisa»,
-- «consumido no vuelve atrás»…). Un upsert con RLS las perdería, así que se escribe SOLO por `almacen_aplicar`.
-- R1: RLS no oculta columnas, y el costo es dinero: por eso `costo_compra` y `costo_total` viven en `almacen_costos`, que
-- Fabricación ni lee ni escribe (sus costos se IGNORAN en silencio, como hoy). Dirección y Pagos ven costos; solo Dirección los escribe.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. materiales: el catálogo, campo por campo con sello por campo
-- -----------------------------------------------------------------------------------------------------
-- Se escribe CAMPO POR CAMPO: `sellos` (campo → ms) decide quién gana; un cambio con sello más viejo no pisa y el empate escribe.
-- El costo no está aquí: `almacen_costos`.
create table if not exists public.materiales (
  empresa_id     text not null references public.empresas (id),
  id             text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),               -- A «Clave» (acr-3mm); inmutable
  nombre         text not null default '',                                              -- B
  familia        text not null default 'sin_familia',                                   -- C (texto libre en el servidor)
  unidad_compra  text not null check (unidad_compra  in ('unidad','bolsa','caja','lamina','litro','metro')),   -- D
  unidad_consumo text not null check (unidad_consumo in ('m2','m','cm','pieza','litro')),                      -- E
  medida         text not null default '',                                              -- F
  factor         numeric not null check (factor > 0),                                   -- G
  factor_origen  text not null default '',                                              -- H (el cliente lo exige; el servidor no)
  largo_cm       numeric,                                                               -- I
  ancho_cm       numeric,                                                               -- J
  espesor        text not null default '',                                              -- K
  merma_pct      numeric not null default 0 check (merma_pct >= 0 and merma_pct < 1),  -- L (el cliente valida 0..0.99)
  fraccionable   boolean not null default false,                                        -- M
  min_compra     numeric not null default 0 check (min_compra >= 0),                    -- N
  min_stock      numeric not null default 0 check (min_stock  >= 0),                    -- O
  proveedor      text not null default '',                                              -- Q
  tel_proveedor  text not null default '',                                              -- R
  activo         boolean not null default true,                                         -- S (baja lógica: no existe borrado de materiales)
  sellos         jsonb not null default '{}'::jsonb check (jsonb_typeof(sellos) = 'object'),   -- «Sellos» (campo → ms)
  procedencia    jsonb not null default '{}'::jsonb,                                    -- {otros:{…}} = «Otros (JSON)»: lo que llegó sin columna propia
  created_at     timestamptz not null default now(),                                    -- U «Creado»
  updated_at     timestamptz not null default clock_timestamp(),                        -- (≠ V «Editado», que es el sello del cliente: va en `sellos._editado`)
  primary key (empresa_id, id)
);
create index if not exists materiales_sync on public.materiales (empresa_id, updated_at, id);

drop trigger if exists materiales_tocar      on public.materiales;
drop trigger if exists materiales_sin_borrar on public.materiales;
create trigger materiales_tocar      before insert or update on public.materiales for each row execute function interno.tocar();
create trigger materiales_sin_borrar before delete          on public.materiales for each row execute function interno.sin_borrar();

alter table public.materiales enable row level security;
revoke all on public.materiales from public, anon, authenticated, service_role;
grant select on public.materiales to authenticated;
grant select, insert, update on public.materiales to service_role;

drop policy if exists materiales_sel_todos on public.materiales;
create policy materiales_sel_todos on public.materiales for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.materiales replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'materiales') then
    alter publication supabase_realtime add table public.materiales;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 2. requerimientos: las listas de compra
-- -----------------------------------------------------------------------------------------------------
-- Lo que cada proyecto pide de cada material. `id = <proyecto_id>:<material_id>`, determinista: de ahí cuelga la idempotencia de la salida
-- `mov-salida:<id>`. FK a `proyectos` (con la unificación de ids hay un solo `proyecto_id` válido); SIN FK a `materiales` (el cliente
-- tolera materiales fuera del catálogo y el catálogo de la hoja es un subconjunto). La columna «Venta» (`folio_hoja`) NO se guarda: sale
-- de `proyectos.folio_hoja` por el FK.
create table if not exists public.requerimientos (
  empresa_id         text not null references public.empresas (id),
  id                 text not null,                                                      -- U «Id»
  proyecto_id        text not null,                                                      -- Q «Proyecto (id)»: AHORA el id canónico
  material_id        text not null check (btrim(material_id) <> ''),                     -- B
  cantidad_consumo   numeric not null default 0,                                         -- J
  unidad_consumo     text not null default '',                                           -- K
  cantidad_compra    numeric not null default 0 check (cantidad_compra >= 0),            -- C (sin redondear, fraccionaria a propósito)
  unidad_compra      text not null check (unidad_compra in ('unidad','bolsa','caja','lamina','litro','metro')),   -- D
  partidas           jsonb not null default '[]'::jsonb check (jsonb_typeof(partidas) = 'array'),                -- L (ids de partida)
  formula            text not null default '',                                           -- I «Cómo se calculó» (la hoja la truncaba a 2000)
  confianza          text not null default 'estimada',                                   -- G (exacta|estimada|requiere_dato; el servidor no lo valida)
  requiere           text not null default '',                                           -- H
  constantes_version text not null default '',                                           -- P
  cantidad_ajustada  numeric check (cantidad_ajustada is null or cantidad_ajustada >= 0),-- E «Corrección»: si no es null, MANDA
  motivo_ajuste      text not null default '',                                           -- M
  ajustado_por       text not null default '',                                           -- N («Nombre · Rol (DISP)»)
  ajustado_ms        bigint not null default 0,                                          -- O «Corregido» (0 = nunca)
  estado             text not null default 'calculado' check (estado in ('calculado','apartado','comprado','consumido','descartado')),  -- F (monótono)
  sellos             jsonb not null default '{}'::jsonb check (jsonb_typeof(sellos) = 'object'),
  procedencia        jsonb not null default '{}'::jsonb,                                 -- {proyecto_id_local, disp, otros:{…}}
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default clock_timestamp(),
  primary key (empresa_id, id),
  constraint requerimientos_id_canonico check (id = proyecto_id || ':' || material_id),
  foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index if not exists requerimientos_proyecto on public.requerimientos (empresa_id, proyecto_id);
create index if not exists requerimientos_material on public.requerimientos (empresa_id, material_id);
create index if not exists requerimientos_sync     on public.requerimientos (empresa_id, updated_at, id);

drop trigger if exists requerimientos_tocar      on public.requerimientos;
drop trigger if exists requerimientos_sin_borrar on public.requerimientos;
create trigger requerimientos_tocar      before insert or update on public.requerimientos for each row execute function interno.tocar();
create trigger requerimientos_sin_borrar before delete          on public.requerimientos for each row execute function interno.sin_borrar();

alter table public.requerimientos enable row level security;
revoke all on public.requerimientos from public, anon, authenticated, service_role;
grant select on public.requerimientos to authenticated;
grant select, insert, update on public.requerimientos to service_role;

drop policy if exists requerimientos_sel_todos on public.requerimientos;
create policy requerimientos_sel_todos on public.requerimientos for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.requerimientos replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimientos') then
    alter publication supabase_realtime add table public.requerimientos;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 3. almacen_movimientos: el LIBRO (append-only)
-- -----------------------------------------------------------------------------------------------------
-- De él sale la existencia (último `conteo` + lo posterior). NUNCA se edita ni se borra: una corrección es otro movimiento. Idempotente
-- por `id` (el del teléfono, o `mov-salida:<req.id>` para la salida del corte). `seq` es el orden de llegada (la «Secuencia» de la hoja).
create table if not exists public.almacen_movimientos (
  empresa_id     text not null references public.empresas (id),
  id             text not null check (length(id) between 1 and 200),                    -- R «Id»
  seq            bigint not null,                                                        -- T «Secuencia» (trigger `interno.movimiento_seq`)
  material_id    text not null check (btrim(material_id) <> ''),                         -- B «Material» (no se valida contra el catálogo)
  tipo           text not null check (tipo in ('entrada','salida','ajuste','conteo','merma','devolucion')),     -- C
  cantidad       numeric not null check (abs(cantidad) <= 10000000),                     -- D (unidad de COMPRA, CON SIGNO)
  unidad_compra  text not null check (unidad_compra in ('unidad','bolsa','caja','lamina','litro','metro')),     -- E
  origen         text not null check (origen in ('derivado','manual','conteo','compra')),                       -- F
  nota           text not null default '',                                               -- G
  usuario        text not null default '',                                               -- H «Quién» (texto libre del teléfono, o el correo si lo escribió la base)
  rol            text not null default '',                                               -- I
  dispositivo    text not null default '',                                               -- J
  proyecto_id    text,                                                                   -- K: SIN FK (el libro es evidencia; un id local sin proyecto no puede tumbar una salida)
  requerimiento_id text,                                                                 -- M
  firma          text not null default '',                                               -- O «Firma» (campo local `sello`: «Nombre · Rol (DISP)»)
  ts             bigint not null check (ts > 0),                                         -- Q «Sello» (campo local `ts`): ms del movimiento; ordena el libro y ancla los conteos
  usuario_id     uuid,
  procedencia    jsonb not null default '{}'::jsonb,                                     -- {secuencia_hoja, proyecto_id_local, otros:{…}}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  primary key (empresa_id, id),
  constraint movimientos_signo check (
       (tipo in ('entrada','devolucion') and cantidad > 0)
    or (tipo in ('salida','merma')       and cantidad < 0)
    or (tipo = 'conteo'                  and cantidad >= 0)         -- «no queda nada» es un dato
    or (tipo = 'ajuste'                  and cantidad <> 0)
  )
);
create unique index if not exists movimientos_seq         on public.almacen_movimientos (empresa_id, seq);
create index        if not exists movimientos_material_ts on public.almacen_movimientos (empresa_id, material_id, ts, id);   -- porMaterial = [material_id, ts]
create index        if not exists movimientos_proyecto    on public.almacen_movimientos (empresa_id, proyecto_id) where proyecto_id is not null;
create index        if not exists movimientos_sync        on public.almacen_movimientos (empresa_id, updated_at, id);

-- `seq` lo asigna SIEMPRE la base (un teléfono no puede fijarlo) con el contador `alm`, que serializa las altas del libro por el candado de
-- su fila. Es SECURITY DEFINER porque el importador (service_role) inserta directo y no tiene —ni debe tener— EXECUTE sobre `siguiente`.
create or replace function interno.movimiento_seq() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- un id que YA existe no gasta número: su fila la descarta el `ON CONFLICT DO NOTHING` (la salida del corte que otro teléfono ya emitió, una importación repetida)
  -- y ese seq nunca se vería; sin esto el contador `alm` subiría en cada reintento y dejaría huecos en el libro
  if exists (select 1 from public.almacen_movimientos m where m.empresa_id = new.empresa_id and m.id = new.id) then new.seq := 0; return new; end if;
  new.seq := interno.siguiente(new.empresa_id, 'alm', '', 1); return new;
end $$;
revoke all on function interno.movimiento_seq() from public, anon, authenticated, service_role;

drop trigger if exists movimientos_seq                on public.almacen_movimientos;
drop trigger if exists almacen_movimientos_tocar      on public.almacen_movimientos;
drop trigger if exists almacen_movimientos_sin_borrar on public.almacen_movimientos;
drop trigger if exists almacen_movimientos_solo_agregar on public.almacen_movimientos;
create trigger movimientos_seq                before insert                    on public.almacen_movimientos for each row execute function interno.movimiento_seq();
create trigger almacen_movimientos_tocar      before insert or update          on public.almacen_movimientos for each row execute function interno.tocar();
create trigger almacen_movimientos_sin_borrar before delete                    on public.almacen_movimientos for each row execute function interno.sin_borrar();
create trigger almacen_movimientos_solo_agregar before update                  on public.almacen_movimientos for each row execute function interno.solo_agregar();

alter table public.almacen_movimientos enable row level security;
revoke all on public.almacen_movimientos from public, anon, authenticated, service_role;
grant select on public.almacen_movimientos to authenticated;
grant select, insert, update on public.almacen_movimientos to service_role;

drop policy if exists movimientos_sel_todos on public.almacen_movimientos;
create policy movimientos_sel_todos on public.almacen_movimientos for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.almacen_movimientos replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'almacen_movimientos') then
    alter publication supabase_realtime add table public.almacen_movimientos;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 4. almacen_costos: la única cifra de dinero del almacén
-- -----------------------------------------------------------------------------------------------------
-- `costo_compra` (por material) y `costo_total` (por movimiento), FUERA de las filas compartidas porque RLS no oculta columnas.
create table if not exists public.almacen_costos (
  id             bigint generated always as identity primary key,
  empresa_id     text not null references public.empresas (id),
  material_id    text,                                      -- P «Costo de compra» del catálogo
  movimiento_id  text,                                      -- N «Costo total» del libro
  importe        numeric,                                   -- NULL = «borrado» (la hoja lo bajaba como null y guardaba su sello)
  sello          bigint not null default 0,                 -- sello del campo (ms); mismo criterio que `materiales.sellos`
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  constraint almacen_costos_uno check ((material_id is null) <> (movimiento_id is null)),
  foreign key (empresa_id, material_id)    references public.materiales (empresa_id, id),
  foreign key (empresa_id, movimiento_id)  references public.almacen_movimientos (empresa_id, id)
);
create unique index if not exists almacen_costos_material   on public.almacen_costos (empresa_id, material_id)   where material_id is not null;
create unique index if not exists almacen_costos_movimiento on public.almacen_costos (empresa_id, movimiento_id) where movimiento_id is not null;
create index        if not exists almacen_costos_sync       on public.almacen_costos (empresa_id, updated_at, id);

drop trigger if exists almacen_costos_tocar      on public.almacen_costos;
drop trigger if exists almacen_costos_sin_borrar on public.almacen_costos;
create trigger almacen_costos_tocar      before insert or update on public.almacen_costos for each row execute function interno.tocar();
create trigger almacen_costos_sin_borrar before delete          on public.almacen_costos for each row execute function interno.sin_borrar();

alter table public.almacen_costos enable row level security;
revoke all on public.almacen_costos from public, anon, authenticated, service_role;
grant select on public.almacen_costos to authenticated;
grant select, insert, update on public.almacen_costos to service_role;

-- Dirección y Pagos (paridad con hoy: la API actual ya les entrega el almacén con costos). Fabricación: ni una fila.
drop policy if exists almacen_costos_sel_dir_pag on public.almacen_costos;
create policy almacen_costos_sel_dir_pag on public.almacen_costos for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.almacen_costos replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'almacen_costos') then
    alter publication supabase_realtime add table public.almacen_costos;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 5. constantes: las constantes del taller, por empresa
-- -----------------------------------------------------------------------------------------------------
-- Las 20 constantes (`CTS_BASE`) hoy son POR DISPOSITIVO y no viajan (sus operaciones quedaban `sin_destino` para siempre); el plan las pasa a
-- la empresa. No es dinero. La fila marca `_semilla` NO se migra (el CHECK la prohíbe).
create table if not exists public.constantes (
  empresa_id      text not null references public.empresas (id),
  clave           text not null check (clave ~ '^[A-Za-z0-9_]{1,64}$' and clave <> '_semilla'),
  valor           numeric not null,
  unidad          text not null default '',
  nota            text not null default '',
  version         text not null default '',               -- 'c-2026-08.4kz1'
  actualizado_por text not null default '',               -- «Nombre · Rol (DISP)» (`Prefs.sello()`)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),
  primary key (empresa_id, clave)
);
create index if not exists constantes_sync on public.constantes (empresa_id, updated_at, clave);

drop trigger if exists constantes_tocar      on public.constantes;
drop trigger if exists constantes_sin_borrar on public.constantes;
create trigger constantes_tocar      before insert or update on public.constantes for each row execute function interno.tocar();
create trigger constantes_sin_borrar before delete          on public.constantes for each row execute function interno.sin_borrar();

alter table public.constantes enable row level security;
revoke all on public.constantes from public, anon, authenticated, service_role;
grant select on public.constantes to authenticated;
grant select, insert, update on public.constantes to service_role;

drop policy if exists constantes_sel_todos on public.constantes;
create policy constantes_sel_todos on public.constantes for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.constantes replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'constantes') then
    alter publication supabase_realtime add table public.constantes;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 6. almacen_aplicar: la única puerta de escritura del almacén
-- -----------------------------------------------------------------------------------------------------
-- Quién escribe qué (las matrices de §2.19 y de `almPermiso_` del .gs):
--   Dirección, Fabricación: todo.
--   Pagos: movimientos SOLO `origen = 'derivado'` Y `tipo = 'salida'` (lo que deriva la obra sola; «derivado» no le abre `entrada`);
--          requerimientos SOLO si `campos` es un arreglo NO vacío ⊆ {estado, folio_hoja} Y `datos.estado = 'consumido'`; materiales, nunca.
--   Costos: solo Dirección los escribe; a los demás se les IGNORAN en silencio (no se reportan, no se guardan, no se devuelven).

-- Una respuesta de error por operación: el mismo sobre que `interno.err` y el id de la operación para que la bandeja la ubique.
create or replace function interno.almacen_error(p_id text, p_codigo text, p_mensaje text) returns jsonb language sql immutable set search_path = '' as $$
  select interno.err(p_codigo, p_mensaje) || pg_catalog.jsonb_build_object('id', p_id) $$;
revoke all on function interno.almacen_error(text, text, text) from public, anon, authenticated, service_role;

-- Una operación: forma, permiso por área (ANTES de mirar nada), validación, y luego la escritura. Devuelve
--   {id, ok:true, creada | ya_estaba | sin_cambio, viejos:[campo…]}  o  {id, ok:false, codigo, mensaje, definitivo}.
-- Todo lo que se valida ocurre ANTES de la primera escritura de la operación. Jamás devuelve costos.
create or replace function interno.almacen_una(c interno.contexto_t, op jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_id text; v_alm text; v_datos jsonb; v_campos jsonb; v_reg text; v_ahora bigint := interno.ahora_ms(); v_ts bigint;
  v_n numeric; v_tipo text; v_existe boolean := false; v_sellos jsonb := '{}'::jsonb; v_nuevos jsonb; v_lista text[]; f text; r record;
  v_cols text[]; v_fijos text[]; v_set jsonb := '{}'::jsonb; v_otros jsonb := '{}'::jsonb; v_viejos jsonb := '[]'::jsonb; v_escritos text[] := '{}';
  v_estado_actual text; v_tiene bigint; v_costo_hay boolean := false; v_costo numeric; v_costo_sello bigint; v_cols_txt text; v_filas int; v_ins jsonb;
  v_sets text[]; v_solo_costo boolean;
begin
  -- 1. forma
  if pg_catalog.jsonb_typeof(op) is distinct from 'object' then
    return interno.almacen_error(null, 'DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_id := op ->> 'id'; v_alm := op ->> 'almacen'; v_datos := op -> 'datos'; v_campos := op -> 'campos';
  if v_id is null or pg_catalog.btrim(v_id) = '' or pg_catalog.length(v_id) > 200 or v_alm is null
     or v_alm <> all (array['movimientos','materiales','requerimientos']) or pg_catalog.jsonb_typeof(v_datos) is distinct from 'object' then
    return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La operación necesita su id, el almacén (movimientos, materiales o requerimientos) y sus datos.'); end if;
  v_reg := pg_catalog.btrim(coalesce(op ->> 'registro_id', v_datos ->> 'id', ''));
  if v_reg = '' or pg_catalog.length(v_reg) > 200 then
    return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: le falta el id del registro, o es demasiado largo.'); end if;

  -- 2. permiso por área
  if c.area = 'pagos' then
    if v_alm = 'movimientos' then
      if not coalesce(v_datos ->> 'origen' = 'derivado' and v_datos ->> 'tipo' = 'salida', false) then      -- coalesce: un NULL no puede «aprobar» el permiso
        return interno.almacen_error(v_id, 'ROL_SIN_PERMISO', 'El almacén lo mueven Fabricación y Dirección; desde Pagos solo entra la salida que deriva la obra sola.'); end if;
    elsif v_alm = 'requerimientos' then
      if not coalesce(pg_catalog.jsonb_typeof(v_campos) = 'array' and pg_catalog.jsonb_array_length(v_campos) > 0
                      and not exists (select 1 from pg_catalog.jsonb_array_elements_text(v_campos) x where x not in ('estado', 'folio_hoja'))
                      and v_datos ->> 'estado' = 'consumido', false) then      -- sin `campos` (NULL) tampoco pasa: la regla de Pagos exige la lista
        return interno.almacen_error(v_id, 'ROL_SIN_PERMISO', 'Las listas de compra las corrigen Fabricación y Dirección; desde Pagos solo se marca lo que ya salió del almacén.'); end if;
    else
      return interno.almacen_error(v_id, 'ROL_SIN_PERMISO', 'El catálogo de material lo editan Fabricación y Dirección.');
    end if;
  end if;

  -- 3. validación (lo que no puede entrar, venga de quien venga)
  if v_alm = 'movimientos' then
    v_tipo := v_datos ->> 'tipo';
    if v_tipo is null or v_tipo <> all (array['entrada','salida','ajuste','conteo','merma','devolucion']) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el tipo de movimiento no existe.'); end if;
    if v_datos ->> 'origen' is null or (v_datos ->> 'origen') <> all (array['derivado','manual','conteo','compra']) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el origen del movimiento no existe.'); end if;
    if pg_catalog.btrim(coalesce(v_datos ->> 'material_id', '')) = '' then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el movimiento no dice de qué material.'); end if;
    if v_datos ->> 'unidad_compra' is null or (v_datos ->> 'unidad_compra') <> all (array['unidad','bolsa','caja','lamina','litro','metro']) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la unidad de compra no existe.'); end if;
    v_n := interno.num(v_datos -> 'cantidad');
    if v_n is null or abs(v_n) > 10000000 then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la cantidad no es un número razonable.'); end if;
    if v_tipo in ('entrada', 'devolucion') and not (v_n > 0) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: una entrada suma, su cantidad va en positivo.'); end if;
    if v_tipo in ('salida', 'merma') and not (v_n < 0) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: una salida resta, su cantidad va en negativo.'); end if;
    if v_tipo = 'conteo' and v_n < 0 then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: no se puede contar menos que nada.'); end if;
    if v_tipo = 'ajuste' and v_n = 0 then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: un ajuste de cero no ajusta nada.'); end if;
    if coalesce(interno.num(v_datos -> 'ts'), 0) <= 0 then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el movimiento no trae su sello de tiempo.'); end if;
    if v_datos ? 'costo_total' and pg_catalog.jsonb_typeof(v_datos -> 'costo_total') <> 'null' and coalesce(v_datos ->> 'costo_total', '') <> ''
       and interno.num(v_datos -> 'costo_total') is null then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el costo no es un número.'); end if;
  elsif v_alm = 'materiales' then
    select exists (select 1 from public.materiales m where m.empresa_id = c.empresa_id and m.id = v_reg) into v_existe;
    if v_datos ? 'unidad_compra' and (v_datos ->> 'unidad_compra' is null or (v_datos ->> 'unidad_compra') <> all (array['unidad','bolsa','caja','lamina','litro','metro'])) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la unidad de compra no existe.'); end if;
    if v_datos ? 'unidad_consumo' and (v_datos ->> 'unidad_consumo' is null or (v_datos ->> 'unidad_consumo') <> all (array['m2','m','cm','pieza','litro'])) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la unidad de consumo no existe.'); end if;
    if v_datos ? 'factor' and not (coalesce(interno.num(v_datos -> 'factor'), 0) > 0) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el factor tiene que ser mayor que cero.'); end if;
    -- el ALTA exige las tres cosas que la tabla no deja vacías: sin esta validación el NOT NULL truena como DESCONOCIDO y la bandeja
    -- reintenta para siempre una operación que nunca va a pasar
    if not v_existe then
      if v_reg !~ '^[a-z0-9][a-z0-9-]{0,62}$' then
        return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la clave del material no es válida (minúsculas, números y guiones).'); end if;
      if not (v_datos ? 'unidad_compra') or not (v_datos ? 'unidad_consumo') or not (v_datos ? 'factor') then
        return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: un material nuevo necesita su unidad de compra, su unidad de consumo y su factor.'); end if;
    end if;
  else
    select exists (select 1 from public.requerimientos q where q.empresa_id = c.empresa_id and q.id = v_reg) into v_existe;
    if v_datos ? 'estado' and (v_datos ->> 'estado' is null or (v_datos ->> 'estado') <> all (array['calculado','apartado','comprado','consumido','descartado'])) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el estado de la lista de compra no existe.'); end if;
    if v_datos ? 'unidad_compra' and (v_datos ->> 'unidad_compra' is null or (v_datos ->> 'unidad_compra') <> all (array['unidad','bolsa','caja','lamina','litro','metro'])) then
      return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la unidad de compra no existe.'); end if;
    -- solo el ALTA exige la identidad (id = proyecto:material, el proyecto existe, unidad de compra); en un CAMBIO esas llaves se ignoran (AL-11)
    if not v_existe then
      if pg_catalog.btrim(coalesce(v_datos ->> 'proyecto_id', '')) = '' or pg_catalog.btrim(coalesce(v_datos ->> 'material_id', '')) = '' then
        return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: la línea no dice de qué proyecto y de qué material.'); end if;
      if v_reg <> (v_datos ->> 'proyecto_id') || ':' || (v_datos ->> 'material_id') then
        return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: el id de la línea debe ser proyecto:material.'); end if;
      if not exists (select 1 from public.proyectos p where p.empresa_id = c.empresa_id and p.id = v_datos ->> 'proyecto_id') then
        return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: ese proyecto no existe.'); end if;
      if not (v_datos ? 'unidad_compra') then
        return interno.almacen_error(v_id, 'DATO_INVALIDO', 'La base no aceptó ese cambio: una línea nueva necesita su unidad de compra.'); end if;
    end if;
  end if;

  -- 4. MOVIMIENTOS (libro). El `tipo` de la bandeja se ignora: decide la tabla. Si ya está, ya está.
  if v_alm = 'movimientos' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':alm:mov:' || v_reg, 0));     -- dos teléfonos con el mismo id no se pisan
    if exists (select 1 from public.almacen_movimientos m where m.empresa_id = c.empresa_id and m.id = v_reg) then
      return pg_catalog.jsonb_build_object('id', v_id, 'ok', true, 'ya_estaba', true);        -- NO compara contenido y NO gasta `seq`
    end if;
    v_ts := pg_catalog.floor(interno.num(v_datos -> 'ts'))::bigint;
    insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo, proyecto_id,
                                            requerimiento_id, firma, ts, usuario_id)
    values (c.empresa_id, v_reg, v_datos ->> 'material_id', v_tipo, v_n, v_datos ->> 'unidad_compra', v_datos ->> 'origen', coalesce(v_datos ->> 'nota', ''),
            coalesce(v_datos ->> 'usuario', ''), coalesce(v_datos ->> 'rol', ''), coalesce(v_datos ->> 'dispositivo', ''), v_datos ->> 'proyecto_id',
            v_datos ->> 'requerimiento_id', coalesce(v_datos ->> 'firma', ''), v_ts, c.usuario_id);
    v_costo := interno.num(v_datos -> 'costo_total');
    if c.area = 'direccion' and v_costo is not null then          -- Fabricación y Pagos: el costo se IGNORA en silencio
      insert into public.almacen_costos (empresa_id, movimiento_id, importe, sello) values (c.empresa_id, v_reg, v_costo, v_ts);
    end if;
    return pg_catalog.jsonb_build_object('id', v_id, 'ok', true, 'creada', true);
  end if;

  -- 5. MATERIALES y REQUERIMIENTOS (fichas con sello por campo)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':alm:' || v_alm || ':' || v_reg, 0));
  -- el sello del cambio: `actualizado_en` ACOTADO a ahora + 10 min (un reloj adelantado ya no «congela» un campo); 0 o ausente: ahora
  v_ts := interno.sello_valido(v_datos -> 'actualizado_en', v_ahora);
  if v_ts = 0 then v_ts := v_ahora; end if;
  if v_alm = 'materiales' then
    v_cols  := array['nombre','familia','unidad_compra','unidad_consumo','medida','factor','factor_origen','largo_cm','ancho_cm','espesor','merma_pct','fraccionable',
                     'min_compra','min_stock','proveedor','tel_proveedor','activo'];
    v_fijos := array['id'];
  else
    v_cols  := array['cantidad_consumo','unidad_consumo','cantidad_compra','unidad_compra','partidas','formula','confianza','requiere','constantes_version',
                     'cantidad_ajustada','motivo_ajuste','ajustado_por','ajustado_ms','estado'];
    v_fijos := array['id','proyecto_id','material_id'];
  end if;
  -- se vuelve a mirar ya con el candado (otro teléfono pudo crearla entre la validación y aquí)
  if v_alm = 'materiales' then
    select m.sellos into v_sellos from public.materiales m where m.empresa_id = c.empresa_id and m.id = v_reg;
  else
    select q.sellos, q.estado into v_sellos, v_estado_actual from public.requerimientos q where q.empresa_id = c.empresa_id and q.id = v_reg;
  end if;
  v_existe := found;
  v_sellos := coalesce(v_sellos, '{}'::jsonb);
  v_nuevos := v_sellos;
  -- qué se escribe: en un ALTA, todo lo que vino; en un CAMBIO, lo que `campos` dice —o todo, si es de una versión de la app que no lo decía—
  v_lista := case when v_existe and pg_catalog.jsonb_typeof(v_campos) = 'array' then array(select pg_catalog.jsonb_array_elements_text(v_campos))
                  else array(select pg_catalog.jsonb_object_keys(v_datos)) end;
  foreach f in array v_lista loop
    if not (v_datos ? f) then continue; end if;
    if f = 'sync' or f like '\_%' or f = 'creado_en' or f = 'actualizado_en' then continue; end if;       -- plomería del cliente; `creado_en` no mueve created_at
    if f = any (v_fijos) then continue; end if;                                                              -- lo que identifica la fila no se cambia
    if v_alm = 'requerimientos' and f = 'folio_hoja' then continue; end if;                                  -- sale de proyectos.folio_hoja por el FK: no se guarda
    if f in ('costo_compra', 'costo_total') and c.area <> 'direccion' then continue; end if;                 -- los importes, solo de quien los escribe; en silencio
    v_tiene := case when v_alm = 'materiales' and f = 'costo_compra'
                    then (select k.sello from public.almacen_costos k where k.empresa_id = c.empresa_id and k.material_id = v_reg)
                    else (v_sellos ->> f)::bigint end;
    select * into r from interno.compuerta(v_tiene, pg_catalog.jsonb_build_object(f, v_ts), f, v_ahora, false, true);
    if r.accion = 'viejo' then v_viejos := v_viejos || pg_catalog.to_jsonb(f); continue; end if;             -- ya tenía un cambio más reciente: se dice y no se gasta
    if v_alm = 'requerimientos' and f = 'estado' and v_existe
       and ((v_estado_actual = 'consumido' and v_datos ->> 'estado' <> 'consumido')
         or (v_estado_actual = 'comprado'  and v_datos ->> 'estado' not in ('comprado', 'consumido'))) then
      v_viejos := v_viejos || pg_catalog.to_jsonb(f); continue;                                              -- «consumido» no vuelve atrás; «comprado» solo avanza a «consumido»
    end if;
    if v_alm = 'materiales' and f = 'costo_compra' then
      v_costo_hay := true; v_costo := interno.num(v_datos -> f); v_costo_sello := r.sello_nuevo;             -- no es columna de materiales: va a almacen_costos
    elsif f = any (v_cols) then v_set := v_set || pg_catalog.jsonb_build_object(f, v_datos -> f);
    else v_otros := v_otros || pg_catalog.jsonb_build_object(f, v_datos -> f);                              -- sin columna propia: «Otros (JSON)», no se pierde
    end if;
    v_escritos := v_escritos || f;
    if not (v_alm = 'materiales' and f = 'costo_compra') then v_nuevos := v_nuevos || pg_catalog.jsonb_build_object(f, r.sello_nuevo); end if;
  end loop;

  if v_existe and pg_catalog.cardinality(v_escritos) = 0 then
    return pg_catalog.jsonb_build_object('id', v_id, 'ok', true, 'sin_cambio', true, 'viejos', v_viejos);        -- NO gasta nada
  end if;

  v_solo_costo := v_costo_hay and pg_catalog.cardinality(v_escritos) = 1;        -- solo se escribió el costo: la ficha no cambia
  if not v_existe then
    v_ins := v_set || pg_catalog.jsonb_build_object('empresa_id', c.empresa_id, 'id', v_reg, 'sellos', v_nuevos || pg_catalog.jsonb_build_object('_editado', v_ts),
                                                    'procedencia', pg_catalog.jsonb_build_object('otros', v_otros));
    if v_alm = 'requerimientos' then
      v_ins := v_ins || pg_catalog.jsonb_build_object('proyecto_id', v_datos ->> 'proyecto_id', 'material_id', v_datos ->> 'material_id'); end if;
    select pg_catalog.string_agg(pg_catalog.format('%I', k), ', ') into v_cols_txt from pg_catalog.jsonb_object_keys(v_ins) k;
    execute pg_catalog.format('insert into public.%I (%s) select %s from pg_catalog.jsonb_populate_record(null::public.%I, $1)', v_alm, v_cols_txt, v_cols_txt, v_alm) using v_ins;
  elsif not v_solo_costo then
    -- hay columnas o `otros` que escribir (no solo el costo): UPDATE solo de los campos que pasaron
    select pg_catalog.string_agg(pg_catalog.format('%I', k), ', ') into v_cols_txt from pg_catalog.jsonb_object_keys(v_set) k;
    v_sets := '{}';
    if v_cols_txt is not null then
      v_sets := v_sets || pg_catalog.format('(%s) = (select %s from pg_catalog.jsonb_populate_record(null::public.%I, $1))', v_cols_txt, v_cols_txt, v_alm);
    end if;
    v_sets := v_sets || 'sellos = $2'::text;
    if v_otros <> '{}'::jsonb then
      v_sets := v_sets || 'procedencia = pg_catalog.jsonb_set(procedencia, ''{otros}'', coalesce(procedencia -> ''otros'', ''{}''::jsonb) || $5)'::text;
    end if;
    execute pg_catalog.format('update public.%I set %s where empresa_id = $3 and id = $4', v_alm, pg_catalog.array_to_string(v_sets, ', '))
      using v_set, v_nuevos || pg_catalog.jsonb_build_object('_editado', v_ts), c.empresa_id, v_reg, v_otros;
  end if;
  -- el costo del material (Dirección): su sello vive en almacen_costos; NULL = «borrado»
  if v_costo_hay then
    insert into public.almacen_costos (empresa_id, material_id, importe, sello) values (c.empresa_id, v_reg, v_costo, v_costo_sello)
    on conflict (empresa_id, material_id) where material_id is not null
    do update set importe = excluded.importe, sello = excluded.sello where public.almacen_costos.sello <= excluded.sello;
  end if;
  return pg_catalog.jsonb_build_object('id', v_id, 'ok', true, 'creada', not v_existe, 'viejos', v_viejos);
end $$;
revoke all on function interno.almacen_una(interno.contexto_t, jsonb) from public, anon, authenticated, service_role;

-- El lote: hasta 25 operaciones EN ORDEN, cada una en su subtransacción (una que truena no se lleva a las demás), o TODAS o ninguna con
-- `p_atomico` («la compra recibida entra completa o no entra»: diez renglones).
--   · un dato inválido o fuera de límites (SQLSTATE clase 22 o 23) es DATO_INVALIDO: definitivo, la bandeja lo aparta y no insiste;
--   · cualquier otro fallo es DESCONOCIDO: reintentable (un candado, una caída), nunca descartado por error.
create or replace function public.almacen_aplicar(p_ops jsonb, p_atomico boolean default false, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; op jsonb; v_res jsonb := '[]'::jsonb; v_r jsonb; v_fallo jsonb; v_estado text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_ops) is distinct from 'array' then
    return interno.err('DATO_INVALIDO', 'Las operaciones del almacén deben ir en un arreglo.'); end if;
  if pg_catalog.jsonb_array_length(p_ops) > 25 then return interno.err('DATO_INVALIDO', 'Hasta 25 operaciones por lote.'); end if;
  begin
    for op in select e.value from pg_catalog.jsonb_array_elements(p_ops) e loop
      begin
        v_r := interno.almacen_una(pre.c, op);
      exception when others then
        get stacked diagnostics v_estado = returned_sqlstate;
        v_r := interno.almacen_error(case when pg_catalog.jsonb_typeof(op) = 'object' then op ->> 'id' end,
                 case when pg_catalog.left(v_estado, 2) in ('22', '23') then 'DATO_INVALIDO' else 'DESCONOCIDO' end,
                 case when pg_catalog.left(v_estado, 2) in ('22', '23') then 'La base no aceptó ese cambio: un dato no tiene el formato o los límites esperados.'
                      else 'No se pudo aplicar la operación; se reintenta.' end);
      end;
      v_res := v_res || pg_catalog.jsonb_build_array(v_r);
      if p_atomico and (v_r ->> 'ok')::boolean is not true then
        v_fallo := v_r;
        raise exception 'lote rechazado' using errcode = 'AL001';          -- deshace TODO lo que este bloque externo escribió
      end if;
    end loop;
  exception when sqlstate 'AL001' then
    return pg_catalog.jsonb_build_object('ok', false, 'codigo', 'LOTE_RECHAZADO', 'op_fallida', v_fallo ->> 'id', 'mensaje', v_fallo ->> 'mensaje',
                                         'definitivo', coalesce(v_fallo ->> 'codigo', '') in ('DATO_INVALIDO', 'ROL_SIN_PERMISO'));
  end;
  return pg_catalog.jsonb_build_object('ok', true, 'resultados', v_res);
end $$;
revoke all on function public.almacen_aplicar(jsonb, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.almacen_aplicar(jsonb, boolean, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 7. constante_guardar
-- -----------------------------------------------------------------------------------------------------
-- `guardarConstante` del cliente: hoy quedaba `sin_destino` para siempre. Dirección y Fabricación. La clave: letras, números y «_» (≤ 64) y
-- distinta de `_semilla`; el valor, un número finito. Es un upsert: el último en llegar gana (no es un dato sellado).
create or replace function public.constante_guardar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_clave text; v_valor numeric; v_antes numeric; v_quien text; v_fila public.constantes;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La constante está mal formada.'); end if;
  v_clave := p_op ->> 'clave';
  v_valor := interno.num(p_op -> 'valor');
  if v_clave is null or v_clave !~ '^[A-Za-z0-9_]{1,64}$' or v_clave = '_semilla' then
    return interno.err('DATO_INVALIDO', 'La clave de la constante solo lleva letras, números y guion bajo (hasta 64) y no puede ser «_semilla».'); end if;
  if v_valor is null then return interno.err('DATO_INVALIDO', 'El valor de la constante debe ser un número.'); end if;
  v_quien := coalesce(interno.correo_verificado(), '') || ' · ' || (pre.c).area;
  select k.valor into v_antes from public.constantes k where k.empresa_id = (pre.c).empresa_id and k.clave = v_clave;
  insert into public.constantes as k (empresa_id, clave, valor, unidad, nota, version, actualizado_por)
  values ((pre.c).empresa_id, v_clave, v_valor, coalesce(p_op ->> 'unidad', ''), coalesce(p_op ->> 'nota', ''), coalesce(p_op ->> 'version', ''), v_quien)
  on conflict (empresa_id, clave) do update
    set valor = excluded.valor, unidad = excluded.unidad, nota = excluded.nota, version = excluded.version, actualizado_por = excluded.actualizado_por
  returning k.* into v_fila;
  perform interno.anotar(pre.c, 'general', 'guardo', 'constante', v_clave, 'Constante ' || v_clave || ' guardada', '',
                         case when v_antes is null then null else pg_catalog.jsonb_build_object('valor', v_antes) end, pg_catalog.jsonb_build_object('valor', v_valor));
  return pg_catalog.jsonb_build_object('ok', true, 'constante', pg_catalog.jsonb_build_object('clave', v_fila.clave, 'valor', v_fila.valor, 'unidad', v_fila.unidad,
                                       'nota', v_fila.nota, 'version', v_fila.version, 'actualizado_por', v_fila.actualizado_por));
end $$;
revoke all on function public.constante_guardar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.constante_guardar(jsonb, text) to authenticated;
